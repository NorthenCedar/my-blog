/* =============================================================================
 * 说说页 · 浮游（FLOAT）—— 斜飘雨线 + 下半屏的椭圆涟漪
 *
 * ★ 机制与其余四台装置**镜像**（口径 #5「每页一台机制不同的装置」）：
 *
 *              相册 显影板        归档 索引卷尺      关于 参考板     文章 阅读尺     说说 FLOAT（本文件）
 *   介质       Canvas 像素场      DOM transform      <img> 静态      DOM transform   Canvas 2D
 *   输入       **指针**           **滚动**           无              滚动 + 点击      **时间**（无输入）
 *   驱动       一阶指数平滑       二阶弹簧（过冲）   静态           确定映射        解析函数 f(t)
 *   退场       无（常驻）         常驻               常驻            停手 900ms 收回 永续
 *
 *   ★ 只有它**不读任何输入** —— 滚动、指针一概不吃。这正是它该有的样子：
 *     说说页是速读页（一条一两句），装置只做氛围、不做交互，别抢阅读。
 *
 * ★ 母题（站主 2026-10-04 拍板，经实验台 `_probe/_float-lab.src.html` 的 ⑤ 号母题）：
 *   · 斜飘雨线三层景深（195 / 340 / 485 px/s，拖尾长度 ∝ 速度 ⇒ 景深是**算出来的**）
 *   · **椭圆**涟漪（扁率 K = 0.36 ≈ 21° 俯角）**只在下半屏**冒，一环一环往外推
 *   · 每条说说在**原位**小幅漂浮（纯 CSS，见 talks.astro 的样式段，本文件不碰）
 *
 * ★★ 站主 2026-10-04 三条追加，逐条落在机制上：
 *   ① 「涟漪用椭圆啊，都能看到雨线了」⇒ 雨线有了方向，落点就该读成"地面上的圈"。
 *      所有涟漪在**同一个地面平面**上 ⇒ 扁率是**平面的属性**、不是某个涟漪的属性
 *      ⇒ 常数 K，不做逐环/逐点变化（逐环变会读成"每个涟漪在不同的平面上"，那是错的）。
 *      也不给椭圆加倾角：地面上的圈永远是水平长轴，倾斜要变的是**平面**，不是圈。
 *   ② 「涟漪放在屏幕的下半部分吧」⇒ 说说正文在上半屏，涟漪落在正文下方的空白里、不压字。
 *      中心从 **0.56H** 起算（不是 0.50H）：椭圆是**横长轴**，中心卡在中线上时上缘会明显越界。
 *   ③ 「密度更密」⇒ 雨线基准密度 ×1.6（1/20000 → **1/12500** px²）。
 *      ⚠ 涟漪间隔（1.45s）**没动** —— 那是另一个旋钮，站主没点名，不许顺手一起改。
 *
 * ★★ 「随机位置」怎么过零随机这条硬规矩：
 *   站上 `tests/develop-bath.test.ts:38` 写明理由 —— 形状 = f(t)，两次加载在同一时刻
 *   必须一致，那是**能验收的前提**；`index-tape` / `time-slice` 也各自断言「不含 Math.random」。
 *   ⇒ 这里的"随机"一律用**整数哈希** `hash01(i)`（不是随机源：同一个 i 永远同一个值）。
 *     顺带一个真正的好处：**涟漪不存状态** —— 第 i 个涟漪的出生时刻就是 i*PERIOD、
 *     位置由 hash01(i) 定 ⇒ 任意 t 单独求值结果都一样，不必"每帧累加相位"。
 *
 * ★★ 三条工程约束（与实验台同一套，落地时同样适用）：
 *   ① 背景**只吃时间**，绝不读内容几何 —— 评论一展开会插一大堆 DOM，
 *      依赖元素位置的背景每次展开都要重排重画，还会跟评论列表抢主线程。
 *      本文件**一行 DOM 测量都没有**（实验台里那套 anchors 是给 ①③④ 号母题用的，
 *      ⑤ 号不需要，落地时整段没搬过来）。
 *   ② 颜色只从 token 读，再以**8 位 hex**承载 alpha（站上约定；组件里不写 rgba()）。
 *   ③ 装饰层：aria-hidden / pointer-events:none / z-index:-1 / fixed inset:0（都在 talks.astro）。
 *
 * ★ 降级四态（照抄 develop.ts / index-tape.ts / reading-rule.ts 的约定）：
 *   ① reduced-motion ⇒ **不跑 rAF，画一帧静态的**。
 *      ★ 这一档是本页最需要解释的一处：其余三台都有"最终态"（显影到底 / 游标停在目标 /
 *        尺常驻），而 FLOAT 是**永续循环、没有终态**。硬套"落最终态"只能画一张空白。
 *        ⇒ 本页的解释是：**冻结在 t = RM_T 这一帧**（确定性时刻，不为好看调参）。
 *        装置仍在（纸上有雨、地上有圈），只是不动 —— 装饰件在 RM 下的正解就是"安静地存在"。
 *   ② 无 JS ⇒ canvas 空着（透明），只剩底纹层；正文本身服务端渲染完整。
 *   ③ 移动端 ≤767px ⇒ **极简版**：雨线密度 ×0.5、涟漪环数 3 → 2、半径 ×0.75、DPR 上限 2 → 1.5。
 *      （与文章页阅读尺的"完全不渲染"不同：那是交互装置、够不着也没用；
 *        背景是氛围，窄屏更需要它，所以要的是"更轻"而不是"没有"。）
 *   ④ 视口外 / 切标签 ⇒ 停帧（rl-core 的 activityGate）。
 *      ★ 本页的 canvas 是 `fixed inset:0` ⇒ IntersectionObserver **恒判在屏**，
 *        真正能停帧的只有 visibilitychange。这条不是形式主义：同一个 gate 在
 *        显影板 / 卷尺上是**在流里**的元素，onScreen 才真的有语义；这里保留它，
 *        是为了"切标签必停"这一条与其余装置走同一条代码路径（少一类只在某页才有的行为）。
 */
