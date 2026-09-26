#!/usr/bin/env node
/**
 * 光标素材生成器（正式工具）
 *
 * 用法：
 *   node scripts/gen-cursors.mjs          # 生成 public/cursors/*.png（构建/开发前自动跑）
 *   node scripts/gen-cursors.mjs --check  # 只比对不写；素材过期就红（两侧冒烟用）
 *
 * 三个光标 = 站主 2026-09-26 指定的 PRTS 原版三件套，映射与浏览器语义一一对应：
 *   正常选择   → default（普通箭头）
 *   文本选择   → text   （带喇叭衬线的 I 型）
 *   链接选择   → pointer（箭头 + 右下小回旋箭头）
 *
 * 为什么要在构建期从矢量生成 PNG，而不是直接放三个二进制：
 *   · 浏览器**不支持** SVG 光标（Safari 直接忽略），只能用位图；
 *   · 位图没法 diff、没法 review 折面与描边 —— 所以矢量源写在这里（可 diff、可改色），PNG 是产物。
 *
 * 尺寸为什么锁 32×32：Safari 对超过 32×32 的光标直接忽略（Chrome/Edge 可到 128）。
 *   HiDPI 双倍图也没有出路 —— `image-set()` 不适用于 cursor。
 *
 * 一处在原版基础上**必须改**的地方：原版是深底网页上的纯白结晶（无描边）。
 *   本站是纸白底（--paper #fafaf7），纯白光标会直接看不见 ⇒ 每个图形都加一圈深色描边（--ink 70%）
 *   并把折面压深一档。深色底（代码块/控制台）上依然是白的，两边都读得出来。
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

/* 结晶配色：主体接近纯白，折面压深两档；描边用站点墨色，阴影用墨色低透明度叠两层（不依赖滤镜，librsvg 也稳） */
const WHITE = '#ffffff';
const FACET_1 = '#e4e4df';
const FACET_2 = '#c9c9c3';
const INK = '#1a1a1a';

/** 阴影：把轮廓整体偏移一点点、叠两层低透明度（比高斯模糊更稳，任何渲染器都不会走样） */
const shadow = (d) => `
  <path d="${d}" fill="${INK}" fill-opacity=".10" transform="translate(1.4 1.7)"/>
  <path d="${d}" fill="${INK}" fill-opacity=".07" transform="translate(2.6 3.1)"/>`;

/**
 * 正常选择 / 链接选择的"结晶箭头"：**不是标准鼠标箭头**，而是参考图那种
 * 「一片细长刀刃 + 下方三片碎晶」的结构。每片各自描边 ⇒ 内部棱线自然显现，这就是结晶感的来源。
 * 顺序：先画暗片，刀刃最后压在顶上。尖端固定在 (2,2) 以便热点对齐。
 */
const BLADE = 'M2 2 L5.6 18.2 L12.2 8.4 Z';
const SHARD_L = 'M4.4 16.6 L7.4 27 L11.2 19.2 Z';
const SHARD_D = 'M9.6 15.2 L14.8 25.4 L16.6 17.2 Z';
const SHARD_R = 'M11.4 9.6 L18.8 14.6 L15.2 18.2 Z';
const CRYSTAL = `
  <path d="${BLADE}" fill="none" stroke="${INK}" stroke-opacity=".10" stroke-width="2.6" stroke-linejoin="round" transform="translate(1.5 1.8)"/>
  <path d="${SHARD_L}" fill="${FACET_2}" stroke="${INK}" stroke-opacity=".7" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="${SHARD_D}" fill="${FACET_1}" stroke="${INK}" stroke-opacity=".7" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="${SHARD_R}" fill="${FACET_1}" stroke="${INK}" stroke-opacity=".7" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="${BLADE}" fill="${WHITE}" stroke="${INK}" stroke-opacity=".7" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M3.4 4.4 L4.6 4.4 L6.4 15.8 Z" fill="${FACET_1}"/>`;

