import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUNTIME_DEPS_ALLOWED } from './_deps';

const read = (path: string) => readFileSync(path, 'utf8');
const guestbook = read('dist/guestbook/index.html');
const tags = read('dist/tags/index.html');

describe('留言页 · 英文词阵和静态机械环', () => {
  it('只在留言页渲染错行词阵，装饰内容对辅助技术隐藏', () => {
    expect(guestbook.match(/data-guestbook-words(?=[\s>])/g)).toHaveLength(1);
    expect(guestbook).toMatch(/<div[^>]*data-guestbook-words[^>]*aria-hidden="true"/);
    expect(guestbook).toContain('data-word-base');
    expect(guestbook).toContain('data-word-trail');
    expect(guestbook.match(/class="word-row"/g)?.length).toBeGreaterThan(15);
    expect(tags).not.toContain('data-guestbook-words');
  });

  it('保留亮暗两张机械环图片，去掉流光与拖动入口', () => {
    expect(guestbook).toMatch(/<img[^>]*class="[^"]*ring-day[^"]*"[^>]*>/);
    expect(guestbook).toMatch(/<img[^>]*class="[^"]*ring-night[^"]*"[^>]*>/);
    expect(guestbook).not.toMatch(/data-ring-(frame|motion)|class="ring-light"|轻拨金属环/);
    expect(read('public/licenses/rhine-mechanical-ring.txt')).toContain('MIT License');
  });

  it('装饰层位于正文外，不接管鼠标命中或减少动态效果模式', () => {
    const words = read('src/components/GuestbookWords.astro');
    const page = read('src/pages/guestbook.astro');
    expect(page).toMatch(/<Fragment slot="plate">\s*<GuestbookWords \/>\s*<MechanicalRing \/>/);
    expect(page).toMatch(/body\.guestbook-plate \.page-inf\)\s*\{[^}]*display:\s*none/);
    expect(words).toMatch(/\.guestbook-words\s*\{[^}]*position: fixed;[^}]*pointer-events: none/);
    expect(words).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.word-drift\s*\{\s*animation:/);
    expect(words).toMatch(/@keyframes word-drift[\s\S]*25%[\s\S]*50%[\s\S]*75%/);
  });

  it('声纹和留言表单保留，标签区继续使用百褶环', () => {
    expect(guestbook).toContain('data-voiceprint');
    expect(guestbook).toContain('data-form');
    expect(guestbook).not.toMatch(/data-crosshair|data-pleated-infinity|data-ripple|data-filament-field/);
    expect(tags.match(/data-pleated-infinity/g)).toHaveLength(1);
    expect(tags).not.toContain('mechanical-ring');
  });

  it('运行时依赖只许住在白名单里', () => {
    expect(Object.keys(JSON.parse(read('package.json')).dependencies).sort()).toEqual(RUNTIME_DEPS_ALLOWED);
  });
});
