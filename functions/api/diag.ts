// 【临时诊断端点 — 验证完立即删除】
// 目的：搞清楚线上运行时到底有没有拿到 D1 binding，以及查询能不能跑通。
export const onRequestGet: PagesFunction = async ({ env }) => {
  const e = env as unknown as Record<string, unknown>;
  let dbProbe: string;

  try {
    const db = e.COMMENTS_DB as D1Database | undefined;
    if (!db) {
      dbProbe = 'binding missing (env.COMMENTS_DB is ' + String(db) + ')';
    } else {
      const r = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      dbProbe = 'ok: ' + JSON.stringify(r.results);
    }
  } catch (err) {
    dbProbe = 'threw: ' + String(err);
  }

  return new Response(JSON.stringify({ bindingKeys: Object.keys(e), dbProbe }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
