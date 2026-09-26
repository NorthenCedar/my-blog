/** 追查 --dur-boot 在线上 CSS 里"不见了"的原因：是被内联、还是真丢了（_tmp 前缀 = 临时证据） */
const SITE = 'https://northcedar.top';
const html = await (await fetch(SITE + '/', { cache: 'no-store' })).text();
const hrefs = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
console.log('线上引用的 CSS:', hrefs.join(' '));

const all = [];
for (const h of hrefs) all.push([h, await (await fetch(SITE + h, { cache: 'no-store' })).text()]);
const css = all.map(([, t]) => t).join('\n');

const probe = (label, needle) => console.log(`  ${label.padEnd(34)} ${css.includes(needle) ? '在' : '不在'}`);
console.log('--- 关键串是否出现在线上全部 CSS 里 ---');
probe('--dur-boot（裸名）', '--dur-boot');
probe('var(--dur-boot)', 'var(--dur-boot)');
probe('--dur-boot-out', '--dur-boot-out');
probe('--accent（对照：别的 token）', '--accent:');
probe('--focus-min（对照：B2 的 token）', '--focus-min');
probe('20.16s（内联后的形态）', '20.16s');
probe('20160ms（另一种形态）', '20160ms');

console.log('--- boot-clock 的 animation 声明在线上长什么样 ---');
const m = css.match(/\.boot-clock\{[^}]*\}/);
console.log('  ' + (m ? m[0] : '(找不到 .boot-clock)'));
const m2 = css.match(/\.boot-access\{[^}]*\}/);
console.log('  ' + (m2 ? m2[0].slice(0, 160) : '(找不到 .boot-access)'));

console.log('--- 本地 dist 里同样两处（对照组）---');
const fs = await import('node:fs');
const dir = '<博客仓库>\\dist\\_astro';
const localFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.css'));
const local = localFiles.map((f) => fs.readFileSync(dir + '\\' + f, 'utf8')).join('\n');
for (const [label, needle] of [['--dur-boot', '--dur-boot'], ['var(--dur-boot)', 'var(--dur-boot)'], ['20.16s', '20.16s'], ['20160ms', '20160ms']]) {
  console.log(`  ${label.padEnd(34)} ${local.includes(needle) ? '在' : '不在'}`);
}
const lm = local.match(/\.boot-clock\{[^}]*\}/);
console.log('  ' + (lm ? lm[0] : '(找不到 .boot-clock)'));
