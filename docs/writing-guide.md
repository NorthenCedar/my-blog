# 北杉札记 · 作者手册

> 这份手册给**站主本人**看。它不发布到博客上（是作者工具，不是读者内容）。
> 最后更新：2026-09-25 ｜ 对应仓库：https://github.com/NorthenCedar/personal（**已转私有**）
>
> **怎么打开这份手册：**
> 1. 这台电脑上：`<博客仓库>\docs\writing-guide.md`（推荐用 VS Code 打开，能实时渲染）
> 2. 别的设备上：先登录 GitHub，再访问
>    https://github.com/NorthenCedar/personal/blob/main/docs/writing-guide.md
>    —— **仓库已私有，未登录的人是 404**，所以这一条只对你自己有效
>
> 想在任何设备上不登录就能查？把它发布成 `personal-br4.pages.dev/guide/` 页面即可（那是个独立决定，需要时告诉我）。

---

## 0. 先记住一句话

**文字都在 `content/`，版式都在 `src/`。**

| 你想改的东西 | 去哪改 | 要不要懂代码 |
|---|---|---|
| 写新文章、改文章 | `content/posts/<文件夹>/index.md` | 不用 |
| 换文章里的图片 | 同一个文件夹 | 不用 |
| 站名 / 首页简介 / 页脚邮箱 / GitHub | `content/site.md` | 不用 |
| 关于页 | `content/pages/about.md` | 不用 |
| 标签清单 | `src/tag-registry.ts` | 会改一行数组就行 |
| 导航菜单（文章/标签/归档/关于/RSS） | `src/components/Brandline.astro` | 要认一点代码 |
| 配色 / 字号 / 间距 / 字体 | `src/styles/tokens.css` | 要认一点代码 |
| 域名 | `astro.config.mjs` 一行 | 要认一点代码 |

**记住两条安全线：**

- 改错了都能撤（见 §13 回滚），因为每次发布都在 git 里有记录。
- **本地改完 ≠ 线上变了。** 只有 `git push` 之后，Cloudflare 才重新构建上线。

---

## 1. 在哪敲命令

### 打开终端

按 `Win`，输入 `powershell`，回车。或者在文件资源管理器里进到 `<博客仓库>`，在地址栏输入 `powershell` 回车。

### 每条命令之前先做这一件事

```powershell
cd <博客仓库>
```

所有 `npm` 命令都必须在**这个目录**下跑，否则会找不到项目。

### 你会用到的全部命令

```powershell
npm run dev       # 启动本地预览，改完立刻能看到（按 Ctrl+C 停止）
npm run build     # 只构建，不跑测试
npm run verify    # 构建 + 跑全部测试（57 个）—— 推送前必跑
npm test          # 只跑测试
git add -A        # 把改动标记为"要提交"
git commit -m "说明"   # 存成一个版本
git push          # 推到 GitHub → 自动上线
```

> **这台机器的一个坑**：沙箱默认会拦 vite 的子进程，`npm run dev` / `build` / `test` 会报 `spawn EPERM`。
> 需要在更宽的文件权限下运行（之前整个开发过程都是这么跑的）。

---

## 2. 写一篇新文章（完整流程）

### 2.1 建文件夹

```powershell
cd <博客仓库>
mkdir content\posts\my-new-post
```

**文件夹名 = 网址。** 规则（现在是**构建期硬校验**，写错直接构建失败）：

- 只能小写字母、数字、单个连字符：`my-new-post` ✅
- 不能大写、下划线、空格、中文、首尾连字符、连续连字符：`My_Post` ❌ `我的文章` ❌
- 最长 60 字符
- **发布后不要改**（改了就是死链，见 §5）

### 2.2 建正文文件

```powershell
notepad content\posts\my-new-post\index.md
```

（推荐用 VS Code，能实时预览 Markdown。）

最小可用版本：

```markdown
---
title: 文章标题
date: 2026-10-01
summary: 一句话摘要，最多 80 字。
tags: [随笔]
draft: true
---

正文从这里开始。
```

### 2.3 frontmatter 九个字段，逐个说

