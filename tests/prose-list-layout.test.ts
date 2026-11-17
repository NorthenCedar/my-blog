/* =============================================================================
 * 正文列表的换行契约（2026-11-17）
 *
 * 站主报：写作台预览正常，推到线上后「圆点」按钮加出来的列表变成
 * 「圆点独占一行、文字从下一行开始」。
 *
 * 根因不是 Markdown 或写作台，而是 prose.css 直接给 `.prose li` 开了
 * `white-space: pre-wrap`。松散列表的 HTML 是：
 *   <li>
 *   <p>…</p>
 *   </li>
 * 紧跟在 `<li>` 后面的结构性换行被当成正文换行，于是圆点先画在空行上。
 *
 * 这条门闩守两件事：
 *   ① `.prose li` 本身不许再直接 pre-wrap（否则 bug 会原样回来）；
 *   ② `.prose li > p` 与「没有块级子节点的紧凑列表项」仍要 pre-wrap
 *      （段落内软换行要保留）。
 * ============================================================================= */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const PROSE = readFileSync(join(ROOT, 'src/styles/prose.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

/** 取出声明了 white-space: pre-wrap 的那条规则（选择器 + 声明块）。 */
function preWrapRule() {
  const rules = [...PROSE.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(match => ({ selectors: match[1].trim(), declarations: match[2] }))
    .filter(rule => /white-space\s*:\s*pre-wrap/.test(rule.declarations));
  expect(rules.length, 'prose.css 里找不到 white-space: pre-wrap 的规则').toBeGreaterThan(0);
  return rules.find(rule => rule.selectors.includes('.prose p')) ?? rules[0];
}

describe('正文列表 · 圆点与文字同一行', () => {
  it('列表项本身不再直接 pre-wrap：松散列表的 <li> 后换行不许变成空行', () => {
    const { selectors } = preWrapRule();
    expect(selectors, '`.prose li` 直接 pre-wrap 会让圆点独占一行')
      .not.toMatch(/(^|,)\s*\.prose\s+li\s*(,|$)/m);
  });

  it('列表项里的段落仍然 pre-wrap：段落内软换行要保留', () => {
    expect(preWrapRule().selectors).toContain('.prose li > p');
  });

  it('没有块级子节点的紧凑列表项仍然 pre-wrap', () => {
    expect(preWrapRule().selectors).toMatch(/\.prose\s+li:not\(:has\(/);
  });
});
