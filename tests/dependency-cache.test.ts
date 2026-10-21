import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 从 Astro 的位置解析，验证构建器真正加载的缓存包，而不只验证 vendor 文件。
const require = createRequire(import.meta.url);
const astroRequire = createRequire(require.resolve('astro/package.json'));
// 对比上游时可传绝对路径；默认始终验证 Astro 实际解析到的包。
const CachePolicy = astroRequire(process.env.CACHE_POLICY_TEST_PACKAGE || 'http-cache-semantics');
const url = 'https://cache.example/image.png';
const headers = { host: 'cache.example', cookie: 'visitor=alice' };

function policy(response: Record<string, string>, request: Record<string, string> = {}, shared = true) {
  const entry = new CachePolicy(
    { url, method: 'GET', headers: { ...headers, ...request } },
    { status: 200, headers: response },
    { shared },
  );
  // 固定经过 10 秒，避免时钟精度让 max-age=0 的用例偶发变成“刚好新鲜”。
  const received = entry.toObject().t;
  entry.now = () => received + 10_000;
  return entry;
}

function incoming(cacheControl = 'max-stale=86400', extra: Record<string, string> = {}) {
  return { url, method: 'GET', headers: { ...headers, cookie: 'visitor=bob', 'cache-control': cacheControl, ...extra } };
}

