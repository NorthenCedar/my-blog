/** 主页美术：尺寸/质量取舍 + 抠图质量对照（_tmp 前缀 = 临时证据） */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '<博客仓库>';
const SRC = join(ROOT, 'assets/homepage-art/cassette.png');
const OUT = join(ROOT, '_tmp-boot-shots/art');
mkdirSync(OUT, { recursive: true });

// 复用生成器的抠图逻辑（这里为了快速对比，直接内联一份）
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const patch = (x0, y0) => {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) { const i = (y * W + x) * C; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  return [r / n, g / n, b / n];
};
const corners = [patch(4, 4), patch(W - 12, 4), patch(4, H - 12), patch(W - 12, H - 12)];
const bg = [0, 1, 2].map((k) => corners.reduce((s, c) => s + c[k], 0) / corners.length);
const out = Buffer.alloc(W * H * 4);
for (let p = 0; p < W * H; p++) {
  const i = p * C;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const bright = Math.max(0, Math.max(r - bg[0], g - bg[1], b - bg[2]));
  const dark = Math.max(0, Math.max(bg[0] - r, bg[1] - g, bg[2] - b));
  const a = Math.max(Math.min(1, (bright - 2) / 10), Math.min(1, (dark - 18) / 16));
  out[p * 4] = r; out[p * 4 + 1] = g; out[p * 4 + 2] = b;
  out[p * 4 + 3] = Math.round(Math.max(0, a) * 255);
}
const base = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 1 }).png().toBuffer();
const bm = await sharp(base).metadata();
console.log(`抠图后（裁边）：${bm.width}×${bm.height} · alpha=${bm.hasAlpha === true}`);

// 本体只有 809×653 ⇒ 超过它的都是放大（白花体积），只测 ≤809 的档
const variants = [[809, 78], [809, 68], [700, 62], [640, 60], [620, 62], [560, 58], [480, 56]];
for (const [w, q] of variants) {
  const buf = await sharp(base).resize({ width: w, kernel: 'lanczos3' }).webp({ quality: q, effort: 6 }).toBuffer();
  writeFileSync(join(OUT, `w${w}-q${q}.webp`), buf);
  console.log(`  ${String(w).padStart(4)}px q${q} → ${(buf.length / 1024).toFixed(1)} KB`);
}
// 对照页用的 PNG（纸面 / 深底各一版），顺便看清边缘与阴影
const png = await sharp(base).resize({ width: 620 }).png().toBuffer();
writeFileSync(join(OUT, 'preview-620.png'), png);
console.log('预览 PNG:', join(OUT, 'preview-620.png'));
