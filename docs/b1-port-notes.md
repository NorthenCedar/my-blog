# B1 移植工单（原型 → `index.astro`，零动效）

> 这份文件是**给下一轮执行用的工作底稿**，不是规范。B1 验收通过后可以删掉。
> 目的：不必再通读 `prototype/terminal/home.html`（44 KB）—— 结构与接线已经从里面取出来了。

## 1. 原型首页的结构骨架（实测行号，来自 home.html）

| 行 | 元素 | 说明 |
|---|---|---|
| 540 | `.os-rail` | 底部状态条（`aria-hidden="true"`），左「OS-01-H · IDENTITY ARCHIVE」右「SAVED 00 · INDEX 05」 |
| 564 | `nav.rail`（`aria-label="页面区段"`） | 左侧刻度尺。内含 `.rail-track` > `.rail-fill#railFill` + **5 个 `.rail-tick` 锚点** |
| 567–571 | `.rail-tick` × 5 | 每个是 `<a href="#sN" style="top:X%" data-sec="sN"><i></i><b>NN</b><span class="rail-name">身份/文章/相册/项目/联系</span></a>`；top 分别是 **0 / 28 / 71 / 90 / 97 %** |
| 576 | `.hud` | 顶栏。左：站名字符串（单行、等宽感）；右：`<i class="rec">` + `<span id="hudSec">01</span> / 05 · <span class="hud-progress" id="hudPct">000%</span>` |
| 582 | `.band#band`（`aria-hidden="true"`） | 扫描带。内含 `.band-line` / `.band-sweep` / `.band-cap.l` / `.band-cap.r` / `.band-readout` |
| 596 | `section.tier.tier-1#s1` | **S1 身份舱体**：`.field-item[data-label="身份 · 北杉"]` > `.pod.pod-s1` > `.pod-tag.right`（含 `.rhine-mark` SVG + "POD 01 · 身份"）+ 大字 display + 简介 + `.coord` 坐标行 |
| 615 | `section.tier.tier-2#s2` | **S2 最近写的**：`.tier-head`（`.sec` "SECTOR 02" + `<h2>最近写的</h2>`）+ `<li class="field-item">` 列表（每条：日期 / 标题 / 标签；**摘要已砍**） |
| 654 | `section.tier.tier-3#s3` | **S3 相册**：`.tier-head` + `.field-item` > `.pod` > `.pod-tag`（"CULTURE POD · 标本 82 帧"）+ `.frames` > 主图 + `.f-thumbs`（两个缩略） |
| 673 | `section.tier.tier-4#s4` | **S4 项目**：`.tier-head` + `.field-item`（**空态**，一行） |
| 683 | `section.tier.tier-5#s5` | **S5 找到我**：`.tier-head` + `.field-item`（三处链接） |
| 540 之前 | 背景层 | `.bg-mark`（±∞ 水印）/ `.bg-ring` / `.bg-orbit` / `.bg-green`（见 §3） |

## 2. 数据接线（**全部真实来源，一个字符串都不许写死**）

| 区段 | 数据源 | 备注 |
|---|---|---|
| HUD 左 | `site.name` | 来自 `content/site.md` |
| S1 大字 | `site.wordmark` | 原型里是 `North_Cedar's notes` |
| S1 简介 | `site.intro` | |
| S1 坐标行 | `site.lat` / `site.lon` / `site.status` | **三个都是可选**（P2 前置件已加）。缺任何一个 → **整行不渲染**，不要渲染空值 |
| S1 舱体标签 | 固定文案 `POD 01 · 身份` | chrome 文本，不是内容 |
| S2 | `getVisiblePosts()` | **草稿语义必须保持**（走同一个 lib，不要自己 filter） |
| S3 | `gallery` 集合（刚建好） | 取最新一张相册；主图 = 第 1 张，缩略 = 第 2、3 张；`alt` 用内容里的 `alt`。图片总数可算 `images.length` |
| S4 | 无 | **一行空态**。站点现在确实没有 projects 集合 —— 不要编假项目 |
| S5 | `site.github` / `site.email` / `/rss.xml` | 三处链接；RSS 是固定路由 |
| OS 条右 | `posts.length` 等 | 原型写 "SAVED 00 · INDEX 05"。**B1 里要么用真实计数，要么整段不写** —— 不许写死一个假数字 |

## 3. 站点 token ↔ 原型值（`src/styles/tokens.css` vs 原型 `:root`）

| 用途 | 站点 token | 原型值 | 处理 |
|---|---|---|---|
| 底 / 墨 / 次级 / 发丝线 | `--paper #fafaf7` · `--ink #1a1a1a` · `--muted #5a5a56` · `--hair #d8d5ce` | 同值 | 直接用 |
| 绿 | `--accent #2d7d46` · `--accent-ink #266b3b` · `--accent-bright #4caf50` | 同值 | 直接用；**深色底上只能用 `--accent-bright`** |
| 绿洗底 | 原型 `--accent-wash:#EDF3EC` | **tokens.css 没有** | 需要就新增一个 token（不要在组件里写死色值） |
| 面板底 | 原型 `--panel:#EFEDE7` | **没有** | 同上 |
| 扫描带底 / 亮绿 | 原型 `--band:#111111` · `--band-glow` | **没有** | B1 的扫描带是 `--ink` 底 + `--accent-bright` 线；不需要新 token |
| 橙信号 | 原型 `--signal:#E87722` · `--signal-text:#B45309` | **没有** | **只属于 B2**（扫描时 HUD 变橙）；B1 不引入 |
| 版心 | `--wrap 82rem` · `--gutter` · `--sp-*` | — | 容器继续用 `.shell`（阶段 A 刚改好） |
| 动效 | `--dur-*` · `--ease` | — | **B1 一个都不用**（动效全部归 B2） |

## 4. B1 明确不做（写进代码注释，防止以后被当成"漏了"）

- **不加任何动效**：无 `transition`、无 `animation`、无 `IntersectionObserver`、无滚动监听。
  `.field-item` / `data-label` 这类**钩子属性可以留在标记里**（它们是 B2 的挂点），但不给它们任何样式或脚本。
- 不动其余 13 个页面：`Base.astro` 只在 `chrome === 'console'` 时**跳过 `<Band>` 与 `<SiteFooter>`**，其余走原路径。
- 不引入新字体、不引第三方、不加外部请求。

## 5. 验收（B1 做完照这个跑）

```powershell
cd <博客仓库>
npm run build      # 必须仍 14 页、exit 0
npx vitest run     # 必须 72 passed | 1 skipped、exit 0
# 双侧 L2：
#   ① 13 个非首页文件：归一化（去 data-astro-cid-*、去 _astro 资源名哈希）后与
#      <本机工作区>\_tmp-dist-b1-before\ 对应文件**逐字节完全相等**
#   ② index.html：**必须不等**，且差异必须逐条枚举出来给人看
# 截图：首页桌面 1440×900 + 手机 390×844 各一张（我自己 read_image 看过再报）
```

判据脚本现成：`_tmp-p2-commit.mjs` 里的 `norm()` 与「只替换 `<main>` 内那一处」的正确写法可直接复用；
计算样式脚本 `_tmp-p2-style.mjs` 可复用（B1 后仍应 13 页零差异）。
