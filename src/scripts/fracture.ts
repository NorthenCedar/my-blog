/* =============================================================================
 * 装置「裂痕 FRACTURE」（404 页）—— 内页**第十台**装置
 *
 * ★ 名字不是我造的：它本来就在 `rl-core.ts` 头部那份**最初的十台装置命名表**里
 *   （归档卷尺 / 关于亲笔 / 阅读尺 / 浮游 / 走时仪 / 准星 / 墨滴 / 星座 / **裂痕**），
 *   状态与「走时仪」「准星」当初一样：有名字、没规格、没实现。本轮兑现它。
 *   ⚠ 序号只能从**源码与 git log** 读，别从 spec 推：spec 里「墨滴」连章节都没有，
 *     光读文档会把第十台数成第八台（准星那轮就栽过一次）。
 *
 * ── 它和其余九台的分野（三条，都是"别台做不到"而不是"别台也做了"）──────────
 *   ① **唯一一台指针离开之后还在长**的装置。其余九台读的都是"指针的当下状态"：
 *      准星读绝对坐标、星座读邻域、浮游读位置、显影板读搅动强度、墨滴读停留时长……
 *      它们只要指针不动，画面就不动。裂痕不同 —— 指针划一下就走，裂痕自己接着长几秒。
 *   ② **唯一一台几何受 DOM 文字盒约束**的装置。别的装置的形状只由画布尺寸与参数决定；
 *      这一台必须**先问正文文字在哪**，然后绕开（见下"绕开"）。
 *   ③ **唯一一台挂在文档坐标系**上的装置。其余装置都是 `position:fixed` 挂视口
 *      （视口中心 = 装置中心）；裂痕必须挂**文档**坐标 —— 因为要与文字盒保持相对关系，
 *      而文字是随滚动走的。挂视口的话，滚一下"绕开"就全错位了。
 *
 * ── 三条"不做"（克制，每条都有理由）──────────────────────────────────
 *   · **不做点击砸碎**：站主说的是「鼠标**划过**玻璃裂开」。划过 = 运动，不是点击。
 *   · **不做愈合式淡出**：真玻璃裂了不愈合（站主 2026-10-06 拍板「甲·永久累积」）。
 *     控制总量靠**封顶后淘汰最旧的一条**（同星座 `MAX_EDGES` 的口径），不靠时间衰减。
 *   · **不引入不可复现的随机**：本站硬规矩（develop 那条）——形状不许用 `Math.random`。
 *     这里用**按种子确定的 mulberry32**：同一个输入序列 ⇒ 逐点相同的几何 ⇒ 可验收。
 *
 * ── 参数（都在下面常量区，改这里就够）────────────────────────────────
 *   SPAWN_DIST 指针每走这么远才生一道新裂痕 —— 不设它，手抖也会"裂"，而且帧帧裂
 *   SPEED      裂纹前沿推进速度 ⇒ **站主要的"缓慢生长"就是这个数**（不是动画时长）
 *   MAX_CRACKS 总量封顶；超了淘汰最旧的一条，且**是淡出而不是瞬间消失**
 *
 * ── 降级（两条，都是"不装"而不是"装个弱的"）──────────────────────────
 *   · `hover:none`（触屏）：本装置要"指针划过"，触屏上没有"划"这件事。
 *   · `prefers-reduced-motion`：本装置**没有最终态可落** —— 它的产物就是"指针划过的
 *     痕迹"，静止用户既没划过、也不该被一段自己会长的动效打扰。
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
  const ACCENT = CS.getPropertyValue('--accent').trim() || '#2d7d46';
  /* 两道裂纹色都在 tokens.css 里（那里写着"为什么是两道而不是一道"）。
     脚本侧**只留一个字面兜底**（--accent 本身，与星座同一写法），alpha 靠拼后缀派生 ——
     不把 8 位 hex 整条复制一遍：那样改 token 就得记得来改脚本，迟早会对不上。 */
  const LINE = CS.getPropertyValue('--deco-fracture-line').trim() || ACCENT + '99'; // --accent @ 60%
  const GLOW = CS.getPropertyValue('--deco-fracture-glow').trim() || ACCENT + '33'; // --accent @ 20%

  /* ---------- 参量 ---------- */
  const SPAWN_DIST = 110; // 指针累计走过这么多 px 才生一道新裂痕
  const SPEED = 120; // 裂纹前沿速度（px/s）★ "缓慢生长"
  const SEG = 7; // 每段长度（px）：越短线条越细碎
  const JITTER = 0.17; // 每段的转角抖动（rad）—— 裂痕的"不走直线"靠它
  const SPREAD = 0.45; // 分支相对母枝的偏角（rad）
  const MAX_TIP = 250; // 单条裂纹最长（px）
  const BRANCH_P = 0.05; // 每段分裂的概率
  const BRANCH_MIN = 70; // 剩余长度少于它就不再分支（免得尾巴上分出一堆小刺）
  const MAX_CRACKS = 26; // ★ 总量封顶（站主拍板甲档）
  const MAX_LIVE = 110; // 同时生长的前沿上限（防"一划炸开"）
  const FADE = 700; // 退休淡出时长（ms）
  const PAD = 9; // 文字盒外扩（px）：**顶点**与文字的安全距离（描边还会再探出 ~1.5px，见下）
  const TURN = [10, 20, 31, 43, 57, 72]; // 受阻时的试探角（度）
  const RECT_LIMIT = 80; // 文字盒上限（超了只取前若干个，防病态页面把每帧拖死）

  /* ---------- 类型 ---------- */
  interface Rect {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }
  /** 一条生长中的裂纹前沿。`pts` 是**它自己那截折线**的平坦数组 [x,y,x,y,…]。
   *  ★ `x/y` 是**最后一个已落笔的顶点**；真正的"刀尖"还要沿 `a` 再走 `acc`（见 `acc`）。 */
  interface Tip {
    x: number;
    y: number;
    a: number; // 当前朝向（rad）
    left: number; // 还能长多少 px
    dead: boolean;
    rnd: () => number; // 按种子确定的 PRNG（见文件头"不做"第 3 条）
    pts: number[];
    /** ★★ 未走满一个 SEG 的余量。
     *  没有它，`while (remain > 0)` 在 60fps 下**每帧恰好落一段**（adv=2px 但 SEG=7px）
     *  ⇒ 实际速度是 `SEG × 帧率` = 420px/s（144Hz 屏上是 1008px/s），
     *  既与 SPEED 无关、也与帧率有关 —— 正好踩中 rl-core 那条
     *  「禁止每帧 += 增量」的硬规矩。`_probe/_404-lab.mjs` 实测：
     *  改之前一条裂纹 40 帧就到头（0.67s），而 250px ÷ 120px/s 应当是 125 帧。 */
    acc: number;
  }
  interface Crack {
    id: number;
    tips: Tip[];
    gone: number; // 0 = 活着；>0 = 退休时刻（ms），用于淡出
  }

  /** 确定性 PRNG（mulberry32）。★ 同一个 seed ⇒ 同一条裂痕逐点相同。 */
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
  function fit(): boolean {
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
    if (pw === cv.width && ph === cv.height) return false;
    cv.width = pw;
    cv.height = ph;
    W = w;
    H = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
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
     ⇒ 沿段再取 3 个内点（1/4、1/2、3/4）。SEG=7px ⇒ 采样间隔 1.75px，
       小于最小文字盒宽度（实测 ≥ 2px）⇒ 穿不过去。
     ★ 但要说清 PAD 管的是什么：它约束的是**顶点**。可见墨迹还要加上描边半宽
       （主线 1px + 柔光 3px，圆头 ⇒ 朝盒方向多出 1.5px）
       ⇒ **可见间隙 ≈ PAD − 1.5 ≈ 7.5px**，不是 9px。
       验收时别拿"外扩 9px 那条带里必须 0 墨"当判据 —— 顶点贴在边界上时柔光必然跨线，
       那条判据**从构造上永远不成立**。要量的是"墨离字形盒最近多少 px"（`_probe/_404-lab.mjs` 实测 7.5+）。 */
  const segBlocked = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (blocked(x1, y1)) return true;
    for (const f of [0.25, 0.5, 0.75]) {
      if (blocked(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return true;
    }
    return false;
  };

  /* ---------- 状态 ---------- */
  const cracks: Crack[] = [];
  let seed = 1;
  let liveCount = 0;

  function newTip(x: number, y: number, a: number, len: number): Tip {
    return {
      x, y, a, left: len, dead: false, acc: 0,
      rnd: mulberry32((seed = (seed * 1664525 + 1013904223) >>> 0)),
      pts: [],
    };
  }

  /** 指针"划"出一道裂痕：一道主枝 + 两条侧枝（玻璃受划时就是这么开的）。 */
  function spawn(x: number, y: number, dir: number) {
    if (cracks.length >= MAX_CRACKS) {
      /* ★ 封顶后淘汰**最旧**的一条 —— 而且是**淡出**：直接删掉会有"啪一下少一条"的破绽 */
      for (const c of cracks) {
        if (!c.gone) {
          c.gone = performance.now();
          break;
        }
      }
    }
    const id = seed++;
    const t0 = newTip(x, y, dir, MAX_TIP);
    const tips: Tip[] = [t0];
    for (const side of [1, -1]) {
      const t = newTip(x, y, dir + side * (0.9 + t0.rnd() * 0.5), MAX_TIP * 0.62);
      tips.push(t);
    }
    cracks.push({ id, tips, gone: 0 });
  }

  /* ---------- 生长 ---------- */
  function grow(dtMs: number) {
    const adv = (SPEED * dtMs) / 1000;
    liveCount = 0;
    for (const c of cracks) {
      if (c.gone) continue;
      for (const t of c.tips) {
        if (t.dead) continue;
        liveCount++;
        /* ★★ 先攒余量再落笔：速度 = SPEED px/s，**与帧率无关**（见 Tip.acc 那条注释）。
           只按 `remain > 0` 判，60fps 下每帧必落一整段 ⇒ 实际 420px/s。 */
        t.acc += adv;
        while (t.acc >= SEG && !t.dead) {
          const nx = t.x + Math.cos(t.a) * SEG;
          const ny = t.y + Math.sin(t.a) * SEG;
          /* ① 这一段的落点撞上文字盒 ⇒ 转向试探（先近角后远角、两边都试），
                全都撞 ⇒ 这条前沿到头（**不硬穿**，这就是"绕开"的兜底语义） */
          if (segBlocked(t.x, t.y, nx, ny)) {
            let turned = false;
            for (const deg of TURN) {
              for (const s of [1, -1]) {
                const na = t.a + (s * deg * Math.PI) / 180;
                const tx = t.x + Math.cos(na) * SEG;
                const ty = t.y + Math.sin(na) * SEG;
                if (!segBlocked(t.x, t.y, tx, ty)) {
                  t.a = na;
                  turned = true;
                  break;
                }
              }
              if (turned) break;
            }
            if (!turned) t.dead = true;
            continue; // 转向后本段不推进，下一轮用新角度
          }
          /* ② 前进一段 */
          t.pts.push(nx, ny);
          t.x = nx;
          t.y = ny;
          t.left -= SEG;
          t.acc -= SEG;
          /* ③ 抖动（裂痕不走直线） */
          t.a += (t.rnd() * 2 - 1) * JITTER;
          /* ④ 偶尔分裂一条侧枝 */
          if (t.left > BRANCH_MIN && liveCount < MAX_LIVE && t.rnd() < BRANCH_P) {
            c.tips.push(newTip(t.x, t.y, t.a + (t.rnd() < 0.5 ? -1 : 1) * (SPREAD + t.rnd() * 0.4), t.left * 0.55));
            liveCount++;
          }
          /* ⑤ 到头 / 出画 */
          if (t.left <= 0 || nx < -24 || ny < -24 || nx > W + 24 || ny > H + 24) t.dead = true;
        }
      }
    }
  }

  /* ---------- 绘制 ---------- */
  function draw(now: number) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let ci = cracks.length - 1; ci >= 0; ci--) {
      const c = cracks[ci];
      const k = c.gone ? 1 - (now - c.gone) / FADE : 1;
      if (k <= 0) {
        cracks.splice(ci, 1); // 淡出结束 ⇒ 才真正移除
        continue;
      }
      ctx.globalAlpha = k;
      ctx.beginPath();
      let has = false;
      for (const t of c.tips) {
        if (t.pts.length < 4) continue;
        ctx.moveTo(t.pts[0], t.pts[1]);
        for (let i = 2; i < t.pts.length; i += 2) ctx.lineTo(t.pts[i], t.pts[i + 1]);
        /* ★★ 把"还没走满一段"的余量也画出来（`Tip.acc`）。
           不画的话：速度虽是 120px/s，落笔却是**每 3~4 帧才 7px** 一蹦 ⇒ 肉眼是"卡顿的生长"
           （60fps 下 420px/s 那版反而看着顺，因为它每帧都在动）。
           画了之后落笔连续、折线形状不变（顶点仍是 7px 一处）。
           刀尖同样要过文字检查：它离已落笔顶点最多 SEG-ε，仍可能切到盒角。 */
        if (!t.dead && t.acc > 0.35) {
          const hx = t.x + Math.cos(t.a) * t.acc;
          const hy = t.y + Math.sin(t.a) * t.acc;
          if (!blocked(hx, hy)) ctx.lineTo(hx, hy);
        }
        has = true;
      }
      if (!has) continue;
      /* 两道：先柔光、后主线。玻璃裂口是一条**细亮缝**，
         只有主线会显得像"铅笔划痕"；垫一层宽而淡的柔光才像裂。 */
      ctx.strokeStyle = GLOW;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 输入：指针划过 ---------- */
  let lx = NaN;
  let ly = NaN;
  let acc = 0;

  function resetTrack() {
    lx = NaN;
    ly = NaN;
    acc = 0;
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      const x = e.clientX + window.scrollX;
      const y = e.clientY + window.scrollY;
      if (Number.isNaN(lx)) {
        lx = x;
        ly = y;
        return;
      }
      const dx = x - lx;
      const dy = y - ly;
      const d = Math.hypot(dx, dy);
      if (d < 1) return; // 抖动不算"划"
      acc += d;
      lx = x;
      ly = y;
      if (acc < SPAWN_DIST) return;
      acc = 0;
      /* 文字盒在**每次生成时**重取：字号/换行/滚动都会让框变，缓存会"绕开一个旧位置" */
      rects = textRects();
      /* 起点落在文字上 ⇒ 这一下不裂（"绕开"也包括"不在字上开缝"） */
      if (blocked(x, y)) return;
      spawn(x, y, Math.atan2(dy, dx));
    },
    { passive: true },
  );
  window.addEventListener('pointerleave', resetTrack, { passive: true });
  window.addEventListener('blur', resetTrack);

  /* ---------- 起停 ---------- */
  fit();
  draw(performance.now()); // ★ 同步首帧（无头下 rAF 不推进，有它才量得到）
  cv.classList.add('is-ready');

  const gate = createActivityGate(cv);
  startLoop((dt, now) => {
    if (!gate.onScreen || !gate.visible) return; // 出屏 / 切标签：不推进也不画
    grow(dt);
    draw(now);
  });

  let rz = 0;
  window.addEventListener(
    'resize',
    () => {
      const t = Date.now();
      if (t - rz < 200) return;
      rz = t;
      fit();
      rects = textRects();
    },
    { passive: true },
  );
})();
