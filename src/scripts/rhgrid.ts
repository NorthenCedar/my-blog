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
  const CUR_R = 175, CUR_K = 6.5e-4;
  const SPRING = 0.005, DAMP = 0.925, CLAMPV = 100;

  const noise = new Noise(Math.random());
  const mouse = { x: -1e4, y: -1e4, lx: -1e4, ly: -1e4, sx: -1e4, sy: -1e4, vs: 0, a: 0, set: false };
  let W = 0, H = 0;
  let cols: { x: number; y: number; wave: { x: number; y: number }; cursor: { x: number; y: number; vx: number; vy: number } }[][] = [];
  let paths: SVGPathElement[] = [];
  let raf = 0, T = 0;

  const setSize = () => {
    const r = host.getBoundingClientRect();
    W = r.width; H = r.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  };

  const build = () => {
    cols = [];
    paths.forEach((p) => p.remove());
    paths = [];
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

  const move = (t: number) => {
    const mx = mouse.sx, my = mouse.sy;
    const mA = mouse.a, mvs = mouse.vs;
    const c = Math.max(CUR_R, mvs);
    const c2 = c * mvs * CUR_K;
    const ca = Math.cos(mA) * c2, sa = Math.sin(mA) * c2;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      for (let k = 0; k < col.length; k++) {
        const pt = col[k];
        const o = noise.perlin2((pt.x + t * WAVE_TX) * WAVE_SC, (pt.y + t * WAVE_TY) * WAVE_SC2) * 12;
        pt.wave.x = Math.cos(o) * WAVE_AMP_X;
        pt.wave.y = Math.sin(o) * WAVE_AMP_Y;
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
      let d = 'M' + (f0.x + f0.wave.x) + ' ' + (f0.y + f0.wave.y);
      for (let k = 1; k < col.length; k++) {
        const pt = col[k], last = k === col.length - 1;
        const cx = last ? 0 : pt.cursor.x, cy = last ? 0 : pt.cursor.y;
        d += 'L' + (((pt.x + pt.wave.x + cx) * 10) | 0) / 10 + ' ' +
             (((pt.y + pt.wave.y + cy) * 10) | 0) / 10;
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
    mouse.sx += (mouse.x - mouse.sx) * 0.1;
    mouse.sy += (mouse.y - mouse.sy) * 0.1;
    const dx = mouse.x - mouse.lx, dy = mouse.y - mouse.ly;
    mouse.vs = Math.min(100, mouse.vs + (Math.sqrt(dx * dx + dy * dy) - mouse.vs) * 0.1);
    mouse.lx = mouse.x; mouse.ly = mouse.y;
    mouse.a = Math.atan2(dy, dx);
    move(T); draw();
    raf = requestAnimationFrame(tick);
  };

  const onMove = (e: MouseEvent | TouchEvent) => {
    const r = host.getBoundingClientRect();
    const t = 'touches' in e ? e.touches[0] : e;
    mouse.x = t.clientX - r.left;
    mouse.y = t.clientY - r.top;
    if (!mouse.set) {
      mouse.sx = mouse.x; mouse.sy = mouse.y;
      mouse.lx = mouse.x; mouse.ly = mouse.y;
      mouse.set = true;
    }
    if (!raf && !reduce) raf = requestAnimationFrame(tick);
  };

  setSize(); build();
  mouse.sx = mouse.sy = mouse.lx = mouse.ly = W / 2;

  if (reduce) { move(0); draw(); return; } // 降级：只画一帧静态

  addEventListener('mousemove', onMove, { passive: true });
  addEventListener('touchmove', onMove, { passive: true });

  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => { setSize(); build(); move(T); draw(); }, 160);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting) {
          if (!raf) raf = requestAnimationFrame(tick);
        } else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      });
    }, { threshold: 0.02 }).observe(host);
  }
  raf = requestAnimationFrame(tick);
}
