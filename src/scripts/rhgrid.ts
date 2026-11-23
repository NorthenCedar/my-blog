
import { onPage } from './page-lifecycle';
onPage(({document, window, addEventListener, matchMedia, requestAnimationFrame, cancelAnimationFrame, setTimeout, clearTimeout, IntersectionObserver, ResizeObserver}) => {
// 弹性流场线（2026-09-30，随 v10.6 原型一起搬进本站）
//
// 逐字移植自视觉原型 nc-rhine-v7 v10 的 initRhGrid()，原型那版又是逐字移植自
// wodniack.dev 的 <a-waves> 自定义元素 —— 参数全部原站实测，勿凭感觉改。
//
// ---------------------------------------------------------------------------
// ★ 上一版错在哪（「鼠标放上去网就没了」，站主原话）
//
//   我理解成「12×N 网格被鼠标推开」，还漏掉原站三个关键约束：
//     ① clamp(±100) 位移限幅  ② 阻尼 .925  ③ 回弹 .005
//   位移不设限 → 点被推出可见区 → 视觉上「网没了」。
//   这三步在 move() 末尾，改任何一个都会复发。
//
// ---------------------------------------------------------------------------
// 原型真相：不是网格，是**几十条平行竖线**，每点被两套位移叠加
//
//   · wave   perlin2((x + t*.0125)*.002, (y + t*.005)*.0015) * 12
//            wave.x = cos(o)*32   wave.y = sin(o)*16
//            噪声整片推着线流动（观感 = 等高线 / 流场）
//   · cursor c = max(175, vs)；f = cos(h*.001) * (1 - h/c)
//            vx += cos(a) * f * c * vs * 6.5e-4   （a = 鼠标运动方向角）
//            回弹 vx += (0-x)*.005 → 阻尼 vx *= .925 → x += vx*2 → clamp(±100)
//   末点不叠加 cursor 位移，避免线头翘起。
//
// 性能：1440 宽 → 116 条 path，每帧只改 d 属性（不增删 DOM）。
// 出视口停帧；reduced-motion 只画一帧静态。
//
// ---------------------------------------------------------------------------
// ★ 2026-09-30 第八版：这批线**同时就是开场动画的线**
//
//   站主原话：「像 wodniack.dev 一样，开屏动画出现的线正好可以接上主页的线」。
//   第七版是覆盖层自带 96 条 + 首屏 104 条，实测五轴全对不上（列距 / 高度 / 颜色 /
//   明度 / 条数）⇒ 遮罩撤走时读作"换了一批线"。参考站的做法是**根本没有第二套线**：
//   他开场的 drawSVG 就画在首屏那批 `.js-line` 上。
//
//   所以这里多落三个内联变量（见 build() 里的注释），把"这批线自己的列位与 ∞ 采样"
//   交给 CSS 当动画参数用。draw() 每帧只写 d，**不碰 transform** ⇒ 两者不打架。
//
// ---------------------------------------------------------------------------
// ★ 2026-10-01 第九版：时间基准回到**毫秒**（这批线才真的会"缓慢流动"）
//
//   站主原话：「像 wodniack.dev 一样视觉感官上那些线在缓慢移动」。
//   量出来的事实：本站顶点位移 0.006 px/s（等于静止）。根因不是参数、是**单位** ——
//   参考站 ticker 发毫秒（`$.emit("tick", t*1e3)`，GSAP 的 t 是秒、它乘了 1000），
//   本站移植时写成 `now / 1000` ⇒ 噪声项慢 1000 倍。
//   ⇒ 详见 tick() 里的注释；回归读数见 `_probe/cdp-flow-drift.mjs`（② 运动 那一行）。
//
// ---------------------------------------------------------------------------
// ★ 2026-10-01 第十版：流场加**弹性**（跟随弹簧 + 横向呼吸）
//
//   站主原话：「把本站的线改的更有弹性一点，不要太多」。
//
//   ★★ 这一版最贵的一课：**"全场统一"的改动是看不见的**。
//      先只做了跟随弹簧（二阶低通），还用固定种子扫了三档 ω₀（∞ / 1.04 / 0.70 rad/s）
//      实测摆幅 38.22 / 38.95 / 38.90、相邻转角 3.68 / 3.75 / 3.76 —— **三档一模一样**。
//      原因两条：弹簧只产生"整片一起晚一拍 + 整体缩一点"，没有参照物；
//      而噪声场的能量几乎全在 λ > 170 px（每条线弧长 881 px、走向反向 5.2 次），
//      截止波长真压到它之下时，滤掉的是**主起伏本身**（= 线变平），不是"弹性"。
//      ⇒ 必须让响应在**空间上不均匀** ⇒ 才有沿 x 带波长的"呼吸"（WAVE_BR 那几行）。
//
//      ★ 而且呼吸必须**绕过弹簧**（乘在弹簧输出上）：乘在输入上时，弹簧在 r≈1 处
//        把它衰减到 |H|≈0.83 并滞后 90°，再与场的自然波动相位抵消 ——
//        实测"有呼吸"的摆幅起伏 8.5% **小于**"无呼吸"的 12.3%（同种子同 t）。
//        接线见 move() 里的 ②；回归断言在 tests/flow-field.test.ts。
//
//   ★★ 第二课：弹簧必须**帧率无关**。第一版用的是"每帧固定系数"（`v += (T-x)*S; v *= D`）
//      ⇒ 等效 ω₀ = √S × **实际帧率** ⇒ 120 Hz 屏上弹性快一倍、掉帧时又变慢。
//      症状是**验收直接失效**：同一版本线上跑两遍，逐点差 7.4–12.3 px，
//      正好等于要测的"弹性效果本身"（无弹性版噪声底只有 0.04–0.40 px）。
//      ⇒ 改用物理量 + 真实 dt 的半隐式欧拉（`WAVE_W2`/`WAVE_Z2` 由原系数推导，60 fps 行为不变）。
//
//   回归工具（三层，缺一层就会得出错误结论）：
//     · `_probe/cdp-flow-drift.mjs` —— 同 t 的统计量（摆幅 / 转角 / 帧率）。
//     · `_probe/cdp-flow-sync.mjs`  —— **同种子 + 同 performance.now() 逐点比对**：
//       这是唯一能确认"改动到底有没有改变形状"的手段（噪声底 0.04–0.40 px，
//       而"弹簧+呼吸"相对无弹性版本是 10–13 px ⇒ 差 30 倍，结论确凿）。
//     · `_probe/cdp-flow-series.mjs` —— 目标运动的频率特性（自相关主周期）。

const host = document.getElementById('rhGrid');
const svg = document.getElementById('rhGridSvg');

if (host && svg) initRhGrid(host, svg);

function initRhGrid(host: HTMLElement, svg: SVGSVGElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Perlin 噪声（逐字移植 class Sc） ---------- */
  class Grad {
    constructor(public x: number, public y: number) {}
    dot2(x: number, y: number) {
      return this.x * x + this.y * y;
    }
  }
  class Noise {
    grad3 = [
      new Grad(1, 1), new Grad(-1, 1), new Grad(1, -1), new Grad(-1, -1),
      new Grad(1, 0), new Grad(-1, 0), new Grad(1, 0), new Grad(-1, 0),
      new Grad(0, 1), new Grad(0, -1), new Grad(0, 1), new Grad(0, -1),
    ];
    p = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
      8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,
      57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,
      77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,
      65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,
      164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,
      207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,
      221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,
      104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,
      239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,
      236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
    perm = new Array(512);
    gradP = new Array(512);
    constructor(seed = 0) {
      this.seed(seed);
    }
    seed(t: number) {
      if (t > 0 && t < 1) t *= 65536;
      t = Math.floor(t);
      if (t < 256) t |= t << 8;
      for (let e = 0; e < 256; e++) {
        const i = e & 1 ? this.p[e] ^ (t & 255) : this.p[e] ^ ((t >> 8) & 255);
        this.perm[e] = this.perm[e + 256] = i;
        this.gradP[e] = this.gradP[e + 256] = this.grad3[i % 12];
      }
    }
    fade(t: number) {
      return t * t * t * (t * (t * 6 - 15) + 10);
    }
    lerp(t: number, e: number, i: number) {
      return (1 - i) * t + i * e;
    }
    perlin2(t: number, e: number) {
      let i = Math.floor(t), s = Math.floor(e);
      t -= i; e -= s; i &= 255; s &= 255;
      const r = this.gradP[i + this.perm[s]].dot2(t, e);
      const n = this.gradP[i + this.perm[s + 1]].dot2(t, e - 1);
      const o = this.gradP[i + 1 + this.perm[s]].dot2(t - 1, e);
      const a = this.gradP[i + 1 + this.perm[s + 1]].dot2(t - 1, e - 1);
      const l = this.fade(t);
      return this.lerp(this.lerp(r, o, l), this.lerp(n, a, l), this.fade(e));
    }
  }

  /* ---------- 参数（原站实测，勿凭感觉改）---------- */
  const GAP_X = 14; // 列距（原站 10；1440 宽 → 116 条）
  const GAP_Y = 30; // 行距（原站 32）
  const PAD_X = 90; // 宽度外扩（原站 200）—— 只为让弯折不出边框
  const PAD_Y = 60; // 高度外扩（原站 30）
  const WAVE_TX = 0.0125, WAVE_TY = 0.005, WAVE_SC = 0.002, WAVE_SC2 = 0.0015;
  const WAVE_AMP_X = 32, WAVE_AMP_Y = 16;
  /* ★ 流场弹性（2026-10-01 第十版，站主：「把本站的线改的更有弹性一点，不要太多」）
     由**两层**组成 —— 只做第二层是没用的，原因见下。

     ① 跟随弹簧：noise 的目标值不再直接赋值给 wave，而是让 wave 用二阶弹簧去"追"
        （**帧率无关**：物理量 ω₀/ζ + 真实 dt 的半隐式欧拉，见 WAVE_W2/WAVE_Z2）：

            a = ω₀²·(target − x) − 2ζω₀·v      ← 加速度（px/s²）
            v += a · dt ;  x += v · dt          ← 半隐式欧拉

     ② 横向呼吸：弯曲强度沿 x 按波长起伏、并随时间缓慢流过（`WAVE_BR` 那一行）。

     ★★ 为什么必须有 ②：单独做 ① 实测**完全不可见**。固定噪声种子做了三档扫描
        （_probe/cdp-flow-drift.mjs --seed，摆幅 / 相邻转角 / 最大转角）：

            ω₀ = ∞（无弹簧）  摆幅 38.22 ± 2.18 · 转角 3.68° · 最大 22.22°
            ω₀ = 1.04         摆幅 38.95 ± 1.76 · 转角 3.75° · 最大 23.20°
            ω₀ = 0.70         摆幅 38.90 ± 1.16 · 转角 3.76° · 最大 23.62°

        三档的差别全落在 ± 之内 —— 也就是"没做"。两个原因叠在一起：
          · 弹簧是**全场统一**的 ⇒ 只产生"相位滞后 + 幅度缩放"，而两者都发生在
            整片场上、没有参照物（人眼只能看出"差异"，看不出"一起晚了"）。
          · 这批噪声场的能量几乎**全在 λ > 170 px**（实测每条线弧长 881 px、
            走向反向 5.2 次 ⇒ 平均褶长 ≈ 170 px）。截止波长要压到它之下才有东西
            可滤，而那时滤掉的已经是**主起伏本身**（观感 = 线变平），不是"弹性"。
        ⇒ 结论：可见的弹性必须来自**空间上不均匀**的响应。呼吸给了它一个"参照" ——
          同一时刻，视口左边和右边的线弯曲程度不同，两边在缓慢地此消彼长。

     ★★ 比版本必须**固定噪声种子**：场来自 `new Noise(Math.random())`，不固定的话
        两次加载的摆幅能差 25%（实测 31 vs 40），比的是种子不是版本 —— 踩过。 */
  const WAVE_S = 1.36e-4;   // 刚度/帧²（**以 60 fps 为基准**）⇒ ω₀ = √S × 60 ≈ 0.70 rad/s
  const WAVE_D = 0.9860;    // 阻尼/帧（**以 60 fps 为基准**）⇒ ζ ≈ 0.6（< 0.707 ⇒ 约 9% 的轻微过冲）
  /* ★★ 帧率无关化（2026-10-01 补，接在弹性之后）：
     上面两个系数是"**每帧**"的，直接拿去积分意味着等效 ω₀ = √S × **实际帧率** ——
     而真实帧间隔是变的（掉帧、后台标签、120 Hz 屏）⇒ **线的弹性会随显示器刷新率变**：
     60 Hz 上是 0.70 rad/s，120 Hz 上就是 1.40 rad/s（快一倍、过冲也更大）。
     实测症状：同一版本的线上跑两遍，逐点差 **7.4–12.3 px** ——
     而无弹性版的噪声底只有 0.04–0.40 px（形状本该是 seed + t 的确定函数）。
     这个量级**正好等于**要验收的"弹性效果本身"⇒ 不修的话什么都验不出来。
     ⇒ 改成物理量 + **真实 dt** 的半隐式欧拉（v 的单位从 px/帧 变成 px/s）：
            a = ω₀²(target − x) − 2ζω₀·v ;  v += a·dt ;  x += v·dt
     下面两个常量就是从上面对系数**推导**出来的，取值不变（60 fps 下行为一致）：
        ω₀²  = S × 60²  = 0.4896
        2ζω₀ = (1 − D) × 60 = 0.8400   （因为 ζ = (1−D)/(2√S)、ω₀ = √S × 60） */
  const WAVE_W2 = WAVE_S * 3600;          // ω₀² ≈ 0.4896
  const WAVE_Z2 = (1 - WAVE_D) * 60;      // 2ζω₀ ≈ 0.8400
  const DT_MAX = 0.05;                    // dt 上限（秒）：切回标签 / 长卡顿时别让弹簧"跳过去"
  const WAVE_BR = 0.20;     // 呼吸深度 ±20% —— ★ 不是拍脑袋，是按"能不能被测出来"定的：
                            //   场自身的摆幅起伏就有 ±12%（同种子同 t 实测，10 帧极差 12.3%），
                            //   呼吸比它小就淹没在里面。±13% 实测只把起伏抬到 14.7%（+20%，
                            //   10 个样本下不显著）；±20% ⇒ 预期叠加后 ≈23%，明确高于 12.3%。
  const WAVE_BR_MS = 9000;  // 呼吸周期：与主起伏（≈13 s）同量级、略快 ⇒ 看得出在"呼"
  const WAVE_BR_WL = 1600;  // 呼吸的**横向波长** —— 可见性的关键：全场同步地变弯
                            //   没有参照（看不出来），有波长才有"从这头流到那头"
  const CUR_R = 175, CUR_K = 6.5e-4;
  const SPRING = 0.005, DAMP = 0.925, CLAMPV = 100;

  const noise = new Noise(Math.random());
  const mouse = { x: -1e4, y: -1e4, lx: -1e4, ly: -1e4, sx: -1e4, sy: -1e4, vs: 0, a: 0, set: false };
  let W = 0, H = 0;
  let cols: {
    x: number; y: number;
    wave: { x: number; y: number };
    wv: { x: number; y: number };
    wb: { x: number; y: number }; // = wave × 呼吸（draw 真正消费的是这个）
    ini: boolean;
    cursor: { x: number; y: number; vx: number; vy: number };
  }[][] = [];
  let paths: SVGPathElement[] = [];
  let raf = 0, T = 0, lastNow = 0;
  let onScreen = true;

  const measureHost = () => {
    const r = host.getBoundingClientRect();
    return {
      w: host.clientWidth || r.width,
      h: host.clientHeight || r.height,
    };
  };

  const setSize = () => {
    const { w, h } = measureHost();
    W = w; H = h;
    if (W > 0 && H > 0) svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  };

  const build = () => {
    cols = [];
    paths.forEach((p) => p.remove());
    paths = [];
    svg.replaceChildren();
    if (W < 1 || H < 1) return;
    const w = W + PAD_X * 2, h = H + PAD_Y * 2;
    const nc = Math.ceil(w / GAP_X), nr = Math.ceil(h / GAP_Y);
    const offX = (W - GAP_X * nc) / 2, offY = (H - GAP_Y * nr) / 2;
    const frag = document.createDocumentFragment();
    for (let c = 0; c <= nc; c++) {
      const col = [];
      const cx = offX + GAP_X * c;
      for (let g = 0; g <= nr; g++) {
        col.push({
          x: cx,
          y: offY + GAP_Y * g,
          wave: { x: 0, y: 0 },
          wv: { x: 0, y: 0 },
          wb: { x: 0, y: 0 },
          ini: false, // 首帧直接落位（见 move()）—— 别让线从"平"慢慢起褶
          cursor: { x: 0, y: 0, vx: 0, vy: 0 },
        });
      }
      const f = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      f.setAttribute('class', 'rh-grid__path');
      /* ★ 开场揭幕的三个内联变量（2026-09-30 第八版）—— 这里**只落数据，不做任何动画协调**，
         动画全在 index.astro 的 @keyframes rh-bloom 里。这就是"开场那批线 = 首屏这批线"
         的实现方式：同一批 DOM 拿自己的列位/采样点当动画参数，就没有"两批线对不齐"这回事。
           --x    这条线的列位（px，= SVG 的 user unit）
           --k    它在 ∞ 上的横向采样点（双纽线 x = cos θ）：崩解起点 = 中心 + --k × ∞ 半宽。
                  顺序按列号递增 ⇒ 就是 ∞ 的描绘顺序，观众认得出"这是刚才那个 ∞ 散开的"。
           --st   错峰延迟（**从两端向中间**，同 wodniack 的 stagger.from:'edges'）：
                  两端的线先起飞、中间的线殿后，观感是"整片线向中间收拢着长起来"。 */
      const k = Math.cos((Math.PI * 2 * c) / (nc || 1));
      // ★ --x 必须带 px：CSS 那边是 calc(50vw + … - var(--x)) —— 少个单位就成了
      //   "长度减纯数字"，整条 transform 声明在计算值阶段作废 ⇒ 动画恒为 transform:none。
      //   （2026-09-30 实测踩到：所有读数正常，只有 scaleY 起飞那一下没了。）
      f.style.setProperty('--x', cx.toFixed(1) + 'px');
      f.style.setProperty('--k', k.toFixed(4));
      // 错峰步长 4ms（共 nc/2 ≈ 52 档 ⇒ 最多 ~208ms）：太大时"还在飞的"和"已经长的"会同时
      // 存在，两批线互相插穿 ⇒ 揭幕中段出现一团乱麻（实测 8ms 时很明显）。
      f.style.setProperty('--st', Math.min(c, nc - c) * 4 + 'ms');
      frag.appendChild(f);
      paths.push(f);
      cols.push(col);
    }
    svg.appendChild(frag);
  };

  const move = (t: number, dt: number) => {
    const mx = mouse.sx, my = mouse.sy;
    const mA = mouse.a, mvs = mouse.vs;
    const c = Math.max(CUR_R, mvs);
    const c2 = c * mvs * CUR_K;
    const ca = Math.cos(mA) * c2, sa = Math.sin(mA) * c2;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      /* ★ 呼吸：弯曲强度沿 x 按波长起伏、并随时间缓慢流过（WAVE_BR 那一行 + 文件上方注释）。
         同列的列位相同 ⇒ 这一项整个列共用一个值，提到内层循环外算（每点一次 sin 没必要）。 */
      const breath = 1 + WAVE_BR * Math.sin((t / WAVE_BR_MS - col[0].x / WAVE_BR_WL) * Math.PI * 2);
      for (let k = 0; k < col.length; k++) {
        const pt = col[k];
        const o = noise.perlin2((pt.x + t * WAVE_TX) * WAVE_SC, (pt.y + t * WAVE_TY) * WAVE_SC2) * 12;
        const tx = Math.cos(o) * WAVE_AMP_X;
        const ty = Math.sin(o) * WAVE_AMP_Y;
        // ① 弹簧追的是**纯噪声目标**（不带呼吸 —— 见下面 ② 的注释）。
        //   用**真实 dt**（秒）做半隐式欧拉 ⇒ 帧率无关，见 WAVE_W2/WAVE_Z2 的注释。
        if (pt.ini && dt > 0) {
          pt.wv.x += (WAVE_W2 * (tx - pt.wave.x) - WAVE_Z2 * pt.wv.x) * dt;
          pt.wv.y += (WAVE_W2 * (ty - pt.wave.y) - WAVE_Z2 * pt.wv.y) * dt;
          pt.wave.x += pt.wv.x * dt;
          pt.wave.y += pt.wv.y * dt;
        } else {
          // 首帧（含 resize 重建、dt=0）**直接落位**：否则开场那 1–2 秒线是"平"的、
          // 要慢慢才起褶；改窗宽时也会看到一次"从平到皱"的过渡。
          pt.wave.x = tx; pt.wave.y = ty; pt.ini = true;
          pt.wv.x = 0; pt.wv.y = 0;
        }
        // ② ★ 呼吸必须作用在弹簧**输出**上（绕过滤波）。
        //   一开始是乘在"目标"上的，实测等于没做：弹簧在 r≈1（呼吸周期 9 s、
        //   ω₀=0.70 ⇒ r≈1.0）处 |H|≈0.83 且滞后 90°，把呼吸衰减掉一大半，
        //   剩下的还与场的自然波动（±12%）相位抵消 —— 结果是"有呼吸"的摆幅起伏
        //   8.5%，**反而小于**无呼吸的 12.3%（同种子同 t 实测）。绕过去之后呼吸是
        //   100% 强度地直接改形状，这才是可见的那一半。
        pt.wb.x = pt.wave.x * breath;
        pt.wb.y = pt.wave.y * breath;
        if (!reduce) {
          const dx = pt.x - mx, dy = pt.y - my;
          const h = Math.sqrt(dx * dx + dy * dy);
          if (h < c) {
            const p = 1 - h / c, f = Math.cos(h * 0.001) * p;
            pt.cursor.vx += ca * f;
            pt.cursor.vy += sa * f;
          }
        }
        // 回弹 + 阻尼 + 限幅 —— 这三步是「鼠标上去就没了」的根治点
        pt.cursor.vx = (pt.cursor.vx + (0 - pt.cursor.x) * SPRING) * DAMP;
        pt.cursor.vy = (pt.cursor.vy + (0 - pt.cursor.y) * SPRING) * DAMP;
        let nx = pt.cursor.x + pt.cursor.vx * 2;
        let ny = pt.cursor.y + pt.cursor.vy * 2;
        pt.cursor.x = nx > CLAMPV ? CLAMPV : nx < -CLAMPV ? -CLAMPV : nx;
        pt.cursor.y = ny > CLAMPV ? CLAMPV : ny < -CLAMPV ? -CLAMPV : ny;
      }
    }
  };

  const draw = () => {
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const f0 = col[0];
      // ★ 消费的是 wb（= wave × 呼吸），不是 wave —— 呼吸绕过了弹簧，见 move() 里的 ②
      let d = 'M' + (f0.x + f0.wb.x) + ' ' + (f0.y + f0.wb.y);
      for (let k = 1; k < col.length; k++) {
        const pt = col[k], last = k === col.length - 1;
        const cx = last ? 0 : pt.cursor.x, cy = last ? 0 : pt.cursor.y;
        d += 'L' + (((pt.x + pt.wb.x + cx) * 10) | 0) / 10 + ' ' +
             (((pt.y + pt.wb.y + cy) * 10) | 0) / 10;
      }
      paths[i].setAttribute('d', d);
    }
  };

  const tick = (now: number) => {
    /* ★★ 时间基准 = **毫秒**（2026-10-01 修，站主：「像 wodniack.dev 一样视觉感官上那些线在缓慢移动」）
       参考站给噪声项喂的是毫秒 —— 它的 ticker 是 `$.emit("tick", t*1e3)`
       （GSAP ticker 的 t 是秒，参考站在 emit 时自己乘了 1000）。
       本站在第七版移植时写成了 `now / 1000`（秒）⇒ 噪声项慢 **1000 倍**
       ⇒ 实测顶点位移 0.006 px/s，视觉上完全静止（"冻住"）。
       换回毫秒后 ≈ 12 px/s：噪声场以 0.0125 px/ms 横向流过，正是参考站那种"缓慢移动"。
       ★ 这个 T 只喂给 move() 的噪声项，不参与鼠标弹簧（那套用鼠标位移算，与 T 无关）。 */
    T = now;
    /* ★ 真实帧间隔（秒），喂给弹簧 ⇒ 帧率无关（见 WAVE_W2/WAVE_Z2 的注释）。
       上限 DT_MAX：切回标签页 / 长卡顿后别让弹簧一次"跳"过头。 */
    const dt = Math.min(DT_MAX, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    mouse.sx += (mouse.x - mouse.sx) * 0.1;
    mouse.sy += (mouse.y - mouse.sy) * 0.1;
    const dx = mouse.x - mouse.lx, dy = mouse.y - mouse.ly;
    mouse.vs = Math.min(100, mouse.vs + (Math.sqrt(dx * dx + dy * dy) - mouse.vs) * 0.1);
    mouse.lx = mouse.x; mouse.ly = mouse.y;
    mouse.a = Math.atan2(dy, dx);
    move(T, dt); draw();
    raf = requestAnimationFrame(tick);
  };

  let rt = 0;
  const rebuild = () => {
    clearTimeout(rt);
    rt = 0;
    setSize();
    build();
    if (cols.length > 0) {
      move(T, 0);
      draw();
      if (!reduce && onScreen && !raf) raf = requestAnimationFrame(tick);
    }
  };

  const syncSize = (immediate = false) => {
    const { w: nextW, h: nextH } = measureHost();
    if (nextW < 1 || nextH < 1) return;
    if (cols.length > 0 && Math.abs(nextW - W) < 1 && Math.abs(nextH - H) < 1) return;
    if (immediate || cols.length === 0 || Math.abs(nextW - W) > 20 || Math.abs(nextH - H) > 20) {
      rebuild();
    } else {
      clearTimeout(rt);
      rt = window.setTimeout(rebuild, 160);
    }
  };

  const onMove = (e: MouseEvent | TouchEvent) => {
    const r = host.getBoundingClientRect();
    if (!onScreen) {
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) {
        onScreen = true;
      } else {
        return;
      }
    }
    const { w, h } = measureHost();
    if (cols.length === 0 || Math.abs(w - W) > 20 || Math.abs(h - H) > 20) {
      syncSize(true);
    }
    if (r.width <= 0 || r.height <= 0 || W <= 0 || H <= 0) return;
    const t = 'touches' in e ? e.touches[0] : e;
    if (!t) return;
    mouse.x = ((t.clientX - r.left) / r.width) * W;
    mouse.y = ((t.clientY - r.top) / r.height) * H;
    if (!mouse.set) {
      mouse.sx = mouse.x; mouse.sy = mouse.y;
      mouse.lx = mouse.x; mouse.ly = mouse.y;
      mouse.set = true;
    }
    if (!raf && !reduce) raf = requestAnimationFrame(tick);
  };

  setSize(); build();
  mouse.sx = mouse.lx = W / 2;
  mouse.sy = mouse.ly = H / 2;

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => syncSize(false)).observe(host);
  }
  addEventListener('resize', () => syncSize(false));

  if (reduce) { move(0, 0); draw(); return; } // 降级：只画一帧静态

  addEventListener('mousemove', onMove, { passive: true });
  addEventListener('touchmove', onMove, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      onScreen = es[es.length - 1].isIntersecting;
      if (onScreen) {
        if (cols.length === 0) syncSize(true);
        if (!raf) raf = requestAnimationFrame(tick);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }, { threshold: 0.02 }).observe(host);
  }
  raf = requestAnimationFrame(tick);
}

});
