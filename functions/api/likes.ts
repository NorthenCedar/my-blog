import { validateLikeSlug, parseSlugList, hashIp } from './_lib/reactions-core';
import { AccountError } from './_lib/visitor-core';
import { guardPublicWrite, readJsonBody, writeLimitStatements } from './_lib/public-write';
import targets from './_generated/comment-targets.json';

const publishedTalks = new Set(targets.talks);

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
  try {
  guardPublicWrite(request);
  const payload = await readJsonBody(request, 16 * 1024);
  const raw = (payload as { slug?: unknown } | null)?.slug;
  const check = validateLikeSlug(raw);
  if (!check.ok) return json({ error: check.error }, 400);
  const slug = check.slug;
  if (!publishedTalks.has(slug)) return json({ error: '说说不存在或尚未发布' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await hashIp(ip);

  // 配额、唯一票与计数在同一事务；changes() 只承接紧邻上一条语句的实际写入。
  // 已投票时不占额度，所以超过频率后重试仍保持幂等。
  const result = await env.COMMENTS_DB.batch([
    ...writeLimitStatements(env, 'likes:ip', ipHash, 30, Date.now(), 'SELECT 1 FROM like_votes WHERE slug = ? AND ip_hash = ?', [slug, ipHash]),
    env.COMMENTS_DB.prepare('INSERT OR IGNORE INTO like_votes (slug, ip_hash) SELECT ?, ? WHERE changes() = 1 RETURNING slug').bind(slug, ipHash),
    env.COMMENTS_DB.prepare('INSERT INTO likes (slug, count) SELECT ?, 1 WHERE changes() = 1 ON CONFLICT(slug) DO UPDATE SET count = count + 1').bind(slug),
  ]);
  const counted = Boolean(result[2].results?.length);
  if (!counted) {
    const vote = await env.COMMENTS_DB.prepare('SELECT 1 FROM like_votes WHERE slug = ? AND ip_hash = ?').bind(slug, ipHash).first();
    if (!vote) return json({ error: '点赞太频繁，请等一分钟再试' }, 429);
  }

  const row = await env.COMMENTS_DB.prepare('SELECT count FROM likes WHERE slug = ?')
    .bind(slug)
    .first<{ count: number }>();

  return json({ slug, count: row?.count ?? 0, counted }, counted ? 201 : 200);
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    throw error;
  }
};
