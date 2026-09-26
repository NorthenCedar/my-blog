/**
 * 首页开场动画 · CSS 生成器（构建期跑，产物里不出现任何 JS）
 *
 * 输入：`src/lib/boot-tracks.ts`（唯一真源，照抄上游数值）
 * 输出：一整段 CSS —— 静态几何（版式与结构）+ 全部 `@keyframes` + 元素绑定。
 *
 * 为什么生成而不是手写（站主 2026-09-26 审定时定档）：
 *   上游那几张表合计约 250 个停点，手抄一遍等于把"抄错一个数"的风险复制一份；
 *   生成器把它压成「表 → 停点」一条机械变换，改帧点只需改一处。
 * 为什么 `@keyframes` 只做线性：上游是单调三次 Hermite 保速插值，
 *   CSS 侧只能用「密集停点 + linear」近似 —— 决策 #4 已接受的代价（工单 §8-2）。
 *
 * 两条容易踩的写法（本文件已按此写，改的时候别改回去）：
 *   1. **带 `animation-delay` 错峰的动画，百分比必须相对"动画自己起点"算**（品牌三行、卫星点生长），
 *      否则延迟会把整条曲线平移、而曲线本身又已经含了绝对帧 ⇒ 双倍偏移。
 *   2. **同一元素上多条动画必须写在一个 `animation` 里**。分两条规则写，后一条 shorthand 会把前一条整个覆盖
 *      （`.boot-plus-pos` 那次就是这个坑）。
 *
 * 本文件是**纯函数**：无副作用、无 fs、无 node API ⇒ vitest 可直接引用来断言。
 */
import * as T from './boot-tracks';

/* ── 小工具 ─────────────────────────────────────────────────────────────── */

/** 数字格式化：最多 4 位小数、去掉尾零（63.09523809 → "63.0952"） */
const n = (v: number): string => {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
};
/** 表的形状放宽到"任意 [帧, 值] 对"，省掉几十处 `as const`；只在进 track() 时收敛成 Key */
type AnyKeys = readonly (readonly number[])[];
const trk = (keys: AnyKeys, frame: number): number => T.track(keys as readonly T.Key[], frame);
/** 数值通道：一个属性 + 一张表 */
type Channel = { keys: AnyKeys; fmt: (v: number) => string };
const chan = (keys: AnyKeys, unit = ''): Channel => ({ keys, fmt: (v) => n(v) + unit });
const num = (unit = '') => (v: number) => n(v) + unit;

/** 百分比统一钳到 [0,100] 并按帧去重（末位优先）—— 越界百分比会让整条 keyframes 失效 */
function normalize(stops: { p: number; v: string }[]): { p: number; v: string }[] {
  const byPct = new Map<number, string>();
  for (const s of stops.sort((a, b) => a.p - b.p)) {
    byPct.set(Math.min(100, Math.max(0, s.p)), s.v);
  }
  return [...byPct.entries()].map(([p, v]) => ({ p, v }));
}
const kfAt = (name: string, stops: { p: number; v: string }[]): void => {
  keyframes.push(`@keyframes ${name}{${normalize(stops).map((s) => `${n(s.p)}%{${s.v}}`).join('')}}`);
};
/** 绝对时间轴（0% = 原片 169 帧） */
const kf = (name: string, stops: { f: number; v: string }[]): void =>
  kfAt(
    name,
    stops.map((s) => ({ p: T.pct(s.f), v: s.v })),
  );

/** 收集关键帧：并集比原表更密 ⇒ 更贴真值 */
const frameUnion = (keysList: readonly AnyKeys[], extra: number[] = []): number[] =>
  [...new Set<number>([T.ORIGIN_FRAME, T.END_FRAME, ...extra, ...keysList.flatMap((k) => k.map(([f]) => f))])].sort(
    (a, b) => a - b,
  );

/** 单/多通道 → 一条 keyframes（绝对时间轴） */
const anim = (
  name: string,
  prop: string,
  channels: Channel[],
  combine: (vals: string[]) => string = (vals) => vals.join(''),
  extraFrames: number[] = [],
): void =>
  kf(
    name,
    frameUnion(channels.map((c) => c.keys), extraFrames).map((f) => ({
      f,
      v: `${prop}:${combine(channels.map((c) => c.fmt(trk(c.keys, f))))}`,
    })),
  );

/** 算出来的曲线（不是表）：绝对时间轴 */
const animFn = (name: string, prop: string, frames: number[], fmt: (f: number) => string): void =>
  kf(name, frameUnion([], frames).map((f) => ({ f, v: `${prop}:${fmt(f)}` })));

/** 二值量：某帧起为 1（到片尾） */
const ON_FROM = (frame: number): readonly T.Key[] => [
  [T.ORIGIN_FRAME, 0],
  [frame - 1, 0],
  [frame, 1],
  [T.END_FRAME, 1],
];

const keyframes: string[] = [];

/* ══ 1. ACCESS（169–227 帧）═══════════════════════════════════════════════ */

anim('boot-access-out', 'opacity', [chan(T.ACCESS_OPACITY)]);
// 逐字 span 共用一条 1ms 动画，各自靠内联 `--d` 定位；百分比是 0→100% 的纯"点亮"
kfAt('boot-ch', [
  { p: 0, v: 'opacity:0' },
  { p: 100, v: 'opacity:1' },
]);

