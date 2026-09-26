/**
 * 首页开场动画 · 数据层（**唯一真源**）
 *
 * 全部数值照抄上游 `LBEILC/RhineLabUI`（MIT, Copyright (c) 2026 LBEILC）的
 * `src/boot-motion.ts` / `src/boot-tracks.ts` / `src/boot-logo-tracks.ts` / `src/boot-orbit-tracks.ts`，
 * 逐条注明上游文件与行号。本地镜像：`_tmp-rlui/`（本轮校对用，交付后按 #26 清掉）。
 *
 * 三条纪律（见 docs/boot-intro-work-order.md）：
 *   1. **代码为准，不以他的文档为准**（他的文档自相矛盾，本轮抓到 4 处，工单 §3.0 有表）。
 *   2. 本模块只放「测量数据 + 纯函数」，不放任何行为/副作用 —— 行为和形状在 BootIntro.astro。
 *   3. 上游有两段互相覆盖的 CSS（早期 90–339 / 末期 2124–2215），**生效值一律取末期**（工单 §3.6）。
 *
 * 时间基准：原片 1920×1080 / 25 fps；`appTime = 原片时间 − 5`；
 *          动画原点 = 原片第 169 帧（6.76 s = app 1.76 s），终点 = 第 673 帧（26.92 s），
 *          跨度 504 帧 = **20.16 s**（上游 `boot-motion.ts:24-26`、`main.ts:1192-1194`）。
 */

export type Key = readonly [number, number];

/* ── 时间基准 ───────────────────────────────────────────────────────────── */

export const FPS = 25;
/** 动画原点：原片第 169 帧（6.76 s） */
export const ORIGIN_FRAME = 169;
/** 动画终点：原片第 673 帧（26.92 s） */
export const END_FRAME = 673;
/** 跨度 504 帧 */
export const SPAN = END_FRAME - ORIGIN_FRAME;
/** 20_160 ms —— 与 tokens.css 的 --dur-boot 同源 */
export const TOTAL_MS = (SPAN * 1000) / FPS;
/** 交棒淡出 400 ms（工单 §4.2：放在 20.16 s 动画之外） */
export const OUTRO_MS = 400;

/** 帧 → 动画百分比停点（写进 @keyframes） */
export const pct = (frame: number): number => ((frame - ORIGIN_FRAME) / SPAN) * 100;
/** 帧 → 绝对延迟（ms），给逐字 span 用 */
export const delayMs = (frame: number): number => (frame - ORIGIN_FRAME) * (1000 / FPS);

/** 上游 `boot-motion.ts:6-8` */
export const progress = (t: number, a: number, b: number): number =>
  Math.max(0, Math.min(1, (t - a) / (b - a)));
/** 上游 `boot-motion.ts:8` */
export const smooth = (p: number): number => p * p * (3 - 2 * p);
/** 原片时间 → 帧号（上游 `boot-motion.ts:26`） */
export const frameAt = (t: number): number => Math.floor(t * FPS + 0.00001);
/** 帧集合判定（上游 `boot-motion.ts:19`） */
export const at = (frame: number, frames: readonly number[]): boolean => frames.includes(frame);

/**
 * 单调三次 Hermite 保速插值 —— 照抄上游 `boot-tracks.ts:5-33`。
 * 上游注释原文：'Monotone cubic interpolation preserves measured speeds between source frames;
 * unlike easing each interval separately, it does not stop at every keyframe.'
 * 我们用它在**构建期**把表算成百分比停点（CSS 侧只剩线性补间，保速特性丢失是决策 #4 已接受的代价）。
 */
export function track(keys: readonly Key[], frame: number): number {
  if (frame <= keys[0][0]) return keys[0][1];
  const last = keys.length - 1;
  if (frame >= keys[last][0]) return keys[last][1];
  const slope = (i: number) => (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]);
  const tangent = (i: number) => {
    if (i === 0) return slope(0);
    if (i === last) return slope(last - 1);
    const a = slope(i - 1);
    const b = slope(i);
    if (a * b <= 0) return 0;
    const h0 = keys[i][0] - keys[i - 1][0];
    const h1 = keys[i + 1][0] - keys[i][0];
    const w0 = 2 * h1 + h0;
    const w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / a + w1 / b);
  };
  let i = 0;
  while (frame > keys[i + 1][0]) i++;
  const h = keys[i + 1][0] - keys[i][0];
  const p = (frame - keys[i][0]) / h;
  return (
    (2 * p ** 3 - 3 * p ** 2 + 1) * keys[i][1] +
    (p ** 3 - 2 * p ** 2 + p) * h * tangent(i) +
    (-2 * p ** 3 + 3 * p ** 2) * keys[i + 1][1] +
    (p ** 3 - p ** 2) * h * tangent(i + 1)
  );
}

/* ── 文案（工单 §3.7 的映射表；授权线 #13：不出现 RHINE 相关字样） ────────── */

