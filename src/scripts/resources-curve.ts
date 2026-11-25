const DEG = Math.PI / 180;

export const CURVE_CONFIG = {
  nodes: 64,
  below: 4,
  foldDeg: 80,
  face: 1,
  sharpness: 6.54,
  fovFlatDeg: 50,
  fov3DDeg: 45,
  heightRatio: 1.015,
  backRatio: -1,
  pitch3DDeg: -30.2,
  riseAt: 0.35,
  shade: 0.215,
  durationMs: 800,
  tiltDeg: 55,
  tiltDurationMs: 350,
  tiltFade: 0.65,
  slabDepth: 6,
  cityGrow: 0.65,
  slabShadow: 0.72,
  headingStandDeg: 90,
  headingRaise: 28,
  headingFloat: 18,
  titleScale3D: 1.24,
  keyAzimuthDeg: -41,
  keyElevationDeg: 35,
} as const;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOutCubic = (t: number) => {
  const u = clamp(t, 0, 1);
  return u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2;
};
export const easeOutQuart = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 4;

export interface CurveProfile {
  T: number;
  ds: number;
  pts: Float32Array;
  seg: Float32Array;
}

export interface CurveFrame {
  W: number;
  H: number;
  T: number;
  ds: number;
  pts: Float32Array;
  ang: Float32Array;
  e: number;
  rise: number;
  fade: number;
  focusRow: number;
  fov: number;
  camY: number;
  camZ: number;
  pitch: number;
  lead: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  th: number;
  z: number;
}

export interface ResourceCardLayout {
  id: number;
  el: HTMLElement;
  x0: number;
  x1: number;
  docTop: number;
  docBottom: number;
  width: number;
  height: number;
  name: string;
  summary: string;
  detail: string;
  badge: string;
  cta: string;
  code: string;
  href: string;
  tags: string[];
  coverUrl: string;
  images?: string[];
  wide: boolean;
  groupIdx: number;
  depthScale?: number;
}

export interface BannerTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  lineHeight: number;
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
}

export interface ResourceBannerLayout {
  key: string;
  kind: 'hero' | 'group' | 'note';
  x0: number;
  x1: number;
  docTop: number;
  docBottom: number;
  width: number;
  height: number;
  eyebrow: string;
  note: string;
  meta: string;
  items: BannerTextItem[];
  onAltBand?: boolean;
}

export interface ResourceTitleLayout {
  id: number;
  key: string;
  el: HTMLElement;
  text: string;
  x0: number;
  x1: number;
  docTop: number;
  docBottom: number;
  baselineY: number;
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  charCenters?: number[];
  isHero: boolean;
}

export interface ResourceBandSpan {
  docTop: number;
  docBottom: number;
  alt: boolean;
}

export interface ResourceRenderState {
  frame: CurveFrame;
  scrollY: number;
  pageColor: [number, number, number];
  cards: ResourceCardLayout[];
  banners: ResourceBannerLayout[];
  titles: ResourceTitleLayout[];
  bands: ResourceBandSpan[];
  hoveredCardId: number;
  raisedCardId: number;
  copiedCardId: number;
  tiltByCard: Map<number, number>;
  titleAngles: Map<number, Float32Array>;
  dimAmount: number;
  timeSec: number;
  paperEndDocY: number;
}

export interface Resources3DRenderer {
  readonly backend: 'webgpu-hic' | 'webgpu' | 'webgl2';
  refreshTheme(fastPreview?: boolean, mixedOverrides?: Record<string, string>): void;
  resize(pxW: number, pxH: number): void;
  render(state: ResourceRenderState, dpr: number): void;
  dispose(): void;
}

export function isHtmlInCanvasSupported(): boolean {
  if (typeof HTMLCanvasElement === 'undefined' || typeof navigator === 'undefined') return false;
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  const gl2Proto = typeof WebGL2RenderingContext !== 'undefined'
    ? (WebGL2RenderingContext.prototype as unknown as { texElementImage2D?: { length?: number } })
    : undefined;
  const gpuQueueProto = typeof GPUQueue !== 'undefined'
    ? (GPUQueue.prototype as unknown as Record<string, unknown>)
    : undefined;
  return (
    'requestPaint' in proto &&
    gl2Proto?.texElementImage2D?.length !== 6 &&
    'gpu' in navigator &&
    typeof gpuQueueProto !== 'undefined' &&
    ('drawElementImageToTexture' in gpuQueueProto || 'copyElementImageToTexture' in gpuQueueProto)
  );
}

