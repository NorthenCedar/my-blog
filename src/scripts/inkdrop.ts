/* =============================================================================
 * 留言页 · 墨滴（INK DROP）—— 指针在留言区留墨痕、几秒渗开；新留言落下是墨滴扩散
 *
 * ★ 母题（站主 2026-10-06 指定，与本页静态底纹同源）：
 *   · 墨痕：指针在**留言区上方**移动 ⇒ 留下渐深的蓝墨痕
 *   · 渗开：痕迹不立刻消失，按 f(t) **慢慢往外渗并变淡**，几秒后收干净
 *   · 落滴：留言发表成功 ⇒ 墨滴**从上方落下、砸出一圈扩散**
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
 *      ⇒ 墨痕**不吃 DOM 尺寸**：留言区的范围在**视口坐标系**里由常数给出，
 *        不量 `getBoundingClientRect()`。唯一读 DOM 的是"事件落在哪"（见下）。
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
  const TRAIL_MAX = 420; // 痕迹条数上限（超出丢最旧的 ⇒ 长时间涂抹也不会无限涨）
  const BLOB_R = 13; // 单个笔触的半径（css px）
  const SMEAR = 2.6; // 每一笔的"铺开"半径（比笔触大 ⇒ 看起来像墨在渗）
  const LIFE = 4.2; // 一笔墨痕从满到收干净（秒）—— 站主要求的"几秒渗开"
  const HEAL = 0.55; // 每秒收掉的比例（指数自愈，不是线性）
  const DROP_LIFE = 2.4; // 落滴从落到散尽
  const DROP_FALL = 0.42; // 落下占整段的比例（其余是落地后的扩散）
  const DROP_R = 46; // 落滴砸出的扩散圈最终半径
  const RINGS = 3; // 每滴扩散的圈数
  const RM_T = 2.0; // reduced-motion 那一帧的时刻（几滴正在渗开）

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

  /** 单笔墨痕在年龄 age 处的浓度 0..1（f(age)，确定性）。 */
  function blobAlpha(age: number): number {
    if (age < 0 || age > LIFE) return 0;
    /* 落下时最实（前 8% 快速加深，模拟"刚落纸就吃满"），
       然后**指数自愈**收干净 —— 这就是"渗开几秒"的主体。
       渗开感 = 半径随年龄涨、浓度随年龄跌，两者之积决定"看起来在扩"。 */
    const rise = Math.min(1, age / (LIFE * 0.08));
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
      const k = blobAlpha(age);
      if (k <= 0.002) continue;
      /* ★ 半径随年龄涨（SMEAR 的渗开）：起始是笔触，之后慢慢胖一圈。
         种子 `b.s` 决定这一笔的渗开**略不对称**（同i 恒定）。 */
      const r = (BLOB_R + age * SMEAR * (0.7 + b.s * 0.6)) * (narrow.matches ? 0.85 : 1);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, A(INK, 0.5 * k * trailScale));
      g.addColorStop(0.55, A(INK, 0.22 * k * trailScale));
      g.addColorStop(1, A(INK, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, 6.283);
      ctx.fill();
    }

    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const age = tSec - d.t0;
      if (age < 0 || age > DROP_LIFE) continue;
      const u = age / DROP_LIFE;
      /* 前 DROP_FALL 比例是"下落"：一个小墨滴从上往下；
         后者是"落地扩散"：一圈圈往外推、越来越淡。 */
      if (age < DROP_LIFE * DROP_FALL) {
        const fu = age / (DROP_LIFE * DROP_FALL);
        const r = 4 + 5 * (1 - fu);
        const y = d.y - 70 * (1 - fu) * (1 - fu);
        ctx.beginPath();
        ctx.arc(d.x, y, r, 0, 6.283);
        ctx.fillStyle = A(INK, 0.55 * trailScale);
        ctx.fill();
      } else {
        const su = (age - DROP_LIFE * DROP_FALL) / (DROP_LIFE * (1 - DROP_FALL));
        for (let j = 0; j < RINGS; j++) {
          const uu = su - j * 0.16;
          if (uu <= 0 || uu >= 1) continue;
          const rx = DROP_R * Math.sqrt(uu);
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, rx, rx * 0.42, 0, 0, 6.283);
          ctx.strokeStyle = A(INK, 0.4 * (1 - uu) * (1 - uu) * trailScale);
          ctx.lineWidth = 2.2 - j * 0.4;
          ctx.stroke();
        }
        /* 落点那一团墨，越淡越小 */
        const r0 = 7 * (1 - su);
        if (r0 > 0.4) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, r0, 0, 6.283);
          ctx.fillStyle = A(INK, 0.4 * (1 - su) * trailScale);
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
  /** 指针落点是否在"留言区"：本页留言区大致在版心那一列里，取视口的中间带 + 下半屏。
      ★ **不量DOM**（见头部②）：留言区位置是版式常量，量DOM 会与评论列表抢主线程。
        窄屏只保留落滴 ⇒ 直接返回 false。 */
  function overMessageArea(x: number, y: number): boolean {
    if (narrow.matches) return false;
    return y > ch * 0.3 && x > cw * 0.12 && x < cw * 0.88;
  }

  function onMove(e: PointerEvent) {
    if (reduce.matches) return; // RM 下不记痕迹（否则画出来却不动，很怪）
    const x = e.clientX;
    const y = e.clientY;
    if (!overMessageArea(x, y)) {
      lastX = -1;
      lastY = -1;
      return;
    }
    if (lastX >= 0) {
      const dx = x - lastX;
      const dy = y - lastY;
      const dist = Math.hypot(dx, dy);
      if (dist < TRAIL_STEP) return;
      const steps = Math.min(12, Math.floor(dist / TRAIL_STEP));
      const ts = nowSec();
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const px = lastX + dx * t;
        const py = lastY + dy * t;
        blobs.push({ x: px, y: py, t0: ts, s: hash01(Math.round(px * 7 + py * 13)) });
        if (blobs.length > TRAIL_MAX) blobs.shift();
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
       没有就给视口上方 —— 站主要的是"落下的墨滴"，位置可退化为常量。 */
    const x = det?.x ?? cw * 0.5;
    const y = det?.y ?? ch * 0.42;
    drops.push({ x, y, t0: nowSec() });
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

  const gate = createActivityGate(cv);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('inkdrop', onDrop as EventListener);

  const stop = startLoop(() => {
    if (!gate.onScreen || !gate.visible) return;
    /* ★ 累积状态（痕迹/落滴）不是 f(t)，所以**每帧都要重画**——
       痕迹在淡、落滴在扩散，不重画就会僵住。只有"确实什么都没有"才省帧。 */
    const ts = nowSec();
    const has = blobs.length > 0 || drops.length > 0;
    if (!has && !needsPaint) return;
    needsPaint = false;
    paint(ts);
    /* 顺手丢掉已经淡干净的痕迹（防数组无界增长） */
    for (let i = blobs.length - 1; i >= 0; i--) {
      if (blobAlpha(ts - blobs[i].t0) <= 0.002) blobs.splice(i, 1);
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      if (ts - drops[i].t0 > DROP_LIFE) drops.splice(i, 1);
    }
  });

  window.addEventListener('resize', () => paint(nowSec()), { passive: true });

  window.addEventListener('beforeunload', () => {
    stop();
    gate.dispose();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('inkdrop', onDrop as EventListener);
  }, { once: true });
})();