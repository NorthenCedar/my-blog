import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);

function* htmlTags(html) {
  // 一次消费完整标签，跳过注释、声明和原始文本，属性里的标签示例也不会被当成实际元素。
  const tags = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<(\/?)([a-z][a-z\d:-]*)(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  for (let match; (match = tags.exec(html));) {
    if (!match[2]) continue;
    const name = match[2].toLowerCase();
    const closing = match[1] === '/';
    if (!closing && RAW_TEXT.has(name)) {
      const end = new RegExp(`</${name}\\s*>`, 'gi');
      end.lastIndex = tags.lastIndex;
      const close = end.exec(html);
      if (!close) break;
      if (name === 'script') {
        yield { name, closing, raw: match[0], text: html.slice(tags.lastIndex, close.index) };
      }
      tags.lastIndex = end.lastIndex;
      continue;
    }
    yield { name, closing, raw: match[0] };
  }
}

function attributes(tag, name) {
  const found = new Map();
  const pairs = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const [, rawName, double, single, unquoted] of tag.slice(name.length + 1, -1).matchAll(pairs)) {
    const key = rawName.toLowerCase();
    if (!found.has(key)) found.set(key, double ?? single ?? unquoted ?? '');
  }
  return found;
}

function localMediaSource(value) {
  if (value === undefined) return;
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', sol: '/' };
  const src = value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|sol);/gi, (entity, code) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()];
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
  if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) return src;
}

function collectPage(html, file, index) {
  const depth = { audio: 0, video: 0 };
  for (const { name, closing, raw, text } of htmlTags(html)) {
    if (name === 'audio' || name === 'video') {
      depth[name] = closing ? Math.max(0, depth[name] - 1) : depth[name] + 1;
      if (closing) continue;
      const src = localMediaSource(attributes(raw, name).get('src'));
      if (src !== undefined) index[name].push({ src, file });
    } else if (!closing && name === 'source' && (depth.audio || depth.video)) {
      const src = localMediaSource(attributes(raw, name).get('src'));
      if (src === undefined) continue;
      if (depth.audio) index.audio.push({ src, file });
      if (depth.video) index.video.push({ src, file });
    } else if (name === 'script' && !closing) {
      const attrs = attributes(raw, name);
      index.scripts.push({ file, src: attrs.get('src'), type: attrs.get('type') ?? '', text });
    } else if (!closing && (name === 'section' || name === 'button')) {
      const attrs = attributes(raw, name);
      const normal = attrs.has('data-comments') ? attrs.get('data-slug') : undefined;
      const reply = attrs.get('data-comments-for');
      const like = attrs.get('data-like');
      if (normal !== undefined || reply !== undefined || like !== undefined) {
        index.comments.push({ file, normal, reply, like });
      }
    }
  }
}

async function collectDirectory(directory, index) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await collectDirectory(file, index);
    else if (entry.isFile() && entry.name.endsWith('.html')) collectPage(await readFile(file, 'utf8'), file, index);
  }
}

/** 一次遍历和解析最终 HTML；具体校验由各产物的生成器负责。 */
export async function readBuildHtmlIndex(distDir) {
  const index = { audio: [], video: [], comments: [], scripts: [] };
  await collectDirectory(distDir, index);
  return index;
}
