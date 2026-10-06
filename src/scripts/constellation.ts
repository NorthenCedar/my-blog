/* =============================================================================
 * 友链页 · 星座（CONSTELLATION）—— 靠近的点连出细线，停留越久连得越多
 *
 * 机制（与其余五台装置**都不同**，这是口径 #5「每页一台机制不同的装置」的第七次兑现）：
 *   显影板  Canvas 像素场 / 指针   / 一阶指数平滑 / 常驻
 *   索引卷尺 DOM transform / 滚动   / 二阶弹簧（过冲） / 常驻
 *   参考板  静态 <img>   / 无      / —            / 常驻
 *   阅读尺  DOM transform / 滚动+点击 / 确定映射   / 停手 900ms 收回
 *   浮游    Canvas 2D   / 时间（无输入）/ 解析函数 f(t) / 永续
 *   走时仪  零 JS SVG+CSS / 时间   / CSS keyframes  / 永续
 *   ★ 星座  Canvas 2D   / **指针**（但吃的是"位置差"不是"速度"）/ **累积计时** / 常驻
 *
 *★ 与显影板（也吃指针）的分野在那里：显影板吃的是**指针走过的路径**（擦痕留板上），
 *   它是"涂抹"；本页吃的是**指针此刻离谁近**，画的是"此刻的邻接关系"，不留下历史痕迹。
 *   ⇒ 所以"停留越久连得越多"是本台的**核心**：
 *   每条线有一个 0→1 的进度，**只在指针附近推进**、离开后**不回落**（不回落的理由见下）。
 *
 * ★★ 「离开后不回落」是站主口径的直接推论，不是偷懒：
 *   站主要的是"停留越久连得越多"—— 若离开会回落，"越久"就不成立
 *   （离开瞬间清零 = 每条线都得重新等一遍，等于没有累积）。
 *   ⇒ 线的进度是**只增不减**的，画面会随浏览逐渐长成一张完整的星图。
 *   为此设了两条护栏（见 LIMIT / MAX_EDGES），否则长时间停留会连成蜘蛛网：
 *     · LIMIT —— 一次"连上"最多推进到0.62，一条线永远连不到满格
 *       （满格只在"双点同时在指针邻域内"时才可能，见下）
 *     · MAX_EDGES —— 总线数封顶，超出后**最旧的退休**（换新线进来，位置复用）
 *
 * ★★ 「零随机」硬规矩（`tests/develop-bath.test.ts:38` 的理由）：
 *   星的**位置**一律用整数哈希 `hash01(i)`，不是随机源 ⇒ 两次加载同一屏必得同一张图，
 *   这是"能验收"的前提。`index-tape` / `time-slice` / `float` 也各自断言「不含 Math.random」。
 *   ⚠ 但**线的进度是状态**（吃 dt 累积），不能由t 单独求值——
 *     这与浮游"FLOAT 不存状态"是相反的取舍，理由是站主要的就是"累积"这个时间维度。
 *     后果是：这一台**不能**像 FLOAT 那样在 reduced-motion 下"冻结在某个 t"
 *     （没有 t 能还原累积状态）⇒ RM 档改为**画一张静态的星图**（见下）。
 *
 * ★★ 星点分两层（站主 2026-10-05 拍板）：**卡片节点 + 背景散点**。
 *   卡片节点 = 每张友链卡（`a.card`），是语义上的"站"；散点由哈希铺满全屏，是"天光"。
 *   只有 5 张卡时星图像只有 5 颗星，空；只有散点时语义丢了。两层叠加才有"标出了星座"那口气。
 *
 * ★★★ 本轮两条**只能靠实测发现**的坑（别按 CSS 公式推）：
 *   ① **卡片间距必须量渲染结果，不能按 `minmax(260px,1fr)` 推算。**
 *      我推算出"列宽 424px"，实测截图是 **211px**（差2 倍）⇒ 据此设的半径全部作废。
 *      真实中心距见下面 R_LINK_NODE 上方的实测表。
 *   ② **节点星不能画在 canvas 上。** canvas 在 `z-index:-1`，
 *      而 `.card` 有**不透明底色** `--panel` 且在 `z-index:1` 的层叠上下文里
 *      ⇒ 画在 canvas 上的节点被卡片整个盖住（截图表现为"卡片区一颗星都没有"）。
 *      分工：canvas 只画连线与散点，节点星由 `.card::before` 画，
 *      亮度靠脚本回写 CSS 变量 `--node-lit`（见 syncNodeLit）。
 *
 * ★ 本机无头验收的一条硬事实：**`--virtual-time-budget` 下 rAF 与 setInterval 都不推进**，
 *   注入的探针也可能在截图之后才执行 ⇒ 靠它量"累积了多少"量不出来（本轮试过三种都失败）。
 *   可行的替代：`--force-prefers-reduced-motion` 走 RM 档（不跑 rAF、一次画完），截静态图目检。
 *   ⇒ **累积量只能靠契约与逻辑推演保证，不能靠本机截图。**
 *
 * ★ 降级四态（照抄 develop.ts / index-tape.ts / float.ts 的约定）：
 *   ① reduced-motion ⇒ **不跑 rAF，画一张静态的**：所有已"点亮"的星点画成亮星、
 *      连线按 MAX_STATIC_EDGES 画满若干条。装置仍在（纸上有一张星图），只是不再生长。
 *   ② 无 JS ⇒ canvas 空着（透明），只剩墨笔 ∞ 底纹；正文服务端渲染完整。
 *   ③ 移动端 ≤767px ⇒ 星点数 ×0.55、连线半径 ×0.8、DPR 上限 2 → 1.5。
 *      **不是**"不渲染"：指针装置在触屏上够不着，但那两点仍成立 ——
 *      静态星图本身是氛围（与浮游同口径），所以要的是"更轻"而不是"没有"。
 *   ④ 视口外 / 切标签 ⇒ 停帧（rl-core 的 activityGate）。同浮游那条注释：
 *      canvas 是 fixed inset:0 ⇒ IntersectionObserver 恒判在屏，真正能停的是 visibilitychange；
 *      保留 gate 是为了让"切标签必停"与其余装置走同一条代码路径。
 *
 * ★ 颜色只从 token 读，alpha 以**8 位 hex** 读出后交给 canvas（站上约定，不写 rgba()）。
 * ==========================================================================*/
