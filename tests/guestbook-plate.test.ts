import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNTIME_DEPS_ALLOWED } from './_deps';

/* 留言页保留机械环，与标签区的百褶环及准星隔离。 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const ASTRO = read('src/pages/guestbook.astro');
const ACSS = strip(ASTRO);
const RING = read('src/components/MechanicalRing.astro');
const RCSS = strip(RING);
const TAGS = read('src/components/TagsPlate.astro');
const GUEST = read('dist/guestbook/index.html');
const TAGS_HTML = read('dist/tags/index.html');

describe('留言页 · 机械环底纹', () => {
  it('留言页保留机械环与光槽，标签区使用独立素材', () => {
    expect(ASTRO).toContain("import MechanicalRing from '../components/MechanicalRing.astro'");
    expect(TAGS).not.toContain('<MechanicalRing />');
    expect(TAGS).toContain('<PleatedInfinity />');
    expect(RING).toContain("from '../assets/tags/plates/mechanical-ring.webp'");
    expect(RING).toContain("from '../assets/tags/plates/ring.json'");
    expect(RING).toContain('projectRingLight(ring.fiber)');
    expect(read('public/licenses/rhine-mechanical-ring.txt')).toContain('MIT License');
  });

  it('底纹挂在 shell 外，不挡点击，也不与通用底纹叠加', () => {
    expect(ASTRO).toMatch(/<Fragment slot="plate">\s*<MechanicalRing \/>/);
    const plate = RCSS.match(/\.mechanical-ring\s*\{([^}]*)\}/)?.[1] ?? '';
    for (const decl of ['position: fixed', 'left: 50%', 'top: 50%', 'pointer-events: none', 'z-index: -1']) {
      expect(plate).toContain(decl);
    }
    expect(plate).toMatch(/translate\(-50%,\s*-50%\)/);
    expect(RING).toContain('aria-hidden="true"');
    expect(ASTRO).toContain('bodyClass="guestbook-plate"');
    expect(ACSS).toMatch(/body\.guestbook-plate \.page-inf\)\s*\{[^}]*display:\s*none/);
  });

  it('标签准星不会进入留言页', () => {
    expect(TAGS).toContain('<Crosshair />');
    expect(RCSS).not.toContain('Crosshair');
    expect(GUEST).not.toContain('data-crosshair');
    expect(TAGS_HTML).toContain('data-crosshair');
  });

  it('亮暗分别使用原版日间与夜间渲染，不用调色滤镜替代夜间反光', () => {
    expect(RING).toContain("from '../assets/tags/plates/mechanical-ring-night.webp'");
    expect(RCSS).not.toMatch(/feColorMatrix|ring-metal-filter|ring-dark-metal/);
    expect(GUEST).toMatch(/<img[^>]*class="[^"]*ring-day[^"]*"[^>]*>/);
    expect(GUEST).toMatch(/<img[^>]*class="[^"]*ring-night[^"]*"[^>]*>/);
    expect(RCSS).toMatch(/:global\(html\.dark\)[^{]*ring-night[^}]*display:\s*block/);
    expect(RCSS).toMatch(/:global\(html\.dark\)[^{]*ring-day[^}]*display:\s*none/);
    expect(RCSS).not.toContain('prefers-color-scheme');
  });

  it('图片和流光共用画布，减少动态效果时保留静态底纹', () => {
    expect(RCSS).toMatch(/aspect-ratio:\s*1400 \/ 900/);
    expect(RCSS).toMatch(/\.ring-light\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0/);
    const reduced = RCSS.slice(RCSS.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).not.toMatch(/\.ring-light\s*\{\s*display:\s*none/);
    expect(reduced).toMatch(/\.ring-pulse\s*\{[^}]*animation:\s*none/);
    expect(reduced).not.toMatch(/\.mechanical-ring\s*\{/);
    expect(RCSS).not.toMatch(/#[\da-fA-F]{3,8}\b|rgba?\(/);
  });

  it('机械环交互替代散点装饰，声纹和留言输入管线保留', () => {
    expect(ASTRO).toContain('<Voiceprint />');
    expect(ASTRO).not.toContain('FilamentField');
    expect(ASTRO).not.toContain('WaterSurface');
    expect(GUEST).not.toContain('data-ripple');
    expect(GUEST).not.toContain('data-filament-field');
    expect(GUEST).toContain('data-ring-motion');
    expect(ASTRO).toContain('<CommentSection slug="guestbook" />');
    expect(ASTRO).toContain("import '../scripts/comments'");
    expect(RING).toContain("import '../scripts/ring-motion'");
  });

  it('两页各自只渲染指定底纹，留言页流光保留', () => {
    expect(GUEST.match(/class="mechanical-ring"/g)).toHaveLength(1);
    const image = (html: string) => html.match(/<img[^>]*src="([^"]*mechanical-ring[^"]*)"[^>]*>/)?.[0] ?? '';
    const guestImage = image(GUEST);
    const tagsImage = image(TAGS_HTML);
    expect(guestImage).not.toBe('');
    expect(tagsImage).toBe('');
    expect(TAGS_HTML.match(/data-pleated-infinity/g)).toHaveLength(1);
    expect(TAGS_HTML).not.toContain('ceramic-infinity');
    expect(TAGS_HTML).not.toContain('class="ring-light"');
    expect(GUEST).not.toContain('ceramic-infinity');
    expect(GUEST).not.toContain('data-pleated-infinity');
    expect(guestImage).toMatch(/srcset="[^"]+"/);
    expect(GUEST).toContain('class="ring-light"');
    expect(GUEST).toContain('留言');
  });

  it('运行时依赖只许住在白名单里', () => {
    expect(Object.keys(JSON.parse(read('package.json')).dependencies).sort()).toEqual(RUNTIME_DEPS_ALLOWED);
  });
});
