/* =============================================================================
 * TIME SLICE · 纯函数层 —— 控制器（time-slice.ts）与 three 场景
 * （time-slice-scene.ts）共用的时间/轨迹/哈希数学。
 *
 * 刻意无 DOM、无副作用、零随机源：tests/time-slice.test.ts 直接 import 这一层，
 * 「滚动↔时间」的确定映射从类型上就成立。设计依据见 time-slice.ts 头注。
 * -------------------------------------------------------------------------- */

/** 时间轴关键帧（p = 装置段内的滚动进度 0..1）。
 *  入口：菱窗放大到全屏（zoom）；飞行：镜头沿切片链推进（t）；
 *  **收尾**：到链尾（t=1）之后由控制器的时间轴接管——镜头落定 → 全屏转绿
 *  → 绿幕满屏即切相册（见 time-slice.ts 的 TAIL_MS / NAV_HOLD_MS），同时锁滚。
 *  下面 settle / exit / cta / nav 四档是**纯滚动驱动**的那条降级路线：
 *  控制器在「按返回键回来的那一次」不让收尾自动启动（防回跳死循环），
 *  但读者照旧可以自己滚到底 —— 落定、转绿全都是滚动进度 p 的函数（不跳页）。
 *  ★ 站主第九轮 ③ 之后：出口那道菱形环与「进入相册」按钮都已删净，
 *    所以 `cta` 这一档**没有读它的人了**（留着是因为它仍是「p ≥ 0.88 该出现
 *    入口」这条语义刻度，也是本文件边界测试的锚点）。 */
