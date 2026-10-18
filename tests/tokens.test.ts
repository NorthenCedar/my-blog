import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

describe('token 对比度', () => {
  /* ★ 这条要 fork 一个 node 子进程跑脚本，**不能用 vitest 默认的 5 秒预算**
     —— 全量门禁是 46 个 worker 并发，那 5 秒里有相当一部分被排队和进程创建吃掉。
     2026-10-18 实测：单独跑这条 1.2 秒，全量跑 7.3 秒 ⇒ 纯超时，不是判据失败。
     给它 30 秒。这不是放松判据（脚本的输出要求一个字没变），
     而是承认「fork 子进程」和「读文件」这两类操作天生比纯计算慢。
     ⚠ 判据红了要区分「断言失败」和「超时」—— 后者跟判据无关，
       只看 `Error: Test timed out` 还是 `AssertionError`。 */
  it('scripts/assert-tokens.mjs 从 tokens.css 复算后全部达标', () => {
    const out = execFileSync('node', ['scripts/assert-tokens.mjs'], { encoding: 'utf8' });
    expect(out).toContain('全部 token 对比度达标');
  }, 30000);

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
    // 2026-10-07 追加：相册「螺旋盘」新页（`/gallery/spiral/`）的灯箱，类名是 `.splb`。
    // 它照抄的正是 /gallery 那个灯箱的体例 —— 遮罩同为 `#1a1a1aeb`（近 --ink），
    // 按钮的 hover / focus 文字同理在深底上取 --accent-bright（对 --ink 6.26:1，高于 AA 4.5:1）。
    // ★ 为什么不干脆把新页的类名改成 `.lb` 去"顺带"被上面两条覆盖：
    //   那样子名单就**不再逐处认领**了 —— 而"每一处裸 --accent-bright 都有人写清理由"
    //   正是这份名单存在的意义（见上面那条"已不存在用法不许留在名单里"的规矩）。
    '.splb button:hover',
    '.splb button:focus-visible',
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

/* ============================================================================
 * 暗色模式「黑 + 橙」（2026-10-18 站主定案，与 rhine-lock 立体 ∞ 的原版配色一致）
 *
 * 判据设计说明（守关系，不守快照）：
 *   · 不钉死每个 token 的具体十六进制 —— 换一档橙不该让整站红掉。
 *   · 钉三件**会真的出事**的关系：
 *     ① 暗色底必须是**近黑**（L 极低）—— 否则「暗色模式」名不副实；
 *     ② 暗色底必须与 Jelly Slider 的 `PAPER_DARK` **字面量相等** ——
 *        两者脱钩时那个画布的地面色会与页面纸色不一致（历史上真发生过：
 *        按钮在 ∞ 底纹上现出一个矩形）。这条已由 theme-toggle.test.ts 守，
 *        这里再钉一次是为了让"改 tokens 忘了改 vendor"当场红在token 层。
 *     ③ 暗色底上每一个前景 token 必须**仍达标**（正文 4.5:1 / 装饰件≥ 1.1:1）——
 *        黑底比深绿底更暗，理论上只升不降；这条守的是"万一有人把某个 token
 *        改成深色值塞进暗色段"这种情况。
 *   ★ 亮色段**不在本断言范围内**：站主要「亮色仍是纸白 + 墨绿」，那是另一条断言的事。
 * ======================================================================== */
describe('暗色模式：黑底 + 橙强调（2026-10-18）', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  // 抠出 html.dark { ... } 块（缩进两空格的都在里面）
  const darkBlock = css.slice(css.indexOf('html.dark {'), css.indexOf('html.dark {') + 2000);
  const tok = (name: string) => {
    const m = darkBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6,8})`));
    return m?.[1] ?? null;
  };

  const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
    return 0.2126 * s2l(r) + 0.7152 * s2l(g) + 0.0722 * s2l(b);
  };
  const ratio = (a: string, b: string) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  it('① 暗色底是近黑（不是深绿场）：相对亮度必须低于 0.01', () => {
    const paper = tok('paper')!;
    expect(paper, 'html.dark 里没有 --paper').toBeTruthy();
    const L = lum(paper);
    expect(L, `暗色底 ${paper} 的亮度 ${L.toFixed(4)} 太高，不是近黑（旧的深绿 #131b17 是 0.0068）`).toBeLessThan(0.01);
  });

  it('② 暗色底与 Jelly Slider 渲染器的 PAPER_DARK 逐字相等', () => {
    const vendored = readFileSync('src/vendor/jelly-slider/constants.ts', 'utf8');
    const m = vendored.match(/PAPER_DARK\s*=\s*'(#[0-9a-fA-F]{6})'/);
    expect(m, 'constants.ts 里找不到 PAPER_DARK 字面量').toBeTruthy();
    expect(tok('paper'), 'tokens.css 的 --paper 与渲染器的 PAPER_DARK 脱钩了 ⇒ 按钮地面色会与页面不一致').toBe(m![1]);
  });

  it('③ 暗色段每个 token 都在黑底上仍可辨（正文 >= 4.5:1，装饰件 >= 1.1:1）', () => {
    const paper = tok('paper')!;
    // 正文类：必须达到 WCAG AA 正文对比度
    for (const [name, min] of [
      ['ink', 4.5], ['muted', 4.5], ['accent', 4.5],
      ['accent-ink', 4.5], ['signal-text', 4.5], ['ink-motif', 4.5],
    ] as const) {
      const v = tok(name);
      expect(v, `html.dark 缺少 --${name}`).toBeTruthy();
      const r = ratio(v!, paper);
      expect(r, `--${name} ${v} 在暗色底 ${paper} 上只有 ${r.toFixed(2)}:1，低于 ${min}:1`).toBeGreaterThanOrEqual(min);
    }
    // 装饰类：没有AA 阈值，但必须比底亮出来（否则「抬升面」糊成一片）
    for (const [name, min] of [['hair', 1.1], ['panel', 1.1], ['accent-wash', 1.05], ['code-inline-bg', 1.1]] as const) {
      const v = tok(name);
      expect(v, `html.dark 缺少 --${name}`).toBeTruthy();
      const r = ratio(v!, paper);
      expect(r, `--${name} ${v} 在暗色底上只有 ${r.toFixed(2)}:1，看不出层次`).toBeGreaterThanOrEqual(min);
    }
  });

  it('④ 暗色强调色是**橙**（不是墨绿）—— 与引入的 rhine-lock 立体 ∞ 原版配色一致', () => {
    const accent = tok('accent')!;
    const h = accent.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    // 橙的定义：红最高、蓝最低，且蓝显著低于绿（绿是「脏」掉的那一个）
    expect(r, `--accent ${accent} 的红通道不是最高，橙应该红最高`).toBeGreaterThan(g);
    expect(b, `--accent ${accent} 的蓝通道太高，绿橙都该压住蓝`).toBeLessThan(g * 0.6);
    // 明确排除墨绿（绿最高）
    expect(g, `--accent ${accent} 的绿通道最高，这是墨绿不是橙`).toBeLessThan(r);
  });

  it('⑤ 亮色段仍是纸白 + 墨绿（这次只改暗色，不许顺手动亮色）', () => {
    const rootEnd = css.indexOf('html.dark {');
    const rootBlock = css.slice(0, rootEnd);
    // 亮色的 paper 仍是纸白族（高亮度）
    // ⚠ 这里刻意用 [ \t]* 而不是 \s*：\s 会跨行匹配到 html.dark 段里去，
    //   那就不是「亮色的 --paper」而是「整份文件第一个 --paper」，判据会假绿。
    const lightPaper = rootBlock.match(/--paper:[ \t]*(#[0-9a-fA-F]{6})/)?.[1];
    expect(lightPaper, '没在 :root 段找到 --paper').toBeTruthy();
    expect(lum(lightPaper!), `亮色底 ${lightPaper} 不该是暗色`).toBeGreaterThan(0.8);
    // 亮色的 accent 仍是绿（红通道不是最高）
    const lightAccent = rootBlock.match(/--accent:[ \t]*(#[0-9a-fA-F]{6})/)?.[1]!;
    const h = lightAccent.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16);
    expect(g, `亮色 --accent ${lightAccent} 不再是绿了，亮色段被误改`).toBeGreaterThan(r);
  });
});
