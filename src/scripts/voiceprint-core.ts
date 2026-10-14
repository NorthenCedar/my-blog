/* =============================================================================
 * 留言页 · 声纹带 VOICEPRINT —— **纯函数核心**（2026-10-14）
 *
 * 母题：留言就是"有人在这里说过话"。把全页留言按时间铺成一条波形带 ——
 * 横轴 = 真实时间，纵轴 = 那段时间的留言重量，顶层留言的字数与回复各自计权。
 *
 * ★★ 为什么独立成一个零 DOM 的文件：
 *   排布数学是这台装置里唯一**能算清楚**的部分（分桶 / 权重 / 归一化 / 包络），
 *   混进渲染里就只能靠截图目检，而目检验不了"57 条与 2000 条是否同尺度"。
 *   抽出来之后这些全都是普通单测。分工照抄相册那套（album-scene-core / album-scene）。
 *
 * ★★ 三个不可让步的性质：
 *   ① **零随机**：形状是留言数据的确定函数。站内硬规矩 —— 一旦有随机源，
 *      "同 t 逐点比对"这个唯一可信的形状验收手段就废了（见 AGENTS §5）。
 *   ② **密度自己说话**：分桶自适应 + 连续包络 ⇒ 2 条是两个小包、2000 条也不挤成实心，
 *      且不需要额外图例。这是"上百条留言"的解法，不是"画更多东西"。
 *   ③ **峰值恒为 1**：高度只表达"相对这段有多热闹"，不随留言总量漂移。
 *
 * 数据来源：留言与回复的唯一取数方是 `src/scripts/comments.ts`，它通过
 * `CustomEvent('voiceprint')` 把数据交过来 —— **本文件不 fetch、不碰 DOM**。
 */

/** 一条留言或一条回复。`createdAt` 是 ISO 串（客户端字段是驼峰，后端 `created_at` 在 fetch 层转换）。 */
export type Note = { id: number; createdAt: string; body: string; isReply: boolean };

/** 分桶粒度：跨度越长，桶越宽 —— 这样"上百条"也不会被切成一堆柱子。 */
export type Unit = 'day' | 'week' | 'month';

/** 一个时间桶。`weight` 决定波形高度，`replies`/`notes` 只用于读数。 */
export type Bin = { start: number; end: number; weight: number; replies: number; notes: number };

const DAY_MS = 86400000;

/** ★ 三个口径值，与 docs/rhinelab-spec.md §6.78.3 一一对应，改它们要连门闩一起改。 */
export const REPLY_WEIGHT = 200;   // 一条回复 ≈ 200 字：留言框上限 1000，回复通常一句话
const DAY_MAX = 90;                // 跨度 ≤ 90 天按天
const WEEK_MAX = 730;              // ≤ 730 天按周，再长按月

/** 月用固定 30 天近似。★ 刻意不做日历月：那会让"桶必须连续且不重叠"这条性质依赖月份长度，
 *  而月份长度正是让这类几何在边界上出错的地方（站内栽过同族：显影槽的周期接缝）。 */
const STEP: Record<Unit, number> = { day: DAY_MS, week: 7 * DAY_MS, month: 30 * DAY_MS };

export function pickUnit(spanDays: number): Unit {
  if (!(spanDays > DAY_MAX)) return 'day';   // 负数/NaN 也落这儿：脏数据退回最细粒度
  return spanDays > WEEK_MAX ? 'month' : 'week';
}

export function weightOf(notes: Note[]): number {
  let w = 0;
  for (const n of notes) w += n.isReply ? REPLY_WEIGHT : n.body.length;
  return w;
}

/** 时间脏串返回 NaN，由调用方过滤。 */
const at = (n: Note): number => Date.parse(n.createdAt);

/**
 * 把接口的两张表摊平成一维 `Note[]` —— 声纹读的是**一条连续的留言流**，分不分层对它没意义。
 * ★ 调用方**必须**先把孤儿回复滤掉（列表那边用 `groupReplies` + `parentIdsOf`），
 *   否则波形上的回复数会和访客在列表里看到的对不上 —— 那是一条会骗人的读数。
 */
export function toNotes(
  comments: { id: number; createdAt: string; body: string }[],
  replies: { id: number; parentId: number; createdAt: string; body: string }[],
): Note[] {
  const out: Note[] = [];
  for (const c of comments) out.push({ id: c.id, createdAt: c.createdAt, body: c.body, isReply: false });
  for (const r of replies) out.push({ id: r.id, createdAt: r.createdAt, body: r.body, isReply: true });
  return out;
}

/**
 * 按粒度切时间桶。桶**连续、递增、不重叠** —— 波形的横轴才有意义。
 * ★ 起点取最早一条的时间（不是纪元），所以同一天的留言必落进同一个桶，
 *   跨零跨度（所有人同一天留言）也因此只会得到一个桶，不会有除零。
 */
export function bucketize(notes: Note[], spanDays: number): Bin[] {
  const step = STEP[pickUnit(spanDays)];
  let t0 = Infinity;
  for (const n of notes) {
    const t = at(n);
    if (Number.isFinite(t) && t < t0) t0 = t;
  }
  if (!Number.isFinite(t0)) return [];

  const bins: Bin[] = [];
  for (const n of notes) {
    const t = at(n);
    if (!Number.isFinite(t)) continue;          // 脏时间串：跳过，不让它污染时间轴
    const i = Math.max(0, Math.floor((t - t0) / step));
    while (bins.length <= i) {
      const k = bins.length;
      bins.push({ start: t0 + k * step, end: t0 + (k + 1) * step, weight: 0, replies: 0, notes: 0 });
    }
    const b = bins[i];
    b.weight += n.isReply ? REPLY_WEIGHT : n.body.length;
    if (n.isReply) b.replies += 1; else b.notes += 1;
  }
  return bins;
}

/** 归一化到 0..1，**峰值恒为 1**。全零与空输入都不崩。 */
export function normalize(bins: Bin[]): number[] {
  if (bins.length === 0) return [];
  let max = 0;
  for (const b of bins) if (b.weight > max) max = b.weight;
  return bins.map((b) => (max > 0 ? b.weight / max : 0));
}

/**
 * 连续包络：把归一化后的桶线性插值成 `samples` 个点。
 * ★ 用**线性**插值而不是平滑样条：样条会在端点过冲（值越出 0..1），
 *   而这个形状的全部信息就是"相对高低"，过冲会读成不存在的数据。
 */
export function envelope(bins: Bin[], samples: number): number[] {
  if (!Number.isFinite(samples) || samples <= 0) return [];
  if (bins.length === 0) return new Array(Math.floor(samples)).fill(0);
  const n = Math.floor(samples);
  const v = normalize(bins);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = v.length === 1 ? 0 : (i / (n - 1)) * (v.length - 1);
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, v.length - 1);
    const f = x - i0;
    out.push(v[i0] * (1 - f) + v[i1] * f);
  }
  return out;
}

/** 轴上的时间刻度。数量按粒度给定，避免窄屏挤成一团年份。 */
export function ticks(bins: Bin[], unit: Unit): { at: number; label: string }[] {
  if (bins.length === 0) return [];
  const want = unit === 'week' ? 8 : 6;
  const step = Math.max(1, Math.ceil(bins.length / want));
  const out: { at: number; label: string }[] = [];
  for (let i = 0; i < bins.length; i += step) {
    const d = new Date(bins[i].start);
    out.push({
      at: bins[i].start,
      label: unit === 'month'
        ? `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        : `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`,
    });
  }
  return out;
}