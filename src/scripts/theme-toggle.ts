/**
 * Jelly Slider 主题切换（2D canvas 版）。
 *
 * 出处：Software Mansion / TypeGPU 的 "Jelly Slider"（WebGPU + SDF 光追，MIT）。
 * 本站版为了「每个访客都能拖」改走 2D canvas：
 *   · 物理照搬原版 slider.ts 的 Verlet 绳（质点积分 + 距离约束 + 压缩拱起）；
 *   · 渲染用渐变 + 高光 + 投影近似那层果冻质感，不需要 WebGPU。
 *
 * 行为：左 = 亮色，右 = 暗色。拖动手柄果冻会拉伸拱起，松手吸附到最近的一端，
 * 落定后若主题变了就切换（`dark` 类 + localStorage，契约见 ./theme.ts）。
 * 点按（无拖拽）= 切到另一端；键盘 ←/→/空格/回车可用；`role=switch`。
 */
import { getTheme, setTheme, type Theme } from './theme';

interface V {
  x: number;
  y: number;
}

/* ---------------- 几何（CSS 像素） ---------------- */
const W = 140;
const H = 64;
const SLOT_X0 = 14;
const SLOT_X1 = 126;
const SLOT_CY = 36;
const SLOT_H = 30;
const DOCK_L = 30; // 亮色停靠点
const DOCK_R = 110; // 暗色停靠点
const REST = DOCK_R - DOCK_L; // 绳的自然长度
const HALF = 10; // 果冻半厚度

/* ---------------- 物理参数（量级照搬原版） ---------------- */
const N = 26; // 质点数
const ITER = 14; // 约束迭代次数
const SUB = 5; // 子步数
const DAMPING = 0.02;
const ARCH = 1.7; // 压缩时拱起强度
const BEND = 0.12; // 抗弯强度

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

interface Sim {
  pos: V[];
  prev: V[];
  nrm: V[];
  targetX: number;
}

function makeSim(): Sim {
  const pos: V[] = [];
  const prev: V[] = [];
  const nrm: V[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const p = { x: DOCK_L + REST * t, y: SLOT_CY };
    pos.push({ ...p });
    prev.push({ ...p });
    nrm.push({ x: 0, y: 1 });
  }
  return { pos, prev, nrm, targetX: DOCK_L + REST / 2 };
}

/** 一步物理（dt 秒）。端点 0 钉在左停靠，端点 n-1 钉在 targetX。 */
function stepSim(s: Sim, dt: number): void {
  if (dt <= 0) return;
  const h = dt / SUB;
  const damp = clamp(DAMPING, 0, 0.999);
  const compression = Math.max(0, 1 - Math.abs(s.targetX - DOCK_L) / REST);
  const restLen = REST / (N - 1);

  for (let sub = 0; sub < SUB; sub++) {
    // —— 积分 ——
    for (let i = 0; i < N; i++) {
      if (i === 0) {
        s.pos[i].x = DOCK_L;
        s.pos[i].y = SLOT_CY;
        s.prev[i].x = DOCK_L;
        s.prev[i].y = SLOT_CY;
        continue;
      }
      if (i === N - 1) {
        s.pos[i].x = s.targetX;
        s.pos[i].y = SLOT_CY - 2;
        s.prev[i].x = s.targetX;
        s.prev[i].y = SLOT_CY - 2;
        continue;
      }
      const px = s.pos[i].x;
      const py = s.pos[i].y;
      const vx = (px - s.prev[i].x) * (1 - damp);
      const vy = (py - s.prev[i].y) * (1 - damp);
      // 压缩时中段拱起（原版的 arch bias）
      let ay = 0;
      if (compression > 0) {
        const t = i / (N - 1);
        const window = smoothstep(0.01, 0.5, t) * smoothstep(0.01, 0.5, 1 - t);
        ay = ARCH * Math.sin(Math.PI * t) * window * compression;
      }
      s.prev[i].x = px;
      s.prev[i].y = py;
      s.pos[i].x = px + vx;
      s.pos[i].y = py + vy + ay * h * h;
      // 不许沉到槽底线之下
      if (s.pos[i].y < SLOT_CY) s.pos[i].y = SLOT_CY;
    }
    // —— 约束投影 ——
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < N - 1; i++) projectDist(s, i, i + 1, restLen, 0.1);
      for (let i = 1; i < N - 1; i++) {
        const t = i / (N - 1);
        const strength = Math.abs(t - 0.5) * 2;
        projectDist(s, i - 1, i + 1, 2 * restLen, BEND * (0.05 + 0.95 * strength ** 1.2));
      }
      // 两端压平
      projectLineY(s, 1, SLOT_CY, 0.05);
      projectLineY(s, N - 2, SLOT_CY, 0.05);
      // 重钉端点
      s.pos[0].x = DOCK_L;
      s.pos[0].y = SLOT_CY;
      s.pos[N - 1].x = s.targetX;
      s.pos[N - 1].y = SLOT_CY - 2;
    }
  }
  computeNormals(s);
}

