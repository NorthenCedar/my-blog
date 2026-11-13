import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const src = readFileSync('src/pages/about.astro', 'utf8');
const dist = join(process.cwd(), 'dist');
const hasDist = existsSync(join(dist, 'about/index.html'));

describe('关于页 · 无限符号与 Dot Grid', () => {
  it('使用同一个原版 Dot Grid 加载器，关闭通用底纹', () => {
    const script = readFileSync('src/scripts/page-dots.ts', 'utf8');
    const view = readFileSync('src/scripts/page-dots-view.ts', 'utf8');
    expect(script).toContain("import('./page-dots-view')");
    expect(script).toContain('prefers-reduced-motion: no-preference');
    expect(view).toContain("import DotGrid from '../vendor/react-bits/DotGrid'");
    expect(src).toContain('<FinInfinity />');
    expect(src).not.toMatch(/<PleatedInfinity|data-about-waves/);
    expect(src).toMatch(/:global\(body\.about-plate \.page-inf\)\s*\{\s*display:\s*none/);
  });
});

describe.skipIf(!hasDist)('关于页 · 构建结果', () => {
  const html = hasDist ? readFileSync(join(dist, 'about/index.html'), 'utf8') : '';
  const cssFile = hasDist && readdirSync(join(dist, '_astro')).find(f => /^about\..*\.css$/.test(f));
  const css = cssFile ? readFileSync(join(dist, '_astro', cssFile), 'utf8') : '';

  it('点阵和画布位于主内容外，加载中没有静态无限符号', () => {
    const dots = html.indexOf('data-dot-grid');
    const infinity = html.indexOf('data-fin-infinity');
    expect(dots).toBeGreaterThan(-1);
    expect(infinity).toBeGreaterThan(dots);
    expect(infinity).toBeLessThan(html.indexOf('<main'));
    expect(html).not.toContain('data-fin-static');
    expect(html).not.toContain('fin-static-light');
    expect(html).not.toContain('fin-static-dark');
    expect(html).toContain('data-fin-cv');
    expect(css).toMatch(/\.about-dots[^}]+z-index:-2/);
  });

  it('产物保持纸白且关闭通用底纹', () => {
    expect(html).toMatch(/<body[^>]*class="[^"]*\babout-plate\b/);
    expect(css).toMatch(/body\.about-plate\s*\{[^}]*background:\s*var\(--paper\)/);
    expect(css).toMatch(/body\.about-plate\s+\.page-inf\s*\{[^}]*display:\s*none/);
  });

  it('首屏标题和头像在正文流中', () => {
    expect(html).toContain('class="profile-header"');
    expect(html).toContain('id="profile-title"');
    expect(html).toContain('data-about-redesign="4"');
  });
});
