import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
describe('关于页第四版正式接入', () => {
  it('以社交、技术栈、源码语言三个滚动章节为主，个人正文仍来自内容层', () => {
    const src = readFileSync('src/pages/about.astro', 'utf8');
    for (const id of ['social', 'technology', 'languages']) expect(src).toContain(`id="${id}"`);
    expect(src).toContain('data-motion-stop');
    expect(src).toContain('<Content />');
    expect(src).toContain('readLanguageStats()');
    expect(src).not.toContain('回到开场');
  });
});
