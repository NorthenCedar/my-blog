import { afterEach, describe, expect, it } from 'vitest';
import { visitorDatabase } from './_visitor-db';
import { onRequestPost as accountPost } from '../functions/api/account';
import { onRequestGet, onRequestPost } from '../functions/api/comments';

const close: (() => void)[] = [];
afterEach(() => close.splice(0).forEach(fn => fn()));
function setup() {
  const { sqlite, db } = visitorDatabase(); close.push(() => sqlite.close());
  const env = { COMMENTS_DB: db, OWNER_USER_ID: '' };
  const request = (path: string, data: unknown, cookie = '') => new Request(`https://example.test/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1', Origin: 'https://example.test', Cookie: cookie, 'CF-Connecting-IP': '192.0.2.10' }, body: JSON.stringify(data) });
  return { sqlite, env, request };
}
describe('评论的账户身份与匿名兼容', () => {
  it('鉴权后会话撤销，评论事务不得留下匿名记录或错误的作者关联', async () => {
    const s = setup();
    const reg = await accountPost({ request: s.request('account', { action: 'register', username: 'reader', password: 'a-long-password-for-this-account' }), env: s.env } as never);
    const cookie = reg.headers.get('Set-Cookie')!.split(';')[0];
    const original = s.env.COMMENTS_DB.prepare;
    s.env.COMMENTS_DB.prepare = ((sql: string) => {
      const wrap = (statement: any): any => ({ ...statement, bind: (...args: unknown[]) => wrap(statement.bind(...args)), first: async () => {
        const value = await statement.first();
        if (sql.includes('JOIN visitor_sessions')) s.sqlite.prepare('DELETE FROM visitor_sessions').run();
        return value;
      } });
      return wrap(original(sql));
    }) as typeof original;
    const response = await onRequestPost({ request: s.request('comments', { slug: 'guestbook', body: '不应发表', identity: 'account' }, cookie), env: s.env } as never);
    expect(response.status).toBe(401);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get()?.n).toBe(0);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_authors').get()?.n).toBe(0);
  });
  it('尚未执行账户迁移时，既有匿名留言仍可读取', async () => {
    const { sqlite, db } = visitorDatabase(false); close.push(() => sqlite.close());
    sqlite.prepare("INSERT INTO comments (slug,name,body,created_at,ip_hash) VALUES ('guestbook','旧访客','仍然可见','2026-10-19','old')").run();
    const response = await onRequestGet({ request: new Request('https://example.test/api/comments?slug=guestbook'), env: { COMMENTS_DB: db } } as never);
    expect(response.status).toBe(200);
    expect((await response.json() as any).comments[0]).toMatchObject({ name: '旧访客', body: '仍然可见', author: null });
  });
  it('匿名旧客户端照常留言，伪造 author_id 不能认领身份；历史记录保留', async () => {
    const s = setup();
    const r = await onRequestPost({ request: s.request('comments', { slug: 'guestbook', name: '北杉', body: '匿名原文', author_id: 'pretend-owner' }), env: s.env } as never);
    expect(r.status).toBe(201);
    const page = await onRequestGet({ request: new Request('https://example.test/api/comments?slug=guestbook'), env: s.env } as never);
    const data = await page.json() as any;
    expect(data.comments[0].name).toBe('北杉');
    expect(data.comments[0].author).toBeNull();
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_authors').get()?.n).toBe(0);
  });
  it('登录评论和回复从会话取名字与作者，改资料后历史关联更新，同名匿名不被认领', async () => {
    const s = setup();
    s.sqlite.prepare("INSERT INTO comments (slug,name,body,created_at,ip_hash) VALUES ('guestbook','访客','旧匿名','2026-10-19','old')").run();
    const reg = await accountPost({ request: s.request('account', { action: 'register', username: 'reader', password: 'a-long-password-for-this-account' }), env: s.env } as never);
    const user = (await reg.json() as any).user;
    const cookie = reg.headers.get('Set-Cookie')!.split(';')[0];
    const post = await onRequestPost({ request: s.request('comments', { slug: 'guestbook', name: '伪造名', body: '账户原文', identity: 'account' }, cookie), env: s.env } as never);
    expect(post.status).toBe(201);
    expect((await post.json() as any).comment.name).toBe(user.nickname);
    const reply = await onRequestPost({ request: s.request('comments', { slug: 'guestbook', name: '伪造名', body: '账户回复', parentId: 1, identity: 'account' }, cookie), env: s.env } as never);
    expect(reply.status).toBe(201);
    s.sqlite.prepare("UPDATE visitor_accounts SET nickname = '新名字', bio = '新签名' WHERE id = ?").run(user.id);
    const data = await (await onRequestGet({ request: new Request('https://example.test/api/comments?slug=guestbook'), env: s.env } as never)).json() as any;
    expect(data.comments[0].name).toBe('新名字');
    expect(data.comments[0].author.bio).toBe('新签名');
    expect(data.comments[1].author).toBeNull();
    expect(data.replies[0].author.id).toBe(user.id);
  });
  it('会话失效不能悄悄按匿名发表，登录者主动选匿名则不关联账户', async () => {
    const s = setup();
    const expired = await onRequestPost({ request: s.request('comments', { slug: 'guestbook', name: '访客', body: '草稿', identity: 'account' }), env: s.env } as never);
    expect(expired.status).toBe(401);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get()?.n).toBe(0);
    const reg = await accountPost({ request: s.request('account', { action: 'register', username: 'reader', password: 'a-long-password-for-this-account' }), env: s.env } as never);
    const cookie = reg.headers.get('Set-Cookie')!.split(';')[0];
    const r = await onRequestPost({ request: s.request('comments', { slug: 'guestbook', name: '只想匿名', body: '匿名原文', identity: 'anonymous' }, cookie), env: s.env } as never);
    expect(r.status).toBe(201);
    expect((await r.json() as any).comment.author).toBeNull();
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_authors').get()?.n).toBe(0);
  });
});
