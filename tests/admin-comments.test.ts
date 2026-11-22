import { describe, it, expect } from 'vitest';
import {
  ADMIN_LIST_LIMIT,
  bearerToken,
  buildCommentTree,
  parseDeleteInput,
  secretMatches,
  toAdminComment,
  verifyAdmin,
} from '../functions/api/_lib/admin-core';
import { onRequestDelete, onRequestGet } from '../functions/api/admin/comments';

/* ════════════════════════════════════════════════════════════════════
   一、纯函数层（admin-core）
   ════════════════════════════════════════════════════════════════════ */

const SECRET = 'a'.repeat(48);

describe('secretMatches', () => {
  it('相同才为真', async () => {
    expect(await secretMatches('hunter2', 'hunter2')).toBe(true);
    expect(await secretMatches('hunter2', 'hunter3')).toBe(false);
  });

  it('长度不同一律为假（先各自 SHA-256 ⇒ 比较里看不出原长度）', async () => {
    expect(await secretMatches('abc', 'ab')).toBe(false);
    expect(await secretMatches('', 'a')).toBe(false);
    expect(await secretMatches('a', '')).toBe(false);
  });

  it('空串配空串为真 —— "配没配"这一层判断**不在这里**，在 verifyAdmin', async () => {
    expect(await secretMatches('', '')).toBe(true);
  });

  it('大小写敏感；中文与 emoji 也能比', async () => {
    expect(await secretMatches('AbC', 'abc')).toBe(false);
    expect(await secretMatches('密钥🌲', '密钥🌲')).toBe(true);
    expect(await secretMatches('密钥🌲', '密钥🌳')).toBe(false);
  });
});

describe('bearerToken', () => {
  it('认得 Bearer（大小写不敏感、允许多个空格 / 制表符）', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('BEARER\tabc')).toBe('abc');
    expect(bearerToken('  Bearer   abc  ')).toBe('abc');
  });

  it('不是 Bearer / 空 / 缺令牌 → 空串', () => {
    for (const h of [null, '', '   ', 'abc', 'Basic abc', 'Bearer', 'Bearer ', 'BearerName abc']) {
      expect(bearerToken(h), JSON.stringify(h)).toBe('');
    }
  });

  it('令牌里带空格也原样取出（只 trim 两端）', () => {
    expect(bearerToken('Bearer a b c')).toBe('a b c');
  });
});

describe('verifyAdmin —— 这条最容易"配错了没人发现"，逐种情况钉住', () => {
  it('★ 没配 ADMIN_TOKEN ⇒ 一律拒绝（fail closed，绝不能变成"谁都能删"）', async () => {
    for (const missing of [undefined, '', '   ']) {
      const r = await verifyAdmin(`Bearer ${SECRET}`, missing);
      expect(r.ok, `expected=${JSON.stringify(missing)}`).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(500);
        expect(r.error).toContain('ADMIN_TOKEN');
      }
    }
  });

  it('没带头 / 不是 Bearer / 令牌为空 ⇒ 401', async () => {
    for (const h of [null, '', 'abc', 'Basic abc', 'Bearer', 'Bearer ']) {
      const r = await verifyAdmin(h, SECRET);
      expect(r.ok, JSON.stringify(h)).toBe(false);
      if (!r.ok) expect(r.status).toBe(401);
    }
  });

  it('密钥不对 ⇒ 401', async () => {
    const r = await verifyAdmin(`Bearer ${'a'.repeat(47)}`, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.error).toContain('不对');
    }
  });

  it('密钥对 ⇒ 通过', async () => {
    expect((await verifyAdmin(`Bearer ${SECRET}`, SECRET)).ok).toBe(true);
    expect((await verifyAdmin(`bearer  ${SECRET} `, SECRET)).ok).toBe(true);
  });

  it('环境变量两头粘了空白也能对上（面板里粘错空格是常事）', async () => {
    expect((await verifyAdmin(`Bearer ${SECRET}`, `  ${SECRET}  `)).ok).toBe(true);
  });

  it('错误消息里**不含**提交上来的密钥片段', async () => {
    const r = await verifyAdmin('Bearer wrong-secret', SECRET);
    if (!r.ok) expect(r.error).not.toContain('wrong-secret');
  });
});

