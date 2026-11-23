import { afterEach, describe, expect, it } from 'vitest';
import { visitorDatabase } from './_visitor-db';
import { onRequestGet, onRequestPost } from '../functions/api/account';
import { onRequestGet as personGet } from '../functions/api/people';
import { onRequestGet as adminGet } from '../functions/api/admin/comments';

const closers: (() => void)[] = [];
afterEach(() => closers.splice(0).forEach(close => close()));
const PASSWORD = '一段足够长而且可以记住的账户密码123';
function setup() {
  const { sqlite, db } = visitorDatabase();
  closers.push(() => sqlite.close());
  const env = { COMMENTS_DB: db, OWNER_USER_ID: '' };
  let cookie = '';
  const call = async (action: string, fields: Record<string, unknown> = {}, options: { cookie?: string; origin?: string; ip?: string } = {}) => {
    const payload = action === 'register' && !('email' in fields)
      ? { action, email: 'reader@example.com', ...fields }
      : { action, ...fields };
    const response = await onRequestPost({ request: new Request('https://example.test/api/account', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1',
        Origin: options.origin ?? 'https://example.test', Cookie: options.cookie ?? cookie,
        'CF-Connecting-IP': options.ip ?? '192.0.2.1' }, body: JSON.stringify(payload),
    }), env } as never);
    const set = response.headers.get('Set-Cookie');
    if (set) cookie = set.split(';')[0];
    return { response, data: await response.json() as any, cookie };
  };
  const current = () => onRequestGet({ request: new Request('https://example.test/api/account', { headers: { Cookie: cookie } }), env } as never);
  return { sqlite, env, call, current, get cookie() { return cookie; } };
}

