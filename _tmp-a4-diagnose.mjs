/**
 * A4 定性探针（写文件，不碰 PowerShell 内联引号）
 * ① 线上 HTML vs 本地 dist/ HTML 逐字节比
 * ② 两边的 Meta 元素开标签 + 内联 style 里的 .meta 规则 + 用到的 cid
 * ③ 两边的 Base.css 文件名与内容
 */
import { readFile, readdir } from 'node:fs/promises';

const P = '/posts/ai-built-this-blog/';
const live = await (await fetch('https://northcedar.top' + P + '?cb=' + Date.now(), { headers: { 'cache-control': 'no-cache' } })).text();
const local = await readFile('dist/posts/ai-built-this-blog/index.html', 'utf8');

console.log('=== ① HTML 逐字节比 ===');
console.log(`  live  ${live.length} 字节 / local ${local.length} 字节 / 完全相同: ${live === local}`);
if (live !== local) {
  let i = 0;
  while (i < Math.min(live.length, local.length) && live[i] === local[i]) i++;
  console.log(`  首个差异点 @ ${i}`);
  console.log('    live : ' + JSON.stringify(live.slice(Math.max(0, i - 100), i + 160)));
  console.log('    local: ' + JSON.stringify(local.slice(Math.max(0, i - 100), i + 160)));
  // 差异总量（按 64 字节分块粗算）
  let diffBlocks = 0;
  for (let k = 0; k < Math.max(live.length, local.length); k += 64) {
    if (live.slice(k, k + 64) !== local.slice(k, k + 64)) diffBlocks++;
  }
  console.log(`  差异的 64 字节块数: ${diffBlocks}`);
}

console.log('\n=== ② Meta 元素 / 内联 style 里的 .meta 规则 / cid ===');
for (const [label, h] of [['live', live], ['local', local]]) {
  const el = (h.match(/<p class="meta"[^>]*>/) || ['(未找到 <p class="meta">)'])[0];
  console.log(`\n[${label}] Meta 元素开标签:`);
  console.log('  ' + el);
  const styles = [...h.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const css = styles.join('\n');
  console.log(`[${label}] 内联 <style> 段数 ${styles.length} / 合计 ${css.length} 字节`);
  const rules = [...css.matchAll(/[^{}]*\.meta\b[^{}]*\{[^}]*\}/g)].map((m) => m[0].replace(/\s+/g, ' ').trim());
  console.log(`[${label}] 内联里 .meta 规则 ${rules.length} 条:`);
  for (const r of rules) console.log('  ' + r);
  const cssCids = [...new Set([...css.matchAll(/data-astro-cid-[a-z0-9]+/g)].map((m) => m[0]))];
  const elCids = [...new Set([...el.matchAll(/data-astro-cid-[a-z0-9]+/g)].map((m) => m[0]))];
  console.log(`[${label}] 内联 CSS 用到的 cid: ${cssCids.join(' ') || '(无)'}`);
  console.log(`[${label}] Meta 元素上的 cid : ${elCids.join(' ') || '(无)'}`);
  console.log(`[${label}] ⇒ 元素 cid 是否被 CSS 覆盖: ${elCids.length === 0 ? '无 cid' : elCids.every((c) => css.includes(c))}`);
}

console.log('\n=== ③ Base.css 对比 ===');
const liveLink = (live.match(/(\/_astro\/Base\.[A-Za-z0-9_-]+\.css)/) || [])[1];
const localFile = (await readdir('dist/_astro')).find((f) => f.startsWith('Base.') && f.endsWith('.css'));
console.log(`  live 引用: ${liveLink}`);
console.log(`  local 产物: /_astro/${localFile}`);
if (liveLink) {
  const lc = await (await fetch('https://northcedar.top' + liveLink)).text();
  const loc = await readFile('dist/_astro/' + localFile, 'utf8');
  console.log(`  live 内容 ${lc.length} 字节 / local ${loc.length} 字节 / 完全相同: ${lc === loc}`);
  if (lc !== loc) {
    let i = 0;
    while (i < Math.min(lc.length, loc.length) && lc[i] === loc[i]) i++;
    console.log(`  首个差异 @ ${i}`);
    console.log('    live : ' + JSON.stringify(lc.slice(Math.max(0, i - 80), i + 140)));
    console.log('    local: ' + JSON.stringify(loc.slice(Math.max(0, i - 80), i + 140)));
  }
}
