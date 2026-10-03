/* 参考图底纹层的契约（关于页第2 步，站主 2026-10-03）
 *
 * 要守的不只是「有四张图」，而是四条**站主明确要求过、且容易被改坏的**约定：
 *   ① 直接用**参考图里的素材**，不自己画（手绘 SVG 雕像实测砸过三次）；
 *   ② **直接放背景里**，不做成独立卡片；
 *   ③ 背景用**白色**；
 *   ④ ★ **必须裁文件，不能只用 CSS 取景** —— 这是体积的生死线。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'index.html'));

const SRC = readFileSync(join(ROOT, 'src/pages/about.astro'), 'utf8');
/* ★ 剥注释**只用于负向断言**（防止注释里的字面量让判据恒红）。
   ⚠ 坑：源文件里那段说明注释中出现了块注释定界符的**字面文本**（讲 CSS 裁切那两句），
     朴素的块注释正则会从那里一路吃到下一个定界符，
     **把中间真正的代码吞掉** ⇒ 正向断言全部失效（首次跑就踩了，表现为 glob 那条恒红，
     改完还报 "Invalid Unicode escape sequence" —— 注释里的反斜杠被当转义了）。
   ⇒ 正向断言一律用**未剥注释的 SRC**；负向断言才用 CODE。 */
const stripBlock = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const CODE = stripBlock(SRC).replace(/<!--[\s\S]*?-->/g, ' ');

const PLATE_DIR = join(ROOT, 'src/assets/about/plates');
const plates = existsSync(PLATE_DIR) ? readdirSync(PLATE_DIR).filter((f) => f.endsWith('.webp')) : [];

