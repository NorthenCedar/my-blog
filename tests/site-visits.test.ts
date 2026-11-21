import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/_middleware';
import { onRequestPost as postPageview } from '../functions/api/pageview';
import { onRequestGet as getStats } from '../functions/api/stats';
import { hashIp } from '../functions/api/_lib/reactions-core';
import { visitorDatabase } from './_visitor-db';

const visitor = 'a123456789abcdef';
const close: (() => void)[] = [];
afterEach(() => {
  vi.useRealTimers();
  close.splice(0).forEach(dispose => dispose());
});

function setup(accounts = true) {
  const { sqlite, db } = visitorDatabase(accounts);
  close.push(() => sqlite.close());
  sqlite.exec(readFileSync('migrations/0002_likes_and_visits.sql', 'utf8'));
  return { sqlite, env: { COMMENTS_DB: db } };
}

async function documentRequest(
  env: ReturnType<typeof setup>['env'],
  headers: Record<string, string>,
  status = 200,
  type = 'text/html; charset=utf-8',
) {
  const pending: Promise<unknown>[] = [];
  const response = await onRequest({
    request: new Request('https://example.test/posts/known/', {
      headers: { Accept: 'text/html', ...headers },
    }),
    env,
    next: () => Promise.resolve(new Response('页面', { status, headers: { 'Content-Type': type } })),
    waitUntil: (promise: Promise<unknown>) => { pending.push(promise); },
  } as never);
  await Promise.all(pending);
  return response;
}

async function counters(env: ReturnType<typeof setup>['env']) {
  return (await getStats({ env } as never)).json();
}

async function reportVisit(env: ReturnType<typeof setup>['env'], headers: Record<string, string>, body?: string) {
  const pending: Promise<unknown>[] = [];
  const response = await postPageview({
    request: new Request('https://example.test/api/pageview', { method: 'POST', headers, body }),
    env,
    waitUntil: (promise: Promise<unknown>) => { pending.push(promise); },
  } as never);
  await Promise.all(pending);
  return response;
}

