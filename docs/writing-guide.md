# 怎么写一篇文章（作者手册）

> 面向站主自己。所有规则都以 `content-model.md` 为准，这份是操作版。
> 你只需要碰 `content/` 一个目录 —— 主题、样式、构建脚本都不用管。

---

## 最短路径（复制粘贴版）

```powershell
cd <博客仓库>

# 1. 建文件夹（文件夹名 = URL，必须英文小写连字符）
mkdir content\posts\my-new-post

# 2. 建正文文件
#    （下面用记事本打开；你也可以用 VS Code）
notepad content\posts\my-new-post\index.md

# 3. 图片直接丢进同一个文件夹
copy 你的照片.jpg content\posts\my-new-post\

# 4. 本地预览（草稿在这里也能看见，标题旁会有「草稿」标记）
npm run dev          # 浏览器打开 http://localhost:4321

# 5. 确认没问题后，转正 + 上线
#    （把 frontmatter 的 draft 改成 false）
npm run verify       # 构建 + 全部测试；挂了就别推
git add -A
git commit -m "post: 新文章标题"
git push             # 推送后 Cloudflare Pages 约 1 分钟自动上线
```

---

## 一、正文文件的骨架

`content/posts/<文件夹名>/index.md`：

```markdown
---
title: 文章标题写这里，可以很长
date: 2026-10-01
summary: 一句话摘要，最多 80 字，会出现在列表页和搜索引擎结果里。
tags: [随笔]
draft: true
---

正文从这儿开始。

## 一级小节

普通段落。**加粗**、*斜体*、`行内代码`、[外链](https://example.com) 都照常写。

- 无序列表
- 第二项

1. 有序列表
2. 第二项

> 引用写这样。

### 二级小节

| 表头 | 表头 |
| --- | --- |
| 单元格 | 单元格 |

```js
// 代码块写上语言名，会自动上色
const a = 1;
```
```

### frontmatter 的 9 个字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | ✅ | 标题，会出现在列表、文章页、RSS |
| `date` | ✅ | `YYYY-MM-DD`。**加不加引号都行**（构建时会归一化） |
| `summary` | ✅ | **最多 80 字**，超了构建失败 |
| `tags` | ✅ | **1–3 个**，且必须是已登记的标签（见下） |
| `draft` | ✅ | **必须显式写** true 或 false，漏了构建失败 |
| `updated` | ⬜ | `YYYY-MM-DD`。写了，文章页会显示「更新于」 |
| `cover` | ⬜ | 头图路径，例如 `./cover.jpg` |
| `coverAlt` | ⬜ | **有 `cover` 就必须有非空的它**，否则构建失败 |
| `slug` | ⬜ | 想改 URL 时写；不写就用文件夹名 |

> ⚠️ **`cover` 目前只校验、不上任何页面。** 契约里定义了它，但主题还没渲染头图
> （三篇文章都没用，所以当时按 YAGNI 搁置了）。**你要用头图的话先告诉我**，我加渲染。

---

## 二、标签：唯一的"你必须先登记"规则

现在登记在 `src/tag-registry.ts` 里的只有 6 个：

```
AI · 建站 · 摄影 · 成长 · 随笔 · 钢琴
```

**用没登记的标签，构建会直接失败**，并告诉你具体是哪个标签。这是故意的 ——
为了防止半年后出现「前端 / 前端开发 / frontend」三个同义标签。

### 想加新标签，两步

1. 打开 `src/tag-registry.ts`，往数组里加一个（**短中文词，2–5 字，不加层级**）：

```ts
export const TAGS = ['AI', '建站', '摄影', '成长', '随笔', '钢琴', '读书'] as const;
```

2. **确保至少有一篇文章真的用它** —— 否则 `npm test` 会失败（有个测试守着「每个登记标签至少有一篇文章」）。

> 如果你只是登记了但还没写那类文章，就**先别登记** —— 等真有文章了再加。

---

## 三、图片

### 放哪里

**放进那篇文章自己的文件夹**，和 `index.md` 并排：

```
content/posts/my-new-post/
├── index.md
├── cover.jpg
└── 路上拍的那张.jpg
```

（文件名用中文也可以，但 URL 里会变成百分号编码，建议用英文。）

### 正文里怎么引用

```markdown
![这张图在拍什么，用一句话说清楚](./路上拍的那张.jpg)
```

**`![...]` 里的文字必须写，而且要是人话** —— 那是 `alt`，是给看不到图的人（和搜索引擎）读的。
别写「图片」「照片」，写「傍晚的操场，跑道上有三个人在散步」这种。