export const TSL = {
  zoomStart: 0.06, // 菱形窗开始放大（入口）
  zoomEnd: 0.3, // 放大到全屏（此刻「穿过」窗口）
  tStart: 0.3, // 飞行时间 t 开始随 p 走
  tEnd: 0.86, // 飞行抵达链尾（t=1）—— 自动收尾与「划不动」都在这条线上
  settleStart: 0.86, // 降级路线：落定段（镜头收向标本）
  settleEnd: 0.9,
  exitStart: 0.9, // 降级路线：出口菱窗放大（像入口一样穿窗）
  ctaAt: 0.88, // 降级路线：相册入口浮现
  navAt: 0.97, // 降级路线：出口菱窗走完
  navCancelAt: 0.94, // 降级路线：滚回这条线以下 ⇒ 收尾收摊
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** smoothstep（确定函数，无随机） */
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/**
 * 滚动进度 → 场景状态。整个装置唯一的时间来源 ——
 * p 是弹簧平滑后的滚动进度，t 是飞行时间，其余全是 p/t 的确定函数。
 */
export function tslTimeline(p: number) {
  return {
    zoom: smooth(TSL.zoomStart, TSL.zoomEnd, p),
    t: clamp01((p - TSL.tStart) / (TSL.tEnd - TSL.tStart)),
    settle: smooth(TSL.settleStart, TSL.settleEnd, p),
    exit: smooth(TSL.exitStart, TSL.navAt, p), // 出场穿窗：菱形环放大越过镜头
    cta: p >= TSL.ctaAt,
    nav: p >= TSL.navAt,
  };
}

type WindowPoint = readonly [number, number];

/** 双层玻璃入口：同一条前沿路径供画布裁切与 SVG 描边共用，像素坐标随视口重算。
 *  侧转与层间距离在穿窗过程中逐渐归零，展开后四角越过视口，反向滚动原路还原。 */
export function tslWindow(width: number, height: number, zoom: number) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const short = Math.min(w, h);
  const z = Number.isFinite(zoom) ? clamp01(zoom) : 0;
  const tilt = 1 - z;
  const halfW = short * 0.23 + (w * 0.64 - short * 0.23) * z;
  const halfH = short * 0.25 + (h * 0.64 - short * 0.25) * z;
  const ax = 0.07 * tilt;
  const ay = -0.18 * tilt;
  const az = -0.045 * tilt;
  const radius = short * 0.026 * (1 - z * 0.75);
  const fmt = (p: WindowPoint) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`;

  const pane = (back: boolean) => {
    const scale = back ? 0.985 : 1;
    const dx = back ? short * 0.033 * tilt : 0;
    const dy = back ? -short * 0.025 * tilt : 0;
    const corners: WindowPoint[] = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
      const x = sx * halfW * scale;
      const y = sy * halfH * scale;
      const xx = x * Math.cos(ay);
      const zz = -x * Math.sin(ay);
      const yy = y * Math.cos(ax) - zz * Math.sin(ax);
      const depth = y * Math.sin(ax) + zz * Math.cos(ax);
      const perspective = short * 3 / (short * 3 + depth);
      return [w / 2 + dx + (xx * Math.cos(az) - yy * Math.sin(az)) * perspective,
        h / 2 + dy + (xx * Math.sin(az) + yy * Math.cos(az)) * perspective];
    });
    const toward = (from: WindowPoint, to: WindowPoint): WindowPoint => {
      const f = Math.min(0.18, radius / Math.hypot(to[0] - from[0], to[1] - from[1]));
      return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f];
    };
    const starts = corners.map((p, i) => toward(p, corners[(i + 3) % 4]!));
    const ends = corners.map((p, i) => toward(p, corners[(i + 1) % 4]!));
    const d = `M${fmt(starts[0]!)} ` + corners.map((p, i) =>
      `${i ? `L${fmt(starts[i]!)} ` : ''}Q${fmt(p)} ${fmt(ends[i]!)}`).join(' ') + ' Z';
    const joins = corners.map((p, i): WindowPoint => [
      starts[i]![0] * 0.25 + p[0] * 0.5 + ends[i]![0] * 0.25,
      starts[i]![1] * 0.25 + p[1] * 0.5 + ends[i]![1] * 0.25,
    ]);
    return { d, joins };
  };
  const front = pane(false);
  const back = pane(true);
  return {
    front: front.d,
    back: back.d,
    edges: front.joins.map((p, i) => `M${fmt(p)} L${fmt(back.joins[i]!)}`).join(' '),
    opacity: 1 - smooth(0.72, 0.99, z),
  };
}

/** 全程切片数（对齐参考视频的 FRAME NN / 76 读数口径） */
export const TSL_FRAMES = 76;
/** 参考视频总长（秒），只用于 HUD 的 T+ 读数 */
export const TSL_SECONDS = 14.03;

/**
 * 切片链的基准轨迹：**沿隧道轴整齐排成一列**（站主 2026-10-02 第三轮拍板：
 * 「蝴蝶本身不动，是切片；一个切片接一个切片，全程只有摄像机在动」）。
 * 于是这条曲线不再承载「蝴蝶飞行」的语义 —— 它只是**切片链的位置轴**：
 * 第 i 片切片摆在 t=i/(N-1) 处，镜头沿轴推进时逐片经过（一个切片一个静止的
 * 蝴蝶影像，连起来才是动画）。x/y 只带极小的弧（0.18/0.10 振幅，两端归零），
 * 让链在透视里不是死板的一条直线；侧移主要由**镜头**承担（见场景的 orbital 机位）。
 * z 近线性 ⇒ 切片等距 —— 参考视频里切片间距均匀，这是「逐片可读」的关键。
 * flap/spread 保留为**烘焙翼相**的来源（每片切片的翼相 = f(i)，静止不动）。
 */
export function tslPath(t: number) {
  const arc = Math.sin(Math.PI * t);
  const flap = Math.sin(Math.PI * 2 * t * 9); // 76 片的翼相序列
  return {
    x: 0.18 * arc,
    y: 0.06 + 0.1 * arc,
    // ★ 链的**片距**要够大：原片里最近的那一片约占画面高 35%、一片片清楚可辨，
    //   片距必须≈「镜头到当前片的距离」（否则镜头与当前片之间会塞进好几片，
    //   最前那片刻在镜头前爆成一团白 —— 实测踩坑）。2.2 单位 ≈ 蝶宽的 1.8 倍。
    z: -3 - 165 * t,
    flap,
    /** 翼展系数：扑到正上/正下时接近收拢（活蝶时代遗留的语义，现只供烘焙取用） */
    spread: 0.18 + 0.82 * Math.abs(flap),
  };
}

/** 确定性哈希（GLSL 经典 hash 的 JS 版）—— 标本斑点、残影微倾角用，零随机源 */
export function tslHash(i: number) {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/* ============================================================================
 * 翅膀掩膜 —— 「形变只许作用在翅膀膜上」
 *
 * 站主第十轮（2026-10-02）：「触角和肢体不要乱动，不要交叉」。
 *
 * 烘焙扑翼（time-slice-scene.ts 的 makeFlapGeos）原先只按 |x| 给权重：
 *   w = ease((|x| − 0.03) / 0.13)        // |x| ≥ 0.16 就吃满
 * 这个判据**只对翅膀膜成立**。实测（`_probe/_bvglb4.mjs`，归一化后翼展 = 1、
 * 体轴沿 Y）：
 *   · 翅膀膜            max|x| ∈ [0.271, 0.500]
 *   · 身体 / 触角 / 六条腿  max|x| ≤ 0.233
 * 两条之间是一条**真实的空档**。而 |x| ≥ 0.16 就吃满 ⇒ 触角尖（|x|≈0.19）与
 * 腿尖（|x|≈0.22）拿到近乎全量的旋转，且旋转**按 x 的符号反号** ⇒ 左触角与
 * 右触角、左腿与右腿朝相反方向甩出去 —— 这就是站主看到的「乱动」与「交叉」。
 *
 * 修法：加载时**一次性**把翅膀膜认出来（纯几何、零随机、零逐帧开销），形变只
 * 作用在这些顶点上；身体 / 触角 / 肢体一律 w = 0 —— 它们只跟着整只蝶的「浮」
 * 做同一个平移，自身**完全刚性**（两两距离一个字节都不变）。
 *
 * 为什么不能只看 |x|：触角尖 |x|≈0.19、腿尖 |x|≈0.22，而翼根 |x|≈0.005…0.06
 * —— 三者**同处一档**。所以按部件认：
 *   ① 按位置**焊接**顶点（量到 1e-4 网格）—— 模型是逐面独立顶点的，不焊接的话
 *      每个面都是孤岛（实测 681 块），分不出部件；
 *   ② 三角形并查集求连通块（焊接后 107 块，一块 = 一个真实曲面部件）；
 *   ③ 一块的 max|x| ≥ WING_MIN_X 即判为翅膀膜。
 * 实测：这样恰好挑出 10 块（两对翅的正/反两面 + 两片分离的翼面碎片），而身体
 * （340 顶点）、触角、六条腿全部落在阈值以下，空档是 [0.233, 0.271]。
 * -------------------------------------------------------------------------- */

/** 顶点焊接的量化网格：归一化后翼展 = 1 ⇒ 1e-4 ≈ 翼展的万分之一 */
export const WELD_EPS = 1e-4;
/** 翅膀膜连通块的 |x| 下限 —— 落在实测空档 [0.233, 0.271] 的正中 */
export const WING_MIN_X = 0.25;

export interface WingSplit {
  /** 每个顶点是不是翅膀膜（1 = 是），长度 = 顶点数 */
  mask: Uint8Array;
  /** 判为翅膀膜的连通块个数（实测 10） */
  comps: number;
  /** 翅膀块里最小的 max|x| —— 空档下沿（实测 ≈0.271） */
  minWingX: number;
  /** 非翅膀块里最大的 max|x| —— 空档上沿（实测 ≈0.233） */
  maxOtherX: number;
  /** 翅膀膜的顶点数 */
  wingVerts: number;
}

/**
 * 把顶点分成「翅膀膜 / 其余」两类。
 * ★ 调用方保证传进来的是**已经归一化**的那份几何（loadButterfly 的产物：
 *   翼展沿 ±X 且 = 1、体轴沿 Y）—— 阈值是那个坐标系下的数。
 */
export function splitWings(pos: Float32Array, idx: Uint32Array, wingMinX = WING_MIN_X): WingSplit {
  const n = pos.length / 3;

  /* ① 焊接：重合顶点归到同一代表点 */
  const rep = new Int32Array(n);
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key =
      Math.round(pos[i * 3] / WELD_EPS) +
      ',' +
      Math.round(pos[i * 3 + 1] / WELD_EPS) +
      ',' +
      Math.round(pos[i * 3 + 2] / WELD_EPS);
    const hit = seen.get(key);
    if (hit === undefined) {
      seen.set(key, i);
      rep[i] = i;
    } else rep[i] = hit;
  }

  /* ② 并查集：每个三角形把三个（焊接后的）顶点连起来 */
  const par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (a: number): number => {
    let r = a;
    while (par[r] !== r) r = par[r];
    while (par[a] !== r) {
      const nx = par[a];
      par[a] = r;
      a = nx;
    }
    return r;
  };
  const uni = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) par[rb] = ra;
  };
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = rep[idx[t]];
    const b = rep[idx[t + 1]];
    const c = rep[idx[t + 2]];
    uni(a, b);
    uni(b, c);
  }

  /* ③ 每块取 max|x|，≥ 阈值即翅膀膜 */
  const maxX = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = find(rep[i]);
    const v = Math.abs(pos[i * 3]);
    const cur = maxX.get(r);
    if (cur === undefined || v > cur) maxX.set(r, v);
  }
  let comps = 0;
  let minWingX = Infinity;
  let maxOtherX = 0;
  for (const v of maxX.values()) {
    if (v >= wingMinX) {
      comps++;
      if (v < minWingX) minWingX = v;
    } else if (v > maxOtherX) maxOtherX = v;
  }
  const mask = new Uint8Array(n);
  let wingVerts = 0;
  for (let i = 0; i < n; i++) {
    if ((maxX.get(find(rep[i])) ?? 0) >= wingMinX) {
      mask[i] = 1;
      wingVerts++;
    }
  }
  return { mask, comps, minWingX: comps ? minWingX : 0, maxOtherX, wingVerts };
}

