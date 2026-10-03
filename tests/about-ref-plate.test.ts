/* 关于页背景大图的契约（站主 2026-10-03 16:37 指定：**直接拿那张月相图当背景**，
 * 把纯黑底改成偏黑的深绿）
 *
 * ⚠ 这份断言在同一天被推翻重写过一次，原因记在下面：
 *   ① 16:20 站主驳回上一版：「我要的强调色呢…你不要变他们的颜色什么的」
 *      —— 那一版把参考图统一染成墨绿 + 压成极淡 alpha，两件事都被否。
 *   ② 16:37 站主直接指定一张图当背景 ⇒ 断言从「四块取景框」改成「一张大图」。
 *   ⇒ **教训**：断言要守「站主明确的意图」而不是「我上一版的实现形态」。
 *     上一轮我守的是「四块 + 负偏移 + 压淡」，全是他不要的东西。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'index.html'));

const SRC = readFileSync(join(ROOT, 'src/pages/about.astro'), 'utf8');
/* 剥注释**只用于负向断言**。⚠ 源文件里那段说明注释中出现过块注释定界符的**字面文本**，
   朴素的块注释正则会一路吃到下一个定界符、**把中间真正的代码吞掉**
   ⇒ 正向断言一律用未剥注释的原文。 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

const PLATE_DIR = join(ROOT, 'src/assets/about/plates');
const plates = existsSync(PLATE_DIR) ? readdirSync(PLATE_DIR).filter((f) => f.endsWith('.webp')) : [];

describe('关于页 · 背景大图（站主 16:37 指定）', () => {
  it('素材是一张图，且已进仓、体积可控', () => {
    expect(plates.length, 'plates 目录下的 webp 数量不对（应为一张背景图）').toBe(1);
    expect(plates[0]).toBe('moon-main.webp');
    const kb = statSync(join(PLATE_DIR, plates[0])).size / 1024;
    // 原图 1.25 MB / 1920×1045 ⇒ 裁切+转色后应显著变小
    expect(kb, `背景图 ${kb.toFixed(0)} KB，没显著变小`).toBeLessThan(400);
  });

  it('★ 走构建期管线（<Image widths sizes>），不是 <img src> 直连', () => {
    expect(SRC, '背景图没走 import.meta.glob').toMatch(
      /import\.meta\.glob<[^>]*ImageMetadata[^>]*>\('\/src\/assets\/about\/plates\/\*\.webp'/);
    const img = SRC.match(/<Image\b(?=[^>]*class="ref-img")[^>]*\/>/);
    expect(img, '没找到渲染背景图的 <Image class="ref-img">').toBeTruthy();
    expect(img![0], '少了 widths ⇒ 不会出多档 srcset').toMatch(/widths=\{/);
    expect(img![0], '少了 sizes ⇒ 浏览器会下最大档').toMatch(/sizes="/);
  });

  it('★ 不做灰度 / 不染色 / 不压淡 —— 站主要的是原色与强调色', () => {
    /* 站主 16:20 原话：「你不要变他们的颜色什么的」「我要的强调色呢」。
       前两版分别做了「统一染墨绿」与「压成极淡 alpha」⇒ 都被否。
       ⇒ 判据：底纹层不许有 filter、不许有 opacity 压淡。 */
    const rules = [...CODE.matchAll(/(\.ref[\w-]*[^{}]*)\{([^}]*)\}/g)].map((m) => m[2]);
    expect(rules.length, '没找到底纹层的样式块 —— 改名了要同步这条断言').toBeGreaterThan(0);
    for (const r of rules) {
      expect(r, '底纹里还有 filter（会改掉原图的原色与强调色）').not.toMatch(/filter:/);
    }
    const main = CODE.match(/\.ref-main\s*\{([^}]*)\}/);
    if (main) expect(main[1], '`.ref-main` 不该被整体压淡').not.toMatch(/opacity:\s*0?\.\d/);
  });

  it('背景层是 fixed 铺满视口的装饰层，且不吃点击', () => {
    expect(CODE).toMatch(/\.ref-plate\s*\{[^}]*position:\s*fixed/);
    expect(CODE).toMatch(/\.ref-plate\s*\{[^}]*inset:\s*0/);
    expect(CODE).toMatch(/\.ref-plate\s*\{[^}]*pointer-events:\s*none/);
    // ★ overflow:hidden 是「图不撑出横向滚动」的保证
    expect(CODE, '缺 overflow:hidden ⇒ 背景图会撑出横向滚动').toMatch(/\.ref-plate\s*\{[^}]*overflow:\s*hidden/);
    expect(SRC).toMatch(/class="ref-plate" aria-hidden="true"/);
  });

  it('★ 内容层必须提层（否则正文会被深色大图压住）', () => {
    /* 站主 16:14 附的截图就是这个问题：`.prose` 实测 `position: static`，
       内容层一条提层规则都没有 ⇒ 底纹直接压在文字后面（看着像「正文透明了」）。
       ★ 这条规则我写错过两次位置（一次只在样稿里、一次被后续替换删掉），
         而**源码有 ≠ 产物有** ⇒ 下面额外查产物 CSS。 */
    const zRule = CODE.match(/:global\(body\.chrome-page \.topbar\)[^{]*\{[^}]*z-index:\s*1/);
    expect(zRule, '缺顶栏/页脚提层规则（AGENTS §6.26 记过这条）').toBeTruthy();
    const content = CODE.match(/\.pagehead,\s*\.sign-card,\s*\.prose,\s*\.fig-block\s*\{[^}]*z-index:\s*1/);
    expect(content, '内容层缺 z-index:1 ⇒ 会被固定层的底纹压住').toBeTruthy();
  });

  it('★ 文字区要有不透明的纸（深色大图上正文必须可读）', () => {
    /* 踩了四轮才对：① 两条竖条 ⇒ 月亮被劈成两半；② 一整块纸 ⇒ 月亮被吃掉；
       ③ 分段但写死 % ⇒ 纸与内容错位；④ 逐块由内容撑开 ✓。
       ⇒ 现在的形态是「给 .sign-card / .prose / .fig-block 的 ::before 加纸」。
     ★ 纸必须**不透明**（半透明白纱等于把图洗淡，那是站主驳回过的做法）。 */
    const before = CODE.match(/\.prose::before[^{]*\{[^}]*\}/);
    expect(before, '正文没有自己的纸（深色大图上会看不清）').toBeTruthy();
    expect(before![0], '纸必须用不透明的 --paper').toMatch(/background:\s*var\(--paper\)/);
    expect(CODE, '不该再有半透明白纱（ref-veil 那套是站主驳回的）').not.toMatch(/ref-veil/);
  });
});

