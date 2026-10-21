import { fail } from './visitor-core';
import type { VisitorEnv } from './visitor-store';

/** 匿名 CLI 可省 Origin；浏览器显式跨站/不透明来源一律拒绝。 */
export function guardPublicWrite(request: Request) {
  const origin = request.headers.get('Origin');
  if ((origin !== null && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') fail(403, '请从本站页面操作');
  if ((request.headers.get('Content-Type') ?? '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') fail(415, '请求格式不对');
}

/** 在 JSON 解析之前按实际字节数限额，Content-Length 缺省或伪造也不能绕过。 */
export async function readJsonBody(request: Request, maximum: number, sizeError = '请求太大') {
  const reader = request.body?.getReader();
  if (!reader) return fail(400, '请求为空');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); fail(413, sizeError); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try {
    const payload = JSON.parse(new TextDecoder().decode(all));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail(400, '请求格式不对');
    return payload as Record<string, unknown>;
  } catch { return fail(400, '请求格式不对'); }
}

/** 同一 SQL 内核对最近 60 秒用量并占额；并发请求不能读到同一份剩余额度。 */
export function writeLimitStatements(env: VisitorEnv, scope: string, ipHash: string, maximum: number, now: number, unless = '', unlessValues: unknown[] = []) {
  const since = now - 60000;
  return [
    // 清理整个公共 scope，首次来访后不再回来的 IP 也不会永久留下记录。
    // 账户注册等 scope 使用更长窗口，不参与这里的回收。
    env.COMMENTS_DB.prepare('DELETE FROM visitor_rate_limits WHERE scope = ? AND window_start <= ?').bind(scope, since),
    env.COMMENTS_DB.prepare(`INSERT INTO visitor_rate_limits (scope,key_hash,window_start,hits)
      SELECT ?,?,?,1 WHERE (SELECT COALESCE(SUM(hits),0) FROM visitor_rate_limits WHERE scope = ? AND key_hash = ? AND window_start > ?) < ?
      ${unless ? `AND NOT EXISTS (${unless})` : ''}
      ON CONFLICT(scope,key_hash,window_start) DO UPDATE SET hits = hits + 1 RETURNING hits`)
      .bind(scope, ipHash, now, scope, ipHash, since, maximum, ...unlessValues),
  ];
}