| 字段 | 必填 | 写什么 | 写错的后果 |
|---|---|---|---|
| `title` | ✅ | 标题，可以很长、可以中文 | 缺了 → 构建失败 |
| `date` | ✅ | `2026-10-01` 格式。**加不加引号都行** | 格式不对 → 构建失败 |
| `summary` | ✅ | 摘要，**最多 80 字**，出现在列表页和搜索引擎 | 超 80 字 → 构建失败 |
| `tags` | ✅ | `[随笔]` 这种数组，**1–3 个**，必须是已登记的（§4） | 没登记/超 3 个/空 → 构建失败 |
| `draft` | ✅ | `true`（草稿）或 `false`（发布）。**必须写** | 漏了 → 构建失败 |
| `updated` | ⬜ | `2026-10-05`。写了，文章页会显示「更新于 2026-10-05」 | 早于 `date` → 构建失败 |
| `cover` | ⬜ | 头图路径，如 `./cover.jpg` | ⚠️ **目前只校验、不上页面**（见 §3.5） |
| `coverAlt` | ⬜ | 头图的 alt 文字 | 有 `cover` 没它（或是空串）→ 构建失败 |
| `slug` | ⬜ | 想改网址时写，如 `my-url` | 与文件夹名不一致 → **告警**（不失败），网址用 `slug` 的值 |

**`date` 是排序依据**：列表、归档全按它倒序。写未来的日期会让文章排在最前面。

### 2.4 正文能用的全部语法

| 你想要的 | 怎么写 | 效果 |
|---|---|---|
| 二级标题 | `## 标题` | 会进目录（TOC），带锚点 |
| 三级标题 | `### 标题` | 会进目录（缩进一级） |
| 一级标题 | `# 标题` | **别用** —— 文章标题已经是 h1，再用会破坏语义 |
| 加粗 | `**重点**` | **重点** |
| 斜体 | `*曲名*` | *曲名* |
| 行内代码 | `` `draft: true` `` | 等宽小底纹 |
| 链接 | `[文字](https://example.com)` | 可点，hover 变橙 |
| 站内链接 | `[另一篇](/posts/other-post/)` | 相对路径，换域名不会失效 |
| 图片 | `![描述](./照片.jpg)` | 见 §3 |
| 引用 | 行首 `> ` | 左侧粗黑条 |
| 无序列表 | `- 项目` | 圆点 |
| 有序列表 | `1. 项目` | 数字 |
| 嵌套列表 | 缩进两格再写 `-` | 二级缩进 |
| 表格 | 见下 | 会横向滚动 |
| 代码块 | 见下 | 黑底 + 复制按钮 |
| 分隔线 | `---` 单独一行 | 一条细线 |

**表格**：

```markdown
| 表头 | 表头 |
| --- | --- |
| 单元格 | 单元格 |
```

**代码块**（\`\`\` 后面写语言名，会有语法高亮）：

````markdown
```js
const a = 1;
```
````

常用语言名：`js` `ts` `bash` `json` `yaml` `python` `html` `css` `text`

### 2.5 本地看效果

```powershell
npm run dev
```

浏览器打开 `http://localhost:4321`。**草稿在这里也能看见**，标题旁会有「草稿」标记。
改文件保存后页面自动刷新。看完按 `Ctrl+C` 停止。

### 2.6 发布

1. 把 frontmatter 的 `draft: true` 改成 `draft: false`
2. 跑检查：

```powershell
npm run verify
```

看到 `Tests 57 passed` 就对了。**没全绿就别推。**

3. 提交并推送：

```powershell
git add -A
git commit -m "post: 新文章标题"
git push
```

约 1 分钟后上线。确认：

```powershell
curl.exe -sI https://personal-br4.pages.dev/posts/my-new-post/ | Select-String "HTTP/"
```

### 2.7 撤回一篇文章

把 `draft` 改回 `true` 再推 —— **别删文件夹**。

文章会从列表、标签页、归档、RSS、sitemap 消失，直接访问网址变 404，连它的图片也不会被部署。

### 2.8 彻底删掉一篇文章