export const TEXT = {
  /** 26 字，逐字输入（#11 原样保留） */
  access: 'ACCESS PERMISSION REQUIRED',
  /** Logo 内文字：#12 保槽位换内容 */
  logoWord: 'NORTH·CEDAR',
  /** 左上品牌三行（本轮 Q1：含 RHINE 的第一行换 NORTH CEDAR，其余原样） */
  brand1: 'NORTH CEDAR',
  brand2: 'SYNTHESIZE INFORMATION',
  brand3: 'ANALYSIS',
  brand3Tail: 'OS',
  /** 右下角（`poweredLead` 单独留出来，好在模板里只把品牌名加粗） */
  poweredLead: 'POWERED BY',
  powered: 'POWERED BY NORTH CEDAR',
  /** 身份验证段（#11：JOYCE MOORE → NORTH CEDAR，同为 11 字） */
  authId: 'ID CONFIRMED',
  authName: 'NORTH CEDAR',
  authRequest: 'REQUEST RECEIVED',
  authProcessing: 'START PROCESSING',
  /** 故障帧整行（14 空格 + 7 字，与原串等长）：SING... → LINK... */
  authGlitch: '              LINK...',
  /** 权限提示 / 欢迎段 */
  permission: 'PERMISSION AUTHORIZED',
  welcome: 'WELCOME TO',
  company: 'NORTH CEDAR.LLC.',
  database: 'INTERNAL DATABASE',
  /** skip 按钮（站主 2026-09-26 审定时定：英文，与 #11 一致） */
  skip: 'SKIP ↗',
  skipLabel: '跳过开场',
} as const;

/* ── ACCESS 段（169–227 帧）────────────────────────────────────────────── */

/** 逐帧可见字数，帧 170→187；上游 `boot-motion.ts:20-22` */
export const ACCESS_COUNTS = [
  1, 1, 3, 4, 5, 6, 9, 11, 12, 14, 17, 18, 19, 20, 22, 23, 25, 26,
] as const;
export const ACCESS_START_FRAME = 170;
/** `accessOpacity`：170–225 = 1；**226 = 0.25**；227+ = 0。上游 `boot-motion.ts:64` */
export const ACCESS_OPACITY: readonly Key[] = [
  [169, 0],
  [170, 1],
  [225, 1],
  [226, 0.25],
  [227, 0],
  [END_FRAME, 0],
];

/* ── LOGO 段（229–295 帧；左移持续到 294）──────────────────────────────── */

/** 连续轮廓：帧 → [start, end]（归一化弧长）。上游 `boot-logo-tracks.ts:5-40` */
export const LOGO_DRAW = [
  [229, -0.02, -0.0198],
  [230, -0.0195, -0.011],
  [231, -0.016, 0.009],
  [232, -0.0095, 0.047],
  [233, 0.0025, 0.1135],
  [234, 0.0215, 0.2205],
  [235, 0.048, 0.365],
  [236, 0.0735, 0.504],
  [237, 0.094, 0.6155],
  [238, 0.109, 0.7045],
  [239, 0.122, 0.7755],
  [240, 0.133, 0.835],
  [241, 0.1425, 0.884],
  [242, 0.1505, 0.927],
  [243, 0.1575, 0.964],
  [244, 0.164, 0.996],
  [245, 0.1695, 1.023],
  [246, 0.1745, 1.0475],
  [247, 0.1785, 1.0685],
  [248, 0.183, 1.087],
  [249, 0.187, 1.103],
  [250, 0.19, 1.1175],
  [251, 0.1935, 1.13],
  [252, 0.196, 1.1405],
  [253, 0.1985, 1.15],
  [254, 0.201, 1.1575],
  [255, 0.203, 1.1645],
  [256, 0.205, 1.17],
  [257, 0.2065, 1.1745],
  [258, 0.208, 1.1785],
  [259, 0.2095, 1.181],
  [260, 0.2105, 1.183],
  [261, 0.2115, 1.184],
  [264, 0.211, 1.1835],
] as const;

/** 缺口沿轮廓移动（420 帧起）。上游 `boot-logo-tracks.ts:43-58` */
export const LOGO_CUT: readonly Key[] = [
  [420, 0.1835],
  [425, 0.184],
  [430, 0.1885],
  [435, 0.2],
  [440, 0.2205],
  [450, 0.2925],
  [455, 0.3485],
  [460, 0.421],
  [465, 0.5095],
  [470, 0.614],
  [475, 0.722],
  [480, 0.827],
  [485, 0.9195],
  [486, 0.9365],
];

