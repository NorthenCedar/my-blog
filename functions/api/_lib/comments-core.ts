export const NAME_MAX = 40;
export const BODY_MAX = 1000;
export const EMAIL_MAX = 254;
export const RESERVED_SENDER_EMAIL = 'bluehour@northcedar.top';
export const RESERVED_OWNER_EMAIL = 'a13655515876@163.com';
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX = 2;
export const COMMENT_SLUG_MAX = 160;
export const REPLIES_LIMIT = 1000;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** 禁止名字/签名里混入控制字符或 Unicode 双向覆写字符。 */
export const CONTROL_OR_BIDI_RE = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
/** 正文允许常见空白换行/制表符（\n \r \t），拒绝其余控制字符与 BiDi 覆写符。 */
export const BODY_CONTROL_OR_BIDI_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
/** 昵称与回复对象禁止携带尖括号或脚本伪协议特征，防止存储型 XSS 试探垃圾数据入库。 */
export const UNSAFE_NAME_RE = /[<>]|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i;

export const isValidCommentSlug = (slug: string): boolean =>
  slug.length > 0 && slug.length <= COMMENT_SLUG_MAX && SLUG_RE.test(slug);

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
  email: string;
  body: string;
  /** 0 = 顶层评论；>0 = 回复（指向被回复的**顶层**评论 id） */
  parentId: number;
  /** 被回复者的名字；空串 = 直接回复顶层评论 */
  replyTo: string;
};

export type Validation = { ok: true; value: CommentInput } | { ok: false; error: string };
export type EmailValidation = { ok: true; value: string } | { ok: false; error: string };
export type ReservedEmailOptions = { isOwner?: boolean; mailFrom?: string; ownerNotifyEmail?: string };

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function extractEmailAddress(raw?: string): string {
  if (!raw) return '';
  const match = /<([^<>]+)>/.exec(raw);
  return (match ? match[1] : raw).trim().toLowerCase();
}

/** 拦截站点发信邮箱与非站主冒用站主收信邮箱。 */
export function isReservedEmail(email: string, options?: ReservedEmailOptions): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const sender = extractEmailAddress(options?.mailFrom) || RESERVED_SENDER_EMAIL;
  if (normalized === RESERVED_SENDER_EMAIL || normalized === sender) return true;
  if (!options?.isOwner) {
    const owner = extractEmailAddress(options?.ownerNotifyEmail) || RESERVED_OWNER_EMAIL;
    if (normalized === RESERVED_OWNER_EMAIL || normalized === owner) return true;
  }
  return false;
}

/** 校验并归一化邮箱；空串表示未填（选填场景放行）。 */
export function parseOptionalEmail(v: unknown, options?: ReservedEmailOptions): EmailValidation {
  const raw = str(v);
  const email = raw.trim().toLowerCase();
  if (!email) return { ok: true, value: '' };
  if (
    email.length > EMAIL_MAX ||
    CONTROL_OR_BIDI_RE.test(raw) ||
    email.includes('..') ||
    !EMAIL_RE.test(email)
  ) {
    return { ok: false, error: '邮箱格式不太对，请检查后重试' };
  }
  const [local, domain] = email.split('@');
  if (!local || !domain || local.startsWith('.') || local.endsWith('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return { ok: false, error: '邮箱格式不太对，请检查后重试' };
  }
  if (isReservedEmail(email, options)) {
    return { ok: false, error: '该邮箱为站点或站主保留邮箱，请填写你自己的邮箱' };
  }
  return { ok: true, value: email };
}

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
  const email = parseOptionalEmail(o.email);
  if (!email.ok) return email;

  if (!isValidCommentSlug(slug)) return { ok: false, error: '页面标识不合法' };
  if (name.length === 0) return { ok: false, error: '名字没写' };
  if (name.length > NAME_MAX) return { ok: false, error: `名字不能超过 ${NAME_MAX} 字` };
  if (CONTROL_OR_BIDI_RE.test(name)) return { ok: false, error: '名字不能包含控制字符' };
  if (UNSAFE_NAME_RE.test(name)) return { ok: false, error: '名字不能包含尖括号或脚本片段' };
  if (body.length === 0) return { ok: false, error: '留言为空' };
  if (body.length > BODY_MAX) return { ok: false, error: `留言不能超过 ${BODY_MAX} 字` };
  if (BODY_CONTROL_OR_BIDI_RE.test(body)) return { ok: false, error: '留言不能包含控制字符' };

  // 回复：parentId > 0 时才是回复。不传 → 0（顶层）。
  const parentId = parseParentId(o.parentId);
  if (parentId === null) return { ok: false, error: '回复目标不合法' };

  // replyTo 是被回复者的**名字**（显示成「A 回复 B」），长度按名字的上限卡。
  const replyTo = str(o.replyTo).trim();
  if (replyTo.length > NAME_MAX) return { ok: false, error: `回复对象不能超过 ${NAME_MAX} 字` };
  // parentId=0 时 replyTo 没有意义，一律归一成空串（也避免脏数据落库）
  const replyToFinal = parentId > 0 ? replyTo : '';
  if (replyToFinal.length > 0) {
    if (CONTROL_OR_BIDI_RE.test(replyToFinal)) return { ok: false, error: '回复对象不能包含控制字符' };
    if (UNSAFE_NAME_RE.test(replyToFinal)) return { ok: false, error: '回复对象不能包含尖括号或脚本片段' };
  }

  return { ok: true, value: { slug, name, email: email.value, body, parentId, replyTo: replyToFinal } };
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

/** 按逗号游标切片并去重：避免对超长恶意查询串先 `split(',')` 分配大数组。 */
export function scanCommaList(
  raw: string | null,
  max: number,
  parse: (piece: string) => string | null,
): string[] {
  if (typeof raw !== 'string' || raw.length === 0 || max <= 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  let start = 0;
  let scanned = 0;
  const maxPieces = max * 5;
  while (start <= raw.length && out.length < max && scanned < maxPieces) {
    const comma = raw.indexOf(',', start);
    const end = comma === -1 ? raw.length : comma;
    const item = parse(raw.slice(start, end));
    scanned += 1;
    if (item !== null && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
    if (comma === -1) break;
    start = comma + 1;
  }
  return out;
}

/**
 * 批量查询用（2026-09-28 站主要求）：把 `slugs=a,b,c` 切成合法清单，非法项**静默丢弃**
 * （不因为一个脏值就让整批失败）。
 * 与 reactions-core 的 parseSlugList 同思路，但**不要求 `talk-` 前缀** ——
 * 评论挂在文章 slug / 留言板 / 说说上，不是一个族，这里只对 slug 形态本身做校验。
 */
export function parseCommentSlugList(raw: string | null, max = 100): string[] {
  return scanCommaList(raw, max, (piece) => {
    const s = piece.trim();
    return isValidCommentSlug(s) ? s : null;
  });
}

// ⚠️ 分组函数（groupRepliesByParent）**不放在这里**：那是前端渲染的事（后端只返回两个数组），
// 放进来会被前端 import ⇒ 整个 core 被打进浏览器产物（实测多出约 3 KB，直接顶爆 JS 预算）。
// 它在 src/scripts/reply-common.ts 里，测试也从那边 import。
