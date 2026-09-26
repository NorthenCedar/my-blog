#!/usr/bin/env node
/**
 * 光标素材生成器（正式工具）
 *
 * 用法：
 *   node scripts/gen-cursors.mjs          # 生成 public/cursors/*.png（构建/开发前自动跑）
 *   node scripts/gen-cursors.mjs --check  # 只比对不写；素材过期就红（两侧冒烟用）
 *
 * 为什么要在构建期从矢量生成 PNG，而不是直接放两个二进制：
 *   · 浏览器**不支持** SVG 光标（Safari 直接忽略；Chrome/Firefox 支持但有坑），只能用位图；
 *   · 位图没法 diff / 没法review配色 —— 所以矢量源写在这里（可 diff、可改色），PNG 是产物。
 *
 * 尺寸为什么锁 32×32：Safari 对超过 32×32 的光标直接忽略（Chrome/Edge 可到 128）。
 *   想做 HiDPI 双倍图也没有出路 —— `image-set()` 不适用于 cursor。所以统一 32×32。
 *
 * 配色为什么带"描边光晕"：光标会在**纸上和深底上都出现**，纯色一定会有一边看不见。
 *   所以每个图形都先画一层深色光晕（--ink 55%）再压主体，两边都读得出来。
 *   绿色用 --accent-bright #4caf50（深底上的绿；纸面上靠光晕托住）。
 *
 * 只做两个（站主 2026-09-26：能少尽量少）。其余 16 个 PRTS 光标在博客里没有对应场景，
 * 列在 §不做 里：帮助/个人/位置/后台运行(忙)/移动/手写/候选/垂直·水平·对角调整/不可用 —— 见工单 §13。
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public/cursors');
const CHECK = process.argv.includes('--check');
const SIZE = 32;

const INK = '#1a1a1a';
const PAPER = '#fafaf7';
const GREEN = '#4caf50'; // --accent-bright：深底上的绿

/** ① 默认光标 = 准星（四角括号 + 中心点）。中心点就是命中点，热点取 (16,16)。 */
const RETICLE = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <g fill="none" stroke="${INK}" stroke-opacity=".5" stroke-width="4" stroke-linecap="square">
    <path d="M6 13V6h7M19 6h7v7M26 19v7h-7M13 26H6v-7"/>
  </g>
  <g fill="none" stroke="${GREEN}" stroke-width="2.2" stroke-linecap="square">
    <path d="M6 13V6h7M19 6h7v7M26 19v7h-7M13 26H6v-7"/>
  </g>
  <circle cx="16" cy="16" r="3.2" fill="${INK}" fill-opacity=".5"/>
  <circle cx="16" cy="16" r="2.5" fill="${GREEN}"/>
</svg>`;

/** ② 链接光标 = 箭头 + 右下绿块（PRTS「链接选择」的味道）。热点取箭头尖端 (2,2)。
 *  箭头要"白身细描边"：描边粗了会把白芯吃掉，看上去就成了一坨黑箭头。
 *  绿块与箭头之间留 3px 间隙，缩到 1× 也能分辨出"这是链接"。 */
const LINK = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <path d="M2.4 2.4 L2.4 22 L7.2 17.1 L11.3 25.2 L14.9 23.4 L10.8 15.4 L18 15.4 Z"
        fill="${PAPER}" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/>
  <rect x="20.4" y="19.6" width="7.2" height="7.2" fill="${INK}" fill-opacity=".5"/>
  <rect x="21.2" y="20.4" width="5.6" height="5.6" fill="${GREEN}"/>
</svg>`;

/** PNG 的 IHDR：宽高在字节 16..24，颜色类型在字节 25（6 = RGBA） */
function pngInfo(buf) {
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf.readUInt8(25),
    alpha: buf.readUInt8(25) === 6,
    bytes: buf.length,
  };
}

const TARGETS = [
  { name: 'reticle.png', svg: RETICLE, hotspot: '16 16' },
  { name: 'link.png', svg: LINK, hotspot: '2 2' },
];

await mkdir(OUT_DIR, { recursive: true });
let fails = 0;
for (const t of TARGETS) {
  const png = await sharp(Buffer.from(t.svg)).resize(SIZE, SIZE).png({ compressionLevel: 9 }).toBuffer();
  const out = join(OUT_DIR, t.name);
  const current = existsSync(out) ? await readFile(out) : null;
  const same = current !== null && Buffer.compare(current, png) === 0;
  const info = pngInfo(png);

  if (CHECK) {
    const ok = same;
    if (!ok) fails++;
    console.log(
      `判据 光标素材一致性 对象 public/cursors/${t.name} 实测: ${current === null ? '文件不存在' : same ? '与矢量源逐字节相同' : '与矢量源不一致（过期）'} · ${info.width}×${info.height} · alpha=${info.alpha} · ${info.bytes} 字节`,
    );
    continue;
  }
  if (same) {
    console.log(`判据 光标素材 对象 public/cursors/${t.name} 实测: 无变化 · ${info.width}×${info.height} · ${info.bytes} 字节 · 热点 ${t.hotspot}`);
  } else {
    await writeFile(out, png);
    console.log(
      `判据 光标素材 对象 public/cursors/${t.name} 实测: ${current === null ? '新建' : '更新'} · ${info.width}×${info.height} · ${info.bytes} 字节 · 热点 ${t.hotspot}`,
    );
  }
}
if (CHECK) {
  console.log(`判据 光标素材一致性 汇总: ${TARGETS.length - fails}/${TARGETS.length} 与矢量源一致`);
  process.exit(fails === 0 ? 0 : 1);
}