function zHorizonRatio(): number {
  const ang = (-CURVE_CONFIG.pitch3DDeg + CURVE_CONFIG.fov3DDeg / 2) * DEG;
  const clamped = clamp(ang, 0.001, Math.PI - 0.001);
  return Math.min(CURVE_CONFIG.backRatio, CURVE_CONFIG.heightRatio / Math.tan(clamped) - 0.02);
}

export function buildProfile(e: number, H: number): CurveProfile {
  const N = CURVE_CONFIG.nodes;
  const T = (1 + CURVE_CONFIG.below) * H;
  const ds = T / N;
  const sharp = CURVE_CONFIG.sharpness;
  const ramp = (u: number) => (sharp > 0.001 ? Math.expm1(sharp * u) / Math.expm1(sharp) : u);
  const eyeY = CURVE_CONFIG.heightRatio * H;
  const eyeZ = zHorizonRatio() * H;
  const pts = new Float32Array((N + 1) * 2);
  const seg = new Float32Array(N);

  for (let h = 0, p = 0, f = 0; h < N; h++) {
    const d = Math.PI / 2 + Math.atan2(p - eyeY, eyeZ - f);
    const g = e * ramp((h + 0.5) / N) * lerp(CURVE_CONFIG.foldDeg * DEG, d, CURVE_CONFIG.face);
    p += Math.sin(g) * ds;
    f -= Math.cos(g) * ds;
    pts[h * 2 + 2] = p;
    pts[h * 2 + 3] = f;
    seg[h] = g;
  }

  return { T, ds, pts, seg };
}

function sampleProfile({ T, ds, pts }: { T: number; ds: number; pts: Float32Array }, row: number): [number, number] {
  const N = CURVE_CONFIG.nodes;
  const o = clamp((T - row) / ds, 0, N);
  const r = Math.min(Math.floor(o), N - 1);
  const i = o - r;
  return [lerp(pts[r * 2], pts[r * 2 + 2], i), lerp(pts[r * 2 + 1], pts[r * 2 + 3], i)];
}

export function findFocus(H: number): { row: number; dist: number } {
  const profile = buildProfile(1, H);
  const N = CURVE_CONFIG.nodes;
  const pitch = CURVE_CONFIG.pitch3DDeg * DEG;
  const s = Math.sin(pitch);
  const o = -Math.cos(pitch);
  const eyeY = CURVE_CONFIG.heightRatio * H;
  const eyeZ = zHorizonRatio() * H;

  for (let a = 0; a < N; a++) {
    const cx = profile.pts[a * 2];
    const cz = profile.pts[a * 2 + 1];
    const hx = profile.pts[a * 2 + 2] - cx;
    const pz = profile.pts[a * 2 + 3] - cz;
    const denom = s * pz - o * hx;
    if (Math.abs(denom) < 1e-9) continue;
    const dx = cx - eyeY;
    const dz = cz - eyeZ;
    const u = (o * dx - s * dz) / denom;
    const dist = (pz * dx - hx * dz) / denom;
    if (u >= 0 && u <= 1 && dist > 0) {
      return { row: profile.T - (a + u) * profile.ds, dist };
    }
  }
  return { row: H / 2, dist: H };
}

export function computeLead(H: number): number {
  return findFocus(H).row - H / 2;
}

