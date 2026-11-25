import {
  clamp,
  projectPoint,
  type CurveFrame,
  type RaisedCover,
} from './resources-curve';

export interface PropsOccluders {
  covers: RaisedCover[];
  coverPaths: Path2D[];
}

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

export type Vec3 = [number, number, number];
export type Polyline3 = Vec3[];

export const FLOAT_SHAPES = [
  'torus',
  'icosahedron',
  'trefoil',
  'sphere',
  'mobius',
  'helix',
  'saddle',
  'tesseract',
] as const;

export type FloatShapeName = (typeof FLOAT_SHAPES)[number];

export interface MathFormulaSpec {
  label: string;
  evalY: (u: number, phi: number) => number;
}

/** Exact 6 animated formulas from Shopify Editions Fall '26 (`Ha`). */
export const MATH_FORMULAS: readonly MathFormulaSpec[] = [
  {
    label: 'y = sin(2πx + φ)',
    evalY: (u, phi) => Math.sin(TWO_PI * u + phi),
  },
  {
    label: 'y = e^(−(x−μ)²/σ²)',
    evalY: (u, phi) => {
      const mu = 0.5 + 0.22 * Math.sin(phi * 0.8);
      return Math.exp(-((u - mu) ** 2) / 0.036) * 1.5 - 0.55;
    },
  },
  {
    label: 'y = e^(−x) cos(ωx + φ)',
    evalY: (u, phi) => Math.exp(-u * 2.0) * Math.cos(u * 14 + phi),
  },
  {
    label: 'σ(x) = 1 / (1 + e^(−kx))',
    evalY: (u, phi) => {
      const k = 7 + 5 * Math.sin(phi * 0.9);
      return 2 / (1 + Math.exp(-(u - 0.5) * k)) - 1;
    },
  },
  {
    label: 'y = x³ − x · cos φ',
    evalY: (u, phi) => {
      const x = u * 2 - 1;
      return clamp((x * x * x - x * Math.cos(phi)) * 1.15, -1, 1);
    },
  },
  {
    label: 'y = Σ sin((2k+1)x) / (2k+1)',
    evalY: (u, phi) => {
      let sum = 0;
      const x = u * TWO_PI + phi * 0.7;
      for (let k = 0; k < 4; k++) {
        const n = 2 * k + 1;
        sum += Math.sin(n * x) / n;
      }
      return clamp(sum * 1.15, -1, 1);
    },
  },
];

export interface RulerGroupMark {
  title: string;
  docTop: number;
}

export interface PropsPalette {
  inkRgb: [number, number, number];
  voidBgHex: string;
  accentRgb: [number, number, number];
  isDark: boolean;
}

function sampleRange(count: number, closed: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(closed ? i / count : (i + 1) / (count + 1));
  }
  return out;
}

function sampleCurve(steps: number, fn: (u: number) => Vec3): Polyline3 {
  const pts: Polyline3 = [];
  for (let i = 0; i <= steps; i++) pts.push(fn(i / steps));
  return pts;
}

function surfaceGrid(
  fn: (u: number, v: number) => Vec3,
  uLines: number[],
  vLines: number[],
  uSteps: number,
  vSteps: number,
): Polyline3[] {
  const lines: Polyline3[] = [];
  for (const u of uLines) {
    lines.push(sampleCurve(uSteps, (v) => fn(u, v)));
  }
  for (const v of vLines) {
    lines.push(sampleCurve(vSteps, (u) => fn(u, v)));
  }
  return lines;
}

function buildIcosahedron(): Polyline3[] {
  const phi = (1 + Math.sqrt(5)) / 2;
  const s = 0.45 / Math.hypot(1, phi);
  const verts: Vec3[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      verts.push([0, a * s, b * phi * s], [a * s, b * phi * s, 0], [b * phi * s, 0, a * s]);
    }
  }
  const lines: Polyline3[] = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const d = Math.hypot(
        verts[i][0] - verts[j][0],
        verts[i][1] - verts[j][1],
        verts[i][2] - verts[j][2],
      );
      if (d < 2.1 * s) lines.push([verts[i], verts[j]]);
    }
  }
  return lines;
}

function buildTubeAround(spine: Polyline3, radius: number, rails = 3, ringEvery = 10): Polyline3[] {
  const count = spine.length - 1;
  const frames = spine.map((pt, idx) => {
    const next = spine[(idx + 1) % count];
    const prev = spine[(idx - 1 + count) % count];
    const t: Vec3 = [next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]];
    const tLen = Math.hypot(t[0], t[1], t[2]) || 1;
    const tx = t[0] / tLen;
    const ty = t[1] / tLen;
    const tz = t[2] / tLen;
    let bx = ty;
    let by = -tx;
    let bz = 0;
    const bLen = Math.hypot(bx, by, bz) || 1;
    bx /= bLen;
    by /= bLen;
    const nx = ty * bz - tz * by;
    const ny = tz * bx - tx * bz;
    const nz = tx * by - ty * bx;
    return (ang: number): Vec3 => {
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      return [
        pt[0] + radius * (ca * bx + sa * nx),
        pt[1] + radius * (ca * by + sa * ny),
        pt[2] + radius * (ca * bz + sa * nz),
      ];
    };
  });

  const out: Polyline3[] = [];
  for (const r of sampleRange(rails, true)) {
    const ang = r * TWO_PI;
    out.push(frames.map((f) => f(ang)));
  }
  for (let i = 0; i < frames.length; i += ringEvery) {
    out.push(sampleCurve(10, (u) => frames[i](u * TWO_PI)));
  }
  return out;
}

function helixPt(u: number, phase: number): Vec3 {
  const a = u * TWO_PI * 2 + phase;
  return [0.22 * Math.cos(a), 0.22 * Math.sin(a), (u - 0.5) * 0.92];
}