describe('访客账密账户：真实数据库与 HTTP 边界', () => {
  it('有效访客 Cookie 不能替代写作台管理密钥；缺同源请求头不能写账户', async () => {
    const s = setup();
    await s.call('register', { username: 'reader', password: PASSWORD });
    const admin = await adminGet({ request: new Request('https://example.test/api/admin/comments', { headers: { Cookie: s.cookie } }), env: { ...s.env, ADMIN_TOKEN: 'test-admin-token' } } as never);
    expect(admin.status).toBe(401);
    const missing = await onRequestPost({ request: new Request('https://example.test/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.test', Cookie: s.cookie }, body: JSON.stringify({ action: 'profile', nickname: '不应写入', bio: '' }) }), env: s.env } as never);
    expect(missing.status).toBe(403);
    expect(s.sqlite.prepare('SELECT nickname FROM visitor_accounts').get()?.nickname).not.toBe('不应写入');
  });
  it('现有管理端删除留言或回复时同步清理身份关联，不影响其他留言', async () => {
    const s = setup();
    const r = await s.call('register', { username: 'reader', password: PASSWORD });
    const id = r.data.user.id;
    s.sqlite.exec("INSERT INTO comments (slug,name,body,created_at,ip_hash) VALUES ('guestbook','甲','一','2026-10-20','ip'),('guestbook','乙','二','2026-10-20','ip')");
    s.sqlite.prepare("INSERT INTO replies (slug,parent_id,reply_to,name,body,created_at,ip_hash) VALUES ('guestbook',2,'','丙','回复','2026-10-20','ip')").run();
    for (const [kind, comment] of [['comment', 1], ['comment', 2], ['reply', 1]]) s.sqlite.prepare('INSERT INTO comment_authors (kind,comment_id,user_id) VALUES (?,?,?)').run(kind, comment, id);
    s.sqlite.exec('DELETE FROM comments WHERE id = 1; DELETE FROM replies WHERE id = 1');
    expect(s.sqlite.prepare('SELECT kind,comment_id FROM comment_authors').all()).toEqual([{ kind: 'comment', comment_id: 2 }]);
  });

  it('修改密码和重生恢复码都撤销旧会话；新恢复码仍能恢复', async () => {
    const s = setup();
    const registered = await s.call('register', { username: 'reader', password: PASSWORD });
    const changed = await s.call('password', { password: PASSWORD, newPassword: PASSWORD + '改' });
    expect(changed.response.status).toBe(200);
    expect(changed.data.recoveryCode).not.toBe(registered.data.recoveryCode);
    expect(await (await s.current()).json()).toEqual({ user: null });
    expect((await s.call('login', { username: 'reader', password: PASSWORD })).response.status).toBe(401);
    expect((await s.call('login', { username: 'reader', password: PASSWORD + '改' })).response.status).toBe(200);
    const rotated = await s.call('recovery', { password: PASSWORD + '改' });
    expect(rotated.response.status).toBe(200);
    expect(await (await s.current()).json()).toEqual({ user: null });
    expect((await s.call('recover', { username: 'reader', password: PASSWORD, recoveryCode: changed.data.recoveryCode })).response.status).toBe(401);
    expect((await s.call('recover', { username: 'reader', password: PASSWORD, recoveryCode: rotated.data.recoveryCode })).response.status).toBe(200);
  });
  it('鉴权后会话被另一请求撤销，资料写入须再次检查会话且不能成功', async () => {
    const s = setup();
    await s.call('register', { username: 'reader', password: PASSWORD });
    const original = s.env.COMMENTS_DB.prepare;
    s.env.COMMENTS_DB.prepare = ((sql: string) => {
      const wrap = (statement: any): any => ({ ...statement, bind: (...args: unknown[]) => wrap(statement.bind(...args)), first: async () => {
        const value = await statement.first();
        if (sql.includes('JOIN visitor_sessions')) s.sqlite.prepare('DELETE FROM visitor_sessions').run();
        return value;
      } });
      return wrap(original(sql));
    }) as typeof original;
    const response = await s.call('profile', { nickname: '不应写入', bio: '' });
    expect(response.response.status).toBe(401);
    expect(s.sqlite.prepare('SELECT nickname FROM visitor_accounts').get()?.nickname).not.toBe('不应写入');
  });
  it('注册后 Cookie 登录，公开名片只返回公开资料，登录名与凭据不外泄', async () => {
    const s = setup();
    const registered = await s.call('register', { username: 'reader-one', password: PASSWORD });
    expect(registered.response.status).toBe(201);
    expect(registered.response.headers.get('Set-Cookie')).toMatch(/__Host-nc_session=.*HttpOnly.*Secure.*SameSite=Lax/);
    expect(registered.response.headers.get('Cache-Control')).toBe('no-store');
    expect(registered.data.recoveryCode).toMatch(/^[a-f0-9]{64}$/);
    const privateData = await (await s.current()).json() as any;
    expect(privateData.user.username).toBe('reader-one');
    const publicResponse = await personGet({ request: new Request(`https://example.test/api/people?id=${privateData.user.id}`), env: s.env } as never);
    const publicText = await publicResponse.text();
    expect(publicResponse.status).toBe(200);
    expect(publicText).not.toMatch(/reader-one|password|recovery|session|hash/);
    expect(JSON.parse(publicText).user.id).toBe(privateData.user.id);
    const row = s.sqlite.prepare('SELECT password_hash, recovery_hash FROM visitor_accounts').get()!;
    expect(row.password_hash).not.toContain(PASSWORD);
    expect(row.recovery_hash).not.toBe(registered.data.recoveryCode);
  });

  it('匿名读取无账户，不接受跨站注册，也不把第一个注册者当站主', async () => {
    const s = setup();
    expect(await (await s.current()).json()).toEqual({ user: null });
    expect((await s.call('register', { username: 'reader', password: PASSWORD }, { origin: 'https://evil.test' })).response.status).toBe(403);
    const r = await s.call('register', { username: 'reader', password: PASSWORD, isOwner: true });
    expect(r.data.user.isOwner).toBe(false);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_accounts').get()?.n).toBe(1);
  });

  it('并发同名注册只产生一个账户，登录名大小写归一且独立于昵称', async () => {
    const s = setup();
    const rs = await Promise.all([
      s.call('register', { username: 'Reader', password: PASSWORD }),
      s.call('register', { username: 'reader', password: PASSWORD }),
    ]);
    expect(rs.map(r => r.response.status).sort()).toEqual([201, 409]);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_accounts').get()?.n).toBe(1);
    expect((await s.call('login', { username: 'READER', password: PASSWORD })).response.status).toBe(200);
  });

  it('密码错误与账号不存在给相同错误，弱密码和超长密码不能注册', async () => {
    const s = setup();
    await s.call('register', { username: 'reader', password: PASSWORD });
    const wrong = await s.call('login', { username: 'reader', password: '这是错误的密码但长度足够12345' });
    const missing = await s.call('login', { username: 'missing', password: PASSWORD });
    expect(wrong.response.status).toBe(401);
    expect(missing.data).toEqual(wrong.data);
    for (const password of ['short', 'a'.repeat(129)]) {
      expect((await s.call('register', { username: 'other', password }, { ip: '192.0.2.2' })).response.status).toBe(400);
    }
  });

  it('资料只能改自己，站主昵称保留，站主标识只认服务端账户 ID', async () => {
    const s = setup();
    const r = await s.call('register', { username: 'reader', password: PASSWORD });
    const id = r.data.user.id;
    expect((await s.call('profile', { nickname: '北杉', bio: '' })).response.status).toBe(400);
    s.env.OWNER_USER_ID = id;
    const updated = await s.call('profile', { id: 'other-person', nickname: '北杉', bio: '<script>纯文本</script>', avatar: 'helix', isOwner: false });
    expect(updated.response.status).toBe(200);
    expect(updated.data.user.id).toBe(id);
    expect(updated.data.user.isOwner).toBe(true);
    expect(updated.data.user.bio).toBe('<script>纯文本</script>');
    expect(updated.data.user.avatarUrl).toBe('/avatars/helix.svg');
  });

  it('恢复码一次性使用，并发恢复最多一次成功；所有旧会话撤销', async () => {
    const s = setup();
    const r = await s.call('register', { username: 'reader', password: PASSWORD });
    const oldCookie = r.cookie;
    const rs = await Promise.all([1, 2].map(() => s.call('recover', { username: 'reader', recoveryCode: r.data.recoveryCode, password: PASSWORD + '新' }, { cookie: '' })));
    expect(rs.filter(r => r.response.status === 200)).toHaveLength(1);
    const current = await onRequestGet({ request: new Request('https://example.test/api/account', { headers: { Cookie: oldCookie } }), env: s.env } as never);
    expect(await current.json()).toEqual({ user: null });
    expect((await s.call('login', { username: 'reader', password: PASSWORD })).response.status).toBe(401);
    expect((await s.call('login', { username: 'reader', password: PASSWORD + '新' })).response.status).toBe(200);
    expect((await s.call('recover', { username: 'reader', recoveryCode: r.data.recoveryCode, password: PASSWORD }, { cookie: '' })).response.status).toBe(401);
  });

  it('注销需要当前密码，删除凭据会话与资料；旧留言保留且解除关联', async () => {
    const s = setup();
    const r = await s.call('register', { username: 'reader', password: PASSWORD });
    s.sqlite.prepare("INSERT INTO comments (slug,name,body,created_at,ip_hash) VALUES ('guestbook','旧名字','原文','2026-10-20','ip')").run();
    s.sqlite.prepare("INSERT INTO comment_authors (kind,comment_id,user_id) VALUES ('comment',1,?)").run(r.data.user.id);
    expect((await s.call('delete', { password: 'wrong' })).response.status).toBe(401);
    expect((await s.call('delete', { password: PASSWORD })).response.status).toBe(200);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_accounts').get()?.n).toBe(0);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_sessions').get()?.n).toBe(0);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_authors').get()?.n).toBe(0);
    expect(s.sqlite.prepare('SELECT name,body FROM comments').get()).toEqual({ name: '旧名字', body: '原文' });
  });

  it('同一 IP 注册限额由数据库原子累计，退出令牌和过期令牌不能继续使用', async () => {
    const s = setup();
    const first = await s.call('register', { username: 'reader-one', password: PASSWORD });
    await s.call('logout');
    const previous = await onRequestGet({ request: new Request('https://example.test/api/account', { headers: { Cookie: first.cookie } }), env: s.env } as never);
    expect(await previous.json()).toEqual({ user: null });
    await s.call('register', { username: 'reader-two', password: PASSWORD });
    s.sqlite.prepare('UPDATE visitor_sessions SET expires_at = 0').run();
    expect(await (await s.current()).json()).toEqual({ user: null });
    await s.call('register', { username: 'reader-three', password: PASSWORD });
    expect((await s.call('register', { username: 'reader-four', password: PASSWORD })).response.status).toBe(429);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_accounts').get()?.n).toBe(3);
    expect(s.sqlite.prepare("SELECT hits FROM visitor_rate_limits WHERE scope='account:register:ip'").get()?.hits).toBe(3);
  });
});
