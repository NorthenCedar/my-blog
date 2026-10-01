/* =============================================================================
 * 相册页 · 显影板（DEVELOP PLATE）—— 页头右侧那块小板
 *
 * ★★ 站主 2026-10-01 改口径（这一版的行为与上一版**相反**，别照旧版理解）：
 *
 *   · **没有指针 = 一块纯色**。板里**不存在洞**，形状不是"长开—收缩"地自己漫，
 *     也不自己换片。静止时它就是一块深墨绿的实心板（+ 一行手写花体字）。
 *   · **只有指针能把照片"搅"出来**：指针进板 ⇒ 指针周围张开一块**有机形状的洞**，
 *     洞跟着指针走（带滞后，像液体被拽着），边缘持续流动变形；指针离开 ⇒ 洞收回去，
 *     板回到纯色。
 *   · **每次打开相册页随机一张照片**（只从**横幅**照片里抽）。
 *
 * ★★★ 同日第三轮（站主给了参考 https://lowkeytp.art/liquid-reveal/ ）：
 *
 *   · 洞改成**涂抹的擦痕**（参考原话：「也可以直接在画面上涂抹」）：
 *     指针走过的路径**留在板上**，不是"移开就没了"；
 *     停留一段时间后再慢慢褪回纯色（参考的旋钮叫「显影停留时间」，默认 **2.8s**）。
 *     实现 = 一张离屏的擦痕蒙版：每帧在指针处盖一个有机形状的笔触，
 *     同时整版按 `1 − e^(−dt/τ)` 衰减 —— 早擦的那段先褪，于是擦痕有"先后"。
 *   · 笔触变小（参考旋钮「笔触大小」）：洞的直径从短边的 0.92 收到 **0.44**。
 *   · 板上那行**手写花体 "liquid-reveal" 擦不掉** —— 它是 canvas **外面**的 DOM
 *     （参考里画面文字也是压在显影层之上的，不参与显影），canvas 怎么擦都擦不到它。
 *
 * ---------------------------------------------------------------------------
 * 本站的三处换算（站主 2026-10-01 拍板）
 *
 *   · 底层照片  → 相册页的横幅照片（网格档 800），**每次打开随机一张**
 *   · 纯色      → **深墨绿**（照搬首页 .band 那支色，站内语汇一致），不是参考里的克莱因蓝
 *   · 文字      → 板中央的手写花体 "liquid-reveal"（DOM 层，压在显影之上，不参与显影）
 *
 *   ★★ 同日第四轮：板从"页头右侧的小板"改成**相册页的整屏首屏**（站主原话：
 *     「不如直接把这个放在相册页整屏，鼠标往下滚的时候才看到相册页的内容」）。
 *      ⇒ 板的尺寸**不再**跟着照片比例走（整屏就是整屏），照片按 `cover` 铺满（会裁）。
 *      ⇒ 原来"不裁不拉伸"那条口径随之作废；"只收横幅"保留 —— 整屏是横的，
 *        竖幅铺进来只能裁成中间一条。
 *      ⇒ 笔触的尺度基准（短边）从 185 px 变成 800 px ⇒ R_HOLE 必须按参考站的比例重算。
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
 *   视口外/切标签 ⇒ 停帧（★ 滚过首屏就自动停 —— 整屏装置的耗电只发生在它可见时）
 * ========================================================================== */
