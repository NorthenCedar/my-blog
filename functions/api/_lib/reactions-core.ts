/**
 * 点赞与访问统计的**业务规则**（照 0001 的分工：规则集中在这里，适配器只做 HTTP 翻译）。
 *
 * 为什么点赞的 slug 要单独校验：说说的 id 是 `talk-<哈希>`，格式与文章 slug 同族，
 * 但不允许任意字符串 —— 否则接口就能被拿来凭空造键（灌一堆没意义的行）。
 */

import { scanCommaList } from './comments-core';

/** 与评论同族的 slug 形态：小写字母/数字，段间用连字符。 */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** 说说点赞的 slug 前缀：必须是我们自己生成的 `talk-…`，不接受别的。 */
export const TALK_PREFIX = 'talk-';
const SLUG_MAX = 60;

export type LikeValidation = { ok: true; slug: string } | { ok: false; error: string };

export function validateLikeSlug(input: unknown): LikeValidation {
  const slug = typeof input === 'string' ? input.trim() : '';
  if (slug.length === 0) return { ok: false, error: '缺少 slug' };
  if (slug.length > SLUG_MAX) return { ok: false, error: 'slug 太长' };
  if (!slug.startsWith(TALK_PREFIX)) return { ok: false, error: '只支持说说点赞' };
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'slug 不合法' };
  return { ok: true, slug };
}

/** 批量查询用：把 slugs 参数切成合法清单（非法项**静默丢弃**，不因为一个脏值整批失败）。 */
export function parseSlugList(input: string | null, max = 100): string[] {
  return scanCommaList(input, max, (raw) => {
    const r = validateLikeSlug(raw);
    return r.ok ? r.slug : null;
  });
}

/** 只存 IP 的哈希 —— 与 functions/api/comments.ts 里那条同源（那边为了不动既有代码没抽出来）。 */
export async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 访客号的形状（cookie 里那个 16 位小写字母数字）：中间件生成、这里校验带回的值。 */
const VID_RE = /^[a-z0-9]{16}$/;
export const isVisitorId = (v: string): boolean => VID_RE.test(v);