/* ══ 2. LOGO（229–295 帧，左移持续到 294）════════════════════════════════ */

anim('boot-logo-vis', 'opacity', [chan(T.LOGO_VISIBLE)]);
// 上游 `boot.ts:136-137`：transform = translate(offsetX, 1px)，offsetX = leftEdge − 520
anim(
  'boot-logo-x',
  'transform',
  [chan(T.LOGO_LEFT_EDGE, 'px')],
  (vals) => `translate(calc(${vals[0]} - ${T.LOGO_LEFT_BASE}px), 1px)`,
);
// 轮廓：dasharray + dashoffset 同源于 LOGO_DRAW / LOGO_CUT（上游 `boot.ts:138-139`）
kf(
  'boot-logo-dash',
  frameUnion(
    [T.LOGO_DRAW.map(([f]) => [f, 0] as const), T.LOGO_CUT],
    [419],
  ).map((f) => {
    const { length, offset } = T.logoDash(f);
    return { f, v: `stroke-dasharray:${n(length)} 1;stroke-dashoffset:${n(offset)}` };
  }),
);
// 描边宽 0.25→26 按比例映到我们的坐标空间，末值 = 我们现有 symbol 的 2.2（工单 §3.2）
anim('boot-logo-sw', 'stroke-width', [
  { keys: T.LOGO_STROKE_WIDTH, fmt: (v) => n((v / 26) * T.LOGO_OURS.strokeWidthEnd) },
]);
// 加减号：外层管落点、内层管旋转/缩放/拉伸 —— 每层只动一个属性
anim('boot-plus-vis', 'opacity', [chan(ON_FROM(246))]);
anim(
  'boot-plus-pos',
  'transform',
  [{ keys: T.LOGO_PLUS_X, fmt: (v) => n((v / 72.6) * 6) }],
  (vals) => `translate(${vals[0]}px, 6px)`,
);
anim(
  'boot-plus-shape',
  'transform',
  [{ keys: T.LOGO_PLUS_ANGLE, fmt: num('deg') }, chan(T.LOGO_SYMBOL_SCALE)],
  (vals) => `rotate(${vals[0]}) scale(${vals[1]})`,
);
anim('boot-minus-vis', 'opacity', [chan(ON_FROM(246))]);
anim(
  'boot-minus-pos',
  'transform',
  [{ keys: T.LOGO_MINUS_X, fmt: (v) => n((v / 237.1) * 18) }],
  (vals) => `translate(${vals[0]}px, 6px)`,
);
anim(
  'boot-minus-shape',
  'transform',
  [chan(T.LOGO_SYMBOL_SCALE), { keys: T.LOGO_MINUS_WIDTH, fmt: (v) => n(v / T.LOGO_MINUS_WIDTH_END) }],
  (vals) => `scale(${vals[0]}) scaleX(${vals[1]})`,
);

/* ══ 3. 品牌三行 / powered（278/280/282 错峰）═════════════════════════════ */

// 三行**各自一条绝对时间轴**的规则（起点 278 / 280 / 282 帧），而不是"一条规则 + animation-delay"。
// 理由（本条是被实测逼出来的）：用 delay 错峰会把品牌/卫星放到"相对自己的时间轴"上，
// 于是"把整层 seek 到某一帧"这个性质就没了 —— 截图验收到 268 帧时会看到本该 278 帧才入场的文字。
// 逐帧断言与逐帧截图都依赖"一个 currentTime 值 = 一个绝对帧"，所以宁可多几条规则。
for (let line = 0; line < 3; line++) {
  const base = T.BRAND_START_FRAME + line * T.BRAND_LINE_OFFSET;
  anim(
    `boot-brand-${line + 1}-x`,
    'transform',
    [{ keys: T.BRAND_X.map((x, i) => [base + i, x] as const), fmt: num('px') }],
    (vals) => `translateX(${vals[0]})`,
  );
  anim(
    `boot-brand-${line + 1}-op`,
    'opacity',
    [{ keys: T.BRAND_OPACITY.map(([f, v]) => [base + f, v] as const), fmt: num() }],
  );
}
// powered 的 clip-path 横扫：上游除以 19（它 20 字却除 19）；我们按自己字串长度算，避免提前揭完
{
  const len = T.TEXT.powered.length;
  const [start, end] = T.POWERED_WINDOW;
  const frames = Array.from({ length: end - start + 2 }, (_, i) => start - 1 + i);
  kf(
    'boot-powered-clip',
    frameUnion([], frames).map((f) => {
      const shown = T.typedCount(f, start, end, len);
      return { f, v: `clip-path:inset(0 ${n(100 * (1 - shown / len))}% 0 0)` };
    }),
  );
}
anim('boot-powered-vis', 'opacity', [chan(ON_FROM(T.POWERED_WINDOW[0]))]);

/* ══ 4. AUTH（281–486 帧）════════════════════════════════════════════════ */

