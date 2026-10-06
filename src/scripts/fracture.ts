/* =============================================================================
 * 装置「裂痕 FRACTURE」（404 页）—— 内页**第十台**装置
 *
 * ★ 名字不是新造的：它本来就在 `rl-core.ts` 头部那份**最初的十台装置命名表**里
 *   （归档卷尺 / 关于亲笔 / 阅读尺 / 浮游 / 走时仪 / 准星 / 墨滴 / 星座 / **裂痕**），
 *   状态与「走时仪」「准星」当初一样：有名字、没规格、没实现。
 *   ⚠ 序号只能从**源码与 git log** 读，别从 spec 推：spec 里「墨滴」连章节都没有，
 *     光读文档会把第十台数成第八台（准星那轮就栽过一次）。
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ── 第三版（2026-10-07）：**回到一次真实的撞击** ────────────────────────────
 *
 * 站主原话（第三版）：
 *   「裂纹更真实点，不要这样好几个中心了，且要真实的裂痕，玻璃质感的。
 *     你可以直接去搜镜子破碎/玻璃破碎效果去参考别人的」
 *
 * 三条指令逐一落在这里：
 *   ①「不要这样好几个中心」⇒ **只留一个爆点**。第二版是「1 主爆点 + 4 次级点」
 *      （当时为了"指针随便移到哪儿都能碰到裂纹"），铺开之后读起来是**五朵星芒**，
 *      不是一块碎了的玻璃。真玻璃被砸一下只有一个爆点。
 *      ⇒ 覆盖问题改用**形态**解决（放射线铺满一周、往外分叉、远近都够密），
 *        而不是靠多砸几下（见下方"可用性"段）。
 *   ②「更真实、真实的裂痕」⇒ 形貌按**法庭玻璃断裂学**的定式重做，四条：
 *      · **放射线（radial）先裂、同心环（concentric）后裂** —— 顺序决定了交叉处的
 *        形态：裂纹遇到**已有的自由面就停**，所以**环止于放射线，放射线不止于环**。
 *        每个 T 形交叉里，"竖"的那一笔是后裂的。这一版的环因此是**一段段弦**，
 *        端点**正好落在放射线上**（第二版的环是自成一体的波浪圆圈，与放射线只是"穿过"）。
 *      · 小角度分叉、越往外越细（hackle）；
 *      · 爆点附近是**粉碎区 + 雾化区**：中心一小片极密的短裂，往外一圈细碎的短裂
 *        （真玻璃在爆点周围有一片"碎成末"的区域）；
 *      · **碎片尺寸差得极远** —— 爆点边上是粉末级的碎屑，画幅边缘是手掌大的整块。
 *        做法是环半径按**等比数列**长（`RING_Q`），于是越往外格子越大。
 *      · 爆点**故意偏一点**（不是正中央）：正中央的爆点读起来像"排版出来的装饰"。
 *   ③「玻璃质感」⇒ 裂纹不再是一根线，而是**有厚度的裂口**：
 *      玻璃有几毫米厚，砸开之后断面朝向不同 ⇒ 一侧**背光成暗缝**、另一侧**迎光出亮边**
 *      （"画碎镜子"的教程里管这叫 Dark Edge 秘密：单调的一条黑线永远像铅笔划痕）。
 *      ⇒ 三条叠着画：`band`（宽而淡的裂口暗带）+ `line`（细而浓的暗缝，偏向背光侧）
 *        + `light`（亮芯，偏向迎光侧，用 `--paper` 压 alpha）。
 *      ★ 这一条顺带修掉了上一轮交付时留下的一个问题：**压在深色页脚带上的裂纹看不见**
 *        （近黑的线压在深色上自然显不出来）。有了亮芯就不一样了 —— 深色底上反而是
 *        那根亮边最清楚，正好是"玻璃裂口反光"的样子。
 *      ★ 全页**只有一支光**（左上），所有裂纹的亮/暗边朝向一致 —— 朝向乱飞就是"贴图"。
 *
 *   ④（本轮）站主看完成品说「**线不要那么密，稀疏一点**」⇒ 整张网**降密度**，
 *      而且不只拉放射线这一处（只拉一处会变成"放射线很稀、爆点还糊着一坨"）：
 *      `RAYS` 26→17（少 35% 的辐条）· `MIST_N` 44→26 · `CRUSH_N` 30→20 ·
 *      `BRANCH_P` 0.14→0.09 · `RING_Q` 1.27→1.34（环从 17 圈降到 14 圈，
 *      远处格子更大 ⇒ 也顺带把"碎片外大内小"拉得更开）。
 *      ★ **密度不是一个孤立的旋钮**："指针随处能碰到裂纹"这条可用性保证是**形态**
 *      给的（见下方"可用性"段），所以每拉稀一次都要**重量一遍可触达率** ——
 *      读数出自 `_probe/_404-lab.mjs` 的距离场，阈值写在实验室里（≥ 85%）。
 *
 * ── 第二版留下的两条（仍然有效，别在改这一版时把它们一起改掉）──────────────
 *   · **模型**仍是「**预置网络 + 沿线揭示**」：几何只建一次（种子写死，同一个长宽下逐点
 *     相同），页面一进来整张网就铺在文档上 —— 站主原话「裂纹…**本来就在上面**
 *     （类似于在下面的图层）」。指针的职责是**揭示器**而不是"起点"：碰到的线从那一格
 *     向两端逐段跳着亮起来（顿挫，见 `advance`），离手之后自己走完。
 *   · 颜色仍是**中性近黑**而不是站上那族绿 —— 站主原话「**别用绿线**」：
 *     玻璃裂纹是纸面上的一道暗缝，不带色相。
 *
 * ── 形貌：四条定式各自落在哪个常量上 ──────────────────────────────────────
 *   · `KINK_DEG` / `KINK_P` / `DRIFT` —— 放射线**近直线，但会"顿一下"拐半步**。
 *     ★ 这里是从第二版的**平滑曲线**（`CURVE 0.028 rad/段`，曲率半径 570px）改过来的，
 *       理由是查了画碎玻璃的教程：真裂纹"hit a grain in the glass and veer off by a
 *       fraction of a millimeter" —— 它表现为**稀疏的折点**，不是**连续的微弯**。
 *       连续微弯是"软材料被拉伸"的语言。⇒ 现在每一段是**数学直线**，只有 `KINK_P`
 *       的概率会拐一下（±`KINK_DEG`），另加一点 `DRIFT` 的漂移免得整条线是折线段堆的。
 *   · `RAYS` 放射线根数 + `BRANCH_*` 小角度分叉（11°~24° 的细 Y 型，不是树枝）。
 *   · `RING_R0` / `RING_Q` / `MIN_CHORD` / `RING_BOW` —— 同心环。
 *     环半径按等比数列长（`RING_Q`）⇒ 近处环密、远处环疏 ⇒ **碎片外大内小**；
 *     弦长小于 `MIN_CHORD` 的不画（爆点那一圈交给粉碎/雾化区，那里本来就是一坨）；
 *     弦带一点 `RING_BOW` 的弓（近直线，不是尺子线）。
 *   · `CRUSH_*` / `MIST_*` —— 粉碎区与雾化区。
 *
 * ── 颜色：半透明的**中性**线（站主原话「别用绿线」）+ 一支亮芯 ───────────────
 *   第一版用的是 `--accent`(绿) @60%（`#2d7d4699`）—— 站上其余装置都是绿的，
 *   当时顺手沿用了。但**玻璃裂纹不是绿的**：它是纸面上的一道暗缝（比纸白暗、不带色相）。
 *   ⇒ 暗的那几道全用 `--ink`(#1a1a1a) 压 alpha；**唯一不是 ink 的是亮芯**，
 *     它是"裂口里透出来的光"，语义上就是**纸色**，所以读 `--paper` 压 alpha。
 *   ★ 四个 token 全在 `tokens.css`，脚本侧只留**两个字面兜底**（`--ink` 与 `--paper`），
 *     alpha 后缀靠拼接派生 —— 不把 8 位 hex 整条复制一遍（那样改 token 就得记得来改
 *     脚本，迟早会对不上；tokens 那轮踩过）。
 *
 * ── 三条分野（两条跟着改，一条不变）──────────────────────────────────────
 *   ① **唯一一台指针离开之后还在继续**的装置 —— **保留**。只是"继续做的事"
 *      从"接着长"变成"把已经开始揭示的那条走完"。其余九台指针一停画面就停。
 *   ② **唯一一台几何受 DOM 文字盒约束**的装置 —— **保留，但时点变了**：
 *      从"生长时逐段问"改成"**建网时**就绕开"（网只生成一次）。
 *      ★ 第三版还改了一条**手感**上的规矩：撞上文字盒**只试两次小角度偏转，再不行就停**。
 *        第二版是"先近角后远角、两边都试"地一路转下去，出图（`_probe/_404/fig-net.png`）
 *        一看：撞到导航条的那些射线**贴着盒子边缘排成一排平行线**（像影线），
 *        完全是机械的痕迹。真玻璃撞到自由面就是**停**。
 *      ⚠ 代价写明白：文字盒一变（resize / 字体加载 / 换行）就只能**重建整张网**，
 *        重建会丢掉已揭示的状态。resize 是低频操作，取这个取舍（见 `resize` 段）。
 *   ③ **唯一一台挂在文档坐标系**上的装置 —— **不变**。要与文字盒保持相对关系，
 *      而文字随滚动走；挂视口的话滚一下"绕开"就全错位了。
 *
 * ── 可用性：为什么只剩一个爆点也"划到哪都能碰到" ──────────────────────────
 *   第二版靠"五个爆点铺开"来保证指针随处都能碰到裂纹。第三版回到一个爆点，
 *   这个保证改由**形态**提供：放射线铺满一整周（`RAYS`）且**往外分叉**
 *   （`BRANCH_*`，越远越密）；环把远场切成格子。**它是量出来的**，不是推演的：
 *   `_probe/_404-lab.mjs` 的 ⓪″ 相用**离墨距离场**算出"全页有多大比例的像素
 *   距最近的裂纹 ≤ `REVEAL_R`"（可触达率），并且仍保留"离网最远处碰一下必须
 *   一动不动（判据 = 0）"的负对照。调密度看那个数，不看感觉。
 *
 * ── 三条"不做"（措辞保留）────────────────────────────────────────────────
 *   · **不做点击砸碎**：站主说的是「鼠标**划过**」。划过 = 运动；揭示也是运动触发的。
 *   · **不做愈合式淡出**：真玻璃裂了不愈合。已揭示的就是永久的（"甲档"语义保留，
 *     只是现在不需要"封顶淘汰"了 —— 总量是建网时定死的，不会越碰越多）。
 *   · **不引入不可复现的随机**：本站硬规矩 —— 形状不许用 `Math.random`。
 *     这里用**固定种子**的 mulberry32：形状逐点可复现。
 *     连"顿挫的不匀"也走它 ⇒ **连节奏都可复现**（同一个长宽 ⇒ 同一次跳动序列）。
 *
 * ── 降级（两条，都是"不装"而不是"装个弱的"）────────────────────────────
 *   · `hover:none`（触屏）：本装置要"指针划过"，触屏上没有"划"这件事。
 *   · `prefers-reduced-motion`：本装置**没有最终态可落** —— 它的产物就是"指针划过的
 *     痕迹"，静止用户既没划过、也不该被一段自己会跳的动效打扰。
 *     （对照：显影板/星座的 RM 档是"一次画完的静态图"，那是因为它们有静态产物。）
 *
 * ── 参考（站主说"可以直接去搜"，这几条是真正落到常量上的）──────────────────
 *   · NIST / SWGMAT《Glass Fractures》与法庭断裂学：放射线先裂、同心裂后裂；
 *     "concentric cracks…are usually in **straight segments** that terminate in an
 *     existing radial crack"；T 形口里竖笔在后；爆点近旁分 mirror / mist / hackle 三区。
 *   · 画碎镜子/碎玻璃的教程（多篇口径一致）：爆点要**偏离正中**；
 *     要避开"完美蛛网"（近爆点是粉屑、边缘是整块）；裂纹**不是直尺线**而是会"顿"；
 *     以及最关键的一条 —— 断面**一侧暗、一侧亮**（Dark Edge）。
 * ============================================================================= */