/** 左移动画：帧 → 左边缘 px。上游 `boot-logo-tracks.ts:59-94`；`boot.ts:136-137` 取 `-520` 为位移 */
export const LOGO_LEFT_EDGE: readonly Key[] = [
  [260, 814],
  [261, 813],
  [262, 812],
  [263, 808],
  [264, 803],
  [265, 794],
  [266, 781],
  [267, 763],
  [268, 740],
  [269, 716],
  [270, 691],
  [271, 668],
  [272, 648],
  [273, 630],
  [274, 615],
  [275, 601],
  [276, 590],
  [277, 580],
  [278, 571],
  [279, 563],
  [280, 556],
  [281, 550],
  [282, 545],
  [283, 540],
  [284, 536],
  [285, 533],
  [286, 530],
  [287, 527],
  [288, 525],
  [289, 523],
  [290, 521],
  [291, 520],
  [292, 519],
  [294, 518],
];
export const LOGO_LEFT_BASE = 520;

/** 描边宽 0.25 → 26。上游 `boot-logo-tracks.ts:104-114` */
export const LOGO_STROKE_WIDTH: readonly Key[] = [
  [229, 0.25],
  [230, 2.8],
  [231, 8],
  [232, 16],
  [233, 23.5],
  [234, 26],
];
/** 加减号整体缩放 0 → 1（246 帧进入）。上游 `boot-logo-tracks.ts:115-128` */
export const LOGO_SYMBOL_SCALE: readonly Key[] = [
  [246, 0],
  [247, 0.4],
  [248, 0.63],
  [249, 0.75],
  [250, 0.83],
  [251, 0.89],
  [252, 0.94],
  [254, 0.985],
  [256, 1],
];
/** 加号横向落点。上游 `boot-logo-tracks.ts:129-143` */
export const LOGO_PLUS_X: readonly Key[] = [
  [246, 155],
  [247, 123.3],
  [248, 104],
  [249, 93.53],
  [250, 86.52],
  [251, 81.78],
  [252, 78.48],
  [254, 74.26],
  [256, 72.96],
  [260, 72.6],
];
/** 减号横向落点。上游 `boot-logo-tracks.ts:144-158` */
export const LOGO_MINUS_X: readonly Key[] = [
  [246, 155],
  [247, 186.82],
  [248, 206.14],
  [249, 216.66],
  [250, 223.47],
  [251, 228.21],
  [252, 231.77],
  [254, 236.06],
  [256, 237.57],
  [260, 237.1],
];
/** 减号长度 15 → 46。上游 `boot-logo-tracks.ts:159-172` */
export const LOGO_MINUS_WIDTH: readonly Key[] = [
  [246, 15],
  [256, 15],
  [257, 23],
  [258, 31],
  [259, 35.5],
  [260, 38],
  [262, 42],
  [264, 44],
  [268, 46],
];
export const LOGO_MINUS_WIDTH_END = 46;
/** 加号旋转 0 → −90°。上游 `boot-logo-tracks.ts:173-186` */
export const LOGO_PLUS_ANGLE: readonly Key[] = [
  [255, 0],
  [256, -3],
  [257, -22],
  [258, -45],
  [259, -62],
  [260, -70],
  [262, -80],
  [265, -87],
  [270, -90],
];

/**
 * 上游 Logo 内容在 310×185 的坐标空间里（`brand.ts:2-8`），我们的标志是 24×12。
 * ⇒ 长度量按 310/24 换算；终值对齐我们现有 symbol：轮廓 2.2、加减号 1.8（工单 §3.2 换算表）。
 */
export const LOGO_SPACE_RATIO = 310 / 24;
export const LOGO_OURS = {
  strokeWidthEnd: 2.2,
  strokeWidthStart: 0.25 / LOGO_SPACE_RATIO,
  symbolStroke: 1.8,
  plusXStart: 155 / LOGO_SPACE_RATIO,
  plusXEnd: 72.6 / LOGO_SPACE_RATIO,
  minusXStart: 155 / LOGO_SPACE_RATIO,
  minusXEnd: 237.1 / LOGO_SPACE_RATIO,
  minusBase: 2.6,
} as const;

/** Logo 段可见性：9.16–19.48 s（二值）。上游 `boot-motion.ts:65` */
export const LOGO_VISIBLE: readonly Key[] = [
  [169, 0],
  [228, 0],
  [229, 1],
  [486, 1],
  [487, 0],
  [END_FRAME, 0],
];
/** Logo 内文字逐字窗口 232–255（上游 9 字、我们 11 字，公式按字串长度算） */
export const LOGO_WORD_WINDOW: readonly [number, number] = [232, 255];

/* ── 品牌三行 / 右下 powered（278/280/282 错峰）─────────────────────────── */

