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
    expect(DRAFTS.length, '一个草稿都没有，这组断言等于没跑').toBeGreaterThan(0);
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

  it('零第三方资源加载（只允许正文里作者手写的 <a> 外链）', () => {
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
        const before = html.slice(Math.max(0, m.index! - 40), m.index!);
        expect(before.trimEnd().endsWith('<a'), `发现外部资源加载：${m[1]}（在 ${f}）`).toBe(true);
      }
    }
  });

  it('字体全部自托管（4 个 woff2，且没有任何外链字体）', () => {
    expect(walk(DIST, (n) => n.endsWith('.woff2')).length).toBe(4);
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      expect(/fonts\.(googleapis|gstatic)\.com/.test(html), `${f} 引用了 Google Fonts`).toBe(false);
    }
  });
});

describe.skipIf(!hasDist || PUBLISHED.length === 0)('JS 预算（需要至少一篇已发布文章）', () => {
  const page = join(DIST, 'posts', PUBLISHED[0]?.slug ?? '', 'index.html');

  it('文章页恰好一处 <script>，且内联内容 < 1 KB', () => {
    const html = readFileSync(page, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    expect(scripts.length, `文章页有 ${scripts.length} 处 <script>`).toBe(1);

    const bytes = Buffer.byteLength(scripts[0][1], 'utf8');
    console.log(`内联脚本 ${bytes} 字节`);
    expect(bytes, `内联脚本 ${bytes} 字节，超过 1 KB 预算`).toBeLessThan(1024);
  });

  it('没有独立 JS 文件（预算的另一种表达）', () => {
    expect(walk(DIST, (n) => n.endsWith('.js') || n.endsWith('.mjs'))).toEqual([]);
  });
});

describe.skipIf(hasDist)('构建产物（未构建）', () => {
  it('dist/ 不存在，先跑 npm run build 再跑测试', () => {
    console.warn('dist/ 不存在：集成断言被跳过。正确顺序是 npm run build && npm test');
    expect(hasDist).toBe(false);
  });
});
