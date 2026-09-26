# RhineLabUI 开场动画勘察报告

- 上游：`LBEILC/RhineLabUI`，默认分支 `main`
- 取数提交：`ee5779741c6c0c916e416705fa634c7abf905c73`（2026-09-26 "Fix cached homepage navigation after Cloudflare redirects"）
- 树接口：`https://api.github.com/repos/LBEILC/RhineLabUI/git/trees/HEAD?recursive=1` → HTTP 200，`truncated=false`，entries=1271（blobs=1217，trees=54），全仓 blob 合计 **144,669,996 B**
- 文件接口：`https://api.github.com/repos/LBEILC/RhineLabUI/contents/<path>`（base64）；全程未用 `raw.githubusercontent.com`
- 本地镜像（只读抓取，未改动仓库既有文件）：`<博客仓库>\_tmp-rlui\`

---

## A. 开场动画到底是什么

> **结论一句话：开场是一段纯 DOM + 内联 SVG 的 2D 逐帧动画，由 `requestAnimationFrame` 按"原片帧号"驱动的单一时间函数逐帧设置样式属性；不是 Three.js/WebGL，不是 Canvas 2D，不是视频，也不是 CSS `@keyframes` 时间轴。**

### A1. 开场实现文件清单

| 文件路径 | 字节 | 实现类型 | 作用 |
| --- | ---: | --- | --- |
| `src/boot-motion.ts` | 4,192 | **纯 TS 时间函数（无渲染）** | 定义 20.16 秒开场的全部数值：`bootMotion(appTime)` 返回 60+ 个标量 |
| `src/boot.ts` | 11,417 | **DOM/SVG 逐帧赋值** | `BootSequence.update(time)` 把上一步的数值写进 `style.opacity` / `style.transform` / SVG `setAttribute` |
| `src/boot-tracks.ts` | 7,402 | 数据表 + 插值器 | 单调三次 Hermite `track(keys, frame)`；圆环半径/弧端/橙点/名称黑底的关键帧 |
| `src/boot-logo-tracks.ts` | 3,724 | 数据表 | Logo 连续轮廓首尾、描边宽、加号旋转、减号拉伸、左移关键帧 |
| `src/boot-orbit-tracks.ts` | 4,835 | 数据表 | 两侧小圆自转、六颗卫星点、中央大点闪变关键帧 |
| `src/boot-lettering.ts` | 4,331 | DOM + 内联 SVG 字形 | 把固定英文短语拆成逐字 `<span>`，字面来自 JSON 中的 SVG path 或（可选）本地字体 |
| `src/boot-lettering-art.json` | 29,697 | **内联 SVG 路径数据** | 10 段固定短语的逐字轮廓（`M543 614.0 621 800.0H708L410 100.0H321L23 800.0H110L188 614.0Z…`） |
| `src/boot-lettering.css` | 1,871 | CSS（静态版式，无动画） | 逐字格宽、基线补偿、字距 |
| `src/startup.ts` | 4,230 | DOM + 事件 | 开场前的"点击进入"闸门（音频解锁），**不参与动画本身** |
| `src/startup.css` | 1,008 | CSS | 闸门版式 |
| `src/main.ts` | 65,377 | 宿主 | 开场 DOM 字面量（第 61–91 行）、`bootStart`、`bootFrame()`、`skip` 动作 |
| `src/style.css` | 40,339 | CSS | 开场元素的静态几何（`.boot-logo` 296×177 @518,462 等）与阶段态选择器 |
| `index.html` | 1,028 | 空壳 | 只有 `<div id="stage">`，开场 DOM 全部由 JS 注入 |

**关键反证据**：`src/style.css` 全文只有 6 个 `@keyframes`（行 1713/1718/1723/1731/1741/1751：`orbit` / `blink` / `fadeIn` / `detailEnter` / `modalEnter` / `loading`）。其中 `orbit`（行 265/270/276/282）与 `loading`（行 1545）挂在**未被 `BootSequence` 查询的类**（`.ring-one` / `.scan-ring` / `.loading`）上，即开场期间是死代码；开场实际用到的 `fadeIn` 只在 `[data-boot="auth"] .auth-status`（行 1594）和 `.archive-ui`（行 1595 附近）出现。仓库自己的检查项明确断言"无 CSS 循环动画"（`verification/BOOT-MOTION.md:31`）。

### A2. 播放流程（4 段，总 20.16 秒）

驱动机制：`src/main.ts:1011` 每帧调用 `bootFrame(frozenTime ?? time - bootStart)`；`bootFrame` 在 `src/main.ts:952` 调 `bootSequence.update(t)`。`bootStart` 初值 = `performance.now()/1000 - 1.76`（`src/main.ts:1193`），即 **app 时间 0 = 原片 5.00 s**，播放从 app 1.76 s（= 原片 6.76 s）开始。`boot-motion.ts:25-26` 做 `t = appTime + 5; f = floor(t*25)`——把连续时间转回**原片帧号**。

段划分（`src/boot-motion.ts:27-36`）：
```ts
const step = t < 9.12 ? "access" : t < 11.12 ? "logo"
  : t < 19.48 ? "auth" : t < 22.76 ? "scan" : "welcome";