/** 三行共用的左边缘轨迹（24 点，局部帧 0–23）。上游 `boot-tracks.ts:35-41` */
export const BRAND_X = [
  234, 216, 181, 143, 115, 94, 78, 65, 54, 45, 38, 31, 26, 21, 17, 13, 10, 8, 6, 4, 3, 2, 1, 0,
] as const;
/** 第三行 `ANALYSIS` 的逐字光学间距（px），实测自参考字形。上游 `brand.ts:11` */
export const ANALYSIS_POSITIONS = [2, 28, 55, 81, 103, 129, 154, 166] as const;
/** 三行共用的不透明度五档（局部帧 −1…3）。上游 `boot-tracks.ts:46-56` */
export const BRAND_OPACITY: readonly Key[] = [
  [-1, 0],
  [0, 0.4],
  [1, 0.65],
  [2, 0.88],
  [3, 1],
];
/** 第一行起点 278，每行 +2 帧。上游 `boot-tracks.ts:42-44` */
export const BRAND_START_FRAME = 278;
export const BRAND_LINE_OFFSET = 2;
/** `POWERED BY ...` 逐字窗口 279–295。上游 `boot-motion.ts:70` */
export const POWERED_WINDOW: readonly [number, number] = [279, 295];

/* ── AUTH 段（281–486 帧）──────────────────────────────────────────────── */

/** `authOpacity`：281 ≤ f < 487。上游 `boot-motion.ts:68` */
export const AUTH_VISIBLE: readonly Key[] = [
  [169, 0],
  [280, 0],
  [281, 1],
  [486, 1],
  [487, 0],
  [END_FRAME, 0],
];
/** 四句的逐字窗口与分支边界。上游 `boot-motion.ts:38-47` */
export const AUTH = {
  /** 分支：f < 363 走第一句/名字；363 ≤ f < 421 走 REQUEST；f ≥ 421 走 START */
  branch2: 363,
  branch3: 421,
  idWindow: [282, 295] as const,
  /** `" : "` 在 320 帧整块出现。上游 `:40` */
  nameLeadFrame: 320,
  nameWindow: [321, 339] as const,
  requestWindow: [367, 389] as const,
  processingWindow: [423, 440] as const,
  /** 省略号：f ≥ 449，每 4 帧加一个点，最多 3 个。上游 `:44-45` */
  dotsStart: 449,
  dotsStep: 4,
  dotsMax: 3,
  /** 故障帧（整行替换）。上游 `:46` */
  glitchFrames: [479, 485, 486] as const,
} as const;

/* ── SCAN 段（487–568 帧）──────────────────────────────────────────────── */

/** `scanVisible`：19.48 ≤ t < 22.76。上游 `boot-motion.ts:71` */
export const SCAN_VISIBLE: readonly Key[] = [
  [169, 0],
  [486, 0],
  [487, 1],
  [568, 1],
  [569, 0],
  [END_FRAME, 0],
];
/** 整组入场不透明度（4 点）+ 跳变帧 0.32。上游 `boot-motion.ts:75-87`、`:51` */
export const SCAN_RING_OPACITY: readonly Key[] = [
  [169, 0],
  [487, 0],
  [488, 0.18],
  [490, 0.6],
  [493, 1],
  [524, 1],
  [525, 0.32],
  [526, 0.32],
  [527, 1],
  [528, 0.32],
  [529, 0.32],
  [530, 1],
  [END_FRAME, 1],
];
/** 跳变帧：缩放 1.94、模糊 2.2 px。上游 `boot-motion.ts:51,75-76,87` */
export const SCAN_GLITCH_FRAMES = [525, 526, 528, 529] as const;
export const SCAN_RING_SCALE = 1.94;
export const SCAN_RING_BLUR = 2.2;
/** 权限提示字距收拢（10 点）。上游 `boot-motion.ts:88-102` */
export const SCAN_TRACKING: readonly Key[] = [
  [487, 40],
  [492, 28],
  [497, 18],
  [500, 14],
  [505, 8],
  [510, 4],
  [515, 1.7],
  [520, 0.5],
  [527, 0],
  [568, 0],
];
export const SCAN_FONT_SIZE = 26.5;
/** 权限提示不透明度：19.48→19.88 s 线性淡入，545 起按表淡出。上游 `boot-motion.ts:104-118` */
export const SCAN_PERMISSION_IN: readonly [number, number, number, number] = [487, 497, 0, 1];
export const SCAN_PERMISSION_OUT: readonly Key[] = [
  [545, 1],
  [546, 0.4],
  [547, 0.3],
  [548, 0.25],
  [549, 0.1],
  [550, 0.04],
  [551, 0],
];
/** `ornament`：t ≥ 21.84（546 帧）后中央图形可见。上游 `boot-motion.ts:119` */
export const SCAN_ORNAMENT_FRAME = 546;
export const SCAN_CENTER: readonly [number, number] = [960, 540];