```powershell
Remove-Item content\posts\my-new-post -Recurse -Force
npm run verify
git add -A
git commit -m "post: 删除 xxx"
git push
```

⚠️ 删了就没了（除非用 git 回滚，见 §13）。**但如果这篇文章已经在网上被搜索收录或被人转过，那个网址会变成 404。**

---

## 3. 图片

### 3.1 放哪里

**放进那篇文章自己的文件夹**，和 `index.md` 并排：

```
content/posts/my-new-post/
├── index.md
├── 封面.jpg
└── IMG_20260930.jpg
```

**不要**建 `images/` 之类的公共目录，也不要用绝对路径（`D:\...`）—— 那样换机器/换主题就断了。

### 3.2 怎么引用

```markdown
![一句话说清图里拍的是什么](./IMG_20260930.jpg)
```

**三个要点：**

1. 路径以 `./` 开头，指向同文件夹
2. **中括号里的字必须写，而且要是人话。** 那是 `alt`，给看不到图的人（和搜索引擎）读的。
   - ✅ `![傍晚的操场，跑道上有三个人在散步](./a.jpg)`
   - ❌ `![图片](./a.jpg)`、`![](./a.jpg)`
3. **空 alt 不会让构建失败，但会让 `npm test` 失败。**
   Cloudflare 只跑构建、不跑测试 —— 所以空 alt 会**静默上线**。这就是为什么推送前必须跑 `npm run verify`。

### 3.3 图片会被自动怎么处理

- 自动转成 **WebP**（体积小很多）
- 自动生成**多尺寸** `srcset`：手机下小图、桌面上大图
- 自动撑满正文栏宽度，**不用你写宽度**
- 带 `loading="lazy"`（滚到才加载）

**所以你什么都不用管** —— 原图直接丢进去就行，不用预先压缩、不用改尺寸、不用转格式。

### 3.4 尺寸建议

- 竖图/横图都行，宽度 1600px 左右足够（再大也看不出来，只是白占体积）
- 单张控制在 2 MB 以内（Cloudflare 免费版单文件上限 25 MB，但没必要挑战它）

### 3.5 封面图（`cover`）—— 目前不能用

契约里定义了 `cover` + `coverAlt` 两个字段，构建会校验它们（有 cover 必须有 coverAlt），
**但主题目前不渲染头图** —— 写了也不会显示。三篇文章都没用过，当时按 YAGNI 搁置了。

**你要用头图的话先告诉我**，我加渲染。

---

## 4. 标签

### 4.1 现在登记了这 6 个

```
AI · 建站 · 摄影 · 成长 · 随笔 · 钢琴
```

**用没登记的标签 → 构建直接失败**，并告诉你具体是哪个标签、在哪篇文章里。

这是故意的设计：防止半年后出现「前端 / 前端开发 / frontend」三个同义标签，让标签页变成垃圾堆。

### 4.2 加一个新标签（两步，缺一不可）

**第一步**：打开 `src/tag-registry.ts`，往数组里加：

```ts
export const TAGS = ['AI', '建站', '摄影', '成长', '随笔', '钢琴', '读书'] as const;
```

**第二步**：**确保至少有一篇文章真的用它**（把 `读书` 加进某篇文章的 `tags:`）。
否则 `npm test` 会失败 —— 有个测试守着「每个登记标签至少有一篇文章用它」。

> 所以：**要写那类文章了再加标签**，别提前登记。空标签会让标签页出现一个点了没内容的入口。

### 4.3 改名 / 删除标签（危险）

- **删掉一个还有文章在用的标签** → 那些文章构建失败（标签没登记了）
- **给标签改名** → 等于「删旧 + 加新」，所有用旧标签的文章都要改 frontmatter
- 两个标签合并（比如把「随笔」并进「成长」）→ 也要先改所有文章的 `tags:`

安全顺序永远是：**先改文章 → 再改注册表**。

### 4.4 每篇几个

**1–3 个**。超了构建失败。

怎么选：第一个放**主题**（成长/摄影/AI），第二个放**体裁**（随笔/建站），第三个才放**具体锚点**（钢琴）。

---

## 5. 网址（URL 与 slug）

