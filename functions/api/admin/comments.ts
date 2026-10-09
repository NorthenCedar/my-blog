import {
  ADMIN_LIST_LIMIT,
  buildCommentTree,
  parseDeleteInput,
  toAdminComment,
  toAdminReply,
  verifyAdmin,
  type CommentRow,
  type ReplyRow,
} from '../_lib/admin-core';

interface Env {
  COMMENTS_DB: D1Database;
  /**
   * 留言**管理**接口的密钥。**不配 ⇒ 接口整体关闭**（不是"开放"）。
   * 在 Cloudflare Pages 项目的 Settings → Environment variables 里加，
   * 类型选 **Secret**（加密存储）；本地 `npm run dev:cf` 时放 `.dev.vars`。
   * 写作台「设置 → 留言管理密钥」里要填**同一个值**。
   */
  ADMIN_TOKEN?: string;
}

/**
 * 留言管理接口（2026-10-09 为写作台加的）。
 *
 *   GET    /api/admin/comments                → { items: [{id,slug,name,body,createdAt,replies:[…]}] }
 *   DELETE /api/admin/comments  {id,kind}     → { ok, kind, id, deletedReplies }   kind ∈ comment|reply
 *                                               404 = 本来就不在 · 409 = 被抢删
 *
 * 三条刻意的设计：
 *
 * ① **不走公开接口那条路**。公开的 `/api/comments` 只能按 slug 查、
 *    没有任何写入面的钥匙；把管理能力塞进去（哪怕是加个 if）会让"公开接口"
 *    这个概念失效 —— 它一旦能删东西，之后每次改它都要重新论证一遍安全性。
 *
 * ② **不发 CORS 头**。这个接口是给**写作台（Python 本机进程）**用的服务端到服务端调用。
 *    浏览器跨源想请求它会因为缺 `Access-Control-Allow-Origin` 而拿不到响应体；
 *    换句话说，光有密钥还不够、还得有个不受浏览器同源策略约束的客户端。
 *    这也是为什么**不要**图省事在这里加 `Access-Control-Allow-Origin: *`。
 *
 * ③ **不回显密钥、不记密钥**。任何分支的错误消息都不含密钥片段；
 *    这个文件里没有任何 console.log。
 */
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

/** 每个需要鉴权的入口都先过这一关。返回 Response 表示该直接返回了（鉴权没过）。 */
async function gate(request: Request, env: Env): Promise<Response | null> {
  const auth = await verifyAdmin(request.headers.get('Authorization'), env.ADMIN_TOKEN);
  return auth.ok ? null : json({ error: auth.error }, auth.status);
}

