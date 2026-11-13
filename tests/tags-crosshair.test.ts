import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAGS } from '../src/tag-registry';
import { parse as parseYaml } from 'yaml';
import { readPostFrontmatter, visiblePosts } from './content-invariants.test';
import { RUNTIME_DEPS_ALLOWED } from './_deps';

/* 标签区共用装置契约：2026-10-19 接手原关于页的交互百褶无限环。
 * 验证标签底纹、内容与布局，以及独立准星组件的契约。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'tags', 'index.html'));

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** 剥两类注释：Astro 模板里的 JSX 块注释、以及 <style> 里的 CSS 块注释。
 *  顺序有讲究：先剥 JSX —— 它内部若含 CSS 块注释，先剥 CSS 的会把 JSX 那个切碎。 */
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const IDX = read('src/pages/tags/index.astro');
const ONE = read('src/pages/tags/[tag].astro');
const TAGS_PLATE_ASTRO = read('src/components/TagsPlate.astro');
const PLATE_ASTRO = TAGS_PLATE_ASTRO;
const XH_ASTRO = read('src/components/Crosshair.astro');
const XH_TS = read('src/scripts/crosshair.ts');
const HOVER = read('src/styles/hover.css');

const ONE_CSS = strip(ONE);
const PLATE_CSS = strip(PLATE_ASTRO);
const XH_CSS = strip(XH_ASTRO);
/* ⚠ 负向断言一律跑"剥过注释"的版本 —— 这几份文件的注释里**故意**写着
   「为什么**不**用 rAF / 为什么**不**复用 PostIndex / 为什么不用 #4caf50」，
   拿原文去 `not.toMatch` 会把"解释自己没做的事"判成"做了那件事"。 */
const PLATE_NC = strip(TAGS_PLATE_ASTRO);
const XH_TS_CODE = strip(XH_TS);

const IDX_HTML = hasDist ? readFileSync(join(DIST, 'tags', 'index.html'), 'utf8') : '';
const ONE_HTML = hasDist ? readFileSync(join(DIST, 'tags', 'AI', 'index.html'), 'utf8') : '';
const ARCHIVE_HTML = hasDist ? readFileSync(join(DIST, 'archive', 'index.html'), 'utf8') : '';

