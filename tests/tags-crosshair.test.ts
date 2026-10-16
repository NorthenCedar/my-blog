import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TAGS } from '../src/tag-registry';
import { readPostFrontmatter, visiblePosts } from './content-invariants.test';

/* 标签区共用装置契约：2026-10-16 按站主新选择换成机械环。
 * 保留准星、矩阵、槽位隔离与内容验证；旧墨绿图的颜色/467px 尺寸不再适用。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'tags', 'index.html'));

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** 剥两类注释：Astro 模板里的 JSX 块注释、以及 <style> 里的 CSS 块注释。
 *  顺序有讲究：先剥 JSX —— 它内部若含 CSS 块注释，先剥 CSS 的会把 JSX 那个切碎。 */
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const PLATE_DIR = join(ROOT, 'src/assets/tags/plates');
const PLATE = join(PLATE_DIR, 'mechanical-ring.webp');

const IDX = read('src/pages/tags/index.astro');
const ONE = read('src/pages/tags/[tag].astro');
const PLATE_ASTRO = read('src/components/TagsPlate.astro');
const XH_ASTRO = read('src/components/Crosshair.astro');
const XH_TS = read('src/scripts/crosshair.ts');
const HOVER = read('src/styles/hover.css');

const IDX_CSS = strip(IDX);
const ONE_CSS = strip(ONE);
const PLATE_CSS = strip(PLATE_ASTRO);
const XH_CSS = strip(XH_ASTRO);
/* ⚠ 负向断言一律跑"剥过注释"的版本 —— 这几份文件的注释里**故意**写着
   「为什么**不**用 rAF / 为什么**不**复用 PostIndex / 为什么不用 #4caf50」，
   拿原文去 `not.toMatch` 会把"解释自己没做的事"判成"做了那件事"。 */
const PLATE_NC = strip(PLATE_ASTRO);
const XH_TS_CODE = strip(XH_TS);

const IDX_HTML = hasDist ? readFileSync(join(DIST, 'tags', 'index.html'), 'utf8') : '';
const ONE_HTML = hasDist ? readFileSync(join(DIST, 'tags', 'AI', 'index.html'), 'utf8') : '';
const ARCHIVE_HTML = hasDist ? readFileSync(join(DIST, 'archive', 'index.html'), 'utf8') : '';

/* 本页（/tags/AI/）该有几格 —— 从内容源派生，**不写死**。
 * ★ 2026-10-11：原来是 `toBe(2)`，删掉 ai-built-this-blog 后当场红。
 *   格子数本来就是「该标签下生产可见文章数」的**投影**，写死等于让判据跟内容源
 *   各说各话 —— 与总览页把 `toBe(8)` 改成从 TAGS 派生是同一个路数（见上方注释）。
 * 口径必须与页面一致：页面走 getPostsByTag → getVisiblePosts，
 * 生产环境**过滤草稿**，所以这里也用 visiblePosts()（否则加了草稿文章会误红）。 */
const AI_POST_COUNT = visiblePosts(readPostFrontmatter()).filter((p) =>
  p.tags.includes('AI'),
).length;

