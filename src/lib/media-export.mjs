import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function statIfPresent(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function decodeAttribute(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', sol: '/' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|sol);/gi, (entity, code) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()];
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
}


/** 逐个读取 HTML 的标签，跳过注释与原始文本元素。 */
function* mediaTags(html, mediaTag) {
  const tags = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-z][a-z\d:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  let depth = 0;
  for (let match; (match = tags.exec(html));) {
    if (!match[1]) continue;
    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith('</');
    if (!closing && /^(?:script|style|textarea|title|xmp|iframe|noembed|noframes)$/.test(tag)) {
      const end = new RegExp(`</${tag}\\s*>`, 'gi');
      end.lastIndex = tags.lastIndex;
      if (!end.exec(html)) break;
      tags.lastIndex = end.lastIndex;
      continue;
    }
    if (closing) {
      if (tag === mediaTag) depth = Math.max(0, depth - 1);
      continue;
    }
    if (tag === mediaTag) depth++;
    if (tag !== mediaTag && !(tag === 'source' && depth)) continue;
    const attributes = match[0].slice(tag.length + 1, -1);
    const attribute = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (let item; (item = attribute.exec(attributes));) {
      if (item[1].toLowerCase() !== 'src') continue;
      yield decodeAttribute(item[2] ?? item[3] ?? item[4] ?? '');
      break;
    }
  }
}

async function collectPages(directory, names, mediaTag, getName) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectPages(path, names, mediaTag, getName);
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      for (const src of mediaTags(await readFile(path, 'utf8'), mediaTag)) {
        if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) names.add(getName(src, path));
      }
    }
  }
}

async function readManifest(path, pattern) {
  const info = await statIfPresent(path);
  if (!info) return [];
  if (!info.isFile()) throw new Error(`媒体导出清单必须是普通文件：${path}`);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.every(name => typeof name === 'string' && pattern.test(name))) {
    throw new Error(`媒体导出清单无效：${path}`);
  }
  return manifest.files;
}

/** 以 HTML 为清单。逐个校验并暂存，通过后才替换公开原件。 */
export async function exportReferencedMedia({ rootDir, distDir, folder, tag, manifest, pattern, getName, read }) {
  const names = new Set();
  await collectPages(distDir, names, tag, getName);
  const files = [...names].sort();
  const sourceDir = join(rootDir, 'content', folder);
  const outputDir = join(distDir, folder);
  const directory = await statIfPresent(outputDir);
  if (directory && !directory.isDirectory()) throw new Error(`媒体输出目录必须是普通目录：${outputDir}`);
  const manifestPath = join(outputDir, manifest);
  const previous = await readManifest(manifestPath, pattern);
  for (const name of new Set([...files, ...previous])) {
    const path = join(outputDir, name);
    const info = await statIfPresent(path);
    if (info && !info.isFile()) throw new Error(`媒体输出目标必须是普通文件：${path}`);
  }

  const staging = await mkdtemp(join(distDir, '.' + folder + '-export-'));
  const pending = [];
  try {
    for (const name of files) {
      const { bytes } = await read(sourceDir, name);
      const path = join(staging, name);
      pending.push(path);
      await writeFile(path, bytes);
    }
    const nextManifest = join(staging, manifest);
    pending.push(nextManifest);
    await writeFile(nextManifest, JSON.stringify({ version: 1, files }) + '\n');
    await mkdir(outputDir, { recursive: true });
    for (const name of files) await rename(join(staging, name), join(outputDir, name));
    for (const name of previous) {
      if (!names.has(name) && await statIfPresent(join(outputDir, name))) await unlink(join(outputDir, name));
    }
    await rename(nextManifest, manifestPath);
  } finally {
    for (const path of pending) {
      await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    await rmdir(staging);
  }
  return { exported: files.length };
}

export function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return undefined;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) return undefined;
  const start = first ?? Math.max(0, size - last);
  const end = first === undefined || last === undefined ? size - 1 : Math.min(last, size - 1);
  return start < size && start <= end && (first !== undefined || last > 0) ? { start, end } : undefined;
}
