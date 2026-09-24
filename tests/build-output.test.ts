import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const hasDist = existsSync(DIST);
const DRAFT_SLUGS = ['piano-eight-level-and-after', 'ai-built-this-blog', 'camera-in-gaosan'];

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

describe.skipIf(!hasDist)('构建产物：草稿三态里的第三态', () => {
  it('草稿文章不产出任何页面', () => {
    for (const slug of DRAFT_SLUGS) {
      expect(existsSync(join(DIST, 'posts', slug)), `${slug} 是草稿，不该有页面`).toBe(false);
    }
  });

  it('草稿的 slug 不出现在任何产出的 HTML 里', () => {
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      for (const slug of DRAFT_SLUGS) {
        expect(html.includes(slug), `${f} 里出现了草稿 slug ${slug}`).toBe(false);
      }
    }
  });

  it('草稿的素材不产出（scripts/prune-draft-assets.mjs 的净效果）', () => {
    const astroDir = join(DIST, '_astro');
    if (!existsSync(astroDir)) return;
    const leaked = readdirSync(astroDir).filter((n) => n.startsWith('Image_'));
    expect(leaked, `草稿素材被部署了：${leaked.join(', ')}`).toEqual([]);
  });

  it('RSS 与 sitemap 都存在，且草稿不进 RSS', () => {
    expect(existsSync(join(DIST, 'rss.xml')), 'rss.xml 不存在').toBe(true);
    expect(existsSync(join(DIST, 'sitemap-index.xml')), 'sitemap 不存在').toBe(true);
    const rss = readFileSync(join(DIST, 'rss.xml'), 'utf8');
    // 三篇全是草稿 → 生产构建下 RSS 应当一条 item 都没有
    expect(rss.includes('<item>'), 'RSS 里出现了条目（草稿不该进）').toBe(false);
  });
});

describe.skipIf(!hasDist)('构建产物：全局硬约束', () => {
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

  it('字体全部自托管（产物里存在 4 个 woff2）', () => {
    const fonts = walk(DIST, (n) => n.endsWith('.woff2'));
    expect(fonts.length).toBe(4);
  });
});

describe.skipIf(!hasDist)('构建产物：发布态（当前无已发布文章时会跳过）', () => {
  const postPages = hasDist ? walk(DIST, (n) => n === 'index.html').filter((p) => p.includes(`${'posts'}`)) : [];

  it('JS 预算：全站只有一处脚本，且 < 1 KB', () => {
    if (postPages.length === 0) {
      console.warn('没有已发布的文章页 —— 三篇草稿都不产出页面，JS 预算无法在此断言');
      return;
    }
    const js = walk(DIST, (n) => n.endsWith('.js'));
    expect(js.length, '只允许一个 JS 文件').toBeLessThanOrEqual(1);
    if (js.length === 1) {
      expect(statSync(js[0]).size, 'JS 超过 1 KB').toBeLessThan(1024);
    }
  });
});

describe.skipIf(hasDist)('构建产物（未构建）', () => {
  it('dist/ 不存在，先跑 npm run build 再跑测试', () => {
    console.warn('dist/ 不存在：集成断言被跳过。正确顺序是 npm run build && npm test');
    expect(hasDist).toBe(false);
  });
});