describe('文档请求与推测请求的计数口径', () => {
  it('在没有 Fetch Metadata 时保留直接访问计数，已有访客号复用', async () => {
    const { env } = setup();
    const first = await documentRequest(env, {});
    const cookie = first.headers.get('Set-Cookie')!;
    expect(cookie).toMatch(/^nc_vid=[a-z0-9]{16};/);
    const second = await documentRequest(env, {
      Cookie: cookie.split(';', 1)[0],
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
    });
    expect(second.headers.has('Set-Cookie')).toBe(false);
    expect(await counters(env)).toEqual({ pv: 2, uv: 1, days: 1 });
  });

  it.each([
    [{ 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Dest': 'empty' }, 200, 'text/html'],
    [{ 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' }, 200, 'text/html'],
    [{ 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe' }, 200, 'text/html'],
    [{ 'Sec-Purpose': 'prefetch;prerender' }, 200, 'text/html'],
    [{ Purpose: 'prefetch' }, 200, 'text/html'],
    [{}, 404, 'text/html'],
    [{}, 200, 'application/javascript'],
  ] as [Record<string, string>, number, string][])('跳过 %j、状态 %i、类型 %s', async (headers, status, type) => {
    const { env } = setup();
    expect((await documentRequest(env, headers, status, type)).headers.has('Set-Cookie')).toBe(false);
    expect(await counters(env)).toEqual({ pv: 0, uv: 0, days: 0 });
  });
});

describe('成功的软导航与恢复', () => {
  it('复用直接打开页面时的访客号', async () => {
    const { env } = setup();
    const first = await documentRequest(env, {});
    const cookie = first.headers.get('Set-Cookie')!.split(';', 1)[0];
    const reported = await reportVisit(env, { Cookie: cookie, Origin: 'https://example.test' });
    expect(reported.status).toBe(204);
    expect(reported.headers.has('Set-Cookie')).toBe(false);
    expect(await counters(env)).toEqual({ pv: 2, uv: 1, days: 1 });
  });

  it.each([
    {},
    { Origin: 'null' },
    { Origin: 'https://elsewhere.test' },
    { Origin: 'https://example.test', 'Sec-Fetch-Site': 'cross-site' },
  ] as Record<string, string>[])('拒绝 %j 代填访问数', async headers => {
    const { env } = setup();
    expect((await reportVisit(env, headers)).status).toBe(403);
    expect(await counters(env)).toEqual({ pv: 0, uv: 0, days: 0 });
  });

  it('只接受正文为空的补记请求', async () => {
    const { env } = setup(true);
    const headers = { Origin: 'https://example.test', Cookie: `nc_vid=${visitor}` };
    expect((await reportVisit(env, headers, '旁注')).status).toBe(413);
    expect(await counters(env)).toEqual({ pv: 0, uv: 0, days: 0 });
    expect((await reportVisit(env, { ...headers, 'Content-Length': '0' }, '')).status).toBe(204);
    expect(await counters(env)).toEqual({ pv: 1, uv: 1, days: 1 });
  });

  it('直达和补记共用每 IP 滚动额度，超额仍能正常读页面，其他 IP 照常计数', async () => {
    const { sqlite, env } = setup(true);
    sqlite.exec(readFileSync('migrations/0013_pageview_totals.sql', 'utf8'));
    const start = Date.parse('2026-11-02T00:00:59.900Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(start);
    const ip = '192.0.2.25';
    sqlite.prepare('INSERT INTO visitor_rate_limits(scope,key_hash,window_start,hits) VALUES (?,?,?,?)')
      .run('pageviews:ip', await hashIp(ip), start, 118);
    const headers = { 'CF-Connecting-IP': ip, Cookie: `nc_vid=${visitor}` };
    expect((await documentRequest(env, headers)).status).toBe(200);
    vi.setSystemTime(start + 200);
    const reports = await Promise.all(Array.from({ length: 2 }, () => reportVisit(env, { ...headers, Origin: 'https://example.test' })));
    expect(reports.map(response => response.status)).toEqual([204, 204]);
    expect(await (await documentRequest(env, headers)).text()).toBe('页面');
    expect(await counters(env)).toEqual({ pv: 2, uv: 1, days: 1 });

    await documentRequest(env, { ...headers, 'CF-Connecting-IP': '192.0.2.26' });
    expect(await counters(env)).toEqual({ pv: 3, uv: 1, days: 1 });
    vi.setSystemTime(start + 60001);
    await documentRequest(env, headers);
    expect(await counters(env)).toEqual({ pv: 4, uv: 1, days: 1 });
  });
});

describe('访问统计的历史回填与增量维护', () => {
  it('没有限流表的旧库仍可浏览页面和查询历史统计', async () => {
    const { sqlite, env } = setup(false);
    sqlite.prepare('INSERT INTO pageviews(day, vid, created_at) VALUES (?, ?, ?)')
      .run('2026-10-01', visitor, '2026-10-01T00:01:00.000Z');
    const headers = { Cookie: `nc_vid=${visitor}` };
    expect(await (await documentRequest(env, headers)).text()).toBe('页面');
    expect((await reportVisit(env, { ...headers, Origin: 'https://example.test' })).status).toBe(204);
    expect(await counters(env)).toEqual({ pv: 1, uv: 1, days: 1 });
  });

  it('回填保留旧行、访客号与 UTC 日期，并兼容旧版继续插入', async () => {
    const { sqlite, env } = setup();
    const insert = sqlite.prepare('INSERT INTO pageviews(day, vid, created_at) VALUES (?, ?, ?)');
    insert.run('2026-10-01', visitor, '2026-10-01T00:01:00.000Z');
    insert.run('2026-10-01', visitor, '2026-10-01T01:00:00.000Z');
    insert.run('2026-10-02', 'b123456789abcdef', '2026-10-02T02:00:00.000Z');
    const legacy = await counters(env);
    const migration = readFileSync('migrations/0013_pageview_totals.sql', 'utf8');
    sqlite.exec(migration);
    expect(sqlite.prepare('SELECT pv, uv, days FROM pageview_totals').get()).toEqual(legacy);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM pageviews').get()?.count).toBe(3);

    insert.run('2026-10-02', visitor, '2026-10-02T03:00:00.000Z');
    insert.run('2026-10-03', 'c123456789abcdef', '2026-10-03T23:59:00.000Z');
    expect(await counters(env)).toEqual({ pv: 5, uv: 3, days: 3 });
    sqlite.exec(migration);
    expect(await counters(env)).toEqual({ pv: 5, uv: 3, days: 3 });
  });

  it('迁移后只查汇总行，迁移前仍能读历史统计', async () => {
    const { sqlite, env } = setup();
    await documentRequest(env, { Cookie: `nc_vid=${visitor}` });
    expect(await counters(env)).toEqual({ pv: 1, uv: 1, days: 1 });
    sqlite.exec(readFileSync('migrations/0013_pageview_totals.sql', 'utf8'));
    const queries: string[] = [];
    const prepare = env.COMMENTS_DB.prepare;
    env.COMMENTS_DB.prepare = sql => { queries.push(sql); return prepare(sql); };
    expect(await counters(env)).toEqual({ pv: 1, uv: 1, days: 1 });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('FROM pageview_totals');
  });
});
