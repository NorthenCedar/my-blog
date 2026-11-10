/**
 * 读一条访客语音（2026-11-10）。`/api/audio/<uuid>`。
 *
 * ★ 为什么必须支持 Range：音频播放要能拖时间轴；不支持 Range 时浏览器会把整段
 *   重下、并且进度条拖不动（<audio> 依赖 206 才能 seek）。
 * ★ 为什么 `immutable`：id 是随机 UUID，内容永不变；换一条就是另一个 id。
 *   这样同一条语音第二次播放不再过 Function，直接吃边缘缓存。
 */

import type { VisitorEnv } from '../../_lib/visitor-store';

const MAX = 1_500_000;

export const onRequestGet: PagesFunction<VisitorEnv> = async ({ params, request, env }) => {
  const id = String(params.id ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('音频地址无效', { status: 400 });

  const row = await env.COMMENTS_DB.prepare('SELECT mime, bytes, size FROM audio_clips WHERE id = ? LIMIT 1')
    .bind(id)
    .first<{ mime: string; bytes: ArrayBuffer; size: number }>();
  if (!row) return new Response('这条语音不存在（可能已被删除）', { status: 404 });

  const body = new Uint8Array(row.bytes);
  const size = Math.min(body.byteLength, MAX);
  const headers = new Headers({
    'Content-Type': row.mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    // 访客录音：只当媒体文件用，绝不让它在站点源下执行。
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });

  const range = request.headers.get('Range');
  const match = range === null ? null : /^bytes=(\d*)-(\d*)$/.exec(range);
  if (match && (match[1] || match[2])) {
    const first = match[1] ? Number(match[1]) : undefined;
    const last = match[2] ? Number(match[2]) : undefined;
    const start = first ?? Math.max(0, size - (last ?? 0));
    const end = first === undefined || last === undefined ? size - 1 : Math.min(last, size - 1);
    if (!(start < size && start <= end)) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    headers.set('Content-Length', String(end - start + 1));
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    return new Response(request.method === 'HEAD' ? null : body.subarray(start, end + 1), { status: 206, headers });
  }

  headers.set('Content-Length', String(size));
  return new Response(request.method === 'HEAD' ? null : body.subarray(0, size), { status: 200, headers });
};

export const onRequestHead: PagesFunction<VisitorEnv> = (context) => onRequestGet(context);