export function computeCurveFrame(t: number, W: number, H: number, lead = computeLead(H)): CurveFrame {
  const N = CURVE_CONFIG.nodes;
  const clampedT = clamp(t, 0, 1);
  const e = easeInOutCubic(clampedT);
  const rise = easeInOutCubic(clamp((clampedT - CURVE_CONFIG.riseAt) / (1 - CURVE_CONFIG.riseAt), 0, 1));
  const fade = clamp(clampedT * 3, 0, 1);
  const fovFlat = CURVE_CONFIG.fovFlatDeg * DEG;
  const flatDist = H / 2 / Math.tan(fovFlat / 2);
  const profile = buildProfile(e, H);
  const focus = findFocus(H);
  const ang = new Float32Array(N + 1);
  for (let u = 0; u <= N; u++) {
    ang[u] = (profile.seg[Math.max(0, u - 1)] + profile.seg[Math.min(N - 1, u)]) / 2;
  }

  const focusRow = lead + H / 2;
  const [py, pz] = sampleProfile(profile, focusRow);
  const pitch = lerp(-90 * DEG, CURVE_CONFIG.pitch3DDeg * DEG, e);
  const dist = lerp(flatDist, focus.dist, e);

  return {
    W,
    H,
    T: profile.T,
    ds: profile.ds,
    pts: profile.pts,
    ang,
    e,
    rise,
    fade,
    focusRow,
    fov: lerp(fovFlat, CURVE_CONFIG.fov3DDeg * DEG, e),
    camY: py - dist * Math.sin(pitch),
    camZ: pz + dist * Math.cos(pitch),
    pitch,
    lead,
  };
}

export function projectPoint(frame: CurveFrame, col: number, row: number, elev = 0): ProjectedPoint | null {
  const N = CURVE_CONFIG.nodes;
  const o = clamp((frame.T - row) / frame.ds, 0, N);
  const r = Math.min(Math.floor(o), N - 1);
  const i = o - r;
  const th = lerp(frame.ang[r], frame.ang[r + 1], i);
  const lift = elev * frame.rise;
  const ly = lerp(frame.pts[r * 2], frame.pts[r * 2 + 2], i) + lift * Math.cos(th) - frame.camY;
  const lz = lerp(frame.pts[r * 2 + 1], frame.pts[r * 2 + 3], i) + lift * Math.sin(th) - frame.camZ;
  const cp = Math.cos(frame.pitch);
  const sp = Math.sin(frame.pitch);
  const tanHalf = Math.tan(frame.fov / 2);
  const zf = ly * sp - lz * cp;
  const yu = ly * cp + lz * sp;
  if (zf < 4) return null;
  const aspect = frame.W / Math.max(1, frame.H);
  return {
    x: (((col - frame.W / 2) / (tanHalf * aspect)) / zf + 1) * (frame.W / 2),
    y: (1 - yu / tanHalf / zf) * (frame.H / 2),
    th,
    z: zf,
  };
}

export function unprojectPoint(
  frame: CurveFrame,
  screenX: number,
  screenY: number,
  elev = 0,
  guess?: [number, number],
): [number, number] | null {
  let col = guess?.[0] ?? frame.W * 0.5;
  let row = guess?.[1] ?? frame.focusRow;

  if (!guess) {
    let bestRow = frame.focusRow;
    let bestErr = Infinity;
    for (let k = 0; k <= 36; k++) {
      const candidate = (k / 36) * frame.T;
      const p = projectPoint(frame, col, candidate, elev);
      if (!p) continue;
      const err = Math.abs(p.y - screenY);
      if (err < bestErr) {
        bestErr = err;
        bestRow = candidate;
      }
    }
    row = bestRow;
  }

  for (let i = 0; i < 6; i++) {
    const a = projectPoint(frame, col, row, elev);
    const c = projectPoint(frame, col + 1, row, elev);
    const l = projectPoint(frame, col, row + 1, elev);
    if (!a || !c || !l) return null;
    const h = c.x - a.x;
    const p = l.x - a.x;
    const f = c.y - a.y;
    const d = l.y - a.y;
    const det = h * d - p * f;
    if (Math.abs(det) < 1e-8) break;
    const u = screenX - a.x;
    const m = screenY - a.y;
    col += (d * u - p * m) / det;
    row += (h * m - f * u) / det;
  }

  return Number.isFinite(col) && Number.isFinite(row) ? [col, row] : null;
}

export function stripRows(frame: CurveFrame, r0: number, r1: number): number[] {
  const out = [r0];
  const startK = Math.ceil((frame.T - r1) / frame.ds);
  for (let k = startK; k * frame.ds < frame.T - r0; k++) {
    const row = frame.T - k * frame.ds;
    if (row > r0 && row < r1) out.push(row);
  }
  out.push(r1);
  out.sort((a, b) => a - b);
  return out;
}

