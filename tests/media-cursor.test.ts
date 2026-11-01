import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readdirSync('dist/_astro').filter(n => n.endsWith('.css'))
  .map(n => readFileSync(`dist/_astro/${n}`, 'utf8')).join('\n');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];

describe('视频原生控件的光标接管', () => {
  it('播放、音量、进度和全屏控件也受自定义光标的启用门闩约束', () => {
    for (const name of ['panel', 'play-button', 'mute-button', 'volume-slider', 'timeline', 'fullscreen-button']) {
      const pseudo = `::-webkit-media-controls-${name}`;
      const matched = rules.filter(([, selectors, declarations]) => selectors.includes(pseudo) && /cursor:\s*none\s*!important/.test(declarations));
      expect(matched.length, `${name} 缺少原生控件光标覆盖`).toBeGreaterThan(0);
      for (const [, selectors] of matched) {
        for (const selector of selectors.split(',')) expect(selector.trim()).toMatch(/^html\.cursor-none\s+video/);
      }
    }
  });

  it('真正进入视频全屏后保留可见的系统光标，避免跟手层不可见时无光标', () => {
    expect(rules.some(([, selectors, declarations]) => selectors.trim() === 'html.cursor-none video:fullscreen' && /cursor:\s*auto\s*!important/.test(declarations))).toBe(true);
    for (const [, selectors, declarations] of rules) {
      if (selectors.includes('::-webkit-media-controls') && /cursor:\s*none\s*!important/.test(declarations)) expect(selectors).toMatch(/:not\(:(?:fullscreen|-webkit-full-screen)\)/);
    }
  });
});
