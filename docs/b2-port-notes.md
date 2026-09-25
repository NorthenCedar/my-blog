# B2 移植工单（动效层 → `index.astro`）

> 这份文件是**给下一轮执行用的工作底稿**，不是规范。B2 验收通过后可以删掉。
> 目的同 B1：不必再通读 `prototype/terminal/home.html`（843 行 / 44 KB）—— 动效清单已按**实测行号**取出。
> B1 已把挂点留在标记里且**零样式零脚本**：`.field-item` + `data-label`（见 `b1-port-notes.md` §4）。

## 0. 边界（B2 做什么、不做什么）

- **做**：把原型首页的 **8 条 CSS 动画 + 6 段 JS 行为**移植到 `src/pages/index.astro`（含所需 token 与背景装饰层）。
- **不做**：跨页 View Transitions（原型 L520–527）—— 那是**全站导航**的事，`Base.astro` 里挂，跟首页单页动效无关，单独一步。
- 仍然：不动 `content/`、不引第三方、不加任何外部请求（零第三方资源是没松的约束）。

## 1. CSS 层清单（原型实测行号）

| # | 对象 | 原型行 | 规则 | 时长 / 曲线 | 归类 |
|---|---|---|---|---|---|
| 1 | `.rail-tick i` | 121 | `transition: width` | `--dur-fast` `--ease` | 交互 |
| 2 | `.band-cap` | 144–145 | `.band.is-tick .band-cap{opacity:1;background:var(--accent-bright);box-shadow:0 0 8px var(--band-glow)}` + `transition:opacity linear` | 120ms | 交互 |
| 3 | `#hudSec` | 204–205 | `.is-scan{color:var(--signal-text)}` | 120ms / JS 160ms | 交互（**橙色唯一用武之地**） |
| 4 | `.bracket::before/after` | 260, 344–347 | 非聚焦 `border-color:var(--paper)` → 聚焦 `var(--ink)` | `--dur-fast` | 交互（**聚焦的主要载体，透明度只是辅助**） |
| 5 | `.post a,.frames a,.links a,.rail-tick` | 503–508 | hover/focus `translateY(-2px)`，active `scale(.995)` | 180ms `--ease-quint` | 交互 |
| 6 | `a.is-flash,button.is-flash` | 383 | 点击绿色闪烁（spec §1.4 缺的第 1 条，原型已有） | JS 180ms | 交互 |
| 7 | `html.js .field-item` | 337–342 | 基准 `opacity:var(--focus-min)`(.65) → `.is-focused{opacity:1}` | `--dur-enter` | 叙事 |
| 8 | `.is-yielding` | 369–373 | 扫描带穿字时朝纸退 18% | 100ms 回位 | 叙事 |
| 9 | `@keyframes sweep-in` | 456–457 | `.band-line` 起手扫开 | 800ms `--ease-expo` | 叙事 |
| 10 | `@keyframes type-in` | 460–461 | `.hud .site` 打字机（`clip-path` 硬切） | 700ms `steps(19,end)` +150ms | 叙事 |
| 11 | `@keyframes wipe-in` | 464–465 | `.bg-mark` 擦入 | 1200ms `--ease-expo` +100ms | 叙事 |
| 12 | `@keyframes rise-in` | 468–469 | `.pod-s1 > *` 逐条升起 | 800ms `--ease-expo` | 叙事 |
| 13 | `@keyframes sweep-x` | 476–480 | 扫描带循环横移 | **4s linear infinite** | 循环 |
| 14 | `@keyframes orbit` | 484–495 | `.bg-ring` 16s / `.bg-orbit` 8s **reverse** | linear infinite | 循环 |
| 15 | `@keyframes blink` | 499–500 | `.hud .rec` 硬切（**不是呼吸灯**） | 800ms `steps(1)` | 硬切 |
| 16 | `prefers-reduced-motion` | 510–513, 396, 425 | 全压 1ms、动画 none、`.field-item` 还原不透明/不位移 | — | 硬约束 |

## 2. JS 层清单（原型 698–840，实测行号）

| # | 段 | 行 | 做什么 | 关键参数 |
|---|---|---|---|---|
| 1 | 入场揭示 | 707–720 | `IntersectionObserver` 首次相交 → `.is-revealed` 并 `unobserve`（只做一次） | `rootMargin:'0px 0px -12% 0px'`, `threshold:.01`；**无 IO 时直接全部加类** |
| 2 | 聚焦 | 722–751 | 第二个 `IntersectionObserver`：屏幕中部判定带 → `.is-focused`（唯一）+ 写 `#bandTitle` | `rootMargin:'-37.5% 0px -37.5% 0px'`；带离场时用 `getBoundingClientRect` 复算还有谁在带内 |
| 3 | 刻度 + HUD | 753–782 | `passive` scroll：算总进度 → `#railFill.style.height` + HUD 百分比；中点判定当前区段 → 写 `#hudSec` + `aria-current` | `{passive:true}`；区段变化才触发 `.is-scan` 160ms |
| 4 | 穿字让位 | 783–804 | 中心 ±12px 内的文字 `.is-yielding`；rAF 节流 | `half=12`；`queueYield()` 防重复排帧 |
| 5 | 数字跳动 | 806–825 | HUD 百分比 180ms 内插值（指数逼近，每帧补 28%） | 收敛约 10 帧；**首次与 reduced-motion 直接落值** |
| 6 | 点击闪烁 | 827–833 | `pointerdown`（**捕获阶段**）命中 `a,button` → `.is-flash` 180ms | `closest('a,button')`，`true`（capture） |