export function hingePoint(
  col: number,
  alongFromBottom: number,
  zThick: number,
  r1: number,
  base: number,
  tiltRad: number,
): [number, number, number] {
  const c = Math.cos(tiltRad);
  const s = Math.sin(tiltRad);
  return [
    col,
    r1 - alongFromBottom * c + zThick * s,
    base + alongFromBottom * s + zThick * c,
  ];
}

/** Shopify exact wire styling & pulse parameters (from wire-BRlyKbjJ.js + style-CMMBboSm.js). */
export const WIRE_STYLE = {
  width: 0.75,
  pulseWidth: 0.85,
  pulses: 2,
  pulseTail: 0.14,
  pulseSeconds: 2.2,
  fadeStart: 1.0,
  fadeMid: 0.22,
  fadeEnd: 0.85,
  drawInSec: 0.32,
  drawOutSec: 0.24,
  markerRadius: 2.3,
} as const;

/** Shopify exact DesktopNavigation sidebar arc & horizontal rung constants (verbatim from DesktopNavigation-2afpHCEs.js). */
export const RAIL_ARC_CONFIG = {
  arcAlpha: 0.35,
  rungIdleAlpha: 0.1,
  rungPeakAlpha: 0.3,
  lineWidth: 0.75,
  pulseWidth: 0.85,
  pulseTailPx: 36,
  pulseSegments: 6,
  pulseSpeedPx: 260,
  dotOffsetX: 4,
  holdSec: 0.4,
  fadeInHalfLife: 0.06,
  fadeOutHalfLife: 0.14,
  drawInSec: 0.4,
} as const;

export interface RailSemicircle {
  pts: { x: number; y: number }[];
  len: number[];
  total: number;
}

/** Shopify exact Nt(cur, target, dt, halfLife): frame-rate-independent exponential approach. */
export function expApproach(cur: number, target: number, dt: number, halfLife: number): number {
  return target + (cur - target) * 2 ** (-dt / halfLife);
}

/** Shopify exact Wt(from, to, steps=64): true right-bulging semicircle polyline with cumulative arc lengths. */
export function buildRailSemicircle(
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 64,
): RailSemicircle {
  const pts: { x: number; y: number }[] = [];
  const len: number[] = [0];
  const cx = (from.x + to.x) * 0.5;
  const cy = (from.y + to.y) * 0.5;
  const r = Math.abs(to.y - from.y) * 0.5;
  const startAng = to.y > from.y ? -Math.PI * 0.5 : Math.PI * 0.5;
  for (let i = 0; i <= steps; i++) {
    const a = startAng - 2 * startAng * (i / steps);
    const p = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    const prev = pts[pts.length - 1];
    if (prev) len.push(len[len.length - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
    pts.push(p);
  }
  return { pts, len, total: len[len.length - 1] ?? 0 };
}

/** Shopify exact et(arc, dist): interpolate point along semicircle at arc-length distance. */
export function railArcPointAt(arc: RailSemicircle, dist: number): { x: number; y: number } {
  const { pts, len } = arc;
  if (dist <= 0) return pts[0];
  if (dist >= arc.total) return pts[pts.length - 1];
  let idx = 1;
  while (idx < len.length - 1 && len[idx] < dist) idx++;
  const frac = (dist - len[idx - 1]) / (len[idx] - len[idx - 1] || 1);
  return {
    x: pts[idx - 1].x + (pts[idx].x - pts[idx - 1].x) * frac,
    y: pts[idx - 1].y + (pts[idx].y - pts[idx - 1].y) * frac,
  };
}

/** Shopify exact Bt(arc, y): find arc-length where semicircle crosses horizontal line y. */
export function railArcDistAtY(arc: RailSemicircle, y: number): number {
  const { pts, len } = arc;
  for (let i = 1; i < pts.length; i++) {
    if ((y - pts[i - 1].y) * (y - pts[i].y) <= 0) return len[i];
  }
  return 0;
}

/** Shopify exact horizontal-tangent Bezier handle ratio ko(from, to). */
export function wireHandle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.max(0.1, 0.44 / (1 + (Math.abs(to.y - from.y) / Math.max(1, Math.abs(to.x - from.x))) * 0.6));
}

/** Shopify exact 2D screen-space Bezier evaluator Nt(from, to, handle, u). */
export function wireBezierPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  handle: number,
  u: number,
): { x: number; y: number } {
  const o = (to.x - from.x) * handle;
  const h = 1 - u;
  const r = h * h * h;
  const c = 3 * h * h * u;
  const f = 3 * h * u * u;
  const l = u * u * u;
  return {
    x: r * from.x + c * (from.x + o) + f * (to.x - o) + l * to.x,
    y: (r + c) * from.y + (f + l) * to.y,
  };
}