### 5.1 规则

- 文件夹名就是网址：`content/posts/my-new-post/` → `https://personal-br4.pages.dev/posts/my-new-post/`
- 只允许小写字母、数字、单个连字符，最长 60
- **构建期硬校验**，不合法直接失败

### 5.2 发布之后不要改文件夹名

改了 = 旧网址变 404 = 所有转到过那篇的链接、搜索引擎收录全部失效。

**想改标题就只改 `title`，网址不动。**

### 5.3 想自定义网址

在 frontmatter 写：

```yaml
slug: my-custom-url
```

网址会变成 `/posts/my-custom-url/`。但如果它和文件夹名不一致，构建会**告警**提醒你最终用的是哪个（契约要求告警，不是失败）。

**什么时候该用**：中文标题、想换一个更好记的网址、文件夹名起得不好但懒得改文件夹。

---

## 6. 站点文案（`content/site.md`）

**站名、首页简介、搜索引擎描述、页脚联系方式全在这一个文件里**，改这些不用碰代码。

```markdown
---
name: 北杉札记
wordmark: North_Cedar's notes
intro: 首页那句长简介，可以很长。
metaDescription: 搜索引擎和分享卡片用的短句，≤ 120 字。
email: a13655515876@163.com
github: https://github.com/NorthenCedar
---
```

| 字段 | 出现在哪 | 注意 |
|---|---|---|
| `name` | 导航栏、首屏超大标题、页脚版权、每个页面的 `<title>` 后缀 | 改了全站都变 |
| `wordmark` | 导航栏站名右边的英文副标 | |
| `intro` | 首页首屏那段长简介 | 可以很长，会正常换行 |
| `metaDescription` | 搜索引擎结果、微信/QQ 分享卡片 | **≤ 120 字**，超了构建失败 |
| `email` | 页脚，可点击发邮件 | 必须是合法邮箱格式 |
| `github` | 页脚 | 必须是完整网址（含 `https://`） |

改完记得：`npm run verify` → `git add -A` → `git commit -m "..."` → `git push`。

---

## 7. 关于页（`content/pages/about.md`）

和文章一样是 Markdown，但没有 frontmatter 那些必填字段（只需要一个 `title`）：

```markdown
---
title: 关于
---

正文随便写。图片也是放在同目录、用 `./` 引用。
```

网址固定是 `https://personal-br4.pages.dev/about/`。

---

## 8. 改版式（`src/`）—— 进阶

> ⚠️ 这一节改的是**视觉规范**，有硬约束（对比度、间距阶梯）。改完必须跑 `npm run verify`。

### 8.1 配色：`src/styles/tokens.css`

```css
--paper: #ffffff;        /* 页面底 */
--ink: #0e0e0e;          /* 主文字，也是黑带底色 */
--muted: #5c5c5c;        /* 次级文字（摘要、日期） */
--hair: #d6d6d6;         /* 装饰细线 */
--accent: #e4572e;       /* 信号橙：只许用在 ≥24px 大字 / hover / 图形 */
--accent-ink: #c2410c;   /* 小字专用橙 */
```

**两条硬约束：**

1. **正文对比度必须 ≥ 4.5:1。** `--accent`（3.68:1）只能用在 ≥24px 的字或非文字图形上；小字一律用 `--accent-ink`。
   页脚那行 13px 的字就曾经用错成 `--accent`，被代码审查抓出来了。
2. **改了颜色，`npm test` 会失败** —— 这是故意的。有个脚本从 `tokens.css` 读真实颜色、按 WCAG 公式复算，和期望值比对。你必须：
   - 打开 `scripts/assert-tokens.mjs`
   - 把对应那行的期望值改成新算出来的数字
   - **确认它仍然不低于下限**（那行最后一个数字）

   改完跑 `node scripts/assert-tokens.mjs` 看是否全绿。

### 8.2 字号与间距：同一个文件

```css
--fs-display ~ --fs-mono    /* 11 档字号 */
--sp-1 ~ --sp-8             /* 8 档间距，4px 基准 */
--measure: 34em;            /* 正文行宽（中文约 34 字/行） */
--wrap: 82rem;              /* 整页最大宽度 */
--band-h: min(74vh, 42rem); /* 首屏黑带高度 */
```

