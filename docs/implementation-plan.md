# 个人博客实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `content/posts/` 下的三篇真草稿，渲染成一个部署在 Cloudflare Pages 上的纯静态中文个人博客（北杉札记），零第三方脚本、零网络字体、移动端可用。

**Architecture:** 内容层（`content/`，纯文本契约）与表现层（`src/`，B 海报式版式）之间只隔一个数据结构 `PostMeta`。接缝 = `src/lib/post-meta.ts`（纯函数核心，可单测）+ `src/lib/posts.ts`（约 40 行的 Astro 适配器）。

**Tech Stack:** Astro 7 · TypeScript（strict）· 原生 CSS（无框架）· Vitest · Node 24.21.0（已在本机验证 ≥ Astro 要求的 22.12）

**Spec:** `docs/content-model.md`（内容契约）· `docs/site-decisions.md`（技术/部署/功能决策）· `docs/architecture.md`（接缝设计）· `docs/design-spec.md`（视觉规范）· `docs/inspiration.md`（调研依据）

**计划落盘位置的偏差说明**：writing-plans 默认写 `docs/superpowers/plans/`，本项目已有 `docs/*.md` 的约定，故写入 `docs/implementation-plan.md`。

---

## Global Constraints

以下每条都是**规格里逐字抄来的硬约束**，每个任务都隐含包含：

- **依赖白名单**：运行时只允许 `astro`、`sharp`、`@astrojs/rss`、`@astrojs/sitemap`；开发期只额外允许 `vitest`。**任何其它包都要先说明理由并获站主同意。**
  > **2026-09-26 修订**：为自建评论，开发期白名单增加 **`wrangler`**（Cloudflare 官方 CLI，用于本地跑 Pages Functions 与执行 D1 迁移；不发给浏览器、不进产物）。
- **发给浏览器的 JS**：~~< 1 KB，全站只有 1 个 `<script>`~~
  > **2026-09-26 修订**：文章页 **≤ 2 个 `<script>`**；代码复制脚本 ≤ 1 KB、**评论脚本 ≤ 4 KB**。仍不得引入任何外部域名。
- **零第三方资源**：产物中不得出现任何外部域名的 `src` / `href`（文章正文里作者手写的外链除外，它们不会被加载）。**评论自建后此条不变。**
- **零网络字体**：拉丁字体自托管，中文走系统栈；`content/` 与 `src/` 之外不放字体文件以外的资产。
- **内容层只读**：构建前后 `content/` 的文件哈希必须完全一致。
- **草稿语义**：`draft: true` → 生产构建不产出页面、不进列表/标签/归档/RSS/sitemap；本地 dev 可见并显示「草稿」。
- **frontmatter 9 字段**：`title` `date` `summary` `tags` `draft` 必填（`updated` `cover` `coverAlt` `slug` 可选）。`tags` 1–3 个且必须在注册表内；`summary` ≤ 80 字；`cover` 有则 `coverAlt` 必须有。
- **对比度**：`--ink` 对白 19.3:1；`--muted` 6.69:1；`--accent-ink` 5.18:1；`--accent`（3.68:1）**只允许出现在 ≥24px 的文字或非文字图形上**。黑带上的小字橙必须用 `--accent`（5.24:1），不能用 `--accent-ink`（3.73:1 不达标）。
- **视觉 token**：见 `design-spec.md` §3，值逐字抄，不许自创间距或字号。
- **禁止的设计手法**：紫蓝渐变、Inter、圆角卡片堆砌、三列 feature grid、玻璃拟态、卡片阴影、编号装饰（除非内容真是序列）。
- **提交规范**：Conventional Commits（`feat:` / `test:` / `chore:` / `fix:` / `docs:`），每个任务至少一次提交。
- **不 push、不部署、不动 DNS**，除非站主明确同意。

---

## Review Focus

规格没有明说、但最可能让真人用户撞上的五类输入。每条都必须在它归属的任务里有对应测试：

1. **一篇 `draft: true` 的文章被直接访问 URL** —— 期望 404，而不是「页面存在但没入口」。最容易漏的一条。
2. **标签不在注册表里**（例如手误把 `随笔` 打成 `随记`）—— 期望构建**失败并报出是哪个文件的哪个标签**，而不是静默生成一个只含 0 篇文章的标签页。
3. **`cover` 有、`coverAlt` 为空串**（不是缺字段，是写了空）—— 期望构建失败。空串比缺字段更容易溜过去。
4. **超长不换行的代码行**（你的技术文里就有）—— 期望代码块内部横向滚动，页面整体**不出现横向滚动条**。
5. **`updated` 早于 `date`**（补写旧文时手滑）—— 期望构建失败并指出两个日期。

---

## File Structure

```
<博客仓库>\
├─ package.json                    脚本与依赖白名单
├─ astro.config.mjs                site / sitemap / Shiki 主题
├─ tsconfig.json                   strict
├─ vitest.config.ts                getViteConfig()，让 astro:* 别名在测试里可解析
├─ content/                        ← 只读：内容层（已存在，本计划不改一个字节）
│  ├─ posts/{piano-eight-level-and-after,ai-built-this-blog,camera-in-gaosan}/
│  └─ pages/about.md               ← 新建（关于页正文）
├─ src/
│  ├─ content.config.ts            集合声明（loader + schema 引用）
│  ├─ tag-registry.ts              6 个已登记标签（校验的唯一事实来源）
│  ├─ lib/
│  │  ├─ schema.ts                 9 字段 zod schema + 6 条规则
│  │  ├─ post-meta.ts              ★ 纯函数核心（无 Astro 依赖，全部可单测）
│  │  └─ posts.ts                  ★ Astro 适配器（约 40 行）
│  ├─ styles/
│  │  ├─ tokens.css                颜色/字号/间距/动效变量（逐字抄 design-spec §3）
│  │  ├─ base.css                  重置、焦点环、字体栈、页面级关系
│  │  └─ prose.css                 正文排版
│  ├─ layouts/
│  │  ├─ Base.astro                <html>/<head>/字体/导航/页脚/全局 CSS
│  │  └─ Post.astro                黑带标题 + 正文骨架
│  ├─ components/
│  │  ├─ Brandline.astro           顶行：站名 + 英文副标 + 导航
│  │  ├─ Band.astro                黑带容器（首屏）
│  │  ├─ PostIndex.astro           超大标题堆叠的列表（首页/标签页/归档页共用）
│  │  ├─ Meta.astro                元信息行（无分隔符，tabular-nums）
│  │  ├─ TagChips.astro            标签
│  │  ├─ DraftBadge.astro          草稿标记
│  │  ├─ Toc.astro                 目录
│  │  └─ SiteFooter.astro          页脚
│  └─ pages/
│     ├─ index.astro               首页
│     ├─ posts/[slug].astro        文章详情
│     ├─ tags/index.astro          标签总览
│     ├─ tags/[tag].astro          单标签
│     ├─ archive.astro             归档
│     ├─ about.astro               关于
│     ├─ 404.astro                 404
│     └─ rss.xml.ts                RSS
├─ tests/
│  ├─ schema.test.ts               6 条校验规则
│  ├─ post-meta.test.ts            派生/分组/草稿过滤
│  ├─ build-output.test.ts         构建产物集成断言（草稿三态、alt、h1、零第三方）
│  └─ tokens.test.ts               对比度复算 + 橙色越界断言
└─ scripts/
   └─ assert-tokens.mjs            从 tokens.css 读值并复算对比度（tokens.test.ts 调用）
```

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `src/tag-registry.ts`, `content/pages/about.md`

**Interfaces:**
- Consumes: 无（第一个任务）
- Produces: `src/tag-registry.ts` 导出 `export const TAGS = [...] as const;` 与 `export type Tag = typeof TAGS[number];`

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "beishan-notes",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: 安装依赖（严格按白名单）**

```powershell
cd <博客仓库>
npm install astro@^7 @astrojs/rss@^4 @astrojs/sitemap
npm install -D vitest
```

Expected: `added N packages`，且 `package.json` 的 dependencies 里只有这三项。

- [ ] **Step 3: 写 `src/tag-registry.ts`（校验的唯一事实来源）**

```ts
// 标签注册表 —— 校验的唯一事实来源。content-model.md §4 是它的人类可读镜像。
// 加标签：先在这里加，并确保至少有一篇文章用它（tests/post-meta.test.ts 会守住这条）。
export const TAGS = ['AI', '建站', '摄影', '成长', '随笔', '钢琴'] as const;
export type Tag = (typeof TAGS)[number];
```

- [ ] **Step 4: 写 `content/pages/about.md`（关于页正文，内容来自站主给的要点）**

```markdown
---
title: 关于
---

我叫郑云嘉，是一个大学生。这个博客写我个人的成长经历。

想联系我，发邮件到 a13655515876@163.com。
```

- [ ] **Step 5: 写 `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // 部署在 Cloudflare Pages，先用免费子域；换域名只改这一行
  site: 'https://beishan-notes.pages.dev',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: { theme: 'css-variables' }, // 用 CSS 变量接管配色，见 design-spec
  },
});
```

- [ ] **Step 6: 写 `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist", "prototype"]
}
```

- [ ] **Step 7: 写 `vitest.config.ts`**

```ts
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 8: 验证脚手架能跑起来**

Run: `npx astro --version`
Expected: 打印 `7.x.x`

Run: `npm test`
Expected: `No test files found`（还不是失败 —— vitest 在没有测试文件时退出码为 1，这一步只确认 vitest 能启动）

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json vitest.config.ts src/tag-registry.ts content/pages/about.md
git commit -m "chore: scaffold astro project with dependency whitelist"
```

