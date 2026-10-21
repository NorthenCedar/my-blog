import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getSite } from '../lib/site';

/** 构建期生成默认分享封面，沿用站名、标志及设计色值，不添加访客运行时图片服务。 */
export const prerender = true;
export const GET: APIRoute = async ({ site, url }) => {
  const data = await getSite();
  const tokens = await readFile('src/styles/tokens.css', 'utf8');
  const color = (name: string) => {
    const value = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6,8})\\b`))?.[1];
    if (!value) throw new Error(`分享封面缺少颜色变量 ${name}`);
    return value;
  };
  const icon = await readFile('public/favicon.svg', 'utf8');
  const mark = icon.match(/<path\s+d="([^"]+)"/)?.[1];
  if (!mark) throw new Error('分享封面缺少站点标志');
  const escape = (text: string) => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="${color('paper')}"/>
    <path d="M72 72H1128V558H72Z" fill="none" stroke="${color('hair')}"/>
    <path d="${mark}" transform="translate(70 100) scale(10)" fill="none" stroke="${color('accent-ink')}" stroke-width=".6" stroke-linecap="round"/>
    <path d="M96 280H1104" stroke="${color('hair')}"/>
    <text x="96" y="384" font-family="sans-serif" font-size="64" font-weight="600" fill="${color('ink')}">${escape(data.wordmark)}</text>
    <text x="96" y="480" font-family="monospace" font-size="24" letter-spacing="3" fill="${color('accent-ink')}">${escape(new URL(site ?? url).host)}</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
