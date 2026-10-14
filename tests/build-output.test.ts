import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

/** dist 下全部 CSS 拼成一个字符串（多处断言都要用；名前加 dist 以免和各用例里的局部 cssFiles 混淆） */
const allDistCss = () =>
  (hasDist ? walk(DIST, (n) => n.endsWith('.css')) : []).map((f) => readFileSync(f, 'utf8')).join('\n');

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
    // 2026-09-30 扩展：原来只认 `import"...js"` / `from"...js"` 这一种写法。
    // 首页 DNA 用了**动态 import**（three 只在真要画的时候才下载），
    // 而 Vite 对动态 import 的输出是 import(`./three.xxx.js`) —— **反引号**，
    // 老正则一个都匹配不到 ⇒ three 与 GLTFLoader 两个 chunk 会被误判成「没页面引用的孤儿」。
    // 现在三种引号（" ' `）与静态/动态两种写法都覆盖。
    for (const m of code.matchAll(/(?:import|from)\s*\(?\s*(["'`])([^"'`]+?\.js)\1/g)) load(m[2]);
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

  it('所有图片的 alt 都非空（装饰性图例外，但必须严格豁免）', () => {
    /*★ 2026-10-03 补一条豁免：关于页底纹层是**装饰性**图（`aria-hidden="true"` 容器内），
       按无障碍惯例它们的alt 必须是空串 —— 写上内容反而会让屏幕阅读器把
       「月相序列环」这类纯装饰念出来。但「所有 alt 非空」这条判据的本意是
       「**有信息的**图不许漏alt」⇒ 严格限定：只有**位于 aria-hidden 容器内**的空 alt 才豁免。
       判据不许放宽成「空 alt 都行」—— 那等于把这条断言作废。
       （起因：2026-10-03 接入参考图底纹时本条恒红，见 tests/about-ref-plate.test.ts。） */
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      /* 找出所有 aria-hidden="true" 容器的**配对区间**。
         ⚠ 不能用 `indexOf('</div>', start)` —— 那会撞上**嵌套**子元素的第一个闭合
         （实测：ref-plate 里有 .ref > picture，区间被截在 3460，后面的图就落在区间外）。
         ⇒ 必须做**嵌套计数**：从开标签起，每遇一个同名开标签 +1、每遇闭合 -1，回到 0 即配对。 */
      const hiddenSpans: [number, number][] = [];
      for (const m of html.matchAll(/<([a-z]+)\b[^>]*aria-hidden="true"[^>]*>/g)) {
        const tag = m[1];
        const start = m.index!;
        const openRe = new RegExp(`<${tag}\\b`, 'g');
        const closeRe = new RegExp(`</${tag}>`, 'g');
        let pos = start;
        let depth = 0;
        let end = html.length;
        while (pos < html.length) {
          openRe.lastIndex = pos;
          closeRe.lastIndex = pos;
          const o = openRe.exec(html);
          const c = closeRe.exec(html);
          if (!c) break;
          if (o && o.index < c.index) { depth++; pos = o.index + 1; }
          else {
            depth--;
            pos = c.index + c[0].length;
            if (depth === 0) { end = pos; break; }
          }
        }
        hiddenSpans.push([start, end]);
      }
      const inHidden = (pos: number) => hiddenSpans.some(([a, b]) => pos >= a && pos <= b);

      for (const m of html.matchAll(/<img\b[^>]*>/g)) {
        const tag = m[0];
        /* alt 有两种形态：alt="文字"（有内容）与 **裸 alt**（空字符串）。
           ★ Astro 对空 alt 的输出是**裸属性**（实测产物：`<img ... alt sizes="...">`），
           而 HTML 规范里裸属性等价于 alt="" —— 即「装饰性图，正确写法」。
           所以判据不能只认 alt="..."，否则会把正确的写法当成「完全没有 alt」而恒红。
           两种都接受，但**空 alt 仍要过下面那道 aria-hidden 关卡**。 */
        const quoted = tag.match(/alt="([^"]*)"/);
        const bare = /(?:\s|^)alt(?=[\s=]|$)/.test(tag);
        expect(quoted || bare, `${f} 里有 img 完全没有 alt 属性：${tag.slice(0, 120)}`).toBeTruthy();
        if (quoted && quoted[1].trim().length > 0) continue;
        expect(
          inHidden(m.index!),
          `${f} 里有 img 的 alt 是空的，且它不在任何 aria-hidden="true" 容器内 —— ` +
            `要么给它写 alt，要么把它移进装饰层（aria-hidden + 空 alt）`,
        ).toBe(true);
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

  it('首页百褶 ∞ 底纹：只在首页、是装饰、不拦交互，资源在位', () => {
    // ★ 2026-09-30 换判据对象（站主拍板「彻底删掉磁带图」）。
    //   原来守的是 `art/cassette.webp`（磁带渲染图）—— 首页改成原型 v10.6 视觉后
    //   那张图连同生成器 scripts/gen-home-art.mjs 一起删了（原型首屏的背景语言是
    //   深墨绿场 + 流场线 + DNA + 玻璃卡，没有磁带的位置）。
    //   新对象 = 原型 v10.6 的百褶 ∞ 底纹 `art/inf-orig.webp`。
    //   **判据本身一条没降**：① 资源在产物里；② 是装饰（aria-hidden + pointer-events:none）；
    //   ③ 只挂首页；④ 不拦交互。
    //   （「窄屏隐藏」这条**特意不搬**：∞ 底纹是 position:fixed 挂在视口中央的，
    //     窄屏也要有 —— 原型实测 390px 下它是首屏唯一的大尺度纹理，藏了就空了。）
    const art = join(DIST, 'art', 'inf-orig.webp');
    expect(existsSync(art), 'dist/art/inf-orig.webp 不在产物里').toBe(true);
    const artBuf = readFileSync(art);
    expect(artBuf.length, `inf-orig.webp 只有 ${artBuf.length} 字节`).toBeGreaterThan(10 * 1024);
    // WebP 头：RIFF....WEBP
    expect(artBuf.subarray(0, 4).toString('latin1'), 'inf-orig.webp 不是 WebP').toBe('RIFF');
    expect(artBuf.subarray(8, 12).toString('latin1'), 'inf-orig.webp 不是 WebP').toBe('WEBP');

    const home = readFileSync(join(DIST, 'index.html'), 'utf8');
    // 用 CSS 背景而不是 <img>：装饰图不该给"所有图片 alt 非空"那条硬约束开口子。
    expect(home, '首页没有百褶 ∞ 装饰层').toMatch(/<div class="paper-inf"[^>]*aria-hidden="true"[^>]*>/);

    const all = allDistCss();
    expect(all, '.paper-inf 没走装饰层约定（pointer-events:none）').toMatch(
      /\.paper-inf[^{}]*\{[^}]*pointer-events:\s*none[^}]*\}/,
    );
    expect(all, '.paper-inf 没把底纹作为背景接上').toMatch(/\.paper-inf[^{}]*\{[^}]*background:[^;}]*\/art\/inf-orig\.webp/);
    // ★★ 2026-09-30 第五轮补的**关键一条**：上面所有断言查的都是 `dist/art/`，
    //    而 dist 是 `npm run build` 从 public/ 拷出来的 —— **本地永远有，线上不一定有**。
    //    这一条才是真正止血的：`.gitignore` 里 `public/art/*` 会把整个目录忽略掉，
    //    必须有逐条 `!` 例外才进得了 git。上一轮漏了 inf-orig.webp ⇒ 它从没进过仓库
    //    ⇒ Cloudflare 构建产物里没有它 ⇒ 线上 404、∞ 全站不可见，
    //    而本地每一轮核对都"看得见"它（含当时这条断言也在过）。事故经过见 docs/rhinelab-spec.md §6.8。
    const ignore = readFileSync('.gitignore', 'utf8');
    for (const f of ['inf-orig.webp', 'inf-mask.png', 'inf-mask-edge.png']) {
      expect(ignore, `.gitignore 没有放行 public/art/${f} ⇒ 它进不了 git（本地有、线上 404）`).toContain(`!public/art/${f}`);
    }
    expect(all, '产物 CSS 里还有磁带图残留').not.toContain('cassette.webp');
    expect(existsSync(join(DIST, 'art', 'cassette.webp')), 'dist/art/cassette.webp 还在产物里').toBe(false);

    // ★ 2026-09-30 改判据：「只在首页」→「首页 + 内页共用，且不漏到别处」。
    //   站主拍板「内页套原型正文区语言」后，∞ 底纹成了**全站纸白区的共同语言**：
    //   首页是 .paper-inf，内页外壳（chrome='page'）是 .page-inf —— 同一张素材、同一套参数。
    //   守的东西反而更严了：所有页面都该引到它（23 页里没有"漏网"的），
    //   而不是"只有 1 页引到"。
    const pages = htmlFiles();
    const missingInf = pages.filter((f) => {
      const html = readFileSync(f, 'utf8');
      const hrefs = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
      return !hrefs.some((h) => readFileSync(join(DIST, h.replace(/^\//, '')), 'utf8').includes('inf-orig.webp'));
    });
    expect(missingInf, `这些页面没引到 ∞ 底纹所在的 CSS（纸白区语言没统一）：${missingInf.join(', ')}`).toEqual([]);
    // 两种挂法各司其职：首页 .paper-inf（在正文流里）、内页 .page-inf（外壳提供）
    // 注意：内页外壳那段是 `<style is:global>` ⇒ 产物里**没有** Astro 作用域属性，
    // 选择器就是纯 `body.chrome-page .page-inf`（不是 body.chrome-page.page-inf）。
    expect(allDistCss(), '内页外壳缺 .page-inf 的 ∞ 底纹').toMatch(
      /body\.chrome-page\s+\.page-inf\{[^}]*\/art\/inf-orig\.webp/,
    );
    console.log(`判据 百褶∞底纹 对象 产物资源 + 装饰属性 + 全站共用（首页 .paper-inf / 内页 .page-inf）实测: ${(artBuf.length / 1024).toFixed(1)} KB · ${pages.length} 页全部引到`);
  });

  it('悬停玻璃层：半透明 + 模糊，不再用不透明纸底', () => {
    // ★ 2026-09-30 二次换对象（站主拍板「主页就用原型」）。
    //   对象履历：`.band-readout`（外壳读数条）→ `.section-head`（原型 v10.6 标题玻璃条）
    //   → `.entry a::before`（文章条目悬停玻璃层，本次）。
    //   为什么第三次换：原型的 .section-head **本来就没有玻璃条** —— 它是纯 flex 标题行，
    //   那条玻璃底是本站 console 时代的残留，已经在换原型时整块删掉。
    //   而此刻首页**唯一**还压在内容上的玻璃层，就是条目悬停时浮起的那层
    //   （z-index:-1 ⇒ 它在文字之下、页面底色之上，正是这条判据本来要守的那一类物件）。
    //
    //   **判据一条没降**：① 底色半透明；② backdrop-filter 在；③ 前缀与标准两条都在。
    //   只是不再依赖「字面量里恰好写着 transparent」这种巧合 ——
    //   这次底色是 var(--glass-bg) 这样的 token 引用，必须解析：
    //   直接从 tokens.css 把 token 的值算出来再看 alpha。
    //   这比原判据更严：原来只认内联字面色，写在 token 里的不透明底色会被漏过去。
    const all = allDistCss();
    const rules = [...all.matchAll(/\.entry[^{}]*a[^{}]*:before\{[^}]*\}/g)].map((m) => m[0]);
    const rule = rules.find((r) => r.includes('background:')) ?? '';
    expect(rule, '产物里找不到 .entry a::before 这条悬停玻璃层规则').not.toBe('');
    expect(rule, '.entry a::before 缺 backdrop-filter（毛玻璃）').toContain('backdrop-filter');
    // ★ 标准属性必须**两条都在**（前缀在前、标准在后）。
    //   踩过一次：esbuild 按 cssTarget 做前缀降级，把标准那条删了，整站只剩 -webkit-。
    expect(rule, '.entry a::before 只剩 -webkit- 前缀，标准 backdrop-filter 被构建删掉了').toContain('-webkit-backdrop-filter');

    const bg = (rule.match(/background:([^;}]+)/) ?? ['', ''])[1].trim();
    // token 回溯：background 写的是 var(--glass-bg) 这样的引用，得去 tokens.css 取真值
    const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');
    let resolved = bg;
    for (let i = 0; i < 4 && /var\(/.test(resolved); i++) {
      resolved = resolved.replace(/var\(\s*(--[\w-]+)\s*\)/g, (whole, name) => {
        const m = tokensCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
        return m ? m[1].trim() : whole;
      });
    }
    // 半透明判定：渐变里含 transparent，或 rgba(...,<1)，或 8 位 hex 且 alpha 不是 ff
    const hex8 = resolved.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/);
    const rgba = resolved.match(/rgba?\([^)]*,\s*(0?\.\d+|0|1)\)/);
    const translucent =
      /transparent/.test(resolved) || (hex8 && hex8[2] !== 'ff') || (rgba && Number(rgba[1]) < 1);
    expect(
      translucent,
      `.entry a::before 的底色不是半透明（background:${bg} → 解析 ${resolved}）`
    ).toBe(true);
    console.log(`判据 悬停玻璃层 对象 .entry a::before 实测: background:${bg} → ${resolved} 半透明 · 前缀/标准 backdrop-filter 两条都在`);
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
    for (const f of srcFiles) {
      const text = stripComments(readFileSync(f, 'utf8'));
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

    /* ⑥ ★ 2026-10-01 补：上面那条只要求「某处隐藏」，是**弱判据** —— 站主截图报家门口
       那排横排导航在手机上没被藏起来，而这条断言一直绿着，根因就在这：
       首页的 CSS 是**独立分片**（`index.*.css`），Base 分片里 Topbar / Brandline 那两条
       1023px 规则早就让 `windows.some()` 成立了，首页自己那份写没写它根本管不到。
       ⇒ 改成**认页面自己的分片**：从首页 HTML 解析出它引用的 CSS，只取 `index.*.css`
         （不能连 Base 一起读，否则又会被别的页面的规则兜过去）。 */
    const homeHtml = readFileSync(join(DIST, 'index.html'), 'utf8');
    const homeCssHrefs = [
      ...new Set([...homeHtml.matchAll(/_astro\/([A-Za-z0-9_.-]+\.css)/g)].map((m) => m[1])),
    ];
    const homeOwn = homeCssHrefs.filter((f) => f.startsWith('index.'));
    expect(homeOwn.length, '首页没有自己的 CSS 分片（index.*.css）—— 检查产物结构').toBeGreaterThan(0);
    const homeCss = homeOwn
      .map((f) => readFileSync(join(DIST, '_astro', f), 'utf8'))
      .join('\n')
      .replace(/\s+/g, '');
    const homeWindows = [...homeCss.matchAll(/1023px/g)].map((m) => homeCss.slice(m.index!, m.index! + 400));
    console.log(
      `判据 导航 对象 首页自己的 CSS 分片 实测: ${homeOwn.join(', ')} · 1023px 断点 ${homeWindows.length} 处`,
    );
    expect(homeWindows.length, '首页自己的 CSS 里没有 1023px 断点').toBeGreaterThan(0);
    expect(
      homeWindows.some((w) => /nav[^{}]*\{display:none\}/.test(w)),
      '首页 ≤1023px 没隐藏横排导航 —— 手机上会同时出现「一排胶囊 + 抽屉汉堡」',
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

  it('说说按日期倒序：新的在最上面', () => {
    // 站主 2026-09-28："说说里面内容改为新发表的在上，后发的在下"。
    // 事故：YAML 把未加引号的 `date: 2026-09-26` 解析成 Date，排序却比 `String(date)` ——
    // 那个字符串以**星期名**开头（"Sat Sep 26…" / "Mon Sep 28…"），"Sat" > "Mon"
    // ⇒ 09-26 被排到 09-28 前面，旧的在最上面。判据必须走归一后的 ISO 日期。
    // 为什么守在产物里：Cloudflare 只跑构建不跑测试 ⇒ 只有这条断言能挡住它静默上线。
    const talks = readFileSync(join(DIST, 'talks', 'index.html'), 'utf8');
    const dates = [...talks.matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
    expect(dates.length, '说说页没有取到时间（选择器可能变了）').toBeGreaterThan(0);
    const sortedDesc = [...dates].sort().reverse(); // ISO 日期可直接字典序比较
    expect(dates, '说说不是按日期倒序（新的应在最上面）').toEqual(sortedDesc);
    console.log(`判据 说说顺序 对象 dist/talks/index.html 实测: ${dates.join(' → ')}`);
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

    // 页脚统计：除首页与 404 外的每个页面都要有。
    // ★ 2026-10-02 第七轮，站主原话「把主页下面这一栏删了」（截图里那栏就是它）⇒
    //   首页（dist/index.html）**刻意不再有**页脚统计，必须从这条判据里排除。
    //   内页那一条（SiteFooter）是站主 2026-09-26「在每页最底部加上」要的，仍然守。
    // ★★ 2026-10-07 判据从 `data-since` 换成 `data-stats` —— 这是**换得更准，不是放宽**：
    //   `data-since` 只是 SiteStats 的一个**参数**，却被借来当"这个组件在不在"的代理，
    //   于是任何别处用到 `data-since` 都会在这里误伤。本轮真撞上了：首屏新增的「时间切片」
    //   要带一个 since（站龄起点），属性名写成 `data-since` 就被这条拦下 ——
    //   拦得**对**（名字确实借错了），但判据本身选错了代理。
    //   `data-stats` 是 SiteStats 容器**自己的**标记（`<div class="stats" data-stats …>`），
    //   它表达的正是这条断言要问的那件事。意图（内页有 / 首页没有）一个字没改。
    const HOME = `${DIST}/index.html`; // 只排除主页这一个（内页也各有 index.html，别误伤）
    const pages = htmlFiles().filter((f) => !f.endsWith('404.html') && f.replace(/\\/g, '/') !== HOME);
    const missing = pages.filter((f) => !readFileSync(f, 'utf8').includes('data-stats'));
    expect(missing, `这些页面没有页脚统计：${missing.slice(0, 6).join(', ')}`).toEqual([]);
    const home = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(home, '站主第七轮要求删掉主页底部那一栏 ⇒ 首页不该再有页脚统计').not.toContain('data-stats');
    expect(home, '站主第七轮要求删掉主页底部那一栏 ⇒ 首页不该再有 .foot 版式').not.toContain('class="foot');
    // 起点日期来自内容层，不是写死在组件里
    const siteMd = readFileSync('content/site.md', 'utf8');
    expect(siteMd, 'content/site.md 里没有 since（页脚运行时长没有起点）').toMatch(/^since:\s*\d{4}-\d{2}-\d{2}\s*$/m);
    console.log(`判据 说说互动 + 页脚统计 对象 产物挂点 实测: ${likes.length} 条带赞/评论 · ${pages.length} 页有统计 · since 在内容层`);
  });

  it('说说：评论数在点开之前就显示（2026-09-28 站主报的 bug 的护栏）', () => {
    // 事故经过（站主报的）：评论数原本只在 load() 里写，而 load() 只挂在「评论」按钮的 click 上
    // ⇒ **不点按钮就永远是空的数字**。
    // 修法：进页面时用 `/api/comments?slugs=…` 批量问一次（一个请求取齐整页，照 /api/likes 的样子）。
    // 这条守的是"批量取数必须落在**按钮回调之外**"——挪回去就是原 bug 复活。
    const ts = readFileSync('src/scripts/talks.ts', 'utf8');
    const api = readFileSync('functions/api/comments.ts', 'utf8');

    // 注意要匹配到**评论**这一处：点赞也有一个 `?slugs=`（/api/likes?slugs=），别串台
    const batch = ts.indexOf('/api/comments?slugs=');
    expect(batch, '说说脚本没有批量取评论数（应为 /api/comments?slugs=）').toBeGreaterThan(-1);

    const clickAt = ts.indexOf("toggle?.addEventListener('click'");
    expect(clickAt, '找不到「评论」按钮的点击事件').toBeGreaterThan(-1);
    // 该回调的结束位置：从 clickAt 之后的第一个 '{' 起做花括号配对
    let depth = 0;
    let end = -1;
    for (let i = ts.indexOf('{', clickAt); i < ts.length; i++) {
      if (ts[i] === '{') depth++;
      else if (ts[i] === '}' && --depth === 0) {
        end = i;
        break;
      }
    }
    expect(end, '「评论」按钮的回调没闭合（选择器可能变了）').toBeGreaterThan(clickAt);
    expect(batch, '批量取数被挪回「评论」按钮回调里了 ⇒ 又变成不点不显示').toBeGreaterThan(end);

    // 口径必须是**含回复**：后端两表一起数，否则按钮上的数字会比展开后的行数少
    expect(api, '批量口径丢了 replies 表（应 UNION ALL 两张表）').toMatch(/UNION ALL/);
    expect(api, '后端没有处理 ?slugs= 批量形态').toMatch(/has\('slugs'\)/);
    const line = ts.slice(0, batch).split('\n').length;
    console.log(
      `判据 评论数 对象 src/scripts/talks.ts:${line} + functions/api/comments.ts 实测: 批量取数在按钮回调之外（offset ${batch} > ${end}）· 后端 UNION ALL 两表合计`
    );
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

    /* ★ 2026-10-07：缩略图链接（`.frame`）随砖墙搬到了**每册一页** `/gallery/<册名>/` ——
       `/gallery` 现在是**入口页**，它上面一张 `.frame` 都没有（入口条用的是 `.ar-frame`）。
       ⇒ 逐册把链接收齐再查。判据的语义没变：**凡是被灯箱接管的缩略图，必须放行页面过渡**。 */
    const albumDirs = readdirSync(join(DIST, 'gallery'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'spiral')
      .map((e) => e.name);
    expect(albumDirs.length, '一个相册页都没生成（/gallery/<册名>/）').toBeGreaterThan(0);
    const frames = albumDirs.flatMap((d) => {
      const p = join(DIST, 'gallery', d, 'index.html');
      return existsSync(p) ? [...readFileSync(p, 'utf8').matchAll(/<a class="frame"[^>]*>/g)].map((m) => m[0]) : [];
    });
    expect(frames.length, '相册页一张缩略图链接都没有').toBeGreaterThan(0);
    const missing = frames.filter((f) => !f.includes('data-no-transition'));
    expect(missing, `${missing.length} 张缩略图链接缺 data-no-transition（点它会触发过渡、挡住灯箱）`).toEqual([]);

    const script = readFileSync('src/scripts/transition.ts', 'utf8');
    expect(script, '过渡脚本丢了 defaultPrevented 判断（相册灯箱会被误判成要跳转）').toContain('defaultPrevented');
    expect(script, '过渡脚本丢了收尾（不清 pt-* 类 ⇒ 内容块会残留 transform）').toMatch(/classList\.remove\('pt-on',\s*'pt-play'\)/);

    // ---- ★ 2026-09-30 换成 v3（原型 v10.6 墨色浸染，900ms）----
    //   上一版 v2（2200ms 四段：无菌纸柔雾 / 坐标锁定 / 无菌舱门 / 内容落地）整体作废 ——
    //   站主拍板「页与页的过渡动画也换」。下面这批断言跟着换对象，
    //   **守的能力没降**：时间线可读性、三个元素齐备、首帧不闪、reduced-motion 兜底、
    //   以及原 v2 那两条真 bug 的**等价回归网**（见最后两条）。
    // ⚠️ 先剥注释再压空白：本文件里就有一段注释在解释"为什么不能自引用"、
    //   字面出现了 `--pt-sweep: var(--pt-sweep, …)` —— 不剥注释的话下面那条
    //   "不许自引用"的断言会被自己脚下的注释引爆（假阳性）。
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
    const tcss = strip(readFileSync('src/styles/transition.css', 'utf8'));
    const tokens = strip(readFileSync('src/styles/tokens.css', 'utf8'));
    // 总时长 900ms 声明在 tokens.css 的 :root 上（= html，全页可读）。
    // ⚠️ 不能只挂在 `.pt` 上：要动画的 `.shell` 不在 `.pt` 子树里 ⇒ 变量解析为空 ⇒
    //    整条 animation 简写被判无效而丢弃 ⇒ 内容后退静默失效（v2 实测踩过，原理不变）。
    expect(tokens, '--pt-sweep 不在 :root 上（放 .pt 里的话 .shell 解析不到，内容后退会静默失效）').toMatch(
      /:root\{[^}]*--pt-sweep:900ms/,
    );
    // 曾经写成 `--pt-sweep: var(--pt-sweep, 900ms)` 想做回退 —— 那是**自引用**，
    // 自定义属性引用自己构成循环、计算值阶段判无效 ⇒ 整个变量直接失效。这条守它别再回来。
    expect(tcss, '--pt-sweep 出现了自引用（自定义属性引用自己 = 循环 = 直接失效）').not.toMatch(
      /--pt-sweep:\s*var\(--pt-sweep/,
    );
    // 三个元素 + 一层内容后退，一个都不能少
    for (const [name, sel] of [
      ['墨色浸染层', /\.pt-ink\{/],
      ['描边关键词', /\.pt-word\{/],
      ['读数线', /\.pt-scan\{/],
      ['内容后退', /html\.pt-play\.shell\{animation:pt-shell/],
    ] as const) {
      expect(tcss, `v3 过渡缺 ${name}`).toMatch(sel);
    }
    // 灵魂：墨色层必须用 darken 混色（内容是被"浸染"而不是被"盖住"）
    expect(tcss, '墨色层丢了 mix-blend-mode:darken —— 那就退化成"盖一块板"了').toMatch(
      /\.pt-ink\{[^}]*mix-blend-mode:darken/,
    );
    // 墨色层的底色与前景字色来自 token（不写死 #0b1a14）
    expect(tcss, '墨色层底色没走 token').toMatch(/\.pt-ink\{[^}]*background:var\(--ink-deep\)/);
    expect(tcss, '描边字颜色没走 token').toMatch(/\.pt-word\{[^}]*text-stroke:1\.3pxvar\(--on-ink\)/);
    // reduce-motion 必须整套关掉（含蒙版本身）
    expect(tcss, 'reduced-motion 下没关掉 v3 的三个元素 / 内容后退').toMatch(
      /prefers-reduced-motion[^@]*\.pt-ink[^}]*animation:none!important/,
    );
    // 原 v2 那两条「实测定格图抓出来的真 bug」的等价回归网：
    //   ① 首帧不许闪 —— 墨色层与描边字的**初始状态必须是静态声明**（不是靠动画先跑一遍）
    expect(tcss, '墨色层的初始位移不是静态声明（首帧就会闪一下）').toMatch(/\.pt-ink\{[^}]*transform:translate3d\(-101%/);
    expect(tcss, '描边字的初始 opacity 不是静态 0（首帧就会露出来）').toMatch(/\.pt-word\{[^}]*opacity:0/);
    //   ② 收尾必须能被 JS 摘干净 —— 内容后退的末帧回到 none，否则 .shell 会残留 transform
    //      （residual transform 会造出层叠上下文，把抽屉/头像定位顶掉；完整回归见下一条用例）
    expect(tcss, 'pt-shell 末帧没回到 none ⇒ .shell 会残留 transform').toMatch(/@keyframespt-shell\{[\s\S]*100%\{opacity:1;filter:none;transform:none/);
    console.log(`判据 过渡 v3 对象 时长/三元素/darken/首帧/reduced-motion 实测: --pt-sweep:900ms 挂 :root · 无自引用 · .pt-ink+.pt-word+.pt-scan+pt-shell · darken · 初始静态声明`);
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
    // ★ 2026-10-03 修订：原来要求「`display:grid` 必须写在
    //   `@media (min-width:1024px)` 里」，那是**绑死形态**—— 本轮把
    //   `display:grid` 提到了外层（`.pagehead` 基线），
    //   窄屏再由媒体查询收窄，头像在宽屏照样靠右、行为完全没变。
    //   ⇒ 改为守**意图**：`.pagehead` 的规则里必须有 `display:grid`
    //     +两列轨道（`grid-template-columns` 带 `auto`），
    //     不再要求它必须被包在某个媒体查询里。
    //   另：判据要区分「桌面要两栏」与「窄屏别挤」—— 只看有没有两列轨道。
    const scope = '(?:\\[data-astro-cid-[a-z0-9]+\\])?';
    const headRules = [...css.matchAll(new RegExp(`\\.pagehead${scope}\\{[^}]*\\}`, 'g'))].map((m) => m[0]);
    expect(headRules.length, '产物里一条 .pagehead 规则都没有').toBeGreaterThan(0);
    const hasTwoCol = headRules.some(
      (r) => /display:grid/.test(r) && /grid-template-columns:[^;}]*auto/.test(r),
    );
    expect(hasTwoCol, `页头没有两栏 grid（头像会掉到标题下面）。现有规则：${headRules.join(' | ').slice(0, 300)}`).toBe(true);
    console.log(`判据 关于页头像 对象 布局定位 实测: 头像与名字都在页头内 · ${rules.length} 条 .profile 规则无 position:fixed · 页头两栏 grid（${headRules.length} 条规则中命中）`);
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

  it('回复：接口按 created_at ASC 取回复，前端提交带 parentId（两层、回复旧的在上）', () => {
    // 2026-09-28 站主要求：说说 / 留言 / 文章评论都能回复（像 QQ 动态的评论区）。
    // 这里守的是"三条路径不能各写一套"的那几条硬规则：
    //   ① 回复顺序由接口**唯一**决定（旧的在上，站主拍板 —— 与顶层评论的 DESC 相反）；
    //   ② 回复必须校验父评论存在且**同 slug**（否则能往任意 id / 别的页面塞回复）；
    //   ③ 两个前端脚本提交时都要带 parentId，否则回复会被当成顶层评论存下来。
    const api = readFileSync('functions/api/comments.ts', 'utf8');
    expect(api, '接口没查 replies 表').toMatch(/FROM replies/);
    expect(api, '回复不是按 created_at ASC（站主拍板：对话要顺着读，旧的在上）').toMatch(
      /ORDER BY created_at ASC, id ASC/
    );
    expect(api, '回复没校验父评论存在且同 slug（可以往任意 id / 别的页面塞回复）').toMatch(
      /id = \? AND slug = \?/
    );
    for (const f of ['src/scripts/comments.ts', 'src/scripts/talks.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s, `${f} 提交时没带 parentId（回复会被存成顶层评论）`).toMatch(/parentId/);
    }
    console.log('判据 回复 对象 functions/api/comments.ts + comments.ts + talks.ts 实测: replies 表 ASC · 父评论同 slug 校验 · 两处都带 parentId');
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

  /* ★ 2026-10-01 起是 **5 个**：多出来的 homemade-apple.woff2 是相册页整屏显影板上
     那行手写花体用的（站主要"参考站同款字体" ⇒ Homemade Apple，OFL ⇒ 允许自托管）。
     ★★ 钉**文件名**而不是只钉个数：只钉个数的话，删掉一个再多加一个也照样过。 */
  it('字体全部自托管（5 个 woff2，且没有任何外链字体）', () => {
    const fonts = walk(DIST, (n) => n.endsWith('.woff2')).map((p) => p.split(/[\\/]/).pop());
    expect(fonts.length).toBe(5);
    for (const want of [
      'archivo-latin.woff2',
      'plex-sans-400.woff2',
      'plex-sans-600.woff2',
      'plex-mono-400.woff2',
      'homemade-apple.woff2',
    ]) {
      expect(fonts.includes(want), `缺字体 ${want}`).toBe(true);
    }
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      expect(/fonts\.(googleapis|gstatic)\.com/.test(html), `${f} 引用了 Google Fonts`).toBe(false);
    }
  });

  it('favicon 存在且每页都声明了它（否则浏览器会 404 请求 /favicon.ico）', () => {
    expect(existsSync(join(DIST, 'favicon.svg')), 'dist/favicon.svg 不存在').toBe(true);
    // 浏览器即使只看到 rel="icon" 指到 .svg，仍会去请求 /favicon.ico —— 少了就是一条 404
    // （历史上正是它把 Lighthouse 最佳实践从 100 拉到 96），所以两个都要在产物里。
    expect(existsSync(join(DIST, 'favicon.ico')), 'dist/favicon.ico 不存在').toBe(true);
    for (const f of htmlFiles()) {
      expect(readFileSync(f, 'utf8'), `${f} 没有声明 favicon`).toContain('rel="icon"');
    }
  });

  it('favicon 的 ∞ 取自站点标志（与 BootIntro 的 MARK 一字不差），.ico 是它的 16/32/48 光栅化', async () => {
    // ★ 判据为什么是「路径一字不差」而不是「看起来像个 ∞」：站上只有一份 ∞ 的权威定义
    //   （BootIntro.astro 的 MARK，开场动画那笔）。换 favicon 时另画一条贝塞尔也能骗过肉眼，
    //   但从此站上就有两个 ∞，下次改标志必然漏掉一个。
    const svg = readFileSync('public/favicon.svg', 'utf8');
    const markMatch = readFileSync('src/components/BootIntro.astro', 'utf8').match(/const MARK = '([^']+)'/);
    expect(markMatch, '读不到 BootIntro 的 MARK').not.toBeNull();
    expect(svg, 'favicon 里的 ∞ 不是站点标志那条路径（同源断了）').toContain(markMatch![1]);

    // 墨绿底 + 白 ∞
    expect(svg, '底色不是墨绿').toMatch(/<rect[^>]*fill="#17402A"/i);
    expect(svg, '∞ 不是白色').toMatch(/stroke="#FFFFFF"/i);

    // ★★ 光栅化实测：XML 不良构（例如注释里出现连续两个短横线）会让整个文件解析失败、
    //    图标直接不显示，而上面那些字符串断言**照样全绿** —— 只有真渲染一次才拦得住。
    const sharp = (await import('sharp')).default;
    const px16 = await sharp(Buffer.from(svg)).resize(16, 16).png().toBuffer();
    expect(px16.length, 'favicon.svg 渲染不出 16px 位图').toBeGreaterThan(0);

    // .ico：三档，且每档内嵌 PNG 的真尺寸必须与 ICO 目录里声明的一致
    const ico = readFileSync('public/favicon.ico');
    const count = ico.readUInt16LE(4);
    const declared: number[] = [];
    for (let i = 0; i < count; i++) {
      const o = 6 + i * 16;
      const w = ico.readUInt8(o) || 256;
      const h = ico.readUInt8(o + 1) || 256;
      declared.push(w);
      const size = ico.readUInt32LE(o + 8);
      const off = ico.readUInt32LE(o + 12);
      const png = ico.subarray(off, off + size);
      expect(png.subarray(0, 8), `.ico 第 ${i} 档不是 PNG`).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      expect(png.readUInt32BE(16), `.ico 第 ${i} 档 PNG 宽 ${png.readUInt32BE(16)} ≠ 目录声明 ${w}`).toBe(w);
      expect(png.readUInt32BE(20), `.ico 第 ${i} 档 PNG 高 ${png.readUInt32BE(20)} ≠ 目录声明 ${h}`).toBe(h);
    }
    expect(declared, '.ico 应含 16/32/48 三档').toEqual([16, 32, 48]);
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
    //   ④ 预算 5632 → 8192：站主 2026-09-28 要求「说说 / 留言 / 文章评论都能回复」。
    //      实测账（不是估的）：回复表单 + 回复列表让评论部分从 2569 → 4416
    //      （comments.js 2181 + reply-common.js 2235）。为了少占字节已经做过两轮：
    //        · 把分组函数从后端 core 搬回前端（原样 import 会把整个 core 拖进产物，多 3 KB）；
    //        · 把「打开回复表单」与「提交」收进 reply-common，三处共用而不是各写一份（8310 → 7632）。
    //      站主据此拍板 8192（中间先试过 6656，实测装不下）。
    //   ⑤ 预算 8192 → 12800：站主 2026-10-03 要求给文章页装「阅读尺」（READING RULE 装置）。
    //      实测账（**量过两遍，不是估的**：同一份源码，只摘掉那一行 import 重跑本用例）：
    //        · 装置关掉：合计 7803（内联 2758 + 外链闭包 5045）
    //        · 装置打开：合计 11957（内联 2758 + 外链闭包 9199）⇒ 装置净增 **4154 字节**
    //      这 4154 的构成（都是本页新增的同源外链）：
    //        · reading-rule 本体 ≈2965 —— 内联进 Post 那段脚本块（3617 − 原 652）
    //        · rl-core 共享块 1189 —— 帧循环 / 视口停帧 / 降级开关，**归档卷尺也在用**
    //          （对全站只多付一次；对文章页是本轮才开始付）
    //      为什么不能靠"再挤一挤"过 8192：上一版把两次能省的都省光了（见 ④），
    //      8192 只剩 389 字节余量，而一台装置的最小合理体积就在 3~4 KB 级
    //      （哪怕只写「量偏移 + 建齿 + 重绘 + 四态降级」也下不来）。
    //      ⇒ 按前几次同样的口径抬到 **12800**（实测 +7.0% 余量，与 ④ 的 +7.3% 同量级）。
    // 标签数那条只是"别让页面无限堆脚本"的粗筛，真正的约束是下面的字节数；
    // 现在 5 处 = head 保险 + 光标 + 统计 + 评论 loader + 过渡 loader（阅读尺并在过渡 loader 那个块里，不新增标签）。
    const BUDGET = 12800;
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

describe.skipIf(!hasDist)('首页 CSS：照搬原型的「故意保留的无效声明」（2026-09-30 第五轮）', () => {
  // 这组守的不是"我们写的值是对的"，而是**"我们没有比原型更聪明"**。
  //
  // 背景：视觉原型 nc-rhine-v7/index.html 自己的 CSS 有两类"死"声明，
  // 而上一轮"顺手修好/补全"之后，本站渲染得跟原型**不一样**了 ——
  // 站主报的三条差异里有两条就是这么来的。所以这里把两条反向钉住。
  //
  // ① `--fs-item` / `--fs-h2`：原型 `:root` 里写的是 `clamp(1.6rem,1rem+4.2vw,3.4rem)`，
  //    算术运算符 `+` 两侧**没有空格** ⇒ 按 CSS 规范该值非法 ⇒ `font-size: var(--fs-item)`
  //    在计算值阶段整条作废 ⇒ 标题退回**继承的正文 17px**（这就是原型渲染出来的样子）。
  //    本站 tokens.css 里的同名变量是**带空格的有效值**，首页那份 :global(:root) 特意覆盖成
  //    原型原值。谁要是"顺手"把空格补上，首页标题会从 17px 跳到 54.4px、跟原型对不上。
  //    ★ 注意断言比的是**产物**：esbuild 会把它压成 `1rem4.2vw`（依然非法，结果不变），
  //      所以正则要容得下"没 +"和"有 + 但两侧无空格"两种形态，只拒绝"两侧带空格"那种。
  //
  // ② `--line-1` / `--paper-0` / `--ink-3`：原型在多处引用了这三个变量但**从未定义** ⇒
  //    `.marquee` 的上下横线与实色底、`.marquee-item .num` 的 color 全部作废。
  //    上一轮在首页 :global(:root) 里给它们赋了值，把死声明救活了 ⇒ 原型本来没有的横线冒出来。
  //    ⇒ 这些变量在**任何**产物 CSS 里都不许有定义。
  //
  // ③ `--mono` / `--font-display` / `--font-mono`：**同一类问题，只是表现不同** ——
  //    原型也是引用了、从未定义，但那几处声明**自带 fallback**：
  //      `.marquee-item`      `var(--font-display, inherit)`   ⇒ 原型取 inherit
  //      `.marquee-item .num` `var(--font-mono, monospace)`    ⇒ 原型取 monospace
  //      `.langbar`           `var(--mono, 'IBM Plex Mono', ui-monospace, monospace)`
  //    ⇒ 原型里这些声明没死，只是落到 fallback 上。本站一旦定义这三个变量，它们就改取本站的值：
  //      实测（1258×802 + CDP `CSS.getPlatformFontsForNode`）`.marquee-item` 由原型的
  //      **IBM Plex Sans** 变成 **Archivo SemiBold** —— 跑马灯大字字形明显不同。
  //    ⇒ 同样不许在任何产物 CSS 里定义；首页每处 font-family 照抄原型那一行（连 fallback 一起）。
  const DEAD_VARS = ['--line-1', '--paper-0', '--ink-3', '--mono', '--font-display', '--font-mono'];
  const css = () => {
    const files = walk(DIST, (n) => n.endsWith('.css'));
    return { files, all: files.map((f) => readFileSync(f, 'utf8')).join('\n') };
  };
  // 首页那份 CSS：**从 dist/index.html 的 <link> 里取**，别用文件名猜
  // （dist/_astro 下不止一个 index.*.css，另一个是别的页面的）。
  const homeCss = () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/href="(\/_astro\/[A-Za-z0-9._-]+\.css)"/g)].map((m) => m[1]);
    const files = refs.map((r) => join(DIST, r.replace(/^\//, '')));
    return { refs, files, text: files.map((f) => readFileSync(f, 'utf8')).join('\n') };
  };

  it('首页 CSS 覆盖了 --fs-item / --fs-h2，且值是原型那个「无空格、故意无效」的 clamp', () => {
    const { refs, text } = homeCss();
    expect(refs.length, '首页 HTML 里没找到任何 <link rel=stylesheet>').toBeGreaterThan(0);
    // ★ 取**最后一次**定义：首页加载 Base.css（tokens.css 里是带空格的有效值）之后再加载
    //   自己那份 index.*.css ⇒ 后者按级联胜出。所以"生效的那个值"是最后一处。
    const last = (name: string) => [...text.matchAll(new RegExp(`${name}:\\s*([^;}]+)`, 'g'))].at(-1)?.[1]?.trim();
    const item = last('--fs-item');
    const h2 = last('--fs-h2');
    expect(item, '首页 CSS 里没有 --fs-item 覆盖 ⇒ 标题会用 tokens.css 的有效值（54.4px），跟原型对不上').toBeTruthy();
    expect(h2, '首页 CSS 里没有 --fs-h2 覆盖 ⇒ 同上').toBeTruthy();
    // 只拒绝"运算符两侧带空格"的**有效**写法；无空格 / 被压成 1rem4.2vw 都算合格
    for (const [name, v] of [['--fs-item', item!], ['--fs-h2', h2!]] as const) {
      expect(v, `${name} 生效值是带空格的有效 clamp（${v}）—— 首页标题会跳大（17px → 54.4px），跟原型不一样了`).not.toMatch(/\s[+*]\s/);
      expect(v, `${name} 不含 clamp(`).toContain('clamp(');
    }
    console.log(`判据 首页字号 对象 ${refs.join(' + ')}（取最后一处定义 = 级联胜出者）实测: --fs-item=${item} · --fs-h2=${h2}（无空格 ⇒ 声明作废 ⇒ 标题继承 17px，与原型一致）`);
  });

  it('原型引用但从未定义的变量（--line-1/--paper-0/--ink-3/--mono/--font-display/--font-mono）在整份产物里都没有定义', () => {
    const { all } = css();
    for (const name of DEAD_VARS) {
      const hit = all.match(new RegExp(`${name}:\\s*[^;}]+`));
      expect(hit?.[0] ?? '', `${name} 被定义了（${hit?.[0]}）⇒ 原型里"死掉"或"落到 fallback"的声明会改取本站的值（跑马灯冒横线/实色底、数字显形、跑马灯大字字形由 Plex Sans 变 Archivo）`).toBe('');
    }
    console.log(`判据 原型未定义变量 对象 dist/**/*.css 实测: ${DEAD_VARS.join(' / ')} 均无定义 ⇒ 与原型一致`);
  });
});

describe.skipIf(!hasDist)('首页：宽视口的接缝 / ∞ 淡入淡出 / 揭示动画的自愈路径（2026-09-30 第六轮）', () => {
  // 这三条守的都是**站主报的现象**（不是"我觉得应该这样"），每条都先实测定位到机制再钉住。
  // 用产物断言而不是源码断言：这三条全是"产物里那条声明/那段代码在不在"。
  const homeHtml = () => readFileSync(join(DIST, 'index.html'), 'utf8');
  const homeCss = () => {
    const html = homeHtml();
    const refs = [...html.matchAll(/href="(\/_astro\/[A-Za-z0-9._-]+\.css)"/g)].map((m) => m[1]);
    return refs.map((r) => readFileSync(join(DIST, r.replace(/^\//, '')), 'utf8')).join('\n');
  };
  // 取某条规则（scoped ⇒ 产物里是 `.dusk[data-astro-cid-xxx]{…}`）的声明体。
  // ★ 取**最后一处**：Base.css 里也有同名 `.band[...]`（老组件残留的样式，首页 slot 里用不到它），
  //   而首页自己那份 index.*.css 是后加载的、按级联胜出 —— 和上面那条字号断言同一套判据。
  //   用带 `{` 的正则而不是 indexOf：`.dusk[…]::before{` 也含 `.dusk[`，会被 indexOf 误取。
  const decls = (text: string, sel: string) => {
    const re = new RegExp(`${sel.replace(/\./g, '\\.')}\\[[^\\]]*\\]\\{([^}]*)\\}`, 'g');
    return [...text.matchAll(re)].map((m) => m[1]).at(-1) ?? '';
  };

  it('① .dusk 必须和 .band / .paper-wrap 一样逃出 .shell（否则宽视口下晨昏带被框窄、上下硬切）', () => {
    const text = homeCss();
    const d = decls(text, '.dusk');
    expect(d, '产物里没有 .dusk 规则').toBeTruthy();
    // 「先自证另一半」：.band / .paper-wrap 的逃逸本来就该在，缺了说明整条前提变了
    expect(decls(text, '.band'), '.band 的 full-bleed 逃生口没了').toContain('margin-inline:calc(50% - 50vw)');
    expect(decls(text, '.paper-wrap'), '.paper-wrap 的 full-bleed 逃生口没了').toContain('margin-inline:calc(50% - 50vw)');
    expect(
      d.replace(/\s+/g, ''),
      '.dusk 没有 margin-inline:calc(50% - 50vw) ⇒ 视口宽于 --wrap(82rem=1312px) 时晨昏带被 .shell 框成"中间一段"，' +
        '两侧露出纸白，与上面满宽的深墨绿场/下面满宽的纸白区各形成一条竖向硬边（站主报的"身份下面衔接"）',
    ).toContain('margin-inline:calc(50%-50vw)');
    console.log('判据 接缝 对象 dist/_astro/index.*.css 实测: .band / .dusk / .paper-wrap 三者都带 margin-inline:calc(50% - 50vw) ⇒ 宽视口下三段同宽、无竖向硬边');
  });

  it('② .paper-inf 必须有 opacity 过渡（否则百褶 ∞ 是硬切出来的）', () => {
    const d = decls(homeCss(), '.paper-inf');
    expect(d, '产物里没有 .paper-inf 规则').toBeTruthy();
    expect(
      /transition:[^;}]*opacity/.test(d.replace(/\s+/g, '')),
      `.paper-inf 的 transition 里没有 opacity（${d}）⇒ 显隐是硬切；站主报"百褶 ∞ 突然闪出来"`,
    ).toBe(true);
    console.log('判据 ∞ 淡入淡出 对象 dist/_astro/index.*.css 实测: .paper-inf 带 transition:opacity .9s var(--ease-glass) ⇒ 进出纸白区是淡入淡出');
  });

  it('③ 揭示动画必须能"自愈"：播完摘掉内联 opacity + 取消动画，并带 pageshow 兜底', () => {
    const html = homeHtml();
    // 内联 opacity:0 是"脚本没跑"时的保护，但如果它**一直留着**，就成了唯一的可见性来源的反面：
    // 脚本动画一旦被丢弃（bfcache 恢复 / 标签页冻结回收 / 合成器回收 / 回调抛错），
    // 元素就永久停在 opacity:0 —— 实测线上：正常揭示 cs=1（唯一理由是有 1 个动画），
    // cancel() 后 cs=0，滚走再回来仍 0（io.unobserve 已执行 ⇒ 无自愈路径）。
    expect(
      /removeProperty\([`"']opacity[`"']\)/.test(html),
      '首页内联脚本里没有 removeProperty(`opacity`) ⇒ 揭示动画播完后内联 opacity:0 仍留着，动画一丢内容就永久不可见',
    ).toBe(true);
    expect(
      /[`"']pageshow[`"']/.test(html),
      '首页内联脚本里没有 pageshow 兜底 ⇒ 从 bfcache 恢复/标签页解冻回来时，卡在 opacity:0 的条目不会自愈',
    ).toBe(true);
    console.log('判据 揭示自愈 对象 dist/index.html 内联脚本 实测: 含 removeProperty(`opacity`) + pageshow 兜底 ⇒ 内容可见性不再依赖"活着的动画"');
  });
});

describe.skipIf(!hasDist)('首屏焦点环：程序化交焦点不画绿框（2026-09-30 第七轮）', () => {
  // 站主报：刚进站时首屏大标题「North_Cedar's notes」被一个绿框套住。
  //
  // 根因（两件事同时成立才会出现，CDP 实测）：
  //   ① `BootIntro.astro` 收尾时把焦点交回主标题（`title.focus()`，免得掉到 <body>），
  //      所以 `index.astro` 给 h1 挂了 `tabindex="-1"`；
  //   ② `base.css` 的全局 `:focus-visible { outline: 3px solid var(--accent-ink) }` ——
  //      Chrome 会把**脚本聚焦的 `tabindex="-1"` 非交互元素**也判成 :focus-visible。
  //   实测（线上 + `Emulation.setFocusEmulationEnabled`，不开这个开关 :focus 恒不匹配、
  //   会得出"没有绿框"的错误结论）：`focusVisible:true`、
  //   `outline: solid 3px rgb(38,107,59)`（= `--accent-ink` #266b3b，与站主截图采样一致），
  //   几何恰好等于 h1 的边框盒。
  //   ★ 原型没有这一出：原型 `<h1 class="display">` 既无 tabindex、全文也无任何 .focus()/
  //     :focus 规则 ⇒ 又一个"本站自己长出来的"。
  //
  // ⇒ 只对 `tabindex="-1"` 收掉焦点环（这类元素 Tab 永远到不了，只可能是脚本聚焦）；
  //    a/button/input 的键盘焦点环必须留着 ⇒ **不能**图省事写成全局 `:focus-visible{outline:none}`。
  it('产物 CSS 有 [tabindex="-1"]:focus-visible{outline:none}，且全局焦点环没被砍', () => {
    const all = walk(DIST, (n) => n.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(
      /\[tabindex=["']?-1["']?\]:focus-visible\{[^}]*outline:\s*none/.test(all),
      '产物里没有 `[tabindex="-1"]:focus-visible{outline:none}` ⇒ 开场把焦点交给主标题后，首屏大标题又会被套上那个绿框',
    ).toBe(true);
    expect(
      /:focus-visible\{[^}]*outline:\s*3px solid var\(--accent-ink\)/.test(all),
      '全局 :focus-visible 的 3px outline 不见了 ⇒ 为了消一个绿框把键盘焦点环全砍了（过度修复）',
    ).toBe(true);
    console.log('判据 首屏焦点环 对象 dist/**/*.css 实测: 有 [tabindex="-1"]:focus-visible{outline:none}，且全局 :focus-visible 的 3px --accent-ink 环仍在 ⇒ 只收程序化聚焦，键盘焦点环不受影响');
  });
});

describe.skipIf(!hasDist)('全站滚动条：只是「不画」，滚动本身照旧（2026-10-02 第七轮）', () => {
  // 站主原话第 8 条：「把整个博客的侧边滚动的这个条删了」（截图里那根竖条）。
  // 站上从来没有自定义过滚动条（全仓 grep scrollbar 只命中探针脚本）⇒ 那根是
  // **Chrome 默认皮肤**压在深绿/纸白底上，不是我们画的。修法是让 UA **不画**它。
  //
  // ★ 这条必须两条 CSS 都断：`scrollbar-width`（Firefox/新 Chromium）与
  //   `::-webkit-scrollbar`（WebKit/旧 Chromium）各管一半浏览器，只写一条
  //   在另一家上等于没做 —— 而站主的截图恰好可能来自另一家。
  it('产物 CSS 同时有 scrollbar-width:none 与 ::-webkit-scrollbar{display:none}', () => {
    const all = allDistCss();
    expect(
      /html\{[^}]*scrollbar-width:\s*none/.test(all),
      '产物里没有 `html{scrollbar-width:none}` ⇒ 在 Firefox/新版 Chromium 上那根默认滚动条还在',
    ).toBe(true);
    expect(
      /html::\-webkit\-scrollbar\{[^}]*display:\s*none/.test(all),
      '产物里没有 `html::-webkit-scrollbar{display:none}` ⇒ 在 WebKit/旧 Chromium 上那根默认滚动条还在',
    ).toBe(true);
    // ★ 反向护栏：只许「不画」，不许顺手把滚动本身也关掉。
    //   （`html` 上另有一条 `overflow-x:clip`，那是宽视口接缝要的，不是这次的事，别误伤。）
    const htmlRule = all.match(/(?:^|[},])html\{([^}]*)\}/)?.[1] ?? '';
    expect(
      /overflow:\s*hidden/.test(htmlRule),
      'html 上出现了 overflow:hidden ⇒ 这不是「藏滚动条」，是把整页滚动关掉了（过度修复）',
    ).toBe(false);
    console.log('判据 滚动条 对象 dist/**/*.css 实测: html 同时带 scrollbar-width:none 与 ::-webkit-scrollbar{display:none}，且未动 overflow ⇒ 只是不画，滚动照旧');
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

describe.skipIf(!hasDist)('首页 DNA：three.js 不许退回整包', () => {
  // 2026-09-30：这是本站唯一的第三方库（站主拍板「用 three.js，接受破例」），
  // 所以它的体积必须有人盯着 —— 否则破例会慢慢变成默认。
  //
  // 起因：dna3d.ts 原本写的是 `await import('three')`，拿到的是**整个命名空间对象**，
  //   打包器判断不出哪些导出最终没被用到 ⇒ three 整包 657.2 KB 原样进了产物。
  // 修法：改成「动态 import ./dna-scene + 该文件具名静态 re-export」——
  //   懒加载行为一点没变，打包器却能看到「只有 9 个符号被用到」⇒ 降到 541.9 KB（−115.3 KB / −17.5%）。
  // 两条判据一起守，缺一条都会漏：
  //   ① 源码扫描：裸的 import('three') 一回来，整包就回来了（这是**根因**，先看它）；
  //   ② 产物实测字节：换了 vendor 文件、或 dna3d 多用了一个大件，都会在这里冒出来。
  it('走具名导出收口，且产物 chunk 在预算内', () => {
    // ⚠️ 扫描前必须剥注释：这份文件的头部注释正在解释「为什么不能 import('three')」，
    //   字面就写着它 —— 不剥注释的话这条断言会被自己脚下的注释引爆（与上面光标那条同理）。
    const stripComments = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
    const src = stripComments(readFileSync('src/scripts/dna3d.ts', 'utf8'));
    // ⚠️ 必须排除**类型位置**：dna3d.ts 里有 `let renderer: import('three').WebGLRenderer`
    // 这类写法（类型注解，编译后会被擦掉、不参与打包），硬匹配会当场假阳性 ——
    // 这条断言第一版就栽在这上面。区分办法是看后面有没有跟 `.`：
    // 类型位置一定是 `import('three').XXX`（取某个类型），值位置不是。
    expect(
      src,
      "dna3d.ts 又直接 import('three') 了 ⇒ 拿到整命名空间，打包器无法摇树，657 KB 会原样回来",
    ).not.toMatch(/import\(\s*['"]three['"]\s*\)(?!\s*\.)/);
    expect(existsSync('src/scripts/dna-scene.ts'), 'dna-scene.ts 收口层被删了（three 会退回整包）').toBe(true);

    const chunks = walk(DIST, (n) => /^three\.module\.min\.[A-Za-z0-9_-]+\.js$/.test(n));
    expect(chunks.length, '产物里找不到 three 的 chunk（vendor 改名了？这里要跟着改）').toBe(1);
    const kb = statSync(chunks[0]).size / 1024;
    console.log(`判据 DNA three 体积 对象 ${chunks[0]} 实测: ${kb.toFixed(1)} KB（基线 541.9 · 上限 600）`);
    // 上限取基线 + 约 10% 余量：正常加一两个 three 功能不会撞线，
    // 但「退回整包」会（657 KB）。撞线时应当先确认是不是又用了命名空间导入。
    expect(kb, `three chunk ${kb.toFixed(1)} KB，超过 600 KB 上限`).toBeLessThan(600);
  });
});

describe.skipIf(!hasDist)('/gallery 页 JS 预算（P5 相册页）', () => {
  // 2026-09-26 站主拍板 E：/gallery 独立一条预算，上限 6144。
  // 与首页同理，不跟文章页那条合并 —— 合并会让「放宽某一页」顺手放宽其它页。
  //
  // 实测（2026-09-26）：1971 字节（筛选 + 灯箱，零依赖）。余量 4173。
  // 灯箱刻意走**渐进增强**：图包在 <a href="1280档"> 里，JS 到位才拦截点击开灯箱 ——
  // 所以无 JS 时页面完整可用（点图直接开大图），也不需要第二个 `html.js` 门控脚本。
  it('相册页 JS 总量（内联 + 同源外链闭包）≤ 24 KB', () => {
    /* ★ 2026-10-07 **原地改口径**（不新开一条）：螺旋盘搬进本页后，装置的脚本是
       **外链 chunk**（SpiralPlate 5953 + rl-core 1208）—— 只算内联会**整台漏掉**，
       这条预算就退化成"守着一个空壳"。改成与文章页 / 螺旋盘页同一条口径：
       内联 + 同源外链 import 闭包。
       实测（2026-10-07）：内联 4809 + 闭包 16613 = 21422
       （SpiralPlate 5953 + rl-core 1208 + develop 那支 9452）。
       上限 24576 留 ~3 KB 余量：加一两处交互不会撞线，
       而"误把 three 拖进来"（541.9 KB）或"误引外部资源"一定会撞。 */
    const page = join(DIST, 'gallery', 'index.html');
    expect(existsSync(page), 'dist/gallery/index.html 不存在，先跑 npm run build').toBe(true);
    const html = readFileSync(page, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    const sizes = scripts.map((s) => Buffer.byteLength(s[1], 'utf8'));
    const inline = sizes.reduce((a, b) => a + b, 0);
    const BUDGET = 24576;
    const { code, files } = jsClosure(page);
    const full = Buffer.byteLength(code, 'utf8');
    console.log(
      `相册页 JS: 内联 ${sizes.join(' + ')} = ${inline} · 闭包合计 ${full} 字节（预算 ${BUDGET}）· ` +
        files.map((f) => `${f.split(/[\\/]/).pop()} ${statSync(f).size}`).join(' + '),
    );
    expect(full, `相册页 JS 合计 ${full} 字节，超过 ${BUDGET} 预算`).toBeLessThan(BUDGET);
    /* 反面正对照：整页不许碰 three（vendored 的 541.9 KB chunk 一旦进来必炸） */
    expect(files.map((f) => f.replace(/\\/g, '/')).join(' '), '引进了 three 的 chunk').not.toMatch(
      /three\.module\.min/,
    );
  });

  it('★ 留言页 JS 总量（内联 + 同源外链闭包）≤ 16 KB（2026-10-14 补上）', () => {
    /* ★★ 这一页此前**根本没有字节预算** —— 文章页 12800、相册页 24576 都有人守，
       留言页没有 ⇒ 它可以无限膨胀，而它现在有**两台**装置（声纹带 + 指针声波），
       正是最需要门闩的一页。spec §6.80.3。
       口径与上面两页完全一致：内联 + 同源外链 import **闭包**。
       实测（2026-10-14）：内联 2758 + 闭包 12314 = 15082
         （Voiceprint 5621 + guestbook 837 + comments 2413 + reply-common 2235 + rl-core 1208）。
       ★★ **这里记一个我自己犯的错**：定稿前我先拍了个 12288，是**只数了 HTML 里直接引用的
         script src** 得来的（6458 + 2758 = 9208），**漏掉了整条 import 闭包** ——
         评论系统（comments 2413 + reply-common 2235）与 rl-core 1208 一直背在这一页上。
         差 5874 字节，一上线就撞线。⇒ 这正是上面两页为什么用 `jsClosure` 而不是
         "把 script src 加起来"：**漏掉 import 闭包 = 预算形同虚设**。
       ⇒ 上限 16384（= 2^14），余量 8.6%，与站上「余量 ~7%」同一档。
         留言页比文章页贵是因为它背两台装置 —— 那是站主要的效果，不是白付的字节。 */
    const page = join(DIST, 'guestbook', 'index.html');
    expect(existsSync(page), 'dist/guestbook/index.html 不存在，先跑 npm run build').toBe(true);
    const html = readFileSync(page, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    const inline = scripts.map((s) => Buffer.byteLength(s[1], 'utf8')).reduce((a, b) => a + b, 0);
    const BUDGET = 16384;
    const { code, files } = jsClosure(page);
    const full = Buffer.byteLength(code, 'utf8');
    console.log(
      `留言页 JS: 内联 ${inline} · 闭包合计 ${full} 字节（预算 ${BUDGET}）· ` +
        files.map((f) => `${f.split(/[\\/]/).pop()} ${statSync(f).size}`).join(' + '),
    );
    expect(full, `留言页 JS 合计 ${full} 字节，超过 ${BUDGET} 预算`).toBeLessThan(BUDGET);
    /* ★ 附带一条正对照：整页不许碰 three。指针声波与游标都不许被共用模块牵到别的页去 ——
       上一轮 `comments.ts` 已经把文章页顶爆过一次（超 1008 字节），那教训在这里再钉一次。 */
    expect(code, '留言页引进了 three').not.toMatch(/three\.module\.min/);
  });
});

describe.skipIf(!hasDist)('日志页 changes：不许有被 YAML 吃成对象的条目（2026-10-08）', () => {
  /**
   * 每条 changes 在 content/pages/log.md 里本该是一条**字符串**。若正文里写了裸的
   * 「ASCII 冒号 + 空格」，YAML 就把那一条读成**映射**而不是字符串 ⇒ Astro 直接把它
   * stringify 成一个对象：整条文字消失，页面上只剩 `[object Object]`。
   * v2.1 的第 3 条就这样上线过一次（那句里写的是 `background: none`）—— 当时没有任何
   * 断言看着日志内容，所以全绿的测试放它过去了。
   *
   * 判据取 li 的**原始内层 HTML** 恰好等于 `[object Object]`（不是"文本里出现该字样"）：
   * 这样不会误伤「在正文里引用这个字样」的条目 —— 那处外面套着 `<code>`，内层 HTML 不止四个字。
   */
  it('dist/log/index.html 里没有整条渲染成 [object Object] 的条目', () => {
    const page = join(DIST, 'log', 'index.html');
    expect(existsSync(page), '日志页产物不存在').toBe(true);
    const html = readFileSync(page, 'utf8');
    const lis = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
    const bad = lis.filter((inner) => inner === '[object Object]');
    expect(
      bad.length,
      `有 ${bad.length} 条 changes 被 YAML 吃成了对象 —— 去 content/pages/log.md 查那几条里的裸「冒号+空格」`,
    ).toBe(0);
    /* 反面正对照：确认本组断言不是空转 */
    expect(lis.length, '日志页一条条目都没有，本组断言等于空转').toBeGreaterThan(50);
  });
});

describe.skipIf(hasDist)('构建产物（未构建）', () => {
  it('dist/ 不存在，先跑 npm run build 再跑测试', () => {
    console.warn('dist/ 不存在：集成断言被跳过。正确顺序是 npm run build && npm test');
    expect(hasDist).toBe(false);
  });
});
