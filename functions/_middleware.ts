import { isVisitorId } from './api/_lib/reactions-core';

interface Env {
  COMMENTS_DB: D1Database;
}

const COOKIE = 'nc_vid';
const YEAR = 60 * 60 * 24 * 365;

/**
 * 全站访问计数（2026-09-26 站主要求页脚显示 PV/UV）。
 *
 * 为什么放在中间件而不是页面里打个 JS 信标：
 *   · **不加客户端 JS**（文章页的脚本预算只有 4096 字节，各页也都不需要为统计背脚本）；
 *   · 关掉 JS 的访客、以及禁用脚本的爬虫也照样计数（更接近真实访问量）。
 *
 * 只数"文档请求"：
 *   · 方法必须是 GET；
 *   · `Accept` 里要带 text/html（CSS/JS/图片/font 的 Accept 不带）；
 *   · 路径不以 /api/ 开头（接口调用不算页面浏览）；
 *   · 响应状态 200（404 页不计）。
 *
 * 访客号：cookie 里已有就用它，没有就现生成一个随机 16 位并写回（一年有效）。
 * **不存 IP、不存 UA、不存来源** —— 与评论系统同一条隐私线。
 * 计数写在 `waitUntil` 里：响应已经发出去，写库失败也不影响访客看到页面。
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const wantsDoc =
    request.method === 'GET' &&
    !url.pathname.startsWith('/api/') &&
    (request.headers.get('Accept') ?? '').includes('text/html');

  const res = await next();
  if (!wantsDoc || res.status !== 200) return res;

  const cookieHeader = request.headers.get('Cookie') ?? '';
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-z0-9]+)`));
  const existing = m && isVisitorId(m[1]) ? m[1] : '';
  const vid = existing || crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  const now = new Date();
  context.waitUntil(
    env.COMMENTS_DB.prepare('INSERT INTO pageviews (day, vid, created_at) VALUES (?, ?, ?)')
      .bind(now.toISOString().slice(0, 10), vid, now.toISOString())
      .run()
      .catch(() => {
        /* 统计写失败不该影响页面；不抛、不记日志噪音 */
      })
  );

  if (existing) return res;

  // 首次来访：把访客号写回浏览器。要改响应头 ⇒ 复制一份 Response（body 流直接透传）。
  const withCookie = new Response(res.body, res);
  withCookie.headers.append('Set-Cookie', `${COOKIE}=${vid}; Path=/; Max-Age=${YEAR}; SameSite=Lax; Secure`);
  return withCookie;
};
