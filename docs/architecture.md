# 架构与接缝（阶段 4）

> 目的：在写代码之前把「东西放在哪、谁能碰谁」定死。
> 术语按 `codebase-design` 的词汇表：**模块 / 接口 / 深度 / 接缝 / 适配器**。

---

## 0. 一句话

内容是纯文本契约，表现是 B 版式的组件，**中间只有一层薄而深的 `src/lib/posts.ts`** —— 所有环境相关的、派生的、要校验的事都收在这一层，页面只做拼装。

```
content/                      ← 内容层：纯文本 + 图片，无模板（契约见 content-model.md）
   │
   ├─ src/content.config.ts   ← 适配器（浅）：声明 loader + zod schema
   │
   ├─ src/lib/posts.ts        ← ★ 唯一接缝（深）：查询 / 校验 / 派生 / 草稿三态
   │
   ├─ src/components/*.astro  ← 表现层：只接 props，不取数
   ├─ src/layouts/*.astro     ← 表现层：页面外壳
   ├─ src/pages/*.astro       ← 路由：只做拼装，每页 ≤ 40 行
   └─ src/styles/*.css        ← token / 基础 / 正文排版（换主题只动这里 + 组件）
        │
        ▼
      dist/                    ← 纯静态 HTML + CSS + 极少量原生 JS
```

---

## 1. 模块清单

### 1.1 内容层 `content/`（契约，不是代码模块）

- **接口**：9 个 frontmatter 字段 + `posts/<slug>/index.md` 目录约定 + 6 条校验规则。
- 这里没有"实现"可言，深度体现在**规则数量与字段数量之比**：6 条校验、3 态草稿语义、图片同目录、标签注册表 —— 全部由 9 个字段名承载。这是刻意压出来的比例。
- 它不认识 Astro，也不认识 CSS。换框架时它一行不改。

### 1.2 `src/content.config.ts`（适配器，浅）

```ts
const posts = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './content/posts' }),
  schema: z.object({ /* 9 个字段 */ }),
});
```

- **接口**：一个 collection 名 `posts`。
- **为什么浅**：它只做声明。但它独占了「字段类型 / 必填性」的知识，所以是这件事的**唯一事实来源**。
- **它做不了的**：跨字段与跨文件的规则（标签必须在注册表里、`updated >= date`、`cover` 必须配 `coverAlt`、未登记字段警告）。zod 的 `.refine()` 能做一部分，但「标签注册表」要读文档 → 放 lib。**这是刻意分工，不是遗漏。**

### 1.3 `src/lib/post-meta.ts`（纯函数核心，深模块）★ + `src/lib/posts.ts`（薄适配器）

**规划阶段修订**：原本设计成一个模块，写计划时发现 `posts.ts` 一旦 `import { getCollection } from 'astro:content'`
就**没法在 vitest 里单测**（`astro:content` 只在 Astro 运行时存在）。
所以拆成「纯核心 + 薄适配器」—— 这既让核心可测，也让核心真正变深。

**`post-meta.ts`（纯函数，零 Astro 依赖，全部可单测）**

```ts
type RawEntry = { id: string; data: RawData; body?: string; headings: MarkdownHeading[] };
type PostMeta  = { slug, title, date, summary, tags, draft, url, charCount, readingMinutes };

function toPostMeta(entry: RawEntry): PostMeta;
function sortByDateDesc(posts: PostMeta[]): PostMeta[];
function filterVisible(posts: PostMeta[], isDev: boolean): PostMeta[];
function countChars(markdown: string): number;          // 中文按字，拉丁按词
function readingMinutes(charCount: number): number;
function groupByYear(posts: PostMeta[]): { year: string; posts: PostMeta[] }[];
function collectTags(posts: PostMeta[]): { tag: string; count: number }[];
function adjacentOf(posts: PostMeta[], slug: string): { prev?: PostMeta; next?: PostMeta };
function validateEntries(entries: RawEntry[]): { errors: string[]; warnings: string[] };
function headingTree(headings: MarkdownHeading[]): Heading[];   // 只留 h2/h3
```