/** ① 正常选择 → default */
const NORMAL = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${CRYSTAL}</svg>`;

/** ② 文本选择 / 静态 I：喇叭衬线 I 型（热点在正中 = 浏览器文本光标的约定） */
const TEXT = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${shadow('M11 5.2h10l-2.6 3.4h-4.8zM11 26.8h10l-2.6-3.4h-4.8zM14.5 8.6h3v14.8h-3z')}
  <path d="M11 5.2h10l-2.6 3.4h-4.8z" fill="${WHITE}"/>
  <path d="M11 26.8h10l-2.6-3.4h-4.8z" fill="${WHITE}"/>
  <path d="M14.5 8.6h3v14.8h-3z" fill="${WHITE}"/>
  <path d="M16 8.6h1.5v14.8h-1.5z" fill="${FACET_2}"/>
  <path d="M18.7 5.2h2.3l-2.6 3.4h-1.3z" fill="${FACET_1}"/>
  <path d="M18.7 26.8h2.3l-2.6-3.4h-1.3z" fill="${FACET_1}"/>
  <g fill="none" stroke="${INK}" stroke-opacity=".7" stroke-width="1.2" stroke-linejoin="round">
    <path d="M11 5.2h10l-2.6 3.4h-4.8z"/>
    <path d="M11 26.8h10l-2.6-3.4h-4.8z"/>
    <path d="M14.5 8.6h3v14.8h-3z"/>
  </g>
</svg>`;

/** ③ 链接选择 → pointer：同一枚结晶箭头 + 右下小回旋箭头 */
const LINK_CURVE = 'M19.6 27.4 Q21.4 21.8 27.2 21.8';
const LINK = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  ${CRYSTAL}
  <!-- 右下小回旋箭头：先描一层墨色再压白，保证纸面上也看得见 -->
  <path d="${LINK_CURVE}" fill="none" stroke="${INK}" stroke-opacity=".7" stroke-width="3.4" stroke-linecap="round"/>
  <path d="${LINK_CURVE}" fill="none" stroke="${WHITE}" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M27 18.4 L31 21.8 L27 25.2 Z" fill="${WHITE}" stroke="${INK}" stroke-opacity=".7" stroke-width="1.2" stroke-linejoin="round"/>
</svg>`;

/** PNG 的 IHDR：宽高在字节 16..24，颜色类型在字节 25（6 = RGBA） */
function pngInfo(buf) {
  return { width: buf.readUInt16BE ? buf.readUInt32BE(16) : 0, height: buf.readUInt32BE(20), alpha: buf.readUInt8(25) === 6, bytes: buf.length };
}

const TARGETS = [
  { name: 'normal.png', svg: NORMAL, hotspot: '2 2', what: '正常选择 → default' },
  { name: 'text.png', svg: TEXT, hotspot: '16 16', what: '文本选择 → text' },
  { name: 'link.png', svg: LINK, hotspot: '2 2', what: '链接选择 → pointer' },
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
    if (!same) fails++;
    console.log(
      `判据 光标素材一致性 对象 public/cursors/${t.name} 实测: ${current === null ? '文件不存在' : same ? '与矢量源逐字节相同' : '与矢量源不一致（过期）'} · ${info.width}×${info.height} · alpha=${info.alpha} · ${info.bytes} 字节 · ${t.what}`,
    );
    continue;
  }
  if (same) {
    console.log(`判据 光标素材 对象 public/cursors/${t.name} 实测: 无变化 · ${info.width}×${info.height} · ${info.bytes} 字节 · 热点 ${t.hotspot}`);
  } else {
    await writeFile(out, png);
    console.log(`判据 光标素材 对象 public/cursors/${t.name} 实测: ${current === null ? '新建' : '更新'} · ${info.width}×${info.height} · ${info.bytes} 字节 · 热点 ${t.hotspot}`);
  }
}
if (CHECK) {
  console.log(`判据 光标素材一致性 汇总: ${TARGETS.length - fails}/${TARGETS.length} 与矢量源一致`);
  process.exit(fails === 0 ? 0 : 1);
}