describe('标签区 · ∞ 底纹素材契约', () => {
  it('机械环透明图进入构建管线，原始细节与体积均有边界', async () => {
    expect(existsSync(PLATE)).toBe(true);
    expect(readdirSync(PLATE_DIR).filter((f) => f.endsWith('.webp'))).toHaveLength(1);
    expect(statSync(PLATE).size).toBeLessThan(200 * 1024);
    const { default: sharp } = await import('sharp');
    const meta = await sharp(PLATE).metadata();
    expect(meta.width).toBe(1400);
    expect(meta.height).toBe(900);
    expect(meta.hasAlpha).toBe(true);
    const { data, info } = await sharp(PLATE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
    for (const [x, y] of [[0, 0], [1399, 0], [0, 899], [1399, 899], [450, 450], [950, 450]]) {
      expect(alpha(x, y), '背景和双环内部必须透明，不能带黑色矩形').toBeLessThanOrEqual(8);
    }
    expect(data.some((value, i) => i % 4 === 3 && value > 200), '主体不能被清空').toBe(true);
    expect(read('public/licenses/rhine-mechanical-ring.txt')).toContain('MIT License');
  });

  it('图与光槽共享画布，窄屏完整显示，宽屏不超过原生分辨率', () => {
    expect(PLATE_CSS).toMatch(/aspect-ratio:\s*1400 \/ 900/);
    const rule = PLATE_CSS.match(/\.tags-inf\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('1400px');
    expect(rule).toContain('150vh');
    for (const match of PLATE_CSS.matchAll(/([\d.]+)vw/g)) {
      expect(Number(match[1])).toBeLessThan(100);
    }
    expect(PLATE_ASTRO).toContain("ring.resolution.join(' ')");
  });

  it('减少动态效果时停止光带，颜色与浓度可统一调节', () => {
    expect(PLATE_CSS).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(PLATE_CSS).toMatch(/animation:\s*none/);
    expect(PLATE_CSS).toContain('var(--ring-plate-opacity)');
    const tokens = read('src/styles/tokens.css');
    const opacity = Number(tokens.match(/--ring-plate-opacity:\s*([\d.]+)/)?.[1]);
    expect(opacity).toBeGreaterThanOrEqual(0.15);
    expect(opacity).toBeLessThanOrEqual(0.4);
    expect(PLATE_CSS).not.toMatch(/#[\da-fA-F]{3,8}\b|rgba?\(/);
  });

  it('★ 挂法：plate 具名槽（`.shell` 之外）+ 关掉本页百褶 ∞', () => {
    expect(PLATE_CSS).toMatch(/position:\s*fixed/);
    expect(PLATE_CSS).toMatch(/left:\s*50%/);
    expect(PLATE_CSS).toMatch(/top:\s*50%/);
    expect(PLATE_CSS).toMatch(/translate\(-50%,\s*-50%\)/);
    expect(PLATE_CSS).toMatch(/z-index:\s*-1/);
    expect(PLATE_CSS).toMatch(/pointer-events:\s*none/);
    expect(PLATE_ASTRO).toMatch(/aria-hidden="true"/);
    expect(PLATE_ASTRO).toMatch(/<Image[\s\S]*?widths=\{\[700, 1400\]\}/);
    expect(PLATE_ASTRO).toMatch(/<Image[\s\S]*?sizes="[^"]*96vw[^"]*"/);

    /* 百褶 ∞（`.page-inf`，Topbar 渲染、全站内页共用）必须在本区两页关掉，
       不关就是两套母题叠着（关于页「切片档案」的教训）。
       ⚠ 用 `:global(...)` + `body.tags-plate` 前缀：那边写的是
         `body.chrome-page .page-inf`（0,2,1）⇒ 权重必须对齐才压得住。 */
    expect(PLATE_CSS, '找不到关百褶 ∞ 的那条规则（注意 :global 的右括号）').toMatch(
      /body\.tags-plate \.page-inf\)\s*\{[^}]*display:\s*none/,
    );
    expect(PLATE_CSS, '关法必须是 display:none（opacity:0 仍占一层满屏合成层）').not.toMatch(
      /body\.tags-plate \.page-inf\)\s*\{[^}]*opacity:\s*0/,
    );
    /* 两页都必须给 body 挂上那个类 —— 组件碰不到 body，漏写就是两层 ∞ 叠着，
       而且构建、测试、截图全都不会报错。 */
    for (const [name, src] of [['tags/index.astro', IDX], ['tags/[tag].astro', ONE]] as const) {
      expect(src, `${name} 漏了 bodyClass="tags-plate" ⇒ 会与百褶 ∞ 叠在一起`).toMatch(/bodyClass="tags-plate"/);
    }
  });
});

describe('标签区 · 两页共用同一个装置与矩阵', () => {
  it('★ 两页都挂同一个 TagsPlate（站主原话：「共用一套实现」）', () => {
    for (const [name, src] of [['tags/index.astro', IDX], ['tags/[tag].astro', ONE]] as const) {
      expect(src, `${name} 没挂 plate 槽`).toMatch(/<Fragment slot="plate"><TagsPlate \/><\/Fragment>/);
      expect(src, `没 import TagsPlate`).toMatch(/import TagsPlate from '\.\.\/\.\.\/components\/TagsPlate\.astro'/);
    }
    /* 单标签页有**两条渲染路径**（正常 / 空态），两条都要挂上 ——
       漏一条那条路径就没底纹，而且构建照常成功（站上吃过这个亏）。 */
    expect((ONE.match(/<TagsPlate \/>/g) ?? []).length, '单标签页两条路径都要挂 TagsPlate').toBe(2);
    /* 共用点必须在组件里**只有一份**（不是两页各抄一份 markup/样式） */
    expect(PLATE_NC, 'TagsPlate 里必须挂 Crosshair 装置').toContain('<Crosshair />');
    expect((PLATE_NC.match(/<Crosshair \/>/g) ?? []).length, 'Crosshair 只该挂一次').toBe(1);
  });

  it('★ 两页都是矩阵：格数、列数档、每格是完整方框', () => {
    /* 标签总览：4/3/2 三档；单标签页：3/2/1（那边一格里是"标题+摘要"，要更宽） */
    expect(IDX_CSS).toMatch(/repeat\(var\(--mx-cols, 4\), minmax\(0, 1fr\)\)/);
    expect(IDX_CSS).toMatch(/--mx-cols:\s*3/);
    expect(IDX_CSS).toMatch(/--mx-cols:\s*2/);
    expect(ONE_CSS).toMatch(/repeat\(var\(--mx-cols, 3\), minmax\(0, 1fr\)\)/);
    expect(ONE_CSS).toMatch(/--mx-cols:\s*2/);
    expect(ONE_CSS).toMatch(/--mx-cols:\s*1/);

    /* ★ 每一格是**完整方框** + `margin: 0 -1px -1px 0` 把自己的边框压到邻格下面
       ⇒ 内部线 1px（不是 2px）。这条选法的理由写在两页注释里（未填满的行不能出现
       "横贯全宽的线下面只画了一半"）。 */
    for (const [name, css] of [['tags/index.astro', IDX_CSS], ['tags/[tag].astro', ONE_CSS]] as const) {
      const cell = css.match(/\.(tag|post)-cell\s*\{([^}]*)\}/)?.[2] ?? '';
      expect(cell, `${name} 没读到格子的样式块`).toBeTruthy();
      expect(cell, `${name} 格子必须是完整方框（四边同宽）`).toMatch(/border:\s*1px solid var\(--hair\)/);
      expect(cell, `${name} 格子缺负外边距 ⇒ 相邻边框会叠成 2px`).toMatch(/margin:\s*0 -1px -1px 0/);
      expect(cell, `${name} 格子必须透空，让底纹透出来`).toMatch(/background:\s*transparent/);
    }

    /* 悬停的过渡参数在基线层（`hover.css`），形态在本页 —— 但**不许进位移组**：
       格子有边框，整格在格内平移会和自己的边框脱开。
       ★ 按**段落标题**切片，不按"某某选择器 + { }"去匹配 ——
         选择器清单在花括号**外面**，抓声明块永远抓不到它（第一版就栽在这）。 */
    const sec3 = HOVER.slice(HOVER.indexOf('3. 文字型链接'), HOVER.indexOf('4. 卡片/条目'));
    const sec4 = HOVER.slice(HOVER.indexOf('4. 卡片/条目'), HOVER.indexOf('5. 表单控件'));
    expect(sec3, 'hover 基线第 3 段（文字型链接）里没有 .tag-matrix a').toContain('.tag-matrix a');
    expect(sec3, 'hover 基线第 3 段里没有 .post-matrix a').toContain('.post-matrix a');
    expect(sec4, '矩阵格不该进"横向轻推"那一组（会和自己的边框脱开）').not.toContain('.tag-matrix a');
    expect(sec4, '矩阵格不该进"横向轻推"那一组').not.toContain('.post-matrix a');
    /* 降级档也要带上（各页悬停的 reduced-motion 名单是逐族枚举的，漏了就"啪"一下跳） */
    const rm = HOVER.slice(HOVER.indexOf('prefers-reduced-motion: reduce'));
    expect(rm, 'reduced-motion 名单漏了 .tag-matrix a').toContain('.tag-matrix a');
    expect(rm, 'reduced-motion 名单漏了 .post-matrix a').toContain('.post-matrix a');
  });

  it('★ 单标签页不再复用 PostIndex（归档页按 `.index li` 取行，改它=改归档）', () => {
    expect(ONE_CSS, '单标签页不该再 import PostIndex / 提它').not.toMatch(/PostIndex/);
    expect(ONE_CSS, '单标签页不该再出现 .index 列表').not.toMatch(/class="index"/);
    /* 反向正对照：归档页必须**照旧**用 `.index` + data-*（证明我们只是没碰它） */
    expect(hasDist, '先 npm run build').toBe(true);
    expect(ARCHIVE_HTML, '归档页的 .index 列表被动了 —— 筛选脚本按 `.index li` 取行').toContain('class="index"');
    expect(ARCHIVE_HTML, '归档行的 data-* 被动了').toMatch(/<li\s+data-date="[^"]+"\s+data-year="\d{4}"/);
  });
});