**规则**：间距不许出现阶梯外的值（组内用 `--sp-1~4`，组间用 `--sp-5~8`）。
正文内部的段落间距（`1.15em` 那种）是排版节奏，用 `em` 是允许的例外。

### 8.3 字体：`src/styles/fonts.css` + `scripts/fetch-fonts.mjs`

现在自托管 4 个拉丁字体文件（共 94 KB），**中文走系统栈、不下载**（中文全量字体 5–10 MB，对读者是灾难）。

想换拉丁字体：

```powershell
# 编辑 scripts/fetch-fonts.mjs 里的 FILES 数组，然后
node scripts/fetch-fonts.mjs    # 会校验每个文件 > 5KB 且总量 < 200KB
```

然后同步改 `src/styles/fonts.css` 的 `@font-face` 和 `base.css` / `tokens.css` 里的字体栈。

### 8.4 导航菜单：`src/components/Brandline.astro`

文件顶部有个数组，加减项目就改它：

```ts
const links = [
  { href: '/', label: '文章', key: 'index' },
  { href: '/tags/', label: '标签', key: 'tags' },
  { href: '/archive/', label: '归档', key: 'archive' },
  { href: '/about/', label: '关于', key: 'about' },
];
```

（`RSS` 链接单独写在下面，不在这里。）

### 8.5 动效

```css
--dur-fast: 120ms;   /* hover / 焦点 */
--dur-enter: 320ms;  /* 全站唯一一次入场：首屏黑带的站名+简介 */
--ease: cubic-bezier(0.2, 0, 0, 1);
```

**规范明确禁止**：区块逐个淡入、卡片 hover 抬升、视差、滚动驱动动画。
`prefers-reduced-motion` 下动效会自动取消（这是无障碍要求，别删）。

### 8.6 改完必须做的事

```powershell
npm run verify        # 构建 + 57 个测试
cd <博客仓库>
node scripts/assert-tokens.mjs   # 单独复算对比度
```

---

## 9. 部署与域名

### 9.1 平常怎么上线

```
你在本地改 → git push → GitHub → Cloudflare Pages 自动构建 → 约 1 分钟上线
```

**不需要你手动做任何部署动作。** Cloudflare 监听 `main` 分支，一推就构建。

### 9.2 改域名

只改一处：`astro.config.mjs` 里的 `site:`。
（`robots.txt` 已改成由端点根据 `site` 自动生成，不用再管。）

改完要重新在 Cloudflare 那边绑定域名。

### 9.3 去哪看部署日志

```
https://dash.cloudflare.com → Workers & Pages → personal → Deployments
```

构建失败时，那里有完整日志。

---

## 10. 命令速查表

```powershell
cd <博客仓库>          # 每次开工先做这个

npm run dev                # 本地预览（草稿也可见）→ http://localhost:4321
                           #   注意：它【不跑评论】，评论要调时用下面两条
npm run verify             # 构建 + 全部测试 ← 推送前必跑
npm test                   # 只跑测试
node scripts/assert-tokens.mjs   # 单独复算颜色对比度

# 评论相关（只在调评论时才用）
npm run comments:init      # 首次：建本地评论表
npm run build ; npm run dev:cf   # 起带 Functions 的本地运行时 → http://127.0.0.1:8788
npx wrangler d1 execute beishan-comments --local --command "SELECT * FROM comments LIMIT 10"   # 看本地评论

git status                 # 看当前改了哪些文件
git add -A                 # 标记全部改动
git commit -m "说明"        # 存版本
git push                   # 上线

git log --oneline          # 看历史
git checkout -- 文件路径     # 撤销某个文件还没提交的改动
```

---

## 11. 构建失败信息对照表

