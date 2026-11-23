/**
 * 消息提醒的数据层：访客收自己的回复，站主另收全站新评论与回复。
 *
 * 三条铁律：
 *   ① **只认 id，不认名字**。0003 的 replies 只存了 reply_to 名字串，同楼层重名就串人；
 *      所以提醒的归属一律走 reply_targets → comment_authors。
 *   ② **提醒是附加物，不是正文的一部分**：通知写失败绝不能让评论发表失败
 *      （迁移还没跑、表还不存在的时候，站上照样得能留言）。
 *   ③ **不存 IP、不存正文副本**：excerpt 只摘 80 字，评论删了触发器一起清。
 */
import type { VisitorEnv } from './visitor-store';

/** 「我回复的是哪一条」—— 顶层评论或它下面的一条回复 */
export type NoticeTarget = { kind: 'comment' | 'reply'; id: number };
export type NoticePosition = { createdAt: string; id: number };

export type ReplyNotice = {
  id: number;
  slug: string;
  parentId: number;
  replyId: number | null;
  kind: 'comment' | 'reply' | 'link-apply';
  href: string;
  label: string;
  actorName: string;
  excerpt: string;
  createdAt: string;
  readAt: number | null;
};

const EXCERPT_MAX = 80;
export const NOTICE_LIMIT = 100;

/** 前端给的形状不可信：不是 {kind,id} 就当没给（老前端、手写请求、爬虫都走这条路） */
export function parseNoticeTarget(input: unknown): NoticeTarget | null {
  if (!input || typeof input !== 'object') return null;
  const { kind, id } = input as Record<string, unknown>;
  if (kind !== 'comment' && kind !== 'reply') return null;
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? { kind, id: n } : null;
}

/**
 * 校验「回复指向」确实属于本次线程：
 *   · kind='reply'：那条回复必须存在、同 slug、且 parent_id 就是本次的 parentId
 *     —— 两层结构下这三条一起成立才算同一条对话；
 *   · 任何一条不成立就**退化成父评论**，绝不按名字猜人、也不回报错
 *     （指错了是前端的事，不该让人发不出评论）。
 * kind='comment' 不必再查：父评论在限流之前已经校验过存在且同 slug。
 */
export async function validNoticeTarget(
  env: VisitorEnv,
  slug: string,
  parentId: number,
  target: NoticeTarget | null
): Promise<NoticeTarget> {
  if (target?.kind === 'reply') {
    const row = await env.COMMENTS_DB.prepare(
      'SELECT id FROM replies WHERE id = ? AND slug = ? AND parent_id = ? LIMIT 1'
    )
      .bind(target.id, slug, parentId)
      .first<{ id: number }>();
    if (row) return target;
  }
  return { kind: 'comment', id: parentId };
}

/** 迁移还没执行时把它当「没有提醒」处理，而不是 500 —— 部署次序不该拖垮留言 */
const forgiveMissingTable = (error: unknown) => /no such table: (reply_targets|reply_notices|comment_authors|visitor_accounts)/i.test(String(error));

type NoticeContent = {
  slug: string; parentId: number; replyId: number | null;
  actorName: string; actorId: string | null; body: string; createdAt?: string; skipOwner?: boolean;
};

/** 只投递给存在的账户和仍存在的原评论；删除与通知写入交错时不留死链。 */
function noticeInsert(env: VisitorEnv, userId: string, notice: NoticeContent) {
  const { slug, parentId, replyId } = notice;
  const source = replyId === null
    ? 'SELECT 1 FROM comments WHERE id = ? AND slug = ?'
    : 'SELECT 1 FROM replies WHERE id = ? AND slug = ? AND parent_id = ?';
  const values = replyId === null ? [parentId, slug] : [replyId, slug, parentId];
  return env.COMMENTS_DB.prepare(
    'INSERT OR IGNORE INTO reply_notices ' +
      '(user_id,slug,parent_id,reply_id,actor_name,actor_user_id,excerpt,created_at) ' +
      `SELECT id,?,?,?,?,?,?,? FROM visitor_accounts WHERE id = ? AND EXISTS (${source})`
  ).bind(slug, parentId, replyId, notice.actorName.slice(0, 60), notice.actorId,
    notice.body.slice(0, EXCERPT_MAX), notice.createdAt ?? new Date().toISOString(), userId, ...values);
}

function pruneNotices(env: VisitorEnv, userId: string) {
  return env.COMMENTS_DB.prepare(
    'DELETE FROM reply_notices WHERE id IN (SELECT id FROM reply_notices WHERE user_id = ? ' +
      'ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?)'
  ).bind(userId, NOTICE_LIMIT);
}

