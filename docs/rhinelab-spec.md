# 莱茵生命方向 · 设计规范（动效 / 配色 / 布局）

> ## 这份规范的来源，以及哪些是事实、哪些是**待复核**
>
> **2026-09-26 溯源修正**：这一段此前写着"本文所有『参考值』都出自上游 `src/style.css` —— 是他们的真实数值"。
> 逐条复核后发现**只对了一半**，故改写如下（复核依据：上游仓库全树 + `api.github.com/contents` 逐文件取回，
> 细节见本次会话的勘察报告与 `docs/site-decisions.md`）。
>
> | 来源 | 用法 | 复核结果 |
> |---|---|---|
> | 站主从参考视频提取的三条设计语言（配色 / 动效节奏 / 交互反馈） | 作为纲领 | 视频流本身取不到，三条是转述；**不是**逐帧结论 |
> | 上游 [`LBEILC/RhineLabUI`](https://github.com/LBEILC/RhineLabUI)（MIT，Copyright (c) 2026 LBEILC；TypeScript + Three.js + Vite 的**非官方复刻**） | 动效词汇与 PV 参考区间 | ✅ 仓库存在。⚠️ 但它的 README **明确把《明日方舟》名称/标志/原 PV/原片音频，以及 MiSans / Novecento 等第三方素材排除在 MIT 之外**（"本项目无法代替他们授权"）—— 引用其数值可以，搬其素材不行 |
> | 上游 **`src/style.css`**（实测 40,339 B，即文中所说的"40 KB"） | §1 的动效时长与曲线 | ✅ **可对上**（`transform 1.6s cubic-bezier(.16,1,.3,1)`、`blink .8s steps(1) infinite`、`.welcome` / `.brand` 等均有原句） |
> | 同上 | §2.2 的**冷绿候选值** | ❌ **对不上**：上游现行配色是纸白 `#e8e5e1` + 金棕 `#a67d48` + 选中 `#cbb397`，**全库没有任何绿色**。§2.2 因此应视为**本站自拟的候选**而非上游数值 —— **该节待逐条复核**（该决定已被否决，见下） |
> | 上游 `src/boot*.ts` 等开场实现 | §0 里"参考实现是 Three.js 场景时间轴"这一说法 | ❌ **说法不准**：上游开场是**纯 DOM + 内联 SVG 的 2D 逐帧动画**（`requestAnimationFrame` 驱动 + 关键帧表 + 单调三次 Hermite 保速插值），**不用 Three.js、也不用 CSS 动画计时**；Three.js 只用于其后的档案场景阶段 |
> | 本仓库 `docs/design-spec.md`（阶段 4 冻结）与 `prototype/terminal/*.html` | 现状对照 | ✅ |
>
> **结论**：本站现行的绿系配色是**自研变体**，与上游不同源（决定见下：不换绿）。
> 引用上游时，**法务上守"只抄数值与做法、不搬素材"这条线**；**数值一律以它的代码为准，不以它的文档为准**
> （它的文档自相矛盾：品牌首行字距同时写着 2.5px 与 1px，代码实际 2.324px）。

---

## 决定记录（站主 2026-09-25 定案）

| 项 | 决定 | 状态 |
|---|---|---|
| 换冷绿（§2.2） | **不换** | ❌ **已否决** —— `--accent` / `--accent-deep` / `--accent-bright` / `--accent-wash` 保持原值，**不要再改**；§2.2 的候选表只作为"将来要换时的备选"保留 |
| `--dur-enter` 320 → 640ms（§1.2） | **要** | ✅ 已在 `prototype/terminal/home.html` 实装，实测 computed = `640ms` |
| 点击绿色闪烁（§1.4-1） | **做** | ✅ 已实装：`pointerdown` → `.is-flash` → 180ms 后移除。实测：点击后 40ms 底色为 `--accent-wash`、描边为 `--accent` 绿；300ms 后类已清除 |
| 数字跳动（§1.4-2） | **做** | ✅ 已实装：HUD 百分比指数逼近（每帧补 28% 差额）。实测 000% → 063% → 081% → 093% → 097% → 100%；reduced-motion 下 000% → 100% 一步到位 |
| 其余 token（`--ease` / `--ease-interact` / `--dur-stagger` / `--dur-orbit` / `--dur-blink`） | 未表态 | ⏸ **未实装**，等站主点名 |

### 决定记录补记（2026-09-30，站主拍板「主页就用这个」）

| 项 | 决定 | 状态 |
|---|---|---|
| 主页整套换成原型 `nc-rhine-v7` | **要** | ✅ 已落地（`d955663`），细节见本文 **§6** |
| 其他页 | **不动** | ✅ 只改了 `src/pages/index.astro`，全局 token 一行未动 ⇒ 其余 22 页产物不受影响 |
| 时长类 token 是否跟原型 | **不跟** | ✅ 见 §6.4：原型 820/90/1100ms，本站仍按 §1 的 640/320/900ms |

**本轮改动范围**：只动原型 `prototype/terminal/home.html`。`src/` 一行未改 ——
现在改 `src/` 会把**旧版视觉**的入场动画也拖慢，没有意义；等整版从原型搬进 `src/` 时一起落。

---

## 0. 一句话

这套语言可以归结成一句：**界面是一台正在工作的仪器** —— 动效只回答"它在读什么、读到哪了"，不做装饰性表演。

参考实现 README 里的动效词汇刚好印证这一点：逐字输入 · 圆环绕行 · 连续 Logo 笔画 · 对角解密线合拢 ·
盖板自上而下由磨砂变清晰 · 标题与编号连续滚动 · 卡片依次变色。**没有一条是"为了好看"的动效**，每条都在表达进度或层级。

---

## 1. 动效规范

### 1.1 分四层（关键：别用一套时长打天下）

| 层 | 场景 | 时长 | 缓动 | 依据（参考实现的真实值） |
|---|---|---|---|---|
| **交互层** | 悬停微亮、焦点、按压 | **120–180ms** | `cubic-bezier(.22,1,.36,1)` | `transition: transform 180ms cubic-bezier(0.22,1,0.36,1)`、`background .2s/.3s` |
| **叙事层** | 区段入场、逐层展开、解密线合拢 | **600–1000ms** | `cubic-bezier(.16,1,.3,1)` | `transform 1.6s cubic-bezier(0.16,1,0.3,1)`、`opacity .6s/.7s/.8s`、`transform 1.3s cubic-bezier(.22,1,.36,1)` |
| **错位** | 逐层展开时元素之间的先后 | delay **300–400ms**，层间 **80–120ms** | 同叙事层 | `opacity .8s .3s`、`opacity .7s .4s, transform .7s .4s` |
| **循环层** | 圆环绕行、指示脉冲 | **4s / 8s / 16s**，`linear infinite`（反向加 `reverse`） | `linear` | `animation: orbit 4s/8s/16s linear infinite` |
| **硬切层** | 光标 / 扫描指示 | **800ms `steps(1)`** | 无补间 | `animation: blink .8s steps(1) infinite` —— 仪器是硬切的，不是呼吸灯 |

一句话记忆：**交互快（0.18s）、叙事慢（0.6–1s）、错位 0.3s、循环 linear、光标硬切。**

### 1.2 落到 token

现状：`--dur-fast:120ms; --dur-enter:320ms; --ease:cubic-bezier(.2,0,0,1)`

建议（原型与站点同改；站点落在 `src/styles/tokens.css`）：

```css
--dur-fast:120ms;                          /* 交互层 —— 保留不动 */
--dur-enter:640ms;                         /* 叙事层：320 → 640，才够"逐层展开" */
--dur-stagger:320ms;                       /* 新增：错位延迟 */
--ease:cubic-bezier(.16,1,.3,1);           /* 叙事层主曲线 */
--ease-interact:cubic-bezier(.22,1,.36,1); /* 新增：交互层曲线 */
--dur-orbit:8s;                            /* 新增：循环层基准（4/8/16 按元素体量选） */
--dur-blink:800ms;                         /* 新增：硬切闪烁 */
```

**唯一有争议的一条**是把 `--dur-enter` 从 320ms 提到 640ms —— 入场会明显变慢。这是有意的（参考实现的叙事层就是 0.6–1.6s），
但需要站主点头。**不要**把交互层一起放慢：180ms 说明快反馈才是这套语言的底色。

### 1.3 现有动效逐条对照（哪些已合规、哪些要调）

| 现有动效 | 现在 | 判定 |
|---|---|---|
| 刻度填充 / HUD 百分比 | 跟随滚动，无补间 | ✅ 属于"仪器读数"，**不该**加缓动 |
| 扫描带端点闪光 | 120ms linear | ✅ 交互层 |
| 聚焦弱化（0.65 → 1.0） | `--dur-enter` 320ms | ⬆ 建议提到 640ms（叙事层） |
| 入场揭示 `is-revealed` | 观察器触发，无错位 | ➕ 建议加 320ms 错位 |
| 橙色区段切换 | 160ms linear | ✅ 交互层 |
| 跨页过渡 | 出 200 / 进 260ms | ✅ 交互层 |
| **点击绿色闪烁** | **没有** | ➕ 缺一条（视频里明确有"点击时短暂绿色闪烁"） |
| **数字跳动** | 直接赋值 | ➕ 缺一条（视频里的"数字跳动"） |

### 1.4 还缺的两条（建议实装，本轮尚未做）

1. **点击绿色闪烁** —— `pointerdown` → 加 `.is-flash` → 180ms 后移除；只改 `background` 与 `outline`，不动布局。
2. **数字跳动** —— HUD 百分比由"直接赋值"改成"180ms 内插值到目标值"。`font-variant-numeric: tabular-nums` 已经在了，所以数字不会跳字宽。
   （参考实现的数字时钟是**逐位滚动**，那是 3D 版的做法；纯 DOM 版用插值就够，也更快。）

### 1.5 硬约束（一条都不破）

只动 `transform` / `opacity` / `color` / `background-color`，**不动 layout**；
`prefers-reduced-motion` 下全部压到 1ms 且不做位移（现有全局规则已经做到）；橙色只做瞬时反馈。

---

## 2. 配色

### 2.1 视频的三条 → 现有 token 的映射

| 视频里的角色 | 现有 token | 判定 |
|---|---|---|
| 白色为主底 | `--paper #FAFAF7` + `--panel #EFEDE7` | ✅ 已经是 |
| **冷绿 = 数据高亮 + 界面元素** | `--accent #2D7D46`（hue **139°**） | ⚠️ **偏中性，不够"冷"** → 见 2.2 |
| 橙色只在关键操作出现 | `--signal #E87722`（仅图形）+ `--signal-text #B45309` | ✅ 已经是，而且比视频更严（只用于区段切换的 160ms） |

### 2.2 建议：把绿换成冷绿（hue 139° → 165°）

> ⚠️ **溯源更正（2026-09-26）：本节数值不是上游数值。** 上游 `src/style.css` 里**没有任何绿色**
> （它是纸白 `#e8e5e1` + 金棕 `#a67d48` + 选中 `#cbb397`）。下面这组冷绿候选是**本站自拟**的对比度方案，
> 与上游无关；且该决定**已被站主否决**（不换绿，见文件头的决定记录）。
> **本节保留仅作"将来要换时的备选"，不得再被当作"参考实现的真实值"引用。**

对乳白纸 / 面板 / 黑带的实测对比度：

| 候选 | hue | 对纸 | 对面板 | 对黑带 | 结论 |
|---|---|---|---|---|---|
| 现状 `#2D7D46` | 139° | 4.86 | 4.34 | 3.72 | 纸上可承载文字 |
| **冷绿 B `#14795F`** | **165°** | **5.11** | **4.56** | 3.53 | ✅ **推荐**：两处都 ≥4.5 |
| 冷绿 A `#1F7A5E` | 162° | 5.02 | 4.48 | 3.60 | 面板上差 0.02，不采用 |
| 冷绿 C `#20786B` | 171° | 5.07 | 4.53 | 3.56 | 偏青，作备选 |

配套替换（均已实测）：

| token | 现在 | 建议 | 实测 |
|---|---|---|---|
| `--accent` | `#2D7D46` | `#14795F` | 纸 5.11 / 面板 4.56 ✅ |
| `--accent-deep`（面板上小字） | `#266B3B` | `#0F6B53` | 纸 6.18 / 面板 5.52 ✅ |
| `--accent-bright`（仅图形 / 黑带上亮档） | `#4CAF50`（hue 122°，偏黄绿） | `#34C08A`（hue 157°） | 黑带 8.14（现在 6.79）/ 纸 2.22 → **只能非文字** ✅ |
| `--accent-wash`（悬停底） | `#EDF3EC` | 按新绿 6% 混纸重算 | 只求"看得出有块底色" |

**代价**：`--accent-bright` 现在和主绿不同源（122° vs 139°），换冷绿后如果只换主绿，两者会差得更远 —— 所以要**成套换**。
**安全网**：换完必须跑 `scripts/assert-tokens.mjs` 与 `tests/tokens.test.ts`。它们断言的是**对比度数值不是色相**，上面这些数字复算通过就安全。

---

## 3. 布局结构要不要调整？

**结论：不需要为这套动效改结构。**

理由（逐条对上）：

| 视频里的动效 | 落到现有结构的哪里 | 要改结构吗 |
|---|---|---|
| 界面逐层展开 | **已有** `.field-item` + `is-revealed`（IntersectionObserver 已在）加 `transition-delay` | 不用 |
| 数字跳动 | **已有** `hudPct` 节点 | 不用 |
| 扫描线划过 | **已有** `.band` | 不用 |
| 圆环绕行 | 背景层（本轮已加的 `.bg-ring` / 图案） | 不用 |
| 点击绿色闪烁 | 事件委托，约 6 行 JS | 不用 |

**唯一要动的布局**：手机端底部 —— 本轮已把扫描进度线挪到 OS 状态条的顶边上（两者共线，不打架），`body` 底部补 1.9rem。

---

## 4. 建议的落实顺序

1. 换冷绿（3 个 token + `--accent-wash`），跑 assert-tokens 与 tokens 测试
2. 补 `--dur-enter:640ms` / `--ease` / `--ease-interact` / `--dur-stagger`，给 `is-revealed` 加错位
3. 补点击绿色闪烁（约 6 行 JS）
4. 数字跳动（180ms 插值）
5. 以上先做在**原型**上；站主看过再进 `src/`（`content/` 全程不动）

---

## 5. 明确不做的

- **不做**"盖板由磨砂变清晰"：那是 Three.js 的材质动画，纯 DOM 做不到；用透明度 + 线宽近似就够，硬做会变成假 3D。
- **不做**逐位滚动的数字时钟：3D 版的做法，DOM 版收益低。
- **不引第三方动画库**：现有 token + 原生 CSS 能覆盖全部四条曲线。

---

## 6. 原型 nc-rhine-v7 落地（2026-09-30 · 提交 `d955663`）

> 本节是**主页**的现行视觉基准。上面 §1–§5 讲的是通用规范，两者冲突时，**主页以本节为准**。

### 6.1 来源与落地方式

| 项 | 值 |
|---|---|
| 原型 | `<本机会话目录>/2026-09-29-16-02-31/nc-rhine-v7/index.html`（1703 行单文件） |
| 站主指令 | 「主页就用这个，其他页用原来的」+「怎么快怎么来，主页和原型一模一样就行」 |
| 落地方式 | **结构 + 样式照抄，内容走本站字段** |
| 为什么不做整文件替换 | 原型里写死了一批 demo 文章（「免费使用正版的 Typora 教程」等），照搬会砸掉 `getVisiblePosts` 的真实数据源。所以内容一律取 `recentPosts` / `site.*`，一个字面量都不写 |
| 改动范围 | `src/pages/index.astro` + `tests/build-output.test.ts` 一条判据。全局 token 未动 |
| 验收 | 六档视口（1920/1440/1280/1024/768/390）hero 满宽、横向溢出 0；`vitest` 133 passed |

### 6.2 量测对照（1440×900，headless Chrome 实测，不是目测）

| | 原型 | 改前 | 改后 |
|---|---|---|---|
| `.display` 字号 | 102.4px | 136px | **102.4px** |
| 大标题行数 | 2 行（`<br>` 硬折行） | 1 行挤满 | **2 行** |
| `.topbar` 高 | 77px | 51px | **80px** |
| `.lede` 量度 | 578px | 40rem | **40.5rem** |
| 文章条目 | 三列 grid（日期｜标题+摘要｜标签） | 一行挤一串 | **三列 grid** |
| 滚动带 `.marquee` | 有（两行反向对跑 46s/52s） | 无 | **有** |

上一版「首屏不是整个屏幕」的根因：只换了颜色、**没换节奏** —— 大标题比原型大 33%，把整块顶上去了。

### 6.3 定稿值清单（★ 直接照抄，不许「优化」）

| 项 | 值 | 出处 |
|---|---|---|
| logo 摆动 | `±4.2°` / `translateY(-7px)` / `7.5s` | 原型 `.hero-logo` |
| logo 配色 | `--logo-ink #e9efe9` / `--logo-glow #8fe0b0` | 原型；已单独成 token，**不归并**进通用绿 |
| 首屏大标题 | `--hero-fs-display: clamp(2.4rem, 9.2vw, 6.4rem)` | 原型（全局 `--fs-display` 仍 8.5rem，只首页覆盖） |
| 玻璃卡视差 | 位移 22 / 34 / 44px 逐块递增，`--tilt: 1deg` | 原型 |

> **教训**：logo 摆幅曾被私自改成 ±1.6°/9s（"只是变小了"，肉眼说不出哪里不对）；logo 配色曾被归并进
> `--on-band-sub` / `--accent-bright`（"语义相邻"）—— **两次都被站主抓到**。
> 品牌标识类取值单独成 token 并注明出处；**语义相邻不是合并的理由**。

### 6.4 刻意没跟原型的三项（有理由，不是漏了）

| 项 | 原型 | 本站 | 理由 |
|---|---|---|---|
| `--dur-enter` | 820ms | **640ms** | §1.2 的 640ms 是站主 2026-09-25 定案；本轮只要求换视觉，没要求改时长 |
| `--dur-stagger` | 90ms | **320ms** | 同上 |
| `--pt-sweep` | 1100ms | **900ms** | 同上 |

**要改随时可以改，但需要站主点名** —— 时长一改会牵动全站叙事层，不是主页一处的事。

### 6.5 本轮新踩的坑（已写进工作区 `MEMORY.md`）

1. **同一类名在文件里定义两遍 + 后写者赢** ⇒ `--fs-display` 改了纹丝不动（136px 不降）。
   改样式前先 `grep` 这个类名出现几次，比改完再量便宜。
2. **少一个 `}` 静默吞掉后面一整段 CSS** ⇒ 产物里 `.entry` 被错误拼成 `.hero-copy[…] .lede[…] .entry a`，
   grid 完全失效。症状是"新写的样式没生效"，真凶在文件别处；**去 `dist/_astro/*.css` 里搜自己的选择器**最快。
3. **横向溢出的真凶不是刚改的元素** ⇒ 390 视口多出 12px，先怀疑 RhGrid 的 path，加两层 `overflow:hidden` 都没用。
   用「逐个 `display:none`，看 `scrollWidth` 是否回落」二分定位，才发现是滚动带的 `.dup` 副本排到 1813px。
   `.marquee` 自己的 `overflow:hidden` 只裁**视觉**，`scrollWidth` 要**父级**收（用 `overflow-x:clip`）。

### 6.6 three.js 的加载策略（2026-09-30 补：整包 → 具名导出收口）

首屏那个真 3D DNA 是全站**唯一**的第三方库（站主拍板「用 three.js，接受破例」）。它分三层下载，
其中第二层曾经踩过一个不报错、只在体积上显现的坑：

| 层 | 做法 | 为什么 |
|---|---|---|
| ① `dna3d.ts` | 被首页 `<script>` 静态引用，打成小 chunk | 首页内联 JS 有 7168 B 预算，three 装不进去 |
| ② `dna-scene.ts` | **具名静态 re-export** three 的 9 个符号 | ★ 见下 |
| ③ three + GLTFLoader | 动态 `import`，只在「容器在 + 非 reduced-motion + WebGL 可用 + 首屏在视口」时才下载 | 不满足条件的用户一个字节都不付 |

**★ 为什么必须有第 ② 层**：原先写的是 `await import('three')` —— 拿到的是**整个命名空间对象**，
打包器判断不出哪些导出最终没被用到，只能把整包全留着。实测产物 **657.2 KB**。
改成「动态 import 一个只做具名 re-export 的小文件」之后，打包器看得到「只有 9 个符号被用到」，
其余全部摇掉 ⇒ **541.9 KB（−115.3 KB / −17.5%）**，页面总 JS 从 734 KB 降到 619 KB。

**维护约定**：`dna3d.ts` 每多用一个新的 three 符号，就要在 `dna-scene.ts` 补一条导出。
漏了不会报错 —— 运行时 `THREE.XXX` 是 `undefined`，属于静默故障，所以那里刻意不做 `export *`。
回归网在 `tests/build-output.test.ts` 的「首页 DNA：three.js 不许退回整包」（源码扫描 + 产物实测字节两条）。

### 6.7 三轮对齐（2026-09-30 · 补齐 §6.1 落地时缺的三屏）

站主指令：「把主页换的跟这个一模一样……把这个里面的链接都换成真实链接，
右上角的导航栏和文章都要能正常点进去」。

§6.1 那一轮换掉的是**首屏 + 文章条目 + 滚动带**；本轮补齐原型里还有、而站上缺的几块：

| 项 | 原型 | 本轮之前 | 现在 |
|---|---|---|---|
| S3 卡片屏（四张玻璃卡） | `.cards` / `.card` | 是「项目」空态 | **四张卡 = 更新日志最新 4 条** |
| 技术栈语言占比条 | `.langbar`（条 + 图例 + 明细） | 无 | **有，数字构建期实测** |
| 首屏 SCROLL 提示 | 左下角横排 + 2.2s 跑光 | 居中竖线 + 竖排字 | **原型值** |
| 背景肌理（绿雾 / 72px 呼吸网格 / 左下同心环） | `.bg`（3 层，fixed） | 无（随 console 外壳一起删了） | **有** |
| 纸白区背景 | 半透明渐变（`fixed`） | 纯色 `var(--paper)` | **半透明**（否则上面那层肌理被盖死） |

**内容一律走真实数据源，一个字面量都不写**（沿用 §6.1 的规矩）：

- S3 卡片 ← `content/pages/log.md` 最新 4 条，排序与日期复用 `lib/log-order.ts`
  （首页与 `/log` 页永远同一顺序、同一写法）。原型的四张卡写的是原型自己的迭代史，照抄毫无意义。
- 技术栈 ← **构建期实测**（`src/lib/lang-stats.ts`）。口径：扫 `src` / `content` / `functions` /
  `scripts` / `tests`，只算 `.astro/.ts/.css/.md/.js/.mjs/.json` 的字节；
  **排除** `dist`（产物 = 自身副本，计进去是双倍）、`node_modules`、以及 `src/vendor/`
  （三方 vendored 副本占 800 KB 量级，计进去会让 JavaScript 一项虚高到失真；
  GitHub 的 linguist 同样有 vendor 排除规则）。
  ★ 写死数字的结局一定是过期，而且**没人会发现** —— 原型那段手抄数据就被站主当场纠正过。
- 导航与文章条目：`NAV_LINKS`（9 项）与 `getVisiblePosts()` 原样使用，本来就已经是真实链接。
  原型里的 `href="#"` / 假文章标题一个都没搬。

**本轮新增的「刻意没跟」（接 §6.4）**

| 项 | 原型 | 本站 | 理由 |
|---|---|---|---|
| 滚动视差（`.par` / `.par-slow` / `.par-fast`） | 玻璃卡上移 26/18/34vh、网格 -9vh、文案 +6vh | **不跟** | 它与鼠标视差写同一个 `transform` 属性 ⇒ 滚动驱动动画会覆盖掉首屏那套指针视差；原型注释自己也写了「DNA 视差已按站主要求移除」。两套同时上只会互相打架 |
| `.panel` 控制台 | 原型右下角的调试面板 | 不搬 | 那是原型自己的调试件（播过渡 / 扫视差 / 测帧率），不是页面的一部分 |
| 页脚 | `.foot` 两段占位文本（"运行 — 天" / "PV — UV —"） | `SiteStats`（真实运行时长 + 真实 PV/UV） | 原型那两段是 demo 占位；站上早就接了自己的计数（`functions/_middleware.ts`），没有理由退回假数字 |

**本轮踩到的两个坑（都是测试当场抓的，不是目测发现）**

1. **纸白底上用亮绿 ≠ 合法**。语言占比条第一段我原本照原型写了 `--accent-bright`，
   `tests/tokens.test.ts` 立刻拦下：`#4caf50` 对纸只有 2.66:1，这个 token 只许出现在深色底上。
   改法：占比条走 `--accent-ink → --accent` 同色系渐变（纸上是它该有的颜色）；
   首屏 SCROLL 跑光那道 1px 线**确实**在深墨绿场上，属于正当用途 ⇒ 登记进白名单。
   ★ 白名单要写**产物里的选择器形态**（esbuild 把 `::after` 压成 `:after`），
   写成 `::after` 的例外永远匹配不上 —— 白名单会变成摆设。
2. **`prefers-reduced-motion` 下 `animation: none !important` 会让"靠动画到达终态"的元素永久消失**。
   占比条的初值是 `transform: scaleX(0)`、图例与明细的初值是 `opacity: 0`，
   全靠 `forwards` 停在可见状态 ⇒ 动画一禁就是整块内容凭空不见。
   这是**可用性**问题不是观感问题，所以必须显式写终态（用 `!important` 顶回那条全局规则）。

**验收（1440×900 headless Chrome 实测）**

- 六档视口（1920/1440/1280/1024/768/390）：hero 满宽、**横向溢出 0px**
- S3 = 4 张卡、S4 = 5 段条 + 5 条图例，条本体 `transform` 收敛到 `matrix(1,0,0,1,0,0)`（= 生长完成）
- `npm run verify`：134 passed；唯一失败是本机已知环境故障 `spawnSync node EBUSY`，
  用绝对路径 node 直跑 `scripts/assert-tokens.mjs` 11 项全达标（含新增的 SCROLL 跑光那处）

### 6.8 以原型为源重写（2026-09-30 · 站主指令「直接换成原型，不要改本站的像原型」）

站主澄清了做法：**不要拿本站现有代码去逼近原型，要以原型文件为源改完直接上**。
所以 `src/pages/index.astro` 本轮**整体重写** —— 结构、类名、CSS、动效逐段照抄原型 v10.6。

#### 与原型逐字一致的部分

- 类名**全部换回原型原名**：`.band` / `.band-inner` / `.band-copy` / `.band-glass` /
  `.bg-inf-logo` / `.section` / `.entry-list` / `.marquee` / `.paper-wrap` / `.foot`。
  （上一版为避开「中扫描带」把 `.band` 改名 `.hero`；那套扫描带早已删除，本轮还回去。）
- **四层滚动视差照原样加上**（CSS scroll-driven、零 JS、`@supports` 降级）：
  `.bg-grid.par` -9vh ／ `.band-glass.par-fast` -26 / -18 / -34vh ／
  `.band-copy.par` +6vh 且 `opacity → .55`。
  ⚠️ 这一条**推翻了 §6.7 的「不跟」决定** —— 站主本轮明确点名要视差。
  它与指针视差写同一个 `transform`（滚动时滚动驱动动画覆盖指针视差），
  这正是原型自身的行为，站主已知情并选择照原型。
- 动效 JS 换成原型那三段：指针视差（两段式 rAF，静止自停）、百褶 ∞ 显隐、
  IntersectionObserver 揭示（Web Animations，播完不留 CSS 状态）。

#### 必须做的接驳（6 处，不做就上不了线）

| 处 | 原型 | 站上 |
|---|---|---|
| 导航 | `href="#"` / `#s2` | `NAV_LINKS` 9 项 + `/rss.xml` |
| 文章 | 3 条 demo 标题 | `getVisiblePosts()` 前 3 篇（可点进正文） |
| 站名 / 自述 | 写死文案 | `content/site.md`（主题不持有文案，有测试守着） |
| 素材 | `./inf-mask.png` / `./inf-orig.webp` / `./dna-glb/…` | `/art/…`、`/dna-slim.glb` |
| S3 卡片 | 原型自己的迭代史 | `content/pages/log.md` 最新 4 条（站主拍板） |
| 技术栈数字 | 手抄旧数据 | 构建期实测（站主拍板「根据现在的数据做」） |

#### 刻意不搬

`.panel` 调试面板（原型注释自己写明「原型专用」）、页脚占位文本（→ `SiteStats` 真实计数）、
`@font-face`（本站 fonts.css 已自托管）、`importmap` + 内联 three
（→ `src/scripts/dna3d.ts`，懒加载 + 具名导出收口，见 §6.6）。

#### 本站特有的 4 处本土化（不改就会坏，不是「优化」）

1. `.band` / `.paper-wrap` 加 `margin-inline: calc(50% - 50vw)`。
   原型里它们是顶层元素、直接吃满视口；本站多一层 Base 的 `.shell`（`max-width` + `padding`）
   会把**背景一起框窄**（站主报过「主页为什么是这个比例，不是整个屏幕」）。
   ★ 不写 `width:100vw` —— vw 含滚动条宽度 ⇒ 横向溢出。
2. `:global(:root)` 补原型那批本站没有的变量（`--line-1` / `--paper-0` / `--ink-3` /
   `--mono` / `--font-display` / `--tilt` / `--shift-a,b,c`）。
   scoped 的 `:root` 会被写成 `:root[cid]`，而 `<html>` 上没有这个属性 ⇒ 整块静默失效。
3. 运行时注入的 DOM 一律 `:global()`：three 的 canvas、rhgrid 造的 SVG `<path>`。
   不写就是 `stroke:none` + `fill:rgb(0,0,0)` —— 线一根都画不出来，反而糊一堆黑块。
4. 原型的全局重置（`*{box-sizing}` / `body{font}` / `html{scroll-behavior}`）**不搬**：
   scoped 下 `*` 会变成 `*[cid]`，只匹配带 cid 的元素；这些重置本站 `base.css` 本来就有。

#### 连带作废的旧契约（测试同步改写，方向反过来）

`is-revealed` / `is-focused` / `is-yielding` / `is-flash` 四个状态类与 `@keyframes rise-in`
是 console 外壳的动效残留（正文默认 65% 不透明、穿字让位、点击闪绿、文案错位入场），
原型一件都没有 ⇒ 连同 CSS 一起删。`tests/b2-motion.test.ts` 四条断言相应改写：

- 「无 JS 时正文不被弱化」→ 改守「产物里不再有 `.field-item` 弱化规则」
  **且**「揭示的 `opacity: '0'` 初值由 JS 写」（写进 CSS 就方向反了：无 JS 时整页空白）
- keyframes 清单：`rise-in` → `logo-sway` / `lang-grow` / `lang-fade` / `hint` / `breathe`
- 「四个状态类都要有规则」→ **反向**：四个类都不许再出现在产物 CSS 里
- 装饰层类名 `hero-glass` → `band-glass`；正文层 `.tier` → `.paper-wrap`

★ 写断言时又踩到一个坑：esbuild 会把源码里的 `'0'` / `"0"` 统一压成**反引号**的 `` `0` ``，
正则只写 `["']` 匹配不上（本轮实测撞到，已把三种引号都写进判据）。

#### 验收（1440×900 headless Chrome 实测）

- 六档视口 1920/1440/1280/1024/768/390：`.band` 满宽（左缘恒为 0）、**横向溢出 0px**
- 滚动视差实测生效：`animation-timeline` 解析为 `scroll(root)`；
  滚 700px 后网格 `scale 1.047 / translateY -63px`、玻璃卡 g1 `translateY -182px`、标题 `opacity .55`
- S2 = 3 篇真实文章、S3 = 4 张日志卡、S5 = 5 段占比条 + 5 条图例 + 明细
- 首页内联脚本 **5040 B**（预算 7168，余量 2128）
- `npm run verify`：134 passed；唯一失败为本机已知环境故障 `spawnSync node EBUSY`

### 6.9 撤回「顺手修好/补全」（2026-09-30 第五轮 · 站主指令「以原型为源，照搬原型」）

站主看完 8 张同视口同滚动位置的对比截图后，指出 6 处差异。逐条实测定位后发现：
**5 处真差异没有一处是"结构搬漏了"，全部来自上一轮我主动加的 5 个动作。**

> ★★ **本轮最大的一条原则（比任何单条改动都重要）**
> **「照搬原型」= 连它写错的 CSS 也照搬。** 不补空格、不补它没定义的变量。
> 原型的样式表里有三类"死"声明（无效的 `clamp()` 算术、引用未定义的变量、引用未定义的变量做 fallback），
> 我上一轮"顺手修好/补全"之后，那些声明在本站**复活**了 ⇒ 渲染出来的东西原型根本没有。
> 想复现原型的样子，就必须**让它们在两边一样地死掉**。

#### 撤回的 5 处（上一轮我多做的）

| # | 上一轮我做的 | 原型的真相 | 站主报的现象 |
|---|---|---|---|
| 1 | `nav a[aria-current]` 三段值换成 `--on-band` / `#2d7d4624` / `#4caf5059` | 原型就是 `var(--accent-bright)` / `#4caf5014` / `#4caf5038` | 「主页」两个字不变绿 |
| 2 | 按「不搬全局 reset」原则，没带原型第 78 行 `a{color:inherit;text-decoration:none}` | 原型有这条 | 导航文字下面多一条横线 |
| 3 | 把原型 `--fs-item:clamp(1.6rem,1rem+4.2vw,3.4rem)` 的 `+` 两侧**补上了空格** | 无空格 ⇒ 值非法 ⇒ `font-size: var()` 计算值阶段作废 ⇒ 标题退回继承的 17px | 文章标题比原型大 3.2 倍（54.4px vs 17px） |
| 4 | 在首页 `:global(:root)` 里给 `--line-1` / `--paper-0` / `--ink-3` 赋了值 | 这三个变量原型**从未定义** ⇒ `.marquee` 的上下横线与实色底、`.num` 的 color 全部作废 | 跑马灯多出上下横线与实色底 |
| 5 | `.gitignore` 只放行了 `inf-mask.png` / `inf-mask-edge.png` | `public/art/*` 会把整个目录忽略掉，必须有逐条 `!` 例外 | 百褶 ∞ 线上 404、整块不可见 |

#### 照搬原型补回的 4 处

| # | 项 | 说明 |
|---|---|---|
| 6 | `.marquee` 补 `margin-bottom: clamp(2.4rem,5vw,4.2rem)` | 上一轮漏了 ⇒ S2→S3 间距比原型紧（实测原型 62.9px @1258） |
| 7 | `.eyebrow` / `.lede` / `.coord` 显式归零 UA 外边距 | 原型靠全局 `*{margin:0;padding:0}` 抹掉 `<p>` 的 1em 上下边距；本站 `base.css` 没有这条 ⇒ 实测多出 13.6+17+17+13.6 ≈ **61px**。按元素逐个补 0，不动全局 reset |
| 8 | `.lede`：`max-width: 34em`（578px @17px）、`line-height: 1.7` | 上一轮写的是 `40.5rem`(648px) / `1.62`，**注释却写着「原型量度 578px」——注释对、值错** |
| 9 | `.band-core` 回到 `flex:1` + `position:relative`（文档流内） | 上一轮加 `position:absolute; inset:0` 让它盖满首屏 ⇒ 那条 78% 处的深墨绿洗色**真的生效了**。而原型里它只是**可伸缩的顶部留白块**（802 视口下只有 41px，渐变几乎不可见）⇒ 实测英雄区末行亮度 **85 → 113**（原型 111）。这就是站主截图里「身份下面的过渡」 |

#### 站主拍板的 4 项

- **标题字号照搬原型** ⇒ 保留 `--fs-item` / `--fs-h2` 的无空格原值（见第 3 条）。
- **调试面板（`.panel` / PROTO CONTROL / 三个按钮）不搬** —— 它的逻辑占原型内联脚本约 1/3。
- **页脚换真实**：本来就用站上的 `SiteStats`（运行时长按 `site.since` 本地滴答 + `/api/stats` 的真实 PV/UV），
  实测线上 `{"pv":1252,"uv":521,"days":5}`。原型那句 `· RHINE GLASS v10 原型` 不搬。
- **`--ink-3` 照原型让它退** ⇒ `.marquee-item .num` 的 `color` 作废、退回继承色
  （父级多为 `transparent` + 自己 `-webkit-text-stroke:0`）⇒ **非 `3n+1` 的那些「0」在原型的渲染里本来就是看不见的**。
  实测两端 `numCol` 都是 `rgba(0,0,0,0)`。要它显形就得给 `--ink-3` 赋值 —— 那就不再是原型的样子了。

#### 第二批（同晚，实测发现）：字体栈也要照抄

站主报的 6 处闭环、推上线之后，用 CDP 的 `CSS.getPlatformFontsForNode` 读**实际渲染字体**
（不是读 CSS —— 这一轮的教训就是"光读 CSS 会漏"），两端同视口复测，又抓出一条**同类**残留：

原型还引用了 `--mono` / `--font-display` / `--font-mono` 三个变量，同样**从未定义**；
但那几处声明**自带 fallback**，所以原型里它们没有"死"，只是落到了 fallback 上 ——
而上一轮我在首页 `:global(:root)` 里把这三个变量定义了，原型的 fallback 在本站**失效**：

| 选择器 | 原型声明 | 原型实际取值 | 本站（改前） |
|---|---|---|---|
| `.marquee-item`（跑马灯大字） | `var(--font-display, inherit)` | `inherit` ⇒ **IBM Plex Sans** | **Archivo SemiBold** ✗ |
| `.marquee-item .num` | `var(--font-mono, monospace)` | `monospace` ⇒ NSimSun | IBM Plex Mono（该元素 color 透明 ⇒ 不可见） |
| `.langbar` | `var(--mono, 'IBM Plex Mono', ui-monospace, monospace)` | `'IBM Plex Mono'` | 同 ✓ |
| `.coord` / `.eyebrow` / `.entry time|.tags` / `.card .k` / `.foot-in` 等 8 处小字 | `'Plex Mono', monospace` | IBM Plex Mono，**中文落 `monospace`** | IBM Plex Mono，中文落 Noto Sans SC |

改法：**删掉这三个变量的定义**，首页 13 处 `font-family` 一律照抄原型那一行的**原文**（连 fallback 一起）。
变量找不到 ⇒ 自然落回与原型同一个值。

★ 唯一必须改动的是**字体名**：原型的 `@font-face` 叫 `'Plex Mono'`，本站叫 `'IBM Plex Mono'`
⇒ `'Plex Mono',monospace` 抄成 `'IBM Plex Mono', monospace`；**逗号后面的泛型族必须原样保留**
（中文的 fallback 就靠它）。`--sp-5` 不用动：本站 tokens.css 就是 `1.5rem` = 原型的 fallback 值。
`--color-secondary` 全站零引用，也不用动。

实测（1258×802 同视口，改后**线上**）：`.marquee-item` = **IBM Plex Sans(7)**（原型同）、
`.marquee-item:nth-child(3n+1)` = **IBM Plex Sans(7)**（原型同）、
`.marquee-item .num` = **NSimSun(1)**（原型同）、`.coord` = **NSimSun(4) + IBM Plex Mono(41)**（原型同）、
`.display` = Archivo SemiBold(18)（原型同）、`.entry .t` / `.section-head h2` = 与原型同族。

★ 站主需要知道的变化：**凡「等宽小字里的中文」现在都落回泛型 `monospace`**（Windows Chrome = 新宋体 NSimSun），
`页脚的本站已经运行…` / `.coord` / `.section-head span` / `.entry .tags` 这几处的中文观感会变。
**这是原型字体栈本身的行为**（原型没有给这些位置配可用的中文字体），不是新加的样式；
若觉得新宋体不好看，就把那几处写成 `'IBM Plex Mono', 'Microsoft YaHei', monospace` —— 但那就**不是原型的样子**了。

#### 本轮新增的 3 条护栏

1. `tests/build-output.test.ts` 新 describe「首页 CSS：照搬原型的『故意保留的无效声明』」：
   断言首页 CSS 里 `--fs-item` / `--fs-h2` 的**生效值**（取最后一处定义 = 级联胜出者）
   必须是那个无空格 clamp。★ esbuild 会把它压成 `1rem4.2vw`（依然非法，结果不变），
   所以判据只拒绝"运算符两侧带空格"的**有效**写法，不锁死字符串。
2. 同 describe：**原型引用过但从未定义的 6 个变量**
   （`--line-1` / `--paper-0` / `--ink-3` / `--mono` / `--font-display` / `--font-mono`）
   在**整份产物 CSS** 里都不许有定义。前三个会"复活"死声明（横线/实色底/数字显形），
   后三个会让原型**自带 fallback** 的声明改取本站的值（跑马灯大字由 Plex Sans 变 Archivo）。
3. ∞ 那条老断言补一刀：`.gitignore` 必须逐条放行三张素材。
   **老断言查的是 `dist/art/`，而 dist 是 `npm run build` 从 `public/` 拷出来的 —— 本地永远有**，
   所以它当年也在过。查 `.gitignore` 才管得住「没进 git ⇒ 线上 404」这个真实故障模式。

（同时给 `tests/tokens.test.ts` 的白名单补了 `'nav a[aria-current]'`：首页这条写的是属性**存在**
选择器，与 Topbar 那条 `nav a[aria-current=page]` 不是同一个串。深色 band 上用亮绿合法，见 §6.3。）

#### 验收（1258×802 headless Chrome + CDP 读计算样式，两端同视口）

| 项 | 原型 | 改后本站 | 改前本站 |
|---|---|---|---|
| `.entry .t` font-size | 17px | **17px** | 54.4px |
| `.section-head h2` font-size | 17px | **17px** | 33.6px |
| `nav a[aria-current]` color | rgb(76,175,80) | **rgb(76,175,80)** | rgb(255,255,255) |
| 同上 background / border | rgba(76,175,80,.08) / .22 | **一致** | — |
| `nav a` text-decoration | none | **none** | underline |
| `.marquee` border-top / bottom | 0px / 0px | **0px / 0px** | 1px / 1px |
| `.marquee` background | transparent | **transparent** | rgb(250,250,247) |
| `.marquee` margin-bottom | 62.9px | **62.9px** | 0 |
| `.marquee-item .num` color | rgba(0,0,0,0) | **一致** | — |
| `.marquee-item` 实际字体（第二批） | IBM Plex Sans | **IBM Plex Sans** | Archivo SemiBold |
| `.marquee-item .num` 实际字体 | NSimSun | **NSimSun** | IBM Plex Mono |
| `.coord` 实际字体 | NSimSun + IBM Plex Mono | **一致** | Noto Sans SC + IBM Plex Mono |
| `.display` font-size | 102.4px | 102.4px | 102.4px |
| `.dusk` 位置 / 高 / 渐变 | y802 h369 | 一致 | 一致 |
| 英雄区末行亮度（y=800） | 111 | **113** | 85 |
| 首页内联脚本 | — | 5040 B（预算 7168） | 5040 B |
| `npm run verify` | — | **137 passed** | 134 passed |

#### 已知取舍（都要站主知道）

1. **首屏在 802px 高的视口里会多出 6px**：`.lede` 回到原型的 `34em` 后，站主的**真实简介**
   比原型那段缩写版长 ⇒ 首屏内容高 808px（原型只有 721px，所以永远刚好一屏）。
   简介短下来就自动回到一屏。想立刻恢复一屏：把 `.lede` 的 `max-width` 改回 `40.5rem`。
2. **`.band-core` 回到文档流后，topbar 的位置随视口/内容浮动**（原型的行为：它是可伸缩顶部留白）。
   本站因内容更高，802 视口下这块拿不到剩余空间（0px，原型 41px）⇒ topbar 比原型高 41px。
   这是原型的结构，不是 bug；但如果哪天觉得「首屏顶部太空/太挤」，改的就是这一条。
3. **内页的 ∞ 水印会一起显形**：`Topbar.astro` 的 `.page-inf`（opacity .2）本来就引这张图，
   只是素材一直缺。修的是"素材没进 git"，不是新加效果。
4. **`.marquee-item .num` 的「0」看不见**是原型的真实渲染（见上），照搬后本站同样看不见。