/** Exact 4D hypercube (tesseract) projected to 3D with XW + YZ rotation. */
export function buildTesseractEdges(rotXW: number, rotYZ: number): Polyline3[] {
  const c1 = Math.cos(rotXW);
  const s1 = Math.sin(rotXW);
  const c2 = Math.cos(rotYZ);
  const s2 = Math.sin(rotYZ);
  const verts: Vec3[] = [];
  for (let i = 0; i < 16; i++) {
    let x = i & 1 ? 1 : -1;
    let y = i & 2 ? 1 : -1;
    let z = i & 4 ? 1 : -1;
    let w = i & 8 ? 1 : -1;
    const nx = x * c1 - w * s1;
    const nw = x * s1 + w * c1;
    const ny = y * c2 - z * s2;
    const nz = y * s2 + z * c2;
    x = nx;
    w = nw;
    y = ny;
    z = nz;
    const k = 0.165 * (4 / (4 - w));
    verts.push([x * k, y * k, z * k]);
  }
  const edges: Polyline3[] = [];
  for (let i = 0; i < 16; i++) {
    for (let bit = 0; bit < 4; bit++) {
      if (!(i & (1 << bit))) {
        edges.push([verts[i], verts[i | (1 << bit)]]);
      }
    }
  }
  return edges;
}