describe('parseDeleteInput', () => {
  it('只给 id ⇒ 按顶层留言处理（写作台早期版本就只发 {id}）', () => {
    expect(parseDeleteInput({ id: 12 })).toEqual({ ok: true, value: { id: 12, kind: 'comment' } });
  });

  it('kind 认 comment / reply；空串与 null 视同没给', () => {
    expect(parseDeleteInput({ id: 1, kind: 'reply' })).toEqual({ ok: true, value: { id: 1, kind: 'reply' } });
    expect(parseDeleteInput({ id: 1, kind: 'comment' })).toEqual({ ok: true, value: { id: 1, kind: 'comment' } });
    for (const kind of ['', null, undefined]) {
      expect(parseDeleteInput({ id: 1, kind })).toEqual({ ok: true, value: { id: 1, kind: 'comment' } });
    }
  });

  it('未知 kind ⇒ 拒绝（宁可 400，也不要"猜一个类型去删"）', () => {
    for (const kind of ['replys', 'Comment', 'COMMENT', 1, true, {}]) {
      const r = parseDeleteInput({ id: 1, kind });
      expect(r.ok, JSON.stringify(kind)).toBe(false);
      if (!r.ok) expect(r.error).toContain('类型');
    }
  });

  it('id 只接受正的安全整数（这个数字要进 SQL，宁可严格）', () => {
    for (const id of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3', null, undefined, 2 ** 53, {}, []]) {
      const r = parseDeleteInput({ id });
      expect(r.ok, `${JSON.stringify(id)} 应该被拒`).toBe(false);
    }
    expect(parseDeleteInput({ id: 1 }).ok).toBe(true);
    expect(parseDeleteInput({ id: Number.MAX_SAFE_INTEGER }).ok).toBe(true);
  });

  it('非对象 / 缺字段不抛异常，返回 400 语义', () => {
    for (const bad of [null, undefined, 'x', 42, [], {}]) {
      expect(() => parseDeleteInput(bad)).not.toThrow();
      expect(parseDeleteInput(bad).ok).toBe(false);
    }
  });
});

describe('buildCommentTree', () => {
  const c = (id: number) => ({ id, slug: 's', name: 'n', body: 'b', createdAt: '' });
  const r = (id: number, parentId: number) => ({ id, parentId, replyTo: '', name: 'n', body: 'b', createdAt: '' });

  it('回复按 parentId 挂到顶层下，顺序原样保留', () => {
    const t = buildCommentTree([c(1), c(2)], [r(10, 1), r(11, 1), r(20, 2)]);
    expect(t.map((x) => x.id)).toEqual([1, 2]);
    expect(t[0].replies.map((x) => x.id)).toEqual([10, 11]);
    expect(t[1].replies.map((x) => x.id)).toEqual([20]);
  });

  it('顶层顺序 = 传进来的顺序（这里不排序 —— 排序口径只许 SQL 那一处定义）', () => {
    expect(buildCommentTree([c(9), c(3)], []).map((x) => x.id)).toEqual([9, 3]);
  });

  it('没有回复的顶层回空数组（前端不必再判空）', () => {
    expect(buildCommentTree([c(1)], [])[0].replies).toEqual([]);
  });

  it('孤儿回复（父不在这批里）丢弃 —— 挂上去会变成没有上下文的一条', () => {
    const t = buildCommentTree([c(1)], [r(5, 999), r(6, 1)]);
    expect(t[0].replies.map((x) => x.id)).toEqual([6]);
  });

  it('顶层为空时返回空数组', () => {
    expect(buildCommentTree([], [r(1, 1)])).toEqual([]);
  });

  it('原样带出 slug（管理列表要显示"这条挂在哪一页"）', () => {
    expect(buildCommentTree([{ ...c(1), slug: 'talk-1' }], [])[0].slug).toBe('talk-1');
  });
});

describe('toAdminComment', () => {
  it('snake_case → camelCase，并带上 slug', () => {
    expect(
      toAdminComment({
        id: 7,
        slug: 'my-post',
        name: '小明',
        body: '你好',
        created_at: '2026-10-09T10:00:00.000Z',
      })
    ).toEqual({ id: 7, slug: 'my-post', name: '小明', body: '你好', createdAt: '2026-10-09T10:00:00.000Z' });
  });
});

