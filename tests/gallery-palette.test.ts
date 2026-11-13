import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const tokens = postcss.parse(readFileSync('src/styles/tokens.css', 'utf8'));
const home = readFileSync('src/pages/index.astro', 'utf8');

// 这里只验证实际色板的共享契约；背景模糊、布局及手势由真实浏览器验收。
function darkPalette(pageClass: string) {
  const values = new Map<string, string>();
  for (const scope of [':root', 'html.dark', `html.dark body.${pageClass}`]) {
    tokens.walkRules((rule) => {
      if (!rule.selectors.includes(scope)) return;
      rule.walkDecls((declaration) => values.set(declaration.prop, declaration.value));
    });
  }
  function expand(value: string): string {
    return value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
      const next = values.get(name);
      if (!next) throw new Error(`相册无法继承 ${name}`);
      return expand(next);
    });
  }
  return { values, expand };
}

describe('相册显影板的暗色橙色', () => {
  it('与首页首屏共享四档橙色，首页另有过渡到正文的渐变色', () => {
    const sky = home.match(/\.home-sky::before\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(sky).toContain('var(--home-sky-edge)');
    const names = [...sky.matchAll(/var\((--home-sky-(?:top|high|mid|low))\)/g)].map(m => m[1]);
    expect(names).toHaveLength(4);
    const homepage = darkPalette('chrome-console');
    const gallery = darkPalette('gallery-inf-plate');
    const galleryColors = gallery.expand(gallery.values.get('--gallery-bath-bg')!).match(/#[\da-f]{6}\b/gi);
    expect(names.map(name => homepage.expand(`var(${name})`))).toEqual(galleryColors);
  });
});
