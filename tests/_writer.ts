import { afterEach } from 'vitest';
import { visitorDatabase } from './_visitor-db';
import { digest } from '../functions/api/_lib/visitor-core';
import { readFileSync, existsSync } from 'node:fs';

const closers: (() => void)[] = [];
afterEach(() => closers.splice(0).forEach(close => close()));
/** 账户和 SQL 真实运行；仅省去与写作权限无关的重复密码计算。 */
export async function writerFixture(options: { owner?: boolean; configured?: boolean; cookie?: boolean; expires?: number } = {}) {
  const { sqlite, db } = visitorDatabase();
  for (const name of ['0005_reply_targets.sql', '0006_reply_notices.sql', '0007_cloud_writer.sql']) {
    if (existsSync(`migrations/${name}`)) sqlite.exec(readFileSync(`migrations/${name}`, 'utf8'));
  }
  if (existsSync('migrations/0007_cloud_writer.sql')) sqlite.exec(readFileSync('migrations/0007_cloud_writer.sql','utf8'));
  closers.push(() => sqlite.close());
  const owner = 'b'.repeat(32), token = 'a'.repeat(64);
  sqlite.prepare('INSERT INTO visitor_accounts(id,username,nickname,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,?)')
    .run(owner, 'writer', '站主', '未使用的测试密码摘要', '恢复摘要', '2026-10-23');
  const tokenHash = await digest(token);
  sqlite.prepare('INSERT INTO visitor_sessions(token_hash,user_id,auth_version,expires_at) VALUES(?,?,0,?)')
    .run(tokenHash, owner, options.expires ?? Date.now() + 86400000);
  const env = { COMMENTS_DB: db, OWNER_USER_ID: options.configured === false ? '' : options.owner === false ? 'c'.repeat(32) : owner };
  const request = (path = '/session', method = 'GET', json?: unknown, headers: Record<string,string> = {}) => new Request(`https://northcedar.top/api/writer${path}`, {
    method, headers: { Cookie: options.cookie === false ? '' : `__Host-nc_session=${token}`, ...(method !== 'GET' ? { Origin: 'https://northcedar.top', 'X-NC-Request':'1','Content-Type':'application/json' } : {}), ...headers },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  return { sqlite, db, env, owner, tokenHash, token, request };
}
