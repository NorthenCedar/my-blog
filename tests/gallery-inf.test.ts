import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNTIME_DEPS_ALLOWED } from './_deps';

/* 相册区视口底纹 ∞ 的契约（站主 2026-10-08）。
 *
 * 站主原话：
 *   「把这个无限符号扣下来（换成墨绿色）**替换掉整个相册页的百褶无限符号**」
 *   「1.三条路都换。2.v2。3.A。4.0.08。5.保留。6.墨迹宽度与日志页 ∞ 同档」
 *
 * 这一族真正会坏的地方**不是样式写错**（那看得见），是三件**看不见**的事：
 *   ① **单册与独立螺旋盘两页漏挂 `bodyClass`** —— 漏的那一页会同时显示百褶 ∞ 与本 ∞ 两层母题，
 *      而构建、测试、截图**全都不会报错**（TagsPlate 里那条注释记的就是这个坑）。
 *   ② **挂法角色写错**（不是 fixed / 不是 z-index:-1）—— 底纹会盖住正文或跳位。
 *   ③ **层宽/比例与素材脱钩** —— 改素材忘了改 CSS，墨迹会被拉扁或切掉。
 *
 * 下面守的是「不可退让的性质」，不是「上一版的实现形态」。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'gallery', 'index.html'));

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** 剥两类注释：Astro 模板里的 JSX 块注释、以及 <style> 里的 CSS 块注释。 */
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** 相册区的两条路由 —— 都在 `src/pages/gallery/` 下。 */
const ROUTES = ['src/pages/gallery/[album].astro', 'src/pages/gallery/spiral.astro'];
const COMPONENT = 'src/components/GalleryInf.astro';

const COMP_SRC = read(COMPONENT);
const COMP_CODE = strip(COMP_SRC);

/* 产物 CSS：分片名带内容哈希，不写死文件名；把**全部** CSS 拼起来查（同 gallery-plate.test.ts）。
 * ⚠★ 2026-10-08 踩过一次：**Astro 会把小组件样式内联进页面**（`build.inlineStylesheets` 的
 *   auto 行为）—— 本组件的样式就整段内联在 `dist/gallery/<册名>/index.html` 的 `<style>` 里，
 *   外链 CSS 分片里**一个字都没有**。
 *   ⇒ 只扫 `dist/_astro/*.css` 会永远查不到（判据假红），必须把**页面内联的 style 也并进来**。
 *   （教训与 AGENTS §4 同族：查不到先怀疑自己的字面量 —— 那次字面量是对的，是**范围**漏了。） */
