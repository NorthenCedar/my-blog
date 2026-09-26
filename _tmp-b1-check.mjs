import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
const A = '<本机工作区>\\_tmp-dist-b1-before', B = '<博客仓库>\\dist';
const walk = async (d, o = []) => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p, o); else o.push(p); } return o; };
const fa = await walk(A), fb = await walk(B);
console.log('改前文件数 ' + fa.length + ' / 改后 ' + fb.length);

// ---- 1) CSS：证明只加了两个 token ----
const cssB = fa.find((f) => f.endsWith('.css')), cssA = fb.find((f) => f.endsWith('.css'));
const tb = await readFile(cssB, 'utf8'), ta = await readFile(cssA, 'utf8');
console.log('改前 CSS ' + relative(A, cssB) + ' (' + tb.length + ' B) / 改后 ' + relative(B, cssA) + ' (' + ta.length + ' B)');
const N = ['--accent-wash:#edf3ec', '--panel:#efede7'];
console.log('改后 CSS 含 ' + N[0] + ' : ' + ta.includes(N[0]));
console.log('改后 CSS 含 ' + N[1] + ' : ' + ta.includes(N[1]));
let stripped = ta;
for (const n of N) stripped = stripped.replace(n + ';', '').replace(n, '');
const okCss = stripped === tb;
console.log('把这两个声明摘掉后与改前 CSS 完全相同: ' + okCss);
if (!okCss) { let i = 0; while (i < Math.min(stripped.length, tb.length) && stripped[i] === tb[i]) i++; console.log('  首差 @' + i); console.log('  改后摘除后: ' + JSON.stringify(stripped.slice(Math.max(0, i - 90), i + 90))); console.log('  改前      : ' + JSON.stringify(tb.slice(Math.max(0, i - 90), i + 90))); }

// ---- 2) 14 页 HTML：归一去哈希后是否逐字节相同 ----
const norm = (s) => s.replace(/\sdata-astro-cid-[a-z0-9]+(?:="[^"]*")?/g, '').replace(/(_astro\/[^"'\s]*?)\.[A-Za-z0-9_\-]{6,}\.(css|js|woff2|webp|jpg|jpeg|png|svg)/g, '$1.H.$2');
const htmls = fa.filter((f) => f.endsWith('.html'));
let same = 0; const diff = [];
for (const f of htmls) {
  const rel = relative(A, f).replace(/\\/g, '/');
  const x = norm(await readFile(f, 'utf8'));
  const y = norm(await readFile(join(B, rel), 'utf8'));
  if (x === y) same++; else { let i = 0; while (i < Math.min(x.length, y.length) && x[i] === y[i]) i++; diff.push(rel + ' @' + i); }
}
console.log('HTML 归一化后相同: ' + same + '/' + htmls.length + (diff.length ? ' | 有差异: ' + diff.join(' ') : ' （本段不该改任何页面）'));
console.log('=== 本段判定: ' + ((okCss && same === htmls.length) ? 'PASS' : 'FAIL') + ' ===');
