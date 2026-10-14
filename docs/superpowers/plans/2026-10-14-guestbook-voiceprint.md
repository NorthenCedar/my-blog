# 留言页声纹带 VOICEPRINT 实施计划

> **执行方式**：本会话内逐任务实现（native）。每个任务自带测试循环，做完跑 `npm run verify`。

**目标**：删掉留言页的墨滴装置，换成由留言真实数据驱动的声纹带 + 一套两用的玻璃控件。

**架构**：`comments.ts` 继续做唯一取数方，通过 `CustomEvent` 把数据交给装置（不重复请求）。排布数学全在纯函数 `voiceprint-core.ts`（零 DOM、可单测），控制器 `voiceprint.ts` 只管渲染与交互。照抄相册的 `album-scene-core` / `album-scene` 分工。

**技术栈**：Astro 7 + 原生 TS/CSS，无新依赖。Canvas 2D 或 SVG 均可（实现时选 SVG —— 线条类、可被 CSS 直接上色、无需 dpr 处理；判据里不绑死介质）。

**规格**：`docs/rhinelab-spec.md` §6.78（先读它，本计划是它的实施分解）

## 全局约束

- 零第三方请求/外链字体/新依赖；颜色与间距**只走 `tokens.css`**，alpha 一律 8 位 hex，**禁 `rgba()`**。
- 照片 alt 非空；不动 `content/` 下的图片。
- 改完必须 `npm run verify`（**带 `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=20000`**，否则构建会挂在删除配额上）。
- 不动 `transition.css` 的 z-index 阶梯（抽屉 40/41 < 蒙版 45 < 灯箱 50 < 开场 60 < 光标 64/65/66）。
- 玻璃：`backdrop-filter` **不得**挂在会成为 `position:fixed` 祖先的元素上；玻璃层 **`z-index: 0` 不是 `-1`**（否则底纹不进 backdrop，玻璃变纯白片，见 §6.56）。
- 每条新门闩都要**变异验证**（改坏参数确认会红）。只跑一次绿不构成证据。
- 提交信息用中文，写清"为什么"。**分两次提交**：本任务之前不要混入上一任务（螺旋盘底色）的改动。

## 复盘重点（Review Focus）

以下五条 spec 暗示了、但容易被漏掉的输入，每条都钉到对应任务的测试里：

1. **留言为空**（`comments` 返回空数组）⇒ 画一条平的线 + "还没有留言"，不是空白、不是报错。 → T4
2. **所有留言同一天** ⇒ 跨度为 0，分桶不能除零、不能出 NaN。 → T1
3. **接口失败**（非 200 / 网络错）⇒ 装置**不进 `.is-ready`**，页面停在静态统计带，不得画半条线。 → T4
4. **留言数超过 200** ⇒ 读数如实写「最近 N 条」，不许谎报全量。 → T2
5. **回复没有对应的顶层留言**（孤儿回复）⇒ 不得让波形崩掉；按站上 `groupReplies` 的既有处理口径。 → T1

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/scripts/voiceprint-core.ts` | **新建** · 纯函数：分桶、权重、归一化、包络、时间刻度。零 DOM。 |
| `src/scripts/voiceprint.ts` | **新建** · 控制器：订阅事件、渲染、控件交互、降级门控。 |
| `src/scripts/comments.ts` | **改** · 派发 `voiceprint` 事件（带数据，不带坐标）。 |
| `src/components/Voiceprint.astro` | **新建** · 静态统计带 markup + 玻璃控件标记 + 样式。 |
| `src/pages/guestbook.astro` | **改** · 挂 `<Voiceprint />`；删墨滴的 canvas / import / CSS。 |
| `tests/voiceprint-core.test.ts` | **新建** · 纯函数契约。 |
| `tests/guestbook-voiceprint.test.ts` | **新建** · 接缝 + 降级 + 产物契约（**取代** `guestbook-inkdrop.test.ts`）。 |
| `src/scripts/inkdrop.ts` | **删** · 35 KB。 |
| `tests/guestbook-inkdrop.test.ts` | **删** · 54 KB。 |

---

## T1 · 纯函数核心

**Files**：新建 `src/scripts/voiceprint-core.ts` + `tests/voiceprint-core.test.ts`

**Produces**（后续任务依赖这些**确切**签名）：

```ts
export type Note = { id: number; createdAt: string; body: string; isReply: boolean };

