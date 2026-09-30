import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 首页开场动画的**静态契约**（2026-09-30 第七版整份重写后）。
 *
 * 这一版与上一版的分工没变：浏览器级的三态 / 逐帧抽样属于 CDP 探针（`_probe/`，不入库），
 * 本文件守"不打开浏览器也能查"的那一半。
 *
 * ★ 为什么这组断言值得重写而不是删掉：旧版守的是"25fps 逐帧复刻没抄错"，
 *   新开场的价值全在**四条不可退让的性质**上，它们全都能静态查出来：
 *     ① 门控方向 fail-safe（默认不显示）—— 反向会在无 JS / JS 报错时把整站盖死；
 *     ② 首屏内容**不许**被 CSS 默认藏起来 —— 上游 wodniack.dev 就是整站 SSR opacity:0
 *        靠 JS 点亮，动画一丢内容永久不可见（本仓第六轮修掉的 bug 类型）；
 *     ③ 总时长有硬上限（站主定 5.3 s）；
 *     ④ 揭幕的逐字拆分不许把屏幕阅读器坑掉。
 *
 * 输出规矩（台账 21a5c66）：每条断言都要能反推出「验的是什么、实测多少」，禁止裸 PASS。
 */
const DIST = 'dist';
const hasDist = existsSync(DIST);
const COMPONENT = 'src/components/BootIntro.astro';

const walk = (d: string, pred: (n: string) => boolean): string[] => {
  const out: string[] = [];
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, pred));
    else if (pred(e)) out.push(p);
  }
  return out;
};

const SRC = readFileSync(COMPONENT, 'utf8');

/** 站名字标从内容层取（主题不持有文案；site.md 是唯一真源） */
const wordmark = (): string => {
  const m = readFileSync('content/site.md', 'utf8').match(/^wordmark:\s*(.+)$/m);
  return (m?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
};

/** 按大括号配对取出某条 CSS 规则的声明体（keyframes 内部有嵌套花括号，正则捞不全） */
const ruleBody = (css: string, selStart: string): string => {
  const at = css.indexOf(selStart);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return '';
};

/** 产物 HTML 里的文本实体（Astro 会把 `'` 转义成 `&#39;`）—— 比对前先还原 */
const decode = (s: string) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** 声明体里含某个 token 的规则，返回它们的**选择器**（用来验证"这条动画是不是被门控包住了"） */
const selectorsWith = (css: string, token: string): string[] => {
  const out: string[] = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    if (m[2].includes(token) && !m[1].trim().startsWith('@')) out.push(m[1].trim());
  }
  return out;
};

describe('开场动画：源文件与 token', () => {
  it('总时长有硬上限（站主定 5.3 s），且只有一处定义', () => {
    const tokens = readFileSync('src/styles/tokens.css', 'utf8');
    const full = Number((tokens.match(/--dur-boot:\s*(\d+)ms/) ?? [])[1]);
    const mini = Number((tokens.match(/--dur-boot-mini:\s*(\d+)ms/) ?? [])[1]);
    console.log(
      `判据 开场时长 对象 tokens.css 实测: --dur-boot=${full}ms（上限 5300）· --dur-boot-mini=${mini}ms`,
    );
    expect(full, '--dur-boot 没解析出来').toBeGreaterThan(0);
    expect(full, '开场总长超过站主定的 5.3 s 硬上限').toBeLessThanOrEqual(5300);
    expect(mini, '手机极简版应当明显更短').toBeLessThan(full);
    // 组件必须**引用** token，不许把 5300 抄成字面量散在各处
    expect(SRC, '组件没引用 --dur-boot').toContain('var(--dur-boot)');
    expect(SRC, '组件没引用 --dur-boot-mini').toContain('var(--dur-boot-mini)');
  });

  it('竖线：96 条，几何全部走内联自定义属性（零 JS 排布）', () => {
    const n = (SRC.match(/const N = (\d+);/) ?? [])[1];
    console.log(`判据 竖线 对象 BootIntro.astro 实测: N=${n} 条 · 每条带 --x1/--k/--h/--d/--g`);
    expect(Number(n), '竖线条数').toBe(96);
    for (const v of ['--x1', '--k', '--h', '--d', '--g']) {
      expect(SRC, `内联样式里没写 ${v}`).toContain(`${v}:`);
    }
    // 崩解的起点取自 ∞ 上的采样点（保住血缘）—— k 必须是 cos 采样，不是随机数
    expect(SRC, '崩解起点没走 ∞ 采样（--k 不是 cos）').toMatch(/Math\.cos\(\(TAU \* i\) \/ N\)/);
  });

  it('装饰子树里没有任何文字（"摒弃冷静机器感"的硬判据）', () => {
    // 旧开场有 ACCESS 打字 / 身份验证四句 / INTERNAL DATABASE —— 那些"终端小字"正是机器感的来源。
    // 新开场里唯一的人话是 skip 按钮与给屏幕阅读器的提示，它们都在装饰子树**之外**。
    const from = SRC.indexOf('class="bi-field" aria-hidden="true">') + 'class="bi-field" aria-hidden="true">'.length;
    const to = SRC.indexOf('<p class="bi-hint"');
    const deco = SRC.slice(from, to);
    const visibleText = deco
      .replace(/<[^>]*>/g, ' ') // 标签
      .replace(/\{[^}]*\}/g, ' ') // JSX 表达式（逐字表等）
      .replace(/\s+/g, '')
      .trim();
    console.log(`判据 无文字 对象 .bi-field 子树 实测: 可见文本 "${visibleText}"（应为空）· ${deco.length} 字节`);
    expect(deco.length, '没切出装饰子树').toBeGreaterThan(100);
    expect(visibleText, '装饰子树里出现了文字 —— 机器感就是这么回来的').toBe('');
  });
});

