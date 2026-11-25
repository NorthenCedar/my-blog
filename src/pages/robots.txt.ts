import type { APIContext } from 'astro';

// 由 site 配置生成，而不是在 public/ 里手写 —— 换域名就不用记着改两个地方
export async function GET({ site }: APIContext) {
  const sitemap = new URL('sitemap-index.xml', site).href;
  return new Response(`User-agent: *\nAllow: /\n\n# Looking for BEACON? Every signal starts at /posts/monitor-progress/\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