describe('Astro 实际使用的 HTTP 缓存安全边界', () => {
  it.skipIf(Boolean(process.env.CACHE_POLICY_TEST_PACKAGE))('实际安装的源码与审查过的 vendor 源码一致', () => {
    const installed = readFileSync(astroRequire.resolve(process.env.CACHE_POLICY_TEST_PACKAGE || 'http-cache-semantics'), 'utf8');
    const reviewed = readFileSync(new URL('../vendor/http-cache-semantics/index.js', import.meta.url), 'utf8');
    expect(installed.replace(/\r\n/g, '\n')).toBe(reviewed.replace(/\r\n/g, '\n'));
  });

  const prohibited = [
    { name: '共享 Set-Cookie', response: { 'cache-control': 'max-age=600', 'set-cookie': 'session=alice' } },
    { name: 'private', response: { 'cache-control': 'private, max-age=600' } },
    { name: '响应 no-store', response: { 'cache-control': 'no-store, max-age=600' } },
    { name: '原请求 no-store', response: { 'cache-control': 'max-age=600' }, request: { 'cache-control': 'no-store' } },
    { name: '响应 no-cache', response: { 'cache-control': 'no-cache, max-age=600' } },
    { name: '未授权共享的 Authorization', response: { 'cache-control': 'max-age=600' }, request: { authorization: 'Bearer alice' } },
    { name: 'proxy-revalidate', response: { 'cache-control': 'proxy-revalidate, max-age=600' } },
    { name: 'Vary: *', response: { 'cache-control': 'max-age=600', vary: '*' } },
  ];

  for (const fixture of prohibited) {
    for (const directive of ['max-stale', 'max-stale=86400']) {
      it(`${fixture.name} 的零寿命条目不能被 ${directive} 复活`, () => {
        const entry = policy(fixture.response, fixture.request);
        expect(entry.maxAge()).toBe(0);
        const result = entry.evaluateRequest(incoming(directive));
        expect(result.response).toBeUndefined();
        expect(result.revalidation?.synchronous).toBe(true);
        expect(entry.satisfiesWithoutRevalidation(incoming(directive))).toBe(false);
      });
    }

    it(`${fixture.name} 不能经 stale 扩展绕过重验证`, () => {
      const entry = policy({ ...fixture.response, 'cache-control': `${fixture.response['cache-control']}, stale-while-revalidate=86400, stale-if-error=86400` }, fixture.request);
      expect(entry.evaluateRequest(incoming()).response).toBeUndefined();
      expect(entry.useStaleWhileRevalidate()).toBe(false);
      expect(entry.revalidatedPolicy(incoming(), { status: 500, headers: {} }).modified).toBe(true);
    });
  }

  it('s-maxage 的过期条目仍要求共享缓存重验证', () => {
    for (const value of ['0', '5']) {
      const entry = policy({ 'cache-control': `s-maxage=${value}, max-age=600, stale-if-error=86400, stale-while-revalidate=86400` });
      expect(entry.satisfiesWithoutRevalidation(incoming())).toBe(false);
      expect(entry.useStaleWhileRevalidate()).toBe(false);
      expect(entry.revalidatedPolicy(incoming(), { status: 500, headers: {} }).modified).toBe(true);
    }
  });

  it('must-revalidate 的过期响应不能经 max-stale 或错误回退复用', () => {
    const entry = policy({ 'cache-control': 'must-revalidate, max-age=0, stale-if-error=86400' });
    expect(entry.satisfiesWithoutRevalidation(incoming())).toBe(false);
    expect(entry.revalidatedPolicy(incoming(), { status: 500, headers: {} }).modified).toBe(true);
  });

  it('从磁盘恢复的旧缓存策略仍受共享 Cookie 保护', () => {
    const saved = policy({ 'cache-control': 'max-age=600', 'set-cookie': 'session=alice' }).toObject();
    const restored = CachePolicy.fromObject(saved);
    restored.now = () => saved.t + 10_000;
    expect(restored.evaluateRequest(incoming()).response).toBeUndefined();
  });

  it('新请求的 Authorization 不能使匿名共享条目变成已授权响应', () => {
    const entry = policy({ 'cache-control': 'max-age=600, stale-if-error=86400' });
    expect(entry.evaluateRequest(incoming('', { authorization: 'Bearer bob' })).response).toBeUndefined();
    expect(entry.revalidatedPolicy(incoming('', { authorization: 'Bearer bob' }), { status: 500, headers: {} }).modified).toBe(true);
  });

  it('普通 max-age=0 仍能遵循 max-stale，并保持 Cookie 请求语义', () => {
    const entry = policy({ 'cache-control': 'max-age=0' });
    expect(entry.satisfiesWithoutRevalidation(incoming('max-stale=60'))).toBe(true);
    expect(entry.satisfiesWithoutRevalidation(incoming('max-stale=5'))).toBe(false);
    expect(entry.satisfiesWithoutRevalidation(incoming('no-cache, max-stale=60'))).toBe(false);
  });

  it('public/immutable 明确允许的 Set-Cookie 仍可复用', () => {
    for (const directive of ['public', 'immutable']) {
      const entry = policy({ 'cache-control': `${directive}, max-age=0`, 'set-cookie': 'session=shared' });
      expect(entry.evaluateRequest(incoming()).response?.headers['set-cookie']).toBe('session=shared');
    }
  });

  it('私有缓存仍能按 max-stale 复用自己的 private/认证/Cookie 响应', () => {
    const entry = policy({ 'cache-control': 'private, max-age=0', 'set-cookie': 'session=alice' }, { authorization: 'Bearer alice' }, false);
    expect(entry.satisfiesWithoutRevalidation(incoming('max-stale=60', { cookie: 'visitor=alice', authorization: 'Bearer alice' }))).toBe(true);
  });

  it('Vary: Cookie 匹配和 Vary: * 仍阻止跨请求复用', () => {
    const entry = policy({ 'cache-control': 'public, max-age=0', vary: 'Cookie' });
    expect(entry.satisfiesWithoutRevalidation(incoming())).toBe(false);
    expect(entry.satisfiesWithoutRevalidation(incoming('max-stale=60', { cookie: 'visitor=alice' }))).toBe(true);
    const wildcard = policy({ 'cache-control': 'public, max-age=0', vary: '*' });
    expect(wildcard.satisfiesWithoutRevalidation(incoming())).toBe(false);
  });

  for (const mismatch of ['cookie', 'url', 'host']) {
    it(`stale-if-error 不能向 ${mismatch} 不匹配的请求返回旧正文`, () => {
      const entry = policy({ 'cache-control': 'public, max-age=0, stale-if-error=60', vary: 'Cookie' });
      const request = incoming('', { cookie: 'visitor=alice' });
      if (mismatch === 'cookie') request.headers.cookie = 'visitor=bob';
      if (mismatch === 'url') request.url = 'https://cache.example/other.png';
      if (mismatch === 'host') request.headers.host = 'other.example';
      expect(entry.evaluateRequest(request).response).toBeUndefined();
      expect(entry.revalidatedPolicy(request, { status: 500, headers: {} }).modified).toBe(true);
    });
  }

  it('允许共享的认证响应与普通 stale 扩展仍可工作', () => {
    const fresh = policy({ 'cache-control': 'public, max-age=600' }, { authorization: 'Bearer alice' });
    expect(fresh.satisfiesWithoutRevalidation(incoming('', { authorization: 'Bearer bob' }))).toBe(true);
    const stale = policy({ 'cache-control': 'public, max-age=0, stale-while-revalidate=60, stale-if-error=60' });
    expect(stale.evaluateRequest(incoming('')).revalidation?.synchronous).toBe(false);
    expect(stale.revalidatedPolicy(incoming(''), { status: 500, headers: {} }).modified).toBe(false);
  });
});