describe('ADMIN_LIST_LIMIT', () => {
  it('是个正数 —— 写成 0 会让留言页永远"没有留言"（静默坏掉）', () => {
    expect(Number.isSafeInteger(ADMIN_LIST_LIMIT)).toBe(true);
    expect(ADMIN_LIST_LIMIT).toBeGreaterThan(0);
    expect(ADMIN_LIST_LIMIT).toBeLessThanOrEqual(1000);
  });
});

/* ════════════════════════════════════════════════════════════════════
   二、适配器层（functions/api/admin/comments.ts）
       —— 拿一个"认不出 SQL 就大声报错"的 D1 桩真跑一遍接口
   ════════════════════════════════════════════════════════════════════ */

type Row = Record<string, unknown>;
type Arg = Parameters<typeof onRequestGet>[0];

const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

/**
 * 极小的 D1 桩。**它不解析 SQL** —— 只认这个接口真正会发出的那几条语句的形状，
 * 认不出来就**抛异常**。
 *
 * "认不出就炸"是刻意设计的：桩子最坏的行为是"悄悄返回空数组"，
 * 那样接口以后改了查询（改了表名 / 列名 / 条件）而测试照样全绿 —— 等于没测。
 * 代价：它**不能验证 SQL 语法本身**，语法与 D1 的真实行为要等线上冒烟（见 spec §6.67）。
 */
class StubStatement {
  args: unknown[] = [];
  constructor(readonly db: StubD1, readonly sql: string) {}
  bind(...args: unknown[]) {
    const st = new StubStatement(this.db, this.sql);
    st.args = args;
    return st;
  }
  all() {
    return Promise.resolve({ results: this.db.select(this.sql, this.args) });
  }
  first() {
    return Promise.resolve(this.db.select(this.sql, this.args)[0] ?? null);
  }
  run() {
    return Promise.resolve({ meta: { changes: this.db.mutate(this.sql, this.args) } });
  }
}

const SELECT_COMMENTS =
  /^SELECT id, slug, name, body, created_at FROM comments ORDER BY created_at DESC, id DESC LIMIT (\d+)$/;
const SELECT_REPLIES =
  /^SELECT id, parent_id, reply_to, name, body, created_at FROM replies WHERE parent_id IN \(\?(?:,\?)*\) ORDER BY created_at ASC, id ASC LIMIT (\d+)$/;
const PROBE_COMMENT =
  /^SELECT \(SELECT COUNT\(\*\) FROM comments WHERE id = \?\) AS n, \(SELECT COUNT\(\*\) FROM replies WHERE parent_id = \?\) AS r$/;
const PROBE_REPLY = /^SELECT \(SELECT COUNT\(\*\) FROM replies WHERE id = \?\) AS n$/;

class StubD1 {
  comments: Row[] = [];
  replies: Row[] = [];
  /** 按执行顺序记下每条归一化 SQL（含参数），用来断言级联删除的**顺序**与"没碰库"。 */
  log: Array<{ sql: string; args: unknown[] }> = [];
  /** 模拟"两步之间被人抢删"：写语句一律回 0 行，且不真的改数据。 */
  raceAway = false;
  /** 模拟"这个 D1 版本不给 meta.changes"：返回空 meta。 */
  hideChanges = false;

  prepare(sql: string) {
    return new StubStatement(this, sql);
  }

  async batch(stmts: StubStatement[]) {
    // D1 的 batch 是隐式事务（全成或全不成）。这里按顺序执行即可 —— 桩里没有失败路径。
    return stmts.map((st) => {
      const n = this.mutate(st.sql, st.args); // ★ 数据照改：hideChanges 只影响"回不回 changes"
      return { meta: this.hideChanges ? {} : { changes: n } };
    });
  }

  select(sql: string, args: unknown[]): Row[] {
    const s = norm(sql);
    this.log.push({ sql: s, args });

    const c = SELECT_COMMENTS.exec(s);
    if (c) {
      const limit = Number(c[1]);
      return [...this.comments]
        .sort(
          (a, b) =>
            String(b.created_at).localeCompare(String(a.created_at)) || Number(b.id) - Number(a.id)
        )
        .slice(0, limit);
    }

    const rmatch = SELECT_REPLIES.exec(s);
    if (rmatch) {
      const want = new Set(args.map(Number));
      const limit = Number(rmatch[1]);
      return [...this.replies]
        .filter((r) => want.has(Number(r.parent_id)))
        .sort(
          (a, b) =>
            String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id)
        )
        .slice(0, limit);
    }

