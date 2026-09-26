/** 自己做预乘降采样（_tmp 前缀 = 临时证据）：验证能否同时拿到"合适尺寸 + 小体积" */
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
const tr = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 1 }).raw().toBuffer({ resolveWithObject: true });
const { width: TW, height: TH } = tr.info;
console.log(`裁边后: ${TW}×${TH}`);

/** 预乘 → 盒式平均 → 解预乘（自己写，绕开 vips 的 alpha 缩放问题） */
function boxDown(src, sw, sh, dw) {
  const dh = Math.round((sh * dw) / sw);
  const pre = new Float32Array(sw * sh * 4);
  for (let p = 0; p < sw * sh; p++) {
    const a = src[p * 4 + 3] / 255;
    pre[p * 4] = src[p * 4] * a;
    pre[p * 4 + 1] = src[p * 4 + 1] * a;
    pre[p * 4 + 2] = src[p * 4 + 2] * a;
    pre[p * 4 + 3] = a;
  }
  const dst = Buffer.alloc(dw * dh * 4);
  for (let ty = 0; ty < dh; ty++) {
    const y0 = Math.floor((ty * sh) / dh), y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * sh) / dh));
    for (let tx = 0; tx < dw; tx++) {
      const x0 = Math.floor((tx * sw) / dw), x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * sw) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = (y * sw + x) * 4; r += pre[p]; g += pre[p + 1]; b += pre[p + 2]; a += pre[p + 3]; n++; }
      r /= n; g /= n; b /= n; a /= n;
      const t = (ty * dw + tx) * 4;
      dst[t] = a > 0.004 ? Math.min(255, Math.round(r / a)) : 250;
      dst[t + 1] = a > 0.004 ? Math.min(255, Math.round(g / a)) : 250;
      dst[t + 2] = a > 0.004 ? Math.min(255, Math.round(b / a)) : 247;
      dst[t + 3] = Math.round(a * 255);
    }
  }
  return { buf: dst, w: dw, h: dh };
}

for (const [dw, q] of [[809, 70], [700, 70], [620, 70], [620, 60], [560, 62], [480, 62]]) {
  const d = dw === TW ? { buf: tr.data, w: TW, h: TH } : boxDown(tr.data, TW, TH, dw);
  const webp = await sharp(d.buf, { raw: { width: d.w, height: d.h, channels: 4 } }).webp({ quality: q, effort: 6 }).toBuffer();
  console.log(`  自写降采样 ${String(dw).padStart(3)}px q${q} → ${(webp.length / 1024).toFixed(1)} KB  (${d.w}×${d.h})`);
  writeFileSync(join(OUT, `manual-${dw}-q${q}.webp`), webp);
}
