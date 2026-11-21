import { lstat, mkdir, mkdtemp, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readBuildHtmlIndex } from './build-html-index.mjs';

export async function statIfPresent(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
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
export async function exportReferencedMedia({ rootDir, distDir, htmlIndex, folder, tag, manifest, pattern, getName, read }) {
  const index = htmlIndex ?? await readBuildHtmlIndex(distDir);
  const names = new Set();
  for (const { src, file } of index[tag]) names.add(getName(src, file));
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
