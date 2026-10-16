import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const src = readFileSync('src/pages/about.astro', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const component = readFileSync('src/components/PleatedInfinity.astro', 'utf8');
const dist = join(process.cwd(), 'dist');
const hasDist = existsSync(join(dist, 'about/index.html'));

describe('关于页 · 纸白与交互百褶环', () => {
  it('只挂新环，移除月相并关闭通用底纹，纸白不依赖局部盖板', () => {
    expect(src).toContain('<Fragment slot="plate"><PleatedInfinity /></Fragment>');
    expect(src).not.toMatch(/moon-main|ref-plate|PLATE_SRCS/);
    expect(src).toMatch(/:global\(body\.about-plate\)\s*\{\s*background:\s*var\(--paper\)/);
    expect(src).toMatch(/:global\(body\.about-plate \.page-inf\)\s*\{\s*display:\s*none/);
    expect(src).not.toMatch(/\.prose::before|\.fig-block::before|\.page-paper|\.ref-paper/);
  });
  it('底纹固定视口、不拦截正文操作、静态图片走本地响应式管线', () => {
    expect(component).toMatch(/position:\s*fixed/);
    expect(component).toMatch(/pointer-events:\s*none/);
    expect(component).toMatch(/aria-hidden="true"/);
    expect(component).toMatch(/<Image[^>]*widths=\{[^>]*sizes=/);
    expect(component).not.toMatch(/cursor:\s*(pointer|grab)/);
  });
  it('后备图有可见薄片和透明背景，体积适合作为底纹', async () => {
    const path = 'src/assets/about/plates/pleated-infinity.webp';
    const sharp = (await import('sharp')).default;
    const image = sharp(path);
    const meta = await image.metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBeGreaterThanOrEqual(1200);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    let visible = 0, transparent = 0;
    for (let n = 3; n < data.length; n += info.channels) {
      if (data[n] > 200) visible++;
      if (data[n] === 0) transparent++;
    }
    expect(visible).toBeGreaterThan(20000);
    expect(transparent).toBeGreaterThan(20000);
    expect(statSync(path).size).toBeLessThan(200 * 1024);
  });
});

describe.skipIf(!hasDist)('关于页 · 构建结果', () => {
  const html = hasDist ? readFileSync(join(dist, 'about/index.html'), 'utf8') : '';
  const cssFile = hasDist && readdirSync(join(dist, '_astro')).find(f => /^about\..*\.css$/.test(f));
  const css = cssFile ? readFileSync(join(dist, '_astro', cssFile), 'utf8') : '';
  it('新环在 shell 之外，页面过渡不改变 fixed 包含块', () => {
    const plate = html.indexOf('data-pleated-infinity');
    expect(plate).toBeGreaterThan(-1);
    expect(plate).toBeLessThan(html.indexOf('class="shell"'));
    expect(html.match(/data-pleated-infinity/g)).toHaveLength(1);
    expect(html).not.toMatch(/moon-main|class="ref-plate"/);
    expect(html).toMatch(/<img(?=[^>]*class="pleat-fallback")(?=[^>]*srcset=)[^>]*>/);
  });
  it('产物保持纸白且关闭通用底纹', () => {
    expect(html).toMatch(/<body[^>]*class="[^\"]*\babout-plate\b/);
    expect(css).toMatch(/body\.about-plate\s*\{[^}]*background:\s*var\(--paper\)/);
    expect(css).toMatch(/body\.about-plate\s+\.page-inf\s*\{[^}]*display:\s*none/);
  });
  it('页头跨组件 grid 规则仍能匹配真实 h1', () => {
    const rules = css.match(/\.pagehead\s*>\s*h1[^{}]*\{[^{}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      const selector = rule.split(',').find(s => /\.pagehead\s*>\s*h1/.test(s))!;
      expect(selector).not.toMatch(/data-astro-cid/);
    }
  });
});