收尾：`measure()` → `addEventListener('scroll', onScroll, {passive:true})` → `resize` → 立即跑一次 `onScroll()` / `updateYield()`（838–839）。

## 3. token 前置件（spec §1.2 已给值）

| token | 站点现状 | 需要 |
|---|---|---|
| `--dur-fast` | `120ms` | 不动 |
| `--dur-enter` | `320ms` | **→ 640ms**（原型 L54 已是 640；**spec 明说这条要站主点头**） |
| `--dur-stagger` | 无 | 新增 `320ms`（给 `is-revealed` 加错位） |
| `--ease` | `cubic-bezier(.2,0,0,1)` | → `cubic-bezier(.16,1,.3,1)` |
| `--ease-interact` / `--ease-quint` | 无 | 新增 `cubic-bezier(.22,1,.36,1)` |
| `--dur-orbit` | 无 | 新增 `8s`（4/8/16 按体量选） |
| `--dur-blink` | 无 | 新增 `800ms` |
| `--focus-min` | 无 | 新增 `.65` |
| `--signal` / `--signal-text` | 无 | 新增 `#E87722` / `#B45309`（**只给 HUD 区段切换**） |

> `--signal` 是**图形色不承载文字**（对乳白底 2.83:1，见 `site-decisions.md`）—— 只能做瞬时色，不能当可读文本色用。

## 4. 移植时实测出来的坑（别照搬）

1. **`is-revealed` 在原型里是空操作** —— **已决定：给真值，不删观察器**（站主 2026-09-26：「不给真值就删」）。
   原型 L337 基准 `.field-item{opacity:var(--focus-min)}` 与 L341 `.is-revealed{opacity:var(--focus-min)}` 是**同一个值**，
   所以那个观察器什么都不改变，只有 `is-focused` 切换时 `transition` 才真正跑。
   **做法：让揭示改 `transform`，不碰 `opacity`** ——
   `html.js .field-item{transform:translateY(12px)}` → `.is-revealed{transform:none}`，
   用 `--dur-enter` + `--dur-stagger` 做逐条错位（spec §1.3 要的正是这条错位）。
   **为什么不把基准 `opacity` 设成 0**：那会造出「JS 装了、但 IO 没触发 → 内容永久不可见」的失败模式；
   改 `transform` 最坏情况只是"没动画"，内容永远可见。这与原型的 `rise-in`（translateY(10px)）也是同一条语言。
   `reduced-motion` 下 `transform:none`；`unobserve`（只播一次）的语义保留。
2. **`html.js` / `html.no-js` 门控**：L337 起所有聚焦规则都挂在 `html.js` 下；L350–351 给 `no-js` 藏掉带/刻度填充/HUD 进度。首页需要同样的两态语义，否则无 JS 时页面会永久停在 0.65 透明。
3. **`.is-yielding` 的选择器面很宽**（L369–373 两大串）：B1 的标记里**没有** `.bracket`、`.frame figcaption`、`.post .meta` 这些原型选择器 → 移植时要按 `index.astro` 的**真实类名**重列，不能抄原型选择器。
4. **背景装饰层 B1 没建**：原型 L532 起有 `.bg-mark`（±∞ 水印）/ `.bg-ring` / `.bg-orbit` / `.bg-green`。**`orbit` 两条循环动画正挂在 `.bg-ring`/`.bg-orbit` 上** —— 不建这层，清单第 14 条无处可落。（站主已定：**做**。）
5. **`--accent-bright` 被白名单测试挡着（做动效前必读）**：`tests/tokens.test.ts:29` 只允许裸 `var(--accent-bright)`
   出现在 `nav a:hover` / `nav a[aria-current=page]` 两个选择器里，而且**扫的是全部产物 CSS**。
   清单第 2 条（扫描带 tick）在原型里正是 `background:var(--accent-bright)`（L144）→ **照搬会直接把这条测试打红**。
   两条路，别蒙混过关：
   **(a)** 把 tick 的**完整选择器**加进白名单 —— 注释里已记着教训「曾经写成 `a:hover` 这种片段，把页脚 13px 小字的越界用法一起放行了；断言过宽等于没有断言」；
   **(b)** tick 改用 `--accent`（它本来就是非文字图形 + 瞬时反馈）。
   选 (a) 时必须在同一条注释里写清「为什么这个用法安全」，否则白名单就成了绕过。

## 5. 验收配方（沿用 B1 的口径，台账 `21a5c66`）

