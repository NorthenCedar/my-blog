import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const src = readFileSync('src/pages/about.astro', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const dist = join(process.cwd(), 'dist');
const hasDist = existsSync(join(dist, 'about/index.html'));

/* ★ 2026-10-18：这个文件原来还包含**百褶 ∞ 装置自身**的一大组断言
   （--pleat-* 几个旋钮、后备 webp 的像素性质、canvas 与兜底图浓淡同源）。
   那些守的是**装置自己**而不是关于页这一页，装置整体搬到标签页后就一起搬去了
   `tests/pleated-device.test.ts`。本文件现在只留**关于页这一页**的判据。 */

describe('关于页 · 纸白与交互立体 ∞', () => {
  it('只挂新环，移除月相并关闭通用底纹，纸白不依赖局部盖板', () => {
    /* ★ 2026-10-18：底纹装置换成 FinInfinity（见文件下方「构建结果」那段的说明） */
    expect(src).toContain('<Fragment slot="plate"><FinInfinity /></Fragment>');
    expect(src, 'about.astro 不该再 import 百褶组件（它已搬到标签页）')
      .not.toMatch(/import PleatedInfinity/);
    expect(src).not.toMatch(/moon-main|ref-plate|PLATE_SRCS/);
    expect(src).toMatch(/:global\(body\.about-plate\)\s*\{\s*background:\s*var\(--paper\)/);
    expect(src).toMatch(/:global\(body\.about-plate \.page-inf\)\s*\{\s*display:\s*none/);
    expect(src).not.toMatch(/\.prose::before|\.fig-block::before|\.page-paper|\.ref-paper/);
  });
});

describe.skipIf(!hasDist)('关于页 · 构建结果', () => {
  const html = hasDist ? readFileSync(join(dist, 'about/index.html'), 'utf8') : '';
  const cssFile = hasDist && readdirSync(join(dist, '_astro')).find(f => /^about\..*\.css$/.test(f));
  const css = cssFile ? readFileSync(join(dist, '_astro', cssFile), 'utf8') : '';
  /* ★ 2026-10-18：关于页底纹从 **百褶 ∞（PleatedInfinity）**换成
     **立体 ∞（FinInfinity）**（移植自 rhine-lock 的 ∞ fin sculpture）。
     ★★ 判据守的是**性质**（「底纹在 shell 之外、恰好一个、页面过渡不改变它的
       fixed 包含块」），**不是组件名** —— 所以这里改成认data-fin-infinity，
       而不是把 `data-pleated-infinity` 换成 `data-fin-infinity` 了事。
       （原来的写法恰好也守了性质，但名字一换就红，容易被误读成「新组件不受约束」。） */
  it('底纹在 shell 之外，页面过渡不改变 fixed 包含块', () => {
    const plate = html.indexOf('data-fin-infinity');
    expect(plate, '关于页产物里找不到底纹装置的宿主标记（data-fin-infinity）').toBeGreaterThan(-1);
    expect(plate, '底纹必须在 .shell 之外，否则会跟着页面内容的过渡一起被 transform 困住')
      .toBeLessThan(html.indexOf('<main'));
    expect(html.match(/data-fin-infinity/g), '底纹装置必须恰好一个').toHaveLength(1);
    expect(html).not.toMatch(/moon-main|class="ref-plate"/);
    /* 旧百褶不该再出现在关于页（它整体搬到标签页了）—— 留着就说明换漏了 */
    expect(html, '关于页还挂着旧的百褶 ∞（应已搬到标签页）').not.toMatch(/data-pleated-infinity/);
    /* 静态回退层要真在产物里（无 JS / reduced-motion 时装置的全部内容） */
    expect(html).toMatch(/data-fin-static/);
    expect(html).toMatch(/data-fin-cv/);
  });
  it('产物保持纸白且关闭通用底纹', () => {
    expect(html).toMatch(/<body[^>]*class="[^\"]*\babout-plate\b/);
    expect(css).toMatch(/body\.about-plate\s*\{[^}]*background:\s*var\(--paper\)/);
    expect(css).toMatch(/body\.about-plate\s+\.page-inf\s*\{[^}]*display:\s*none/);
  });
  it('关于页使用完整视口章节，标题与头像仍在正文流中', () => {
    expect(html).toContain('class="profile-header"');
    expect(html).toContain('id="profile-title"');
    expect(html).toContain('data-about-redesign="4"');
  });});
