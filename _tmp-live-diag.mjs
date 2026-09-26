/** 线上三条 FAIL 的取证（_tmp 前缀 = 临时证据）：确认是探针期望写错、还是线上真有问题 */
const SITE = 'https://northcedar.top';
const html = await (await fetch(SITE + '/', { cache: 'no-store' })).text();

console.log('--- data-boot-overlay 出现的每一处上下文 ---');
for (const m of html.matchAll(/data-boot-overlay/g)) {
  const i = m.index ?? 0;
  console.log('  …' + html.slice(Math.max(0, i - 70), i + 45).replace(/\s+/g, ' ') + '…');
}

const href = (html.match(/href="(\/_astro\/index[^"]+\.css)"/) ?? [])[1];
const css = await (await fetch(SITE + href, { cache: 'no-store' })).text();
const names = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
const boot = names.filter((n) => n.startsWith('boot-'));
const other = names.filter((n) => !n.startsWith('boot-'));
console.log('--- 线上首页 CSS 的关键帧构成 ---');
console.log(`  文件: ${href}（${Buffer.byteLength(css, 'utf8')} 字节）`);
console.log(`  boot-* = ${boot.length} 条 · 其它 = ${other.length} 条 → ${other.join(' ')}`);
console.log(`  （本地生成器产出 boot-* = 79；其它那 7 条是 B2 动效层的，共用同一个 bundle）`);

console.log('--- token 的线上实际值（压缩器会改写单位）---');
for (const name of ['--dur-boot', '--dur-boot-out']) {
  const m = css.match(new RegExp(name + ':[^;}]+'));
  const raw = m ? m[0] : '(缺)';
  const val = m ? m[0].split(':')[1] : '';
  const ms = val.endsWith('ms') ? parseFloat(val) : parseFloat(val) * 1000;
  console.log(`  ${raw}   ⇒ ${Number.isFinite(ms) ? ms + ' ms' : '无法换算'}`);
}
