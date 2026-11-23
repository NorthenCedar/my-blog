import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { visitorDatabase } from './_visitor-db';
import { onRequestGet as commentGet, onRequestPost as commentPost } from '../functions/api/comments';
import { onRequestGet as adminGet } from '../functions/api/admin/comments';
import { onRequestPost as likePost } from '../functions/api/likes';
import { onRequestPost as accountPost } from '../functions/api/account';
import { hashIp } from '../functions/api/_lib/reactions-core';

const close: (() => void)[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); close.splice(0).forEach(fn => fn()); });
const talks: string[] = JSON.parse(readFileSync('functions/api/_generated/comment-targets.json', 'utf8')).talks;
function setup() {
  const s = visitorDatabase(); close.push(() => s.sqlite.close());
  s.sqlite.exec(readFileSync('migrations/0002_likes_and_visits.sql', 'utf8'));
  return { ...s, env: { COMMENTS_DB: s.db, ADMIN_TOKEN: 'local-test-token' } };
}
function request(path: string, payload: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://example.test/api/${path}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers }, body: JSON.stringify(payload) });
}
const comment = { slug: 'guestbook', name: '访客', body: '本地回归' };
const total = (s: ReturnType<typeof setup>) => Number(s.sqlite.prepare('SELECT (SELECT COUNT(*) FROM comments) + (SELECT COUNT(*) FROM replies) AS n').get()?.n);

