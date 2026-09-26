/** P2：L2 的**精确判据** + 提交。判据不是"0 差异"，而是"0 处无法解释的差异"：
 *  每一页归一化后，必须恰好等于「把 class="wrap" 替换一次为 class="shell"」的结果。
 *  即：除了这一处 OID 替换，任何别的字节差异都算 FAIL。 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const BLOG = '<博客仓库>';
const BEFORE = '<本机工作区>\\_tmp-dist-before';
const AFTER = join(BLOG, 'dist');
const norm = (s) => s
  .replace(/\sdata-astro-cid-[a-z0-9]+(?:="[^"]*")?/g, '')
  .replace(/\[data-astro-cid-[a-z0-9]+\]/g, '')
  .replace(/(_astro\/[^\/"'()\s]*)\.[A-Za-z0-9_\-]{6,}\.(css|js|woff2|webp|jpg|jpeg|png|svg)/g, '$1.H.$2');

const pages = ['404.html', 'about/index.html', 'archive/index.html', 'index.html',
  'posts/ai-built-this-blog/index.html', 'posts/camera-in-gaosan/index.html', 'posts/piano-eight-level-and-after/index.html',
  'tags/AI/index.html', 'tags/index.html', 'tags/建站/index.html', 'tags/成长/index.html', 'tags/摄影/index.html', 'tags/钢琴/index.html', 'tags/随笔/index.html'];

let pass = 0; const fail = [];
/** 正确判据：只把 <main> 内部那一处 class="wrap" 换掉 —— 黑带的 .wrap 在 <main> 之前，
 *  页脚的在之后，它们必须原样不动，所以不能"替换第一个"。 */
const fixMain = (s) => s.replace(/(<main[^>]*>)([\s\S]*?)(<\/main>)/, (m, open, inner, close) => open + inner.replace('class="wrap"', 'class="shell"') + close);
const firstDiff = (x, y) => { let i = 0; while (i < Math.min(x.length, y.length) && x[i] === y[i]) i++; return i; };
for (const p of pages) {
  const b = norm(await readFile(join(BEFORE, p), 'utf8'));
  const a = norm(await readFile(join(AFTER, p), 'utf8'));
  const expect = fixMain(b);
  if (b !== a && expect === a) pass++;
  else {
    const i = firstDiff(expect, a);
    fail.push(p + ' | 期望与实际的差异 @' + i + ' 期望:' + JSON.stringify(expect.slice(Math.max(0, i - 40), i + 60)) + ' 实际:' + JSON.stringify(a.slice(Math.max(0, i - 40), i + 60)));
  }
}
console.log('=== L2 精确判据 ===');
console.log('  每页「恰好一次 wrap→shell 且无其它差异」: PASS ' + pass + '/' + pages.length + (fail.length ? ' | FAIL: ' + fail.join(' ') : ''));
console.log('  说明: 归一化只去掉 data-astro-cid-* 与 _astro 资源名哈希；其余字节必须完全一致。');

// 交叉引用上一轮已跑过的三条硬判据（同一批产物，不重复跑 Chrome）
const styleBefore = JSON.parse(await readFile('<本机工作区>\\_tmp-style-before.json', 'utf8'));
const styleAfter = JSON.parse(await readFile('<本机工作区>\\_tmp-style-after.json', 'utf8'));
let sd = 0;
for (const k of Object.keys(styleBefore)) for (const el of ['main', 'footer', 'band']) if (JSON.stringify(styleBefore[k][el]) !== JSON.stringify(styleAfter[k]?.[el])) sd++;
console.log('=== 计算样式前后差异（14 页 × 3 容器 × 10 属性）: ' + sd + ' ===');

const ok = fail.length === 0 && pass === pages.length && sd === 0;
if (ok) {
  execFileSync('git', ['add', 'src/layouts/Base.astro', 'src/styles/base.css'], { cwd: BLOG, stdio: 'inherit' });
  execFileSync('git', ['commit', '-m', 'refactor(Base): 容器 .wrap → .shell，作用域样式搬入全局；SiteFooter 与 Band 的 .wrap 不动'], { cwd: BLOG, stdio: 'inherit' });
  console.log('=== 全部判据 PASS → 已提交 ===');
  execFileSync('git', ['show', '--name-only', '--format=%h %s', 'HEAD'], { cwd: BLOG, stdio: 'inherit' });
  console.log('--- git status --short ---');
  execFileSync('git', ['status', '--short'], { cwd: BLOG, stdio: 'inherit' });
  console.log('--- 未推证据 ---');
  console.log('ahead = ' + execFileSync('git', ['rev-list', '--count', 'origin/main..HEAD'], { cwd: BLOG, encoding: 'utf8' }).trim());
} else {
  console.log('=== 仍有 FAIL → 未提交 ===');
}
