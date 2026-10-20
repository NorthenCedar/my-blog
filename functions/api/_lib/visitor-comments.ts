import { fail } from './visitor-core';
import { ACCOUNT_FIELDS, LIVE_ACCOUNT_SQL, guardWrite, publicUser, requireAccount, sessionToken, writeProof, type Account, type VisitorEnv } from './visitor-store';

export async function saveAuthoredComment(request: Request, env: VisitorEnv, author: Account, kind: 'comment' | 'reply', values: unknown[]) {
  const sql = kind === 'comment'
    ? 'INSERT INTO comments (slug, name, body, created_at, ip_hash) SELECT ?,?,?,?,?'
    : 'INSERT INTO replies (slug, parent_id, reply_to, name, body, created_at, ip_hash) SELECT ?,?,?,?,?,?,?';
  try {
    const results = await env.COMMENTS_DB.batch([
      env.COMMENTS_DB.prepare(`${sql} WHERE ${LIVE_ACCOUNT_SQL} RETURNING id`).bind(...values, ...await writeProof(request, author)),
      // 条件 INSERT 没有命中时，用 NOT NULL 约束令整批事务回滚，不能留下匿名记录或复用旧 id。
      env.COMMENTS_DB.prepare('INSERT INTO comment_authors (kind,comment_id,user_id) VALUES (?, CASE WHEN changes() = 1 THEN last_insert_rowid() ELSE NULL END, ?)').bind(kind, author.id),
    ]);
    return (results[0].results[0] as { id: number }).id;
  } catch (error) {
    if (/NOT NULL constraint failed: comment_authors.comment_id/i.test(String(error))) return fail(401, '登录已过期，请重新登录；编辑的内容会保留');
    throw error;
  }
}

export async function commentIdentity(input: unknown, request: Request, env: VisitorEnv) {
  const payload = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  if (payload.identity === 'account') { guardWrite(request); return requireAccount(request, env); }
  if (payload.identity !== undefined && payload.identity !== 'anonymous') return fail(400, '请选择发表身份');
  if (payload.identity === undefined && sessionToken(request)) return fail(409, '请选择用账户还是匿名发表；编辑的内容会保留');
  return null;
}
export async function attachCommentAuthors<T extends { id: number; name: string }>(comments: T[], replies: T[], env: VisitorEnv) {
  const ids = [...comments.map(c => ['comment', c.id] as const), ...replies.map(c => ['reply', c.id] as const)];
  const found = new Map<string, ReturnType<typeof publicUser>>();
  if (ids.length) {
    // LIMIT 最多 200 条顶层；避免 replies 数量多时超过 D1 单条语句的绑定参数上限。
    for (let start = 0; start < ids.length; start += 40) {
      const slice = ids.slice(start, start + 40);
      const fields = ACCOUNT_FIELDS.split(',').map(f => `a.${f}`).join(',');
      let result;
      try {
        result = await env.COMMENTS_DB.prepare(`SELECT m.kind,m.comment_id,${fields} FROM comment_authors m JOIN visitor_accounts a ON a.id = m.user_id WHERE ${slice.map(() => '(m.kind = ? AND m.comment_id = ?)').join(' OR ')}`)
          .bind(...slice.flat()).all<Account & { kind: string; comment_id: number }>();
      } catch (error) {
        // 部署先后次序或账户迁移尚未执行时，旧匿名评论仍可读；其他数据库故障继续抛出。
        if (/no such table: (comment_authors|visitor_accounts)/i.test(String(error))) break;
        throw error;
      }
      for (const row of result.results ?? []) found.set(`${row.kind}:${row.comment_id}`, publicUser(row, env));
    }
  }
  const annotate = (rows: T[], kind: string) => rows.map(row => {
    const author = found.get(`${kind}:${row.id}`) ?? null;
    return { ...row, name: author?.nickname ?? row.name, author };
  });
  return { comments: annotate(comments, 'comment'), replies: annotate(replies, 'reply') };
}
