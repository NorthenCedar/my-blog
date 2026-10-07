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
 * ★★★ 同日第五轮（站主：「打开相册那个直接顶头，把导航栏什么的直接放在上面，
 *   另外学一下 lowkeytp.art/liquid-reveal/ 是怎么处理鼠标上去的效果，做到和它一样」）：
 *
 *   · **板顶到页面最顶端**（不再让出顶栏那 3.4rem）：顶栏改成 absolute 浮在板上
 *     （它本来就是半透明毛玻璃 ⇒ 浮在深墨绿板上正好）。见 gallery/index.astro。
 *   · **鼠标上去时多一个跟着手的白圈**（参考站的 `.pointer-dot`）—— 见 markDot()。
 *   · ★★ 顺手纠正三处**照抄错了**的参考站参数（都是扒它 JS 才发现的）：
 *       ① **笔触半径**：我上一版按"旋钮 82 是直径 / 720"推成短边的 0.057；
 *          它的 shader 里其实是 `size*1.35/height` = **画面高度的 0.15375**
 *          ⇒ 上一版比它**小 2.7 倍**。
 *       ② **跟随**：我用的是二阶弹簧（有过冲）；它是一阶指数平滑 `1−e^(−t·18)`（不过冲）。
 *       ③ **形状**：它只有两个 sin（5 瓣 + 9 瓣），我用的是两层 fbm 噪声。
 *     ⇒ 三处现在全部照抄它的原文，细褶那层 0.06 是本站补的（它没有 display 层的 fbm 边缘）。
 *
 * ★★★ 同日第六轮（站主：「鼠标扫过的地方画面出来的但边缘还在动像水一样，
 *   过了一到两秒就跟着路径回来了且画面也会回到纯色，整个观感像水一样」）：
 *
 *   ⇒ ★★ 上一版**漏了参考站最核心的一环**：它的密度场每帧都被一个**流场输运**
 *     （sim shader 里的半拉格朗日回溯）。擦痕不是"盖上去就冻在那儿"，而是被水流
 *     一直推着走、边缘一直在扭 —— **"像水一样"的全部来源就在这一行**。
 *
 *     它的 sim shader 原文（_probe/ref/lr-app.js）：
 *         vec2 flow = vec2(a, -b) * .5;                    // curl noise
 *         flow += velocity * vec2(aspect,1.) * influence * .18;
 *         vec2 sampleUv = uv - flow * motion / vec2(aspect,1.) * dt;
 *         float density = texture2D(field, clamp(sampleUv,0.,1.)).r;   // ★ 输运
 *         density = max(0., density - dt/life);                        // ★ 线性衰减
 *         float brush = 1. - smoothstep(.45, 1.2, d);
 *         density = max(density, brush*down);
 *     它的 display shader 原文：
 *         vec2 q  = vec2(fbm(p*7 + vec2(time*.28,0)), fbm(p*7 + vec2(8,-time*.22))) - .5;
 *         vec2 at = clamp(uv + q*.055*motion/vec2(aspect,1.), 0., 1.);
 *         float edge = fbm(p*22. + q*3. + time*.12);
 *         float revealed = smoothstep(.19, .215, d + (edge-.5)*.15*motion);
 *
 *   ★★ 三条必须记住的（每一条都是"上一版为什么不像"的答案）：
 *     ① **衰减是线性的**（`− dt/life`），不是上一版那个乘性 `× e^(−dt/τ)`。
 *        线性衰减 + 极窄阈值 ⇒ 退去时是**等值线向内收缩**（边缘先消失、往回收），
 *        不是整块一起淡 ⇒ 这才是"跟着路径回来"的观感。
 *        ★ 顺带把上一版那个 8 位 alpha 的衰减下限（α 卡在 42 的鬼影）一并解决了：
 *          线性减到 0 就是 0，蒙版**不需要再平方**。
 *     ② **阈值带只有 0.025**（0.19 → 0.215）⇒ 边界是**硬**的。它那种"破碎的水渍边"
 *        来自 display 那层 fbm 扰动（±0.075），不是软边渐变 —— 上一版靠径向渐变做
 *        软边，正好把"水"的观感抹平了。
 *     ③ 场每帧被流场**输运**（advection）⇒ 擦痕自己会漂、会扭、边缘一直在动。
 *
 *   ★★ 为什么本站不直接用 WebGL 照抄：本装置的其余部分（随机换片、交叉淡入、
 *      花体字、颗粒、降级、探针）全都建在 Canvas2D 上，换成 GL 要连探针一起重写
 *      （WebGL canvas 读不了 getImageData）。⇒ 用 CPU 跑同一个场，见下面「性能」。
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

  /* 笔触 —— 只在指针周围出现的那一块 */
  /* ★★★ 笔触大小**照抄参考站 lowkeytp.art/liquid-reveal/ 的 shader 原文**
     （站主 2026-10-01：「学一下它是怎么处理鼠标上去的效果，做到和它一样」）。
     从它的 JS（_probe/ref/lr-app.js）里扒出来的原文是：
         this.uniform(a, "radius", this.size * 1.35 / this.height);   // size=82, height=720
         float d = length(off) / (radius * irregular);
         float brush = 1.0 - smoothstep(0.45, 1.2, d);
     ⇒ **半径 = 82 × 1.35 / 720 = 画面高度的 0.15375**；实心核心到 0.45R，外围渐隐到 1.2R。
     ★★ 三个必须记住的点：
        ① 单位是**画面高度**，不是短边 —— 上一版我按"旋钮 82 是直径、82/720=0.114 再折半"
           推成短边的 0.057，**比参考站小了 2.7 倍**（这就是"跟参考站不一样"的第一因）。
           整屏 1280×800 上：参考站一笔可见直径 ≈ 0.369×800 = **295 px**，上一版只有 91 px。
        ② 82 那个旋钮**不是像素**，shader 里还要 ×1.35 ⇒ 别再拿它跟画布尺寸直接比。
        ③ 笔触写进的是**密度场**（uv 单位）⇒ 半径直接就是 RB，不需要再乘板高。 */
  const RADIUS_K = 0.15375;  // 笔触半径 = **画面高度** × 0.15375（= 参考站 82 × 1.35 / 720）
  const CORE_K = 0.45;       // 实心核心到 0.45R（参考站 smoothstep 的下沿）
  const FADE_K = 1.2;        // 外围渐隐到 1.2R（参考站 smoothstep 的上沿）
  /* ★★ 小板（手机档）必须**另算一档**：整屏那档是按 800 px 的板高定的（一笔 ≈ 295 px），
     照搬到手机那块 ~160 px 高的小板上只有 59 px —— 手指根本擦不动（站主：触屏涂抹不习惯）。
     ★ 0.19 是按"可见直径与上一版小板持平"反推的（上一版 2×1.04×0.22 ≈ 短边的 0.458，
       新形状 2×1.2×R = 0.458 ⇒ R ≈ 0.19）⇒ 换形状后小板的手感不变。
     ★ 判定用**板的短边**，不是视口：同一个视口下两种版面尺寸差 4 倍，按视口分会判错。 */
  const RADIUS_SMALL_K = 0.19;
  const SMALL_PLATE = 420;   // 短边小于这个 ⇒ 按小板算
  /* ★★ 形状**照抄参考站**的 irregular（sim shader 原文）：
         float angle = atan(off.y, off.x);
         float irregular = 1.0 + 0.14 * sin(angle * 5.0 + time * 1.6)
                               + 0.08 * sin(angle * 9.0 - time * 1.1);
     ⇒ 5 瓣（幅度 0.14）+ 9 瓣（幅度 0.08）；两个分量的**时间系数不同号** ⇒ 形状持续变形。
     ★ time 在它那里是**秒**（引擎里 `this.time += dt`，dt 是秒）⇒ 这里必须 `t / 1000`，
       照抄成毫秒会快 1000 倍（形状抖成一团）。 */
  const IRR_A5 = 0.14, IRR_A9 = 0.08;
  const IRR_S5 = 1.6, IRR_S9 = 1.1;

  /* 进出：指针进 ⇒ 笔触张开；离开 ⇒ 收回（收回更慢，像显影痕迹慢慢褪掉） */
  const TAU_IN = 130;      // 影响强度的平滑时间常数（ms，指数平滑）
  const TAU_OUT = 280;
  const PW_EPS = 0.004;    // 小于这个就算"没有指针" ⇒ 整版不画（纯色）

  /* ★★ 跟随**照抄参考站**：它是**一阶指数平滑**，不是本站原先那个二阶弹簧。
     引擎 `advance()` 的原文：
         const n = 1 - Math.exp(-t * 18);
         this.point = this.point.map((s, c) => s + (this.target[c] - s) * n);
     ⇒ 速率 **18 / 秒**（时间常数 ≈ 56 ms），**一阶 ⇒ 没有过冲**。
     ★★ 换掉上一版那个二阶弹簧（LAG_W=26 / LAG_Z=0.65）的理由：ζ=0.65 是欠阻尼，
        有约 6% 的过冲 ⇒ 涂抹时"笔尖会抖一下"；参考站观感是**干净地贴上来**。
     ★ 稳态滞后 = v / 18：500 px/s 落后 ≈ 28 px、甩一下（2300 px/s）≈ 128 px
       （这时拖尾由**擦痕**接手，不是靠跟随硬撑）。
     ★ ds 必须是**秒**（18 的单位是 1/s）且是真实 dt ⇒ 帧率无关。 */
  const FOLLOW_K = 18;     // 跟随速率（1/s）⇒ 时间常数 ≈ 56 ms

  /* =========================================================================
   * ★★ 密度场 —— 照抄参考站的 sim / display 两个 shader（第六轮）
   *    上一版的"离屏 alpha 蒙版 + 乘性衰减"整块作废，换成它这个场。
   * ======================================================================= */

  /* ★★ 停留时长（参考站构造函数里的原文 `this.returnTime = 2.8`）：
         this.uniform(a, "life", this.returnTime);
         density = max(0., density - dt/life);
     ⇒ **线性**衰减：从 1 褪到 0 正好 **2.8 s**，早擦的那段先褪 ⇒ 擦痕有先后。
     ★★ 它那个 dt 是**秒** —— 本站 dt 是毫秒，一律先转秒（ds = dt / 1000）。
     ★★ 线性衰减顺带把上一版那个 8 位 alpha 的下限问题解决了：减到 0 就是 0，
        不再需要"蒙版平方一次"那个 workaround（α 卡在 42 的鬼影）。 */
  const LIFE = 2.8;

  /* display 的阈值带（原文 `smoothstep(.19, .215, d + (edge-.5)*.15*motion)`）
     ★★ 带子只有 **0.025** ⇒ 边界是**硬**的。它那种"破碎的水渍边"来自下面 EDGE_A
        那层 fbm 扰动（±0.075），**不是**软边渐变 —— 上一版用径向渐变做软边，
        正好把"水"的观感抹平了（整块一起淡，没有"边缘往回收"这回事）。 */
  const REV0 = 0.19, REV1 = 0.215;
  const EDGE_A = 0.15;      // edge 的扰动幅度（`(edge-.5)*.15*motion`）
  const EDGE_F = 22;        // edge 的 fbm 频率（p*22 —— 全场最贵的一步）
  const EDGE_SPD = 0.12;    // edge 的相位推进（time*.12）
  /* ★ 场峰值低于这个就**不可能**再显（阈值下沿 − 扰动上限）⇒ 两个用处：
       ① 判"褪尽"（停帧 + 清场）② display 时整块跳过 edge 计算。 */
  const DEAD = REV0 - EDGE_A * 0.5;   // = 0.115

  /* display 的域扭曲（原文 `at = clamp(uv + q*.055*motion/vec2(aspect,1.), 0., 1.)`） */
  const Q_F = 7;            // 那两个 fbm 的频率（p*7）
  const Q_A = 0.055;        // 扭曲幅度
  const Q_SPD = 0.28, Q_SPD2 = 0.22;

  /* sim 的流场（原文 `vec2(a, -b) * .5`：a/b 是 noise 的中心差分 ⇒ **curl noise**，
     无散度 ⇒ 像水流，不会把画面越推越空） */
  const FLOW_F = 5;         // 噪声频率（p*5）
  const FLOW_SPD_X = 0.24, FLOW_SPD_Y = -0.18;   // 噪声场自己的平移（time*.24 / -time*.18）
  const FLOW_A = 0.5;       // curl 的幅度
  const FLOW_EP = 0.08;     // 中心差分的步长
  const VEL_K = 0.18;       // 指针速度把场沿运动方向拖走（velocity*influence*.18）
  const INF_K = 4;          // influence = exp(-r² / (radius²*4))
  const VEL_MAX = 2;        // velocity 的 clamp（原文 ±2）

  /* ★★ 场的分辨率：照搬参考站的 `min(512, width)` 在 CPU 上跑不动 —— 实测
     （_probe/bench-field.mjs）512×360 要 **37 ms/帧**（27 fps）、384×270 要 21 ms。
     ⇒ 取 **CSS 宽的 1/4、上限 320**：实测 320×225 满场 **9.1 ms**（bench-field3.mjs）。
     ★★ 场分辨率**只决定输运/衰减的细节**，不再决定边缘的清晰度 —— 见下面「轮廓」。
        （上一版把整个 display 都跑在场分辨率上 ⇒ 放大 4× 后边缘又糊又有块。） */
  const FW_MAX = 320, FW_MIN = 96;
  /* ★ 等值线阈值：`smoothstep(.19,.215,…)` 是极窄的一条带 ⇒ 取中点当硬阈值。
     带上那 0.025 的软过渡由 canvas 自己的抗锯齿给出（1 px），观感等价。 */
  const TH = (REV0 + REV1) * 0.5;
  /* ★★ edge 位移的上限（px）。位移 = −Δ·∇d/|∇d|²（把阈值的扰动换算成位置偏移）：
       场越平（|∇d|→0）位移越大 ⇒ 必须 clamp，否则边界会被甩出画面。
       参考站笔触边缘的梯度下理论位移 ≈ ±7.7 px，这里放宽到 18。 */
  const EDGE_MAX_PX = 18;
  /* 粗块边长：整块峰值 < DEAD 就跳过这一块的 edge 计算（display 是全场最贵的一步）。
     ★ 块要比域扭曲的位移（±0.055/2 uv ≈ ±9 px @FW320）大 ⇒ 判定时看 3×3 邻域。 */
  const BS = 32;

  const SWAP_MS = 700;     // 划过网格照片时的交叉淡入时长
  const DT_MAX = 50;       // 帧间隔上限：切标签页回来 / 长卡顿后别让相位跳过头

  /* -------------------------------------------------- 噪声
     ★★ 参考站的 hash 是 `fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453)`，
        本站沿用自己那张预计算表（同样是值噪声，统计特性一致 ⇒ 观感等价，
        但省掉每帧几百万次 Math.sin —— 见下面「性能」）。 */

  // 预计算哈希表：把 Math.sin 的调用从"每帧几百万次"降到 0。
  const HT = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) {
    const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    HT[i] = s - Math.floor(s);
  }
  const hA = (i: number, j: number) => HT[(i * 73 + j * 151) & 2047];

  /* 2D 值噪声（smoothstep 双线性），返回 0..1 */
  const vn2 = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hA(ix, iy), b = hA(ix + 1, iy), c = hA(ix, iy + 1), d = hA(ix + 1, iy + 1);
    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
  /* ★★ fbm **照抄参考站的权重**（它的原文）：
         float fbm(vec2 p){ return noise(p)*.57 + noise(p*2.03)*.28 + noise(p*4.01)*.15; }
     ⇒ 三个八度，权重 .57 / .28 / .15（和为 1 ⇒ 值域仍是 0..1）。 */
  const fbm3 = (x: number, y: number) =>
    vn2(x, y) * 0.57 + vn2(x * 2.03, y * 2.03) * 0.28 + vn2(x * 4.01, y * 4.01) * 0.15;

  const sstep = (e0: number, e1: number, x: number) => {
    let u = (x - e0) / (e1 - e0);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    return u * u * (3 - 2 * u);
  };

  /* 双线性采样一张 FW×FH 的 Float32 场（uv ∈ [0,1]，越界夹到边界） */
  const samp = (F: Float32Array, fw: number, fh: number, u: number, v: number) => {
    let gx = u * fw - 0.5, gy = v * fh - 0.5;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    const tx = gx - ix, ty = gy - iy;
    let x0 = ix < 0 ? 0 : ix >= fw ? fw - 1 : ix;
    let x1 = x0 + 1; if (x1 >= fw) x1 = fw - 1;
    let y0 = iy < 0 ? 0 : iy >= fh ? fh - 1 : iy;
    let y1 = y0 + 1; if (y1 >= fh) y1 = fh - 1;
    const r0 = y0 * fw, r1 = y1 * fw;
    const top = F[r0 + x0] + (F[r0 + x1] - F[r0 + x0]) * tx;
    const bot = F[r1 + x0] + (F[r1 + x1] - F[r1 + x0]) * tx;
    return top + (bot - top) * ty;
  };

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

  let W = 0, H = 0, dpr = 1;
  let RB = RADIUS_K;                          // 当前笔触比例（resize 里按板的短边选档）

  /* ★★ 密度场（照抄参考站的 `field` 纹理）—— 取代上一版那张离屏 alpha 蒙版。
     每帧三步：① **输运**（场被流场推着走）② **线性衰减** ③ 在指针处盖一笔。
     ★ 两张来回倒（ping-pong）：输运要读上一帧的场，不能原地改。
     ★★ 为什么不再用 alpha 蒙版：8 位 alpha 的**乘性**衰减有下限（α 卡在 42 的鬼影），
        Float32 的**线性**衰减没有 —— 减到 0 就是 0。 */
  let FW = 0, FH = 0;                          // 场分辨率
  let FW2 = 0, FH2 = 0;                        // flow / q 的分辨率（场的 1/4，它们是低频）
  let BW = 0, BH = 0;                          // 粗块数
  let FD = new Float32Array(0), FD2 = new Float32Array(0);
  let DD = new Float32Array(0);                // display 域：扭曲采样后的 d（等值线在这上面提）
  let FLX = new Float32Array(0), FLY = new Float32Array(0);   // flow（curl noise + 速度拖曳）
  let QX = new Float32Array(0), QY = new Float32Array(0);     // display 的域扭曲
  let PEAK = new Float32Array(0), BLK = new Float32Array(0);  // 粗块峰值（膨胀后，用来整块跳过）
  let FWm = 0, FHm = 0;                        // FW−1 / FH−1（夹取用）
  /* ★ 轮廓（marching squares）的工作区 —— 见 contour()
     · 边插值点 EX/EY（**格坐标**）；边编号见 ept()
     · E2A/E2B：一条边最多属于两段 ⇒ 用来把段串成环
     · SD0/SD1：第 n 段的两条边；SNS = 段数 */
  let EX = new Float32Array(0), EY = new Float32Array(0);
  let E2A = new Int32Array(0), E2B = new Int32Array(0);
  let SD0 = new Int32Array(0), SD1 = new Int32Array(0), SEEN = new Uint8Array(0);
  let SNS = 0;
  const RX: number[] = [], RY: number[] = [], REND: number[] = [];   // 输出：环的点（CSS px）

  let raf = 0, running = false, onScreen = true, last = 0;
  let mx = 0, my = 0;                          // 指针（板内坐标）
  let cx = 0, cy = 0;                          // 笔触中心（一阶指数平滑跟随指针，无速度项）
  let vx = 0, vy = 0;                          // 笔触速度（uv/秒，参考站 clamp 到 ±2）
  let pw = 0, pwT = 0;                         // 影响强度（实际值、目标值）
  let peak = 0;                                // 场峰值（= 上一帧的最大 density；用来判褪尽）
  let T = 0;                                   // ★ 累计时间（**秒**）—— 参考站的 `time` uniform
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
    cvs.width = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* ★ 笔触分两档：整屏走参考站那档，小板（手机）走另一档 —— 见 RADIUS_SMALL_K。
       ★★ 半径一律按**板高 H**（参考站是 `size*1.35/height`，不是短边）；
          选哪一档才看短边（同一个视口下两种版面尺寸差 4 倍）。 */
    RB = Math.min(W, H) < SMALL_PLATE ? RADIUS_SMALL_K : RADIUS_K;

    /* ★★ 场分辨率 = CSS 宽的 1/4（上限 320）—— 见 FW_MAX 那条注释里的实测数据。
       ★ 蒙版 canvas 就是场分辨率（不乘 dpr）：放大交给 drawImage，省掉 4× 的 CPU 成本。 */
    const aspect = W / H;
    FW = Math.max(FW_MIN, Math.min(FW_MAX, Math.round(W / 4)));
    FH = Math.max(64, Math.round(FW / aspect));
    FW2 = Math.max(8, FW >> 2);
    FH2 = Math.max(8, FH >> 2);
    BW = Math.ceil(FW / BS);
    BH = Math.ceil(FH / BS);
    FD = new Float32Array(FW * FH);
    FD2 = new Float32Array(FW * FH);
    FLX = new Float32Array(FW2 * FH2);
    FLY = new Float32Array(FW2 * FH2);
    QX = new Float32Array(FW2 * FH2);
    QY = new Float32Array(FW2 * FH2);
    PEAK = new Float32Array(BW * BH);
    DD = new Float32Array(FW * FH);
    BLK = new Float32Array(BW * BH);
    FWm = FW - 1; FHm = FH - 1;
    /* 边数 2*FW*FH；段数上限 = 每格两段 */
    const nE = 2 * FW * FH, nS = 2 * FWm * FHm;
    EX = new Float32Array(nE);
    EY = new Float32Array(nE);
    E2A = new Int32Array(nE);
    E2B = new Int32Array(nE);
    SD0 = new Int32Array(nS);
    SD1 = new Int32Array(nS);
    SEEN = new Uint8Array(nS);
    REND.length = 0; RX.length = 0; RY.length = 0;
    // 尺寸变了 ⇒ 指针/笔触坐标失效，场作废（旧坐标的擦痕会出现在错误的位置）
    pw = 0;
    pwT = 0;
    peak = 0;
    vx = 0;
    vy = 0;
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

  /* ★★★ sim —— 照抄参考站的 sim shader，一次推进一帧。
     三步：① 流场（curl noise + 指针速度拖曳）② **输运** + 线性衰减 ③ 盖一笔。
     ★ ds 必须是**秒**（参考站的 dt 就是秒，它的 `time` 也按秒累计）。 */
  const step = (ds: number) => {
    const aspect = W / H;
    const invA = 1 / aspect;
    const radius = RB;                    // ★ uv 单位（以板高为 1）—— 见 RADIUS_K
    const pu = cx / W, pv = cy / H;       // 笔触中心（uv）
    const decay = ds / LIFE;              // ★ 线性衰减量（`density −= dt/life`）

    /* ① 流场：低频（p*5，跨屏只有 5 个周期）⇒ 在 FW/4 分辨率算，主循环双线性采样 */
    for (let j = 0; j < FH2; j++) {
      const v = (j + 0.5) / FH2;
      const ny = v * FLOW_F + T * FLOW_SPD_Y;
      for (let i = 0; i < FW2; i++) {
        const u = (i + 0.5) / FW2;
        const nx = u * aspect * FLOW_F + T * FLOW_SPD_X;
        /* curl noise：对同一个标量噪声做中心差分 ⇒ **无散度** ⇒ 像水流，
           不会把画面越推越空（直接用噪声当速度场会到处是"源"和"汇"）。 */
        const a = vn2(nx, ny + FLOW_EP) - vn2(nx, ny - FLOW_EP);
        const b = vn2(nx + FLOW_EP, ny) - vn2(nx - FLOW_EP, ny);
        const ox = (u - pu) * aspect, oy = v - pv;
        const infl = Math.exp(-(ox * ox + oy * oy) / Math.max(radius * radius * INF_K, 1e-4));
        const k = j * FW2 + i;
        FLX[k] = a * FLOW_A + vx * aspect * infl * VEL_K;
        FLY[k] = -b * FLOW_A + vy * infl * VEL_K;
      }
    }
    /* ① display 的域扭曲：同样是低频（p*7）⇒ 同样低分辨率 */
    for (let j = 0; j < FH2; j++) {
      const v = (j + 0.5) / FH2, y7 = v * Q_F;
      for (let i = 0; i < FW2; i++) {
        const u = (i + 0.5) / FW2, x7 = u * aspect * Q_F;
        const k = j * FW2 + i;
        QX[k] = fbm3(x7 + T * Q_SPD, y7) - 0.5;
        QY[k] = fbm3(x7 + 8, y7 - T * Q_SPD2) - 0.5;
      }
    }

    /* ② 输运（半拉格朗日回溯）+ **线性**衰减
       ★★ 这一行就是"像水一样"的全部来源：擦痕不是盖上去就冻住，而是每帧被水流推着走。 */
    let pk = 0;
    for (let j = 0; j < FH; j++) {
      const v = (j + 0.5) / FH;
      for (let i = 0; i < FW; i++) {
        const u = (i + 0.5) / FW;
        let su = u - samp(FLX, FW2, FH2, u, v) * invA * ds;
        let sv = v - samp(FLY, FW2, FH2, u, v) * ds;
        su = su < 0 ? 0 : su > 1 ? 1 : su;
        sv = sv < 0 ? 0 : sv > 1 ? 1 : sv;
        let d = samp(FD, FW, FH, su, sv) - decay;
        if (d < 0) d = 0;
        FD2[j * FW + i] = d;
        if (d > pk) pk = d;
      }
    }

    /* ③ 笔触（`density = max(density, brush*down)`）
       ★ 只在指针周围一个**包围盒**里算：盒外 brush 恒为 0，跳过不改变结果，
         但省掉整版最贵的 atan2 + 2×sin（实测这一步是能不能跑满 60fps 的关键）。
       ★ 参考站是 `brush * down`（down 是 0/1 硬切）；本站乘 `pw` 做进出平滑
         ⇒ 进出不至于"啪"一下，笔触大小则严格等于参考站（`RB`，不缩放）。 */
    if (pw > PW_EPS) {
      const ir5 = T * IRR_S5, ir9 = T * IRR_S9;
      // 包围盒：|off| < FADE_K * radius * 1.22（1.22 = irregular 的上限）
      const rx = (FADE_K * radius * 1.22) / aspect, ry = FADE_K * radius * 1.22;
      let i0 = Math.floor((pu - rx) * FW), i1 = Math.ceil((pu + rx) * FW);
      let j0 = Math.floor((pv - ry) * FH), j1 = Math.ceil((pv + ry) * FH);
      if (i0 < 0) i0 = 0;
      if (i1 > FW) i1 = FW;
      if (j0 < 0) j0 = 0;
      if (j1 > FH) j1 = FH;
      for (let j = j0; j < j1; j++) {
        const v = (j + 0.5) / FH, oy = v - pv;
        for (let i = i0; i < i1; i++) {
          const u = (i + 0.5) / FW, ox = (u - pu) * aspect;
          /* ★★ 照抄参考站的 irregular：5 瓣 + 9 瓣，两个分量**时间系数异号** ⇒ 持续变形 */
          const ang = Math.atan2(oy, ox);
          const irr = 1 + IRR_A5 * Math.sin(ang * 5 + ir5) + IRR_A9 * Math.sin(ang * 9 - ir9);
          const br = (1 - sstep(CORE_K, FADE_K, Math.sqrt(ox * ox + oy * oy) / (radius * irr))) * pw;
          const k = j * FW + i;
          if (br > FD2[k]) {
            FD2[k] = br;
            if (br > pk) pk = br;
          }
        }
      }
    }

    /* ping-pong：输运要读上一帧的场，不能原地改 */
    const tmpD = FD;
    FD = FD2;
    FD2 = tmpD;
    peak = pk;
  };

  /* ★★★ 轮廓 —— 第七轮的核心改动：把「逐场像素算 alpha 蒙版」换成「矢量等值线」。

     参考站的 display shader 是**逐屏幕像素**跑的（`vec2 p = uv*vec2(aspect,1.)`，
     那条极窄的阈值带 `smoothstep(.19,.215, d + (edge-.5)*.15)` 也在屏幕像素上）
     ⇒ 它**只有 `d`** 是从 512 的低分辨率场双线性采样的，高频细节是屏幕分辨率的。
     上一版本站把整段 display（含那层决定“破碎水渍边”的 `edge` fbm）都跑在 320 的
     场上、再 `drawImage` 放大 4× ⇒ 边缘又糊又有块（站主：「边缘好粗糙，分辨率好低」）。

     ⇒ 解法：**把两件事分开** ——
        · `d`（输运 / 衰减 / 笔触）是低频的 ⇒ 场照旧 320（再高就跑不动，见 FW_MAX）
        · **边界改成矢量**：marching squares 从场里提出 `d = TH` 的等值线
          （**线性插值 ⇒ 亚像素**，不再是 4 px 的台阶），再按参考站的 `edge` fbm
          沿法线位移（噪声在**屏幕坐标**上采样 ⇒ 细节不受场分辨率限制），
          最后把环填进 canvas ⇒ 边缘以 **dpr 全分辨率**光栅化。

     ★ 位移量照抄参考站：`revealed = smoothstep(.19,.215, d + (edge-.5)*.15)`
       ⇒ 边界落在 `d = TH − (edge−.5)*.15` 上 ⇒ 一阶展开：沿法线的位移
         `δ = −Δ·∇d/|∇d|²`（Δ = (edge−.5)*EDGE_A）。**别写成“直接乘一个常数”** ——
         场被衰减得越平（|∇d| 越小）边界该抖得越厉害，那正是“水”在退时的样子。 */

  /* 双线性读 DD（格坐标；越界夹到边界 —— 板外本来就不显影） */
  const dAt = (gx: number, gy: number) => {
    const x = gx < 0 ? 0 : gx > FWm ? FWm : gx;
    const y = gy < 0 ? 0 : gy > FHm ? FHm : gy;
    const ix = x | 0, iy = y | 0;
    const ix1 = ix < FWm ? ix + 1 : FWm, iy1 = iy < FHm ? iy + 1 : FHm;
    const fx = x - ix, fy = y - iy;
    const t = DD[iy * FW + ix] + (DD[iy * FW + ix1] - DD[iy * FW + ix]) * fx;
    const b = DD[iy1 * FW + ix] + (DD[iy1 * FW + ix1] - DD[iy1 * FW + ix]) * fx;
    return t + (b - t) * fy;
  };

  /* 一条边上的插值点（**亚像素** —— 这就是“不再是 4 px 台阶”的来源）。
     边编号：水平边 h(i,j) = 2·(j·FW+i)，垂直边 v(i,j) = 2·(j·FW+i)+1。 */
  const ept = (eid: number) => {
    const k = eid >> 1;
    const i = k % FW, j = (k / FW) | 0;
    if ((eid & 1) === 0) {
      const a = DD[k], b = DD[k + 1];
      EX[eid] = i + (TH - a) / (b - a);
      EY[eid] = j;
    } else {
      const a = DD[k], b = DD[k + FW];
      EX[eid] = i;
      EY[eid] = j + (TH - a) / (b - a);
    }
  };

  const addSeg = (ea: number, eb: number) => {
    if (E2A[ea] < 0) ept(ea);
    if (E2A[eb] < 0) ept(eb);
    SD0[SNS] = ea; SD1[SNS] = eb;
    if (E2A[ea] < 0) E2A[ea] = SNS; else E2B[ea] = SNS;
    if (E2A[eb] < 0) E2A[eb] = SNS; else E2B[eb] = SNS;
    SNS++;
  };

  /* 一个顶点：格坐标 → CSS px，并按参考站的 edge 沿法线位移 */
  const pushPt = (eid: number, aspect: number, sx: number, sy: number) => {
    const gx = EX[eid], gy = EY[eid];
    const u = gx / FW, v = gy / FH;
    const qx = samp(QX, FW2, FH2, u, v);
    const qy = samp(QY, FW2, FH2, u, v);
    /* ★★ 照抄参考站的 `edge = fbm(p*22. + q*3. + time*.12)`（p = uv*vec2(aspect,1.)）
       ⇒ 噪声在**屏幕坐标**上采样 ⇒ 细节不受场分辨率限制（上一版是卡在 320 上的）。 */
    const e = fbm3(u * aspect * EDGE_F + qx * 3 + T * EDGE_SPD, v * EDGE_F + qy * 3);
    const dlt = (e - 0.5) * EDGE_A;
    /* 梯度（中心差分，格坐标）⇒ 换算成每 px */
    const g1x = (dAt(gx + 1, gy) - dAt(gx - 1, gy)) * 0.5 / sx;
    const g1y = (dAt(gx, gy + 1) - dAt(gx, gy - 1)) * 0.5 / sy;
    const g2 = g1x * g1x + g1y * g1y;
    let kx = 0, ky = 0;
    if (g2 > 1e-9) {
      const f = -dlt / g2;
      kx = f * g1x; ky = f * g1y;
      const len = Math.sqrt(kx * kx + ky * ky);
      if (len > EDGE_MAX_PX) { const s = EDGE_MAX_PX / len; kx *= s; ky *= s; }
    }
    RX.push(gx * sx + kx);
    RY.push(gy * sy + ky);
  };

  const contour = () => {
    const aspect = W / H;
    const invA = 1 / aspect;
    const sx = W / FW, sy = H / FH;      // 格 → CSS px
    const FM = FW - 1, FN = FH - 1;
    REND.length = 0; RX.length = 0; RY.length = 0;
    if (FW < 4 || FH < 4) return 0;

    /* ① 块峰值（再做一次 3×3 膨胀）⇒ 每格只查一次就能安全跳过。
       ★ 膨胀是为了域扭曲：它会把采样点推到邻块，只查自己那块会把边缘整块切掉。 */
    for (let bj = 0; bj < BH; bj++) {
      const ja = bj * BS, jb = Math.min(ja + BS, FH);
      for (let bi = 0; bi < BW; bi++) {
        const ia = bi * BS, ib = Math.min(ia + BS, FW);
        let m = 0;
        for (let j = ja; j < jb; j++) {
          for (let i = ia; i < ib; i++) { const d = FD[j * FW + i]; if (d > m) m = d; }
        }
        BLK[bj * BW + bi] = m;
      }
    }
    for (let bj = 0; bj < BH; bj++) {
      for (let bi = 0; bi < BW; bi++) {
        let m = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = bj + dj;
          if (jj < 0 || jj >= BH) continue;
          for (let di = -1; di <= 1; di++) {
            const ii = bi + di;
            if (ii < 0 || ii >= BW) continue;
            const p = BLK[jj * BW + ii];
            if (p > m) m = p;
          }
        }
        PEAK[bj * BW + bi] = m;
      }
    }

    /* ② DD = 域扭曲后采到的 d。
       ★★ 这里**不再算 fbm3** —— 上一版每格一次，是全场最贵的一步；
          它搬到 ④ 的**顶点**上去了（顶点只有几百到几千个，而不是 7 万个）。 */
    for (let j = 0; j < FH; j++) {
      const v = (j + 0.5) / FH;
      const bj = (j / BS) | 0;
      const rim = j === 0 || j === FN;
      for (let i = 0; i < FW; i++) {
        const k = j * FW + i;
        /* ★ 最外一圈强制 0：保证等值线**一定闭合**（板外本来就不显影），
           否则环会走到场边界变成开放路径 —— 开放路径是没法 fill 的。 */
        if (rim || i === 0 || i === FM) { DD[k] = 0; continue; }
        if (PEAK[bj * BW + ((i / BS) | 0)] < DEAD) { DD[k] = 0; continue; }
        const u = (i + 0.5) / FW;
        const qx = samp(QX, FW2, FH2, u, v);
        const qy = samp(QY, FW2, FH2, u, v);
        let au = u + qx * Q_A * invA;
        let av = v + qy * Q_A;
        au = au < 0 ? 0 : au > 1 ? 1 : au;
        av = av < 0 ? 0 : av > 1 ? 1 : av;
        DD[k] = samp(FD, FW, FH, au, av);
      }
    }

    /* ③ marching squares：把 d = TH 的等值线提出来。
       角序（逆时针）v0 左下 · v1 右下 · v2 右上 · v3 左上；
       四条边：底 = h(i,j) / 右 = v(i+1,j) / 顶 = h(i,j+1) / 左 = v(i,j)。 */
    E2A.fill(-1); E2B.fill(-1);
    SNS = 0;
    for (let j = 0; j < FN; j++) {
      for (let i = 0; i < FM; i++) {
        const k = j * FW + i;
        const v0 = DD[k], v1 = DD[k + 1], v2 = DD[k + FW + 1], v3 = DD[k + FW];
        let st = 0;
        if (v0 > TH) st |= 1;
        if (v1 > TH) st |= 2;
        if (v2 > TH) st |= 4;
        if (v3 > TH) st |= 8;
        if (st === 0 || st === 15) continue;
        const EB = 2 * k, EL = 2 * k + 1, ET = 2 * (k + FW), ER = 2 * (k + 1) + 1;
        switch (st) {
          case 1: case 14: addSeg(EL, EB); break;
          case 2: case 13: addSeg(EB, ER); break;
          case 3: case 12: addSeg(EL, ER); break;
          case 4: case 11: addSeg(ER, ET); break;
          case 6: case 9: addSeg(EB, ET); break;
          case 7: case 8: addSeg(EL, ET); break;
          /* ★ 5 / 10 是**鞍点**：四条边都有交点，怎么连要看中心落在哪一侧 */
          case 5: {
            const cen = (v0 + v1 + v2 + v3) * 0.25;
            if (cen > TH) { addSeg(EB, ER); addSeg(ET, EL); }
            else { addSeg(EL, EB); addSeg(ER, ET); }
            break;
          }
          case 10: {
            const cen = (v0 + v1 + v2 + v3) * 0.25;
            if (cen > TH) { addSeg(EL, EB); addSeg(ER, ET); }
            else { addSeg(EB, ER); addSeg(ET, EL); }
            break;
          }
        }
      }
    }
    if (SNS === 0) return 0;

    /* ④ 把段串成环：每条边属于**恰好两段** ⇒ 段图是 2-正则 ⇒ 走出来一定是环。 */
    SEEN.fill(0, 0, SNS);
    for (let s0 = 0; s0 < SNS; s0++) {
      if (SEEN[s0]) continue;
      const start = RX.length;
      let s = s0, entry = SD0[s0];
      for (let guard = 0; guard <= SNS; guard++) {
        SEEN[s] = 1;
        pushPt(entry, aspect, sx, sy);
        const exit = SD0[s] === entry ? SD1[s] : SD0[s];
        const nx = E2A[exit] === s ? E2B[exit] : E2A[exit];
        if (nx < 0 || SEEN[nx]) break;
        s = nx;
        entry = exit;
      }
      if (RX.length - start > 2) REND.push(RX.length);
      else { RX.length = start; RY.length = start; }   // 退化的环（<3 点）丢掉
    }
    return REND.length;
  };

  const render = (t: number, dt = 0) => {
    if (!W) return;

    /* ★ 时间基准 = **performance.now() 的绝对值**（秒），不是"每帧累加"：
       参考站是累加的（`this.time += dt`），本站按自己那条老规矩取绝对值 ——
       ⇒ 所有噪声相位都是 t 的**确定函数**，可以跨加载逐点比对（形状类验收唯一的可靠手段）。
       ★ 单位必须是**秒**（它 shader 里所有相位都吃秒）。 */
    T = t / 1000;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const im = cur;
    if (!im || !im.complete || !im.naturalWidth) return;

    /* reduced-motion：静止整张（不裁形、不流动、不响应指针）—— 见文件头 */
    if (reduce.matches) {
      drawCover(im, 1);
      return;
    }

    /* ① 场推进（输运 + 线性衰减 + 笔触）—— 每帧都做，不管有没有指针；
       指针停着不动时，早先划过的路径照样在被水流推着走、照样在褪。 */
    if (dt > 0) step(dt / 1000);

    /* ★★ 站主的口径：**没有指针（且擦痕褪尽）就只是一块纯色**。
       ⇒ 清屏之后直接返回，一个像素都不画（canvas 整版 alpha = 0，露出 CSS 板底）。
       ★ 注意与上一版的差别：擦痕还在的时候**要继续画**（那就是"停留一段时间"）。 */
    if (peak <= DEAD) {
      FD.fill(0);
      FD2.fill(0);
      peak = 0;
      return;
    }

    // ★ 先铺不透明的 cur 打底，再叠 alpha = mix 的 nxt ⇒ 才是**线性**交叉淡入
    //   （两张都用 alpha 叠会是 (1−m)² 的曲线，中段发暗）
    drawCover(im, 1);
    if (nxt && mix > 0 && nxt.complete && nxt.naturalWidth) drawCover(nxt, mix);
    /* ③ 照片只留在轮廓里 ⇒ 只有擦过的地方露出照片。
       ★★ 这里不再是“一张蒙版图放大 4×”，而是**矢量路径**：
          · 等值线是 marching squares 的**亚像素**插值 ⇒ 没有 4 px 的台阶
          · 顶点按参考站的 edge fbm 沿法线位移 ⇒ 高频细节不受场分辨率限制
          · 路径用 **CSS px** 给、ctx 有 setTransform(dpr) ⇒ 边缘以画布全分辨率光栅化
          （上一版的“分辨率好低”就是这三件事全丢了） */
    const nR = contour();
    if (nR === 0) { ctx.clearRect(0, 0, W, H); return; }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    let a = 0;
    for (let r = 0; r < nR; r++) {
      const b = REND[r], n = b - a;
      /* ★ 二次曲线经过相邻顶点的**中点** ⇒ C1 连续。
         直接 lineTo 会有折角：顶点间距是 1 格（≈4 px）而位移能差出好几个 px。 */
      ctx.moveTo((RX[a] + RX[a + 1]) / 2, (RY[a] + RY[a + 1]) / 2);
      for (let i = 1; i <= n; i++) {
        const p = a + (i % n), q = a + ((i + 1) % n);
        ctx.quadraticCurveTo(RX[p], RY[p], (RX[p] + RX[q]) / 2, (RY[p] + RY[q]) / 2);
      }
      ctx.closePath();
      a = b;
    }
    /* ★ evenodd：marching squares 输出的环**绕向不保证一致**，
       evenodd 不管绕向都能把内环挖成洞（nonzero 必须靠绕向才对）。 */
    ctx.fill('evenodd');
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
    peak = 0;
    vx = 0;
    vy = 0;
    // ★ 停帧必须补一帧"全清" ⇒ 板回到纯色。少了这一步会留下最后一帧的形状残影。
    //   ★★ 场也要一起清：擦痕是**累积**的，只清主画布的话下次进来会带着上次没褪完的痕。
    if (W) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (FD.length) { FD.fill(0); FD2.fill(0); }
    }
  };

  const start = () => {
    if (running || reduce.matches || !W) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  /* 跑不跑 rAF，看"有没有指针"**或**"场还没褪尽"：
     ★ 只看指针的话，指针一离开就停帧 ⇒ 擦痕会**冻在最后一帧**上，永远不会褪回纯色
       （那正是"停留一段时间"这条要求的反面）。 */
  const sync = () => {
    const want =
      onScreen && !document.hidden && !reduce.matches
      && (pwT > 0 || pw > PW_EPS || peak > DEAD);
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
      // ★ 跟随：一阶指数平滑（`1 − e^(−ds·18)`，照抄参考站）⇒ 帧率无关、且**不过冲**
      const kf = 1 - Math.exp(-ds * FOLLOW_K);
      const pcx = cx, pcy = cy;
      cx += (mx - cx) * kf;
      cy += (my - cy) * kf;
      /* ★ 速度 = 笔触中心**实际走过**的速度（参考站原文 `velocity = (point − 旧point)/dt`，
         clamp 到 ±2，单位 uv/秒）⇒ 它把场沿运动方向拖走（`flow += velocity*influence*.18`）。
         ★ 用的是**平滑后**的位置（不是指针本身）⇒ 甩一下时拖曳与滞后是同一个来源。 */
      vx = Math.max(-VEL_MAX, Math.min(VEL_MAX, (cx - pcx) / W / ds));
      vy = Math.max(-VEL_MAX, Math.min(VEL_MAX, (cy - pcy) / H / ds));
      if (mix < 1) {
        mix = Math.min(1, mix + dt / SWAP_MS);
        if (mix >= 1) { cur = nxt; curUrl = nxtUrl; nxt = null; nxtUrl = ''; }
      }
    }

    // 指针走了**且**场褪尽 ⇒ 停 ⇒ 板回到纯色（这一版**没有**"自己在动"这回事）
    if (pw <= PW_EPS && pwT === 0 && peak <= DEAD) { stop(); return; }

    render(now, dt);
    raf = requestAnimationFrame(frame);
  };

  /* ---------------------------------------------------------------- 内容 */

  /* ★★ 取片源是 `[data-bath-src] figure` —— **不再是 `.wf figure`**（2026-10-07）。
     砖墙从 `/gallery` 搬去了相册页（一册一页），这一页的素材池只剩**相册入口条**
     （`src/components/AlbumRow.astro` 里那几条手风琴）：它的每个 `<figure>` 挂在
     `data-bath-src` 底下 ⇒ 契约还在，只是钩子换了个更中性的名字。
     ⚠ 另一侧门闩在 tests/develop-bath.test.ts，改名字要两边一起改。
     ★ 每次都重新收集 ⇒ 页面上的增删自动生效，不用跨脚本接线。
     ★ 只收**横幅**（w > h）：整屏是横的，竖幅铺进来只能裁成中间一条，认不出是什么。
     ★★ 图源用**网格档（800）**那张（`img` 的 src），**不是**灯箱档（1280）：
        1280 档单张能到 **486 KB**，线上实测某张图 842 ms 才到、更重的要好几秒
        ⇒ 那几秒里指针**擦不出任何东西**（`drawCover` 看 `complete`，没图就不画）。 */
  const collect = (): Frame[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-bath-src] figure:not([hidden])'))
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

  /* ★★ 指针**在板上**时显示那个白圈 —— 照抄参考站的 `.pointer-dot`
     （站主：「学一下 lowkeytp 是怎么处理鼠标上去的效果，做到和它一样」）。
     它的原文（_probe/ref/lr-app.js）：
         if (!n) { …; l.dot.classList.remove("visible"); return; }
         l.dot.style.left = `${t*100}%`;  l.dot.style.top = `${r*100}%`;
         l.dot.classList.add("visible");
     三个必须照抄的细节：
       ① 用**百分比**定位（不是 px）⇒ resize 后不用重算；
       ② 指针出界就摘掉 `visible`（不是移到边界上）；
       ③ **没有 transition** —— 圈是**硬跟手**的。滞后的那个是**笔触**（一阶平滑），
          不是圈 ⇒ 圈 = "手在哪"、笔触 = "液体到哪了"，两个位置差就是"被拽着走"的读数。 */
  const dot = host.querySelector<HTMLElement>('[data-bath-dot]');
  const markDot = () => {
    if (!dot) return;
    const inside = mx >= 0 && mx <= W && my >= 0 && my <= H;
    if (!inside) { dot.classList.remove('on'); return; }
    dot.style.left = `${(mx / W) * 100}%`;
    dot.style.top = `${(my / H) * 100}%`;
    dot.classList.add('on');
  };

  host.addEventListener('pointerenter', (e) => {
    toLocal(e);
    // 笔触是从"没有"长出来的 ⇒ 中心直接落在指针上（否则会从上一处位置飞过来）
    if (pw <= PW_EPS) { cx = mx; cy = my; }
    if (!reduce.matches) pwT = 1;
    markDot();
    sync();
  });
  host.addEventListener('pointermove', (e) => {
    toLocal(e);
    if (pwT === 0 && !reduce.matches) pwT = 1;   // 指针已在板内但没触发过 enter（例如刚露面）
    markDot();
    sync();
  });
  host.addEventListener('pointerleave', () => {
    pwT = 0;      // ⇒ 笔触收回去，收完自动停帧，板回到纯色
    dot?.classList.remove('on');
    sync();
  });

  /* 与页面互动：划过素材池里任意一张 ⇒ 板里淡入那一张（松耦合 —— 只读 DOM）
     ★ 同 collect()：走 `[data-bath-src]`（相册入口条），不是 `.wf`（砖墙已经不在本页）。 */
  for (const fig of document.querySelectorAll<HTMLElement>('[data-bath-src] figure')) {
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
