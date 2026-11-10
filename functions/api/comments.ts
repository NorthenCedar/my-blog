import {
  validateComment,
  honeypotTripped,
  toRecord,
  toReplyRecord,
  parseCommentSlugList,
  RATE_MAX,
  type CommentRecord,
  type ReplyRecord,
} from './_lib/comments-core';
import { commentIdentity, attachCommentAuthors, saveAuthoredComment } from './_lib/visitor-comments';
import { parseNoticeTarget, recordCommentNotice, recordReplyNotice, validNoticeTarget, type NoticeTarget } from './_lib/notices';
import { AccountError } from './_lib/visitor-core';
import { currentAccount, publicUser } from './_lib/visitor-store';
import { guardPublicWrite, readJsonBody, writeLimitStatements } from './_lib/public-write';
import { attachAudioPaths, bindCommentAudio } from './_lib/comment-audio';
import targets from './_generated/comment-targets.json';

const publishedTargets = new Set(targets.comments);

interface Env {
  COMMENTS_DB: D1Database;
  OWNER_USER_ID?: string;
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

/**
 * GET /api/comments
 *   · ?slug=talk-20260926      → { comments, replies }   单条：把这条的完整评论树取回来（点开评论框时用它）
 *   · ?slugs=a,b,c             → { counts: { a: 2, b: 0 } }  批量：只取条数（说说页进页面就要显示多少个）
 *
 * 为什么要有第二种形态（2026-09-28 站主报的 bug）：评论数原本只有点开面板拉完整数据后才算得出来，
 * 结果"不点评论按钮就不显示数字"。最省事的修法是进页面就给每条说说各发一次单条请求，
 * 但那等于 N 个请求 —— 于是照 /api/likes?slugs= 的样子做成批量，**一个请求取齐一页**。
 *
 * 计数的**口径：含回复**（站主 2026-09-28 拍板）—— 屏幕上真实有几行就是几条，
 * 所以两表要一起数；UNION ALL 就是为了让"点了展开"前后的数字对得上。
 */
const countAll = async (raw: string | null, env: Env): Promise<Record<string, number>> => {
  const slugs = parseCommentSlugList(raw);
  const counts: Record<string, number> = {};
  for (const s of slugs) counts[s] = 0; // 查不到也要回 0：让前端能分清"查过了，是 0"和"压根没查"
  if (slugs.length === 0) return counts;

  // 两张表各绑定一次，同条最多 50 个 slug（100 个参数）。
  for (let start = 0; start < slugs.length; start += 50) {
    const slice = slugs.slice(start, start + 50);
    const marks = slice.map(() => '?').join(',');
    const { results } = await env.COMMENTS_DB.prepare(
      `SELECT slug, COUNT(*) AS n
         FROM (SELECT slug FROM comments WHERE slug IN (${marks})
               UNION ALL
               SELECT slug FROM replies  WHERE slug IN (${marks}))
        GROUP BY slug`
    )
      .bind(...slice, ...slice)
      .all<{ slug: string; n: number }>();
    for (const r of results ?? []) counts[r.slug] = r.n;
  }
  return counts;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  // 批量形态优先：`?slugs=` 存在就走批量（两个参数同时给也以批量为准，避免一次意外出两份语义）
  if (url.searchParams.has('slugs')) {
    return json({ counts: await countAll(url.searchParams.get('slugs'), env) });
  }
  const slug = url.searchParams.get('slug') ?? '';
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
  for (let start = 0; start < ids.length; start += 99) {
    const slice = ids.slice(start, start + 99);
    const marks = slice.map(() => '?').join(',');
    const { results: rrows } = await env.COMMENTS_DB.prepare(
      `SELECT id, parent_id, reply_to, name, body, created_at
         FROM replies
        WHERE slug = ? AND parent_id IN (${marks})
        ORDER BY created_at ASC, id ASC`
    )
      .bind(slug, ...slice)
      .all<{
        id: number;
        parent_id: number;
        reply_to: string;
        name: string;
        body: string;
        created_at: string;
      }>();
    replies.push(...(rrows ?? []).map(toReplyRecord));
  }
  replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);

  const withAuthors = await attachCommentAuthors(comments, replies, env);
  // 语音（2026-11-10）：和作者信息同一层 —— 前端拿到 record 就能直接画播放条。
  await attachAudioPaths(env, withAuthors.comments, withAuthors.replies);
  return json(withAuthors);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
  guardPublicWrite(request);
  const payload = await readJsonBody(request, 16 * 1024);

  const author = await commentIdentity(payload, request, env);
  const check = validateComment(author ? { ...(payload as Record<string, unknown>), name: author.nickname } : payload);
  if (!check.ok) return json({ error: check.error }, 400);
  if (!publishedTargets.has(check.value.slug)) return json({ error: '页面不存在或尚未开放留言' }, 400);