/** 外环半径 18 点。上游 `boot-tracks.ts:91-110` */
export const SCAN_OUTER_RADIUS: readonly Key[] = [
  [487, 2000],
  [492, 1540],
  [497, 1095],
  [500, 895.5],
  [505, 650],
  [510, 492],
  [515, 385.5],
  [520, 320.5],
  [524, 287.5],
  [527, 275],
  [530, 270],
  [535, 265.5],
  [540, 262],
  [545, 258],
  [550, 255],
  [555, 252.5],
  [560, 250],
  [568, 246],
];
/** 白环半径 24 点。上游 `boot-tracks.ts:111-136` */
export const SCAN_WHITE_RADIUS: readonly Key[] = [
  [487, 1500],
  [492, 1011],
  [493, 955],
  [494, 893],
  [495, 834],
  [496, 783],
  [497, 737],
  [498, 693.5],
  [499, 655],
  [500, 619],
  [505, 470.5],
  [510, 374],
  [515, 310.5],
  [520, 272],
  [524, 253.5],
  [527, 248],
  [530, 246],
  [535, 242],
  [540, 238],
  [545, 235],
  [550, 232.5],
  [555, 230],
  [560, 227.5],
  [568, 224],
];
/** 外环起始角 °（17 点）。上游 `boot-tracks.ts:137-157` */
export const SCAN_OUTER_START: readonly Key[] = [
  [487, 470],
  [492, 364],
  [497, 276],
  [500, 226],
  [505, 159.75],
  [510, 98.75],
  [515, 49.25],
  [520, 13.25],
  [524, -9],
  [527, -23],
  [530, -36.25],
  [535, -53],
  [540, -66.25],
  [545, -75.75],
  [550, -82.75],
  [560, -89],
  [568, -90],
];
/** 外环弧长 °（16 点）。上游 `boot-tracks.ts:158-177` */
export const SCAN_OUTER_SWEEP: readonly Key[] = [
  [487, 30],
  [492, 105],
  [497, 170],
  [500, 199],
  [505, 241.5],
  [510, 270.25],
  [515, 295.75],
  [520, 313.25],
  [527, 331],
  [530, 336.75],
  [535, 344.5],
  [540, 350.75],
  [545, 355],
  [550, 358],
  [560, 360],
  [568, 360],
];
/** 白环起始角 °（16 点）。上游 `boot-tracks.ts:178-197` */
export const SCAN_WHITE_START: readonly Key[] = [
  [487, -100],
  [492, -30],
  [497, 72],
  [500, 107],
  [505, 140],
  [510, 172],
  [515, 196],
  [520, 213.75],
  [527, 234.5],
  [530, 241],
  [535, 249.75],
  [540, 256.75],
  [545, 262.25],
  [550, 265.75],
  [560, 269.5],
  [568, 270],
];
/** 白环弧长 °（16 点）。上游 `boot-tracks.ts:198-217` */
export const SCAN_WHITE_SWEEP: readonly Key[] = [
  [487, 30],
  [492, 105],
  [497, 170],
  [500, 200],
  [505, 241.25],
  [510, 272.75],
  [515, 295.5],
  [520, 313.75],
  [527, 330.5],
  [530, 335.5],
  [535, 343.5],
  [540, 349.5],
  [545, 354],
  [550, 357],
  [560, 360],
  [568, 360],
];
/** 内环半径（13 点）。上游 `boot-tracks.ts:218-232` */
export const SCAN_INNER_RADIUS: readonly Key[] = [
  [487, 124.5],
  [492, 123],
  [495, 121],
  [500, 117.5],
  [505, 112],
  [510, 107.5],
  [515, 104],
  [520, 101.5],
  [530, 97],
  [540, 94],
  [550, 91.5],
  [560, 90],
  [568, 88.5],
];
/** 内环起始角 °（19 点）。上游 `boot-tracks.ts:233-255` */
export const SCAN_INNER_START: readonly Key[] = [
  [487, -20],
  [490, -4.25],
  [492, 14],
  [495, 48.75],
  [497, 69.25],
  [500, 93.25],
  [505, 121.25],
  [510, 141],
  [515, 155.5],
  [520, 166.5],
  [527, 178],
  [530, 181],
  [535, 187.75],
  [540, 192],
  [545, 195.25],
  [550, 197.75],
  [555, 199.75],
  [560, 200.75],
  [568, 201.5],
];
/** 内环弧长 °（14 点）。上游 `boot-tracks.ts:256-273` */
export const SCAN_INNER_SWEEP: readonly Key[] = [
  [487, 0],
  [492, 22.5],
  [497, 55.75],
  [500, 70.25],
  [505, 87.25],
  [510, 99],
  [515, 108],
  [520, 115],
  [527, 123.5],
  [530, 127],
  [535, 128],
  [540, 131],
  [550, 134],
  [568, 136],
];
/** 橙点角度 °（23 点）。上游 `boot-tracks.ts:274-300` */
export const SCAN_ORBIT_ANGLE: readonly Key[] = [
  [487, 70],
  [492, 33],
  [493, 13.2],
  [494, -5.8],
  [495, -24.2],
  [496, -41.4],
  [497, -57.2],
  [498, -71.4],
  [499, -84.2],
  [500, -96],
  [505, -140.8],
  [510, -172.3],
  [515, -195.5],
  [520, -213.5],
  [527, -234],
  [530, -238.8],
  [535, -247.7],
  [540, -254.7],
  [545, -260.1],
  [550, -264],
  [555, -266.9],
  [560, -268.8],
  [568, -270],
];
/** 橙点轨道半径（12 点）。上游 `boot-tracks.ts:301-314` */
export const SCAN_ORBIT_RADIUS: readonly Key[] = [
  [487, 270],
  [495, 236],
  [500, 224],
  [505, 214],
  [510, 206],
  [515, 199],
  [520, 193],
  [530, 185],
  [540, 179.5],
  [550, 174.5],
  [560, 171.5],
  [568, 169],
];
/** 橙点半径（7 点）。上游 `boot-tracks.ts:315-323` */
export const SCAN_ORBIT_DOT_RADIUS: readonly Key[] = [
  [487, 0],
  [492, 1],
  [500, 5.6],
  [510, 7],
  [520, 7.8],
  [530, 8],
  [568, 8],
];
/** 黑/白弧端圆点半径（各 9 点）。上游 `boot-tracks.ts:324-345` */
export const SCAN_BLACK_CAP: readonly Key[] = [
  [487, 45],
  [504, 35],
  [510, 20],
  [515, 10],
  [520, 5],
  [525, 2.5],
  [535, 2],
  [550, 0],
  [568, 0],
];
export const SCAN_WHITE_CAP: readonly Key[] = [
  [487, 40],
  [492, 30],
  [497, 22],
  [502, 16],
  [507, 10],
  [512, 5],
  [520, 1.5],
  [540, 0],
  [568, 0],
];

