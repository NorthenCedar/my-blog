import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const tokens = postcss.parse(readFileSync('src/styles/tokens.css', 'utf8'));
const home = postcss.parse(readFileSync('src/styles/home-dark.css', 'utf8'));

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
  it('和首页实际首屏使用同一组橙色及渐变停靠点', () => {
    let background = '';
    home.walkRules((rule) => {
      if (!rule.selectors.includes('html.dark body.chrome-console .band')) return;
      rule.walkDecls('background', (declaration) => { background = declaration.value; });
    });
    expect(background).not.toBe('');
    const gradient = background.slice(background.lastIndexOf('linear-gradient('));
    const homepage = darkPalette('chrome-console');
    const gallery = darkPalette('gallery-inf-plate');
    expect(gallery.expand(gallery.values.get('--gallery-bath-bg')!).replace(/\s+/g, ''))
      .toBe(homepage.expand(gradient).replace(/\s+/g, ''));
  });
});
