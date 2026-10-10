/**
 * 双侧 L2 产物比对（正式工具，2026-09-26 从 _tmp-b2-l2.mjs 提升）
 *
 * 为什么提正式：它已经被**六轮迁移**用过（B1 / B2 / P5 / 文章页 / about / 404），
 * 每轮都靠它出「哪几页变了、其余是否逐字节不变」的结论 —— 这已经不是临时证据，
 * 是交付流程的一部分（构建 → 比对 → 枚举 → 判定）。
 *
 * 用法：
 *   node scripts/verify-page-diff.mjs <基线 dist> [新 dist] [预期会变的页...]
 *
 * 预期参数（第 4 个起，可给多个；支持尾部通配）：
 *   · 省略            → 预期**全部逐字节相同**
 *   · 404.html        → 预期恰好这一页变
 *   · tags/* posts/*  → 通配（前缀匹配），预期这些页变、其余不变
 *   · *               → 预期任何变化都接受（只看缺失）
 *
 * 判定：缺失为 0 **且** 有差异集合 === 预期集合 **且** 相同集合 === 其余全部。
 * 也就是说：**预期之外多变了、或预期之内没变，都会红** —— 之前只报"有几页不同"，
 * 需要人肉对着三份清单核（about 那轮就因为参数没被接住而打出误导性的 FAIL）。
 *
 * 归一化：去 data-astro-cid-*、去 _astro 资源名哈希。这样「CSS 文件名哈希变了但引用没变」
 * 不会被误判成差异；真正的差异（DOM 结构、类名、链接文本）留下。
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 默认值从**脚本自身位置**推导，不再硬编码本机绝对路径。
// 之前写的是 `D:\router\...` 那类绝对路径；开源脱敏时被换成了占位符，
// 而占位符不是合法路径 —— 这两个默认值会静默指向不存在的目录。
// `scripts/` 的上一级就是仓库根，所以 dist 也在脚下。
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const A = process.argv[2] ?? join(REPO_ROOT, '..', '_tmp-dist-b2-before');
const B = process.argv[3] ?? join(REPO_ROOT, 'dist');
const rawExpect = process.argv.slice(4).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);

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

const matches = (rel) => rawExpect.some((p) => (p === '*' ? true : p.endsWith('*') ? rel.startsWith(p.slice(0, -1)) : rel === p));
const unexpected = diff.filter((d) => !matches(d));
const notChanged = rawExpect.filter((p) => p !== '*' && !diff.some((d) => (p.endsWith('*') ? d.startsWith(p.slice(0, -1)) : d === p)));
const ok = missing.length === 0 && unexpected.length === 0 && notChanged.length === 0;
const want = rawExpect.length
  ? '仅 ' + rawExpect.join(', ') + ' 变、其余 ' + (htmls.length - diff.length) + ' 页逐字节不变'
  : '全部逐字节相同';
let verdict;
if (ok) {
  verdict = 'PASS（预期：' + want + '）';
} else {
  verdict = 'FAIL：与预期不符 —— 预期变 ' + (rawExpect.join(', ') || '（无）') + '，实变 ' + (diff.join(', ') || '（无）');
  if (unexpected.length) verdict += '；意外变了: ' + unexpected.join(', ');
  if (notChanged.length) verdict += '；预期要变却没变: ' + notChanged.join(', ');
  if (missing.length) verdict += '；缺失 ' + missing.length;
}
console.log('\n=== ' + verdict + ' ===');
process.exit(ok ? 0 : 1);
