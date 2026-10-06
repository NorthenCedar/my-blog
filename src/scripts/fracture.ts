/* =============================================================================
 * 装置「裂痕 FRACTURE」（404 页）—— 内页**第十台**装置
 *
 * ★ 名字不是新造的：它本来就在 `rl-core.ts` 头部那份**最初的十台装置命名表**里
 *   （归档卷尺 / 关于亲笔 / 阅读尺 / 浮游 / 走时仪 / 准星 / 墨滴 / 星座 / **裂痕**），
 *   状态与「走时仪」「准星」当初一样：有名字、没规格、没实现。
 *   ⚠ 序号只能从**源码与 git log** 读，别从 spec 推：spec 里「墨滴」连章节都没有，
 *     光读文档会把第十台数成第八台（准星那轮就栽过一次）。
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ── 第二版（2026-10-06）：**行为模型整个反过来** ────────────────────────────
 *
 * 站主原话：
 *   「裂纹不是跟着鼠标跑，而是本来就在上面（类似于在下面的图层），
 *     鼠标到那上面裂痕随着线有顿挫的显现了」
 *   「我要真实的玻璃碎裂的感觉」「裂纹用半透明的线，别用绿线」
 *
 * ⇒ 第一版是「**鼠标生成**」：指针划到哪，就在那里现生一条裂纹，然后从光标向外长。
 *   现在改成「**预置网络 + 沿线揭示**」：
 *     · 页面一进来，整张**固定**的裂纹网已经铺在文档上了
 *       （种子写死 ⇒ 同一个长宽下，每次打开逐点相同，可验收）
 *     · 指针的职责从"起点"变成"**揭示器**"：碰到哪一段，那条裂纹就从那儿
 *       向两端**一段一段跳着**显现 —— 段与段之间有停顿，就是站主要的「顿挫」
 *     · 离手之后它不回头，继续把这条走完
 *
 * ★ 为什么这个模型更对（不是"换个说法"）：真实玻璃是**先有裂、后有光**。
 *   第一版里裂纹路径由光标轨迹决定 ⇒ 同一条线你划两次，得到的是**两条不同的裂** ——
 *   读起来是"鼠标在画线"。预置之后，路径是**玻璃自己的**，指针只是让它显形：
 *   同一处再碰一次，它接着**原来那条**继续展开，不会长出新的随机分支。
 *
 * ── 形态：按真实冲击碎裂的定式来（站主要"真实的玻璃碎裂的感觉"）──────────
 *   玻璃是脆性材料，被砸出来的形貌有定式，三条：
 *     ① **放射裂纹**（radial）：从冲击点向外辐射，且是**近直线** —— 脆性断裂沿最大拉应力
 *        方向直着走，几乎不弯。⚠ 第一版的 `JITTER 0.17 rad/段` 是"撕裂/爬行"的语言，
 *        不是玻璃的语言（那是软材料、撕裂口的样子）。这里 `CURVE 0.028 rad/段`：
 *        16px 一段 ⇒ 曲率半径 ≈ 570px，肉眼就是直线，但不是数学直线。
 *     ② **同心环裂纹**（concentric）：离冲击点一定半径处出现一圈或多圈，与放射线**近似垂直**。
 *        ★ 真实玻璃的环**不是圆** —— 是**多边形**，边数由应力波模数决定（这里按弧长取顶点，
 *        `RING_SEG = 16` px 一个），所以它读起来是"折线围成的一圈"而不是"画了个圈"。
 *     ③ **分叉**：放射线走到差不多一半，以**小角度**（11°~24°）分出支线，
 *        支线再分一次就停（细 Y 型）。⚠ 第一版是 `SPREAD 0.45rad ± 26°~52°` 的大拐弯，
 *        那是"树枝"不是"玻璃"。
 *   冲击点 5 个：**1 个主爆点 + 4 个次级点**（站主 2026-10-06 拍板「冲击点组」）——
 *   铺得开，指针随便移到哪儿都能碰到裂纹；又有"被砸过几下"的轻重差别。
 *
 * ── 颜色：半透明的**中性**线（站主原话「别用绿线」）──────────────────────
 *   第一版用的是 `--accent`(绿) @60%（`#2d7d4699`）—— 站上其余装置都是绿的，
 *   当时顺手沿用了。但**玻璃裂纹不是绿的**：它是纸面上的一道**暗缝**（比纸白暗、
 *   不带色相）。改成 `--ink`(#1a1a1a) 压 alpha：主线 22% / 柔光 8% / 未揭示的底 5%。
 *   ★ 三道各自一个 token（都在 `tokens.css`，这里只留 `--ink` 一个字面兜底）。
 *
 * ── 三条分野（两条跟着改，一条不变）──────────────────────────────────────
 *   ① **唯一一台指针离开之后还在继续**的装置 —— **保留**。只是"继续做的事"
 *      从"接着长"变成"把已经开始揭示的那条走完"。其余九台指针一停画面就停。
 *   ② **唯一一台几何受 DOM 文字盒约束**的装置 —— **保留，但时点变了**：
 *      从"生长时逐段问"改成"**建网时**就绕开"（网只生成一次）。
 *      ⚠ 代价写明白：文字盒一变（resize / 字体加载 / 换行）就只能**重建整张网**，
 *        重建会丢掉已揭示的状态。resize 是低频操作，取这个取舍（见 `resize` 段）。
 *   ③ **唯一一台挂在文档坐标系**上的装置 —— **不变**。要与文字盒保持相对关系，
 *      而文字随滚动走；挂视口的话滚一下"绕开"就全错位了。
 *
 * ── 三条"不做"（第一条措辞本轮改过，另两条不变）──────────────────────────
 *   · **不做点击砸碎**：站主说的是「鼠标**划过**」。划过 = 运动；揭示也是运动触发的。
 *   · **不做愈合式淡出**：真玻璃裂了不愈合。已揭示的就是永久的（"甲档"语义保留，
 *     只是现在不需要"封顶淘汰"了 —— 总量是建网时定死的，不会越碰越多）。
 *   · **不引入不可复现的随机**：本站硬规矩 —— 形状不许用 `Math.random`。
 *     这里用**固定种子**的 mulberry32：形状逐点可复现。
 *     连"顿挫的不匀"也走它 ⇒ **连节奏都可复现**（同一个长宽 ⇒ 同一次跳动序列）。
 *
 * ── 降级（两条，都是"不装"而不是"装个弱的"）────────────────────────────
 *   · `hover:none`（触屏）：本装置要"指针划过"，触屏上没有"划"这件事。
 *   · `prefers-reduced-motion`：本装置**没有最终态可落** —— 它的产物就是"指针划过的
 *     痕迹"，静止用户既没划过、也不该被一段自己会跳的动效打扰。
 *     （对照：显影板/星座的 RM 档是"一次画完的静态图"，那是因为它们有静态产物。）
 * ============================================================================= */
