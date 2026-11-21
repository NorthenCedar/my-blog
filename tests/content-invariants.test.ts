import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { TAGS } from '../src/tag-registry';

/**
 * 内容层的不变量 —— 只读 content/ 与 src/，不依赖 dist，所以不挂 skipIf。
 * 这些断言守的是 content-model.md 里写死的规则，以及「主题不持有正文」这条架构原则。
 */
function walkFiles(dir: string, filter: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p, filter));
    else if (filter(e.name)) out.push(p);
  }
  return out;
}

/** 内容层对「一篇文章」的最小视图。`draft` 必须读 —— 页面渲染走
 *  `filterVisible`（生产环境过滤掉草稿），判据要与页面同口径就得知道谁是草稿。 */
export type PostFm = { slug: string; tags: string[]; draft: boolean };

/** 从 content/posts 直接读 frontmatter。
 *  ★ 2026-10-11 起导出：`tests/tags-crosshair.test.ts` 的「矩阵格子数」断言
 *    需要拿它当**唯一事实来源**派生篇数（原来写死 `toBe(2)`，删文章就红）。
 *    提成导出是为了让两处共用一个读者 —— 各抄一份必然漂移。
 *  ⚠ 这是**内容层**视图（不依赖 dist）：看到的是全部文章，含草稿。
 *    判定「生产可见」要再过滤一次 draft，见 visiblePosts()。 */
export function readPostFrontmatter(dir = 'content/posts'): PostFm[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const file = join(dir, d.name, 'index.md');
      if (!existsSync(file)) return [];
      // \r?\n：Windows 上 core.autocrlf=true 时新克隆出来是 CRLF（2026-09-27 实测）
      const fm = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      if (!fm) return [];
      const raw = fm[1].match(/^tags:\s*\[(.*)\]$/m);
      const tags = raw ? raw[1].split(',').map((t) => t.trim()).filter(Boolean) : [];
      const draft = /^draft:\s*true\s*$/m.test(fm[1]);
      return [{ slug: d.name, tags, draft }];
    });
}

const POSTS = readPostFrontmatter();

/** 生产环境真正会渲染的那些 —— 与 src/lib/posts.ts 的 filterVisible 同口径。 */
export const visiblePosts = (posts: PostFm[] = POSTS) => posts.filter((p) => !p.draft);

describe('内容层不变量：标签注册表', () => {
  it('每个已登记的标签至少被一篇文章使用（否则标签页是空的）', () => {
    // tag-registry.ts 的注释声称这条由测试守住 —— 之前那个测试并不存在，注释在撒谎。
    expect(POSTS.length, '一篇内容都没有，本组断言等于没跑').toBeGreaterThan(0);
    const used = new Set(POSTS.flatMap((p) => p.tags));
    const orphan = TAGS.filter((t) => !used.has(t));
    expect(orphan, `这些标签已登记但没有文章用它：${orphan.join(', ')}`).toEqual([]);
  });

  it('每个已登记的标签在生产环境下至少有一篇可见文章（否则标签页会静默消失）', () => {
    /* ★ 2026-10-11 新增。原来的缺口：`src/pages/tags/[tag].astro` 的 getStaticPaths
       用了 `filter(count > 0)` —— 某标签的最后一篇文章被删/改标签时，该标签页
       **不再生成，而构建照样成功**。站上会悄悄少一个页面，没有任何东西报错。
       （2026-10-11 实测：某个标签的最后一篇文章被删时，该标签页整页消失。）
       这条跑内容层、不依赖 dist，所以构建前就能咬住；删草稿不会误伤（草稿本就不出页）。 */
    const live = visiblePosts();
    expect(live.length, '一篇可见文章都没有，本组断言等于没跑').toBeGreaterThan(0);
    const used = new Set(live.flatMap((p) => p.tags));
    const orphan = TAGS.filter((t) => !used.has(t));
    expect(
      orphan,
      `这些标签已登记但生产环境下没有任何可见文章用它，标签页会静默消失：${orphan.join(', ')}`,
    ).toEqual([]);
  });

  it('每篇文章用的标签都在注册表里，且数量 1–3', () => {
    for (const p of POSTS) {
      for (const t of p.tags) {
        expect(TAGS as readonly string[], `${p.slug} 用了未登记的标签 ${t}`).toContain(t);
      }
      expect(p.tags.length, `${p.slug} 的标签数量`).toBeGreaterThanOrEqual(1);
      expect(p.tags.length, `${p.slug} 的标签数量`).toBeLessThanOrEqual(3);
    }
  });
});

describe('内容层不变量：文件夹名必须是合法 slug（契约 §3）', () => {
  it('content/posts 下每个文件夹名都符合 ^[a-z0-9]+(-[a-z0-9]+)*$', () => {
    // 这条规则以前只写在文档里、没有任何执行 —— 建个中文文件夹会静默生成中文 URL。
    // 现在构建期会失败（src/lib/posts.ts 调 slugIssues），这里是第二道闸。
    expect(POSTS.length).toBeGreaterThan(0);
    const bad = POSTS.filter((p) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug));
    expect(bad.map((p) => p.slug), '这些文件夹名不是合法 URL 片段').toEqual([]);
  });
});

describe('架构原则：主题不持有正文（content-model §2/§7）', () => {
  it('src/ 里不出现站名、邮箱与首页简介', () => {
    // 站点文案的唯一来源是 content/site.md。它曾经硬编码在 index.astro 与 SiteFooter.astro 里。
    const email = parse(readFileSync('content/site.md', 'utf8').split(/^---\s*$/m)[1]).email;
    expect(email).toBeTruthy();
    const FORBIDDEN = [email, '北杉札记', '你好，我是北杉', 'North_Cedar'];
    const files = walkFiles('src', (n) => /\.(astro|ts)$/.test(n));
    expect(files.length).toBeGreaterThan(0);

    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) hits.push(`${f} 含「${needle}」`);
      }
    }
    expect(hits, `正文出现在主题里了，应移到 content/site.md：${hits.join(' | ')}`).toEqual([]);
  });

  it('content/site.md 存在且字段齐全', () => {
    const text = readFileSync('content/site.md', 'utf8');
    for (const field of ['name', 'wordmark', 'intro', 'metaDescription', 'email', 'github']) {
      expect(text, `site.md 缺少 ${field}`).toContain(`${field}:`);
    }
  });
});