import { createActivityGate, prefersReducedMotion, shouldAnimate, startLoop } from './rl-core';

(() => {
  const cv = document.querySelector<HTMLCanvasElement>('[data-float-bg]');
  if (!cv) return;
  const ctx0 = cv.getContext('2d');
  if (!ctx0) return;

  const narrow = matchMedia('(max-width: 767px)');
  const reduce = prefersReducedMotion();
  const animate = shouldAnimate(reduce);

  /* ---------- 颜色（只从 token 读；alpha 用 8 位 hex 承载，不写 rgba()） ---------- */
  const CS = getComputedStyle(document.documentElement);
  const ACCENT = CS.getPropertyValue('--accent').trim() || '#2d7d46';
  /** 给 6 位 hex 挂 alpha ⇒ 8 位 hex（站上 tokens 的同一约定）。 */
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
  /** 第 i 滴雨的第 k 个属性（k 固定 ⇒ 属性跨帧稳定）。 */
  const DH = (i: number, k: number) => hash01(i * 16 + k);

  /* ---------- 母题常数（与实验台 ⑤ 号母题逐条同值） ---------- */
  const SLANT = 0.28; // 每下落 1px 向右偏 0.28px ⇒ 约 15.6°「斜飘」
  const MARGIN = 60; // 上下各留 60px 出画余量（线段不至于突然出现在画面里）
  const DROP_AREA = 12500; // 雨线基准：每 12500 px² 一根（实验台基准 20000 × 1.6 = 站主要的「更密」）
  const DROP_MAX = 220; // 上限：屏幕再大也不至于把线糊成一片
  const RIPPLE_PERIOD = 1.45; // 冒一个涟漪的间隔（"不要太密"：同时只有 2–3 个）
  const RING_LIFE = 2.6; // 单个环从生到灭
  const STAGGER = 0.45; // 相邻两环的时差 ⇒ 读得出"一圈一圈"，而不是一坨同心圆
  const FLAT = 0.36; // 椭圆扁率 ry = rx × FLAT（约 21° 俯角）
  const Y0 = 0.56; // 涟漪中心的纵向起点（H 的比例；只在下半屏）
  const RM_T = 12.5; // reduced-motion 冻结在哪个 t（任取的确定性时刻）

  let cw = 0;
  let ch = 0;
  let ctx = ctx0;

  /** 把画布对到 CSS 尺寸 × DPR。返回 true = 尺寸变了（调用方据此决定是否重画）。 */
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

  /** 画一帧 t（秒）。**纯函数**：同一 (W,H,t) 必得同一画面。 */
  function draw(t: number) {
    const W = cw;
    const H = ch;
    if (!W || !H) return;
    const rings = narrow.matches ? 2 : 3;
    const rScale = narrow.matches ? 0.75 : 1;

    /* ---------- 一、斜飘的雨线：三层景深（近的更快、更长、更实） ---------- */
    const span = H + MARGIN * 2;
    const XW = W + span * SLANT; // 斜线扫过的横向总宽（正好铺满含出画部分的窗）
    const n = Math.max(
      12,
      Math.min(DROP_MAX, Math.round(((W * H) / DROP_AREA) * (narrow.matches ? 0.5 : 1))),
    );
    for (let i = 0; i < n; i++) {
      const d = i % 3; // 0 远 / 1 中 / 2 近
      const sp = 195 + d * 145; // px/s
      /* 拖尾长度 ∝ 速度（等于给每一滴一个固定的"曝光时间"）⇒ 景深是算出来的，不是凑出来的 */
      const len = sp * 0.062 * (0.8 + DH(i, 2) * 0.5);
      const yr = (((DH(i, 1) * span + t * sp) % span) + span) % span; // [0, span)
      const y = yr - MARGIN;
      /* 横向 = 竖向 × 斜率，再对总宽取模（窗宽刚好等于 XW ⇒ 接缝正好落在出画的边上） */
      const x = (((DH(i, 0) * XW + yr * SLANT) % XW) + XW) % XW - (span * SLANT) / 2;
      if (x < -len * SLANT - 2 || x > W + 2 || y < -len - 2 || y > H + 2) continue;
      /* 尾在来的方向（雨往右下落 ⇒ 尾在左上） */
      ctx.beginPath();
      ctx.moveTo(x - len * SLANT, y - len);
      ctx.lineTo(x, y);
      ctx.strokeStyle = A(ACCENT, 0.085 + d * 0.055);
      ctx.lineWidth = 0.6 + d * 0.35;
      ctx.stroke();
    }

    /* ---------- 二、涟漪：椭圆落点、只在下半屏，一环一环往外推 ----------
       ★ 不存状态：第 i 个的出生时刻 = i × PERIOD、位置 = hash01(i) ⇒ 任意 t 单独求值都一致。 */
    const RMAX = Math.max(30, Math.min(140, W * 0.082 * rScale));
    const LAST = RING_LIFE + STAGGER * (rings - 1);
    const i1 = Math.floor(t / RIPPLE_PERIOD);
    const i0 = Math.max(0, Math.ceil((t - LAST) / RIPPLE_PERIOD));
    for (let i = i0; i <= i1; i++) {
      const age = t - i * RIPPLE_PERIOD;
      const cx = hash01(i * 2 + 11) * W;
      const cy = H * Y0 + hash01(i * 2 + 12) * (H - H * Y0);
      /* 落点那一下的小亮点（只在最初 0.16s）—— 同样压扁 */
      if (age < 0.16) {
        const k = 1 - age / 0.16;
        const r0 = 0.6 + 1.7 * k;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r0, r0 * FLAT, 0, 0, 6.283);
        ctx.fillStyle = A(ACCENT, 0.5 * k);
        ctx.fill();
      }
      /* j 越大 = 越晚生 = 越靠里越小、越亮；j = 0 是最外圈、最淡的那个 */
      for (let j = 0; j < rings; j++) {
        const u = (age - j * STAGGER) / RING_LIFE;
        if (u <= 0 || u >= 1) continue;
        const rx = RMAX * Math.sqrt(u); // √u = 先快后慢（面积均匀）
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, rx * FLAT, 0, 0, 6.283);
        ctx.strokeStyle = A(ACCENT, 0.34 * (1 - u) * (1 - u));
        ctx.lineWidth = 1.2 - j * 0.18;
        ctx.stroke();
      }
    }
  }

  /** 清屏 + 画一帧（尺寸变了先对尺寸）。 */
  function paint(t: number) {
    fit();
    if (!cw || !ch) return;
    ctx.clearRect(0, 0, cw, ch);
    draw(t);
  }

  if (!animate) {
    /* reduced-motion：不跑 rAF，画一帧静态的（见头部 ★ 关于"本页没有终态"那条） */
    paint(RM_T);
    window.addEventListener('resize', () => paint(RM_T), { passive: true });
    return;
  }

  /* 停帧（视口外 / 切标签）。canvas 是 fixed 满屏 ⇒ onScreen 恒真，
     真正能停的是 visible；保留 gate 是为了与其余装置走同一条代码路径（见头部注释）。
     ★ 顺带把「切标签」这一档也接到**原位漂浮**上（CSS 那一半在 talks.astro）：
       `html.float-idle` 一挂，`.talk` 的 animation-play-state 就 paused ⇒
       两半（CSS 浮 + Canvas 雨）由**同一处** visibilitychange 驱动，不会出现
       "雨停了、卡片还在浮"这种半停状态。 */
  const HROOT = document.documentElement;
  const gate = createActivityGate(cv, {
    onTick: () => HROOT.classList.remove('float-idle'),
    onHidden: () => HROOT.classList.add('float-idle'),
  });

  const T0 = performance.now();

  /* ★ 首帧**同步**画一次，不等 rAF。
     两个理由，都不是"测试方便"：
       ① 真观感：`startLoop` 的第一次回调要等下一帧（最快 16ms，慢机器上首帧还更晚），
          这中间 canvas 是**空的** —— 页面已经可见、雨却还没下来，会闪一下"光板"。
          图案本身是 f(t) 的纯函数 ⇒ 先画 t=0 那一帧是**确定**的，不需要等。
       ② 验收：本机无头下 rAF 在 `--virtual-time-budget` 里不推进（阅读尺那轮已记录），
          没有这次同步绘制，"装置到底画没画"就只能靠 RM 档间接证 —— 有它就能直接量。 */
  paint(0);

  const stop = startLoop((_dt, now) => {
    if (!gate.onScreen || !gate.visible) return; // 切标签不推进（也不画）
    paint((now - T0) / 1000);
  });

  /* 尺寸变化要重画：雨线的位置与密度都跟 W×H 有关，不重画会留下按旧尺寸排的线。 */
  let rz = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = window.setTimeout(() => paint((performance.now() - T0) / 1000), 180);
  }, { passive: true });

  /* 页面卸载时清理（bfcache 回来不重跑脚本；这里只清 rAF 与 observer） */
  window.addEventListener('beforeunload', () => {
    stop();
    gate.dispose();
  }, { once: true });
})();