/**
 * GET /api/admin/comments
 *
 * 一次取齐"最近 200 条顶层 + 它们的全部回复"。为什么不分页：
 * 写作台的留言页是**管理视图**（要一眼看到最近发生了什么、顺手删掉），
 * 而本站的留言量远不到 200 条；真到了那天再加游标分页，
 * 现在加只会让这个小工具多一层用不上的状态。
 *
 * **不 SELECT `ip_hash`** —— 管理界面不需要它，不取就不可能被渲染到界面上，
 * 与公开接口"不存原始 IP"是同一条隐私线。
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = await gate(request, env);
  if (denied) return denied;

  const { results: crows } = await env.COMMENTS_DB.prepare(
    `SELECT id, slug, name, body, created_at
       FROM comments
      ORDER BY created_at DESC, id DESC
      LIMIT ${ADMIN_LIST_LIMIT}`
  ).all<CommentRow>();

  const comments = (crows ?? []).map(toAdminComment);
  const ids = comments.map((c) => c.id);

  // 回复只属于这一批顶层（`parent_id IN`）；id 在 comments 表里全局唯一 ⇒ 不需要再带 slug 条件。
  // 顺序 `ASC`：回复**旧的在上**（一段对话要顺着读）—— 与公开接口同一条口径，理由见 comments.ts。
  let replies: ReplyRow[] = [];
  if (ids.length > 0) {
    const marks = ids.map(() => '?').join(',');
    const { results: rrows } = await env.COMMENTS_DB.prepare(
      `SELECT id, parent_id, reply_to, name, body, created_at
         FROM replies
        WHERE parent_id IN (${marks})
        ORDER BY created_at ASC, id ASC`
    )
      .bind(...ids)
      .all<ReplyRow>();
    replies = rrows ?? [];
  }

  // `limit` 一并回出去：写作台将来要提示"只显示了最近 200 条"时不必再写死这个数。
  return json({
    items: buildCommentTree(comments, replies.map(toAdminReply)),
    limit: ADMIN_LIST_LIMIT,
  });
};

/**
 * DELETE /api/admin/comments
 *
 * body: `{"id": 12, "kind": "comment"}`（`kind` 可省，缺省按 comment）
 * 也认 query：`DELETE /api/admin/comments?id=12&kind=reply`
 *   —— 有些客户端发 DELETE 带 body 不方便（curl 要 `-X DELETE -d`），
 *      留一条 query 通路方便手测，两条路走**同一个** `parseDeleteInput`，不会有两套语义。
 *
 * 顶层留言会**连带它的回复一起删**（写作台那句确认文案写的就是"连同它的回复"）。
 * 用 `batch()` 而不是两条 `.run()`：D1 的 batch 是一个**隐式事务**，
 * 不会出现"父删了、回复还留着变成孤儿"的中间态。
 *
 * 两种"没删成"要分开：**404** = 目标本来就不在（可能刚被删过）；
 * **409** = 验存在时还在、真删时一行没动（两步之间被人抢删）。界面看到的措辞不一样。
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const denied = await gate(request, env);
  if (denied) return denied;

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = null; // 没有 body / body 不是 JSON ⇒ 落到下面的 query 通路，不算错
  }
  if (typeof payload !== 'object' || payload === null || !('id' in (payload as object))) {
    const u = new URL(request.url);
    const raw = u.searchParams.get('id');
    payload = {
      id: raw === null ? undefined : Number(raw),
      kind: u.searchParams.get('kind') ?? undefined,
    };
  }

  const check = parseDeleteInput(payload);
  if (!check.ok) return json({ error: check.error }, 400);
  const { id, kind } = check.value;

  // ★ 先确认目标在不在 —— 这一次额外的往返是**刻意的**：
  //
  //   原打算只看 batch 的 `meta.changes`：0 就是"本来就不在"（回 404）。但 `meta.changes`
  //   的取值在不同 wrangler / D1 版本上不是恒定的（取不到时是 `undefined`）——
  //   一旦它没值，"删成功了"会被判成"没删到"，回一个 404 给写作台，
  //   而界面上那句话是"这条留言已经不存在了"。**实际删掉了、却告诉你没删**，
  //   这比"报错了但删掉了"更难排查（列表刷新后它不见了，你会以为是自己看错了）。
  //   ⇒ 存在性由**能验证的查询**回答，不由一个可能缺省的元数据回答。
  //
  //   顺带这一趟还把"连带删了几条回复"数准了 —— 删完之后就再也数不出来。
  //   一次查询同时拿到两件事，所以总代价仍然只有多一跳。
  const probe =
    kind === 'comment'
      ? await env.COMMENTS_DB.prepare(
          `SELECT (SELECT COUNT(*) FROM comments WHERE id = ?) AS n,
                  (SELECT COUNT(*) FROM replies  WHERE parent_id = ?) AS r`
        )
          .bind(id, id)
          .first<{ n: number; r: number }>()
      : await env.COMMENTS_DB.prepare('SELECT (SELECT COUNT(*) FROM replies WHERE id = ?) AS n')
          .bind(id)
          .first<{ n: number }>();

  if (!probe || probe.n === 0) {
    return json({ error: '这条留言已经不存在了（可能刚被删过）' }, 404);
  }

  const stmts =
    kind === 'comment'
      ? [
          // 先子后父：万一将来被人改成两条 `.run()`（batch 才是隐式事务），也不会留下孤儿。
          env.COMMENTS_DB.prepare('DELETE FROM replies WHERE parent_id = ?').bind(id),
          env.COMMENTS_DB.prepare('DELETE FROM comments WHERE id = ?').bind(id),
        ]
      : [env.COMMENTS_DB.prepare('DELETE FROM replies WHERE id = ?').bind(id)];

  const results = await env.COMMENTS_DB.batch(stmts);

  // 存在性刚验过、batch 却说一行没动 ⇒ 只能是在这两步之间被人抢删了。回 409 让界面重取列表，
  // 而不是硬报"成功"（那样界面会保留一条已经不存在的行）。
  // ⚠ 只在 `changes` **确实拿到了** 的前提下这么判（见上面那段）；拿不到就当成功。
  const changesKnown = results.every((r) => typeof r.meta?.changes === 'number');
  const changes = results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  if (changesKnown && changes === 0) {
    return json({ error: '这条留言刚刚被别处删掉了，刷新一下列表' }, 409);
  }

  // `comment` 时 results[0] 就是子表那条删除；不过这里**不拿它当数**（同 meta.changes 的理由），
  // 用上面那趟 probe 数出来的结果。
  const deletedReplies = kind === 'comment' ? (probe as { r: number }).r : 0;
  return json({ ok: true, kind, id, deletedReplies });
};
