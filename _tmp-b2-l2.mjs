/**
 * 双侧 L2（通用版，基线走 argv）—— 临时证据，勿删。
 * 用法：node _tmp-b2-l2.mjs <基线 dist> [新 dist]
 *
 * 归一化：去 data-astro-cid-*、去 _astro 资源名哈希。这样「CSS 文件名哈希变了但内容引用没变」
 * 不会被误判成差异；真正的差异（DOM 结构、类名、链接文本）留下。
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const A = process.argv[2] ?? '<本机工作区>\\_tmp-dist-b2-before';
const B = process.argv[3] ?? '<博客仓库>\\dist';

const walk = async (d, o = []) => {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p, o); else o.push(p);
  }
  return o;
};
const norm = (s) => s
  .replace(/\sdata-astro-cid-[a-z0-9]+(?:="[^"]*")?/g, '')
  .replace(/\[data-astro-cid-[a-z0-9]+\]/g, '')
  .replace(/(_astro\/[^"'\s)]*?)\.[A-Za-z0-9_\-]{6,}\.(css|js|woff2|webp|jpg|jpeg|png|svg)/g, '$1.H.$2');

const fa = await walk(A);
const htmls = fa.filter((f) => f.endsWith('.html'));
const same = [], diff = [], missing = [];
const details = [];
for (const f of htmls) {
  const rel = relative(A, f).replace(/\\/g, '/');
  const x = norm(await readFile(f, 'utf8'));
  let y;
  try { y = norm(await readFile(join(B, rel), 'utf8')); } catch { missing.push(rel); continue; }
  if (x === y) same.push(rel);
  else {
    diff.push(rel);
    let i = 0; while (i < Math.min(x.length, y.length) && x[i] === y[i]) i++;
    details.push(`  ${rel} @${i}\n    改前: ${JSON.stringify(x.slice(Math.max(0, i - 60), i + 80))}\n    改后: ${JSON.stringify(y.slice(Math.max(0, i - 60), i + 80))}`);
  }
}
console.log(`判据 L2-1 归一化后逐字节相同: ${same.length}/${htmls.length} 页`);
console.log(`  相同: ${same.join(' ') || '（无）'}`);
console.log(`  有差异: ${diff.join(' ') || '（无）'}`);
console.log(`  缺失: ${missing.join(' ') || '（无）'}`);
if (details.length) { console.log('差异逐条枚举:'); details.forEach((d) => console.log(d)); }

const cssA = (await walk(A)).filter((f) => f.endsWith('.css')).map((f) => relative(A, f).replace(/\\/g, '/'));
const cssB = (await walk(B)).filter((f) => f.endsWith('.css')).map((f) => relative(B, f).replace(/\\/g, '/'));
console.log(`判据 L2-2 产物 CSS 文件（哈希名允许变）: ${cssA.length} → ${cssB.length}`);
console.log(`  基线: ${cssA.join(' ')}`);
console.log(`  现在: ${cssB.join(' ')}`);

// 预期「会变的页」由 argv[4] 显式传入（逗号分隔可多页；空 = 预期全部不变）。
// 修前只认字面量 'index'，传 about / 404.html 都落进「全部不变」分支，
// 于是每次正确的结果后面都跟一行误导性的 FAIL（about 那轮踩到，见 docs/about-migration-notes.md §7）。
const expectDiff = (process.argv[4] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const ok =
  missing.length === 0 &&
  diff.length === expectDiff.length &&
  expectDiff.every((p) => diff.includes(p)) &&
  same.length === htmls.length - expectDiff.length;
const want = expectDiff.length ? `仅 ${expectDiff.join(', ')} 变、其余 ${htmls.length - expectDiff.length} 页逐字节不变` : '全部逐字节相同';
console.log(
  `\n=== ${ok ? `PASS（预期：${want}）` : `FAIL：与预期不符 —— 预期变 ${expectDiff.join(', ') || '（无）'}，实变 ${diff.join(', ') || '（无）'}，缺失 ${missing.length}`} ===`
);
process.exit(ok ? 0 : 1);