/**
 * 两侧小圆：26 行 × 9 列（帧 543–568）。
 * 列序：左心x 左心y 右心x 右心y 半径 左起始° 右起始° 左弧长° 右弧长°
 * 角度是**展开值**（跨 360° 不折返）。上游 `boot-orbit-tracks.ts:8-56`。
 */
export const SCAN_SIDES = [
  [543, 827.5, 561, 1091, 518, 38.7, 260, 250, 0, 0],
  [544, 827.5, 561, 1091, 518, 38.7, 260, 250, 3, 3],
  [545, 827.5, 560.5, 1091, 518.5, 38.6, 265, 236, 17, 17],
  [546, 827.5, 559.5, 1091, 519.5, 38.5, 274, 190, 44, 44],
  [547, 827.6, 558.2, 1090.6, 520.8, 38.5, 296, 121, 79, 81],
  [548, 828.06, 556.76, 1090.35, 522.58, 38.38, 332.38, 50.99, 111.73, 113.42],
  [549, 827.84, 555.13, 1090.42, 524.39, 38.34, 367.27, -14.03, 141.56, 145.66],
  [550, 827.89, 553.28, 1090.2, 525.89, 38.44, 396.14, -68.97, 168.88, 172.89],
  [551, 828, 551.68, 1090.21, 527.44, 38.28, 421.62, -113.84, 191.68, 195.3],
  [552, 828.19, 550.24, 1089.94, 528.85, 38.25, 444.24, -152.25, 208.55, 215.7],
  [553, 828.42, 548.83, 1089.7, 530.24, 38.18, 462.76, -184.19, 225.92, 230.73],
  [554, 828.61, 547.64, 1089.53, 531.44, 38.12, 479.15, -212.29, 239.9, 244.63],
  [555, 828.8, 546.47, 1089.37, 532.55, 38.03, 494.23, -237.06, 251.56, 257.75],
  [556, 829.06, 545.41, 1089.16, 533.53, 37.91, 508.57, -259.19, 261.49, 267.63],
  [557, 829.25, 544.49, 1088.93, 534.52, 37.87, 520.46, -279.2, 271.23, 278.42],
  [558, 829.47, 543.66, 1088.7, 535.37, 37.79, 530.39, -295.86, 280.34, 286.17],
  [559, 829.75, 542.88, 1088.46, 536.12, 37.72, 541.33, -312.5, 287.17, 295.12],
  [560, 829.95, 542.16, 1088.26, 536.88, 37.65, 549.47, -326.37, 295.98, 301.16],
  [561, 830.16, 541.63, 1088.02, 537.41, 37.57, 557.82, -338.78, 302.29, 307.52],
  [562, 830.33, 541.08, 1087.81, 537.94, 37.52, 565.1, -350.74, 307.99, 312.58],
  [563, 830.59, 540.65, 1087.61, 538.36, 37.43, 571.89, -362.08, 313.78, 319.28],
  [564, 830.83, 540.28, 1087.38, 538.74, 37.37, 578.93, -371.93, 316.97, 323.53],
  [565, 831.04, 539.97, 1087.14, 539.04, 37.35, 583.85, -380.51, 322.27, 327.78],
  [566, 831.25, 539.74, 1086.93, 539.28, 37.27, 589.84, -388.93, 325.61, 331.62],
  [567, 831.48, 539.56, 1086.73, 539.4, 37.19, 594, -396.5, 330.93, 335.92],
  [568, 831.61, 539.51, 1086.55, 539.48, 37.15, 599.44, -403.94, 332.25, 338.7],
] as const;
export const SCAN_SIDES_START_FRAME = 543;
export const SCAN_SIDES_VISIBLE_FRAME = 544;