function projectDist(s: Sim, i: number, j: number, rest: number, k: number): void {
  const dx = s.pos[j].x - s.pos[i].x;
  const dy = s.pos[j].y - s.pos[i].y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-8) return;
  // 端点质量无限大（钉住），其余等权
  const w1 = i === 0 || i === N - 1 ? 0 : 1;
  const w2 = j === 0 || j === N - 1 ? 0 : 1;
  const wsum = w1 + w2;
  if (wsum <= 0) return;
  const diff = ((len - rest) / len) * k;
  s.pos[i].x += dx * diff * (w1 / wsum);
  s.pos[i].y += dy * diff * (w1 / wsum);
  s.pos[j].x -= dx * diff * (w2 / wsum);
  s.pos[j].y -= dy * diff * (w2 / wsum);
}

function projectLineY(s: Sim, i: number, yT: number, k: number): void {
  if (i <= 0 || i >= N - 1) return;
  s.pos[i].y += (yT - s.pos[i].y) * k;
}

function computeNormals(s: Sim): void {
  for (let i = 0; i < N; i++) {
    let dx: number;
    let dy: number;
    if (i === 0) {
      dx = s.pos[1].x - s.pos[0].x;
      dy = s.pos[1].y - s.pos[0].y;
    } else if (i === N - 1) {
      dx = s.pos[N - 1].x - s.pos[N - 2].x;
      dy = s.pos[N - 1].y - s.pos[N - 2].y;
    } else {
      dx = s.pos[i + 1].x - s.pos[i - 1].x;
      dy = s.pos[i + 1].y - s.pos[i - 1].y;
    }
    const len = Math.hypot(dx, dy) || 1;
    // 法线取「上」侧（与原版 n=(−dy,dx) 一致，绳基本水平时指向 +y 即下方？
    // 原版 y 轴向上；这里 canvas y 向下，取 (-dy, dx) 后再翻转，保证高光画在上沿）
    s.nrm[i].x = dy / len;
    s.nrm[i].y = -dx / len;
  }
}

