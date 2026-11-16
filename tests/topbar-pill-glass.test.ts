import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/music-panel-glass.css', 'utf8');
// 负向断言先剥注释：文件头解释了「为什么不能带状态」，里面会出现那个选择器的字面量。
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('顶栏药丸的玻璃材质不绑滚动态', () => {
  it('材质常驻在基态 [data-scroll-topbar]::after 上', () => {
    expect(css).toContain('body > .topbar[data-scroll-topbar]::after');
    const base = css.slice(css.indexOf('body > .topbar[data-scroll-topbar]::after'));
    expect(base).toMatch(/border:\s*1px solid var\(--music-glass-edge\)/);
    expect(base).toMatch(/background-color:\s*var\(--music-glass-fallback\)/);
    expect(base).toMatch(/box-shadow:/);
  });

  it('材质选择器不许再带 [data-topbar-scrolled]', () => {
    // 2026-11-16：上滑摘掉属性那一帧，带状态的选择器会让描边/底色/阴影整层消失，
    // opacity 补间的是一个空层 ⇒ 观感仍是「圆条直接不见」。
    expect(noComments).not.toContain(
      'body > .topbar[data-scroll-topbar][data-topbar-scrolled]::after',
    );
  });
});