describe.skipIf(!hasDist)('产物里的背景图', () => {
  const ABOUT = readFileSync(join(DIST, 'about', 'index.html'), 'utf8');

  it('渲染出背景图且带 srcset', () => {
    const imgs = [...ABOUT.matchAll(/<img[^>]*class="ref-img"[^>]*>/g)].map((m) => m[0]);
    expect(imgs.length, '产物里背景图数量不对').toBe(1);
    expect(imgs[0]).toMatch(/srcset="/);
  });

  it('★ body 带上了 about-plate 类（否则 body 的纸白底会盖住整张图）', () => {
    /* `body { background: var(--paper) }`（base.css）铺满全页，
       元素再高的 z-index 也压不过 body 自身的背景 ⇒ 实测整张图被盖住。 */
    const bodyTag = ABOUT.match(/<body[^>]*>/);
    expect(bodyTag, '找不到 body 标签').toBeTruthy();
    expect(bodyTag![0], 'body 缺 about-plate 类 ⇒ 纸白底会盖住背景图').toMatch(
      /class="[^"]*about-plate/);
  });

  it('背景图体积可控（不是 10 MB）', () => {
    const refs = [...ABOUT.matchAll(/\/_astro\/([A-Za-z0-9_.-]+\.webp)/g)].map((m) => m[1]);
    let total = 0;
    for (const f of [...new Set(refs)]) {
      const p = join(DIST, '_astro', f);
      if (existsSync(p)) total += statSync(p).size;
    }
    expect(total / 1048576, `about 页引用的 webp 合计 ${(total / 1048576).toFixed(2)} MB`).toBeLessThan(2.5);
  });
});
