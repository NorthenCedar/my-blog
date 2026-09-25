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

describe('低对比 token 越界（--accent-bright 只许用在深色底上）', () => {
  // 2026-09-25 P1 重写（站主定案：「前提失效的测试比没有测试更糟」）。
  // 旧断言守的是「--accent（橙 #e4572e）只有 3.68:1，只能用于 ≥24px 文字或非文字图形」。
  // P1 把 --accent 换成绿 #2d7d46 后是 4.86:1 —— 纸上小字也达标，**那条前提已经不存在了**。
  // 现在真正需要守的是 --accent-bright：#4caf50 对纸只有 2.66:1，
  // 只许出现在深色底（--ink / --code-bg）上。它今天唯一的用途是深色带里那条
  // 2px 下划线（非文字图形，对 --ink 6.26:1）。
  // 白名单必须写**完整选择器**。曾经写成 'a:hover' 这种片段，
  // 结果把页脚 13px 小字上的越界用法一起放行了 —— 断言过宽等于没有断言。
  //
  // 2026-09-26 P5 追加深色灯箱里的按钮态：灯箱遮罩是 rgb(26 26 26 / 92%)（近 --ink），
  // 那里的 hover/focus 文字正好是 --accent-bright 的**正当用途**（对 --ink 6.26:1，
  // 远高于 AA 的 4.5:1）。它与上面两条同属「深色底上用亮绿」这一情形，故一并登记。
  const ALLOWED = [
    'nav a:hover',
    'nav a[aria-current=page]',
    '.lb button:hover',
    '.lb button:focus-visible',
  ];

  it('构建产物的 CSS 里，裸 var(--accent-bright) 只出现在白名单选择器里', () => {
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
      // 只匹配裸 --accent-bright)：--accent 与 --accent-ink 不算
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const [, rawSel, body] = m;
        if (!/var\(--accent-bright\)/.test(body)) continue;
        // Astro 会把作用域属性插进选择器（a:hover → a[data-astro-cid-x]:hover），
        // 先剥掉它再比对，否则断言永远匹配不上。
        const sel = rawSel.replace(/\[data-astro-cid-[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
        if (!ALLOWED.some((a) => sel.includes(a))) offenders.push(sel);
      }
    }
    expect(offenders, `这些选择器用了裸 --accent-bright 但不在白名单：${offenders.join(' | ')}`).toEqual([]);
  });
});
