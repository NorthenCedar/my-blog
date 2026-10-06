/* =============================================================================
 * 留言页 · 墨滴（INK DROP）—— 指针在留言区留墨痕、几秒渗开；新留言落下是墨滴扩散
 *
 * ★ 母题（站主 2026-10-06 指定，与本页静态底纹同源）：
 *   · 墨痕：指针在**移动**时留下渐深的蓝墨痕；**停住不动 ⇒ 不出墨**，
 *     已落的墨按各自年龄从末端慢慢消退（站主 2026-10-06 晚明确要求）
 *   · 渗开：痕迹不立刻消失，按 f(t) **慢慢往外渗并变淡**，几秒后收干净
 *   · 落滴：留言发表成功 ⇒ 墨滴**从上方砸下、炸开、溅出一圈**
 *
 * ★★ 机制与其余装置**不重复**（口径 #5「每页一台机制不同的装置」）：
 *
 *              显影板     索引卷尺    说说 FLOAT    文章阅读尺   星座      墨滴（本文件）
 *   介质      Canvas 场   DOMtransform  Canvas 2D   DOMtransform  Canvas 2D  **Canvas 像素场**
 *   输入      **指针**    **滚动**      无           滚动+点击    指针停留   **指针 + 一次性事件**
 *   驱动      一阶平滑     二阶弹簧      f(t)         确定映射      一阶平滑   **累积像素 + 平方衰减**
 *   退场      常驻         常驻          永续        停手 900ms   常驻      **痕迹自愈**
 *
 *   ★ 它与显影板最接近但**机制相反**（AGENTS 2026-10-01第四轮那条教训）：
 *     显影板是「涂抹擦痕」—— 越抹越清楚、永久留痕；
 *     墨滴是「渗开的墨」—— 留下之后**自己会淡掉**。
 *     ⇒ 所以这里**不能给大滞后**：墨痕必须在指针脚下（那是它的职责），
 *       手感全部交给**痕迹自身的存续**（笔刷 + 自愈），不给位置延迟。
 *     （同一条教训原文：「涂抹最忌讳笔不跟着手走」。）
 *
 * ★★「墨痕几秒渗开」怎么做到不违反两条硬规矩：
 *   ① 零随机（`AGENTS`：形状必须是 f(t) 的确定函数，否则同 t 逐点比对失效）
 *      ⇒ 墨痕的**年龄**决定它的样子，形状由 `hash01(i)` 整数哈希定；
 *        同一个 (位置, 年龄) 永远同一个像素值。
 *   ② 「不读内容几何」（float.ts 的约定①，评论展开会插一大堆 DOM）
 *      ⇒ 墨痕**不吃任何 DOM 尺寸**：范围就是**整个画布**，不设留言区/视口带
 *        之类的门槛。`overMessageArea` 只在窄屏降级时返回 false，
 *        唯一的坐标钳位用的是画布自身的 `cw/ch`（`fit()` 产出的，不触发重排）。
 *
 *   ⚠★★ 教训（2026-10-06 站主真浏览器实测）：
 *      早先**用视口比例当常数**（`x > cw*0.12 && x < cw*0.88`）——
 *      而版心是**左对齐的固定宽度**、视口宽度随窗口变。实测 1920 宽时：
 *        留言框真实范围  left 47.8 → right 507（宽 459）
 *        代码要求的范围  x  229   →       1679
 *        交集只有 229..507 ⇒ **框左侧 181px（占 39%）的轨迹被整段丢弃**，
 *        且被拒时 `lastX=-1` 会**切断插值链** ⇒ 读出来是「断断续续」。
 *      站主误以为是「开 F12 激活了装置」，真实因果是窗口宽度 ↔ 阈值的耦合。
 *      ⇒ **「常数」不等于「与版式无关」**：版式是固定的，视口不是。
 *        凡是「用视口比例反推内容位置」的地方，都要换成量一次真实几何。
 *
 * ★★ 为什么需要一次**事件**，以及为什么改`comments.ts`：
 *   「新留言落下是墨滴扩散」这个需求，装置自己**不可能知道**留言成功了 ——
 *   `comments.ts` 提交成功后只 `render(c, true)`，没有任何对外通知。
 *   ⇒ 在那里加一行 `window.dispatchEvent(new CustomEvent('inkdrop', ...))`。
 *   ★ 这是全站**第一个**装置↔业务的事件钩子，故意的选择：
 *     不用轮询 DOM（会与评论列表抢主线程、且读几何）、
 *     不用 MutationObserver（同样要读几何，且把"插了一条 li"当信号太脆）。
 *     事件在**成功后**派发（失败不该有墨滴 —— 那等于给失败也做庆祝）。
 *
 * ★★ canvas 显隐只能用 **opacity**，不能用 `hidden`：
 *   `hidden` 是 `display:none` ⇒ `clientWidth/clientHeight` 恒为 0 ⇒ `fit()` 量不到尺寸
 *   ⇒ 装置永远画不出第一帧（AGENTS 2026-10-05 星座那轮的原文教训）。
 *   本页照抄星座那套：元素始终占位，没就绪时 `opacity:0`，脚本就绪后加 `.is-ready`。
 *
 * ★ 降级四态（照抄 float.ts / develop.ts 的约定）：
 *   ① reduced-motion ⇒ 不跑 rAF，画一帧**静态**的（几滴固定墨痕，读得出是墨滴）。
 *      ★ 本页与 FLOAT 不同：**有终态** —— 一滴渗开的墨就是终态，
 *        所以 RM 档画「几滴已渗开、正在收」的墨，不必冻结在某个随机相位。
 *   ② 无 JS ⇒ canvas 空着（opacity:0），只剩静态底纹层；正文服务端渲染完整。
 *   ③ ≤767px ⇒ **只保留落滴、不留墨痕**（窄屏用手指划屏不是"留墨"，
 *      反而会挡住输入）；痕迹的 alpha 上限 ×0.75、DPR 上限 2 → 1.5。
 *   ④ 视口外 / 切标签 ⇒ 停帧（rl-core 的 activityGate）。
 *      ★ 痕迹是**累积状态**、不是 f(t)，所以停帧时**不清屏**
 *        （清了就等于"切一下标签墨迹全没了"，那是错的 —— 墨已经在纸上了）。
 *        只在"确实没有痕迹且没落滴"时才省掉绘制。
 */