  // 蜜罐命中：**假装成功**但不落库 —— 让机器人以为得手，不来重试。
  if (honeypotTripped(payload)) {
    return json({ comment: { id: 0, ...check.value, createdAt: new Date().toISOString() } }, 201);
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await hashIp(ip);

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

  /* 「这条回复是回给谁的」—— 2026-10-18 新增，提醒功能的地基。
     顶层评论不必问：目标是 parentId 本身。回复一条回复时前端会带 replyTarget，
     服务端再核一遍它确实属于本线程（同 slug、同 parent_id），核不过就退回父评论 ——
     **绝不按名字猜人**（0003 里的 reply_to 只是名字串）。 */
  const noticeTarget: NoticeTarget | null =
    parentId > 0
      ? await validNoticeTarget(env, slug, parentId, parseNoticeTarget((payload as Record<string, unknown>).replyTarget))
      : null;

  // 主留言与回复、匿名与账户共用同一个 IP 额度；占额是原子 SQL。
  const limits = await env.COMMENTS_DB.batch(writeLimitStatements(env, 'comments:ip', ipHash, RATE_MAX, Date.now()));
  if (!limits[1].results?.length) {
    return json({ error: '发表太频繁，请等一分钟再试' }, 429);
  }

  const createdAt = new Date().toISOString();
  // 主动匿名不暴露或保存账户关联，仅用服务端会话避免站主收到自己的消息。
  let skipOwner = Boolean(env.OWNER_USER_ID && author?.id === env.OWNER_USER_ID);
  if (env.OWNER_USER_ID && !author) {
    try { skipOwner = (await currentAccount(request, env))?.id === env.OWNER_USER_ID; }
    catch (error) { console.error('notice identity check failed', error); }
  }
  const notice = { slug, actorName: name, actorId: author?.id ?? null, body, createdAt, skipOwner };

  // ---- 顶层评论（parentId = 0）----
  if (parentId === 0) {
    if (author) {
      const id = await saveAuthoredComment(request, env, author, 'comment', [slug, name, body, createdAt, ipHash]);
      const audioPath = await bindCommentAudio(env, payload as Record<string, unknown>, ipHash, 'comment', id, slug);
      await recordCommentNotice(env, { ...notice, parentId: id });
      return json({ comment: { id, slug, name, body, createdAt, parentId: 0, replyTo: '', audio: audioPath, author: publicUser(author, env) } }, 201);
    }
    const inserted = await env.COMMENTS_DB.prepare(
      'INSERT INTO comments (slug, name, body, created_at, ip_hash) VALUES (?, ?, ?, ?, ?) RETURNING id'
    )
      .bind(slug, name, body, createdAt, ipHash)
      .first<{ id: number }>();

    await recordCommentNotice(env, { ...notice, parentId: inserted?.id ?? 0 });
    const audioPath = await bindCommentAudio(env, payload as Record<string, unknown>, ipHash, 'comment', inserted?.id ?? 0, slug);
    return json({ comment: { id: inserted?.id ?? 0, slug, name, body, createdAt, parentId: 0, replyTo: '', audio: audioPath, author: null } }, 201);
  }

  // ---- 回复（parentId > 0）----（父评论已在限流前校验过）
  if (author) {
    const id = await saveAuthoredComment(request, env, author, 'reply', [slug, parentId, replyTo, name, body, createdAt, ipHash]);
    // 回复已经落库 ⇒ 再记提醒（失败不影响发表，见 _lib/notices.ts）
    await recordReplyNotice(env, { ...notice, parentId, replyId: id, target: noticeTarget! });
    const audioPath = await bindCommentAudio(env, payload as Record<string, unknown>, ipHash, 'reply', id, slug);
    return json({ comment: { id, slug, name, body, createdAt, parentId, replyTo, audio: audioPath, author: publicUser(author, env) } }, 201);
  }
  const inserted = await env.COMMENTS_DB.prepare(
    'INSERT INTO replies (slug, parent_id, reply_to, name, body, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
  )
    .bind(slug, parentId, replyTo, name, body, createdAt, ipHash)
    .first<{ id: number }>();

  await recordReplyNotice(env, { ...notice, parentId, replyId: inserted?.id ?? 0, target: noticeTarget! });

  const audioPath = await bindCommentAudio(env, payload as Record<string, unknown>, ipHash, 'reply', inserted?.id ?? 0, slug);

  return json(

    { comment: { id: inserted?.id ?? 0, slug, name, body, createdAt, parentId, replyTo, audio: audioPath, author: null } },
    201
  );
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    throw error;
  }
};
