interface Env {
  COMMENTS_DB: D1Database;
}

type Stats = { pv: number; uv: number; days: number };

/** 汇总与 pageviews 同步更新。迁移前仍可从原始行读出相同的数值。 */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let row: Stats | null;
  try {
    row = await env.COMMENTS_DB.prepare('SELECT pv, uv, days FROM pageview_totals WHERE id = 1').first<Stats>();
  } catch (error) {
    if (!/no such table:\s*pageview_totals\b/i.test(String(error))) throw error;
    row = await env.COMMENTS_DB.prepare(
      'SELECT COUNT(*) AS pv, COUNT(DISTINCT vid) AS uv, COUNT(DISTINCT day) AS days FROM pageviews'
    ).first<Stats>();
  }

  return new Response(JSON.stringify({ pv: row?.pv ?? 0, uv: row?.uv ?? 0, days: row?.days ?? 0 }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 数字容许一分钟延迟。浏览器可复用，边缘缓存策略由部署配置决定。
      'Cache-Control': 'public, max-age=60',
    },
  });
};
