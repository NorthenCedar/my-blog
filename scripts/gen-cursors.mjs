#!/usr/bin/env node
/**
 * 光标素材生成器（正式工具）
 *
 * 用法：
 *   node scripts/gen-cursors.mjs          # 生成 public/cursors/*.png（构建/开发前自动跑）
 *   node scripts/gen-cursors.mjs --check  # 只比对不写；素材过期就红（两侧冒烟用）
 *
 * 现状（2026-09-26 站主最终决定）：**全站只有一个白色中心点**（跟手光标，见 CursorRing.astro）。
 * 所以这里只生成一枚位图 `normal`（PRTS「正常选择」的结晶箭头，从 assets/cursors-source/normal.png 抠）。
 * 它的唯一用途是 **无 JS / 脚本被拦时的兜底**：`cursor:none` 由 JS 加类，
 * 脚本没跑时这枚接管 ⇒ 不会出现"一个光标都没有"。链接选择与文本选择两枚已按站主要求删除。
 *
 * 尺寸为什么出两档：Safari 忽略 >32×32 的光标，Chrome/Edge/Firefox 可以到 128。
 *   ⇒ 主图 64×64（清晰）+ 32×32 兜底（Safari 用）；都失败时落到关键字（系统光标）。
 *
 * 抠图四个要点（都踩过，详见工单 §13.1.1）：
 *   ① 素材里的**软阴影**不能一起抠进来（白面与阴影"与背景的差值"区间重叠 ⇒ 按方向分流）
 *   ② 只取最上面那条墨带（下面是"正常选择 / NORMAL SELECT"文字标签）
 *   ③ 缩放自己做（预乘 → 盒式平均 → 解预乘）：sharp/vips 对带 alpha 的 resize 是否预乘没有可靠约定
 *   ④ sharp 的 `fit: contain` 补边默认是**不透明黑**（会在图上多出一条黑条）
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'assets/cursors-source');
const OUT_DIR = join(ROOT, 'public/cursors');
const CHECK = process.argv.includes('--check');

/* ── 抠图（唯一的素材路线） ────────────────────────────────────────────── */

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

/** 目标任务表：只做 normal（兜底用），主图 64（清晰）+ 兜底 32（Safari 上限）。
 *  链接选择与文本选择两枚已按站主 2026-09-26 的要求删除（位图 / token / 源图一并删）。 */
const TARGETS = [];
for (const size of [64, 32]) TARGETS.push({ file: size === 64 ? 'normal.png' : `normal-${size}.png`, make: () => matte('normal', size), what: `normal ${size}px（抠图）` });

await mkdir(OUT_DIR, { recursive: true });
let fails = 0;
const hotspots = {};
const hashes = {};
for (const t of TARGETS) {
  const { png, hotspot } = await t.make();
  const out = join(OUT_DIR, t.file);
  const current = existsSync(out) ? await readFile(out) : null;
  const same = current !== null && Buffer.compare(current, png) === 0;
  const info = pngInfo(png);
  hashes[t.file] = createHash('sha1').update(png).digest('hex').slice(0, 8);
  hotspots[t.file] = hotspot.join(' ');
  if (CHECK) {
    if (!same) fails++;
    console.log(`判据 光标素材一致性 对象 public/cursors/${t.file} 实测: ${current === null ? '文件不存在' : same ? '与真源逐字节相同' : '与真源不一致（过期）'} · ${info.width}×${info.height} · alpha=${info.alpha} · ${info.bytes} 字节 · ${t.what}`);
    continue;
  }
  if (same) {
    console.log(`判据 光标素材 对象 public/cursors/${t.file} 实测: 无变化 · ${info.width}×${info.height} · ${info.bytes} 字节 · 热点 ${hotspots[t.file]} · 指纹 ${hashes[t.file]}`);
  } else {
    await writeFile(out, png);
    console.log(`判据 光标素材 对象 public/cursors/${t.file} 实测: ${current === null ? '新建' : '更新'} · ${info.width}×${info.height} · ${info.bytes} 字节 · 热点 ${hotspots[t.file]} · 指纹 ${hashes[t.file]}`);
  }
}

/**
 * 生成 src/styles/cursors.css（token 定义）。**为什么 token 也要生成**：
 * 光标图的文件名固定、内容会变（这次就从手画稿换成了抠图稿），浏览器按 URL 缓存图片 ⇒ 站主刷新后
 * 看到的还是旧光标（"跟上次没变化"就是这么来的）。解法是把**内容指纹写进 URL 的查询串**：
 * 图一改指纹就变、URL 就变，浏览器必然重取。热点也一起生成 ⇒ 不会与图片漂移。
 */
const tokenCss = `/* 由 scripts/gen-cursors.mjs 生成 —— 不要手改（改形状/配色/热点请改那个脚本）。
   URL 带内容指纹 ?v=<sha1 前 8 位>：图片内容变了 URL 就变，否则浏览器会一直用缓存里的旧光标。
   只有一条 token：它是**无 JS 时的兜底**（正常运行时原生光标由 JS 换成跟手白点，见 CursorRing.astro）。
   每个 token 是「主图 64 + 兜底 32（Safari 忽略 >32 的光标）+ 关键字」三级。 */
:root {
  --cursor-default: url('/cursors/normal.png?v=${hashes['normal.png']}') ${hotspots['normal.png']}, url('/cursors/normal-32.png?v=${hashes['normal-32.png']}') ${hotspots['normal-32.png']}, default;
}
`;
const tokenFile = join(ROOT, 'src/styles/cursors.css');
const currentToken = existsSync(tokenFile) ? await readFile(tokenFile, 'utf8') : null;
if (CHECK) {
  const same = currentToken === tokenCss;
  if (!same) fails++;
  console.log(`判据 光标 token 一致性 对象 src/styles/cursors.css 实测: ${currentToken === null ? '文件不存在' : same ? '与生成结果逐字节相同' : '与生成结果不一致（过期）'}`);
} else if (currentToken === tokenCss) {
  console.log('判据 光标 token 对象 src/styles/cursors.css 实测: 无变化');
} else {
  await writeFile(tokenFile, tokenCss, 'utf8');
  console.log(`判据 光标 token 对象 src/styles/cursors.css 实测: ${currentToken === null ? '新建' : '更新'}`);
}

if (CHECK) {
  console.log(`判据 光标素材一致性 汇总: ${TARGETS.length - fails}/${TARGETS.length} 与真源一致`);
  process.exit(fails === 0 ? 0 : 1);
}
console.log('热点（已写进 src/styles/cursors.css）: ' + JSON.stringify(hotspots));
console.log('内容指纹: ' + JSON.stringify(hashes));