/** Shopify exact mid-wire soft alpha fade js(u): strong at endpoints, airy in the middle. */
export function wireFadeWeight(u: number): number {
  const { fadeStart, fadeMid, fadeEnd } = WIRE_STYLE;
  return u < 0.5 ? fadeStart + (fadeMid - fadeStart) * u * 2 : fadeMid + (fadeEnd - fadeMid) * (u - 0.5) * 2;
}

export interface RaisedCover {
  cardId: number;
  ring: { x: number; y: number }[];
  depthAt: (sx: number, sy: number) => number;
}

/** Shopify exact zu(frame, slabs): projects tilted raised slabs into screen-space occlusion polygons + depth planes. */
export function computeRaisedCovers(
  frame: CurveFrame,
  slabs: { id: number; x0: number; x1: number; r0: number; r1: number; elev: number; tiltRad: number }[],
): RaisedCover[] {
  const covers: RaisedCover[] = [];
  for (const s of slabs) {
    if (s.tiltRad <= 0.05) continue;
    const w = s.x1 - s.x0;
    const h = s.r1 - s.r0;
    if (w < 4 || h < 4) continue;
    const rad = Math.min(14, w * 0.25, h * 0.25);
    const proj = (col: number, along: number) => {
      const p = hingePoint(col, along, s.elev, s.r1, 0, s.tiltRad);
      return projectPoint(frame, p[0], p[1], p[2]);
    };
    const ring: ProjectedPoint[] = [];
    const corners: [number, number, number][] = [
      [s.x0 + rad, rad, Math.PI],
      [s.x1 - rad, rad, 1.5 * Math.PI],
      [s.x1 - rad, h - rad, 0],
      [s.x0 + rad, h - rad, 0.5 * Math.PI],
    ];
    let valid = true;
    for (const [cx, cy, a0] of corners) {
      for (let k = 0; k <= 4; k++) {
        const pt = proj(cx + rad * Math.cos(a0 + (k * Math.PI) / 8), cy + rad * Math.sin(a0 + (k * Math.PI) / 8));
        if (!pt) {
          valid = false;
          break;
        }
        ring.push(pt);
      }
      if (!valid) break;
    }
    const g = proj(s.x0, 0);
    const u = proj(s.x1, 0);
    const m = proj(s.x1, h);
    if (!valid || !g || !u || !m) continue;
    const denom = (u.y - m.y) * (g.x - m.x) + (m.x - u.x) * (g.y - m.y);
    if (Math.abs(denom) < 1e-6) continue;
    const depthAt = (px: number, py: number) => {
      const wa = ((u.y - m.y) * (px - m.x) + (m.x - u.x) * (py - m.y)) / denom;
      const wb = ((m.y - g.y) * (px - m.x) + (g.x - m.x) * (py - m.y)) / denom;
      const invZ = wa / g.z + wb / u.z + (1 - wa - wb) / m.z;
      return invZ > 1e-6 ? 1 / invZ : Infinity;
    };
    covers.push({
      cardId: s.id,
      ring: ring.map((p) => ({ x: p.x, y: p.y })),
      depthAt,
    });
  }
  return covers;
}