    // 删之前那一趟探针：一次查询同时给出"在不在"和"有几条回复"。
    if (PROBE_COMMENT.test(s)) {
      const [cid] = args.map(Number);
      return [
        {
          n: this.comments.filter((x) => Number(x.id) === cid).length,
          r: this.replies.filter((x) => Number(x.parent_id) === cid).length,
        },
      ];
    }
    if (PROBE_REPLY.test(s)) {
      const [rid] = args.map(Number);
      return [{ n: this.replies.filter((x) => Number(x.id) === rid).length }];
    }

    throw new Error(`D1 桩不认识的查询（接口改了 SQL？先改桩再改测试）：${s}`);
  }

  mutate(sql: string, args: unknown[]): number {
    const s = norm(sql);
    this.log.push({ sql: s, args });
    if (this.raceAway) return 0;
    const id = Number(args[0]);

    if (s === 'DELETE FROM replies WHERE parent_id = ?') {
      const before = this.replies.length;
      this.replies = this.replies.filter((r) => Number(r.parent_id) !== id);
      return before - this.replies.length;
    }
    if (s === 'DELETE FROM replies WHERE id = ?') {
      const before = this.replies.length;
      this.replies = this.replies.filter((r) => Number(r.id) !== id);
      return before - this.replies.length;
    }
    if (s === 'DELETE FROM comments WHERE id = ?') {
      const before = this.comments.length;
      this.comments = this.comments.filter((x) => Number(x.id) !== id);
      return before - this.comments.length;
    }
    throw new Error(`D1 桩不认识的写语句（接口改了 SQL？先改桩再改测试）：${s}`);
  }
}

const seed = () => {
  const db = new StubD1();
  db.comments = [
    { id: 1, slug: 'my-post', name: '小明', body: '一楼', created_at: '2026-10-01T10:00:00.000Z' },
    { id: 2, slug: 'talk-1', name: '小红', body: '二楼', created_at: '2026-10-02T10:00:00.000Z' },
    { id: 3, slug: 'my-post', name: '路人', body: '三楼', created_at: '2026-10-03T10:00:00.000Z' },
  ];
  db.replies = [
    { id: 10, parent_id: 1, reply_to: '小明', name: '小红', body: 'R1', created_at: '2026-10-01T11:00:00.000Z' },
    { id: 11, parent_id: 1, reply_to: '小红', name: '小明', body: 'R2', created_at: '2026-10-01T12:00:00.000Z' },
    { id: 20, parent_id: 2, reply_to: '', name: '路人', body: 'R3', created_at: '2026-10-02T11:00:00.000Z' },
    { id: 99, parent_id: 999, reply_to: '', name: '孤儿', body: 'R4', created_at: '2026-10-02T12:00:00.000Z' },
  ];
  return db;
};

/**
 * "环境变量没配" 必须能用**一个显式的哨兵值**表达。
 * 直接传 `undefined` 是不行的 —— 那会触发默认值（JS 默认参数的经典坑），
 * 于是"没配密钥"的用例会悄悄变成"密钥是对的"，测试反而绿。
 */
const UNSET = Symbol('unset');

const ctx = (
  db: StubD1,
  init: RequestInit = {},
  token: string | typeof UNSET = SECRET,
  path = 'https://x/api/admin/comments'
) =>
  ({
    request: new Request(path, init),
    env: { COMMENTS_DB: db, ADMIN_TOKEN: token === UNSET ? undefined : token },
  } as unknown as Arg);

const auth = { Authorization: `Bearer ${SECRET}` };
const jsonAuth = { ...auth, 'Content-Type': 'application/json' };

