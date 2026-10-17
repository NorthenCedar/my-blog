import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ThemeToggle from '../src/components/ThemeToggle.astro';

/**
 * Jelly Slider 主题切换按钮（2026-10-17）。
 * 断言组件渲染出开关语义与画布 —— 逻辑（物理/拖拽/主题契约）在浏览器里，
 * 这里只保证它真的出现在 HTML 里且无障碍属性齐全。
 */
describe('ThemeToggle 渲染', () => {
  it('有 role=switch 与画布', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ThemeToggle, {});
    expect(html).toContain('role="switch"');
    expect(html).toContain('data-theme-toggle');
    expect(html).toContain('<canvas');
  });

  it('开关初始未选中且可聚焦、有中文标签', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ThemeToggle, {});
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('切换深色模式');
  });

  it('画布是纯装饰（aria-hidden），不进无障碍树', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ThemeToggle, {});
    expect(html).toContain('aria-hidden="true"');
  });
});
