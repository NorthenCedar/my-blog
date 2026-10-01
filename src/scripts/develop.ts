/* =============================================================================
 * 相册页 · 显影板（DEVELOP PLATE）—— 页头右侧那块小板
 *
 * ★★ 站主 2026-10-01 改口径（这一版的行为与上一版**相反**，别照旧版理解）：
 *
 *   · **没有指针 = 一块纯色**。板里**不存在洞**，形状不是"长开—收缩"地自己漫，
 *     也不自己换片。静止时它就是一块深墨绿的实心板（+ 一行仪器读数）。
 *   · **只有指针能把照片"搅"出来**：指针进板 ⇒ 指针周围张开一块**有机形状的洞**，
 *     洞跟着指针走（带滞后，像液体被拽着），边缘持续流动变形；指针离开 ⇒ 洞收回去，
 *     板回到纯色。
 *   · **每次打开相册页随机一张照片**（只从**横幅**照片里抽）。
 *
 * ---------------------------------------------------------------------------
 * 本站的三处换算（站主 2026-10-01 拍板）
 *
 *   · 底层照片  → 相册页的横幅照片（manifest 的 1280 档），**每次打开随机一张**
 *   · 纯色      → **深墨绿**（照搬首页 .band 那支色，站内语汇一致），不是参考里的克莱因蓝
 *   · 文字      → 板内左下角的仪器读数（`mix-blend-mode: difference` ⇒ 墨绿底与照片上都可读）
 *
 *   ★ 板的**尺寸 = 照片的原尺寸比例**（`aspect-ratio: w / h`，由本脚本按抽中的照片设）。
 *     所以照片是**整张铺进板里的，不裁不拉伸**；也正因为如此只收横幅照片 ——
 *     竖幅会把页头这块小板撑成一个竖条，和"放在旁边"冲突。
 *
 * ---------------------------------------------------------------------------
 * 实现选择：Canvas2D，不是 SVG feTurbulence
 *
 *   feTurbulence + feDisplacementMap 代码更少、"液体"味更足，但滤镜是性能杀手。
 *   Canvas 方案里形状完全可控，每帧只做「96 个点的多边形 + clip + 一次 drawImage」。
 *
 *   ★ 板底那层深墨绿**不由 canvas 画** —— 它是容器的 CSS 背景。
 *     canvas 是**透明的**，只在形状里画照片 ⇒ 形状外"没有像素"，自然露出板底。
 *     这样每帧少一次全屏 fillRect，而且降级时板底照旧在。
 *     副作用（好的那种）：探针可以直接读 canvas 的 alpha 通道拿到形状轮廓 ——
 *     alpha>0 的连续区间就是"洞"。见 _probe/cdp-bath.mjs。
 *     ★ 对这一版特别关键：**没有指针时 alpha 应当整版为 0**（= 纯色），
 *       这条既是站主的口径，也是探针最好验的一条判据。
 *
 * ---------------------------------------------------------------------------
 * ★★ 两条本仓库踩过的坑，这里都按规矩避开
 *
 *   ① **不许"每帧固定系数"**（第十版弹簧那一课）：形状的时间基准是
 *      `performance.now()` 的**绝对值** t，不是"每帧 += 一个增量"；
 *      跟随弹簧与强度平滑都吃**真实 dt**。
 *      ⇒ 形状是 t 的确定函数：同一 t 下形状逐点相同，可跨加载逐点比对；
 *        且不随显示器刷新率变化。
 *
 *   ② **可见性不许押在动画上**：这块板是**装饰**，内容在网格里已经完整存在。
 *      所以整块板默认 `hidden`，脚本到位才解除；没有 JS 就没有它（不是"藏起来"），
 *      读屏也读不到它（aria-hidden）—— 不会出现"内容只在动画里"的情形。
 *
 * ---------------------------------------------------------------------------
 * 降级
 *
 *   reduced-motion ⇒ **静态整张照片**（不裁形、不跑 rAF、不响应指针）。
 *     ★ 为什么不是"留一块纯色"：静止用户没有搅动可得，纯色块就只是个空方块；
 *       而"显影完成"是这块装置**静止时最有信息量的那一帧**，且零运动。
 *   无 JS     ⇒ 整块不渲染（SSR 就带 hidden + aria-hidden）
 *   ≤767px    ⇒ 板缩到 min(64%, 240px)、轮廓采样点减半（搅动保留）
 *   视口外/切标签 ⇒ 停帧
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

  /* 洞 —— 只在指针周围出现的那一块 */
  const N_WIDE = 96;       // 轮廓采样点数（板小了，96 点间距 ≈ 6px，够平滑）
  const N_NARROW = 64;     // 窄视口减半
  const R_HOLE = 0.46;     // 半径 = 短边 × 0.46 ⇒ 直径 ≈ 短边的 0.92
  const R2_FINE = 0.85;    // 细褶：环上一圈 ≈ 5.3 个噪声格（五六个起伏）
  const AMP_FINE = 0.11;   // 细褶幅度（相对半径）
  const R2_LOBE = 0.30;    // 低频分量：≈ 2 个格
  const AMP_LOBE = 0.25;   // ★ 这一层才是"水渍"而不是"规整圆"的来源 ——
                           //   它让形状一头大一头小、整体歪斜；细褶只负责边缘的毛感。
                           //   对着抖音参考的抽帧（_probe/ref/liquid-reveal/t08.png）调过：
                           //   参考那块水渍的轮廓是明显偏心 + 一头大一头小，不是圆。
  /* ★ 边缘流动的速度。板从满宽（短边 300+）缩到页头这块小板（短边 ~190）后，
     同样的相位推进换算成像素只有原来的 1/3 ⇒ 照旧值会"看着像不动"。
     ★ 实测（_probe/cdp-bath.mjs --hold）：3.2e-4 时边界只有 1.6 px/s（太小，读成静止）；
       9e-4 ⇒ 约 5 px/s，看得出"液体在动"但不会跳。 */
  const PH_SPD = 9e-4;

  /* 进出：指针进 ⇒ 洞张开；离开 ⇒ 洞收回（收回更慢，像显影痕迹慢慢褪掉） */
  const TAU_IN = 130;      // 影响强度的平滑时间常数（ms，指数平滑）
  const TAU_OUT = 280;
  const PW_EPS = 0.004;    // 小于这个就算"没有指针" ⇒ 整版不画（纯色）

  /* ★ 跟随弹簧：洞被指针"拽"着走。
     滞后是"搅动"的来源 —— 指针快速划过时洞会落在后面、被拉出一个包；
     停手后它才慢慢贴上来。ζ<1 ⇒ 有一点点过冲，那是液体的手感。 */
  /* ★ 角频率要挑：太小 ⇒ 快速划过时洞整个落在指针后面（像没响应）；
     太大 ⇒ 洞硬贴着指针，"被拽着走"的手感全丢。
     稳态滞后 ≈ 2ζv/ω（v = 指针速度）⇒ 14/0.62 时，500 px/s 约落后 44 px、
     2300 px/s（甩一下）实测落后 60~70 px —— 板上明显拖尾，但洞始终还在指针脚下。 */
  const LAG_W = 14;        // 角频率（rad/s）⇒ 稳定时间 ~0.25 s
  const LAG_Z = 0.62;      // 阻尼比（1 = 临界阻尼，不过冲）

  /* 搅动：指针附近那段边界被**推开**（局部，不是整体充气） */
  const R_INF_K = 0.42;    // 影响半径 = 短边 × 这个系数
  const PUSH_K = 0.16;     // 最大推开距离（同上口径）

  const SWAP_MS = 700;     // 划过网格照片时的交叉淡入时长
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

  type Frame = { url: string; cap: string; album: string; w: number; h: number };

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
  let mx = 0, my = 0;                          // 指针（板内坐标）
  let cx = 0, cy = 0, cvx = 0, cvy = 0;        // 洞心（跟随弹簧的位置与速度）
  let pw = 0, pwT = 0;                         // 影响强度（实际值、目标值）
  let cur: HTMLImageElement | null = null, curUrl = '';
  let nxt: HTMLImageElement | null = null, nxtUrl = '';
  let mix = 1;                                 // 0 → 1：从 cur 淡入 nxt
  let list: Frame[] = [];
  let idx = 0;

  /* ---------------------------------------------------------------- 尺度 */

  const resize = () => {
    const r = cvs.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    W = r.width;
    H = r.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    // ★ 判"窄"要看**视口**，不是板宽：板现在是页头里的小板，宽永远 < 768
    N = window.innerWidth < 768 ? N_NARROW : N_WIDE;
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
    // 尺寸变了 ⇒ 指针/洞心坐标失效，强度归零（免得形状上突然鼓一个错位的包）
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
    ctx.globalAlpha = 1;
  };

  const render = (t: number) => {
    if (!W) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const im = cur;
    if (!im || !im.complete || !im.naturalWidth) return;

    /* reduced-motion：静止整张（不裁形、不流动、不响应指针）—— 见文件头 */
    if (reduce.matches) {
      drawCover(im, 1);
      return;
    }

    /* ★★ 站主的口径：**没有指针就只是一块纯色**。
       ⇒ 清屏之后直接返回，一个像素都不画（canvas 整版 alpha = 0，露出 CSS 板底）。 */
    if (pw <= PW_EPS) return;

    const ph = t * PH_SPD;
    const phL = ph * 0.45;   // 低频分量的相位推进更慢 ⇒ 两个分量不同步 ⇒ 形状持续变形
    const s = pw * pw * (3 - 2 * pw);          // 进出都平滑（不是线性淡入）
    const R = Math.min(W, H) * R_HOLE * s;
    const active = RINF > 1;

    for (let i = 0; i < N; i++) {
      // 细褶 + 低频偏斜：各自在环上采 2D 噪声，θ=0 与 2π 是同一点 ⇒ 闭合
      const k = 1
        + AMP_FINE * fbm2(COS[i] * R2_FINE + ph, SIN[i] * R2_FINE, hA)
        + AMP_LOBE * fbm2(COS[i] * R2_LOBE + phL, SIN[i] * R2_LOBE, hB);
      let x = cx + R * k * COS[i];
      let y = cy + R * k * SIN[i];

      /* ★ 搅动是**局部**的：只有指针附近那段边界被推开，不会变成"整块充气"。
         洞心是**滞后**于指针的（弹簧）⇒ 指针快速划过时，前缘落在影响半径内被拽出去，
         后缘不受影响 —— 这就是"搅动"的形状来源。停手后洞心贴上指针 ⇒ 推开量自然归零。 */
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

    ctx.save();
    ctx.beginPath();
    /* ★ 二次曲线经过相邻顶点的**中点**把轮廓平滑掉。
       直接 lineTo 会出锯齿：形状被压扁的区段里相邻顶点的 dy 只有 2~3 px，
       而噪声让 dx 能差 3 px ⇒ 折线在横向来回跳（肉眼就是边上一圈小毛刺）。 */
    ctx.moveTo((PX[0] + PX[2]) / 2, (PX[1] + PX[3]) / 2);
    for (let i = 1; i <= N; i++) {
      const j = i % N;
      const qx = PX[j * 2], qy = PX[j * 2 + 1];
      const m = (j + 1) % N;
      ctx.quadraticCurveTo(qx, qy, (qx + PX[m * 2]) / 2, (qy + PX[m * 2 + 1]) / 2);
    }
    ctx.closePath();
    ctx.clip();

    // ★ 先铺不透明的 cur 打底，再叠 alpha = mix 的 nxt ⇒ 才是**线性**交叉淡入
    //   （两张都用 alpha 叠会是 (1−m)² 的曲线，中段发暗）
    drawCover(im, 1);
    if (nxt && mix > 0 && nxt.complete && nxt.naturalWidth) drawCover(nxt, mix);
    ctx.restore();
  };

  /* ---------------------------------------------------------------- 帧循环 */

  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
    /* ★ 停帧时把没走完的交叉淡入**直接落定**：这时板已经是纯色、没人看得见过渡，
       留着半个 mix 会在下次指针进来时接着播（观感是"新照片从旧照片里慢慢浮出来"）。 */
    if (nxt) { cur = nxt; curUrl = nxtUrl; nxt = null; nxtUrl = ''; }
    mix = 1;
    pw = 0;
    // ★ 停帧必须补一帧"全清" ⇒ 板回到纯色。少了这一步会留下最后一帧的形状残影。
    if (W) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
    }
  };

  const start = () => {
    if (running || reduce.matches || !W) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  /* 跑不跑 rAF，只看"有没有指针"：没指针就不该烧电（也不该有洞） */
  const sync = () => {
    const want = onScreen && !document.hidden && !reduce.matches && (pwT > 0 || pw > PW_EPS);
    if (want) start();
    else stop();
  };

  const frame = (now: number) => {
    const dt = Math.min(DT_MAX, Math.max(0, now - last));
    last = now;

    if (dt > 0) {
      const ds = dt / 1000;
      // 影响强度：指数平滑的**帧率无关**写法（1 − e^(−dt/τ)），不是每帧乘固定系数
      const tau = pwT > pw ? TAU_IN : TAU_OUT;
      pw += (pwT - pw) * (1 - Math.exp(-dt / tau));
      // 跟随弹簧：半隐式欧拉 + **真实 dt**（"每帧固定系数" ⇒ 手感随刷新率变）
      const ax = LAG_W * LAG_W * (mx - cx) - 2 * LAG_Z * LAG_W * cvx;
      const ay = LAG_W * LAG_W * (my - cy) - 2 * LAG_Z * LAG_W * cvy;
      cvx += ax * ds;
      cvy += ay * ds;
      cx += cvx * ds;
      cy += cvy * ds;
      if (mix < 1) {
        mix = Math.min(1, mix + dt / SWAP_MS);
        if (mix >= 1) { cur = nxt; curUrl = nxtUrl; nxt = null; nxtUrl = ''; }
      }
    }

    // 收干净了就停 ⇒ 板回到纯色（这一版**没有**"自己在动"这回事）
    if (pw <= PW_EPS && pwT === 0) { stop(); return; }

    render(now);
    raf = requestAnimationFrame(frame);
  };

  /* ---------------------------------------------------------------- 内容 */

  /* 每次都重新收集 ⇒ 相册筛选（只改 figure 的 hidden）自动生效，不用跨脚本接线。
     ★ 只收**横幅**（w > h）：板要按照片原比例裁形，竖幅会把页头这块小板撑成竖条。 */
  const collect = (): Frame[] =>
    Array.from(document.querySelectorAll<HTMLElement>('.wf figure:not([hidden])'))
      .map((fig) => {
        const a = fig.querySelector<HTMLAnchorElement>('a.frame');
        const im = fig.querySelector<HTMLImageElement>('img');
        return {
          url: a?.getAttribute('href') ?? '',
          cap: fig.dataset.cap ?? '',
          album: fig.querySelector('figcaption span')?.textContent ?? '',
          w: Number(im?.getAttribute('width') ?? 0),
          h: Number(im?.getAttribute('height') ?? 0),
        };
      })
      .filter((f) => f.url && f.w > 0 && f.h > 0 && f.w > f.h);

  /* ★ 本文件**唯一**允许的随机源：每次打开随机抽一张照片（站主要求）。
     ★★ 形状本身必须是 t 的确定函数 ⇒ 随机**只准出现在这单独一行**，别处一律不许
     （否则同 t 逐点比对 —— 形状类验收唯一的可靠手段 —— 直接失效）。 */
  const pickRandom = (l: Frame[]) => l[Math.floor(Math.random() * l.length)] ?? null;

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

  /* 定下这一张（改图源 + 改板的形状 + 改读数）。★ 板的形状跟着照片走 ⇒ 换照片必调 */
  const choose = (f: Frame) => {
    nxt = null;
    nxtUrl = '';
    mix = 1;
    idx = list.indexOf(f);
    curUrl = f.url;
    cur = load(curUrl);
    host.style.setProperty('--bath-ar', `${f.w} / ${f.h}`);
    read(f, idx + 1, list.length, '');
  };

  /* 抽一张（打开时用；bfcache 回来时也用） */
  const openRandom = () => {
    list = collect();
    if (!list.length) return false;
    const f = pickRandom(list);
    if (!f) return false;
    choose(f);
    return true;
  };

  /* ---------------------------------------------------------------- 接线 */

  const toLocal = (e: PointerEvent) => {
    const r = cvs.getBoundingClientRect();
    mx = e.clientX - r.left;
    my = e.clientY - r.top;
  };

  host.addEventListener('pointerenter', (e) => {
    toLocal(e);
    // 洞是从"没有"长出来的 ⇒ 洞心直接落在指针上（否则会从上一处位置飞过来）
    if (pw <= PW_EPS) { cx = mx; cy = my; cvx = 0; cvy = 0; }
    if (!reduce.matches) pwT = 1;
    sync();
  });
  host.addEventListener('pointermove', (e) => {
    toLocal(e);
    if (pwT === 0 && !reduce.matches) pwT = 1;   // 指针已在板内但没触发过 enter（例如刚露面）
    sync();
  });
  host.addEventListener('pointerleave', () => {
    pwT = 0;      // ⇒ 洞收回去，收完自动停帧，板回到纯色
    sync();
  });

  /* 与页面互动：划过网格里任意一张 ⇒ 板里淡入那一张（松耦合 —— 只读 DOM，不引用另一个脚本） */
  for (const fig of document.querySelectorAll<HTMLElement>('.wf figure')) {
    fig.addEventListener('pointerenter', () => {
      if (reduce.matches) return;
      const a = fig.querySelector<HTMLAnchorElement>('a.frame');
      const url = a?.getAttribute('href');
      if (!url || url === curUrl) return;
      /* ★ 竖幅不接（站主：「只要横着的照片，不放竖着的」）：
         板的形状是照着开场那张照片定死的，换一张竖幅进来就只能裁 —— 那会破坏
         「整张铺进板里、不裁不拉伸」这条口径。所以划过竖幅时板不动。 */
      const im = fig.querySelector<HTMLImageElement>('img');
      const fw = Number(im?.getAttribute('width') ?? 0);
      const fh = Number(im?.getAttribute('height') ?? 0);
      if (!(fw > 0 && fh > 0 && fw > fh)) return;
      list = collect();
      idx = Math.max(0, list.findIndex((f) => f.url === url));
      show(
        {
          url,
          cap: fig.dataset.cap ?? '',
          album: fig.querySelector('figcaption span')?.textContent ?? '',
          w: fw,
          h: fh,
        },
        ' · 悬停',
      );
      if (!running) start();   // 交叉淡入需要帧；板可能正停在"纯色"上
    });
  }

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => {
      if (!resize()) return;
      if (running) last = performance.now();
      else render(performance.now());
    }, 160);
  });

  reduce.addEventListener('change', () => {
    pw = 0;
    pwT = 0;
    render(performance.now());
    sync();
  });
  document.addEventListener('visibilitychange', sync);
  const io = new IntersectionObserver((es) => {
    for (const e of es) onScreen = e.isIntersecting;
    sync();
  }, { rootMargin: '160px' });
  io.observe(host);

  /* 首张就绪再露面 —— 否则会先看到一块纯墨绿在页头 */
  const ready = (im: HTMLImageElement) =>
    new Promise<void>((res) => {
      if (im.complete && im.naturalWidth) return res();
      im.addEventListener('load', () => res(), { once: true });
      im.addEventListener('error', () => res(), { once: true });
      setTimeout(res, 3000);   // 兜底：网络慢也照常露面
    });

  /* ★ bfcache 回来的页面**不会重新执行脚本** ⇒ 不补这一下，站主要的
     「每次打开相册页随机一张」在"从文章返回相册"那条路径上就不成立。
     ★ 判据是 `persisted`：普通加载会自己走上面的初始化，别在这里重抽（会闪）。 */
  window.addEventListener('pageshow', (e) => {
    if (!(e as PageTransitionEvent).persisted) return;
    if (!openRandom()) return;
    resize();                        // 比例可能变了 ⇒ 板高变，重算画布尺寸
    if (running) last = performance.now();
    else render(performance.now());
  });

  (async () => {
    if (!openRandom()) return;       // 没有横幅照片 ⇒ 板不出现（无 JS 同款结局）
    const im = cur;
    if (!im) return;
    await ready(im);
    host.hidden = false;             // 必须先露面再量尺寸（display:none 时 rect 全是 0）
    if (!resize()) { host.hidden = true; return; }
    render(performance.now());
    sync();
  })();
})();
