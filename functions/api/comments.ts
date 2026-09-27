import {
  validateComment,
  honeypotTripped,
  rateLimited,
  toRecord,
  RATE_WINDOW_MS,
  type CommentRecord,
} from './_lib/comments-core';

interface Env {
  COMMENTS_DB: D1Database;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

/** 只存 IP 的哈希，不存原始 IP —— 频率限制够用，隐私代价最小。 */
async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  // 2026-09-27 站主："把新评论放上面，其他的评论留言也一样" ⇒ 新的在前。
  // 这里是**唯一**决定顺序的地方（留言板 / 文章评论 / 说说评论三条路径共用这个接口）。
  // `id DESC` 是稳定的决胜键：同一秒内的两条也有确定顺序。
  // 顺带一提：LIMIT 200 现在取的是**最新**的 200 条（原来是取最旧的 200 条）。
  const { results } = await env.COMMENTS_DB.prepare(
    'SELECT id, name, body, created_at FROM comments WHERE slug = ? ORDER BY created_at DESC, id DESC LIMIT 200'
  )
    .bind(slug)
    .all<{ id: number; name: string; body: string; created_at: string }>();

  return json({ comments: (results ?? []).map(toRecord) satisfies CommentRecord[] });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: '请求格式不对' }, 400);
  }

  const check = validateComment(payload);
  if (!check.ok) return json({ error: check.error }, 400);

  // 蜜罐命中：**假装成功**但不落库 —— 让机器人以为得手，不来重试。
  if (honeypotTripped(payload)) {
    return json({ comment: { id: 0, ...check.value, createdAt: new Date().toISOString() } }, 201);
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await hashIp(ip);
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

  const { results: recent } = await env.COMMENTS_DB.prepare(
    'SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?'
  )
    .bind(ipHash, since)
    .all<{ n: number }>();

  if (rateLimited(recent?.[0]?.n ?? 0)) {
    return json({ error: '发表太频繁，请等一分钟再试' }, 429);
  }

  const createdAt = new Date().toISOString();
  const inserted = await env.COMMENTS_DB.prepare(
    'INSERT INTO comments (slug, name, body, created_at, ip_hash) VALUES (?, ?, ?, ?, ?) RETURNING id'
  )
    .bind(check.value.slug, check.value.name, check.value.body, createdAt, ipHash)
    .first<{ id: number }>();

  return json({ comment: { id: inserted?.id ?? 0, ...check.value, createdAt } }, 201);
};
