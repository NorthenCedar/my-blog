/**
 * 一次性探针：量开场覆盖层的"落位形态"与传输代价（_tmp 前缀 = 临时证据，不进正式工具）
 * 用法：node _tmp-boot-measure.mjs <基线 dist 目录>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BASE = process.argv[2] ?? '<本机工作区>\\_tmp-dist-boot-before';
const NEW = 'dist';
const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const read = (p) => readFileSync(p);

const baseHtml = read(join(BASE, 'index.html'));
const newHtml = read(join(NEW, 'index.html'));
const html = newHtml.toString('utf8');

const cssFiles = (dir) =>
  readdirSync(join(dir, '_astro'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => ({ f, size: statSync(join(dir, '_astro', f)).size }));

const baseCss = cssFiles(BASE).reduce((a, c) => a + c.size, 0);
const newCss = cssFiles(NEW).reduce((a, c) => a + c.size, 0);
const baseCssGz = cssFiles(BASE).reduce((a, c) => a + gz(read(join(BASE, '_astro', c.f))), 0);
const newCssGz = cssFiles(NEW).reduce((a, c) => a + gz(read(join(NEW, '_astro', c.f))), 0);

const linked = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
const cssInHtml = [...html.matchAll(/@keyframes boot-[\w-]+/g)].length;

console.log('判据 落位形态 对象 dist/index.html 实测:');
console.log(`  内联 @keyframes boot-* : ${cssInHtml} 条`);
console.log(`  index.html 引用的 CSS  : ${linked.join(' ') || '(无)'}`);
console.log('判据 产物体积 对象 index.html + _astro/*.css 实测:');
console.log(
  `  index.html : ${baseHtml.length} → ${newHtml.length} 字节（raw ${newHtml.length - baseHtml.length >= 0 ? '+' : ''}${newHtml.length - baseHtml.length}）`,
);
console.log(
  `  index.html gzip : ${gz(baseHtml)} → ${gz(newHtml)} 字节（+${gz(newHtml) - gz(baseHtml)}）`,
);
console.log(
  `  全部 CSS : ${baseCss} → ${newCss} 字节（${newCss - baseCss >= 0 ? '+' : ''}${newCss - baseCss}）· gzip ${baseCssGz} → ${newCssGz}（+${newCssGz - baseCssGz}）`,
);
console.log(
  `  首屏传输合计（html+css，gzip）: ${gz(baseHtml) + baseCssGz} → ${gz(newHtml) + newCssGz} 字节`,
);
console.log('判据 元素存在性 对象 index.html 实测:');
for (const [label, re] of [
  ['data-boot-overlay', /data-boot-overlay/g],
  ['class="boot-skip"', /class="boot-skip"/g],
  ['class="boot-ch"', /class="boot-ch"/g],
  ['class="boot-deco" aria-hidden="true"', /class="boot-deco" aria-hidden="true"/g],
]) {
  console.log(`  ${label} = ${[...html.matchAll(re)].length}`);
}