**`posts.ts`（薄适配器，约 40 行）** —— 只做三件事：调 `getCollection('posts')`、读 `import.meta.env.DEV`、把结果喂给纯核心。

```ts
function getVisiblePosts(): Promise<PostMeta[]>;
function getPost(slug): Promise<{ entry; meta: PostMeta; adjacent: {prev?, next?} } | undefined>;
function getAllTags(): Promise<{ tag: string; count: number }[]>;
function getPostsByTag(tag): Promise<PostMeta[]>;
function getArchive(): Promise<{ year: string; posts: PostMeta[] }[]>;
```

**规划后修订（实现时发现的两处）**：
1. `getPost` **不返回标题树**。`deferRender: true` 之后 `entry.rendered` 在查询期不可用，
   标题树改由 `layouts/Post.astro` 在 `render(entry)` 之后取得并用 `headingTree()` 转换。
   代价是布局层多认识一个 Astro 类型；换来的是「草稿素材不会因为同步期渲染而产出」。
2. `validateEntries()` 没有实现，也**不应该**实现：六条校验规则已经全部落在 `schema.ts` 的 zod 里
   （标签注册表成了 TS 常量，所以跨文件的规则也能表达）。再写一个校验函数就是第二份事实来源。

**接口背后藏着什么**（深度来源，全部在 `post-meta.ts` 里）：

1. **草稿可见性判定** —— `filterVisible(posts, isDev)`，环境值由适配器注入（**接受依赖，不自己创建**）。
2. **6 条校验规则里 zod 表达不了的 4 条** —— 标签数量与登记、`cover`+`coverAlt` 配对、`updated >= date`、未登记字段警告。
3. **派生数据** —— 字数、阅读时长、URL 拼装、标题树（h2/h3）。
4. **排序与分组** —— 日期倒序、按年归档、按标签聚合、相邻文章。

**删除测试**：把 `post-meta.ts` 删掉，上面 4 类逻辑会重新散进 7 个页面 + RSS 端点 + 若干测试。
→ **复杂度会重新出现在 N 个调用点，说明它确实在赚饭吃。深度成立。**

**为什么不做"内容源适配器"**：现在只有「本地 Markdown」一种实现。
**一个适配器 = 假接缝**（`codebase-design`：两个适配器才算真接缝）。等真的要接 CMS 时再抽 —— 那时 `posts.ts` 的接口不变，只换实现。

**测试面 = 接缝**：`post-meta.ts` 是纯函数，单测直接喂 fixture 对象，不碰文件系统、不碰 Astro。

### 1.4 `src/pages/*`（浅，只拼装）

| 页面 | 路由 | 取数 |
|---|---|---|
| 首页 | `/` | `getVisiblePosts()` |
| 文章详情 | `/posts/[slug]/` | `getPost()`（相邻文章含在返回值里） |
| 标签总览 | `/tags/` | `getAllTags()` |
| 单标签 | `/tags/[tag]/` | `getPostsByTag()` |
| 归档 | `/archive/` | `getArchive()` |
| 关于 | `/about/` | 读 `content/pages/about.md` |
| 404 | `/404` | 无 |
| RSS | `/rss.xml` | `getVisiblePosts()` |

每个页面只做**取数 → 传给组件**。页面里不允许出现环境判断、`filter(draft)`、日期格式化。
（原来是"每页 ≤ 40 行"的硬数字，改成上面这条更有意义的要求 —— 行数是伪指标。）

### 1.5 `src/components/*`（表现层，只接 props）

`SiteHeader` `SiteFooter` `PostBand`（黑带标题）`PostIndex`（超大标题堆叠）`Toc` `TagChips` `DraftBadge` `ReadTime` `ProseStyles`

- **接口**：只有 props，没有取数、没有全局状态。所以同一个 `PostIndex` 能同时服务首页 / 标签页 / 归档页 —— 这是深度带来的杠杆。
- **唯一的例外**：`src/scripts/copy-code.ts` —— 约 30 行的渐进增强脚本。
  它在代码块**外面**套一条工具栏（语言标注 + 复制按钮），不改代码本身，**JS 关闭时工具栏不出现、代码照样可选可复制**。
  （设计初稿写的是"不改 DOM 结构"，实现时发现要放工具栏就得加一层包裹 —— 改的是这份文档，不是偷偷越界。）

