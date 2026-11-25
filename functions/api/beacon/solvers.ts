import {
  BEACON_CLAIM_RATE_MAX,
  BEACON_SOLVERS_LIMIT,
  beaconJson,
  ensureBeaconSolversTable,
  validateSolverClaim,
  verifyUnlockToken,
  type BeaconEnv,
} from '../_lib/beacon';
import {
  guardPublicWrite,
  guardSameOrigin,
  hasOnlyQueryParams,
  readJsonBody,
  writeLimitStatements,
} from '../_lib/public-write';
import { hashIp } from '../_lib/reactions-core';
import { AccountError } from '../_lib/visitor-core';
import { currentAccount } from '../_lib/visitor-store';

type SolverRow = {
  id: number;
  codename: string;
  note: string;
  solved_at: string;
};

const noSuchTable = (error: unknown) => /no such table:\s*beacon_solvers\b/i.test(String(error));

const toPublicSolver = (row: SolverRow) => ({
  rank: row.id,
  codename: row.codename,
  note: row.note,
  solvedAt: row.solved_at,
});

export const onRequestGet: PagesFunction<BeaconEnv> = async ({ request, env }) => {
  try {
    guardSameOrigin(request);
    const url = new URL(request.url);
    if (!hasOnlyQueryParams(url, [])) return beaconJson({ error: '查询参数不合法' }, 400);

    try {
      const countRow = await env.COMMENTS_DB.prepare(
        'SELECT COUNT(*) AS total FROM beacon_solvers',
      ).first<{ total: number }>();
      const { results } = await env.COMMENTS_DB.prepare(
        `SELECT id, codename, note, solved_at
           FROM beacon_solvers
          ORDER BY id DESC
          LIMIT ${BEACON_SOLVERS_LIMIT}`,
      ).all<SolverRow>();

      return beaconJson({
        total: Number(countRow?.total ?? 0),
        items: (results ?? []).map(toPublicSolver),
      });
    } catch (error) {
      if (noSuchTable(error)) return beaconJson({ total: 0, items: [] });
      throw error;
    }
  } catch (error) {
    if (error instanceof AccountError) return beaconJson({ error: error.message }, error.status);
    return beaconJson({ error: '无法读取通关记录' }, 500);
  }
};

export const onRequestPost: PagesFunction<BeaconEnv> = async ({ request, env }) => {
  try {
    guardPublicWrite(request);
    const payload = await readJsonBody(request, 2048);

    const signingKey = (env.BEACON_SIGNING_KEY ?? '').trim();
    if (!signingKey) return beaconJson({ error: '信标校验密钥尚未配置' }, 503);

    const tokenCheck = await verifyUnlockToken(payload.token, signingKey);
    if (!tokenCheck.ok) return beaconJson({ error: tokenCheck.error }, 403);

    // 站主账号不占用访客通关名额
    let account = null;
    try {
      account = await currentAccount(request, env);
    } catch {
      account = null;
    }
    if (account && env.OWNER_USER_ID && account.id === env.OWNER_USER_ID) {
      return beaconJson({ ok: false, error: '站主账号不计入通关名录，不会占用访客排名' }, 403);
    }

    const claimCheck = validateSolverClaim(payload);
    if (!claimCheck.ok) return beaconJson({ error: claimCheck.error }, 400);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const ipHash = await hashIp(ip);
    const limits = await env.COMMENTS_DB.batch(
      writeLimitStatements(env, 'beacon:claim:ip', ipHash, BEACON_CLAIM_RATE_MAX, Date.now()),
    );
    if (!limits[1].results?.length) {
      return beaconJson({ error: '操作过于频繁，请稍后再试' }, 429);
    }

    const solvedAt = new Date().toISOString();
    const { codename, note } = claimCheck.value;
    const keepName = payload.keepCodename === true;

    const runUpsert = async () => {
      const existing = await env.COMMENTS_DB.prepare(
        'SELECT id, codename, note, solved_at FROM beacon_solvers WHERE token_nonce = ? LIMIT 1',
      )
        .bind(tokenCheck.nonce)
        .first<SolverRow>();

      if (existing) {
        const nextName = keepName ? existing.codename : codename;
        const updated = await env.COMMENTS_DB.prepare(
          `UPDATE beacon_solvers
              SET codename = ?, note = ?
            WHERE token_nonce = ?
        RETURNING id, codename, note, solved_at`,
        )
          .bind(nextName, note, tokenCheck.nonce)
          .first<SolverRow>();
        return { updated: true as const, row: updated };
      }

      const inserted = await env.COMMENTS_DB.prepare(
        `INSERT INTO beacon_solvers (token_nonce, codename, note, solved_at)
         VALUES (?, ?, ?, ?)
         RETURNING id, codename, note, solved_at`,
      )
        .bind(tokenCheck.nonce, codename, note, solvedAt)
        .first<SolverRow>();
      return { updated: false as const, row: inserted };
    };

    let outcome;
    try {
      outcome = await runUpsert();
    } catch (error) {
      if (noSuchTable(error)) {
        await ensureBeaconSolversTable(env.COMMENTS_DB);
        outcome = await runUpsert();
      } else {
        throw error;
      }
    }

    if (!outcome.row) return beaconJson({ error: '记录写入失败，请重试' }, 500);
    const countRow = await env.COMMENTS_DB.prepare(
      'SELECT COUNT(*) AS total FROM beacon_solvers',
    ).first<{ total: number }>();

    return beaconJson(
      {
        ok: true,
        updated: outcome.updated,
        entry: toPublicSolver(outcome.row),
        total: Number(countRow?.total ?? 0),
      },
      outcome.updated ? 200 : 201,
    );
  } catch (error) {
    if (error instanceof AccountError) return beaconJson({ error: error.message }, error.status);
    return beaconJson({ error: '通关登记暂时不可用' }, 500);
  }
};
