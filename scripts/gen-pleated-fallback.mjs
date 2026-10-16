/** 重建关于页无 WebGL 时的静态后备图；与动态环共用几何及镜头。 */
import { buildSync } from 'esbuild';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const { outputFiles } = buildSync({ entryPoints: ['src/scripts/pleated-core.ts'], bundle: true, write: false, format: 'esm' });
const { createPleats, updatePleats, PleatWaves, projectPleatPoint, rotatePleatPoint } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const pleats = createPleats();
updatePleats(pleats, 0, new PleatWaves());
const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const hex = tokens.match(/--pleat-base:\s*#([\da-f]{6})/)[1];
/* ★ 与 `pleated-renderer.ts` 片元着色器里那条是**同一条公式**（两行逐字对应）。
     改一处必须改另一处 —— `tests/about-ref-plate.test.ts` 钉住了"必须成对出现"。 */
const contrast = Number(tokens.match(/--pleat-contrast:\s*([\d.]+)/)[1]);
const base = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
const unit = p => { const d = Math.hypot(...p); return p.map(v => v / d); };
const light = unit([-0.55, 0.75, 1.35]), fill = unit([0.6, -0.1, 0.2]), half = unit([light[0], light[1], light[2] + 1]);
const dot = (a, b) => Math.max(0, a.reduce((sum, v, i) => sum + v * b[i], 0));
const faces = [], data = pleats.vertices, width = 1200, height = 727;
for (let at = 0; at < data.length; at += 42) {
  const normal = rotatePleatPoint(data.subarray(at + 3, at + 6));
  if (normal[2] <= 0) continue;
  const points = [0, 7, 14, 35].map(n => projectPleatPoint(data.subarray(at + n, at + n + 3), width, height));
  // 对比度：朝着色区间的中点压缩（1 = 原样，0 = 全平）；高光同比例。
// ⚠ 不能朝白色压缩 —— 那只抬暗部、亮部仍顶纯白，结果是"整体变淡"而不是"降对比"。
const raw = 0.43 + 0.53 * dot(normal, light) + 0.10 * dot(normal, fill);
  const shade = 0.745 + (raw - 0.745) * contrast;
  const specular = 0.08 * contrast * dot(normal, half) ** 36;
  const rgb = base.map(v => Math.min(255, Math.round(v * shade + 255 * specular)));
  faces.push({ z: points.reduce((n, p) => n + p[2], 0) / 4,
    svg: `<polygon points="${points.map(p => p.slice(0, 2).map(v => v.toFixed(2)).join(',')).join(' ')}" fill="rgb(${rgb.join(',')})"/>` });
}
faces.sort((a, b) => a.z - b.z);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${faces.map(f => f.svg).join('')}</svg>`;
await sharp(Buffer.from(svg), { density: 144 }).resize(width, height)
  .webp({ quality: 90, alphaQuality: 100 }).toFile('src/assets/about/plates/pleated-infinity.webp');
console.log('已重建百褶无限环静态后备图');