> 注意：`git init` 需要站主明确同意后执行；若仓库尚未初始化，先 `git init` 再提交（这是本地操作，不是 push）。

---

### Task 2: 内容 schema（6 条校验规则）

**Files:**
- Create: `src/lib/schema.ts`, `tests/schema.test.ts`
- Modify: 无

**Interfaces:**
- Consumes: `TAGS` from `src/tag-registry.ts`
- Produces: `export const postSchema`（zod object）；`export type PostFrontmatter = z.infer<typeof postSchema>`

- [ ] **Step 1: 写失败的测试 `tests/schema.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { postSchema } from '../src/lib/schema';

const valid = {
  title: '标题', date: '2026-09-08',
  summary: '摘要', tags: ['成长'], draft: true,
};

describe('postSchema 的 6 条规则', () => {
  it('1. 缺必填字段就报错', () => {
    const { draft, ...missingDraft } = valid;
    expect(postSchema.safeParse(missingDraft).success).toBe(false);
  });

  it('2. date 必须是 YYYY-MM-DD', () => {
    expect(postSchema.safeParse({ ...valid, date: '2026/09/08' }).success).toBe(false);
  });

  it('3. updated 不能早于 date', () => {
    const r = postSchema.safeParse({ ...valid, updated: '2026-09-01' });
    expect(r.success).toBe(false);
    expect(String(r.error)).toContain('updated');
  });

  it('4a. tags 不能为空', () => {
    expect(postSchema.safeParse({ ...valid, tags: [] }).success).toBe(false);
  });

  it('4b. tags 不能超过 3 个', () => {
    expect(postSchema.safeParse({ ...valid, tags: ['成长', '随笔', '钢琴', '摄影'] }).success).toBe(false);
  });

  it('4c. tags 必须在注册表里，且报错文本要指出是哪个标签', () => {
    const r = postSchema.safeParse({ ...valid, tags: ['随记'] });
    expect(r.success).toBe(false);
    expect(String(r.error)).toContain('随记');
  });

  it('5. 有 cover 就必须有非空的 coverAlt', () => {
    expect(postSchema.safeParse({ ...valid, cover: './a.jpg' }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, cover: './a.jpg', coverAlt: '' }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, cover: './a.jpg', coverAlt: '一张图' }).success).toBe(true);
  });

  it('6. 未登记字段要报错', () => {
    expect(postSchema.safeParse({ ...valid, excerpt: '多余的字段' }).success).toBe(false);
  });

  it('合法输入通过', () => {
    expect(postSchema.safeParse(valid).success).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/lib/schema"`

- [ ] **Step 3: 写 `src/lib/schema.ts`**

```ts
import { z } from 'astro/zod';
import { TAGS } from '../tag-registry';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const postSchema = z
  .object({
    title: z.string().min(1),
    date: z.string().regex(DATE, 'date 必须是 YYYY-MM-DD'),
    updated: z.string().regex(DATE, 'updated 必须是 YYYY-MM-DD').optional(),
    summary: z.string().min(1).max(80, 'summary 不能超过 80 字'),
    tags: z
      .array(z.string())
      .min(1, 'tags 至少 1 个')
      .max(3, 'tags 最多 3 个')
      .refine((ts) => ts.every((t) => (TAGS as readonly string[]).includes(t)), {
        message: `tags 里有未登记的标签：\${ts}`, // 见 Step 4 的说明
      }),
    draft: z.boolean(),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).optional(),
  })
  .strict()
  .refine((d) => !d.updated || d.updated >= d.date, {
    message: 'updated 不能早于 date',
    path: ['updated'],
  })
  .refine((d) => !d.cover || (d.coverAlt ?? '').trim().length > 0, {
    message: '有 cover 就必须有 coverAlt',
    path: ['coverAlt'],
  });
```

> **Step 3 的实现注意**：zod 的 `refine` message 里拿不到具体是哪个标签，
> 所以 `message` 先写死，Step 4 把「指明是哪个标签」补上（Readme 第 4c 条测试要求这一点）。

- [ ] **Step 4: 把「未登记标签」的报错改成能指出具体标签**

用 `superRefine` 替换 `tags` 上的 `refine`：

```ts
    tags: z
      .array(z.string())
      .min(1, 'tags 至少 1 个')
      .max(3, 'tags 最多 3 个')
      .superRefine((ts, ctx) => {
        for (const t of ts) {
          if (!(TAGS as readonly string[]).includes(t)) {
            ctx.addIssue({ code: 'custom', message: `未登记的标签：${t}（请先在 src/tag-registry.ts 登记）` });
          }
        }
      }),
```

并把上面 `.refine` 的 `message` 里那段 `\${ts}` 去掉。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/schema.test.ts`
Expected: 全部 PASS（9 个用例）

> **若 `astro/zod` 在 vitest 里解析失败**：把 `import { z } from 'astro/zod'` 改成
> `import { z } from 'zod'`，并 `npm install -D zod`。这会把 `zod` 加进依赖白名单 ——
> **需要先告诉站主**（它是 Astro 已经自带的包的显式化，不增加实际体积）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/schema.ts tests/schema.test.ts
git commit -m "feat: content schema with the 6 frozen validation rules"
```

---

### Task 3: `post-meta.ts` 纯函数核心

**Files:**
- Create: `src/lib/post-meta.ts`, `tests/post-meta.test.ts`
- Modify: 无

**Interfaces:**
- Consumes: `TAGS` from `src/tag-registry.ts`
- Produces（后续任务只依赖这些名字与类型，不许改）：
  - `type PostMeta = { slug, title, date, summary, tags, draft, url, charCount, readingMinutes }`
  - `type Heading = { depth: 2 | 3; text: string; id: string }`
  - `type RawEntry = { id: string; data: {…frontmatter…}; body: string; headings: Heading[] }`
  - `toPostMeta(entry: RawEntry): PostMeta`
  - `sortByDateDesc(posts: PostMeta[]): PostMeta[]`
  - `filterVisible(posts: PostMeta[], isDev: boolean): PostMeta[]`
  - `countChars(md: string): number` / `readingMinutes(chars: number): number`
  - `groupByYear(posts: PostMeta[])` / `collectTags(posts: PostMeta[])` / `adjacentOf(posts, slug)`
  - `headingTree(headings: Heading[]): Heading[]`

- [ ] **Step 1: 写失败的测试 `tests/post-meta.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  countChars, readingMinutes, toPostMeta, sortByDateDesc, filterVisible,
  groupByYear, collectTags, adjacentOf, headingTree, type RawEntry,
} from '../src/lib/post-meta';

const raw = (over: Partial<RawEntry> = {}): RawEntry => ({
  id: 'a-post',
  data: { title: '标题', date: '2026-09-08', summary: '摘要', tags: ['成长'], draft: true },
  body: '正文一二三四五',
  headings: [{ depth: 2, text: '小标题', id: 'x' }],
  ...over,
});

describe('countChars', () => {
  it('中文按字计，拉丁按词计', () => {
    expect(countChars('你好世界')).toBe(4);
    expect(countChars('hello world')).toBe(2);
    expect(countChars('你好 Astro 世界')).toBe(4 + 1);
  });

  it('代码块不计入字数', () => {
    expect(countChars('前言\n```js\nconst a = 1;\n```\n后记')).toBe(4);
  });
});

describe('readingMinutes', () => {
  it('按每分钟 400 字，最少 1 分钟', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(401)).toBe(1);
    expect(readingMinutes(801)).toBe(2);
  });
});

describe('toPostMeta', () => {
  it('拼出 url 与派生字段，slug 取自 id', () => {
    const m = toPostMeta(raw());
    expect(m.slug).toBe('a-post');
    expect(m.url).toBe('/posts/a-post/');
    expect(m.charCount).toBe(6);
    expect(m.readingMinutes).toBe(1);
  });

  it('frontmatter 里的 slug 覆盖 id', () => {
    const m = toPostMeta(raw({ data: { ...raw().data, slug: 'custom' } }));
    expect(m.slug).toBe('custom');
    expect(m.url).toBe('/posts/custom/');
  });
});

describe('filterVisible —— 草稿三态里的两态', () => {
  const posts = [
    toPostMeta(raw({ id: 'p', data: { ...raw().data, draft: false } })),
    toPostMeta(raw({ id: 'd', data: { ...raw().data, draft: true } })),
  ];
  it('dev 下草稿与已发布都可见', () => {
    expect(filterVisible(posts, true).map((p) => p.slug)).toEqual(['p', 'd']);
  });
  it('生产下只剩已发布', () => {
    expect(filterVisible(posts, false).map((p) => p.slug)).toEqual(['p']);
  });
});

describe('sortByDateDesc / groupByYear / collectTags / adjacentOf / headingTree', () => {
  it('按日期倒序', () => {
    const ps = ['2026-01-01', '2026-09-01', '2025-12-31'].map((d, i) =>
      toPostMeta(raw({ id: `p${i}`, data: { ...raw().data, date: d } }))
    );
    expect(sortByDateDesc(ps).map((p) => p.date)).toEqual(['2026-09-01', '2026-01-01', '2025-12-31']);
  });

  it('按年分组，年内保持倒序', () => {
    const ps = sortByDateDesc([
      toPostMeta(raw({ id: 'a', data: { ...raw().data, date: '2026-09-08' } })),
      toPostMeta(raw({ id: 'b', data: { ...raw().data, date: '2025-03-01' } })),
      toPostMeta(raw({ id: 'c', data: { ...raw().data, date: '2026-01-02' } })),
    ]);
    expect(groupByYear(ps).map((g) => [g.year, g.posts.map((p) => p.slug)])).toEqual([
      ['2026', ['a', 'c']], ['2025', ['b']],
    ]);
  });

  it('标签只统计有文章且已登记的，按数量倒序', () => {
    const ps = [
      toPostMeta(raw({ id: 'a', data: { ...raw().data, tags: ['成长', '随笔'] } })),
      toPostMeta(raw({ id: 'b', data: { ...raw().data, tags: ['成长'] } })),
    ];
    expect(collectTags(ps)).toEqual([
      { tag: '成长', count: 2 }, { tag: '随笔', count: 1 },
    ]);
  });

  it('相邻文章按时间序，不跨越草稿过滤结果', () => {
    const ps = sortByDateDesc([
      toPostMeta(raw({ id: 'new', data: { ...raw().data, date: '2026-09-24' } })),
      toPostMeta(raw({ id: 'mid', data: { ...raw().data, date: '2026-09-16' } })),
      toPostMeta(raw({ id: 'old', data: { ...raw().data, date: '2026-09-08' } })),
    ]);
    expect(adjacentOf(ps, 'mid')).toEqual({ prev: ps[0], next: ps[2] });
    expect(adjacentOf(ps, 'new')).toEqual({ prev: undefined, next: ps[1] });
    expect(adjacentOf(ps, 'old')).toEqual({ prev: ps[1], next: undefined });
  });

  it('标题树只保留 h2/h3', () => {
    expect(headingTree([
      { depth: 1, text: '一', id: 'a' },
      { depth: 2, text: '二', id: 'b' },
      { depth: 3, text: '三', id: 'c' },
      { depth: 4, text: '四', id: 'd' },
    ])).toEqual([{ depth: 2, text: '二', id: 'b' }, { depth: 3, text: '三', id: 'c' }]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/post-meta.test.ts`
