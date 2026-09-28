import {
  validateComment,
  honeypotTripped,
  rateLimited,
  toRecord,
  toReplyRecord,
  RATE_WINDOW_MS,
  type CommentRecord,
  type ReplyRecord,
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

  const comments = (results ?? []).map(toRecord) satisfies CommentRecord[];
  const ids = comments.map((c) => c.id);

  // 回复（2026-09-28 站主要求）：**旧的在上** —— 一段对话要顺着读（站主拍板，与顶层相反）。
  // 只取属于这批顶层评论的回复（`slug` + `parent_id IN` 两道条件）：
  //   · slug 挡住跨页面的 id 撞车；
  //   · parent_id IN 保证不把别的页面的回复带出来。
  // 孤儿回复（父不在这 200 条里）在前端 groupRepliesByParent 处丢弃。
  let replies: ReplyRecord[] = [];
  if (ids.length > 0) {
    const marks = ids.map(() => '?').join(',');
    const { results: rrows } = await env.COMMENTS_DB.prepare(
      `SELECT id, parent_id, reply_to, name, body, created_at
         FROM replies
        WHERE slug = ? AND parent_id IN (${marks})
        ORDER BY created_at ASC, id ASC`
    )
      .bind(slug, ...ids)
      .all<{
        id: number;
        parent_id: number;
        reply_to: string;
        name: string;
        body: string;
        created_at: string;
      }>();
    replies = (rrows ?? []).map(toReplyRecord);
  }

  return json({ comments, replies });
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

  // 回复：先确认父评论**存在且属于同一个 slug**，否则可以往任意 id / 别的页面塞回复。
  // 这个校验刻意排在**限流之前**：它属于"输入不合法"，应该直接回 400 说清楚，
  // 而不是让人等一分钟再告诉他"你要回复的那条留言不存在"（400 也不消耗限流额度）。
  const { slug, name, body, parentId, replyTo } = check.value;

  if (parentId > 0) {
    const parent = await env.COMMENTS_DB.prepare(
      'SELECT id FROM comments WHERE id = ? AND slug = ? LIMIT 1'
    )
      .bind(parentId, slug)
      .first<{ id: number }>();

    if (!parent) {
      return json({ error: '要回复的留言不存在（可能已被删除）' }, 400);
    }
  }

  // 频率限制要**两表合计**：只有顶层评论计数的话，机器人可以靠"只发回复"绕过限流。
  const { results: recent } = await env.COMMENTS_DB.prepare(
    `SELECT (SELECT COUNT(*) FROM comments WHERE ip_hash = ? AND created_at > ?)
          + (SELECT COUNT(*) FROM replies  WHERE ip_hash = ? AND created_at > ?) AS n`
  )
    .bind(ipHash, since, ipHash, since)
    .all<{ n: number }>();

  if (rateLimited(recent?.[0]?.n ?? 0)) {
    return json({ error: '发表太频繁，请等一分钟再试' }, 429);
  }

  const createdAt = new Date().toISOString();

  // ---- 顶层评论（parentId = 0）----
  if (parentId === 0) {
    const inserted = await env.COMMENTS_DB.prepare(
      'INSERT INTO comments (slug, name, body, created_at, ip_hash) VALUES (?, ?, ?, ?, ?) RETURNING id'
    )
      .bind(slug, name, body, createdAt, ipHash)
      .first<{ id: number }>();

    return json({ comment: { id: inserted?.id ?? 0, slug, name, body, createdAt, parentId: 0, replyTo: '' } }, 201);
  }

  // ---- 回复（parentId > 0）----（父评论已在限流前校验过）
  const inserted = await env.COMMENTS_DB.prepare(
    'INSERT INTO replies (slug, parent_id, reply_to, name, body, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
  )
    .bind(slug, parentId, replyTo, name, body, createdAt, ipHash)
    .first<{ id: number }>();

  return json(
    { comment: { id: inserted?.id ?? 0, slug, name, body, createdAt, parentId, replyTo } },
    201
  );
};
