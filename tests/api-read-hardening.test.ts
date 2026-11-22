import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { visitorDatabase } from './_visitor-db';
import { onRequestGet as commentsGet } from '../functions/api/comments';
import { onRequestGet as likesGet } from '../functions/api/likes';
import { onRequestGet as statsGet } from '../functions/api/stats';
import { onRequestGet as peopleGet } from '../functions/api/people';
import { onRequestGet as avatarsGet } from '../functions/api/avatars';
import { onRequestGet as noticesGet } from '../functions/api/notices';
import { onRequestGet as accountGet, onRequestPost as accountPost } from '../functions/api/account';
import { REPLIES_LIMIT } from '../functions/api/_lib/comments-core';

const close: (() => void)[] = [];
afterEach(() => close.splice(0).forEach(fn => fn()));

function setup() {
  const s = visitorDatabase();
  close.push(() => s.sqlite.close());
  s.sqlite.exec(readFileSync('migrations/0002_likes_and_visits.sql', 'utf8'));
  s.sqlite.exec(readFileSync('migrations/0013_pageview_totals.sql', 'utf8'));
  let queries = 0;
  const originalPrepare = s.db.prepare;
  s.db.prepare = ((sql: string) => {
    queries += 1;
    return originalPrepare(sql);
  }) as typeof originalPrepare;
  return {
    ...s,
    env: { COMMENTS_DB: s.db, OWNER_USER_ID: '' },
    get queries() { return queries; },
  };
}

describe('公开读接口的查询参数白名单与穿透防护', () => {
  it('未知、越权探测、缓存穿透与重复查询参数全部 400 且 0 次 D1 查询', async () => {
    const id = 'a'.repeat(32);
    const ver = 'b'.repeat(32);
    const cases: Array<[string, (ctx: never) => Promise<Response>, string]> = [
      ['comments 单条带 rnd', commentsGet as never, 'https://example.test/api/comments?slug=guestbook&rnd=123'],
      ['comments 单条带 limit/sort', commentsGet as never, 'https://example.test/api/comments?slug=guestbook&limit=99999&sort=body'],
      ['comments 混用 slug 与 slugs', commentsGet as never, 'https://example.test/api/comments?slugs=guestbook&slug=guestbook'],
      ['comments 重复 slug', commentsGet as never, 'https://example.test/api/comments?slug=guestbook&slug=guestbook'],
      ['comments 非法 comment', commentsGet as never, 'https://example.test/api/comments?slug=guestbook&comment=abc'],
      ['comments 0 号 comment', commentsGet as never, 'https://example.test/api/comments?slug=guestbook&comment=0'],
      ['comments 缺失 slug', commentsGet as never, 'https://example.test/api/comments'],
      ['comments 非法 slug', commentsGet as never, 'https://example.test/api/comments?slug=../../etc'],
      ['likes 未知参数', likesGet as never, 'https://example.test/api/likes?slugs=talk-20260926&rnd=1'],
      ['likes 重复 slugs', likesGet as never, 'https://example.test/api/likes?slugs=talk-20260926&slugs=talk-20260926'],
      ['stats 缓存穿透参数', statsGet as never, 'https://example.test/api/stats?rand=12345'],
      ['people 未知参数', peopleGet as never, `https://example.test/api/people?id=${id}&extra=1`],
      ['avatars 未知参数', avatarsGet as never, `https://example.test/api/avatars?id=${id}&v=${ver}&rnd=1`],
      ['notices 未知参数', noticesGet as never, 'https://example.test/api/notices?before=1&limit=999'],
      ['account GET 未知参数', accountGet as never, 'https://example.test/api/account?debug=1'],
    ];

    for (const [label, handler, url] of cases) {
      const s = setup();
      const response = await handler({ request: new Request(url), env: s.env } as never);
      expect(response.status, label).toBe(400);
      expect(s.queries, `${label} 不应查询 D1`).toBe(0);
    }
  });

  it('comments 和 likes 的超长 slugs 查询返回 400 且不查 D1；未发布合法 slug 直接回空结果', async () => {
    const s = setup();
    const huge = Array.from({ length: 1200 }, (_, i) => `talk-item-${i}`).join(',');
    expect((await commentsGet({ request: new Request(`https://example.test/api/comments?slugs=${huge}`), env: s.env } as never)).status).toBe(400);
    expect((await likesGet({ request: new Request(`https://example.test/api/likes?slugs=${huge}`), env: s.env } as never)).status).toBe(400);

    const unpublished = await commentsGet({ request: new Request('https://example.test/api/comments?slug=unpublished-page-999'), env: s.env } as never);
    expect(unpublished.status).toBe(200);
    expect(await unpublished.json()).toEqual({ comments: [], replies: [] });
    expect(s.queries).toBe(0);
  });

  it(`GET /api/comments 的回复读取受硬上限 ${REPLIES_LIMIT} 保护`, async () => {
    const s = setup();
    s.sqlite.prepare("INSERT INTO comments (slug, name, body, created_at, ip_hash) VALUES ('guestbook', '甲', '顶层', '2026-10-01T00:00:00.000Z', 'h')").run();
    const stmt = s.sqlite.prepare("INSERT INTO replies (slug, parent_id, reply_to, name, body, created_at, ip_hash) VALUES ('guestbook', 1, '', '乙', ?, '2026-10-01T00:01:00.000Z', 'h')");
    for (let i = 0; i < REPLIES_LIMIT + 35; i++) stmt.run(`回复 ${i}`);

    const response = await commentsGet({ request: new Request('https://example.test/api/comments?slug=guestbook'), env: s.env } as never);
    expect(response.status).toBe(200);
    const body = await response.json() as { comments: unknown[]; replies: unknown[] };
    expect(body.comments).toHaveLength(1);
    expect(body.replies).toHaveLength(REPLIES_LIMIT);
  });

  it('账户资料拒绝带尖括号/脚本特征与双向覆写符的昵称，并保留签名中的纯文本转义能力', async () => {
    const s = setup();
    const reg = await accountPost({
      request: new Request('https://example.test/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1', Origin: 'https://example.test', 'CF-Connecting-IP': '192.0.2.88' },
        body: JSON.stringify({ action: 'register', username: 'hardeneduser', password: 'a-very-long-passphrase-for-test' }),
      }),
      env: s.env,
    } as never);
    expect(reg.status).toBe(201);
    const cookie = reg.headers.get('Set-Cookie')!.split(';')[0];
    const callProfile = (nickname: string, bio: string) =>
      accountPost({
        request: new Request('https://example.test/api/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1', Origin: 'https://example.test', Cookie: cookie, 'CF-Connecting-IP': '192.0.2.88' },
          body: JSON.stringify({ action: 'profile', nickname, bio }),
        }),
        env: s.env,
      } as never);

    for (const badNick of ['<script>alert(1)</script>', 'javascript:alert(1)', '正常\u202e逆序']) {
      expect((await callProfile(badNick, '')).status, badNick).toBe(400);
    }
    expect((await callProfile('正常访客', '签名\u202e控制')).status).toBe(400);
    const ok = await callProfile('正常访客', '<script>纯文本</script>');
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { user: { bio: string } }).user.bio).toBe('<script>纯文本</script>');
  });
});