describe('关于页 · 参考图底纹（第2 步）', () => {
  it('四块底纹图都进仓了，且每张都小（不是原图那种 3–4 MB）', () => {
    expect(plates.length, 'src/assets/about/plates/ 下的 webp 数量不对').toBe(4);
    for (const f of plates) {
      const kb = statSync(join(PLATE_DIR, f)).size / 1024;
      // ★ 生死线：原图 3–4 MB。三张 CSS 取景方案会让关于页变成 10 MB+。
      expect(kb, `${f} 有 ${kb.toFixed(0)} KB —— 太大，说明没裁文件只是改了扩展名`).toBeLessThan(260);
    }
    // 四块合计也不该超过 ~1 MB（进仓的是源图，构建期还会再出多档 srcset）
    const total = plates.reduce((s, f) => s + statSync(join(PLATE_DIR, f)).size, 0) / 1024;
    expect(total, `四块合计 ${total.toFixed(0)} KB`).toBeLessThan(1100);
  });

  it('★ 素材走构建期管线（astro:assets 的 <Image>），不是 <img src> 直连原图', () => {
    // 用 import.meta.glob 拿 ImageMetadata ⇒ 走 astro:assets ⇒ 构建期出 WebP + srcset
    expect(SRC, 'plates 没走 import.meta.glob 拿 ImageMetadata').toMatch(
      /import\.meta\.glob<[^>]*ImageMetadata[^>]*>\('\/src\/assets\/about\/plates\/\*\.webp'/);
    /* 四块都用 <Image> 渲染（带 widths/sizes ⇒ 有 srcset）。
       ★ 判据用**两个前瞻**而不是一个长正则：`<Image ... />` 的属性里含 `alt=""`
       这种带 `>` 的值，普通 `<Image[^>]*>` 会在那里截断（首次跑就踩了）。 */
    const imgs = [...SRC.matchAll(/<Image\b(?=[^>]*class="ref-img")[^>]*\/>/g)].map((m) => m[0]);
    if (imgs.length !== 4) {
      // 退回宽松匹配（属性跨行时上面那条可能漏），并保持计数正确
      const loose = SRC.split('<Image').slice(1)
        .filter((c) => c.slice(0, 200).includes('class="ref-img"'))
        .map((c) => '<Image' + c.slice(0, c.indexOf('>') + 1));
      expect(loose.length, '用 <Image> 渲染的底纹数量不对').toBe(4);
      for (const t of loose) {
        expect(t, '少了 widths ⇒ 不会出多档 srcset').toMatch(/widths=\{/);
        expect(t, '少了 sizes ⇒ 浏览器会下最大档').toMatch(/sizes="/);
      }
      return;
    }
    expect(imgs.length, '用 <Image> 渲染的底纹数量不对').toBe(4);
    for (const t of imgs) {
      expect(t, '少了 widths ⇒ 不会出多档 srcset').toMatch(/widths=\{/);
      expect(t, '少了 sizes ⇒ 浏览器会下最大档').toMatch(/sizes="/);
    }
  });

  it('★ 页面里不许出现原图路径（那意味着绕过了裁切）', () => {
    // 站主的参考图在 D:/传图/ 下，不该有任何代码引用它
    expect(CODE, '代码里引用了站主的参考图原始路径').not.toMatch(/D:\/|传图|\/传图\//);
    expect(CODE, '用了 /_ref/ 这类临时目录').not.toMatch(/\/_ref/);
  });

  it('底纹在运行时不做灰度/染色（构建期已染好，filter 是历史遗留）', () => {
    /* ★ 这一条记的是一次真实的浪费：第一版是「CSS 取景 + 运行时 filter 染色」，
       现在图在构建期已转成带 alpha 的墨绿小图 ⇒ 运行时的
       grayscale/sepia/hue-rotate **全是白做的算力**。
       判据：`.ref` 与其后代里不许再出现 filter。 */
    const rules = [...CODE.matchAll(/(\.ref[\w-]*[^{}]*)\{([^}]*)\}/g)].map((m) => m[2]);
    expect(rules.length, '没找到底纹的样式块 —— 改名了要同步这条断言').toBeGreaterThan(0);
    for (const r of rules) {
      expect(r, '底纹里还有 filter（构建期已染色，这行是白做的算力）').not.toMatch(/filter:/);
    }
  });

  it('底纹是 fixed 铺满视口的装饰层，且不吃点击', () => {
    expect(CODE).toMatch(/\.ref-plate\s*\{[^}]*position:\s*fixed/);
    expect(CODE).toMatch(/\.ref-plate\s*\{[^}]*inset:\s*0/);
    expect(CODE).toMatch(/\.ref-plate\s*\{[^}]*pointer-events:\s*none/);
    // ★ overflow:hidden 是「四块滑出视口」能成立的前提 —— 也是不产生横向溢出的保证
    expect(CODE, '缺 overflow:hidden ⇒ 滑出视口的底纹会撑出横向滚动').toMatch(/\.ref-plate\s*\{[^}]*overflow:\s*hidden/);
    // 它是装饰层 ⇒ 必须 aria-hidden
    expect(CODE).toMatch(/class="ref-plate" aria-hidden="true"/);
  });

  it('★ 四块都摆在版心之外（负偏移贴边），不压文字', () => {
    /* 目检踩过两轮：月相按「右上角」放 ⇒ 盖住右栏社交清单；
       飞鸟放左侧中段 ⇒ 压住头像与正文第一行。
       判据：四块里至少三块用**负的 right/left**（滑出视口），
       且没有一块用 `left:` 正值 + 宽到能盖住版心。 */
    const neg = (sel) => {
      const m = CODE.match(new RegExp(`\\.${sel}\\s*\\{([^}]*)\\}`));
      return m ? m[1] : '';
    };
    for (const sel of ['ref-moon', 'ref-statue', 'ref-birds', 'ref-dial']) {
      const b = neg(sel);
      expect(b, `找不到 .${sel} 的规则`).toBeTruthy();
      const offs = [...b.matchAll(/(left|right):\s*(-?[\d.]+)%/g)].map((m) => Number(m[2]));
      expect(offs.length, `.${sel} 没有水平贴边偏移`).toBeGreaterThan(0);
      expect(Math.min(...offs), `.${sel} 没有任何负偏移（会压在版心上）`).toBeLessThan(0);
    }
  });

  it('窄屏只留月相与雕像（站主点名的那两个），并再压淡一档', () => {
    const m = CODE.match(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.ref-birds[\s\S]*?\}/);
    expect(m, '缺≤767px 的底纹降级规则').toBeTruthy();
    expect(m![0], '窄屏应隐藏飞鸟与圆盘（390px 铺四块会糊成一片灰）').toMatch(/\.ref-dial[\s\S]*?display:\s*none/);
  });
});

describe.skipIf(!hasDist)('产物里的底纹', () => {
  const ABOUT = readFileSync(join(DIST, 'about', 'index.html'), 'utf8');

  it('四张图都在，且都带 srcset（多档）', () => {
    const imgs = [...ABOUT.matchAll(/<img[^>]*class="ref-img"[^>]*>/g)].map((m) => m[0]);
    expect(imgs.length, '产物里底纹图数量不对').toBe(4);
    for (const t of imgs) {
      expect(t, '产物里没有 srcset ⇒ 不会按视口选档').toMatch(/srcset="/);
    }
  });

  it('★ 底纹图总体积可控（不是 10 MB）', () => {
    // 把 about/index.html 里引用的所有 _astro 资源加起来
    const refs = [...ABOUT.matchAll(/\/_astro\/([A-Za-z0-9_.-]+\.webp)/g)].map((m) => m[1]);
    const uniq = [...new Set(refs)];
    let total = 0;
    for (const f of uniq) {
      const p = join(DIST, '_astro', f);
      if (existsSync(p)) total += statSync(p).size;
    }
    const mb = total / 1048576;
    expect(mb, `about 页引用的 webp 合计 ${mb.toFixed(2)} MB`).toBeLessThan(2.5);
  });
});
