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
 * 两条素材路线（**刻意的分工**）：
 *   · 正常 / 链接：站主给了参考图，明确要求"别画了，抠图" ⇒ 从 assets/cursors-source/*.png 抠。
 *     为什么必须抠而不是重画：结晶是 3D 折面 + 软阴影，手画 SVG 版本被站主一眼否掉（"太不像了"）。
 *   · 文本：I 型是纯几何，矢量重画更锐利也更好维护 ⇒ 继续用 SVG 渲染。
 *
 * 尺寸为什么两个都出：Safari 忽略 >32×32 的光标，Chrome/Edge/Firefox 可以到 128。
 *   ⇒ 主图 64×64（清晰）、再列一张 32×32 兜底（Safari 用）；两个都失败时落到关键字（系统光标）。
 *   热点按各自尺寸分别给（CSS 里每个 url 后跟自己的热点）。
 *
 * 抠图两个必须注意的坑（都踩过）：
 *   ① 素材里的**软阴影**不能一起抠进来：白面与阴影"与背景的差值"区间重叠，单靠差值分不开
 *      ⇒ 按方向分流：比背景亮的一点点就保留（结晶主体），比背景暗的必须够暗才算折面棱线。
 *   ② sharp 的 `fit: contain` 补边默认是**不透明黑**，且对带 alpha 的 resize 是否预乘没有可靠约定
 *      ⇒ 缩放自己做（预乘 → 盒式平均 → 解预乘），补边也自己留白。
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'assets/cursors-source');
const OUT_DIR = join(ROOT, 'public/cursors');
const CHECK = process.argv.includes('--check');

/* ── 矢量那枚：文本选择 / 静态 I（喇叭衬线 I 型） ───────────────────────── */
const WHITE = '#ffffff';
const FACET_1 = '#e4e4df';
const FACET_2 = '#c9c9c3';
const INK = '#1a1a1a';
const shadow = (d) => `
  <path d="${d}" fill="${INK}" fill-opacity=".10" transform="translate(1.4 1.7)"/>
  <path d="${d}" fill="${INK}" fill-opacity=".07" transform="translate(2.6 3.1)"/>`;
const ibeam = (size) => {
  const s = size / 32; // 以 32 网格设计，按比例放大到 64
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="scale(${s})">
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
  </g>
</svg>`;
};

/* ── 抠图那两枚 ────────────────────────────────────────────────────────── */

/** 找形状包围盒：逐行墨量分带（间隔 ≤3 行算同一带），**只取最上面那一带**（下面是"正常选择/NORMAL SELECT"文字标签）；阈值 Δ>25 把软阴影挡在外面 */
async function shapeBox(name) {
  const { data, info } = await sharp(join(SRC_DIR, `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  let br = 0, bg = 0, bb = 0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const i = (y * W + x) * C; br += data[i]; bg += data[i + 1]; bb += data[i + 2]; }
  br /= 16; bg /= 16; bb /= 16;
  const ink = (x, y) => {
    const i = (y * W + x) * C;
    return Math.max(Math.abs(data[i] - br), Math.abs(data[i + 1] - bg), Math.abs(data[i + 2] - bb)) > 25;
  };
  const rows = [];
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) if (ink(x, y)) n++; rows.push(n); }
  const bands = [];
  let start = -1, gap = 0;
  for (let y = 0; y < H; y++) {
    if (rows[y] > 2) { if (start < 0) start = y; gap = 0; }
    else if (start >= 0) { gap++; if (gap > 3) { bands.push([start, y - gap]); start = -1; } }
  }
  if (start >= 0) bands.push([start, H - 1]);
  const band = bands[0];
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = band[0]; y <= band[1]; y++) for (let x = 0; x < W; x++) if (ink(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  let tipX = -1;
  for (let x = 0; x < W; x++) if (ink(x, y0)) { tipX = x; break; }
  return { x0, x1, y0, y1, tipX, bg: [br, bg, bb] };
}

/** 抠图 + 缩放到 size×size（热点=尖端，返回时一并给出） */
async function matte(name, size) {
  const box = await shapeBox(name);
  const pad = 1;
  const x = Math.max(0, box.x0 - pad), y = Math.max(0, box.y0 - pad);
  const w = box.x1 + pad - x + 1, h = box.y1 + pad - y + 1;
  const [br, bgg, bb] = box.bg;
  const { data, info } = await sharp(join(SRC_DIR, `${name}.png`)).extract({ left: x, top: y, width: w, height: h }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const src = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const i = p * C;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const bright = Math.max(0, Math.max(r - br, g - bgg, b - bb)); // 比背景亮：结晶受光面，低阈值保留
    const dark = Math.max(0, Math.max(br - r, bgg - g, bb - b));   // 比背景暗：必须够暗才算棱线（浅的是烘焙软阴影）
    const a = Math.max(
      Math.max(0, Math.min(1, (bright - 3) / 12)),
      Math.max(0, Math.min(1, (dark - 22) / 16)),
    );
    const lift = (v) => Math.round(255 * Math.pow(v / 255, 0.72)); // 轻微提亮，贴近原版"白结晶"
    src[p * 4] = lift(r);
    src[p * 4 + 1] = lift(g);
    src[p * 4 + 2] = lift(b);
    src[p * 4 + 3] = Math.round(a * 255);
  }

  // 缩放自己做：预乘 → 盒式平均 → 解预乘
  const scale = size / Math.max(W, H);
  const dw = Math.max(1, Math.round(W * scale));
  const dh = Math.max(1, Math.round(H * scale));
  const pre = new Float32Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const a = src[p * 4 + 3] / 255;
    pre[p * 4] = src[p * 4] * a;
    pre[p * 4 + 1] = src[p * 4 + 1] * a;
    pre[p * 4 + 2] = src[p * 4 + 2] * a;
    pre[p * 4 + 3] = a;
  }
  const out = Buffer.alloc(size * size * 4);
  for (let ty = 0; ty < dh; ty++) {
    const sy0 = Math.floor((ty * H) / dh), sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * H) / dh));
    for (let tx = 0; tx < dw; tx++) {
      const sx0 = Math.floor((tx * W) / dw), sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * W) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) { const p = (yy * W + xx) * 4; r += pre[p]; g += pre[p + 1]; b += pre[p + 2]; a += pre[p + 3]; n++; }
      r /= n; g /= n; b /= n; a /= n;
      const t = (ty * size + tx) * 4;
      out[t] = a > 0.004 ? Math.min(255, Math.round(r / a)) : 0;
      out[t + 1] = a > 0.004 ? Math.min(255, Math.round(g / a)) : 0;
      out[t + 2] = a > 0.004 ? Math.min(255, Math.round(b / a)) : 0;
      out[t + 3] = Math.round(a * 255);
    }
  }

  // 1px 深色描边：本站是纸白底，纯白结晶没描边会看不见。薄一点（0.6），厚了会把结晶压成灰贴纸。
  const alpha = new Float32Array(size * size);
  for (let p = 0; p < size * size; p++) alpha[p] = out[p * 4 + 3] / 255;
  for (let yy = 0; yy < size; yy++) {
    for (let xx = 0; xx < size; xx++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = xx + dx, ny = yy + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        m = Math.max(m, alpha[ny * size + nx]);
      }
      const p = yy * size + xx;
      const edgeA = m - alpha[p];
      if (edgeA <= 0.05) continue;
      const t = p * 4;
      const sa = out[t + 3] / 255;
      const ea = Math.min(1, edgeA * 2.3) * 0.6;
      const na = ea + sa * (1 - ea);
      const mix = (c) => Math.round(((c / 255) * sa * (1 - ea) + (26 / 255) * ea) / (na || 1) * 255);
      out[t] = mix(out[t]); out[t + 1] = mix(out[t + 1]); out[t + 2] = mix(out[t + 2]);
      out[t + 3] = Math.round(na * 255);
    }
  }
  const hotspot = [Math.round((box.tipX - x) * scale), Math.round((box.y0 - y) * scale)];
  // 统一返回**编码好的 PNG**（两条路线都返回 PNG，调用方不必再判断是 raw 还是 png）
  return { png: await toPng(out, size), size, hotspot };
}

