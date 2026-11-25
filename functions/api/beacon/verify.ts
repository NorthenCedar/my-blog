import {
  BEACON_BUNDLE_FILENAME,
  BEACON_DOCS,
  BEACON_VERIFY_RATE_MAX,
  beaconJson,
  parseBeaconKey,
  parseStoredHashes,
  signUnlockToken,
  verifyBeaconKey,
  type BeaconEnv,
} from '../_lib/beacon';
import { guardPublicWrite, readJsonBody, writeLimitStatements } from '../_lib/public-write';
import { hashIp } from '../_lib/reactions-core';
import { AccountError } from '../_lib/visitor-core';

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

    const { token, expiresAt } = await signUnlockToken(signingKey);
    return beaconJson({
      ok: true,
      matched: [true, true, true, true],
      token,
      expiresAt,
      bundleName: BEACON_BUNDLE_FILENAME,
      docs: Object.values(BEACON_DOCS).map(({ id, title }) => ({ id, title })),
    });
  } catch (error) {
    if (error instanceof AccountError) return beaconJson({ ok: false, error: error.message }, error.status);
    return beaconJson({ ok: false, error: '校验服务暂时不可用，请稍后重试' }, 500);
  }
};
