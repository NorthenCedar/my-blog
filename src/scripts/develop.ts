/* =============================================================================
 * 相册页 · 流动显影槽（DEVELOP BATH）—— 页头那块可互动的装置
 *
 * 站主给的参考（抖音 · 作者 Lowkey）拆开来是四层：
 *   ① 底层 = 一张固定的真实照片
 *   ② 上层 = 整版纯色
 *   ③ 纯色层被「挖」出一个**有机形状的洞**，洞内露出照片；这个洞在缓慢生长、变形、蔓延
 *   ④ 文字始终压在最上层，不参与显影
 *
 * ★ 关键词：**不是「逐渐变清晰」，而是「形状在流动」** —— 照片不动，动的是那块遮罩。
 *
 * ---------------------------------------------------------------------------
 * 本站的三处换算（站主 2026-10-01 拍板）
 *
 *   · 底层照片  → 相册页的精选照片（manifest 的 1280 档）
 *   · 纯色      → **深墨绿**（照搬首页 .band 那支色，站内语汇一致），不是参考里的克莱因蓝
 *   · 文字      → 板内左下角的仪器读数（`mix-blend-mode: difference` ⇒ 墨绿底与照片上都可读）
 *
 * ---------------------------------------------------------------------------
 * 实现选择：Canvas2D，不是 SVG feTurbulence
 *
 *   feTurbulence + feDisplacementMap 代码更少、"液体"味更足，但滤镜在大尺寸上是
 *   性能杀手（整块 1900×400 每帧重算）。Canvas 方案里形状完全可控、每帧只做
 *   「192 个点的多边形 + clip + 一次 drawImage」。
 *
 *   ★ 板底那层深墨绿**不由 canvas 画** —— 它是容器的 CSS 背景。
 *     canvas 是**透明的**，只在形状里画照片 ⇒ 形状外"没有像素"，自然露出板底。
 *     这样每帧少一次全屏 fillRect，而且降级时（reduced-motion / 无 JS）板底照旧在。
 *     副作用（好的那种）：探针可以直接读 canvas 的 alpha 通道拿到形状轮廓 ——
 *     alpha>0 的连续区间就是"洞"。见 _probe/cdp-bath.mjs。
 *
 * ---------------------------------------------------------------------------
 * ★★ 两条本仓库踩过的坑，这里都按规矩避开
 *
 *   ① **不许"每帧固定系数"**（第十版弹簧那一课）：形状的时间基准是
 *      `performance.now()` 的**绝对值** t，不是"每帧 += 一个增量"。
 *      ⇒ 形状是 t 的确定函数：同一 t 下形状逐点相同，可跨加载逐点比对；
 *        且不随显示器刷新率变化。
 *
 *   ② **可见性不许押在动画上**：这块板是**装饰**，内容在网格里已经完整存在。
 *      所以整块板默认 `hidden`，脚本到位才解除；没有 JS 就没有它（不是"藏起来"），
 *      读屏也读不到它（aria-hidden）—— 不会出现"内容只在动画里"的情形。
 *
 * ---------------------------------------------------------------------------
 * 三层互动
 *
 *   ① 自动：形状自己缓慢地"长开 → 收缩"（16 s 一个循环），边缘持续变形
 *   ② 鼠标搅动：指针附近的那段边界被**推开**（局部，不是整体放大）
 *   ③ 与页面互动：划过网格里任意一张照片 ⇒ 板里立刻淡入那一张，
 *      离开后 3 s 恢复自动轮换；换片节奏挂在形状的呼吸峰上（像显影槽里换底片）
 *
 * 降级：reduced-motion ⇒ 形状停在固定相位、不轮换、不响应指针，只画一帧、不跑 rAF；
 *       无 JS ⇒ 整块不渲染；≤767px ⇒ 板高降低、轮廓采样点减半（搅动保留）。
 * ========================================================================== */