/** 分桶粒度。跨度 ≤90 天按天 · ≤730 天按周 · 其后按月。 */
export type Unit = 'day' | 'week' | 'month';
export function pickUnit(spanDays: number): Unit;

/** 权重：顶层留言 body.length，一条回复 = REPLY_WEIGHT(200)。 */
export function weightOf(n: Note[]): number;

export type Bin = { start: number; end: number; weight: number; replies: number; notes: number };
/** 按 pickUnit 的粒度切时间桶。空输入返回 []。跨度 0 走单桶，不除零。 */
export function bucketize(notes: Note[], spanDays: number): Bin[];

/** 归一化到 [0,1]，峰值恒为 1；全零输入返回全 0。空数组返回 []。 */
export function normalize(bins: Bin[]): number[];

/** 连续包络：相邻桶之间线性插值成 N 个点。零随机 ⇒ 同输入两次逐点相同。 */
export function envelope(bins: Bin[], samples: number): number[];

/** 时间刻度：给轴标注用。 */
export function ticks(bins: Bin[], unit: Unit): { at: number; label: string }[];
```

- [ ] **T1.1 写失败测试**：五条复盘重点里的第 2、5 条落在这里 —— `bucketize([], 0)`、`bucketize(同日N条, 0)`、`weightOf([孤儿回复])`、**同输入两次 `envelope` 逐点相同**、`normalize` 非空时 `max === 1`。
- [ ] **T1.2 跑** `npx vitest run tests/voiceprint-core.test.ts` ⇒ 期望 FAIL（模块不存在）。
- [ ] **T1.3 实现**（只实现测试要的，不多写）。
- [ ] **T1.4 跑** ⇒ 期望 PASS。
- [ ] **T1.5 变异验证**（三条，逐条确认会红）：① 去掉归一化 ⇒ 「峰值恒 1」红；② `pickUnit` 的 730 改成 3650 ⇒ 「分桶边界」红；③ `weightOf` 里回复权重改成 0 ⇒ 「回复权重」红。**跑完 grep 回读确认源码已还原**。

---

## T2 · 接缝：`comments.ts` 派发数据

**Files**：改 `src/scripts/comments.ts:82-95`（fetch 成功处）与 `:126-141`（提交成功处）

**Produces**：`window` 上两个事件

```ts
// 首次取数成功后派发一次；detail 带**数据**：
window.dispatchEvent(new CustomEvent('voiceprint', {
  detail: { notes: Note[] },   // 顶层留言 isReply:false + 每条回复 isReply:true
}));
// 提交成功后派发；detail 只带这一条：
window.dispatchEvent(new CustomEvent('voiceprint:new', {
  detail: { note: Note },
}));
```

- [ ] **T2.1 写失败测试**（进 `tests/guestbook-voiceprint.test.ts`）：`comments.ts` 源码里**不再出现 `'inkdrop'`**；出现 `CustomEvent('voiceprint'`；派发在 `.then(` 的成功分支里、`.catch(` 之前 ⇒ **失败不派发**；`detail` 里**不含** `getBoundingClientRect`（float.ts 约定①）；装置侧**没有** `fetch('/api/comments`（不许重复请求）。
- [ ] **T2.2 跑** ⇒ FAIL。
- [ ] **T2.3 实现**：把 `type Comment`/`Reply`（驼峰 `createdAt`）映成 `Note[]`，在两处成功分支派发。
- [ ] **T2.4 跑** ⇒ PASS。
- [ ] **T2.5 变异**：把派发挪进 `.catch(` ⇒ 「失败不派发」必须红。

---

## T3 · 静态形态（无 JS 也在的那一版）

**Files**：新建 `src/components/Voiceprint.astro`，改 `src/pages/guestbook.astro`

- [ ] **T3.1 写失败测试**（产物断言，需先 build）：`dist/guestbook/index.html` 含统计带标记；**留言列表在静态 HTML 里一条不少**；页面**不含** `<canvas class="inkdrop-bg"`；**零外部资源**（无 `http://` 的 src/href/url()）；统计带那块 CSS 里**没有字面色值**。
- [ ] **T3.2 跑** ⇒ FAIL。
- [ ] **T3.3 实现**：静态统计带 = 「留言 N 条 · 最早 ~ 最晚」+ 一条平线占位。**没有数据也要显示**（此时就是"还没有留言"）。
- [ ] **T3.4 跑** ⇒ PASS。

---

## T4 · 控制器：画波形 + 四档降级

**Files**：新建 `src/scripts/voiceprint.ts`，改 `src/pages/guestbook.astro`（挂 script）

- [ ] **T4.1 写失败测试**：四个降级档各自**不出现** `.is-ready` —— 无留言 / `prefers-reduced-motion` / 装置标记缺失 / 接口失败。★ 走**"根本不注册"**，**不用 `hidden`**（站内踩过：给 canvas 加 `hidden` ⇒ `clientWidth` 恒 0 ⇒ 画不出第一帧）。
- [ ] **T4.2 跑** ⇒ FAIL。
- [ ] **T4.3 实现**：订阅 `voiceprint` / `voiceprint:new`，调 core 画一条 SVG 折线 + 回复小刻度 + 读数「最近 N 条」（复盘重点 4）。★ **零 rAF**：一次画完（照准星那台的路子）⇒ reduce 档与无头截图都确定性。
- [ ] **T4.4 跑** ⇒ PASS。
- [ ] **T4.5 变异**：去掉「失败不 `.is-ready`」那个分支 ⇒ 必须红。

---

## T5 · 玻璃控件（一套两用）

**Files**：改 `src/components/Voiceprint.astro`

**Produces**：`[data-vp-sort]`（列表排序：最新/最早）、`[data-vp-filter]`（只看有回复的）、`[data-vp-window]`（声纹带时间窗）

- [ ] **T5.1 写失败测试**：玻璃那块的 CSS 里 —— ① 有 `backdrop-filter` 的元素**不得**是 `position: fixed`；② 玻璃层 `z-index` **必须是 `0` 且不许是 `-1`**（复现 §6.56.4 的实测口径）；③ 颜色全部走 `--glass-*` token；④ **带高 ≤ 一行正文**（`--lh-body × --fs-body`）—— 这条是"不压正文"的量化护栏，别等目检才发现。
- [ ] **T5.2 跑** ⇒ FAIL。
- [ ] **T5.3 实现**：沿用 v10.6 玻璃 token，不新造色值。
- [ ] **T5.4 跑** ⇒ PASS。
- [ ] **T5.5 变异**：把带高改成 20rem ⇒ 必须红。

---

## T6 · 删掉墨滴

**Files**：删 `src/scripts/inkdrop.ts`、`tests/guestbook-inkdrop.test.ts`；改 `src/pages/guestbook.astro`（canvas / import / 两条 CSS / 注释）、`tests/interaction-baseline.test.ts:348`

- [ ] **T6.1** 全仓 grep `inkdrop`，除底纹文件名 `inkdrop-orbit.webp`（**保留**，站主已定）与文档外应清零。
- [ ] **T6.2** 删文件与死代码，跑 `npx vitest run tests/interaction-baseline.test.ts`。
- [ ] **T6.3** 全量 `npm run verify`。

---

## T7 · 变异总账 · 目检 · 文档

- [ ] **T7.1** 把 T1–T5 的变异结果汇总成表写进 spec §6.78。
- [ ] **T7.2 目检**：`/guestbook/` 出 1440 宽截图（用同源 iframe 滚到装置处 —— `--screenshot` 只能拍首屏）；另出**减少动效档**一张（照 AGENTS §6：目检图在交付前先与已知真值对一遍，有差异先解释差异）。
- [ ] **T7.3 文档**：`docs/writing-guide.md` §21 改写；`content/pages/log.md` 加 v2.20；spec §6.78 补验证记录。
- [ ] **T7.4** 提交（**不推送**，推送按站主明确指示）。

---

## 自检

- **规格覆盖**：§6.78.2 形态→T3/T4/T5；§6.78.3 映射→T1/T4；§6.78.4 玻璃→T5；§6.78.5 接缝→T2；§6.78.6 降级→T4；§6.78.7 测试→各任务；§6.78.8 删除清单→T6。无缺口。
- **占位符**：无 TBD；所有签名已定。
- **类型一致**：`Note` / `pickUnit` / `weightOf` / `bucketize` / `normalize` / `envelope` / `ticks` 只在 T1 定义，T2/T4 消费，名字一致。事件名 `voiceprint` 与 `voiceprint:new` 全程一致。