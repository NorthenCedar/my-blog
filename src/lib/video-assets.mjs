import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const VIDEO_NAME = /^[a-f0-9]{64}\.(?:mp4|webm)$/;
const MANIFEST = '.exported-videos.json';

/** 本地地址只能指向摘要命名的原件；不解码路径，避免把转义字符变成目录。 */
function videoName(src, context = '视频') {
  if (typeof src !== 'string' || !src.startsWith('/videos/') || !VIDEO_NAME.test(src.slice(8))) {
    throw new Error(`${context}：视频地址必须是 /videos/<64 位小写 SHA-256>.mp4 或 .webm`);
  }
  return src.slice(8);
}

/** pages 集合没有 schema，在页面拼装前检查说说的视频字段并保留条目定位。 */
export function validateTalkVideos(videos, context = '说说') {
  if (videos === undefined) return [];
  if (!Array.isArray(videos)) throw new Error(`${context}：videos 必须是视频数组`);
  return videos.map((video, index) => {
    const position = `${context} 第 ${index + 1} 个视频`;
    videoName(video?.src, position);
    if (typeof video?.alt !== 'string' || !video.alt.trim()) {
      throw new Error(`${position}：alt 视频说明不能为空`);
    }
    return { src: video.src, alt: video.alt.trim() };
  });
}

async function statIfPresent(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/** 返回已校验的原件字节；导出和开发预览共用同一条内容校验边界。 */
async function readVideo(sourceDir, name) {
  const path = join(sourceDir, name);
  const info = await statIfPresent(path);
  if (!info) throw new Error(`找不到视频原件：${path}`);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`视频原件必须是普通文件：${path}`);
  if (info.size > MAX_VIDEO_BYTES) throw new Error(`视频超过 25 MiB：${path}`);
  const bytes = await readFile(path);
  if (bytes.length > MAX_VIDEO_BYTES) throw new Error(`视频超过 25 MiB：${path}`);
  const mp4 = name.endsWith('.mp4');
  const formatValid = mp4
    ? bytes.length >= 12 && bytes.subarray(4, 8).equals(Buffer.from('ftyp'))
    : bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      && bytes.subarray(0, 4096).includes(Buffer.from('webm'));
  if (!formatValid) throw new Error(`视频格式与扩展名不符：${path}`);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== name.slice(0, 64)) throw new Error(`视频 SHA-256 摘要与文件名不符：${path}`);
  return { name, bytes, contentType: mp4 ? 'video/mp4' : 'video/webm' };
}

function decodeAttribute(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', sol: '/' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|sol);/gi, (entity, code) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()];
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
}

/** 只读真实标签，跳过注释与原始文本元素，避免把文章代码示例当成发布引用。 */
function collectHtmlVideos(html, context, names) {
  const tags = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-z][a-z\d:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  let videoDepth = 0;
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
      if (tag === 'video') videoDepth = Math.max(0, videoDepth - 1);
      continue;
    }
    if (tag === 'video') videoDepth++;
    if (tag !== 'video' && !(tag === 'source' && videoDepth > 0)) continue;
    const attributes = match[0].slice(tag.length + 1, -1);
    const attribute = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (let item; (item = attribute.exec(attributes));) {
      if (item[1].toLowerCase() !== 'src') continue;
      const src = decodeAttribute(item[2] ?? item[3] ?? item[4] ?? '');
      if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) names.add(videoName(src, context));
      // HTML 重复属性采用第一个值，与浏览器保持一致。
      break;
    }
  }
}

async function collectPages(directory, names) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectPages(path, names);
    else if (entry.isFile() && entry.name.endsWith('.html')) collectHtmlVideos(await readFile(path, 'utf8'), path, names);
  }
}

async function readManifest(outputDir) {
  const path = join(outputDir, MANIFEST);
  const info = await statIfPresent(path);
  if (!info) return [];
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`视频导出清单必须是普通文件：${path}`);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.every((name) => typeof name === 'string' && VIDEO_NAME.test(name))) {
    throw new Error(`视频导出清单无效：${path}`);
  }
  return manifest.files;
}

/** 以最终 HTML 为发布清单：草稿和未引用原件不会被复制到公开目录。 */
export async function exportVideoAssets({ rootDir = process.cwd(), distDir = join(rootDir, 'dist') } = {}) {
  const names = new Set();
  await collectPages(distDir, names);
  const sourceDir = join(rootDir, 'content/videos');
  const outputDir = join(distDir, 'videos');
  const directory = await statIfPresent(outputDir);
  if (directory && (!directory.isDirectory() || directory.isSymbolicLink())) throw new Error(`视频输出目录必须是普通目录：${outputDir}`);
  const previous = await readManifest(outputDir);
  const files = [...names].sort();
  const videos = [];
  // 所有原件和输出目标都通过检查后才允许写出，缺失或损坏不会留下半次导出。
  for (const name of files) videos.push(await readVideo(sourceDir, name));
  for (const name of new Set([...files, ...previous])) {
    const path = join(outputDir, name);
    const info = await statIfPresent(path);
    if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error(`视频输出目标必须是普通文件：${path}`);
  }
  await mkdir(outputDir, { recursive: true });
  for (const video of videos) await writeFile(join(outputDir, video.name), video.bytes);
  for (const name of previous) {
    if (!names.has(name) && await statIfPresent(join(outputDir, name))) await unlink(join(outputDir, name));
  }
  await writeFile(join(outputDir, MANIFEST), `${JSON.stringify({ version: 1, files })}\n`);
  return { exported: files.length };
}

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return undefined;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if ((first !== undefined && !Number.isSafeInteger(first)) || (last !== undefined && !Number.isSafeInteger(last))) return undefined;
  const start = first ?? Math.max(0, size - last);
  const end = first === undefined || last === undefined ? size - 1 : Math.min(last, size - 1);
  return start < size && start <= end && (first !== undefined || last > 0) ? { start, end } : undefined;
}

/** 只在 astro dev 安装；生产预览直接使用 dist 内按引用导出的静态原件。 */
export function createVideoDevPlugin({ rootDir } = {}) {
  return {
    name: 'owner-video-assets',
    apply: 'serve',
    configureServer(server) {
      const sourceDir = join(resolve(rootDir ?? server.config.root), 'content/videos');
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path !== '/videos' && !path.startsWith('/videos/')) return next();
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' });
          return res.end();
        }
        let name;
        try {
          name = videoName(path);
        } catch {
          res.writeHead(400);
          return res.end('视频地址无效');
        }
        let video;
        try {
          video = await readVideo(sourceDir, name);
        } catch (error) {
          res.writeHead(error.message.startsWith('找不到') ? 404 : 500);
          return res.end('视频原件缺失或未通过校验');
        }
        const size = video.bytes.length;
        res.setHeader('Content-Type', video.contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const range = req.headers.range === undefined ? undefined : byteRange(req.headers.range, size);
        if (req.headers.range !== undefined && !range) {
          res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Content-Length': 0 });
          return res.end();
        }
        const { start, end } = range ?? { start: 0, end: size - 1 };
        res.setHeader('Content-Length', end - start + 1);
        if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.statusCode = range ? 206 : 200;
        res.end(req.method === 'HEAD' ? undefined : video.bytes.subarray(start, end + 1));
      });
    },
  };
}
