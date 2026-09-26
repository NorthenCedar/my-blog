/**
 * 抠图实验（_tmp 前缀 = 临时证据）：从浅灰底素材里抠出光标，比较 32/48/64 三档清晰度，并检查"洞"是否保住
 * 用法：node _tmp-matte-experiment.mjs
 *
 * 做法：alpha = 与背景色的差值（平滑映射）；RGB 原样保留（保住折面与明暗）；
 * 另加一圈 1px 深色描边（纸白底上纯白光标会看不见 —— 这是必须的，不是装饰）。
 */
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '<博客仓库>';
const SRC = join(ROOT, 'assets/cursors-source');
const OUT = join(ROOT, '_tmp-boot-shots/matte');
mkdirSync(OUT, { recursive: true });

/** 每张图的裁剪框（含 2px 边距，避开下方文字标签）与背景色估计 */
const CROPS = {
  normal: { x: 15, y: 18, w: 163, h: 120 }, // 形状 bbox x17..175 y20..135，外扩 2px
  link: { x: 59, y: 45, w: 165, h: 173 },   // 形状 bbox x61..221 y47..215
};

/** 自动找形状包围盒：阈值取 Δ>25（只留实体，把烘焙的软阴影挡在外面） */
async function shapeBox(name) {
  const { data, info } = await sharp(join(SRC, `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  let br = 0, bg = 0, bb = 0;
  for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const i = (yy * W + xx) * C; br += data[i]; bg += data[i + 1]; bb += data[i + 2]; }
  br /= 16; bg /= 16; bb /= 16;
  const ink = (x, y) => {
    const i = (y * W + x) * C;
    return Math.max(Math.abs(data[i] - br), Math.abs(data[i + 1] - bg), Math.abs(data[i + 2] - bb)) > 25;
  };
  // 逐行墨量 → 分段（间隔 ≤3 行算同一段）→ **只取最上面那一段**：形状在第一段，下面的"正常选择 / NORMAL SELECT"是文字标签
  const rows = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (ink(x, y)) n++;
    rows.push(n);
  }
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
  return { x0, x1, y0, y1, tipX, bg: [br, bg, bb], bands };
}

/** 抠图：返回目标尺寸的 RGBA raw + 热点 */
async function matte(name, size, box) {
  const pad = 1;
  const x = Math.max(0, box.x0 - pad), y = Math.max(0, box.y0 - pad);
  const w = Math.min(4096, box.x1 + pad - x + 1), h = box.y1 + pad - y + 1;
  const { data, info } = await sharp(join(SRC, `${name}.png`)).extract({ left: x, top: y, width: w, height: h }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const [br, bgg, bb] = box.bg;

  const out = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const i = p * C;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // 亮侧（白面/受光面）：与背景差一点点就要保留 —— 这正是结晶的主体
    const bright = Math.max(0, Math.max(r - br, g - bgg, b - bb));
    // 暗侧（折面棱线/轮廓）：必须够暗才算实体；浅一档的是烘焙软阴影，判为背景
    const dark = Math.max(0, Math.max(br - r, bgg - g, bb - b));
    const aBright = Math.max(0, Math.min(1, (bright - 3) / 12));
    const aDark = Math.max(0, Math.min(1, (dark - 22) / 16));
    const a = Math.max(aBright, aDark);
    // 亮度轻微上提（幂曲线）：让结晶更接近原图的"白"
    const lift = (v) => Math.round(255 * Math.pow(v / 255, 0.72));
    out[p * 4] = lift(r);
    out[p * 4 + 1] = lift(g);
    out[p * 4 + 2] = lift(b);
    out[p * 4 + 3] = Math.round(a * 255);
  }
  // 缩放**自己做**：sharp/vips 对带 alpha 的 resize 是否预乘没有可靠约定，实测直接把结晶乘暗了。
  // 做法：先预乘（RGB×A）→ 按目标像素覆盖的源矩形做盒式平均 → 最后解预乘。全程可控。
  const scale = size / Math.max(W, H);
  const dw = Math.max(1, Math.round(W * scale));
  const dh = Math.max(1, Math.round(H * scale));
  const pre = new Float32Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const a = out[p * 4 + 3] / 255;
    pre[p * 4] = out[p * 4] * a;
    pre[p * 4 + 1] = out[p * 4 + 1] * a;
    pre[p * 4 + 2] = out[p * 4 + 2] * a;
    pre[p * 4 + 3] = a;
  }
  const S = size;
  const withEdge = Buffer.alloc(S * S * 4);
  for (let ty = 0; ty < dh; ty++) {
    const sy0 = Math.floor((ty * H) / dh), sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * H) / dh));
    for (let tx = 0; tx < dw; tx++) {
      const sx0 = Math.floor((tx * W) / dw), sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * W) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { const p = (y * W + x) * 4; r += pre[p]; g += pre[p + 1]; b += pre[p + 2]; a += pre[p + 3]; n++; }
      r /= n; g /= n; b /= n; a /= n;
      const t = (ty * S + tx) * 4;
      // 解预乘；a=0 时 RGB 置 0（全透明像素的颜色无所谓）
      withEdge[t] = a > 0.004 ? Math.min(255, Math.round(r / a)) : 0;
      withEdge[t + 1] = a > 0.004 ? Math.min(255, Math.round(g / a)) : 0;
      withEdge[t + 2] = a > 0.004 ? Math.min(255, Math.round(b / a)) : 0;
      withEdge[t + 3] = Math.round(a * 255);
    }
  }
  // 1px 深色描边（纸白底上纯白结晶会看不见；描边要薄，厚了会把结晶压成灰贴纸）
  const alpha = new Float32Array(S * S);
  for (let p = 0; p < S * S; p++) alpha[p] = withEdge[p * 4 + 3] / 255;
  for (let yy = 0; yy < S; yy++) {
    for (let xx = 0; xx < S; xx++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = xx + dx, ny = yy + dy;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
        m = Math.max(m, alpha[ny * S + nx]);
      }
      const p = yy * S + xx;
      const edgeA = Math.max(0, m - alpha[p]);
      if (edgeA <= 0.05) continue;
      const src = p * 4;
      const sa = withEdge[src + 3] / 255;
      const ea = Math.min(1, edgeA * 2.3) * 0.6;
      const na = ea + sa * (1 - ea);
      const mix = (c, e) => Math.round(((c / 255) * sa * (1 - ea) + (e / 255) * ea) / (na || 1) * 255);
      withEdge[src] = mix(withEdge[src], 26);
      withEdge[src + 1] = mix(withEdge[src + 1], 26);
      withEdge[src + 2] = mix(withEdge[src + 2], 26);
      withEdge[src + 3] = Math.round(na * 255);
    }
  }
  // 热点 = 尖端在输出图里的位置（裁剪含 1px 边距、contain 左对齐，所以直接线性换算）
  const hotspot = [Math.round((box.tipX - x) * scale), Math.round((box.y0 - y) * scale)];
  return { buf: withEdge, size: S, hotspot, crop: { x, y, w, h } };
}

for (const name of Object.keys(CROPS)) {
  const box = await shapeBox(name);
  console.log(`\n${name}: 形状 bbox x${box.x0}..${box.x1} y${box.y0}..${box.y1}（${box.x1 - box.x0 + 1}×${box.y1 - box.y0 + 1}）· 尖端 (${box.tipX},${box.y0}) · 背景 ${box.bg.map((v) => Math.round(v)).join(',')}`);
  for (const size of [32, 48, 64]) {
    const { buf, size: S, hotspot, crop } = await matte(name, size, box);
    const file = join(OUT, `${name}-${size}.png`);
    await sharp(buf, { raw: { width: S, height: S, channels: 4 } }).png().toFile(file);
    console.log(`  ${name}-${size}.png · 裁剪 ${crop.w}×${crop.h}@(${crop.x},${crop.y}) · 热点 ${hotspot.join(' ')}`);
  }
}