/** 六颗卫星点的轨道采样（8 点，帧 : x y）——相位与半径由它算出。上游 `boot-orbit-tracks.ts:60-75` */
export const SATELLITE_ORBIT = [
  [548, 926.33, 554.33],
  [551, 944.38, 572.15],
  [553, 954.92, 575.05],
  [555, 963, 575],
  [558, 971.63, 572.85],
  [561, 977.53, 569.78],
  [564, 981.5, 566.86],
  [568, 984.71, 563.5],
] as const;
/** 卫星点绕行中心（与中央大点同心）。上游 `boot-orbit-tracks.ts:143-144` */
export const SATELLITE_CENTER: readonly [number, number] = [959.5, 539.5];
export const SATELLITE_COUNT = 6;
export const SATELLITE_START_FRAME = 548;
export const SATELLITE_STEP_FRAMES = 3;
/** 相位角（弧度）：atan2(y − 539.5, x − 959.5)。上游 `:70-72` */
export const SATELLITE_PHASE: readonly Key[] = SATELLITE_ORBIT.map(
  ([f, x, y]) => [f, Math.atan2(y - SATELLITE_CENTER[1], x - SATELLITE_CENTER[0])] as const,
);
/** 轨道半径：hypot(x − 959.5, y − 539.5) ≈ 36.33 → 34.81 px。上游 `:73-75` */
export const SATELLITE_DISTANCE: readonly Key[] = SATELLITE_ORBIT.map(
  ([f, x, y]) => [f, Math.hypot(x - SATELLITE_CENTER[0], y - SATELLITE_CENTER[1])] as const,
);
/** 单颗卫星的生长曲线（局部帧 −1…20，每 3 帧进一颗）。上游 `boot-orbit-tracks.ts:76-88` */
export const SATELLITE_GROWTH: readonly Key[] = [
  [-1, 0],
  [0, 0.8],
  [1, 1.7],
  [2, 2.35],
  [3, 2.85],
  [4, 3.15],
  [5, 3.45],
  [7, 3.8],
  [10, 4.1],
  [15, 4.25],
  [20, 4.25],
];

/** 中央大点：闪变帧用 42.93→42.43，其余用生长表。上游 `boot-orbit-tracks.ts:96-120` */
export const CORE_FLASH_FRAMES = [546, 547, 549, 550] as const;
export const CORE_FLASH: readonly Key[] = [
  [546, 42.93],
  [550, 42.43],
];
export const CORE_GROWTH: readonly Key[] = [
  [545, 0],
  [548, 7.96],
  [551, 9.89],
  [553, 10.63],
  [555, 11.08],
  [559, 11.45],
  [564, 11.45],
  [568, 11.27],
];

/* ── WELCOME 段（569–673 帧）+ 退场 + 背景漂移 ─────────────────────────── */

/** `welcomeVisible`：22.76 ≤ t < 26.92。上游 `boot-motion.ts:121` */
export const WELCOME_FIRST_FRAME = 569;
export const WELCOME_LAST_FRAME = 672;
/** 7 帧黑白闪切（569–575）。上游 `boot-motion.ts:52,122-127` */
export const WELCOME_FLASH_FRAMES = [569, 570, 571, 572, 573, 574, 575] as const;
export const WELCOME_PANEL = [1, 0, 0.28, 0, 1, 0, 0] as const;
export const WELCOME_INK = [0, 0, 0.2, 1, 0, 0, 0.25] as const;
/** 公司名可见性：f ≥ 588 且不在 590/591；遮罩帧 594/595。上游 `boot-motion.ts:128-129` */
export const COMPANY_FIRST_FRAME = 588;
export const COMPANY_HIDDEN_FRAMES = [590, 591] as const;
export const COMPANY_MASK_FRAMES = [594, 595] as const;
export const COMPANY_MASK_OPACITY = 0.65;
export const COMPANY_MASK_INK_OPACITY = 0.06;
/** 黑底横扫宽度：22 点（**报告写 23 点，代码是 22**）。上游 `boot-tracks.ts:60-85` */
export const COMPANY_HIGHLIGHT: readonly Key[] = [
  [588, 4],
  [589, 39],
  [592, 225],
  [593, 261],
  [594, 288],
  [595, 310],
  [596, 328],
  [597, 343],
  [598, 356],
  [599, 366],
  [600, 375],
  [601, 382],
  [602, 389],
  [603, 394],
  [604, 398],
  [605, 402],
  [606, 405],
  [607, 407],
  [608, 408],
  [609, 409],
  [610, 410],
  [611, 410],
];
export const COMPANY_HIGHLIGHT_FULL = 410;
/** `INTERNAL DATABASE` 落定：f < 626 或 628/629/631/634 帧为 0。上游 `boot-motion.ts:131` */
export const DATABASE_FIRST_FRAME = 626;
export const DATABASE_OFF_FRAMES = [628, 629, 631, 634] as const;
/** 退场 smoothstep 区间（秒）：26.56 → 26.92 = 帧 664 → 673。上游 `boot-motion.ts:54,133-135` */
export const EXIT_T = [26.56, 26.92] as const;
/** 白场区间（秒）：26.16 → 26.88 = 帧 654 → 672。上游 `boot-motion.ts:138` */
export const WHITE_T = [26.16, 26.88] as const;
/** 退场滤镜系数。上游 `boot.ts:174-175` */
export const EXIT_FILTER = { scale: 0.46, blur: 8, invert: 0.22, saturate: 5, hue: 115 } as const;
/** 背景漂移：translate(sin(t·0.16)·18, −(t−6)·5) scale(1.08)。上游 `boot.ts:193-194` */
export const BACKGROUND_DRIFT = { amplitude: 18, rate: 0.16, fall: 5, offset: 6, scale: 1.08 } as const;
/** 白场与退场用秒算 —— 与上游一致（`progress(t, a, b)` 吃的是秒，不是帧） */
export const tAt = (frame: number): number => frame / FPS;

