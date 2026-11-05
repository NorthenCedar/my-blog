import {jsClosure} from './_writer-output';
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

  it('无 JS 时正文不被弱化（弱化机制已随 console 外壳删除）', () => {
    // ★ 2026-09-30 再次换判据（站主拍板「直接换成原型，不要改本站的像原型」）。
    //   上一版守的是 `html.js .field-item { opacity: var(--focus-min) }` —— 那套
    //   「正文默认 65% 不透明、只有中线压住的才亮起来」是 console 外壳的东西，
    //   原型根本没有，本轮连同 CSS 一起删掉了（不是留着不用）。
    //
    //   **内核没变**：门控方向必须 fail-safe —— 无 JS 时页面完整可读。
    //   现在的机制是「揭示的初值由 JS 写」，所以判据换成两条：
    //     ① 产物里**没有**任何 .field-item 弱化规则（旧机制连根删）；
    //     ② 揭示的 opacity:0 初值出现在**脚本**里 —— 若写进 CSS，
    //        动画一旦没跑成（无 JS / JS 报错）就是整页空白，方向就反了。
    const css = allCss();
    expect(css, '首页不该再有 .field-item 的聚焦弱化（已随 console 外壳删除）').not.toMatch(
      /\.field-item/,
    );
    const idx = jsClosure(join(DIST, 'index.html')).code;
    expect(
      idx,
      '揭示的 opacity:0 初值必须由 JS 写（写进 CSS ⇒ 无 JS 时整页空白）',
    // ★ 三种引号都要认：esbuild 会把源码里的 '0' / "0" 统一压成**反引号**的 `0`，
    //   只写 ["'] 会匹配不上（本轮实测撞到的）。
    ).toMatch(/\.style\.opacity\s*=\s*[`"']0[`"']/);
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
    //   现在的清单 = 首页真实在用的四组：∞ 落款摆动、语言占比条的「生长/淡入」、
    //   背景网格呼吸、字母滚动带。
    //   ★ 2026-10-07 第五轮：`hint`（SCROLL 提示那条约 2.2s 的绿色跑光）随 .scroll-hint
    //     一起删除 —— 宿主 DOM 没了还留着断言，就是上面说的"守空气"。
    //   （rise-in 是首屏文案的错位入场，原型用 IntersectionObserver + Web Animations，
    //    不靠 CSS keyframes ⇒ 本轮删除，别再往这个清单里加回去。）
    //   产物里还有 base/comment 侧的其它 @keyframes，所以只查名字不查总数。
    const css = allCss();
    for (const k of ['logo-sway', 'lang-grow', 'lang-fade', 'breathe']) {
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

  it('console 外壳的四个状态类已连根删除（不是留着不用）', () => {
    // ★ 2026-09-30 判据**方向反过来**（站主拍板「直接换成原型」）。
    //   is-revealed / is-focused / is-yielding / is-flash 都是 console 时代的动效状态类
    //   （入场揭示 / 聚焦弱化 / 穿字让位 / 点击闪烁）—— 原型一件都没有。
    //   所以这里守的是「必须不存在」：留着样式却没人加类、或加了类却没有样式，
    //   两种都是死代码，上一版那条断言只防住了后者。
    const css = allCss();
    for (const c of ['is-revealed', 'is-focused', 'is-yielding', 'is-flash']) {
      expect(css, `.${c} 还在产物 CSS 里 —— console 外壳的残留没删干净`).not.toContain(c);
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
      /* ★ 类名换回原型原名 .band-glass（2026-09-30：本轮以原型为源逐段照抄，
         上一版为了避开「中扫描带」而改名 .hero-glass，那套扫描带早已删除）。
         ★ 2026-10-07 第五轮：**g1 从这份装饰清单里移出** —— 它成了「时间切片」，
           承载本地时间与站龄，是**信息**不是装饰（站主 A-3）。
           "装饰层不许承载信息"和"信息不许伪装成装饰"是同一条规则的两端，
           所以移出之后必须补上**反向**的那条（见本 it 块末尾）。 */
      ['band-glass g2', /class="band-glass g2 par-fast"[^>]*aria-hidden="true"/],
      ['band-glass g3', /class="band-glass g3 par-fast"[^>]*aria-hidden="true"/],
      ['dusk', /class="dusk"[^>]*aria-hidden="true"/],
      ['paper-inf', /class="paper-inf"[^>]*aria-hidden="true"/],
    ];
    for (const [name, re] of decos) {
      expect(h, `${name} 缺 aria-hidden`).toMatch(re);
    }
    expect(allCss(), '装饰层必须 pointer-events:none').toMatch(/pointer-events:\s*none/);

    // ── 反向那条：首屏「时间切片」是信息层（站主 2026-10-07 第五轮 A-3）───────────
    // 三件都要守，缺一件它就会退回"装饰"或退回"空壳"：
    //   ① 不带 aria-hidden —— 否则读屏用户永远读不到这两个读数；
    //   ② 站龄在**无 JS**时也要有真值（构建期算的天数），不是 `—` 也不是空；
    //   ③ 它仍然**不是入口**（A-3 原方案明确不把玻璃片做成链接）—— 由
    //      `.band-glass` 的 pointer-events:none 兜着，这里只钉住没有 <a>。
    const g1 = h.match(/<div class="band-glass g1[^>]*>/)?.[0] ?? '';
    expect(g1, '找不到首屏 g1 那块玻璃（判据失效，别当通过）').not.toBe('');
    expect(g1, '时间切片（g1）带了 aria-hidden —— 它承载读数，不该对读屏隐身').not.toContain(
      'aria-hidden',
    );
    expect(h, '时间切片缺本地时间读数格').toContain('data-slice-time');
    expect(h, '首屏时间切片必须给出站龄的初值（无 JS 也要看得见真数）').toMatch(
      /data-slice-age[^>]*>\d+</,
    );
  });

  it('正文层显式抬到装饰层之上（否则 fixed 装饰会盖住静态正文）', () => {
    const css = allCss();
    // ★ 2026-09-30：承载者从 .tier 换成 .paper-wrap —— 本轮类名换回原型原名
    //   （.section / .paper-wrap），而 .section 在原型里是**静态**的（没有 position）。
    //   真正把正文抬到 fixed 装饰层之上的是 .paper-wrap 的 position:relative + isolation。
    expect(css, '纸白正文区没有 position:relative（装饰层是 fixed + z-index:0）').toMatch(
      /\.paper-wrap\[[^\]]*\][^{]*\{[^}]*position:\s*relative/,
    );
  });
});
