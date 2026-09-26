/** 说说配图产物核对（_tmp 前缀 = 临时证据）：把 <img> 标签原样打出来 */
import { readFileSync } from 'node:fs';
const html = readFileSync('<博客仓库>\\dist\\talks\\index.html', 'utf8');
const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
console.log('说说页里的 <img> 数量:', imgs.length);
for (const t of imgs) console.log('  ' + t);
console.log('含 srcset:', imgs.some((t) => t.includes('srcset')));
console.log('含 alt:', imgs.map((t) => (t.match(/alt="([^"]*)"/) ?? [, '(无)'])[1]).join(' | '));
console.log('转成了 webp:', imgs.some((t) => t.includes('.webp')));
