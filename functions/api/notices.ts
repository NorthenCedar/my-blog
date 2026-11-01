/**
 * GET  /api/notices?before=<编号> → 当前账户的提醒，支持读取更早消息。
 * POST /api/notices  → { ids: [1,2] } | {}  （不传 ids = 全部已读）→ { unread }
 *
 * 普通访客收回复自己的提醒；站主另收全站新留言、评论及回复。
 * 到达方式沿用站内铃铛 + 未读角标（顶栏）。
 *
 * 为什么 GET 未登录不报 401：铃铛在每一页都挂一次，匿名访客占绝大多数 ——
 * 回一个 200 + 空结果，前端的「未登录就藏起来」判断不用依赖错误码，也不会在控制台里
 * 刷一片红的 401 日志。
 */
import { listReplyNotices, markReplyNoticesRead } from './_lib/notices';
import { currentAccount, guardWrite } from './_lib/visitor-store';
import { readJsonBody } from './_lib/public-write';
import { AccountError } from './_lib/visitor-core';

interface Env {
  COMMENTS_DB: D1Database;
  OWNER_USER_ID?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await currentAccount(request, env);
  // signedIn 是给铃铛用的：未读为 0 时它还得分得清「登录了但没人回」与「压根没登录」——
  // 前者要留着铃铛（它是打开历史列表的唯一入口），后者顶栏上不该多出一格。
  const isOwner = Boolean(user && env.OWNER_USER_ID && env.OWNER_USER_ID === user.id);
  const labels = { title: isOwner ? '全站消息' : '回复提醒', emptyMessage: isOwner ? '还没有新的全站消息。' : '还没有人回复你。' };
  if (!user) return json({ unread: 0, items: [], signedIn: false, isOwner: false, nextBefore: null, ...labels });
  const raw = new URL(request.url).searchParams.get('before');
  const before = raw === null ? undefined : Number(raw);
  if (before !== undefined && (!Number.isSafeInteger(before) || before <= 0)) return json({ error: '消息位置无效' }, 400);
  return json({ ...(await listReplyNotices(env, user.id, 20, before)), signedIn: true, isOwner, ...labels });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    // 与其它写接口同一道门：同源 + X-NC-Request 头（防跨站表单顺手提交）
    guardWrite(request);
    const user = await currentAccount(request, env);
    if (!user) return json({ error: '请先登录' }, 401);

    const payload = (await readJsonBody(request, 4096)) as { ids?: unknown };
    const raw = Array.isArray(payload.ids) ? payload.ids : null;
    // 形状不对的 id 直接丢弃（不是 400：已读是幂等的顺手操作，不值得为此让人重试）
    const ids = (raw ?? []).map((value) => Number(value)).filter((value) => Number.isSafeInteger(value) && value > 0);

    // 带 ids ⇒ 只动这几条；不带 ⇒ 全部已读（铃铛里那个「全部标为已读」）
    await markReplyNoticesRead(env, user.id, raw === null ? null : ids);
    return json({ unread: (await listReplyNotices(env, user.id, 1)).unread });
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    throw error;
  }
};