/** Transforms a 3D standing letter quad point into curved strip coordinates (col, row, elev). */
export function standingCharPos(
  charCenterX: number,
  localX: number,
  localY: number,
  depthPx: number,
  baseRow: number,
  baseElev: number,
  standRad: number,
  turnRad: number,
  floatPx: number,
): [number, number, number] {
  const ct = Math.cos(turnRad);
  const st = Math.sin(turnRad);
  const rx = localX * ct + depthPx * st;
  const rd = -localX * st + depthPx * ct;

  const cs = Math.cos(standRad);
  const ss = Math.sin(standRad);
  return [
    charCenterX + rx,
    baseRow - localY * cs + rd * ss,
    baseElev + floatPx + localY * ss + rd * cs,
  ];
}

export function keyLightSlope(): [number, number] {
  const az = CURVE_CONFIG.keyAzimuthDeg * DEG;
  const el = Math.max(15, CURVE_CONFIG.keyElevationDeg) * DEG;
  return [(Math.sin(az) * Math.cos(el)) / Math.sin(el), (Math.cos(az) * Math.cos(el)) / Math.sin(el)];
}

export interface CornerIconGeometry {
  solid: string;
  hidden: string;
  curve: string;
  shadow: string;
  tip: [number, number];
}

const fmtCoord = (n: number) => (Math.round(n * 1000) / 1000).toString();
const fmtPair = ([x, y]: [number, number]) => `${fmtCoord(x)} ${fmtCoord(y)}`;
const toPath = (pts: [number, number][]) => `M${pts.map(fmtPair).join('L')}`;

/** Port of Shopify's square-to-3D-cube-with-curved-ramp SVG corner icon morph. */
export function cornerIconPaths(progress: number): CornerIconGeometry {
  const e = clamp(progress, 0, 1);
  const B = 19;
  const tt = 13;
  const et = 24 * DEG;
  const ot = 30 * DEG;
  const expK = 3.2;
  const steps = 32;

  const s = lerp(B, tt, e);
  const a = s * e;
  const d = e * et;
  const k = e * ot;

  const rotate = ([x, y, z]: [number, number, number]): [number, number, number] => {
    const v = x * Math.cos(k) + z * Math.sin(k);
    const b = -x * Math.sin(k) + z * Math.cos(k);
    return [v, y * Math.cos(d) - b * Math.sin(d), y * Math.sin(d) + b * Math.cos(d)];
  };

  const project = ([x, y, z]: [number, number, number]): [number, number] => {
    const [rx, ry] = rotate([x - s / 2, y - s / 2, z + a / 2]);
    return [rx, -ry];
  };

  const visible = (normal: [number, number, number]) => rotate(normal)[2] > 1e-4;
  const corner = (rx: number, ry: number, rz: number): [number, number, number] => [rx * s, ry * s, -rz * a];

  let solid = '';
  let hidden = '';

  if (a < 0.01) {
    solid = `${toPath([corner(0, 0, 0), corner(1, 0, 0), corner(1, 1, 0), corner(0, 1, 0)].map(project))}Z`;
  } else {
    for (const r of [0, 1]) {
      for (const o of [0, 1]) {
        const edges: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]][] = [
          [corner(0, r, o), corner(1, r, o), [0, r ? 1 : -1, 0], [0, 0, o ? -1 : 1]],
          [corner(r, 0, o), corner(r, 1, o), [r ? 1 : -1, 0, 0], [0, 0, o ? -1 : 1]],
          [corner(r, o, 0), corner(r, o, 1), [r ? 1 : -1, 0, 0], [0, o ? 1 : -1, 0]],
        ];
        for (const [m, M, n1, n2] of edges) {
          const seg = toPath([project(m), project(M)]);
          if (visible(n1) || visible(n2)) solid += seg;
          else hidden += seg;
        }
      }
    }
  }

  const u = (3 * s) / B;
  const A = s - u * 2;
  const p = -u * e;
  const R = -(a - u * e);
  const curvePts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const o = i / steps;
    const g = (Math.exp(expK * o) - 1) / (Math.exp(expK) - 1);
    curvePts.push(project([u + o * A, u + g * A, lerp(p, R, o)]));
  }

  return {
    solid,
    hidden,
    curve: toPath(curvePts),
    shadow: toPath([project([u, 0, p]), project([u + A, 0, R])]),
    tip: curvePts[steps],
  };
}