import { createActivityGate, prefersReducedMotion, shouldAnimate, startLoop } from './rl-core';

/* ★ 包在 IIFE 里 —— 顶层不许 `return`（ES 模块），而本台要一串不满足条件就退出。
   站上其余带降级链的装置（星座 / 准星 / 显影板）都是这个写法。 */
(() => {
  /* ---------- 只装在该装的地方 ---------- */
  const cv = document.querySelector<HTMLCanvasElement>('canvas[data-fracture]');
  if (!cv) return;
  if (!matchMedia('(hover: hover)').matches) return;
  if (!shouldAnimate(prefersReducedMotion())) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  /* ---------- 取色：颜色只许住在 tokens.css ---------- */
  const CS = getComputedStyle(document.documentElement);
  const INK = CS.getPropertyValue('--ink').trim() || '#1a1a1a';
  /* 三道裂纹色都在 tokens.css 里（那里写着"为什么是中性灰而不是绿"）。
     脚本侧**只留一个字面兜底**，alpha 靠拼后缀派生 —— 不把 8 位 hex 整条复制一遍：
     那样改 token 就得记得来改脚本，迟早会对不上（tokens 那轮踩过）。 */
  const LINE = CS.getPropertyValue('--deco-fracture-line').trim() || INK + '38'; // --ink @ 22%
  const GLOW = CS.getPropertyValue('--deco-fracture-glow').trim() || INK + '14'; // --ink @ 8%
  const GHOST = CS.getPropertyValue('--deco-fracture-ghost').trim() || INK + '0d'; // --ink @ 5%
  /* ★★ 未揭示的那层**必须离屏一次合成**（见 `paintGhost`），不能逐段直接描边。
     理由不是性能，是**正确性**：冲击点附近有 20 多条放射线共用起点，逐段描边的话
     同一个像素会被叠十几次 ⇒ α 累积成一片**肉眼可见的灰团**。
     实测（`_probe/_404-lab.mjs`）：token 写的是 5%（α 13），而画面上峰值 **α 99**，
     合成到纸白是"比纸白暗 87 级"—— 那就完全不是"极淡的底"了。
     离屏 = 先在**不透明**层上把所有线画成实心，再**整层**用这个 alpha 贴回来
     ⇒ 任何重叠都只算一次，浓度由 token 说了算。 */
  const GHOST_A = (() => {
    const m = /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})$/.exec(GHOST);
    return m ? parseInt(m[1], 16) / 255 : 0.05;
  })();

  /* ---------- 参量 ---------- */
  const SEED = 20261006; // ★ 形状种子：写死 ⇒ 同一个长宽下网络逐点相同
  const SEG = 16; // 段长（px）。它同时是**几何分辨率**与**顿挫的"一格"**
  const DWELL = 76; // 每跳一格的基准停顿（ms）—— ★ "顿挫"就是它，见 advance()
  const CURVE = 0.028; // 每段转角抖动（rad）：16px/段 ⇒ 曲率半径 ≈ 570px（近直线）
  const REVEAL_R = 44; // 指针离裂纹多近算"碰到"（px）
  const PAD = 9; // 文字盒外扩（px）：**顶点**与文字的安全距离
  const RECT_LIMIT = 80; // 文字盒上限（超了只取前若干个，防病态页面拖死建网）
  const TURN_DEG = [8, 16, 25, 36]; // 建网时撞上文字盒的试探角（度），先小后大
  const RING_SEG = 16; // 环裂纹的顶点间距（px）—— 决定"多边形"的边数
  const BRANCH_P = 0.2; // 每段分叉的概率
  const BRANCH_AT = 0.35; // 走到剩余这么长之后才开始允许分叉（免得根部炸毛）
  const BRANCH_DEG = [11, 24]; // 分叉角范围（度）★ 小角度 = 细 Y 型，不是树枝
  const BRANCH_DECAY = [0.42, 0.66]; // 支线长度 / 母枝剩余
  const BRANCH_DEPTH = 2; // 允许的分叉层数（真玻璃越往外越分叉）

  /* 冲击点组：1 个主爆点 + 4 个次级点（站主拍板）。
     位置写成**文档比例**，这样换长宽也能铺开。
     ⚠ 主爆点刻意放在偏上（fy 0.20）：向下辐射时会**穿过正文文字盒再绕开**，
       那个"裂到字边就拐"的观感是本页最好看的一处。
     ★★ 密度是**出图之后**调上来的（2026-10-06 第二版首版图 `_probe/_404/fig-only.png`）：
        首版是主爆点 22 条射线 + 3 圈环，铺开之后**像星芒多过像碎玻璃** ——
        射线又直又长又均匀、环太少、几乎没有分叉。真玻璃的碎裂是**放射 + 多圈环**织成的网，
        越往外越分叉、长度差异很大。
        而且实测撞到一个真实的**可用性**问题：一斜线划过去只碰到 1-2 条裂纹
        （那条线恰好与主爆点 230px 半径的圆**相切**）⇒ 「划到哪都能碰到」是要靠**密度**保证的，
        不是靠鼠标运气。⇒ 射线 22→28、环 3→5 圈、分叉层数 1→2、长度差异拉大一倍。 */
  const MAIN = { fx: 0.5, fy: 0.2, rays: 28, rings: [0.16, 0.3, 0.44, 0.6, 0.78], reachW: 0.46, reachH: 0.4 };
  const SUBS = [
    { fx: 0.16, fy: 0.32, rays: 15, rings: [0.24, 0.46, 0.7], reachW: 0.26, reachH: 0.24 },
    { fx: 0.84, fy: 0.12, rays: 15, rings: [0.22, 0.44, 0.68], reachW: 0.26, reachH: 0.24 },
    { fx: 0.2, fy: 0.74, rays: 16, rings: [0.24, 0.48, 0.72], reachW: 0.26, reachH: 0.24 },
    { fx: 0.8, fy: 0.86, rays: 15, rings: [0.22, 0.46, 0.7], reachW: 0.26, reachH: 0.24 },
  ];

  /* ---------- 类型 ---------- */
  interface Rect {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }
  /** 一条**预置**裂纹（一段折线）。揭示状态就两个游标：`[i, j)` 是已显现的**段**区间。
   *  ★ 为什么用"段游标"而不是"弧长浮点"：顿挫的粒度本来就是**一格一段** ——
   *    用整数段，跳跃边界天然对齐顶点，不会出现"显现到半段"的中间态。
   *  ★ 未揭示 = `i === segs && j === 0`（区间为空），不是加一个 `hit` 布尔：
   *    少一个状态就少一处能对不上的地方（判据 `i < j` 一个式子收口）。 */
  interface Crack {
    pts: number[]; // 平坦顶点数组 [x,y,x,y,…]
    segs: number; // 段数 = pts.length/2 - 1
    bx0: number; // bbox（revealAt 的粗筛 + draw 的视口裁剪都靠它）
    by0: number;
    bx1: number;
    by1: number;
    i: number; // 已显现区间的左端（段索引，含）；未揭示时 = segs
    j: number; // 右端（不含）；未揭示时 = 0
    acc: number; // 顿挫计时器（ms）
    dwell: number; // **这一跳**的停顿 —— 每跳完一次重算，见 advance()
    rnd: () => number; // 这条裂纹自己的 PRNG（决定它跳动的"不匀"）
  }

  /** 确定性 PRNG（mulberry32）。★ 同一个 seed ⇒ 同一张网络、同一次跳动序列。 */
  function mulberry32(a: number): () => number {
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 尺寸：**文档**坐标系（见文件头分野 ③） ---------- */
  let W = 0;
  let H = 0;
  /* 未揭示那层的离屏画布（与主画布同像素尺寸；见 GHOST_A 的注释） */
  let off: HTMLCanvasElement | null = null;
  let octx: CanvasRenderingContext2D | null = null;
  function fit() {
    const w = document.documentElement.clientWidth;
    /* ⚠ 高度必须取**文档高**并且**写回 canvas.style.height**：
       绝对定位元素的 `height:100%` 只解析到**视口**高（包含块是初始包含块），
       文档比视口长时下半页就没有画布了 —— 表现为"滚下去裂纹全没了"。 */
    const h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    cv.width = pw;
    cv.height = ph;
    W = w;
    H = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!off) {
      off = document.createElement('canvas');
      octx = off.getContext('2d');
    }
    /* ★ 设置 width/height 会清空离屏画布，所以 `paintGhost()` 必须在**这之后**跑 */
    off.width = pw;
    off.height = ph;
    if (octx) octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- 「绕开文字」：把正文的文字盒量出来 ----------
     ★ 用 Range 逐**文本节点**取框，而不是取元素框：
       元素框会把整段版心都算进去（`.prose` 有一行字也算整块），那样"绕开"会变成
       "半个页面都不许裂"；而 Range 的 `getClientRects()` 给的是**逐行**的紧盒。
     ★ 一律用**文档**坐标（clientRect + scrollX/Y）—— 与裂纹同一坐标系。 */
  function textRects(): Rect[] {
    const out: Rect[] = [];
    const sx = window.scrollX;
    const sy = window.scrollY;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if (!(n.nodeValue || '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const boxes = range.getClientRects();
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.width < 2 || b.height < 2) continue;
        out.push({ x0: b.left + sx, y0: b.top + sy, x1: b.right + sx, y1: b.bottom + sy });
        if (out.length >= RECT_LIMIT) return out;
      }
    }
    return out;
  }

  let rects: Rect[] = [];
  const blocked = (x: number, y: number): boolean => {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x > r.x0 - PAD && x < r.x1 + PAD && y > r.y0 - PAD && y < r.y1 + PAD) return true;
    }
    return false;
  };

  /* ★★ 只测**落点**是不够的：两端都在文字盒外的一段直线，仍可能从盒角**切过去**
     （凸区域也有这个性质：盒外左下与盒外右上的两点，连线会穿过盒子的角）。
     ⇒ 沿段再取 3 个内点（1/4、1/2、3/4）。SEG=16px ⇒ 采样间隔 4px，
       小于最小文字盒宽度（实测 ≥ 2px）⇒ 穿不过去。
     ★ PAD 管的是**顶点**：可见墨迹还要加上描边半宽（主线 1px + 柔光 3px，圆头
       ⇒ 朝盒方向多出 1.5px）⇒ **可见间隙 ≈ PAD − 1.5 ≈ 7.5px**，不是 9px。
       验收时别拿"外扩 9px 那条带里必须 0 墨"当判据 —— 顶点贴在边界上时柔光必然跨线，
       那条判据**从构造上永远不成立**。要量的是"墨离字形盒最近多少 px"。 */
  const segBlocked = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (blocked(x1, y1)) return true;
    for (const f of [0.25, 0.5, 0.75]) {
      if (blocked(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return true;
    }
    return false;
  };

  /* ---------- 随机数：建网期间共享一个（保证"调用顺序 ⇒ 形状"是确定的） ---------- */
  let seed = SEED;
  let rnd: () => number = mulberry32(SEED);

  /* ---------- 建网（只做一次；resize 时整个重来） ---------- */
  const cracks: Crack[] = [];

  function pushCrack(pts: number[]) {
    const segs = pts.length / 2 - 1;
    if (segs < 2) return; // 一个顶点或更少 = 画不出东西
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (let k = 0; k < pts.length; k += 2) {
      const px = pts[k];
      const py = pts[k + 1];
      if (px < bx0) bx0 = px;
      if (px > bx1) bx1 = px;
      if (py < by0) by0 = py;
      if (py > by1) by1 = py;
    }
    cracks.push({
      pts,
      segs,
      bx0,
      by0,
      bx1,
      by1,
      i: segs, // ★ 未揭示：i = segs、j = 0 ⇒ 区间 [segs,0) 为空
      j: 0,
      acc: 0,
      dwell: DWELL,
      rnd: mulberry32((seed = (seed * 1664525 + 1013904223) >>> 0)),
    });
  }

  /** 一条**放射裂纹**：近直线向外走，撞文字盒先小角度偏转、全不行就**截断**
   *  （这就是建网期的"绕开"）。`depth` 允许的分叉层数。 */
  function ray(x0: number, y0: number, a0: number, len: number, depth: number) {
    const pts: number[] = [x0, y0];
    let x = x0;
    let y = y0;
    let ang = a0;
    let left = len;
    while (left > SEG) {
      const nx = x + Math.cos(ang) * SEG;
      const ny = y + Math.sin(ang) * SEG;
      if (segBlocked(x, y, nx, ny)) {
        /* 撞上了：按"先近角后远角、两边都试"的顺序找个能走的朝向 */
        let turned = false;
        for (const deg of TURN_DEG) {
          for (const s of [1, -1]) {
            const na = ang + (s * deg * Math.PI) / 180;
            const tx = x + Math.cos(na) * SEG;
            const ty = y + Math.sin(na) * SEG;
            if (!segBlocked(x, y, tx, ty)) {
              ang = na;
              turned = true;
              break;
            }
          }
          if (turned) break;
        }
        if (!turned) break; // 无路可走 ⇒ 截断（不硬穿）
        continue; // 转向之后本段不落笔，下一轮用新角度走
      }
      pts.push(nx, ny);
      x = nx;
      y = ny;
      left -= SEG;
      /* ★ 极小曲率 —— 玻璃裂纹是近直线（见文件头"形态 ①"） */
      ang += (rnd() * 2 - 1) * CURVE;
      /* 小角度分叉（细 Y 型），且**只分一次** */
      if (depth > 0 && left > len * BRANCH_AT && rnd() < BRANCH_P) {
        const side = rnd() < 0.5 ? -1 : 1;
        const span = BRANCH_DEG[1] - BRANCH_DEG[0];
        const ba = ang + side * (((BRANCH_DEG[0] + rnd() * span) * Math.PI) / 180);
        const dec = BRANCH_DECAY[0] + rnd() * (BRANCH_DECAY[1] - BRANCH_DECAY[0]);
        ray(x, y, ba, left * dec, depth - 1);
      }
    }
    if (pts.length >= 6) pushCrack(pts);
  }

  /** 一圈**同心环裂纹**：多边形（不是圆），撞文字盒就**断开**成多段 ——
   *  真玻璃的环遇到障碍也是断的，不是绕过去。 */

  function ring(cx: number, cy: number, r: number) {
    const n = Math.max(14, Math.round((2 * Math.PI * r) / RING_SEG));
    const a0 = rnd() * Math.PI * 2;
    let pts: number[] = [];
    for (let k = 0; k <= n; k++) {
      const a = a0 + (k / n) * Math.PI * 2;
      const rr = r * (0.94 + rnd() * 0.12); // 半径 ±6% ⇒ 不是正多边形
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      /* ★★ 顶点与**线段**都要检查 —— 只测顶点是不够的（放射线那轮踩过、环这轮又踩了一次）：
         两个都在盒外的顶点，连成的那一段照样能从盒子边上**擦过去**。
         实测证据（`_probe/_404-lab.mjs` 第二版首跑）：环只测顶点时
         「墨离字形盒最近 **4.35px**」（PAD=9 应当给到 ≥6px），
         修成整段检查后回到阈值以上。 */
      const bad =
        blocked(x, y) ||
        (pts.length >= 2 && segBlocked(pts[pts.length - 2], pts[pts.length - 1], x, y));
      if (bad) {
        if (pts.length >= 6) pushCrack(pts);
        pts = [];
        continue;
      }
      pts.push(x, y);
    }
    if (pts.length >= 6) pushCrack(pts);
  }

  /** 一个冲击点：放射 + 同心环 + 中心粉碎区。 */
  function impact(cx: number, cy: number, reach: number, rays: number, rings: number[]) {
    /* 冲击点若正落在文字盒上，先把它挪出去（否则所有放射线一出发就被截断）。 */
    if (blocked(cx, cy)) {
      let moved = false;
      for (let k = 1; k <= 24 && !moved; k++) {
        for (const [dx, dy] of [
          [0, -k * 34],
          [0, k * 34],
          [-k * 40, 0],
          [k * 40, 0],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 40 || ny < 40 || nx > W - 40 || ny > H - 40) continue;
          if (!blocked(nx, ny)) {
            cx = nx;
            cy = ny;
            moved = true;
            break;
          }
        }
      }
    }
    /* ① 中心粉碎区：几根很短的碎线（真实冲击点有一小片粉碎区） */
    for (let k = 0; k < 6; k++) {
      const a = rnd() * Math.PI * 2;
      ray(cx + (rnd() - 0.5) * 16, cy + (rnd() - 0.5) * 16, a, reach * 0.12, 0);
    }
    /* ② 放射线：角度均匀铺开 + 抖动（免得出现机械的"米字"）。
       ★ 长度取 reach 的 0.35~1.60 倍 —— **差异要大**：真玻璃的放射线长短差得很远，
         首版用 0.55~1.40 倍，出图后看着像"等长的星芒"。 */
    const a0 = rnd() * Math.PI * 2;
    const span = (Math.PI * 2) / rays;
    for (let k = 0; k < rays; k++) {
      const a = a0 + k * span + (rnd() - 0.5) * span * 0.7;
      ray(cx, cy, a, reach * (0.35 + rnd() * 1.25), BRANCH_DEPTH);
    }
    /* ③ 同心环 */
    for (const s of rings) ring(cx, cy, reach * s);
  }

  /** 把**整张网**实心画到离屏画布上 —— 这是"未揭示的底"。
   *  ★ 一次合成，而不是每帧逐段描边：见 `GHOST_A` 的注释（密集处会叠成灰团）。
   *  ★ 只在建网后画一次；它不随揭示变化，之后每帧只 blit。 */
  function paintGhost() {
    if (!octx) return;
    octx.clearRect(0, 0, W, H);
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    octx.beginPath();
    for (const c of cracks) {
      octx.moveTo(c.pts[0], c.pts[1]);
      for (let k = 2; k < c.pts.length; k += 2) octx.lineTo(c.pts[k], c.pts[k + 1]);
    }
    /* 实心 --ink：**透明度交给整层 blit 时的 globalAlpha**（= GHOST token 的 alpha） */
    octx.strokeStyle = INK;
    octx.lineWidth = 1;
    octx.stroke();
  }

  function build() {
    cracks.length = 0;
    seed = SEED;
    rnd = mulberry32(SEED);
    /* 文字盒在**建网前**取一次 —— 网是预置的，绕开只在这一刻发生（见分野 ②） */
    rects = textRects();
    const mainReach = Math.max(W * MAIN.reachW, H * MAIN.reachH);
    impact(W * MAIN.fx, H * MAIN.fy, mainReach, MAIN.rays, MAIN.rings);
    for (const s of SUBS) {
      const reach = Math.max(W * s.reachW, H * s.reachH);
      const jx = (rnd() - 0.5) * 0.06; // 位置微抖：免得四个次级点看起来像排版出来的
      const jy = (rnd() - 0.5) * 0.06;
      impact(W * (s.fx + jx), H * (s.fy + jy), reach, s.rays, s.rings);
    }
    paintGhost(); // ★ 网定稿 ⇒ 把"底"也重画到离屏（fit 清空过它）
  }

  /* ---------- 揭示：指针碰到哪一段，就从那儿启动 ---------- */

  /** 点到线段距离（revealAt 的精筛）。 */
  function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const vx = bx - ax;
    const vy = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? (wx * vx + wy * vy) / l2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const dx = wx - vx * t;
    const dy = wy - vy * t;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function revealAt(x: number, y: number) {
    for (const c of cracks) {
      /* 已经在揭示了 ⇒ 不重开（★ 一条裂纹**同时只有一个前沿**：
         有前沿还允许重开的话，指针划过时会沿途多处同时起头，
         观感就从"这条裂被你唤醒了、自己沿路展开"退化成"跟着指针亮" ——
         那正是站主这一轮要摆脱的东西）。 */
      if (c.i < c.j) continue;
      /* 粗筛：bbox 外扩 REVEAL_R 都没碰到就不必算段距离 */
      if (x < c.bx0 - REVEAL_R || x > c.bx1 + REVEAL_R) continue;
      if (y < c.by0 - REVEAL_R || y > c.by1 + REVEAL_R) continue;
      let bestD = REVEAL_R;
      let bestI = -1;
      for (let k = 0; k < c.segs; k++) {
        const d = distSeg(x, y, c.pts[k * 2], c.pts[k * 2 + 1], c.pts[k * 2 + 2], c.pts[k * 2 + 3]);
        if (d < bestD) {
          bestD = d;
          bestI = k;
        }
      }
      if (bestI < 0) continue;
      /* 起头：指针碰到的那一段**立刻**亮（这是"碰到了"的反馈），
         之后每一跳都带停顿（见 advance）。 */
      c.i = bestI;
      c.j = bestI + 1;
      c.acc = 0;
      c.dwell = DWELL * (0.55 + c.rnd() * 1.1);
    }
  }

  /* ---------- 顿挫推进 ----------
     ★★ 站主要的那四个字「顿挫的显现」全在这个函数里：
       不是"速度 × dt 的匀速生长"，而是**攒够一次停顿就跳一格**：
         acc 攒满 dwell ⇒ 左游标 -1、右游标 +1 ⇒ 重算下一跳的 dwell
       `dwell` 每次都在 DWELL 的 0.55~1.65 倍之间重取 ⇒ 跳与跳之间的间隔**不匀**，
       这就是"啪、啪、啪"而不是"哒哒哒哒"的来源。
       ★ 它仍然是吃 dt 的（帧率无关）：acc 累加的是真实 dt，不是每帧固定一格。 */
  function advance(dtMs: number) {
    for (const c of cracks) {
      if (c.i >= c.j) continue; // 未被碰过（或区间为空）⇒ 不推进
      if (c.i === 0 && c.j === c.segs) continue; // 已经走完 ⇒ 停在那（永久）
      c.acc += dtMs;
      while (c.acc >= c.dwell) {
        c.acc -= c.dwell;
        let moved = false;
        if (c.i > 0) {
          c.i--;
          moved = true;
        }
        if (c.j < c.segs) {
          c.j++;
          moved = true;
        }
        if (!moved) break;
        c.dwell = DWELL * (0.55 + c.rnd() * 1.1);
      }
    }
  }

  /* ---------- 绘制 ---------- */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* 视口裁剪：画布是整个**文档**高，滚到页脚时首屏那些段不必每帧重画。
       上下各留 240px 余量（滚动是连续的，切太紧会在边缘闪）。 */
    const sy = window.scrollY || 0;
    const vh = window.innerHeight || H;
    const y0 = sy - 240;
    const y1 = sy + vh + 240;

    /* ① 未揭示的**底**：整层 blit（离屏已画好，见 paintGhost）。
       ★ 这里刻意**不是**逐段重画：那会在射线密集处叠十几次、把 5% 叠成肉眼可见的灰团
         （实测峰值 α99 vs token 的 α13）。一次合成 ⇒ 浓度完全由 token 说了算。 */
    if (off) {
      ctx.globalAlpha = GHOST_A;
      ctx.drawImage(off, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    /* ② 已揭示的部分：先柔光、后主线。
       玻璃裂口是一条**细亮缝**，只画一根 1px 线读起来像"铅笔划痕"；
       垫一层**宽而淡**的柔光才像玻璃开了口。
       ★ 每条裂纹单独成 path（同一条内 alpha 一致，不会自己叠自己）。 */
    for (const c of cracks) {
      if (c.i >= c.j) continue;
      if (c.by1 < y0 || c.by0 > y1) continue;
      ctx.beginPath();
      ctx.moveTo(c.pts[c.i * 2], c.pts[c.i * 2 + 1]);
      for (let k = c.i + 1; k <= c.j; k++) ctx.lineTo(c.pts[k * 2], c.pts[k * 2 + 1]);
      ctx.strokeStyle = GLOW;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /* ---------- 输入：指针划过 = 揭示 ---------- */
  window.addEventListener(
    'pointermove',
    (e) => {
      /* ★ 文档坐标（与裂纹同一坐标系，见分野 ③） */
      revealAt(e.clientX + window.scrollX, e.clientY + window.scrollY);
    },
    { passive: true },
  );

  /* ---------- 起停 ---------- */
  fit();
  build();
  draw(); // ★ 同步首帧（无头下 rAF 不推进，有它才量得到）
  cv.classList.add('is-ready');

  const gate = createActivityGate(cv);
  startLoop((dt) => {
    if (!gate.onScreen || !gate.visible) return; // 出屏 / 切标签：不推进也不画
    advance(dt);
    draw();
  });

  let rz = 0;
  window.addEventListener(
    'resize',
    () => {
      const t = Date.now();
      if (t - rz < 200) return;
      rz = t;
      /* ★ 尺寸与文字盒都变了 ⇒ **整张网重建**（分野 ② 的那个代价：
         已揭示的状态会丢）。取这个取舍是因为 resize 低频，
         而"网与文字盒错位"是每时每刻都看得见的错。 */
      fit();
      build();
      draw();
    },
    { passive: true },
  );
})();