| 报错关键词 | 原因 | 怎么修 |
|---|---|---|
| `未登记的标签：XXX` | 用了注册表里没有的标签 | 要么改用已登记的，要么去 `src/tag-registry.ts` 加上它 |
| `tags 最多 3 个` / `tags 至少 1 个` | 标签数量不对 | 改成 1–3 个 |
| `summary 不能超过 80 字` | 摘要太长 | 删短 |
| `date 必须是 YYYY-MM-DD` | 日期格式错 | 写成 `2026-10-01` |
| `updated 不能早于 date` | 两个日期写反了 | 检查这两行 |
| `有 cover 就必须有非空的 coverAlt` | 写了封面图没写 alt | 补上，或删掉 `cover` |
| `URL 片段「XXX」不合法` | 文件夹名有中文/大写/空格/下划线 | 改文件夹名（未发布的才行），或加 `slug:` |
| `缺少 content/site.md` | 站点文案文件被删了 | 从 git 恢复 |
| `Unrecognized key` | 写了个契约里没有的字段 | 会**告警**不失败；确认是否该走变更流程 |

凡是看到 `InvalidContentEntryDataError`，报错里都会指出**是哪个文件**。

---

## 12. 每次发文前的检查清单

- [ ] 文件夹名是小写英文 + 连字符
- [ ] 五个必填字段齐全（`title` `date` `summary` `tags` `draft`）
- [ ] `summary` ≤ 80 字
- [ ] 标签 1–3 个、全部已登记
- [ ] 每张图的 `![...]` 里写的是人话，不是「图片」
- [ ] 站内链接用 `/posts/xxx/` 这种相对路径
- [ ] 本地 `npm run dev` 看过一遍排版（尤其代码块和表格）
- [ ] `npm run verify` 全绿
- [ ] `draft` 改成 `false`
- [ ] `git push`，1 分钟后打开线上网址确认

---

## 13. 备份与回滚

**你的内容永远有历史记录**，因为每次发布都是一次 git 提交。

### 看历史

```powershell
git log --oneline
```

### 撤销"还没提交"的改动

```powershell
git checkout -- content/posts/my-post/index.md
```

### 把某一篇恢复到之前的状态

```powershell
git log --oneline -- content/posts/my-post/index.md   # 找到那次提交的编号
git checkout <编号> -- content/posts/my-post/index.md
git commit -m "revert: 恢复 my-post"
git push
```

### 整站退回某个版本

```powershell
git log --oneline          # 找到目标提交编号
git revert <编号>          # 生成一个"反向提交"，安全
git push
```

**不要用 `git reset --hard` 之后再强推** —— 那会重写历史，容易把东西弄丢。

---

## 14. 评论（自建，2026-09-26 上线）

评论区在每篇文章底部。读者填**名字 + 留言**即可发表，**不用登录、不用邮箱、没有验证码**。
数据存在你自己的 Cloudflare D1 里，**不经过任何第三方**。

### 14.1 本地怎么调评论（**和写文章不一样**）

```powershell
cd <博客仓库>
npm run build
npx wrangler pages dev dist --port 8788
```

然后浏览器打开 `http://127.0.0.1:8788/posts/camera-in-gaosan/`。

> ⚠️ **`npm run dev` 不跑评论** —— 它是 Astro 的静态预览，不会执行 Cloudflare Functions，
> 所以评论会显示「留言没能加载出来」。**日常写文章照旧用 `npm run dev`；只有要调评论时才用上面这条。**

首次使用要先建本地表：

```powershell
npm run comments:init
```

（本地数据库存在 `.wrangler/` 下，已在 `.gitignore` 里，不会被提交。）

### 14.2 怎么删一条评论

先看有哪些（本地用 `--local`，线上用 `--remote`）：

```powershell
npx wrangler d1 execute beishan-comments --local --command "SELECT id, slug, name, substr(body,1,40) AS body, created_at FROM comments ORDER BY id DESC LIMIT 20"
```

删掉指定的一条：

```powershell
npx wrangler d1 execute beishan-comments --remote --command "DELETE FROM comments WHERE id = 42"
```

删掉某篇文章下的全部（比如被灌了）：

```powershell
npx wrangler d1 execute beishan-comments --remote --command "DELETE FROM comments WHERE slug = 'my-post'"
```

### 14.3 线上首次上线要做的三步

