/** 尺寸/质量矩阵（_tmp 前缀 = 临时证据）：弄清"缩放 vs 质量"到底谁在支配体积 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '<博客仓库>';
const SRC = join(ROOT, 'assets/homepage-art/cassette.png');
const OUT = join(ROOT, '_tmp-boot-shots/art');
mkdirSync(OUT, { recursive: true });

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
const raw = { width: W, height: H, channels: 4 };
const trimmed = await sharp(out, { raw }).trim({ threshold: 1 }).raw().toBuffer({ resolveWithObject: true });
console.log(`裁边后 raw: ${trimmed.info.width}×${trimmed.info.height}`);

// A 组：不缩放，只改质量
for (const q of [50, 60, 70, 80]) {
  const buf = await sharp(trimmed.data, { raw: trimmed.info }).webp({ quality: q, effort: 6 }).toBuffer();
  console.log(`  A 不缩放 q${q} → ${(buf.length / 1024).toFixed(1)} KB`);
}
// B 组：缩放（显式 kernel + 不做锐化），再压
for (const w of [700, 620, 520]) {
  const buf = await sharp(trimmed.data, { raw: trimmed.info }).resize({ width: w, kernel: 'lanczos3', fit: 'inside' }).webp({ quality: 68, effort: 6 }).toBuffer();
  console.log(`  B 缩放 ${w}px q68 → ${(buf.length / 1024).toFixed(1)} KB`);
}
// C 组：先落 PNG（走一遍编码解码）再缩放，看是不是 raw 直通的问题
const pngBuf = await sharp(trimmed.data, { raw: trimmed.info }).png().toBuffer();
for (const w of [700, 620]) {
  const buf = await sharp(pngBuf).resize({ width: w, kernel: 'lanczos3' }).webp({ quality: 68, effort: 6 }).toBuffer();
  console.log(`  C 经 PNG 缩放 ${w}px q68 → ${(buf.length / 1024).toFixed(1)} KB`);
}
// D 组：把完全透明的像素 RGB 涂成同一个色（WebP 不必为透明区的杂色买单）
const flat = Buffer.from(trimmed.data);
let cleared = 0;
for (let p = 0; p < trimmed.info.width * trimmed.info.height; p++) {
  if (flat[p * 4 + 3] === 0) { flat[p * 4] = 250; flat[p * 4 + 1] = 250; flat[p * 4 + 2] = 247; cleared++; }
}
console.log(`  （清零的透明像素: ${cleared}）`);
for (const w of [0, 700, 620]) {
  const pipe = w ? sharp(flat, { raw: trimmed.info }).resize({ width: w, kernel: 'lanczos3' }) : sharp(flat, { raw: trimmed.info });
  const buf = await pipe.webp({ quality: 68, effort: 6 }).toBuffer();
  console.log(`  D ${w || '不缩放'} px q68 → ${(buf.length / 1024).toFixed(1)} KB`);
  writeFileSync(join(OUT, `d-${w || 'full'}.webp`), buf);
}
