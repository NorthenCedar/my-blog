/**
 * 音频原件（作者侧）—— 与 video-assets.mjs 同一套路子：
 *   · 原件放 `content/audio/<64 位小写 SHA-256>.<mp3|wav>`；
 *   · 页面里只写 `/audio/<hash>.<ext>`（内容寻址：改内容必改文件名，永不缓存错）；
 *   · 构建完成后**只**把被发布页面真正引用的那些复制到 `dist/audio/`，
 *     草稿与没人用的原件不会上线；
 *   · `astro dev` 下由中间件直接读原件（带 Range，音频要能拖时间轴）。
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { byteRange, exportReferencedMedia, statIfPresent } from './media-export.mjs';
import { join, resolve } from 'node:path';

const NAME = /^([a-f0-9]{64})\.(mp3|wav)$/;
const MANIFEST = '.exported-audio.json';
const MAX_BYTES = 24 * 1024 * 1024; // 24 MB：一集播客的量级，再大就该换个地方放了

const TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav' };

/**
 * 说说 frontmatter 里的 `audio:` 一栏。
 * 形状与 videos 对齐（数组，每项要有 src；说明可选），校验口径也一样：
 * 构建期就该失败，而不是等上线后发现一条「点不开的音频」。
 */
export function validateTalkAudio(audios, context = '说说') {
  if (audios === undefined) return [];
  if (!Array.isArray(audios)) throw new Error(`${context}：audio 必须是数组`);
  return audios.map((audio, index) => {
    if (!audio || typeof audio !== 'object') throw new Error(`${context}：audio[${index}] 必须是对象`);
    const name = audioName(audio.src, `${context} 的 audio[${index}]`);
    if (audio.label !== undefined && typeof audio.label !== 'string') throw new Error(`${context}：audio[${index}].label 必须是字符串`);
    return { src: `/audio/${name}`, label: typeof audio.label === 'string' ? audio.label.slice(0, 120) : '' };
  });
}

/** 页面里写的地址 → 文件名。地址不合法会抛（构建期就炸，别把坏链接带上线）。 */
export function audioName(src, context = '音频') {
  if (typeof src !== 'string') throw new Error(`${context}：音频地址必须是字符串`);
  const match = /^\/audio\/([a-f0-9]{64}\.(?:mp3|wav))$/.exec(src);
  if (!match) throw new Error(`${context}：音频地址必须是 /audio/<64 位小写 SHA-256>.<mp3|wav>，收到 ${src}`);
  return match[1];
}

/** 校验文件头：扩展名对不上内容的一律拒绝（伪装成 mp3 的 HTML 会被 nosniff 之外的层挡住）。 */
function sniff(kind, bytes) {
  if (kind === 'wav') {
    return bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WAVE';
  }
  if (bytes.length < 4) return false;
  if (bytes.toString('latin1', 0, 3) === 'ID3') return true;
  // MPEG-1/2 Layer III 帧同步：11 个 1
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

async function readAudio(sourceDir, name) {
  const match = NAME.exec(name);
  if (!match) throw new Error(`音频文件名不合法：${name}`);
  const path = join(sourceDir, name);
  const info = await statIfPresent(path);
  if (!info) throw new Error(`找不到音频原件：content/audio/${name}`);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`音频原件必须是普通文件：${path}`);
  if (info.size > MAX_BYTES) throw new Error(`音频原件超过 ${MAX_BYTES / 1024 / 1024} MB：${name}`);
  const bytes = await readFile(path);
  if (!sniff(match[2], bytes)) throw new Error(`音频内容与扩展名不符（${match[2]}）：content/audio/${name}`);
  if (bytes.length > MAX_BYTES) throw new Error(`音频原件超过 ${MAX_BYTES / 1024 / 1024} MB：${name}`);
  if (createHash('sha256').update(bytes).digest('hex') !== match[1]) {
    throw new Error(`音频 SHA-256 摘要与文件名不符：content/audio/${name}`);
  }
  return { name, contentType: TYPES[match[2]], bytes };
}

export function exportAudioAssets({ rootDir = process.cwd(), distDir = join(rootDir, 'dist') } = {}) {
  return exportReferencedMedia({
    rootDir, distDir, folder: 'audio', tag: 'audio', manifest: MANIFEST,
    pattern: NAME, getName: audioName, read: readAudio,
  });
}

/** 只在 astro dev 安装；生产预览直接使用 dist 内按引用导出的静态原件。 */
export function createAudioDevPlugin({ rootDir } = {}) {
  return {
    name: 'owner-audio-assets',
    apply: 'serve',
    configureServer(server) {
      const sourceDir = join(resolve(rootDir ?? server.config.root), 'content/audio');
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (path !== '/audio' && !path.startsWith('/audio/')) return next();
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' });
          return res.end();
        }
        let name;
        try {
          name = audioName(path, 'dev');
        } catch {
          res.writeHead(400);
          return res.end('音频地址无效');
        }
        let audio;
        try {
          audio = await readAudio(sourceDir, name);
        } catch (error) {
          res.writeHead(error.message.startsWith('找不到') ? 404 : 500);
          return res.end('音频原件缺失或未通过校验');
        }
        const size = audio.bytes.length;
        res.setHeader('Content-Type', audio.contentType);
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
        res.end(req.method === 'HEAD' ? undefined : audio.bytes.subarray(start, end + 1));
      });
    },
  };
}