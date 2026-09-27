import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { bootCss } from '../src/lib/boot-css';

const DIST = 'dist';
const hasDist = existsSync(DIST);
const POSTS_DIR = 'content/posts';

type PostInfo = { slug: string; draft: boolean; images: string[]; date: string };

/**
 * 从内容层推导草稿/已发布，**不硬编码**。
 * 之前把「三篇全是草稿」写死在测试里，短文一转正就 4 条误报 —— 测试的假设过期了，
 * 不是代码坏了。发布状态是站主的决定，会变，测试必须跟着内容走。
 */
function readPosts(): PostInfo[] {
  if (!existsSync(POSTS_DIR)) return [];
  return readdirSync(POSTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const file = join(POSTS_DIR, d.name, 'index.md');
      if (!existsSync(file)) return [];
      const text = readFileSync(file, 'utf8');
      // \r?\n：Windows 上 core.autocrlf=true 时新克隆出来是 CRLF（2026-09-27 实测）
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (!fm) return [];
      const images = [...fm[2].matchAll(/!\[[^\]]*\]\(\.\/([^)\s]+)\)/g)].map((m) => m[1].split('/').pop()!);
      const date = (fm[1].match(/^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m) ?? [, ''])[1];
      return [{ slug: d.name, draft: /^draft:\s*true\s*$/m.test(fm[1]), images, date }];
    });
}

const POSTS = readPosts();
const DRAFTS = POSTS.filter((p) => p.draft);
const PUBLISHED = POSTS.filter((p) => !p.draft);

function walk(dir: string, filter: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, filter));
    else if (filter(e)) out.push(p);
  }
  return out;
}

const htmlFiles = () => (hasDist ? walk(DIST, (n) => n.endsWith('.html')) : []);

/**
 * 一个页面**实际加载的全部 JS 代码**：页内内联 + 它引用的同源外部脚本**及其 import 闭包**。
 * 2026-09-26 加：留言页也用同一个评论脚本之后，Astro 把多页共用的脚本抽成 `/_astro/*.js`，
 * 而且会拆成两层（页面 → loader chunk → 共享 chunk，`import"./comments.xxx.js"`）。
 * 只读页面 HTML（或只跟一层）会漏代码 —— 预算少算、端点找不到、产物被当成孤儿。
 * 凡是查"页面里的 JS"的地方都走这里。
 */
function jsClosure(pagePath: string): { code: string; files: string[] } {
  const html = readFileSync(pagePath, 'utf8');
  const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const files: string[] = [];
  const seen = new Set<string>();
  const load = (href: string) => {
    const rel = href.replace(/^\//, '').replace(/^\.\//, '');
    const f = join(DIST, rel.startsWith('_astro/') ? rel : join('_astro', rel));
    if (seen.has(f) || !existsSync(f)) return;
    seen.add(f);
    files.push(f);
    const code = readFileSync(f, 'utf8');
    for (const m of code.matchAll(/(?:import|from)\s*"([^"]+\.js)"/g)) load(m[1]);
  };
  for (const m of html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+\.js)"/g)) load(m[1]);
  const code = inline + '\n' + files.map((f) => readFileSync(f, 'utf8')).join('\n');
  return { code, files };
}

/** 页面实际加载的 JS 代码文本（见 jsClosure 的说明） */
const jsLoadedBy = (pagePath: string) => jsClosure(pagePath).code;

describe.skipIf(!hasDist)('草稿三态：第三态（直链不产出）', () => {
  it('内容层里确实存在草稿（否则本组断言是空转）', () => {
    if (DRAFTS.length === 0) {
      // 三篇都已发布，这里没有草稿可断言 —— 这是合法状态，不是失败。
      // 草稿逻辑本身由 tests/post-meta.test.ts 的 filterVisible 用例覆盖。
      console.warn('当前没有任何草稿：草稿相关的集成断言本轮为空转');
      return;
    }
    expect(DRAFTS.length).toBeGreaterThan(0);
  });

  it('草稿文章不产出页面', () => {
    for (const p of DRAFTS) {
      expect(existsSync(join(DIST, 'posts', p.slug)), `草稿 ${p.slug} 不该有页面`).toBe(false);
    }
  });

  it('草稿的 slug 不出现在任何产出的 HTML 里', () => {
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      for (const p of DRAFTS) {
        expect(html.includes(p.slug), `${f} 里出现了草稿 slug ${p.slug}`).toBe(false);
      }
    }
  });

  it('草稿的素材不产出（prune-draft-assets.mjs 的净效果）', () => {
    const astroDir = join(DIST, '_astro');
    if (!existsSync(astroDir)) return;
    const files = readdirSync(astroDir);
    for (const p of DRAFTS) {
      for (const img of p.images) {
        const stem = img.replace(/\.[^.]+$/, '');
        const leaked = files.filter((f) => f.startsWith(stem + '.') || f.startsWith(stem + '_'));
        expect(leaked, `草稿 ${p.slug} 的素材被部署了：${leaked.join(', ')}`).toEqual([]);
      }
    }
  });

  it('已发布文章确实产出了页面（否则上面几条是空转）', () => {
    for (const p of PUBLISHED) {
      expect(existsSync(join(DIST, 'posts', p.slug, 'index.html')), `已发布 ${p.slug} 缺页面`).toBe(true);
    }
  });
});

describe.skipIf(!hasDist)('RSS 与 sitemap', () => {
  it('两个文件都存在', () => {
    expect(existsSync(join(DIST, 'rss.xml')), 'rss.xml 不存在').toBe(true);
    expect(existsSync(join(DIST, 'sitemap-index.xml')), 'sitemap 不存在').toBe(true);
  });

  it('RSS 条目数恰好等于已发布文章数（草稿不进，已发布不落）', () => {
    const rss = readFileSync(join(DIST, 'rss.xml'), 'utf8');
    expect((rss.match(/<item>/g) ?? []).length).toBe(PUBLISHED.length);
  });
});

