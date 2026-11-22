import { AccountError, digest, DUMMY_PASSWORD_HASH, fail, hashPassword, passwordOf, profileOf, randomToken, recoveryMatches, text, usernameOf, verifyPassword } from './_lib/visitor-core';
import { hasOnlyQueryParams } from './_lib/public-write';
import { ACCOUNT_FIELDS, LIVE_ACCOUNT_SQL, accountJson, cleanupAccounts, consumeLimit, createSession, currentAccount, guardWrite, privateUser, readAccountBody, requireAccount, sessionCookie, sessionToken, writeProof, type Account, type VisitorEnv } from './_lib/visitor-store';
import { cleanAvatarPng } from './_lib/visitor-avatars';

export const onRequestGet: PagesFunction<VisitorEnv> = async ({ request, env }) => {
  if (!hasOnlyQueryParams(new URL(request.url), [])) return accountJson({ error: '查询参数不合法' }, 400);
  try { const user = await currentAccount(request, env); return accountJson({ user: user ? privateUser(user, env) : null }); }
  catch { return accountJson({ error: '账户服务暂时不可用，请稍后再试' }, 503); }
};

export const onRequestPost: PagesFunction<VisitorEnv> = async ({ request, env }) => {
  try {
    guardWrite(request);
    const payload = await readAccountBody(request);
    const action = text(payload.action);
    if (!['register', 'login', 'recover', 'logout', 'profile', 'avatar', 'password', 'recovery', 'delete'].includes(action)) fail(400, '未知账户操作');
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    await consumeLimit(env, `account:${action}:ip`, ip, action === 'register' ? 3 : 30, action === 'register' ? 3600000 : 60000);
    await cleanupAccounts(env);

    if (action === 'register') {
      const username = usernameOf(payload.username);
      const password = passwordOf(payload.password);
      const id = randomToken(16);
      const recoveryCode = randomToken();
      const hashed = await hashPassword(password);
      try {
        await env.COMMENTS_DB.prepare('INSERT INTO visitor_accounts (id,username,nickname,avatar,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?,?)')
          .bind(id, username, `访客${id.slice(0, 6)}`, 'leaf', hashed, await digest(recoveryCode), new Date().toISOString()).run();
      } catch (error) {
        if (/UNIQUE constraint failed.*username/i.test(String(error))) return accountJson({ error: '这个账号不可用，请换一个' }, 409);
        throw error;
      }
      const user = await env.COMMENTS_DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM visitor_accounts WHERE id = ?`).bind(id).first<Account>();
      if (!user) return fail(503, '注册暂时不可用，请稍后重试');
      return accountJson({ user: privateUser(user, env), recoveryCode }, 201, sessionCookie(request, await createSession(user, env)));
    }

    if (action === 'login' || action === 'recover') {
      const username = usernameOf(payload.username);
      await consumeLimit(env, `account:${action}:name`, username, action === 'login' ? 10 : 6, 15 * 60000);
      const user = await env.COMMENTS_DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM visitor_accounts WHERE username = ?`).bind(username).first<Account>();
      if (action === 'login') {
        const valid = await verifyPassword(text(payload.password), user?.password_hash ?? DUMMY_PASSWORD_HASH);
        if (!valid || !user) return fail(401, '账号或密码不正确');
        return accountJson({ user: privateUser(user, env) }, 200, sessionCookie(request, await createSession(user, env)));
      }
      const password = passwordOf(payload.password);
      if (!user || !(await recoveryMatches(payload.recoveryCode, user.recovery_hash))) return fail(401, '账号或恢复码不正确');
      const recoveryCode = randomToken();
      const result = await env.COMMENTS_DB.prepare('UPDATE visitor_accounts SET password_hash = ?, recovery_hash = ?, auth_version = auth_version + 1 WHERE id = ? AND recovery_hash = ? AND auth_version = ? RETURNING id')
        .bind(await hashPassword(password), await digest(recoveryCode), user.id, user.recovery_hash, user.auth_version).first();
      if (!result) return fail(401, '账号或恢复码不正确');
      await env.COMMENTS_DB.prepare('DELETE FROM visitor_sessions WHERE user_id = ? AND auth_version <= ?').bind(user.id, user.auth_version).run();
      return accountJson({ recoveryCode }, 200, sessionCookie(request, '', true));
    }

    if (action === 'logout') {
      const token = sessionToken(request);
      if (token) await env.COMMENTS_DB.prepare('DELETE FROM visitor_sessions WHERE token_hash = ?').bind(await digest(token)).run();
      return accountJson({ ok: true }, 200, sessionCookie(request, '', true));
    }

    const user = await requireAccount(request, env);
    if (action === 'avatar') {
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(text(payload.png)), c => c.charCodeAt(0)); }
      catch { return fail(400, '头像数据不对'); }
      const clean = await cleanAvatarPng(bytes);
      const version = randomToken(16);
      const changed = await env.COMMENTS_DB.prepare(`UPDATE visitor_accounts SET avatar_blob = ?, avatar_version = ? WHERE id = ? AND ${LIVE_ACCOUNT_SQL} RETURNING id`)
        .bind(clean.buffer, version, user.id, ...await writeProof(request, user)).first();
      if (!changed) return fail(401, '登录已过期，请重新登录；编辑的内容会保留');
      return accountJson({ user: privateUser({ ...user, avatar_version: version }, env) });
    }
    if (action === 'profile') {
      const value = profileOf(payload, Boolean(env.OWNER_USER_ID && env.OWNER_USER_ID === user.id));
      const changed = await env.COMMENTS_DB.prepare(`UPDATE visitor_accounts SET nickname = ?, bio = ?, avatar = ?${value.avatar ? ", avatar_blob = NULL, avatar_version = ''" : ''} WHERE id = ? AND ${LIVE_ACCOUNT_SQL} RETURNING id`)
        .bind(value.nickname, value.bio, value.avatar || user.avatar, user.id, ...await writeProof(request, user)).first();
      if (!changed) return fail(401, '登录已过期，请重新登录；编辑的内容会保留');
      const updated = await env.COMMENTS_DB.prepare(`SELECT ${ACCOUNT_FIELDS} FROM visitor_accounts WHERE id = ?`).bind(user.id).first<Account>();
      if (!updated) return fail(401, '账户已失效');
      return accountJson({ user: privateUser(updated, env) });
    }
    if (!(await verifyPassword(text(payload.password), user.password_hash))) return fail(401, '当前密码不正确');

    if (action === 'delete') {
      // 外键级联清理所有会话与作者关联，原留言昵称与正文保留。
      const deleted = await env.COMMENTS_DB.prepare(`DELETE FROM visitor_accounts WHERE id = ? AND auth_version = ? AND password_hash = ? AND ${LIVE_ACCOUNT_SQL} RETURNING id`)
        .bind(user.id, user.auth_version, user.password_hash, ...await writeProof(request, user)).first();
      if (!deleted) return fail(409, '账户凭据已更新，请重新登录');
      return accountJson({ ok: true }, 200, sessionCookie(request, '', true));
    }
    const recoveryCode = randomToken();
    const passwordHash = action === 'password' ? await hashPassword(passwordOf(payload.newPassword)) : user.password_hash;
    const updated = await env.COMMENTS_DB.prepare(`UPDATE visitor_accounts SET password_hash = ?, recovery_hash = ?, auth_version = auth_version + 1 WHERE id = ? AND password_hash = ? AND auth_version = ? AND ${LIVE_ACCOUNT_SQL} RETURNING id`)
      .bind(passwordHash, await digest(recoveryCode), user.id, user.password_hash, user.auth_version, ...await writeProof(request, user)).first();
    if (!updated) return fail(409, '账户凭据已更新，请重新登录');
    await env.COMMENTS_DB.prepare('DELETE FROM visitor_sessions WHERE user_id = ? AND auth_version <= ?').bind(user.id, user.auth_version).run();
    return accountJson({ recoveryCode }, 200, sessionCookie(request, '', true));
  } catch (error) {
    return accountJson({ error: error instanceof AccountError ? error.message : '账户服务暂时不可用，请稍后再试' }, error instanceof AccountError ? error.status : 503);
  }
};
