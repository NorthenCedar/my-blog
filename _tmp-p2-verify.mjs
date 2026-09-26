/** P2 搬迁验证（三层 + W1 三条 + 计算样式前后 + 截图 + 全 PASS 才提交）
 *  跑法: node _tmp-p2-verify.mjs            （在一个提权过的 pwsh 里跑）
 *  判据: L2 归一化后剩余差异 = 0 处（改前 vs 改后，去掉 cid 与资源哈希）
 *        W1① shell=14  ② 全部在 <main> 内  ③ 每页 wrap 仍 2 处
 *        W2 全局 .shell 三条声明与旧规则逐字相同、Base 里 <style> 已消失
 *        计算样式 14 页 × 3 容器 × 10 属性 前后零差异
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const BLOG = '<博客仓库>';
const BEFORE = '<本机工作区>\\_tmp-dist-before';
const AFTER = join(BLOG, 'dist');
const OUT = join(BLOG, 'prototype', '_shots', 'verify');

const walk = async (d, out = []) => {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p, out); else out.push(p);
  }
  return out;
};
// 只做两处归一化：cid、资源名哈希。其它一律保留（空白/属性顺序/CSS 声明顺序都是真信号）
const norm = (s) => s
  .replace(/\sdata-astro-cid-[a-z0-9]+(?:="[^"]*")?/g, '')
  .replace(/\[data-astro-cid-[a-z0-9]+\]/g, '')
  .replace(/(_astro\/[^\/"'()\s]*)\.[A-Za-z0-9_\-]{6,}\.(css|js|woff2|webp|jpg|jpeg|png|svg)/g, '$1.H.$2');

const snap = async (root) => {
  const m = new Map();
  for (const f of await walk(root)) m.set(relative(root, f).replace(/\\/g, '/'), await readFile(f));
  return m;
};

const mb = await snap(BEFORE), ma = await snap(AFTER);
const keys = [...new Set([...mb.keys(), ...ma.keys()])].sort();
const changed = [], gone = [], added = [];
for (const k of keys) {
  if (!mb.has(k)) { added.push(k); continue; }
  if (!ma.has(k)) { gone.push(k); continue; }
  if (!mb.get(k).equals(ma.get(k))) changed.push(k);
}
console.log('=== L1 原始逐字节 diff（只枚举，不做判据）===');
console.log('  改前 ' + mb.size + ' 个文件 / 改后 ' + ma.size + ' 个文件');
console.log('  内容变化 ' + changed.length + ' 个: ' + changed.join(' '));
console.log('  消失: ' + (gone.join(' ') || '(无)'));
console.log('  新增: ' + (added.join(' ') || '(无)'));

console.log('=== L2 归一化后剩余差异（硬判据：必须 0）===');
const diffs = [];
for (const k of changed) {
  const b = norm(mb.get(k).toString('utf8')), a = norm(ma.get(k).toString('utf8'));
  if (b !== a) diffs.push([k, b, a]);
}
console.log('  仍有差异的文件数: ' + diffs.length);
for (const [k, b, a] of diffs) {
  let i = 0; while (i < Math.min(b.length, a.length) && b[i] === a[i]) i++;
  console.log('  [' + k + '] 首差 @' + i);
  console.log('    改前: ' + JSON.stringify(b.slice(Math.max(0, i - 70), i + 130)));
  console.log('    改后: ' + JSON.stringify(a.slice(Math.max(0, i - 70), i + 130)));
}

console.log('=== W1 三条断言 ===');
const htmls = [...ma.keys()].filter((k) => k.endsWith('.html'));
let shell = 0, wrap = 0, inMain = 0; const bad = [];
for (const k of htmls) {
  const t = ma.get(k).toString('utf8');
  const sc = (t.match(/class="shell"/g) || []).length;
  const wc = (t.match(/class="wrap"/g) || []).length;
  const mm = t.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  const im = mm ? (mm[1].match(/class="shell"/g) || []).length : 0;
  shell += sc; wrap += wc; inMain += im;
  if (sc !== 1 || im !== 1) bad.push(k + '(shell=' + sc + ',inMain=' + im + ')');
}
console.log('  W1① shell 总数 ' + shell + '（期望 14 = 每页 1 处）→ ' + (shell === 14 ? 'PASS' : 'FAIL'));
console.log('  W1② 其中落在 <main> 内 ' + inMain + '（期望 14）→ ' + (inMain === 14 ? 'PASS' : 'FAIL'));
console.log('  W1③ 每页 class="wrap" 仍在 ' + wrap + ' 处（期望 28 = 14 页 × 页脚与黑带各 1）→ ' + (wrap === 28 ? 'PASS' : 'FAIL'));
console.log('  异常页: ' + (bad.join(' | ') || '(无)'));

console.log('=== W2 全局 .shell 与旧规则逐字一致 ===');
const baseCss = await readFile(join(BLOG, 'src', 'styles', 'base.css'), 'utf8');
const baseAstro = await readFile(join(BLOG, 'src', 'layouts', 'Base.astro'), 'utf8');
const DECL = ['max-width: var(--wrap)', 'margin: 0 auto', 'padding: var(--sp-7) var(--gutter) var(--sp-8)'];
const declOk = DECL.every((d) => baseCss.includes(d));
const styleGone = !baseAstro.includes('<style>') && !baseAstro.includes('.wrap {');
console.log('  base.css 里 .shell 声明与旧规则相同: ' + declOk + ' | Base.astro 作用域样式已移除: ' + styleGone);

console.log('=== 计算样式前后比对（硬判据：必须 0 差异）===');
execFileSync('node', [join(BLOG, '_tmp-p2-style.mjs'), '<本机工作区>\\_tmp-style-after.json'], { stdio: 'inherit' });
const sb = JSON.parse(await readFile('<本机工作区>\\_tmp-style-before.json', 'utf8'));
const sa = JSON.parse(await readFile('<本机工作区>\\_tmp-style-after.json', 'utf8'));
const sd = [];
for (const k of Object.keys(sb)) for (const el of ['main', 'footer', 'band']) {
  const b = sb[k][el], a = sa[k]?.[el];
  if (JSON.stringify(b) !== JSON.stringify(a)) sd.push(k + ' ' + el + ' | 前=' + JSON.stringify(b) + ' | 后=' + JSON.stringify(a));
}
console.log('  差异条数: ' + sd.length + '（14 页 × 3 容器 × 10 属性）→ ' + (sd.length === 0 ? 'PASS' : 'FAIL'));
sd.slice(0, 6).forEach((d) => console.log('    ' + d));

console.log('=== 三档截图（辅助，不作判据）===');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const NPX = join(BLOG, '.npm-cache', '_npx', '8003d8991b0d346b', 'node_modules');
const T = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  try {
    const u = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let f = join(AFTER, u.replace(/^\/+/, ''));
    const s = await readdir(f).then(() => true).catch(() => false);
    if (s) f = join(f, 'index.html');
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': T[extname(f).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch { if (!res.headersSent) res.writeHead(404); res.end('404'); }
});
await new Promise((r) => srv.listen(4481, '127.0.0.1', r));
const require = createRequire(NPX + '\\');
const puppeteer = require('puppeteer-core');
const br = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
const pg = await br.newPage();
const shots = [['/', 1440, 900], ['/', 1024, 768], ['/', 390, 844], ['/posts/camera-in-gaosan/', 1440, 900], ['/archive/', 1440, 900]];
for (const [p, w, h] of shots) {
  await pg.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await pg.goto(`http://127.0.0.1:4481${p}`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 500));
  const name = 'p2-' + (p === '/' ? 'index' : p.replace(/\//g, '')) + '-' + w + '.png';
  await pg.screenshot({ path: join(OUT, name) });
  console.log('  ' + name);
}
await br.close(); srv.close();

console.log('=== 提交（仅当上面全 PASS）===');
const allPass = diffs.length === 0 && shell === 14 && inMain === 14 && wrap === 28 && bad.length === 0 && declOk && styleGone && sd.length === 0;
if (allPass) {
  execFileSync('git', ['add', 'src/layouts/Base.astro', 'src/styles/base.css'], { cwd: BLOG, stdio: 'inherit' });
  execFileSync('git', ['commit', '-m', 'refactor(Base): 容器 .wrap → .shell，作用域样式搬入全局；SiteFooter 与 Band 的 .wrap 不动'], { cwd: BLOG, stdio: 'inherit' });
  console.log('全部断言 PASS → 已提交。');
  execFileSync('git', ['show', '--name-only', '--format=%h %s', 'HEAD'], { cwd: BLOG, stdio: 'inherit' });
  execFileSync('git', ['status', '--short'], { cwd: BLOG, stdio: 'inherit' });
} else {
  console.log('存在 FAIL → **未提交**。工作区保留改动，等你决定（回滚: git checkout -- src/layouts/Base.astro src/styles/base.css）。');
}