const B = T.AUTH;
anim('boot-auth-vis', 'opacity', [chan(T.AUTH_VISIBLE)]);
// 第一句：282–362 可见；`" : "` 在 320 帧整块出现；名字逐字 321–339
anim('boot-auth-b1-vis', 'opacity', [chan([[169, 0], [281, 0], [282, 1], [B.branch2 - 1, 1], [B.branch2, 0], [T.END_FRAME, 0]])]);
anim('boot-auth-sep-vis', 'opacity', [chan(ON_FROM(B.nameLeadFrame))]);
anim('boot-auth-b2-vis', 'opacity', [chan([[169, 0], [B.branch2 - 1, 0], [B.branch2, 1], [B.branch3 - 1, 1], [B.branch3, 0], [T.END_FRAME, 0]])]);
// START PROCESSING：421–486 可见，但 479 / 485 / 486 三帧整行被故障串替换（上游的闪烁）
anim('boot-auth-b3-vis', 'opacity', [
  chan([
    [T.ORIGIN_FRAME, 0],
    [B.branch3 - 1, 0],
    [B.branch3, 1],
    [B.glitchFrames[0] - 1, 1],
    [B.glitchFrames[0], 0],
    [B.glitchFrames[0] + 1, 1],
    [B.glitchFrames[1] - 1, 1],
    [B.glitchFrames[1], 0],
    [T.END_FRAME, 0],
  ]),
]);
anim('boot-auth-glitch-vis', 'opacity', [
  chan([
    [T.ORIGIN_FRAME, 0],
    [B.glitchFrames[0] - 1, 0],
    [B.glitchFrames[0], 1],
    [B.glitchFrames[0] + 1, 0],
    [B.glitchFrames[1] - 1, 0],
    [B.glitchFrames[1], 1],
    [B.glitchFrames[2], 1],
    [B.glitchFrames[2] + 1, 0],
    [T.END_FRAME, 0],
  ]),
]);

/* ══ 5. SCAN（487–568 帧）════════════════════════════════════════════════ */

anim('boot-scan-vis', 'opacity', [chan(T.SCAN_VISIBLE)]);
anim('boot-scan-group-op', 'opacity', [chan(T.SCAN_RING_OPACITY)]);
// 跳变帧 525/526/528/529：scale 1.94 + blur 2.2px（上游 `boot-motion.ts:51,75-87`）
{
  const glitch = [...T.SCAN_GLITCH_FRAMES];
  const scaleKeys: T.Key[] = [[487, 1], [524, 1], ...glitch.map((f) => [f, T.SCAN_RING_SCALE] as const), [530, 1]];
  const blurKeys: T.Key[] = [[487, 0], [524, 0], ...glitch.map((f) => [f, T.SCAN_RING_BLUR] as const), [530, 0]];
  anim('boot-scan-group-scale', 'transform', [chan(scaleKeys)], (vals) => `scale(${vals[0]})`, [...glitch, 524, 530]);
  anim('boot-scan-group-blur', 'filter', [chan(blurKeys, 'px')], (vals) => `blur(${vals[0]})`, [...glitch, 524, 530]);
}
// 三条主环：半径动 `r`、起始角动 rotate、弧长动 stroke-dasharray（pathLength=1 ⇒ 与半径无关）
for (const [tag, radius, start, sweep] of [
  ['outer', T.SCAN_OUTER_RADIUS, T.SCAN_OUTER_START, T.SCAN_OUTER_SWEEP],
  ['white', T.SCAN_WHITE_RADIUS, T.SCAN_WHITE_START, T.SCAN_WHITE_SWEEP],
  ['inner', T.SCAN_INNER_RADIUS, T.SCAN_INNER_START, T.SCAN_INNER_SWEEP],
] as const) {
  anim(`boot-arc-${tag}-r`, 'r', [chan(radius, 'px')]);
  anim(`boot-arc-${tag}-rot`, 'transform', [chan(start, 'deg')], (vals) => `rotate(${vals[0]})`);
  anim(`boot-arc-${tag}-dash`, 'stroke-dasharray', [{ keys: sweep, fmt: (v) => `${n(v / 360)} 1` }]);
}
// 两侧小圆：位置 → 自转 → 半径 + 弧长（26 行表，列序见 boot-tracks.ts）
{
  const col = (i: number): T.Key[] => T.SCAN_SIDES.map((row) => [row[0], row[i]] as const);
  for (const [tag, cx, cy, r, start, sweep] of [
    ['bl', 1, 2, 5, 6, 8],
    ['br', 3, 4, 5, 7, 9],
  ] as const) {
    anim(`boot-side-${tag}-pos`, 'transform', [chan(col(cx), 'px'), chan(col(cy), 'px')], (vals) => `translate(${vals[0]}, ${vals[1]})`);
    anim(`boot-side-${tag}-rot`, 'transform', [chan(col(start), 'deg')], (vals) => `rotate(${vals[0]})`);
    anim(`boot-side-${tag}-r`, 'r', [chan(col(r), 'px')]);
    anim(`boot-side-${tag}-dash`, 'stroke-dasharray', [{ keys: col(sweep), fmt: (v) => `${n(v / 360)} 1` }]);
  }
}
// 橙点两颗：相位差 π 用静态 rotate(180) 包裹层；轨道角 + 半径合成一条 transform
anim(
  'boot-orbit-t',
  'transform',
  [chan(T.SCAN_ORBIT_ANGLE, 'deg'), chan(T.SCAN_ORBIT_RADIUS, 'px')],
  (vals) => `rotate(${vals[0]}) translateX(${vals[1]})`,
);
anim('boot-orbit-dot-r', 'r', [chan(T.SCAN_ORBIT_DOT_RADIUS, 'px')]);
// 六颗卫星点：同一条相位曲线 + 静态 60° 步进包裹层；生长曲线共用，逐颗靠 animation-delay 错峰（每 3 帧）
anim(
  'boot-sat-t',
  'transform',
  [
    chan(T.SATELLITE_DISTANCE, 'px'),
    { keys: T.SATELLITE_PHASE.map(([f, a]) => [f, (a * 180) / Math.PI] as const), fmt: num('deg') },
  ],
  (vals) => `rotate(${vals[1]}) translateX(${vals[0]})`,
);
// 六颗卫星点：生长曲线**逐颗一条绝对时间轴规则**（出现帧 548+3i，曲线从 −1 帧起算那样半径才从 0 长起）。
// 同样不用 animation-delay：理由与品牌三行相同（保住"整层可 seek 到任意绝对帧"）。
for (let i = 0; i < T.SATELLITE_COUNT; i++) {
  const start = T.SATELLITE_START_FRAME + i * T.SATELLITE_STEP_FRAMES;
  anim(
    `boot-sat-${i}-r`,
    'r',
    [{ keys: T.SATELLITE_GROWTH.map(([rel, v]) => [start + rel, v] as const), fmt: (v) => `${n(v)}px` }],
  );
}
// 中央大点：闪变帧与生长表混用（`coreRadius()` 已合过）
animFn('boot-core-r', 'r', [...T.CORE_GROWTH.map(([f]) => f), ...T.CORE_FLASH_FRAMES], (f) => `${n(T.coreRadius(f))}px`);
anim('boot-core-vis', 'opacity', [chan(ON_FROM(T.SCAN_ORNAMENT_FRAME))]);
// 黑白弧端圆点：外层转角度（黑端 = 外环起始角 + 弧长），圆点自己动 cx（半径）+ r（点半径）
anim(
  'boot-cap-black-rot',
  'transform',
  [chan(T.SCAN_OUTER_START, 'deg'), chan(T.SCAN_OUTER_SWEEP, 'deg')],
  (vals) => `rotate(calc(${vals[0]} + ${vals[1]}))`,
);
anim('boot-cap-black-cx', 'cx', [chan(T.SCAN_OUTER_RADIUS, 'px')]);
anim('boot-cap-black-r', 'r', [chan(T.SCAN_BLACK_CAP, 'px')]);
anim('boot-cap-white-rot', 'transform', [chan(T.SCAN_WHITE_START, 'deg')], (vals) => `rotate(${vals[0]})`);
anim('boot-cap-white-cx', 'cx', [chan(T.SCAN_WHITE_RADIUS, 'px')]);
anim('boot-cap-white-r', 'r', [chan(T.SCAN_WHITE_CAP, 'px')]);
// 权限提示：不透明度（19.48→19.88 s 淡入 + 545 起淡出）+ 字距收拢
{
  const [inA, inB] = [T.SCAN_PERMISSION_IN[0], T.SCAN_PERMISSION_IN[1]];
  anim('boot-permission-op', 'opacity', [
    chan([
      [T.ORIGIN_FRAME, 0],
      [inA - 1, 0],
      [inA, 0],
      [inB, 1],
      ...T.SCAN_PERMISSION_OUT,
      [T.END_FRAME, 0],
    ]),
  ]);
  anim('boot-permission-ls', 'letter-spacing', [chan(T.SCAN_TRACKING, 'px')]);
}

