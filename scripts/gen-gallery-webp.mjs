/**
 * 首页相册图片生成（构建前置步骤）
 *
 * 决定（2026-09-26）：**相册原图不部署** —— 30 MB 静态站不合理，浏览器里 200 KB 的 webp
 * 与 1 MB 的 jpg 没有肉眼差别。原图留在 content/，永远不进产物。
 *
 * 不变量：index.astro 引用的每一张图，这里都必须生成成功。
 * **任何一张源图读不到 → exit 1，构建直接失败** —— 这是 src 从 ImageMetadata 退回字符串后
 * 补上的那层类型保证。
 */
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GALLERY = join(ROOT, 'content', 'gallery');
const OUT = join(ROOT, 'public', 'gallery');
const WIDTHS = [1280, 800];   // 站主定：主图 1280（1600 太重，823 KB）
const HOME_SHOTS = 3;         // 首页「一主图 + 两缩略」

const fail = (msg) => { console.error('[gallery] ' + msg); process.exit(1); };

// 1) 读所有相册的 frontmatter（title / date / images[{src,alt}]）—— 形状照 content 的真实写法
const albums = (await readdir(GALLERY, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
const parsed = [];
for (const name of albums) {
  const text = await readFile(join(GALLERY, name, 'index.md'), 'utf8').catch(() => null);
  if (!text) fail(`相册 ${name} 缺少 index.md`);
  const fm = (text.match(/^---\n([\s\S]*?)\n---/) || [])[1];
  if (!fm) fail(`相册 ${name}/index.md 没有 frontmatter`);
  const title = (fm.match(/^title:\s*(.+)$/m) || [])[1];
  const date = (fm.match(/^date:\s*(.+)$/m) || [])[1];
  if (!title || !date) fail(`相册 ${name}/index.md 缺 title 或 date`);
  // 逐行扫 images：- src: / alt: 成对出现
  const lines = fm.split('\n');
  const images = [];
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].match(/^\s*-\s*src:\s*(\S+)\s*$/);
    if (!s) continue;
    const a = (lines[i + 1] || '').match(/^\s*alt:\s*(.+?)\s*$/);
    if (!a) fail(`相册 ${name} 里 ${s[1]} 没有 alt（alt 必填）`);
    images.push({ src: s[1], alt: a[1] });
  }
  if (images.length === 0) fail(`相册 ${name} 一张图都没有`);
  parsed.push({ name, title: title.trim(), date: date.trim(), images });
}

// 2) 取最新相册（与 index.astro 同规则：date 倒序），要前 3 张
parsed.sort((a, b) => String(b.date).localeCompare(String(a.date)));
const album = parsed[0];
const shots = album.images.slice(0, HOME_SHOTS);
if (shots.length < HOME_SHOTS) fail(`最新相册 ${album.name} 只有 ${shots.length} 张图，首页要 ${HOME_SHOTS} 张`);

// 3) 生成两档 webp + manifest
const outDir = join(OUT, album.name);
await mkdir(outDir, { recursive: true });
const manifest = { album: album.name, title: album.title, total: album.images.length, shots: [] };
for (const [i, shot] of shots.entries()) {
  const srcPath = join(GALLERY, album.name, shot.src.replace(/^\.\//, ''));
  const st = await stat(srcPath).catch(() => null);
  if (!st) fail(`首页引用的源图不存在: ${srcPath}`);
  const meta = await sharp(srcPath).metadata();
  if (!meta.width || !meta.height) fail(`读不出尺寸: ${srcPath}`);
  const files = [];
  for (const w of WIDTHS) {
    const name = `${String(i + 1).padStart(2, '0')}-${w}.webp`;
    const info = await sharp(srcPath).resize({ width: w, withoutEnlargement: true }).webp({ quality: 70 }).toFile(join(outDir, name));
    if (!info.size) fail(`生成失败: ${name}`);
    files.push({ w, h: info.height, url: `/gallery/${encodeURIComponent(album.name)}/${name}` });
  }
  manifest.shots.push({ alt: shot.alt, src: shot.src, files });
}
await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
const bytes = manifest.shots.reduce((n, s) => n + s.files.reduce((m, f) => m + 0, 0), 0);
console.log(`[gallery] 相册「${album.title}」（共 ${manifest.total} 张）：为首页生成 ${shots.length} 张 × ${WIDTHS.length} 档 webp → public/gallery/${album.name}/`);