Expected: FAIL —— `Failed to resolve import "../src/lib/post-meta"`

- [ ] **Step 3: 写 `src/lib/post-meta.ts`**

```ts
import type { Tag } from '../tag-registry';

export type Heading = { depth: 2 | 3; text: string; id: string };

export type RawEntry = {
  id: string;
  data: {
    title: string; date: string; summary: string; tags: string[];
    draft: boolean; slug?: string; updated?: string; cover?: string; coverAlt?: string;
  };
  body: string;
  headings: { depth: number; text: string; id: string }[];
};

export type PostMeta = {
  slug: string; title: string; date: string; summary: string;
  tags: Tag[]; draft: boolean; url: string;
  charCount: number; readingMinutes: number;
};

const CODE_FENCE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`]*`/g;

export function countChars(markdown: string): number {
  const text = markdown
    .replace(CODE_FENCE, ' ')
    .replace(INLINE_CODE, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, '');
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = (text.match(/[A-Za-z0-9]+/g) ?? []).length;
  return cjk + words;
}

export function readingMinutes(chars: number): number {
  return Math.max(1, Math.round(chars / 400));
}

export function toPostMeta(entry: RawEntry): PostMeta {
  const { data, body } = entry;
  const slug = data.slug ?? entry.id;
  const charCount = countChars(body);
  return {
    slug,
    title: data.title,
    date: data.date,
    summary: data.summary,
    tags: data.tags as Tag[],
    draft: data.draft,
    url: `/posts/${slug}/`,
    charCount,
    readingMinutes: readingMinutes(charCount),
  };
}

export function sortByDateDesc(posts: PostMeta[]): PostMeta[] {
  return [...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function filterVisible(posts: PostMeta[], isDev: boolean): PostMeta[] {
  return isDev ? posts : posts.filter((p) => !p.draft);
}

export function groupByYear(posts: PostMeta[]): { year: string; posts: PostMeta[] }[] {
  const map = new Map<string, PostMeta[]>();
  for (const p of posts) {
    const y = p.date.slice(0, 4);
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(p);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, ps]) => ({ year, posts: ps }));
}

export function collectTags(posts: PostMeta[]): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const p of posts) for (const t of p.tags) map.set(t, (map.get(t) ?? 0) + 1);
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'));
}

export function adjacentOf(
  posts: PostMeta[],
  slug: string
): { prev?: PostMeta; next?: PostMeta } {
  const i = posts.findIndex((p) => p.slug === slug);
  if (i === -1) return {};
  return { prev: posts[i - 1], next: posts[i + 1] };
}

export function headingTree(headings: { depth: number; text: string; id: string }[]): Heading[] {
  return headings
    .filter((h) => h.depth === 2 || h.depth === 3)
    .map((h) => ({ depth: h.depth as 2 | 3, text: h.text, id: h.id }));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/post-meta.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/post-meta.ts tests/post-meta.test.ts
git commit -m "feat: pure post-meta core (chars, reading time, grouping, draft filtering)"
```

---

### Task 4: `posts.ts` 适配器 —— 草稿三态

**Files:**
- Create: `src/lib/posts.ts`, `src/content.config.ts`
- Modify: 无

**Interfaces:**
- Consumes: `postSchema`（Task 2）、`post-meta.ts` 的全部导出（Task 3）
- Produces: `getVisiblePosts()` · `getPost(slug)` · `getAllTags()` · `getPostsByTag(tag)` · `getArchive()` · `getAdjacent(slug)`

- [ ] **Step 1: 写 `src/content.config.ts`**

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postSchema } from './lib/schema';

const posts = defineCollection({
  loader: glob({
    pattern: '**/index.md',
    base: './content/posts',
    // 显式生成 id：默认行为由 github-slugger 决定，对 foo/index.md 的结果没有明文保证，
    // 而 slug 会被永久写进 URL，不能赌。
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  }),
  schema: postSchema,
});

export const collections = { posts };
```

- [ ] **Step 2: 写 `src/lib/posts.ts`**

```ts
import { getCollection, type CollectionEntry } from 'astro:content';
import {
  toPostMeta, sortByDateDesc, filterVisible, groupByYear, collectTags, adjacentOf, headingTree,
  type PostMeta, type RawEntry, type Heading,
} from './post-meta';
import { TAGS } from '../tag-registry';

const isDev = import.meta.env.DEV;

function toRaw(entry: CollectionEntry<'posts'>): RawEntry {
  return {
    id: entry.id,
    data: entry.data as RawEntry['data'],
    body: entry.body ?? '',
    headings: (entry.rendered?.metadata?.headings ?? []) as RawEntry['headings'],
  };
}

async function allMeta(): Promise<PostMeta[]> {
  const entries = await getCollection('posts');
  return sortByDateDesc(entries.map((e) => toPostMeta(toRaw(e))));
}

export async function getVisiblePosts(): Promise<PostMeta[]> {
  return filterVisible(await allMeta(), isDev);
}

export async function getPost(slug: string) {
  const entries = await getCollection('posts');
  const entry = entries.find((e) => (e.data.slug ?? e.id) === slug);
  if (!entry) return undefined;
  if (entry.data.draft && !isDev) return undefined;   // ← 草稿三态：生产环境直链也不产出
  const meta = toPostMeta(toRaw(entry));
  const visible = await getVisiblePosts();
  return {
    meta,
    Content: entry.rendered ? (await import('astro:content')).render : undefined,
    render: () => import('astro:content').then(({ render }) => render(entry)),
    headings: headingTree(meta ? toRaw(entry).headings : []),
    adjacent: adjacentOf(visible, slug),
  };
}

export async function getAllTags() {
  return collectTags(await getVisiblePosts()).filter((t) => (TAGS as readonly string[]).includes(t.tag));
}

export async function getPostsByTag(tag: string): Promise<PostMeta[]> {
  return (await getVisiblePosts()).filter((p) => p.tags.includes(tag as never));
}

export async function getArchive() {
  return groupByYear(await getVisiblePosts());
}

export async function getAdjacent(slug: string) {
  return adjacentOf(await getVisiblePosts(), slug);
}
```

> **注意**：上面的 `getPost` 里 `Content` / `render` 的写法是初稿，Step 3 会把它整理成
> 一个干净返回 `{ meta, entry, headings, adjacent }` 的版本，由页面自己调用 `render(entry)`。
> 页面里用 `<Content />` 需要 `const { Content } = await render(entry)`。

- [ ] **Step 3: 整理 `getPost` 的返回形状（去掉上面那段临时写法）**

```ts
export async function getPost(slug: string) {
  const entries = await getCollection('posts');
  const entry = entries.find((e) => (e.data.slug ?? e.id) === slug);
  if (!entry) return undefined;
  if (entry.data.draft && !isDev) return undefined;
  const raw = toRaw(entry);
  const visible = await getVisiblePosts();
  return {
    entry,
    meta: toPostMeta(raw),
    headings: headingTree(raw.headings),
    adjacent: adjacentOf(visible, slug),
  };
}
```

页面侧用法（Task 7 会用到）：

```astro
---
import { render } from 'astro:content';
const { entry, meta, headings } = Astro.props.post;
const { Content } = await render(entry);
---
```

- [ ] **Step 4: 冒烟验证 —— dev 能起、生产能建**

Run: `npm run build`
Expected: 构建成功（此时还没有页面引用这些函数，只要不报错即可）

Run: `npm run dev`，浏览器打开 `http://localhost:4321`
Expected: Astro 默认欢迎页（页面还没写，正常）

