import { hashIp, isVisitorId } from './reactions-core';
import { writeLimitStatements } from './public-write';

export interface PageviewEnv {
  COMMENTS_DB: D1Database;
}

interface PageviewContext {
  request: Request;
  env: PageviewEnv;
  waitUntil(promise: Promise<unknown>): void;
}

const YEAR_SECONDS = 60 * 60 * 24 * 365;
const PAGEVIEWS_PER_MINUTE = 120;

async function appendPageview({ env, request }: PageviewContext, vid: string, now: number) {
  const timestamp = new Date(now).toISOString();
  const values = [timestamp.slice(0, 10), vid, timestamp];
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') ?? 'unknown');
  await env.COMMENTS_DB.batch([
    ...writeLimitStatements(env, 'pageviews:ip', ipHash, PAGEVIEWS_PER_MINUTE, now),
    // changes() 对应上一条配额写入。配额和访问记录在同一事务提交。
    env.COMMENTS_DB.prepare('INSERT INTO pageviews (day, vid, created_at) SELECT ?, ?, ? WHERE changes() = 1').bind(...values),
  ]);
}

/** 统计写入和页面响应独立。旧库补齐限流表后才记新浏览。 */
export function recordPageview(context: PageviewContext, response: Response) {
  const cookie = context.request.headers.get('Cookie')?.match(/(?:^|;\s*)nc_vid=([^;]*)/)?.[1] ?? '';
  const existing = isVisitorId(cookie);
  const vid = existing ? cookie : crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  context.waitUntil(appendPageview(context, vid, Date.now()).catch(() => {}));

  if (existing) return response;
  const withCookie = new Response(response.body, response);
  withCookie.headers.append('Set-Cookie', `nc_vid=${vid}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax; Secure`);
  return withCookie;
}