/* ══ 6. WELCOME / 退场 / 白场 / 背景漂移（569–673 帧）═════════════════════ */

const F = T.WELCOME_FLASH_FRAMES;
anim('boot-panel-vis', 'opacity', [
  chan([
    [T.ORIGIN_FRAME, 0],
    [T.WELCOME_FIRST_FRAME - 1, 0],
    ...F.map((f, i) => [f, T.WELCOME_PANEL[i]] as const),
    [T.END_FRAME, 0],
  ]),
]);
anim(
  'boot-heading-ink',
  'color',
  [
    chan([
      [T.WELCOME_FIRST_FRAME - 1, 0],
      ...F.map((f, i) => [f, T.WELCOME_INK[i]] as const),
      [F[6] + 1, 1],
      [T.END_FRAME, 1],
    ]),
  ],
  (vals) => {
    const g = n(255 * (1 - Number(vals[0])));
    return `rgb(${g} ${g} ${g})`;
  },
);
// 公司名：**连续多帧保持同一个值时，段的两端都要打点** ——
// 只打起点的话，两帧之间会被线性插值成中间值（实测就栽在这：595 帧读出来 0.825 而不是 0.65）。
anim('boot-company-vis', 'opacity', [
  chan([
    [T.ORIGIN_FRAME, 0],
    [T.COMPANY_FIRST_FRAME - 1, 0],
    [T.COMPANY_FIRST_FRAME, 1],
    [T.COMPANY_HIDDEN_FRAMES[0] - 1, 1],
    [T.COMPANY_HIDDEN_FRAMES[0], 0],
    [T.COMPANY_HIDDEN_FRAMES[1], 0], // 590、591 两帧都不可见
    [T.COMPANY_HIDDEN_FRAMES[1] + 1, 1],
    [T.COMPANY_MASK_FRAMES[0], T.COMPANY_MASK_OPACITY],
    [T.COMPANY_MASK_FRAMES[1], T.COMPANY_MASK_OPACITY], // 594、595 两帧都是 0.65
    [T.COMPANY_MASK_FRAMES[1] + 1, 1],
    [T.WELCOME_LAST_FRAME, 1],
    [T.END_FRAME, 0],
  ]),
]);
anim('boot-highlight-vis', 'opacity', [
  chan([
    [T.ORIGIN_FRAME, 1],
    [T.COMPANY_MASK_FRAMES[0] - 1, 1],
    [T.COMPANY_MASK_FRAMES[0], T.COMPANY_MASK_INK_OPACITY],
    [T.COMPANY_MASK_FRAMES[1], T.COMPANY_MASK_INK_OPACITY],
    [T.COMPANY_MASK_FRAMES[1] + 1, 1],
    [T.END_FRAME, 1],
  ]),
]);
anim('boot-highlight-clip', 'clip-path', [
  { keys: T.COMPANY_HIGHLIGHT, fmt: (v) => `inset(0 ${n(100 * (1 - v / T.COMPANY_HIGHLIGHT_FULL))}% 0 0)` },
]);
// INTERNAL DATABASE 的 4 次闪动：它是**逐帧**的二值量（626/627 亮、628/629 灭、630 亮、631 灭、632/633 亮、634 灭…），
// 所以直接按"值发生变化的帧 + 每段末帧"生成，别手写（手写必然漏掉 627 / 629 / 633 这几个段末）。
{
  const on = (f: number) => Number(!(f < T.DATABASE_FIRST_FRAME || T.DATABASE_OFF_FRAMES.includes(f)));
  const keys: T.Key[] = [];
  for (let f = T.DATABASE_FIRST_FRAME - 1; f <= T.DATABASE_FIRST_FRAME + 12; f++) {
    if (on(f) !== on(f - 1) || on(f) !== on(f + 1)) keys.push([f, on(f)]);
  }
  anim('boot-database-vis', 'opacity', [chan(keys)]);
}
anim('boot-wlogo-vis', 'opacity', [chan(ON_FROM(T.COMPANY_FIRST_FRAME))]);
{
  const exitFrames = Array.from({ length: T.END_FRAME - 663 }, (_, i) => 664 + i); // 664..673
  const winFrames = [T.WELCOME_FIRST_FRAME - 1, T.WELCOME_FIRST_FRAME, 663, ...exitFrames];
  const visible = (f: number) => T.WELCOME_FIRST_FRAME <= f && f <= T.WELCOME_LAST_FRAME;
  animFn('boot-welcome-op', 'opacity', winFrames, (f) => (visible(f) ? n(1 - T.exitAt(f) ** 3) : '0'));
  animFn('boot-welcome-scale', 'transform', winFrames, (f) => `scale(${n(1 - T.EXIT_FILTER.scale * T.exitAt(f))})`);
  animFn('boot-welcome-filter', 'filter', winFrames, (f) => {
    const e = T.exitAt(f);
    const X = T.EXIT_FILTER;
    return `blur(${n(X.blur * e)}px) invert(${n(X.invert * e)}) sepia(${n(e)}) saturate(${n(1 + X.saturate * e)}) hue-rotate(${n(X.hue * e)}deg)`;
  });
  // 白场 26.16 → 26.88 s（帧 654 → 672），逐帧采样
  animFn('boot-white-op', 'opacity', [653, ...Array.from({ length: 21 }, (_, i) => 654 + i)], (f) =>
    f < 654 ? '0' : n(T.whiteAt(f)),
  );
}
// 背景漂移 translate(sin(t·0.16)·18, −(t−6)·5) scale(1.08)，每 8 帧采样
{
  const D = T.BACKGROUND_DRIFT;
  animFn(
    'boot-bg-drift',
    'transform',
    [...Array.from({ length: 64 }, (_, i) => T.ORIGIN_FRAME + i * 8), T.END_FRAME],
    (f) => {
      const t = T.tAt(f);
      return `translate(${n(Math.sin(t * D.rate) * D.amplitude)}px, ${n(-(t - D.offset) * D.fall)}px) scale(${D.scale})`;
    },
  );
}
// 时钟：只在 20.16 s 结束时触发一次 animationend。**必须有它** —— 子元素的 animationend 会冒泡到根，
// 直接监听根节点会在水印/打字那几条 0.7–1.2 s 的动画结束时就误触发收尾（工单 §4.2）。
kf('boot-clock', [
  { f: T.ORIGIN_FRAME, v: 'opacity:1' },
  { f: T.END_FRAME, v: 'opacity:1' },
]);

