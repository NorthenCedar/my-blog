import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const hasDist = existsSync(DIST);
const POSTS_DIR = 'content/posts';

type PostInfo = { slug: string; draft: boolean; images: string[] };

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
      const fm = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!fm) return [];
      const images = [...fm[2].matchAll(/!\[[^\]]*\]\(\.\/([^)\s]+)\)/g)].map((m) => m[1].split('/').pop()!);
      return [{ slug: d.name, draft: /^draft:\s*true\s*$/m.test(fm[1]), images }];
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

  it('零第三方资源加载（只允许作者手写外链与自家 canonical）', () => {
    // 2026-09-25 修订：加了 <link rel="canonical"> 之后，这条断言需要区分
    // 「加载外部资源」（script/style/font/img —— 真实网络请求，必须禁止）
    // 与「指向自家域名的元数据」（canonical —— 不产生请求，是 SEO 必需）。
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
        const before = html.slice(Math.max(0, m.index! - 60), m.index!).trimEnd();
        const isAnchor = before.endsWith('<a');
        const isCanonical = before.endsWith('<link rel="canonical"');
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
    expect(scripts.length, `文章页有 ${scripts.length} 处 <script>`).toBeLessThanOrEqual(2);

    const sizes = scripts.map((s) => Buffer.byteLength(s[1], 'utf8'));
    const total = sizes.reduce((a, b) => a + b, 0);
    console.log(`内联脚本体积: ${sizes.join(' + ')} = ${total} 字节（预算 4096）`);
    expect(total, `内联脚本合计 ${total} 字节，超过 4 KB 预算`).toBeLessThan(4096);
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
    // 端点调用在页尾的内联脚本里，不在 section 内部
    expect(html, '评论应当打自己的端点').toContain('/api/comments');
  });

  it('没有独立 JS 文件（预算的另一种表达）', () => {
    expect(walk(DIST, (n) => n.endsWith('.js') || n.endsWith('.mjs'))).toEqual([]);
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
