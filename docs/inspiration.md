# 灵感调研：高对比编辑风的个人博客参考（阶段 2）

> **调研日期**：2026-09-25
> **工具说明**：本次调研用 `web_search` + `web_fetch` 完成。`agent-reach` 技能在本机不可用（未执行）。为了读到**原始 `<head>` 与 CSS**（`web_fetch` 默认把 HTML 转成纯文本，会丢掉 `<style>` 和 `<link>`），额外借用了两个只读代理：`api.microlink.io`（按 CSS 选择器取 `<head>` 片段）与 `api.allorigins.win/get`（返回 JSON 包裹的原始 HTML），以及直接 `web_fetch` 站点的 `.css` 文件。下文凡带 `代码体` 的数值，都是这样**实际读到**的；凡属推测，一律标「推断」。
> **一句话结论**：高对比编辑风真正可迁移的东西**几乎全在 CSS 的"结构性数字"里**——版心宽度、命名网格线、字号 `clamp()` 公式、代码块的换行策略、强调色出现的次数。视觉印象本身（大标题、单强调色、黑白色）是结果，不是手法；照着结果做出来的一定是模板感。

---

## 速览表

| 站点 | 类型 | 值得偷的那一点（一句话） | 证据强度 |
|---|---|---|---|
| [Matt Ström-Awn](https://mattstromawn.com/) | 设计长文 / 编辑风 | 用**命名网格线**搭「窄 40rem / 宽 60rem / 满宽」三档版心，移动端靠**重定义同名线**塌陷成一栏 | **强**（读到完整 stylesheet） |
| [Steph Ango](https://stephango.com/) | 极简随笔 / 单强调色 | 版心只抽两个变量，用一条 `margin-left: calc((min(100vw, var(--wrap-wide)) - 100%) / -2)` 就实现满宽突破；正文链接**纯黑带下划线，颜色只在 hover 出现** | **强**（读到完整 stylesheet） |
| [Robin Rendle](https://robinrendle.com/) | 排版随笔 / 杂志感 | 「大标题」不靠字号：正文 h1 只有 33px，撑住首屏的是 `height:90vh` 的整块色带 + 底部对齐文字区 | **强**（读到文章页内联样式）⚠ 见时效说明 |
| [Rauno Freiberg](https://rauno.me/) | 交互设计 / 画布式首页 | 把设计 token 做对：间距 8px 步进共 11 档、字号 9 档（16→20→24→32 粗跳）、行高 8 档；**语义属性驱动字号**（`<p data-size="medium">`） | **强**（读到首页内联 token） |
| [Dan Luu](https://danluu.com/) | 长文技术分析 | 全站排版只有 **200 字节** CSS；超长代码行的答案是 `white-space:pre-wrap; overflow-wrap:anywhere`（**折行，不是滚动**） | **强**（读到全部 CSS） |
| [胡涂说 hutusi.com](https://hutusi.com/) | 中文长文（5000+ 字） | 内容先分「流」再谈排版：文章头部的 `类型 · 日期 · 5,975 字 · 21 分钟阅读` 元数据行 | **中**（读到结构 + 字体 preload，样式表未读） |
| [Craig Mod](https://craigmod.com/) | 摄影 + 长文随笔 | 图注就是正文的一部分（图片下紧跟一行普通文本），**且 `alt` 写成一整句完整描述** | **中**（读到结构，CSS 未读） |

---

## 逐个站点

### 1. Matt Ström-Awn — https://mattstromawn.com/

- **它是什么**
  设计负责人（Copilot Money / Stripe / Wall Street Journal / Soundcloud 的前设计负责人）的个人站，主体是设计随笔。列表项是「日期 + 标题 + 副标题」的三层结构，卡片感很弱。

- **值得偷的一点**
  **用 CSS 命名网格线（named grid lines）把版心做成三档——`narrow` / `wide` / `full`——而不是靠 `max-width` 补丁。** 正文默认落 `narrow`（固定 40rem），图片、画廊、宽表格落 `wide`（60rem），需要突破时用现成的 pull / push 工具类。移动端不做「改样式」，而是**重新定义同名线的位置**，让所有元素自动塌进一栏。

- **怎么实现的**（读到自 [mattstromawn.com/css/main.css](https://mattstromawn.com/css/main.css)）

  - 网格变量与定义：
    `:root{--l--grid-width-narrow:40rem; --l--grid-width-wide:60rem}`
    ```css
    .l--grid{
      display:grid;
      grid-template-columns:
        [full-start] minmax(1rem,1fr)
        [wide-start] minmax(0,calc((var(--l--grid-width-wide) - var(--l--grid-width-narrow))/2))
        [narrow-start] var(--l--grid-width-narrow) [narrow-end]
        minmax(0,calc((var(--l--grid-width-wide) - var(--l--grid-width-narrow))/2)) [wide-end]
        minmax(1rem,1fr) [full-end];
      gap:0 1rem;
    }
    ```
  - 配套工具类：`.l--grid-narrow{grid-column:narrow}`、`.l--grid-wide{grid-column:wide}`、`.l--grid-full{grid-column:full}`、`.l--grid-pull-left/right`、`.l--grid-push-left/right`。
  - **移动端塌陷**（`@media (max-width:800px)`）：把 medium / narrow / wide 三个名字**落在同一列上**，gap 归零 ——
    ```css
    .l--grid{gap:0;grid-template-columns:
      [full-start] 1rem
      [wide-start medium-start narrow-start] minmax(1rem,1fr)
      [narrow-end medium-end wide-end] 1rem [full-end];}
    ```
    这是全套里最值得抄的一招：**塌陷是"线的位置变了"，不是"元素样式变了"**，所以不需要给每个组件写移动端覆盖。
  - 垂直节奏用「lobotomized owl」：`body *+*{margin-top:var(--l--space-s)}`，配 `.l--space-loose`（`--l--space-m` = 2.25rem）/ `.l--space-compact`（0.5rem）/ `.l--space-flush`（0），并有明确例外清单 `*+br, br+*, li+li, table *+*{margin-top:0}`。
  - 间距刻度：`--l--space-xs:.5rem / -s:1rem / -m:2.25rem / -l:5rem / -xl:8rem`（5 档）。
  - 字号走 `clamp()` 流式，且**变量名与数值都读到了**（`font-size: var(--t--size-s)` 前一行就是 fallback 值）：
    小字 `--t--size-s ≈ clamp(.85rem,2vw,.9rem)`、更小 `--t--size-xs ≈ clamp(.7rem,2vw,.8rem)`、大 `--t--size-l ≈ clamp(1.2rem,2vw,1.4rem)`、特大 `--t--size-xl ≈ clamp(1.4rem,3vw,1.7rem)`；行高也 clamp：`--t--leading-tight ≈ clamp(1.2em, calc(26px - 1vw), 1.3em)`。→ **视口越宽，辅助文字越大、行高越紧**，这比断点跳档连贯。
  - 代码块：`pre[class*=language-]{background:var(--c--gray-25); border-radius:var(--l--border-radius); overflow:auto; padding:var(--l--space-s); white-space:pre; word-break:normal; tab-size:4}`；行内则分开写：`li code, p code{background:var(--c--gray-25); padding:.1em .25em; word-break:break-all}`。→ **块级横向滚动 + 行内强制断词**，两条规则各管各的。
  - 画廊用 `:has()` 按图片数量自动改栏数（这是「带照片的短文」最省事的方案）：
    `.gallery{display:grid; grid-column:wide; grid-template-columns:repeat(3,1fr); gap:var(--l--space-s)}`
    `:has(>:first-child:last-child){repeat(1,1fr)}`、`:has(>:nth-child(2):last-child){repeat(2,1fr)}`、`:has(>:nth-child(4):last-child){repeat(2,1fr)}`、`:has(>:nth-child(7)){repeat(4,1fr)}`。
    移动端（≤800px）画廊变成横向 `scroll-snap` 轮播：`overflow-x:auto; scroll-snap-type:x mandatory; figure{flex:0 0 75vw; scroll-snap-align:start}`（**一屏露出 3/4 张，暗示可滑**）。
  - 移动端表格卡片化：`.table--responsive` 下 `thead{display:none}`、`tr,td{display:block}`、`td{text-align:right}`、`td:before{color:secondary; content:attr(data-label); float:left}` —— 表头文字靠 `data-label` 复制进每个单元格。
  - 强调色只有一个：`--c--blue-500:#5763ff`，出现在链接、主按钮、nav hover 背景（`--c--blue-25`）；其余全是 `--c--gray-0 … --c--gray-1000` 灰阶。
  - 无障碍：`input:focus{box-shadow:0 0 0 3px var(--c--blue-100); outline:0}`（**明确的可见焦点环**）；`.lyt-visually-hidden{clip-path:inset(50%); width:1px; height:1px; overflow:hidden; position:absolute}`（视觉隐藏但留给读屏，比 `display:none` 正确；连 MathJax 的 `mjx-assistive-mml` 都用同一手法隐藏）；`html{font-size-adjust:100%}`（减少字体回退时的 x-height 跳动）。
  - 细节：`@view-transition{navigation:auto}` + `:root::view-transition-group(*){animation-duration:75ms}`（跨文档转场压到 75ms）。

- **不要学的地方**
  - 字体是 `charterVariable`（衬线正文）+ `Inter`（UI）+ `Geist Mono`，还有一个「serif / sans 文本主题切换」。**方向与我们相反**（我们要 grotesk 标题 + 无衬线正文），而且这个站本身就在用 Inter。
  - `--c--theme-text-secondary`（浅色主题）是 `var(--c--gray-500)` = `#72777a`，对纯白约 **4.5:1**（我按 WCAG 相对亮度手算，**推断值**）——**恰好压线**。我们选灰阶时不要贴着下限，留余量。
  - 圆角文化：`--l--border-radius:0.5rem`、`--l--border-radius-s:0.25rem`，卡片（`.stub--project`）是「圆角 + 1px 边框 + 缩略图 hover 位移」。这与我们的直角 + 细线方向冲突。
  - 调色板贪多：`--c--gray-0…1000` 共 14 档灰，另有 blue / green / red / yellow 各 12 档。**我们只需要 1 黑 1 白 2–3 灰 1 橙。**

- **来源**：https://mattstromawn.com/ ｜ https://mattstromawn.com/writing/design-from-the-inside/ ｜ https://mattstromawn.com/css/main.css

---

### 2. Steph Ango — https://stephango.com/

- **它是什么**
  Obsidian CEO 的个人随笔站，全部文章都是短文（自述「less than 500 words」）。它还是 [Flexoki](https://stephango.com/flexoki) 配色方案的作者——一套自称「为散文与代码设计的墨色方案」。样式表头部明确写了来源：normalize.css + Flexoki。

- **值得偷的一点**
  **版心只抽两个变量（`--wrap-normal` / `--wrap-wide`），然后用一条 margin 公式实现满宽突破。** 正文永远 37em，图片/代码/表格用 `.wide` 类突破到 54em 或满视口，不需要网格、不需要包裹层。配套的第二招同样重要：**正文链接是纯黑带下划线，强调色只在 hover 时才出现**——于是「单一强调色」在静止画面上是 0 次，成本极低。

- **怎么实现的**（读到自 [stephango.com/styles.css](https://stephango.com/styles.css)）

  - 版心与尺度变量：
    `:root{--wrap-wide:54em; --wrap-normal:37em; --font-small:.875em; --font-smaller:.8em; --line-height:1.5; --heading-weight:500; --border-radius:4px; --image-radius:6px}`
  - **移动端退让**（`@media (max-width:860px)`）：`--wrap-normal:88vw; --wrap-wide:100vw; --input-width:100%; --heading-weight:600`，并且 `.wide`/`.wider` 的 `--border-radius:0; --image-radius:0`。→ **字号一个都没改**：改的是「版心变成视口百分比」+「标题加粗一档」+「满宽元素取消圆角」。
  - **满宽突破公式**（这一行最值得抄）：
    ```css
    article .wide{
      padding:1.5em 0;
      max-width:min(100vw, var(--wrap-wide));
      width:min(100vw, var(--wrap-wide));
      margin-left:calc((min(100vw, var(--wrap-wide)) - 100%) / -2);
    }
    ```
    配上 ≤54em 时的 `.wide{border:none}` + `.wide img,.wide iframe,.wide video{border-radius:0}`。
  - 正文字号：`html{font-size:62.5%}`（1rem = 10px）+ `body{font-size:1.8rem; font-size:calc(1.5rem + .25vw)}` → **18px 起，随视口线性增长**。
  - 标题阶梯全是 em + vw 的 calc：
    `h1{font-size:calc(1.35em + .55vw); letter-spacing:-.02em; line-height:1.25; margin-top:1.5em}`
    `h2{font-size:calc(1em + .2vw); letter-spacing:-.015em}`
    `h3{font-size:1em}`；`h5{font-size:1.4rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em}` → **最小的那一级靠「全大写 + 字距」立住，而不是靠加大字号**。
  - 链接与强调色：`a{color:var(--color-tx-normal); text-decoration:underline; text-underline-offset:.15ex}`；`a:hover{color:var(--color-action); text-decoration-color:currentColor}`，而 `--color-action: var(--flexoki-cyan-600)` = `#24837B`。→ **静止时页面上只有黑白，鼠标经过才出现颜色。**
  - **外链标记不用额外标签**：`article a:not(.plain):not(.tag):not([href^="#"]):not([href^="/"]){background-image:url("data:image/svg+xml,…↗"); background-position:right 33%; background-repeat:no-repeat; background-size:.7em; padding-right:.75em}` —— 一个内联 SVG 背景图给所有站外链接加箭头。
  - **章节分隔符**：`article hr:before{content:"•••"; font-size:calc(.8em + .2vw); letter-spacing:1.25em; color:var(--color-tx-faint)}`（`hr` 本身 `background:none; border:0`）→ `---` 渲染成居中的三个点，带字距。
  - **图注自动生成**：`img + em{display:block; text-align:center; font-size:var(--font-smaller); line-height:1.4; color:var(--color-tx-muted); padding:1em; font-style:normal}` → Markdown 里图片下面一行斜体就是图注；另有 `figcaption{font-size:var(--font-smaller); color:var(--color-tx-muted); padding:1em}`。
  - **标题锚点**：`h1 .anchor{position:absolute; left:-1.5em; opacity:0; mask-image:url("data:image/svg+xml,…链接图标"); mask-size:.75em; background-color:var(--color-tx-faint)}`，`h1:hover .anchor{opacity:1; transition:opacity 0s ease-in-out .25s}` → 图标式锚点，hover 才出现、不占正文空间、不用 icon font。
  - 代码块：`pre{font-family:var(--font-mono); border:1px solid var(--color-ui-normal); border-radius:4px; padding:1em; font-size:90%; white-space:pre-wrap}`，外层 `.highlight{border-radius:4px; overflow:auto; margin:1em 0}`；行内 `code,kbd{background:var(--color-bg-secondary); padding:.1em .2em; border-radius:4px; font-size:90%}`。→ **`pre` 允许折行，外层容器允许横向滚动**（两层兜底）。
  - **代码配色 = 把 token 映到低饱和墨色**：注释 `.highlight .c{color:var(--color-tx-faint)}`（最淡的灰）、关键字 `.k{color:green-600}`、字符串 `.s{color:green-600}`、数字 `.m{color:purple-600}`、内建类型 `.kd{color:blue-600}`。**注释不抢色，直接用中性最淡灰。**
  - 表格只画横线不画竖线：`table{font-size:90%; font-variant-numeric:tabular-nums}`、`tr{border-bottom:1px solid var(--color-ui-normal)}`、`th{text-align:left; font-weight:600; padding-bottom:.5em}`；移动端宽表：`@media(max-width:600px){.table-mobile-wide table{width:106%} .table-mobile-wide table td{min-width:16em}}`（**故意超宽，允许横向滚动**）。
  - 列表符号变淡：`ul>li::marker{color:var(--color-tx-faint)}`，`ul>li::marker{font-size:85%}`。
  - 主题与色：`body{color-scheme:light dark}`；底纸是 `--flexoki-paper:#FFFCF0`（**暖白，不是纯白**），正文色 `--flexoki-black:#100F0F`（对纸白约 **19:1**，我算的，推断）；次级色 `--color-tx-muted: flexoki-600 #6F6E69`（对纸白约 **5.0:1**，推断）。

- **不要学的地方**
  - **底纸是 `#FFFCF0` 暖白、不是 `#FFFFFF`**；卡片（`.backlink`）、tag、输入框都有 4px 圆角；`.backlinks` 是 2 列卡片网格。我们按约束要**纯白 + 直角 + 无卡片**。
  - **`a:focus{outline:none; background-color:var(--color-bg-hover)}`** —— 键盘焦点只剩一层浅背景色，感知很弱。**这一点明确不要学**，我们要保留清晰的焦点轮廓（或 `box-shadow` 焦点环，见第 1 站的写法）。
  - 代码注释用 `--color-tx-faint` = Flexoki 300 `#B7B5AC`，对纸白约 **2.0:1**（我算的，推断值），远低于 4.5:1。**注释色的"淡"不要照抄到这个程度**；区分注释应该用「字号/斜体/中等灰」，不是「几乎看不见」。
  - 正文虽然有 `max-width:var(--wrap-normal)`，但**段落 `p{max-width:var(--wrap-normal)}` 是逐元素限宽**，不是容器限宽——这在遇到很长的行内链接/代码时会显得零散。我们用自己的容器限宽更稳（这是我的判断，推断）。

- **来源**：https://stephango.com/ ｜ https://stephango.com/style ｜ https://stephango.com/styles.css

---

### 3. Robin Rendle — https://robinrendle.com/

- **它是什么**
  资深前端 / 排版写作者的个人站（2002 年以来的老站，现在首页是照片索引，页脚标着版本号 `v19.1.1`）。他的排版随笔（如 *The New Web Typography*）本身就是我们这个方向的参考文本。

- **值得偷的一点**
  **「大标题」不靠字号，靠版块。** 在他的文章页里，正文 20px、h1 只有 33px（比例仅 **1.65×**）——层级主要靠位置和色块；真正撑住首屏的是 `height:90vh` 的**整块色带**，文字底部对齐、题图半透明叠在旁边。另外一招同样具体：**图版用一条满宽深色带把图片从正文里"切"出来**（`.figure--full__content{background:#222; width:100%}`）。

- **怎么实现的**（读到自 [文章页](https://robinrendle.com/stories/new-web-typography/) 的内联 `<style>`）
  ⚠️ **时效注意**：这套 CSS 是该文章页当前输出的内联样式（`lang="scss" is:inline`），风格偏 2016 年那一代；而站点首页已经改版成 v19 的照片索引。**"现在的 Robin Rendle 长文页"我没有验证**，下面的数字请当作"一个成熟的编辑风实现样本"来读，而不是"他现在的样子"。

  - 正文：`body{font:115%/1.55 Georgia, serif}` → `@media (min-width:621px){font-size:120%}` → `@media (min-width:921px){font-size:125%}`。即 **18.4px → 19.2px → 20px**（推断：按 16px 根字号换算）。
  - **版心统一**：`.wrapper p, .wrapper h1…h5, .wrapper pre {max-width:700px; margin-left:auto; margin-right:auto}` —— **正文、标题、代码块、引用块共用同一个 700px 版心**（约 65–70 字符，推断）。移动端 `padding:0 15px`、≥621px `padding:0 5%`、≥921px `padding:0`。
  - 段间距：`p, blockquote, figure, pre, ul, ol…{margin-bottom:1.575rem}`，≥621px 提到 `1.8rem`。
  - **字号阶梯（读到具体 px）**：h1 `28 → 30 → 33px`（`line-height:1`）；h2 `28px / 1.3`；h3 `25 → 26 → 28px`；h4 `17 → 19px`；h5 `16 → 17px`；h6 `15px`。→ **h1 与 h2 几乎同号**，层级靠位置、颜色和版块，不靠字号。
  - 首屏色带：
    `@media(min-width:921px){.title{background-color:#319f90; position:relative}}`
    `@media(min-width:1101px){.title{height:90vh; display:flex; align-items:flex-end; min-height:600px; max-height:700px}}`
    `.title__text{max-width:720px; left:28%→34%; width:65%→60%}`；`.title__img img{opacity:.5 → .7}`。
  - **满宽深色图版**：`.figure--full__content{clear:both; background-color:#222222; width:100%; float:left}`（配 `.figure--padded-small{padding:100px 20px}` / `.figure--padded-large{padding:200px 20px}`）。
  - **图注窄于正文**：`figcaption{width:100%; padding:15px 20px}`，`@media(min-width:621px){figcaption{max-width:450px}}`；`figcaption p{font-size:.75em; color:#666; line-height:1.4}`；`figcaption h4{text-transform:uppercase; font-size:18px; color:#2b8c7e}`。→ **450px vs 700px：图注比正文窄一档，字号小一档，颜色灰一档**。
  - 浮动图：`@media(min-width:921px){.right{float:right; clear:both; width:400px; padding-right:40px; margin-left:20px}}`（`.left` 对称）。
  - **尾注系统**：`p sup a{background:none !important; text-decoration:none !important; border:none !important; color:#319f90 !important}`；`.footnotes .footnote{font-size:80%}`；`.footnotes ol li{font-size:90%; column-break:avoid}`；`.footnotes hr{display:none}`。→ **尾注整体缩到 90%、隐藏分隔线、编号上标用强调色**。
  - **下划线技巧（不用 `text-decoration`）**：
    ```css
    a{ color:#319f90; position:relative;
       background-image:linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,.1) 50%);
       background-repeat:repeat-x; background-size:2px 3px; background-position:0 19px; }
    a:hover{ background-image:linear-gradient(to bottom, rgba(0,0,0,0) 50%, #319f90 50%); }
    ```
    → 用重复渐变画虚线，**能精确控制"线离基线多远"（`0 19px`）**；hover 换成实线强调色，不产生布局移动。
  - 断点共 4 档：`621 / 921 / 1101 / 1401px`（读到的媒体查询）。

- **不要学的地方**
  - **强调色被用滥了**：同一个页面里 `#319f90` 至少出现在 **6 处** —— 正文链接、尾注上标、首屏整块色带、`.frame` 背景、圆形头像描边（`border:7px solid #319f90`）、图注 h4（`#2b8c7e`）。这正是「强调色只在极少数位置出现」的反面教材。
  - 正文是 **Georgia 衬线体**，与我们「grotesk 标题 + 无衬线正文」的方向相反。
  - 首屏 `90vh` 色带 + 半透明题图的「杂志封面」效果很强，但**前提是你有一张足够好的图**。我们起步阶段的三篇草稿不满足这个前提 → 这一招先不学。
  - 图注 `color:#666` 对白底约 **5.7:1**、正文 `#444` 约 **9.7:1**（均为我手算的推断值）：合格，但图注已经接近下限，我们选图注灰时留更多余量。

- **来源**：https://robinrendle.com/ ｜ https://robinrendle.com/stories/new-web-typography/ （样式读自该页 `<head>` 内联 `<style lang="scss" is:inline>`）

---

### 4. Rauno Freiberg — https://rauno.me/

- **它是什么**
  爱沙尼亚交互设计师的个人站。首页不是文章列表，而是一叠 **1200×720 的"画布"**（`data-sheet`），横向排开、每张是一个目的地（Devouring Details / Craft / Projects / Field Notes / 联系 / 一句格言），底部有一条「缩略图导航条」（minimap）。

- **值得偷的一点**
  **把设计 token 从命名开始就做对，而且尺寸与颜色分离**：间距 `8px` 步进共 11 档、字号 9 档、行高 8 档、字重 5 档；同一套尺寸在明暗两套主题下完全不动，只换颜色变量。另一招很轻巧：**字号由语义属性驱动**——正文写 `<p data-size="medium">`，而不是 `p.lead` / `p.big` 这种表现类名。

- **怎么实现的**（读到自 [rauno.me](https://rauno.me/) 首页 `<head>` 里的内联 stitches CSS）

  - 间距刻度：`--space-1:8px` … `--space-11:88px`（**每档 +8px，共 11 档**）。
  - 字号刻度：`--fontSizes-10/12/14/16/20/24/32/40/48` —— 9 档，**16 之后按 4 的倍数粗跳**（16→20→24→32→40→48）。
  - 行高刻度：`--lineHeights-12/16/20/24/32/40/48/56` —— 8 档，与字号档位对齐。
  - 字重：`--fontWeights-400/500/600/700/800`（5 档，没有 300，也没有 900）。
  - 圆角：`--radii-1:4px / -2:8px / -3:16px / -round:9999px`；阴影：`--shadows-small/medium/large`（`0 5px 10px rgba(0,0,0,.12)` 等）→ **阴影是黑白的，不带色偏**。
  - 字体族：`--fonts-body: X, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", …, sans-serif`（`X` 是自托管字体，页面同时 `preload` 了 `/dd.woff2`）、`--fonts-mono: JetBrains Mono, Menlo, monospace`、`--fonts-serif: Georgia, serif`。→ **注意：它的正文栈里没有 Inter**，标题字体是自托管的单个 woff2。
  - **线框语言**：首页容器用内联变量描述整张画布 ——
    `<main data-sheet="index" style="--line-width:1px; --line-gap:9px; --line-color:var(--colors-gray9); --frame-width:1200px; --frame-height:720px">`；
    每张画布是 `style="width:1200px;height:720px;position:absolute;left:1240px"`（**1200 + 40 间距，用绝对定位 left 偏移排开，不是 flex**）。
  - **进度指示器就是一排 1px 竖线**：底部 minimap 由 20 个 `minimap_line`（`--line-height:18px; --line-gap:9px`）加 3 个 tracker 组成，tracker 靠 `transform:translateX(80px)` / `translateX(140px)` 平移；`--tracker-width:30px`。
  - 字号用法：`<p data-size="medium">`（属性选择器）——**语义属性驱动字号**，换字号不用改类名结构。
  - 颜色：`--colors-bg:#FFF`（亮）/ `#000`（暗）；灰阶直接搬 Radix `gray1…gray12` + `grayA1…grayA12`；强调色变量是 `--colors-red:#FF484C`；同时页面类里还引用了 `var(--yellow)`、`var(--orange)`，另有一个历史图标的 SVG 用 `fill="#0000FF" stroke="#0000FF"`。
  - 开关变量：`--colors-focus:var(--colors-gray9)`、`--colors-grid:var(--colors-gray8)`；`::selection{background:var(--yellow); color:black}`。
  - 无障碍（读到的属性）：装饰层全部 `aria-hidden="true"`（ghost / cross / minimap）；每张画布是带 `aria-label` 的 `<a>`；复制邮箱后有一个 `role="region" aria-live="polite"` 的反馈区读屏播报。
  - 入场动画：标题按行切成 6 段，每段内层 `style="transform:translateY(100px)"`（`clipReveal` 逐行上推）；容器 `style="opacity:0;transform:scale(0)"`。⚠️ **大标题的具体 `font-size` 不在读到的 token 里，未能验证**（只能确定它撑满 1200×720 的画布）。

- **不要学的地方**
  - **首页形态是"画布式"的，对以长文为主的博客是方向错误**：固定 1200×720、绝对定位、几乎全屏、依赖 JS 动画（`transform:scale(0)` / `translateY(100px)` 入场）、还要维护一条 minimap。我们只偷 token 与线框语言，不偷这个形态。
  - **它同时用了红 `#FF484C` + 黄 + 橙 + 蓝 `#0000FF`，不满足我们的单强调色约束**。别把它当"单色站"参考。
  - `--radii-round:9999px` 圆形色块 + 三档阴影，是它的视觉语汇；高对比编辑风里应该只有 0 圆角和 1px 线。
  - 局限：**只读到首页的 token**；`/craft`、`/notes`、`/projects` 的正文排版**未验证**。

- **来源**：https://rauno.me/ （token 读自该页 `<head>` 内联 `<style id="stitches">`）

---

### 5. Dan Luu — https://danluu.com/

- **它是什么**
  以长文技术分析闻名的个人站。首页就是一串按 `MM/YY` 排序的**纯文字链接列表**（外加 Patreon 分区）——没有封面图、没有分页、没有摘要、没有卡片。

- **值得偷的一点**
  **超长代码行的答案可以是"折行"，而不是"横向滚动"——而且整个站点的排版 CSS 只有 200 字节。** 这不是"简陋"，这是一个明确的取舍样本：对以文本阅读为主、读者会复制代码的站点，宁可让长行折断也不让出现横向滚动条。**但它和「保留缩进」是互斥的**，这一点我们必须自己决定（见下文"可迁移手法汇总"）。

- **怎么实现的**（读到自 [danluu.com/boring-languages/](https://danluu.com/boring-languages/) 的 `<head>`）

  - 全站样式就是 `<head>` 里的一个 `<style>`，内容全部如下：
    ```css
    img{max-width:100%;height:auto}
    pre{max-width:100%;height:auto;white-space:pre-wrap;overflow-wrap:anywhere}
    .np{display:flex;flex-flow:row wrap;justify-content:space-between;padding-bottom:.5em;font-style:italic}
    ```
    外加 `<meta name="color-scheme" content="light dark">`。
  - **页头没有任何 `<link rel="stylesheet">`** —— 没有外部样式表。这意味着正文字号、行高、h1–h6 阶梯**全部落在浏览器默认值上**（即 16px 基准与 UA 的 `h1=2em / h2=1.5em / h3=1.17em` 阶梯），只有 `lh`、`max-width`（无）和代码折行是作者定的。
  - `.np` 是"上一篇 / 下一篇"那一行（`flex-wrap` + 两端对齐 + 斜体）。
  - 首页结构是 `<ul><li><a>`，日期只是一个 `MM/YY` 前缀文本。

- **不要学的地方**
  - **`pre` 上同时用 `white-space:pre-wrap` + `overflow-wrap:anywhere` 会毁掉代码缩进**——`anywhere` 允许在任意字符间断行，多语言代码块里的缩进层级会看不出来。**对我们的技术文这是错误取舍**（我的判断，推断）。
  - 全站没有版心限制，长行在宽屏上会非常长；没有字号阶梯，标题层级几乎靠 UA 默认值和 `<h1>/<h2>` 语义。这是 Dan Luu 的"累积 100+ 篇之后才成立"的个人风格，**不是从零起步该抄的样式基线**。
  - 首页是"反向时间线链接堆"，对只有三篇文章的新站没有意义。

- **来源**：https://danluu.com/ ｜ https://danluu.com/boring-languages/ （CSS 读自该页 `<head>` 内联 `<style>`）

---

### 6. 胡涂说（hutusi.com） — https://hutusi.com/

- **它是什么**
  中文长文博客，作者自述「前软件工程师，现 Vibe Coder」。文章动辄 5000–6000 字（读到的一篇是 **5,975 字 / 21 分钟阅读**）。站点用作者自研的 Amytis 框架（Next.js），页脚标注「基于 Amytis 构建」，仓库在他自己的 GitHub 上。

- **值得偷的一点**
  **内容先分「流」，再谈排版。** 它的信息架构不是"一个文章列表"，而是几条并行的流：`文章`（长文）/ `好奇心周刊`（周刊）/ `心流`（短记录）/ `笔记` / `合辑`（系列）/ `归档` / `标签` / `链接`。而每篇文章头部有一行结构化元数据：`essay · 2026-01-11 · 5,975 字 · 21 分钟阅读`——**对中文站点，字数和阅读时长是最有信息量的两个信号**。

- **怎么实现的**（读到自首页与 [一篇文章](https://hutusi.com/articles/2025-review/)）

  - 文章头：一个类型徽标（`essay`）+ 日期 + 「N 字」+ 「N 分钟阅读」，然后才是标题与副标题。
  - **首页用版式差异表达重要性，而不是给每一项套同样的卡片**：「精选文章」的四张里，第一张是**大图上、标题下**，第二张是**文左图右**，第三、四张是**纯文字标题 + 副标题**；下面「最新文章」是**无图列表**（日期 + 标题 + 副标题）。四种版式同屏，但都是"图 + 字"两种素材的不同排布，不是卡片组件。
  - **正文内嵌图片**：图片独占一行，**图注写成紧跟其后的引用块**（渲染出来是 `> [题图] 2025年春节我们一家去了北京和天津玩…` 这样的引用样式）。→ 即用 blockquote 承载图注，而不是 `<figcaption>`。（这是我从渲染结果推断的，**具体 DOM 未验证**。）
  - 图片走自有 CDN（`cdn.hutusi.com/images/…`），且能看到 `nextImageExportOptimizer` 产出的 WEBP 变体（同一个 logo 有 `logo-256x256-opt-128.WEBP`）→ **静态导出 + 构建期图片后处理管线**，与我们 `content/` 同目录图片 + Astro 构建期优化是同一思路。
  - 文末固定几段：作者卡（头像 + 一句话简介）、公众号二维码图、标签、**相关文章（3 列卡片）**、分享按钮（X / Facebook / LinkedIn / 微博）。
  - 字体（读到的 `preload` 列表，全部是同源自托管 woff2/ttf）：**Inter（Bold / Regular）+ Libre Baskerville（Bold / Italic / Regular）**。
  - 有明暗主题切换（页面上有 `Toggle theme`）。
  - "更多"折叠里还有 `笔记 / 图谱 / 归档 / 标签 / 链接 / 订阅` 六个入口。

- **不要学的地方**
  - **直接用了 Inter**，而且是「Inter 做正文 + 衬线做标题」这个 2023–2025 年最普遍的组合。我们的约束明确禁止 Inter，且 serif 标题与 grotesk 方向相反 → **只偷它的信息架构与元数据行，字体一个字都不偷。**
  - **「相关文章」是 3 列卡片网格，且卡片带图**——非常靠近我们禁止的「一屏三列 feature grid」。起步阶段建议用「带日期的纯文字列表」替代（这是我的建议，不是它的问题）。
  - 文末「作者卡 + 二维码 + 相关文章 + 分享按钮」四连，加上首页「精选 / 最新 / 近期心流 / 精选合辑」四段，**信息密度偏高**。我们只有三篇文章、六个标签，应该只有一条流。
  - 页面同时挂了 Google Tag Manager 和自建 Umami（读到的 preload）——与 `site-decisions.md` 里「不加载任何第三方脚本」直接冲突，**不要学**。

- **来源**：https://hutusi.com/ ｜ https://hutusi.com/articles/2025-review/

---

### 7. Craig Mod — https://craigmod.com/

- **它是什么**
  常驻日本的写作者 + 摄影师的个人站（页脚「since 2002」）。主体是长文随笔、每周通讯 *Ridgeline*、以及他自出版的摄影书。不是公司站，但有会员计划和书店（自出版）。

- **值得偷的一点**
  **图注就是正文的一部分，而且 `alt` 写成一整句完整描述。** 图片下面紧跟的那行，是正常字号的普通文本（不是小号灰字），同时图片的 `alt` 属性也写成一句有人读得懂的话——这是这次调研里最值得直接抄的一条无障碍实践。

- **怎么实现的**（读到自首页与 [Ridgeline 190](https://craigmod.com/ridgeline/190/)）

  - 一期通讯的结构层次很清楚：
    `# 大标题`（Tokyo Notes - Public Commons）→ `#### 一句话副标题 / deck`（Thinking about sentos and shrines and kissaten and their value）→ `### 栏目 + 期号`（Ridgeline Transmission 190）→ **一行全大写斜体标签**（`TOKIO TŌKYŌ TOKYO` / `TOKYO` / `WALKING`，各自链到标签页）→ 正文 → 文末一个 `C` 署名。
  - **图片处理**：标题下方一张头图（`/ridgeline/images/190/190.jpg`）在正文之上；正文中段的图片独占一行，**紧接着就是图注文本行**——例如「A home next to the TBS building in Akasaka; like a shrine, but not a shrine, and once the legality of its razing is resolved, will be gone」。
  - **`alt` 写成完整句子**：`alt="A home that is not a shrine but feels like a shrine, and will be gone soon"`、`alt="Header image for Tokyo Notes - Public Commons"`。→ **不是 `alt="image1"`，也不是把图注重复一遍。**
  - **章节之间用 `* * *` 分隔线**，而不是加小标题——一篇 3000+ 字的信里切了 3 段，全靠一条分割线。
  - **引用块用来放"别人写的一整段"**（Sam Holden 的那段），引用完紧跟自己的评述；另一处引用来自他自己的书。→ 引用块是内容，不是装饰性 pull quote。
  - 底部"Previous / Next"两条是 **`#### 189`（编号）+ `##### 标题 — 副标题`** 的双层结构：编号放大、标题小一号当补充。
  - 文末是作者简介块（头像图 + 一段身份说明 + 支持方式链接）与一条「Whacked together by Craig Mod since 2002」的署名行。

- **不要学的地方**
  - **首页是营销首页**：三本书的封面三连、Shelf Awareness / Kirkus / Smithsonian 的获奖徽章图、**两次**订阅表单、一个 YouTube 视频、四条外刊链接。对一个个人博客，这是"商业化首页"，**起步阶段完全不要**。
  - 正文里有大量站外营销链接（`amzn.to` 联盟链接、`shop.specialprojects.jp`），以及"会员才能看存档"的付费墙提示。**我们不做。**
  - 局限：**只读到首页与一期 Ridgeline，CSS 未能拿到**（用 `link` 选择器抓 `<head>` 返回空），所以它的字号 / 版心 / 代码块规则**均未验证**。上面的手法都是从**页面结构与属性**读出来的，不涉及具体数值。

- **来源**：https://craigmod.com/ ｜ https://craigmod.com/ridgeline/190/

---

## 可迁移手法汇总（按主题，这才是这份文档真正的产出）

### 排版系统

**版心（三家的三种解法，可以组合）**

| 解法 | 出处 | 做法 | 我们的适配 |
|---|---|---|---|
| 三档命名网格线 | Matt Ström-Awn | `narrow:40rem` / `wide:60rem` / `full`，配 `grid-column:narrow\|wide\|full` | 最贴我们的"强网格"，且移动端塌陷只改线名 |
| 两变量 + margin 公式 | Steph Ango | `--wrap-normal:37em` / `--wrap-wide:54em` + `margin-left:calc((min(100vw,var(--wrap-wide)) - 100%)/-2)` | 最省代码的满宽突破，适合只有长文 + 图片的站 |
| 单一 700px + 百分比 padding | Robin Rendle | `.wrapper p, h1…pre{max-width:700px; margin:0 auto}` | 最简单，但"宽图/窄文"的对比要另外做 |

**中文行宽必须自己算，不能用 `ch`**：`65ch` 是「65 个 `0` 字宽」，在拉丁文里约等于可读区间，但**中文一个字≈1em**，`65ch` 会变成非常短的一行。我们的正文按 **`34–38em`（≈ 620–700px）** 起步更稳——这是**推断/建议**，不是读到的数值：**七个站点里唯一的中文站（hutusi）我恰恰没读到它的样式表，所以中文正文的最优行宽 / 行高在这份调研里没有硬数据**。

**字号阶梯：四种思路**

- **固定档位**（Rauno）：`10/12/14/16/20/24/32/40/48`，16 之后按 4 的倍数粗跳。**优点**：每个字号都有明确用途，不会有"随手 26px"。**适合**：设计系统式的严格站点。
- **流式 calc**（Steph Ango）：正文 `calc(1.5rem + .25vw)`、h1 `calc(1.35em + .55vw)`、h2 `calc(1em + .2vw)`。**优点**：任何视口都连续，不为断点写覆盖。
- **clamp 三档**（Matt Ström-Awn）：辅助文字 `clamp(.85rem,2vw,.9rem)`、行高 `clamp(1.2em,calc(26px - 1vw),1.3em)`。**优点**：给"小字"也留了上下限，避免极小屏上小到不可读。
- **百分比三档**（Robin Rendle）：正文 115% → 120% → 125%，只随断点跳。

**标题与正文的比例，读到的正好是两个极端**：Robin `33px / 20px = 1.65×`（层级靠版块），Rauno 的字号档位里 `48px / 16px = 3×`。我们的方向是「超大粗体标题 + 大字号跳跃」→ 应落在 **2.5–3.5×** 这一侧，而不是 Robin 那一侧。**注意**：一旦比例上到 3×，`h1` 就不能再和 `h2` 只差 5px（Robin 那样），层级必须靠字号重新建立。

**垂直节奏**：抄 Matt Ström-Awn 的 `body *+*{margin-top:var(--space-s)}` + 三档疏密变体 + 例外清单（`*+br, br+*, li+li, table *+*{margin-top:0}`）。这比给每个组件手写 `margin-bottom` 稳定得多。

**章节编号（01/02 只当锚点）**：两个可用的细节 ——
1. 编号用**等宽数字**对齐：Steph Ango 在表格和 `sub/sup` 上用了 `font-variant-numeric: tabular-nums`；
2. 编号占固定宽度：Matt Ström-Awn 的目录里 `.ethics--toc-numeral{display:inline-block; width:1.5rem}`。
把这两条合起来（`tabular-nums` + 固定宽度 + mono 或 grotesk 的粗体数字），编号就不会因为 01/02 与 10/11 的宽度差而抖动。

### 强调色的用法

从读到的样本里，能数出**三种使用密度**：

| 密度 | 出处 | 强调色出现的位置 |
|---|---|---|
| **0 处（静止时）** | Steph Ango | 正文链接是纯黑 + 下划线；`#24837B` 只在 `a:hover` 时出现 |
| **1 处（同一页）** | Matt Ström-Awn | `--c--blue-500:#5763ff`，用于链接 / 主按钮 / nav hover 背景 |
| **6+ 处（同一页）** | Robin Rendle | 正文链接、尾注上标、首屏整块色带、`.frame` 背景、头像描边、图注 h4 |
| **4 种颜色** | Rauno | `#FF484C` 红 + `var(--yellow)` + `var(--orange)` + `#0000FF` 蓝 |

**→ 我们的落点（建议）**：橙 `#E4572E` 只出现在 4 个位置 —— ①链接 hover / 当前项指示 ②章节编号 ③焦点环 ④（可选）引用块的左边框。**正文链接默认是黑色带下划线**（学 Steph Ango），点击态/hover 才变橙。

**⚠️ 一个必须先解决的对比度问题（我手算的，推断值，**未用工具实测**）**：

- `#E4572E` 对纯白 `#FFFFFF` ≈ **3.7 : 1** → **不满足 WCAG AA 对正文的 4.5:1**，只满足"大字号文本"的 3:1（≥24px，或 ≥18.66px 且粗体）。
- `#E4572E` 对 `#0E0E0E` ≈ **5.2 : 1** → 在近黑底上是合格的。
- 参考：`#0E0E0E` 对白 ≈ **19.3 : 1**（我们的主文字关系非常充裕）。

**结论**：橙**不能**用来做小字号正文链接的颜色（会对 `site-decisions.md` 的「正文对比度 ≥ 4.5:1」硬约束违约）。可行做法是：小字链接保持黑色 + 下划线，橙色只用于 **hover 态的下划线/背景块/图形**，或者把橙调深到能过 4.5:1 的另一档（需要在阶段 4 用工具实测，不要沿用我这个手算值）。

### 代码块（尤其超长行）

**三种策略，都在本次调研里读到了实体规则：**

| 策略 | 出处 | 具体规则 |
|---|---|---|
| **横向滚动** | Matt Ström-Awn | `pre[class*=language-]{overflow:auto; white-space:pre; word-break:normal; tab-size:4}` |
| **强制折行** | Dan Luu | `pre{white-space:pre-wrap; overflow-wrap:anywhere}` |
| **两层兜底** | Steph Ango | `pre{white-space:pre-wrap}` + 外层 `.highlight{overflow:auto}` |
| **行内单独规则** | Matt Ström-Awn | `li code, p code{background:gray-25; padding:.1em .25em; word-break:break-all}` |
| **行内单独规则** | Steph Ango | `code, kbd{background:bg-secondary; padding:.1em .2em; border-radius:4px; font-size:90%}` |

**→ 我们的落点（建议）**：
- **块级代码用横向滚动**：`pre{overflow-x:auto; white-space:pre}` + 显式 `tab-size:4`。**不要**在 `pre` 上用 `overflow-wrap:anywhere`（Dan Luu 的做法会毁掉缩进，多语言代码块尤其致命）。
- **行内代码用断开**：`code{overflow-wrap:anywhere}`（长路径/长标识符不会撑破版心）。
- **加一条可见性提示**：既然选了滚动，就得让读者知道能滚（例如给可滚动容器一条细边框或渐隐遮罩）——这是**我的推断建议**，调研里没有一个站点这么做。

**视觉外壳**：读到的三种是 —— Steph Ango 的 **1px 边框 + 4px 圆角 + 白底**；Matt Ström-Awn 的 **极浅灰底 `#f8f8fa` + 无边框 + .5rem 圆角**；Dan Luu 的 **零装饰**。我们的方向（纯黑白 + 直角）最接近的是 **Steph Ango 的边框版去掉圆角**：`1px solid` 灰边 + 白底。

**注释色**：Steph Ango 的 Flexoki 映射里，注释 = `--color-tx-faint` ≈ **2.0:1**（我算的）。**不要抄这个淡度**；区分注释应该靠「字号 / 斜体 / 中等灰（≥4.5:1）」。

**行号：这份调研里没有样本。** 七个站点中我能读到代码相关规则的三个（Matt / Steph / Dan），用的都是 Prism / Rouge 的 token 类名（`.token.keyword`、`.highlight .k`），**没有任何一个读到行号实现**。如果我们要行号，需要另外找参考，或者自己用 CSS counter 做。

**⚠️ 与 `site-decisions.md` 的冲突点**：那些站点的高亮都依赖 Prism / Rouge / highlight.js 之类的处理器（且部分是**客户端**高亮）。我们定的是「不加载任何第三方 JS/CSS / 纯本地 Markdown」→ 高亮只能在**构建期**做完，或者干脆**不做语法高亮**，只用底色/边框 + 等宽字体。这是一个必须在阶段 4 前拍板的取舍。

### 正文内嵌图片

**三种被读到的做法**：

1. **满宽色带切分**（Robin Rendle）：`.figure--full__content{background:#222; width:100%}`，配 `.figure--padded-small{padding:100px 20px}` / `-large{200px 20px}`。→ 用一整条深色带把图片"切"出正文，视觉重量最大。
2. **网格宽栏**（Matt Ström-Awn）：`figure` 落 `wide` 栏；**画廊**用 `:has()` 按图片数量在 1/2/3/4 栏之间自动选择，移动端（≤800px）变成 `overflow-x:auto` + `scroll-snap-type:x mandatory` + `figure{flex:0 0 75vw}` 的横向轮播。→ **这是"带照片的短文"最值得整套照抄的方案**（`scroll-snap` 让一屏露出 3/4 张，天然暗示可滑）。
3. **图注 = 紧跟图片的文本**（Craig Mod 用普通文本行；hutusi 用引用块）。→ 实现最简单，且图注是正文的一部分，不是元数据。

**图注的具体样式（读到的数值）**：
- Robin Rendle：`figcaption{max-width:450px; padding:15px 20px}`，`p{font-size:.75em; color:#666; line-height:1.4}` → **比正文窄一档（450 vs 700）、小一档、灰一档**。
- Steph Ango：`figcaption{font-size:.8em; color:muted; padding:1em}`，并且 `img + em`（图片后紧跟的斜体）**自动变成居中图注**。
- Matt Ström-Awn：`figcaption{font-size:var(--t--size-s); color:secondary; margin-top:.5em}`。

**圆角**：Steph Ango `--image-radius:6px`（移动端满宽元素归零）；Matt Ström-Awn `.5rem`；Robin Rendle 无圆角。→ **我们按约束用 0 圆角 + 不用阴影**，靠 1px 线或直接无边。

**我们的三篇草稿正好各对应一种形态**：长文（3000+ 字）用单栏 + 网格宽栏图片；技术文用横向滚动的代码块；照片短文用 `:has()` 画廊 + 移动端 scroll-snap。

### 移动端退让

**版心塌陷的三种写法**（都不需要给组件写覆盖）：

| 出处 | 断点 | 做法 |
|---|---|---|
| Matt Ström-Awn | ≤800px | **重定义命名网格线**，把 `medium/narrow/wide` 落在同一列，gap 归零 |
| Steph Ango | ≤860px | `--wrap-normal:88vw; --wrap-wide:100vw; --heading-weight:600`；`.wide` 的圆角归零 |
| Robin Rendle | ≤620/920px | 版心不变（700px），只改 padding（`0 15px` → `0 5%` → `0`），字号 115%→125% |

**表格**：只有两个样本 ——
- Matt Ström-Awn：`.table--responsive`（`thead{display:none}`、行转块、`td::before{content:attr(data-label)}` 把表头复制进单元格）。**适合 2–3 列的窄表**。
- Steph Ango：`.table-mobile-wide table{width:106%}` + `td{min-width:16em}`（**允许横向滚动**）。
→ **技术文里的宽表格建议用横向滚动（保真），窄表才卡片化。**

**导航**：**七个站点里，没有一个是"汉堡菜单 + 全屏遮罩"**。Craig Mod 与 hutusi 都是把链接直接排成一行/两行露出（hutusi 只把 6 个次要入口折进一个「更多」，主入口仍然可见）；Rauno 是横向画布 + 底部 minimap。→ **移动端导航保持一行文字链接，不做汉堡。** 这对"移动端必须可用"的约束是最省事也最不显 AI 味的解法。

**字号**：七个站点里**没有一个在移动端用 `transform: scale` 或视口单位硬缩字号**；要么不改（Robin / Steph 用 `vw` 兜住），要么改的是别的东西（Steph 改版心与字重，Matt 用 `clamp` 兜住小字）。

### 无障碍

**读到的可学项**：

- **`alt` 写成完整句子**（Craig Mod）：`alt="A home that is not a shrine but feels like a shrine, and will be gone soon"`。这与 `content-model.md` 里「有 `cover` 就必须有 `coverAlt`」的硬约束完全一致，且给出了标准：**一句人能读懂的话，不是关键词堆**。
- **可见焦点环**（Matt Ström-Awn）：`input:focus{box-shadow:0 0 0 3px var(--c--blue-100); outline:0}`。Robin Rendle 的 reset 里也保留了 `button:-moz-focusring{outline:1px dotted ButtonText}`。
- **视觉隐藏 ≠ `display:none`**（Matt Ström-Awn）：`.lyt-visually-hidden{clip-path:inset(50%); width:1px; height:1px; overflow:hidden; position:absolute; white-space:nowrap}`，连 MathJax 的 `mjx-assistive-mml`（给读屏的 MathML 副本）都用同一手法。
- **异步反馈要播报**（Rauno）：复制邮箱后有一个 `role="region" aria-live="polite"` 的区域。→ **我们的「代码块复制按钮」必须照做**（`site-decisions.md` 第 6 节已定要这个功能）。
- **装饰元素显式 `aria-hidden="true"`**（Rauno 的 ghost / cross / minimap）。
- **`color-scheme: light dark`**（Dan Luu 写在 `<meta>`，Steph Ango 写在 `body`）→ 让原生滚动条与表单控件跟随主题。**注意**：我们不做暗色模式，所以只需要 `color-scheme: light`，仍然建议显式声明。
- **数字对齐**（Steph Ango）：`font-variant-numeric: tabular-nums`（表格、`sub/sup`）。
- **`font-size-adjust:100%`**（Matt Ström-Awn 的 `html`）→ 减少自托管字体回退时的 x-height 跳动。**对我们的自托管子集字体尤其有用**（`site-decisions.md` 第 7 节定了自托管裁剪 WOFF2）。

**读到的反面（不要学）**：

- Steph Ango `a:focus{outline:none}` 只留一层背景色 → 焦点太弱。
- Steph Ango 代码注释 ≈ 2.0:1；Matt Ström-Awn 次级灰 `#72777a` ≈ 4.5:1 压线。
- Robin Rendle 图注 `#666` ≈ 5.7:1 → 合格但接近下限。

**⚠️ 我这次没有验证的无障碍项**：键盘 Tab 顺序、跳转链接（Skip to content —— 只有 hutusi 页面里有 `Skip to main content` 链接，其余六个没读到）、以及任何工具的实测对比度（本文所有比值都是我用 WCAG 相对亮度公式手算的**推断值**）。

---

## 反面参考：要避开的模式

以下都是在这次实际抓取中**观察到的具体做法**，不是泛泛而谈。

1. **把强调色当装饰色用。** Robin Rendle 一页 6 处 `#319f90`（含整块首屏色带、头像描边）；Rauno 首页同时用红 + 黄 + 橙 + 蓝。"单一强调色"的唯一可验证含义是：**在任何一个页面上，你能用一只手数出它出现的位置**。
2. **给所有东西套卡片。** hutusi 的「相关文章」3 列卡片（带图）、Matt Ström-Awn 的 `.stub--project`（圆角 + 1px 边框 + 缩略图 hover 位移）、Steph Ango 的 `.backlink` 2 列卡片网格。→ 我们用「日期 + 标题」的列表，不用卡片。
3. **首页变成营销页。** Craig Mod 首页 = 三本书的封面 + 三个获奖徽章 + 两次订阅表单 + 一个视频 + 四条外刊链接；hutusi 首页 = 精选 / 最新 / 近期心流 / 精选合辑四段。→ 起步阶段首页应该只有「我是谁 + 一篇文章列表」。
4. **圆角 + 阴影 + 胶囊色块。** Rauno 的 `--shadows-small/medium/large`（`0 5px 10px rgba(0,0,0,.12)` 等三档）与 `--radii-round:9999px`；Matt Ström-Awn 的 `--l--border-radius:0.5rem` 到处用；Steph Ango 的 4px/6px。→ 高对比编辑风应该**只有 0 圆角和 1px 线**。
5. **色板贪多。** Matt Ström-Awn 有 `gray-0…gray-1000`（14 档灰）+ blue / green / red / yellow 各 12 档；Rauno 直接整套搬 Radix（`gray1-12` + `grayA1-12` + blue / green / amber / teal / red 各 12 档）。→ **我们只需要 1 黑、1 白、2–3 灰、1 橙**（`#0E0E0E` / `#FFFFFF` / 两档灰 / `#E4572E`）。
6. **字体上的"AI 味"是有具体配方的。** 这次调研里反复出现的组合是 **「Inter 做正文/UI + 一个衬线体做标题」**：hutusi = Inter + Libre Baskerville；Matt Ström-Awn = Inter（变量字体，`size-adjust:92%`）+ charterVariable 衬线正文；paco.me 的 preload 是 Inter / Söhne / Newsreader；Steph Ango 的 `--font-content` 是 `-apple-system, BlinkMacSystemFont, "Inter", "IBM Plex Sans", Segoe UI, …`——**Inter 排在第三位、IBM Plex Sans 第四位**。→ 「Inter + 圆角卡片堆砌」之所以一眼假，是因为它总跟这套 2023–2025 年的默认组合捆在一起。我们要的 **grotesk 标题 + 无衬线正文** 是对它的正面回避，**不是把 Inter 换成另一个默认字体**；而且 Steph Ango 那条栈里正好出现了 IBM Plex Sans，说明这个方向在成熟站点里也有人走。
7. **装饰层堆叠。** Rauno 的 ghost / cross / minimap 三层装饰 + 每页一个 1200×720 画布；Robin Rendle 的 90vh 首屏色带 + 半透明题图。都是成熟站点的"招牌动作"，**对刚起步、素材有限的站是负债**（要先有足够好的图、足够多的内容才撑得住）。

---

## 我没能验证的

**方法上的限制**（先说清楚，因为下面几条都源于此）：

- `web_fetch` 会把 HTML 转成**纯文本**，`<head>` 里的 `<style>`/`<link>` 全部不可见。我用了两个只读代理绕过（`api.microlink.io` 按选择器取 `<head>`；`api.allorigins.win/get` 返回 JSON 包裹的原始 HTML），另外直接抓 `.css` 文件。
- `api.allorigins.win` 与 `api.codetabs.com` **间歇性返回 522 / 520**（同一 URL 一次成功一次失败），所以有几个站点抓不到原始 HTML。
- **不可达**：`github.com` 与 `raw.githubusercontent.com`（本机 DNS 解析到非公网 IP）、`web.archive.org`（DNS 失败，所以**无法用 Wayback 交叉验证任何站点的改版历史**）、`alexanderobenard.com`（DNS 失败）。`agent-reach` 技能在本机不可用。

**具体没验证到的**：

| 项目 | 状态 | 原因 |
|---|---|---|
| **paco.me 的视觉参数** | 站点可访问，读了[首页](https://paco.me/)与[一篇技术文](https://paco.me/writing/hook-getter)（含多段代码），但**代码块底色 / 圆角 / 是否滚动全部未能验证** | `<head>` 里的 4 个 CSS chunk（`/_next/static/chunks/*.css`）没读到。读到的只有字体 preload：`inter-subset` / `sohne-subset` / `newsreader-subset`。**因为拿不到样式证据，我没有把它写进上面的七个站点。** |
| **hutusi 的 CSS 数值** | 只读到字体 preload（Inter + Libre Baskerville）与三份样式表 URL；**中文正文的 `max-width` / `line-height` / 代码块规则未能验证** | 样式表是 Next.js 的哈希 chunk，体积大，没逐个抓 |
| **Robin Rendle 的当前版本** | 那套数字读自文章页的**内联样式表**（偏 2016 那一代），首页已改版为 v19.1.1 的照片索引；**新版长文页未能验证** | 换版后长文页的样式可能已不同 |
| **Rauno 的内页** | token 读自首页；`/craft`、`/notes`、`/projects` 的正文排版**未能验证** | 未逐页抓取 |
| **Craig Mod 的 CSS** | **完全没拿到**（用 `link` 选择器取 `<head>` 返回 `null`）；字号 / 版心 / 代码块规则均未验证 | 只从页面结构与属性（`alt`、标题层级）得出结论 |
| **Dan Luu 的代码块实际观感** | 规则明确读到（`white-space:pre-wrap; overflow-wrap:anywhere`），但**没有视觉验证折行后的效果** | 没有渲染截图能力 |
| **行号实现** | **七个站点里一个样本都没有** | 三个有代码规则的站点用的都是 Prism / Rouge 的 token 类名，没有行号相关规则 |
| **所有对比度比值** | **都是我按 WCAG 相对亮度公式手算的（推断值）**，不是工具实测 | 本机没有可用的对比度检测工具；请勿把 `#E4572E` ≈ 3.7:1 当成定论，阶段 4 要复测 |
| **移动端实际渲染 / 键盘 Tab 顺序 / Lighthouse** | 全部未验证 | 没有浏览器渲染与审计能力（`windows-computer-use`、浏览器面板类工具未在本会话使用） |

**另外**：`web_search` 在这个主题上的返回质量很差——搜"swiss style personal blog"之类的词，返回的前几名全是 [Framer 模板商场](https://www.framer.com/marketplace/templates/satz/)、[WordPress 主题目录](https://wordpress.org/themes/keahi/)、[Template0 模板站](https://template0.com/item/swiss-operator) 这类**模板商城的 SEO 页**，正是任务里要求排除的东西。所以本次调研**基本放弃了"搜索榜单"这条路，改为直接验证候选站点**（先 `web_fetch` 站点确认可访问，再按需取原始 `<head>` / CSS）。