import { createActivityGate, prefersReducedMotion, shouldAnimate, startLoop } from './rl-core';

(() => {
  const cv = document.querySelector<HTMLCanvasElement>('[data-const-bg]');
  if (!cv) return;
  const ctx0 = cv.getContext('2d');
  if (!ctx0) return;

  const narrow = matchMedia('(max-width: 767px)');
  const reduce = prefersReducedMotion();
  const animate = shouldAnimate(reduce);

  /* ---------- 颜色（只从 token 读） ---------- */
  const CS = getComputedStyle(document.documentElement);
  const ACCENT = CS.getPropertyValue('--accent').trim() || '#2d7d46';
  const ACCENT_INK = CS.getPropertyValue('--accent-ink').trim() || '#266b3b';
  /** 给 6 位 hex 挂 alpha ⇒ 8 位 hex（tokens 的同一约定）。 */
  const A = (hex: string, a: number) => {
    const h = hex.replace('#', '').slice(0, 6);
    const v = Math.round(Math.max(0, Math.min(1, a)) * 255);
    return '#' + h + v.toString(16).padStart(2, '0');
  };

  /* ---------- 确定性哈希（替代 Math.random；同一个 i 永远同一个值） ---------- */
  function hash01(i: number): number {
    let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  /** 第 i 颗星的第 k 个属性（k 固定 ⇒ 属性跨帧稳定）。 */
  const SH = (i: number, k: number) => hash01(i * 32 + k);

  /* ---------- 母题常数 ---------- */
  const AREA = 26000; // 每26000 px² 一颗**背景散点**（与浮游"每 12500 px² 一根雨线"同一量级但更疏）
  const STAR_MAX = 90; // 散点上限：屏幕再大也不至于糊成一片
  const R_NEAR = 132; // 散点邻域半径：进入即开始推进
  const R_LINK = 176; // 散点成边距离上限：超过就不连（不是所有近邻都成边）
  /* ★ 节点的两个半径都按**实测**定，不能沿用散点的值（1500px 视口下量 `_probe/shots`）：
     本页 5 张卡的实测中心距（px）：
        本站↔GitHub 266   GitHub↔RSS 307   RSS↔留言板 307     ← 近邻三对
        本站↔RSS    396   GitHub↔留言板 614  本站↔留言板 657   ← 隔了别的卡
     若沿用散点的 R_LINK=176：**任何两张卡都连不上**（最近的 266 也超），
     实测表现为指针在卡片上停留 51 次、--node-lit 全为 0、一根线都没有。
     ⇒ R_LINK_NODE 取 360：够到全部三对近邻(266/307/307)，
       又够不到隔卡的 614/657 ⇒ 读起来是"邻座相连"，不是"全连接成一团"。*/
  /* ★ 邻域半径必须 **大于最近邻距（266px）**，否则站在一张卡上时邻座根本进不来 ——
     pick 里只有一个节点 ⇒ `pick.length < 2` 直接 return ⇒ 一根线都出不来。
     取 320：覆盖 266/307/307 三对近邻，留 13px 余量；到 396 之外还有富余。*/
  const R_NEAR_NODE = 320; // 节点邻域：指针停在这张卡上时，邻座卡片也进得来
  const R_LINK_NODE = 360; // ★ 节点成边上限（见上：近邻全连、隔卡不连）
  /* ★★ 2026-10-06 站主**两轮**要「星链出来快一点」（§6.36 → §6.38）：
     第一轮 1/1.15 → 1/0.5（按"单条线速度"直觉调的）；第二轮 1/0.5 → 1/0.12。
     一条线从 0 走到单次上限（LIMIT + BOTH_BONUS = 0.84）：
       约 0.97s  →  约 0.42s  →  **约 0.10s**
     ⇒ 三轮分别是 1.0s 级 / 0.4s 级 / 0.1s 级。

     ★★★ 第二轮是**先量后改**，量出来的东西与直觉不符，记下来免得后人再猜：
     探针 `_probe/_const-timing.mjs` 劫持 `requestAnimationFrame` + `performance.now`
     （本机 CDP 被拦、`--virtual-time-budget` 下 rAF 不推进 ⇒ 常规两条路都量不到"出现"），
     把帧循环变成"按 60fps 手动步进"，逐帧读指针邻域的**最大连通块面积**
     （线是细长条、散点是小圆 ⇒ 一刀切开），得到"线在屏幕上成形"的曲线：
       改前（SPEED 2.0）：线可辨 **67ms**（第 4 帧）→ 到顶 **433ms**（第 26 帧）
     ⇒ ★ 症结**不是**"线有没有出现"（4 帧就看得见），而是**浓度要 0.42s 才爬满**：
       面积 91px → 375px 的增长全在这 0.37s 里发生，人眼读到的就是"慢慢长出来"。
       这正是站主说的"慢" —— 只加 SPEED 不动曲线是**对症**的，因为它就是这个时间常数。
     改后（SPEED 8.33）：可辨 **16.7ms**（第 1 帧，面积 91px）→ 到顶 **100ms**（第 6 帧，面积 375px）。
     ⇒ 出现 ×4、到顶 ×4.3（两档的"到顶面积"同为 375px，可直接比 —— 见下 ↓）。

     ⚠ 为什么不再快：到位若压进 2 帧（SPEED > 16），观感从"出现"退化成"闪一下"，
       且"擦过 vs 停留"一起塌掉（两帧就满格 ⇒ 停留没有意义）。0.12s 是这条线的下限。
     ★ 仍然**只动这一个常量**：上限机制（LIMIT / BOTH_BONUS / MAX_EDGES）一个没动 ——
       变快的是"到位"的速度，不是"一次能连多少" ⇒ 「停留越久连得越多」的口径不受影响，
       护栏也还在（否则长时间停留仍会连成蜘蛛网）。
     ⚠ 本轮起它**有了门闩**（不再是"只断言 SPEED 存在"）：`tests/links-constellation.test.ts`
       第 ② 条断言「到位时间 = (LIMIT + BOTH_BONUS) / SPEED」落在 50ms ~ 200ms 的窗口里 ——
       慢回去会被咬，快到"闪"也会被咬。锁的是**性质**（到位耗时），不是这个 0.12 本身，
       所以以后微调数值（如 0.12 → 0.14）不会红。 */
  const SPEED = 1 / 0.12; // 单条线推进速度（进度/秒）⇒ 约 0.12s 走满一程
  const LIMIT = 0.62; // ★ 一次"连上"最多推进到 0.62 —— 见头部注记
  const BOTH_BONUS = 0.22; // 两颗星同时在邻域内时的额外推进（唯一能突破 LIMIT 的口子）
  const MAX_EDGES = 15; // ★ 总线数封顶（站主拍板：15）；超出后最旧的退休
  const MAX_STATIC_EDGES = 6; // reduced-motion 档画几条静态连线
  const TWINKLE = 1.6; // 呼吸周期（秒）：星点亮度随 t 微微起伏
  const DOT_R = 1.5; // 散点半径（px）
  const DOT_R_HALO = 3.4; // 亮星（散点里的 1/5）的光晕半径
  /* ★ 卡片节点**不在 canvas 上画**（会被卡片不透明底遮住），它由 `.card::before` 画，
     尺寸写在那条 CSS 里。所以这里没有 NODE_R / NODE_R_HALO —— 别加回来。*/

  /**
   * ★ 星点分两层（站主 2026-10-05 拍板：「卡片节点 + 背景散点」）：
   *   · **卡片节点**（`node:1`）—— 每张友链卡片对应一颗，画在卡片中心。
   *     它们是**语义节点**：这张页在讲"站与站的连接"，卡片就是那些"站"。
   *   · **背景散点**（`node:0`）—— 位置由整数哈希决定，铺满全屏，是"天光"。
   *
   * 为什么必须两层：只有 5 个卡片节点时，星图像一张只有 5 颗星的图，空。
   *   只有散点时，语义丢了（不知道哪些星是"站"）。两层叠加才有"星图里标出了星座"那口气。
   *   视觉层级靠**半径**分（NODE_R 3.0 vs DOT_R 1.5·0.46），不靠颜色 —— 全站只有一族绿。
   */
  interface Star {
    /** 归一化坐标（0..1），与视口尺寸无关 ⇒ resize 后位置不变 */
    u: number;
    v: number;
    /** 亮度相位（0..1），跨帧稳定 */
    ph: number;
    /** 基础半径倍率：卡片节点（大）vs 散点（小） */
    k: number;
    /** 当前亮度 0..1（由进度驱动） */
    lit: number;
    /** ★ 是否卡片节点（1）还是背景散点（0） */
    node: 0 | 1;
    /** 卡片节点才有的反查句柄：拿到它自己的 DOM 矩形中心（散点为 null） */
    el: Element | null;
    /** 上一帧写进 `--node-lit` 的值：变了才写 DOM（省样式重算）。-1 = 还没写过 */
    lastLit: number;
  }
  interface Edge {
    a: number;
    b: number;
    /** 0..1，只增不减 */
    p: number;
  }

  let stars: Star[] = [];
  let edges: Edge[] = [];
  let ptr = { x: -9999, y: -9999, on: false };
  let cw = 0;
  let ch = 0;
  let ctx = ctx0;

  /**
   * ★ 卡片节点清单：在 `.cards`/`.mine` 里取每张卡的 `<a>`。
   * 只取 `<a class="card">`（含 .card-mine，它也是 .card）—— 卡片是 `<a>`，
   * `<li>` 只是包裹，不该也变成节点。
   */
  function cardEls(): Element[] {
    return [...document.querySelectorAll('a.card')];
  }

  /**
   * 某颗星这一帧的**视口坐标**。
   *  · 卡片节点 ⇒ 每帧从 DOM 矩形取心（滚动时它跟着卡片走，这是"活的"的关键）
   *  · 背景散点 ⇒ 归一化 × 视口
   * 返回 false 表示它这一帧不可用（节点被 display:none / 矩形为 0）。
   */
  function pos(s: Star, out: { x: number; y: number }): boolean {
    if (s.node) {
      if (!s.el) return false;
      const r = s.el.getBoundingClientRect();
      // 宽高为 0 ⇒ 元素此刻不在布局里（隐藏/未渲染），这一帧跳过
      if (!r.width || !r.height) return false;
      out.x = r.left + r.width / 2;
      out.y = r.top + r.height / 2;
      return true;
    }
    out.x = s.u * cw;
    out.y = s.v * ch;
    return true;
  }

  const _p = { x: 0, y: 0 };

  /** 按当前视口重建星图。尺寸变了、或首次，才调。 */
  function build() {
    // ---- ① 卡片节点（语义层）：索引 0..n-1 ----
    const els = cardEls();
    const next: Star[] = els.map((el, i) => ({
      // 节点不用归一化坐标（每帧从 DOM 取心），但仍要填合法值占位，
      // 免得某个分支读到 undefined 变成 NaN。
      u: SH(9000 + i, 0),
      v: SH(9000 + i, 1),
      ph: SH(9000 + i, 2),
      k: 1,
      lit: 0,
      node: 1,
      el,
      lastLit: -1,
    }));
    const nodeCount = next.length;

    // ---- ② 背景散点（天光层）：索引 n..n+m-1 ----
    const m = Math.max(
      14,
      Math.min(STAR_MAX, Math.round((cw * ch) / AREA) * (narrow.matches ? 0.55 : 1)),
    );
    for (let i = 0; i < m; i++) {
      const u = SH(i, 0);
      const v = SH(i, 1);
      // ★ 每 5 颗里 1 颗是"亮星"（大、带光晕），其余是散点 —— 亮星少才读得出星座感。
      //   亮星与否只由 i 决定 ⇒ 同一个 i 永远是同一类星，resize 后不会"换身份"
      //   （若靠数量取模，n 一变身份就变，已点亮的星会突然变成散点）。
      const k = i % 5 === 0 ? 1 : 0.46;
      next.push({ u, v, ph: SH(i, 2), k, lit: 0, node: 0, el: null, lastLit: -1 });
    }

    const n = next.length;
    stars = next;

    /* 旧的边要不要作废？这里有个容易想错的地方，值得写清：
     *   - 卡片节点排在**前面**（0..nodeCount-1），节点数只随卡片数变，**resize 不改**
     *     ⇒ 节点端点的索引永远指向同一张卡片，不会错连。
     *   - 散点索引 j 的位置由 `SH(j,·)` 决定 ⇒ 只要 j < 新的散点数，索引 j 指向的
     *     **还是同一颗星**（同一对 u/v）⇒ 散点边也不需要因为"整体后移"而重连。
     *   ⇒ 真正要剪的只有一种：**端点已不存在**（散点变少时越界的j；
     *     卡片被移除时的节点索引，属防御性）。
     * 剪不干净的后果不是"错连"，而是 `pos()` 返回 false 后那帧被跳过——但仍要剪，
     * 因为端点越界的边会永远占着 MAX_EDGES 的名额，把新线挤出去。*/
    edges = edges.filter((e) => e.a < n && e.b < n);
  }

  /** 把画布对到 CSS 尺寸 × DPR。返回 true = 尺寸变了。 */
  function fit(): boolean {
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w || !h) return false;
    const dpr = Math.min(narrow.matches ? 1.5 : 2, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (pw === cv.width && ph === cv.height) return false;
    cv.width = pw;
    cv.height = ph;
    cw = w;
    ch = h;
    ctx = cv.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  /** 一阶指数平滑的帧率无关写法（吃真实 dt，与 develop.ts 同一口径）。 */
  const ease = (cur: number, target: number, dt: number, tau: number) =>
    target + (cur - target) * Math.exp(-dt / tau);
  void ease; // 亮度不做缓动：进度本身就是缓的（每帧 SPEED×dt），再套一层只会拖慢手感

  /* ---------- 找一条已存在的边（无向） ---------- */
  function findEdge(a: number, b: number): Edge | undefined {
    const [i, j] = a < b ? [a, b] : [b, a];
    return edges.find((e) => e.a === i && e.b === j);
  }

  function pushEdge(a: number, b: number): Edge {
    const [i, j] = a < b ? [a, b] : [b, a];
    const e: Edge = { a: i, b: j, p: 0 };
    if (edges.length >= MAX_EDGES) {
      // ★ 最旧的退休：既让新线进得来，也天然实现"位置复用"
      edges.shift();
    }
    edges.push(e);
    return e;
  }

  /**
   * 推进一帧的线进度。**唯一的非纯函数**（吃 dt累积），其余全部由 t 求值。
   * @param dt 秒
   */
  function advance(dt: number) {
    if (!ptr.on || !stars.length) return;

    /* 邻域内的星。★ 两点改动（站主拍板「卡片节点 + 背景散点」后）：
     *   ① 坐标走 pos()，节点从 DOM 取心（不再用 s.u×cw —— 那是散点的算法）；
     *   ② 每颗星带自己的邻域半径：节点 R_NEAR_NODE（大），散点 R_NEAR。 */
    const near: { i: number; d: number; node: 0 | 1 }[] = [];
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (!pos(s, _p)) continue;
      const d = Math.hypot(_p.x - ptr.x, _p.y - ptr.y);
      if (d < (s.node ? R_NEAR_NODE : R_NEAR)) near.push({ i, d, node: s.node });
    }
    if (!near.length) return;

    /* ★ 挑选：先按距离排，然后**让节点优先入选**。
     *   理由：节点是语义主角（那些"站"）。若纯按距离取前 N，指针正好停在卡片附近时，
     *   卡片节点常常因为"只比其他星近一点点"而被挤掉—— 那一瞬间正是最该看见它的时候。
     *   ⇒ 取「节点优先至多 3 个 + 其余按距离补足 5」。
     *   节点名额给到 3 是实测逼出来的：2 个时，站在一张卡上只能连上"1 邻点 + 1 散点"，
     *   读起来像"一根短线"而不是"星座"；3 个才能连成一小片。*/
    near.sort((p, q) => p.d - q.d);
    const nodesFirst = near.filter((p) => p.node).slice(0, 3);
    const rest = near.filter((p) => !nodesFirst.includes(p));
    const pick = [...nodesFirst, ...rest].slice(0, 5);
    if (pick.length < 2) return; // 一颗星连不成线

    const step = dt * SPEED;

    for (let a = 0; a < pick.length; a++) {
      for (let b = a + 1; b < pick.length; b++) {
        const sa = stars[pick[a].i];
        const sb = stars[pick[b].i];
        if (!pos(sa, _p)) continue;
        const x1 = _p.x;
        const y1 = _p.y;
        if (!pos(sb, _p)) continue;
        const d = Math.hypot(_p.x - x1, _p.y - y1);
        // ★ 成边上限按"两端里较小的那个"取：只要有一端是节点，就用节点的尺度。
        //   （两端的 r 取 min ⇒ 节点-散点用 R_LINK、节点-节点用 R_LINK_NODE、
        //     散点-散点用 R_LINK。若只看其中一端，会出现"节点和它的邻点连不上"。）
        const rMax = Math.min(
          sa.node ? R_LINK_NODE : R_LINK,
          sb.node ? R_LINK_NODE : R_LINK,
        );
        if (d > rMax) continue; // 太远的邻点不成边
        let e = findEdge(pick[a].i, pick[b].i);
        if (!e) e = pushEdge(pick[a].i, pick[b].i);
        // ★ 推进上限：单次到 LIMIT；若两颗都在邻域内（pick.length>=2 且都近）
        //   给 BOTH_BONUS —— 这是唯一能突破 LIMIT 的口子，用来区分"擦过"与"停留"
        const cap = LIMIT + (pick.length >= 2 ? BOTH_BONUS : 0);
        e.p = Math.min(cap, e.p + step);
      }
    }
    // 端点星的亮度跟着线的进度走
    for (const e of edges) {
      const s1 = stars[e.a];
      const s2 = stars[e.b];
      if (s1) s1.lit = Math.max(s1.lit, e.p);
      if (s2) s2.lit = Math.max(s2.lit, e.p);
    }
    syncNodeLit();
  }

  /**
   * ★ 把**卡片节点**的亮度回写成 CSS 变量 `--node-lit`。
   *
   * 为什么要绕这一手：canvas 在 `z-index:-1` 层，而 `.card` 有不透明底色 `--panel`
   * 且在 `z-index:1` 的层叠上下文里 ⇒ 画在 canvas 上的节点会被卡片整个盖住
   * （实测截图：卡片区一颗星都没有）。所以节点星本体由卡片的 `::before` 画，
   * 脚本只负责把亮度告诉它。
   *
   * 只在值变化时写 —— 每帧对 5 个元素 setProperty 会引起无谓的样式重算。
   */
  function syncNodeLit() {
    for (const s of stars) {
      if (!s.node || !s.el) continue;
      // 与 CSS 里的 opacity 上限 0.9 对齐，别让脚本送出 >1 的值
      const v = Math.round(Math.min(1, s.lit) * 1000) / 1000;
      if (s.lastLit === v) continue;
      s.lastLit = v;
      (s.el as HTMLElement).style.setProperty('--node-lit', String(v));
    }
  }

  /** 画一帧 t（秒）。除 lit / e.p 之外全是 f(t) 的确定函数。 */
  function draw(t: number) {
    if (!cw || !ch || !stars.length) return;
    ctx.clearRect(0, 0, cw, ch);

    /* ---------- 一、连线（先画，压在星点之下） ---------- */
    for (const e of edges) {
      if (e.p <= 0.01) continue;
      const sa = stars[e.a];
      const sb = stars[e.b];
      if (!sa || !sb) continue;
      if (!pos(sa, _p)) continue;
      const x1 = _p.x;
      const y1 = _p.y;
      if (!pos(sb, _p)) continue;
      // 线的浓度随进度走；比星点淡一档，避免细线在纸白上发硬
      ctx.strokeStyle = A(ACCENT_INK, e.p * 0.42);
      ctx.lineWidth = e.p > 0.7 ? 1.2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(_p.x, _p.y);
      ctx.stroke();
    }

    /* ---------- 二、星点 ---------- */
    const rScale = narrow.matches ? 0.8 : 1;
    for (const s of stars) {
      /* ★ **跳过卡片节点**：它由卡片的 `::before` 画（亮度来自 `--node-lit`）。
       *   在这里再画一遍是纯浪费 —— canvas 在卡片**之下**，
       *   画出来的那颗会被不透明的 `--panel` 底整个盖住（实测截图里卡片区一片空）。
       *   连线仍要画节点的端点：线在卡片之下，中心段被遮、两头露出，
       *   读起来正好是"线从卡片背后连出去"。*/
      if (s.node) continue;
      if (!pos(s, _p)) continue;
      const x = _p.x;
      const y = _p.y;
      // 呼吸：0.82 + 0.18·sin —— 亮星幅度更大，散点几乎不闪
      const tw = 0.82 + 0.18 * Math.sin((t / TWINKLE + s.ph) * Math.PI * 2);
      const base = 0.14 + 0.1 * tw; // 未点亮时的底噪：星图"一直在"，不是凭空出现
      const v = Math.max(base, s.lit);
      const r = DOT_R * s.k * rScale;
      if (s.k > 0.8 && s.lit > 0.25) {
        // 亮星的光晕（点亮后才出现）
        ctx.fillStyle = A(ACCENT, s.lit * 0.16);
        ctx.beginPath();
        ctx.arc(x, y, DOT_R_HALO * s.k * rScale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = A(ACCENT, Math.min(1, v));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 节点亮度回写到卡片（`::before` 那颗星）
    syncNodeLit();
  }

  /** reduced-motion 档：画一张**静态**的星图（不跑 rAF）。 */
  function drawStatic() {
    /* 静态图是"已经连成的样子"，所以连线应该**优先把卡片节点串起来** ——
       那是这页的语义（站与站的连接），不是随便几颗散点。
       ★ 不要在这里再调 build()：起停处已调过，build() 会重排星序、把已有边作废。*/
    const nodeIdx: number[] = [];
    stars.forEach((s, i) => {
      if (s.node) nodeIdx.push(i);
    });
    for (let i = 0; i < nodeIdx.length; i++) stars[nodeIdx[i]].lit = 1;

    // 连线：先把节点按顺序串成一条链（站与站相连），再补散点凑满 MAX_STATIC_EDGES
    let made = 0;
    for (let k = 0; k + 1 < nodeIdx.length && made < MAX_STATIC_EDGES; k++) {
      pushEdge(nodeIdx[k], nodeIdx[k + 1]).p = 0.62 + 0.1 * (k % 3);
      made++;
    }
    // 散点：每3 颗取 1 颗点亮并与前一棵连（"天光"那层）
    const dust = stars.map((s, i) => (s.node ? -1 : i)).filter((i) => i >= 0);
    for (let k = 0; k < dust.length && made < MAX_STATIC_EDGES; k += 3) {
      const i = dust[k];
      stars[i].lit = Math.max(stars[i].lit, 0.8);
      if (k > 0) {
        pushEdge(dust[k - 3], i).p = 0.5;
        made++;
      }
    }
    draw(0);
  }

  /* ---------- 指针跟随 ---------- */
  const onMove = (ev: PointerEvent) => {
    ptr.x = ev.clientX;
    ptr.y = ev.clientY;
    ptr.on = true;
  };
  const onLeave = () => {
    //★ 只把 on 置 false，**不清进度** —— 见头部「离开后不回落」
    ptr.on = false;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerleave', onLeave, { passive: true });
  window.addEventListener('blur', onLeave);

  /* ---------- 起停 ---------- */
  // ★ 先对一次尺寸再建星：build() 里的 `cw`/`ch` 来自 fit()，为 0 时星会全挤在原点。
  //   `fit()` 读 clientWidth/clientHeight —— 这也是**不能用 `hidden` 属性**的原因
  //   （display:none 下恒为 0，装置量不到尺寸）。
  fit();

  if (!animate) {
    // RM 档：静态星图，一次画完（不跑 rAF）
    build();
    drawStatic();
    // RM 档也要露面，否则 opacity:0 门控让它永远不可见 —— 静态星图本身就是这一档的产物
    cv.classList.add('is-ready');
  } else {
    // ★ 首帧**同步**画一次，不等 rAF（照抄 float.ts 的两条理由：
    //   ① 真观感 —— startLoop 首次回调要等下一帧，中间 canvas 是空的，会闪一下"光板"；
    //   ② 验收 —— 本机无头下 rAF 在 --virtual-time-budget 里不推进，有它才能直接量）。
    build();
    draw(0);

    const T0 = performance.now();
    const gate = createActivityGate(cv);

    startLoop((dt, now) => {
      if (!gate.onScreen || !gate.visible) return; // 切标签 / 出屏：不推进也不画
      advance(dt / 1000);
      draw((now - T0) / 1000);
    });

    /* 尺寸变化要重建星图：星的位置是归一化的（u/v），resize 后不必重排，
       但**点数随面积变**（build 会重算）⇒ 必须重建，且旧边的端点索引要作废。 */
    let rz = 0;
    window.addEventListener(
      'resize',
      () => {
        const t = Date.now();
        if (t - rz < 200) return; // 合并连续 resize
        rz = t;
        if (!fit()) return;
        build();
        draw((performance.now() - T0) / 1000);
      },
      { passive: true },
    );

    // 显隐门控：与首页 DNA 同一套（opacity:0 → is-ready → 1），不是 hidden 属性
    cv.classList.add('is-ready');
  }
})();