const STATIC_POLYHEDRA: Record<Exclude<FloatShapeName, 'tesseract'>, Polyline3[]> = {
  torus: surfaceGrid(
    (u, v) => {
      const r = 0.32 + 0.13 * Math.cos(v * TWO_PI);
      return [r * Math.cos(u * TWO_PI), r * Math.sin(u * TWO_PI), 0.13 * Math.sin(v * TWO_PI)];
    },
    sampleRange(16, true),
    sampleRange(6, true),
    12,
    40,
  ),
  icosahedron: buildIcosahedron(),
  trefoil: buildTubeAround(
    sampleCurve(96, (u) => {
      const a = u * TWO_PI;
      return [
        (Math.sin(a) + 2 * Math.sin(2 * a)) * 0.13,
        (Math.cos(a) - 2 * Math.cos(2 * a)) * 0.13,
        -Math.sin(3 * a) * 0.13,
      ];
    }),
    0.044,
    3,
    8,
  ),
  sphere: surfaceGrid(
    (u, v) => {
      const lat = (v - 0.5) * Math.PI;
      return [
        0.44 * Math.cos(lat) * Math.cos(u * TWO_PI),
        0.44 * Math.cos(lat) * Math.sin(u * TWO_PI),
        0.44 * Math.sin(lat),
      ];
    },
    sampleRange(10, true),
    sampleRange(5, false),
    14,
    28,
  ),
  mobius: surfaceGrid(
    (u, v) => {
      const a = u * TWO_PI;
      const s = (v - 0.5) * 0.48;
      const r = 0.3 + s * Math.cos(a * 0.5);
      return [r * Math.cos(a), r * Math.sin(a), s * Math.sin(a * 0.5)];
    },
    sampleRange(22, true),
    [0, 1],
    1,
    72,
  ),
  helix: [
    sampleCurve(100, (u) => helixPt(u, 0)),
    sampleCurve(100, (u) => helixPt(u, Math.PI)),
    ...sampleRange(14, false).map((u): Polyline3 => [helixPt(u, 0), helixPt(u, Math.PI)]),
  ],
  saddle: surfaceGrid(
    (u, v) => [0.9 * (u - 0.5), 0.9 * (v - 0.5), 1.3 * ((u - 0.5) ** 2 - (v - 0.5) ** 2)],
    [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    8,
    8,
  ),
};

export function getPolyhedronEdges(shape: FloatShapeName, timeSec = 0): Polyline3[] {
  if (shape === 'tesseract') {
    return buildTesseractEdges(timeSec * 0.55, timeSec * 0.38);
  }
  return STATIC_POLYHEDRA[shape];
}

// ── Verbatim Shopify `class Gf` + `Ta` + `Sa` floating polyhedron disturbance & drag physics ──

const GF_DAMP = 2.5; // so
const GF_MAX_SPIN = 12; // Wn
const GF_PUSH_GAIN = 0.15; // Rf
const GF_PUSH_MAX = 1.0; // Hf
const GF_PUSH_FREQ = 8; // Cf
const GF_PUSH_ZETA = 0.4; // kf
const GF_WARP_GAIN = 2.5; // Bf
const GF_WARP_MAX = 9; // _f
const GF_WARP_FREQ = 13; // Df
const GF_WARP_ZETA = 0.3; // Nf
const GF_WARP_SIGMA = 0.5; // Pf
const GF_POP_SCALE = 0.2; // Ff
const GF_CLICK_SPIN = 5; // Wf
const GF_RIPPLE = { every: 0.16, speed: 1.3, width: 0.07, fade: 0.7, life: 1.8, most: 12, glow: 0.3 };

interface Spring2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Exact Shopify `Sa(s, dt, omega, zeta)`: sub-stepped 2D damped harmonic spring. */
function stepSpring2D(s: Spring2D, dt: number, omega: number, zeta: number) {
  if (!s.x && !s.y && !s.vx && !s.vy) return;
  for (let rem = dt; rem > 0; rem -= 1 / 240) {
    const h = Math.min(1 / 240, rem);
    s.vx -= (omega * omega * s.x + 2 * zeta * omega * s.vx) * h;
    s.vy -= (omega * omega * s.y + 2 * zeta * omega * s.vy) * h;
    s.x += s.vx * h;
    s.y += s.vy * h;
  }
  if (Math.hypot(s.x, s.y) < 0.002 && Math.hypot(s.vx, s.vy) < 0.02) {
    s.x = s.y = s.vx = s.vy = 0;
  }
}

/** Exact Shopify `Ta(s, cx, cy, dx, dy, dt, gain, maxV)`: velocity-coupled hover disturbance impulse. */
function pokeSpring2D(
  s: Spring2D,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  dt: number,
  gain: number,
  maxV: number,
) {
  const c = Math.hypot(cx, cy);
  const l = Math.hypot(dx, dy);
  if (c >= 1.15 || !l || dt <= 0) return;
  const hx = c > 0.05 ? -cx / c : dx / l;
  const hy = c > 0.05 ? -cy / c : dy / l;
  const f = gain * Math.max(0.1, 1 - c * c) * Math.sqrt(l / dt);
  s.vx += f * (dx + l * hx);
  s.vy += f * (dy + l * hy);
  const ratio = Math.hypot(s.vx, s.vy) / maxV;
  if (ratio > 1) {
    s.vx /= ratio;
    s.vy /= ratio;
  }
}

interface FloatState {
  id: number;
  shape: FloatShapeName;
  side: -1 | 1;
  docY: number;
  sizeMul: number;
  yaw: number;
  over: number;
  vy: number;
  vo: number;
  popTimeMs: number;
  push: Spring2D;
  warp: Spring2D;
  dentX: number;
  dentY: number;
  glowX: number;
  glowY: number;
  glowK: number;
  glowOn: boolean;
  rings: [number, number, number][]; // [x, y, createdMs]
  screenX: number;
  screenY: number;
  screenR: number;
  visible: boolean;
}

// ── Single cube per patch (exact Shopify `o.row(m, 1, M, v, n)` — never overlaps or touches!) ──

const CUBE_DIRS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const CUBE_FACES: readonly [number, number, number][] = [
  [0, 2, 3],
  [4, 5, 7],
  [0, 4, 6],
  [1, 3, 7],
  [0, 1, 5],
  [2, 6, 7],
];

const CUBE_EDGES: readonly [number, number, number, number][] = [
  [0, 1, 0, 4], [1, 3, 0, 3], [3, 2, 0, 5], [2, 0, 0, 2],
  [4, 5, 1, 4], [5, 7, 1, 3], [7, 6, 1, 5], [6, 4, 1, 2],
  [0, 4, 2, 4], [1, 5, 3, 4], [2, 6, 2, 5], [3, 7, 3, 5],
];

interface CubeActor {
  id: number;
  clusterId: number;
  side: -1 | 1;
  gx: number;
  gy: number;
  maxGx: number;
  maxGy: number;
  baseDocY: number;
  sizeScale: number;
  rolling: boolean;
  bump: boolean;
  rollDirIdx: number;
  rollProgress: number;
  rollDur: number;
  rollsLeft: number;
  pauseLeft: number;
  hoverAmount: number;
  leanDirIdx: number;
  screenX: number;
  screenY: number;
  screenR: number;
  visible: boolean;
}

function seededHash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** Draws text lying flat on the curved 3D plane at `(col, row, elev)` using local projected tangent Jacobian. */
export function drawLyingText(
  ctx: CanvasRenderingContext2D,
  frame: CurveFrame,
  text: string,
  col: number,
  row: number,
  elev: number,
  font: string,
  fillStyle: string,
  align: CanvasTextAlign = 'left',
) {
  const p0 = projectPoint(frame, col, row, elev);
  const px = projectPoint(frame, col + 20, row, elev);
  const py = projectPoint(frame, col, row + 20, elev);
  if (!p0 || !px || !py) return;
  if (p0.x < -280 || p0.x > frame.W + 280 || p0.y < -120 || p0.y > frame.H + 120) return;

  const ax = (px.x - p0.x) / 20;
  const ay = (px.y - p0.y) / 20;
  const bx = (py.x - p0.x) / 20;
  const by = (py.y - p0.y) / 20;
  if (!Number.isFinite(ax) || !Number.isFinite(by) || Math.hypot(ax, ay) < 0.08) return;

  ctx.save();
  ctx.transform(ax, ay, bx, by, p0.x, p0.y);
  ctx.font = font;
  ctx.fillStyle = fillStyle;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Paper-edge coordinate rulers (ticks every 100px, labels every 500px, plus group names on both edges). */
export function drawRulers(
  ctx: CanvasRenderingContext2D,
  frame: CurveFrame,
  scrollY: number,
  docHeight: number,
  groups: readonly RulerGroupMark[],
  palette: PropsPalette,
) {
  const alpha = frame.fade * 0.56;
  if (alpha <= 0.01) return;
  const [ir, ig, ib] = palette.inkRgb;
  const lineCol = `rgba(${ir},${ig},${ib},${(alpha * 0.78).toFixed(3)})`;
  const textCol = `rgba(${ir},${ig},${ib},${(alpha * 0.96).toFixed(3)})`;
  const labelFont = '600 13px "IBM Plex Mono", ui-monospace, monospace';
  const groupFont = '600 14px "IBM Plex Mono", system-ui, sans-serif';

  ctx.save();
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = 1;

  const minDoc = Math.max(0, Math.floor((scrollY - frame.lead - 200) / 100) * 100);
  const maxDoc = Math.min(Math.max(docHeight, 800), Math.ceil((scrollY - frame.lead + frame.T + 200) / 100) * 100);

  for (let y = minDoc; y <= maxDoc; y += 100) {
    const row = y - scrollY + frame.lead;
    if (row < 10 || row > frame.T - 10) continue;
    const isMajor = y % 500 === 0 && y > 0;
    const tickLen = isMajor ? 18 : 9;

    for (const side of [-1, 1] as const) {
      const edgeCol = side < 0 ? 0 : frame.W;
      const p0 = projectPoint(frame, edgeCol, row, 1);
      const p1 = projectPoint(frame, edgeCol + side * tickLen, row, 1);
      if (!p0 || !p1) continue;
      if (p0.y < -40 || p0.y > frame.H + 40) continue;

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();

      if (isMajor) {
        drawLyingText(
          ctx,
          frame,
          String(y),
          edgeCol + side * (tickLen + 10),
          row,
          1,
          labelFont,
          textCol,
          side < 0 ? 'right' : 'left',
        );
      }
    }
  }

  for (const g of groups) {
    const row = g.docTop - scrollY + frame.lead;
    if (row < 10 || row > frame.T - 10) continue;
    for (const side of [-1, 1] as const) {
      const edgeCol = side < 0 ? 0 : frame.W;
      const p0 = projectPoint(frame, edgeCol, row, 1);
      const p1 = projectPoint(frame, edgeCol + side * 24, row, 1);
      if (!p0 || !p1 || p0.y < -40 || p0.y > frame.H + 40) continue;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      drawLyingText(
        ctx,
        frame,
        g.title,
        edgeCol + side * 32,
        row,
        1,
        groupFont,
        textCol,
        side < 0 ? 'right' : 'left',
      );
    }
  }

  ctx.restore();
}

/** Renders animated math formulas sparsely on the void grid alternating left & right. */
export function drawFormulas(
  ctx: CanvasRenderingContext2D,
  frame: CurveFrame,
  scrollY: number,
  docHeight: number,
  timeSec: number,
  palette: PropsPalette,
) {
  const alpha = frame.fade * 0.56;
  if (alpha <= 0.01) return;
  const [ir, ig, ib] = palette.inkRgb;
  const strokeCol = `rgba(${ir},${ig},${ib},${(alpha * 0.88).toFixed(3)})`;
  const axisCol = `rgba(${ir},${ig},${ib},${(alpha * 0.34).toFixed(3)})`;
  const textCol = `rgba(${ir},${ig},${ib},${(alpha * 0.92).toFixed(3)})`;
  const eqFont = 'italic 500 15px "Georgia", "IBM Plex Mono", serif';
  const phiFont = 'italic 500 12px "IBM Plex Mono", ui-monospace, monospace';

  const spacing = 1350;
  const count = Math.max(3, Math.ceil((docHeight + 200) / spacing));

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < count; i++) {
    const spec = MATH_FORMULAS[i % MATH_FORMULAS.length];
    const docY = 760 + i * spacing;
    const row = docY - scrollY + frame.lead;
    if (row < -80 || row > frame.T + 80) continue;

    const side = i % 2 === 0 ? -1 : 1;
    const waveW = Math.min(200, Math.max(120, frame.W * 0.135));
    const waveAmp = 16;
    const outDist = 115 + waveW * 0.5;
    const centerCol = side < 0 ? -outDist : frame.W + outDist;
    const xStart = centerCol - waveW * 0.5;
    const xEnd = centerCol + waveW * 0.5;
    const phi = ((timeSec * 1.05 + i * 1.37) % TWO_PI + TWO_PI) % TWO_PI;

    const centerPt = projectPoint(frame, centerCol, row, 1);
    if (!centerPt || centerPt.y < -120 || centerPt.y > frame.H + 120) continue;

    drawLyingText(ctx, frame, spec.label, centerCol, row - 32, 1, eqFont, textCol, 'center');

    const a0 = projectPoint(frame, xStart, row, 1);
    const a1 = projectPoint(frame, xEnd, row, 1);
    if (a0 && a1) {
      ctx.strokeStyle = axisCol;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.stroke();
    }

    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    let started = false;
    for (let s = 0; s <= 32; s++) {
      const u = s / 32;
      const col = xStart + u * waveW;
      const r = row - spec.evalY(u, phi) * waveAmp;
      const pt = projectPoint(frame, col, r, 1);
      if (!pt) continue;
      if (!started) {
        ctx.moveTo(pt.x, pt.y);
        started = true;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    if (started) ctx.stroke();

    drawLyingText(ctx, frame, `φ ${phi.toFixed(2)}`, centerCol, row + 28, 1, phiFont, textCol, 'center');
  }

  ctx.restore();
}

/** Exact Shopify wireframe cube renderer: backface-weighted front/hidden edges, constant hairline width. */
function drawWireCube(
  ctx: CanvasRenderingContext2D,
  frame: CurveFrame,
  verts: Vec3[],
  anchorCol: number,
  anchorRow: number,
  inkRgb: [number, number, number],
  alpha: number,
  highlight: number,
) {
  const proj = verts.map((v) => projectPoint(frame, v[0], v[1], v[2]));
  if (proj.some((p) => !p)) return;
  const pts = proj as NonNullable<(typeof proj)[number]>[];

  const ref0 = projectPoint(frame, anchorCol, anchorRow, 0);
  const refX = projectPoint(frame, anchorCol + 1, anchorRow, 0);
  const refY = projectPoint(frame, anchorCol, anchorRow + 1, 0);
  const cross2 = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const refSign = ref0 && refX && refY ? Math.sign(cross2(ref0, refX, refY)) : 1;

  const frontFace = CUBE_FACES.map(([a, b, c]) => Math.sign(cross2(pts[a], pts[b], pts[c])) === refSign);

  const [ir, ig, ib] = inkRgb;
  const frontAlpha = clamp(alpha + highlight * 0.42, 0, 0.94);
  const hiddenRatio = 0.28 + highlight * 0.26;
  const backAlpha = frontAlpha * hiddenRatio;

  ctx.lineWidth = 0.85;

  ctx.strokeStyle = `rgba(${ir},${ig},${ib},${backAlpha.toFixed(3)})`;
  ctx.beginPath();
  for (const [u, v, f1, f2] of CUBE_EDGES) {
    if (frontFace[f1] || frontFace[f2]) continue;
    ctx.moveTo(pts[u].x, pts[u].y);
    ctx.lineTo(pts[v].x, pts[v].y);
  }
  ctx.stroke();

  ctx.strokeStyle = `rgba(${ir},${ig},${ib},${frontAlpha.toFixed(3)})`;
  ctx.beginPath();
  for (const [u, v, f1, f2] of CUBE_EDGES) {
    if (!frontFace[f1] && !frontFace[f2]) continue;
    ctx.moveTo(pts[u].x, pts[u].y);
    ctx.lineTo(pts[v].x, pts[v].y);
  }
  ctx.stroke();
}

function nowClockMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

export class SidePropsController {
  private floats: FloatState[] = [];
  private cubes: CubeActor[] = [];
  private builtForHeight = 0;
  private hoveredKind: 'none' | 'float' | 'cube' = 'none';
  private lastHover: [number, number, number] | null = null;
  private grab: { id: number; r: number; x: number; y: number; far: number; trail: [number, number, number][] } | null = null;
  private suppressNextClick = false;

  ensureLayout(docHeight: number) {
    const targetH = Math.max(1800, Math.round(docHeight / 200) * 200);
    if (this.floats.length > 0 && Math.abs(this.builtForHeight - targetH) < 400) return;
    this.builtForHeight = targetH;

    // 1) Airy large draggable & hover-disturbable 3D floating polyhedra (alternating sides)
    this.floats = [];
    const spacing = Math.max(880, Math.min(1180, (targetH + 400) / FLOAT_SHAPES.length));
    const ordered: FloatShapeName[] = [
      'tesseract',
      'torus',
      'saddle',
      'icosahedron',
      'mobius',
      'trefoil',
      'helix',
      'sphere',
    ];
    ordered.forEach((shape, idx) => {
      this.floats.push({
        id: idx,
        shape,
        side: idx % 2 === 0 ? -1 : 1,
        docY: idx === 0 ? 220 : 220 + idx * spacing,
        sizeMul: shape === 'tesseract' ? 1.15 : shape === 'saddle' ? 1.08 : 1.0,
        yaw: 0,
        over: 0,
        vy: 0,
        vo: 0,
        popTimeMs: -1e9,
        push: { x: 0, y: 0, vx: 0, vy: 0 },
        warp: { x: 0, y: 0, vx: 0, vy: 0 },
        dentX: 0,
        dentY: 0,
        glowX: 0,
        glowY: 0,
        glowK: 0,
        glowOn: false,
        rings: [],
        screenX: 0,
        screenY: 0,
        screenR: 0,
        visible: false,
      });
    });

    // 2) Exact Shopify single-cube-per-patch (`o.row(m, 1, M, v, n)`):
    //    ONE isolated cube per patch so two cubes NEVER touch or overlap!
    this.cubes = [];
    const patchStep = 1120;
    const patchCount = Math.max(3, Math.ceil(targetH / patchStep));
    for (let ci = 0; ci < patchCount; ci++) {
      const side: -1 | 1 = ci % 2 === 0 ? 1 : -1;
      const baseDocY = 480 + ci * patchStep;
      const isSmall = seededHash(ci * 23 + 4) < 0.45;
      this.cubes.push({
        id: ci,
        clusterId: ci,
        side,
        gx: 2,
        gy: 1,
        maxGx: 5,
        maxGy: 4,
        baseDocY,
        sizeScale: isSmall ? 0.62 : 1.0,
        rolling: false,
        bump: false,
        rollDirIdx: Math.floor(seededHash(ci * 13 + 1) * 4),
        rollProgress: 0,
        rollDur: 0.78,
        rollsLeft: 0,
        pauseLeft: 1.4 + seededHash(ci * 19) * 3.6,
        hoverAmount: 0,
        leanDirIdx: 0,
        screenX: 0,
        screenY: 0,
        screenR: 0,
        visible: false,
      });
    }
  }

  getFloatsCount(): number {
    return this.floats.length;
  }

  getCubesCount(): number {
    return this.cubes.length;
  }

  getCubeClusterIds(): number[] {
    return this.cubes.map((c) => c.clusterId);
  }

  getFloatAngles(index: number): { yaw: number; pitch: number } {
    const f = this.floats[index];
    return f ? { yaw: f.yaw, pitch: f.over } : { yaw: 0, pitch: 0 };
  }

  getFloatWarp(index: number): { wx: number; wy: number } {
    const f = this.floats[index];
    return f ? { wx: f.warp.x, wy: f.warp.y } : { wx: 0, wy: 0 };
  }

  isDragging(): boolean {
    return this.grab !== null;
  }

  getCursor(): string {
    if (this.grab) return 'grabbing';
    if (this.hoveredKind === 'float') return 'grab';
    if (this.hoveredKind === 'cube') return 'pointer';
    return '';
  }

  onPointerDown(screenX: number, screenY: number): boolean {
    this.suppressNextClick = false;
    const t = nowClockMs();
    for (const f of this.floats) {
      if (!f.visible || f.screenR < 8) continue;
      if (Math.hypot(screenX - f.screenX, screenY - f.screenY) <= f.screenR * 1.25) {
        f.vy = 0;
        f.vo = 0;
        this.grab = {
          id: f.id,
          r: Math.max(20, f.screenR),
          x: screenX,
          y: screenY,
          far: 0,
          trail: [[t, f.yaw, f.over]],
        };
        return true;
      }
    }
    return false;
  }

  onPointerMove(screenX: number, screenY: number): boolean {
    const now = nowClockMs();

    // Active drag-to-orbit (`Gf.dragTo`)
    if (this.grab) {
      const f = this.floats.find((item) => item.id === this.grab!.id);
      if (f) {
        const gain = 1.5 / this.grab.r;
        const dx = screenX - this.grab.x;
        const dy = screenY - this.grab.y;
        f.yaw += dx * gain;
        f.over += dy * gain;
        this.grab.far += Math.hypot(dx, dy);
        this.grab.x = screenX;
        this.grab.y = screenY;
        this.grab.trail = [...this.grab.trail.filter(([ts]) => now - ts < 100), [now, f.yaw, f.over]];
        this.hoveredKind = 'float';
        return true;
      }
    }

    // Shopify `Gf.hover`: elastic cursor-velocity disturbance (`push` + Gaussian `warp` + `dent` + `rings` + `glow`)
    const prev = this.lastHover;
    this.lastHover = [screenX, screenY, now];
    this.hoveredKind = 'none';

    let hitFloat: FloatState | null = null;
    let bestDist = Infinity;
    for (const f of this.floats) {
      if (!f.visible || f.screenR < 8) continue;
      const d = Math.hypot(screenX - f.screenX, screenY - f.screenY);
      if (d <= f.screenR * 1.2 && d < bestDist) {
        bestDist = d;
        hitFloat = f;
      }
    }

    for (const f of this.floats) {
      if (f !== hitFloat) f.glowOn = false;
    }

    let hit = false;
    if (hitFloat) {
      hit = true;
      this.hoveredKind = 'float';
      const r = Math.max(20, hitFloat.screenR);
      const cx = (screenX - hitFloat.screenX) / r;
      const cy = (screenY - hitFloat.screenY) / r;
      hitFloat.glowX = cx;
      hitFloat.glowY = cy;
      hitFloat.glowOn = true;

      const lastRing = hitFloat.rings[hitFloat.rings.length - 1];
      if (!lastRing || now - lastRing[2] >= GF_RIPPLE.every * 1000) {
        hitFloat.rings.push([cx, cy, now]);
        if (hitFloat.rings.length > GF_RIPPLE.most) hitFloat.rings.shift();
      }

      const dt = prev ? (now - prev[2]) / 1000 : 0;
      if (prev && dt > 0 && dt <= 0.1) {
        const dx = (screenX - prev[0]) / r;
        const dy = (screenY - prev[1]) / r;
        pokeSpring2D(hitFloat.push, cx, cy, dx, dy, dt, GF_PUSH_GAIN, GF_PUSH_MAX);
        pokeSpring2D(hitFloat.warp, cx, cy, dx, dy, dt, GF_WARP_GAIN, GF_WARP_MAX);
        const u = 1 - Math.exp(-14 * dt);
        hitFloat.dentX += (cx - hitFloat.dentX) * u;
        hitFloat.dentY += (cy - hitFloat.dentY) * u;
      }
    }

    for (const c of this.cubes) {
      if (!c.visible || c.screenR < 5) continue;
      const d = Math.hypot(screenX - c.screenX, screenY - c.screenY);
      if (d <= c.screenR * 1.45) {
        const kx = screenX - c.screenX;
        const ky = screenY - c.screenY;
        c.leanDirIdx = Math.abs(kx) >= Math.abs(ky) ? (kx >= 0 ? 0 : 2) : (ky >= 0 ? 1 : 3);
        c.hoverAmount = Math.min(1, c.hoverAmount + 0.35);
        if (!hit) {
          hit = true;
          this.hoveredKind = 'cube';
        }
      }
    }

    return hit;
  }

  onPointerUp(): boolean {
    const g = this.grab;
    this.grab = null;
    if (!g) return false;
    const f = this.floats.find((item) => item.id === g.id);
    const now = nowClockMs();
    if (f) {
      if (g.far < 4) {
        // Quick tap pop (`Gf.letGo`)
        f.popTimeMs = now;
        f.vy = GF_CLICK_SPIN;
        f.rings.push([f.glowX, f.glowY, now]);
        if (f.rings.length > GF_RIPPLE.most) f.rings.shift();
      } else if (g.trail.length >= 2) {
        const [lastT] = g.trail[g.trail.length - 1];
        const [firstT, firstYaw, firstOver] = g.trail[0];
        const span = (lastT - firstT) / 1000;
        if (now - lastT < 50 && span > 0.01) {
          f.vy = clamp((f.yaw - firstYaw) / span, -GF_MAX_SPIN, GF_MAX_SPIN);
          f.vo = clamp((f.over - firstOver) / span, -GF_MAX_SPIN, GF_MAX_SPIN);
        }
      }
    }
    this.suppressNextClick = true;
    return true;
  }

  onPointerLeave() {
    this.lastHover = null;
    for (const f of this.floats) f.glowOn = false;
    if (!this.grab) this.hoveredKind = 'none';
  }

  onClick(screenX: number, screenY: number): boolean {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return true;
    }

    // Click on a cube -> smooth 2-step tumble knock (no teleport)
    for (const c of this.cubes) {
      if (!c.visible || c.screenR < 5) continue;
      if (Math.hypot(screenX - c.screenX, screenY - c.screenY) <= c.screenR * 1.5) {
        const kx = c.screenX - screenX;
        const ky = c.screenY - screenY;
        const preferred = Math.abs(kx) >= Math.abs(ky) ? (kx >= 0 ? 0 : 2) : (ky >= 0 ? 1 : 3);
        this.triggerCubeRoll(c, true, preferred);
        return true;
      }
    }

    return false;
  }

  kickFloat(index: number) {
    const f = this.floats[index];
    if (!f) return;
    f.popTimeMs = nowClockMs();
    f.vy = GF_CLICK_SPIN;
    pokeSpring2D(f.warp, 0.2, 0.1, 0.5, -0.3, 0.016, GF_WARP_GAIN, GF_WARP_MAX);
  }

  private canCubeMove(c: CubeActor, dirIdx: number): boolean {
    const [dx, dy] = CUBE_DIRS[dirIdx];
    const nx = c.gx + dx;
    const ny = c.gy + dy;
    return nx >= 0 && ny >= 0 && nx < c.maxGx && ny < c.maxGy;
  }

  private triggerCubeRoll(c: CubeActor, fromClick: boolean, preferredDir?: number) {
    if (c.rolling) {
      if (fromClick && !c.bump) c.rollsLeft = Math.min(2, c.rollsLeft + 1);
      return;
    }

    const candidates = preferredDir !== undefined
      ? [preferredDir, (preferredDir + 1) % 4, (preferredDir + 3) % 4, (preferredDir + 2) % 4]
      : [
          c.rollDirIdx,
          (c.rollDirIdx + (seededHash(c.id * 17 + c.gx * 5 + c.gy * 3) < 0.5 ? 1 : 3)) % 4,
          (c.rollDirIdx + 2) % 4,
        ];

    for (const dirIdx of candidates) {
      if (this.canCubeMove(c, dirIdx)) {
        c.rolling = true;
        c.bump = false;
        c.rollDirIdx = dirIdx;
        c.rollProgress = 0;
        c.rollDur = fromClick ? 0.35 : 0.8;
        c.rollsLeft = fromClick ? 1 : 0;
        return;
      }
    }

    if (fromClick) {
      c.rolling = true;
      c.bump = true;
      c.rollDirIdx = preferredDir ?? 0;
      c.rollProgress = 0;
      c.rollDur = 0.35;
      c.rollsLeft = 0;
    }
  }

  step(dt: number) {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    const now = nowClockMs();

    for (const f of this.floats) {
      const decay = Math.exp(-GF_DAMP * clampedDt);
      if (this.grab?.id !== f.id) {
        f.yaw += (f.vy * (1 - decay)) / GF_DAMP;
        f.over += (f.vo * (1 - decay)) / GF_DAMP;
        f.vy *= decay;
        f.vo *= decay;
      }
      stepSpring2D(f.push, clampedDt, GF_PUSH_FREQ, GF_PUSH_ZETA);
      stepSpring2D(f.warp, clampedDt, GF_WARP_FREQ, GF_WARP_ZETA);
      f.glowK += ((f.glowOn ? 1 : 0) - f.glowK) * (1 - Math.exp(-8 * clampedDt));
      if (!f.glowOn && f.glowK < 0.003) f.glowK = 0;
      if (f.rings.length > 0) {
        f.rings = f.rings.filter(([, , ts]) => now - ts < GF_RIPPLE.life * 1000);
      }
    }

    for (const c of this.cubes) {
      c.hoverAmount = Math.max(0, c.hoverAmount - clampedDt * 2.4);

      if (c.rolling) {
        c.rollProgress += clampedDt / Math.max(0.12, c.rollDur);
        if (c.rollProgress >= 1) {
          if (!c.bump) {
            const [dx, dy] = CUBE_DIRS[c.rollDirIdx];
            c.gx = clamp(c.gx + dx, 0, c.maxGx - 1);
            c.gy = clamp(c.gy + dy, 0, c.maxGy - 1);
          }
          c.rolling = false;
          c.bump = false;
          c.rollProgress = 0;
          if (c.rollsLeft > 0 && this.canCubeMove(c, c.rollDirIdx)) {
            c.rollsLeft--;
            c.rolling = true;
            c.rollProgress = 0;
          } else {
            c.rollsLeft = 0;
            c.pauseLeft = 1.6 + seededHash(c.id * 11 + c.gx * 7 + c.gy) * 3.8;
          }
        }
      } else if (c.hoverAmount < 0.1) {
        c.pauseLeft -= clampedDt;
        if (c.pauseLeft <= 0) {
          this.triggerCubeRoll(c, false);
        }
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    frame: CurveFrame,
    scrollY: number,
    docHeight: number,
    groups: readonly RulerGroupMark[],
    timeSec: number,
    palette: PropsPalette,
    occluders?: PropsOccluders,
  ) {
    if (frame.fade <= 0.01) return;
    this.ensureLayout(docHeight);

    const hasRaisedCovers = !!(occluders && occluders.coverPaths.length > 0);
    if (hasRaisedCovers) {
      ctx.save();
      for (const p of occluders!.coverPaths) ctx.clip(p, 'evenodd');
    }
    drawRulers(ctx, frame, scrollY, docHeight, groups, palette);
    drawFormulas(ctx, frame, scrollY, docHeight, timeSec, palette);
    this.renderCubes(ctx, frame, scrollY, palette);
    if (hasRaisedCovers) {
      ctx.restore();
    }
    this.renderFloats(ctx, frame, scrollY, timeSec, palette, occluders);
  }

  private renderCubes(
    ctx: CanvasRenderingContext2D,
    frame: CurveFrame,
    scrollY: number,
    palette: PropsPalette,
  ) {
    const baseAlpha = frame.fade * 0.34;
    if (baseAlpha <= 0.01) return;

    const unitSize = Math.max(22, frame.W / 30);
    const outGap = Math.max(76, frame.W * 0.085);
    const easeInOutQuad = (u: number) => (u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2);

    for (const c of this.cubes) {
      c.visible = false;
      const s = unitSize * c.sizeScale;
      const half = s * 0.5;
      const docY = c.baseDocY + (c.gy + 0.5) * s;
      const row = docY - scrollY + frame.lead;
      if (row < -140 || row > frame.T + 140) continue;

      const patchOriginCol = c.side < 0 ? -outGap - c.maxGx * s : frame.W + outGap;
      const baseCol = patchOriginCol + (c.gx + 0.5) * s;

      const [dx, dy] = CUBE_DIRS[c.rolling ? c.rollDirIdx : c.leanDirIdx];
      let ang = 0;
      if (c.rolling) {
        const u = clamp(c.rollProgress, 0, 1);
        ang = c.bump ? 0.5 * (Math.PI * 0.5) * Math.sin(Math.PI * u) : (Math.PI * 0.5) * easeInOutQuad(u);
      } else if (c.hoverAmount > 0.005) {
        ang = 6 * DEG * c.hoverAmount;
      }

      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const rollLocal = (lx: number, ly: number, lz: number): Vec3 => {
        if (ang <= 1e-5) return [baseCol + lx, row + ly, lz];
        const px = dx * half;
        const py = dy * half;
        const rx = lx - px;
        const ry = ly - py;
        const along = rx * dx + ry * dy;
        const perpX = rx - along * dx;
        const perpY = ry - along * dy;
        const nAlong = along * ca + lz * sa;
        const nZ = -along * sa + lz * ca;
        return [
          baseCol + px + perpX + nAlong * dx,
          row + py + perpY + nAlong * dy,
          Math.max(0, nZ),
        ];
      };

      const rolledCenter = rollLocal(0, 0, half);
      const centerP = projectPoint(frame, rolledCenter[0], rolledCenter[1], rolledCenter[2]);
      if (!centerP || centerP.x < -120 || centerP.x > frame.W + 120 || centerP.y < -120 || centerP.y > frame.H + 120) {
        continue;
      }

      const edgeP = projectPoint(frame, rolledCenter[0] + half, rolledCenter[1], rolledCenter[2]);
      const radPx = edgeP ? Math.max(10, Math.hypot(edgeP.x - centerP.x, edgeP.y - centerP.y) * 1.35) : 16;
      c.screenX = centerP.x;
      c.screenY = centerP.y;
      c.screenR = radPx;
      c.visible = true;

      const localVerts: Vec3[] = [];
      for (let i = 0; i < 8; i++) {
        const lx = (i & 1 ? 1 : -1) * half;
        const ly = (i & 2 ? 1 : -1) * half;
        const lz = i & 4 ? s : 0;
        localVerts.push(rollLocal(lx, ly, lz));
      }

      drawWireCube(ctx, frame, localVerts, baseCol, row, palette.inkRgb, baseAlpha, c.hoverAmount);
    }
  }

  /** Verbatim Shopify `If()` float renderer with local Gaussian warp/dent disturbance, spring push, and alpha ripple (constant hairline stroke, zero big vertex dots). */
  private renderFloats(
    ctx: CanvasRenderingContext2D,
    frame: CurveFrame,
    scrollY: number,
    timeSec: number,
    palette: PropsPalette,
    occluders?: PropsOccluders,
  ) {
    const baseAlpha = frame.fade * 0.72;
    if (baseAlpha <= 0.01) return;

    const now = nowClockMs();
    const [ir, ig, ib] = palette.inkRgb;
    const sizeBase = clamp(frame.W * 0.175, 138, 272);
    const liftBase = clamp(frame.H * 0.11, 68, 125);

    ctx.save();
    if (occluders && occluders.coverPaths.length > 0) {
      for (const p of occluders.coverPaths) ctx.clip(p, 'evenodd');
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.9; // Strictly constant hairline stroke — never thickens on hover!

    for (const f of this.floats) {
      f.visible = false;
      const row = f.docY - scrollY + frame.lead;
      if (row < -260 || row > frame.T + 260) continue;

      const sz = sizeBase * f.sizeMul;
      const col = f.side < 0 ? -frame.W * 0.165 - sz * 0.2 : frame.W + frame.W * 0.165 + sz * 0.2;
      const lift = liftBase + frame.H * 0.032 * Math.sin(timeSec * 0.6 + f.id) ;

      const zCenter = projectPoint(frame, col, row, lift);
      const pRight = projectPoint(frame, col + sz * 0.5, row, lift);
      if (!zCenter || !pRight) continue;
      if (zCenter.x < -sz || zCenter.x > frame.W + sz || zCenter.y < -sz || zCenter.y > frame.H + sz) continue;

      const screenR = Math.max(24, 0.85 * Math.hypot(pRight.x - zCenter.x, pRight.y - zCenter.y));
      f.screenX = zCenter.x + f.push.x * screenR;
      f.screenY = zCenter.y + f.push.y * screenR;
      f.screenR = screenR;
      f.visible = true;

      // Exact Shopify Jacobian mapping from screen-space push/warp into 3D world space!
      const j = sz * 0.5;
      const hasWarp = f.push.x !== 0 || f.push.y !== 0 || f.warp.x !== 0 || f.warp.y !== 0;
      const hasFx = f.glowK > 0.003 || f.rings.length > 0;
      const pUp = hasWarp || hasFx ? projectPoint(frame, col, row, lift + j) : null;
      const pRow = pUp ? projectPoint(frame, col, row + j, lift) : null;
      const hasJac = !!(pUp && pRow);

      const nt = hasJac ? (pRight.x - zCenter.x) / j : 0;
      const U = hasJac ? (pRight.y - zCenter.y) / j : 0;
      const V = hasJac ? (pRow!.x - zCenter.x) / j : 0;
      const Z = hasJac ? (pRow!.y - zCenter.y) / j : 0;
      const et = hasJac ? (pUp!.x - zCenter.x) / j : 0;
      const lt = hasJac ? (pUp!.y - zCenter.y) / j : 0;
      const det = nt * lt - et * U;
      const invDet = Math.abs(det) > 1e-6 ? screenR / det : 0;

      const pushCol = invDet * (f.push.x * lt - f.push.y * et);
      const pushZ = invDet * (nt * f.push.y - U * f.push.x);
      const warpCol = invDet * (f.warp.x * lt - f.warp.y * et);
      const warpZ = invDet * (nt * f.warp.y - U * f.warp.x);
      const doWarp = warpCol !== 0 || warpZ !== 0;

      const popElapsed = (now - f.popTimeMs) / 1000;
      const popScale = 1 + (popElapsed >= 0 && popElapsed < 1 ? GF_POP_SCALE * Math.exp(-7 * popElapsed) * Math.sin(20 * popElapsed) : 0);
      const scale = sz * popScale;

      // Ground drop shadow
      const shadowP = projectPoint(frame, col + pushCol + 24, row + 18, 0.5);
      if (shadowP) {
        ctx.fillStyle = `rgba(${ir},${ig},${ib},${(frame.fade * 0.055).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(shadowP.x, shadowP.y, screenR * 0.62, screenR * 0.22, 0, 0, TWO_PI);
        ctx.fill();
      }

      const yaw = timeSec * 0.28 + f.id * 1.7 + f.yaw;
      const over = 0.45 + 0.2 * Math.sin(timeSec * 0.2 + f.id) + f.over;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(over);
      const sp = Math.sin(over);

      const evalSpark = (nx: number, ny: number): number => {
        let s = 0;
        if (f.glowK > 0.003) {
          s += f.glowK * Math.exp(-((nx - f.glowX) ** 2 + (ny - f.glowY) ** 2) / (GF_RIPPLE.glow * GF_RIPPLE.glow));
        }
        for (const [rx, ry, ts] of f.rings) {
          const age = Math.max(0, (now - ts) / 1000);
          const dist = Math.hypot(nx - rx, ny - ry) - GF_RIPPLE.speed * age;
          s += Math.exp(-age / GF_RIPPLE.fade - (dist / GF_RIPPLE.width) ** 2);
        }
        return clamp(s, 0, 1);
      };

      const polylines = getPolyhedronEdges(f.shape, timeSec + f.id * 0.7);
      const mapPt = (p: Vec3): { sx: number; sy: number; spark: number } | null => {
        const xe = p[0] * cy - p[1] * sy;
        const me = p[0] * sy + p[1] * cy;
        const ft = me * cp - p[2] * sp;
        const ve = me * sp + p[2] * cp;

        let vt = xe * scale;
        const rtY = -ft * scale;
        let itZ = ve * scale;

        // Exact Shopify local Gaussian cursor-velocity wireframe disturbance!
        if (doWarp && hasJac) {
          const ce = (nt * vt + V * rtY + et * itZ) / screenR - f.dentX;
          const le = (U * vt + Z * rtY + lt * itZ) / screenR - f.dentY;
          const gWeight = Math.exp(-(ce * ce + le * le) / (GF_WARP_SIGMA * GF_WARP_SIGMA));
          vt += gWeight * warpCol;
          itZ += gWeight * warpZ;
        }

        const pr = projectPoint(frame, col + pushCol + vt, row + rtY, lift + pushZ + itZ);
        if (!pr) return null;
        const spark = hasFx && hasJac
          ? evalSpark((nt * vt + V * rtY + et * itZ) / screenR, (U * vt + Z * rtY + lt * itZ) / screenR)
          : 0;
        return { sx: pr.x, sy: pr.y, spark };
      };

      if (!hasFx) {
        ctx.strokeStyle = `rgba(${ir},${ig},${ib},${(baseAlpha * 0.85).toFixed(3)})`;
        ctx.beginPath();
        for (const poly of polylines) {
          let started = false;
          for (const p of poly) {
            const pt = mapPt(p);
            if (!pt) {
              started = false;
              continue;
            }
            if (!started) {
              ctx.moveTo(pt.sx, pt.sy);
              started = true;
            } else {
              ctx.lineTo(pt.sx, pt.sy);
            }
          }
        }
        ctx.stroke();
      } else {
        for (const poly of polylines) {
          let prevPt: { sx: number; sy: number; spark: number } | null = null;
          for (const p of poly) {
            const pt = mapPt(p);
            if (prevPt && pt) {
              const spk = Math.max(prevPt.spark, pt.spark);
              const segAlpha = frame.fade * (0.62 + spk * 0.36);
              ctx.strokeStyle = `rgba(${ir},${ig},${ib},${segAlpha.toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(prevPt.sx, prevPt.sy);
              ctx.lineTo(pt.sx, pt.sy);
              ctx.stroke();
            }
            prevPt = pt;
          }
        }
      }
    }

    ctx.restore();
  }
}