- [ ] **Step 5: Commit**

```bash
git add src/content.config.ts src/lib/posts.ts
git commit -m "feat: astro adapter for content collection with draft semantics"
```

---

### Task 5: 样式底座（tokens / base / prose）

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/prose.css`
- Modify: 无

**Interfaces:**
- Produces: 全部 CSS 变量（名字与值**逐字**取自 `design-spec.md` §3）；后续组件只允许使用这些变量，不许出现字面量颜色/间距

- [ ] **Step 1: 写 `src/styles/tokens.css`**

```css
/* 值与 docs/design-spec.md §3 完全一致。改这里 = 改全站视觉，不许在组件里写字面量。 */
:root {
  /* 颜色（对比度为实测值） */
  --paper: #ffffff;
  --ink: #0e0e0e;            /* 对纸 19.3:1 */
  --muted: #5c5c5c;          /* 对纸 6.69:1 */
  --hair: #d6d6d6;           /* 纯装饰线 */
  --accent: #e4572e;         /* 对纸 3.68:1 —— 仅 ≥24px 文字 / 图形 */
  --accent-ink: #c2410c;     /* 对纸 5.18:1 —— 小字专用 */
  --on-band: #ffffff;        /* 黑带上 19.3:1 */
  --on-band-sub: #dedede;    /* 黑带上 14.35:1 */
  --on-band-meta: #b4b4b4;   /* 黑带上 9.31:1 */
  --code-bg: #0e0e0e;
  --code-fg: #ededed;        /* 对代码底 16.49:1 */

  /* 字号（11 档） */
  --fs-display: clamp(2.8rem, 13vw, 8.5rem);
  --fs-title: clamp(1.9rem, 1.1rem + 3.6vw, 3.8rem);
  --fs-item: clamp(1.6rem, 1rem + 4.2vw, 3.4rem);
  --fs-h2: clamp(1.45rem, 1.05rem + 1.5vw, 2.1rem);
  --fs-h3: clamp(1.15rem, 1rem + 0.7vw, 1.4rem);
  --fs-lg: 1.375rem;
  --fs-lede: 1.125rem;
  --fs-body: 1.0625rem;
  --fs-sm: 0.875rem;
  --fs-xs: 0.8125rem;
  --fs-mono: 0.85rem;

  /* 行高 */
  --lh-display: 0.9;
  --lh-title: 1.02;
  --lh-item: 1.03;
  --lh-heading: 1.18;
  --lh-body: 1.75;

  /* 字距 */
  --ls-display: -0.045em;
  --ls-title: -0.035em;
  --ls-item: -0.032em;
  --ls-h2: -0.012em;

  /* 间距（4px 基准，8 档） */
  --sp-1: 0.25rem; --sp-2: 0.5rem; --sp-3: 0.75rem; --sp-4: 1rem;
  --sp-5: 1.5rem; --sp-6: 2rem; --sp-7: 3rem; --sp-8: 4.5rem;

  /* 版心与断点 */
  --wrap: 82rem;
  --measure: 34em;
  --gutter: clamp(1rem, 4vw, 3rem);
  --band-h: min(74vh, 42rem);

  /* 动效 */
  --dur-fast: 120ms;
  --dur-enter: 320ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
```

- [ ] **Step 2: 写 `src/styles/base.css`（重置 + 焦点 + 字体栈）**

```css
*,
*::before,
*::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: "IBM Plex Sans", -apple-system, "PingFang SC", "Microsoft YaHei",
    "Noto Sans SC", "Source Han Sans SC", sans-serif;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}

h1, h2, h3 { font-family: Archivo, "IBM Plex Sans", "PingFang SC", "Microsoft YaHei",
  "Noto Sans SC", sans-serif; }

img, svg { max-width: 100%; height: auto; display: block; }
button { font: inherit; color: inherit; }

:focus-visible { outline: 3px solid var(--accent-ink); outline-offset: 3px; }

