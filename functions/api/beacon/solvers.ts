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

    const claimCheck = validateSolverClaim(payload);
    if (!claimCheck.ok) return beaconJson({ error: claimCheck.error }, 400);

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const ipHash = await hashIp(ip);
    const limits = await env.COMMENTS_DB.batch(
      writeLimitStatements(env, 'beacon:claim:ip', ipHash, BEACON_CLAIM_RATE_MAX, Date.now()),
    );
    if (!limits[1].results?.length) {
      return beaconJson({ error: '登记过于频繁，请稍后再试' }, 429);
    }

    const solvedAt = new Date().toISOString();
    const { codename, note } = claimCheck.value;

    const runInsert = async () => {
      const existing = await env.COMMENTS_DB.prepare(
        'SELECT id, codename, note, solved_at FROM beacon_solvers WHERE token_nonce = ? LIMIT 1',
      )
        .bind(tokenCheck.nonce)
        .first<SolverRow>();
      if (existing) {
        return { duplicate: true as const, row: existing };
      }

      const inserted = await env.COMMENTS_DB.prepare(
        `INSERT INTO beacon_solvers (token_nonce, codename, note, solved_at)
         VALUES (?, ?, ?, ?)
         RETURNING id, codename, note, solved_at`,
      )
        .bind(tokenCheck.nonce, codename, note, solvedAt)
        .first<SolverRow>();
      return { duplicate: false as const, row: inserted };
    };

    let outcome;
    try {
      outcome = await runInsert();
    } catch (error) {
      if (noSuchTable(error)) {
        await ensureBeaconSolversTable(env.COMMENTS_DB);
        outcome = await runInsert();
      } else if (/UNIQUE constraint failed:\s*beacon_solvers\.token_nonce/i.test(String(error))) {
        const existing = await env.COMMENTS_DB.prepare(
          'SELECT id, codename, note, solved_at FROM beacon_solvers WHERE token_nonce = ? LIMIT 1',
        )
          .bind(tokenCheck.nonce)
          .first<SolverRow>();
        if (existing) {
          outcome = { duplicate: true as const, row: existing };
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    if (!outcome.row) return beaconJson({ error: '记录写入失败，请重试' }, 500);
    const countRow = await env.COMMENTS_DB.prepare(
      'SELECT COUNT(*) AS total FROM beacon_solvers',
    ).first<{ total: number }>();

    if (outcome.duplicate) {
      return beaconJson(
        {
          ok: false,
          alreadyClaimed: true,
          error: `本次解锁凭证已登记为第 ${outcome.row.id} 位通关者`,
          entry: toPublicSolver(outcome.row),
          total: Number(countRow?.total ?? 0),
        },
        409,
      );
    }

    return beaconJson(
      {
        ok: true,
        entry: toPublicSolver(outcome.row),
        total: Number(countRow?.total ?? 0),
      },
      201,
    );
  } catch (error) {
    if (error instanceof AccountError) return beaconJson({ error: error.message }, error.status);
    return beaconJson({ error: '通关登记暂时不可用' }, 500);
  }
};