/** 顶层留言只有站主接收；匿名也投递，客户端提供的身份字段不参与判定。 */
export async function recordCommentNotice(env: VisitorEnv, notice: Omit<NoticeContent, 'replyId'>): Promise<void> {
  if (!env.OWNER_USER_ID || notice.parentId <= 0 || notice.skipOwner || notice.actorId === env.OWNER_USER_ID) return;
  try {
    await env.COMMENTS_DB.batch([
      noticeInsert(env, env.OWNER_USER_ID, { ...notice, replyId: null }),
      pruneNotices(env, env.OWNER_USER_ID),
    ]);
  } catch (error) {
    if (!forgiveMissingTable(error)) console.error('comment notice failed', error);
  }
}

/** 友链申请只投递给站主；parent_id 存负数避免与 comments.id 碰撞且不被评论删除触发器误删。 */
export async function recordLinkApplyNotice(
  env: VisitorEnv,
  options: { applicationId: number; name: string; href: string; desc: string; createdAt?: string },
): Promise<void> {
  if (!env.OWNER_USER_ID || options.applicationId <= 0) return;
  const excerpt = `${options.href} · ${options.desc}`.slice(0, EXCERPT_MAX);
  try {
    await env.COMMENTS_DB.batch([
      env.COMMENTS_DB.prepare(
        'INSERT OR IGNORE INTO reply_notices ' +
          '(user_id,slug,parent_id,reply_id,actor_name,actor_user_id,excerpt,created_at) ' +
          "SELECT id,'link-apply',?,NULL,?,NULL,?,? FROM visitor_accounts WHERE id = ?"
      ).bind(
        -options.applicationId,
        options.name.slice(0, 60),
        excerpt,
        options.createdAt ?? new Date().toISOString(),
        env.OWNER_USER_ID,
      ),
      pruneNotices(env, env.OWNER_USER_ID),
    ]);
  } catch (error) {
    if (!forgiveMissingTable(error)) console.error('link apply notice failed', error);
  }
}

/**
 * 记一条「某人回复了你」。
 * 调用点只有 comments.ts 一处（发表回复之后）；失败一律吞掉，绝不连累发表。
 */
export async function recordReplyNotice(
  env: VisitorEnv,
  options: NoticeContent & { replyId: number; target: NoticeTarget }
): Promise<void> {
  const { slug, parentId, replyId, target } = options;
  if (replyId <= 0) return;
  try {
    const owner = await env.COMMENTS_DB.prepare(
      'SELECT user_id FROM comment_authors WHERE kind = ? AND comment_id = ? LIMIT 1'
    )
      .bind(target.kind, target.id)
      .first<{ user_id: string }>();

    const statements = [
      // 指向无论如何都记：它描述的是「这条回复朝哪儿说话」，与对方有没有账户无关
      env.COMMENTS_DB.prepare(
        'INSERT INTO reply_targets (reply_id, target_kind, target_id) ' +
          'SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM replies WHERE id = ? AND slug = ? AND parent_id = ?) ' +
          'ON CONFLICT(reply_id) DO UPDATE SET target_kind = excluded.target_kind, target_id = excluded.target_id'
      ).bind(replyId, target.kind, target.id, replyId, slug, parentId),
    ];

    // 去重后再投递：直接回复站主时只有一条；站主自己发表（含主动匿名）不自收。
    const recipients = new Set([owner?.user_id, env.OWNER_USER_ID]);
    for (const recipient of recipients) {
      if (!recipient || recipient === options.actorId || (options.skipOwner && recipient === env.OWNER_USER_ID)) continue;
      statements.push(noticeInsert(env, recipient, options), pruneNotices(env, recipient));
    }

    await env.COMMENTS_DB.batch(statements);
  } catch (error) {
    if (forgiveMissingTable(error)) return;
    // 其他数据库故障也不该让评论发不出去：记录到 worker 日志即可
    console.error('reply notice failed', error);
  }
}

