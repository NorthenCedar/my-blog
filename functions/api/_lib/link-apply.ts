import { CONTROL_OR_BIDI_RE, UNSAFE_NAME_RE } from './comments-core';
import type { VisitorEnv } from './visitor-store';

export const LINK_NAME_MAX = 60;
export const LINK_HREF_MAX = 300;
export const LINK_DESC_MAX = 15;
export const LINK_AVATAR_MAX = 400;
export const LINK_APPLY_RATE_MAX = 2;
export const LINK_LIST_LIMIT = 50;

export type LinkApplyInput = {
  name: string;
  href: string;
  desc: string;
  avatar: string;
};

export type LinkApplyValidation =
  | { ok: true; value: LinkApplyInput }
  | { ok: false; error: string };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function parseHttpUrl(raw: string): string | null {
  if (!raw || /[\\\u0000-\u0020\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** 校验友链申请表单输入：站点名称、链接、一句话描述必填，头像链接选填。 */
export function validateLinkApply(input: unknown): LinkApplyValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: '请求格式不对' };
  }
  const o = input as Record<string, unknown>;
  const name = str(o.name).trim();
  const hrefRaw = str(o.href).trim();
  const desc = str(o.desc).trim();
  const avatarRaw = str(o.avatar).trim();

  if (name.length === 0) return { ok: false, error: '站点名称没填' };
  if (name.length > LINK_NAME_MAX) return { ok: false, error: `站点名称不能超过 ${LINK_NAME_MAX} 字` };
  if (CONTROL_OR_BIDI_RE.test(name) || UNSAFE_NAME_RE.test(name)) {
    return { ok: false, error: '站点名称包含不允许的字符' };
  }

  if (hrefRaw.length === 0) return { ok: false, error: '网站链接没填' };
  if (hrefRaw.length > LINK_HREF_MAX) return { ok: false, error: `网站链接不能超过 ${LINK_HREF_MAX} 字符` };
  const href = parseHttpUrl(hrefRaw);
  if (!href) return { ok: false, error: '网站链接请填写有效的 http:// 或 https:// 网址' };

  if (desc.length === 0) return { ok: false, error: '一句话描述没填' };
  if (desc.length > LINK_DESC_MAX) return { ok: false, error: `一句话描述不能超过 ${LINK_DESC_MAX} 字` };
  if (CONTROL_OR_BIDI_RE.test(desc)) {
    return { ok: false, error: '一句话描述不能包含控制字符' };
  }

  let avatar = '';
  if (avatarRaw.length > 0) {
    if (avatarRaw.length > LINK_AVATAR_MAX) return { ok: false, error: `头像链接不能超过 ${LINK_AVATAR_MAX} 字符` };
    const parsedAvatar = parseHttpUrl(avatarRaw);
    if (!parsedAvatar) return { ok: false, error: '头像链接请填写有效的 http:// 或 https:// 图片地址' };
    avatar = parsedAvatar;
  }

  return { ok: true, value: { name, href, desc, avatar } };
}

/** 若线上库尚未执行 0015 迁移，按与迁移一致的幂等 SQL 自动建表，防止首条友链申请报错。 */
export async function ensureLinkApplicationsTable(env: VisitorEnv): Promise<void> {
  await env.COMMENTS_DB.batch([
    env.COMMENTS_DB.prepare(
      'CREATE TABLE IF NOT EXISTS link_applications (' +
        'id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, href TEXT NOT NULL, ' +
        "desc TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, ip_hash TEXT NOT NULL)"
    ),
    env.COMMENTS_DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_link_applications_created ON link_applications (created_at DESC, id DESC)'
    ),
  ]);
}
