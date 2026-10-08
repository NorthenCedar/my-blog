/* =============================================================================
 * 螺旋盘 HELIX · 纯函数层 —— 拖动惯性 / 吸附弹簧的数学。
 *
 * 为什么单独一个文件（而不是内联在 spiral.astro 的 <script> 里）：
 *   ★★ 因为**这里出过一个真 bug，而且只有把它变成纯函数才抓得住**。
 *   真身：松手时那句 `tgt = clamp(Math.round(f + clamp(v, -8, 8) * 0.22), …)`
 *   —— 只夹住了「用来算目标的那份副本」，**喂给弹簧的 v 本身没夹**。
 *   于是输入噪声直接当速度灌进积分器：探针的合成事件 dt≈1ms ⇒ 平滑出
 *   v ≈ 1250 张/秒 ⇒ 松手后**第一帧** `f += v·dt = +20.8 张`。
 *   这不是实验室假象：真机 1000Hz 鼠标一次 100px 位移（1ms）就能算出 424 张/秒。
 *   ⇒ 「速度必须先夹住、再进积分器」是一条**可单测的性质**，写在 tests/gallery-spiral.test.ts。
 *
 * ★ 与 rl-core 的 createSpring **刻意不同**（不是重复造轮子）：
 *   createSpring 服务的是「目标由外部改、弹簧负责追」的跟随器（卷尺游标、显影板笔触）。
 *   这一台是**甩出去**的：初速度来自输入、目标是松手那一刻算出来的、之后不再改。
 *   两者共用一套积分器反而要往 createSpring 里塞"设定初速度"的口子 —— 那是假共享。
 *
 * ★ 零 DOM、零随机源、零副作用：tests 直接 import 这一层。
 * -------------------------------------------------------------------------- */

/** 速度上界（张/秒）。同时兜住两件事：甩出去的距离、以及单帧的位移量。
 *  ★ 6 张/秒的物理含义：松手后最多再滑 `6 × LOOKAHEAD ≈ 1.3` 张。 */
export const V_MAX = 6;
/** 速度平滑：新观测占的比重（0.35 是"跟得上手、又不被单帧抖动带偏"的档）。 */
export const V_BLEND = 0.35;
/** 松手后把速度投影多久（秒）—— 这个数就是"这一甩有多重"的旋钮。 */
export const LOOKAHEAD = 0.22;
/** 弹簧刚度（ω = √K ≈ 9.49 rad/s ⇒ 周期 ≈ 0.66 s）。 */
export const K = 90;
/** 阻尼比 0.86 —— 轻微过冲（"重量"，不是"晃"）。 */
export const ZETA = 0.86;
export const C = 2 * Math.sqrt(K) * ZETA;
/** 单帧最多推进的时长（毫秒）：切回标签页的首帧 dt 会被拖大，不夹会跳一格。 */
export const DT_MAX = 50;
/** 判"停稳"的两条阈值（位置 px / 速度 张每秒）。 */
export const EPS_X = 0.002;
export const EPS_V = 0.02;

/**
 * 夹持。`NaN` 落到下界（它没有方向可言）；**±Infinity 走各自那一侧的界**。
 *
 * ★ 为什么不能把"非有限值"一律当下界：`clampV(v)` 用的就是本函数 ——
 *   一律当下界会把 `+Infinity` 变成 **−V_MAX**（速度**反号**），
 *   一台本来"往前冲"的装置会突然往后猛退。NaN 无方向可以就近兜住，
 *   无穷大有方向，必须按方向夹。
 */
export function clamp(x: number, lo: number, hi: number): number {
  if (Number.isNaN(x)) return lo;
  return x < lo ? lo : x > hi ? hi : x;
}

/** 速度夹持 —— 唯一一个"进积分器之前必须过"的闸门。 */
export function clampV(v: number): number {
  return clamp(v, -V_MAX, V_MAX);
}

/** 用新观测平滑速度，并在**同一步**里夹住（不许先存后夹 —— 见文件头那个 bug）。 */
export function blendV(prev: number, instant: number): number {
  const p = Number.isFinite(prev) ? prev : 0;
  const i = Number.isFinite(instant) ? instant : 0;
  return clampV(p * (1 - V_BLEND) + i * V_BLEND);
}

/** 松手目标：把（已夹住的）速度投影一段再吸附到整数格。 */
export function throwTarget(f: number, v: number, lo: number, hi: number): number {
  const base = Number.isFinite(f) ? f : lo;
  return clamp(Math.round(base + clampV(v) * LOOKAHEAD), lo, hi);
}

/**
 * 一步二阶弹簧（半隐式欧拉）。**吃真实 dt**，不是"每帧固定系数" ——
 * 后者等价于把 dt 当成 1/60 秒：120Hz 屏上快一倍、掉帧时又变慢，观感随设备变。
 * 返回新状态；收敛时直接落到 `tgt`（速度归零），避免在目标附近永远抖。
 */
export function stepSpring(f: number, v: number, tgt: number, dtMs: number): { f: number; v: number; settled: boolean } {
  const s = clamp(dtMs, 0, DT_MAX) / 1000;
  const nv = v + (K * (tgt - f) - C * v) * s;
  const nf = f + nv * s;
  if (!Number.isFinite(nf) || !Number.isFinite(nv)) return { f: tgt, v: 0, settled: true };
  if (Math.abs(tgt - nf) < EPS_X && Math.abs(nv) < EPS_V) return { f: tgt, v: 0, settled: true };
  return { f: nf, v: nv, settled: false };
}

/** 相邻两片在屏幕上的横向节距（拖动 1:1 的换算基准）—— R 为螺旋半径、aDeg 为每片转角。 */
export function stepPxOf(radius: number, aDeg: number): number {
  return radius * Math.sin((aDeg * Math.PI) / 180);
}

/**
 * 一「张」投影到屏幕上的横向位置，**单位是 R**（不是像素）。
 *
 * 模型：视点在 z = +P，片心在世界 (R·sinθ, ·, R·cosθ − R) ⇒ 屏上横向
 *   x/R = sinθ × P / (P + R(1 − cosθ))，其中 P = perspK·R。
 *
 * ★★ 这条函数是「**为什么必须淡出、而且窗口必须开得够大**」的机器证明：
 *   没有透视时 x/R = sinθ，极值在 90°；有透视时**近侧被放大**，
 *   所以极值点被拉到 90° 之前（perspK = 2.4 时约 78°）。
 *   关键是**过了极值之后回折有多陡**：
 *     · 窗口只扫到 65°（旧参数 18°×3.6）⇒ 远端 / 峰值 = 0.99 ⇒ 投影**单调**，
 *       整条带子看起来就是一条**斜排的照片带**，读不出"绕"；
 *     · 扫到 140°（28°×5.0）⇒ 比值 0.50 ⇒ 远端明显收回来，才看得出环抱/卷回。
 *   所以"看得像不像螺旋"不是审美判断，是这个比值 —— 由 tests/gallery-spiral.test.ts 守着。
 */
export function projX(relDeg: number, perspK: number): number {
  const t = (relDeg * Math.PI) / 180;
  return (Math.sin(t) * perspK) / (perspK + 1 - Math.cos(t));
}

/**
 * 螺旋半径：由**弦长**反解，保证相邻两片在任何断点都不穿插。
 * `2R·sin(α/2) = 片宽 × SEAM` ⇒ 缝 = 片宽 × (SEAM − 1)。
 */
export function radiusOf(tile: number, aDeg: number, seam: number): number {
  return (tile * seam) / (2 * Math.sin((aDeg * Math.PI) / 360));
}