### 1.6 `src/styles/`（三个文件，换主题的唯一入口）

| 文件 | 内容 | 谁可以改 |
|---|---|---|
| `tokens.css` | 配色 / 字号 / 间距 / 动效的 CSS 变量 | 改版式时 |
| `base.css` | 重置、焦点环、字体栈、页面级关系 | 改版式时 |
| `prose.css` | 正文排版（标题/引用/列表/代码/表格/图片） | 改版式时 |

**关键约束：换主题只允许动 `src/`，一行都不许碰 `content/`。** 这条由 `content-model.md` 冻结，阶段 6 会用一个测试守住。

---

## 2. 接缝为什么切在这里

三条理由，按重要性：

1. **真正会独立变化的东西只有两样：内容 和 版式。** 所以接缝必须让这两者互不知道对方。中间只需要一个共用的数据结构 —— `PostMeta`。把它定死，两边就能各自演化。
2. **环境差异（dev/prod）是真实存在的变量。** 草稿可见性随环境变，这是 `codebase-design` 说的"有东西在接缝两侧真的变化"，所以这个接缝是正当的，不是假接缝。
3. **测试面必须等于接缝。** `posts.ts` 用 fixture 目录单测；渲染用构建产物集成测。**不需要**为了测试去穿透接口。

---

## 3. 测试策略（阶段 6 落地）

**单元（`posts.ts` + 临时 fixture 内容目录）**
- 6 条校验规则各一个用例（含"未登记标签"必须报错这条）
- 草稿三态：dev 可见 / prod 排除 / 直链不产出
- 派生：字数、阅读时长、标题树、上一篇下一篇

**集成（`npm run build` 之后断言 `dist/`）**
- `draft: true` 的文章：无 HTML 产出、不在首页、不在 `/tags/`、不在 `/archive/`、不在 `rss.xml`
- 每个产出页面恰好 1 个 `<h1>`、`<html lang="zh-CN">`、所有 `<img>` 的 `alt` 非空
- 标签页只列注册表里的标签（不出现只有 0 篇文章的标签）
- **内容层未被污染**：构建前后 `content/` 的哈希不变

**不做**：组件快照测试（脆、价值低）、E2E（站点没有交互状态可测）。

---

## 4. 依赖预算（每加一个都要有理由）

| 包 | 加不加 | 理由 |
|---|---|---|
| `astro` | ✅ | 框架本体 |
| `sharp` | ✅ | 图片优化。**由 astro 作为 optionalDependency 传递安装**，本机实测可用（`@esbuild/win32-x64` 同理）；不需要在 package.json 里显式声明 |
| `@astrojs/rss` | ✅ | 你选了要 RSS；官方包，比手写 XML 省事 |
| `@astrojs/sitemap` | ✅ | SEO。2026-09-25 站主同意加入（构建期依赖，不进浏览器） |
| `@astrojs/mdx` | ❌ | 你选了纯 Markdown |
| `vitest` | ✅ | 测试跑在 `posts.ts` 上；这是唯一为测试引入的依赖 |
| Tailwind / CSS-in-JS | ❌ | 多一层构建，收益为负：我们的 CSS 总量预计 < 400 行 |
| 任何 UI 组件库 / 图标库 | ❌ | 唯一需要的图标是一个内联 SVG |
| `@shikijs/transformers` | ❌ | 代码高亮用 Astro 内置的 Shiki，不加行号也不需要 transformers |

**运行时（发给浏览器的 JS）**：只有一个代码复制按钮。目标 < 1 KB，无框架、无 polyfill。

---

## 5. 负面声明（明确不做）

- 不做内容源抽象层 / 依赖注入容器 / repository 接口
- 不做客户端路由、SPA、预取
- 不引入 ESLint / Prettier 生态（阶段 6 如果发现确实需要再加，届时说明理由）
- 不做暗色模式、站内搜索、评论（阶段 1 已定）
- 不做 `content/` 的自动迁移脚本 —— 契约冻结后，内容文件是权威
