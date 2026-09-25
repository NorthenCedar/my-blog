export const NAME_MAX = 40;
export const BODY_MAX = 1000;
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX = 2;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type CommentRecord = { id: number; name: string; body: string; createdAt: string };
export type CommentInput = { slug: string; name: string; body: string };

export type Validation = { ok: true; value: CommentInput } | { ok: false; error: string };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

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

  if (!SLUG_RE.test(slug)) return { ok: false, error: '页面标识不合法' };
  if (name.length === 0) return { ok: false, error: '名字没写' };
  if (name.length > NAME_MAX) return { ok: false, error: `名字不能超过 ${NAME_MAX} 字` };
  if (body.length === 0) return { ok: false, error: '留言为空' };
  if (body.length > BODY_MAX) return { ok: false, error: `留言不能超过 ${BODY_MAX} 字` };

  return { ok: true, value: { slug, name, body } };
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
