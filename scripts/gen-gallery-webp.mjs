/**
 * 相册图片生成（构建前置步骤）
 *
 * 决定（2026-09-26）：**相册原图不部署** —— 30 MB 静态站不合理，浏览器里 200 KB 的 webp
 * 与 1 MB 的 jpg 没有肉眼差别。原图留在 content/，永远不进产物。
 *
 * 不变量：页面引用的每一张图，这里都必须生成成功。
 * **任何一张源图读不到 → exit 1，构建直接失败** —— 这是 src 从 ImageMetadata 退回字符串后
 * 补上的那层类型保证。82 帧里少一张，页面上就是个破图而构建还是绿的 —— 不行。
 *
 * 2026-09-26 P5 前置改造（本站主拍板）：
 *   · 从「只出最新相册的前 3 张」扩到**全量**（3 相册 × 82 帧 × 2 档）
 *   · manifest 结构 v2：顶层 `albums[]`（全量）+ `home{}`（首页只依赖这一段，不必理解全量结构）
 *   · **跳过未变源图的缓存**（站主：「改一行 CSS 等一分钟不可接受，这不是优化是可用性」）：
 *     指纹 = 版本 + 源图大小 + 源图 mtime + 档位宽 + 质量；命中且产物在 → 不重编码
 *   · 清掉档位变化后遗留的孤儿文件（首页那轮踩过：删了 1600 档，旧文件还留在产物里）
 *
 * 文件命名刻意保持 `NN-<宽>.webp`（NN = 该帧在所属相册里的序号，1 起）——
 * 首页那 3 张正好是最新相册的第 1/2/3 帧，所以**文件名与改造前完全一致**，
 * 首页产物得以逐字节不变（有 L2 判据守着）。
 */
import { readFile, writeFile, mkdir, stat, readdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GALLERY = join(ROOT, 'content', 'gallery');
const OUT = join(ROOT, 'public', 'gallery');
const MANIFEST = join(OUT, 'manifest.json');

const WIDTHS = [1280, 800];   // 站主定：主图 1280（1600 太重，823 KB）
const QUALITY = 70;
const HOME_SHOTS = 3;         // 首页「一主图 + 两缩略」
const CACHE_VERSION = 1;      // 改编码参数时递增，让旧缓存整体失效

const fail = (msg) => { console.error('[gallery] ' + msg); process.exit(1); };
const t0 = Date.now();

/* 1) 读所有相册的 frontmatter（title / date / images[{src,alt}]）—— 形状照 content 的真实写法 */
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
// 最新相册（与 index.astro 同规则：date 倒序）—— 首页那 3 张从这里取
parsed.sort((a, b) => String(b.date).localeCompare(String(a.date)));
const homeAlbum = parsed[0];
if (homeAlbum.images.length < HOME_SHOTS) {
  fail(`最新相册 ${homeAlbum.name} 只有 ${homeAlbum.images.length} 张图，首页要 ${HOME_SHOTS} 张`);
}

/* 2) 读上一版 manifest 当缓存表（缺失/旧结构都当空表，不影响正确性） */
const prevFp = new Map();
try {
  const prev = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const frames = [
    ...(prev.albums ?? []).flatMap((a) => a.frames ?? []),
    ...(prev.shots ?? []), // 兼容 v1 结构（首次改造时的上一版）
  ];
  for (const f of frames) for (const file of f.files ?? []) if (file.url && file.fp) prevFp.set(file.url, file);
} catch { /* 没有上一版：全部重编码 */ }

/* 3) 全量生成 */
const pad = (n) => String(n).padStart(2, '0');
const result = { albums: [], home: null };
let encoded = 0, reused = 0, bytes = 0;

for (const album of parsed) {
  const outDir = join(OUT, album.name);
  await mkdir(outDir, { recursive: true });
  const frames = [];
  const expected = new Set();

  for (const [idx, img] of album.images.entries()) {
    const n = idx + 1;                       // 该帧在所属相册里的序号（1 起）
    const rel = img.src.replace(/^\.\//, '');
    const srcPath = join(GALLERY, album.name, rel);
    const st = await stat(srcPath).catch(() => null);
    if (!st) fail(`源图不存在: ${srcPath}`);
    const files = [];

    for (const w of WIDTHS) {
      const name = `${pad(n)}-${w}.webp`;
      const outPath = join(outDir, name);
      const url = `/gallery/${encodeURIComponent(album.name)}/${name}`;
      expected.add(name);
      const fp = `${CACHE_VERSION}:${st.size}:${Math.round(st.mtimeMs)}:${w}:${QUALITY}`;

      const hit = prevFp.get(url);
      if (hit && hit.fp === fp && hit.h) {
        const alive = await stat(outPath).catch(() => null);
        if (alive) { files.push({ w, h: hit.h, url, fp }); reused++; bytes += alive.size; continue; }
      }
      const info = await sharp(srcPath).resize({ width: w, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(outPath);
      if (!info.size) fail(`生成失败: ${name}`);
      files.push({ w, h: info.height, url, fp });
      encoded++; bytes += info.size;
    }
    frames.push({ alt: img.alt, src: img.src, files });
  }

  // 清孤儿：档位/序号变化后残留的文件（首页那轮踩过）
  for (const f of await readdir(outDir)) {
    if (!expected.has(f)) { await unlink(join(outDir, f)); console.log(`[gallery] 清理孤儿 ${album.name}/${f}`); }
  }

  result.albums.push({
    id: album.name, title: album.title, date: album.date,
    total: album.images.length, frames,
  });
  if (album.name === homeAlbum.name) {
    result.home = { albumId: album.name, title: album.title, total: album.images.length, shots: frames.slice(0, HOME_SHOTS) };
  }
}

/* 4) 写 manifest */
const manifest = {
  gen: CACHE_VERSION,
  widths: WIDTHS,
  quality: QUALITY,
  albums: result.albums,
  home: result.home,
};
await writeFile(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');

const framesTotal = result.albums.reduce((n, a) => n + a.total, 0);
console.log(
  `[gallery] ${result.albums.length} 个相册 / ${framesTotal} 帧 × ${WIDTHS.length} 档 = ${framesTotal * WIDTHS.length} 个文件；` +
  `本次编码 ${encoded}、命中缓存 ${reused}；产物 ${(bytes / 1048576).toFixed(1)} MB；` +
  `首页取「${homeAlbum.title}」前 ${HOME_SHOTS} 张；耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`
);