describe('公开写入的来源、格式和已发布目标', () => {
  it.each(['https://evil.test', 'null'])('拒绝来源 %s，评论和点赞均不落库', async Origin => {
    const s = setup();
    expect((await commentPost({ request: request('comments', comment, { Origin }), env: s.env } as never)).status).toBe(403);
    expect((await likePost({ request: request('likes', { slug: talks[0] }, { Origin }), env: s.env } as never)).status).toBe(403);
    expect(total(s)).toBe(0);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM like_votes').get()?.n).toBe(0);
  });
  it.each(['text/plain', 'application/jsonp', 'application/json-anything'])('拒绝非 JSON MIME %s', async mime => {
    const s = setup();
    for (const [path, fn, payload] of [['comments', commentPost, comment], ['likes', likePost, { slug: talks[0] }], ['account', accountPost, { action: 'logout' }]] as const) {
      const response = await fn({ request: request(path, payload, { 'Content-Type': mime, Origin: 'https://example.test', 'X-NC-Request': '1' }), env: s.env } as never);
      expect(response.status).toBe(415);
    }
    expect(total(s)).toBe(0);
  });
  it('无 Origin 的正确 JSON 非浏览器可发表，cross-site Fetch Metadata 则拒绝', async () => {
    const s = setup();
    expect((await commentPost({ request: request('comments', comment), env: s.env } as never)).status).toBe(201);
    expect((await likePost({ request: request('likes', { slug: talks[0] }), env: s.env } as never)).status).toBe(201);
    expect((await commentPost({ request: request('comments', comment, { 'Sec-Fetch-Site': 'cross-site' }), env: s.env } as never)).status).toBe(403);
    expect(total(s)).toBe(1);
  });
  it('同源 JSON charset 正常；过长、不存在及未发布页面均不能制造记录', async () => {
    const s = setup();
    expect((await commentPost({ request: request('comments', comment, { Origin: 'https://example.test', 'Content-Type': 'application/json; charset=utf-8' }), env: s.env } as never)).status).toBe(201);
    for (const slug of ['a'.repeat(4096), 'missing-page', 'ai-built-this-blog']) {
      expect((await commentPost({ request: request('comments', { ...comment, slug }), env: s.env } as never)).status).toBe(400);
    }
    expect((await likePost({ request: request('likes', { slug: 'talk-does-not-exist' }), env: s.env } as never)).status).toBe(400);
    expect(total(s)).toBe(1);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM likes').get()?.n).toBe(0);
  });
  it('Fetch Metadata 表明来自同站的其他来源时不接受公开写入', async () => {
    const s = setup();
    const headers = { 'Sec-Fetch-Site': 'same-site' };
    expect((await commentPost({ request: request('comments', comment, headers), env: s.env } as never)).status).toBe(403);
    expect((await likePost({ request: request('likes', { slug: talks[0] }, headers), env: s.env } as never)).status).toBe(403);
    expect(total(s)).toBe(0);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM like_votes').get()?.n).toBe(0);
  });
  it('声明长度超过限额时直接返回 413，保留未读取的正文', async () => {
    const s = setup();
    const payload = { ...comment, padding: '好'.repeat(6000) };
    const length = new TextEncoder().encode(JSON.stringify(payload)).length;
    const req = request('comments', payload, { 'Content-Length': String(length) });
    expect((await commentPost({ request: req, env: s.env } as never)).status).toBe(413);
    expect(req.bodyUsed).toBe(false);
    expect(total(s)).toBe(0);
  });
  it.each(['comments', 'likes'])('%s 在无 Content-Length 的流式请求超限时停止读取并不写入', async path => {
    const s = setup(); let cancelled = false;
    const bytes = new TextEncoder().encode(JSON.stringify({ ...comment, slug: path === 'likes' ? talks[0] : 'guestbook', padding: '好'.repeat(10000) }));
    let offset = 0;
    const body = new ReadableStream({ pull(controller) { if (offset >= bytes.length) return controller.close(); controller.enqueue(bytes.slice(offset, offset + 1024)); offset += 1024; }, cancel() { cancelled = true; } });
    const req = new Request(`https://example.test/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, duplex: 'half' } as RequestInit);
    const response = await (path === 'likes' ? likePost : commentPost)({ request: req, env: s.env } as never);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(total(s)).toBe(0);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM like_votes').get()?.n).toBe(0);
  });
  it('账户保留头像请求上限，超限前不执行任何账户操作', async () => {
    const s = setup();
    const response = await accountPost({ request: request('account', { action: 'logout', padding: 'a'.repeat(145 * 1024) }, { Origin: 'https://example.test', 'X-NC-Request': '1' }), env: s.env } as never);
    expect(response.status).toBe(413);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_rate_limits').get()?.n).toBe(0);
  });
  it('非头像账户请求按 16 KiB 实际正文限额校验，超限不占账户配额', async () => {
    const s = setup();
    const req = request('account', { action: 'logout', padding: '字'.repeat(6000) }, { Origin: 'https://example.test', 'X-NC-Request': '1' });
    expect((await accountPost({ request: req, env: s.env } as never)).status).toBe(413);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_rate_limits').get()?.n).toBe(0);
  });
  it('已发布文章和真实说说保持可留言；蜜罐假成功不占配额', async () => {
    const s = setup();
    expect((await commentPost({ request: request('comments', { ...comment, website: 'robot' }), env: s.env } as never)).status).toBe(201);
    expect(total(s)).toBe(0);
    for (const slug of ['how-this-blog-was-built', talks[0]]) {
      expect((await commentPost({ request: request('comments', { ...comment, slug }), env: s.env } as never)).status).toBe(201);
    }
    expect(total(s)).toBe(2);
  });
});

describe('D1 单条 100 参数边界与排序', () => {
  it.each([99, 100, 101, 200])('%i 条主留言的公开和管理列表完整返回所有回复', async n => {
    const s = setup();
    for (let i = 1; i <= n; i++) {
      s.sqlite.prepare('INSERT INTO comments(slug,name,body,created_at,ip_hash) VALUES (?,?,?,?,?)').run('guestbook', '访客', `主${i}`, '2026-10-20', 'fixture');
      s.sqlite.prepare('INSERT INTO replies(slug,parent_id,reply_to,name,body,created_at,ip_hash) VALUES (?,?,?,?,?,?,?)').run('guestbook', i, '', '访客', `复${i}`, '2026-10-20', 'fixture');
    }
    const prepare = s.db.prepare;
    s.db.prepare = ((sql: string) => {
      const wrap = (stmt: any): any => ({ ...stmt, bind(...args: unknown[]) {
        if (args.length > 100) throw new Error(`D1 参数超过100：${args.length}`);
        return wrap(stmt.bind(...args));
      } });
      return wrap(prepare(sql));
    }) as typeof prepare;
    const data = await (await commentGet({ request: new Request('https://example.test/api/comments?slug=guestbook'), env: s.env } as never)).json() as any;
    expect(data.comments).toHaveLength(n); expect(data.replies).toHaveLength(n);
    expect(data.comments[0].id).toBe(n); expect(data.replies.map((r: any) => r.id)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    const admin = await (await adminGet({ request: new Request('https://example.test/api/admin/comments', { headers: { Authorization: 'Bearer local-test-token' } }), env: s.env } as never)).json() as any;
    expect(admin.items).toHaveLength(n); expect(admin.items.flatMap((c: any) => c.replies)).toHaveLength(n);
  });
  it('100 个批量目标含回复的计数与零值完整返回', async () => {
    const s = setup(); const slugs = Array.from({ length: 100 }, (_, i) => `page-${i}`);
    s.sqlite.exec("INSERT INTO comments(slug,name,body,created_at,ip_hash) VALUES ('page-50','甲','文','2026','ip'); INSERT INTO replies(slug,parent_id,reply_to,name,body,created_at,ip_hash) VALUES ('page-50',1,'','乙','复','2026','ip')");
    const prepare = s.db.prepare;
    s.db.prepare = ((sql: string) => { const wrap = (stmt: any): any => ({ ...stmt, bind(...args: unknown[]) { if (args.length > 100) throw new Error('D1 参数超限'); return wrap(stmt.bind(...args)); } }); return wrap(prepare(sql)); }) as typeof prepare;
    const data = await (await commentGet({ request: new Request(`https://example.test/api/comments?slugs=${slugs.join(',')}`), env: s.env } as never)).json() as any;
    expect(Object.keys(data.counts)).toHaveLength(100); expect(data.counts['page-50']).toBe(2); expect(data.counts['page-99']).toBe(0);
  });
});

describe('并发额度与重复点赞', () => {
  it('公共限流回收其他 IP 的过期记录，账户长窗口保持原样', async () => {
    const s = setup();
    const old = Date.now() - 60001;
    const insert = s.sqlite.prepare('INSERT INTO visitor_rate_limits(scope,key_hash,window_start,hits) VALUES (?,?,?,1)');
    insert.run('comments:ip', 'a-previous-ip', old);
    insert.run('likes:ip', 'a-previous-ip', old);
    insert.run('account:register:ip', 'a-previous-ip', old);
    expect((await commentPost({ request: request('comments', comment), env: s.env } as never)).status).toBe(201);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_rate_limits WHERE scope=?').get('comments:ip')?.n).toBe(1);
    expect((await likePost({ request: request('likes', { slug: talks[0] }), env: s.env } as never)).status).toBe(201);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM visitor_rate_limits WHERE scope=?').get('likes:ip')?.n).toBe(1);
    expect(s.sqlite.prepare('SELECT window_start,hits FROM visitor_rate_limits WHERE scope=?').get('account:register:ip')).toEqual({ window_start: old, hits: 1 });
  });
  it('同 IP 的并发主留言和回复合计只允许两条，非法父目标不占额度', async () => {
    const s = setup();
    s.sqlite.exec("INSERT INTO comments(slug,name,body,created_at,ip_hash) VALUES ('guestbook','甲','父','2020','fixture')");
    expect((await commentPost({ request: request('comments', { ...comment, parentId: 999 }), env: s.env } as never)).status).toBe(400);
    // 强制旧的“读计数→写入”路径并发读到同一快照；新原子额度无需这个屏障。
    let arrived = 0; let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const prepare = s.db.prepare;
    s.db.prepare = ((sql: string) => {
      const wrap = (stmt: any): any => ({ ...stmt, bind: (...args: unknown[]) => wrap(stmt.bind(...args)), all: async () => {
        const result = await stmt.all();
        if (sql.includes('AS n') && sql.includes('ip_hash')) { if (++arrived === 8) release(); await barrier; }
        return result;
      } });
      return wrap(prepare(sql));
    }) as typeof prepare;
    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => commentPost({ request: request('comments', { ...comment, parentId: i % 2 }), env: s.env } as never)));
    expect(responses.filter(r => r.status === 201)).toHaveLength(2); expect(responses.filter(r => r.status === 429)).toHaveLength(6); expect(total(s)).toBe(3);
  });
  it('跨分钟边界仍按最近60秒合计，窗口过后恢复', async () => {
    const s = setup(); const start = Date.parse('2026-10-21T00:00:59.900Z');
    vi.useFakeTimers(); vi.setSystemTime(start);
    expect((await commentPost({ request: request('comments', comment), env: s.env } as never)).status).toBe(201);
    expect((await commentPost({ request: request('comments', comment), env: s.env } as never)).status).toBe(201);
    vi.setSystemTime(start + 200);
    expect((await commentPost({ request: request('comments', comment), env: s.env } as never)).status).toBe(429);
    vi.setSystemTime(start + 60001);
    expect((await commentPost({ request: request('comments', comment), env: s.env } as never)).status).toBe(201);
  });
  it('并发同条只计一票，额度耗尽后重复请求仍幂等；新目标返回429', async () => {
    const s = setup();
    s.sqlite.prepare('INSERT INTO visitor_rate_limits(scope,key_hash,window_start,hits) VALUES (?,?,?,29)').run('likes:ip', await hashIp('192.0.2.1'), Date.now());
    const responses = await Promise.all(Array.from({ length: 6 }, () => likePost({ request: request('likes', { slug: talks[0] }), env: s.env } as never)));
    expect(responses.map(r => r.status).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    expect(s.sqlite.prepare('SELECT count FROM likes WHERE slug=?').get(talks[0])?.count).toBe(1);
    expect(s.sqlite.prepare('SELECT SUM(hits) AS n FROM visitor_rate_limits WHERE scope=?').get('likes:ip')?.n).toBe(30);
    expect((await likePost({ request: request('likes', { slug: talks[1] }), env: s.env } as never)).status).toBe(429);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM like_votes').get()?.n).toBe(1);
  });
  it('两个真实目标并发争抢第30个点赞额度，只写入一条新票', async () => {
    const s = setup();
    s.sqlite.prepare('INSERT INTO visitor_rate_limits(scope,key_hash,window_start,hits) VALUES (?,?,?,29)').run('likes:ip', await hashIp('192.0.2.1'), Date.now());
    const responses = await Promise.all(talks.slice(0, 2).map(slug => likePost({ request: request('likes', { slug }), env: s.env } as never)));
    expect(responses.map(r => r.status).sort()).toEqual([201, 429]);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM like_votes').get()?.n).toBe(1);
    expect(s.sqlite.prepare('SELECT SUM(count) AS n FROM likes').get()?.n).toBe(1);
  });
  it('匿名与账户身份共用评论额度，不可靠切换身份绕过', async () => {
    const s = setup();
    const headers = { Origin: 'https://example.test', 'X-NC-Request': '1' };
    const registered = await accountPost({ request: request('account', { action: 'register', username: 'reader', email: 'reader@example.com', password: 'a-long-password-for-this-account' }, headers), env: s.env } as never);
    expect(registered.status).toBe(201);
    const Cookie = registered.headers.get('Set-Cookie')!.split(';')[0];
    const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => commentPost({ request: request('comments', { ...comment, identity: i % 2 ? 'account' : 'anonymous' }, { ...headers, Cookie }), env: s.env } as never)));
    expect(responses.filter(r => r.status === 201)).toHaveLength(2);
    expect(responses.filter(r => r.status === 429)).toHaveLength(4);
    expect(total(s)).toBe(2);
  });
  it('点赞批次中途数据库失败不能留下票与计数不一致', async () => {
    const s = setup();
    s.sqlite.exec("CREATE TRIGGER fail_like BEFORE INSERT ON likes BEGIN SELECT RAISE(ABORT, 'local test failure'); END");
    await expect(likePost({ request: request('likes', { slug: talks[0] }), env: s.env } as never)).rejects.toThrow('local test failure');
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM like_votes').get()?.n).toBe(0);
  });
});