```

| # | 段 | 原片时间 | 帧 | 时长 | 内容与驱动 |
| --- | --- | --- | --- | ---: | --- |
| 1 | access | 6.76–9.12 | 169–227 | 2.36 s | 固定左端逐字输入 `ACCESS PERMISSION REQUIRED`；字符数表 `accessCounts`（`boot-motion.ts:20-22`）。9.04 s 变淡，226 帧闪 0.25 不透明度，227 帧清零（`:64`） |
| 2 | logo | 9.16–11.84 | 229–295 | 2.68 s | 标志连续轮廓绘制（右上弧→左环→右环）+ `RHINE·LAB` 逐字 + 加/减号进入（247 帧）→ 256 帧加号开始转动、方点拉成横线 → 260–294 帧整体左移 |
| 3 | auth | 11.84–19.48 | 296–486 | 7.64 s | `ID CONFIRMED`(282–295) → ` : JOYCE MOORE`(321–339) → 清空 → `REQUEST RECEIVED`(367–389) → 清空 → `START PROCESSING`(423–440) → `...`(449) → 479/485/486 帧故障 `SING...` |
| 4 | scan | 19.48–22.76 | 487–568 | 3.28 s | 550 ms 内字距 40px→0 收拢（`:88-102`）；画面外黑白双环半径 2000→246 px 收拢（`boot-tracks.ts:91-136`）；525/526/528/529 帧 4 次缩放跳变 `ringScale 1.94` + `ringBlur 2.2`（`:75-87`）；546/549 帧中央大点闪变 |
| 5 | welcome | 22.76–26.92 | 569–673 | 4.16 s | 7 帧黑白闪切（`:122-127`）→ 588 帧公司名+标志出现、黑底 4→410 px 横扫（`boot-tracks.ts:60-83`）→ 594/595 帧灰闪遮罩 → 626 帧 `INTERNAL DATABASE` 落定 → 26.16–26.92 白场收尾 |
| 6 | 交棒 | 26.92 起 | 673+ | — | `welcomeVisible` 在 26.92 关闭（`:121`），`backgroundOpacity→0`（`:137`），切 3D 阵列入场（`src/main.ts:960` 从 t≥22 起把 step 改写成 `array`/`select`/`inspect`） |

音频线索表 `BOOT_CUES`（`src/audio.ts:68-79`）：9.16 `brand`、11.84 `confirm`、19.48 `scan`、21.84 `confirm`、22.76 `welcome`、23.52 `text-reveal`、25.04 `text-reveal`、26.92 `array`。

关键代码片段（`src/boot-motion.ts:24-27`）：
```ts
export function bootMotion(appTime: number) {
  const t = appTime + 5;
  const f = Math.floor(t * 25 + 0.00001);
```
（`src/boot.ts:129-140`）
```ts
update(time: number) {
  const s = bootMotion(time), t = s.t;
  this.stage.dataset.bootFrame = String(s.f);
  ...
  this.contour.style.strokeDasharray = `${s.logo.length} ${1 - s.logo.length}`;
  this.contour.style.strokeDashoffset = String(-s.logo.start);
```

### A3. 跳过机制——**有**

| 项目 | 依据 |
| --- | --- |
| 按钮 DOM | `src/main.ts:73`：`<button id="skip" class="skip" data-action="skip">ENTER SYSTEM <span>↗</span></button>` |
| 移动端第二入口 | `src/main.ts:108`：`<button class="mobile-entry" data-action="skip">进入档案 <span>→</span></button>` |
| 逻辑 | `src/main.ts:795-798`：`if (action === "skip") { setMode("archive"); audio.play("confirm"); }` |
| 复位（原地丢弃中间帧） | `src/boot.ts:265-273` `BootSequence.reset()`；调用点 `src/main.ts:398` |
| 显隐 | `src/style.css:1658-1659`：`[data-mode="archive"] .skip, [data-mode="detail"] .skip { display: none; }` |
| 几何 | `src/style.css:316-331`：`right:60px; top:121px; opacity:.55`；`:hover{opacity:1}` |
| 跳过回归 | `verification/BOOT-MOTION.md:31`「绘制中跳过后的品牌恢复」；`:46`「跳过恢复」 |

另有"重播"入口 `data-action="replay"`（`src/main.ts:88` 的 `REINITIALIZE ↗`），走 `replayBoot()`（`src/main.ts:483-497`）。

### A4. 视频 / 音频素材

**开场本体不使用任何视频或图片**——`verification/REPORT.md` 明确"运行界面没有 video 元素，也没有将参考 MP4 作为产品资源引用"；`src/` 全目录 grep 无 `createElement("video")`、无 `.mp4/.webm/.mov` 引用。仓库内视频相关文件只有参考提取工具与本地对照页（`reference/extract-boot.py`、`reference/boot-review.html`），且 `reference/boot-frames/.gitignore` 内容为 `*\n!.gitignore`，说明原片帧**不入库**。

仓库内全部 mp4/webm/gif/mp3/wav/ogg：

| 路径 | 字节 | 是否参与开场 |
| --- | ---: | --- |
| `docs/media/boot-motion.gif` | 1,693,709 | 否（README 演示动图） |
| `docs/media/assembly-motion.gif` | 1,888,621 | 否 |
| `docs/media/browse.gif` | 6,277,424 | 否 |
| `docs/media/decryption.gif` | 5,690,092 | 否 |
| `docs/media/glass-motion.gif` | 312,236 | 否 |
| `wallpaper/preview.gif` | 940,017 | 否（WE 商店预览） |
| `public/audio/motif.ogg` | 674,580 | **是（配乐 stem，音画同步）** |
| `public/audio/atmosphere.ogg` | 537,407 | **是（配乐 stem）** |
| `public/audio/pulse.ogg` | 371,667 | **是（配乐 stem）** |
| `public/audio/observatory-preview.mp3` | 1,281,645 | 否（独立试听版） |
| `public/audio/typing-preview.wav` | 192,044 | 否（试听；实际逐字音由 `src/typing-samples.ts` 内嵌 PCM 合成） |
| `reference/typing-original.wav` | 52,844 | 否（本地对照，不带入生产） |
| 仓库内 mp4/webm | **0 个** | — |

**无 mp4/webm 入库**。配乐 3 个 stem 合计 1,583,654 B；逐字输入音是 3 段 38 ms 采样（`public/audio/typing-source.json`：6.864–6.902 / 6.906–6.944 / 6.948–6.986 s）。

---

## B. 资产与授权

### B5. 开场用到的非代码资产

**字体（两类，来源完全不同）：**

| 资产 | 路径 | 字节 | 依据 |
| --- | --- | ---: | --- |
| Novecento Sans Wide Normal | `public/fonts/novecento/webFonts/NovecentoSansWideNormal/font.woff2` | — | **不在 Git 中**；`vite.config.ts:12-14` 用 `existsSync` 探测，缺省则 `__RHINE_NOVECENTO__=false` |
| Novecento Sans Wide DemiBold | `…/NovecentoSansWideDemiBold/font.woff2` | — | 同上 |
| Novecento Sans Wide Bold | `…/NovecentoSansWideBold/font.woff2` | — | 同上 |
| 三份合计 | — | **119,732** | `verification/WEBFONT-DEPLOYMENT.md:5`「三份 WOFF2 共 119,732 字节」；`verification/BOOT-LETTERING.md`「官方 Kit Builder 下载的原始 WOFF2 总计 119,732 字节」 |
| 兜底：内联 SVG 字形 | `src/boot-lettering-art.json` | **29,697** | 公开仓库**实际发行**的就是这份轮廓数据（`verification/BOOT-LETTERING.md`：「项目仅发行十段预先制作的固定文字图形，不嵌入 OTF 或 Webfont」） |
| MiSans（左上品牌行 + Logo 内 `RHINE·LAB`） | `public/fonts/misans-webfont-4.3.1/{light,regular,demibold,bold}/*.woff2` | 见下 | `src/style.css:6-7` 全局 `font-family:"MiSans",…`；`src/brand.ts` 里 `font-family="MiSans,sans-serif"` |

MiSans 分片实测（按 tree `size` 字段汇总）：`light` 188 片 / 6,100,360 B；`regular` 188 片 / 6,087,780 B；`demibold` 188 片 / 6,109,468 B；`bold` 189 片 / 6,163,676 B → **753 片 / 24,461,284 B**（与 `verification/STARTUP-LOADING.md:11` 表格的 24,461,284 完全一致）。单权重最小片如 `regular/0.woff2` = 36,932 B、`regular/1.woff2` = 1,636 B、`regular/4.woff2` = 880 B。`src/fonts.css` 即由这 753 条 `@font-face` 生成，文件本身 **587,429 B**。

**GLB 模型 / 贴图 / 音频 / 视频：**
- **GLB：开场 0 个。** 全仓 9 个 GLB 中，只有 `public/assets/archive-cassette.glb`（3,565,116 B）与 `public/assets/archive-assembly.glb`（3,343,744 B）进生产，且仅在三维阶段加载（`src/scene.ts:332`、`src/scene.ts:499`）。其余 7 个在 `reference/*-study/`、`reference/model-precision/`，合计 13,717,421 B，不入生产。
- **贴图：开场 0 个。** 开场画面全部由 DOM/CSS/SVG 绘制；`.boot-background` 是 CSS `radial-gradient` + 一条内联 SVG 曲线（`src/main.ts:62`）。
- **音频：** 见 A4。
- **视频：** 见 A4（0 个）。

### B6. 开场属于 MIT 原创还是含原作内容？——**两者都有，且仓库自己划清了界线**

`README.md:287` 与 `LICENSE` 声明 MIT 覆盖"程序代码、建模脚本、技术文档、Blender 源工程、GLB 模型、原创配乐与音效，以及图像、动图和其他原创资源"。

但同一节明确排除（`README.md:289`）：
> 「**《明日方舟》相关内容**：包括《明日方舟》及莱茵生命相关名称、标志、设定、**原 PV、原作视觉设计、原片音频采样及其衍生片段**，以及这些内容在模型、界面、截图或演示文本中的呈现。相关权利归各自权利人所有，本项目无法代替他们授权。」

`README.md:276`（参考与资源说明）：
> 「参考作品为《明日方舟》特别映像「莱茵生命：访问」…本项目与官方制作方无隶属关系，原 PV、相关名称、标志与设定的权利归各自权利人所有。」
> 「**声音**：三轨配乐为本项目程序编配；逐字输入使用原 PV 的三个 38ms 短音…**原片短音及其衍生片段不纳入原创配乐的 MIT 授权声明。**」

`public/audio/typing-source.json` 自述：
> `"source": "《明日方舟》特别映像 [莱茵生命：访问] [BV1rr4y1b7sz].mp4"`，`"scope": "Three short excerpts from user-provided reference. Not original synthesis; source rights remain with the original creators."`

`public/assets/boot-lettering-notice.txt`：
> 「The project's MIT license does not relicense the underlying typeface.」…「The desktop font files must not be redistributed or embedded in this project.」

**判定（依据 + 出处）：**

| 层面 | 结论 | 依据 |
| --- | --- | --- |
| 代码/时间轴/DOM-SVG 渲染实现 | **MIT 覆盖的原创部分** | `LICENSE`（MIT，Copyright (c) 2026 LBEILC）+ `README.md:287` 明确含程序代码 |
| 开场"参考对象"本身 | **《明日方舟》原 PV** | `DESIGN.md:34`「参考为目录原片的 5–40 秒」；`README.md:276` |
| 标志图形（RHINE LAB 标志、`RHINE·LAB`） | **原作标志**，权利不归本项目 | `README.md:289`「莱茵生命相关名称、标志」 |
| 逐字输入音效 | **原片音频采样**（3×38 ms），明确排除在 MIT 之外 | `README.md:276`、`public/audio/README.md`、`typing-source.json` |
| 中央英文短语字形 | 由 Novecento 字体轮廓导出，**受字体许可约束**（非 MIT） | `public/assets/boot-lettering-notice.txt`、`verification/BOOT-LETTERING.md` |
| MiSans | 小米字体许可，`public/fonts/MiSans-license.pdf`（**79,535 B，确实存在**）+ `public/fonts/NOTICE.txt`（929 B） | tree 实测存在 |
| 原片本身是否入库 | **否**。产品入口/生产构建不嵌入原片 | `DESIGN.md:48`「产品入口和生产构建不嵌入原片」；`README.md:282`「不包含…原 PV 或完整录制素材」；`reference/boot-frames/.gitignore` = `*` |

`DESIGN.md:26`（BOOT-MOTION 实现范围与限制）另注：
> 「原生 DOM/SVG 重建，**未将视频嵌入产品**。…曲线、光晕、背景抽象线条和字体栅格化仍与原片有差异，**不宣称逐像素一致**。」

---

## C. 搬到 Astro 静态博客的可行性与算术

> 约束：① 产物无独立 `.js`；② 首页内联 JS < 7,168 B；③ 零第三方资源（不得引外部域名）；④ 字体恰好 4 个 woff2。

### C7. 原样移植的字节算术

**JS 侧** —— 开场实现必须整条依赖链进入主包（`src/main.ts:1-22` 顶层 import，非懒加载）：

```
src/boot.ts               11,417
src/boot-motion.ts         4,192
src/boot-tracks.ts         7,402
src/boot-orbit-tracks.ts   4,835
src/boot-logo-tracks.ts    3,724
src/boot-lettering.ts      4,331
src/startup.ts             4,230   （"点击进入"闸门，约束③下音频仍需用户手势）
src/startup.css            1,008   （CSS，不计入 JS）
src/motion.ts              4,307   （boot.ts 时间基准）
src/brand.ts               1,620   （bootMarkContour / logo / brandHeading）
src/theme-ui.ts            1,366   （boot.ts:3 引用 themeAmount）
                          ───────
TS 小计                   42,424 B
+ 短语字形数据（内联 SVG path，必须内联）
  src/boot-lettering-art.json  29,697 B
                          ───────
合计需内联进首页               72,121 B
```

- **源字节 72,121 B = 约束上限 7,168 B 的 10.06 倍**。即使按"压缩后约为源码 30%"的乐观估计（minify + gzip 非等价，内联 JS 无 gzip 收益），也有约 21,636 B，仍是上限的 **3.02 倍**。
- 这不含 `src/style.css`（40,339 B，开场几何 + 阶段态选择器全在此）与 `src/fonts.css`（587,429 B，753 条 `@font-face`；CSS 不计入"内联 JS"，但它决定字体文件数与请求数）。
- 若不做字体子集化、原样带上 `src/fonts.css`（`src/style.css:1` 的 `@import "./fonts.css"`），约束④"恰好 4 个 woff2"**必然破裂**：MiSans 分片共 **753 个 woff2**（light 188 + regular 188 + demibold 188 + bold 189）。

**字体/模型/媒体侧**：

| 资产 | 数量 | 字节 |
| --- | ---: | ---: |
| Novecento（真切字面，仓库外） | 3 | 119,732 |
| MiSans woff2 分片（4 字重全量） | 753 | 24,461,284 |
| MiSans 开场实际命中（库方实测） | 20 | 424,676 |
| GLB（开场不需要，三维阶段才要） | 2 | 6,908,860 |
| 配乐 stem ogg | 3 | 1,583,654 |
| 内联 SVG 字形兜底（上表已计入 JS） | 1 | 29,697 |

- 约束④（恰好 4 个 woff2）与 MiSans 的 4 字重（`@font-face font-weight: 300/400/600/700`，各 188/189 片）**结构性冲突**：4 个 woff2 装不下 4 个字重的中文字面，除非每个字重子集化为 1 个文件（＝必须对本项目用到的全部汉字做子集化，这是站主的取舍，本报告不评估）。
- 即使只替换 3 份 Novecento：`字体数 = 4 - 3 = 1` 个额度留给 MiSans，而开场左上品牌三行 + Logo 内 `RHINE·LAB` 依赖至少 2 个字重（第一行 DemiBold 50.75px、第二行 600 字重 19px、第三行 35px，见 `DESIGN.md:145`、`src/boot-lettering.css:61-67`）→ **额度不足**。
- 配乐 3 个 ogg 若要"零第三方资源"且音画同步，必须同域自托管（1,583,654 B）。

**逐字输入音效**：3 段 38 ms 原片采样必须以 PCM 常量内联（`src/typing-samples.ts`，14,792 B 源文件），或改纯合成——后者已不是原样移植。

### C8. 只用 CSS（@keyframes）+ 极少量原生 JS 复刻"视觉节奏"——需要的具体数值

**这是本报告的核心交付物：从上游代码里抄出的全部数值。**

**总时长与坐标基准**：1920×1080，**25 fps**；`appTime = 原片时间 − 5`；播放起点 app 1.76 s（= 原片 6.76 s），总长 **20.16 s**；`bootStart = performance.now()/1000 - 1.76`（`src/main.ts:1193`，另有 `fade = 600 ms` 前置遮罩淡出，`src/main.ts:1192`）。

**缓动函数（上游仅两种）**：
```ts
// src/boot-motion.ts:6-8
export const progress = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));  // 线性归一
export const smooth = (p) => p * p * (3 - 2 * p);                                  // smoothstep
```
空间位移**不用缓动**，改用单调三次 Hermite 保速插值（`src/boot-tracks.ts:5-33`）。

**CSS 侧缓动/时长（可直接抄用）**：

| 元素 | 属性 | 数值 | 出处 |
| --- | --- | --- | --- |
| `.scan` | `transition` | `transform 1.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s` | `style.css:239-241` |
| `.welcome` | `transition` | `opacity 0.7s, transform 1s`（静止值 `translateY(14px)`→`0`） | `style.css:295-297` |
| `.brand, .powered` | `transition` | `opacity 0.6s` | `style.css:333-334` |
| `.auth-status` | `animation` | `fadeIn 0.7s` | `style.css:1594` |
| `.callout-rule` | `transition` | `transform 1.3s cubic-bezier(0.22, 1, 0.36, 1)` | `style.css:445` |
| `.file-summary` | `transition` | `opacity 0.7s 0.4s, transform 0.7s 0.4s` | `style.css:466-468` |
| `.archive-ui` | `transition` | `opacity 0.8s 0.3s` | `style.css:395` |
| `.system-nav` | `transition` | `opacity 0.8s` | `style.css:358` |
| `@keyframes blink` | 光标 | `0.8s steps(1) infinite`，`50%{opacity:0}` | `style.css:1718-1722`、`:219` |
| `@keyframes orbit` | 圆环自转 | `8s / 4s reverse / 16s`，`linear infinite`，`to{rotate(360deg)}` | `style.css:1713-1717`、`:265-282` |

**位移与透明度数值表（逐字时段）**：

| 阶段 | 帧区间 | 属性 | 数值 | 出处 |
| --- | --- | --- | --- | --- |
| ACCESS 输入 | 170–226 | 可见字符数 | 1,1,3,4,5,6,9,11,12,14,17,18,19,20,22,23,25,26（18 项） | `boot-motion.ts:20-22` |
| ACCESS 透明度 | 170–227 | opacity | 170–225 = 1；226 = **0.25**；227+ = 0 | `boot-motion.ts:64` |
| Logo 段可见 | 9.16–19.48 s | opacity | 0 / 1 二值 | `boot-motion.ts:65` |
| Logo 描边宽 | 229→234 | strokeWidth | 0.25, 2.8, 8, 16, 23.5, 26 | `boot-logo-tracks.ts:104-114` |
| Logo 轮廓首/尾 | 229–264 | 归一化弧长 | start −0.02→0.211；end −0.0198→1.184（26 组，逐帧） | `boot-logo-tracks.ts:5-40` |
| Logo 左移 | 260–294 | leftEdge px | 814, 813, 812, 808, 803, 794, 781, 763, 740, 716, 691, 668, 648, 630, 615, 601, 590, 580, 571, 563, 556, 550, 545, 540, 536, 533, 530, 527, 525, 523, 521, 520, 519, 518（**先加速后减速，长尾**） | `boot-logo-tracks.ts:59-94` |
| 加/减号进入 | 246–256 | symbolScale | 0, 0.4, 0.63, 0.75, 0.83, 0.89, 0.94, 0.985, 1 | `boot-logo-tracks.ts:115-128` |
| 加号旋转 | 255–270 | plusAngle ° | 0, −3, −22, −45, −62, −70, −80, −87, −90 | `boot-logo-tracks.ts:173-186` |
| 减号拉伸 | 246–268 | minusWidth px | 15→15→23→31→35.5→38→42→44→46 | `boot-logo-tracks.ts:159-172` |
| Logo 移动缺口 | 420–486 | cut 弧长 | 0.1835, 0.184, 0.1885, 0.2, 0.2205, 0.2925, 0.3485, 0.421, 0.5095, 0.614, 0.722, 0.827, 0.9195, 0.9365 | `boot-logo-tracks.ts:43-58` |
| 品牌三行位移 | 278/280/282 起 | text-align X px | **234, 216, 181, 143, 115, 94, 78, 65, 54, 45, 38, 31, 26, 21, 17, 13, 10, 8, 6, 4, 3, 2, 1, 0**（24 个采样，每行偏移 0/2/4 帧） | `boot-tracks.ts:37-44` |
| 品牌三行透明度 | 同上 | opacity | −1:0 → 0:0.4 → 1:0.65 → 2:0.88 → 3:1 | `boot-tracks.ts:46-56` |
| 身份文字 | 281–486 | opacity | 0 / 1 二值 | `boot-motion.ts:68` |
| 权限字距收拢 | 487–568 | letterSpacing px | **40, 28, 18, 14, 8, 4, 1.7, 0.5, 0, 0**（487/492/497/500/505/510/515/520/527/568） | `boot-motion.ts:88-102` |
| 权限文字字号 | 常量 | fontSize | 26.5 px | `boot-motion.ts:103` |
| 权限文字淡出 | 545–551 | opacity | 1, 0.4, 0.3, 0.25, 0.1, 0.04, 0 | `boot-motion.ts:107-118` |
| 权限文字淡入 | 19.48–19.88 s | progress→1 | 400 ms | `boot-motion.ts:104-106` |
| 圆环入场 | 487–493 | opacity | 0, 0.18, 0.6, 1 | `boot-motion.ts:78-86` |
| 环缩放跳变 | 525/526/528/529 | ringScale / ringBlur | **1.94 / 2.2px**（其余帧 1 / 0） | `boot-motion.ts:51`、`:75-76`、`:87` |
| **外环半径** | 487–568 | px | 2000, 1540, 1095, 895.5, 650, 492, 385.5, 320.5, 287.5, 275, 270, 265.5, 262, 258, 255, 252.5, 250, 246（**18 点**） | `boot-tracks.ts:91-110` |
| **白环半径** | 487–568 | px | 1500, 1011, 955, 893, 834, 783, 737, 693.5, 655, 619, 470.5, 374, 310.5, 272, 253.5, 248, 246, 242, 238, 235, 232.5, 230, 227.5, 224（**24 点**） | `boot-tracks.ts:111-136` |
| 外环起始角 | 487–568 | ° | 470→…→−90（17 点） | `boot-tracks.ts:137-157` |
| 外环弧长 | 487–568 | ° | 30→…→360（16 点） | `boot-tracks.ts:158-177` |
| 白环起始角 / 弧长 | 487–568 | ° | −100→270 / 30→360 | `boot-tracks.ts:178-217` |
| 内环半径 | 487–568 | px | 124.5→88.5（13 点） | `boot-tracks.ts:218-232` |
| 内环起始角 / 弧长 | 487–568 | ° | −20→201.5 / 0→136 | `boot-tracks.ts:233-273` |
| **六颗卫星点** | 548 起 | 相位 / 半径 | 相位 `angle + i·π/3`；出现间隔 **每 3 帧一颗**；轨道半径 270→169 px；点半径 0→4.25 px | `boot-orbit-tracks.ts:140-147`、`boot-tracks.ts:301-323` |
| 中央大点 | 545–568 | 半径 px | 0, 7.96, 9.89, 10.63, 11.08, 11.45, 11.45, 11.27；**闪变帧 546/547/549/550 = 42.93→42.43** | `boot-orbit-tracks.ts:99-120` |
| 两侧小圆 | 543–568 | 半径 / 自转 | 半径 38.7→37.15 px；左弧顺时针、右弧逆时针，弧长 0°→332°/339° | `boot-orbit-tracks.ts:8-56` |
| 公司黑底横扫 | 588–611 | 宽度 px / 归一化 | 4, 39, 225, 261, 288, 310, 328, 343, 356, 366, 375, 382, 389, 394, 398, 402, 405, 407, 408, 409, 410, 410, 410；除以 410（**前段快扫，后段长尾收束**） | `boot-tracks.ts:60-85` |
| 灰闪遮罩 | 590, 591 / 594, 595 | 可见性 / opacity | 590–591 整层切出；594–595 遮罩 0.65、第二层文字 **0.06** | `boot-motion.ts:128-129`、`boot.ts:181-186` |
| 欢迎 7 帧闪切 | 569–575 | panel / ink | panel `[1,0,0.28,0,1,0,0]`；ink `[0,0,0.2,1,0,0,0.25]` | `boot-motion.ts:52`、`:122-127` |
| INTERNAL DATABASE | 626–635 | opacity | 626 前 = 0；628/629/631/634 = 0；其余 = 1（**4 次闪动**） | `boot-motion.ts:131` |
| 退场 | 26.16–26.92 | exit = smoothstep | 0→1；scale `1 − 0.46·exit`；opacity `1 − exit³`；blur `8·exit` px；同时 `invert(0.22·exit) sepia(exit) saturate(1+5·exit) hue-rotate(115·exit deg)` | `boot-motion.ts:54`、`:133-138`、`boot.ts:174-175` |
| 白场 | 26.16–26.88 | white | smoothstep 0→1 | `boot-motion.ts:138` |
| 背景漂移 | 全程 | transform | `translate(sin(t·0.16)·18 px, −(t−6)·5 px) scale(1.08)` | `boot.ts:193-194` |
| 阶段门控 | — | step 阈值 | access <9.12；logo <11.12；auth <19.48；scan <22.76；welcome ≥22.76 | `boot-motion.ts:27-36` |
| 音频触发点 | — | 8 个时刻 | 9.16 / 11.84 / 19.48 / 21.84 / 22.76 / 23.52 / 25.04 / 26.92 s | `audio.ts:68-79` |
| 逐字打字帧 | — | 6 段 | [170,187] [282,295] [320,339] [367,389] [423,440] [449,457] | `typing-rhythm.ts:6-13` |

**版式常量（CSS 可直接抄）**：`.boot-logo` 296×177 @ left 518 / top 462（`style.css:188-195`）；`.access-text` top 532 / left 800 / width 420 / font-size 18px（`:221-228`）；`.auth-status` left 931 / top 529 / font-size 22px / gap 12px（`:201-206`）；`.scan` left 410 / top −10 / 1100×1100 / 初始 `scale(0.82)`（`:230-241`）；`.scan > span` font-size 25px（`:244`）；`.welcome` top 403 / font-size 55px / bold / translateY(14px)（`:284-297`）；`.welcome strong` font-size 51px / 背景 `#080a08` / 文字 `#ece9e4`（`:298-306`）；`.welcome-logo` 203×121 / margin-top 58px（`:307-311`）；`.brand` left 59 / top 114 / width 270（`:95-104`）；`.skip` right 60 / top 121 / opacity 0.55（`:316-324`）；`.boot-background` 径向渐变 `ellipse at 51% 48%, #e7e7e1 0%, #e3e1dc 76%, #e4dfdb 100%`（`:164-172`）。

**一句话**：`boot-motion.ts` + 三个 `*-tracks.ts` 里可以**纯 CSS 化的只有二值 opacity / 固定时长 transition**；所有"半径 2000→246""字距 40→0""黑底 4→410"都是**逐帧测量关键帧 + 单调保速插值**，用 `@keyframes` 表达需要把上面每张表的每个数值都写成百分比关键帧（线性）——这会**丢掉保速特性**（上游注释明确：`boot-tracks.ts:2-3`「Monotone cubic interpolation preserves measured speeds between source frames; unlike easing each interval separately, it does not stop at every keyframe」）。

### C9. `DESIGN.md`（44,389 B）中与运动/动画/时间有关的可复用条文

| 行 | 原文引用 | 中文转述 | 是否给显式数值 |
| --- | --- | --- | --- |
| 34 | 「参考为目录原片的 5–40 秒，1920×1080、25fps。」 | 参考基准帧率与画幅 | **是**（25fps / 1920×1080） |
| 42 | 「5–27 秒为接入、身份验证、授权扫描、欢迎和白场。26.92–27.67 秒，阵列从左侧滑入，镜头从接近侧视快速抬高」 | 开场占 5–27 s；阵列入场 26.92–27.67 s | **是**（秒） |
| 133 | 「以原片 25 fps 连续帧复核 6.76–27.00 秒。…应用的内部参考时间仍为原片时间减 5 秒；首次加载遮罩退出后才开始显示英文输入。」 | 时间原点换算 + 600 ms 遮罩淡出后才开始 | **是**（6.76 / 27.00 / −5 s） |
| 135 | 「`boot-motion.ts` 将逐字输入、停顿、清空、闪切固定到原片帧点，空间位置使用连续插值。`boot.ts` 驱动 DOM/SVG，**不依赖循环 CSS 动画的已播放时长**，因此正常播放、慢放和前后跳帧使用同一画面状态。」 | **架构准则：用绝对时间函数而非 CSS 动画计时** | 否（准则是定性的） |
| 137 | 「权限段用从画面外收拢的黑白双环、反向内弧、橙色节点、四帧缩放跳变和中心图形切换。欢迎段保留黑白闪切、公司名称黑底横向扫过、第三行 `INTERNAL DATABASE` 闪现，最后缩小、失焦、带轻微青色过渡进入白场。」 | 各段动作清单 | **是**（"四帧"跳变） |
| 139 | 「参考帧与检查结果见 `verification/BOOT-MOTION.md`。…原片及提取帧只用于本地验证，**不作为产品背景**。」 | 原片不得成为产品资源 | 否 |
| 143 | 「品牌容器左 59px、上 114px、宽 270px；第一行 44px / 48px 行高 / 2.5px 字距；第二行 19px / 23px 行高 / 600 字重 / 0.65px 字距；第三行 35px / 40px 行高。…OS 在 270px 容器右端对齐、字距 3px。浏览器测得三行宽度约 269.78、269.63、270px。」 | 品牌三行排版 | **是**（px / 字重 / 字距全给） |
| 144 | 「平移与缩放的大部分运动在约 200–250ms 内完成；复位采用 560ms 减速曲线和球面短路径」 | 查看器手感（非开场） | **是**（200–250ms / 560ms） |
| 196 | 「三行分别在原片 11.12、11.20、11.28 秒出现，使用独立的先加速后减速位移，第三行到约 12.20 秒落定。黑底在 23.52 秒进入，快速扫过后缓慢收束至 24.40 秒；灰闪时保留遮罩与未覆盖文字。」 | 交错出现时刻 + 长尾收束 | **是**（秒） |
| 198 | 「外环、白环的半径及弧端独立变化，内环与橙点减速，黑白端点同步缩小。空间运动使用**测量关键帧的单调三次插值**，离散闪切保持 25 fps 时间码。」 | **核心运动准则：单调三次保速插值** | 否（插值方法，无数值） |
| 200 | 「原片 544 帧开始出现短弧，左右反向旋转并减速，568 帧分别达到约 332°、339°…中央圆点周围的六颗小点才沿约 **35 px** 的轨道绕行，小点每隔**三帧**进入。中央大点保留 546、547、549、550 帧的闪变，然后缩至约 **10–11 px** 半径。」 | 小圆/卫星点/大点 | **是**（帧号 / 35px / 3 帧 / 10–11px） |
| 202 | 「加号与方点于 **247 帧**同时出现、向各自位置展开，**256 帧**后加号转动、方点拉成长横。Logo 左移按 **260–294 帧**实测位置拟合。**425 帧**后缺口开始沿轮廓移动。」 | Logo 动作帧点 | **是** |
| 304 | 「复用逐字尺寸和基线，不重新调整已确认排版。」；「处理提示字号 21.35px，顶部 527px，图标间距 10px（1920×1080 基准）」；「左上 RHINE LAB…DemiBold，字号 50.75px、字距 1px，标题行固定高 48px，图形顶部偏移 1.425px」 | 中央字体与左上标题度量 | **是** |
| 308 | 「动效支持完整／减少／自定义及 14 项分组开关，首次访问保持跟随系统偏好…关闭模型解密动效时，详情直接清晰…」 | `prefers-reduced-motion` 行为 | 否（开关数量，无时长） |
| 48 | 「真实屏幕空间透射…尚未通过逐像素差分认证。」 | 不声称逐像素一致 | 否 |
| 26（BOOT-MOTION.md） | 「不应期…原生 DOM/SVG 重建，未将视频嵌入产品。…**不宣称逐像素一致**」 | 精度声明边界 | 否 |

**注（文档不一致，需站主知悉）**：品牌第一行字距在 `DESIGN.md:143` 写 **2.5px**、在 `DESIGN.md:304` 写 **1px**；`src/style.css:105-111` 实际为 `font-size:44px; letter-spacing:2.324px`，而 `verification/STARTUP-LOADING.md:28` 记录"固定品牌第一行字距调整为 2.324px"。

### C10. `verification/` 中与动画/入场/运动相关的条目

`verification/` 共 **124 个文件**（40 个 `.md` + 84 个 `.png`/`.json`）。与动画/入场/运动直接相关：

| 文件 | 字节 | 验什么 |
| --- | ---: | --- |
| `verification/BOOT-MOTION.md` | 8,512 | **开场 2D 逐帧**：原片 169–675 帧事件表、非线性轨迹复核（278/280/282 帧三行错峰）、小圆自转与 Logo 连续轮廓；`reference/boot-check.html` 30 项通过 |
| `verification/BOOT-LETTERING.md` | 5,615 | **开场中央文字字体**：Novecento Normal/Bold/DemiBold 选型、逐字格宽与字距、83 个文字变化帧、跳帧复用节点、无 Novecento 字体文件请求；14–15 项通过 |
| `verification/STARTUP-LOADING.md` | 7,068 | **入场闸门与字体分包**：点击/触摸/键盘启动、等待不计入动画、静音进入、失败重试、MiSans 分片下载量（19,744,460 → 424,676 B）与首次动效默认值 |
| `verification/BOOT-HUD.md` | 1,694 | **开场 HUD 曲面投影**：Logo/验证文字/圆环/欢迎画面五块投影、阶段切换不归零深度、Logo 下小字 650 ms 内 20 次节点替换的闪动修正 |
| `verification/MOTION-INTEGRATION.md` | 5,808 | **14 项动效开关**与主分支整合：首次跟随系统、预设推导、模型解密与正文揭示独立、窗口过渡与查看器过渡独立性 |
| `verification/UI-TRANSITIONS.md` | 1,459 | **详情/弹窗/查看器过渡**：弹窗进入 300 ms / 退出 200 ms、详情退出 180 ms、页签 150 ms 淡入 + 180 ms 下划线、查看器 320/380/220 ms；`ui-transition-check.html` 20 项 + `viewer-motion-check.html` 14 项 + `micro-transition-review.html` 13 项通过 |
| `verification/ROLLING-TITLE.md` | 2,685 | **文字滚动**：标题与编号共用 **460 ms**、`transition: direct` / `stagger: none`、垂直模糊 0.2、跨列刻度 400 ms；`micro-transition-review.html` 15 项、`navigation-transition-check.html` 19 项通过 |
| `verification/LOOPING-ARCHIVE.md` | 1,806 | **循环阵列运动连续性**：20,000 次双向切换、固定实例池 288、坐标重置误差 < 1e-9、循环后重播原片 27.60/29.16/31.56/39.00 s 位置误差 ≤ 5.48e-7 |
| `verification/ANGLE-FIX.md` | 1,390 | **角度条纹**：非运动项，但含 `check-motion.mjs` 回归；-0.8 弧度复现条件 |
| `verification/VISUAL-EFFECTS.md` | 3,624 | **UI 曲面视差与全局质感**：曲率 = 纵深 × 0.08、指针切向项、颗粒 12 Hz 更新、减少动态效果冻结颗粒但保留静态曲面 |
| `verification/WEBFONT-DEPLOYMENT.md` | 1,420 | **开场字体的线上部署与校验**：三份 WOFF2 共 119,732 B、SHA-256 逐文件校验、PWA 清单含三份字体 |
| `verification/RESPONSIVE.md` | 3,516 | **视口/触摸适配**：逐帧对照保留 1920×1080 舞台，正常入场铺满实际视口 |
| `verification/REPORT.md` | 9,433 | **总体验证记录**：含"跳过启动进入阵列"通过、"完整 35 秒启动自动进入详情"通过、"减少动效开关"通过、`check-motion.mjs` 通过（160 个位置、最大相邻帧高度变化 0.615 世界单位、30/120 fps 一致） |
| `verification/DECRYPTION.md` | 3,722 | **解密线运动**：沿同一物理对角线合拢、非线性运动、交互压缩时间但原片对照用原时间码 |
| `verification/ARRAY-INPUT.md` | 5,228 | **拖动/惯性运动**：持续惯性、按松手速度决定滑行距离、接近停止才吸附 |
| `verification/LIGHTING-POLISH.md` | 2,225 | 光影（非动画，但属"动效与光影"对照组） |
| `verification/SELECTION-STATE.md` | 1,133 | **选中态过渡**：暗色仅选中强调随实际升降连续过渡、音乐归齐时抑制本地音效 |
| `verification/THEME.md` | 1,479 | **明暗切换过渡**：以当前档案为起点沿行列依次改材质、中途反向接续 |
| `verification/BOOT-MOTION` 相关的机器产物 | `verification/boot-hud/results.json` 6,369 B、`verification/boot-lettering/sources.json` 684 B、`verification/boot-lettering/webfont-sources.json` 774 B、`verification/performance/runtime/boot-hud.json` 6,506 B | 开场的机器可读检查结果（如 HUD 投影数据、字体源哈希） |

**不相关**（虽在目录内）：`MODEL-PRECISION.md`、`PERFORMANCE*.md`、`THREE-RELEASE.md`、`UI-INSETS.md`、`WORKBENCH-*`、`wallpaper-*`、`PWA-RECOVERY.md`、`ARRAY-COVERAGE.md`、`RING-TEXTURE.md`、`SHELL-REFINEMENT.md`、`INTERNAL-OPTICS.md` 等。

---

## D. 不确定处 / 未查清项

1. **Novecento 三份 woff2 的实际字节拆分未取得**。总量 119,732 B 来自 `verification/WEBFONT-DEPLOYMENT.md:5` 与 `verification/BOOT-LETTERING.md`；单文件大小无法核实，因为 `public/fonts/novecento/**` **不在 Git 树中**（`vite.config.ts:12-14` 的 `existsSync` 探测即为此设计）。逐文件哈希在 `verification/boot-lettering/webfont-sources.json`（774 B），**本次未下载该文件**以节省 API 配额。
2. **`public/fonts/MiSans-license.pdf`（79,535 B）未下载解析**。仅从 tree 确认存在（`contents` 接口对 >1 MB 文件才需要额外分支，该文件可抓，本次未抓）。其许可条款（是否允许子集化、是否要求署名形式）**未读取原文**。
3. **`boot-lettering-art.json` 内含 10 段短语的完整 SVG path，本次仅读取前 400 B 作为类型确认**。未逐字统计每段短语的字符数与 path 总字节构成，因此"若拆除 10 段短语可省多少字节"无法精确给出。
4. **GLB 内部是否含动画轨道（animation clips）无法在 API 层判定**。两个生产 GLB（`archive-cassette.glb` 3,565,116 B、`archive-assembly.glb` 3,343,744 B）本次未下载解析二进制 chunk；但**与开场无关**——开场不加载任何 GLB（`src/scene.ts:332`/`:499` 均在三维阶段）。
5. **MiSans"开场实际命中 20 个分片 / 424,676 B"来自文档而非本次实测**（`verification/STARTUP-LOADING.md:26`）。本次仅从 tree 汇总了 753 片的静态总量（24,461,284 B），未复现浏览器按 `unicode-range` 的实际命中集合。因此"复刻开场最少需要多少 MiSans 字节"只能给文档值，不能给独立复算值。
6. **未实际构建或运行上游项目**。所有时长/字节均为源码与文档的静态读数；未执行 `npm run build` 以取得真实 bundle 体积，故 C7 的"内联 JS 最少多少字节"是**源码字节 + 保守压缩推断**，不是打包器实测值。上游自己反复提到"既有的大体积 JavaScript 分块提示"（多处 verification），说明其 bundle 远超 7,168 B，但**具体数字未取得**。
7. **`docs/media/boot-motion.gif`（1,693,709 B，20.4 s / 800×450 / 12 fps）未做帧抽取**。它是本次唯一可直接观察开场运动的产物；若需逐帧核对视觉节奏，需下载并解帧（本次未做）。
8. **音频 3 个 stem 的内部结构（`public/audio/score.json` 533 B）未读取**。开场各阶段的 stem 增益配比已知（`src/audio.ts:610-624`：phase 0 `[0.48,0.32,0.18]`、phase 1 `[0.68,0.55,0.32]`、phase 2 `[0.9,0.72,0.65]`、phase 3 `[0.72,0.36,0.12]`，过渡 0.9 s），但 stem 是否为循环段、循环点在哪，未核实。
9. **`reference/measure-boot.py` / `measure-scan-detail.py` / `measure-boot-logo.py` / `inspect-boot-logo.py` 只取了前两个**。后两个（`inspect-boot-logo.py` 735 B、`measure-boot-logo.py` 2,993 B）的测量方法未读，故 Logo 轨迹的**测量误差范围**无法独立评估。文档自述限制为"原片压缩、字体栅格化、发光及画面外弧段存在测量限制；轨迹为逐帧测量后的拟合，**不声称拿到了原视频工程中的原始动画曲线**"（`verification/BOOT-MOTION.md:48`）。
10. **`boot-blur`/HUD 曲面参数未取全**。`verification/BOOT-HUD.md` 引用了 `scripts/check-boot-hud.mjs`（4,652 B）与 `verification/boot-hud/results.json`（6,369 B），本次未下载；开场 HUD 投影的具体 matrix3d 参数与"曲率 = 纵深 × 0.08"以外的系数未核实。
11. **Astro 侧的约束无法从上游验证**。约束③"零第三方资源"与上游无冲突（上游全部同源），但约束①"产物无独立 .js"与上游的 Vite ESM 产物形态**根本不同构**；本次未检查站主博客的实际构建配置，因此 C7 的结论只针对"把上游代码搬过来"这一路径，不代表已评估任何其他路径。
12. **未验证 `bootStart` 的 1.76 s 偏移与 600 ms 遮罩淡出是否会叠加**。`src/main.ts:1192-1194` 中 `fade = motionActive("boot") ? 600 : 0`，并在 `bootStart` 上再加 `fade/1000`；两者关系（是补偿还是叠加）未逐帧验证。

---

## 本次新建的全部文件路径

**新建的探针脚本/输出（均在 `<博客仓库>\` 下，均为 `_tmp-*` 前缀，未改动任何既有文件）：**

- `<博客仓库>\_tmp-rlui-tree.mjs` — 全树抓取探针
- `<博客仓库>\_tmp-rlui-tree.json` — 树接口原始响应（318,769 B）
- `<博客仓库>\_tmp-rlui-tree.txt` — 按字节降序的 blob 清单（1,217 行 + 2 行表头，65,011 B）
- `<博客仓库>\_tmp-rlui-probe.mjs` — Contents API / 大文件分支 / 速率探针
- `<博客仓库>\_tmp-rlui-fetch.mjs` — 批量路径抓取器（base64 落盘）
- `<博客仓库>\_tmp-rlui-utf8.mjs` — UTF-8 安全读取器（规避 PowerShell 中文乱码）
- `<博客仓库>\_tmp-rlui\` — 上游文件本地镜像目录，共 **60 个文件**（实测 `Get-ChildItem -Recurse -File` = 60），含
  - `_tmp-rlui\src\` **20** 个（`boot.ts`、`boot-motion.ts`、`boot-tracks.ts`、`boot-orbit-tracks.ts`、`boot-logo-tracks.ts`、`boot-lettering.ts`、`boot-lettering.css`、`startup.ts`、`startup.css`、`motion.ts`、`motion-preferences.ts`、`theme-motion.ts`、`brand.ts`、`theme-ui.ts`、`main.ts`、`scene.ts`、`style.css`、`fonts.css`、`audio.ts`、`typing-rhythm.ts`、`wallpaper-opening.ts`）
  - `_tmp-rlui\verification\` **19** 个 `.md`（BOOT-MOTION、BOOT-LETTERING、BOOT-HUD、STARTUP-LOADING、MOTION-INTEGRATION、UI-TRANSITIONS、WEBFONT-DEPLOYMENT、ANGLE-FIX、LOOPING-ARCHIVE、ROLLING-TITLE、VISUAL-EFFECTS、REPORT、RESPONSIVE、DECRYPTION、ARRAY-INPUT、LIGHTING-POLISH、SELECTION-STATE、THEME、WORKSHOP-PREVIEW）
  - `_tmp-rlui\reference\` **7** + 1（`boot-check.html`、`boot-audio.html`、`audio-check.html`、`extract-boot.py`、`measure-boot.py`、`measure-scan-detail.py`、`LORE-SOURCES.md`、`boot-frames\.gitignore`）
  - `_tmp-rlui\public\` **5**（`audio\README.md`、`audio\typing-source.json`、`fonts\NOTICE.txt`、`assets\boot-lettering-notice.txt`、`licenses\rolling-number.txt`）
  - `_tmp-rlui\docs\media\README.md` **1**
  - `_tmp-rlui\` 根 **7**（`DESIGN.md`、`README.md`、`AGENTS.md`、`LICENSE`、`package.json`、`index.html`、`vite.config.ts`）
  - 明细：20 + 19 + 8 + 5 + 1 + 7 = 60

**未修改**：`<博客仓库>` 下所有既有文件（含 `src/`、`content/`、`docs/`、`public/`、`dist/`、`astro.config.mjs`、此前已存在的 `_tmp-*.mjs`/`_tmp-*.txt`）。
