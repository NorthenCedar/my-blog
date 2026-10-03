/* 关于页两栏版式的契约（站主 2026-10-03：「右半部分太空，重新排版」）
 *
 * 要守的不只是「有两栏」，而是三条**容易被顺手改坏的**结构性约定：
 *   ① 正文 .prose 的宽度一个token 都没动（口径 #3「正文排版不动」）；
 *   ② 移动端用 display:contents 保住了原阅读顺序（签名仍在正文之前）；
 *   ③ 分栏从 1024px 起 —— 低于它右列塞不下清单。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'index.html'));

const ACSS_SRC = readFileSync(join(ROOT, 'src/pages/about.astro'), 'utf8');
/* 剥注释：负向断言必须对注释免疫（文件头把「为什么」写得很细，
   那些说明文字里会出现各种选择器字面量）。 */
const ACSS = ACSS_SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('关于页 · 两栏版式', () => {
  it('结构是 main + aside 两栏，且 aside 在 main 之后', () => {
    const iMain = ACSS_SRC.indexOf('class="about-main"');
    const iSide = ACSS_SRC.indexOf('class="about-side"');
    const iProse = ACSS_SRC.indexOf('class="prose"');
    const iSign = ACSS_SRC.indexOf('class="sign-card"');
    expect(iMain, '缺 .about-main').toBeGreaterThan(-1);
    expect(iSide, '缺 .about-side').toBeGreaterThan(-1);
    /* main 里必须含「页头 → 签名 → 正文」这个既有顺序；
       签名在正文之前是改版前就有的，不能因为分栏而颠倒。 */
    expect(iSign, '签名不在 main 内').toBeGreaterThan(iMain);
    expect(iSign, '签名跑到了正文后面').toBeLessThan(iProse);
  });

  it('★ 移动端靠 display:contents 保住阅读顺序（不是 grid 显式定位）', () => {
    /* ★ 这条最容易被「顺手改成 grid-row/grid-column」破坏：
       一旦用 grid 显式定位，**DOM 顺序就决定窄屏顺序**，而 aside 在 main 之后
       ⇒ 签名会掉到正文后面。display:contents 让 aside 不生成盒子、
       子元素直接参与父级流动，窄屏顺序 = main 三个 + aside 三个 = 与改版前一致。 */
    expect(ACSS).toMatch(/\.about-side\s*\{[^}]*display:\s*contents/);
    // 窄屏容器本体是 block（普通单列流），不是 grid
    const base = ACSS.match(/\.about-grid\s*\{([^}]*)\}/);
    expect(base, '找不到 .about-grid 的基础规则').toBeTruthy();
    expect(base![1], '窄屏默认不该是 grid（会让 DOM 顺序生效）').not.toMatch(/display:\s*grid/);
  });

  it('分栏断点是 1024px，不是更低（低于它右列塞不下清单）', () => {
    const m = ACSS.match(/@media\s*\(min-width:\s*1024px\)\s*\{[\s\S]*?\.about-grid\s*\{([^}]*)\}/);
    expect(m, '找不到 1024px 的分栏规则').toBeTruthy();
    expect(m![1]).toMatch(/display:\s*grid/);
    expect(m![1], '两列应是 measure + 余宽').toMatch(/grid-template-columns/);
    // 左列必须就是 --measure（正文该多宽就多宽），不能另设一个数
    expect(m![1]).toMatch(/var\(--measure\)/);
  });

  it('★ 正文 .prose 的宽度一个 token 都没动（口径 #3）', () => {
    /* 正文宽度仍由 prose.css 的 `max-width: var(--measure)` 给，
       本页**不得**再给 .prose 设 width / max-width / padding / font-size /
       line-height —— 那些属于「正文排版」，口径 #3 明确不动。 */
    const rules = [...ACSS.matchAll(/\.prose\s*\{([^}]*)\}/g)].map((m) => m[1]);
    for (const r of rules) {
      expect(r, '本页给 .prose 设了 max-width ⇒ 越权改正文宽度').not.toMatch(/max-width/);
      expect(r, '本页给 .prose 设了 width ⇒ 越权改正文宽度').not.toMatch(/(^|\s)width:/);
      expect(r, '本页给 .prose 设了 font-size / line-height ⇒ 越权改正文字号行高')
        .not.toMatch(/font-size|line-height/);
    }
  });

  it('右栏各块靠单条上边框分隔，不是 gap + 边框（否则「双线夹空白」）', () => {
    /* 目检踩到：flex column + gap 与 border-top 同时存在时，
       两个半段间距（上一块下方 gap + 下一块上方 padding）夹着一条线。 */
    const side = ACSS.match(/\.about-side\s*\{([^}]*)\}/g)?.map((m) => m[1]) ?? [];
    for (const s of side) {
      if (/display:\s*flex/.test(s)) {
        expect(s, '右栏用 flex + gap 会与 border-top 叠成双线').not.toMatch(/gap:/);
      }
    }
    expect(ACSS).toMatch(/\.about-side \.fig-block\s*\{[^}]*border-top:\s*1px solid/);
    // 首块不要上边框（否则顶部多一条线）
    expect(ACSS).toMatch(/\.about-side \.fig-block:first-child\s*\{[^}]*border-top:\s*0/);
  });
});

describe.skipIf(!hasDist)('产物里的关于页', () => {
  const ABOUT = readFileSync(join(DIST, 'about', 'index.html'), 'utf8');

  it('渲染出两栏容器与三块右栏内容', () => {
    expect(ABOUT).toMatch(/class="about-grid"/);
    expect(ABOUT).toMatch(/class="about-main"/);
    expect(ABOUT).toMatch(/class="about-side"/);
    for (const t of ['我的一些社交账号', '技术栈', '源码语言占比']) {
      expect(ABOUT, `产物里缺「${t}」`).toContain(t);
    }
  });

  it('签名与正文仍在同一容器内（移动端顺序的前提）', () => {
    const iMain = ABOUT.indexOf('about-main');
    const iSign = ABOUT.indexOf('sign-card');
    const iProse = ABOUT.indexOf('class="prose"');
    const iSide = ABOUT.indexOf('about-side');
    expect(iSign).toBeGreaterThan(iMain);
    expect(iProse).toBeGreaterThan(iSign);
    expect(iSide).toBeGreaterThan(iProse);
  });
});
