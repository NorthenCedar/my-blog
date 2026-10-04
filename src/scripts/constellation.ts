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
  const AREA = 26000; // 每26000 px² 一颗星（与浮游"每 12500 px² 一根雨线"同一量级但更疏）
  const STAR_MAX = 90; // 上限：屏幕再大也不至于糊成一片
  const R_NEAR = 132; // 指针邻域半径：进入即开始推进
  const R_LINK = 176; // 连线距离上限：超过就不连（不是所有近邻都成边）
  const SPEED = 1 / 1.15; // 单条线推进速度（进度/秒）⇒ 约 1.15s 走满一程
  const LIMIT = 0.62; // ★ 一次"连上"最多推进到 0.62 —— 见头部注记
  const BOTH_BONUS = 0.22; // 两颗星同时在邻域内时的额外推进（唯一能突破 LIMIT 的口子）
  const MAX_EDGES = 14; // ★ 总线数封顶；超出后最旧的退休
  const MAX_STATIC_EDGES = 6; // reduced-motion 档画几条静态连线
  const TWINKLE = 1.6; // 呼吸周期（秒）：星点亮度随 t 微微起伏
  const DOT_R = 1.5; // 亮星半径（px）
  const DOT_R_HALO = 3.4; // 亮星的光晕半径

  interface Star {
    /** 归一化坐标（0..1），与视口尺寸无关 ⇒ resize 后位置不变 */
    u: number;
    v: number;
    /** 亮度相位（0..1），跨帧稳定 */
    ph: number;
    /** 基础半径倍率：亮星（大）vs 散点（小） */
    k: number;
    /** 当前亮度 0..1（由进度驱动，缓动后落位） */
    lit: number;
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

  /** 按当前视口重建星图。 */
  function build() {
    const n = Math.max(
      14,
      Math.min(STAR_MAX, Math.round((cw * ch) / AREA) * (narrow.matches ? 0.55 : 1)),
    );
    const next: Star[] = [];
    for (let i = 0; i < n; i++) {
      const u = SH(i, 0);
      const v = SH(i, 1);
      // ★ 每 5 颗里1 颗是"亮星"（大、带光晕），其余是散点 —— 亮星少才读得出星座感。
      //   亮星与否只由 i 决定 ⇒ 同一个 i 永远是同一类星，resize 后不会"换身份"
      //   （若靠数量取模，n 一变身份就变，已点亮的星会突然变成散点）。
      const k = i % 5 === 0 ? 1 : 0.46;
      next.push({ u, v, ph: SH(i, 2), k, lit: 0 });
    }
    stars = next;
    // 视口尺寸变了 ⇒ 星数可能变，旧边的端点索引要作废（否则会连到别的星上）
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
    // 邻域内的星：最多取最近的若干颗（连成蜘蛛网没意义）
    const near: { i: number; d: number }[] = [];
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const x = s.u * cw;
      const y = s.v * ch;
      const d = Math.hypot(x - ptr.x, y - ptr.y);
      if (d < R_NEAR) near.push({ i, d });
    }
    if (!near.length) return;
    near.sort((p, q) => p.d - q.d);
    const pick = near.slice(0, 4);
    const step = dt * SPEED;

    for (let a = 0; a < pick.length; a++) {
      for (let b = a + 1; b < pick.length; b++) {
        const sa = stars[pick[a].i];
        const sb = stars[pick[b].i];
        const x1 = sa.u * cw;
        const y1 = sa.v * ch;
        const x2 = sb.u * cw;
        const y2 = sb.v * ch;
        const d = Math.hypot(x2 - x1, y2 - y1);
        if (d > R_LINK) continue; // 太远的邻点不成边
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
      const x1 = sa.u * cw;
      const y1 = sa.v * ch;
      const x2 = sb.u * cw;
      const y2 = sb.v * ch;
      // 线的浓度随进度走；比星点淡一档，避免细线在纸白上发硬
      ctx.strokeStyle = A(ACCENT_INK, e.p * 0.42);
      ctx.lineWidth = e.p > 0.7 ? 1.2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    /* ---------- 二、星点 ---------- */
    const rScale = narrow.matches ? 0.8 : 1;
    for (const s of stars) {
      const x = s.u * cw;
      const y = s.v * ch;
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
  }

  /** reduced-motion 档：画一张**静态**的星图（不跑 rAF）。 */
  function drawStatic() {
    // 借用 t=0 的确定性位置，手工点亮前若干颗并连成若干条
    build();
    const lit = Math.max(6, Math.round(stars.length * 0.18));
    for (let i = 0; i < lit; i++) stars[i].lit = 1;
    // 连线：每 k 颗连一条，凑满 MAX_STATIC_EDGES
    const want = Math.min(MAX_STATIC_EDGES, Math.floor(lit / 2));
    for (let k = 0; k < want; k++) {
      const a = (k * 2) % lit;
      const b = Math.min(lit - 1, a + 1 + (k % 2));
      if (a === b) continue;
      pushEdge(a, b).p = 0.55 + 0.1 * (k % 3);
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
