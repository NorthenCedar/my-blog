import { honeypotTripped } from './_lib/comments-core';
import {
  LINK_APPLY_RATE_MAX,
  LINK_LIST_LIMIT,
  ensureLinkApplicationsTable,
  validateLinkApply,
} from './_lib/link-apply';
import { recordLinkApplyNotice } from './_lib/notices';
import { notifyLinkApplyEmail, runBackgroundMail } from './_lib/mailer';
import {
  guardPublicWrite,
  hasOnlyQueryParams,
  readJsonBody,
  writeLimitStatements,
} from './_lib/public-write';
import { hashIp } from './_lib/reactions-core';
import { AccountError } from './_lib/visitor-core';
import { currentAccount, guardWrite, type VisitorEnv } from './_lib/visitor-store';

type ApplicationRow = {
  id: number;
  name: string;
  href: string;
  desc: string;
  avatar: string;
  created_at: string;
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const noSuchTable = (error: unknown) => /no such table:\s*link_applications\b/i.test(String(error));

const toRecord = (row: ApplicationRow) => ({
  id: row.id,
  name: row.name,
  href: row.href,
  desc: row.desc,
  avatar: row.avatar,
  createdAt: row.created_at,
});

async function requireOwner(request: Request, env: VisitorEnv) {
  const user = await currentAccount(request, env);
  if (!user) return { ok: false as const, response: json({ error: '请先登录站主账号' }, 401) };
  if (!env.OWNER_USER_ID || user.id !== env.OWNER_USER_ID) {
    return { ok: false as const, response: json({ error: '仅站主可查看或管理友链申请' }, 403) };
  }
  return { ok: true as const, user };
}

export const onRequestGet: PagesFunction<VisitorEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (!hasOnlyQueryParams(url, ['id'])) return json({ error: '查询参数不合法' }, 400);

  let requestedId: number | null = null;
  if (url.searchParams.has('id')) {
    const rawId = url.searchParams.get('id') ?? '';
    const parsed = Number(rawId);
    if (!/^[1-9]\d{0,15}$/.test(rawId) || !Number.isSafeInteger(parsed)) {
      return json({ error: '申请编号不合法' }, 400);
    }
    requestedId = parsed;
  }

  const gate = await requireOwner(request, env);
  if (!gate.ok) return gate.response;

  try {
    if (requestedId !== null) {
      const row = await env.COMMENTS_DB.prepare(
        'SELECT id, name, href, desc, avatar, created_at FROM link_applications WHERE id = ? LIMIT 1'
      )
        .bind(requestedId)
        .first<ApplicationRow>();
      return row ? json({ item: toRecord(row) }) : json({ error: '这条友链申请不存在或已删除' }, 404);
    }

    const { results } = await env.COMMENTS_DB.prepare(
      `SELECT id, name, href, desc, avatar, created_at
         FROM link_applications
        ORDER BY created_at DESC, id DESC
        LIMIT ${LINK_LIST_LIMIT}`
    ).all<ApplicationRow>();
    return json({ items: (results ?? []).map(toRecord) });
  } catch (error) {
    if (noSuchTable(error)) {
      return requestedId !== null
        ? json({ error: '这条友链申请不存在或已删除' }, 404)
        : json({ items: [] });
    }
    throw error;
  }
};

export const onRequestPost: PagesFunction<VisitorEnv> = async ({ request, env, waitUntil }) => {
  try {
    guardPublicWrite(request);
    const payload = await readJsonBody(request, 8 * 1024);
    const check = validateLinkApply(payload);
    if (!check.ok) return json({ error: check.error }, 400);

    if (honeypotTripped(payload)) {
      return json({ ok: true, id: 0 }, 201);
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const ipHash = await hashIp(ip);
    const limits = await env.COMMENTS_DB.batch(
      writeLimitStatements(env, 'link-apply:ip', ipHash, LINK_APPLY_RATE_MAX, Date.now())
    );
    if (!limits[1].results?.length) {
      return json({ error: '提交太频繁，请等一分钟再试' }, 429);
    }

    const { name, href, desc, avatar } = check.value;
    const createdAt = new Date().toISOString();
    const insert = () =>
      env.COMMENTS_DB.prepare(
        'INSERT INTO link_applications (name, href, desc, avatar, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
      )
        .bind(name, href, desc, avatar, createdAt, ipHash)
        .first<{ id: number }>();

    let inserted: { id: number } | null;
    try {
      inserted = await insert();
    } catch (error) {
      if (!noSuchTable(error)) throw error;
      await ensureLinkApplicationsTable(env);
      inserted = await insert();
    }

    const applicationId = inserted?.id ?? 0;
    await recordLinkApplyNotice(env, { applicationId, name, href, desc, createdAt });
    runBackgroundMail(waitUntil, notifyLinkApplyEmail(env, { applicationId, name, href, desc }));
    return json({ ok: true, id: applicationId }, 201);
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    throw error;
  }
};

export const onRequestDelete: PagesFunction<VisitorEnv> = async ({ request, env }) => {
  try {
    guardWrite(request);
    if (!hasOnlyQueryParams(new URL(request.url), [])) return json({ error: '查询参数不合法' }, 400);

    const gate = await requireOwner(request, env);
    if (!gate.ok) return gate.response;

    const payload = await readJsonBody(request, 4 * 1024);
    const id = payload.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
      return json({ error: '申请编号不合法' }, 400);
    }

    let existing: { id: number } | null;
    try {
      existing = await env.COMMENTS_DB.prepare('SELECT id FROM link_applications WHERE id = ? LIMIT 1')
        .bind(id)
        .first<{ id: number }>();
    } catch (error) {
      if (noSuchTable(error)) return json({ error: '这条友链申请不存在或已删除' }, 404);
      throw error;
    }

    if (!existing) return json({ error: '这条友链申请不存在或已删除' }, 404);

    await env.COMMENTS_DB.batch([
      env.COMMENTS_DB.prepare('DELETE FROM link_applications WHERE id = ?').bind(id),
      env.COMMENTS_DB.prepare(
        "DELETE FROM reply_notices WHERE user_id = ? AND slug = 'link-apply' AND parent_id = ?"
      ).bind(gate.user.id, -id),
    ]);
    return json({ ok: true, id });
  } catch (error) {
    if (error instanceof AccountError) return json({ error: error.message }, error.status);
    throw error;
  }
};
