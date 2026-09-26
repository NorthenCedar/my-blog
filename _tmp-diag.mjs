import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
const A = '<本机工作区>\\_tmp-dist-b1-before', B = '<博客仓库>\\dist';
const walk = async (d, o = []) => { for (const e of await readdir(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) await walk(p, o); else o.push(p); } return o; };
const norm = (s) => s.replace(/\sdata-astro-cid-[a-z0-9]+(?:="[^"]*")?/g, '').replace(/\[data-astro-cid-[a-z0-9]+\]/g, '').replace(/(_astro\/[^"'\s)]*?)\.[A-Za-z0-9_\-]{6,}\.(css|js|woff2|webp|jpg|jpeg|png|svg)/g, '$1.H.$2');

console.log('=== 诊断 A：posts/camera-in-gaosan/index.html 归一化后剩余差异 ===');
const p = 'posts/camera-in-gaosan/index.html';
const x = norm(await readFile(join(A, p), 'utf8')), y = norm(await readFile(join(B, p), 'utf8'));
console.log('长度 改前 ' + x.length + ' → 改后 ' + y.length + ' (差 ' + (y.length - x.length) + ')');
const segs = [];
let i = 0;
while (i < Math.max(x.length, y.length) && segs.length < 12) {
  if (x[i] === y[i]) { i++; continue; }
  let j = i; while (j < Math.max(x.length, y.length) && x[j] !== y[j]) j++;
  segs.push([i, x.slice(i, j), y.slice(i, j)]); i = j;
}
console.log('差异段数: ' + segs.length);
for (const [pos, bs, as] of segs) {
  console.log('--- @' + pos);
  console.log('  改前: ' + JSON.stringify(bs.slice(0, 260)));
  console.log('  改后: ' + JSON.stringify(as.slice(0, 260)));
}
const joined = segs.map((s) => s[1] + s[2]).join('');
console.log('差异里是否仍含 _astro 形态 URL: ' + /_astro\//.test(joined) + '（false = 差异与图片 URL 无关）');

console.log('');
console.log('=== 诊断 B：产物新增文件 ===');
const fa = await walk(A), fb = await walk(B);
const relA = new Set(fa.map((f) => relative(A, f).replace(/\\/g, '/')));
const nf = fb.filter((f) => !relA.has(relative(B, f).replace(/\\/g, '/'))).sort();
console.log('新增文件数: ' + nf.length);
const byExt = {}, bySrc = {};
let total = 0;
for (const f of nf) {
  const r = relative(B, f).replace(/\\/g, '/'); const s = await stat(f); total += s.size;
  const ext = (r.match(/\.([a-z0-9]+)$/) || [])[1] || '?';
  byExt[ext] = (byExt[ext] || 0) + 1;
  const base = r.split('/').pop().replace(/\.[a-z0-9]+$/, '');
  const stem = base.replace(/_[A-Za-z0-9_\-]{6,}$/, '').replace(/_[0-9A-Za-z]+$/, '');
  bySrc[stem] = bySrc[stem] || { n: 0, b: 0 }; bySrc[stem].n++; bySrc[stem].b += s.size;
}
console.log('按扩展名: ' + JSON.stringify(byExt));
console.log('按源图归组:');
for (const [k, v] of Object.entries(bySrc).sort((a, b) => b[1].b - a[1].b).slice(0, 14)) console.log('  ' + k.padEnd(36) + ' ' + String(v.n).padStart(3) + ' 个 / ' + (v.b / 1024).toFixed(0) + ' KB');
console.log('新增合计: ' + (total / 1048576).toFixed(2) + ' MB');
console.log('抽样 8 个:');
for (const f of nf.slice(0, 8)) { const s = await stat(f); console.log('  ' + relative(B, f).replace(/\\/g, '/').padEnd(58) + (s.size / 1024).toFixed(1) + ' KB'); }
console.log('');
console.log('=== astro.config.mjs 里的 image 配置 ===');
const cfg = await readFile('astro.config.mjs', 'utf8');
const m = cfg.match(/images?\s*:\s*\{[\s\S]{0,400}?\n\s*\}/);
console.log(m ? m[0] : '(没有 image/images 配置块 → 用的是 Astro 默认值)');