describe('标签区 · 准星 CROSSHAIR 装置契约', () => {
  it('★ 挂法：fixed 满屏、不拦指针、层级夹在"内容之上、过渡蒙版之下"', () => {
    const rule = XH_CSS.match(/\.crosshair\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule, '没读到 .crosshair 的样式块').toBeTruthy();
    for (const decl of ['position: fixed', 'inset: 0', 'pointer-events: none']) {
      expect(rule, `挂法缺 ${decl}`).toContain(decl);
    }
    expect(rule, '层级必须显式给（默认 auto 会与正文的层叠上下文打架）').toMatch(/z-index:\s*44/);
    /* 44 的两侧都是被事故守着的：低于页面过渡蒙版 45（过渡时不该有绿线浮在墨上）、
       低于灯箱 50 与跟手光标环 64/65/66，高于正文 main 的 1 与归档尺的 2。 */
    const transition = read('src/styles/transition.css');
    const ptZ = Number(transition.match(/\.pt\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
    expect(ptZ, '没读到页面过渡蒙版的 z-index —— 阶梯变了，契约要回头对').toBe(45);
    expect(44, '准星必须压在过渡蒙版之下').toBeLessThan(ptZ);
    expect(XH_ASTRO).toMatch(/aria-hidden="true"/);
    /* 初始位置刻意放到**视口外**：脚本慢一拍时是"在屏幕外"，不是"在左上角闪一下" */
    expect(rule, '变量初值必须在视口外（≤ -50px）').toMatch(/--ch-x:\s*-\d{2,}px/);
    expect(rule, '变量初值必须在视口外（≤ -50px）').toMatch(/--ch-y:\s*-\d{2,}px/);
  });

  it('★ 三条元素全靠 var() 派生 ⇒ 指针与键盘天然共用同一条路径', () => {
    expect(XH_ASTRO).toMatch(/class="ch-h"/);
    expect(XH_ASTRO).toMatch(/class="ch-v"/);
    expect(XH_ASTRO).toMatch(/class="ch-dot"/);
    expect(XH_CSS, '水平线必须只沿 y 平移').toMatch(/\.ch-h\s*\{[^}]*translateY\(var\(--ch-y\)\)/);
    expect(XH_CSS, '垂直线必须只沿 x 平移').toMatch(/\.ch-v\s*\{[^}]*translateX\(var\(--ch-x\)\)/);
    /* ⚠ 焦点环必须用 `translate()` **函数**写在同一个 transform 串里，
       不可以用独立的 `translate` 属性 —— 独立属性与 transform 合成时位移会被一起变换
       （CursorRing 的涟漪踩过：圆心一路飞到右下角）。
       ★ 取**所有**含 `.ch-dot` 的规则块：它与 `.ch-h/.ch-v` 共用一个"通用"块，
         直接抓第一个 `{...}` 会抓到那个通用块（它没有 transform）。 */
    const dotRules = [...XH_CSS.matchAll(/\.ch-dot\s*\{([^}]*)\}/g)]
      .map((m) => m[1])
      /* ⚠ 判据必须是 `transform:`（属性声明），不是 `transform` 这个词 —— */
      .filter((b) => /(^|[;\s])transform:/.test(b));
    expect(dotRules.length, '焦点环要有一条带 transform 的规则').toBeGreaterThan(0);
    for (const b of dotRules) {
      expect(b, '焦点环必须用 translate() 函数做位移').toMatch(/transform:\s*translate\(var\(--ch-x\),\s*var\(--ch-y\)\)/);
      expect(b, '焦点环不许用独立的 translate 属性（会被 transform 一起变换）').not.toMatch(/(^|[;\s])translate:\s/);
    }
  });

  it('★★ 无 transform 过渡 —— 示波器光标必须"就在这里"', () => {
    const rule = XH_CSS.match(/\.crosshair\s*\{([^}]*)\}/)?.[1] ?? '';
    const tr = rule.match(/transition:\s*([^;]*)/)?.[1] ?? '';
    expect(tr, '只有"出现"有过渡：opacity 必须在').toContain('opacity');
    expect(tr, '给 transform 加过渡会制造"线追着指针跑"的拖尾 ⇒ 必须没有').not.toContain('transform');
    expect(tr, '同上，不许过渡 translate').not.toContain('translate');
    expect(XH_TS_CODE, '脚本里也不许出现过渡/补间（颜色也不过渡，位置更不能）').not.toMatch(/transition/);
    expect(XH_TS_CODE, '脚本里不许出现 requestAnimationFrame').not.toMatch(/requestAnimationFrame/);
    /* 出现/消失靠类，不靠内联样式 —— 这样"无 JS ⇒ opacity 恒 0 ⇒ 不存在"成立 */
    expect(XH_CSS).toMatch(/\.crosshair\.is-on\s*\{[^}]*opacity:\s*1/);
  });

  it('★★ 零 rAF 的动效装置（第九台在机制上的分野）', () => {
    /* 位置是"事件 → 变量"的直接映射：没有帧循环、没有平滑、没有时间项。
       引入 rAF 就等于把它变成"跟着指针跑的平滑体"，机制就与其余各台重合了。 */
    expect(XH_TS_CODE, '不许出现 requestAnimationFrame').not.toMatch(/requestAnimationFrame/);
    expect(XH_TS_CODE, '不许出现 createActivityGate（本台没有帧循环可门控）').not.toMatch(/createActivityGate/);
    expect(XH_TS_CODE, '不许出现 startLoop').not.toMatch(/startLoop/);
    /* 直接写变量：两条线与焦点环都从这对变量派生 */
    expect(XH_TS_CODE).toMatch(/setProperty\('--ch-x'/);
    expect(XH_TS_CODE).toMatch(/setProperty\('--ch-y'/);
  });

  it('★ 两种输入源都接上，且键盘只在 :focus-visible 时响应', () => {
    expect(XH_TS, '没接指针').toMatch(/addEventListener\(\s*'pointermove'/);
    expect(XH_TS, '没接键盘焦点').toMatch(/addEventListener\('focusin'/);
    /* ⚠ 鼠标点击链接**也会**触发 focus；那时准星已在指针位置，
       若照样跳到元素中心会看到"啪"地弹一下 ⇒ 必须用 :focus-visible 把两种焦点分开。 */
    expect(XH_TS, "键盘路径必须用 :focus-visible 门控").toMatch(/matches\(':focus-visible'\)/);
    expect(XH_TS, '键盘路径必须取元素中心').toMatch(/r\.left \+ r\.width \/ 2/);
    expect(XH_TS, '不可见元素（0×0）不接').toMatch(/!r\.width && !r\.height/);
    /* 首次移动前不显形（否则会从变量初值那把左上角滑进来） */
    expect(XH_TS, '首帧不该显形').toMatch(/if \(!seen\)/);
  });

  it('★ 降级：触摸 / reduced-motion ⇒ 整个装置不做（CSS 与脚本两层都要做）', () => {
    expect(XH_CSS, 'CSS 层没做降级').toMatch(
      /@media \(hover: none\), \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.crosshair\s*\{[\s\S]*?display:\s*none/,
    );
    expect(XH_TS, '脚本层没判触摸').toMatch(/matchMedia\('\(hover: hover\)'\)/);
    expect(XH_TS, '脚本层没判 reduced-motion').toMatch(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
    /* 指针离开窗口 / 切标签 ⇒ 收起，下次 pointermove 再出现 */
    expect(XH_TS, "没接 blur").toMatch(/addEventListener\('blur',\s*hide\)/);
    expect(XH_TS, "没接 visibilitychange").toMatch(/visibilitychange/);
    expect(XH_TS, '切标签必须收起（不是"留着"）').toMatch(/classList\.remove\('is-on'\)/);
  });

  it('★ 颜色只从 token 读，组件与脚本里不许出现字面色值', () => {
    /* 剥掉注释再查 —— 注释里会引用 `--accent-bright (#4caf50)` 这类"为什么不用"的理由。 */
    expect(XH_CSS, 'Crosshair.astro 的样式里出现了字面色值（只许用 token）').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(XH_CSS, 'Crosshair.astro 的样式里出现了 rgba()/rgb()（alpha 由 8 位 hex 承载）').not.toMatch(
      /\brgba?\(/,
    );
    expect(strip(XH_TS), 'crosshair.ts 里出现了字面色值（颜色只许住在 tokens.css）').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(XH_CSS, '十字线必须用 token').toContain('var(--deco-crosshair-line)');
    expect(XH_CSS, '焦点环必须用 token').toContain('var(--deco-crosshair-dot)');
    const tokens = read('src/styles/tokens.css');
    for (const name of ['--deco-crosshair-line', '--deco-crosshair-dot']) {
      expect(tokens, `tokens.css 里没有 ${name}`).toContain(name);
    }
    /* 「亮淡绿」靠 alpha 压淡实现，不靠换色相 —— 换色相会破掉"纸白区只有一族绿"
       （--accent-bright #4caf50 对纸白只有 2.66:1，只许用在深色底）。 */
    expect(tokens, '十字线不许用 --accent-bright 的色值').not.toMatch(/--deco-crosshair-line:\s*#4caf50/);
    expect(tokens, '十字线必须是 --accent(#2d7d46) 压 alpha').toMatch(/--deco-crosshair-line:\s*#2d7d46[0-9a-f]{2}/);
    expect(tokens, '焦点环必须是 --accent(#2d7d46) 压 alpha').toMatch(/--deco-crosshair-dot:\s*#2d7d46[0-9a-f]{2}/);
  });
});

describe('标签区 · 构建产物', () => {
  it('总览页：矩阵格数与标签注册表一致 + 底纹 + 准星 + 关掉百褶 ∞', () => {
  expect(hasDist, '先 npm run build').toBe(true);
    /* ★ 2026-10-10：原来写死 `toBe(8)`，加第9 个标签 `项目` 时当场红了。
       格子数本来就是 TAGS 的**投影**，写死等于让它跟注册表各说各话 ——
       改成从注册表派生：注册表加了标签而页面没跟上（或反过来）才会红，
       而「忘了同步注册表」这类事故另有 post-meta.test.ts 守着。 */
    expect((IDX_HTML.match(/<li class="tag-cell"/g) ?? []).length,
      '标签总览的格数必须等于注册表里的标签数').toBe(TAGS.length);
    expect(IDX_HTML, '缺矩阵容器').toMatch(/class="tag-matrix"/);
    expect(IDX_HTML, '缺底纹层').toMatch(/class="tags-inf"/);
    expect(IDX_HTML, '底纹必须走构建期优化管线（srcset）').toMatch(/<img[^>]*srcset="[^"]*"/);
    expect(IDX_HTML, '缺准星').toMatch(/class="crosshair"[^>]*data-crosshair|data-crosshair[^>]*class="crosshair"/);
    expect(IDX_HTML, '准星三条元素要一起产出').toMatch(/class="ch-dot"/);
    expect(IDX_HTML, 'body 上没有 tags-plate ⇒ 百褶 ∞ 没被关掉').toMatch(/<body[^>]*class="[^"]*tags-plate/);
    /* 内容必须服务端渲染完整（装置是装饰，不许承担内容） */
    for (const t of ['AI', '建站', '摄影', '钢琴']) {
      expect(IDX_HTML, `标签「${t}」没渲染出来`).toContain(`>${t}<`);
    }
    /* 标题必须留在**正文流**里：'page' 外壳不渲染 band 槽 ⇒ 搬错位置会静默消失 */
    expect(IDX_HTML, '页头标题没在正文流里').toMatch(/<header class="pagehead"[^>]*><h1[^>]*>标签<\/h1>/);
    expect(ONE_HTML, '单标签页的页头标题没在正文流里').toMatch(/<header class="pagehead"[^>]*><h1[^>]*>AI<\/h1>/);
  });

  it('单标签页：文章矩阵 + 同一套底纹与准星；归档页不受影响', () => {
    /* 判据守**关系**（格子数 = 内容源投影），不守「上一版有几篇」这个数字。
       内容源本身为空时下面会红 —— 那是「AI 标签下没文章」的真事故，不是假阳性。 */
    expect(AI_POST_COUNT, '内容源里 AI 标签下没有可见文章，本页本该只有空态').toBeGreaterThan(0);
    expect(
      (ONE_HTML.match(/<li class="post-cell"/g) ?? []).length,
      `AI 标签下的格数必须等于内容源里 AI 标签的可见文章数（${AI_POST_COUNT}）`,
    ).toBe(AI_POST_COUNT);
    expect(ONE_HTML, '缺文章矩阵容器').toMatch(/class="post-matrix"/);
    expect(ONE_HTML, '缺底纹层').toMatch(/class="tags-inf"/);
    expect(ONE_HTML, '缺准星').toMatch(/data-crosshair/);
    expect(ONE_HTML, 'body 上没有 tags-plate').toMatch(/<body[^>]*class="[^"]*tags-plate/);
    /* 两页共用同一份实现 ⇒ 准星的**标记结构**必须逐字相同 */
    const grab = (h: string) => h.match(/<div class="crosshair"[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(grab(ONE_HTML), '两页的准星标记不一致 ⇒ 不是同一套实现').toBe(grab(IDX_HTML));
    /* 文章信息一条没少（少了摘要/标签就是丢内容） */
    expect(ONE_HTML, '文章摘要丢了').toMatch(/class="p-sum"/);
    expect(ONE_HTML, '标签行丢了').toMatch(/class="p-tags"/);
  });

  it('零新增运行时依赖（红线）', () => {
    const deps = JSON.parse(read('package.json')).dependencies ?? {};
    expect(Object.keys(deps).length, `dependencies 应恰好 3 个，实际 ${Object.keys(deps).length}`).toBe(3);
    expect(Object.keys(deps)).toEqual(expect.arrayContaining(['astro', '@astrojs/rss', '@astrojs/sitemap']));
  });
});