/* ══ 7. 绑定（同一元素的多条动画必须写在一条规则里） ═════════════════════ */

const BIND: { sel: string; anims: string[]; extra?: string }[] = [
  { sel: '.boot-access', anims: ['boot-access-out'] },
  { sel: '.boot-logo', anims: ['boot-logo-vis', 'boot-logo-x'] },
  { sel: '.boot-contour', anims: ['boot-logo-dash', 'boot-logo-sw'] },
  { sel: '.boot-plus-pos', anims: ['boot-plus-pos', 'boot-plus-vis'] },
  { sel: '.boot-plus', anims: ['boot-plus-shape'] },
  { sel: '.boot-minus-pos', anims: ['boot-minus-pos', 'boot-minus-vis'] },
  { sel: '.boot-minus', anims: ['boot-minus-shape'] },
  { sel: '.boot-brand-1', anims: ['boot-brand-1-op', 'boot-brand-1-x'] },
  { sel: '.boot-brand-2', anims: ['boot-brand-2-op', 'boot-brand-2-x'] },
  { sel: '.boot-brand-3', anims: ['boot-brand-3-op', 'boot-brand-3-x'] },
  { sel: '.boot-powered', anims: ['boot-powered-vis', 'boot-powered-clip'] },
  { sel: '.boot-auth', anims: ['boot-auth-vis'] },
  { sel: '.boot-auth-b1', anims: ['boot-auth-b1-vis'] },
  { sel: '.boot-auth-sep', anims: ['boot-auth-sep-vis'] },
  { sel: '.boot-auth-b2', anims: ['boot-auth-b2-vis'] },
  { sel: '.boot-auth-b3', anims: ['boot-auth-b3-vis'] },
  { sel: '.boot-auth-glitch', anims: ['boot-auth-glitch-vis'] },
  { sel: '.boot-scan', anims: ['boot-scan-vis'] },
  { sel: '.boot-scan-group', anims: ['boot-scan-group-op', 'boot-scan-group-scale', 'boot-scan-group-blur'] },
  { sel: '.boot-g-outer', anims: ['boot-arc-outer-rot'] },
  { sel: '.boot-arc-outer', anims: ['boot-arc-outer-r', 'boot-arc-outer-dash'] },
  { sel: '.boot-g-white', anims: ['boot-arc-white-rot'] },
  { sel: '.boot-arc-white', anims: ['boot-arc-white-r', 'boot-arc-white-dash'] },
  { sel: '.boot-g-inner', anims: ['boot-arc-inner-rot'] },
  { sel: '.boot-arc-inner', anims: ['boot-arc-inner-r', 'boot-arc-inner-dash'] },
  { sel: '.boot-side-bl-pos', anims: ['boot-side-bl-pos'] },
  { sel: '.boot-side-bl-rot', anims: ['boot-side-bl-rot'] },
  { sel: '.boot-side-bl', anims: ['boot-side-bl-r', 'boot-side-bl-dash'] },
  { sel: '.boot-side-br-pos', anims: ['boot-side-br-pos'] },
  { sel: '.boot-side-br-rot', anims: ['boot-side-br-rot'] },
  { sel: '.boot-side-br', anims: ['boot-side-br-r', 'boot-side-br-dash'] },
  { sel: '.boot-orbit-t', anims: ['boot-orbit-t'] },
  { sel: '.boot-orbit-dot', anims: ['boot-orbit-dot-r'] },
  { sel: '.boot-sat', anims: ['boot-sat-t'] },
  ...Array.from({ length: T.SATELLITE_COUNT }, (_, i) => ({
    sel: `.boot-sat-dot-${i}`,
    anims: [`boot-sat-${i}-r`],
  })),
  { sel: '.boot-cap-black-rot', anims: ['boot-cap-black-rot'] },
  { sel: '.boot-cap-black', anims: ['boot-cap-black-cx', 'boot-cap-black-r'] },
  { sel: '.boot-cap-white-rot', anims: ['boot-cap-white-rot'] },
  { sel: '.boot-cap-white', anims: ['boot-cap-white-cx', 'boot-cap-white-r'] },
  { sel: '.boot-core', anims: ['boot-core-r', 'boot-core-vis'] },
  { sel: '.boot-permission', anims: ['boot-permission-op', 'boot-permission-ls'] },
  { sel: '.boot-welcome', anims: ['boot-welcome-op', 'boot-welcome-scale', 'boot-welcome-filter'] },
  { sel: '.boot-panel', anims: ['boot-panel-vis'] },
  { sel: '.boot-heading', anims: ['boot-heading-ink'] },
  { sel: '.boot-company', anims: ['boot-company-vis'] },
  { sel: '.boot-highlight', anims: ['boot-highlight-vis', 'boot-highlight-clip'] },
  { sel: '.boot-database', anims: ['boot-database-vis'] },
  { sel: '.boot-wlogo', anims: ['boot-wlogo-vis'] },
  { sel: '.boot-white', anims: ['boot-white-op'] },
  { sel: '.boot-bg-svg', anims: ['boot-bg-drift'] },
  { sel: '.boot-clock', anims: ['boot-clock'] },
];