const SPRING_TWO_PI = Math.PI * 2;
const SPRING_NEIGHBOR_DELAY = 0.07;
const SPRING_WAVE_DELAY = 0.05;
const SPRING_NEIGHBOR_KICKS = [0.6 * Math.E, 0.26 * Math.E];
const SPRING_SNAP_DIST = 0.5;
const SPRING_EPS = 0.002;
const MAX_TITLE_CHARS = 48;

/** Exact port of Shopify's `class d1`: 360-degree per-letter hover spin & domino wave ripple. */
export class TitleSpring {
  readonly angles = new Float32Array(MAX_TITLE_CHARS);
  private target = new Float32Array(MAX_TITLE_CHARS);
  private impulse = new Float32Array(MAX_TITLE_CHARS);
  private delay = new Float32Array(MAX_TITLE_CHARS);
  private pendingTarget = new Float32Array(MAX_TITLE_CHARS);
  private pendingImpulse = new Float32Array(MAX_TITLE_CHARS);
  moving = false;

  hover(charIdx: number, count: number, dir = 1) {
    const len = Math.min(count, MAX_TITLE_CHARS);
    if (charIdx < 0 || charIdx >= len) return;
    if (this.pendingTarget[charIdx] || Math.abs(this.target[charIdx] - this.angles[charIdx]) > SPRING_SNAP_DIST) {
      return;
    }
    this.kick(charIdx, 0, dir * SPRING_TWO_PI, 0);
    SPRING_NEIGHBOR_KICKS.forEach((amp, offset) => {
      const d = SPRING_NEIGHBOR_DELAY * (offset + 1);
      if (charIdx - offset - 1 >= 0) this.kick(charIdx - offset - 1, d, 0, dir * amp);
      if (charIdx + offset + 1 < len) this.kick(charIdx + offset + 1, d, 0, dir * amp);
    });
  }

  wave(count: number, dir = 1) {
    const len = Math.min(count, MAX_TITLE_CHARS);
    for (let i = 0; i < len; i++) {
      this.kick(i, SPRING_WAVE_DELAY * i, dir * SPRING_TWO_PI, 0);
    }
  }

  private kick(idx: number, delaySec: number, dTarget: number, dImpulse: number) {
    if (!this.pendingTarget[idx] && !this.pendingImpulse[idx]) {
      this.delay[idx] = delaySec;
    }
    this.pendingTarget[idx] += dTarget;
    this.pendingImpulse[idx] += dImpulse;
    this.moving = true;
  }

  step(dtSec: number): boolean {
    if (!this.moving) return false;
    if (!Number.isFinite(dtSec) || dtSec <= 0) {
      this.angles.fill(0);
      this.target.fill(0);
      this.impulse.fill(0);
      this.delay.fill(0);
      this.pendingTarget.fill(0);
      this.pendingImpulse.fill(0);
      this.moving = false;
      return true;
    }
    const alpha = 1 - Math.exp(-4 * Math.min(dtSec, 0.05));
    let anyMoving = false;
    for (let i = 0; i < MAX_TITLE_CHARS; i++) {
      if (this.delay[i] > 0) {
        this.delay[i] = Math.max(0, this.delay[i] - dtSec);
        anyMoving = true;
      }
      if (this.delay[i] === 0 && (this.pendingTarget[i] || this.pendingImpulse[i])) {
        this.target[i] += this.pendingTarget[i];
        this.impulse[i] += this.pendingImpulse[i];
        this.pendingTarget[i] = 0;
        this.pendingImpulse[i] = 0;
      }
      this.impulse[i] -= this.impulse[i] * alpha;
      const goal = this.target[i] + this.impulse[i];
      if (this.delay[i] === 0 && Math.abs(goal - this.angles[i]) < SPRING_EPS && Math.abs(this.impulse[i]) < SPRING_EPS) {
        this.angles[i] = 0;
        this.target[i] = 0;
        this.impulse[i] = 0;
        continue;
      }
      this.angles[i] += (goal - this.angles[i]) * alpha;
      anyMoving = true;
    }
    this.moving = anyMoving;
    return anyMoving;
  }
}