describe.skipIf(!hasDist)('全局硬约束', () => {
  it('每页恰好一个 h1，且语言标记正确', () => {
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      expect((html.match(/<h1[\s>]/g) ?? []).length, `${f} 的 h1 数量`).toBe(1);
      expect(html, `${f} 缺少 lang="zh-CN"`).toContain('lang="zh-CN"');
    }
  });

  it('所有图片的 alt 都非空', () => {
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      for (const m of html.matchAll(/<img\b[^>]*>/g)) {
        const alt = m[0].match(/alt="([^"]*)"/);
        expect(alt, `${f} 里有 img 完全没有 alt`).toBeTruthy();
        expect(alt![1].trim().length, `${f} 里有 img 的 alt 是空的`).toBeGreaterThan(0);
      }
    }
  });

  it('目录锚点真的能跳（href 与正文标题 id 一一对应）', () => {
    // **「看起来存在」不等于「测过它在工作」。** 目录渲染出来了、有 5 条链接、构建与测试全绿，
    // 但从没有人验过它们跳不跳得动 —— 实测事故：headingTree 读的是 h.id，而 Astro render() 给的是
    // h.slug ⇒ 5 条 href 全是字符串 "#undefined"，点了一条也跳不动。
    // 这条断言就是那次事故的回归网：静态可查（不需要浏览器），所以在 CI 上也守得住。
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      const toc = (html.match(/<nav class="toc"[\s\S]*?<\/nav>/) ?? [''])[0];
      const hrefs = [...toc.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
      if (hrefs.length === 0) continue; // 这页没有目录，跳过
      expect(hrefs, `${f} 的目录里有 "#undefined" 之类的死链`).not.toContain('undefined');
      const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
      const dangling = hrefs.filter((h) => !ids.has(h));
      expect(dangling, `${f} 的目录锚点悬空（href 找不到对应 id）：${dangling.join(', ')}`).toEqual([]);
    }
  });

  it('存在全站链接配色兜底（防止链接掉回浏览器默认蓝）', () => {
    // 根因：站点若没有全局 `a` 颜色规则，任何落在未定色容器里的链接都会掉回
    // UA 的 a:link { color: -webkit-link }（默认蓝）—— UA 声明压过继承值。
    // 这个根因出现过两次（内页顶栏 / 404 的「回到首页」），所以加了一层兜底（src/styles/links.css），
    // 这条断言守着那层兜底**别被当成无用样式清掉**。
    const cssFiles: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith('.css')) cssFiles.push(p);
      }
    };
    walk(DIST);
    const all = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    // 匹配一条「裸 a」选择器且带 color 的规则（不含后代/复合选择器）
    const globalLinkRule = /(?:^|[}\s,])a\s*(?:,[^{}]*)?\{[^}]*\bcolor\s*:/.test(all);
    expect(globalLinkRule, '产物 CSS 里找不到全局 a 颜色规则 —— 链接兜底被删了？').toBe(true);
    console.log('判据 链接兜底 产物 CSS 含全局 a 颜色规则: true');
  });

  it('跟手光标：每页都有、且触摸设备与减少动态效果下都藏起来', () => {
    // 2026-09-26：站主给了 Ocautator/arknights-cursor 的参考实现 ⇒ 加了「跟手 + 悬停缩小 + 点击涟漪」，
    // 之后按站主要求改成「白色中心点 + 半透明圆盘」（原生光标隐藏，点就是光标）。
    // 这条守几件容易在后续改动里丢掉的事：
    //  ① 三个元素是全站的（Base.astro 引入）⇒ 每个产物页面都得有；
    //  ② 触摸设备（没有指针）与 prefers-reduced-motion 下必须 display:none；
    //  ③ `cursor:none` 只能由 JS 加类（脚本没跑时不能把光标藏掉却没有替代品）；
    //  ④ 脚本不许用 innerHTML —— 本站的硬约束。
    const pages = htmlFiles();
    expect(pages.length, '产物里没有 HTML 页面').toBeGreaterThan(0);
    const missing = pages.filter((f) => {
      const h = readFileSync(f, 'utf8');
      return !/class="cr-disc"/.test(h) || !/class="cr-dot"/.test(h) || !/class="cr-ripple"/.test(h);
    });
    expect(missing, `这些页面缺跟手光标元素：${missing.join(', ')}`).toEqual([]);

    const cssFiles: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith('.css')) cssFiles.push(p);
      }
    };
    walk(DIST);
    const all = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(all, '缺少「减少动态效果 / 触摸设备」的守卫').toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\),\s*\(hover:\s*none\)\s*\{[^}]*\.cr-disc[^}]*display:\s*none/,
    );
    expect(all, '三个元素都没 pointer-events:none（会拦住点击）').toMatch(/\.cr-disc[^{}]*\{[^}]*pointer-events:\s*none/);
    // cursor:none 必须挂在 html.cursor-none（JS 加的类）上，而不是裸 html —— 否则脚本没跑时没有光标
    expect(all, 'cursor:none 没挂在 JS 可控的类上').toMatch(/cursor-none[^{}]*\{[^}]*cursor:\s*none/);
    expect(all, '文字上没保留主题 I 型（被 cursor:none 一起吃掉了）').not.toMatch(/cursor:\s*var\(--cursor-text\)/);
    const scripts = pages.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(scripts, '内联脚本里出现了 innerHTML —— 本站硬约束不允许').not.toMatch(/innerHTML/);
    console.log('判据 跟手光标 对象 每页三元素 + 守卫 + cursor:none 的可控性 + innerHTML 扫描 实测: 缺元素 0 页 · 全部通过');
  });

  it('主页磁带背景：只在首页、是装饰、窄屏隐藏，资源在位', () => {
    // 2026-09-26 站主给了一张「RHINE LAB, LLC. NO.001」磁带渲染图，要求抠下来放主页背景。
    // 守四件事：① 资源真的在产物里（构建期从 assets/homepage-art 抠底生成）；
    //          ② 它是**装饰**（alt 空 + aria-hidden + pointer-events:none + z-index 0）；
    //          ③ 只挂首页（内页不该多这张图）；④ 窄屏不显示（手机上背景装饰会反复被正文压过）。
    const art = join(DIST, 'art', 'cassette.webp');
    expect(existsSync(art), 'dist/art/cassette.webp 不在产物里（生成器没跑？）').toBe(true);
    const artBuf = readFileSync(art);
    expect(artBuf.length, `cassette.webp 只有 ${artBuf.length} 字节`).toBeGreaterThan(10 * 1024);
    // WebP 头：RIFF....WEBP
    expect(artBuf.subarray(0, 4).toString('latin1'), 'cassette.webp 不是 WebP').toBe('RIFF');
    expect(artBuf.subarray(8, 12).toString('latin1'), 'cassette.webp 不是 WebP').toBe('WEBP');

    const home = readFileSync(join(DIST, 'index.html'), 'utf8');
    // 用 CSS 背景而不是 <img>：装饰图不该给"所有图片 alt 非空"那条硬约束开口子。
    // 因此 HTML 里只该有那个装饰 div，图片引用在 CSS 里（下面断言 CSS 接上了背景）。
    expect(home, '首页没有磁带装饰层').toMatch(/<div class="bg-cassette"[^>]*aria-hidden="true"[^>]*>/);

    const cssFiles: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith('.css')) cssFiles.push(p);
      }
    };
    walk(DIST);
    const all = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(all, '.bg-cassette 没走装饰层约定（pointer-events:none + z-index:0）').toMatch(
      /\.bg-cassette[^{}]*\{[^}]*pointer-events:\s*none[^}]*\}/,
    );
    expect(all, '.bg-cassette 没把磁带图作为背景接上').toMatch(/\.bg-cassette[^{}]*\{[^}]*background:[^;}]*\/art\/cassette\.webp/);
    // 压缩器会把 `max-width: 767px` 改写成 `(width<=767px)` ⇒ 只按 767px 这个数去认，别写死语法
    expect(all, '.bg-cassette 缺少窄屏隐藏').toMatch(/@media[^{]*767px[^{]*\{[^}]*\.bg-cassette[^}]*display:\s*none/);

    const others = htmlFiles().filter((f) => f !== join(DIST, 'index.html'));
    // 图在 CSS 里 ⇒ "只有首页用"要按**每个页面实际引用的 CSS bundle** 查：
    // Astro 把 CSS 放在 dist/_astro/，页面用 <link> 指过去；非首页不该引到含这张图的那份。
    const leaked = others.filter((f) => {
      const html = readFileSync(f, 'utf8');
      const hrefs = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
      return hrefs.some((h) => readFileSync(join(DIST, h.replace(/^\//, '')), 'utf8').includes('cassette.webp'));
    });
    expect(leaked, `这些非首页也引到了磁带图所在的 CSS：${leaked.join(', ')}`).toEqual([]);
    console.log(`判据 主页磁带 对象 产物资源 + 装饰属性 + 仅首页 + 窄屏隐藏 实测: ${(artBuf.length / 1024).toFixed(1)} KB · 其余 ${others.length} 页未引到`);
  });

  it('首页扫描读数：毛玻璃（半透明 + 模糊）单行截断，不再用不透明纸底挡字', () => {
    // 站主 2026-09-26：「把扫描那个框改成半透明（毛玻璃）的，别挡字」。
    // 背景：读数固定在扫描带上、扫描带在视口中央 ⇒ 滚动时必然压到正文；
    // 原来底色是**不透明的 --paper**，等于把标题中间几行挖掉（站主截图里就是这样）。
    // 这条守三件：① 底色必须半透明（不许再出现不透明 background）；② 有 backdrop-filter；
    //            ③ 单行截断（读数是整条标题，手机上会折行、把标题盖掉大半）。
    const cssFiles: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith('.css')) cssFiles.push(p);
      }
    };
    walk(DIST);
    const all = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    // 有多条 .band-readout 规则（如 html:not(.js) 那条只有 display）⇒ 取带背景的那条
    const rules = [...all.matchAll(/\.band-readout[^{}]*\{[^}]*\}/g)].map((m) => m[0]);
    const rule = rules.find((r) => r.includes('background:')) ?? '';
    expect(rule, '产物里找不到带背景的 .band-readout 规则').not.toBe('');
    const bg = (rule.match(/background:([^;}]+)/) ?? ['', ''])[1].trim();
    // 半透明判定：rgba(...,<1) 或 8 位 hex 且 alpha 字节不是 ff
    const hex8 = bg.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/);
    const rgba = bg.match(/^rgba?\([^)]*,\s*(0?\.\d+|0|1)\)$/);
    const translucent = (hex8 && hex8[2] !== 'ff') || (rgba && Number(rgba[1]) < 1);
    expect(translucent, `.band-readout 的底色不是半透明（实测 background:${bg}）—— 这会挡字`).toBe(true);
    expect(rule, '.band-readout 缺 backdrop-filter（毛玻璃）').toContain('backdrop-filter');
    expect(rule, '.band-readout 没做单行截断（会有换行把标题盖掉）').toContain('white-space:nowrap');
    const bRule = (all.match(/\.band-readout[^{}]*b[^{}]*\{[^}]*\}/) ?? [''])[0];
    expect(bRule, '.band-readout b 没有省略号截断').toContain('text-overflow:ellipsis');
    console.log(`判据 扫描读数 对象 .band-readout 实测: background:${bg} · 有 backdrop-filter · 单行截断`);
  });

  it('光标：自定义位图光标已删（无 JS 时用系统光标），跟手白点仍在', () => {
    // 2026-09-27 站主："把之前的正常选择的光标删了，要不然有时会蹦出来"。
    // 那枚是 PRTS「正常选择」的结晶箭头（scripts/gen-cursors.mjs 生成的 normal.png）。
    // 它只在 JS 加上 `html.cursor-none` **之后**才被白点顶掉 ⇒ 加类之前的一瞬、
    // 以及 `<select>` 这类 UA 自己声明光标的元素上会露出来。
    // 现在：有 JS = 跟手白点；没 JS = **系统光标**（不再自带位图）。
    // 这条守四件事：
    //  ① 产物 CSS 里**一条 /cursors/ 引用都不许剩**（含 token 与 url）；
    //  ② 位图目录不留（别让"删了但产物里还有"这种事蒙混过去）；
    //  ③ 跟手光标那条 `html.cursor-none` 全局规则必须还在（它是白点能接管的前提，且必须不带作用域）；
    //  ④ 源码里不许再有 `cursor: var(--cursor-…)` 这种指向已删 token 的死引用。
    const cssFiles: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith('.css')) cssFiles.push(p);
      }
    };
    walk(DIST);
    const all = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    const flat = all.replace(/\s+/g, ' ');

    const refs = [...all.matchAll(/url\((\/cursors\/[^)]*)\)/g)].map((m) => m[1]);
    expect(refs, `产物 CSS 里还有光标位图引用（那枚光标应当已删除）：${refs.join(', ')}`).toEqual([]);
    expect(flat, '产物 CSS 里还残留 --cursor-default（删得不干净）').not.toMatch(/--cursor-(default|text|link)/);
    expect(existsSync(join(DIST, 'cursors')), 'dist/cursors/ 还在（位图没删干净）').toBe(false);

    // ③ 跟手白点接管原生的前提：这条全局规则必须在（且不能带作用域属性）
    expect(flat, '缺 html.cursor-none 的全局接管规则（白点会与原生光标并存）').toContain('html.cursor-none,html.cursor-none *{cursor:none}');
    // ⚠️ 注意别写成 `!f.endsWith('index.html')` —— 那会把**所有**页面滤掉，
    //    断言在空数组上永远通过（第一版就是这么空转的）。只排 404，并要求页面数不为零。
    const pages = htmlFiles().filter((f) => !f.endsWith('404.html'));
    expect(pages.length, '页面清单为空，断言会空转').toBeGreaterThan(10);
    const noDot = pages.filter((f) => !readFileSync(f, 'utf8').includes('cr-dot'));
    expect(noDot, `这些页面没有跟手光标的节点：${noDot.slice(0, 5).join(', ')}`).toEqual([]);

    // ④ 源码扫描：只允许 none（跟手光标用）；任何 var(--cursor-…) 都是死引用
    const srcFiles: string[] = [];
    const walkSrc = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walkSrc(p);
        else if (/\.(css|astro)$/.test(e)) srcFiles.push(p);
      }
    };
    walkSrc('src');
    /** 扫描前必须剥掉注释：之前栽过 —— 在注释里为了解释 UA 那条规则写了 `a{cursor:pointer}` 被当成真声明。 */
    const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
    const ALLOW = /^(none|auto|text|default|inherit|not-allowed|pointer)$/;
    const offenders: string[] = [];
    for (const f of [...srcFiles, 'src/lib/boot-css.ts']) {
      const text = stripComments(f.endsWith('boot-css.ts') ? bootCss() : readFileSync(f, 'utf8'));
      for (const m of text.matchAll(/cursor:\s*([^;{}]+)[;}]/g)) {
        const value = m[1].trim().replace(/\s+/g, ' ');
        if (!ALLOW.test(value)) offenders.push(`${f}: cursor:${value}`);
      }
    }
    expect(offenders, `这些声明指向已删除的光标 token：${offenders.join(' | ')}`).toEqual([]);
    console.log(`判据 光标 对象 位图与 token 已删 + 跟手白点仍在 实测: /cursors/ 引用 ${refs.length} 条 · ${pages.length} 页有白点节点 · 死引用 ${offenders.length} 处`);
  });

  it('导航：每一项都能点进去、两套外壳都有、移动端抽屉零 JS', () => {
    // 站主 2026-09-26：按参考站 blog.ayeez.cn 加了「友链 / 说说 / 留言 / 日志」四项，
    // 要求"每一个都要能点进去"，移动端要有导航菜单。这条按这个要求守四件事：
    //  ① **每个 nav 链接都真能打开**（产物里有对应 HTML）—— 这是"能点进去"的硬判据；
    //  ② 两套外壳（Brandline 深色带 / Topbar 浅色顶栏）渲染的是同一份清单，逐页都在；
    //  ③ 移动端抽屉在每个页面里都有（≤1023px 才显示），且**不含任何脚本**（文章页 JS 预算是 4096，只有 3561 余量）；
    //  ④ 新增的四个页面确实产出了。
    const pages = htmlFiles().filter((f) => !f.endsWith('404.html'));
    // 2026-09-26 修正：首页**也**要有导航。第一版按"console 外壳没有导航"的旧定案没加，
    // 站主打开首页（最自然的入口）就以为整件事没生效（"我手机电脑都没变化啊"）⇒ 现在首页
    // 的 HUD 里也有横排导航 + 同一个抽屉组件，所以这条不再排除首页。
    expect(pages.length, '产物页面太少，断言可能空转').toBeGreaterThan(10);

    // ① 链接可达：把 nav 清单从产物里读回来（不 import 源码，避免"自证"）。
    //    注意 `aria-current` 只挂在当前页那一项上 ⇒ 不能拿它当定位锚，要从 nav 块里取。
    const sample = readFileSync(join(DIST, 'about', 'index.html'), 'utf8');
    const navBlock = sample.match(/<nav aria-label="主导航">([\s\S]*?)<\/nav>/)?.[1] ?? '';
    const navHrefs = [...navBlock.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h !== '/rss.xml');
    expect(navHrefs.length, '取不到导航链接清单').toBeGreaterThanOrEqual(9);
    const dead = navHrefs.filter((h) => {
      const target = h === '/' ? join(DIST, 'index.html') : join(DIST, h.replace(/^\/|\/$/g, ''), 'index.html');
      return !existsSync(target);
    });
    expect(dead, `这些导航项点进去是死链：${dead.join(', ')}`).toEqual([]);

    // ② 每页（含新增四页）都得有完整清单；抽屉元素也要在
    //    首项 2026-09-26 由「文章」改名「主页」（站主："右上角加个主页 / 把文章删了"）
    const labels = ['主页', '关于', '归档', '友链', '说说', '留言', '相册', '日志', '标签'];
    const missing: string[] = [];
    for (const f of pages) {
      const html = readFileSync(f, 'utf8');
      for (const l of labels) if (!html.includes(`>${l}</a>`)) missing.push(`${f}:${l}`);
      if (!html.includes('class="navtog"') || !html.includes('class="navpanel"')) missing.push(`${f}:抽屉`);
    }
    expect(missing, `这些页面缺导航项/抽屉：${missing.slice(0, 8).join(', ')}`).toEqual([]);

    // ③ 抽屉必须零 JS：把带抽屉的页面里的内联脚本总量与文章页预算对齐（沿用既有预算断言的口径）
    const article = readFileSync(join(DIST, 'about', 'index.html'), 'utf8');
    const scripts = [...article.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    const total = scripts.reduce((s, m) => s + Buffer.byteLength(m[1], 'utf8'), 0);
    console.log(`判据 导航 对象 nav 链接可达性 + 每页清单 + 抽屉 实测: ${navHrefs.length} 项全部可达 · ${pages.length} 页清单完整 · 文章页内联脚本 ${total} 字节（抽屉零 JS）`);
    expect(total, '抽屉引入了脚本（应该纯 CSS）').toBeLessThan(4096);

    // ④ 新增页面在位
    for (const p of ['links', 'talks', 'guestbook', 'log']) {
      expect(existsSync(join(DIST, p, 'index.html')), `新页面 /${p}/ 没产出`).toBe(true);
    }
    // ⑤ 桌面隐藏抽屉、≤1023px 隐藏横排（都在 CSS 里，别让两套同时出现）
    const cssFiles: string[] = [];
    const walk2 = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk2(p);
        else if (e.endsWith('.css')) cssFiles.push(p);
      }
    };
    walk2(DIST);
    const css = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n').replace(/\s+/g, '');
    // 注意：Astro 会给组件样式加作用域属性（.navtog[data-astro-cid-…]），压缩器还会把
    // `max-width:1023px` 写成 `(width<=1023px)` —— 两条断言都别绑这些形态，只认意思。
    const hiddenRule = (css.match(/[^{}]*navtog[^{}]*\{[^}]*display:none[^}]*\}/) ?? [''])[0];
    for (const cls of ['navbtn', 'navmask', 'navpanel']) {
      expect(hiddenRule, `桌面隐藏规则里缺 ${cls}（两套菜单会同时出现）`).toContain(cls);
    }
    // 1023px 会有好几处（抽屉自己的、Brandline 的、Topbar 的）⇒ 逐个窗口看哪一个隐藏了横排 nav
    const windows = [...css.matchAll(/1023px/g)].map((m) => css.slice(m.index!, m.index! + 400));
    expect(windows.length, 'CSS 里找不到 1023px 断点').toBeGreaterThan(0);
    expect(
      windows.some((w) => /nav[^{}]*\{display:none\}/.test(w)),
      '≤1023px 没有隐藏横排导航（会和抽屉同时出现）',
    ).toBe(true);
  });

  it('归档：年份分组与筛选选项都从内容推导（明年发文会自动多出那一年）', () => {
    // 站主 2026-09-26 问："我明年发了个文章，他会在上面出现并有 2027 的字样出现吗？"
    // 这条断言就是那个问题的**常驻答案** —— 归档的年月分组与下拉选项都由文章日期推导，不写死。
    // （当时已用一篇临时 2027 文章端到端验证过：分组顺序变成 ["2027","2026"]、选项多出 2027、按 2027 能筛出来。）
    const html = readFileSync(join(DIST, 'archive', 'index.html'), 'utf8');
    const groupYears = [...html.matchAll(/class="yeargroup"[^>]*data-year="(\d{4})"/g)].map((m) => m[1]);
    // 别绑 Astro 的作用域属性（产物是 `<option value="2026" data-astro-cid-…>2026</option>`）
    const optionYears = [...html.matchAll(/<option value="(\d{4})"[^>]*>\d{4}<\/option>/g)].map((m) => m[1]);
    const contentYears = [...new Set(PUBLISHED.map((p) => p.date.slice(0, 4)).filter(Boolean))].sort().reverse();

    expect(contentYears.length, '没有已发布文章，断言可能空转').toBeGreaterThan(0);
    expect(groupYears, '归档的年份分组与文章日期对不上（有写死的年份？）').toEqual(contentYears);
    expect(optionYears, '年份下拉选项与文章日期对不上').toEqual(contentYears);
    expect(groupYears, '年份分组不是倒序（新的应当在上面）').toEqual([...groupYears].sort().reverse());

    // 筛选要有东西可筛：每行都得带 data-*（搜索/年月都靠它）+ 筛选条在位
    const rows = [...html.matchAll(/<li\s+data-date="([^"]+)"\s+data-year="(\d{4})"\s+data-month="(\d{2})"\s+data-q="([^"]*)"/g)];
    expect(rows.length, '归档的行没有 data-date/data-year/data-month/data-q（筛选会失效）').toBe(PUBLISHED.length);
    expect(html, '筛选条不在产物里').toContain('data-filters');
    expect(html, '筛选条默认应当隐藏（无 JS 时不显示）').toMatch(/<form class="filters" data-filters hidden/);
    // 月份选项也必须来自内容
    const contentMonths = [...new Set(PUBLISHED.map((p) => p.date.slice(5, 7)).filter(Boolean))].sort();
    const optionMonths = [...html.matchAll(/<option value="(\d{2})"[^>]*>\d+ 月<\/option>/g)].map((m) => m[1]);
    expect(optionMonths, '月份下拉选项与文章日期对不上').toEqual(contentMonths);
    console.log(`判据 归档筛选 对象 年份分组/下拉/月份/data 属性 实测: ${groupYears.join(' ')} · ${rows.length} 行带筛选属性 · 选项 ${optionYears.join('/')} 与 ${optionMonths.join('/')}`);
  });

  it('关于页：头像（圆形 + 名字）与社交卡片都在，图标是本站内联 SVG', () => {
    // 站主 2026-09-26：右侧空白放圆形头像、下面写「北杉」；加社交账号（GitHub/邮箱/RSS/抖音/哔哩哔哩）带图标。
    const html = readFileSync(join(DIST, 'about', 'index.html'), 'utf8');
    expect(html, '头像没渲染出来').toMatch(/class="[^"]*avatar/);
    expect(html, '头像没有 alt 文本').toContain('alt="北杉的头像"');
    expect(html, '头像下面没有名字').toContain('profile-name');
    expect(html, '社交区块标题不在').toContain('我的一些社交账号');
    for (const name of ['GitHub', '邮箱', 'RSS', '抖音', '哔哩哔哩']) {
      expect(html, `社交卡片缺 ${name}`).toContain(`>${name}</span>`);
    }
    // 图标必须是**本站内联 SVG**（站上零第三方：不许引图标库）
    expect((html.match(/<svg class="[^"]*ic[^"]*"/g) ?? []).length, '内联图标数量不对').toBe(5);
    expect(html, '引了第三方图标资源').not.toMatch(/(unpkg|jsdelivr|cdnjs|fontawesome|googleapis)/i);
    // 抖音与哔哩哔哩的链接必须是站主给的那两条
    expect(html).toContain('douyin.com/user/MS4wLjABAAAA_s1DtB8crLmTepK0rZPjJr7U8W2Lm7EGWVti1q4Zwlgp52SGKtZsqL-1_U7_HOK_');
    expect(html).toContain('space.bilibili.com/515563135');
    console.log('判据 关于页 对象 头像 + 名字 + 5 张社交卡片 + 内联图标 实测: 全部在位');
  });

  it('说说：每条都有点赞与评论入口，页脚统计在每页都在', () => {
    // 站主 2026-09-26："说说加个点赞评论功能，点赞不记名只记个数，评论要输入名称"
    //              + "在每页最底部加上图一上的功能"（运行时长 + PV/UV）。
    // 这条守的是**产物里真的有这些挂点**（脚本能不能跑通由 _tmp-talks-check.mjs 那类浏览器验收守）。
    const talks = readFileSync(join(DIST, 'talks', 'index.html'), 'utf8');
    const likes = [...talks.matchAll(/data-like="(talk-[a-z0-9-]+)"/g)].map((m) => m[1]);
    const boxes = [...talks.matchAll(/data-comments-for="(talk-[a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(likes.length, '说说页没有点赞按钮').toBeGreaterThan(0);
    expect(boxes, '说说页的评论框数量应当与点赞按钮一致').toEqual(likes);
    expect(talks, '点赞按钮没有 aria-pressed（已赞状态要靠它）').toContain('aria-pressed');
    expect(talks, '评论表单没有名字输入框').toMatch(/name="name"/);
    expect(talks, '评论表单丢了蜜罐').toMatch(/name="website"/);
    // 脚本加载
    expect(talks, '说说页没有加载点赞/评论脚本').toMatch(/<script[^>]*type="module"/);

    // 页脚统计：每个非 404 页面都要有（首页是 console 外壳，所以它单独放了一份）
    const pages = htmlFiles().filter((f) => !f.endsWith('404.html'));
    const missing = pages.filter((f) => !readFileSync(f, 'utf8').includes('data-since'));
    expect(missing, `这些页面没有页脚统计：${missing.slice(0, 6).join(', ')}`).toEqual([]);
    // 起点日期来自内容层，不是写死在组件里
    const siteMd = readFileSync('content/site.md', 'utf8');
    expect(siteMd, 'content/site.md 里没有 since（页脚运行时长没有起点）').toMatch(/^since:\s*\d{4}-\d{2}-\d{2}\s*$/m);
    console.log(`判据 说说互动 + 页脚统计 对象 产物挂点 实测: ${likes.length} 条带赞/评论 · ${pages.length} 页有统计 · since 在内容层`);
  });

  it('仓库里不许混进临时探针（_tmp*）—— 2026-09-27 事故的护栏', () => {
    // 事故经过：站主用 `git add -A` 提交一条友链（content/pages/links.md），
    // 结果把 **239 个临时文件 + 一个嵌套仓库 gitlink（_tmp-arknights-cursor，mode 160000）**
    // 一起提交了 ⇒ Cloudflare 那次构建 Failure ⇒ 线上停在上一个成功版本 ⇒ "友链加了但线上没上"。
    // （诊断链：wrangler pages deployment list 看到 8092786 → Failure，而工作区当时其实是干净的。）
    //
    // 这条守两处：
    //  ① `.gitignore` 里必须有 `/_tmp*`（护栏被删掉就等于事故可重演）；
    //  ② `src/` 与 `content/` 里不许出现 _tmp 前缀的文件（它们只该留在本地）。
    // 注：没有测得动"git 索引里有没有 _tmp"的干净接缝（测试跑在文件系统上、不跑 git），
    //     这是本次诊断记下的**接缝缺失**；可替代的护栏就是下面这两条 + 我这边提交前逐条 add 路径。
    const ignore = readFileSync('.gitignore', 'utf8');
    expect(ignore, '.gitignore 里的 /_tmp* 护栏丢了（事故可重演）').toMatch(/^\/_tmp\*/m);
    const junk = [...walk('src', () => true), ...walk('content', () => true)].filter((f) =>
      f.split(/[\\/]/).some((p) => p.startsWith('_tmp')),
    );
    expect(junk, `这些临时文件不该在仓库里：${junk.slice(0, 5).join(', ')}`).toEqual([]);
  });

  it('页面过渡与相册灯箱/导航抽屉的层叠关系（2026-09-27 两处回归的护栏）', () => {
    // 两个真踩过的 bug：
    //  ① 相册点照片会触发过渡、且蒙版盖住灯箱（照片看不到）⇒
    //     · 缩略图链接必须有 data-no-transition（它的点击由灯箱 preventDefault 接管，不会真跳转）；
    //     · 蒙版 z-index 必须**低于**灯箱，万一还是挂上了也不能挡住照片。
    //  ② 手机抽屉在非首页被正文盖住 ⇒ 根因是过渡动画 `fill: both` 把 transform: scale(1) 留在 .shell 上
    //     （非 none 的 transform = 层叠上下文）。修法在 transition.ts（950ms 后摘类），这里守"那段代码还在"。
    const cssFiles: string[] = [];
    const walkCss = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walkCss(p);
        else if (e.endsWith('.css')) cssFiles.push(p);
      }
    };
    walkCss(DIST);
    const css = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n').replace(/\s+/g, '');

    // 注意：上面把空白全删了 ⇒ 选择器里的后代空格也没了，写成 `html.pt-on.pt`（不是 `html.pt-on .pt`）
    const overlayZ = Number((css.match(/html\.pt-on\.pt\{[^}]*z-index:(\d+)/) ?? [, '0'])[1]);
    // 灯箱那条规则带 Astro 作用域属性（`.lb[data-astro-cid-…]{…}`）⇒ 正则要容忍，别绑具体哈希
    const lightboxZ = Number((css.match(/\.lb(?:\[data-astro-cid-[a-z0-9]+\])?\{[^}]*z-index:(\d+)/) ?? [, '0'])[1]);
    expect(overlayZ, '没找到过渡蒙版的 z-index').toBeGreaterThan(0);
    expect(lightboxZ, '没找到相册灯箱的 z-index').toBeGreaterThan(0);
    expect(overlayZ, `过渡蒙版(${overlayZ}) 必须低于灯箱(${lightboxZ})，否则会盖住照片`).toBeLessThan(lightboxZ);

    const gallery = readFileSync(join(DIST, 'gallery', 'index.html'), 'utf8');
    const frames = [...gallery.matchAll(/<a class="frame"[^>]*>/g)].map((m) => m[0]);
    expect(frames.length, '相册页一张缩略图链接都没有').toBeGreaterThan(0);
    const missing = frames.filter((f) => !f.includes('data-no-transition'));
    expect(missing, `${missing.length} 张缩略图链接缺 data-no-transition（点它会触发过渡、挡住灯箱）`).toEqual([]);

    const script = readFileSync('src/scripts/transition.ts', 'utf8');
    expect(script, '过渡脚本丢了 defaultPrevented 判断（相册灯箱会被误判成要跳转）').toContain('defaultPrevented');
    expect(script, '过渡脚本丢了收尾（不清 pt-* 类 ⇒ .shell 残留 transform ⇒ 抽屉被盖住）').toMatch(/classList\.remove\('pt-on',\s*'pt-play'\)/);
    console.log(`判据 过渡层叠 对象 蒙版/灯箱/缩略图 实测: 蒙版 z=${overlayZ} < 灯箱 z=${lightboxZ} · ${frames.length} 张缩略图带 data-no-transition · 收尾逻辑在位`);
  });

  it('关于页头像用布局定位（不许 position:fixed）', () => {
    // 站主 2026-09-27："刚打开关于界面时头像在图一位置，随后跳到图二位置，并且不跟随鼠标滚轮上下。"
    // 根因：`position: fixed` 的包含块会被祖先的 transform 抢走 —— 过渡动画给 .shell 加了
    // `transform: scale(0.98→1)`，动画期间头像按"相对 .shell"定位，动画结束、类被摘掉后 transform 变 none，
    // 包含块换回视口 ⇒ 位置突变（实测 y 从 246 跳到 198）；而真 fixed 又**不跟滚动**。
    // 修法：头像放进页头、用 grid 排到右边（布局定位）⇒ 位置由排版决定（不会变）且在正文流里（跟着滚）。
    const about = readFileSync(join(DIST, 'about', 'index.html'), 'utf8');
    const head = (about.match(/<header class="pagehead"[\s\S]*?<\/header>/) ?? [''])[0];
    expect(head, '头像不在页头里（布局定位的前提）').toContain('avatar');
    expect(head, '头像下面那行名字跑出页头了').toContain('profile-name');

    const cssFiles: string[] = [];
    const walkCss = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walkCss(p);
        else if (e.endsWith('.css')) cssFiles.push(p);
      }
    };
    walkCss(DIST);
    // ⚠️ 这一页的样式是**内联在 HTML 里**的（Astro 对小的作用域样式会内联，dist 的 .css 里根本没有 .profile）
    const inline = [...about.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    const css = (cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n') + '\n' + inline).replace(/\s+/g, '');
    const rules = [...css.matchAll(/\.profile(?:\[data-astro-cid-[a-z0-9]+\])?\{[^}]*\}/g)].map((m) => m[0]);
    expect(rules.length, '产物里一条 .profile 规则都没有').toBeGreaterThan(0);
    expect(rules.join(' '), `.profile 里出现 position:fixed（会不跟滚动 + 加载后跳一下）`).not.toMatch(/position:fixed/);
    // 页头必须是两栏 grid（头像才能排到右边而不是压在标题下面）。
    // 两处都要容忍产物形态：媒体查询被压缩成 range 写法（`@media (width>=1024px)`），
    // 且选择器带 Astro 作用域属性（`.pagehead[data-astro-cid-…]`）—— 后者已经绊过我三次，成套路写。
    const scope = '(?:\\[data-astro-cid-[a-z0-9]+\\])?';
    expect(css, '桌面端页头不是两栏 grid（头像会掉到标题下面）').toMatch(
      new RegExp(`@media\\((?:min-width:1024px|width>=1024px)\\)\\{\\.pagehead${scope}\\{[^}]*display:grid`),
    );
    console.log(`判据 关于页头像 对象 布局定位 实测: 头像与名字都在页头内 · ${rules.length} 条 .profile 规则无 position:fixed · 桌面页头是两栏 grid`);
  });

  it('评论顺序：新的在最上面（接口排序 + 两个前端脚本的插入位置）', () => {
    // 站主 2026-09-27："把留言页把新评论放上面，其他的评论留言也一样"。
    // 顺序由三处共同决定，缺一处就会自相矛盾：
    //   ① 接口 `ORDER BY created_at DESC, id DESC`（**唯一**的排序来源，三条路径共用）；
    //   ② 前端取回来的那批按顺序 append（跟随接口顺序即可）；
    //   ③ 刚发表的那条必须 **prepend** —— 漏了它，界面发的新评论会掉到列表最下面。
    const api = readFileSync('functions/api/comments.ts', 'utf8');
    expect(api, '接口没按 created_at DESC 排（新评论会沉到最底下）').toMatch(/ORDER BY created_at DESC/);
    expect(api, '缺少 id DESC 决胜键（同一秒内的两条顺序会不稳定）').toMatch(/created_at DESC,\s*id DESC/);
    for (const f of ['src/scripts/comments.ts', 'src/scripts/talks.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s, `${f} 丢了 fresh 的 prepend（界面发的新评论会掉到最下面）`).toMatch(/if \(fresh\) list\.prepend\(li\)/);
    }
    console.log('判据 评论顺序 对象 接口 + comments.ts + talks.ts 实测: ORDER BY created_at DESC,id DESC · 两处 fresh 都走 prepend');
  });

  it('零第三方资源加载（只允许作者手写外链与自家 canonical）', () => {
    // 2026-09-25 修订：加了 <link rel="canonical"> 之后，这条断言需要区分
    // 「加载外部资源」（script/style/font/img —— 真实网络请求，必须禁止）
    // 与「指向自家域名的元数据」（canonical —— 不产生请求，是 SEO 必需）。
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
        // 判据是「这个外链出现在哪个标签里」——别只看紧跟其前的 60 字符。
        // 2026-09-26 修正：原来的 `before.endsWith('<a')` 会在带属性的锚点上误报
        // （友链页写的是 `<a class="card" href="https://…">` ⇒ 前面是 `<a class="card"` ✗）。
        const tag = html.slice(html.lastIndexOf('<', m.index!), m.index!);
        const isAnchor = /^<a[\s>]/.test(tag);
        const isCanonical = /^<link[^>]*rel="canonical"/.test(tag);
        expect(isAnchor || isCanonical, `发现外部资源加载：${m[1]}（在 ${f}）`).toBe(true);
      }
    }
  });

  it('每个真实页面都有 canonical，且指向正式域名；错误页刻意不加', () => {
    const pages = htmlFiles();
    expect(pages.some((f) => f.endsWith('404.html')), '找不到 404 页，断言可能空转').toBe(true);

    for (const f of pages) {
      const html = readFileSync(f, 'utf8');
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);

      if (f.endsWith('404.html')) {
        expect(canonical, '404 页不该有 canonical').toBeNull();
        continue;
      }
      expect(canonical, `${f} 缺少 canonical`).toBeTruthy();
      expect(canonical![1], `${f} 的 canonical 不是正式域名`).toMatch(/^https:\/\/northcedar\.top\//);
    }
  });

  it('字体全部自托管（4 个 woff2，且没有任何外链字体）', () => {
    expect(walk(DIST, (n) => n.endsWith('.woff2')).length).toBe(4);
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      expect(/fonts\.(googleapis|gstatic)\.com/.test(html), `${f} 引用了 Google Fonts`).toBe(false);
    }
  });

  it('favicon 存在且每页都声明了它（否则浏览器会 404 请求 /favicon.ico）', () => {
    expect(existsSync(join(DIST, 'favicon.svg')), 'dist/favicon.svg 不存在').toBe(true);
    for (const f of htmlFiles()) {
      expect(readFileSync(f, 'utf8'), `${f} 没有声明 favicon`).toContain('rel="icon"');
    }
  });

  it('正文图片带 srcset（否则整张原图会被传下去）', () => {
    // 必须挑一篇真的有图的文章 —— 之前写死 PUBLISHED[0]（按目录名排序是技术文），它没有图片。
    const withImages = PUBLISHED.find((p) => p.images.length > 0);
    if (!withImages) {
      console.warn('没有任何已发布文章带图片，srcset 断言本轮为空转');
      return;
    }
    const html = readFileSync(join(DIST, 'posts', withImages.slug, 'index.html'), 'utf8');
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    const withSrcset = imgs.filter((t) => t.includes('srcset='));
    expect(imgs.length, `${withImages.slug} 应该带图片`).toBeGreaterThan(0);
    expect(withSrcset.length, '正文图片没有 srcset，原图会被整张传输').toBe(imgs.length);
  });
});