const bindings = BIND.map(({ sel, anims, extra }) => {
  const list = anims.map((a) => `${a} var(--dur-boot) linear both`).join(',');
  return `${sel}{animation:${list}${extra ? `;${extra}` : ''}}`;
}).join('\n');

/* ══ 8. 静态几何与结构（出处：工单 §3.6，一律取上游末期被覆盖后的生效值） ══ */

const geometry = `
/* 覆盖层根与门控（决策 #6/#7/#21；方向：默认不显示，只有 JS 判定该播才加 .boot-on） */
[data-boot-overlay]{position:fixed;inset:0;z-index:60;overflow:hidden}
/* 交棒淡出：动画跑完（.boot-clock 的 animationend）后由 JS 加 .boot-out —— 400ms 之后移除整层。
   放在总动画之外是因为白场 26.88 s 才达满、到 20.16 s 结束只剩 0.04 s，装不下 400ms（工单 §2 注）。 */
[data-boot-overlay].boot-out{opacity:0;transition:opacity var(--dur-boot-out) linear}
html:not(.boot-on) [data-boot-overlay]{display:none}
html.boot-on [data-boot-overlay]{display:block}
html.boot-on{overflow:hidden}
@media (max-width:767px){[data-boot-overlay]{display:none !important}}
@media (prefers-reduced-motion:reduce){[data-boot-overlay]{display:none !important}}
/* 舞台：1920×1080 + 等比缩放（决策 #8）。
   ⚠️ 除数必须带单位 1920px：calc(100vw / 1920) 求出来是**长度**，而 scale() 要纯数 ⇒ 整条 transform
   会被判定为非法值丢掉（实测 computed = none，覆盖层既不居中也不缩放）。下面这条是实测确认过的写法。 */
.boot-deco{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform:translate(-50%,-50%) scale(min(calc(100vw / 1920px), calc(100dvh / 1080px)));transform-origin:50% 50%;color:var(--ink)}
.boot-deco *{position:absolute;box-sizing:border-box}
/* 背景与白场铺满**视口**（它们在 .boot-deco 之外，所以必须自带 position）。
   铺满的理由：1920×1080 舞台等比缩放居中后，16:10 之类的视口上下会留缝，缝里会漏出首页的 HUD/OS 条。 */
.boot-bg{position:absolute;inset:0;background:radial-gradient(ellipse at 51% 48%,#e7e7e1 0%,#e3e1dc 76%,#e4dfdb 100%)}
.boot-bg-svg{position:absolute;inset:0;width:100%;height:100%;opacity:.15;filter:blur(2px)}
/* ACCESS（上游 style.css:221-229） */
.boot-access{top:532px;left:800px;width:420px;text-align:left;font-size:18px;font-family:Archivo,"IBM Plex Sans",sans-serif;letter-spacing:.02em;white-space:pre}
/* 品牌三行（生效值：boot-lettering.css:61-72 的 50.75px / 字距 1px） */
.boot-brand{top:114px;left:59px;width:270px;line-height:1;white-space:nowrap;user-select:none}
/* 下面四条必须带 .boot-deco 前缀：通配的 .boot-deco *{position:absolute} 比单类选择器**更具体**，
   不加前缀的话 relative 会被它压掉（收不到预期的静态流布局）。注意本段是模板字符串，注释里别用反引号。 */
.boot-deco .boot-brand-1{position:relative}
/* 需要留在正常流里的几处：通配的 .boot-deco *{position:absolute} 会把它们全拉出文档流，
   结果品牌三行与「OS」叠在同一个点上（截图验收到 268 帧时一眼看见的就是这个）。
   再次提醒：本段是模板字符串，注释里**不要**写反引号（已经栽过两次）。 */
.boot-deco .boot-brand-2,.boot-deco .boot-brand-3,.boot-deco .boot-brand-3 b,.boot-deco .boot-powered b{position:static}
.boot-brand-1{height:48px;margin:0;font-size:50.75px;line-height:48px;letter-spacing:1px;font-weight:750;font-family:Archivo,"IBM Plex Sans",sans-serif}
.boot-brand-2{font-size:19px;line-height:23px;letter-spacing:.587px;font-weight:600}
.boot-brand-3{display:flex;justify-content:space-between;margin:0;font-size:35px;line-height:40px}
.boot-brand-3 b{font-weight:750;letter-spacing:3px}
.boot-deco .boot-analysis{position:relative}
.boot-analysis{display:block;width:189px;height:40px}
.boot-analysis span{top:0;letter-spacing:0;font-kerning:none}
/* powered（上游 style.css:143-163） */
.boot-powered{right:59px;bottom:108px;display:flex;align-items:center;gap:5px;font-size:18px;line-height:24px;white-space:nowrap}
.boot-powered b{font-weight:750}
.boot-powered i{position:static;display:inline-block;width:25px;height:6px;margin-left:11px;background:#090a08}
/* Logo 槽位 296×177 @518,462（上游 style.css:188-196）；我们的标志 viewBox 24×12 ⇒ 实际绘制 296×148 */
.boot-logo{top:462px;left:518px;width:296px;height:177px;display:flex;flex-direction:column;align-items:center}
.boot-mark{position:static;width:296px;height:148px;overflow:visible}
.boot-logo-word{position:static;font-size:16px;letter-spacing:1px;font-weight:700;font-family:Archivo,"IBM Plex Sans",sans-serif;white-space:nowrap}
/* 身份行（style.css:201-211 + boot-lettering.css:59；行末光标按 style.css:2134 不做） */
.boot-auth{display:flex;align-items:center;gap:10px;top:527px;left:931px;font-size:21.35px;font-family:Archivo,"IBM Plex Sans",sans-serif;white-space:nowrap}
.boot-deco .boot-auth-msg{position:relative;width:1px;height:1.3em}
.boot-auth-b1,.boot-auth-b2,.boot-auth-b3,.boot-auth-glitch{top:0;left:0;white-space:pre}
.boot-auth-b1 > *,.boot-auth-b2 > *,.boot-auth-b3 > *{position:static}
.boot-auth-sep{position:static}
.boot-auth-mark{position:static;font-size:14px}
/* 扫描段（末期覆盖：inset:0 + 1920×1080；上游 style.css:2143-2149） */
.boot-scan{inset:0}
.boot-scan-svg{position:static;width:1920px;height:1080px;display:block;overflow:visible}
.boot-scan-group,.boot-g-center,.boot-g-outer,.boot-g-white,.boot-g-inner,.boot-side-bl-pos,.boot-side-bl-rot,.boot-side-br-pos,.boot-side-br-rot,.boot-orbit-t,.boot-sat,.boot-cap-black-rot,.boot-cap-white-rot{transform-box:view-box;transform-origin:0 0}
.boot-scan-group,.boot-g-center{transform-origin:960px 540px}
.boot-arc,.boot-side-bl,.boot-side-br{fill:none;stroke-linecap:round;stroke:#080a08;stroke-width:2}
.boot-arc-outer{stroke-width:2.4}
.boot-arc-white{stroke:#fff;stroke-width:4}
.boot-orbit-dot{position:static;fill:#ed821b;stroke:none}
.boot-sat-dot{position:static;fill:#080a08;stroke:none}
.boot-core{position:static;fill:#080a08;stroke:none}
.boot-cap{position:static;stroke:none}
.boot-cap-black{fill:#080a08}
.boot-cap-white{fill:#fff}
.boot-permission{inset:0;display:flex;align-items:center;justify-content:center;font-size:26.5px;color:#0e0e0e;font-family:Archivo,"IBM Plex Sans",sans-serif;white-space:nowrap}
/* 欢迎段（末期覆盖：left:720 / 480×340；上游 style.css:2155-2215） */
.boot-welcome{left:720px;top:403px;width:480px;height:340px;transform-origin:50% 44%}
.boot-panel{top:-59px;left:5px;width:470px;height:392px;background:#080a08}
.boot-deco .boot-heading{position:relative;z-index:1}
.boot-heading{font-size:55px;line-height:65px;font-weight:700;white-space:nowrap;font-family:Archivo,"IBM Plex Sans",sans-serif}
.boot-company{top:67px;left:35px;width:410px;height:60px}
.boot-company strong{inset:0;padding:5px 8px;background:transparent;color:#080a08;font-size:48px;line-height:50px;letter-spacing:-.5px;white-space:nowrap;font-family:Archivo,"IBM Plex Sans",sans-serif;font-weight:700}
.boot-company .boot-highlight{background:#080a08;color:#eeede8}
.boot-database{top:134px;left:0;width:100%;font-size:36px;line-height:43px;white-space:nowrap;font-family:Archivo,"IBM Plex Sans",sans-serif}
.boot-wlogo{top:187px;left:138.5px;width:203px;height:121px}
.boot-wlogo svg{position:static;width:100%;height:100%}
/* 白场 / 时钟 / skip（决策 #16：真按钮、右下、**不在 aria-hidden 子树里**） */
.boot-white{position:absolute;inset:0;background:#fff}
.boot-clock{top:0;left:0;width:0;height:0}
.boot-skip{position:absolute;right:60px;bottom:60px;z-index:2;padding:10px 0;font-size:14px;letter-spacing:1.1px;opacity:.55;color:var(--ink);background:none;border:0;cursor:pointer}
.boot-skip:hover,.boot-skip:focus-visible{opacity:1}
/* 逐字 span：一条 1ms 点亮动画 + 内联 --d 定位（选择器要比 .boot-deco * 更具体，否则 position 被拉成 absolute） */
.boot-deco .boot-ch{position:static;opacity:0;animation:boot-ch 1ms linear both;animation-delay:var(--d,0ms)}
`;