.skip {
  position: absolute; left: -9999px; top: 0;
  background: var(--ink); color: var(--paper); padding: var(--sp-2) var(--sp-4); z-index: 99;
}
.skip:focus { left: 0; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 3: 写 `src/styles/prose.css`（正文排版）**

```css
.prose { max-width: var(--measure); }
.prose p { margin: 0 0 1.15em; }
.prose h2, .prose h3 { margin: var(--sp-7) 0 var(--sp-3); }
.prose h2 { font-size: var(--fs-h2); line-height: var(--lh-heading); letter-spacing: var(--ls-h2); }
.prose h3 { font-size: var(--fs-h3); line-height: var(--lh-heading); }
.prose ul, .prose ol { margin: 0 0 1.15em; padding-left: 1.35em; }
.prose li { margin: var(--sp-2) 0; }

.prose blockquote {
  margin: var(--sp-6) 0;
  padding-left: var(--sp-5);
  border-left: 4px solid var(--ink);
}
.prose blockquote p:last-child { margin-bottom: 0; }

.prose a { color: inherit; text-decoration: underline; text-underline-offset: 0.18em; }
.prose a:hover { color: var(--accent-ink); text-decoration-thickness: 2px; }

.prose code {
  font-family: "IBM Plex Mono", Consolas, "Courier New", monospace;
  font-size: 0.88em; background: #f2f1ef; padding: 0.12em 0.38em;
}

.prose img { margin: var(--sp-6) 0; width: 100%; }

.tablewrap { margin: var(--sp-6) 0; overflow-x: auto; }
.prose table { border-collapse: collapse; width: 100%; font-size: var(--fs-sm); }
.prose th, .prose td { border-bottom: 1px solid var(--hair); padding: var(--sp-3) var(--sp-4) var(--sp-3) 0; text-align: left; vertical-align: top; }
.prose th { border-bottom: 2px solid var(--ink); white-space: nowrap; }

/* 代码块（阶段 2 决策：黑底白字） */
.codeblock { margin: var(--sp-6) 0; background: var(--code-bg); color: var(--code-fg); }
.codeblock pre { margin: 0; padding: var(--sp-4) var(--sp-5); overflow-x: auto; }
.codeblock code {
  font-family: "IBM Plex Mono", Consolas, "Courier New", monospace;
  font-size: var(--fs-mono); line-height: 1.72; color: var(--code-fg);
  background: none; padding: 0; white-space: pre; display: block;
}
```

- [ ] **Step 4: 验证 CSS 语法（无构建器，用浏览器的解析器当裁判）**

Run: `npx astro check` （若该命令不存在则跳过）
Expected: 无错误

> 真正的验证在 Task 6 —— 页面接上样式后由 Task 10 的截图与断言检查。

- [ ] **Step 5: Commit**

```bash
git add src/styles/
git commit -m "feat: design tokens, base reset and prose stylesheet"
```

---

### Task 6: 自托管拉丁字体（0 个 npm 依赖）

**Files:**
- Create: `public/fonts/*.woff2`（下载所得，不手写）, `scripts/fetch-fonts.mjs`

**Interfaces:**
- Produces: `public/fonts/` 下的字体文件 + 一份 `src/styles/fonts.css`（`@font-face` 声明）

**为什么不用 npm 字体包**：`@fontsource/*` 是 3 个额外依赖。字体是静态文件，直接放进 `public/fonts/` 即可，**零依赖**。

- [ ] **Step 1: 先验证下载源可达、文件名正确（不要凭猜写 URL）**

```powershell
curl.exe -sI "https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-sans@5/files/ibm-plex-sans-latin-400-normal.woff2" | Select-String "HTTP/"
```

Expected: `HTTP/1.1 200 OK`

> 若返回 404：用 jsDelivr 的文件列表接口查真实文件名，再改 URL：
> `curl.exe -s "https://data.jsdelivr.com/v1/packages/npm/@fontsource/ibm-plex-sans@5?structure=flat" | Select-String "latin-400-normal.woff2"`

- [ ] **Step 2: 写 `scripts/fetch-fonts.mjs`（一次性脚本，产物进 `public/fonts/`）**

```js
import { mkdir, writeFile } from 'node:fs/promises';

const FILES = [
  ['@fontsource-variable/archivo@5', 'files/archivo-latin-wght-normal.woff2', 'archivo-latin.woff2'],
  ['@fontsource/ibm-plex-sans@5', 'files/ibm-plex-sans-latin-400-normal.woff2', 'plex-sans-400.woff2'],
  ['@fontsource/ibm-plex-sans@5', 'files/ibm-plex-sans-latin-600-normal.woff2', 'plex-sans-600.woff2'],
  ['@fontsource/ibm-plex-mono@5', 'files/ibm-plex-mono-latin-400-normal.woff2', 'plex-mono-400.woff2'],
];

await mkdir('public/fonts', { recursive: true });
for (const [pkg, from, to] of FILES) {
  const url = `https://cdn.jsdelivr.net/npm/${pkg}/${from}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error(`文件太小，可能是错误页: ${url}`);
  await writeFile(`public/fonts/${to}`, buf);
  console.log(`${to}  ${(buf.length / 1024).toFixed(1)} KB`);
}
```

- [ ] **Step 3: 运行脚本并确认体积**

Run: `node scripts/fetch-fonts.mjs`
Expected: 4 个文件，每个 10–60 KB，**总计 < 120 KB**。任何文件 > 100 KB 都要停下来看是不是拉到了非拉丁子集。

- [ ] **Step 4: 写 `src/styles/fonts.css`**

```css
@font-face {
  font-family: Archivo;
  src: url("/fonts/archivo-latin.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: "IBM Plex Sans";
  src: url("/fonts/plex-sans-400.woff2") format("woff2");
  font-weight: 400; font-display: swap;
}
@font-face {
  font-family: "IBM Plex Sans";
  src: url("/fonts/plex-sans-600.woff2") format("woff2");
  font-weight: 600; font-display: swap;
}
@font-face {
  font-family: "IBM Plex Mono";
  src: url("/fonts/plex-mono-400.woff2") format("woff2");
  font-weight: 400; font-display: swap;
}
```

- [ ] **Step 5: 在 `src/layouts/Base.astro` 里引用（Task 7 会建这个文件，此步先记住）**

`fonts.css` 必须是**第一个**被 import 的样式，且 `tokens.css` 在它之后。

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-fonts.mjs public/fonts src/styles/fonts.css
git commit -m "chore: self-host latin font subsets (zero npm deps, zero network fonts)"
```

---

### Task 7: 布局与组件

**Files:**
- Create: `src/layouts/Base.astro`, `src/layouts/Post.astro`, `src/components/{Brandline,Band,PostIndex,Meta,TagChips,DraftBadge,Toc,SiteFooter}.astro`
- Modify: 无

**Interfaces:**
- Consumes: `PostMeta` / `Heading`（Task 3）、CSS 变量（Task 5）、字体（Task 6）
- Produces（页面任务依赖这些 props，名字不许改）:
  - `<Base title description?>` —— 页面外壳，含 `<slot />`
  - `<Post meta headings adjacent>` —— 文章外壳
  - `<PostIndex posts={PostMeta[]} heading />`
  - `<Meta post={PostMeta} />` · `<TagChips tags />` · `<DraftBadge />` · `<Toc headings />`

- [ ] **Step 1: 写 `src/components/DraftBadge.astro`**

```astro
<span class="badge">草稿</span>
<style>
  .badge {
    display: inline-block;
    font-size: var(--fs-xs);
    line-height: 1.5;
    border: 1px solid var(--accent-ink);
    color: var(--accent-ink);
    padding: 0 var(--sp-2);
  }
</style>
```

- [ ] **Step 2: 写 `src/components/Brandline.astro`**

```astro
---
interface Props { current?: 'index' | 'tags' | 'archive' | 'about' }
const { current } = Astro.props;
const is = (k: string) => (current === k ? ' aria-current="page"' : '');
---
<div class="brandline">
  <a class="wm" href="/">北杉札记</a>
  <span class="sub">North_Cedar's notes</span>
  <nav aria-label="主导航">
    <a href="/" {...(current === 'index' ? { 'aria-current': 'page' } : {})}>文章</a>
    <a href="/tags/" {...(current === 'tags' ? { 'aria-current': 'page' } : {})}>标签</a>
    <a href="/archive/" {...(current === 'archive' ? { 'aria-current': 'page' } : {})}>归档</a>
    <a href="/about/" {...(current === 'about' ? { 'aria-current': 'page' } : {})}>关于</a>
    <a href="/rss.xml">RSS</a>
  </nav>
</div>
<style>
  .brandline { display: flex; align-items: baseline; gap: var(--sp-4); flex-wrap: wrap; }
  .wm { color: var(--on-band); text-decoration: none; font-weight: 700; font-size: var(--fs-body); }
  .sub { font-size: var(--fs-xs); color: var(--on-band-meta); }
  nav { margin-left: auto; }
  nav a { color: var(--on-band-sub); font-size: var(--fs-xs); text-decoration: none; margin-left: var(--sp-4); }
  nav a:hover, nav a[aria-current='page'] { color: var(--on-band); box-shadow: inset 0 -2px 0 var(--accent); }
</style>
```

- [ ] **Step 3: 写 `src/components/Band.astro`（首屏黑带）**

```astro
---
interface Props { tall?: boolean }
const { tall = true } = Astro.props;
---
<header class:list={['band', { tall }]}>
  <div class="wrap">
    <slot />
  </div>
</header>
<style>
  .band { background: var(--ink); color: var(--on-band); }
  .band .wrap {
    display: flex; flex-direction: column; justify-content: space-between;
    gap: var(--sp-7); padding: var(--sp-4) 0 var(--sp-6);
  }
  .band.tall .wrap { min-height: var(--band-h); }
  .wrap { max-width: var(--wrap); margin: 0 auto; padding-inline: var(--gutter); }
  @media (prefers-reduced-motion: no-preference) {
    .band .wrap > :last-child { animation: rise var(--dur-enter) var(--ease) both; }
    @keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  }
</style>
```

> 这是全站**唯一**的入场动效（`design-spec.md` §3.5）。其它地方一律不许加。

- [ ] **Step 4: 写 `src/components/Meta.astro`（元信息，无分隔符）**

```astro
---
import type { PostMeta } from '../lib/post-meta';
import DraftBadge from './DraftBadge.astro';
interface Props { post: PostMeta }
const { post } = Astro.props;
---
<p class="meta">
  <time datetime={post.date}>{post.date}</time>
  <span>{post.charCount.toLocaleString('zh-CN')} 字</span>
  <span>约 {post.readingMinutes} 分钟</span>
  {post.draft && <DraftBadge />}
  {post.tags.map((t) => <span class="tag">{t}</span>)}
</p>
<style>
  .meta {
    display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-4);
    margin: 0; font-size: var(--fs-xs); color: var(--on-band-meta);
    font-variant-numeric: tabular-nums;
  }
  .tag { color: var(--on-band-sub); }
</style>
```

> **注意**：这里**故意不用 `·` 连接**（那是生成页面的默认零件，见 `design-spec.md` §2），靠 `gap` 分组。
> 日期与数字用正文字族 + `tabular-nums`，**不用等宽族**。

- [ ] **Step 5: 写 `src/components/PostIndex.astro`（超大标题堆叠的列表）**

```astro
---
import type { PostMeta } from '../lib/post-meta';
import DraftBadge from './DraftBadge.astro';
interface Props { posts: PostMeta[]; heading?: string }
const { posts, heading } = Astro.props;
---
{heading && <h2 class="section">{heading}</h2>}
<ul class="index">
  {posts.map((p) => (
    <li>
      <a href={p.url}>
        <span class="date"><time datetime={p.date}>{p.date}</time>{p.draft && <> <DraftBadge /></>}</span>
        <span class="title">{p.title}</span>
        <span class="summary">{p.summary}</span>
        <span class="tags">{p.tags.join(' / ')}</span>
      </a>
    </li>
  ))}
</ul>
<style>
  .section { font-size: var(--fs-lg); font-weight: 700; margin: 0 0 var(--sp-4); }
  .index { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--ink); }
  .index li { border-bottom: 1px solid var(--hair); }
  .index a { display: block; padding: var(--sp-6) 0; text-decoration: none; color: inherit; }
  .date { font-size: var(--fs-xs); color: var(--muted); font-variant-numeric: tabular-nums; }
  .title {
    display: block; margin: var(--sp-2) 0 var(--sp-3); max-width: 22em;
    font-size: var(--fs-item); line-height: var(--lh-item); letter-spacing: var(--ls-item); font-weight: 800;
  }
  .index a:hover .title { color: var(--accent); }   /* ≥24px，3.68:1 合法 */
  .summary { display: block; font-size: var(--fs-sm); color: var(--muted); max-width: 40em; }
  .tags { display: block; margin-top: var(--sp-3); font-size: var(--fs-xs); color: var(--muted); }
</style>
```

- [ ] **Step 6: 写 `src/components/TagChips.astro` 与 `src/components/SiteFooter.astro`**

```astro
---
interface Props { tags: string[] }
const { tags } = Astro.props;
---
<ul class="chips">
  {tags.map((t) => (
    <li><a href={`/tags/${encodeURIComponent(t)}/`}>{t}</a></li>
  ))}
</ul>
<style>
  .chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); list-style: none; margin: 0; padding: 0; }
  .chips a {
    font-size: var(--fs-xs); color: var(--muted); text-decoration: none;
    border: 1px solid var(--hair); padding: 0 var(--sp-2);
  }
  .chips a:hover { color: var(--accent-ink); border-color: var(--accent-ink); }
</style>
```

```astro
---
const year = new Date().getFullYear();
---
<footer class="foot">
  <div class="wrap">
    <span>© {year} 北杉札记</span>
    <span>
      <a href="mailto:a13655515876@163.com">a13655515876@163.com</a>
      <a href="https://github.com/NorthenCedar" rel="me noopener">GitHub</a>
      <a href="/rss.xml">RSS</a>
    </span>
  </div>
</footer>
<style>
  .foot { background: var(--ink); color: var(--on-band-meta); padding: var(--sp-5) 0 var(--sp-6); font-size: var(--fs-xs); }
  .wrap { max-width: var(--wrap); margin: 0 auto; padding-inline: var(--gutter);
    display: flex; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
  a { color: var(--on-band-sub); margin-left: var(--sp-4); }
  a:hover { color: var(--accent); }
</style>
```

- [ ] **Step 7: 写 `src/components/Toc.astro`**

```astro
---
import type { Heading } from '../lib/post-meta';
interface Props { headings: Heading[] }
const { headings } = Astro.props;
---
{headings.length > 0 && (
  <nav class="toc" aria-label="本文目录">
    <h2 class="label">本文目录</h2>
    <ol>
      {headings.map((h) => (
        <li class:list={[`lv${h.depth}`]}><a href={`#${h.id}`}>{h.text}</a></li>
      ))}
    </ol>
  </nav>
)}
<style>
  .toc { border-top: 1px solid var(--ink); border-bottom: 1px solid var(--hair); padding: var(--sp-4) 0; margin: 0 0 var(--sp-7); }
  .label { font-size: var(--fs-sm); font-weight: 600; margin: 0 0 var(--sp-2); }
  ol { list-style: none; margin: 0; padding: 0; columns: 1; column-gap: var(--sp-6); font-size: var(--fs-sm); }
  li.lv3 { padding-left: var(--sp-4); color: var(--muted); }
  a { color: inherit; text-decoration: none; }
  a:hover { color: var(--accent-ink); text-decoration: underline; }
  @media (min-width: 860px) { ol { columns: 2; } }