/** PNG 的 IHDR：宽高在字节 16..24，颜色类型在字节 25（6 = RGBA） */
const pngInfo = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), alpha: buf.readUInt8(25) === 6, bytes: buf.length });
const toPng = (raw, size) => sharp(raw, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();

/** 目标任务表：主图 64（清晰）+ 兜底 32（Safari 上限） */
const TARGETS = [];
for (const name of ['normal', 'link']) {
  for (const size of [64, 32]) TARGETS.push({ file: size === 64 ? `${name}.png` : `${name}-${size}.png`, make: () => matte(name, size), what: `${name} ${size}px（抠图）` });
}
for (const size of [64, 32]) TARGETS.push({ file: size === 64 ? 'text.png' : `text-${size}.png`, make: async () => ({ png: await sharp(Buffer.from(ibeam(size))).png({ compressionLevel: 9 }).toBuffer(), size, hotspot: [size / 2, size / 2] }), what: `text ${size}px（矢量 I 型）` });

await mkdir(OUT_DIR, { recursive: true });
let fails = 0;
const hotspots = {};
for (const t of TARGETS) {
  const { png, hotspot } = await t.make();
  const out = join(OUT_DIR, t.file);
  const current = existsSync(out) ? await readFile(out) : null;
  const same = current !== null && Buffer.compare(current, png) === 0;
  const info = pngInfo(png);
  hotspots[t.file] = hotspot.join(' ');
  if (CHECK) {
    if (!same) fails++;
    console.log(`判据 光标素材一致性 对象 public/cursors/${t.file} 实测: ${current === null ? '文件不存在' : same ? '与真源逐字节相同' : '与真源不一致（过期）'} · ${info.width}×${info.height} · alpha=${info.alpha} · ${info.bytes} 字节 · ${t.what}`);
    continue;
  }
  if (same) {
    console.log(`判据 光标素材 对象 public/cursors/${t.file} 实测: 无变化 · ${info.width}×${info.height} · ${info.bytes} 字节 · 热点 ${hotspots[t.file]}`);
  } else {
    await writeFile(out, png);
    console.log(`判据 光标素材 对象 public/cursors/${t.file} 实测: ${current === null ? '新建' : '更新'} · ${info.width}×${info.height} · ${info.bytes} 字节 · 热点 ${hotspots[t.file]}`);
  }
}
if (CHECK) {
  console.log(`判据 光标素材一致性 汇总: ${TARGETS.length - fails}/${TARGETS.length} 与真源一致`);
  process.exit(fails === 0 ? 0 : 1);
}
console.log('热点（要写进 src/styles/tokens.css 的 --cursor-* 里）: ' + JSON.stringify(hotspots));
