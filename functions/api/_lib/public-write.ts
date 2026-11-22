import { fail } from './visitor-core';
import type { VisitorEnv } from './visitor-store';

export const SLUG_LIST_RAW_MAX = 16 * 1024;

/** 拒绝公开接口上的未知或重复查询参数，避免随机参数穿透缓存或探测结构。 */
export function hasOnlyQueryParams(url: URL, allowed: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/** 匿名 CLI 可省 Origin。浏览器明确来自其他源的请求一律拒绝。 */
export function guardSameOrigin(request: Request, requireOrigin = false) {
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if ((origin === null ? requireOrigin : origin !== new URL(request.url).origin) || site === 'cross-site' || site === 'same-site') {
    fail(403, '请从本站页面操作');
  }
}

export function guardPublicWrite(request: Request, requireOrigin = false) {
  guardSameOrigin(request, requireOrigin);
  if ((request.headers.get('Content-Type') ?? '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') fail(415, '请求格式不对');
}

/** 先用声明长度快速拒绝，读取时再以实际字节数为准。 */
async function readBody(request: Request, maximum: number, sizeError: string) {
  const length = request.headers.get('Content-Length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > maximum) fail(413, sizeError);
  const reader = request.body?.getReader();
  if (!reader) return null;
  let bytes = new Uint8Array(0);
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read().catch(() => fail(400, '无法读取请求正文'));
      if (done) return bytes.subarray(0, size);
      const nextSize = size + value.byteLength;
      if (nextSize > maximum) {
        void reader.cancel().catch(() => {});
        fail(413, sizeError);
      }
      if (nextSize > bytes.byteLength) {
        const larger = new Uint8Array(Math.min(maximum, Math.max(nextSize, bytes.byteLength * 2)));
        larger.set(bytes);
        bytes = larger;
      }
      bytes.set(value, size);
      size = nextSize;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function guardEmptyBody(request: Request) {
  await readBody(request, 0, '请求不应包含正文');
}

export async function readJsonBody(request: Request, maximum: number, sizeError = '请求太大') {
  const { payload } = await readJsonBodyWithSize(request, maximum, sizeError);
  return payload;
}

export async function readJsonBodyWithSize(request: Request, maximum: number, sizeError = '请求太大') {
  const bytes = await readBody(request, maximum, sizeError);
  if (!bytes) return fail(400, '请求为空');
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return fail(400, '请求格式不对'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail(400, '请求格式不对');
  return { payload: payload as Record<string, unknown>, byteLength: bytes.byteLength };
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