const PRODUCT_PAGES = ['gallery/index.html', 'gallery/人像/index.html', 'gallery/spiral/index.html'];
const pageHtml = (p: string) => (existsSync(join(DIST, p)) ? readFileSync(join(DIST, p), 'utf8') : '');
const inlineStyles = PRODUCT_PAGES.map((p) =>
  [...pageHtml(p).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n'),
).join('\n');
const ALL_CSS = (
  (hasDist
    ? readdirSync(join(DIST, '_astro'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => readFileSync(join(DIST, '_astro', f), 'utf8'))
        .join('\n')
    : '') + inlineStyles
).replace(/\[data-astro-cid-[a-z0-9]+\]/g, '');

describe('相册 ∞ · 单册与独立螺旋盘两页必须同进同退', () => {
  it('★★ 两条路由都挂了 bodyClass 与 plate 槽（漏一页 = 两层母题叠着，且四处都不报错）', () => {
    for (const p of ROUTES) {
      const src = read(p);
      expect(src, `${p} 没挂 bodyClass="gallery-inf-plate"（它会退回去显示百褶 ∞，与本 ∞ 叠着）`).toContain(
        'bodyClass="gallery-inf-plate"',
      );
      expect(src, `${p} 没把底纹放进 plate 具名槽（落进 .shell 会被页面过渡的 filter 变成 fixed 的包含块 ⇒ 跳位）`).toMatch(
        /<Fragment slot="plate"><GalleryInf \/><\/Fragment>/,
      );
      expect(src, `${p} 没导入 GalleryInf 组件`).toMatch(/import GalleryInf from '\.\.\/\.\.\/components\/GalleryInf\.astro';/);
    }
  });

  it('★★ 单册与独立螺旋盘两页的 bodyClass 字面量必须**完全相同**（差一个字符就是两个不同的类）', () => {
    const got = ROUTES.map((p) => read(p).match(/bodyClass="([^"]+)"/)?.[1]);
    expect(new Set(got).size, `单册与独立螺旋盘两页的 bodyClass 不一致：${got.join(' / ')}`).toBe(1);
    expect(got[0]).toBe('gallery-inf-plate');
  });

  it('★ 底纹层只有一个来源（组件），单册与独立螺旋盘两页不许各写一份 `.gallery-inf`', () => {
    for (const p of ROUTES) {
      expect(read(p), `${p} 自己写了一份 .gallery-inf ⇒ 三份会各自腐化`).not.toContain('.gallery-inf');
    }
    expect(COMP_CODE, '组件里必须真有 .gallery-inf 这一层').toContain('.gallery-inf');
  });
});

describe('相册 ∞ · 挂法角色（与百褶 ∞ 同角色，只有母题不同）', () => {
  it('★★ 必须 fixed 挂视口 / z-index:-1 / 不拦指针', () => {
    const block = COMP_CODE.match(/\.gallery-inf\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block, '没读到 .gallery-inf 的样式块').toBeTruthy();
    expect(block, '不是 fixed ⇒ 底纹会跟着文档滚').toMatch(/position:\s*fixed/);
    expect(block, '没退到正文之下 ⇒ 会盖住内容').toMatch(/z-index:\s*-1/);
    expect(block, '没关指针事件 ⇒ 会挡住正文的点击').toMatch(/pointer-events:\s*none/);
    expect(block, '没居中').toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
  });

  it('★★ 取宽 = 与日志页 ∞ 同档（1440 视口墨迹同宽），三个上限各管一件事', () => {
    /* 日志页 ∞ 的实测墨迹在 1440×900 下是 746px（`_probe/_gal-inf-mass.mjs` 差分口径）；
       本图**紧裁到墨迹框** ⇒ 层宽 = 墨迹宽 ⇒ 51vw / 733px 两个上限就是"同档"的落点。 */
    const block = COMP_CODE.match(/\.gallery-inf\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block, '取宽丢了与日志页同档的公式').toMatch(/width:\s*var\(--plate-w,\s*min\(51vw,\s*733px,\s*250vh\)\)/);
    /* ★★ 2026-11-13：浓度不再是单个 `var(--plate-op, 0.08)` —— 亮暗两档之间要连续插值，
       写法变成两个端点的 calc。判据跟着意图走，守三件事（缺一条都会退回"松手才跳"）：
         ① `--plate-op` 旋钮还在（想再淡一档仍有地方拧）；
         ② 亮档端点仍是 0.08；
         ③ 暗档端点接 `--gallery-inf-dark-opacity`，且整条按 `--theme-w` 加权。 */
    expect(block, '缺 --plate-op 旋钮（想再淡一档时没地方拧）').toMatch(/var\(--plate-op,\s*0\.08\)/);
    expect(block, '暗档端点没接 --gallery-inf-dark-opacity').toMatch(/var\(--plate-op,\s*var\(--gallery-inf-dark-opacity\)\)/);
    expect(block, '浓度没有按 --theme-w 加权 ⇒ 拖动中不会连续变').toMatch(/opacity:\s*calc\(/);
    expect(block, '浓度没有按 --theme-w 加权 ⇒ 拖动中不会连续变').toMatch(/--theme-w/);
  });

  it('★★ 比例必须与素材的**紧裁框**一致（改素材忘改 CSS 会把墨迹拉扁）', () => {
    const block = COMP_CODE.match(/\.gallery-inf\s*\{([^}]*)\}/)?.[1] ?? '';
    const m = block.match(/aspect-ratio:\s*(\d+)\s*\/\s*(\d+)/);
    expect(m, '没写 aspect-ratio').toBeTruthy();
    const [, w, h] = m!;
    expect(hasDist, '先 npm run build').toBe(true);
    /* ★ 判据取**产物**：Astro 从真素材上量出 width/height 属性写进 <img>。
       素材被换掉而 CSS 没跟 ⇒ 这里立刻红（不用去解析 webp 头）。 */
    const html = pageHtml('gallery/spiral/index.html');
    const img = html.match(/<img[^>]*class="gallery-inf-img"[^>]*>/)?.[0] ?? '';
    expect(img, '产物里找不到 .gallery-inf-img').toBeTruthy();
    const iw = img.match(/width="(\d+)"/)?.[1];
    const ih = img.match(/height="(\d+)"/)?.[1];
    expect([iw, ih], `渲染尺寸 ${iw}×${ih} 与 CSS 的 ${w}/${h} 不成比例 ⇒ 图会被拉扁`).toEqual([w, h]);
  });

  it('★ 图片不给"假 2×"档（放大插值只会让字节白花）', () => {
    expect(COMP_CODE, 'widths 应只有 307 / 614 两档（614 就是真像素顶）').toMatch(/widths=\{\[307,\s*614\]\}/);
  });
});

describe('相册 ∞ · 关掉百褶 ∞ 的那条规则', () => {
  it('★★ 用 :global(...) 且权重压得住（`.page-inf` 是 Topbar 的元素，带的是别的作用域）', () => {
    expect(COMP_CODE, '缺关掉百褶 ∞ 的规则 ⇒ 两套母题叠着').toMatch(
      /:global\(body\.gallery-inf-plate \.page-inf\)/,
    );
  });

  it('★★ 关法是 display:none，**不是** opacity:0（后者仍占一层满屏合成层）', () => {
    const block = COMP_CODE.match(/:global\(body\.gallery-inf-plate \.page-inf\)\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block, '没读到关掉百褶 ∞ 的规则块').toBeTruthy();
    expect(block, '必须 display:none').toMatch(/display:\s*none/);
    expect(block, '不许用 opacity:0 关（仍占满屏合成层，很贵）').not.toMatch(/opacity:\s*0\s*;?\s*$/m);
  });
});

describe('相册 ∞ · 红线', () => {
  it('零外部资源（红线）', () => {
    expect(COMP_CODE, '出现了外部资源引用（src/href）').not.toMatch(/(?:src|href)=["']https?:/i);
    expect(COMP_CODE, '样式里出现了外部 url()').not.toMatch(/url\(\s*["']?https?:/i);
  });

  it('★ 颜色只用 token（组件里不许出现字面色值）', () => {
    /* 只查 `<style>` 那一段 —— 头部注释里有 `#2d7d46` 这类**说明性**引用，
       它们不是声明（负向断言必须先剥注释，但注释里引用的 token 值也要放过）。 */
    const cssAt = COMP_CODE.indexOf('<style>');
    expect(cssAt, '组件里没有 <style>？').toBeGreaterThan(-1);
    const css = COMP_CODE.slice(cssAt);
    expect(css, '组件样式里出现了字面色值（应当只用 token）').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css, '组件样式里出现了 rgb()/rgba()（alpha 由 8 位 hex 承载）').not.toMatch(/\brgba?\(/);
  });

  it('★ 运行时依赖只许住在白名单里', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(RUNTIME_DEPS_ALLOWED);
  });
});

describe('相册 ∞ · 产物', () => {
  it('★★ 单册与独立螺旋盘两页产物里都有这一层，且 body 类名对', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    for (const p of ['gallery/人像/index.html', 'gallery/spiral/index.html']) {
      const html = pageHtml(p);
      expect(html, `${p} 的 body 缺 gallery-inf-plate`).toMatch(/<body\b[^>]*class="[^"]*\bgallery-inf-plate\b/);
      expect(html, `${p} 产物里没有 .gallery-inf 这一层`).toContain('class="gallery-inf"');
      expect((html.match(/class="gallery-inf"/g) ?? []).length, `${p} 的底纹层应恰好一个`).toBe(1);
    }
  });

  it('★ 产物 CSS 里关掉百褶 ∞ 的规则在（源码在、编译后被摇掉也是一种坏法）', () => {
    expect(ALL_CSS, '产物 CSS 里没有关掉百褶 ∞ 的规则').toMatch(/body\.gallery-inf-plate \.page-inf\{display:none\}/);
  });
});
