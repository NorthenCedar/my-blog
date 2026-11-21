import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { visitorDatabase } from './_visitor-db';
import { onRequestPost as postComment } from '../functions/api/comments';
import { onRequestGet, onRequestPost } from '../functions/api/notices';
import { recordCommentNotice, recordReplyNotice } from '../functions/api/_lib/notices';

const closers: (() => void)[] = [];
afterEach(() => { closers.splice(0).forEach(close => close()); vi.restoreAllMocks(); });
const migration = 'migrations/0010_owner_notices.sql';

function setup(modern = true) {
  const { sqlite, db } = visitorDatabase();
  closers.push(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0005_reply_targets.sql', '0006_reply_notices.sql']) sqlite.exec(readFileSync(`migrations/${name}`, 'utf8'));
  if (modern) sqlite.exec(readFileSync(migration, 'utf8'));
  const env = { COMMENTS_DB: db, OWNER_USER_ID: 'owner' };
  const tokens = { owner: 'a'.repeat(64), reader: 'b'.repeat(64), other: 'c'.repeat(64) };
  for (const [id, token] of Object.entries(tokens)) {
    sqlite.prepare('INSERT INTO visitor_accounts(id,username,nickname,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,?)')
      .run(id, id, id === 'owner' ? '站主' : id, '测试密码', '恢复摘要', '2026-11-01');
    sqlite.prepare('INSERT INTO visitor_sessions(token_hash,user_id,auth_version,expires_at) VALUES(?,?,0,?)')
      .run(createHash('sha256').update(token).digest('hex'), id, Date.now() + 86400000);
  }
  let ip = 0;
  const request = (path: string, data?: unknown, user?: keyof typeof tokens) => new Request(`https://example.test/api/${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1', Origin: 'https://example.test',
      Cookie: user ? `__Host-nc_session=${tokens[user]}` : '', 'CF-Connecting-IP': `192.0.2.${++ip}` },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const publish = async (data: Record<string, unknown>, user?: keyof typeof tokens) => {
    const response = await postComment({ env, request: request('comments', { slug: 'guestbook', name: '匿名读者', body: '一条新消息', ...data, ...(user ? { identity: 'account' } : {}) }, user) } as never);
    expect(response.status).toBe(201);
    return (await response.json() as any).comment;
  };
  const notices = async (user?: keyof typeof tokens, query = '') => {
    const response = await onRequestGet({ env, request: request(`notices${query}`, undefined, user) } as never);
    expect(response.status).toBe(200);
    return response.json() as Promise<any>;
  };
  return { sqlite, db, env, request, publish, notices };
}

describe('站主的全站消息提醒', () => {
  it.each(['guestbook', 'my-python-memorandum', 'talk-20260926'])('%s 的匿名和账户新评论都只通知站主', async slug => {
    const s = setup();
    const anonymous = await s.publish({ slug, author_id: 'owner', isOwner: true });
    const account = await s.publish({ slug }, 'reader');
    const owner = await s.notices('owner');
    expect(owner).toMatchObject({ signedIn: true, isOwner: true, unread: 2 });
    expect(owner.items.map((n: any) => [n.slug, n.parentId, n.kind, n.replyId])).toEqual([
      [slug, account.id, 'comment', null], [slug, anonymous.id, 'comment', null],
    ]);
    expect(owner.items[0].href).toBe(slug === 'guestbook' ? `/guestbook/?comment=${account.id}#comment-${account.id}`
      : slug === 'talk-20260926' ? `/talks/?comment=${account.id}#c-talk-20260926` : `/posts/my-python-memorandum/?comment=${account.id}#comment-${account.id}`);
    expect(owner.items[0].label).toBe(slug === 'guestbook' ? '留言板 · 新留言'
      : slug === 'talk-20260926' ? '说说评论 · 新评论' : '文章评论 · 新评论');
    expect(await s.notices('reader')).toMatchObject({ isOwner: false, unread: 0, items: [] });
    expect(await s.notices()).toMatchObject({ signedIn: false, unread: 0, items: [] });
  });

  it('回复别人时同时通知被回复者和站主，每人恰好一条，保留准确目标', async () => {
    const s = setup();
    const parent = await s.publish({}, 'reader');
    const first = await s.publish({ parentId: parent.id }, 'other');
    const second = await s.publish({ parentId: parent.id, replyTarget: { kind: 'reply', id: first.id } });
    expect((await s.notices('owner')).items).toHaveLength(3);
    expect((await s.notices('reader')).items.map((n: any) => n.replyId)).toEqual([first.id]);
    expect((await s.notices('reader')).items[0].href).toBe(`/guestbook/?comment=${parent.id}#reply-${first.id}`);
    expect((await s.notices('other')).items.map((n: any) => n.replyId)).toEqual([second.id]);
    expect(s.sqlite.prepare('SELECT target_kind,target_id FROM reply_targets WHERE reply_id=?').get(second.id))
      .toEqual({ target_kind: 'reply', target_id: first.id });
  });

  it('匿名楼层下的匿名回复、访客自回也通知站主，访客不自收提醒', async () => {
    const s = setup();
    const anonymous = await s.publish({});
    await s.publish({ parentId: anonymous.id });
    const parent = await s.publish({}, 'reader');
    await s.publish({ parentId: parent.id }, 'reader');
    expect((await s.notices('owner')).unread).toBe(4);
    expect((await s.notices('reader')).items).toEqual([]);
  });

  it('直接回复站主时不重复投递；站主自己发评论和回复不自收，仍通知访客', async () => {
    const s = setup();
    const parent = await s.publish({}, 'owner');
    expect((await s.notices('owner')).items).toEqual([]);
    const reply = await s.publish({ parentId: parent.id }, 'reader');
    const options = { slug: 'guestbook', parentId: parent.id, replyId: reply.id, target: { kind: 'comment' as const, id: parent.id }, actorName: 'reader', actorId: 'reader', body: '重试' };
    await recordReplyNotice(s.env as never, options);
    expect((await s.notices('owner')).items).toHaveLength(1);
    await s.publish({ parentId: parent.id }, 'owner');
    await s.publish({ parentId: parent.id, replyTarget: { kind: 'reply', id: reply.id } }, 'owner');
    expect((await s.notices('owner')).items).toHaveLength(1);
    expect((await s.notices('reader')).items).toHaveLength(1);
  });

  it('站主登录后主动匿名发表也不自收，匿名身份仍不关联到账户', async () => {
    const s = setup();
    const parent = await s.publish({}, 'owner');
    for (const parentId of [0, parent.id]) {
      const response = await postComment({ env: s.env, request: s.request('comments', {
        slug: 'guestbook', name: '匿名作者', body: '匿名内容', identity: 'anonymous', parentId,
      }, 'owner') } as never);
      expect(response.status).toBe(201);
      expect((await response.json() as any).comment.author).toBeNull();
    }
    expect((await s.notices('owner')).items).toEqual([]);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_authors').get()?.n).toBe(1);
  });

  it('未绑定或绑定不存在的站主账户时不猜人，普通回复提醒照常', async () => {
    for (const configured of ['', 'missing-account']) {
      const s = setup(); s.env.OWNER_USER_ID = configured;
      const parent = await s.publish({}, 'reader');
      await s.publish({ parentId: parent.id }, 'other');
      expect((await s.notices('owner')).items).toEqual([]);
      expect((await s.notices('reader')).unread).toBe(1);
      expect(s.sqlite.prepare('SELECT DISTINCT user_id FROM reply_notices').all()).toEqual([{ user_id: 'reader' }]);
    }
  });

  it('坏页面、无效楼层、蜜罐和被限流的请求不生成虚假通知', async () => {
    const s = setup();
    for (const payload of [{ slug: 'not-a-published-page' }, { parentId: 999 }]) {
      const response = await postComment({ env: s.env, request: s.request('comments', { slug: 'guestbook', name: '访客', body: '测试', ...payload }) } as never);
      expect(response.status).toBe(400);
    }
    await s.publish({ website: 'https://spam.example' });
    const now = Date.now();
    const hash = createHash('sha256').update('203.0.113.1').digest('hex');
    s.sqlite.prepare('INSERT INTO visitor_rate_limits(scope,key_hash,window_start,hits) VALUES(?,?,?,99)').run('comments:ip', hash, now);
    const limited = s.request('comments', { slug: 'guestbook', name: '访客', body: '测试' });
    limited.headers.set('CF-Connecting-IP', '203.0.113.1');
    expect((await postComment({ env: s.env, request: limited } as never)).status).toBe(429);
    expect((await s.notices('owner')).items).toEqual([]);
  });

  it('提醒失败或新迁移未运行时不影响评论发表，旧回复提醒继续可用', async () => {
    const s = setup(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const parent = await s.publish({}, 'reader');
    await s.publish({ parentId: parent.id });
    expect((await s.notices('reader')).unread).toBe(1);
    s.sqlite.exec('DROP TABLE reply_notices');
    await s.publish({});
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get()?.n).toBe(2);
  });

  it('匿名发表时可选的站主会话检查失败也不能阻断正文发表', async () => {
    const s = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    s.sqlite.exec('DROP TABLE visitor_sessions');
    const response = await postComment({ env: s.env, request: s.request('comments', {
      slug: 'guestbook', name: '匿名作者', body: '仍可发表', identity: 'anonymous',
    }, 'owner') } as never);
    expect(response.status).toBe(201);
    expect((await response.json() as any).comment.body).toBe('仍可发表');
  });

  it('顶层通知重试不重复，摘要限制80字，已删除源记录不能重新产生通知', async () => {
    const s = setup();
    const parent = await s.publish({ body: '字'.repeat(100) });
    const options = { slug: 'guestbook', parentId: parent.id, actorName: '匿名读者', actorId: null, body: '字'.repeat(100) };
    await recordCommentNotice(s.env as never, options);
    expect((await s.notices('owner')).items.map((n: any) => n.excerpt)).toEqual(['字'.repeat(80)]);
    const reply = await s.publish({ parentId: parent.id });
    s.sqlite.prepare('DELETE FROM replies WHERE id=?').run(reply.id);
    await recordReplyNotice(s.env as never, { ...options, replyId: reply.id, target: { kind: 'comment', id: parent.id } });
    s.sqlite.prepare('DELETE FROM comments WHERE id=?').run(parent.id);
    await recordCommentNotice(s.env as never, options);
    expect((await s.notices('owner')).items).toEqual([]);
    expect(s.sqlite.prepare('SELECT * FROM reply_targets').all()).toEqual([]);
  });

  it('已读只能修改本人的消息；空的合法 id 集合不会清空整箱', async () => {
    const s = setup();
    const parent = await s.publish({}, 'reader');
    await s.publish({ parentId: parent.id });
    const ownerId = (await s.notices('owner')).items[0].id;
    for (const data of [{ ids: [ownerId] }, { ids: ['坏值', -1] }]) {
      const response = await onRequestPost({ env: s.env, request: s.request('notices', data, 'reader') } as never);
      expect(response.status).toBe(200);
    }
    expect((await s.notices('owner')).unread).toBe(2);
    expect((await s.notices('reader')).unread).toBe(1);
    const response = await onRequestPost({ env: s.env, request: s.request('notices', {}, 'owner') } as never);
    expect((await response.json() as any).unread).toBe(0);
    expect((await s.notices('reader')).unread).toBe(1);
    expect((await onRequestPost({ env: s.env, request: s.request('notices', {}) } as never)).status).toBe(401);
  });

  it('已读请求拒绝非数组及超过信箱容量的列表，不转换其他类型为消息编号', async () => {
    const s = setup();
    await s.publish({});
    const { id } = (await s.notices('owner')).items[0];
    for (const ids of [null, id, Array(101).fill(id)]) {
      const response = await onRequestPost({ env: s.env, request: s.request('notices', { ids }, 'owner') } as never);
      expect(response.status).toBe(400);
    }
    const invalid = await onRequestPost({ env: s.env, request: s.request('notices', { ids: [String(id), true, [id]] }, 'owner') } as never);
    expect(invalid.status).toBe(200);
    expect((await invalid.json() as { unread: number }).unread).toBe(1);
    const selected = await onRequestPost({ env: s.env, request: s.request('notices', { ids: [id] }, 'owner') } as never);
    expect((await selected.json() as { unread: number }).unread).toBe(0);
  });

  it('分页可读到第 21 条；已读当前页不会吞掉未显示和新到的提醒，游标不能串账户', async () => {
    const s = setup();
    for (let i = 0; i < 23; i++) await s.publish({ body: `留言 ${i}` });
    const first = await s.notices('owner');
    expect(first.items).toHaveLength(20);
    expect(first.nextBefore).toBe(first.items[19].id);
    await s.publish({ body: '打开面板后刚到的消息' });
    const marked = await onRequestPost({ env: s.env, request: s.request('notices', { ids: first.items.map((n: any) => n.id) }, 'owner') } as never);
    expect((await marked.json() as any).unread).toBe(4);
    const second = await s.notices('owner', `?before=${first.nextBefore}`);
    expect(second.items.map((n: any) => n.excerpt)).toEqual(['留言 2', '留言 1', '留言 0']);
    expect(second.nextBefore).toBeNull();
    expect((await s.notices('reader', `?before=${first.nextBefore}`)).items).toEqual([]);
  });

  it('同一时间的通知按编号翻页，删除页尾留言后仍能读到更早的消息', async () => {
    const s = setup();
    for (let i = 0; i < 23; i++) await s.publish({ body: `留言 ${i}` });
    s.sqlite.exec("UPDATE reply_notices SET created_at = '2026-11-01T00:00:00.000Z'");
    const first = await s.notices('owner');
    const before = first.nextCursor ?? first.nextBefore;
    s.sqlite.prepare('DELETE FROM comments WHERE id = ?').run(first.items[19].parentId);

    const next = await s.notices('owner', `?before=${encodeURIComponent(before)}`);
    expect(next.items.map((notice: { excerpt: string }) => notice.excerpt)).toEqual(['留言 2', '留言 1', '留言 0']);
    expect(next.nextCursor).toBeNull();
  });

  it('每个账户最多保留最新 100 条，清理旧提醒时保留原评论、回复和其他人的提醒', async () => {
    const s = setup();
    const parent = await s.publish({}, 'reader');
    await s.publish({ parentId: parent.id });
    // 模拟更新前已经积累的消息，并让时间相同以验证稳定次序。
    s.sqlite.exec(`WITH RECURSIVE seed(n) AS (VALUES(100) UNION ALL SELECT n+1 FROM seed WHERE n<203)
      INSERT INTO comments(id,slug,name,body,created_at,ip_hash)
      SELECT n,'guestbook','读者','留言','2026-11-01','test' FROM seed;
      INSERT INTO reply_notices(user_id,slug,parent_id,actor_name,excerpt,created_at)
      SELECT 'owner',slug,id,name,body,created_at FROM comments WHERE id>=100 ORDER BY id;`);

    const ids: number[] = [];
    let cursor: number | null = null;
    do {
      const page = await s.notices('owner', cursor ? `?before=${cursor}` : '');
      ids.push(...page.items.map((item: any) => item.parentId));
      cursor = page.nextBefore;
    } while (cursor);
    expect(ids).toEqual([parent.id, parent.id, ...Array.from({ length: 98 }, (_, i) => 203 - i)]);
    expect((await s.notices('owner')).unread).toBe(100);
    expect((await s.notices('reader')).unread).toBe(1);

    await s.publish({ parentId: parent.id });
    const newComment = await s.publish({ body: '最新留言' });
    expect(s.sqlite.prepare("SELECT COUNT(*) AS n FROM reply_notices WHERE user_id='owner'").get()?.n).toBe(100);
    expect((await s.notices('owner')).items[0].parentId).toBe(newComment.id);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get()?.n).toBe(106);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM replies').get()?.n).toBe(2);
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM reply_targets').get()?.n).toBe(2);
    expect((await s.notices('reader')).unread).toBe(2);
  });

  it('删除回复清理对应通知；删除楼层同时清理顶层和回复通知，不影响其他楼层', async () => {
    const s = setup();
    const parent = await s.publish({});
    const reply = await s.publish({ parentId: parent.id });
    await s.publish({ body: '保留楼层' });
    s.sqlite.prepare('DELETE FROM replies WHERE id=?').run(reply.id);
    expect((await s.notices('owner')).unread).toBe(2);
    await s.publish({ parentId: parent.id });
    s.sqlite.prepare('DELETE FROM comments WHERE id=?').run(parent.id);
    expect((await s.notices('owner')).items.map((n: any) => n.excerpt)).toEqual(['保留楼层']);
  });
});

