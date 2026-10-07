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
    // 2026-09-30 第五轮追加：首页首屏导航（在深墨绿场 .band 上）的**当前页**那一项。
    // 站主要求「照搬原型」（原型 nav a[aria-current] 写的就是裸 var(--accent-bright) + #4caf50 系字面量），
    // 上一轮被改成 --on-band 后「主页」两个字不变绿 —— 站主报的正是这条。
    // 与上面一条同属「深色底上的亮绿」（对 --ink 6.26:1）。
    // ★ 注意写法：首页这条 CSS 写的是属性**存在**选择器 `nav a[aria-current]`，
    //   与 Topbar 那条 `nav a[aria-current=page]` 不是同一个串，两个都要在名单里。
    'nav a[aria-current]',
    '.lb button:hover',
    '.lb button:focus-visible',
    // 2026-09-30 追加：原型 v10.6 首屏（深墨绿场）里 eyebrow 前面那道 1px × 1.6rem 的短横。
    // 它与上面两条同属「深色底上的亮绿」——对 --ink-deep(#0b1a14) 远超 4.5:1，
    // 且它是**非文字图形**（一根 1px 线），不是小字。抄的是原型 .eyebrow i 的原色。
    '.eyebrow i',
    // ★ 2026-10-07 第五轮删：'.scroll-hint s:after'
    //   —— 首屏左下角那处 SCROLL 提示连同它的 2.2s 绿色跑光整块撤除（A-2：
    //      一个不承载信息、却比谁都会动的标签，比静止更费读者的注意力）。
    //   ⇒ 宿主 DOM 与样式都没了，这条例外成了上面第 64 行说的那种
    //      「已不存在用法」的掺水项，按同一规矩移除。「对深色底用亮绿」这条
    //      情形本身没变，`.eyebrow i` 与 `.tsl-hud a` 两条仍在名单里守着它。
    // 2026-10-02 第九轮追加：剧场右下角那一格（CC-BY 署名）里的**许可外链**。
    // 这一格是深底（`color-mix(--dusk-1 74%, transparent)` 落在近黑的剧场画布上），
    // 而全站兜底规则 `a{color:var(--accent-ink)}` 给的是**纸上**链色（#266b3b）
    // —— 深底上几乎没对比，首轮探针截图里 "CC BY 4.0" 糊成一片（而「可见的署名」
    // 正是 CC-BY 许可的全部要求）。改用 --accent-bright 是它的**正当用途**：
    // 对 --dusk-1(#0b100e) 实测 6.76:1，小字达标；再配下划线。
    '.tsl-hud a',
    // (2026-10-03 一度为 .hero-logo .lg-glow 登记过，随即撤销：
    //  站主要求 logo 沿用原型最终定色，改用专用 token --logo-glow，不再是裸 --accent-bright。
    //  留着这条"已不存在用法"的例外，等于给白名单掺水 —— 以后真出问题会被它掩护过去。)
    // ★ 2026-10-03 删：'.sign-head .sign-fig' / '.sign-foot .sign-meta'
    //   —— 关于页签名切片整块已删，这两条已成「已不存在用法」⇒ 同上面的理由移除。
    //   ★ 移除后 --accent-bright 在产物里只应剩 .tsl-hud a 一处；
    //     若将来别处要用它，请连同「为什么那个底色下只有它达标」一起写进来。
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

/**
 * 深底小字不许用「纸上的绿」与 --muted（2026-10-03）。
 *
 * 起因：关于页「亲笔」切片把 dusk 当底色放内容 ⇒ 必须有一道断言守住
 * 「深底上的文字用哪一档」。实测（scripts/assert-tokens.mjs 同一个公式）：
 *   --accent-ink on --dusk-1 = 2.97  ❌ 不达标（它在**纸**上是 6.18，搬进深底就不行了）
 *   --muted       on --dusk-1 = 2.77  ❌ 同理（纸上是 6.62）
 *   --dusk-6      on --dusk-1 = 11.76 ✅
 *   --accent-bright on --dusk-1 = 6.90 ✅
 * ⇒ 深底小字只有这两个选择。这条断言就是防止「看着是绿色就搬过去」。
 *
 * ★ 为什么用「产物级 + 源文件级」两条：产物级抓真实渲染，源文件级抓写法
 *   （Astro 的 scoped style 会给选择器插属性，只扫产物能全覆盖但看不到意图）。
 */
describe('深底（dusk 系）上的文字颜色', () => {
  it('assert-tokens.mjs 里有 dusk 系的对比度断言（含 dusk-5 的图形色下限）', () => {
    const script = readFileSync('scripts/assert-tokens.mjs', 'utf8');
    // dusk-6 是深底小字唯一可用的中性色，必须有
    expect(script, '缺 dusk-6 on dusk-1 的断言').toMatch(/dusk-6.*dusk-1/);
    // dusk-5 实测 4.26，不到 4.5 ⇒ 只能做图形，必须以图形下限登记
    expect(script, 'dusk-5 应登记为图形色（下限 3）').toMatch(/dusk-5.*dusk-1.*4\.26.*3/);
  });

  /* ★ 2026-10-03 删：两条绑死 `.sign-*` 的断言（关于页签名切片）。
       签名整块已删（站主第三轮口径「只保留排版，签名恢复原样」），
       判据 `deepBlocks.length > 0` 变成恒假 ⇒ 删掉而不是留着假绿。
       ★ 上面那条 `assert-tokens.mjs 里有dusk 系断言` **仍然保留** ——
         它守的是 token 层面的通用规则（dusk-6/dusk-5 在任何深底上都要成立），
         与签名无关。删签名不该把token 层的门闩一起带走。 */
});