1. `npx wrangler login`（打开浏览器点同意）
2. `npx wrangler d1 create beishan-comments` → 记下返回的 `database_id`
3. Cloudflare 控制台 → Workers & Pages → `personal` → Settings → Functions → **D1 bindings**：
   变量名填 **`COMMENTS_DB`**，选中刚才那个库；**生产环境和预览环境各绑一次**

绑完再 `git push` 一次，评论就能用了。

### 14.4 反垃圾是怎么做的

| 机制 | 说明 |
|---|---|
| **蜜罐字段** | 表单里有个真人看不见的「网站」输入框。机器人会填，一填就**假装成功但扔掉**（返回 201，不写库）—— 让它以为得手，不来重试 |
| **频率限制** | 同一个 IP **每分钟最多 2 条**，超了返回 429「发表太频繁」 |
| **隐私** | 数据库里**只存 IP 的哈希**，不存原始 IP |

挡不住的：**人工发的广告**。看到就用 14.2 的命令删掉。

### 14.5 评论的边界（明确不做）

无头像（头像要请求外部服务）、无邮箱、无嵌套回复、无验证码、无表情、无「点赞」。
**评论功能依赖 JavaScript** —— 站点是静态的，评论只能运行时取；关掉 JS 只会看到表单骨架。

---

## 15. 常见问题

**Q：我没装 Node，能用吗？**
需要 Node ≥ 22.12（这台机器上是 v24.21，已装好）。

**Q：`npm run dev` 报 `spawn EPERM`？**
这台机器的沙箱拦了 vite 的子进程，需要在更宽的权限下跑。

**Q：能写 `.mdx` 吗？**
不能。你当初选的是纯 Markdown，理由是「正文里能嵌组件 = 把表现层写进内容文件」。

**Q：文章怎么排序？**
按 `date` 倒序。归档页按年份分组。都是自动的。

**Q：换主题会不会动到我的文章？**
不会。有一条测试守着这个 —— 构建前后 `content/` 的文件哈希必须完全一致。

**Q：能不能定时发布？**
不能。`draft` 是手动的。想"预告"可以先把 `date` 写成未来日期 —— 文章会排在列表最前面。

**Q：手机上能改吗？**
不能。写作要在这台电脑上（要跑 Node 和 git）。但**看网站**任何设备都可以（见下一节）。

**Q：读者能看到草稿吗？**
看不到。草稿的页面、图片、RSS 条目全都不会部署上线，直接猜网址也是 404。

---

## 16. 这个网站容不容易打开

**线上地址：https://personal-br4.pages.dev**

它是**纯静态站点**，托管在 Cloudflare 的全球 CDN 上 —— 没有服务器进程、没有数据库，所以**不存在"服务器挂了"这回事**。只要 Cloudflare 在，网站就在。

**优点**：全球 CDN 加速、自动 HTTPS、免费版没有带宽限制、不会被单台机器拖垮。任何设备（手机/平板/别人的电脑）打开网址就能看，不需要装任何东西。

**但要诚实说清楚不确定性**：

1. **中国大陆的访问速度我不能保证。** 从你这台机器实测是通的、响应也快，但那是**单点、单时刻**的观测。Cloudflare 的免费版节点在大陆的可达性会随网络环境波动，这不是我能承诺的。
2. **没有备案。** 用的是 `pages.dev` 免费子域，所以走的是境外节点。真要稳定的大陆访问，唯一的路是买域名 + ICP 备案 + 国内云。
3. `pages.dev` 域名是 Cloudflare 的，**你无法控制它**。哪天想换，改 `astro.config.mjs` 一行 + 在 Cloudflare 上绑新域名即可。

**免费版的实际限制**（够用到你用不完）：每月 500 次构建、单文件 ≤ 25 MB、站点文件数 ≤ 20,000、自定义域 100 个、单次构建 20 分钟超时。

> 关于流量：Cloudflare 官方的 Pages Limits 页**没有列出任何带宽配额**（这是我查证过的原文状态），
> 所以我不说"无限"—— 我说的是**官方没有给你一个上限数字**。以你现在的访问量，这不会成为问题。
