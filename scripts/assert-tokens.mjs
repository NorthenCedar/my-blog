// 从 tokens.css 读真实取值，按 WCAG 相对亮度复算对比度，与 docs/design-spec.md §5 的断言表比对。
// 这里不"相信"任何写下来的数字 —— 包括我们自己写进注释的那些。
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

const get = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`tokens.css 里找不到 --${name}`);
  return m[1].toLowerCase();
};

const lum = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = v.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

// [前景, 背景, 规格值, 下限]
// P1（2026-09-25）：配色换成莱茵方向后重算过。规格值不是"抄注释"，是用本文件同一个公式独立算出来的。
const CASES = [
  ['ink', 'paper', 16.64, 4.5],
  ['muted', 'paper', 6.62, 4.5],
  ['accent-ink', 'paper', 6.18, 4.5],
  ['accent', 'paper', 4.86, 4.5], // 换绿后纸上小字也达标（旧橙 3.68，只承诺大字/图形）
  ['on-band', 'ink', 17.4, 4.5],
  ['on-band-sub', 'ink', 12.94, 4.5],
  ['on-band-meta', 'ink', 8.39, 4.5],
  ['accent-bright', 'ink', 6.26, 4.5], // 深色底上的绿。旧方向这里是 accent 橙（5.24）
  ['code-fg', 'code-bg', 16.49, 4.5],
  // B2（2026-09-26）：HUD 扫到新区段时那一下橙字。纸上小字必须达标才有资格当文字色。
  // --signal（#e87722）只有 2.83:1，**不进此表** —— 它是图形色，不许承载文字。
  ['signal-text', 'paper', 4.8, 4.5],
  // v3 亮色转场恢复墨绿：浅色描边与绿色小字都必须在墨底上可读。
  ['pt-letter', 'pt-ink', 16.2, 4.5],
  ['pt-accent', 'pt-ink', 6.45, 4.5],
  // ===== dusk 六档（2026-10-03 补）=====
  // 这六档是首页晨昏带（index.astro 的 .dusk）那套，一直没进这张表 ⇒ 注释里看着够用的
  // 档位没人算过。规格值用**本文件同一个公式**独立算出，不是抄 tokens.css 的注释。
  // 为什么要补：关于页「亲笔」切片是站内**第一处把 dusk 当底色放内容**的地方，
  // 深底上的文字颜色必须有人守。
  ['dusk-6', 'dusk-1', 11.76, 4.5],   // 深底上的正文/小字（dusk-6 是灰白，不是纯白）
  ['dusk-1', 'paper', 18.35, 4.5],     // 深色标本块压白纸
  ['dusk-3', 'paper', 14.24, 4.5],     // 抬升档压纸
  ['accent-bright', 'dusk-1', 6.9, 4.5], // 深底上的绿（比它对 --ink 的 6.26 还高）
];

// ★ 深底上的**图形色**（不承载文字）。WCAG 1.4.11 非文字图形只要 ≥3:1。
// dusk-5 是 4.26 —— **不到 4.5，所以不许承载深底小字**，但作为线条/刻度完全够。
// 这条正是本轮踩到的坑：注释里「晨昏带中段」看不出它差 0.24 不达标。
const GRAPHIC_CASES = [
  ['dusk-5', 'dusk-1', 4.26, 3],
  ['dusk-4', 'dusk-1', 1.97, 1.5],  // 装饰线/描边：1.97 连图形下限 3 都不到 ⇒ 只许当极弱的底纹
];

let failed = 0;
for (const [fg, bg, expect, min] of CASES) {
  const actual = ratio(get(fg), get(bg));
  const ok = actual >= min && Math.abs(actual - expect) < 0.05;
  if (!ok) {
    failed++;
    console.error(`✗ ${fg} on ${bg}: 实测 ${actual}，规格 ${expect}，下限 ${min}`);
  } else {
    console.log(`✓ ${fg} on ${bg}: ${actual}（下限 ${min}）`);
  }
}
for (const [fg, bg, expect, min] of GRAPHIC_CASES) {
  const actual = ratio(get(fg), get(bg));
  const ok = actual >= min && Math.abs(actual - expect) < 0.05;
  if (!ok) {
    failed++;
    console.error(`✗ [图形] ${fg} on ${bg}: 实测 ${actual}，规格 ${expect}，下限 ${min}`);
  } else {
    console.log(`✓ [图形] ${fg} on ${bg}: ${actual}（下限 ${min}）`);
  }
}

if (failed) {
  console.error(`\n${failed} 项不达标`);
  process.exit(1);
}
console.log('\n全部 token 对比度达标');
