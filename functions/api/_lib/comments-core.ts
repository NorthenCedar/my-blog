export const NAME_MAX = 40;
export const BODY_MAX = 1000;
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX = 2;
export const COMMENT_SLUG_MAX = 160;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type CommentRecord = { id: number; name: string; body: string; createdAt: string };
/** replies 表的一行（camelCase）。parentId 指向**顶层**评论，replyTo 是被回复者的名字。 */
export type ReplyRecord = {
  id: number;
  parentId: number;
  replyTo: string;
  name: string;
  body: string;
  createdAt: string;
};
export type CommentInput = {
  slug: string;
  name: string;
  body: string;
  /** 0 = 顶层评论；>0 = 回复（指向被回复的**顶层**评论 id） */
  parentId: number;
  /** 被回复者的名字；空串 = 直接回复顶层评论 */
  replyTo: string;
};

export type Validation = { ok: true; value: CommentInput } | { ok: false; error: string };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * 回复目标（parentId）的校验。**只接受安全非负整数** ——
 * 字符串 "3"、负数、小数、NaN 一律拒绝：这个数字要拼进 SQL，宁可严格。
 * 不传 / null / 空串都按 0（顶层评论）处理 —— 老客户端（缓存里的旧脚本）不认识 parentId，
 * 也必须照常能发顶层评论。
 */
const parseParentId = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) return null;
  return v;
};

/**
 * 校验并归一化一条留言。**不抛异常** —— 任何脏输入都返回 { ok: false }，
 * 由适配器翻成 400。业务规则集中在这里，适配器里不许再写 if。
 */
export function validateComment(input: unknown): Validation {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: '请求格式不对' };
  }
  const o = input as Record<string, unknown>;

  const slug = str(o.slug).trim();
  const name = str(o.name).trim();
  const body = str(o.body).trim();

  if (slug.length > COMMENT_SLUG_MAX || !SLUG_RE.test(slug)) return { ok: false, error: '页面标识不合法' };
  if (name.length === 0) return { ok: false, error: '名字没写' };
  if (name.length > NAME_MAX) return { ok: false, error: `名字不能超过 ${NAME_MAX} 字` };
  if (body.length === 0) return { ok: false, error: '留言为空' };
  if (body.length > BODY_MAX) return { ok: false, error: `留言不能超过 ${BODY_MAX} 字` };

  // 回复：parentId > 0 时才是回复。不传 → 0（顶层）。
  const parentId = parseParentId(o.parentId);
  if (parentId === null) return { ok: false, error: '回复目标不合法' };

  // replyTo 是被回复者的**名字**（显示成「A 回复 B」），长度按名字的上限卡。
  const replyTo = str(o.replyTo).trim();
  if (replyTo.length > NAME_MAX) return { ok: false, error: `回复对象不能超过 ${NAME_MAX} 字` };
  // parentId=0 时 replyTo 没有意义，一律归一成空串（也避免脏数据落库）
  const replyToFinal = parentId > 0 ? replyTo : '';

  return { ok: true, value: { slug, name, body, parentId, replyTo: replyToFinal } };
}

/**
 * 蜜罐：正常用户看不见这个字段（`tabindex="-1"` + 移出视口），
 * 所以**只要它有任何值**——哪怕只有一个空格——就一定是别的东西写进去的。
 * 这里刻意不 trim：`' '` 也算命中。
 */
export function honeypotTripped(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;
  const v = (input as Record<string, unknown>).website;
  return typeof v === 'string' && v.length > 0;
}

export function rateLimited(recentCount: number): boolean {
  return recentCount >= RATE_MAX;
}

export function toRecord(row: {
  id: number;
  name: string;
  body: string;
  created_at: string;
}): CommentRecord {
  return { id: row.id, name: row.name, body: row.body, createdAt: row.created_at };
}

/** replies 表的 snake_case 行 → camelCase */
export function toReplyRecord(row: {
  id: number;
  parent_id: number;
  reply_to: string;
  name: string;
  body: string;
  created_at: string;
}): ReplyRecord {
  return {
    id: row.id,
    parentId: row.parent_id,
    replyTo: row.reply_to ?? '',
    name: row.name,
    body: row.body,
    createdAt: row.created_at,
  };
}

/**
 * 批量查询用（2026-09-28 站主要求）：把 `slugs=a,b,c` 切成合法清单，非法项**静默丢弃**
 * （不因为一个脏值就让整批失败）。
 * 与 reactions-core 的 parseSlugList 同思路，但**不要求 `talk-` 前缀** ——
 * 评论挂在文章 slug / 留言板 / 说说上，不是一个族，这里只对 slug 形态本身做校验。
 */
export function parseCommentSlugList(raw: string | null, max = 100): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const out: string[] = [];
  for (const piece of raw.split(',')) {
    const s = piece.trim();
    if (s.length <= COMMENT_SLUG_MAX && SLUG_RE.test(s) && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// ⚠️ 分组函数（groupRepliesByParent）**不放在这里**：那是前端渲染的事（后端只返回两个数组），
// 放进来会被前端 import ⇒ 整个 core 被打进浏览器产物（实测多出约 3 KB，直接顶爆 JS 预算）。
// 它在 src/scripts/reply-common.ts 里，测试也从那边 import。
