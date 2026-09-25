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

  it('无 JS 时死读数被藏掉（html:not(.js) 规则）', () => {
    const css = allCss();
    // 仪表读数是 JS 驱动的：没有 JS 就不该显示死指针/假读数。
    // 原型用 html.no-js 规则，本站门控方向相反（默认无 JS 安全、html.js 增强），故写作 html:not(.js)。
    expect(css, '缺 html:not(.js) .hud-progress 规则').toMatch(/html:not\(\.js\)[^{,]*\.hud-progress/);
    expect(css, '缺 html:not(.js) .band-readout 规则').toMatch(/html:not\(\.js\)[^{,]*\.band-readout/);
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

  it('七组 @keyframes 都在产物 CSS 里', () => {
    const css = allCss();
    // 产物里还有 base 侧的 @keyframes rise（Band 的入场），所以只查名字不查总数。
    for (const k of ['sweep-in', 'type-in', 'wipe-in', 'rise-in', 'sweep-x', 'orbit', 'blink']) {
      expect(css, `产物 CSS 缺 @keyframes ${k}`).toContain(`@keyframes ${k}`);
    }
  });

  it('首页有全部动效钩子，其余页面一个都没有', () => {
    const hooks = ['railFill', 'hudPct', 'hudSec', 'bandTitle', 'band-sweep'];
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
    const h = readFileSync(join(DIST, 'index.html'), 'utf8');
    for (const cls of ['bg-mark', 'bg-ring', 'bg-orbit', 'bg-green']) {
      expect(h, `${cls} 缺 aria-hidden`).toMatch(new RegExp(`class="${cls}"[^>]*aria-hidden="true"`));
    }
    expect(allCss(), '装饰层必须 pointer-events:none').toMatch(/pointer-events:\s*none/);
  });

  it('正文层显式抬到装饰层之上（否则 fixed 装饰会盖住静态正文）', () => {
    const css = allCss();
    expect(css, '正文层没有 position:relative（装饰层是 fixed + z-index:0）').toMatch(/\.tier\[[^\]]*\][^{]*\{[^}]*position:\s*relative/);
  });
});
