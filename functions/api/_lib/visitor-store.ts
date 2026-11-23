import { digest, fail, randomToken } from './visitor-core';
import { defaultAvatarUrl } from '../../../src/lib/visitor-avatars';
import { guardPublicWrite, readJsonBodyWithSize } from './public-write';

export interface VisitorEnv {
  COMMENTS_DB: D1Database;
  OWNER_USER_ID?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  OWNER_NOTIFY_EMAIL?: string;
  SITE_ORIGIN?: string;
}
export type Account = {
  id: string; username: string; nickname: string; bio: string; avatar: string; avatar_version: string;
  password_hash: string; recovery_hash: string; auth_version: number; created_at: string;
};
export const ACCOUNT_FIELDS = 'id,username,nickname,bio,avatar,avatar_version,password_hash,recovery_hash,auth_version,created_at';
const SESSION_MS = 30 * 86400000;
const isLocal = (url: URL) => url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
export const cookieName = (request: Request) => isLocal(new URL(request.url)) ? 'nc_session_dev' : '__Host-nc_session';
export function sessionCookie(request: Request, token: string, clear = false) {
  const secure = isLocal(new URL(request.url)) ? '' : '; Secure';
  return `${cookieName(request)}=${token}; Path=/; Max-Age=${clear ? 0 : SESSION_MS / 1000}; HttpOnly${secure}; SameSite=Lax`;
}
export function sessionToken(request: Request) {
  const matches = (request.headers.get('Cookie') ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith(cookieName(request) + '='));
  const token = matches.length === 1 ? matches[0].slice(cookieName(request).length + 1) : '';
  return /^[a-f0-9]{64}$/.test(token) ? token : '';
}
export const publicUser = (user: Account, env: VisitorEnv) => ({
  id: user.id, nickname: user.nickname, bio: user.bio,
  avatarUrl: user.avatar_version ? `/api/avatars?id=${user.id}&v=${user.avatar_version}` : defaultAvatarUrl(user.avatar),
  isOwner: Boolean(env.OWNER_USER_ID && env.OWNER_USER_ID === user.id),
});
export const privateUser = (user: Account, env: VisitorEnv, email = '') => ({ ...publicUser(user, env), username: user.username, email });
export async function accountEmail(env: VisitorEnv, userId: string): Promise<string> {
  try {
    const row = await env.COMMENTS_DB.prepare('SELECT email FROM visitor_emails WHERE user_id = ? LIMIT 1')
      .bind(userId)
      .first<{ email: string }>();
    return row?.email ?? '';
  } catch (error) {
    if (/no such table:\s*visitor_emails/i.test(String(error))) return '';
    throw error;
  }
}
export async function saveAccountEmail(env: VisitorEnv, userId: string, email: string): Promise<void> {
  await env.COMMENTS_DB.prepare(
    'INSERT INTO visitor_emails (user_id, email, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at'
  )
    .bind(userId, email, new Date().toISOString())
    .run();
}
export async function currentAccount(request: Request, env: VisitorEnv): Promise<Account | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const fields = ACCOUNT_FIELDS.split(',').map(f => `a.${f}`).join(',');
  return env.COMMENTS_DB.prepare(`SELECT ${fields} FROM visitor_accounts a JOIN visitor_sessions s ON s.user_id = a.id AND s.auth_version = a.auth_version WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(await digest(token), Date.now()).first<Account>();
}
export async function requireAccount(request: Request, env: VisitorEnv) {
  return await currentAccount(request, env) ?? fail(401, '登录已过期，请重新登录；编辑的内容会保留');
}
/** 写入时再核对活跃会话，关闭“已鉴权→被撤销→仍写入”的窗口。 */
export const LIVE_ACCOUNT_SQL = 'EXISTS (SELECT 1 FROM visitor_accounts live JOIN visitor_sessions live_session ON live_session.user_id = live.id AND live_session.auth_version = live.auth_version WHERE live.id = ? AND live.auth_version = ? AND live_session.token_hash = ? AND live_session.expires_at > ?)';
export const writeProof = async (request: Request, user: Account) => [user.id, user.auth_version, await digest(sessionToken(request)), Date.now()];
export async function createSession(user: Account, env: VisitorEnv) {
  const token = randomToken();
  const inserted = await env.COMMENTS_DB.prepare('INSERT INTO visitor_sessions (token_hash,user_id,auth_version,expires_at) SELECT ?,id,auth_version,? FROM visitor_accounts WHERE id = ? AND auth_version = ? AND password_hash = ? RETURNING token_hash')
    .bind(await digest(token), Date.now() + SESSION_MS, user.id, user.auth_version, user.password_hash).first();
  if (!inserted) fail(409, '账户凭据已更新，请重新登录');
  return token;
}
export async function consumeLimit(env: VisitorEnv, scope: string, key: string, maximum: number, window = 60000) {
  const now = Date.now();
  const row = await env.COMMENTS_DB.prepare(`INSERT INTO visitor_rate_limits (scope,key_hash,window_start,hits)
    VALUES (?,?,?,1) ON CONFLICT(scope,key_hash,window_start) DO UPDATE SET hits = hits + 1
    WHERE hits < ? RETURNING hits`)
    .bind(scope, await digest(key), Math.floor(now / window) * window, maximum).first();
  if (!row) fail(429, '操作太频繁，请稍后再试');
}
export async function cleanupAccounts(env: VisitorEnv) {
  await env.COMMENTS_DB.batch([
    env.COMMENTS_DB.prepare('DELETE FROM visitor_sessions WHERE expires_at <= ?').bind(Date.now()),
    env.COMMENTS_DB.prepare('DELETE FROM visitor_rate_limits WHERE window_start < ?').bind(Date.now() - 2 * 86400000),
  ]);
}
export function guardWrite(request: Request) {
  if (request.headers.get('X-NC-Request') !== '1') fail(403, '请从本站页面操作');
  guardPublicWrite(request, true);
}
export async function readAccountBody(request: Request) {
  const { payload, byteLength } = await readJsonBodyWithSize(request, 144 * 1024, '请求太大，请缩小头像');
  if (payload.action !== 'avatar' && byteLength > 16 * 1024) fail(413, '请求太大');
  return payload;
}
export const accountJson = (body: unknown, status = 200, cookie?: string) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
});
