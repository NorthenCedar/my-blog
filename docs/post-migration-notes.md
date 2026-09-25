# 文章页迁移工单（`chrome='band'` → `chrome='page'`）

> 给下一轮执行用的工作底稿，验收通过后可删。**本文件不含任何代码改动。**
> 规范来源：冻结原型 `prototype/terminal/post.html`（288 行，我已通读）。动手前先看 §4 的待拍板项。

## 0. 范围与前置件

**做什么**：把三篇文章页从旧外壳（深色带 `chrome='band'`）迁到内页外壳（`chrome='page'`），
版式照原型 `post.html`：顶栏 + 页头（四角定位点）+ 正文流里的目录 + 相邻导航 + 评论区。

**不做什么**：跨页 View Transitions（原型 L183-193，属 B2 工单 §9 的独立待办）；不动 `content/` 正文。

**前置件（都已在位）**：
| 件 | 状态 |
|---|---|
| `chrome='page'` 外壳（顶栏 + 切片档案背景 + `.pagehead` + 画序修正 + scrim） | ✅ `0f33faf`，已在 `/gallery` 上跑通 |
| 导航含「相册」 | ✅ 本轮 |
| 正文样式 `prose.css`（全局，标题/代码块/表格/引用齐全） | ✅ 已存在，原型 L85-104 那套基本一致 |
| 页面已有件 | ✅ `Toc.astro` · `CommentSection.astro` · `scripts/copy-code` · `scripts/comments` · `Post.astro` 里的 `.adj` |

## 1. 原型结构（实测行号）

| 行 | 元素 | 说明 |
|---|---|---|
| 42–50 | `.topbar` | 内页顶栏 —— **已由外壳提供，页面不用管** |
| 52 | `.wrap` | 版心 `calc(--measure + 12rem)` 居中 |
| 55–67 | `.posthead` | **页头**：`padding --sp-8/--sp-7` + 下缘 1px `--ink` 实线 + **四角定位点**（`::before/::after` 6px 方块在 `top:--sp-8` 左右各 −3px）+ `.kicker`（日期/标签/时长/字数）+ `h1`（`max-width:22em`）+ `.standfirst` |
| 70–82 | `.toc` | **≥1080px 才显示**：`position:fixed; top:9rem; left:2rem; width:11rem`，左边框发丝线 |
| 85–104 | `.prose` | 纯净文档流，正文流内**不插任何装饰**（这是文章页的第一优先级） |
| 107–115 | `.adj` | 相邻导航：上缘 1px `--ink`，`max-width:--measure`，`.next` 靠右 |
| 118–137 | `.comments` | 评论区：上缘 1px `--ink` + `max-width:--measure` |
| 138–139 | `footer` | 浅色单行页脚（原型是草案文案，不是最终实现） |
| 140–181 | 背景 | **切片档案**四层 —— **外壳已实现**，页面不用管 |
| 183–193 | View Transitions | ❌ 不属本步 |

## 2. 现状与差异（要改的到底是什么）

**现状**（`src/layouts/Post.astro`，77 行）：
```
<Base title description>
  <Fragment slot="band">        ← 标题 + <Meta> 渲染在**深色带内部**
    <h1 class="hero-title">…</h1><Meta post={meta} />
  </Fragment>
  <article><Toc/><div class="prose"><Content/></div></article>
  <nav class="adj">…</nav>
  <CommentSection/>
</Base>
```

**四处差异**：
1. **`chrome='page'` 不渲染 `<slot name="band" />`** ⇒ 标题与 Meta 会**静默消失**。
   必须把它们挪进正文流，并套上外壳提供的 `.pagehead`（四角定位点已在外壳里）。
2. **`Meta.astro` 用的是 `--on-band-meta` / `--on-band-sub`**（深色带专用浅色）⇒ 在浅底上几乎看不见。
   **必须先做主题化**（§4-A）。
3. 原型页头有一行 `.standfirst`（导语）—— 内容层有 `summary` 字段（80 字上限），天然对应（§4-B）。
4. 页脚：外壳现在用的是**深色** `SiteFooter`，原型内页是浅色单行（§4-C）。

## 3. 迁移步骤（建议顺序，每步可独立验证）

