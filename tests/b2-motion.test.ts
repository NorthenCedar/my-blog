import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const hasDist = existsSync(DIST);

const walk = (d: string, pred: (n: string) => boolean): string[] => {
  const out: string[] = [];
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, pred));
    else if (pred(e)) out.push(p);
  }
  return out;
};
const rel = (p: string) => p.replace(/\\/g, '/');

/** 收集所有条件里含某关键字的 @media 块（产物 CSS 是压缩的，按大括号配对切，不用正则硬套嵌套）。 */
function mediaBlocks(css: string, condIncludes: string): string[] {
  const out: string[] = [];
  const re = /@media[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const head = m[0];
    if (!head.includes(condIncludes)) continue;
    const open = m.index + head.length - 1;
    let depth = 0;
    for (let j = open; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') {
        depth--;
        if (depth === 0) {
          out.push(css.slice(open, j + 1));
          re.lastIndex = j + 1;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * B2 动效层的**静态契约**。
 *
 * 浏览器级的三态验证（计算样式、getAnimations() 的 animationName、"禁用 JS 后页面长什么样"）
 * **不放进 vitest**：那需要真实 Chrome + CDP，本仓库没有 CI 浏览器，塞进来只会变成"CI 上跳过"。
 * 那部分固化成脚本，退出码即结论：
 *
 *     npm run build && node scripts/verify-home-states.mjs
 *
 * 本文件守的是"不打开浏览器也能查"的那一半 —— 静态契约一旦被破坏，先红在这里，
 * 不必等到有人手动跑脚本。
 */
describe.skipIf(!hasDist)('B2 动效层：产物静态契约', () => {
  const allHtml = () => walk(DIST, (n) => n.endsWith('.html'));
  const allCss = () =>
    walk(join(DIST, '_astro'), (n) => n.endsWith('.css'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

  it('两态门控脚本只落在首页（动效是首页专属）', () => {
    const pages = allHtml().filter((p) => readFileSync(p, 'utf8').includes("classList.add('js')"));
    expect(pages.map(rel), '门控脚本应当只出现在首页').toEqual(['dist/index.html']);
  });

  it('无 JS 时正文不被弱化（弱化只在 html.js 下，fail-safe 方向不能反）', () => {
    // ★ 2026-09-30 换判据（站主拍板「去掉 console 外壳，换成原型 topbar」）。
    //   原来守的是 `html:not(.js) .hud-progress / .band-readout` —— 那两个是仪表读数，
    //   随外壳一起删了（没有 JS 就该藏，否则会挂着 000% 这种死指针）。
    //
    //   这条不变的**内核**是：门控方向必须是 fail-safe —— 默认（无 JS）页面完整可读，
    //   JS 到位才启用增强。现在首页唯一还"弱化内容"的增强是入场揭示/聚焦
    //   （`.field-item` 透明度压到 --focus-min），所以判据换成：
    //     ① 弱化规则**必须**挂在 html.js 下（反过来写就是"没 JS 时正文永久半透明"）；
    //     ② 并且 reduced-motion 下把它压回 1。
    const css = allCss();
    expect(css, '弱化规则没有挂在 html.js 下（无 JS 时正文会被永久半透明）').toMatch(
      /html\.js[^{,]*\.field-item[^{]*\{[^}]*opacity:\s*var\(--focus-min\)/,
    );
    const blocks = mediaBlocks(css, 'prefers-reduced-motion');
    const joined = blocks.join('\n');
    expect(joined, 'reduced-motion 下没把 .field-item 的弱化压回 1').toMatch(
      /\.field-item[^{]*\{[^}]*opacity:\s*1/,
    );
  });

  it('prefers-reduced-motion 下关掉动画并压平位移', () => {
    const css = allCss();
    // 产物里有两个 reduced-motion 块（base.css 早有一条全局压平、index 另有一条），
    // 所以要按块收集后再合起来查，不能只看"文件里有这几个词"。
    const blocks = mediaBlocks(css, 'prefers-reduced-motion');
    expect(blocks.length, '产物 CSS 里一个 prefers-reduced-motion 块都没有').toBeGreaterThan(0);
    const joined = blocks.join('\n');
    expect(joined, 'reduced-motion 下没有关掉动画（animation:none）').toMatch(/animation:\s*none/);
    expect(joined, 'reduced-motion 下没有压平位移（transform:none）').toMatch(/transform:\s*none/);
  });

  it('首页动效的 @keyframes 都在产物 CSS 里', () => {
    // ★ 2026-09-30 换清单：旧的七组里 sweep-in / type-in / wipe-in 是给
    //   扫描带 / HUD / 磁带水印做入场的，sweep-x / orbit / blink 是常驻循环 ——
    //   这六组的宿主 DOM 已随 console 外壳全部删除，留着断言就是"守空气"。
    //   新的两组：rise-in（首屏文案错位入场）、logo-sway（∞ 落款常驻小幅摆动）。
    //   产物里还有 base/comment 侧的其它 @keyframes，所以只查名字不查总数。
    const css = allCss();
    for (const k of ['rise-in', 'logo-sway']) {
      expect(css, `产物 CSS 缺 @keyframes ${k}`).toContain(`@keyframes ${k}`);
    }
  });

  it('首页有全部动效钩子，其余页面一个都没有', () => {
    // ★ 2026-09-30 换钩子：railFill / hudPct / hudSec / bandTitle / band-sweep
    //   全随外壳删除。新钩子 = 原型 v10.6 首屏的两个 JS 注入点：
    //   rhGridSvg（流场线由 JS 建 path）、dnaStack（three.js 注入 canvas）。
    //   判据不变：只在首页出现，其余 22 页一个都不许有。
    const hooks = ['rhGridSvg', 'dnaStack'];
    for (const p of allHtml()) {
      const t = readFileSync(p, 'utf8');
      const isIndex = rel(p) === 'dist/index.html';
      for (const h of hooks) {
        if (isIndex) expect(t, `首页缺动效钩子 ${h}`).toContain(h);
        else expect(t, `${rel(p)} 不该含首页动效钩子 ${h}`).not.toContain(h);
      }
    }
  });

  it('四个状态类在 CSS 里都有规则（不是只在 JS 里加类）', () => {
    const css = allCss();
    for (const c of ['is-revealed', 'is-focused', 'is-yielding', 'is-flash']) {
      expect(css, `CSS 里没有 .${c} 的规则 —— 加了类却没有样式等于没做`).toContain(c);
    }
  });

  it('背景装饰层不承载信息、也不拦指针', () => {
    // ★ 2026-09-30 换清单：bg-mark / bg-ring / bg-orbit / bg-green 是旧纸白首页的装饰层，
    //   已随「统一换成原型 v10.6」删除。新清单 = 原型首屏与纸白区的全部纯装饰层：
    //   流场线、DNA 容器、三块玻璃卡、晨昏带、百褶 ∞ 底纹。
    //   **判据一条没降**：每个都要 aria-hidden（不承载信息），且 CSS 里有 pointer-events:none（不拦指针）。
    const h = readFileSync(join(DIST, 'index.html'), 'utf8');
    const decos: [string, RegExp][] = [
      ['rh-grid', /class="rh-grid"[^>]*aria-hidden="true"/],
      ['dna-stack', /class="dna-stack"[^>]*aria-hidden="true"/],
      ['hero-glass g1', /class="hero-glass g1"[^>]*aria-hidden="true"/],
      ['hero-glass g2', /class="hero-glass g2"[^>]*aria-hidden="true"/],
      ['hero-glass g3', /class="hero-glass g3"[^>]*aria-hidden="true"/],
      ['dusk', /class="dusk"[^>]*aria-hidden="true"/],
      ['paper-inf', /class="paper-inf"[^>]*aria-hidden="true"/],
    ];
    for (const [name, re] of decos) {
      expect(h, `${name} 缺 aria-hidden`).toMatch(re);
    }
    expect(allCss(), '装饰层必须 pointer-events:none').toMatch(/pointer-events:\s*none/);
  });

  it('正文层显式抬到装饰层之上（否则 fixed 装饰会盖住静态正文）', () => {
    const css = allCss();
    expect(css, '正文层没有 position:relative（装饰层是 fixed + z-index:0）').toMatch(/\.tier\[[^\]]*\][^{]*\{[^}]*position:\s*relative/);
  });
});