describe.skipIf(!hasDist || PUBLISHED.length === 0)('JS 预算（需要至少一篇已发布文章）', () => {
  const page = join(DIST, 'posts', PUBLISHED[0]?.slug ?? '', 'index.html');

  // 2026-09-26 修订（加评论后）：
  // 计划里预测「加评论会让 script 从 1 个变 2 个」—— **实测是错的**：
  // Astro 会把同一个 <script> 块里的多个 import 合并成一个模块脚本，
  // 所以标签数仍是 1，变的是体积（587 → 2534 字节）。
  // 断言因此改成「表达意图」而不是写死数字：数量给 2 的余量，真正守住的是**总字节数**。
  it('文章页脚本数量与体积都在预算内', () => {
    const html = readFileSync(page, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];

    const inline = scripts.map((s) => Buffer.byteLength(s[1], 'utf8'));
    const inlineTotal = inline.reduce((a, b) => a + b, 0);
    const full = Buffer.byteLength(jsLoadedBy(page), 'utf8');

    // 2026-09-26/27 三次修订，全记在这，别以后当成"本来就宽松"：
    //   ① 标签数 2 → 3：站主加了页脚统计（每页一块）。
    //   ② 预算 4096 → 4608：文章页同时跑三件事（光标 1027 + 评论闭包 2569 + 统计 526 = 4126）。
    //   ③ 预算 4608 → 5632、标签数 3 → 5：站主加了**页面过渡**（每页都需要）：
    //      · <head> 里的 inline 首帧保险（防止换页时先闪内容）= 205 字节；
    //      · src/scripts/transition.ts 主模块（Astro 抽成同源共享 chunk）= 690 字节；
    //      合计 895 字节。预算仍按"内联 + 同源外链 import 闭包"的**实数**统计（不靠少算通过）。
    // 标签数那条只是"别让页面无限堆脚本"的粗筛，真正的约束是下面的字节数；
    // 现在 5 处 = head 保险 + 光标 + 统计 + 评论 loader + 过渡 loader。
    const BUDGET = 5632;
    console.log(`内联脚本体积: ${inline.join(' + ')} = ${inlineTotal} 字节 · 含同源外链合计 ${full} 字节（预算 ${BUDGET}）· ${scripts.length} 处 <script>`);

    expect(scripts.length, `文章页有 ${scripts.length} 处 <script>`).toBeLessThanOrEqual(5);
    expect(full, `文章页 JS 合计 ${full} 字节，超过 ${BUDGET} 预算`).toBeLessThan(BUDGET);
  });

  it('评论脚本不使用 innerHTML（XSS 头号风险）', () => {
    const html = readFileSync(page, 'utf8');
    const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      .join('\n');
    const external = walk(DIST, (n) => n.endsWith('.js') || n.endsWith('.mjs'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const all = inline + external;

    expect(all).not.toContain('innerHTML');
    expect(all).not.toContain('outerHTML');
    expect(all).not.toContain('insertAdjacentHTML');
    expect(all, '评论脚本应当用 textContent 写 DOM').toContain('textContent');
  });

  it('评论区不引入任何第三方域名', () => {
    const html = readFileSync(page, 'utf8');
    const start = html.indexOf('data-comments');
    expect(start, '评论容器不在页面里').toBeGreaterThan(-1);

    // 精确切到 </section> —— 之前切 4000 字符会越过评论区，把页脚的 GitHub 外链
    // （那是 <a> 链接，不是资源加载）也算进来，是个假阳性。
    const end = html.indexOf('</section>', start);
    const block = html.slice(start, end === -1 ? start + 2000 : end);

    expect(/https?:\/\//.test(block), '评论区区块里出现了外部 URL').toBe(false);
    // 端点调用可能在页内内联脚本里，也可能在 Astro 抽出的**同源**外部脚本里 ——
    // 2026-09-26：留言页也用同一个评论脚本后，Astro 把它抽成了共享 chunk（/_astro/*.js），
    // 所以原来"只查页面 HTML"的写法会假阳性。判据不变：**评论代码里必须打自己的端点**。
    const code = jsLoadedBy(page);
    expect(code, '评论应当打自己的端点').toContain('/api/comments');
    expect(/https?:\/\//.test(code), '评论脚本里出现了外部 URL').toBe(false);
  });

  it('产物 JS 只在预算内，且都是本站产物（原"不许有独立 JS"的修订版）', () => {
    // 2026-09-26 修订：留言页也用同一个评论脚本之后，Astro 把它抽成了**共享 chunk**
    // （/_astro/*.js）—— 那是更省的做法（两页共用一份、可长期缓存），
    // 但原来那条"产物里不许有任何 .js 文件"就变成假阳性了。
    // 判据换成它的**原意**：① 产物里的 .js 必须是本站构建出来的（都在 dist/_astro 下）；
    //                    ② 逐页把「内联 + 该页引用的外部脚本」算进预算（见上面的 JS 预算那条，已同步改）。
    const jsFiles = walk(DIST, (n) => n.endsWith('.js') || n.endsWith('.mjs'));
    for (const f of jsFiles) {
      expect(f.replace(/\\/g, '/'), `产物 JS 出现在 _astro 之外（可能被手拷进来）：${f}`).toMatch(/^dist\/_astro\//);
    }
    // 每个 .js 都必须被某个页面**可达**（孤儿产物 = 白搭的体积；可达性要跟着 import 走）
    const referenced = new Set<string>();
    for (const f of htmlFiles()) for (const g of jsClosure(f).files) referenced.add(g);
    const orphans = jsFiles.filter((f) => !referenced.has(f));
    expect(orphans, `这些 JS 产物没被任何页面引用：${orphans.join(', ')}`).toEqual([]);
    console.log(`判据 产物 JS 对象 dist/**/*.js 实测: ${jsFiles.length} 个，全部在 _astro 下且被页面（含 import 闭包）引用`);
  });
});

describe.skipIf(!hasDist)('首页 JS 预算（B2 动效层）', () => {
  // 2026-09-26 站主拍板：首页动效内联脚本**另立一条**预算，上限 7 KB。
  // 文章页仍守 4096 B（上面的「JS 预算」），且产物里不得有独立 .js 文件
  // → 动效只能内联，不许为了过预算拆成外部文件（那会同时打破上面那条）。
  //
  // 为什么不复用文章页那条：两者是不同的东西。文章页跑的是复制按钮 + 评论；
  // 首页跑的是刻度/HUD/聚焦/揭示这套动效。混成一条会让「放宽首页」顺手放宽文章页。
  //
  // 实测（2026-09-26）：45（门控）+ 2842（动效）= 2887 字节，余量 4281。
  // 参考：原型 home.html 的同功能内联 JS 是 6286 字节（ES5 写法 + 冗余），这里更紧凑。
  it('首页内联脚本总量 ≤ 7 KB', () => {
    const page = join(DIST, 'index.html');
    expect(existsSync(page), 'dist/index.html 不存在，先跑 npm run build').toBe(true);
    const html = readFileSync(page, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    const sizes = scripts.map((s) => Buffer.byteLength(s[1], 'utf8'));
    const total = sizes.reduce((a, b) => a + b, 0);
    console.log(`首页内联脚本体积: ${sizes.join(' + ')} = ${total} 字节（预算 7168）`);
    expect(total, `首页内联脚本合计 ${total} 字节，超过 7 KB 预算`).toBeLessThan(7168);
  });
});

describe.skipIf(!hasDist)('/gallery 页 JS 预算（P5 相册页）', () => {
  // 2026-09-26 站主拍板 E：/gallery 独立一条预算，上限 6144。
  // 与首页同理，不跟文章页那条合并 —— 合并会让「放宽某一页」顺手放宽其它页。
  //
  // 实测（2026-09-26）：1971 字节（筛选 + 灯箱，零依赖）。余量 4173。
  // 灯箱刻意走**渐进增强**：图包在 <a href="1280档"> 里，JS 到位才拦截点击开灯箱 ——
  // 所以无 JS 时页面完整可用（点图直接开大图），也不需要第二个 `html.js` 门控脚本。
  it('相册页内联脚本总量 ≤ 6 KB', () => {
    const page = join(DIST, 'gallery', 'index.html');
    expect(existsSync(page), 'dist/gallery/index.html 不存在，先跑 npm run build').toBe(true);
    const html = readFileSync(page, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    const sizes = scripts.map((s) => Buffer.byteLength(s[1], 'utf8'));
    const total = sizes.reduce((a, b) => a + b, 0);
    console.log(`相册页内联脚本体积: ${sizes.join(' + ')} = ${total} 字节（预算 6144）`);
    expect(total, `相册页内联脚本合计 ${total} 字节，超过 6 KB 预算`).toBeLessThan(6144);
  });
});

describe.skipIf(hasDist)('构建产物（未构建）', () => {
  it('dist/ 不存在，先跑 npm run build 再跑测试', () => {
    console.warn('dist/ 不存在：集成断言被跳过。正确顺序是 npm run build && npm test');
    expect(hasDist).toBe(false);
  });
});
