import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/_middleware';
import csp from '../functions/api/_generated/document-csp.json';
import { documentCsp } from '../src/lib/build-browser-security.mjs';

const inline = "document.documentElement.classList.add('ready');";
const trusted = new Set([inline]);
const script = { file: 'fixture.html', type: '', src: undefined, text: inline };

describe('构建期浏览器策略', () => {
  it('授权可信模板中的脚本字节，数据脚本不需要执行许可', () => {
    const hash = createHash('sha256').update(inline).digest('base64');
    const policy = documentCsp([
      script,
      { ...script, type: 'module', src: '/_astro/fixture.js' },
      { ...script, type: 'application/json', text: '{"name":"测试数据"}' },
    ], trusted);
    expect(policy).toContain(`script-src 'self' 'wasm-unsafe-eval' 'sha256-${hash}'`);
    expect(policy.match(/sha256-/g)).toHaveLength(1);
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it('来源不明的脚本停止构建', () => {
    expect(() => documentCsp([{ ...script, text: "console.log('未声明模块');" }], trusted)).toThrow(/可信模板/);
    expect(() => documentCsp([{ ...script, src: 'https://example.test/widget.js' }], trusted)).toThrow(/Astro 本地打包/);
  });

  it('Pages 静态规则与 Functions 使用同一脚本策略并保留静态长缓存', () => {
    const headers = readFileSync('dist/_headers', 'utf8');
    expect(headers).toContain(`Content-Security-Policy: ${csp}`);
    expect(headers).toContain('/_astro/*\n  Cache-Control: public, max-age=31536000, immutable');
    expect(headers).toContain('X-Frame-Options: SAMEORIGIN');
    expect(headers.split('\n').every(line => line.length <= 2000)).toBe(true);
  });
});

async function throughMiddleware(path: string, response: Response) {
  return onRequest({
    request: new Request(`https://example.test${path}`),
    next: async () => response,
  } as never);
}

describe('Pages Functions 经过公共中间件的响应头', () => {
  it('直接返回 HTML 和 404 都保留原响应并发送文档策略', async () => {
    const missing = await throughMiddleware('/missing/', new Response('页面不存在', {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }));
    expect(await missing.text()).toBe('页面不存在');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Content-Security-Policy')).toBe(csp);
    expect(missing.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('保护 API 的同源读取和默认缓存，同时保留统计的公开缓存与头像策略', async () => {
    const original = "default-src 'none'; sandbox";
    const avatar = await throughMiddleware('/api/avatars', new Response(null, {
      headers: { 'Content-Type': 'image/png', 'Content-Security-Policy': original },
    }));
    expect(avatar.headers.get('Content-Security-Policy')).toBe(original);
    expect(avatar.headers.get('Cache-Control')).toBe('no-store');
    expect(avatar.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    const stats = await throughMiddleware('/api/stats', Response.json({}, { headers: { 'Cache-Control': 'public, max-age=60' } }));
    expect(stats.headers.get('Cache-Control')).toBe('public, max-age=60');
  });
});
