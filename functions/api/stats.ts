interface Env {
  COMMENTS_DB: D1Database;
}

/**
 * 全站访问统计（2026-09-26 站主要求页脚显示 PV/UV）。
 * GET /api/stats → { pv, uv, days }
 *   pv   = pageviews 行数（每一次页面浏览）
 *   uv   = 不同访客号个数（cookie 里的 nc_vid，随机、不含任何身份信息）
 *   days = 有记录的天数（页脚没用到，留着方便站主自查）
 * 计数本身在 functions/_middleware.ts 里做（只数 HTML 文档请求）。
 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const row = await env.COMMENTS_DB.prepare(
    'SELECT COUNT(*) AS pv, COUNT(DISTINCT vid) AS uv, COUNT(DISTINCT day) AS days FROM pageviews'
  ).first<{ pv: number; uv: number; days: number }>();

  return new Response(JSON.stringify({ pv: row?.pv ?? 0, uv: row?.uv ?? 0, days: row?.days ?? 0 }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 数字不用太实时：给边缘/浏览器 60 秒缓存，省得每个访客都打一次库
      'Cache-Control': 'public, max-age=60',
    },
  });
};
