/* =============================================================================
 * favicon.ico 生成器 —— 2026-10-07
 *
 * ★ 为什么需要它：`public/favicon.ico` 是**入库的产物**，而浏览器即使页面只声明了
 *   `rel="icon" href="/favicon.svg"`，仍会去请求 `/favicon.ico`（缺了就是一条 404，
 *   历史上正是它把 Lighthouse 最佳实践从 100 拉到 96）。产物入库、配方却不入库
 *   ⇒ 改了 favicon.svg 之后 .ico 会静静留在上一版，两边不一致且无从复现。
 *   所以配方放在这里，与 favicon.svg 同一个仓库。
 *
 * 形状的来源是 `src/components/BootIntro.astro` 里的 MARK 常量（站点唯一的 ∞ 定义），
 * 本脚本只读 favicon.svg，不重复一份几何。
 *
 * 用法：node scripts/make-favicon-ico.mjs
 * 输出：public/favicon.ico（16 / 32 / 48 三档，PNG-in-ICO —— Vista 起全平台支持，
 *       体积比 BMP-in-ICO 小得多；旧版只含一张 32×32 的 BMP）
 * ============================================================================= */

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const SVG = new URL('../public/favicon.svg', import.meta.url);
const ICO = new URL('../public/favicon.ico', import.meta.url);
const SIZES = [16, 32, 48];

const svg = readFileSync(SVG);

const pngs = [];
for (const size of SIZES) {
  // density 拉高再缩：让 SVG 的矢量在光栅化时有足够采样密度
  const buf = await sharp(svg, { density: 900 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  pngs.push({ size, buf });
}

const HEADER = 6, ENTRY = 16;
const header = Buffer.alloc(HEADER);
header.writeUInt16LE(0, 0);           // reserved
header.writeUInt16LE(1, 2);           // type = 1（图标）
header.writeUInt16LE(pngs.length, 4); // 图像数

let offset = HEADER + ENTRY * pngs.length;
const dirs = [];
for (const p of pngs) {
  const e = Buffer.alloc(ENTRY);
  e.writeUInt8(p.size === 256 ? 0 : p.size, 0); // 宽（256 记 0）
  e.writeUInt8(p.size === 256 ? 0 : p.size, 1); // 高
  e.writeUInt8(0, 2);                           // 调色板数（真彩记 0）
  e.writeUInt8(0, 3);                           // reserved
  e.writeUInt16LE(1, 4);                        // planes
  e.writeUInt16LE(32, 6);                       // 位深
  e.writeUInt32LE(p.buf.length, 8);             // 本图字节数
  e.writeUInt32LE(offset, 12);                  // 本图数据偏移
  dirs.push(e);
  offset += p.buf.length;
}

const ico = Buffer.concat([header, ...dirs, ...pngs.map((p) => p.buf)]);
writeFileSync(ICO, ico);
console.log(`✓ public/favicon.ico  ${ico.length} B  (${SIZES.join(' / ')})`);
