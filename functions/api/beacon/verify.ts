import {
  BEACON_BUNDLE_FILENAME,
  BEACON_DOCS,
  BEACON_VERIFY_RATE_MAX,
  beaconJson,
  ensureBeaconSolversTable,
  parseBeaconKey,
  parseStoredHashes,
  signUnlockToken,
  validateSolverClaim,
  verifyBeaconKey,
  type BeaconEnv,
} from '../_lib/beacon';
import { guardPublicWrite, readJsonBody, writeLimitStatements } from '../_lib/public-write';
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

export const onRequestPost: PagesFunction<BeaconEnv> = async ({ request, env }) => {
  try {
    guardPublicWrite(request);
    const payload = await readJsonBody(request, 2048);

    if (payload.agreed !== true) {
      return beaconJson({ ok: false, error: '请先勾选确认：仅限本人设备或授权实验环境学习使用' }, 400);
    }

    const signingKey = (env.BEACON_SIGNING_KEY ?? '').trim();
    const stored = parseStoredHashes(env.BEACON_HASHES);
    if (!signingKey || !stored) {
      return beaconJson({ ok: false, error: '信标校验密钥尚未在服务端完成配置' }, 503);
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const ipHash = await hashIp(ip);
    const limits = await env.COMMENTS_DB.batch(
      writeLimitStatements(env, 'beacon:verify:ip', ipHash, BEACON_VERIFY_RATE_MAX, Date.now()),
    );
    if (!limits[1].results?.length) {
      return beaconJson({ ok: false, error: '校验尝试过于频繁，请 1 分钟后再试' }, 429);
    }

    const parsed = parseBeaconKey(payload.key);
    if (!parsed) {
      return beaconJson(
        {
          ok: false,
          matched: [false, false, false, false],
          error: '口令格式不对，请按 BEACON-碎片1-碎片2-碎片3-碎片4 输入',
        },
        400,
      );
    }

    const result = await verifyBeaconKey(parsed, signingKey, stored);
    if (!result.ok) {
      const wrongIdx = result.matched
        .map((ok, i) => (ok ? 0 : i + 1))
        .filter((n) => n > 0);
      const hint = wrongIdx.length
        ? `第 ${wrongIdx.join('、')} 段不匹配`
        : '整体校验未通过';
      return beaconJson(
        {
          ok: false,
          matched: result.matched,
          error: `信标校验未通过（${hint}）`,
        },
        403,
      );
    }

    // 识别当前登录身份：站主账号测试不计入通关名录，普通访客/读者解锁即自动计入排名
    let account = null;
    try {
      account = await currentAccount(request, env);
    } catch {
      account = null;
    }
    const isOwner = Boolean(account && env.OWNER_USER_ID && account.id === env.OWNER_USER_ID);
    const { token, expiresAt, nonce } = await signUnlockToken(signingKey);

    let rank: number | null = null;
    let codename = '匿名信号';
    let total = 0;

    if (isOwner) {
      try {
        const row = await env.COMMENTS_DB.prepare('SELECT COUNT(*) AS total FROM beacon_solvers').first<{ total: number }>();
        total = Number(row?.total ?? 0);
      } catch (error) {
        if (!noSuchTable(error)) throw error;
      }
    } else {
      const fallbackName = account?.nickname?.trim() ?? '';
      const checkedName = validateSolverClaim({ codename: fallbackName, note: '' });
      codename = checkedName.ok ? checkedName.value.codename : '匿名信号';
      const solvedAt = new Date().toISOString();

      const insertSolver = async () => {
        const inserted = await env.COMMENTS_DB.prepare(
          `INSERT INTO beacon_solvers (token_nonce, codename, note, solved_at)
           VALUES (?, ?, '', ?)
           RETURNING id, codename, note, solved_at`,
        )
          .bind(nonce, codename, solvedAt)
          .first<SolverRow>();
        const countRow = await env.COMMENTS_DB.prepare('SELECT COUNT(*) AS total FROM beacon_solvers').first<{ total: number }>();
        return { inserted, total: Number(countRow?.total ?? 0) };
      };

      try {
        const resInsert = await insertSolver();
        rank = resInsert.inserted?.id ?? null;
        codename = resInsert.inserted?.codename ?? codename;
        total = resInsert.total;
      } catch (error) {
        if (noSuchTable(error)) {
          await ensureBeaconSolversTable(env.COMMENTS_DB);
          const resInsert = await insertSolver();
          rank = resInsert.inserted?.id ?? null;
          codename = resInsert.inserted?.codename ?? codename;
          total = resInsert.total;
        } else {
          throw error;
        }
      }
    }

    return beaconJson({
      ok: true,
      matched: [true, true, true, true],
      token,
      expiresAt,
      bundleName: BEACON_BUNDLE_FILENAME,
      docs: Object.values(BEACON_DOCS).map(({ id, title }) => ({ id, title })),
      isOwner,
      rank,
      codename,
      total,
    });
  } catch (error) {
    if (error instanceof AccountError) return beaconJson({ ok: false, error: error.message }, error.status);
    return beaconJson({ ok: false, error: '校验服务暂时不可用，请稍后重试' }, 500);
  }
};