import { createActivityGate, prefersReducedMotion, shouldAnimate, startLoop } from './rl-core';

/* ★ 包在 IIFE 里 —— 顶层不许 `return`（ES 模块），而本台要一串不满足条件就退出。
   站上其余带降级链的装置（星座 / 准星 / 显影板）都是这个写法。 */
(() => {
  /* ---------- 只装在该装的地方 ---------- */
  const cv = document.querySelector<HTMLCanvasElement>('canvas[data-fracture]');
  if (!cv) return;
  if (!matchMedia('(hover: hover)').matches) return;
  if (!shouldAnimate(prefersReducedMotion())) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  /* ---------- 取色：颜色只许住在 tokens.css ---------- */
  const CS = getComputedStyle(document.documentElement);
  const INK = CS.getPropertyValue('--ink').trim() || '#1a1a1a';
  const PAPER = CS.getPropertyValue('--paper').trim() || '#fafaf7';
  /* 四道裂痕色都在 tokens.css 里（那里写着"为什么是中性灰而不是绿"）。
     脚本侧**只留两个字面兜底**（--ink 与 --paper），alpha 靠拼后缀派生。 */
  const LINE = CS.getPropertyValue('--deco-fracture-line').trim() || INK + '38'; // --ink @ 22%
  const BAND = CS.getPropertyValue('--deco-fracture-band').trim() || INK + '14'; // --ink @ 8%
  const LIGHT = CS.getPropertyValue('--deco-fracture-light').trim() || PAPER + '99'; // --paper @ 60%
  const GHOST = CS.getPropertyValue('--deco-fracture-ghost').trim() || INK + '0d'; // --ink @ 5%
  /* ★★ 未揭示的那层**必须离屏一次合成**（见 `paintGhost`），不能逐段直接描边。
     理由不是性能，是**正确性**：爆点附近有 40 多条放射线共用起点，逐段描边的话
     同一个像素会被叠几十次 ⇒ α 累积成一片**肉眼可见的灰团**。
     实测（`_probe/_404-lab.mjs` 第二版首跑）：token 写的是 5%（α 13），而画面上峰值
     **α 99**，合成到纸白是"比纸白暗 87 级"—— 那就完全不是"极淡的底"了。
     离屏 = 先在**不透明**层上把所有线画成实心，再**整层**用这个 alpha 贴回来
     ⇒ 任何重叠都只算一次，浓度由 token 说了算。 */
  const GHOST_A = (() => {
    const m = /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})$/.exec(GHOST);
    return m ? parseInt(m[1], 16) / 255 : 0.05;
  })();

  /* ---------- 参量 ---------- */
  const SEED = 20261007; // ★ 形状种子：写死 ⇒ 同一个长宽下网络逐点相同
  const SEG = 16; // 段长（px）。它同时是**几何分辨率**与**顿挫的"一格"**
  const DWELL = 76; // 每跳一格的基准停顿（ms）—— ★ "顿挫"就是它，见 advance()
  const D = Math.PI / 180; // 度 → 弧度的换算（下面所有角度常量都用度写，好读）
  /* 近直线 + 稀疏折点（见文件头"形貌"段，为什么不是连续微弯） */
  const DRIFT = 0.008; // 每段的连续漂移（rad）⇒ 曲率半径 ≈ 4000px，肉眼是直线
  const KINK_DEG = 2.4; // 一次折点的最大转角（度）
  const KINK_P = 0.2; // 每段发生折点的概率 —— 其余段是**数学直线**
  const REVEAL_R = 56; // 指针离裂纹多近算"碰到"（px）
  const PAD = 9; // 文字盒外扩（px）：**顶点**与文字的安全距离
  const RECT_LIMIT = 80; // 文字盒上限（超了只取前若干个，防病态页面拖死建网）
  const TURN_DEG = [9, 20]; // 撞上文字盒的试探角（度），**只试这两个，再不行就跳/停**
  /* ★★ 撞上文字盒却连小角度偏转都不行时，**跨过去接着走**（而不是就地停）。
     为什么：第二版是"就地停"，出图（`_probe/_404/fig-net.png`）一看，文字背后是
     一大片**死区** —— 裂纹在字的上沿齐刷刷停住，下半页几乎空白。
     真实情形是"裂纹在挡住它的那块东西背后继续，露出来的是断了一截"。
     ⇒ 沿原方向跳过障碍（最多 `JUMP_MAX`），**断成两段**（绝不压在字上），
       每条放射线最多跳 `JUMP_BUDGET` 次（免得变成"隔着字也要连成一条直线"）。 */
  const JUMP_MAX = 200; // 一次最多跳多远（px）
  const JUMP_BUDGET = 2; // 每条放射线最多跳几次
  /* 爆点：**故意偏一点**（见文件头"形态"段）—— 落在左上的开放区 */
  const IMPACT_X = 0.36;
  const IMPACT_Y = 0.22;
  const RAYS = 17; // 放射线根数（铺满一整周）★ 26→17：站主要"稀疏一点"（见文件头 ④）
  const BRANCH_P = 0.09; // 每段分叉的概率 ★ 0.14→0.09（分叉少了，中景才不显毛）
  const BRANCH_AT = 0.3; // 走到剩余这么长之后才开始允许分叉（免得根部炸毛）
  const BRANCH_DEG = [11, 26]; // 分叉角范围（度）★ 小角度 = 细 Y 型，不是树枝
  const BRANCH_DECAY = [0.5, 0.8]; // 支线长度 / 母枝剩余
  const BRANCH_DEPTH = 2; // 允许的分叉层数（真玻璃越往外越分叉）
  const BRANCH_W = 0.9; // 支线的墨重（比主干细一点）
  const CRUSH_R = 30; // 粉碎区半径（爆点近旁那一小片"碎成末"的地方）
  const CRUSH_N = 20; // 粉碎区的短裂根数 ★ 30→20（爆点那坨是"密"的最大来源）
  const CRUSH_W = 0.5;
  const MIST_R = 150; // 雾化区外径（细碎短裂铺到这儿为止）
  const MIST_N = 26; // 雾化区的短裂根数 ★ 44→26
  const MIST_W = 0.4;
  const RING_R0 = 18; // 最内一圈环的半径
  const RING_Q = 1.34; // ★ 环半径的**公比** ⇒ 越往外格子越大（碎片外大内小）
  // ★ 1.27→1.34：环从 17 圈降到 14 圈。这是"稀疏"里最不显眼但最有效的一刀 ——
  //   环铺满整页，减掉 3 圈等于把横贯画面的长线少了近五分之一，而放射线的骨架不动。
  const RING_BOW = 1.8; // 弦的"弓"（px）：近直线，不是尺子线
  const MIN_CHORD = 12; // 短于这个弦长的环不画（爆点那一圈交给粉碎/雾化区）
  const RING_R_JIT = 0.06; // ★ 每段弦自己的半径抖动 ⇒ 环**不是同一圈正圆**（见 ring）
  const RING_SKIP = 0.1; // ★ 每段弦不画的概率 ⇒ 环是断的，不绕满一圈
  const RING_W = 0.6; // 环的墨重
  /* 光照方向（单位向量）：全页**只有一支光**，所有裂纹的亮/暗边朝向一致。
     朝向乱飞就是"贴图"，不是"同一块玻璃"。 */
  const LX = -0.72;
  const LY = -0.69;
  const OFF_LINE = 0.95; // 暗缝朝**背光**侧偏多少 px
  const OFF_LIGHT = 0.9; // 亮芯朝**迎光**侧偏多少 px

  /* ---------- 类型 ---------- */
  interface Rect {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }
  /** 一条**预置**裂纹（一段折线）。揭示状态就两个游标：`[i, j)` 是已显现的**段**区间。
   *  ★ 为什么用"段游标"而不是"弧长浮点"：顿挫的粒度本来就是**一格一段** ——
   *    用整数段，跳跃边界天然对齐顶点，不会出现"显现到半段"的中间态。
   *  ★ 未揭示 = `i === segs && j === 0`（区间为空），不是加一个 `hit` 布尔：
   *    少一个状态就少一处能对不上的地方（判据 `i < j` 一个式子收口）。 */
  interface Crack {
    pts: number[]; // 平坦顶点数组 [x,y,x,y,…]
    segs: number; // 段数 = pts.length/2 - 1
    w: number; // 墨重（1 = 主干放射线；环 / 雾 / 粉碎各自更轻）
    bx0: number; // bbox（revealAt 的粗筛 + draw 的视口裁剪都靠它）
    by0: number;
    bx1: number;
    by1: number;
    i: number; // 已显现区间的左端（段索引，含）；未揭示时 = segs
    j: number; // 右端（不含）；未揭示时 = 0
    acc: number; // 顿挫计时器（ms）
    dwell: number; // **这一跳**的停顿 —— 每跳完一次重算，见 advance()
    rnd: () => number; // 这条裂纹自己的 PRNG（决定它跳动的"不匀"）
  }

  /** 确定性 PRNG（mulberry32）。★ 同一个 seed ⇒ 同一张网络、同一次跳动序列。 */
  function mulberry32(a: number): () => number {
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 尺寸：**文档**坐标系（见文件头分野 ③） ---------- */
  let W = 0;
  let H = 0;
  /* 未揭示那层的离屏画布（与主画布同像素尺寸；见 GHOST_A 的注释） */
  let off: HTMLCanvasElement | null = null;
  let octx: CanvasRenderingContext2D | null = null;
  function fit() {
    const w = document.documentElement.clientWidth;
    /* ⚠ 高度必须取**文档高**并且**写回 canvas.style.height**：
       绝对定位元素的 `height:100%` 只解析到**视口**高（包含块是初始包含块），
       文档比视口长时下半页就没有画布了 —— 表现为"滚下去裂纹全没了"。 */
    const h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    cv.width = pw;
    cv.height = ph;
    W = w;
    H = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!off) {
      off = document.createElement('canvas');
      octx = off.getContext('2d');
    }
    /* ★ 设置 width/height 会清空离屏画布，所以 `paintGhost()` 必须在**这之后**跑 */
    off.width = pw;
    off.height = ph;
    if (octx) octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- 「绕开文字」：把正文的文字盒量出来 ----------
     ★ 用 Range 逐**文本节点**取框，而不是取元素框：
       元素框会把整段版心都算进去（`.prose` 有一行字也算整块），那样"绕开"会变成
       "半个页面都不许裂"；而 Range 的 `getClientRects()` 给的是**逐行**的紧盒。
     ★ 一律用**文档**坐标（clientRect + scrollX/Y）—— 与裂纹同一坐标系。 */
  function textRects(): Rect[] {
    const out: Rect[] = [];
    const sx = window.scrollX;
    const sy = window.scrollY;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if (!(n.nodeValue || '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const boxes = range.getClientRects();
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.width < 2 || b.height < 2) continue;
        out.push({ x0: b.left + sx, y0: b.top + sy, x1: b.right + sx, y1: b.bottom + sy });
        if (out.length >= RECT_LIMIT) return out;
      }
    }
    return out;
  }

  let rects: Rect[] = [];
  const blocked = (x: number, y: number): boolean => {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x > r.x0 - PAD && x < r.x1 + PAD && y > r.y0 - PAD && y < r.y1 + PAD) return true;
    }
    return false;
  };
  /** 出画布（留 20px 余量）：射线与弦都不必走到页外去，早停既省段数也让 bbox 干净。 */
  const outside = (x: number, y: number): boolean => x < -20 || y < -20 || x > W + 20 || y > H + 20;

  /* ★★ 只测**落点**是不够的：两端都在文字盒外的一段直线，仍可能从盒角**切过去**
     （凸区域也有这个性质：盒外左下与盒外右上的两点，连线会穿过盒子的角）。
     ⇒ 沿段再取 3 个内点（1/4、1/2、3/4）。SEG=16px ⇒ 采样间隔 4px，
       小于最小文字盒宽度（实测 ≥ 2px）⇒ 穿不过去。
     ★ PAD 管的是**顶点**：可见墨迹还要加上描边半宽（暗带 3.6px 圆头
       ⇒ 朝盒方向多出 1.8px）⇒ **可见间隙 ≈ PAD − 1.8 ≈ 7.2px**，不是 9px。
       验收时别拿"外扩 9px 那条带里必须 0 墨"当判据 —— 顶点贴在边界上时暗带必然跨线，
       那条判据**从构造上永远不成立**。要量的是"墨离字形盒最近多少 px"。 */
  const segBlocked = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (blocked(x1, y1)) return true;
    for (const f of [0.25, 0.5, 0.75]) {
      if (blocked(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return true;
    }
    return false;
  };

  /* ---------- 随机数：建网期间共享一个（保证"调用顺序 ⇒ 形状"是确定的） ---------- */
  let seed = SEED;
  let rnd: () => number = mulberry32(SEED);

  /* ---------- 建网（只做一次；resize 时整个重来） ---------- */
  const cracks: Crack[] = [];
  /** 爆点（文档坐标）。★ `crossAt` 要靠它算"离爆点的距离"，所以是模块级的。 */
  let CX = 0;
  let CY = 0;
  /** **放射线**的折线（只有放射线与它的分叉记在这里）。
   *  环要落在放射线上 ⇒ 必须能反查"每条放射线在半径 r 处落在哪个点"。
   *  ⚠ 粉碎区/雾化区的短裂**不记**：它们不是放射线，环不该止在它们身上。 */
  const radials: number[][] = [];

  function pushCrack(pts: number[], w: number) {
    const segs = pts.length / 2 - 1;
    if (segs < 1) return; // 一个顶点或更少 = 画不出东西
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (let k = 0; k < pts.length; k += 2) {
      const px = pts[k];
      const py = pts[k + 1];
      if (px < bx0) bx0 = px;
      if (px > bx1) bx1 = px;
      if (py < by0) by0 = py;
      if (py > by1) by1 = py;
    }
    cracks.push({
      pts,
      segs,
      w,
      bx0,
      by0,
      bx1,
      by1,
      i: segs, // ★ 未揭示：i = segs、j = 0 ⇒ 区间 [segs,0) 为空
      j: 0,
      acc: 0,
      dwell: DWELL,
      rnd: mulberry32((seed = (seed * 1664525 + 1013904223) >>> 0)),
    });
  }

  /** 一条**放射裂纹**：近直线向外走。撞上文字盒先小角度偏转；偏不动就**跳过障碍
   *  接着走**（断成两段，见 `JUMP_MAX` 的注释）；额度用尽才截断。
   *  `depth` 允许的分叉层数；`rec` 决定要不要登记进 `radials`（环要靠它落点）。 */
  function ray(x0: number, y0: number, a0: number, len: number, depth: number, rec: boolean, w: number) {
    let pts: number[] = [x0, y0];
    if (rec) radials.push(pts); // ⚠ 推的是**引用** —— 后面涨的顶点它一并看得见
    let x = x0;
    let y = y0;
    let ang = a0;
    let left = len;
    let jumps = JUMP_BUDGET;
    while (left > SEG) {
      const nx = x + Math.cos(ang) * SEG;
      const ny = y + Math.sin(ang) * SEG;
      if (outside(nx, ny)) break; // 出画布：止
      if (segBlocked(x, y, nx, ny)) {
        /* 撞上了：先按"先近角后远角、两边都试"的顺序试 **TURN_DEG 这两个角** */
        let turned = false;
        for (const deg of TURN_DEG) {
          for (const s of [1, -1]) {
            const na = ang + (s * deg * Math.PI) / 180;
            const tx = x + Math.cos(na) * SEG;
            const ty = y + Math.sin(na) * SEG;
            if (!segBlocked(x, y, tx, ty)) {
              ang = na;
              turned = true;
              break;
            }
          }
          if (turned) break;
        }
        if (turned) continue; // 转向之后本段不落笔，下一轮用新角度走
        /* 偏不动 ⇒ 沿原方向**跳过障碍**（裂纹在它背后继续，露出来断了一截） */
        if (jumps > 0) {
          let k = 1;
          let jx = x;
          let jy = y;
          let found = false;
          while (k * SEG <= JUMP_MAX) {
            jx = x + Math.cos(ang) * k * SEG;
            jy = y + Math.sin(ang) * k * SEG;
            if (outside(jx, jy)) break;
            if (!blocked(jx, jy)) {
              found = true;
              break;
            }
            k++;
          }
          if (found) {
            if (pts.length >= 4) pushCrack(pts, w); // 断在这儿（绝不压在字上）
            jumps--;
            x = jx;
            y = jy;
            left -= k * SEG;
            pts = [x, y]; // 新的一段
            if (rec) radials.push(pts);
            continue;
          }
        }
        break; // 跳也跳不出去 ⇒ **停**（玻璃撞上自由面就是停，不贴着走）
      }
      pts.push(nx, ny);
      x = nx;
      y = ny;
      left -= SEG;
      /* ★ 近直线 + 稀疏折点（见文件头"形貌"段）：
         每一段本身是**数学直线**，只有 KINK_P 的概率会拐一下 KINK_DEG 那么多；
         另加一点连续漂移，免得整条线读成"折线段堆起来的"。 */
      ang += (rnd() < KINK_P ? (rnd() * 2 - 1) * KINK_DEG * D : 0) + (rnd() * 2 - 1) * DRIFT;
      /* 小角度分叉（细 Y 型），向外越长越容易分 */
      if (depth > 0 && left > len * BRANCH_AT && rnd() < BRANCH_P) {
        const side = rnd() < 0.5 ? -1 : 1;
        const span = BRANCH_DEG[1] - BRANCH_DEG[0];
        const ba = ang + side * ((BRANCH_DEG[0] + rnd() * span) * D);
        const dec = BRANCH_DECAY[0] + rnd() * (BRANCH_DECAY[1] - BRANCH_DECAY[0]);
        ray(x, y, ba, left * dec, depth - 1, rec, BRANCH_W);
      }
    }
    if (pts.length >= 4) pushCrack(pts, w);
  }

  /** 某条放射线在半径 `r` 处落在哪 —— 环的端点靠它落到**放射线上**（T 形交叉）。
   *  ★ 放射线都从爆点出发且近直线 ⇒ "离爆点的距离"沿折线是单调的，一趟扫过去就能
   *    找到跨过 r 的那一段，再线性插值出交点。分叉线从半路起步，同样成立（它的
   *    起点距离大，但仍是往外走）。返回 null = 这条线还没走到 r（或已经出画布）。 */
  function crossAt(rl: number[], r: number): { x: number; y: number; a: number } | null {
    let pd = Math.hypot(rl[0] - CX, rl[1] - CY);
    for (let k = 2; k < rl.length; k += 2) {
      const d = Math.hypot(rl[k] - CX, rl[k + 1] - CY);
      if (pd < r && d >= r) {
        const t = (r - pd) / Math.max(1e-6, d - pd);
        const x = rl[k - 2] + (rl[k] - rl[k - 2]) * t;
        const y = rl[k - 1] + (rl[k + 1] - rl[k - 1]) * t;
        return { x, y, a: Math.atan2(y - CY, x - CX) };
      }
      pd = d;
    }
    return null;
  }

  /** 一段**同心环的弦**：从 (x0,y0) 直着走到 (x1,y1)，中途带一点弓。
   *  ★ 两端是 `crossAt` 给的**放射线上的点** ⇒ 端点正好落在放射线上（T 形交叉，
   *    这正是"环止于放射线"的几何表述）。
   *  ★ 撞上文字盒就**断开成多段**（真玻璃的环遇到自由面也是断的，不是绕过去）。 */
  function chord(x0: number, y0: number, x1: number, y1: number) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (!(len > 0) || blocked(x0, y0) || outside(x0, y0)) return;
    const n = Math.max(1, Math.round(len / SEG));
    const bow = (rnd() * 2 - 1) * RING_BOW;
    const ux = (y1 - y0) / len; // 法向
    const uy = -(x1 - x0) / len;
    let run: number[] = [x0, y0];
    let px = x0;
    let py = y0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const s = Math.sin(Math.PI * t) * bow; // 中段鼓一点 ⇒ 不是尺子线
      const x = x0 + (x1 - x0) * t + ux * s;
      const y = y0 + (y1 - y0) * t + uy * s;
      if (blocked(x, y) || outside(x, y) || segBlocked(px, py, x, y)) {
        if (run.length >= 4) pushCrack(run, RING_W);
        run = [];
      } else {
        run.push(x, y);
      }
      px = x;
      py = y;
    }
    if (run.length >= 4) pushCrack(run, RING_W);
  }

  /** 一圈**同心环裂纹**：在半径 r 上，把**相邻两条放射线**之间连成一段弦。
   *  ★★ 这是第三版与第二版在"环"上最根本的区别：
   *    第二版是"自带顶点数的波浪圆圈，与放射线只是穿过"；
   *    第三版先把放射线建好，再**读它们在 r 处落在哪**，两两相邻连弦 ⇒
   *    "环止于放射线"这件事是**几何上成立**的，不靠画得像。
   *  ★★ 但**绝不许连成一圈规整的同心圆** —— 那是"完美蛛网"（画碎玻璃的教程里专门
   *    点名过：*The "Spiderweb" Trap … It looks like Peter Parker just swung by.*）。
   *    真玻璃的同心裂在**不同扇区落在不同半径**上，而且**不会绕满一圈**。做法两条：
   *      · 每一段弦自己取一个半径 `rr`（`RING_R_JIT`）⇒ 有起伏的环带，不是圆；
   *      · 每段弦按 `RING_SKIP` 的概率**不画** ⇒ 环是断断续续的。
   *    ★ 端点仍是"该放射线在 rr 处的点" ⇒ T 形交叉照样成立（端点仍落在放射线上）。
   *  ★ 弦长小于 MIN_CHORD 的跳过：爆点近旁那几圈，相邻放射线只隔几 px，
   *    画出来是一坨 —— 那个区域本来就该由粉碎/雾化区负责。 */
  function ring(r: number) {
    const hits: { rl: number[]; a: number }[] = [];
    for (const rl of radials) {
      const c = crossAt(rl, r);
      if (c) hits.push({ rl, a: c.a });
    }
    if (hits.length < 4) return;
    hits.sort((p, q) => p.a - q.a);
    for (let k = 0; k < hits.length; k++) {
      const A = hits[k];
      const wrapped = k + 1 >= hits.length;
      const B = wrapped ? hits[0] : hits[k + 1];
      const gap = (wrapped ? B.a + Math.PI * 2 : B.a) - A.a;
      if (gap * r < MIN_CHORD) continue;
      if (rnd() < RING_SKIP) continue; // ★ 环是断的，不许绕满一圈
      const rr = r * (1 + (rnd() - 0.5) * RING_R_JIT); // ★ 每段弦自己一个半径
      const p0 = crossAt(A.rl, rr) ?? crossAt(A.rl, r);
      const p1 = crossAt(B.rl, rr) ?? crossAt(B.rl, r);
      if (!p0 || !p1) continue;
      chord(p0.x, p0.y, p1.x, p1.y);
    }
  }

  /** 一个爆点：粉碎区 + 雾化区 + 放射线（含分叉）+ 同心环。
   *  ★ 顺序就是**物理顺序**，而且顺序本身有意义：放射线必须全部建完，环才能
   *    落在它们上面（见 `ring`）。 */
  function impact() {
    /* 爆点若正落在文字盒上，先把它挪出去（否则所有放射线一出发就被截断）。 */
    if (blocked(CX, CY)) {
      let moved = false;
      for (let k = 1; k <= 24 && !moved; k++) {
        for (const [dx, dy] of [
          [0, -k * 34],
          [0, k * 34],
          [-k * 40, 0],
          [k * 40, 0],
        ]) {
          const nx = CX + dx;
          const ny = CY + dy;
          if (outside(nx, ny)) continue;
          if (!blocked(nx, ny)) {
            CX = nx;
            CY = ny;
            moved = true;
            break;
          }
        }
      }
    }
    /* ① 粉碎区：爆点近旁一小片"碎成末"的短裂（真玻璃这里最黑） */
    /* ★ `rMax` = 爆点到**最远那个画幅角**的距离：整页就是这块玻璃的框，
       放射线走到框边、环也一直长到框边（见下方 ③④）。 */
    const rMax = Math.hypot(Math.max(CX, W - CX), Math.max(CY, H - CY));
    for (let k = 0; k < CRUSH_N; k++) {
      const a = rnd() * Math.PI * 2;
      const r0 = rnd() * CRUSH_R * 0.45;
      ray(
        CX + Math.cos(a) * r0,
        CY + Math.sin(a) * r0,
        a + (rnd() - 0.5) * 0.5,
        CRUSH_R * (0.5 + rnd() * 1.1),
        0,
        false,
        CRUSH_W,
      );
    }
    /* ② 雾化区：往外一圈细碎的短裂（不是从爆点出发，是**散布**在那圈里） */
    for (let k = 0; k < MIST_N; k++) {
      const a = rnd() * Math.PI * 2;
      const r0 = CRUSH_R + rnd() * (MIST_R - CRUSH_R);
      const x = CX + Math.cos(a) * r0;
      const y = CY + Math.sin(a) * r0;
      if (blocked(x, y) || outside(x, y)) continue;
      ray(x, y, a + (rnd() - 0.5) * 0.9, 26 + rnd() * 44, 0, false, MIST_W);
    }
    /* ③ 放射线：角度均匀铺满一周 + 抖动（免得出现机械的"米字"）。
       ★ 长度取"到最远那个画幅角"的 0.4~1.2 倍 —— 有的走到框边、有的半路就死，
         真玻璃的放射线长短差得很远。 */
    const span = (Math.PI * 2) / RAYS;
    const a0 = rnd() * Math.PI * 2;
    for (let k = 0; k < RAYS; k++) {
      const a = a0 + k * span + (rnd() - 0.5) * span * 0.75;
      ray(CX, CY, a, rMax * (0.4 + rnd() * 0.8), BRANCH_DEPTH, true, 1);
    }
    /* ④ 同心环：等比数列往外长（近密远疏 ⇒ 碎片外大内小）。
       ★ 一直长到**画幅最远的那个角**为止 ⇒ 整页就是这块玻璃的框，
         裂纹在框边被切断（这正是"从框里看一块碎玻璃"的样子）。 */
    for (let r = RING_R0; r <= rMax; r *= RING_Q) ring(r);
  }

  /** 把**整张网**实心画到离屏画布上 —— 这是"未揭示的底"。
   *  ★ 一次合成，而不是每帧逐段描边：见 `GHOST_A` 的注释（密集处会叠成灰团）。
   *  ★ 只在建网后画一次；它不随揭示变化，之后每帧只 blit。 */
  function paintGhost() {
    if (!octx) return;
    octx.clearRect(0, 0, W, H);
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    octx.beginPath();
    for (const c of cracks) {
      octx.moveTo(c.pts[0], c.pts[1]);
      for (let k = 2; k < c.pts.length; k += 2) octx.lineTo(c.pts[k], c.pts[k + 1]);
    }
    /* 实心 --ink：**透明度交给整层 blit 时的 globalAlpha**（= GHOST token 的 alpha） */
    octx.strokeStyle = INK;
    octx.lineWidth = 1;
    octx.stroke();
  }

  function build() {
    cracks.length = 0;
    radials.length = 0;
    seed = SEED;
    rnd = mulberry32(SEED);
    /* 文字盒在**建网前**取一次 —— 网是预置的，绕开只在这一刻发生（见分野 ②） */
    rects = textRects();
    CX = W * IMPACT_X;
    CY = H * IMPACT_Y;
    impact();
    paintGhost(); // ★ 网定稿 ⇒ 把"底"也重画到离屏（fit 清空过它）
  }

  /* ---------- 揭示：指针碰到哪一段，就从那儿启动 ---------- */

  /** 点到线段距离（revealAt 的精筛）。 */
  function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const vx = bx - ax;
    const vy = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? (wx * vx + wy * vy) / l2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const dx = wx - vx * t;
    const dy = wy - vy * t;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function revealAt(x: number, y: number) {
    for (const c of cracks) {
      /* 已经在揭示了 ⇒ 不重开（★ 一条裂纹**同时只有一个前沿**：
         有前沿还允许重开的话，指针划过时会沿途多处同时起头，
         观感就从"这条裂被你唤醒了、自己沿路展开"退化成"跟着指针亮" ——
         那正是站主要摆脱的东西）。 */
      if (c.i < c.j) continue;
      /* 粗筛：bbox 外扩 REVEAL_R 都没碰到就不必算段距离 */
      if (x < c.bx0 - REVEAL_R || x > c.bx1 + REVEAL_R) continue;
      if (y < c.by0 - REVEAL_R || y > c.by1 + REVEAL_R) continue;
      let bestD = REVEAL_R;
      let bestI = -1;
      for (let k = 0; k < c.segs; k++) {
        const d = distSeg(x, y, c.pts[k * 2], c.pts[k * 2 + 1], c.pts[k * 2 + 2], c.pts[k * 2 + 3]);
        if (d < bestD) {
          bestD = d;
          bestI = k;
        }
      }
      if (bestI < 0) continue;
      /* 起头：指针碰到的那一段**立刻**亮（这是"碰到了"的反馈），
         之后每一跳都带停顿（见 advance）。 */
      c.i = bestI;
      c.j = bestI + 1;
      c.acc = 0;
      c.dwell = DWELL * (0.55 + c.rnd() * 1.1);
    }
  }

  /* ---------- 顿挫推进 ----------
     ★★ 站主要的那四个字「顿挫的显现」全在这个函数里：
       不是"速度 × dt 的匀速生长"，而是**攒够一次停顿就跳一格**：
         acc 攒满 dwell ⇒ 左游标 -1、右游标 +1 ⇒ 重算下一跳的 dwell
       `dwell` 每次都在 DWELL 的 0.55~1.65 倍之间重取 ⇒ 跳与跳之间的间隔**不匀**，
       这就是"啪、啪、啪"而不是"哒哒哒哒"的来源。
       ★ 它仍然是吃 dt 的（帧率无关）：acc 累加的是真实 dt，不是每帧固定一格。 */
  function advance(dtMs: number) {
    for (const c of cracks) {
      if (c.i >= c.j) continue; // 未被碰过（或区间为空）⇒ 不推进
      if (c.i === 0 && c.j === c.segs) continue; // 已经走完 ⇒ 停在那（永久）
      c.acc += dtMs;
      while (c.acc >= c.dwell) {
        c.acc -= c.dwell;
        let moved = false;
        if (c.i > 0) {
          c.i--;
          moved = true;
        }
        if (c.j < c.segs) {
          c.j++;
          moved = true;
        }
        if (!moved) break;
        c.dwell = DWELL * (0.55 + c.rnd() * 1.1);
      }
    }
  }

  /* ---------- 绘制 ---------- */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* 视口裁剪：画布是整个**文档**高，滚到页脚时首屏那些段不必每帧重画。
       上下各留 240px 余量（滚动是连续的，切太紧会在边缘闪）。 */
    const sy = window.scrollY || 0;
    const vh = window.innerHeight || H;
    const y0 = sy - 240;
    const y1 = sy + vh + 240;

    /* ① 未揭示的**底**：整层 blit（离屏已画好，见 paintGhost）。
       ★ 这里刻意**不是**逐段重画：那会在射线密集处叠几十次、把 5% 叠成肉眼可见的灰团
         （实测峰值 α99 vs token 的 α13）。一次合成 ⇒ 浓度完全由 token 说了算。 */
    if (off) {
      ctx.globalAlpha = GHOST_A;
      ctx.drawImage(off, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    /* ② 已揭示的部分：**有厚度的裂口**（见文件头"玻璃质感"段）。
       三层叠着画，顺序有讲究：
         ⓐ 暗带（宽而淡）—— 裂口的"厚"，垫在最下面；
         ⓑ 暗缝（细而浓）—— 偏向**背光**侧；
         ⓒ 亮芯（--paper 压 alpha）—— 偏向**迎光**侧，画在最后
            （它要压在暗带上才看得见：纸色压在 8% 的墨上 = 一道亮边）。
       ★ 三条各自平移同一个屏幕空间向量（`LX/LY`）：全页只有一支光，
         所有裂纹的亮/暗边朝向一致 ⇒ 读起来是"一块玻璃"，不是"一堆贴图"。 */
    for (const c of cracks) {
      if (c.i >= c.j) continue;
      if (c.by1 < y0 || c.by0 > y1) continue;
      ctx.beginPath();
      ctx.moveTo(c.pts[c.i * 2], c.pts[c.i * 2 + 1]);
      for (let k = c.i + 1; k <= c.j; k++) ctx.lineTo(c.pts[k * 2], c.pts[k * 2 + 1]);
      const w = c.w;
      ctx.save();
      ctx.globalAlpha = w; // 细碎的（环/雾/粉碎）更轻：墨重分档，不是一刀切
      ctx.lineWidth = 2.2 + 1.4 * w;
      ctx.strokeStyle = BAND;
      ctx.stroke();
      ctx.translate(-LX * OFF_LINE, -LY * OFF_LINE); // 背光侧
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 0.7 + 0.25 * w;
      ctx.stroke();
      ctx.translate(LX * (OFF_LINE + OFF_LIGHT), LY * (OFF_LINE + OFF_LIGHT)); // 迎光侧
      ctx.strokeStyle = LIGHT;
      ctx.lineWidth = 0.8 + 0.35 * w;
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- 输入：指针划过 = 揭示 ---------- */
  window.addEventListener(
    'pointermove',
    (e) => {
      /* ★ 文档坐标（与裂纹同一坐标系，见分野 ③） */
      revealAt(e.clientX + window.scrollX, e.clientY + window.scrollY);
    },
    { passive: true },
  );

  /* ---------- 起停 ---------- */
  fit();
  build();
  draw(); // ★ 同步首帧（无头下 rAF 不推进，有它才量得到）
  cv.classList.add('is-ready');

  const gate = createActivityGate(cv);
  startLoop((dt) => {
    if (!gate.onScreen || !gate.visible) return; // 出屏 / 切标签：不推进也不画
    advance(dt);
    draw();
  });

  let rz = 0;
  window.addEventListener(
    'resize',
    () => {
      const t = Date.now();
      if (t - rz < 200) return;
      rz = t;
      /* ★ 尺寸与文字盒都变了 ⇒ **整张网重建**（分野 ② 的那个代价：
         已揭示的状态会丢）。取这个取舍是因为 resize 低频，
         而"网与文字盒错位"是每时每刻都看得见的错。 */
      fit();
      build();
      draw();
    },
    { passive: true },
  );
})();

