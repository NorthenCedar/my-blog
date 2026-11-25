import {
  BEACON_DOCS,
  beaconJson,
  verifyUnlockToken,
  type BeaconDocId,
  type BeaconEnv,
} from '../_lib/beacon';
import { guardSameOrigin, hasOnlyQueryParams } from '../_lib/public-write';
import { AccountError } from '../_lib/visitor-core';

export const onRequestGet: PagesFunction<BeaconEnv> = async ({ request, env }) => {
  try {
    guardSameOrigin(request);
    const url = new URL(request.url);
    if (!hasOnlyQueryParams(url, ['name', 't'])) return beaconJson({ error: '查询参数不合法' }, 400);

    const rawName = (url.searchParams.get('name') ?? '').trim();
    if (!Object.prototype.hasOwnProperty.call(BEACON_DOCS, rawName)) {
      return beaconJson({ error: '请求的文档不在允许列表中' }, 400);
    }
    const doc = BEACON_DOCS[rawName as BeaconDocId];

    const signingKey = (env.BEACON_SIGNING_KEY ?? '').trim();
    if (!signingKey || !env.BEACON_VAULT) {
      return beaconJson({ error: '私有存储尚未完成绑定配置' }, 503);
    }

    const check = await verifyUnlockToken(url.searchParams.get('t'), signingKey);
    if (!check.ok) return beaconJson({ error: check.error }, 403);

    const obj = await env.BEACON_VAULT.get(doc.key);
    if (!obj) return beaconJson({ error: '文档尚未上传到私有存储' }, 404);

    const markdown = await obj.text();
    return beaconJson({
      ok: true,
      id: doc.id,
      title: doc.title,
      markdown,
    });
  } catch (error) {
    if (error instanceof AccountError) return beaconJson({ error: error.message }, error.status);
    return beaconJson({ error: '文档预览暂时不可用' }, 500);
  }
};
