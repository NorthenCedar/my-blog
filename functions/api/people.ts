import { hasOnlyQueryParams } from './_lib/public-write';
import { ACCOUNT_FIELDS, accountJson, publicUser, type Account, type VisitorEnv } from './_lib/visitor-store';

/** 明确列出公开字段，绝不直接序列化数据库账户行。 */
export const onRequestGet: PagesFunction<VisitorEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (!hasOnlyQueryParams(url, ['id'])) return accountJson({ error: '查询参数不合法' }, 400);
  const id = url.searchParams.get('id') ?? '';
  if (!/^[a-f0-9]{32}$/.test(id)) return accountJson({ error: '名片不存在' }, 404);
  try {
    const user = await env.COMMENTS_DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM visitor_accounts WHERE id = ?`).bind(id).first<Account>();
    return user ? accountJson({ user: publicUser(user, env) }) : accountJson({ error: '名片不存在' }, 404);
  } catch { return accountJson({ error: '名片暂时不可用' }, 503); }
};