/* ---------------- 渲染 ---------------- */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 过点列的光滑路径（中点二次曲线），closed 时收尾 */
function traceSmooth(ctx: CanvasRenderingContext2D, pts: V[], closed: boolean): void {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  const end = closed ? n : n - 1;
  for (let i = 0; i < end; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  if (closed) ctx.closePath();
}

function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(122,116,104,0.75)';
  ctx.fillStyle = 'rgba(122,116,104,0.75)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, 4.6, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 6.6, y + Math.sin(a) * 6.6);
    ctx.lineTo(x + Math.cos(a) * 8.8, y + Math.sin(a) * 8.8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(122,116,104,0.75)';
  ctx.beginPath();
  ctx.arc(x, y, 5.4, Math.PI * 0.32, Math.PI * 1.68);
  ctx.arc(x + 2.6, y - 1.4, 4.4, Math.PI * 1.62, Math.PI * 0.38, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, s: Sim): void {
  ctx.clearRect(0, 0, W, H);

  // —— 槽 ——
  const slotY = SLOT_CY - SLOT_H / 2;
  const g = ctx.createLinearGradient(0, slotY, 0, slotY + SLOT_H);
  g.addColorStop(0, '#cfccc3');
  g.addColorStop(0.5, '#dbd8d0');
  g.addColorStop(1, '#e7e4dd');
  rr(ctx, SLOT_X0, slotY, SLOT_X1 - SLOT_X0, SLOT_H, SLOT_H / 2);
  ctx.fillStyle = g;
  ctx.fill();
  // 槽内上沿阴影（凹槽感）+ 下沿高光
  ctx.save();
  rr(ctx, SLOT_X0, slotY, SLOT_X1 - SLOT_X0, SLOT_H, SLOT_H / 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(60,55,45,0.28)';
  ctx.lineWidth = 3;
  rr(ctx, SLOT_X0 + 1, slotY - 4, SLOT_X1 - SLOT_X0 - 2, SLOT_H + 4, SLOT_H / 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  rr(ctx, SLOT_X0 + 1, slotY + 2, SLOT_X1 - SLOT_X0 - 2, SLOT_H - 2, SLOT_H / 2 - 1);
  ctx.stroke();
  ctx.restore();

  // —— 两端图标（果冻盖住的那一端 = 当前主题）——
  drawSun(ctx, DOCK_L, SLOT_CY);
  drawMoon(ctx, DOCK_R, SLOT_CY);

  // —— 果冻 ——
  const tops: V[] = [];
  const bots: V[] = [];
  for (let i = 0; i < N; i++) {
    tops.push({ x: s.pos[i].x + s.nrm[i].x * HALF, y: s.pos[i].y + s.nrm[i].y * HALF });
    bots.push({ x: s.pos[i].x - s.nrm[i].x * HALF, y: s.pos[i].y - s.nrm[i].y * HALF });
  }
  const body: V[] = [...tops, ...bots.reverse()];

  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of body) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const jg = ctx.createLinearGradient(0, minY, 0, maxY);
  jg.addColorStop(0, '#ffd9a0');
  jg.addColorStop(0.45, '#ff9e3d');
  jg.addColorStop(1, '#e8640c');

  ctx.save();
  ctx.shadowColor = 'rgba(150,70,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  traceSmooth(ctx, body, true);
  ctx.fillStyle = jg;
  ctx.fill();
  ctx.restore();

  // 上沿高光（果冻质感的关键一笔）
  traceSmooth(ctx, tops, false);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();

  // —— 手柄 blob（抓握点，原视频里那坨胖果冻）——
  const hp = s.pos[N - 1];
  const bg = ctx.createRadialGradient(hp.x - 4, hp.y - 5, 2, hp.x, hp.y, 14);
  bg.addColorStop(0, '#ffc46e');
  bg.addColorStop(0.6, '#ff9433');
  bg.addColorStop(1, '#e56f0e');
  ctx.save();
  ctx.shadowColor = 'rgba(150,70,0,0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(hp.x, hp.y, 13, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(150,60,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.arc(hp.x, hp.y, 13, 0, Math.PI * 2);
  ctx.stroke();
  // 高光点
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.ellipse(hp.x - 4.5, hp.y - 5, 3.4, 2.4, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------------- 组件 ---------------- */
const themeOfX = (x: number): Theme => (x >= (DOCK_L + DOCK_R) / 2 ? 'dark' : 'light');

export function initThemeToggle(root: HTMLElement): void {
  if (root.dataset.ttInit) return;
  root.dataset.ttInit = '1';
  const canvas = root.querySelector('canvas');
  if (!canvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctxOrNull = canvas.getContext('2d');
  if (!ctxOrNull) return;
  const ctx: CanvasRenderingContext2D = ctxOrNull;
  ctx.scale(dpr, dpr);

  const sim = makeSim();
  const startTheme = getTheme();
  sim.targetX = startTheme === 'dark' ? DOCK_R : DOCK_L;
  // 热身：让绳子在首帧就是稳定形态（亮色端是拱起的，不能从直线"弹"出来）
  sim.pos.forEach((p, i) => {
    const t = i / (N - 1);
    p.x = DOCK_L + (sim.targetX - DOCK_L) * t;
    p.y = SLOT_CY;
    sim.prev[i].x = p.x;
    sim.prev[i].y = p.y;
  });
  for (let i = 0; i < 90; i++) stepSim(sim, 1 / 60);

  let dragging = false;
  let pointerTargetX = sim.targetX;
  let settleGoal: number | null = null;
  let running = false;
  let downX = 0;
  let downT = 0;
  let last = 0;

  const syncAria = (): void => {
    root.setAttribute('aria-checked', String(getTheme() === 'dark'));
  };
  syncAria();

  const kick = (): void => {
    if (!running && !reduceMotion) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    } else if (reduceMotion) {
      draw(ctx, sim);
    }
  };

  const commitIfSettled = (): void => {
    const t = themeOfX(sim.targetX);
    if (t !== getTheme()) setTheme(t);
    syncAria();
  };

  function frame(now: number): void {
    const dt = clamp((now - last) / 1000, 0, 1 / 30);
    last = now;
    if (dragging) {
      sim.targetX += (pointerTargetX - sim.targetX) * 0.4;
    } else if (settleGoal !== null) {
      sim.targetX += (settleGoal - sim.targetX) * 0.18;
      if (Math.abs(settleGoal - sim.targetX) < 0.4) {
        sim.targetX = settleGoal;
        settleGoal = null;
        commitIfSettled();
      }
    }
    stepSim(sim, dt);
    draw(ctx, sim);
    // 静止判定：没在拖、没在吸附、且绳子基本不动 → 停掉 rAF 省电
    let calm = !dragging && settleGoal === null;
    if (calm) {
      for (let i = 0; i < N; i++) {
        if (Math.hypot(sim.pos[i].x - sim.prev[i].x, sim.pos[i].y - sim.prev[i].y) > 0.02) {
          calm = false;
          break;
        }
      }
    }
    if (calm) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  }

  const toLocal = (clientX: number): number => {
    const r = canvas.getBoundingClientRect();
    return clamp(((clientX - r.left) / r.width) * W, DOCK_L, DOCK_R);
  };

  const goTo = (x: number): void => {
    if (reduceMotion) {
      sim.targetX = x;
      stepSim(sim, 1 / 60);
      draw(ctx, sim);
      commitIfSettled();
      return;
    }
    settleGoal = x;
    kick();
  };

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    settleGoal = null;
    downX = e.clientX;
    downT = performance.now();
    pointerTargetX = toLocal(e.clientX);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* 合成事件或老浏览器：抓不到指针也不影响拖拽 */
    }
    canvas.style.cursor = 'grabbing';
    kick();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    pointerTargetX = toLocal(e.clientX);
  });
  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
    const moved = Math.abs(e.clientX - downX);
    const dt = performance.now() - downT;
    if (moved < 6 && dt < 400) {
      // 点按：切到另一端
      goTo(getTheme() === 'dark' ? DOCK_L : DOCK_R);
    } else {
      goTo(pointerTargetX >= (DOCK_L + DOCK_R) / 2 ? DOCK_R : DOCK_L);
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'End') {
      goTo(DOCK_R);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'Home') {
      goTo(DOCK_L);
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      goTo(getTheme() === 'dark' ? DOCK_L : DOCK_R);
      e.preventDefault();
    }
  });

  // 别的实例切了主题 → 跟过去
  document.addEventListener('themechange', (e) => {
    const t = (e as CustomEvent<Theme>).detail;
    syncAria();
    const x = t === 'dark' ? DOCK_R : DOCK_L;
    if (Math.abs(sim.targetX - x) > 1 && !dragging) goTo(x);
  });

  draw(ctx, sim);
  if (!reduceMotion) kick();
}
