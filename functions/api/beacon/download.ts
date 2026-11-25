import {
  BEACON_BUNDLE_FILENAME,
  BEACON_BUNDLE_KEY,
  beaconJson,
  verifyUnlockToken,
  type BeaconEnv,
} from '../_lib/beacon';
import { guardSameOrigin, hasOnlyQueryParams } from '../_lib/public-write';
import { AccountError } from '../_lib/visitor-core';

export const onRequestGet: PagesFunction<BeaconEnv> = async ({ request, env }) => {
  try {
    guardSameOrigin(request);
    const url = new URL(request.url);
    if (!hasOnlyQueryParams(url, ['t'])) return beaconJson({ error: '查询参数不合法' }, 400);

    const signingKey = (env.BEACON_SIGNING_KEY ?? '').trim();
    if (!signingKey || !env.BEACON_VAULT) {
      return beaconJson({ error: '私有存储尚未完成绑定配置' }, 503);
    }

    const check = await verifyUnlockToken(url.searchParams.get('t'), signingKey);
    if (!check.ok) return beaconJson({ error: check.error }, 403);

    const obj = await env.BEACON_VAULT.get(BEACON_BUNDLE_KEY);
    if (!obj) return beaconJson({ error: '归档文件暂未上传到私有存储' }, 404);

    const headers = new Headers({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${BEACON_BUNDLE_FILENAME}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    if (typeof obj.size === 'number') headers.set('Content-Length', String(obj.size));
    return new Response(obj.body, { status: 200, headers });
  } catch (error) {
    if (error instanceof AccountError) return beaconJson({ error: error.message }, error.status);
    return beaconJson({ error: '下载服务暂时不可用' }, 500);
  }
};
