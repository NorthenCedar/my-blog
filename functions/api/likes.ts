import { validateLikeSlug, parseSlugList, hashIp } from './_lib/reactions-core';

interface Env {
  COMMENTS_DB: D1Database;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

/**
 * 说说点赞（2026-09-26 站主："点赞不记名只记个数"）。
 *
 * GET  /api/likes?slugs=talk-a,talk-b  → { likes: { "talk-a": 3, "talk-b": 0 } }
 *      （批量：说说页一次把当前页所有说说的赞数取回来，省得 N 个请求）
 * POST /api/likes  { slug, liked?: boolean } → { slug, count, counted }
 *      · counted=true  这票算数（首次）
 *      · counted=false 同一个 IP 已经赞过 ⇒ 计数不变（前端据此把按钮置为已赞）
 *      · liked=false 取消点赞？**不做** —— 站主只要"记个数"，取消会让计数变成可无限刷的，
 *        所以这里只增不减；重复点击幂等返回当前数。
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const slugs = parseSlugList(url.searchParams.get('slugs'));
  const likes: Record<string, number> = {};
  for (const s of slugs) likes[s] = 0;
  if (slugs.length === 0) return json({ likes });

  const marks = slugs.map(() => '?').join(',');
  const { results } = await env.COMMENTS_DB.prepare(
    `SELECT slug, count FROM likes WHERE slug IN (${marks})`
  )
    .bind(...slugs)
    .all<{ slug: string; count: number }>();
  for (const r of results ?? []) likes[r.slug] = r.count;
  return json({ likes });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: '请求格式不对' }, 400);
  }
  const raw = (payload as { slug?: unknown } | null)?.slug;
  const check = validateLikeSlug(raw);
  if (!check.ok) return json({ error: check.error }, 400);
  const slug = check.slug;

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await hashIp(ip);

  // 同 IP 同一条只说一次：先尝试记票，冲突说明已经赞过（幂等）
  const ins = await env.COMMENTS_DB.prepare(
    'INSERT OR IGNORE INTO like_votes (slug, ip_hash) VALUES (?, ?)'
  )
    .bind(slug, ipHash)
    .run();
  const counted = (ins.meta?.changes ?? 0) > 0;

  if (counted) {
    await env.COMMENTS_DB.prepare(
      'INSERT INTO likes (slug, count) VALUES (?, 1) ON CONFLICT(slug) DO UPDATE SET count = count + 1'
    )
      .bind(slug)
      .run();
  }

  const row = await env.COMMENTS_DB.prepare('SELECT count FROM likes WHERE slug = ?')
    .bind(slug)
    .first<{ count: number }>();

  return json({ slug, count: row?.count ?? 0, counted }, counted ? 201 : 200);
};