describe('GET /api/admin/comments', () => {
  it('没带密钥 ⇒ 401，且**根本不碰数据库**', async () => {
    const db = seed();
    const res = await onRequestGet(ctx(db));
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('环境变量没配 ⇒ 500（fail closed），也不碰数据库', async () => {
    const db = seed();
    const res = await onRequestGet(ctx(db, { headers: auth }, UNSET));
    expect(res.status).toBe(500);
    expect(db.log).toEqual([]);
  });

  it('密钥对了 ⇒ 200，顶层新的在前、回复旧的在上', async () => {
    const db = seed();
    const res = await onRequestGet(ctx(db, { headers: auth }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>>; limit: number };
    expect(body.limit).toBe(ADMIN_LIST_LIMIT);
    expect(body.items.map((c) => c.id)).toEqual([3, 2, 1]);
    const c1 = body.items.find((c) => c.id === 1) as { replies: Array<{ id: number }> };
    expect(c1.replies.map((r) => r.id)).toEqual([10, 11]);
  });

  it('形状正好是写作台要的样子（有 slug，没有 ip_hash）', async () => {
    const db = seed();
    const res = await onRequestGet(ctx(db, { headers: auth }));
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    const c = body.items.find((x) => x.id === 2) as Record<string, unknown>;
    expect(c.slug).toBe('talk-1');
    expect(Object.keys(c).sort()).toEqual(['body', 'createdAt', 'id', 'name', 'replies', 'slug']);
    const rep = (c.replies as Array<Record<string, unknown>>)[0];
    expect(Object.keys(rep).sort()).toEqual(['body', 'createdAt', 'id', 'name', 'parentId', 'replyTo']);
  });

  it('孤儿回复不出现在任何一条底下', async () => {
    const db = seed();
    const res = await onRequestGet(ctx(db, { headers: auth }));
    const body = (await res.json()) as { items: Array<{ replies: Array<{ id: number }> }> };
    // 不断言拼起来的顺序（那取决于顶层新的在前），只断言**集合**：
    // 三条真回复一条不少，孤儿 99 一条不多。
    expect(body.items.flatMap((c) => c.replies.map((r) => r.id)).sort((a, b) => a - b)).toEqual([10, 11, 20]);
  });

  it('一条留言都没有时返回空列表（不是 500）', async () => {
    const db = new StubD1();
    const res = await onRequestGet(ctx(db, { headers: auth }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], limit: ADMIN_LIST_LIMIT });
  });

  it('带未知或冗余查询参数 ⇒ 400，且不碰数据库', async () => {
    const db = seed();
    const res = await onRequestGet(ctx(db, { headers: auth }, SECRET, 'https://x/api/admin/comments?rnd=1'));
    expect(res.status).toBe(400);
    expect(db.log).toEqual([]);
  });
});

describe('DELETE /api/admin/comments', () => {
  const delReq = (db: StubD1, body: unknown) =>
    onRequestDelete(ctx(db, { method: 'DELETE', body: JSON.stringify(body), headers: jsonAuth }));

  it('没带密钥 ⇒ 401，不碰数据库', async () => {
    const db = seed();
    const res = await onRequestDelete(ctx(db, { method: 'DELETE', body: '{"id":1}' }));
    expect(res.status).toBe(401);
    expect(db.log).toEqual([]);
  });

  it('★ 删顶层留言：连它的回复一起删，且**先删子再删父**', async () => {
    const db = seed();
    const res = await delReq(db, { id: 1, kind: 'comment' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, kind: 'comment', id: 1, deletedReplies: 2 });

    // 只看写语句（删之前还有一趟探针 SELECT，它的存在由下面第 ⑯ 条单独守）
    expect(db.log.map((l) => l.sql).filter((s) => s.startsWith('DELETE'))).toEqual([
      'DELETE FROM replies WHERE parent_id = ?',
      'DELETE FROM comments WHERE id = ?',
    ]);
    expect(db.comments.map((c) => c.id)).toEqual([2, 3]);
    expect(db.replies.map((r) => r.id)).toEqual([20, 99]); // 别条的回复与孤儿都不受牵连
  });

  it('删单条回复：只动 replies，顶层一条不少', async () => {
    const db = seed();
    const res = await delReq(db, { id: 11, kind: 'reply' });
    expect(await res.json()).toEqual({ ok: true, kind: 'reply', id: 11, deletedReplies: 0 });
    expect(db.log.map((l) => l.sql).filter((s) => s.startsWith('DELETE'))).toEqual([
      'DELETE FROM replies WHERE id = ?',
    ]);
    expect(db.replies.map((r) => r.id)).toEqual([10, 20, 99]);
    expect(db.comments).toHaveLength(3);
  });

  it('省掉 kind 也按顶层留言处理（写作台早期版本只发 id）', async () => {
    const db = seed();
    expect(await (await delReq(db, { id: 1 })).json()).toEqual({
      ok: true,
      kind: 'comment',
      id: 1,
      deletedReplies: 2,
    });
  });

  it('★ 目标不存在 ⇒ 404（不能对着一个早没了的 id 淡定地说"已删除"）', async () => {
    const db = seed();
    const res = await delReq(db, { id: 424242, kind: 'comment' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toContain('不存在');
    expect(db.comments).toHaveLength(3);
  });

  it('★ 存在性由能验证的查询回答，**不押在 meta.changes 上**（它拿不到时不能误判成 404）', async () => {
    const db = seed();
    db.hideChanges = true; // 模拟"这个 D1 版本不给 meta.changes"
    const res = await delReq(db, { id: 1, kind: 'comment' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, kind: 'comment', id: 1, deletedReplies: 2 });
    expect(db.comments.map((c) => c.id)).toEqual([2, 3]);
  });

  it('闸口关了但真删时一行没动 ⇒ 409（两步之间被人抢删），不是硬报成功', async () => {
    const db = seed();
    db.raceAway = true; // 探针看得到它、写语句却回 0 行
    const res = await delReq(db, { id: 1, kind: 'comment' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain('删掉');
    expect(db.comments).toHaveLength(3); // raceAway 时不该真改数据
  });

  it('删之前先探一次"在不在 + 有几条回复"（一条查询同时给出两件事）', async () => {
    const db = seed();
    await delReq(db, { id: 1, kind: 'comment' });
    const sqls = db.log.map((l) => l.sql);
    expect(sqls[0]).toContain('AS n');
    expect(sqls[0]).toContain('AS r');
    expect(sqls[0].startsWith('SELECT')).toBe(true);
    // 探针里带的参数必须是同一个 id 两次
    expect(db.log[0].args).toEqual([1, 1]);
  });

  it('参数不合法 ⇒ 400，且不碰数据库', async () => {
    for (const bad of [{ id: 'abc' }, { id: 0 }, { id: -3 }, { id: 1.5 }, { kind: 'reply' }, { id: 1, kind: 'x' }, null]) {
      const db = seed();
      const res = await delReq(db, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(db.log, JSON.stringify(bad)).toEqual([]);
    }
  });

  it('没有 body ⇒ 400（不是当成"删 0 号"）', async () => {
    const db = seed();
    const res = await onRequestDelete(ctx(db, { method: 'DELETE', headers: auth }));
    expect(res.status).toBe(400);
    expect(db.log).toEqual([]);
  });

  it('也认 query 形态（curl 手测时发 DELETE 带 body 不方便）', async () => {
    const db = seed();
    const res = await onRequestDelete(
      ctx(db, { method: 'DELETE', headers: auth }, SECRET, 'https://x/api/admin/comments?id=11&kind=reply')
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, kind: 'reply', id: 11, deletedReplies: 0 });
    expect(db.replies.map((r) => r.id)).toEqual([10, 20, 99]);
  });

  it('query 里的 id 不是数字 ⇒ 400', async () => {
    const db = seed();
    const res = await onRequestDelete(
      ctx(db, { method: 'DELETE', headers: auth }, SECRET, 'https://x/api/admin/comments?id=oops')
    );
    expect(res.status).toBe(400);
    expect(db.log).toEqual([]);
  });

  it('带 body 时以 body 为准，query 只是退路', async () => {
    const db = seed();
    const res = await onRequestDelete(
      ctx(
        db,
        { method: 'DELETE', body: JSON.stringify({ id: 20, kind: 'reply' }), headers: jsonAuth },
        SECRET,
        'https://x/api/admin/comments?id=999&kind=comment'
      )
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, kind: 'reply', id: 20, deletedReplies: 0 });
    expect(db.comments).toHaveLength(3);
  });

  it('带未知查询参数 ⇒ 400，超过 4 KiB 请求正文 ⇒ 413，且均不碰数据库', async () => {
    const db = seed();
    const badQuery = await onRequestDelete(
      ctx(db, { method: 'DELETE', headers: auth }, SECRET, 'https://x/api/admin/comments?id=1&rnd=1')
    );
    expect(badQuery.status).toBe(400);
    const oversized = await onRequestDelete(
      ctx(db, {
        method: 'DELETE',
        body: JSON.stringify({ id: 1, padding: 'a'.repeat(5000) }),
        headers: jsonAuth,
      })
    );
    expect(oversized.status).toBe(413);
    expect(db.log).toEqual([]);
    expect(db.comments).toHaveLength(3);
  });
});