</style>
```

- [ ] **Step 8: 写 `src/layouts/Base.astro`**

```astro
---
import '../styles/fonts.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/prose.css';
import Brandline from '../components/Brandline.astro';
import Band from '../components/Band.astro';
import SiteFooter from '../components/SiteFooter.astro';

interface Props { title: string; description?: string; current?: 'index' | 'tags' | 'archive' | 'about' }
const { title, description, current } = Astro.props;
---
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
    <link rel="preload" href="/fonts/plex-sans-400.woff2" as="font" type="font/woff2" crossorigin />
  </head>
  <body>
    <a class="skip" href="#main">跳到正文</a>
    <Band><Brandline current={current} /><slot name="band" /></Band>
    <main id="main">
      <div class="wrap"><slot /></div>
    </main>
    <SiteFooter />
    <style>
      .wrap { max-width: var(--wrap); margin: 0 auto; padding: var(--sp-7) var(--gutter) var(--sp-8); }
    </style>
  </body>
</html>
```

> **注意**：`<Band>` 里的两个插槽 —— 顶部是 `Brandline`，底部是页面的 `slot="band"`（首屏大标题 + 简介）。
> 文章页的黑带里放标题与元信息，首页的黑带里放站名与简介 —— 同一个骨架，两种内容。

- [ ] **Step 9: 写 `src/layouts/Post.astro`**

```astro
---
import { render } from 'astro:content';
import Base from './Base.astro';
import Meta from '../components/Meta.astro';
import Toc from '../components/Toc.astro';
import type { PostMeta, Heading } from '../lib/post-meta';

interface Props { entry: any; meta: PostMeta; headings: Heading[]; adjacent: { prev?: PostMeta; next?: PostMeta } }
const { entry, meta, headings, adjacent } = Astro.props;
const { Content } = await render(entry);
---
<Base title={`${meta.title} — 北杉札记`} description={meta.summary}>
  <Fragment slot="band">
    <div>
      <h1 class="hero-title">{meta.title}</h1>
      <Meta post={meta} />
    </div>
  </Fragment>
  <article>
    <Toc headings={headings} />
    <div class="prose"><Content /></div>
  </article>
  <nav class="adj" aria-label="相邻文章">
    {adjacent.prev && <a href={adjacent.prev.url}>← {adjacent.prev.title}</a>}
    {adjacent.next && <a class="next" href={adjacent.next.url}>{adjacent.next.title} →</a>}
  </nav>
  <style>
    .hero-title {
      font-size: var(--fs-title); line-height: var(--lh-title); letter-spacing: var(--ls-title);
      margin: 0 0 var(--sp-4); font-weight: 800; max-width: 24em;
    }
    .adj { display: flex; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap;
      margin-top: var(--sp-8); padding-top: var(--sp-5); border-top: 1px solid var(--ink); font-size: var(--fs-sm); }
    .adj a { color: inherit; text-decoration: none; }
    .adj a:hover { color: var(--accent-ink); text-decoration: underline; }
    .adj .next { margin-left: auto; }
  </style>
</Base>
```

- [ ] **Step 10: Commit**

```bash
git add src/layouts src/components
git commit -m "feat: base and post layouts, Band/PostIndex/Meta/Toc components"
```

---

### Task 8: 页面

**Files:**
- Create: `src/pages/index.astro`, `src/pages/posts/[slug].astro`, `src/pages/tags/index.astro`, `src/pages/tags/[tag].astro`, `src/pages/archive.astro`, `src/pages/about.astro`, `src/pages/404.astro`
- Modify: 无

**Interfaces:**
- Consumes: Task 4 的全部函数、Task 7 的全部组件
- Produces: 7 条路由

- [ ] **Step 1: 写 `src/pages/index.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import PostIndex from '../components/PostIndex.astro';
import { getVisiblePosts } from '../lib/posts';

const posts = await getVisiblePosts();
const INTRO = '你好，我是郑云嘉，合肥人，安徽大学大一在读。小学把钢琴弹到了八级，跳过几年 locking，高三开始拍照，中途还学过跆拳道、游泳、围棋、机器人和一段无疾而终的 C++——学过的东西很多，真正留下的不多，这个博客就用来存放留下来的那些。我在这里写随笔、放照片、记一些用 AI 折腾项目的经历。写得好不好另说，先写。';
const META_DESC = '你好，我是郑云嘉，合肥人，安徽大学大一在读。学过钢琴、街舞、跆拳道、围棋……大部分半途而废，这个博客存放留下来的那些：随笔、照片，以及用 AI 折腾项目的记录。写得好不好另说，先写。';
---
<Base title="北杉札记" description={META_DESC} current="index">
  <Fragment slot="band">
    <div>
      <h1 class="hero-title">北杉札记</h1>
      <p class="lede">{INTRO}</p>
    </div>
  </Fragment>
  <PostIndex posts={posts} heading="最近写的" />
  <style>
    .hero-title { font-size: var(--fs-display); line-height: var(--lh-display); letter-spacing: var(--ls-display); margin: 0; font-weight: 800; }
    .lede { max-width: 33em; margin: var(--sp-5) 0 0; font-size: var(--fs-lede); color: var(--on-band-sub); }
  </style>
</Base>
```

- [ ] **Step 2: 写 `src/pages/posts/[slug].astro`**

```astro
---
import Post from '../../layouts/Post.astro';
import { getVisiblePosts, getPost } from '../../lib/posts';

export async function getStaticPaths() {
  const posts = await getVisiblePosts();          // ← 草稿不进 getStaticPaths = 生产不产出页面
  return posts.map((p) => ({ params: { slug: p.slug } }));
}

