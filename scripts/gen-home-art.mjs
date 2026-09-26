#!/usr/bin/env node
/**
 * 主页背景美术生成器（正式工具）
 *
 * 用法：
 *   node scripts/gen-home-art.mjs          # 生成 public/art/*.webp（构建/开发前自动跑）
 *   node scripts/gen-home-art.mjs --check  # 只比对不写；素材过期就红（两侧冒烟用）
 *
 * 素材来源：站主 2026-09-26 提供的一张「RHINE LAB, LLC. NO.001」磁带渲染图（1048×861 PNG，
 * 浅灰底 234,229,225）。上游 RhineLabUI 仓库里**没有**这张图（当初只镜像了它的源码），所以来源就是站主提供；
 * IP 归属与前几轮一致（本站长期使用明日方舟/莱茵生命的视觉语言）。
 *
 * 抠图要点（镜头与光标那轮同源，参数按这张图调）：
 *   · 背景是均匀浅灰 ⇒ 用「与背景色的差」做 alpha；**按方向分流**：
 *     比背景亮的一点点就保留（磁带主体是浅色），比背景够暗才算刻线/轮廓，
 *     否则素材里那层**软阴影**会一起抠进来，在页面底色上糊出一块灰。
 *   · 抠完按 alpha 裁掉四周空白（sharp trim），再压成 WebP（保留 alpha）。
 *   · **缩放自己做**（预乘 → 盒式平均 → 解预乘），不用 sharp 的 resize：
 *     实测同一张图「不缩放 q70 = 40.1 KB」而「sharp 缩到 700px q68 = 88.9 KB」——
 *     缩小反而胖一倍（vips 处理带 alpha 的缩放那个老毛病，与光标那轮同源）。
 *     自写降采样后 620px≈42.6 KB、560px≈37.9 KB、480px≈31.7 KB，体积回到正常区间。
 */
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets/homepage-art/cassette.png');
const OUT_DIR = join(ROOT, 'public/art');
const OUT = join(OUT_DIR, 'cassette.webp');
const CHECK = process.argv.includes('--check');
/** 输出宽度：页面按 ≤460 CSS px 显示，560 给到 1.2×（HiDPI 也够），体积约 38 KB */
const WIDTH = 560;
const QUALITY = 64;

/** 预乘 → 盒式平均 → 解预乘（绕开 vips 的 alpha 缩放问题） */
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
      // 全透明处填成页面底色，避免透明区杂色让 WebP 体积白涨
      dst[t] = a > 0.004 ? Math.min(255, Math.round(r / a)) : 250;
      dst[t + 1] = a > 0.004 ? Math.min(255, Math.round(g / a)) : 250;
      dst[t + 2] = a > 0.004 ? Math.min(255, Math.round(b / a)) : 247;
      dst[t + 3] = Math.round(a * 255);
    }
  }
  return { buf: dst, w: dw, h: dh };
}

async function build() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  // 背景色：四角 8×8 均值
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
    // 亮侧：磁带主体（浅色），低阈值就保留
    const bright = Math.max(0, Math.max(r - bg[0], g - bg[1], b - bg[2]));
    // 暗侧：刻线/轮廓，必须够暗（浅一档的是素材自带的软阴影，判为背景）
    const dark = Math.max(0, Math.max(bg[0] - r, bg[1] - g, bg[2] - b));
    const a = Math.max(Math.min(1, (bright - 2) / 10), Math.min(1, (dark - 18) / 16));
    out[p * 4] = r;
    out[p * 4 + 1] = g;
    out[p * 4 + 2] = b;
    out[p * 4 + 3] = Math.round(Math.max(0, a) * 255);
  }
  const trimmed = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).trim({ threshold: 1 }).raw().toBuffer({ resolveWithObject: true });
  const scaled = boxDown(trimmed.data, trimmed.info.width, trimmed.info.height, WIDTH);
  const buf = await sharp(scaled.buf, { raw: { width: scaled.w, height: scaled.h, channels: 4 } }).webp({ quality: QUALITY, effort: 6 }).toBuffer();
  const meta = await sharp(buf).metadata();
  return { buf, meta };
}

await mkdir(OUT_DIR, { recursive: true });
const { buf, meta } = await build();
const current = existsSync(OUT) ? await readFile(OUT) : null;
const same = current !== null && Buffer.compare(current, buf) === 0;
const line = `判据 主页美术 对象 public/art/cassette.webp 实测: ${current === null ? '新建' : same ? '无变化' : '更新'} · ${meta.width}×${meta.height} · alpha=${meta.hasAlpha === true} · ${(buf.length / 1024).toFixed(1)} KB`;
if (CHECK) {
  console.log(`判据 主页美术一致性 对象 public/art/cassette.webp 实测: ${current === null ? '文件不存在' : same ? '与真源逐字节相同' : '与真源不一致（过期）'} · ${meta.width}×${meta.height} · alpha=${meta.hasAlpha === true}`);
  process.exit(same ? 0 : 1);
}
if (same) console.log(line);
else {
  await writeFile(OUT, buf);
  console.log(line);
}