import { createActivityGate, prefersReducedMotion, shouldAnimate, startLoop } from './rl-core';

(() => {
  const cv = document.querySelector<HTMLCanvasElement>('[data-inkdrop]');
  if (!cv) return;
  const ctx0 = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx0) return;

  const narrow = matchMedia('(max-width: 767px)');
  const reduce = prefersReducedMotion();
  const animate = shouldAnimate(reduce);

  /* ---------- 颜色：只从 token 读，alpha 以 8 位 hex 承载（站上约定） ---------- */
  const CS = getComputedStyle(document.documentElement);
  /* ★ 母题是**蓝**钢笔（底纹素材就是蓝的）—— 墨滴必须同色系。
     取accent 的 fallback 仍是站上绿，但站内 accent 是绿；
     所以这里显式取一个蓝 token 优先、退回 accent。 */
  const INK = (CS.getPropertyValue('--ink-blue') || CS.getPropertyValue('--accent') || '#2d7d46').trim();
  const A = (hex: string, a: number) => {
    const h = hex.replace('#', '').slice(0, 6);
    const v = Math.round(Math.max(0, Math.min(1, a)) * 255);
    return '#' + h + v.toString(16).padStart(2, '0');
  };

  /* ---------- 确定性哈希（不是随机源：同一个 i 永远同一个值） ---------- */
  function hash01(i: number): number {
    let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }

  /* ---------- 母题常数 ---------- */
  const TRAIL_STEP = 5; // 笔刷采样间距（px）：越小越连续，越大越"点状"
  /* ★★ TRAIL_MAX 必须与 LIFE **自洽**，否则墨痕会被截断成几团孤立的点。
   *
   * 症状（2026-10-06 站主真浏览器实测）：划过一段后，屏幕上只剩两团孤立墨点、
   * 没有墨痕。复算（`_probe/_inkdrop-cap.mjs`）确认根因**不是插值太稀**
   * （实测间距 5–7px vs 笔触直径 26px，连得起来），而是**生成速率远超上限**：
   *   每帧生成 min(STEPS_CAP, dist/TRAIL_STEP) 个点
   *   60fps + 笔速 1200px/s ⇒ 240 点/秒 ⇒ 4.2 秒需要 **1008** 个点
   *   而上限只有 420 ⇒ 数组一满就 blobs.shift() 丢最旧的，
   *   **而那些点还在可见期里**（还没到 4.2s）⇒ 前面的墨凭空消失。
   *
   * 自洽算式：TRAIL_MAX ≥ 每秒点数 × LIFE。
   *   2500px/s（快挥）⇒ 480 点/秒 ⇒ 需 2016 ⇒ 取 1600 保留约 3.3s 的轨迹
   *   （够读成"一条痕"；再慢一点的划动能完整保留 4.2s）。
   * 取 1600 而非刚好 2016：每帧多画些小圆，帧率代价可忽略。
   */
  const TRAIL_MAX = 1600; // 痕迹条数上限（= 2500px/s 时约 3.3s 的轨迹）
  const BLOB_R = 13; // 单个笔触的半径（css px）
  const SMEAR = 2.6; // 每一笔的"铺开"半径（比笔触大 ⇒ 看起来像墨在渗）
  const LIFE = 4.2; // 一笔墨痕从满到收干净（秒）—— 站主要求的"几秒渗开"
  const HEAL = 0.55; // 每秒收掉的比例（指数自愈，不是线性）
  /* ★★★ 落纸瞬间的浓度下限（2026-10-06 线上插桩实测加的）。
   *   blobAlpha 的 rise 段让浓度在前 8% 生命周期（LIFE*0.08 = 336ms）里
   *   从 0 加深到 1 —— 而 age≈0 时浓度≈0，意味着「刚落的墨是看不见的」。
   *   与母题「落下时最实」相反，且真笔尖触纸即有色。
   *   ⇒ 起始给 RISE_FLOOR（0.55 ≈ 一落纸就有半实的蓝），再在 336ms 内吃满。
   *   零随机：仍是 age 的确定函数，只是把定义域整体抬高。 */
  const RISE_FLOOR = 0.55;
  /* 单次 pointermove 的插值上限。12 太小：指针快挥时单次事件距离可达 100px+，
     12 步会把这段稀释成 12 个大间距的点（临界约 7800px/s）。
     提到 32 ⇒ 即便 400px 的一次跳也还保得住约 12px 的连续间距。 */
  const STEPS_CAP = 32; // 单次事件的插值步数上限
  /* ---------- 落滴常数（留言发表的反馈，2026-10-06 晚按"够响"重做）---------- */
  const DROP_LIFE = 3.6; // 落滴从落到散尽（秒）—— 原 2.4s 太短，一次眨眼就过去
  const DROP_FALL = 0.3; // 落下占整段的比例（其余是落地后的扩散）
  const DROP_FALL_H = 210; // 下落起点距落点的高度（px）—— 要看得见"从上砸下来"
  const DROP_HEAD_R = 13; // 水滴头部半径（原 4~9，太小）
  const DROP_BURST_R = 46; // 砸点那团墨的炸开半径（原 7，且立刻就收）
  const DROP_R = 132; // 最外圈涟漪半径（原 46，在大屏上只有一小圈）
  const DROP_RING_RY = 0.72; // 涟漪的压扁比（原 0.42 ⇒ 又扁又小，读不出来）
  const DROP_RING_W = 5.2; // 涟漪线宽（原 2.2）
  const RINGS = 3; // 涟漪圈数
  const SPLAT_N = 11; // 溅射小墨珠颗数（原**没有** ⇒ 落地只有几个同心环，像涟漪不像砸落）
  const SPLAT_V = 190; // 溅射初速（px/s，按 su 线性推进）
  const DROP_SPLAT_R = 7.5; // 溅射小珠半径
  const RM_T = 2.0; // reduced-motion 那一帧的时刻（几滴正在渗开）

  /* ---------- 笔尖驻留：**已按站主要求移除**（2026-10-06 晚）----------
   * 曾有一版「笔尖一直按在纸上」：鼠标停住时每 DWELL_MS 仍在原位落点，
   * 于是停住的地方会积出一个越来越实的墨点。
   * 站主验收后明确要求去掉：「鼠标停着不动的时候不要出墨」。
   *
   * ★ 教训（比功能本身更值得记）：
   *   上一轮加这个时，站主要的是「墨痕**持续跟随**鼠标、末端随时间慢慢消退」，
   *   我把它实现成「停住也在原地洇墨」—— 这是**过度解读**：
   *   「跟随」指的是痕的**位置跟着笔走**，不是「笔不动时纸自己出墨」。
   *   凡是「增强持续感」的需求，先问一句"停住时应该发生什么"，
   *   否则很容易做出用户没要的、还很难解释的常驻墨团。
   *   ⇒ 现在墨痕**只在 pointermove 里落点**：指针静止 ⇒ 纸面静止，
   *     只有已落的墨按各自年龄继续消退（消退机制完全不受影响）。
   */

  /** 一笔墨痕：位置 + 出生时刻 + 各自的种子。★ 不存"形状"，形状由年龄算出。 */
  type Blob = { x: number; y: number; t0: number; s: number };
  const blobs: Blob[] = [];
  /** 落滴（留言发表）：落点 + 出生时刻。 */
  type Drop = { x: number; y: number; t0: number };
  const drops: Drop[] = [];

  let cw = 0;
  let ch = 0;
  let ctx = ctx0;

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
    ctx = cv.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  /** 单笔墨痕在年龄 age 处的浓度 0..1（f(age)，确定性）。
   *
   * ★★★ age = 0 时**不能是 0**（2026-10-06 线上插桩实测的真凶之一）。
   *   原来的 rise 是 `Math.min(1, age / (LIFE * 0.08))` ⇒ 刚落纸那一刻
   *   浓度 ≈ 0，等于「墨要 0.34 秒后才显形」，与头部母题写的
   *   「落下时最实（刚落纸就吃满）」正好相反，也与真实蓝墨笔不符
   *   （笔尖接触纸面即刻有颜色）。
   *   ⇒ 加一个起始浓度 RISE_FLOOR：落纸即 RISE_FLOOR，随后在 LIFE*0.08 内
   *     加深到满。这样「加深」是渐进的，而「显形」是瞬时的。
   *
   * ★★ 这条改动还有一个连带好处：不再有「age 极小 ⇒ alpha≈0」的区间，
   *   也就让下面那条「GC 必须按时间判、不能按浓度判」的修法变得自洽
   *   （两者本来就会互相打架：alpha 小的点会被当成已经淡完而提前回收）。 */
  function blobAlpha(age: number): number {
    if (age < 0 || age > LIFE) return 0;
    const rise = RISE_FLOOR + (1 - RISE_FLOOR) * Math.min(1, age / (LIFE * 0.08));
    const decay = Math.pow(1 - age / LIFE, HEAL);
    return rise * decay;
  }

  /** 画所有墨痕 + 落滴。★ 不读 DOM、不读几何。`tSec` 是绝对秒。 */
  function draw(tSec: number) {
    if (!cw || !ch) return;
    const trailScale = narrow.matches ? 0.75 : 1;

    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const age = tSec - b.t0;
      /* 跳过的判据是**寿命**（age > LIFE），与 GC / 落滴三处统一。
       * 原来这里写的是 `k <= 0.002`（按浓度跳）—— 与 GC 同病：
       * age≈0 的点会被当成"已经淡完"而不画，加上 RISE_FLOOR 后已不再触发，
       * 但保留阈值判据就等于留着一个同类 bug 的种子，故改成按时间。 */
      if (age > LIFE) continue;
      const k = blobAlpha(age);
      if (k <= 0) continue;
      /* ★ 半径随年龄涨（SMEAR 的渗开）：起始是笔触，之后慢慢胖一圈。
         种子 `b.s` 决定这一笔的渗开**略不对称**（同i 恒定）。 */
      const r = (BLOB_R + age * SMEAR * (0.7 + b.s * 0.6)) * (narrow.matches ? 0.85 : 1);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      /* ★★ 三段而不是两段（2026-10-06 实测后加）：原来的 `(0, 0.5k) → (1, 0)`
         是**从中心就开始衰减**，相邻两笔的重叠区各自都还在衰减段
         ⇒ 交叠处出现浅谷 ⇒ 一串珠子，读起来不像一笔。
         加一段 0.45→0.42k 的**近实心核**，让笔触中段连成实、外缘才化开
         —— 那才是墨在纸上"中间浓、边上洇"的样子。 */
      g.addColorStop(0, A(INK, 0.5 * k * trailScale));
      g.addColorStop(0.45, A(INK, 0.42 * k * trailScale));
      g.addColorStop(0.78, A(INK, 0.16 * k * trailScale));
      g.addColorStop(1, A(INK, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, 6.283);
      ctx.fill();
    }

    /* ---------- 落滴（留言发表成功）----------
     * ★★ 2026-10-06 站主「发评论那个效果我没看到」—— 线上插桩实测到的真相：
     *   事件链路是通的（`__gotDrop = 1`）、落点几何正常（视口内 left=364 top=554）、
     *   画布也确实画了 —— 但**整段生命周期的着色像素峰值只有 229**：
     *     t≈150ms  n=229  peakAlpha=140
     *   原因是三个量级都太小：
     *     ① 下落的水滴 r = 4 + 5(1−fu) ⇒ 直径 8~18px，在 1898×902 的画布上
     *        就是**一个小点**（n≈πr²·dpr² ≈ 230，正好对上实测值）；
     *     ② 扩散环被压成 `ry = rx * 0.42` 的扁椭圆 + 线宽 2.2−j*0.4
     *        ⇒ 环又细又扁，叠在浅色底纹上几乎不可辨；
     *     ③ DROP_LIFE 只有 2.4s ⇒ 一次眨眼就过去了。
     *   ⇒ 不是"没画"，是**画得不够响**。落滴是留言成功的唯一反馈，
     *     必须一眼可见，所以按"物理上应该多大"重做，而不是微调系数。
     *
     * 新形态（三段，全部仍是 age 的确定函数 ⇒ 零随机）：
     *   下落：带**拖尾的水滴**，从落点上方 DROP_FALL_H 高处加速砸下来；
     *   砸点：一团实心墨在原地**炸开再收**（快涨慢收，读成"啪"的一下）；
     *   扩散：3 道**近圆**涟漪 + SPLAT_N 颗**溅射**小墨珠沿确定性角度飞出。
     */
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const age = tSec - d.t0;
      if (age < 0 || age > DROP_LIFE) continue;
      /* 前 DROP_FALL 比例是"下落"，其后是"落地扩散"。 */
      if (age < DROP_LIFE * DROP_FALL) {
        const fu = age / (DROP_LIFE * DROP_FALL);
        /* 自由落体：位移 ∝ fu²（加速），末尾趋近落点 */
        const fall = DROP_FALL_H * (1 - fu) * (1 - fu);
        const y = d.y - fall;
        /* 拖尾：从当前位置向上拉一条**渐细**的水痕，长度随速度增长 */
        const tail = 16 + 30 * fu;
        const g = ctx.createLinearGradient(d.x, y - tail, d.x, y);
        g.addColorStop(0, A(INK, 0));
        g.addColorStop(1, A(INK, 0.72 * trailScale));
        ctx.fillStyle = g;
        ctx.beginPath();
        /* 水滴形状：上尖下圆（水滴的经典轮廓），不画成纯圆饼 */
        ctx.moveTo(d.x, y - tail - 9);
        ctx.quadraticCurveTo(d.x + DROP_HEAD_R * 0.62, y - tail * 0.35, d.x + DROP_HEAD_R, y);
        ctx.arc(d.x, y, DROP_HEAD_R, 0, Math.PI);
        ctx.quadraticCurveTo(d.x - DROP_HEAD_R * 0.62, y - tail * 0.35, d.x, y - tail - 9);
        ctx.fill();
        /* 头部实心（拖尾是渐变，头部要够实才看得见） */
        const gh = ctx.createRadialGradient(d.x, y, 0, d.x, y, DROP_HEAD_R);
        gh.addColorStop(0, A(INK, 0.88 * trailScale));
        gh.addColorStop(0.6, A(INK, 0.7 * trailScale));
        gh.addColorStop(1, A(INK, 0));
        ctx.fillStyle = gh;
        ctx.beginPath();
        ctx.arc(d.x, y, DROP_HEAD_R, 0, 6.283);
        ctx.fill();
      } else {
        const su = (age - DROP_LIFE * DROP_FALL) / (DROP_LIFE * (1 - DROP_FALL));
        /* ① 砸点那团墨：前 18% 快速涨开（读成"啪"），之后慢慢收 */
        const burst = Math.min(1, su / 0.18);
        const br = DROP_BURST_R * Math.sin(Math.PI * Math.min(1, burst * 0.62 + su * 0.38));
        if (br > 0.5) {
          const gb = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, br);
          /* ★★ 衰减指数从 2 降到 1.3（2026-10-06 验收实测）：
              (1−su)² 在 su=0.7 时只剩 0.09 —— 墨还没扩散到最大就已经看不见了，
              实测峰值 alpha 只有 120/255（淡得读不出是"砸"）。*/
          const bk = 0.85 * Math.pow(1 - su, 1.3);
          gb.addColorStop(0, A(INK, bk * trailScale));
          gb.addColorStop(0.5, A(INK, bk * 0.66 * trailScale));
          gb.addColorStop(1, A(INK, 0));
          ctx.fillStyle = gb;
          ctx.beginPath();
          ctx.arc(d.x, d.y, br, 0, 6.283);
          ctx.fill();
        }
        /* ② 近圆涟漪：DROP_RING_RY 从 0.42 提到 0.72 —— 原来压得太扁，
              环叠在浅底纹上读不出来。线宽也整体加粗。*/
        for (let j = 0; j < RINGS; j++) {
          const uu = su - j * 0.15;
          if (uu <= 0 || uu >= 1) continue;
          const rx = DROP_R * Math.sqrt(uu);
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, rx, rx * DROP_RING_RY, 0, 0, 6.283);
          ctx.strokeStyle = A(INK, 0.72 * Math.pow(1 - uu, 1.3) * trailScale);
          ctx.lineWidth = DROP_RING_W - j * 0.7;
          ctx.stroke();
        }
        /* ③ 溅射：SPLAT_N 颗小墨珠沿确定性角度飞出，各自延时起飞。
              ★ 角度/初速/大小全部来自 hash01(常量下标) ⇒ 零随机，
                同一条落滴在任何时刻的形态完全一致（同 t 可逐像素比对）。*/
        for (let j = 0; j < SPLAT_N; j++) {
          const ang = hash01(j * 3 + 5) * 6.283;
          const v = SPLAT_V * (0.45 + hash01(j * 7 + 11) * 0.85);
          const sz = DROP_SPLAT_R * (0.5 + hash01(j * 13 + 3) * 0.8);
          const uu = su - j * 0.045; // 每颗错开一点 ⇒ 看起来是"先后溅开"
          if (uu <= 0 || uu >= 1) continue;
          /* y 方向按 DROP_RING_RY 压扁，模拟落在纸面上（视角是斜的）*/
          const sx = d.x + Math.cos(ang) * v * uu;
          const sy = d.y + Math.sin(ang) * v * uu * DROP_RING_RY;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0.4, sz * (1 - uu)), 0, 6.283);
          ctx.fillStyle = A(INK, 0.8 * Math.pow(1 - uu, 1.15) * trailScale);
          ctx.fill();
        }
      }
    }
  }

  /** 清屏 + 画当前时刻（tSec = performance.now()/1000，**全文件统一用绝对秒**）。
      ★ 痕迹的年龄是 `tSec - b.t0`，所以 t0 也必须存绝对秒 —— 混用相对/绝对
      会让每条痕迹的年龄都是负数（永远淡不掉）。 */
  function paint(tSec: number) {
    fit();
    if (!cw || !ch) return;
    ctx.clearRect(0, 0, cw, ch);
    draw(tSec);
  }

  /** 当前的绝对秒。全文件唯一时间来源。 */
  const nowSec = () => performance.now() / 1000;

  /* ---------- 记录一笔墨痕 ---------- */
  let lastX = -1;
  let lastY = -1;
  /* ★ 不再有 hoverX / hoverY / lastDwell / dwellSeq：
     「停住不出墨」是站主明确要求（见上面那段注释）。
     换句话说，**痕迹数组只在 pointermove 里增长**，rAF 回调不再落点。*/

  /* ---------- 墨痕范围：整页，不设区域门槛 ---------- *
   * ★★ 2026-10-06 站主二次实测**推翻了上一轮的修法**（「量`.prose` 真实几何」）：
   *   那一版把范围从"视口带"收窄成"留言框那一小块"，站主反馈两条：
   *     ①「刚才整个屏幕都能生成墨痕」—— 整屏是**期望行为**，不是事故；
   *     ②「现在只能在留言框里面看到」—— 收窄本身是**回归**。
   *   探针实测（_probe/_ink-where.mjs，真实产物上派发 pointermove 后数着色像素）：
   *
   *     区域          1920 宽     1440 宽
   *     留言框内       19440      19437
   *     框左 260px       970(5%)   1010(5%)   ← 只剩 AREA_PAD 的余量
   *     框右 300px       968(5%)   1091(6%)
   *     框上方 180px        0          0
   *     视口正中12983          0     ← 整条横划**完全不留墨**
   *
   *   两条硬结论：
   *     · `.prose` 判定在**框内**确实是好的（19440）—— 所以上一轮"修好了"是假象，
   *       它只是把用户本来能用的整屏收窄了，症状（断断续续）没消失、只换了成因
   *       （从"框左侧被丢"变成"整屏 95% 被丢"）。**局部正确 ≠ 整体正确。**
   *     · **1440 宽下视口正中一整条划痕为 0**，而 1920 宽下同一位置有 12983
   *       ⇒ 这才是「开 F12 才能看到」的真正成因，与 F12 无关：
   *       F12 一开视口变窄，`.prose` 变成 101..679 几乎横跨视口 ⇒ 蒙对了。
   *
   *   ⇒ 所以**不设门槛**：`onMove` 只在「窄屏」和「reduced-motion」两种降级档里
   *     放弃痕迹，**其余情况整页任意位置都留墨**。这样：
   *       · 不可能再出现"某些区域静默丢墨"（没有区域可丢）；
   *       · 不需要量任何几何 ⇒ 天然满足「不读内容几何」；
   *       · 与视口宽度**彻底解耦** ⇒ 换窗口大小不会有任何行为变化。
   *
   *   仍然要拦的两种情况（都是降级，不是区域）：
   *     · 窄屏（≤767px）：手指划屏会挡输入 ⇒ 只保留落滴。
   *     · reduced-motion：见 onMove 开头的 early return。
   */
  function overMessageArea(x: number, y: number): boolean {
    if (narrow.matches) return false;
    /* 唯一还留的边界：指针要真的落在画布内（画布 = fixed 全屏，
       clientX/Y 天然在范围内，但拖出窗口边缘时可能越界，钳一下更稳）。
       用的是**画布自身尺寸**（fit() 产出的 cw/ch），不涉及任何内容元素。 */
    return x >= 0 && y >= 0 && x <= cw && y <= ch;
  }

  /** 在 (x,y) 落一个墨点。抖动由整数哈希定 ⇒ 同一坐标恒定（零随机）。 */
  function pushBlob(x: number, y: number, t0: number, seedKey: number) {
    blobs.push({ x, y, t0, s: hash01(seedKey) });
    if (blobs.length > TRAIL_MAX) blobs.shift();
  }

  function onMove(e: PointerEvent) {
    if (reduce.matches) return; // RM 下不记痕迹（否则画出来却不动，很怪）
    const x = e.clientX;
    const y = e.clientY;
    if (!overMessageArea(x, y)) {
      /* 出界 ⇒ 断开插值链。指针不在纸上 ⇒ 纸面静止（站主要求：不动不出墨）*/
      lastX = -1;
      lastY = -1;
      return;
    }
    if (lastX >= 0) {
      const dx = x - lastX;
      const dy = y - lastY;
      const dist = Math.hypot(dx, dy);
      /* ★ 移动中：按 TRAIL_STEP 插值落点，让痕是**连续**的一条而不是一串珠子。
         ★ `dist < TRAIL_STEP` 时直接 return —— 这条同时也是「停住不出墨」的实现：
           指针不动 ⇒ 没有新的 pointermove ⇒ 这段根本不执行；
           即使有零抖动事件（亚像素），位移不足一个笔刷间距也不落新点，
           所以停住时纸面**不会**继续变浓。 */
      if (dist < TRAIL_STEP) return;
      const steps = Math.min(STEPS_CAP, Math.floor(dist / TRAIL_STEP));
      const ts = nowSec();
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const px = lastX + dx * t;
        const py = lastY + dy * t;
        pushBlob(px, py, ts, Math.round(px * 7 + py * 13));
      }
    }
    lastX = x;
    lastY = y;
    // 有新痕迹 ⇒ 保证下一帧会画（哪怕当时处于"无痕迹可省"的省帧分支）
    needsPaint = true;
  }

  /* ---------- 落滴：留言发表成功 ---------- */
  function onDrop(e: Event) {
    const det = (e as CustomEvent<{ x?: number; y?: number }>).detail;
    /* 落点：优先用评论列表首项的位置（"新留言落在列表里"），
       没有就给视口上方 —— 站主要的是"落下的墨滴"，位置可退化为常量。
     *
     * ★ 钳制到**可见带**（2026-10-06 加，理由是几何不在场）：
     *   列表很长时，新评论被 prepend 到列表**顶部**，那个位置很可能在
     *   视口**之上** ⇒ 落滴会落在屏幕外 ⇒ 站主提交成功却"什么都没发生"。
     *   这正是"没看到"的一类可能成因，不能只靠事件链路通就认为效果成立。
     *   ⇒ 把落点夹进「离视口上下边缘各留 DROP_FALL_H 的带子里」，
     *     超出的部分直接贴到带边（不重新居中，保持"落在留言那边"的方向感）。*/
    const inX = det?.x ?? cw * 0.5;
    const inY = det?.y ?? ch * 0.42;
    const marginY = Math.min(DROP_FALL_H, ch * 0.4);
    const y = Math.max(marginY, Math.min(ch - marginY * 0.5, inY));
    drops.push({ x: Math.max(0, Math.min(cw, inX)), y, t0: nowSec() });
    if (drops.length > 8) drops.shift();
    needsPaint = true;
  }

  /* ---------- 省帧标志：累积状态变化时才强制画 ---------- */
  let needsPaint = false;

  if (!animate) {
    /* reduced-motion：画一帧「几滴正在渗开」的静态墨（见头部①：本页有终态）。 */
    /* ⚠★ 必须**先 fit() 再放墨**：`cw/ch` 是 fit() 量出来的，fit() 之前它们是 0
       ⇒ 三滴的坐标会全算成 (0,0)，叠在左上角一个点上。
       教训与「读数脚本要等几帧」同源：凡是由 fit() 产出的量，都不能用在 fit() 之前。 */
    fit();
    const base = RM_T;
    /* t0 给「已出生」的值（早于 base）⇒ 画出来是"正在渗开、还没收干净"的样子。
       这就是 RM 档的**终态**（本页有终态，不像 FLOAT 只能随便挑相位）。 */
    blobs.push({ x: cw * 0.34, y: ch * 0.62, t0: base - 0.5, s: 0.2 });
    blobs.push({ x: cw * 0.42, y: ch * 0.7, t0: base - 1.1, s: 0.7 });
    blobs.push({ x: cw * 0.58, y: ch * 0.58, t0: base - 1.7, s: 0.5 });
    paint(base);
    /* ★★ 这一行原来漏了 ⇒ RM 档画完直接 return，画布永远停在 opacity:0，
       **画了等于没画**（实测：canvas 是 300×150 默认尺寸 + opacity 0 + 无 .is-ready）。
       显隐门控是 opacity，所以两条分支（RM / 正常）都必须显形。 */
    cv.classList.add('is-ready');
    window.addEventListener('resize', () => paint(base), { passive: true });
    return;
  }

  /* 首帧同步画（理由同 float.ts：真观感 + 验收）。此刻无痕迹 ⇒ 只有落滴（若已有）。
     首帧是空的也没关系 —— 墨滴本来要等留言或指针。 */
  paint(nowSec());
  /* 就绪 ⇒ 显形（opacity 门控，见头部） */
  cv.classList.add('is-ready');

  /* ---------- 上一版的三个「重测留言区范围」时机已全部删除 ---------- *
   * 2026-10-06：范围不再有门槛（见上面那段），因此
   *   ① 首帧后量 `.prose`   —— 不需要（没有区域要量）
   *   ② resize 重量         —— 不需要（范围与视口宽度无关）
   *   ③ ResizeObserver 观察 —— 不需要（没有会变的边界）
   * 唯一与尺寸有关的仍保留：`resize` 时重画（画布位图尺寸要跟着 DPR/视口变）。
   * 这也让上一轮加的 `getBoundingClientRect` / `ResizeObserver` 全部消失 ——
   * 「不读内容几何」这条约定自动成立，不需要靠"小心地量"来遵守。
   */

  /* ★ 显式传 `initialOnScreen: true`—— 这台的画布是 `position:fixed; inset:0`，
     IO 对满屏固定层的首次回调**不保证一定来**（实测 1920×1000 下自建 IO
     回调 0 次）。而本装置每帧开头就 `if (!gate.onScreen) return`
     ⇒ IO 不回调 = 一笔都不画，且只有强制重排（开 F12）才恢复。
     站主 2026-10-06 实测症状正是「整页没墨、开 F12 立刻全出现」。
     详见 rl-core.ts `createActivityGate` 函数头的★★★ 那条注释。 */
  const gate = createActivityGate(cv, { initialOnScreen: true });
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('inkdrop', onDrop as EventListener);

  const stop = startLoop(() => {
    if (!gate.onScreen || !gate.visible) return;
    const ts = nowSec();

    /* ★★★ 这里**不再有任何"指针停住也落墨"的逻辑**（站主 2026-10-06 晚要求：
       「鼠标停着不动的时候不要出墨」）。痕迹数组只在 onMove 里增长。
       rAF 回调只负责「把已有的痕迹按年龄重新画一遍 + 回收超期的」。
      ⇒ 这也意味着：停住时纸面**只淡不增**，这正是墨在纸上干涸的样子。*/

    /* ★ 累积状态（痕迹/落滴）不是 f(t)，所以**每帧都要重画**——
       痕迹在淡、落滴在扩散，不重画就会僵住。只有"确实什么都没有"才省帧。 */
    const has = blobs.length > 0 || drops.length > 0;
    if (!has && !needsPaint) return;
    needsPaint = false;
    paint(ts);
    /* ★★★ 回收必须按**时间**判，不能按**浓度**判（2026-10-06 线上插桩实测的真凶）。
     *
     * 症状（站主真机）：留言页**整页看不到任何墨痕**，刷新无用。
     * 线上插桩（CDP Fetch 拦下真实 chunk 换插桩版，1920×1000）拿到的硬数据：
     *     gate=[true,true]  calls=41  pushed=200  gcRemoved=200  blobs=0  ink=0
     *     gcAges=[0.0002,0.0002,0.0002,0.0002,0.0002,0.0001,...]  negAges=0
     *   ⇒ 墨点**确实落了 200 个**，但每个都在**落纸后 0.1~0.2 毫秒**被 GC 删掉。
     *
     * 机制：`blobAlpha(age)` 在 age→0 时约等于 `age/(LIFE*0.08)`，所以
     *   刚落的点浓度 ≈ 0.0002/0.336 = 0.0006 < GC 阈值 0.002
     *   ⇒ 同一帧的清理循环把**刚落下的每一个点**都当成「已经淡干净」回收。
     * 而 Chrome 每帧的顺序是**先派发输入事件、再跑 rAF** ⇒ 真实鼠标移动时，
     *   pointermove 落下的点在**同一帧内**就被删 ⇒ 屏幕上永远干净。
     *
     * 为什么之前所有探针都"测到有墨"（39944/61185/46656…）——**它们全都假绿**：
     *   它们在一个**同一个 JS task 内**派发 300 个合成 PointerEvent，
     *   中间**不跑帧** ⇒ age 在 GC 跑到时已经攒到几百毫秒 ⇒ 点全活下来。
     *   一旦换成「事件与帧交替」（真实鼠标的节奏），立刻归零。
     *   ⇒ 教训：**探针必须复现生产的时序**（事件与帧交替），
     *     否则量到的是「理想时序下的行为」，与真机相反。
     *
     * 修法：回收判据改成 `age > LIFE`（唯一有物理意义的判据：寿命到了）。
     *   ★ 同一段代码里的落滴回收**本来就是**按时间判的（`ts - d.t0 > DROP_LIFE`），
     *     两套判据不一致就是 bug 的形状 —— 照抄落滴那条即可。
     *   ★ 改后 blobAlpha 只剩「画的时候多浓」这一个职责，回收与浓度解耦。 */
    for (let i = blobs.length - 1; i >= 0; i--) {
      if (ts - blobs[i].t0 > LIFE) blobs.splice(i, 1);
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      if (ts - drops[i].t0 > DROP_LIFE) drops.splice(i, 1);
    }
  });

  /* resize 只重画（画布位图尺寸要跟着视口/DPR 变）。
     ★ 不再"先重量" —— 范围已无区域边界，换视口宽度不该改变任何行为。 */
  window.addEventListener('resize', () => {
    paint(nowSec());
  }, { passive: true });

  window.addEventListener('beforeunload', () => {
    stop();
    gate.dispose();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('inkdrop', onDrop as EventListener);
  }, { once: true });
})();