describe.skipIf(!hasDist)('开场动画：产物契约', () => {
  const allCss = () =>
    walk(join(DIST, '_astro'), (n) => n.endsWith('.css'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
  const homeHtml = () => readFileSync(join(DIST, 'index.html'), 'utf8');

  it('门控方向 fail-safe：默认不显示，只有 JS 判定该播才加 .boot-on', () => {
    const css = allCss();
    const checks: [string, boolean][] = [
      // ★ 选择器里 [data-astro-cid-*] 会插在 [data-boot-overlay] **之前** ⇒ 中间要留 [^{]* 通配
      ['html:not(.boot-on) 下隐藏', /html:not\(\.boot-on\)[^{]*\[data-boot-overlay\][^{]*\{[^}]*display:\s*none/.test(css)],
      ['锁滚动挂在 .boot-on 上', /html\.boot-on\s*\{[^}]*overflow:\s*hidden/.test(css)],
      ['reduced-motion 下强制不播', /@media[^{]*prefers-reduced-motion[^{]*\{[^@]*data-boot-overlay[^}]*display:\s*none\s*!important/.test(css)],
    ];
    for (const [label, ok] of checks) expect(ok, label).toBe(true);
    console.log(`判据 门控 对象 产物 CSS 实测: ${checks.length} 条约定全中（无 JS / reduced-motion 都安全）`);
  });

  it('首屏内容不被默认藏起来：三段入场动画全部包在 html.boot-on 里', () => {
    const css = allCss();
    // ★ 这是本组最要紧的一条。判据是「**每一条**用到这些动效的选择器都必须带 html.boot-on」——
    //   只要有一条漏了，无 JS / reduced-motion / 已播的访客就会看到被藏起来或动不了的首屏。
    const gated = ['ch-rise', 'copy-veil', 'rh-reveal'];
    for (const kf of gated) {
      const sels = selectorsWith(css, kf);
      expect(sels.length, `产物里没有任何规则用到 ${kf}`).toBeGreaterThan(0);
      const ungated = sels.filter((s) => !s.includes('html.boot-on'));
      console.log(`判据 失败安全 对象 ${kf} 实测: ${sels.length} 条用法 · 未门控 ${ungated.length}`);
      expect(ungated, `${kf} 有选择器没被 html.boot-on 包住 ⇒ 不播开场时首屏会被藏起来`).toEqual([]);
    }
    // 揭示的初值仍旧只许由 JS 写（写进 CSS ⇒ 无 JS 时整页空白）
    expect(css, '首屏揭示的 opacity:0 初值跑到 CSS 里去了').not.toMatch(/\.band-copy[^{]*\{[^}]*opacity:\s*0/);
  });

  it('逐字拆分给屏幕阅读器留了完整原文，且视觉那半是 aria-hidden', () => {
    const h1 = (homeHtml().match(/<h1 class="display"[^>]*>([\s\S]*?)<\/h1>/) ?? [])[1] ?? '';
    const sr = decode((h1.match(/<span class="display-sr"[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? '');
    const visual = h1.replace(/<span class="display-sr"[\s\S]*?<\/span>/, '');
    const visualText = decode(visual.replace(/<[^>]+>/g, ''));
    const w = wordmark();
    console.log(
      `判据 逐字无障碍 对象 h1.display 实测: 屏读原文 "${sr}" · 视觉半（去空格）"${visualText}" · 站名 "${w}"`,
    );
    expect(sr, 'h1 里没有给屏幕阅读器的完整原文（会被一个字一个字念）').toBe(w);
    expect(visual, '视觉那半没标 aria-hidden（会和屏读原文重复）').toContain('aria-hidden="true"');
    expect(visualText, '视觉那半的字与站名对不上').toBe(w.replace(/\s/g, ''));
  });

  it('覆盖层结构：装饰 aria-hidden、skip 是真 button 且在它之外', () => {
    const html = homeHtml();
    expect(html, '装饰层缺少 aria-hidden').toContain('class="bi-field" aria-hidden="true"');
    const btnAt = html.indexOf('class="bi-skip"');
    expect(btnAt, '产物里没有 skip 按钮').toBeGreaterThan(-1);
    // ★ 判据落在"装饰子树在按钮之前**已经闭合**"上 —— 直接对应
    //   「aria-hidden 子树里不许有可聚焦元素」这条硬约束。
    //   （旧版断言用"整页未闭合 div 数 === 1"，那是组件源码的时代；现在按钮在 .bi-stage 里，
    //     整页未闭合数必然是 2，所以判据要改成这一段自己的配对。）
    const fromField = html.indexOf('<div class="bi-field"');
    const between = html.slice(fromField, btnAt);
    const open = (between.match(/<div\b/g) ?? []).length;
    const close = (between.match(/<\/div>/g) ?? []).length;
    console.log(
      `判据 aria 结构 对象 .bi-field 与按钮之间的 <div> 配对 实测: 开 ${open} / 闭 ${close} ⇒ 未闭合 ${open - close}（应为 0）`,
    );
    expect(open, '没切出装饰子树到按钮的那一段').toBeGreaterThan(0);
    expect(open - close, 'skip 按钮被包进了 aria-hidden 装饰子树').toBe(0);
    expect(html, 'skip 必须是真 button').toMatch(/<button[^>]*class="bi-skip"[^>]*type="button"/);
    // 竖线在产物里也是 96 条
    const n = (html.match(/class="bi-line"/g) ?? []).length;
    console.log(`判据 竖线产物 对象 dist/index.html 实测: ${n} 条 · dch ${(html.match(/class="dch"/g) ?? []).length} 个`);
    expect(n, '产物里的竖线条数').toBe(96);
  });

  it('9 组关键帧都在产物 CSS 里', () => {
    const css = allCss();
    const kfs = [
      'bi-draw', 'bi-scatter', 'bi-gather', 'bi-wipe', 'bi-fade', 'bi-clock', // 覆盖层
      'copy-veil', 'ch-rise', 'rh-reveal', // 首屏交接
    ];
    const missing = kfs.filter((k) => !css.includes(`@keyframes ${k}`));
    console.log(`判据 关键帧 对象 产物 CSS 实测: ${kfs.length - missing.length}/${kfs.length} 就位`);
    expect(missing, `产物 CSS 缺这些 @keyframes：${missing.join(', ')}`).toEqual([]);
  });

  it('总时长由 token 驱动，不在组件里抄字面量', () => {
    const css = allCss();
    const clock = selectorsWith(css, 'bi-clock').join(' ');
    console.log(`判据 时长钟 对象 产物 CSS 实测: ${clock.slice(0, 120)}`);
    // 时钟那条动画必须是 var(--bi-total)（= var(--dur-boot)，见组件里的 :global(html)）
    const body = ruleBody(css, '.bi-clock[data-astro-cid');
    expect(
      body.replace(/\s+/g, ''),
      '时钟动画没有走 --bi-total / var(--dur-boot) ⇒ 改 token 时它不会跟着变',
    ).toContain('animation:bi-clockvar(--bi-total)');
  });
});
