/**
 * 访客语音的**上传**入口（2026-11-10）。读取/播放走 `functions/api/audio/[id].ts`。
 *
 * 流程是两步：先 POST 这里拿到 id，再把 id 放进评论的 `audio` 字段一起提交。
 * ★ 为什么不和评论一个请求发：评论是 16 KB 的 JSON，音频是 1.5 MB 的二进制，
 *   硬塞成 base64 要多占 33%，而 413 的时候读者已经打完字了 —— 分开才能
 *   「传失败了也不丢正文」。绑定动作在 comments.ts 里做（见 _lib/comment-audio.ts）。
 */

import { AccountError, fail } from './_lib/visitor-core';
import { writeLimitStatements } from './_lib/public-write';
import { AUDIO_MAX, sniffAudio } from './_lib/comment-audio';
import { hashIp } from './_lib/reactions-core';
import type { VisitorEnv } from './_lib/visitor-store';

/** 一天之内一个人最多传这么多条：防的是把 D1 当网盘用，不是防正常人。 */
const DAILY_MAX = 20;
const MINUTE_MAX = 4;

export const onRequestPost: PagesFunction<VisitorEnv> = async ({ request, env }) => {
  try {
    return await upload(request, env);
  } catch (error) {
    // fail() 抛 AccountError：对外必须变成「状态码 + 一句人话」，不能漏成 500。
    if (error instanceof AccountError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
};

async function upload(request: Request, env: VisitorEnv): Promise<Response> {
  // 与 guardPublicWrite 同一套来源判定，只是这里不收 JSON（正文就是音频本身）。
  const origin = request.headers.get('Origin');
  if ((origin !== null && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return fail(403, '请从本站页面操作');
  }
  const type = (request.headers.get('Content-Type') ?? '').split(';', 1)[0].trim().toLowerCase();
  if (type !== 'audio/mpeg' && type !== 'audio/wav') return fail(415, '只收 mp3 和 wav');

  // 先看 Content-Length 再读：1.5 MB 的请求不该先全读进内存再拒绝。
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, '缺少音频长度');
  if (declared > AUDIO_MAX) return fail(413, `音频太大了（上限 ${Math.round(AUDIO_MAX / 1000) / 1000} MB，约 100 秒 mp3）`);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > AUDIO_MAX) return fail(413, '音频太大了');
  // 扩展名/Content-Type 是客户端说的，文件头才是它自己 —— 伪装成 mp3 的 HTML 到这里为止。
  if (sniffAudio(type, bytes) === null) return fail(400, '文件内容不像是 mp3 或 wav');

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await hashIp(ip);
  const now = Date.now();

  const limits = await env.COMMENTS_DB.batch(writeLimitStatements(env, 'audio:ip', ipHash, MINUTE_MAX, now));
  if (!limits[1].results?.length) return fail(429, '传得太频繁了，歇一分钟再来');

  const daily = await env.COMMENTS_DB.prepare(
    'SELECT COUNT(*) AS n FROM audio_clips WHERE ip_hash = ? AND created_at > ?'
  )
    .bind(ipHash, now - 24 * 60 * 60 * 1000)
    .first<{ n: number }>();
  if ((daily?.n ?? 0) >= DAILY_MAX) return fail(429, '今天传的语音有点多了，明天再来');

  const id = crypto.randomUUID();
  await env.COMMENTS_DB.prepare(
    'INSERT INTO audio_clips (id, ip_hash, mime, bytes, size, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(id, ipHash, type, bytes, bytes.byteLength, now)
    .run();

  return Response.json({ id, bytes: bytes.byteLength }, { headers: { 'Cache-Control': 'no-store' } });
}