```powershell
cd <博客仓库>
npm run build           # 仍 14 页、exit 0
npx vitest run          # 72 passed | 1 skipped（B2 后若有新断言另计）
# 硬断言（每条打印 判据名 + 对象 + 实测值，禁止裸 PASS）：
#   ① 产物里存在被观察的元素与钩子类（.field-item / data-label 计数 > 0）
#   ② headless Chrome：reduced-motion 与默认两种 media 下，滚动到 S3 后
#      实测 computed opacity / transform 变化量与预期一致（不是"看起来动了"）
#   ③ 无 JS（--disable-javascript 或 html.no-js）下：无元素被永久压暗、无横向溢出
#   ④ 内联脚本字节数（首页）实测值记录在案
# 截图：1440×900 + 390×844，read_image 看完再报
```

## 6. 站主已拍板（2026-09-26，本轮）

1. **首页内联 JS 预算** → **给首页加一条独立预算断言，上限 7 KB**。文章页的 `≤4096 B`（`tests/build-output.test.ts:195`）**不动**；`:237`「产物里不得有独立 .js 文件」继续生效 → 动效**只能内联**，不得为了省体积拆外部文件。
2. **`--dur-enter`** → **320ms 提到 640ms**（与原型 L54 对齐）。交互层 `--dur-fast` / 180ms **保持不变** —— 快反馈是这套语言的底色。
   **站主 2026-09-26 明确接受它的可见影响**：`Band.astro:34` 的带子入场从 320ms 变 640ms、曲线更缓，**这是叙事层该有的长度，不是副作用**（全站只有这一处消费动效 token）。已提交 `fdc836f`。
3. **背景装饰层** → **做**，B2 一起补上（±∞ 水印 / 扫描圆环 / 极淡绿底），纯装饰、`aria-hidden`。清单第 11、14 条因此保留。

## 7. 爆炸半径提醒（动手前必读）
**B2 的 token 改动是全站的。** `src/styles/tokens.css` 被 9 个页面共享 —— 改 `--dur-enter` / `--ease` / 新增 token 会让**全部 14 页**的 `_astro/*.css` 重新哈希，于是：

- B1 那条「13 个非首页页面归一化后**逐字节不变**」的 L2 判据**会合法地失效**，不是回归。
- 所以 B2 开跑前要先**重建基线**（`_tmp-dist-b1-before` 是 B1 前的，不能再用），并且把「哪些页该变、变成什么」提前写清楚，否则真回归会混在预期变化里看不出来。
- 建议顺序：**先只改 tokens → 构建 → 记录 14 页 CSS 的预期变化 → 再加动效**，把「token 的涟漪」与「动效的新增」分成两次可分辨的验证。

## 8. 进度（2026-09-26 收尾，四个增量全做完）

| 增量 | 内容 | 落地 |
|---|---|---|
| 1 | 重建基线（`_tmp-dist-b2-before`，51 文件 / 3,170,666 B）+ 动效 token 分层 + 橙信号 | `fdc836f`（+7 个自定义属性、改 2 个值，爆炸半径实测限于 `:root`） |
| 2 | 背景装饰层 + 堆叠计划重排 + 两态门控（只落首页） | `f76bfc6` |
| 3 | 16 条 CSS + 6 段 JS + 补回 B1 省掉的仪表与 `.bracket` | `aa3bdce` |
| 3′ | 修：无 JS 下藏掉死读数（`html:not(.js)`，三态截图逼出来的） | `9bbf1d2` |
| 4 | 首页内联 JS 预算断言（实测 **2887 B** = 2.82 KiB / 预算 7168） | `4cb7737` |
| 4′ | 三态断言固化：正式脚本 + 静态契约测试 | `77be10e` |

**收尾后的复跑入口（两条，各守各的）**：

```powershell
npm run build
npx vitest run                              # 8 个文件 / 81 passed | 1 skipped
node scripts/verify-home-states.mjs         # 三态（默认 / reduced-motion / 无 JS）10 条断言，退出码即结论
```

## 9. 待办（明确不在 B2 范围内，别顺手做）

### 跨页 View Transitions（原型 L514–527）

**为什么不在 B2**：B2 是**首页单页动效**；跨页过渡是**全站导航层**的事，要动 `Base.astro`，影响 14 个页面。混进来会让「首页动效」与「全站导航」互相掩盖问题。

**原型的做法（实测行号，直接可用）**：

```css
@view-transition{ navigation: auto }
::view-transition-old(root){ animation: vt-out 200ms ease both }   /* 出 200ms */
::view-transition-new(root){ animation: vt-in  260ms ease both }   /* 进 260ms */
@keyframes vt-out{ to{ opacity: 0 } }
@keyframes vt-in { from{ opacity: 0 } }
@media (prefers-reduced-motion: reduce){
  ::view-transition-old(root), ::view-transition-new(root){ animation-duration: 1ms !important }
}
```

**三个必须记住的点**：

1. **每个页面都要有这段，缺一边就不触发**（原型的注释原话）。所以它天然属于 `Base.astro`（或一份被所有页面引用的全局样式），而不是首页。
2. **`file://` 下浏览器不启用跨文档过渡** —— 直接双击打开产物是硬切，不是 bug。
3. 时长属于**交互层**（200/260ms），与 `--dur-fast`(120ms) 同族；落地时用 token 而不是字面量。