(() => {
  const host = document.querySelector<HTMLElement>('[data-bath]');
  const cvs = host?.querySelector<HTMLCanvasElement>('[data-bath-cv]');
  if (!host || !cvs) return;
  const ctx = cvs.getContext('2d');
  if (!ctx) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------- 参数 */

  const TAU2 = Math.PI * 2;

  /* 洞 —— 只在指针周围出现的那一块 */
  const N_WIDE = 96;       // 轮廓采样点数（板小了，96 点间距 ≈ 6px，够平滑）
  const N_NARROW = 64;     // 窄视口减半
  /* ★★ 笔触大小**照抄参考站**（lowkeytp.art/liquid-reveal）：它的旋钮「笔触大小」默认
     **82**，画布 1280×720 ⇒ 82 / 720 ≈ **短边的 0.114**（站主原话：「跟 lowkeytp 保持一致就好」）。
     ⇒ 半径 = 短边 × 0.057。整屏（1280×800）时一笔的直径 ≈ 91 px。
     ★★ 注意这条**取代**了上一版"洞的直径 = 短边 0.92"那个数：板从页头小板变成**整屏首屏**后，
        尺度基准（短边）从 185 px 变成 800 px，系数必须跟着换，否则一笔就有半屏大。
     ★ 搅动的两个尺度按同一比例（见 R_INF_K / PUSH_K），否则"影响半径 > 笔触半径"⇒
       局部鼓包变成整块被推走。 */
  const R_HOLE = 0.057;    // 笔触半径 = 短边 × 0.057 ⇒ 一笔直径 ≈ 短边的 0.114（= 参考的 82/720）
  /* ★★ 小板（手机档）必须**另算一档**：上面的比例是按**整屏**定的（短边 ≈ 800 px ⇒ 一笔 91 px），
     照搬到手机那块 300×200 的小板上只有 17 px —— 手指根本擦不动（站主：触屏涂抹不习惯）。
     0.22 是早先"页头小板"那版调出来的数，直接沿用。
     ★ 判定用**板的短边**，不是视口：同一个视口下两种版面尺寸差 4 倍，按视口分会判错。 */
  const R_HOLE_SMALL = 0.22;
  const SMALL_PLATE = 420;   // 短边小于这个 ⇒ 按小板算
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
  /* ★ 角频率要挑：太小 ⇒ 快速划过时笔触整个落在指针后面（像没响应）；
     太大 ⇒ 硬贴着指针，"被拽着走"的手感全丢。
     ★★ 这一版笔触变小 + 变成"涂抹"了 ⇒ 滞后太大就变成"笔不跟着手走"（涂抹最忌讳这个）。
     所以比上一版调紧：26/0.65 ⇒ 稳态滞后 ≈ 2ζv/ω，500 px/s 落后约 25 px、
     甩一下（2300 px/s）约 115 px（这时拖尾正好由**擦痕**接手，不是靠弹簧硬撑）。 */
  const LAG_W = 26;        // 角频率（rad/s）⇒ 稳定时间 ~0.15 s
  const LAG_Z = 0.65;      // 阻尼比（1 = 临界阻尼，不过冲）

  /* 搅动：指针附近那段边界被**推开**（局部，不是整体充气） */
  /* ★ 这两个必须跟着 R_HOLE 一起收（同上）：比值 R_INF/R = 0.42/0.46 ≈ 0.91 保持不变
     ⇒ 洞缩小后搅动仍是"局部鼓一个包"，不会变成"整块被推走"。 */
  const R_INF_K = 0.05;    // 影响半径 = 短边 × 这个系数（≈ 笔触半径的 0.9）
  const PUSH_K = 0.019;    // 最大推开距离（同上口径；≈ 笔触半径的 1/3，与改前手感一致）

  /* ★★ 擦痕的停留（参考 lowkeytp.art 那个旋钮「显影停留时间」，它默认 2.8s）
     · 实现：整版蒙版每帧按 `1 − e^(−dt/τ)` 衰减（destination-out）⇒ 蒙版 alpha 指数下降。
     · ★★ 蒙版在合成时**平方**了一次（见 render ③）⇒ 观感上的时间常数是 **τ/2**。
       配 τ = 1500 ⇒ 有效 750 ms，擦痕约 **2.9 s** 褪到看不见（= 参考站那个 2.8 s）。
     · TRAIL_EPS 是"判褪尽"的阈值，它必须跟着平方一起算：可见阈值取 α_eff ≈ 0.02
       ⇒ 蒙版 0.14（0.14² ≈ 0.02）⇒ 停帧与"看不见"落在同一时刻（实测都在 ~2.9 s）。
     · ★ 必须吃真实 dt（"每帧固定系数" ⇒ 停留时长随刷新率变，60Hz 与 120Hz 差一倍）。
     · ★ 早擦的那段先褪：衰减是**逐帧乘**的，先盖上的笔触乘的次数多 ⇒ 擦痕有先后，
       这是"擦玻璃"该有的样子；反过来（全场一起淡）就看不出路径了。 */
  const TRAIL_TAU = 1500;  // 停留时间常数（ms；观感上是它的**一半** —— 蒙版在合成时平方了）
  const TRAIL_EPS = 0.14;  // 低于这个就当"褪尽了" ⇒ 清屏 + 停帧（0.14² ≈ 0.02 = 看不见）

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

  /* ★ 只有 url / w / h：板里那行读数已经删掉了（站主 2026-10-01：「删掉左下角的字」），
     照片说明与专辑名**不再进这个脚本** —— 留着就是没人读的死字段。 */
  type Frame = { url: string; w: number; h: number };

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
  let RB = R_HOLE;                            // 当前笔触比例（resize 里按板的短边选档）

  /* ★★ 擦痕蒙版：一张和板同尺寸的离屏 canvas，只有**擦过的地方**有 alpha。
     每帧两件事 —— ① 整版乘性衰减（destination-out）② 在指针处盖一个有机形状的笔触。
     最后把照片按这张蒙版"抠"出来（destination-in）⇒ 擦过的地方才露出照片。
     ★★ 为什么必须离屏：擦痕是**累积**的，主 canvas 每帧清屏重画，存不住路径。 */
  const mk = document.createElement('canvas');
  const mkx = mk.getContext('2d');

  let raf = 0, running = false, onScreen = true, last = 0;
  let mx = 0, my = 0;                          // 指针（板内坐标）
  let cx = 0, cy = 0, cvx = 0, cvy = 0;        // 洞心（跟随弹簧的位置与速度）
  let pw = 0, pwT = 0;                         // 影响强度（实际值、目标值）
  let trail = 0;                               // 擦痕残留（最新一笔的强度；1 = 刚擦过）
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
    // 蒙版同尺寸（也按 dpr）⇒ 擦痕不会被缩放糊掉
    mk.width = cvs.width;
    mk.height = cvs.height;
    mkx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mkx.clearRect(0, 0, W, H);
    COS = new Float32Array(N);
    SIN = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const th = (i / N) * TAU2;
      COS[i] = Math.cos(th);
      SIN[i] = Math.sin(th);
    }
    PX = new Float32Array(N * 2);
    /* ★ 笔触分两档：整屏走参考站那档，小板（手机）走另一档 —— 见 R_HOLE_SMALL。 */
    RB = Math.min(W, H) < SMALL_PLATE ? R_HOLE_SMALL : R_HOLE;
    RINF = Math.min(W, H) * R_INF_K;
    PUSH = Math.min(W, H) * PUSH_K;
    // 尺寸变了 ⇒ 指针/洞心坐标失效，强度归零（免得形状上突然鼓一个错位的包）；
    // 蒙版尺寸也变了 ⇒ 擦痕作废（旧坐标的擦痕会出现在错误的位置）
    pw = 0;
    pwT = 0;
    trail = 0;
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

  /* ★ 在指针（洞心）处盖一个有机形状的笔触 —— 擦痕就是这些笔触的并集。
     ★ 软边（径向渐变）：实心到 0.70R、外围渐隐 ⇒ 边界像"雾被擦开"，不是硬边圆。
     ★ 形状**每帧都在变**（噪声相位跟着 t 走）⇒ 划一道出去，带子的两边是起伏的，
       不会是"一条等宽的规整笔道"—— 站主这条要求是"不能太规整"。 */
  const stamp = (t: number) => {
    const ph = t * PH_SPD;
    const phL = ph * 0.45;   // 低频分量的相位推进更慢 ⇒ 两个分量不同步 ⇒ 形状持续变形
    const s = pw * pw * (3 - 2 * pw);          // 进出都平滑（不是线性淡入）
    const R = Math.min(W, H) * RB * s;
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

    mkx.save();
    mkx.beginPath();
    /* ★ 二次曲线经过相邻顶点的**中点**把轮廓平滑掉。
       直接 lineTo 会出锯齿：形状被压扁的区段里相邻顶点的 dy 只有 2~3 px，
       而噪声让 dx 能差 3 px ⇒ 折线在横向来回跳（肉眼就是边上一圈小毛刺）。 */
    mkx.moveTo((PX[0] + PX[2]) / 2, (PX[1] + PX[3]) / 2);
    for (let i = 1; i <= N; i++) {
      const j = i % N;
      const qx = PX[j * 2], qy = PX[j * 2 + 1];
      const m = (j + 1) % N;
      mkx.quadraticCurveTo(qx, qy, (qx + PX[m * 2]) / 2, (qy + PX[m * 2 + 1]) / 2);
    }
    mkx.closePath();
    mkx.clip();
    // 软边：中心实心、外围渐隐（不是 0，免得笔触边缘永远擦不干净）
    const g = mkx.createRadialGradient(cx, cy, R * 0.3, cx, cy, Math.max(1, R * 1.04));
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0.55)');   // ★ 蒙版要平方 ⇒ 终点抬到 0.55（0.55² ≈ 0.30）
    mkx.fillStyle = g;
    mkx.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4);
    mkx.restore();
    mkx.globalCompositeOperation = 'source-over';
  };

  const render = (t: number, dt = 0) => {
    if (!W) return;

    /* ① 擦痕衰减：整版乘性衰减 ⇒ **早擦的那段先褪**（e^(−dt/τ)，帧率无关）。
       ★ 每帧都做，不管有没有指针 —— 指针停着不动时，早先划过的路径照样在褪。 */
    if (dt > 0) {
      mkx.globalCompositeOperation = 'destination-out';
      mkx.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt / TRAIL_TAU)})`;
      mkx.fillRect(0, 0, W, H);
      mkx.globalCompositeOperation = 'source-over';
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const im = cur;
    if (!im || !im.complete || !im.naturalWidth) return;

    /* reduced-motion：静止整张（不裁形、不流动、不响应指针）—— 见文件头 */
    if (reduce.matches) {
      drawCover(im, 1);
      return;
    }

    /* ② 有指针就在当前位置盖一笔 */
    if (pw > PW_EPS) {
      stamp(t);
      trail = 1;
    }

    /* ★★ 站主的口径：**没有指针（且擦痕褪尽）就只是一块纯色**。
       ⇒ 清屏之后直接返回，一个像素都不画（canvas 整版 alpha = 0，露出 CSS 板底）。
       ★ 注意与上一版的差别：擦痕还在的时候**要继续画**（那就是"停留一段时间"）。 */
    if (trail <= TRAIL_EPS) {
      mkx.clearRect(0, 0, W, H);
      return;
    }

    // ★ 先铺不透明的 cur 打底，再叠 alpha = mix 的 nxt ⇒ 才是**线性**交叉淡入
    //   （两张都用 alpha 叠会是 (1−m)² 的曲线，中段发暗）
    drawCover(im, 1);
    if (nxt && mix > 0 && nxt.complete && nxt.naturalWidth) drawCover(nxt, mix);
    /* ③ 照片按擦痕蒙版抠出来 ⇒ 只有擦过的地方露出照片。
       ★★ 蒙版**乘两次**（destination-in = αd × αs ⇒ 两遍就是 α²）：
       实测（_probe/cdp-bath.mjs --wipe）单乘一遍时擦痕的 α 会**卡在 42 不再降** ——
       蒙版是 8 位 alpha，而衰减是**乘性**的：α 越小、每帧的减量 `α·αs` 越小，
       减到不足 0.5 时四舍五入把它原样留下来 ⇒ 42/255 ≈ 17% 的一道鬼影僵在那里
       整整两秒，然后才被"褪尽"那一步清掉 —— 观感是"擦痕淡不下去，突然消失"。
       平方之后：僵住那档 0.165² ≈ 0.027（2.7%，看不见了），且整条衰减曲线在中段
       也更陡 ⇒ 擦痕是"慢慢淡掉"而不是"淡到一半停住再突然没了"。
       ★ 软边的渐变终点因此要从 0.28 抬到 0.55（0.55² ≈ 0.30 ≈ 原值）⇒ 手感不变。 */
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mk, 0, 0, W, H);
    ctx.drawImage(mk, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
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
    pwT = 0;
    trail = 0;
    // ★ 停帧必须补一帧"全清" ⇒ 板回到纯色。少了这一步会留下最后一帧的形状残影。
    //   ★★ 蒙版也要一起清：擦痕是**累积**的，只清主画布的话下次进来会带着上次没褪完的痕。
    if (W) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      mkx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mkx.clearRect(0, 0, W, H);
    }
  };

  const start = () => {
    if (running || reduce.matches || !W) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  /* 跑不跑 rAF，看"有没有指针"**或**"擦痕还在褪"：
     ★ 只看指针的话，指针一离开就停帧 ⇒ 擦痕会**冻在最后一帧**上，永远不会褪回纯色
       （那正是"停留一段时间"这条要求的反面）。 */
  const sync = () => {
    const want =
      onScreen && !document.hidden && !reduce.matches
      && (pwT > 0 || pw > PW_EPS || trail > TRAIL_EPS);
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
      /* ★ 擦痕残留：与蒙版用**同一个**时间常数衰减（帧率无关）⇒ trail 就是"最新一笔
         还剩多少"。它只用来决定"还要不要继续画 / 要不要停帧"。 */
      trail *= Math.exp(-dt / TRAIL_TAU);
    }

    // 指针走了**且**擦痕褪尽 ⇒ 停 ⇒ 板回到纯色（这一版**没有**"自己在动"这回事）
    if (pw <= PW_EPS && pwT === 0 && trail <= TRAIL_EPS) { stop(); return; }

    render(now, dt);
    raf = requestAnimationFrame(frame);
  };

  /* ---------------------------------------------------------------- 内容 */

  /* 每次都重新收集 ⇒ 相册筛选（只改 figure 的 hidden）自动生效，不用跨脚本接线。
     ★ 只收**横幅**（w > h）：整屏是横的，竖幅铺进来只能裁成中间一条，认不出是什么。
     ★★ 图源用**网格档（800）**那张（`img` 的 src），**不是**灯箱档（1280，`a.frame` 的 href）：
        1280 档单张能到 **486 KB**，线上实测某张图 842 ms 才到、更重的要好几秒
        ⇒ 那几秒里指针**擦不出任何东西**（`drawCover` 看 `complete`，没图就不画）。
        ★ 整屏了要不要换 1280：**不换** —— 擦出来的只是一条一两百 px 宽的带子，
          800 档在 dpr 2 下也够，而换回大图就要重新背上那段空窗。 */
  const collect = (): Frame[] =>
    Array.from(document.querySelectorAll<HTMLElement>('.wf figure:not([hidden])'))
      .map((fig) => {
        const im = fig.querySelector<HTMLImageElement>('img');
        return {
          url: im?.getAttribute('src') ?? '',
          w: Number(im?.getAttribute('width') ?? 0),
          h: Number(im?.getAttribute('height') ?? 0),
        };
      })
      .filter((f) => f.url && f.w > 0 && f.h > 0 && f.w > f.h);

  /* ★ 本文件**唯一**允许的随机源：每次打开随机抽一张照片（站主要求）。
     ★★ 形状本身必须是 t 的确定函数 ⇒ 随机**只准出现在这单独一行**，别处一律不许
     （否则同 t 逐点比对 —— 形状类验收唯一的可靠手段 —— 直接失效）。 */
  const pickRandom = (l: Frame[]) => l[Math.floor(Math.random() * l.length)] ?? null;

  const show = (f: Frame) => {
    if (!f || f.url === curUrl) return;
    nxtUrl = f.url;
    nxt = load(f.url);
    mix = 0;
  };

  /* 定下这一张（换图源 + 设板的比例）
     ★ --bath-ar 只在**手机档**用得上（手机是"页头旁边的小板"，高按照片原比例）；
       桌面整屏不用它，但设了没有副作用，且省得两条支路分开维护。 */
  const choose = (f: Frame) => {
    nxt = null;
    nxtUrl = '';
    mix = 1;
    idx = list.indexOf(f);
    curUrl = f.url;
    cur = load(curUrl);
    host.style.setProperty('--bath-ar', `${f.w} / ${f.h}`);
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
      const im = fig.querySelector<HTMLImageElement>('img');
      const url = im?.getAttribute('src');            // 同 collect()：走 800 档
      if (!url || url === curUrl) return;
      /* ★ 竖幅不接（站主：「只要横着的照片，不放竖着的」）：
         整屏是横的，竖幅铺进来只能裁成中间一条。所以划过竖幅时板不动。 */
      const fw = Number(im?.getAttribute('width') ?? 0);
      const fh = Number(im?.getAttribute('height') ?? 0);
      if (!(fw > 0 && fh > 0 && fw > fh)) return;
      list = collect();
      idx = Math.max(0, list.findIndex((f) => f.url === url));
      show({ url, w: fw, h: fh });
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

  /* 一次性的"图到了再做点什么"（**只在 reduced-motion 那条路上用**，见下面的注释） */
  const onceImg = (im: HTMLImageElement, cb: () => void) => {
    if (im.complete && im.naturalWidth) { cb(); return; }
    im.addEventListener('load', cb, { once: true });
    im.addEventListener('error', cb, { once: true });
  };

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

  /* ★ 这里**不等照片下载完**：静止态本来就一个像素都不画（纯色），
     等图只会让板在慢网络下晚好几秒才出现（线上实测 ~4 s 时板还没露面）。
     照片迟到没有副作用 —— 指针进来时 drawCover 自己会看 `complete`。 */
  if (openRandom()) {                // 没有横幅照片 ⇒ 板不出现（与无 JS 同款结局）
    host.hidden = false;             // 必须先露面再量尺寸（display:none 时 rect 全是 0）
    if (!resize()) host.hidden = true;
    else {
      render(performance.now());
      sync();
      /* ★★ 唯一要"等图"的地方：reduced-motion 是静态整张、且**不跑 rAF**
         ⇒ 图要是晚到（线上实测过），这一帧就白画、之后再也没有重画的机会，
         静止用户看到的是一块**空的深色板**（正好把这条降级的正解丢掉了）。
         补一次 one-shot：图到了再画那一帧。 */
      if (reduce.matches && cur) onceImg(cur, () => render(performance.now()));
    }
  }
})();