1. **Meta 主题化**（前置，单独改、单独验）：让 Meta 的颜色随外壳走，而不是写死深色带专用色。
2. **标题进流**：`slot="band"` 里的 `<h1>` + `<Meta>` 挪进 `<header class="pagehead">`，`<Base>` 加 `chrome="page"`。
3. **版心与页头尺寸**：原型 `.posthead` 的 `padding`/下缘实线/`h1` 的 `max-width:22em` 对齐；
   注意与 `--measure`（34em）的关系 —— 页头与正文列对齐还是铺满 `.shell`，见 §4-D。
4. **目录**：原型只在 ≥1080px 显示且 `fixed` 在左；核 `Toc.astro` 现状（本轮**没读**，动手前先读）。
5. **相邻导航与评论**：`max-width: --measure` 对齐正文列；核 `CommentSection.astro`（本轮**没读**）。

## 4. 站主已拍板（2026-09-26，四项全部按建议采纳）

**A. Meta 主题化 → 用变量，不跨组件覆盖。**
`Meta.astro` 写 `color: var(--meta-color, var(--on-band-meta))`（`.tag` 同理用 `--meta-sub`），
外壳里设 `--meta-color` / `--meta-sub`：`chrome='page'` 下设为 `--muted` / `--muted`。
颜色归组件自己声明、外壳只提供变量；将来再多一种外壳也不会再翻车。
**爆炸半径已核**：Meta 只在 `Post.astro` 里用 ⇒ 3 篇文章页。

**B. 页头导语（standfirst）→ 要。**
内容层 `summary` 是必填字段（80 字上限），而首页 S2 现在只显示标题 ——
**文章页是它唯一能被读者看到的地方**；原型页头本来也有这一行（`.standfirst`，L67）。

**C. 页脚 → 保持深色 `SiteFooter`。**
全站共用；为一个页面分裂页脚不值得。原型那行浅色单行是草案文案，不采纳。

**D. 页头版心 → 收成 `--measure`，与正文列对齐。**
文章页是纯阅读，页头与正文左对齐更稳；也避免 1440 下那条下缘实线横跨 1312px。

**动手前必须先读的两件（不许按原型臆测）**：`src/components/Toc.astro` 与
`src/components/CommentSection.astro` —— 本工单写作时没有读它们，
原型里目录是「≥1080px 才显示、fixed 在左」，但现有组件的真实状态未知。

## 5. 验证配方（沿用 B1/B2/P5 口径）

```powershell
npm run build                 # 页数仍 15（不是新增页，是 3 页变化）
npx vitest run                # 82 条必须全绿（含 alt 非空 / --accent-bright 白名单两条全局契约）
node scripts/verify-home-states.mjs   # 首页不被牵连
```

**硬判据**：
1. **先冻结基线**，再 L2 双侧：预期**只有 3 篇文章页变**，其余 12 页逐字节不变；差异逐页枚举。
2. **正文流里没有装饰**（原型的第一优先级）：断言 `.prose` 内没有绝对定位/装饰元素。
3. **标题与 Meta 真的在正文流里**（不是又被槽吞了）：`.pagehead h1` 存在且文本 = 文章标题；
   `.pagehead .meta` 的 computed `color` **不是**深色带专用色（即不等于 `--on-band-meta` 的值）。
4. **目录**：≥1080 显示、<1080 隐藏；锚点跳转可用。
5. **对比度**：Meta 主题化后跑 `scripts/assert-tokens.mjs`；若引入新色对，必须进断言表。
6. **真实按键**：Tab 顺序、`skip` 链接可用（外壳已有）。
7. **三态 + 两档截图**：1440 / 390 / 无 JS 各一张，**逐张 `read_image` 复核后再报**
   —— 台账最新那条就写着「截图不是辅助，是判据的一部分」，而且上一轮的浏览器默认蓝就是这么抓到的。

## 6. 风险

- **槽吞内容**：`chrome='page'` 不渲染 band 槽。迁移时若漏搬任何一块（标题、Meta、将来的其它件），
  它会**静默消失**且构建照常成功 —— 这正是 §5.3 那条断言存在的理由。
- **Meta 的深色带专用色**：忘了主题化就是"浅灰压浅底"，肉眼一眼看得出、断言不一定覆盖 ⇒ 必须写成计算色断言。
- **3 页同时变**：`Post.astro` 是共享 layout，三篇文章页一起变；L2 必须逐页枚举，不能只看"变了 3 页"。
- **目录与评论本轮没读**：动手前先读 `Toc.astro` 与 `CommentSection.astro`，别按原型臆测它们的现状。
