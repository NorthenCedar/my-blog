import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('token 对比度', () => {
  it('scripts/assert-tokens.mjs 从 tokens.css 复算后全部达标', () => {
    const out = execFileSync('node', ['scripts/assert-tokens.mjs'], { encoding: 'utf8' });
    expect(out).toContain('全部 token 对比度达标');
  });

  it('所有成对颜色都出现在 tokens.css 里（防止改名后断言静默失效）', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf8');
    for (const name of ['ink', 'paper', 'muted', 'hair', 'accent', 'accent-ink', 'code-bg', 'code-fg']) {
      expect(css, `tokens.css 缺少 --${name}`).toContain(`--${name}:`);
    }
  });
});

describe('橙色越界（--accent 只允许出现在白名单选择器里）', () => {
  // 这是"金名单"，不是"白名单"：新增一处裸 var(--accent) 就会失败，
  // 逼你回来确认它确实用在 ≥24px 的文字或非文字图形上（design-spec.md §3.1）。
  const ALLOWED = ['nav a[aria-current', 'a:hover'];

  it('构建产物的 CSS 里，裸 var(--accent) 只出现在白名单选择器里', () => {
    const dist = 'dist';
    if (!existsSync(dist)) {
      console.warn('dist/ 不存在，先跑 npm run build');
      return;
    }

    const cssFiles: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith('.css')) cssFiles.push(p);
      }
    };
    walk(dist);
    expect(cssFiles.length, 'dist 里应该有 CSS 文件').toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const f of cssFiles) {
      const css = readFileSync(f, 'utf8');
      // 只匹配裸 --accent)：--accent-ink 不算
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const [, rawSel, body] = m;
        if (!/var\(--accent\)/.test(body)) continue;
        // Astro 会把作用域属性插进选择器（a:hover → a[data-astro-cid-x]:hover），
        // 先剥掉它再比对，否则断言永远匹配不上。
        const sel = rawSel.replace(/\[data-astro-cid-[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
        if (!ALLOWED.some((a) => sel.includes(a))) offenders.push(sel);
      }
    }
    expect(offenders, `这些选择器用了裸 --accent 但不在白名单：${offenders.join(' | ')}`).toEqual([]);
  });
});