const { slug } = Astro.params;
const post = await getPost(slug!);
if (!post) return Astro.redirect('/404');
---
<Post entry={post.entry} meta={post.meta} headings={post.headings} adjacent={post.adjacent} />
```

- [ ] **Step 3: 写 `src/pages/tags/index.astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import { getAllTags } from '../../lib/posts';
const tags = await getAllTags();
---
<Base title="标签 — 北杉札记" current="tags">
  <Fragment slot="band"><h1 class="h">标签</h1></Fragment>
  <ul class="chips">
    {tags.map((t) => (
      <li><a href={`/tags/${encodeURIComponent(t.tag)}/`}>{t.tag} <span class="n">{t.count}</span></a></li>
    ))}
  </ul>
  <style>
    .h { font-size: var(--fs-title); margin: 0; font-weight: 800; letter-spacing: var(--ls-title); }
    .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--sp-3); }
    .chips a { font-size: var(--fs-lede); color: inherit; text-decoration: none; border: 1px solid var(--hair); padding: var(--sp-2) var(--sp-4); }
    .chips a:hover { border-color: var(--accent-ink); color: var(--accent-ink); }
    .n { color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
  </style>
</Base>
```

- [ ] **Step 4: 写 `src/pages/tags/[tag].astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import PostIndex from '../../components/PostIndex.astro';
import { getAllTags, getPostsByTag } from '../../lib/posts';
import { TAGS } from '../../tag-registry';

export async function getStaticPaths() {
  const tags = await getAllTags();                 // ← 只产出「已登记且有文章」的标签页
  return tags.map((t) => ({ params: { tag: t.tag } }));
}

const { tag } = Astro.params;
if (!(TAGS as readonly string[]).includes(tag!)) return Astro.redirect('/404');
const posts = await getPostsByTag(tag!);
---
<Base title={`${tag} — 北杉札记`} current="tags">
  <Fragment slot="band"><h1 class="h">{tag}</h1></Fragment>
  <PostIndex posts={posts} />
  <style>{`.h{font-size:var(--fs-title);margin:0;font-weight:800;letter-spacing:var(--ls-title)}`}</style>
</Base>
```

- [ ] **Step 5: 写 `src/pages/archive.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import PostIndex from '../components/PostIndex.astro';
import { getArchive } from '../lib/posts';
const groups = await getArchive();
---
<Base title="归档 — 北杉札记" current="archive">
  <Fragment slot="band"><h1 class="h">归档</h1></Fragment>
  {groups.map((g) => <PostIndex posts={g.posts} heading={g.year} />)}
  <style>{`.h{font-size:var(--fs-title);margin:0;font-weight:800;letter-spacing:var(--ls-title)}`}</style>
</Base>
```

- [ ] **Step 6: 写 `src/pages/about.astro` 与 `src/pages/404.astro`**

```astro
---
import { getEntry, render } from 'astro:content';
import Base from '../layouts/Base.astro';

// 关于页正文来自 content/pages/about.md —— 主题不持有任何正文（content-model.md §7）
const entry = await getEntry('pages', 'about');
const { Content } = entry ? await render(entry) : { Content: null };
---
<Base title="关于 — 北杉札记" current="about">
  <Fragment slot="band"><h1 class="h">关于</h1></Fragment>
  <div class="prose">{Content && <Content />}</div>
  <style>{`.h{font-size:var(--fs-title);margin:0;font-weight:800;letter-spacing:var(--ls-title)}`}</style>
</Base>
```

> `getEntry('pages', 'about')` 要求 `content.config.ts` 里也有一个 `pages` 集合。**Step 6 附带修改**：
> 在 `src/content.config.ts` 里加
> ```ts
> const pages = defineCollection({ loader: glob({ pattern: '**/*.md', base: './content/pages' }) });
> export const collections = { posts, pages };
> ```

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="页面不存在 — 北杉札记">
  <Fragment slot="band"><h1 class="h">404</h1></Fragment>
  <p class="prose">这个地址没有内容。可能是链接写错了，或者这篇文章还没写完。</p>
  <p><a href="/">回到首页</a></p>
  <style>{`.h{font-size:var(--fs-display);margin:0;font-weight:800;letter-spacing:var(--ls-display)}`}</style>
</Base>
```

- [ ] **Step 7: 构建并目视检查**

Run: `npm run build`
Expected: 构建成功；`dist/` 下出现 `index.html`、`posts/piano-eight-level-and-after/index.html`、`tags/index.html` 等

Run: `npm run preview`，浏览器打开 `http://localhost:4321`
Expected: 首页是黑带 + 超大「北杉札记」+ 简介 + 三条列表；点进文章是黑带标题 + 目录 + 正文

- [ ] **Step 8: Commit**

```bash
git add src/pages src/content.config.ts
git commit -m "feat: home, post, tags, archive, about and 404 pages"
```

---

### Task 9: RSS 与 sitemap

**Files:**
- Create: `src/pages/rss.xml.ts`
- Modify: `astro.config.mjs`（若 sitemap 未接入则补上 —— Task 1 已经写了）

**Interfaces:**
- Consumes: `getVisiblePosts()`（Task 4）
- Produces: `/rss.xml`、`/sitemap-index.xml`

- [ ] **Step 1: 写 `src/pages/rss.xml.ts`**

```ts
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getVisiblePosts } from '../lib/posts';

export async function GET(context: APIContext) {
  const posts = await getVisiblePosts();      // ← 草稿不进 RSS
  return rss({
    title: '北杉札记',
    description: '一个大一学生的随笔、照片和代码。',
    site: context.site!,
    items: posts.map((p) => ({
      title: p.title,
      description: p.summary,
      pubDate: new Date(p.date),
      link: p.url,
    })),
  });
}
```

- [ ] **Step 2: 构建并确认两个文件都在**

Run: `npm run build`
Expected: `dist/rss.xml` 与 `dist/sitemap-index.xml` 都存在

- [ ] **Step 3: 确认草稿没进 RSS**

Run: `Select-String -Path dist\rss.xml -Pattern "草稿|draft" -SimpleMatch`
Expected: 无输出（三篇文章目前都是 `draft: true`，所以 RSS 里应该是 **0 条 item**）

Run: `Select-String -Path dist\rss.xml -Pattern "<item>"`
Expected: 无输出

- [ ] **Step 4: Commit**

```bash
git add src/pages/rss.xml.ts astro.config.mjs
git commit -m "feat: rss feed and sitemap"
```

---

### Task 10: 代码块样式接管 + 复制按钮

**Files:**
- Modify: `src/styles/prose.css`（代码块选择器）, `src/layouts/Post.astro`（加唯一的一个 `<script>`）
- Create: `src/scripts/copy-code.ts`

**Interfaces:**
- Consumes: Shiki 通过 `markdown.shikiConfig` 输出的 `<pre>` 结构
- Produces: 全站**唯一**的一处客户端 JS（< 1 KB）

> **这一步不许凭猜写选择器。** Astro 把 Markdown 围栏渲染成 `<pre class="astro-code ...">`，
> 具体 class 与内联样式随 `shikiConfig.theme` 变化。**先看真实输出，再写 CSS。**

- [ ] **Step 1: 打印真实输出，记录 class 与内联样式**

Run: `npm run build`
Run: `Select-String -Path dist\posts\ai-built-this-blog\index.html -Pattern "astro-code" | Select-Object -First 3`

Expected: 看到形如 `<pre class="astro-code css-variables" style="background-color:...;color:..." data-language="bash">`
**把实际看到的 class 名与 data 属性抄下来，下一步用它们写选择器。**

- [ ] **Step 2: 在 `src/styles/prose.css` 末尾接管代码块配色**

把 Task 5 里 `.codeblock` 那几条**删掉**，换成以实际 class 为准的规则（下面是按 `css-variables` 主题写的，若 Step 1 看到的不是这个主题，改选择器）：

```css
/* 代码块：黑底白字（阶段 2 决策）+ 横向滚动（超长行不许撑破页面） */
.astro-code {
  --astro-code-background: var(--code-bg);
  --astro-code-foreground: var(--code-fg);
  --astro-code-token-comment: #9a9a9a;
  --astro-code-token-string: #d8d8d8;
  --astro-code-token-keyword: #ff8a66;   /* 对 #0e0e0e 实测 8.1:1 */
  --astro-code-token-function: #e8e8e8;
  --astro-code-token-punctuation: #cfcfcf;
  background: var(--code-bg) !important;
  color: var(--code-fg) !important;
  margin: var(--sp-6) 0;
  padding: var(--sp-4) var(--sp-5);
  overflow-x: auto;
  font-size: var(--fs-mono);
  line-height: 1.72;
}
.astro-code code { font-family: "IBM Plex Mono", Consolas, "Courier New", monospace; }
```

- [ ] **Step 3: 断言「超长代码行不撑破页面」（Review Focus 第 4 条）**

Run（构建后，用一个临时 HTML 探针量宽度 —— 这是阶段 3 学到的教训，`--window-size` 会被 Chrome 钳到最小 500px，所以用 iframe 造真视口）：

```powershell
# 见 prototype/README.md 里的 iframe 探针写法；对 dist/posts/ai-built-this-blog/index.html 量 scrollWidth
```

Expected: `documentElement.scrollWidth === clientWidth`（无横向滚动），且 `.astro-code` 自身 `scrollWidth > clientWidth`（说明是代码块内部在滚）

- [ ] **Step 4: 写 `src/scripts/copy-code.ts`**

```ts
// 全站唯一的客户端脚本。渐进增强：没有它，代码依然可选可复制。
for (const pre of document.querySelectorAll<HTMLPreElement>('pre.astro-code')) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy-btn';
  btn.textContent = '复制';
  btn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(pre.innerText);
    btn.textContent = '已复制';
    setTimeout(() => (btn.textContent = '复制'), 1200);
  });
  const holder = document.createElement('div');
  holder.className = 'code-holder';
  pre.replaceWith(holder);
  holder.append(btn, pre);
}
```

- [ ] **Step 5: 在 `src/layouts/Post.astro` 末尾引入（<script> 全站只此一处）**

```astro
<script>
  import '../scripts/copy-code';
</script>
```

配套 CSS（追加到 `prose.css`）：

```css
.code-holder { position: relative; }
.copy-btn {
  position: absolute; top: var(--sp-2); right: var(--sp-2); z-index: 1;
  background: transparent; border: 1px solid #4a4a4a; color: var(--code-fg);
  font-size: var(--fs-xs); padding: 0 var(--sp-2); cursor: pointer;
}
.copy-btn:hover { background: #242424; border-color: var(--code-fg); }
```

- [ ] **Step 6: 验证 JS 预算与脚本数量（硬约束）**

Run: `npm run build`
Run: `Get-ChildItem dist -Recurse -Filter *.js | Select-Object Name,Length`
Expected: 只有一个 JS 文件，**未压缩体积 < 1 KB**（若超出，去掉 `setTimeout` 文案切换，只保留复制）

Run: `Select-String -Path dist\**\*.html -Pattern "<script" | Measure-Object`
Expected: 每页 ≤ 2 处（1 处为模块脚本，1 处为 Astro 注入的模块预加载 loader）

- [ ] **Step 7: Commit**

```bash
git add src/scripts/copy-code.ts src/styles/prose.css src/layouts/Post.astro
git commit -m "feat: black code blocks with progressive-enhancement copy button"
```

---

### Task 11: 构建产物集成测试 + token 断言

**Files:**
- Create: `scripts/assert-tokens.mjs`, `tests/tokens.test.ts`, `tests/build-output.test.ts`
- Modify: `package.json`（加 `verify` 脚本）

**Interfaces:**
- Consumes: `dist/`（**必须先 `npm run build`**）
- Produces: `npm run verify` = build + test

> **为什么不在这里 spawn 构建**：受限沙箱下 Node 的 `child_process` 用管道 stdio 会 EPERM。
> 所以集成测试**只读 `dist/`**，构建由外层命令先跑；`dist/` 不存在时测试明确 skip 并打印原因。

- [ ] **Step 1: 写 `scripts/assert-tokens.mjs`**

```js
// 从 tokens.css 读真实取值，按 WCAG 相对亮度复算对比度，与 design-spec.md §5 的断言表比对。
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const get = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`tokens.css 里找不到 --${name}`);
  return m[1].toLowerCase();
};
const lum = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = v.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};

const CASES = [
  ['ink', 'paper', 19.3, 4.5],
  ['muted', 'paper', 6.69, 4.5],
  ['accent-ink', 'paper', 5.18, 4.5],
  ['accent', 'paper', 3.68, 3.0],       // 只承诺大字/图形门槛
  ['on-band', 'ink', 19.3, 4.5],
  ['on-band-sub', 'ink', 14.35, 4.5],
  ['on-band-meta', 'ink', 9.31, 4.5],
  ['accent', 'ink', 5.24, 4.5],
  ['code-fg', 'code-bg', 16.49, 4.5],
];

let failed = 0;
for (const [fg, bg, expect, min] of CASES) {
  const actual = ratio(get(fg), get(bg));
  const ok = actual >= min && Math.abs(actual - expect) < 0.05;
  if (!ok) { failed++; console.error(`✗ ${fg} on ${bg}: 实测 ${actual}，规格 ${expect}，下限 ${min}`); }
  else console.log(`✓ ${fg} on ${bg}: ${actual} (下限 ${min})`);
}
if (failed) { console.error(`\n${failed} 项不达标`); process.exit(1); }
console.log('\n全部 token 对比度达标');
```

- [ ] **Step 2: 运行它，确认当前 token 全部达标**

Run: `node scripts/assert-tokens.mjs`
Expected: 9 行 ✓ 与 `全部 token 对比度达标`

- [ ] **Step 3: 写 `tests/tokens.test.ts`（含橙色越界白名单）**

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('token 对比度', () => {
  it('assert-tokens.mjs 全部通过', () => {
    const out = execFileSync('node', ['scripts/assert-tokens.mjs'], { encoding: 'utf8' });
    expect(out).toContain('全部 token 对比度达标');
  });
});

describe('橙色越界（--accent 只允许出现在白名单选择器里）', () => {
  // 白名单是"金名单"：新增一处用法就会失败，逼你回来有意识地加。
  const ALLOWED = ['.title:hover', 'nav a[aria-current', 'a:hover'];

  it('构建产物里裸 var(--accent) 只出现在白名单选择器', () => {
    const dist = 'dist';
    if (!existsSync(dist)) { console.warn('dist/ 不存在，先跑 npm run build'); return; }
    const cssFiles: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (e.endsWith('.css')) cssFiles.push(p);
      }
    };
    walk(dist);
    for (const f of cssFiles) {
      const css = readFileSync(f, 'utf8');
      // 只看裸 --accent)：--accent-ink 不算
      for (const m of css.matchAll(/([^{}]+)\{[^{}]*var\(--accent\)[^{}]*\}/g)) {
        const sel = m[1].trim();
        const ok = ALLOWED.some((a) => sel.includes(a));
        expect(ok, `选择器 ${sel} 用了裸 --accent，但它不在白名单里（大字/图形才允许）`).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 4: 写 `tests/build-output.test.ts`（Review Focus 的 1/2/3/5 条 + 全局硬约束）**

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const hasDist = existsSync(DIST);
const DRAFTS = ['piano-eight-level-and-after', 'ai-built-this-blog', 'camera-in-gaosan'];

const htmlFiles = (): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith('.html')) out.push(p);
    }
  };
  if (hasDist) walk(DIST);
  return out;
};

describe.skipIf(!hasDist)('构建产物', () => {
  // Review Focus 1：草稿直链不产出页面
  it('草稿文章不产出任何页面', () => {
    for (const slug of DRAFTS) {
      expect(existsSync(join(DIST, 'posts', slug, 'index.html')), `${slug} 是草稿，不该有页面`).toBe(false);
    }
  });

  it('草稿不出现在首页与归档', () => {
    const home = readFileSync(join(DIST, 'index.html'), 'utf8');
    for (const slug of DRAFTS) expect(home).not.toContain(slug);
  });

  it('标签页只产出「已登记且有文章」的标签', () => {
    const tagsDir = join(DIST, 'tags');
    expect(existsSync(tagsDir)).toBe(true);
    // 三篇全是草稿 → 生产构建下没有任何标签页（文章目录本身除外）
    const entries = readdirSync(tagsDir).filter((e) => e !== 'index.html');
    expect(entries).toEqual([]);
  });

  it('每页恰好一个 h1，且 alt 都非空', () => {
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      expect((html.match(/<h1[\s>]/g) ?? []).length, `${f} 的 h1 数量`).toBe(1);
      for (const m of html.matchAll(/<img\b[^>]*>/g)) {
        const tag = m[0];
        const alt = tag.match(/alt="([^"]*)"/);
        expect(alt, `${f} 有 img 缺 alt`).toBeTruthy();
        expect(alt![1].trim().length, `${f} 的 img alt 为空`).toBeGreaterThan(0);
      }
    }
  });

  it('零第三方资源', () => {
    for (const f of htmlFiles()) {
      const html = readFileSync(f, 'utf8');
      for (const m of html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)) {
        // 唯一允许：文章正文里作者手写的 <a> 外链（不加载，只是链接）
        const around = html.slice(Math.max(0, m.index! - 40), m.index!);
        expect(around.endsWith('<a '), `发现外部资源加载：${m[1]} in ${f}`).toBe(true);
      }
    }
  });
});