(() => {
  const host = document.querySelector<HTMLElement>('[data-bath]');
  const cvs = host?.querySelector<HTMLCanvasElement>('[data-bath-cv]');
  if (!host || !cvs) return;
  const ctx = cvs.getContext('2d');
  if (!ctx) return;

  const capEl = host.querySelector<HTMLElement>('[data-bath-cap]');
  const metaEl = host.querySelector<HTMLElement>('[data-bath-meta]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------- 参数 */

  const TAU2 = Math.PI * 2;

  /* 轮廓 */
  const N_WIDE = 192;      // 宽视口的轮廓采样点数（每点间距 ≈ 周长/192 ⇒ 折线误差 < 0.2px）
  const N_NARROW = 112;    // 窄视口减半（手机上省一半三角函数与噪声）
  const R2_FINE = 0.85;    // 细褶：环上一圈 ≈ 5.3 个噪声格（五六个起伏）
  const AMP_FINE = 0.10;   // 细褶幅度（相对半径）
  const R2_LOBE = 0.32;    // 低频分量：≈ 2 个格
  const AMP_LOBE = 0.21;   // ★ 这一层才是"水渍"而不是"规整椭圆"的来源 ——
                           //   它让形状一头大一头小、整体歪斜；细褶只负责边缘的毛感。

  /* 时间（全部以 ms 记，基准是 performance.now() 的**绝对值**） */
  const T_GROW = 16000;    // 形状「长开—收缩」周期：0 → 最大 → 0
  const T_ROLL = 21000;    // 横竖胖瘦周期（与上面刻意不同步 ⇒ 形态循环更长、更耐看）
  /* ★ 形态基准是 min(板宽, 板高)，**不是**板的宽高比 ——
     照板的比例做椭圆的话，这块 4:1 的扁板上形状永远是同一个"橄榄球"，
     没有"从一小块漫开"的过程。以短边为基准 ⇒ 形状天生接近圆（有机），
     横向靠 R 长大去铺满、纵向到点就溢出被板裁掉 ⇒ 才像液体在槽里漫开。 */
  const GROW_MIN = 0.42;   // 最小半径（相对短边）⇒ 板中央一块墨迹（太小则板子大半时间是空的）
  const GROW_MAX = 2.10;   // 最大半径 ⇒ 横向铺满整板（1258 / 2 / 305 ≈ 2.06）
  const GROW_BIAS = 0.62;  // ★ 生长曲线的**非对称度**：grow^0.62 ⇒ 长开得快、保持"大"的时间长、
                           //   收缩快。纯 cos 曲线有一半时间在小尺寸上 ⇒ 观感"大部分时候是空的"。
  const ROLL_AMP = 0.28;   // 纵向胖瘦 ±28%（±42% 时"忽胖忽瘦"太明显，读作抽动而不是流动）
  /* ★ ROLL_FLAT 是"形状有多扁"。这块板 3.4:1 太扁，若再压得很狠（0.72），
     中等尺寸下形状就是个**橄榄球**（实测 450×230）—— 规律的几何感，不是水渍。
     接近 1 ⇒ 形状天生是圆的，靠 R 长大去横向铺满、横向够宽时纵向自然溢出被板裁掉
     ⇒ 才是"液体在槽里漫开"。 */
  const ROLL_FLAT = 0.86;
  const PH_SPD = 1.1e-4;   // 噪声相位推进（每 ms）⇒ 边缘约 50 px/s
  /* ★ reduced-motion 用的固定相位。挑相位有两个约束：
     (a) 必须能**看清轮廓** —— 9000 ms 那个相位形状已经铺满整板（实测宽度占比 1.00），
         静止用户看到的是一张纯照片，"显影槽"的仪器感全丢；
     (b) 板是 3.7:1 的扁板，圆润形状横向有存在感时纵向必然溢满 ⇒ 只能要求"左右两侧留墨绿"。
     4000 ms：横向直径 ≈ 板宽 0.64（左右各留约 1/6 的墨绿）。 */
  const T_STILL = 4000;

  /* 指针 */
  const TAU = 130;         // 影响强度的平滑时间常数（进出都不硬切）
  const R_INF_K = 0.34;    // 影响半径 = min(板宽,板高) × 这个系数
  const PUSH_K = 0.20;     // 最大推开距离（同上口径）—— 0.30 时形状小一点就像"被咬了一口"
  const LOCK_MS = 3000;    // 划过网格后，自动轮换暂停多久

  /* 换片 */
  const SWAP_MS = 700;     // 交叉淡入时长
  const DT_MAX = 50;       // 帧间隔上限：切标签页回来 / 长卡顿后别让相位跳过头

  /* -------------------------------------------------- 噪声（边缘的"有机"来源） */

  // 预计算哈希表：把 Math.sin 的调用从"每帧上千次"降到 0。
  const HT = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) {
    const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    HT[i] = s - Math.floor(s);
  }
  const hA = (i: number, j: number) => HT[(i * 73 + j * 151) & 2047];
  const hB = (i: number, j: number) => HT[(i * 29 + j * 313 + 977) & 2047];

  /* 2D 值噪声（smoothstep 双线性），返回 0..1 */
  const vn2 = (x: number, y: number, h: (i: number, j: number) => number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
  /* 一个分量 = 两个八度 */
  const fbm2 = (x: number, y: number, h: (i: number, j: number) => number) =>
    (vn2(x, y, h) * 0.66 + vn2(x * 2.3, y * 2.3, h) * 0.34) * 2 - 1;

  /* ★★ 在**半径为 R2 的圆上采 2D 噪声** ⇒ 天然闭合。
     第一版走的是"1D 噪声 + 在 u 与 u−K 之间插值"那套周期化技巧，结果形状左上角
     一直有一根"拉丝"尖角：值噪声要周期化，周期 K 必须是整数、而且哈希索引也得模 K，
     两处漏一处就在接缝留下折痕。换成环上采样 ⇒ θ=0 与 2π 是同一个点，根本不存在接缝。
     R2 直接决定瓣数（环上一圈约 2πR2 个噪声格）。 */

  /* ---------------------------------------------------------------- 状态 */

  type Frame = { url: string; cap: string; album: string };

  const cache = new Map<string, HTMLImageElement>();
  const load = (url: string) => {
    let im = cache.get(url);
    if (!im) {
      im = new Image();
      im.decoding = 'async';
      im.src = url;
      cache.set(url, im);
    }
    return im;
  };

  let W = 0, H = 0, dpr = 1, N = N_WIDE;
  let COS = new Float32Array(0), SIN = new Float32Array(0), PX = new Float32Array(0);
  let RINF = 10, PUSH = 10;

  let raf = 0, running = false, onScreen = true, last = 0;
  let mx = 0, my = 0, pw = 0, pwT = 0;          // 指针位置 / 影响强度（实际值、目标值）
  let cur: HTMLImageElement | null = null, curUrl = '';
  let nxt: HTMLImageElement | null = null, nxtUrl = '';
  let mix = 1;                                   // 0 → 1：从 cur 淡入 nxt
  let lockT = 0;
  let lastPeak = -1;                             // 上一帧的呼吸相位（用于检测"涨到最大"）
  let list: Frame[] = [];
  let idx = 0;

  /* ---------------------------------------------------------------- 尺度 */

  const resize = () => {
    const r = cvs.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    W = r.width;
    H = r.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    N = W < 768 ? N_NARROW : N_WIDE;
    cvs.width = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    COS = new Float32Array(N);
    SIN = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU2;
      COS[i] = Math.cos(th);
      SIN[i] = Math.sin(th);
    }
    PX = new Float32Array(N * 2);
    RINF = Math.min(W, H) * R_INF_K;
    PUSH = Math.min(W, H) * PUSH_K;
    // 尺寸变了 ⇒ 指针相对坐标失效，影响量归零（免得形状上突然鼓一个错位的包）
    pw = 0;
    pwT = 0;
    return true;
  };

  /* ---------------------------------------------------------------- 绘制 */

  const drawCover = (im: HTMLImageElement, alpha: number) => {
    const iw = im.naturalWidth, ih = im.naturalHeight;
    if (!iw || !ih) return;
    const s = Math.max(W / iw, H / ih);
    const w = iw * s, h = ih * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
  };

  const render = (t: number) => {
    if (!W) return;

    const BASE = Math.min(W, H);                                 // 形态基准 = 短边（见上面 GROW_MIN 的注释）
    const grow0 = 0.5 - 0.5 * Math.cos((t * TAU2) / T_GROW);     // 0 → 1 → 0
    const grow = Math.pow(grow0, GROW_BIAS);                     // 非对称（见 GROW_BIAS 注释）
    const roll = 1 + ROLL_AMP * Math.sin((t * TAU2) / T_ROLL);
    // 指数插值：每单位时间"长大多少倍"恒定 ⇒ 读作生长，而不是线性膨胀
    const R = GROW_MIN * Math.pow(GROW_MAX / GROW_MIN, grow);
    const rx = BASE * R;
    const ry = BASE * R * roll * ROLL_FLAT;
    const ph = t * PH_SPD;
    const phL = ph * 0.45;   // 低频分量的相位推进更慢 ⇒ 两个分量不同步 ⇒ 形状持续变形
    const a = W * 0.5, b = H * 0.5;

    const active = pw > 0.002 && RINF > 1;

    for (let i = 0; i < N; i++) {
      // 细褶 + 低频偏斜：各自在环上采 2D 噪声，θ=0 与 2π 是同一点 ⇒ 闭合
      const k = 1
        + AMP_FINE * fbm2(COS[i] * R2_FINE + ph, SIN[i] * R2_FINE, hA)
        + AMP_LOBE * fbm2(COS[i] * R2_LOBE + phL, SIN[i] * R2_LOBE, hB);
      let x = a + rx * k * COS[i];
      let y = b + ry * k * SIN[i];

      /* ★ 搅动是**局部**的：影响半径远小于形状本身 ⇒ 只有指针附近那段边界被推开，
         不会变成"整块充气"。强度用 smoothstep，进出用指数平滑（见 frame()）。 */
      if (active) {
        const dx = x - mx, dy = y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < RINF * RINF) {
          const d = Math.sqrt(d2) || 1;
          const w = 1 - d / RINF;
          const e = w * w * (3 - 2 * w);
          const f = (e * pw * PUSH) / d;
          x += dx * f;
          y += dy * f;
        }
      }
      PX[i * 2] = x;
      PX[i * 2 + 1] = y;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    /* ★ 二次曲线经过相邻顶点的**中点**把轮廓平滑掉。
       直接 lineTo 会出锯齿：形状纵向被压扁的区段里，相邻顶点的 dy 只有 2~3 px，
       而噪声让 dx 能差 3 px ⇒ 折线在横向来回跳（肉眼就是边上一圈小毛刺）。
       平滑之后同样 192 个点，边缘是一条连续的液体曲线。 */
    ctx.moveTo((PX[0] + PX[2]) / 2, (PX[1] + PX[3]) / 2);
    for (let i = 1; i <= N; i++) {
      const j = i % N;
      const qx = PX[j * 2], qy = PX[j * 2 + 1];
      const m = (j + 1) % N;
      ctx.quadraticCurveTo(qx, qy, (qx + PX[m * 2]) / 2, (qy + PX[m * 2 + 1]) / 2);
    }
    ctx.closePath();
    ctx.clip();

    if (cur && cur.complete && cur.naturalWidth) {
      // ★ 先铺不透明的 cur 打底，再叠 alpha = mix 的 nxt ⇒ 才是**线性**交叉淡入
      //   （两张都用 alpha 叠会是 (1−m)² 的曲线，中段发暗）
      drawCover(cur, 1);
      if (nxt && mix > 0 && nxt.complete && nxt.naturalWidth) drawCover(nxt, mix);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  /* ---------------------------------------------------------------- 帧循环 */

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(DT_MAX, Math.max(0, now - last));
    last = now;

    if (dt > 0) {
      // 影响强度：指数平滑的**帧率无关**写法（1 − e^(−dt/τ)），不是每帧乘固定系数
      pw += (pwT - pw) * (1 - Math.exp(-dt / TAU));
      if (mix < 1) {
        mix = Math.min(1, mix + dt / SWAP_MS);
        if (mix >= 1) { cur = nxt; curUrl = nxtUrl; nxt = null; nxtUrl = ''; }
      }
      if (lockT > 0) lockT = Math.max(0, lockT - dt);

      // 形状涨到最大时换下一张 —— 换片节奏 = 形状的呼吸节拍（像显影槽里换底片）
      const peak = ((now % T_GROW) / T_GROW) * 2;   // 0..2，峰值在 1
      if (lastPeak >= 0 && peak >= 1 && lastPeak < 1 && lockT === 0) advance();
      lastPeak = peak;
    }
    render(now);
  };

  const sync = () => {
    const want = onScreen && !document.hidden && !reduce.matches;
    if (want && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!want && running) {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      // 停帧时补一帧：reduced-motion 要的是"固定相位的一帧静态"
      render(reduce.matches ? T_STILL : performance.now());
    }
  };

  /* ---------------------------------------------------------------- 内容 */

  /* 每次都重新收集 ⇒ 相册筛选（只改 figure 的 hidden）自动生效，不用跨脚本接线 */
  const collect = (): Frame[] =>
    Array.from(document.querySelectorAll<HTMLElement>('.wf figure:not([hidden])'))
      .map((fig) => {
        const a = fig.querySelector<HTMLAnchorElement>('a.frame');
        return {
          url: a?.getAttribute('href') ?? '',
          cap: fig.dataset.cap ?? '',
          album: fig.querySelector('figcaption span')?.textContent ?? '',
        };
      })
      .filter((f) => f.url);

  const read = (f: Frame, n: number, total: number, tag: string) => {
    if (capEl) capEl.textContent = f.cap;
    if (metaEl) metaEl.textContent = `${f.album}${tag} · ${n} / ${total}`;
  };

  const show = (f: Frame, tag: string) => {
    if (!f || f.url === curUrl) return;
    nxtUrl = f.url;
    nxt = load(f.url);
    mix = 0;
    read(f, idx + 1, list.length, tag);
  };

  const advance = () => {
    const l = collect();
    if (!l.length) return;
    list = l;
    idx = (idx + 1) % l.length;
    show(l[idx], '');
  };

  /* ---------------------------------------------------------------- 接线 */

  host.addEventListener('pointerenter', (e) => {
    mx = e.offsetX;
    my = e.offsetY;
    if (!reduce.matches) pwT = 1;
  });
  host.addEventListener('pointermove', (e) => {
    mx = e.offsetX;
    my = e.offsetY;
  });
  host.addEventListener('pointerleave', () => { pwT = 0; });

  /* 与页面互动：划过网格里任意一张 ⇒ 板里淡入那一张（松耦合 —— 只读 DOM，不引用另一个脚本） */
  for (const fig of document.querySelectorAll<HTMLElement>('.wf figure')) {
    fig.addEventListener('pointerenter', () => {
      if (reduce.matches) return;
      const a = fig.querySelector<HTMLAnchorElement>('a.frame');
      const url = a?.getAttribute('href');
      if (!url || url === curUrl) return;
      lockT = LOCK_MS;
      list = collect();
      idx = Math.max(0, list.findIndex((f) => f.url === url));
      show({ url, cap: fig.dataset.cap ?? '', album: fig.querySelector('figcaption span')?.textContent ?? '' }, ' · 悬停');
    });
  }

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      if (!resize()) return;
      if (running) last = performance.now();
      else render(reduce.matches ? T_STILL : performance.now());
    }, 160);
  });

  reduce.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  const io = new IntersectionObserver((es) => {
    for (const e of es) onScreen = e.isIntersecting;
    sync();
  }, { rootMargin: '160px' });
  io.observe(host);

  /* 首张就绪再露面 —— 否则会先看到一块纯墨绿在空流 */
  const ready = (im: HTMLImageElement) =>
    new Promise<void>((res) => {
      if (im.complete && im.naturalWidth) return res();
      im.addEventListener('load', () => res(), { once: true });
      im.addEventListener('error', () => res(), { once: true });
      setTimeout(res, 3000);   // 兜底：网络慢也照常露面
    });

  (async () => {
    list = collect();
    if (!list.length) return;
    idx = 0;
    curUrl = list[0].url;
    cur = load(curUrl);
    read(list[0], 1, list.length, '');
    await ready(cur);
    host.hidden = false;             // 必须先露面再量尺寸（display:none 时 rect 全是 0）
    if (!resize()) { host.hidden = true; return; }
    render(reduce.matches ? T_STILL : performance.now());
    lastPeak = -1;
    sync();
  })();
})();