describe('全站消息增量迁移', () => {
  it('完整保留旧通知编号、摘要、已读及未读，重复执行不回填历史评论、不复用已删除编号', async () => {
    const s = setup(false);
    s.sqlite.exec(`INSERT INTO comments(id,slug,name,body,created_at,ip_hash) VALUES(41,'guestbook','旧访客','旧留言','2026-10-18','old');
      INSERT INTO replies(id,slug,parent_id,reply_to,name,body,created_at,ip_hash) VALUES(51,'guestbook',41,'旧访客','回复者','旧回复','2026-10-19','old');
      INSERT INTO reply_notices(id,user_id,slug,parent_id,reply_id,actor_name,excerpt,created_at,read_at)
        VALUES(61,'owner','guestbook',41,51,'回复者','旧回复','2026-10-19',1730000000000),
              (62,'reader','guestbook',41,51,'回复者','旧回复','2026-10-19',NULL),
              (80,'other','guestbook',41,51,'回复者','待删除','2026-10-19',NULL);
      DELETE FROM reply_notices WHERE id=80;`);
    const before = s.sqlite.prepare('SELECT * FROM reply_notices ORDER BY id').all();
    for (let i = 0; i < 2; i++) {
      s.sqlite.exec('BEGIN IMMEDIATE');
      try { s.sqlite.exec(readFileSync(migration, 'utf8')); s.sqlite.exec('COMMIT'); }
      catch (error) { s.sqlite.exec('ROLLBACK'); throw error; }
      expect(s.sqlite.prepare('SELECT * FROM reply_notices ORDER BY id').all()).toEqual(before);
    }
    expect((await s.notices('owner')).unread).toBe(0);
    const fresh = await s.publish({ body: '迁移后的新留言' });
    const owner = await s.notices('owner');
    expect(owner.unread).toBe(1);
    expect(owner.items[0]).toMatchObject({ kind: 'comment', parentId: fresh.id });
    expect(owner.items[0].id).toBeGreaterThan(80);
    expect(s.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