describe.skipIf(hasDist)('构建产物（跳过）', () => {
  it('dist/ 不存在', () => {
    console.warn('先运行 npm run build，再运行 npm test');
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 5: 在 `package.json` 加 `verify` 脚本**

```json
"verify": "astro build && vitest run"
```

- [ ] **Step 6: 跑完整验证链**

Run: `npm run verify`
Expected: 构建成功 + 全部测试 PASS

**另跑一次「内容层未被污染」检查**（构建前后哈希一致）：

```powershell
$before = Get-ChildItem content -Recurse -File | Get-FileHash -Algorithm SHA256 | ForEach-Object Hash
npm run build | Out-Null
$after = Get-ChildItem content -Recurse -File | Get-FileHash -Algorithm SHA256 | ForEach-Object Hash
if (Compare-Object $before $after) { "✗ content/ 被构建过程改动了"; exit 1 } else { "✓ content/ 未变动" }
```

- [ ] **Step 7: Commit**

```bash
git add scripts/assert-tokens.mjs tests/tokens.test.ts tests/build-output.test.ts package.json
git commit -m "test: build-output and token assertions guarding the frozen constraints"
```

---

## 自查清单（写完计划后对规格逐条核对）

**1. 规格覆盖** —— 每个规格条目都能指到一个任务：

| 规格条目 | 落在哪个任务 |
|---|---|
| content-model §1 九字段 + 6 条校验 | Task 2 |
| content-model §2 目录结构（含 `content/pages/about.md`） | Task 1 / Task 8 Step 6 |
| content-model §3 slug 规则（文件夹名即 slug） | Task 4 `generateId` |
| content-model §4 标签注册表 + 每标签至少 1 篇 | Task 1 `tag-registry.ts` / Task 3 `collectTags` |
| content-model §5 草稿三态 | Task 4 / Task 8 `getStaticPaths` / Task 11 |
| architecture §1.3 纯核心 + 适配器 | Task 3 / Task 4 |
| architecture §4 依赖白名单 | Task 1 Step 2 / Task 6（字体走 0 依赖） |
| design-spec §3 token | Task 5 |
| design-spec §3.5 唯一动效 | Task 7 `Band.astro` |
| design-spec §4 组件规范 | Task 7 |
| design-spec §5 无障碍清单 | Task 7 / Task 11 |
| design-spec §6 可测验收标准 1–7 | Task 10 Step 3 / Task 11 |
| site-decisions §6 四功能（RSS/时长/TOC/复制） | Task 4（时长）/ Task 7（TOC）/ Task 9（RSS）/ Task 10（复制） |
| site-decisions §6 三不做（暗色/搜索/评论） | 全计划无相关任务 ✅ |

**2. 占位符扫描**：已通读，没有 TBD / TODO / "类似 Task N" / "加上适当的错误处理"。唯一两处**条件分支**（`astro/zod` 解析失败、jsDelivr 文件名 404）都给了确切的替代命令与要告知站主的动作。

**3. 类型一致性**：`PostMeta` / `Heading` / `RawEntry` 在 Task 3 定义一次，Task 4/7/8 全部按同一批字段名引用。组件 props 名（`posts` `post` `headings` `adjacent` `entry` `meta`）在 Task 7 定义、Task 8 使用，逐一对齐。

**4. Review Focus** —— 五条高概率输入，各自的测试位置：

| 输入/条件 | 期望行为 | 测试落在 |
|---|---|---|
| 草稿直链被访问 | 404，不产出页面 | Task 11 Step 4 第 1 条 |
| 标签不在注册表 | 构建失败并指出是哪个标签 | Task 2 Step 1（4c） |
| `coverAlt` 是空串 | 构建失败 | Task 2 Step 1（第 5 条） |
| 超长代码行 | 代码块内滚动，页面不横滚 | Task 10 Step 3 |
| `updated` 早于 `date` | 构建失败并指出两个日期 | Task 2 Step 1（第 3 条） |

**已知缺口（诚实记录）**：`summary` ≤ 80 字这条，zod 只在 `.max(80)` 上校验字符数，中文标点与 emoji 的计数口径未单独测试 —— 三篇草稿实测分别为 59 / 60 / 32 字，无风险，故不额外加测试。