> 写空 alt 不会让**构建**失败，但会让 `npm test` 失败。
> 所以**推之前务必跑一次 `npm run verify`** —— Cloudflare 只跑构建，不跑测试。

### 图片会被自动处理

- 自动转成 WebP，并生成多尺寸 `srcset`（手机下小图、桌面上大图）
- **不用你自己压缩**，原图直接丢进去就行
- 正文里的图片宽度会自动撑满正文栏，不用写宽度

---

## 四、草稿与上线

| `draft` | 本地 `npm run dev` | 线上 |
|---|---|---|
| `true` | 看得见，标题旁有「草稿」标记 | **完全不产出**：列表、标签页、归档、RSS、sitemap 里都没有，直接访问 URL 也是 404 |
| `false` | 看得见 | 正常发布 |

**上线 = 把 `draft` 改成 `false`，然后 `git push`。**

草稿的图片也不会被部署（构建脚本会把「只被草稿引用」的素材删掉）。

**想撤下一篇文章**：把 `draft` 改回 `true` 再 push 即可 —— 别删文件夹。

---

## 五、URL 与文件夹名

- **文件夹名就是 URL**：`content/posts/my-new-post/` → `https://personal-br4.pages.dev/posts/my-new-post/`
- 只允许小写字母、数字、单个连字符：`my-new-post` ✅ ｜ `My_New_Post` ❌ ｜ `我的新文章` ❌
- **这条现在是构建期硬校验**：文件夹名不合法，`npm run build` 直接失败并告诉你是哪个文件夹。
  （以前它只写在文档里、没人执行 —— 建个中文文件夹会静默生成中文 URL。）
- 长度上限 60 字符。
- **发布之后不要改文件夹名**，那是死链。要改标题就只改 `title`。
- 中文标题没问题 —— 标题写在 `title` 里，文件夹用英文。想自定义 URL 就写 `slug:`。
  写了 `slug:` 但和文件夹名不一致时，构建会**告警**提醒你 URL 会用哪个（契约 §3 的要求）。

---

## 六、写完推之前的检查清单

```powershell
cd <博客仓库>
npm run verify
```

它会依次做：构建 → 清理草稿素材 → 跑 49 个测试。**全绿再推。**

测试会替你抓这些错：

- 缺必填字段 / `summary` 超 80 字 / 标签数量不对 / 标签没登记
- `updated` 早于 `date`
- 有 `cover` 没有 `coverAlt`
- **图片 alt 是空的**
- 页面出现多个 `<h1>`、`lang` 不对
- 引入了第三方资源 / Google Fonts

### 推上去之后

Cloudflare Pages 会自动构建部署，**约 1 分钟**。想确认：

```powershell
curl.exe -sI https://personal-br4.pages.dev/posts/my-new-post/ | Select-String "HTTP/"
```

看到 `HTTP/2 200` 就是上线了。

---

## 七、常见问题

**Q：本地起不来 / 报 `spawn EPERM`？**
这台机器的沙箱会拦 vite 的子进程。需要在更宽的权限下运行（之前整个开发过程都是这么跑的）。

**Q：能写 `.mdx` 吗？**
不能，也不打算支持 —— 你当初选的是纯 Markdown，理由是「正文里能嵌组件等于把表现层写进内容文件」。

**Q：能换主题吗？**
能。`content/` 一个字节都不用动，只改 `src/`。这是整个架构的目的。

**Q：文章怎么排序？**
按 `date` 倒序。归档页按年分组。都是自动的。

**Q：想改站点名 / 首页简介 / 页脚邮箱 / GitHub？**
全部在 **`content/site.md`** 一个文件里，不用碰任何代码：

```markdown
---
name: 北杉札记
wordmark: North_Cedar's notes
intro: 首页那句长简介……
metaDescription: 搜索引擎与分享卡片用的短句（≤ 120 字）
email: a13655515876@163.com
github: https://github.com/NorthenCedar
---
```

**Q：想改关于页？**
正文在 `content/pages/about.md`，同样是一个 `.md` 文件。

**Q：页面标题格式（`XXX — 北杉札记`）在哪改？**
`src/layouts/Base.astro` 里一行：`const docTitle = title ? \`${title} — ${site.name}\` : site.name;`

> 换句话说：**文字都在 `content/`，版式都在 `src/`。** 这条现在有测试守着 ——
> `src/` 里一旦出现站名或邮箱，`npm test` 就会失败。