describe('标签区 · 交互百褶环挂载契约', () => {
  it('复用原百褶环，保留交互控制器和静态后备图', () => {
    expect(PLATE_NC).toContain("import PleatedInfinity from './PleatedInfinity.astro'");
    expect((PLATE_NC.match(/<PleatedInfinity \/>/g) ?? [])).toHaveLength(1);
    expect(PLATE_NC).not.toMatch(/ceramic-infinity|MechanicalRing|tags-infinity/);
  });

  it('★ 挂法：plate 具名槽（`.shell` 之外）+ 关掉通用内页底纹', () => {
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

describe('标签区 · 共用底纹与流动菜单', () => {
  it('★ 两页都挂同一个 TagsPlate（站主原话：「共用一套实现」）', () => {
    for (const [name, src] of [['tags/index.astro', IDX], ['tags/[tag].astro', ONE]] as const) {
      expect(src, `${name} 没挂 plate 槽`).toMatch(/<Fragment slot="plate"><TagsPlate \/><\/Fragment>/);
      expect(src, `没 import TagsPlate`).toMatch(/import TagsPlate from '\.\.\/\.\.\/components\/TagsPlate\.astro'/);
    }
    expect(PLATE_NC).not.toContain('<Crosshair');
  });

  it('总览和详情共用流动菜单组件', () => {
    expect(IDX).toContain('<TagFlowMenu items={items} />');
    expect(ONE).toContain('<TagFlowMenu items={items} articles />');
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
  it('总览和所有单标签页实际挂载可交互百褶环，且不再加载金属图', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    for (const tag of ['', ...TAGS]) {
      const html = readFileSync(join(DIST, 'tags', tag, 'index.html'), 'utf8');
      expect((html.match(/data-pleated-infinity/g) ?? []), `标签 ${tag || '总览'} 缺百褶环`).toHaveLength(1);
      expect(html).toMatch(/<canvas\b/);
      expect(html).toContain('pleated-infinity');
      expect(html).not.toContain('data-crosshair');
      expect(html).not.toMatch(/ceramic-infinity|class="tags-infinity"/);
      const scripts = [...html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+\.js)"/g)]
        .map(m => readFileSync(join(DIST, m[1]), 'utf8'));
      expect(scripts.some(code => code.includes('[data-pleated-infinity]')),
        `标签 ${tag || '总览'} 只有静态环，没有加载点击控制器`).toBe(true);
    }
  });

  it('总览页：流动菜单从已发布文章派生标签行、链接和篇数', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    expect(IDX_HTML).toContain('data-tag-flow-menu');
    expect(IDX_HTML).toContain('class="flowing-menu" style="background-color:transparent;');
    expect(IDX_HTML).not.toContain('class="flowing-menu__divider"');
    const posts = visiblePosts(readPostFrontmatter());
    const rows = [...IDX_HTML.matchAll(/<li class="flowing-menu__item">([\s\S]*?)<\/li>/g)].map((match) => match[1]);
    let tagsWithPosts = 0;
    for (const tag of TAGS) {
      const count = posts.filter((p) => p.tags.includes(tag)).length;
      if (!count) continue;
      tagsWithPosts++;
      const row = rows.find((row) => row.includes('href="/tags/' + encodeURIComponent(tag) + '/"'));
      expect(row, '标签缺少链接：' + tag).toBeDefined();
      expect(row).toContain('>' + tag + '</span>');
      expect(row).toContain('class="flowing-menu__meta">' + count + ' 篇</span>');
      const part = row?.match(/class="flowing-menu__part">([\s\S]+?)<\/div>/)?.[1];
      expect(part?.match(/class="tag-flow-title"/g), tag + '的色带必须包含所有已发布文章').toHaveLength(count);
      expect(part?.match(/data-tag-flow-photo=/g), tag + '的标题后应有照片胶囊').toHaveLength(count);
    }
    expect(rows).toHaveLength(tagsWithPosts);
    expect(IDX_HTML, '缺底纹层').toMatch(/data-pleated-infinity/);
    expect(IDX_HTML, '底纹必须走构建期优化管线（srcset）').toMatch(/<img[^>]*srcset="[^"]*"/);
    expect(IDX_HTML, 'body 上没有 tags-plate ⇒ 通用内页底纹没被关掉').toMatch(/<body[^>]*class="[^"]*tags-plate/);
    /* 内容必须服务端渲染完整（装置是装饰，不许承担内容） */
    for (const t of ['AI', '建站', '摄影', '钢琴']) {
      expect(IDX_HTML, `标签「${t}」没渲染出来`).toContain(`>${t}<`);
    }
    /* 标题必须留在**正文流**里：'page' 外壳不渲染 band 槽 ⇒ 搬错位置会静默消失 */
    expect(IDX_HTML, '页头标题没在正文流里').toMatch(/<header class="pagehead"[^>]*><h1[^>]*>标签<\/h1>/);
    expect(ONE_HTML, '单标签页的页头标题没在正文流里').toMatch(/<header class="pagehead"[^>]*><h1[^>]*>AI<\/h1>/);
  });

  it('每个标签详情按文章列出标题和链接，色带滚动对应文章摘要', () => {
    const posts = visiblePosts(readPostFrontmatter()).map(post => {
      const file = read('content/posts/' + post.slug + '/index.md');
      const frontmatter = parseYaml(file.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n/)![1]);
      return { ...post, ...frontmatter, slug: frontmatter.slug ?? post.slug };
    });
    const htmlText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    for (const tag of TAGS) {
      const tagged = posts.filter(post => post.tags.includes(tag));
      if (!tagged.length) continue;
      const html = readFileSync(join(DIST, 'tags', tag, 'index.html'), 'utf8');
      const rows = [...html.matchAll(/<li class="flowing-menu__item">([\s\S]*?)<\/li>/g)].map(match => match[1]);
      expect(rows, tag).toHaveLength(tagged.length);
      for (const post of tagged) {
        const row = rows.find(row => row.includes('href="/posts/' + post.slug + '/"'));
        expect(row, post.title).toBeDefined();
        expect(row).toContain('>' + htmlText(post.title) + '</span>');
        expect(row).toContain('class="tag-flow-title">' + htmlText(post.summary) + '</span>');
      }
    }
  });

  it('运行时依赖只许住在白名单里（红线）', () => {
    const deps = Object.keys(JSON.parse(read('package.json')).dependencies ?? {}).sort();
    expect(deps, `dependencies 与 tests/_deps.ts 的白名单不一致：实际 ${deps.join(' , ')}`).toEqual(
      RUNTIME_DEPS_ALLOWED,
    );
  });
});