/* ── `typed()` 的等价公式（照语义重写，不用上游的 slice） ──────────────── */

/** 上游 `boot-motion.ts:9-18`：某帧应显示多少字 */
export function typedCount(frame: number, start: number, end: number, len: number): number {
  if (frame < start) return 0;
  return Math.min(len, 1 + Math.floor(((frame - start) * (len - 1)) / (end - start)));
}

/** 逐字表：每个字首次出现的帧（给逐字 span 的 `--d` 用） */
export function typedSpans(
  text: string,
  start: number,
  end: number,
): { ch: string; frame: number }[] {
  const out: { ch: string; frame: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    let frame = start;
    while (frame <= end && typedCount(frame, start, end, text.length) < i + 1) frame++;
    out.push({ ch: text[i], frame });
  }
  return out;
}

/** 省略号：f ≥ dotsStart 后每 4 帧加一个点，最多 3 个。上游 `boot-motion.ts:44-45` */
export function authDotFrames(): number[] {
  const { dotsStart, dotsStep, dotsMax } = AUTH;
  return Array.from({ length: dotsMax }, (_, i) => dotsStart + i * dotsStep);
}

/**
 * ACCESS 段的逐字表：由**逐帧字数表**反推每个字的首次出现帧。
 * 上游是 `text.slice(0, count)`，我们是逐字 span —— 等价，且字数表里"一帧跳 2–3 个字"的节奏被完整保留
 * （所以**不能**用 §4.5 那条 typed() 公式替代：两者在这 18 个停点上不一样）。
 */
export function accessSpans(text: string): { ch: string; frame: number }[] {
  const out: { ch: string; frame: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    let k = 0;
    while (k < ACCESS_COUNTS.length && ACCESS_COUNTS[k] < i + 1) k++;
    out.push({ ch: text[i], frame: ACCESS_START_FRAME + Math.min(k, ACCESS_COUNTS.length - 1) });
  }
  return out;
}

/* ── 上游 `boot.ts` 里"每帧算出来"的量，这里改成纯函数（构建期求值） ────── */

/**
 * Logo 轮廓的 dash 两件套：`length = clamp(0..1)(end − start)`、`offset = −start`。
 * 420 帧后缺口沿轮廓移动：`start = cut + 0.0275`、`end = cut + 1`。
 * 上游 `boot-logo-tracks.ts:96-103`、`boot.ts:138-139`。
 */
export function logoDash(frame: number): { length: number; offset: number } {
  const cut = track(LOGO_CUT, frame);
  const start = frame < 420 ? track(LOGO_DRAW.map(([f, s]) => [f, s] as const), frame) : cut + 0.0275;
  const end = frame < 420 ? track(LOGO_DRAW.map(([f, , e]) => [f, e] as const), frame) : cut + 1;
  return { length: Math.max(0, Math.min(1, end - start)), offset: -start };
}

/** 中央大点半径（闪变帧走另一张表）。上游 `boot-orbit-tracks.ts:96-120` */
export function coreRadius(frame: number): number {
  return at(Math.floor(frame + 0.00001), CORE_FLASH_FRAMES)
    ? track(CORE_FLASH, frame)
    : track(CORE_GROWTH, frame);
}

/** 退场 smoothstep 0→1。上游 `boot-motion.ts:54` */
export const exitAt = (frame: number): number =>
  smooth(progress(tAt(frame), EXIT_T[0], EXIT_T[1]));
/** 白场 smoothstep 0→1。上游 `boot-motion.ts:138` */
export const whiteAt = (frame: number): number =>
  smooth(progress(tAt(frame), WHITE_T[0], WHITE_T[1]));