/** 完整 CSS（几何 + 绑定 + keyframes） */
export function bootCss(): string {
  return [
    '/* 首页开场动画 · 由 src/lib/boot-css.ts 生成 —— 改数据请改 boot-tracks.ts，不要手改这里 */',
    geometry.trim(),
    bindings,
    keyframes.join('\n'),
  ].join('\n');
}

/** 逐字 span 的数据（给 Astro 模板 map 用；延迟是**绝对**的，从动画原点算） */
export function charSpans(text: string, window: readonly [number, number]) {
  return T.typedSpans(text, window[0], window[1]).map(({ ch, frame }) => ({
    ch,
    delay: T.delayMs(frame),
    frame,
  }));
}

/** 卫星点的相位步进（度）—— 组件用它给每颗点套一个静态 rotate 包裹层 */
export const SATELLITE_STEP_DEG = 60;

/**
 * 供静态契约断言用：CSS 里**绑定了动画**的类名清单。
 * 模板漏掉一个 ⇒ 那条动画永远不跑（"加了样式却没有元素"），所以测试要拿这张表和 BootIntro.astro 对账。
 */
export function boundClasses(): string[] {
  return [
    ...new Set(
      BIND.flatMap((b) =>
        b.sel
          .split(',')
          .map((s) => s.trim().replace(/^\./, ''))
          .filter((s) => /^[a-z][\w-]*$/.test(s)),
      ),
    ),
  ];
}
