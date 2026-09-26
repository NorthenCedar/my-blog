import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
const A = '<本机工作区>\\_tmp-dist-b1-before', B = '<博客仓库>\\dist';
const walk = async (d, o = []) => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p, o); else o.push(p); } return o; };
const norm = (s) => s.replace(/\sdata-astro-cid-[a-z0-9]+(?:="[^"]*")?/g, '').replace(/\[data-astro-cid-[a-z0-9]+\]/g, '').replace(/(_astro\/[^"'\s)]*?)\.[A-Za-z0-9_\-]{6,}\.(css|js|woff2|webp|jpg|jpeg|png|svg)/g, '$1.H.$2');
const fa = await walk(A), fb = await walk(B);
const htmls = fa.filter((f) => f.endsWith('.html'));
const same = [], diff = [];
for (const f of htmls) {
  const rel = relative(A, f).replace(/\\/g, '/');
  const x = norm(await readFile(f, 'utf8'));
  const y = norm(await readFile(join(B, rel), 'utf8'));
  if (x === y) same.push(rel); else diff.push(rel);
}
console.log('判据: 除 index.html 外，归一化后必须逐字节相同 → 相同 ' + same.length + '/' + htmls.length + ' 页');
console.log('  相同的页: ' + same.join(' '));
console.log('  有差异的页: ' + (diff.join(' ') || '(无)'));
console.log('判据: index.html 必须**不**相同 → ' + (diff.includes('index.html') ? 'PASS（它确实变了）' : 'FAIL（首页没变，说明外壳没生效）'));
const others = diff.filter((d) => d !== 'index.html');
console.log('判据: 其余 13 页必须零差异 → ' + (others.length === 0 ? 'PASS' : 'FAIL: ' + others.join(' ')));
// 首页差异逐条枚举
const ib = norm(await readFile(join(A, 'index.html'), 'utf8')), ia = norm(await readFile(join(B, 'index.html'), 'utf8'));
console.log('index.html 归一化后长度: 改前 ' + ib.length + ' → 改后 ' + ia.length);
const i = (() => { let k = 0; while (k < Math.min(ib.length, ia.length) && ib[k] === ia[k]) k++; return k; })();
console.log('  首个差异 @' + i);
console.log('  改前: ' + JSON.stringify(ib.slice(Math.max(0, i - 90), i + 120)));
console.log('  改后: ' + JSON.stringify(ia.slice(Math.max(0, i - 90), i + 120)));
// 体积
const vol = async (root) => { let n = 0, b = 0; for (const f of await walk(root)) { n++; b += (await stat(f)).size; } return { n, b }; };
const vb = await vol(A), va = await vol(B);
console.log('产物体积: 改前 ' + vb.n + ' 个 / ' + (vb.b / 1048576).toFixed(2) + ' MB → 改后 ' + va.n + ' 个 / ' + (va.b / 1048576).toFixed(2) + ' MB （涨 ' + ((va.b - vb.b) / 1024).toFixed(0) + ' KB）');
const imgs = fb.filter((f) => /\.(webp|jpg|jpeg|png)$/.test(f));
console.log('产物里的图片文件数: 改前 ' + fa.filter((f) => /\.(webp|jpg|jpeg|png)$/.test(f)).length + ' → 改后 ' + imgs.length);