/** 铃铛要的两样：未读数 + 最近几条（未登录的调用方根本不会走到这里） */
export async function listReplyNotices(
  env: VisitorEnv,
  userId: string,
  limit = 20,
  before?: NoticePosition | number
): Promise<{ unread: number; items: ReplyNotice[]; nextBefore: number | null; nextCursor: string | null }> {
  try {
    let filter = '';
    const values: (string | number)[] = [userId];
    if (typeof before === 'number') {
      // 兼容仍只发送编号的旧页面，按当前账户查找起点。
      filter = ' AND (created_at, id) < (SELECT created_at, id FROM reply_notices WHERE user_id = ? AND id = ?)';
      values.push(userId, before);
    } else if (before) {
      filter = ' AND (created_at, id) < (?, ?)';
      values.push(before.createdAt, before.id);
    }
    const [, counted, listed] = await env.COMMENTS_DB.batch([
      // 旧信箱在首次读取时清理，计数和分页都基于同一批保留记录。
      pruneNotices(env, userId),
      env.COMMENTS_DB.prepare('SELECT COUNT(*) AS n FROM reply_notices WHERE user_id = ? AND read_at IS NULL').bind(userId),
      env.COMMENTS_DB.prepare(
        'SELECT id, slug, parent_id, reply_id, actor_name, excerpt, created_at, read_at ' +
          `FROM reply_notices WHERE user_id = ?${filter} ORDER BY created_at DESC, id DESC LIMIT ?`
      ).bind(...values, limit + 1),
    ]);
    const unread = (counted.results?.[0] as { n?: number } | undefined)?.n ?? 0;
    const rows = (listed.results ?? []) as Array<{
      id: number; slug: string; parent_id: number; reply_id: number | null;
      actor_name: string; excerpt: string; created_at: string; read_at: number | null;
    }>;
    const last = rows.length > limit ? rows[limit - 1] : undefined;
    return {
      unread,
      nextBefore: last?.id ?? null,
      nextCursor: last ? `${last.created_at}|${last.id}` : null,
      items: rows.slice(0, limit).map((r) => ({
        id: r.id,
        slug: r.slug,
        parentId: r.parent_id,
        replyId: r.reply_id,
        kind: r.slug === 'link-apply' ? 'link-apply' : r.reply_id === null ? 'comment' : 'reply',
        href: noticeHref(r.slug, r.parent_id, r.reply_id),
        label:
          r.slug === 'link-apply'
            ? '友链申请 · 新申请'
            : (r.slug === 'guestbook' ? '留言板' : r.slug.startsWith('talk-') ? '说说评论' : '文章评论') +
              ' · ' +
              (r.reply_id !== null ? '新回复' : r.slug === 'guestbook' ? '新留言' : '新评论'),
        actorName: r.actor_name,
        excerpt: r.excerpt,
        createdAt: r.created_at,
        readAt: r.read_at ?? null,
      })),
    };
  } catch (error) {
    if (forgiveMissingTable(error)) return { unread: 0, items: [], nextBefore: null, nextCursor: null };
    throw error;
  }
}

export function noticeHref(slug: string, parentId: number, replyId: number | null): string {
  if (slug === 'link-apply') return `/links/?application=${Math.abs(parentId)}#link-apply`;
  if (slug.startsWith('talk-')) {
    const reply = replyId === null ? '' : `&reply=${replyId}`;
    return `/talks/?comment=${parentId}${reply}#c-${encodeURIComponent(slug)}`;
  }
  const page = slug === 'guestbook' ? '/guestbook/' : `/posts/${encodeURIComponent(slug)}/`;
  return `${page}?comment=${parentId}${replyId === null ? `#comment-${parentId}` : `#reply-${replyId}`}`;
}

/**
 * 标记已读。`ids === null` = 全部已读；**空数组 = 什么也不做**
 * （请求里带了 ids 但一个都不合法时，不能顺手把整箱标成已读 —— 那是静默丢提醒）。
 * 只动自己的行（WHERE user_id 兜住越权）。
 */
export async function markReplyNoticesRead(
  env: VisitorEnv,
  userId: string,
  ids: readonly number[] | null
): Promise<void> {
  const now = Date.now();
  try {
    if (ids === null) {
      await env.COMMENTS_DB.prepare(
        'UPDATE reply_notices SET read_at = ? WHERE user_id = ? AND read_at IS NULL'
      )
        .bind(now, userId)
        .run();
      return;
    }
    if (ids.length === 0) return;
    // 分批：D1 单条语句的绑定参数有上限（同 attachCommentAuthors 的 40 一批）
    for (let start = 0; start < ids.length; start += 40) {
      const slice = ids.slice(start, start + 40);
      await env.COMMENTS_DB.prepare(
        `UPDATE reply_notices SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${slice
          .map(() => '?')
          .join(',')})`
      )
        .bind(now, userId, ...slice)
        .run();
    }
  } catch (error) {
    if (!forgiveMissingTable(error)) throw error;
  }
}
