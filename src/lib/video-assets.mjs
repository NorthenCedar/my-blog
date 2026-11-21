import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { byteRange, exportReferencedMedia, statIfPresent } from './media-export.mjs';
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

export function exportVideoAssets({ rootDir = process.cwd(), distDir = join(rootDir, 'dist'), htmlIndex } = {}) {
  return exportReferencedMedia({
    rootDir, distDir, htmlIndex, folder: 'videos', tag: 'video', manifest: MANIFEST,
    pattern: VIDEO_NAME, getName: videoName, read: readVideo,
  });
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
        // 首帧封面由 Vite 直接从 public/videos 提供。
        if (/^\/videos\/[a-f0-9]{64}\.poster\.jpg$/.test(path)) return next();
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
