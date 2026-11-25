import {
  clamp,
  lerp,
  projectPoint,
  unprojectPoint,
  type CurveFrame,
  type RaisedCover,
} from './resources-curve';
import { drawLyingText } from './resources-props';

const TWO_PI = Math.PI * 2;

/** Verbatim Shopify Editions Fall '26 runway runner game constants (`rt` in htmlInCanvasWebGpu.client-DjAWjC9A.js),
 *  paced cleanly for the `/resources/` runway length while preserving exact physics relationships. */
export const GAME_CONFIG = {
  cruise: 520,
  minSpeed: 350,
  maxSpeed: 940,
  maxReverse: 480,
  accel: 680,
  brake: 1850,
  steer: 3600,
  maxSide: 780,
  bounce: 0.6,
  gravity: 6500,
  fallGravity: 6500,
  incline: 1600,
  friction: 600,
  push: 1650,
  radius: 38,
  growth: 0.05,
  wordGrowth: 0.035,
  maxGrow: 3.3,
  legs: 10,
  legReach: 3.2,
  legStretch: 3.0,
  hop: 1.2,
  jump: 4.0,
  jumpPx: 10,
  holeScale: 2.5,
  wormDepth: 1.0,
  throat: 0.5,
  tube: 2.0,
  flow: 0.8,
  maxVisibleWordChips: 14,
  grades: [
    [0.56, 'A++'],
    [0.52, 'A+'],
    [0.49, 'A'],
    [0.47, 'A-'],
    [0.45, 'B+'],
    [0.43, 'B'],
    [0.41, 'B-'],
    [0.39, 'C+'],
    [0.36, 'C'],
    [0.33, 'C-'],
    [0.3, 'D+'],
    [0.27, 'D'],
    [0.24, 'D-'],
  ] as readonly (readonly [number, string])[],
} as const;

/** Exact Shopify `start ↑` lift & flip constants (`Ae`, `_n` in index-DLZuI34T.js). */
const START_ANIM = {
  restLift: 12,
  hoverLift: 22,
  downLift: 3,
  flipSec: 0.7,
} as const;

/** Exact Shopify leg spring & timing constants (`_p`, `ls` in htmlInCanvasWebGpu.client-DjAWjC9A.js). */
const LEG_PHYS = {
  spring: 300,
  damp: 7,
  gravity: 30,
  foot: 30,
  step: 18,
  give: 5,
  glow: 0.35,
  flySec: 0.28,
  dropSec: 0.26,
  slideSec: 0.45,
  closeSec: 0.35,
  collapseSec: 0.8,
  openSec: 0.5,
} as const;

/** Exact Shopify squash-and-stretch hop spring (`de` in htmlInCanvasWebGpu.client-DjAWjC9A.js). */
const HOP_SPRING = {
  press: 0.28,
  pressSec: 0.1,
  damp: 25,
  riseSec: 0.3,
  impact: 6,
  bounce: 0.35,
  settle: 0.4,
} as const;

/** Verbatim Shopify ambient spider force-graph physics (`ah`, `qs`, `Zs`, `ih`, `ch`, `lh`, `hh`, `De` in htmlInCanvasWebGpu.client-DjAWjC9A.js). */
const SPIDER_GRAPH_PHYS = {
  springK: 70,
  hubPull: 60,
  homePull: 14,
  repulse: 9e5,
  softSq: 1600,
  damp: 6.5,
  hitR: 24,
  clickDist: 6,
  nudgeReach: 90,
  nudgePush: 14,
  nudgeUp: 0.7,
  nudgeHub: 0.3,
  nudgeMax: 360,
} as const;

/** Exact Shopify spider neutral color (`rt.colour = [208/255, 208/255, 208/255]`) — never turns red/orange mid-run. */
const SPIDER_COLOR: [number, number, number] = [224, 224, 224];

/** Exact Shopify hero finish spider multi-colored inner spoke inks (luminous cyan/mint/sky/lavender -> white tips, 图三!). */
const HERO_FINISH_INKS: readonly [number, number, number][] = [
  [112, 255, 212],
  [84, 234, 255],
  [128, 255, 176],
  [126, 186, 255],
  [190, 152, 255],
  [255, 162, 216],
];

const CHIP_PALETTE = ['#e14a88', '#e57b28', '#3c8c4a', '#2e5be8', '#7d4fe0'];

function smooth01(u: number): number {
  const c = clamp(u, 0, 1);
  return c * c * (3 - 2 * c);
}

function easeOutCubic(u: number): number {
  const c = clamp(u, 0, 1);
  return 1 - (1 - c) ** 3;
}

function detRand(seed: number): number {
  const x = Math.sin(seed * 91.3458 + 19.19) * 47453.5453;
  return x - Math.floor(x);
}

export function formatRunClock(sec: number): string {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const rem = s - mins * 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem.toFixed(1)}`;
}

export function gradeForScore(ratio: number): string {
  const r = clamp(ratio, 0, 1);
  for (const [threshold, letter] of GAME_CONFIG.grades) {
    if (r >= threshold) return letter;
  }
  return 'D-';
}

/** Verbatim Shopify `To(h, L)`: circular-arc curved skate ramp surface! */
export function evalCurvedRamp(h: number, L: number, distFromEntry: number): number {
  if (distFromEntry <= 0 || h <= 0 || L <= 0) return 0;
  if (distFromEntry >= L) return h;
  const th = 2 * Math.atan2(h, L);
  const R = L / Math.max(1e-5, Math.sin(th));
  return R - Math.sqrt(Math.max(0, R * R - distFromEntry * distFromEntry));
}

/** Verbatim Shopify `jp(count)`: Fibonacci sphere polyhedral hull + center spokes. */
function buildSpiderShell(count = 10): { dirs: [number, number, number][]; links: [number, number][] } {
  const dirs: [number, number, number][] = [];
  const links: [number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const r = 1 - (2 * (i + 0.5)) / count;
    const rad = Math.sqrt(Math.max(0, 1 - r * r));
    const ang = i * 2.399963;
    dirs.push([Math.cos(ang) * rad, Math.sin(ang) * rad, r]);
    links.push([0, i + 1]);
  }
  dirs.forEach((d, idx) => {
    const nearest = dirs
      .map((other, oIdx) => [Math.hypot(d[0] - other[0], d[1] - other[1], d[2] - other[2]), oIdx] as const)
      .filter(([, oIdx]) => oIdx !== idx)
      .sort((a, b) => a[0] - b[0])
      .slice(0, 2);
    for (const [, oIdx] of nearest) {
      const key = idx < oIdx ? `${idx}-${oIdx}` : `${oIdx}-${idx}`;
      if (!seen.has(key)) {
        seen.add(key);
        links.push([idx + 1, oIdx + 1]);
      }
    }
  });
  return { dirs, links };
}

const SPIDER_SHELL = buildSpiderShell(GAME_CONFIG.legs);
const AMBIENT_SHELL = buildSpiderShell(26);
const HERO_FINISH_SHELL = buildSpiderShell(28);

/** Verbatim Shopify `Ah(q, v)`: rotate 3D vector by unit quaternion `[qx, qy, qz, qw]`. */
function quatRotate(q: [number, number, number, number], v: [number, number, number]): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const ax = 2 * (qy * vz - qz * vy);
  const ay = 2 * (qz * vx - qx * vz);
  const az = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * ax + (qy * az - qz * ay),
    vy + qw * ay + (qz * ax - qx * az),
    vz + qw * az + (qx * ay - qy * ax),
  ];
}

/** Verbatim Shopify `Vp(q, v)`: inverse quaternion rotate (world -> ball local). */
function quatInvRotate(q: [number, number, number, number], v: [number, number, number]): [number, number, number] {
  return quatRotate([-q[0], -q[1], -q[2], q[3]], v);
}

/** Verbatim Shopify `Go(q, vx, vy, dt, r)`: roll unit quaternion from 2D velocity. */
function rollQuat(q: [number, number, number, number], vx: number, vy: number, dt: number, r: number) {
  const wx = -vy / Math.max(12, r);
  const wy = vx / Math.max(12, r);
  const wMag = Math.hypot(wx, wy);
  if (wMag <= 1e-6) return;
  const half = wMag * dt * 0.5;
  const s = Math.sin(half) / wMag;
  const c = Math.cos(half);
  const fx = wx * s;
  const fy = wy * s;
  const [qx, qy, qz, qw] = q;
  const nx = c * qx + fx * qw + fy * qz;
  const ny = c * qy + fy * qw - fx * qz;
  const nz = c * qz + fx * qy - fy * qx;
  const nw = c * qw - fx * qx - fy * qy;
  const len = Math.hypot(nx, ny, nz, nw) || 1;
  q[0] = nx / len;
  q[1] = ny / len;
  q[2] = nz / len;
  q[3] = nw / len;
}

/** Verbatim Shopify `pc` / `Wp` / `$p`: 2-bone analytic IK knee solver! */
function solveKneeIK(
  hip: [number, number, number],
  foot: [number, number, number],
  segLen: number,
  pole: [number, number, number],
): [number, number, number] {
  const ox = foot[0] - hip[0];
  const oy = foot[1] - hip[1];
  const oz = foot[2] - hip[2];
  const r = Math.hypot(ox, oy, oz) || 1e-6;
  const mx = (hip[0] + foot[0]) * 0.5;
  const my = (hip[1] + foot[1]) * 0.5;
  const mz = (hip[2] + foot[2]) * 0.5;
  const dot = (pole[0] * ox + pole[1] * oy + pole[2] * oz) / (r * r);
  const cx = pole[0] - dot * ox;
  const cy = pole[1] - dot * oy;
  const cz = pole[2] - dot * oz;
  const cLen = Math.hypot(cx, cy, cz);
  const h = Math.sqrt(Math.max(0, segLen * segLen - (r * r) * 0.25));
  if (cLen > 1e-6) {
    return [mx + (cx / cLen) * h, my + (cy / cLen) * h, mz + (cz / cLen) * h];
  }
  return [mx, my, mz + h];
}

/** Draws text STANDING VERTICALLY (90° upright out of the floor) or rotated around horizontal X-axis by `turnRad`. */
function drawStandingText(
  ctx: CanvasRenderingContext2D,
  frame: CurveFrame,
  text: string,
  col: number,
  row: number,
  elev: number,
  font: string,
  fillStyle: string,
  align: CanvasTextAlign = 'left',
  turnRad = 0,
) {
  const p0 = projectPoint(frame, col, row, elev);
  const px = projectPoint(frame, col + 20, row, elev);
  const downRow = -Math.sin(turnRad) * 20;
  const downElev = -Math.cos(turnRad) * 20;
  const py = projectPoint(frame, col, row + downRow, elev + downElev);
  if (!p0 || !px || !py) return;
  if (p0.x < -300 || p0.x > frame.W + 300 || p0.y < -120 || p0.y > frame.H + 160) return;

  const ax = (px.x - p0.x) / 20;
  const ay = (px.y - p0.y) / 20;
  const bx = (py.x - p0.x) / 20;
  const by = (py.y - p0.y) / 20;
  if (!Number.isFinite(ax) || !Number.isFinite(by) || Math.hypot(ax, ay) < 0.06) return;

  ctx.save();
  ctx.transform(ax, ay, bx, by, p0.x, p0.y);
  ctx.font = font;
  ctx.fillStyle = fillStyle;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Draws a white inverted stamp badge standing vertically on the 3D finish board (`.is-grade dd`, 图三!). */
function drawStandingStamp(
  ctx: CanvasRenderingContext2D,
  frame: CurveFrame,
  text: string,
  col: number,
  row: number,
  elev: number,
  wPx: number,
  hPx: number,
  bgHex: string,
  fgHex: string,
  font: string,
) {
  const pTL = projectPoint(frame, col, row, elev + hPx * 0.5);
  const pTR = projectPoint(frame, col + wPx, row, elev + hPx * 0.5);
  const pBR = projectPoint(frame, col + wPx, row, Math.max(0, elev - hPx * 0.5));
  const pBL = projectPoint(frame, col, row, Math.max(0, elev - hPx * 0.5));
  if (!pTL || !pTR || !pBR || !pBL) return;
  ctx.fillStyle = bgHex;
  ctx.beginPath();
  ctx.moveTo(pTL.x, pTL.y);
  ctx.lineTo(pTR.x, pTR.y);
  ctx.lineTo(pBR.x, pBR.y);
  ctx.lineTo(pBL.x, pBL.y);
  ctx.closePath();
  ctx.fill();
  drawStandingText(ctx, frame, text, col + wPx * 0.5, row, elev, font, fgHex, 'center');
}

/** Verbatim Shopify `Fh` + `oa`: perimeter point on a rounded-rectangle wormhole ring (supports both wide & tall rectangles!). */
function roundedRectRingPoint(
  cx: number,
  cy: number,
  rCorner: number,
  lx: number,
  ly: number,
  u: number,
): [number, number] {
  const arc = Math.PI * 0.5 * rCorner;
  const segs = [ly, arc, 2 * lx, arc, 2 * ly, arc, 2 * lx, arc, ly];
  const total = segs.reduce((a, b) => a + b, 0) || 1;
  let a = (((u % 1) + 1) % 1) * total;
  let c = 0;
  while (c < 8 && a > segs[c]) {
    a -= segs[c++];
  }
  const f = segs[c] > 0 ? clamp(a / segs[c], 0, 1) : 0;
  if (c % 2 === 1) {
    const h = (c - 1) / 2;
    const ang = (h + f) * (Math.PI * 0.5);
    const ox = h === 1 || h === 2 ? -lx : lx;
    const oy = h >= 2 ? -ly : ly;
    return [cx + ox + rCorner * Math.cos(ang), cy + oy + rCorner * Math.sin(ang)];
  }
  if (c === 0) return [cx + lx + rCorner, cy + f * ly];
  if (c === 2) return [cx + lx - 2 * f * lx, cy + ly + rCorner];
  if (c === 4) return [cx - lx - rCorner, cy + ly - 2 * f * ly];
  if (c === 6) return [cx - lx + 2 * f * lx, cy - ly - rCorner];
  return [cx + lx + rCorner, cy - ly + f * ly];
}

export type GamePhase = 'idle' | 'playing' | 'finished';

export interface PageWordToken {
  text: string;
  col: number;
  docY: number;
}

export interface AmbientSpiderSpec {
  id: string;
  label: string;
  docY: number;
  uX: number;
  nodeLabels: string[];
}

/** 3D card/module step box fed from `cardLayouts` for exact Shopify `Sh()` step-climb & uphill slowdown! */
export interface CardStepBox {
  id: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  top: number;
}

export interface TitleCoverOccluder {
  path: Path2D;
  z: number;
}

export interface OccluderSet {
  covers: RaisedCover[];
  coverPaths: Path2D[];
  titleCovers?: TitleCoverOccluder[];
}

export interface GameHudSnapshot {
  phase: GamePhase;
  fellInHole: boolean;
  speedPx: number;
  remainingPx: number;
  pageWidthPx: number;
  collected: number;
  wordsEaten: number;
  jumpsCleared: number;
  jumpPoints: number;
  totalLegs: number;
  totalCollectibles: number;
  elapsedSec: number;
  peakSpeedPx: number;
  grade: string;
  distancePx: number;
  sizePx: number;
}

interface AmbientSpiderNode {
  idx: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  hx: number;
  hy: number;
  hz: number;
  ink: [number, number, number];
  eaten: boolean;
}

interface AmbientSpiderCluster {
  id: string;
  label: string;
  docY: number;
  uX: number;
  radius: number;
  isFinishHero: boolean;
  nodes: AmbientSpiderNode[];
  links: [number, number, number][];
  dragIdx: number;
  dragTarget: [number, number, number] | null;
  hoverIdx: number;
  energy: number;
  anchor: [number, number, number] | null;
  screenNodes: ({ x: number; y: number; z: number } | null)[];
  absorbed: boolean;
  hoverAmount: number;
  screenX: number;
  screenY: number;
}

interface FusedNode {
  dir: [number, number, number];
  ra: number;
  nearIdx: number;
  fromWorld: [number, number, number];
  ink: [number, number, number];
  delaySec: number;
  ageSec: number;
  landed: boolean;
}

interface WordChip {
  text: string;
  dir: [number, number, number];
  ra: number;
  fromWorld: [number, number, number];
  ageSec: number;
  landed: boolean;
  bgHex: string;
}

interface ActiveWordTarget {
  id: number;
  text: string;
  col: number;
  docY: number;
  state: 'ready' | 'claimed' | 'eaten';
  leg: IKGrabLeg | null;
}

interface IKGrabLeg {
  word: ActiveWordTarget;
  phase: 'reach' | 'plant' | 'pull' | 'drop';
  ageSec: number;
  litSec: number;
  hipDir: [number, number, number];
  foot: [number, number, number];
  fv: [number, number, number];
  knee: [number, number, number];
  kv: [number, number, number];
  aim: [number, number, number] | null;
  segLen: number;
  alpha: number;
  chip: WordChip | null;
  done: boolean;
}

interface LaunchRamp {
  id: number;
  uX: number;
  halfW: number;
  y0: number;
  ry: number;
  y1: number;
  height: number;
  isFinale: boolean;
  launched: boolean;
}

/** Varied Shopify wormhole black holes (`Uo` + `Yo` + `Nh` + `qp`): circular, wide rectangular (`hx > hy`), AND tall rectangular (`hy > hx`)! */
interface FunnelHole {
  id: number;
  uX: number;
  docY: number;
  hx: number;
  hy: number;
  R: number;
  lx: number;
  ly: number;
  frontTag: boolean;
  cleared: boolean;
}

/** Verbatim Shopify slow sideways conveyor push belt (`kh` + `sd` + `rd` + `ed.pushAt`)! */
interface ConveyorBelt {
  id: number;
  uX0: number;
  uX1: number;
  y0: number;
  y1: number;
  accel: number; // signed lateral px/s² (`< 0` pushes left `←`, `> 0` pushes right `→`)
  bridge: boolean;
}

/** Verbatim Shopify 3D finish fireworks (`ar`/`rr`/`lr`/`cr`/`Bs`/`Ks` in index-DLZuI34T.js)! */
interface FireworkSpark {
  p: [number, number, number];
  v: [number, number, number];
  parent: number;
  life: number;
}

interface FireworkRocket {
  state: 'wait' | 'rise' | 'burst' | 'dead';
  t: number;
  delay: number;
  riseSec: number;
  from: [number, number, number];
  to: [number, number, number];
  spread: number;
  ink: [number, number, number];
  sparks: FireworkSpark[];
}

interface StandingCell {
  u0: number;
  u1: number;
  k: string;
  v: string;
}

/** Verbatim Shopify spider-leg per-node 3D spring buffer (`hr`, `pr`, `mr`, `yr` in index-DLZuI34T.js). */
const BASE_NODE_COUNT = GAME_CONFIG.legs + 1;
const NODE_SPRING_K = 180;
const NODE_SPRING_DAMP = 10;
const NODE_SUBSTEP = 1 / 120;

export class RunwayGameController {
  phase: GamePhase = 'idle';
  fellInHole = false;
  scrollY = 0;
  startScrollY = 1600;
  finishDocY = 440;
  speed = GAME_CONFIG.cruise;
  peakSpeed = GAME_CONFIG.cruise;

  xFrac = 0.5;
  vxPx = 0;
  zElev = 0;
  vz = 0;
  rampElev = 0;
  private rampOn: LaunchRamp | null = null;
  /** Verbatim Shopify `Sh()` smoothed card/module step elevation (`at` in index-DLZuI34T.js). */
  surfaceZ = 0;
  private prevStepTargetZ = 0;
  /** Verbatim Shopify `Fp()` squash & stretch hop spring (`ft` in index-DLZuI34T.js). */
  hopS = 0;
  private hopSv = 0;
  private hopPressAt = -1;
  private hopAir = false;
  private hopBufferSec = 0;

  grow = 1;
  elapsedSec = 0;
  collected = 0;
  wordsEaten = 0;
  jumpsCleared = 0;
  jumpPoints = 0;
  totalCollectibles = 0;
  grade = 'A';

  // Exact Shopify 3D curved-wall funnel falling state (`qp` + `Er`)
  private fallingHole: FunnelHole | null = null;
  private fallBallX = 0;
  private fallBallY = 0;
  private fallBallZ = 0;
  private fallVx = 0;
  private fallVy = 0;
  private fallVz = 0;
  private fallTimer = 0;
  private fellDistPx = 0;

  // Exact Shopify finish choreography state (`js` / `Zs` / `Ms` / `Bs` / `ot.collapse`)
  private finishClock = 0;
  private finishBoardRise = 0;
  private finishBoardReadyAt = 0;
  private finishBallX = 640;
  private finishBallY = 260;
  private finishTargetX = 640;
  private finishTargetY = 250;
  private finishVx = 0;
  private finishVy = 0;
  private finishHoleRef: FunnelHole | null = null;
  private obstacleOpenK = 0;
  private collapseClock = -1;
  private closingAction: 'none' | 'again' | 'close' = 'none';
  private closeTimer = 0;
  private pendingCallback: 'none' | 'again' | 'close' = 'none';
  private fireworks: FireworkRocket[] = [];

  // Verbatim Shopify `start ↑` lift & flip animation state (`E` + `G` in `Vs`)
  startLift = START_ANIM.restLift;
  startLiftVel = 0;
  startTurn = 0;
  private startTurnFrom = 0;
  private startTurnAim = 0;
  private startTurnT = START_ANIM.flipSec;
  private startFlips = 0;
  private startHovered = false;
  private startDown = false;

  // Interactive 3D finish board button hover & hit-test quads
  private againHitQuad: { x: number; y: number }[] | null = null;
  private closeHitQuad: { x: number; y: number }[] | null = null;
  private topCloseHitRect: { x: number; y: number; w: number; h: number } | null = null;
  private againHovered = false;
  private closeHovered = false;
  private topCloseHovered = false;

  // Verbatim Shopify spider-orb state: CENTER IS FIXED in idle; ONLY outer leg nodes [1..10] spring-disturb!
  orbQuat: [number, number, number, number] = [0, 0, 0, 1];
  nodeOff = new Float32Array(BASE_NODE_COUNT * 3);
  nodeVel = new Float32Array(BASE_NODE_COUNT * 3);
  nodeSpringsActive = false;
  idleBreath = 0;

  // Ambient page spiders + 2 finish-line multi-colored hero spiders + page cards (for step-climb!)
  private ambientClusters: AmbientSpiderCluster[] = [];
  private finishSpiders: AmbientSpiderCluster[] = [];
  private cardBoxes: CardStepBox[] = [];
  private pageWords: ActiveWordTarget[] = [];
  private fusedNodes: FusedNode[] = [];
  private wordChips: WordChip[] = [];
  private grabLegs: IKGrabLeg[] = [];
  private ramps: LaunchRamp[] = [];
  private holes: FunnelHole[] = [];
  private conveyors: ConveyorBelt[] = [];

  private startHitQuad: { x: number; y: number }[] | null = null;
  private orbVisible = false;
  private orbScreenX = 0;
  private orbScreenY = 0;
  private orbScreenR = 0;
  private orbScreenNodes: ({ x: number; y: number } | null)[] = Array(BASE_NODE_COUNT).fill(null);
  private orbJac: { scaleX: number; dRowY: number; dElevY: number } | null = null;
  private orbHovered = false;
  private pendingPoke: { x: number; y: number; ax: number; ay: number } | null = null;
  private lastMouseX = NaN;
  private lastMouseY = NaN;

  private orbDragging = false;
  private orbSpinVx = 0;
  private orbSpinVy = 0;

  // Verbatim Shopify `class dh` interactive drag & mouse-nudge state for ambient spiders!
  private lastFrame: CurveFrame | null = null;
  private draggedSpider: AmbientSpiderCluster | null = null;
  private spiderDragStart: [number, number] | null = null;
  private ambientHovered = false;

  private keys = new Set<string>();
  private wheelThrottle = 0;

  isActive(): boolean {
    return this.phase === 'playing';
  }

  isPlayingOrFinished(): boolean {
    return this.phase === 'playing' || this.phase === 'finished';
  }

  isDraggingOrb(): boolean {
    return this.orbDragging || this.draggedSpider !== null;
  }

  isHoveringInteractive(): boolean {
    return this.startHovered || this.orbHovered || this.ambientHovered || this.againHovered || this.closeHovered || this.topCloseHovered;
  }

  /** Test helper: triggers verbatim Shopify `ph(cl, 650)` radial burst on an ambient spider cluster. */
  pokeAmbientSpider(clusterIdx = 0) {
    const cl = this.ambientClusters[clusterIdx];
    if (cl) this.burstAmbientSpider(cl, 650);
  }

  /** Test helper: returns total displacement of nodes from home rest positions on an ambient spider. */
  getAmbientNodeDisplacement(clusterIdx = 0): number {
    const cl = this.ambientClusters[clusterIdx];
    if (!cl) return 0;
    let sum = 0;
    for (const n of cl.nodes) {
      sum += Math.hypot(n.x - n.hx, n.y - n.hy, n.z - n.hz);
    }
    return sum;
  }

  consumePendingAction(): 'none' | 'again' | 'close' {
    const act = this.pendingCallback;
    this.pendingCallback = 'none';
    return act;
  }

  getTotalLegs(): number {
    return GAME_CONFIG.legs + this.fusedNodes.filter((n) => n.landed).length;
  }

  getVisibleWordChipsCount(): number {
    return this.wordChips.length;
  }

  getActiveGrabLegsCount(): number {
    return this.grabLegs.length;
  }

  getAmbientClustersCount(): number {
    return this.ambientClusters.length;
  }

  getFinishSpidersCount(): number {
    return this.finishSpiders.length;
  }

  getRampsCount(): number {
    return this.ramps.length;
  }

  getHolesCount(): number {
    return this.holes.length;
  }

  getConveyorsCount(): number {
    return this.conveyors.length;
  }

  getFinishBoardRise(): number {
    return this.finishBoardRise;
  }

  getFireworksCount(): number {
    return this.fireworks.filter((f) => f.state !== 'dead').length;
  }

  getHoleWidths(): number[] {
    return this.holes.map((h) => Math.round(h.hx * 2));
  }

  hasRectangularHole(): boolean {
    return this.holes.some((h) => Math.abs(h.hx - h.hy) >= 30);
  }

  /** Verbatim Shopify `Ln()`: completely resets ALL game/fusion/chip/leg/finish/firework state back to pristine initial spider! */
  private resetRunState() {
    this.fellInHole = false;
    this.fallingHole = null;
    this.finishHoleRef = null;
    this.fallTimer = 0;
    this.fellDistPx = 0;
    this.speed = GAME_CONFIG.cruise;
    this.peakSpeed = GAME_CONFIG.cruise;
    this.xFrac = 0.5;
    this.vxPx = 0;
    this.zElev = 0;
    this.vz = 0;
    this.rampElev = 0;
    this.rampOn = null;
    this.surfaceZ = 0;
    this.prevStepTargetZ = 0;
    this.hopS = 0;
    this.hopSv = 0;
    this.hopPressAt = -1;
    this.hopAir = false;
    this.hopBufferSec = 0;
    this.grow = 1;
    this.elapsedSec = 0;
    this.collected = 0;
    this.wordsEaten = 0;
    this.jumpsCleared = 0;
    this.jumpPoints = 0;
    this.fusedNodes = [];
    this.wordChips = [];
    this.grabLegs = [];
    this.fireworks = [];
    this.finishClock = 0;
    this.finishBoardRise = 0;
    this.finishBoardReadyAt = 0;
    this.obstacleOpenK = 0;
    this.collapseClock = -1;
    this.closingAction = 'none';
    this.closeTimer = 0;
    this.pendingCallback = 'none';
    this.nodeOff.fill(0);
    this.nodeVel.fill(0);
    this.nodeSpringsActive = false;
    this.orbQuat = [0, 0, 0, 1];
    this.orbDragging = false;
    this.draggedSpider = null;
    this.spiderDragStart = null;
    this.ambientHovered = false;
    this.orbSpinVx = 0;
    this.orbSpinVy = 0;
    this.startHovered = false;
    this.startDown = false;
    this.orbHovered = false;
    this.againHovered = false;
    this.closeHovered = false;
    this.topCloseHovered = false;
    this.againHitQuad = null;
    this.closeHitQuad = null;
    this.topCloseHitRect = null;
    this.keys.clear();
    this.wheelThrottle = 0;

    for (const cl of [...this.ambientClusters, ...this.finishSpiders]) {
      cl.absorbed = false;
      cl.dragIdx = -1;
      cl.dragTarget = null;
      cl.hoverIdx = -1;
      cl.energy = 0;
      for (const n of cl.nodes) {
        n.eaten = false;
        n.x = n.hx;
        n.y = n.hy;
        n.z = n.hz;
        n.vx = 0;
        n.vy = 0;
        n.vz = 0;
      }
    }
    for (const w of this.pageWords) {
      w.state = 'ready';
      w.leg = null;
    }
  }

  /** Builds a Shopify `fh()` spring-force-graph spider cluster (with rest link lengths for elastic drag & hover nudge!). */
  private buildSpiderCluster(
    id: string,
    label: string,
    docY: number,
    uX: number,
    radius: number,
    isFinishHero: boolean,
    shell: { dirs: [number, number, number][]; links: [number, number][] },
    seedBase: number,
  ): AmbientSpiderCluster {
    const nodes: AmbientSpiderNode[] = [
      {
        idx: 0,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        hx: 0, hy: 0, hz: 0,
        ink: isFinishHero ? HERO_FINISH_INKS[seedBase % HERO_FINISH_INKS.length] : SPIDER_COLOR,
        eaten: false,
      },
    ];
    for (let i = 0; i < shell.dirs.length; i++) {
      const d = shell.dirs[i];
      const rJitter = radius * (0.64 + 0.42 * detRand(seedBase * 53 + i * 17));
      const hx = d[0] * rJitter;
      const hy = d[1] * rJitter * 0.72;
      const hz = d[2] * rJitter * 0.66;
      const ink = isFinishHero ? HERO_FINISH_INKS[(i + seedBase * 2) % HERO_FINISH_INKS.length] : SPIDER_COLOR;
      nodes.push({
        idx: i + 1,
        x: hx, y: hy, z: hz,
        vx: 0, vy: 0, vz: 0,
        hx, hy, hz,
        ink,
        eaten: false,
      });
    }
    const links: [number, number, number][] = shell.links.map(([a, b]) => {
      const na = nodes[a];
      const nb = nodes[b];
      return [a, b, Math.hypot(nb.hx - na.hx, nb.hy - na.hy, nb.hz - na.hz)];
    });
    return {
      id,
      label,
      docY,
      uX,
      radius,
      isFinishHero,
      nodes,
      links,
      dragIdx: -1,
      dragTarget: null,
      hoverIdx: -1,
      energy: 0,
      anchor: null,
      screenNodes: Array(nodes.length).fill(null),
      absorbed: false,
      hoverAmount: 0,
      screenX: 0,
      screenY: 0,
    };
  }

  /** Builds large 3D spherical ambient page spiders + 2 colored finish-line hero spiders + card step boxes! */
  setPageContent(
    words: readonly PageWordToken[],
    spiders: readonly AmbientSpiderSpec[],
    cards: readonly CardStepBox[] = [],
  ) {
    if (this.phase === 'playing') return;

    this.cardBoxes = cards.map((c) => ({ ...c }));
    this.pageWords = words.map((w, idx) => ({
      id: idx,
      text: w.text,
      col: w.col,
      docY: w.docY,
      state: 'ready',
      leg: null,
    }));

    this.ambientClusters = spiders.map((sp, cIdx) =>
      this.buildSpiderCluster(sp.id, sp.label, sp.docY, sp.uX, 122 + (cIdx % 3) * 16, false, AMBIENT_SHELL, cIdx + 1),
    );

    this.buildFinishHeroSpiders();
  }

  /** Builds 2 vibrant multi-colored hero spider clusters placed right past the checkered finish line (`e.hero()`, 图三!). */
  private buildFinishHeroSpiders() {
    const specs = [
      { id: 'hero-finish-0', label: 'Vault', docY: Math.max(150, this.finishDocY - 125), uX: 0.36, radius: 132 },
      { id: 'hero-finish-1', label: 'Index', docY: Math.max(110, this.finishDocY - 185), uX: 0.64, radius: 146 },
    ];
    this.finishSpiders = specs.map((sp, cIdx) =>
      this.buildSpiderCluster(sp.id, sp.label, sp.docY, sp.uX, sp.radius, true, HERO_FINISH_SHELL, cIdx + 10),
    );
  }

  start(maxScroll: number) {
    this.resetRunState();
    this.startScrollY = Math.max(400, maxScroll);
    this.finishDocY = Math.min(440, Math.max(240, this.startScrollY * 0.22));
    this.scrollY = this.startScrollY;
    this.phase = 'playing';

    if (this.ambientClusters.length === 0) {
      this.setPageContent(
        [
          { text: '写作台', col: 520, docY: Math.max(240, this.startScrollY * 0.35) },
          { text: 'LocalSend', col: 680, docY: Math.max(340, this.startScrollY * 0.55) },
          { text: 'Excalidraw', col: 580, docY: Math.max(440, this.startScrollY * 0.72) },
        ],
        [
          { id: 'default-0', label: '资源节点', docY: Math.max(260, this.startScrollY * 0.45), uX: 0.5, nodeLabels: [] },
          { id: 'default-1', label: '知识图谱', docY: Math.max(460, this.startScrollY * 0.75), uX: 0.48, nodeLabels: [] },
        ],
      );
    } else {
      this.buildFinishHeroSpiders();
    }

    const ambCount = this.ambientClusters.reduce((s, c) => s + c.nodes.length, 0);
    const finCount = this.finishSpiders.reduce((s, c) => s + c.nodes.length, 0);
    this.totalCollectibles = ambCount + finCount;
    this.buildCourse(this.startScrollY);
  }

  stop() {
    this.phase = 'idle';
    this.resetRunState();
  }

  /** Smooth Shopify `Js()` / `De()` board slide-down into the floor before replay or close! */
  requestAgain() {
    if (this.phase === 'finished' && this.closingAction === 'none') {
      this.closingAction = 'again';
      this.closeTimer = 0;
      this.fireworks = [];
    }
  }

  requestClose() {
    if (this.phase === 'playing') {
      this.stop();
      this.pendingCallback = 'close';
      return;
    }
    if (this.phase === 'finished' && this.closingAction === 'none') {
      this.closingAction = 'close';
      this.closeTimer = 0;
      this.fireworks = [];
    }
  }

  onWheel(deltaY: number) {
    if (this.phase !== 'playing') return;
    // Verbatim Shopify `zs()`: smooth wheel throttle adjustment (`[-1, 1]`)
    this.wheelThrottle = clamp(this.wheelThrottle - deltaY / 420, -1, 1);
  }

  /** Verbatim Shopify `Ch` + `kh` + `Hh` rhythm: spacious beats (NOT spammy!), circular + rectangular holes, slow sideways conveyors, finale jump ramp! */
  private buildCourse(courseLen: number) {
    this.ramps = [];
    this.holes = [];
    this.conveyors = [];

    const topBound = this.finishDocY + 260;
    const botBound = courseLen - 180;
    const span = Math.max(0, botBound - topBound);

    // 1) Finale run-in ramp + rectangular hole right before the checkered finish line (`Hh()`!)
    const finRampY0 = this.finishDocY + 125;
    const finRampL = 165;
    this.ramps.push({
      id: 90,
      uX: 0.5,
      halfW: 165,
      y0: finRampY0,
      ry: finRampY0 + finRampL,
      y1: finRampY0 + finRampL + 44,
      height: 76,
      isFinale: true,
      launched: false,
    });
    if (span >= 420) {
      // Wide rectangular hole just behind the finale ramp (can jump over from ramp or steer around)
      const hx = 175;
      const hy = 86;
      this.holes.push({
        id: 90,
        uX: 0.5,
        docY: finRampY0 + finRampL + 150,
        hx,
        hy,
        R: hy,
        lx: hx - hy,
        ly: 0,
        frontTag: true,
        cleared: false,
      });
    }

    // 2) Spacious mid-course beats (~960 px apart) scaling automatically with arbitrary page length as resources are added!
    const beatCount = span < 500 ? 1 : span < 1400 ? 2 : Math.min(40, Math.max(2, Math.floor(span / 960)));
    const startY = botBound - 60;
    const endY = Math.max(topBound + 260, finRampY0 + finRampL + 310);
    const step = beatCount > 1 ? (startY - endY) / (beatCount - 1) : 0;

    for (let b = 0; b < beatCount; b++) {
      const y = beatCount === 1 ? (startY + endY) * 0.5 : startY - b * step;
      const side = b % 2 === 0 ? -1 : 1;

      if (b % 3 === 0) {
        // Beat 0, 3, 6...: Curved jump ramp + circular wormhole black hole (classic Shopify opening beat `F === 1`)
        const uX = clamp(0.5 + side * 0.2, 0.25, 0.75);
        const rL = 170;
        const rH = 74;
        this.ramps.push({
          id: b,
          uX,
          halfW: 122,
          y0: y - rL,
          ry: y,
          y1: y + 46,
          height: rH,
          isFinale: false,
          launched: false,
        });
        const r = 108;
        this.holes.push({
          id: b,
          uX,
          docY: y - rL - r - 38,
          hx: r,
          hy: r,
          R: r,
          lx: 0,
          ly: 0,
          frontTag: false,
          cleared: false,
        });
      } else if (b % 3 === 1) {
        // Beat 1, 4, 7...: Wide horizontal RECTANGULAR black hole (`hx > hy`, e.g. 380 × 172 px!) + SLOW sideways conveyor push belt ahead!
        const holeU = side > 0 ? 0.62 : 0.38;
        const hx = 190;
        const hy = 86;
        this.holes.push({
          id: b,
          uX: holeU,
          docY: y - 130,
          hx,
          hy,
          R: hy,
          lx: hx - hy,
          ly: 0,
          frontTag: false,
          cleared: false,
        });
        // Slow sideways conveyor belt pushing gently toward the hole side (counter-steer or hop!)
        const dir = holeU > 0.5 ? 1 : -1;
        this.conveyors.push({
          id: b,
          uX0: 0.14,
          uX1: 0.86,
          y0: y + 20,
          y1: y + 170,
          accel: dir * GAME_CONFIG.push * 0.78,
          bridge: false,
        });
      } else {
        // Beat 2: Tall/long RECTANGULAR black hole (`hy > hx`, e.g. 176 × 276 px!) + opposite slow sideways conveyor + side ramp!
        const holeU = side > 0 ? 0.34 : 0.66;
        const hx = 88;
        const hy = 138;
        this.holes.push({
          id: b,
          uX: holeU,
          docY: y - 90,
          hx,
          hy,
          R: hx,
          lx: 0,
          ly: hy - hx,
          frontTag: false,
          cleared: false,
        });
        const rampU = holeU < 0.5 ? 0.7 : 0.3;
        this.ramps.push({
          id: b,
          uX: rampU,
          halfW: 118,
          y0: y - 165,
          ry: y,
          y1: y + 42,
          height: 82,
          isFinale: false,
          launched: false,
        });
        this.conveyors.push({
          id: b,
          uX0: Math.max(0.08, holeU - 0.2),
          uX1: Math.min(0.92, holeU + 0.35),
          y0: y + 95,
          y1: y + 235,
          accel: (holeU < 0.5 ? -1 : 1) * GAME_CONFIG.push * 0.68,
          bridge: false,
        });
      }
    }

    // Ensure at least 1 conveyor + 1 rectangular hole even on short test tracks!
    if (this.conveyors.length === 0) {
      this.conveyors.push({
        id: 80,
        uX0: 0.18,
        uX1: 0.82,
        y0: Math.max(this.finishDocY + 260, courseLen * 0.52),
        y1: Math.max(this.finishDocY + 410, courseLen * 0.52 + 150),
        accel: GAME_CONFIG.push * 0.72,
        bridge: false,
      });
    }
    if (!this.hasRectangularHole()) {
      const hx = 176;
      const hy = 86;
      this.holes.push({
        id: 81,
        uX: 0.58,
        docY: Math.max(this.finishDocY + 340, courseLen * 0.42),
        hx,
        hy,
        R: hy,
        lx: hx - hy,
        ly: 0,
        frontTag: false,
        cleared: false,
      });
    }
  }

  /** Verbatim Shopify `Sh()` card/module step elevation evaluator: quarter-circle smooth step climb onto raised cards! */
  private evalCardStepZ(colPx: number, docY: number, orbR: number): number {
    let bestZ = 0;
    for (const box of this.cardBoxes) {
      const dx = Math.max(box.x0 - colPx, 0, colPx - box.x1);
      const dy = Math.max(box.y0 - docY, 0, docY - box.y1);
      const d2 = dx * dx + dy * dy;
      if (d2 >= orbR * orbR) continue;
      // Exact Shopify `h = a.top + Math.sqrt(r*r - l)` (relative elevation above flat floor = `h - r`)
      const stepElev = Math.max(0, box.top + Math.sqrt(orbR * orbR - d2) - orbR);
      if (stepElev > bestZ) bestZ = stepElev;
    }
    return bestZ;
  }

  /** Verbatim Shopify `ed.pushAt()`: net sideways conveyor acceleration when grounded inside a belt! */
  private evalConveyorPush(colPx: number, docY: number, stageW: number, orbR: number): number {
    if (this.zElev > 0.15 * orbR || this.rampElev > 0 || this.conveyors.length === 0) return 0;
    let total = 0;
    for (const c of this.conveyors) {
      const x0 = c.uX0 * stageW;
      const x1 = c.uX1 * stageW;
      if (colPx >= x0 && colPx <= x1 && docY >= c.y0 && docY <= c.y1) {
        total += c.accel;
      }
    }
    return total * this.obstacleOpenK;
  }

  private pointInQuad(px: number, py: number, q: { x: number; y: number }[] | null): boolean {
    if (!q || q.length < 4) return false;
    let inside = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
      const xi = q[i].x;
      const yi = q[i].y;
      const xj = q[j].x;
      const yj = q[j].y;
      const intersect = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-6) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private pointInRect(px: number, py: number, r: { x: number; y: number; w: number; h: number } | null): boolean {
    return !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  setStartHover(hovered: boolean) {
    if (hovered === this.startHovered) return;
    this.startHovered = hovered;
    if (hovered) {
      this.startFlips++;
      this.startTurnFrom = this.startTurn;
      this.startTurnAim = this.startFlips * Math.PI;
      this.startTurnT = 0;
    }
  }

  private pokeNode(nodeIdx: number, weight: number, impulse: [number, number, number], dt: number) {
    if (nodeIdx <= 0 || nodeIdx >= BASE_NODE_COUNT) return;
    const blend = weight * (1 - 0.7 ** (60 * dt));
    const base = nodeIdx * 3;
    for (let g = 0; g < 3; g++) {
      this.nodeVel[base + g] += (impulse[g] - this.nodeVel[base + g]) * blend;
    }
    this.nodeSpringsActive = true;
  }

  pokeAllLegsRadial() {
    const r = GAME_CONFIG.radius * (this.phase === 'finished' ? this.grow : 1) * 1.65;
    for (let i = 1; i < BASE_NODE_COUNT; i++) {
      const rot = quatRotate(this.orbQuat, SPIDER_SHELL.dirs[i - 1]);
      const mag = Math.hypot(rot[0], rot[1], rot[2]) || 1;
      const amp = 2.4 * r * (0.75 + 0.5 * detRand(i * 19));
      const base = i * 3;
      this.nodeVel[base] += (rot[0] / mag) * amp;
      this.nodeVel[base + 1] += (rot[1] / mag) * amp;
      this.nodeVel[base + 2] += (rot[2] / mag) * amp;
    }
    this.nodeSpringsActive = true;
  }

  private transferSpinLag(prevQ: [number, number, number, number]) {
    const r = GAME_CONFIG.radius * (this.phase === 'finished' ? this.grow : 1) * 1.65;
    for (let i = 1; i < BASE_NODE_COUNT; i++) {
      const dir = SPIDER_SHELL.dirs[i - 1];
      const oldP = quatRotate(prevQ, [dir[0] * r, dir[1] * r, dir[2] * r]);
      const newP = quatRotate(this.orbQuat, [dir[0] * r, dir[1] * r, dir[2] * r]);
      const base = i * 3;
      this.nodeOff[base] += 0.3 * (oldP[0] - newP[0]);
      this.nodeOff[base + 1] += 0.3 * (oldP[1] - newP[1]);
      this.nodeOff[base + 2] += 0.3 * (oldP[2] - newP[2]);
    }
    this.nodeSpringsActive = true;
  }

  /** Verbatim Shopify `uh(t, dt, floorZ)`: spring-force-graph simulation for interactive ambient spiders! */
  private stepAmbientSpiderPhysics(cl: AmbientSpiderCluster, dt: number) {
    const nodes = cl.nodes;
    const { springK, hubPull, homePull, repulse, softSq, damp } = SPIDER_GRAPH_PHYS;
    const subSteps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = dt / subSteps;
    const dampMul = Math.exp(-damp * h);
    const floorZ = cl.anchor ? 12 - cl.anchor[2] : -100;

    for (let s = 0; s < subSteps; s++) {
      // 1) Hooke springs along every spoke & outer web link (`ah = 70`)
      for (const [a, b, restLen] of cl.links) {
        const p = nodes[a];
        const f = nodes[b];
        if (!p || !f || p.eaten || f.eaten) continue;
        const dx = f.x - p.x;
        const dy = f.y - p.y;
        const dz = f.z - p.z;
        const dist = Math.hypot(dx, dy, dz) || 1;
        const k = (springK * (dist - restLen)) / dist;
        p.vx += k * dx * h;
        p.vy += k * dy * h;
        p.vz += k * dz * h;
        f.vx -= k * dx * h;
        f.vy -= k * dy * h;
        f.vz -= k * dz * h;
      }

      // 2) Pairwise Coulomb repulsion (`ih = 9e5`, `ch = 1600`)
      for (let i = 0; i < nodes.length; i++) {
        const hi = nodes[i];
        if (hi.eaten) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const pj = nodes[j];
          if (pj.eaten) continue;
          const dx = pj.x - hi.x;
          const dy = pj.y - hi.y;
          const dz = pj.z - hi.z;
          const u = dx * dx + dy * dy + dz * dz + softSq;
          const m = repulse / (u * Math.sqrt(u));
          hi.vx -= m * dx * h;
          hi.vy -= m * dy * h;
          hi.vz -= m * dz * h;
          pj.vx += m * dx * h;
          pj.vy += m * dy * h;
          pj.vz += m * dz * h;
        }
      }

      // 3) Center hub spring (`qs = 60`) + per-node home spring (`Zs = 14`)
      const hub = nodes[0];
      if (hub && !hub.eaten) {
        hub.vx -= hubPull * hub.x * h;
        hub.vy -= hubPull * hub.y * h;
        hub.vz -= hubPull * hub.z * h;
      }
      for (const n of nodes) {
        if (n.eaten) continue;
        n.vx -= homePull * (n.x - n.hx) * h;
        n.vy -= homePull * (n.y - n.hy) * h;
        n.vz -= homePull * (n.z - n.hz) * h;
      }

      // 4) Integrate with exponential damping (`exp(-6.5 * dt)`) and drag pin
      let energy = 0;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.eaten) continue;
        if (i === cl.dragIdx && cl.dragTarget) {
          n.x = cl.dragTarget[0];
          n.y = cl.dragTarget[1];
          n.z = cl.dragTarget[2];
          n.vx = 0;
          n.vy = 0;
          n.vz = 0;
          continue;
        }
        n.vx *= dampMul;
        n.vy *= dampMul;
        n.vz *= dampMul;
        n.x += n.vx * h;
        n.y += n.vy * h;
        n.z += n.vz * h;
        if (n.z < floorZ) {
          n.z = floorZ;
          n.vz = Math.max(0, n.vz);
        }
        energy += n.vx * n.vx + n.vy * n.vy + n.vz * n.vz;
      }
      cl.energy = energy;
    }
  }

  /** Verbatim Shopify `ph(cluster, 650)`: radial burst pop on short click of an ambient spider! */
  private burstAmbientSpider(cl: AmbientSpiderCluster, power = 650) {
    for (let i = 1; i < cl.nodes.length; i++) {
      const n = cl.nodes[i];
      if (n.eaten) continue;
      const dist = Math.hypot(n.x, n.y, n.z) || 1;
      n.vx += (n.x / dist) * power;
      n.vy += (n.y / dist) * power;
      n.vz += (n.z / dist) * power * 0.5 + power * 0.6;
    }
    if (cl.nodes[0] && !cl.nodes[0].eaten) {
      cl.nodes[0].vz += power * 0.8;
    }
    cl.energy = power * power;
  }

  /** Verbatim Shopify `dh.nodeAt(sx, sy)`: finds nearest interactive ambient spider node under cursor. */
  private findAmbientNodeAt(sx: number, sy: number): { cl: AmbientSpiderCluster; idx: number } | null {
    let best: { cl: AmbientSpiderCluster; idx: number } | null = null;
    let bestD = SPIDER_GRAPH_PHYS.hitR;
    for (const cl of [...this.ambientClusters, ...this.finishSpiders]) {
      if (cl.absorbed || !cl.anchor) continue;
      for (let i = 0; i < cl.screenNodes.length; i++) {
        const sp = cl.screenNodes[i];
        if (!sp) continue;
        const limit = i === 0 ? SPIDER_GRAPH_PHYS.hitR + 6 : bestD;
        const d = Math.hypot(sp.x - sx, sp.y - sy);
        if (d < Math.min(bestD, limit) || (i === 0 && d < SPIDER_GRAPH_PHYS.hitR + 4 && (!best || d < bestD))) {
          bestD = d;
          best = { cl, idx: i };
        }
      }
    }
    return best;
  }

  /** Verbatim Shopify `dh.nudge(frame, sx, sy, dx, dy)`: cursor movement ripples & pushes nearby ambient spider nodes in 3D! */
  private nudgeAmbientSpiders(sx: number, sy: number, dx: number, dy: number) {
    const moveMag = Math.hypot(dx, dy);
    if (moveMag <= 0.01) return;
    const { nudgeReach, nudgePush, nudgeUp, nudgeHub, nudgeMax } = SPIDER_GRAPH_PHYS;
    const frame = this.lastFrame;
    for (const cl of [...this.ambientClusters, ...this.finishSpiders]) {
      if (cl.absorbed || !cl.anchor) continue;
      const [ax, ay, az] = cl.anchor;
      for (let i = 0; i < cl.nodes.length; i++) {
        const sp = cl.screenNodes[i];
        if (!sp || i === cl.dragIdx) continue;
        const distScreen = Math.hypot(sp.x - sx, sp.y - sy);
        if (distScreen >= nudgeReach) continue;
        const n = cl.nodes[i];
        let vx = dx;
        let vy = dy;
        let b = moveMag;
        if (frame) {
          const hit = unprojectPoint(frame, sx, sy, Math.max(2, az + n.z), [ax + n.x, ay + n.y]);
          if (hit) {
            const rx = ax + n.x - hit[0];
            const ry = ay + n.y - hit[1];
            const rLen = Math.hypot(rx, ry);
            if (rLen >= 2) {
              vx = rx;
              vy = ry;
              b = rLen;
            }
          }
        }
        const falloff = 1 - distScreen / nudgeReach;
        const impulse = Math.min(nudgeMax, nudgePush * moveMag * falloff * falloff * (i === 0 ? nudgeHub : 1));
        n.vx += (vx / b) * impulse;
        n.vy += (vy / b) * impulse;
        n.vz += nudgeUp * impulse;
        cl.energy = Math.max(cl.energy, impulse * impulse);
      }
    }
  }

  onPointerDown(screenX: number, screenY: number): boolean {
    if (this.phase === 'idle') {
      if (this.pointInQuad(screenX, screenY, this.startHitQuad)) {
        this.startDown = true;
        return false;
      }
      // Verbatim Shopify `dh.grab`: allow grabbing & dragging ANY node (or hub) of an ambient spider!
      const hitNode = this.findAmbientNodeAt(screenX, screenY);
      if (hitNode) {
        const { cl, idx } = hitNode;
        const n = cl.nodes[idx];
        cl.dragIdx = idx;
        cl.dragTarget = [n.x, n.y, n.z];
        this.draggedSpider = cl;
        this.spiderDragStart = [screenX, screenY];
        this.lastMouseX = screenX;
        this.lastMouseY = screenY;
        return true;
      }
    }
    if (this.phase === 'finished') {
      if (
        this.pointInQuad(screenX, screenY, this.againHitQuad) ||
        this.pointInQuad(screenX, screenY, this.closeHitQuad) ||
        this.pointInRect(screenX, screenY, this.topCloseHitRect)
      ) {
        return false;
      }
    }
    if ((this.phase === 'idle' || (this.phase === 'finished' && !this.fellInHole)) && this.orbVisible && this.orbScreenR > 8) {
      if (Math.hypot(screenX - this.orbScreenX, screenY - this.orbScreenY) <= this.orbScreenR * 1.35) {
        this.orbDragging = true;
        this.lastMouseX = screenX;
        this.lastMouseY = screenY;
        this.orbSpinVx = 0;
        this.orbSpinVy = 0;
        this.pokeAllLegsRadial();
        return true;
      }
    }
    return false;
  }

  onPointerUp(): boolean {
    this.startDown = false;
    if (this.draggedSpider) {
      const cl = this.draggedSpider;
      cl.dragIdx = -1;
      cl.dragTarget = null;
      if (
        this.spiderDragStart &&
        Number.isFinite(this.lastMouseX) &&
        Number.isFinite(this.lastMouseY) &&
        Math.hypot(this.lastMouseX - this.spiderDragStart[0], this.lastMouseY - this.spiderDragStart[1]) < SPIDER_GRAPH_PHYS.clickDist
      ) {
        // Short click without drag -> verbatim Shopify `ph(cl, 650)` radial burst!
        this.burstAmbientSpider(cl, 650);
      }
      this.draggedSpider = null;
      this.spiderDragStart = null;
      return true;
    }
    if (!this.orbDragging) return false;
    this.orbDragging = false;
    return true;
  }

  onPointerMove(screenX: number, screenY: number): boolean {
    const prevX = this.lastMouseX;
    const prevY = this.lastMouseY;
    this.lastMouseX = screenX;
    this.lastMouseY = screenY;

    this.topCloseHovered = this.isPlayingOrFinished() && this.pointInRect(screenX, screenY, this.topCloseHitRect);
    this.againHovered = this.phase === 'finished' && this.pointInQuad(screenX, screenY, this.againHitQuad);
    this.closeHovered = this.phase === 'finished' && this.pointInQuad(screenX, screenY, this.closeHitQuad);

    if (this.phase === 'playing') {
      this.setStartHover(false);
      this.orbHovered = false;
      this.ambientHovered = false;
      return this.topCloseHovered;
    }

    const dx = Number.isFinite(prevX) ? screenX - prevX : 0;
    const dy = Number.isFinite(prevY) ? screenY - prevY : 0;

    // 1) Active ambient spider drag (`dh.dragTo` verbatim!)
    if (this.draggedSpider && this.draggedSpider.dragIdx >= 0 && this.draggedSpider.anchor && this.lastFrame) {
      const cl = this.draggedSpider;
      const n = cl.nodes[cl.dragIdx];
      const [ax, ay, az] = cl.anchor;
      const hit = unprojectPoint(this.lastFrame, screenX, screenY, Math.max(2, az + n.z), [ax + n.x, ay + n.y]);
      if (hit) {
        cl.dragTarget = [clamp(hit[0] - ax, -460, 460), clamp(hit[1] - ay, -420, 420), n.z];
      }
      this.ambientHovered = true;
      return true;
    }

    // 2) Active game orb drag-spin
    if (this.orbDragging) {
      const prevQ: [number, number, number, number] = [...this.orbQuat];
      rollQuat(this.orbQuat, dx * 2.2, dy * 2.2, 1, GAME_CONFIG.radius * (this.phase === 'finished' ? this.grow : 1));
      this.transferSpinLag(prevQ);
      this.orbSpinVx = clamp(dx * 60, -600, 600);
      this.orbSpinVy = clamp(dy * 60, -600, 600);
      this.orbHovered = true;
      return true;
    }

    if (this.phase === 'idle') {
      const overStart = this.pointInQuad(screenX, screenY, this.startHitQuad);
      this.setStartHover(overStart);
    } else {
      this.setStartHover(false);
    }

    this.orbHovered = false;
    if (this.orbVisible && this.orbScreenR > 8 && !(this.phase === 'finished' && this.fellInHole)) {
      const dist = Math.hypot(screenX - this.orbScreenX, screenY - this.orbScreenY);
      if (dist <= this.orbScreenR * 1.65) {
        this.orbHovered = true;
        if (dx !== 0 || dy !== 0) {
          this.pendingPoke = {
            x: screenX,
            y: screenY,
            ax: (this.pendingPoke?.ax ?? 0) + dx,
            ay: (this.pendingPoke?.ay ?? 0) + dy,
          };
        }
      }
    }

    // 3) Ambient spider mouse hover highlight + 3D velocity nudge (`dh.hover` + `dh.nudge` verbatim!)
    this.ambientHovered = false;
    if (this.phase === 'idle') {
      const hitNode = this.findAmbientNodeAt(screenX, screenY);
      for (const cl of [...this.ambientClusters, ...this.finishSpiders]) {
        cl.hoverIdx = hitNode?.cl === cl ? hitNode.idx : -1;
        if (Math.hypot(screenX - cl.screenX, screenY - cl.screenY) < 120) {
          cl.hoverAmount = Math.min(1, cl.hoverAmount + 0.35);
        }
      }
      if (hitNode) this.ambientHovered = true;
      if (dx !== 0 || dy !== 0) {
        this.nudgeAmbientSpiders(screenX, screenY, dx, dy);
      }
    }

    return this.isHoveringInteractive();
  }

  onPointerLeave() {
    this.setStartHover(false);
    this.startDown = false;
    this.orbHovered = false;
    this.ambientHovered = false;
    this.againHovered = false;
    this.closeHovered = false;
    this.topCloseHovered = false;
    this.orbDragging = false;
    if (this.draggedSpider) {
      this.draggedSpider.dragIdx = -1;
      this.draggedSpider.dragTarget = null;
      this.draggedSpider = null;
      this.spiderDragStart = null;
    }
    for (const cl of [...this.ambientClusters, ...this.finishSpiders]) cl.hoverIdx = -1;
    this.lastMouseX = NaN;
    this.lastMouseY = NaN;
  }

  onClick(screenX: number, screenY: number): 'none' | 'start' | 'orb' | 'again' | 'close' {
    this.startDown = false;
    if (this.isPlayingOrFinished() && this.pointInRect(screenX, screenY, this.topCloseHitRect)) {
      return 'close';
    }
    if (this.phase === 'finished') {
      if (this.pointInQuad(screenX, screenY, this.againHitQuad)) return 'again';
      if (this.pointInQuad(screenX, screenY, this.closeHitQuad)) return 'close';
      if (!this.fellInHole && this.orbVisible && Math.hypot(screenX - this.orbScreenX, screenY - this.orbScreenY) <= this.orbScreenR * 1.45) {
        this.pokeAllLegsRadial();
        return 'orb';
      }
      return 'none';
    }
    if (this.phase !== 'idle') return 'none';
    if (this.pointInQuad(screenX, screenY, this.startHitQuad)) {
      return 'start';
    }
    if (this.findAmbientNodeAt(screenX, screenY)) {
      // Consumes click on ambient spider so underlying cards don't raise when clicking a spider!
      return 'orb';
    }
    if (this.orbVisible && this.orbScreenR > 8) {
      if (Math.hypot(screenX - this.orbScreenX, screenY - this.orbScreenY) <= this.orbScreenR * 1.45) {
        this.pokeAllLegsRadial();
        return 'orb';
      }
    }
    return 'none';
  }

  onKeyDown(key: string): boolean {
    const k = key.toLowerCase();
    if (this.phase === 'finished') {
      if (k === 'escape') {
        this.requestClose();
        return true;
      }
      if (k === 'enter' || k === ' ') {
        this.requestAgain();
        return true;
      }
      return false;
    }
    if (this.phase !== 'playing') return false;
    if (k === ' ' || k === 'spacebar') {
      this.hop();
      return true;
    }
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(k)) {
      this.keys.add(k);
      return true;
    }
    if (k === 'escape') {
      this.stop();
      this.pendingCallback = 'close';
      return true;
    }
    return false;
  }

  onKeyUp(key: string) {
    this.keys.delete(key.toLowerCase());
  }

  hop() {
    if (this.phase !== 'playing' || this.fallingHole) return;
    // Allow immediate re-hop both when grounded AND during post-landing micro-bounce (`!hopAir` & close to ground),
    // and buffer spacebar presses made shortly before touchdown so landing-to-jump has zero dead-zone!
    if (this.zElev <= this.rampElev + 54 && !this.hopAir && this.hopPressAt < 0) {
      this.executeHop();
    } else {
      this.hopBufferSec = 0.2;
    }
  }

  private executeHop() {
    const orbR = GAME_CONFIG.radius * this.grow;
    const hopH = Math.min(GAME_CONFIG.hop * orbR * 2.1, 185);
    this.vz = Math.max(1380, Math.sqrt(2 * GAME_CONFIG.gravity * hopH));
    this.hopAir = true;
    this.hopBufferSec = 0;
    this.hopSv = -3.8;
  }

  /** Verbatim Shopify `Fp()` squash-and-stretch spring stepper! */
  private stepHopSquash(dt: number, orbR: number) {
    const subSteps = Math.max(1, Math.ceil(dt / (NODE_SUBSTEP * 0.5)));
    const h = dt / subSteps;
    const vRef = Math.max(800, (2 * Math.min(GAME_CONFIG.hop * orbR, 180)) / HOP_SPRING.riseSec);
    for (let s = 0; s < subSteps; s++) {
      const targetS = this.hopPressAt >= 0
        ? HOP_SPRING.press
        : this.hopAir
          ? -0.12 * Math.min(1, Math.abs(this.vz) / vRef)
          : 0;
      this.hopSv += (-784 * (this.hopS - targetS) - HOP_SPRING.damp * this.hopSv) * h;
      this.hopS = clamp(this.hopS + this.hopSv * h, -0.28, 0.44);
    }
    if (!this.hopAir && this.hopPressAt < 0 && Math.abs(this.hopS) < 0.001 && Math.abs(this.hopSv) < 0.02) {
      this.hopS = 0;
      this.hopSv = 0;
    }
  }

  private stepNodeSprings(dt: number, maxDisp: number) {
    if (!this.nodeSpringsActive) return;
    const steps = Math.max(1, Math.ceil(dt / NODE_SUBSTEP - 1e-9));
    const h = dt / steps;
    let peak = 0;
    for (let s = 0; s < steps; s++) {
      for (let idx = 3; idx < this.nodeOff.length; idx += 3) {
        let magSq = 0;
        for (let g = 0; g < 3; g++) {
          this.nodeVel[idx + g] += (-NODE_SPRING_K * this.nodeOff[idx + g] - NODE_SPRING_DAMP * this.nodeVel[idx + g]) * h;
          this.nodeOff[idx + g] += this.nodeVel[idx + g] * h;
          magSq += this.nodeOff[idx + g] * this.nodeOff[idx + g];
        }
        const mag = Math.sqrt(magSq);
        if (mag > maxDisp) {
          const k = maxDisp / mag;
          for (let g = 0; g < 3; g++) {
            this.nodeOff[idx + g] *= k;
            this.nodeVel[idx + g] *= 0.5;
          }
        }
        if (s === steps - 1) {
          const vMag = Math.hypot(this.nodeVel[idx], this.nodeVel[idx + 1], this.nodeVel[idx + 2]);
          peak = Math.max(peak, mag, vMag / 20);
        }
      }
    }
    if (peak < 0.05) {
      this.nodeOff.fill(0);
      this.nodeVel.fill(0);
      this.nodeSpringsActive = false;
    }
  }

  private stepStartBox(dt: number) {
    const targetLift = this.startDown ? START_ANIM.downLift : this.startHovered ? START_ANIM.hoverLift : START_ANIM.restLift;
    if (this.startTurnT < START_ANIM.flipSec) {
      this.startTurnT = Math.min(START_ANIM.flipSec, this.startTurnT + dt);
      const d = this.startTurnT / START_ANIM.flipSec;
      this.startTurn = d >= 1
        ? this.startTurnAim
        : this.startTurnFrom + (this.startTurnAim - this.startTurnFrom) * d * d * (8 - 12 * d + 5 * d * d);
    }
    for (let rem = dt; rem > 1e-6; rem -= 1 / 120) {
      const h = Math.min(rem, 1 / 120);
      this.startLiftVel += (700 * (targetLift - this.startLift) - 30 * this.startLiftVel) * h;
      this.startLift += this.startLiftVel * h;
    }
  }

  /** Verbatim Shopify `fo()` + `Xn()`: fuse a node (with its exact `ink` color!) onto the player's rolling spider-orb! */
  private fuseSpiderNode(
    fromWorld: [number, number, number],
    ink: [number, number, number],
    ballX: number,
    ballY: number,
    ballZ: number,
    delaySec: number,
    seed: number,
    isHero: boolean,
  ) {
    const dx = fromWorld[0] - ballX;
    const dy = fromWorld[1] - ballY;
    const dz = fromWorld[2] - ballZ;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const localDir = quatInvRotate(this.orbQuat, [dx / dist, dy / dist, dz / dist]);
    // Radiate fused legs outward (`1.46..2.08 * orbR`, hero finish spiders burst even wider like 图三!)
    const ra = isHero ? 1.55 + 0.62 * detRand(seed) : 1.46 + 0.52 * detRand(seed);
    let nearIdx = 1;
    let bestD = Infinity;
    for (let i = 0; i < SPIDER_SHELL.dirs.length; i++) {
      const sd = SPIDER_SHELL.dirs[i];
      const d = Math.hypot(localDir[0] - sd[0], localDir[1] - sd[1], localDir[2] - sd[2]);
      if (d < bestD) {
        bestD = d;
        nearIdx = i + 1;
      }
    }
    this.fusedNodes.push({
      dir: localDir,
      ra,
      nearIdx,
      fromWorld,
      ink,
      delaySec,
      ageSec: 0,
      landed: false,
    });
  }

  /** Verbatim Shopify `kt()` + `Jo` cap: attach word chip onto orb & automatically drop oldest chips when exceeding cap! */
  private attachWordChip(text: string, fromWorld: [number, number, number], ballX: number, ballY: number, ballZ: number): WordChip {
    const dx = fromWorld[0] - ballX;
    const dy = fromWorld[1] - ballY;
    const dz = fromWorld[2] - ballZ;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const localDir = quatInvRotate(this.orbQuat, [dx / dist, dy / dist, dz / dist]);
    const chip: WordChip = {
      text,
      dir: localDir,
      ra: 1.24 + (this.wordsEaten % 3) * 0.16,
      fromWorld: [...fromWorld],
      ageSec: 0,
      landed: false,
      bgHex: CHIP_PALETTE[this.wordsEaten % CHIP_PALETTE.length],
    };
    this.wordChips.push(chip);
    while (this.wordChips.length > GAME_CONFIG.maxVisibleWordChips) {
      this.wordChips.shift();
    }
    return chip;
  }

  private recomputeGrow() {
    this.grow = clamp(
      Math.cbrt(1 + this.collected * GAME_CONFIG.growth + this.wordsEaten * GAME_CONFIG.wordGrowth),
      1,
      GAME_CONFIG.maxGrow,
    );
  }

  /** Verbatim Shopify `Bs()` + `rr()`: launch 5 staggered 3D celebration fireworks behind the finish line! */
  private spawnFinishFireworks(stageW: number) {
    this.fireworks = [];
    for (let p = 0; p < 5; p++) {
      const uX = stageW * (0.18 + 0.16 * ((p * 3) % 5) + 0.04 * (detRand(p * 17) - 0.5));
      const y = Math.max(40, this.finishDocY - 210 - 95 * detRand(p * 23));
      const apexZ = 210 + 140 * detRand(p * 37);
      const ink = HERO_FINISH_INKS[p % HERO_FINISH_INKS.length];
      this.fireworks.push({
        state: 'wait',
        t: 0,
        delay: 0.1 + 0.48 * p + 0.12 * detRand(p * 41),
        riseSec: 0.58 + 0.18 * detRand(p * 53),
        from: [uX, y, 4],
        to: [uX, y, apexZ],
        spread: 115 + 35 * detRand(p * 61),
        ink,
        sparks: [],
      });
    }
  }

  /** Verbatim Shopify `lr()` + `cr()`: advance 3D branching spider-web fireworks with drag & gravity! */
  private stepFireworks(dt: number) {
    const drag = Math.exp(-2.6 * dt);
    for (const fw of this.fireworks) {
      if (fw.state === 'dead') continue;
      fw.t += dt;
      if (fw.state === 'wait') {
        if (fw.t >= fw.delay) {
          fw.state = 'rise';
          fw.t = 0;
        }
      } else if (fw.state === 'rise') {
        if (fw.t >= fw.riseSec) {
          fw.state = 'burst';
          fw.t = 0;
          const speed = fw.spread * 2.6;
          fw.sparks = [{ p: [...fw.to], v: [0, 0, 0.12 * speed], parent: -1, life: 1.25 }];
          const arms = 11;
          for (let a = 0; a < arms; a++) {
            const ang = ((a + 0.3 * detRand(a * 13 + fw.delay * 9)) / arms) * TWO_PI;
            const cz = 2 * detRand(a * 19 + fw.spread) - 1;
            const sr = Math.sqrt(Math.max(0, 1 - cz * cz));
            const mag = speed * (0.68 + 0.42 * detRand(a * 31 + fw.to[0]));
            const vx = mag * sr * Math.cos(ang);
            const vy = mag * sr * Math.sin(ang);
            const vz = mag * cz;
            const parentIdx = fw.sparks.length;
            fw.sparks.push({ p: [...fw.to], v: [vx, vy, vz], parent: 0, life: 1.05 + 0.25 * detRand(a * 7) });
            if (detRand(a * 43 + fw.to[1]) < 0.55) {
              fw.sparks.push({
                p: [...fw.to],
                v: [vx * 1.18 + 0.28 * speed * (detRand(a * 59) - 0.5), vy * 1.18 + 0.28 * speed * (detRand(a * 67) - 0.5), vz * 1.18],
                parent: parentIdx,
                life: 0.95 + 0.25 * detRand(a * 71),
              });
            }
          }
        }
      } else if (fw.state === 'burst') {
        if (fw.t >= 1.3) {
          fw.state = 'dead';
          continue;
        }
        const gStep = 0.55 * fw.spread * dt;
        for (const sp of fw.sparks) {
          sp.v[0] *= drag;
          sp.v[1] *= drag;
          sp.v[2] = sp.v[2] * drag - gStep;
          sp.p[0] += sp.v[0] * dt;
          sp.p[1] += sp.v[1] * dt;
          sp.p[2] += sp.v[2] * dt;
        }
      }
    }
  }

  /** Verbatim Shopify `Os()`: crossing the finish line pulls ALL hero finish spider clusters into our starburst spider! */
  private absorbHeroFinishSpiders(stageW: number, ballX: number, ballY: number, ballZ: number) {
    for (const cl of this.finishSpiders) {
      if (cl.absorbed) continue;
      cl.absorbed = true;
      const hubX = cl.uX * stageW;
      for (const node of cl.nodes) {
        if (node.eaten) continue;
        node.eaten = true;
        const wx = hubX + node.x;
        const wy = cl.docY + node.y;
        const wz = Math.max(18, 128 + node.z);
        const flyDelay = Math.min(0.65, Math.hypot(wx - ballX, wy - ballY) / 1500);
        this.fuseSpiderNode([wx, wy, wz], node.ink, ballX, ballY, ballZ, flyDelay, cl.docY + node.idx * 47, true);
      }
    }
  }

  /** Verbatim Shopify `js()` / `ws()` finish choreography entry! */
  private finalizeRun(fell: boolean, stageW: number) {
    this.phase = 'finished';
    this.fellInHole = fell;
    this.finishClock = 0;
    this.finishBoardRise = 0;
    this.collapseClock = 0;
    this.keys.clear();
    this.wheelThrottle = 0;
    this.grabLegs = [];

    const orbR = GAME_CONFIG.radius * this.grow;
    const ballX = fell ? this.fallBallX : this.xFrac * stageW;
    const ballY = fell ? this.fallBallY : Math.min(this.finishDocY, this.scrollY + 380);
    const ballZ = orbR + 16 + this.surfaceZ + this.zElev;

    if (fell) {
      this.finishHoleRef = this.fallingHole;
      this.fellDistPx = Math.max(0, Math.round(this.startScrollY + 380 - ballY));
      this.finishBoardReadyAt = 0.25;
    } else {
      // Absorb the 2 multi-colored hero finish spiders (`Os()`), launch 3D fireworks (`Bs()`), and glide smoothly past finish line!
      this.absorbHeroFinishSpiders(stageW, ballX, ballY, ballZ);
      this.spawnFinishFireworks(stageW);
      this.finishBallX = ballX;
      this.finishBallY = ballY;
      this.finishTargetX = clamp(ballX, stageW * 0.34, stageW * 0.66);
      this.finishTargetY = Math.max(80, this.finishDocY - 190);
      this.finishVx = this.vxPx * 0.45;
      this.finishVy = -Math.max(260, Math.min(480, Math.abs(this.speed) * 0.65));
      this.finishBoardReadyAt = 0.52;
    }

    const totalTarget = Math.max(1, this.totalCollectibles + Math.min(20, this.pageWords.length));
    const got = this.collected + this.wordsEaten * 0.75 + this.jumpPoints * 0.4 + (fell ? 0 : 18);
    const ratio = clamp((got / totalTarget) * 0.68 + (fell ? 0 : 0.14), 0, 1);
    this.grade = gradeForScore(ratio);
  }

  /** Verbatim Shopify `qp()` 3D curved funnel wall collision physics when falling into a black hole! */
  private stepFunnelFall(dt: number, stageW: number) {
    const hole = this.fallingHole!;
    const holeX = hole.uX * stageW;
    const holeY = hole.docY;
    const R = hole.R;
    const D = GAME_CONFIG.wormDepth * R;
    const throatR = GAME_CONFIG.throat * R;
    const ballR = GAME_CONFIG.radius * this.grow;
    const maxRim = R * Math.SQRT2;
    const funnelDepthAt = (rad: number) =>
      rad >= maxRim ? 0 : rad <= throatR ? D : D * (1 - Math.sqrt((rad - throatR) / (maxRim - throatR)));

    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.fallVz -= GAME_CONFIG.fallGravity * h;
      this.fallBallX += this.fallVx * h;
      this.fallBallY += this.fallVy * h;
      this.fallBallZ += this.fallVz * h;

      const dx = this.fallBallX - holeX;
      const dy = this.fallBallY - holeY;
      const rx = dx - clamp(dx, -hole.lx, hole.lx);
      const ry = dy - clamp(dy, -hole.ly, hole.ly);
      const rad = Math.hypot(rx, ry);
      const wallZ = -funnelDepthAt(rad);

      if (this.fallBallZ - ballR < wallZ && rad > throatR) {
        const nx = rad > 1e-4 ? -rx / rad : 0;
        const ny = rad > 1e-4 ? -ry / rad : 0;
        const nz = 0.72;
        const nLen = Math.hypot(nx, ny, nz) || 1;
        const ux = nx / nLen;
        const uy = ny / nLen;
        const uz = nz / nLen;
        const pen = wallZ - (this.fallBallZ - ballR);
        this.fallBallX += ux * pen * 0.65;
        this.fallBallY += uy * pen * 0.65;
        this.fallBallZ += uz * pen * 0.65;
        const vn = this.fallVx * ux + this.fallVy * uy + this.fallVz * uz;
        if (vn < 0) {
          this.fallVx -= 1.3 * vn * ux;
          this.fallVy -= 1.3 * vn * uy;
          this.fallVz -= 1.3 * vn * uz;
        }
        const drag = Math.exp(-3 * h);
        this.fallVx *= drag;
        this.fallVy *= drag;
      } else if (this.fallBallZ < -D && rad + ballR > throatR) {
        const pull = (rad + ballR - throatR) * 0.85;
        if (rad > 1e-4) {
          this.fallBallX -= (rx / rad) * pull;
          this.fallBallY -= (ry / rad) * pull;
          this.fallVx *= 0.85;
          this.fallVy *= 0.85;
        }
      }
      rollQuat(this.orbQuat, this.fallVx, this.fallVy, h, ballR);
    }

    this.xFrac = this.fallBallX / stageW;
    this.zElev = this.fallBallZ;
    this.scrollY += (Math.max(0, holeY - 380) - this.scrollY) * Math.min(1, dt * 4.5);
    this.fallTimer += dt;

    if (this.fallBallZ < -(GAME_CONFIG.wormDepth + 1.4) * R || this.fallTimer >= 1.35) {
      this.finalizeRun(true, stageW);
    }
  }

  /** Verbatim Shopify `gt(dt)` 2-bone IK word-grabbing spider legs (`reach` -> `plant` -> `pull` -> `drop`)! */
  private stepWordGrabLegs(dt: number, ballX: number, ballY: number, ballZ: number, orbR: number) {
    const segLen = Math.max(95, (Math.max(1.2, GAME_CONFIG.legStretch) - 1) * orbR * 0.72);
    const scanR = Math.max(220, orbR * 4.2);
    const maxLegs = Math.min(10, this.getTotalLegs());

    if (this.grabLegs.length < maxLegs) {
      const candidates = this.pageWords
        .filter((w) => w.state === 'ready')
        .map((w) => ({ w, d: Math.hypot(w.col - ballX, w.docY - ballY) }))
        .filter(({ d }) => d >= orbR * 0.45 && d <= scanR)
        .sort((a, b) => a.d - b.d);

      for (const { w } of candidates) {
        if (this.grabLegs.length >= maxLegs) break;
        const dirX = w.col - ballX;
        const dirY = w.docY - ballY;
        const mag = Math.hypot(dirX, dirY) || 1;
        const hipDir: [number, number, number] = [
          (dirX / mag) * Math.cos(20 * (Math.PI / 180)),
          (dirY / mag) * Math.cos(20 * (Math.PI / 180)),
          -Math.sin(20 * (Math.PI / 180)),
        ];
        const hipPos: [number, number, number] = [
          ballX + hipDir[0] * orbR,
          ballY + hipDir[1] * orbR,
          ballZ + hipDir[2] * orbR,
        ];
        const leg: IKGrabLeg = {
          word: w,
          phase: 'reach',
          ageSec: 0,
          litSec: -1,
          hipDir,
          foot: [...hipPos],
          fv: [this.vxPx, -this.speed, LEG_PHYS.step * orbR],
          knee: [...hipPos],
          kv: [0, 0, 0],
          aim: null,
          segLen: 0,
          alpha: 1,
          chip: null,
          done: false,
        };
        w.state = 'claimed';
        w.leg = leg;
        this.grabLegs.push(leg);
      }
    }

    const subSteps = Math.max(1, Math.ceil(dt / NODE_SUBSTEP));
    const h = dt / subSteps;
    const lenLerp = 1 - Math.exp(-dt / 0.07);

    for (const leg of this.grabLegs) {
      leg.ageSec += dt;
      const hip: [number, number, number] = [
        ballX + leg.hipDir[0] * orbR,
        ballY + leg.hipDir[1] * orbR,
        ballZ + leg.hipDir[2] * orbR,
      ];
      const targetPos: [number, number, number] = [leg.word.col, leg.word.docY, 6 + this.surfaceZ];

      if (leg.phase === 'reach') {
        for (let s = 0; s < subSteps; s++) {
          for (let g = 0; g < 3; g++) {
            leg.fv[g] += (LEG_PHYS.foot * LEG_PHYS.foot * (targetPos[g] - leg.foot[g]) - 2 * LEG_PHYS.foot * leg.fv[g]) * h;
            leg.foot[g] += leg.fv[g] * h;
          }
        }
        const distToWord = Math.hypot(leg.foot[0] - targetPos[0], leg.foot[1] - targetPos[1], leg.foot[2] - targetPos[2]);
        if (distToWord < 6 || leg.ageSec >= 0.22) {
          leg.phase = 'plant';
          leg.ageSec = 0;
          leg.litSec = this.elapsedSec;
          leg.foot = [...targetPos];
          leg.kv[2] -= LEG_PHYS.give * orbR;
        }
      } else if (leg.phase === 'plant') {
        leg.foot = [...targetPos];
        const stretch = Math.hypot(hip[0] - leg.foot[0], hip[1] - leg.foot[1], hip[2] - leg.foot[2]);
        if (stretch >= 1.85 * segLen || leg.ageSec >= 0.28) {
          leg.word.state = 'eaten';
          this.wordsEaten++;
          this.recomputeGrow();
          const chip = this.attachWordChip(leg.word.text, leg.foot, ballX, ballY, ballZ);
          leg.phase = 'pull';
          leg.chip = chip;
          leg.ageSec = 0;
        }
      } else if (leg.phase === 'pull' && leg.chip) {
        const u = clamp(leg.chip.ageSec / LEG_PHYS.flySec, 0, 1);
        const ease = easeOutCubic(u);
        const rot = quatRotate(this.orbQuat, leg.chip.dir);
        const dest: [number, number, number] = [
          ballX + rot[0] * orbR * leg.chip.ra,
          ballY + rot[1] * orbR * leg.chip.ra,
          Math.max(4, ballZ + rot[2] * orbR * leg.chip.ra),
        ];
        leg.foot = [
          lerp(leg.chip.fromWorld[0], dest[0], ease),
          lerp(leg.chip.fromWorld[1], dest[1], ease),
          lerp(leg.chip.fromWorld[2], dest[2], ease),
        ];
        leg.alpha = 1 - clamp((u - 0.6) / 0.4, 0, 1);
        if (u >= 1) leg.done = true;
      } else if (leg.phase === 'drop') {
        const u = clamp(leg.ageSec / LEG_PHYS.dropSec, 0, 1);
        for (let s = 0; s < subSteps; s++) {
          for (let g = 0; g < 3; g++) {
            leg.fv[g] += (LEG_PHYS.foot * LEG_PHYS.foot * (hip[g] - leg.foot[g]) - 2 * LEG_PHYS.foot * leg.fv[g] - (g === 2 ? LEG_PHYS.gravity * orbR : 0)) * h;
            leg.foot[g] += leg.fv[g] * h;
          }
        }
        leg.alpha = 1 - u;
        if (u >= 1) leg.done = true;
      }

      const targetLen = leg.phase === 'reach' || leg.phase === 'plant' ? segLen : segLen * 0.4;
      leg.segLen += (targetLen - leg.segLen) * lenLerp;
      const pole: [number, number, number] = [leg.hipDir[0], leg.hipDir[1], leg.hipDir[2] + 1.2];
      const aimKnee = solveKneeIK(hip, leg.foot, Math.max(12, leg.segLen), pole);
      const aimVel: [number, number, number] = leg.aim && dt > 0
        ? [(aimKnee[0] - leg.aim[0]) / dt, (aimKnee[1] - leg.aim[1]) / dt, (aimKnee[2] - leg.aim[2]) / dt]
        : [0, 0, 0];
      leg.aim = aimKnee;

      for (let s = 0; s < subSteps; s++) {
        for (let g = 0; g < 3; g++) {
          leg.kv[g] += (LEG_PHYS.spring * (aimKnee[g] - leg.knee[g]) + LEG_PHYS.damp * (aimVel[g] - leg.kv[g]) - (g === 2 ? LEG_PHYS.gravity * orbR : 0)) * h;
          leg.knee[g] += leg.kv[g] * h;
        }
      }
    }

    if (this.grabLegs.some((l) => l.done)) {
      this.grabLegs = this.grabLegs.filter((l) => {
        if (l.done && l.word.leg === l) l.word.leg = null;
        return !l.done;
      });
    }
  }

  private stepOrbIdleInteraction(dt: number, orbR: number) {
    if (this.pendingPoke && this.orbJac && dt > 0) {
      const p = this.pendingPoke;
      this.pendingPoke = null;
      const { scaleX: I, dRowY: B, dElevY: R } = this.orbJac;
      const K = B * B + R * R || 1;
      const N = 1.2 / dt;
      const impulse: [number, number, number] = [
        clamp((N * p.ax) / Math.max(0.15, I), -900, 900),
        clamp((N * B * p.ay) / K, -900, 900),
        clamp((N * R * p.ay) / K, -900, 900),
      ];
      const zt = (0.65 * Math.max(0.25, I) * orbR * 1.65) ** 2;
      for (let i = 1; i < BASE_NODE_COUNT; i++) {
        const sp = this.orbScreenNodes[i];
        if (!sp) continue;
        const d2 = (sp.x - p.x) ** 2 + (sp.y - p.y) ** 2;
        if (d2 < 4 * zt) {
          this.pokeNode(i, Math.exp(-d2 / zt), impulse, dt);
        }
      }
    }

    if (!this.orbDragging) {
      if (this.orbSpinVx || this.orbSpinVy) {
        const decay = 0.97 ** (60 * dt);
        this.orbSpinVx *= decay;
        this.orbSpinVy *= decay;
        if (Math.hypot(this.orbSpinVx, this.orbSpinVy) < 3) {
          this.orbSpinVx = 0;
          this.orbSpinVy = 0;
        } else {
          const prevQ: [number, number, number, number] = [...this.orbQuat];
          rollQuat(this.orbQuat, this.orbSpinVx, this.orbSpinVy, dt, orbR);
          this.transferSpinLag(prevQ);
        }
      } else {
        rollQuat(
          this.orbQuat,
          Math.cos(this.idleBreath * 0.65) * 14,
          Math.sin(this.idleBreath * 0.5) * 10,
          dt,
          orbR,
        );
      }
    }

    this.stepNodeSprings(dt, 0.65 * orbR * 1.65);
  }

  step(dt: number, stageW: number): boolean {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    const w = Math.max(600, stageW);
    this.idleBreath += clampedDt;

    for (const cl of [...this.ambientClusters, ...this.finishSpiders]) {
      cl.hoverAmount = Math.max(0, cl.hoverAmount - clampedDt * 2.4);
      if (!cl.absorbed) {
        this.stepAmbientSpiderPhysics(cl, clampedDt);
      }
    }

    // ── IDLE PHASE: bottom 3D start console + fixed-center interactive spider + live ambient spider force-graphs ──
    if (this.phase === 'idle') {
      this.stepStartBox(clampedDt);
      this.stepOrbIdleInteraction(clampedDt, GAME_CONFIG.radius);
      return false;
    }

    // ── FINISHED PHASE: full Shopify finish choreography (preserves mid-air jump arc -> bouncy landing -> coasting -> fireworks -> rising 3D slab!) ──
    if (this.phase === 'finished') {
      this.finishClock += clampedDt;
      if (this.collapseClock >= 0) {
        this.collapseClock += clampedDt;
        this.obstacleOpenK = 1 - smooth01(this.collapseClock / LEG_PHYS.collapseSec);
      }

      for (const fn of this.fusedNodes) {
        if (fn.landed) continue;
        fn.ageSec += clampedDt;
        if (fn.ageSec >= fn.delaySec + LEG_PHYS.flySec) {
          fn.landed = true;
          this.collected++;
          this.recomputeGrow();
        }
      }
      for (const chip of this.wordChips) {
        if (!chip.landed) {
          chip.ageSec += clampedDt;
          if (chip.ageSec >= LEG_PHYS.flySec) chip.landed = true;
        }
      }

      // 1) Preserve full airborne jump parabola across finish line (`Ea()` runs in finish too! Never snap back to floor!)
      if (!this.fellInHole) {
        if (this.zElev > 0 || this.vz > 0) {
          this.zElev += this.vz * clampedDt;
          this.vz -= GAME_CONFIG.gravity * clampedDt;
          if (this.zElev <= 0) {
            const impactSpd = -this.vz;
            this.zElev = 0;
            const vRef = Math.max(900, Math.sqrt(2 * GAME_CONFIG.gravity * 160));
            if (impactSpd > 260) {
              this.hopSv += HOP_SPRING.impact * Math.min(1, impactSpd / vRef);
            }
            if (impactSpd > HOP_SPRING.settle * vRef) {
              this.vz = impactSpd * HOP_SPRING.bounce;
              this.hopAir = true;
            } else {
              this.vz = 0;
              this.hopAir = false;
            }
          }
        } else {
          this.hopAir = false;
        }

        const stillAirborne = this.zElev > 1 || this.vz > 0;
        const dx = this.finishTargetX - this.finishBallX;
        const dy = this.finishTargetY - this.finishBallY;
        const dist = Math.hypot(dx, dy);
        const spd = Math.hypot(this.finishVx, this.finishVy);

        if (stillAirborne) {
          // Exact Shopify `yo()` `air: ft.z > 0.5`: while mid-air, glide smoothly without ground friction!
          const blend = 1 - Math.exp(-3 * clampedDt);
          if (dist > 4 && spd > 1) {
            const dirX = this.finishVx / spd + (dx / dist - this.finishVx / spd) * blend;
            const dirY = this.finishVy / spd + (dy / dist - this.finishVy / spd) * blend;
            const mag = Math.hypot(dirX, dirY) || 1;
            this.finishVx = (dirX / mag) * spd;
            this.finishVy = (dirY / mag) * spd;
          }
          this.finishBallX = clamp(this.finishBallX + this.finishVx * clampedDt, w * 0.14, w * 0.86);
          this.finishBallY = Math.max(60, this.finishBallY + this.finishVy * clampedDt);
        } else if (dist > 2 && spd > 1) {
          const blend = 1 - Math.exp(-6 * clampedDt);
          const dirX = this.finishVx / spd + (dx / dist - this.finishVx / spd) * blend;
          const dirY = this.finishVy / spd + (dy / dist - this.finishVy / spd) * blend;
          const mag = Math.hypot(dirX, dirY) || 1;
          const decel = Math.max(GAME_CONFIG.friction, (spd * spd) / Math.max(12, 2 * dist));
          const nextSpd = Math.max(0, spd - decel * clampedDt);
          this.finishVx = (dirX / mag) * nextSpd;
          this.finishVy = (dirY / mag) * nextSpd;
          this.finishBallX += this.finishVx * clampedDt;
          this.finishBallY += this.finishVy * clampedDt;
          rollQuat(this.orbQuat, this.finishVx, this.finishVy, clampedDt, GAME_CONFIG.radius * this.grow);
        } else {
          this.finishVx = 0;
          this.finishVy = 0;
          this.stepOrbIdleInteraction(clampedDt, GAME_CONFIG.radius * this.grow);
        }
        const camGoal = Math.max(0, this.finishDocY - 410);
        this.scrollY += (camGoal - this.scrollY) * Math.min(1, clampedDt * 5.2);
      }

      this.stepFireworks(clampedDt);
      this.stepHopSquash(clampedDt, GAME_CONFIG.radius * this.grow);

      // 3D Standing Finish Board rise-out-of-paper & close-back-into-paper animation
      if (this.closingAction !== 'none') {
        this.closeTimer += clampedDt;
        const closeFrac = clamp(this.closeTimer / LEG_PHYS.closeSec, 0, 1);
        this.finishBoardRise = Math.max(0, 1 - closeFrac * closeFrac);
        if (closeFrac >= 1) {
          const act = this.closingAction;
          if (act === 'again') {
            this.start(this.startScrollY);
            this.pendingCallback = 'again';
          } else {
            this.stop();
            this.pendingCallback = 'close';
          }
        }
      } else if (!this.fellInHole && this.zElev > 6 && this.finishClock < 1.35) {
        this.finishBoardReadyAt = Math.max(this.finishBoardReadyAt, this.finishClock + 0.08);
      } else if (this.finishClock >= this.finishBoardReadyAt) {
        const u = clamp((this.finishClock - this.finishBoardReadyAt) / LEG_PHYS.slideSec, 0, 1);
        this.finishBoardRise = easeOutCubic(u);
      }
      return true;
    }

    // ── PLAYING PHASE ──
    this.elapsedSec += clampedDt;
    this.obstacleOpenK = smooth01(this.elapsedSec / LEG_PHYS.openSec);

    if (this.fallingHole) {
      this.stepFunnelFall(clampedDt, w);
      return true;
    }

    // 1) Verbatim Shopify `Xp()` controlled throttle + curve resistance + card step-incline braking!
    const faster = this.keys.has('arrowup') || this.keys.has('w');
    const braking = this.keys.has('arrowdown') || this.keys.has('s');
    this.wheelThrottle *= Math.exp(-1.8 * clampedDt);
    const throttle = clamp((faster ? 1 : 0) - (braking ? 1 : 0) + this.wheelThrottle, -1, 1);

    const orbRadius = GAME_CONFIG.radius * this.grow;
    const preColPx = this.xFrac * w;
    const preDocY = this.scrollY + 380;

    // Verbatim Shopify `Sh()` card step elevation + climb slope resistance!
    const targetStepZ = this.evalCardStepZ(preColPx, preDocY, orbRadius);
    const dzStep = targetStepZ - this.prevStepTargetZ;
    const stepSlopeRad = dzStep > 0.25 && this.speed > 20
      ? clamp(Math.atan2(dzStep, Math.max(2, this.speed * clampedDt)), 0, 1.05)
      : 0;

    if (throttle < 0) {
      this.speed = Math.max(-GAME_CONFIG.maxReverse, this.speed - GAME_CONFIG.brake * -throttle * clampedDt);
    } else {
      const targetSpd = GAME_CONFIG.cruise + throttle * (GAME_CONFIG.maxSpeed - GAME_CONFIG.cruise);
      const deltaSpd = clamp((targetSpd - this.speed) * 4, -GAME_CONFIG.accel, GAME_CONFIG.accel) * clampedDt;
      this.speed += deltaSpd;
      if (this.speed < GAME_CONFIG.minSpeed && stepSlopeRad === 0) {
        this.speed = Math.min(GAME_CONFIG.minSpeed, this.speed + GAME_CONFIG.accel * clampedDt);
      }
    }

    // Apply Shopify `rt.incline * Math.sin(C)` uphill step slowdown when climbing onto a card module!
    if (stepSlopeRad > 0.01 && this.zElev <= 4) {
      this.speed = Math.max(GAME_CONFIG.minSpeed * 0.55, this.speed - GAME_CONFIG.incline * Math.sin(stepSlopeRad) * clampedDt);
      if (dzStep > 1.5 && this.hopSv < 1.5) {
        this.hopSv += 2.2; // tactile step-climb suspension dip!
      }
    }
    this.speed = clamp(this.speed, -GAME_CONFIG.maxReverse, GAME_CONFIG.maxSpeed);

    if (this.speed > this.peakSpeed) this.peakSpeed = this.speed;
    this.scrollY = clamp(this.scrollY - this.speed * clampedDt, 0, this.startScrollY);

    // 2) Lateral steering + slow sideways conveyor belt push (`Xp` + `ed.pushAt`)!
    const steerDir =
      (this.keys.has('arrowright') || this.keys.has('d') ? 1 : 0) -
      (this.keys.has('arrowleft') || this.keys.has('a') ? 1 : 0);
    const pushAccel = this.evalConveyorPush(preColPx, preDocY, w, orbRadius);
    // Verbatim Shopify `t.vx = clamp((t.vx + (steer * rt.steer + push) * dt) * exp(-4 * dt), -maxSide, maxSide)`
    this.vxPx = clamp(
      (this.vxPx + (steerDir * GAME_CONFIG.steer + pushAccel) * clampedDt) * Math.exp(-4.2 * clampedDt),
      -GAME_CONFIG.maxSide,
      GAME_CONFIG.maxSide,
    );

    let colPx = this.xFrac * w + this.vxPx * clampedDt;
    const minCol = w * 0.06;
    const maxCol = w * 0.94;
    if (colPx < minCol) {
      colPx = minCol;
      this.vxPx = Math.abs(this.vxPx) * GAME_CONFIG.bounce;
    } else if (colPx > maxCol) {
      colPx = maxCol;
      this.vxPx = -Math.abs(this.vxPx) * GAME_CONFIG.bounce;
    }
    this.xFrac = colPx / w;

    rollQuat(this.orbQuat, this.vxPx, -this.speed, clampedDt, orbRadius);

    const runnerDocY = this.scrollY + 380;

    // 3) Smooth card step height tracking (`at` exponential follow + graceful drop-off ledge!)
    const nextStepZ = this.evalCardStepZ(colPx, runnerDocY, orbRadius);
    if (this.prevStepTargetZ > nextStepZ + 4 && this.zElev <= this.rampElev + 2 && !this.hopAir) {
      // Rolled off the far edge of a card step -> drop smoothly with gravity!
      this.zElev += this.prevStepTargetZ - nextStepZ;
      this.hopAir = true;
    }
    this.prevStepTargetZ = nextStepZ;
    this.surfaceZ += (nextStepZ - this.surfaceZ) * (1 - Math.exp(-30 * clampedDt));

    // 4) Exact Shopify curved skate ramps (`ed.rideRamps()`): PURE vertical jump launch, ZERO horizontal speed boost!
    let nextRampElev = 0;
    let onRamp: LaunchRamp | null = null;
    for (const ramp of this.ramps) {
      const rx = ramp.uX * w;
      if (Math.abs(colPx - rx) <= ramp.halfW && runnerDocY >= ramp.y0 && runnerDocY <= ramp.ry) {
        nextRampElev = evalCurvedRamp(ramp.height * this.obstacleOpenK, ramp.ry - ramp.y0, ramp.ry - runnerDocY);
        onRamp = ramp;
        break;
      }
    }

    const prevRamp = this.rampOn;
    const prevRampElev = this.rampElev;
    this.rampElev = nextRampElev;
    this.rampOn = nextRampElev > 0 ? onRamp : null;

    if (prevRamp && !this.rampOn && runnerDocY < prevRamp.ry && Math.abs(colPx - prevRamp.uX * w) <= prevRamp.halfW + orbRadius * 0.5 && this.speed > 180) {
      const jumpH = Math.max(260, Math.min(GAME_CONFIG.jump * orbRadius * 1.35, 355));
      this.zElev = Math.max(this.zElev, prevRampElev);
      this.vz = Math.sqrt(2 * GAME_CONFIG.gravity * jumpH);
      this.hopAir = true;
      prevRamp.launched = true;
      this.jumpPoints += Math.max(1, Math.round(jumpH / GAME_CONFIG.jumpPx));
    }

    if (this.hopBufferSec > 0) {
      this.hopBufferSec = Math.max(0, this.hopBufferSec - clampedDt);
    }

    if (this.zElev > this.rampElev || this.vz > 0) {
      this.zElev += this.vz * clampedDt;
      this.vz -= GAME_CONFIG.gravity * clampedDt;
      if (this.zElev <= this.rampElev) {
        const impactSpd = -this.vz;
        this.zElev = this.rampElev;
        // Touchdown immediately unlocks the next hop — never block jumping during settle micro-bounces!
        this.hopAir = false;
        const vRef = Math.max(900, Math.sqrt(2 * GAME_CONFIG.gravity * 160));
        if (impactSpd > 260) {
          this.hopSv += HOP_SPRING.impact * Math.min(1, impactSpd / vRef);
        }
        if (this.hopBufferSec > 0) {
          this.executeHop();
        } else if (impactSpd > HOP_SPRING.settle * vRef) {
          this.vz = impactSpd * HOP_SPRING.bounce;
        } else {
          this.vz = 0;
        }
      }
    } else {
      this.zElev = this.rampElev;
      this.hopAir = false;
      if (this.hopBufferSec > 0) {
        this.executeHop();
      }
    }

    this.stepHopSquash(clampedDt, orbRadius);

    // 5) Exact Shopify circular & rectangular wormhole black holes (`Tr` + `Er` + `qp`)
    for (const hole of this.holes) {
      const hx = hole.uX * w;
      const effHx = hole.hx * this.obstacleOpenK;
      const effHy = hole.hy * this.obstacleOpenK;
      if (Math.abs(colPx - hx) < effHx * 0.88 && Math.abs(runnerDocY - hole.docY) < effHy * 0.88) {
        if (this.zElev <= 0.15 * orbRadius) {
          this.fallingHole = hole;
          this.fallBallX = colPx;
          this.fallBallY = runnerDocY;
          this.fallBallZ = orbRadius + this.surfaceZ + this.zElev;
          this.fallVx = this.vxPx * 0.5;
          this.fallVy = -this.speed * 0.45;
          this.fallVz = this.vz;
          this.fallTimer = 0;
          return true;
        } else if (!hole.cleared) {
          hole.cleared = true;
          this.jumpsCleared++;
          this.jumpPoints += 12;
        }
      }
    }

    const ballZ = orbRadius + 16 + this.surfaceZ + this.zElev;

    // 6) Exact Shopify WHOLE-CLUSTER SPIDER FUSION (`Cp` / `Ts`): touching an ambient spider fuses the ENTIRE spider into ONE!
    const hubTouchR = orbRadius * 1.5 + 88;
    for (const cl of this.ambientClusters) {
      if (cl.absorbed) continue;
      const hubX = cl.uX * w;
      const hubDist = Math.hypot(colPx - hubX, runnerDocY - cl.docY);
      if (hubDist <= hubTouchR + cl.radius * 0.45) {
        cl.absorbed = true;
        for (const node of cl.nodes) {
          if (node.eaten) continue;
          node.eaten = true;
          const wx = hubX + node.x;
          const wy = cl.docY + node.y;
          const wz = Math.max(16, 118 + node.z);
          const flyDelay = Math.min(0.45, Math.hypot(wx - colPx, wy - runnerDocY) / 1400);
          this.fuseSpiderNode([wx, wy, wz], node.ink, colPx, runnerDocY, ballZ, flyDelay, cl.docY + node.idx * 31, false);
        }
      }
    }

    for (const fn of this.fusedNodes) {
      if (fn.landed) continue;
      fn.ageSec += clampedDt;
      if (fn.ageSec >= fn.delaySec + LEG_PHYS.flySec) {
        fn.landed = true;
        this.collected++;
        this.recomputeGrow();
      }
    }

    for (const chip of this.wordChips) {
      if (!chip.landed) {
        chip.ageSec += clampedDt;
        if (chip.ageSec >= LEG_PHYS.flySec) chip.landed = true;
      }
    }

    // 7) Exact Shopify 2-bone IK word-grabbing spider legs (`gt` + `Wp`)
    this.stepWordGrabLegs(clampedDt, colPx, runnerDocY, ballZ, orbRadius);

    // 8) Checkered Finish Line crossing (`t.y <= t.finishY`!) -> triggers full finish choreography (`js()`)!
    if ((runnerDocY <= this.finishDocY || this.scrollY <= 1) && this.speed > 0) {
      this.finalizeRun(false, w);
    }

    return true;
  }

  getHudSnapshot(pageWidthPx: number, currentScrollY: number): GameHudSnapshot {
    const totalRunDist = Math.max(0, Math.round(this.startScrollY + 380 - this.finishDocY));
    const rem = this.phase === 'playing'
      ? Math.max(0, Math.round(this.scrollY + 380 - this.finishDocY))
      : this.phase === 'finished'
        ? (this.fellInHole ? Math.max(0, Math.round(this.scrollY)) : 0)
        : Math.round(Math.max(0, currentScrollY));
    const effectiveSpeed = this.phase === 'playing' ? Math.round(this.speed) : GAME_CONFIG.minSpeed;

    return {
      phase: this.phase,
      fellInHole: this.fellInHole,
      speedPx: effectiveSpeed,
      remainingPx: rem,
      pageWidthPx: Math.round(pageWidthPx),
      collected: this.collected,
      wordsEaten: this.wordsEaten,
      jumpsCleared: this.jumpsCleared,
      jumpPoints: this.jumpPoints,
      totalLegs: this.getTotalLegs(),
      totalCollectibles: this.totalCollectibles,
      elapsedSec: this.elapsedSec,
      peakSpeedPx: Math.round(this.peakSpeed),
      grade: this.grade,
      distancePx: this.fellInHole ? this.fellDistPx : totalRunDist,
      sizePx: Math.round(GAME_CONFIG.radius * this.grow * 2),
    };
  }

  /** Computes which raised standing cards lie IN FRONT OF a given projected point `(x, y, z)` for pixel-perfect 3D occlusion! */
  private getOccludingPaths(pt: { x: number; y: number; z: number } | null, occluders?: OccluderSet): Path2D[] {
    if (!pt || !occluders || occluders.covers.length === 0) return [];
    const out: Path2D[] = [];
    for (let i = 0; i < occluders.covers.length; i++) {
      if (pt.z > occluders.covers[i].depthAt(pt.x, pt.y) - 4) {
        out.push(occluders.coverPaths[i]);
      }
    }
    return out;
  }

  /** Renders large 3D spherical ambient spiders + 2 colored finish-line hero spiders WITH exact raised-card 3D occlusion (fixes 图一、图二!). */
  private renderAmbientSpiders(
    ctx: CanvasRenderingContext2D,
    frame: CurveFrame,
    scrollY: number,
    isDark: boolean,
    occluders?: OccluderSet,
  ) {
    const alpha = frame.rise * frame.fade * 0.92;
    if (alpha <= 0.02) return;

    const allClusters = [...this.ambientClusters, ...this.finishSpiders];
    if (allClusters.length === 0) return;

    const w = frame.W;
    const badgeBg = 'rgba(26,64,214,0.92)';
    const shadowCol = isDark ? `rgba(0,0,0,${(alpha * 0.45).toFixed(3)})` : `rgba(8,38,22,${(alpha * 0.24).toFixed(3)})`;
    const tagFont = '600 12px "IBM Plex Mono", system-ui, sans-serif';

    for (let cIdx = 0; cIdx < allClusters.length; cIdx++) {
      const cl = allClusters[cIdx];
      if (cl.absorbed) continue;
      const baseRow = cl.docY - scrollY + frame.lead;
      if (baseRow < -240 || baseRow > frame.T + 240) {
        cl.anchor = null;
        continue;
      }

      const hubX = cl.uX * w;
      const baseElev = (cl.isFinishHero ? 128 : 118) + Math.sin(this.idleBreath * 0.9 + cIdx * 1.6) * 8;
      cl.anchor = [hubX, baseRow, baseElev];
      const projected: ({ x: number; y: number; z: number } | null)[] = [];
      const shadows: ({ x: number; y: number; z: number } | null)[] = [];

      for (let i = 0; i < cl.nodes.length; i++) {
        const n = cl.nodes[i];
        if (n.eaten) {
          projected.push(null);
          shadows.push(null);
          continue;
        }
        const wx = hubX + n.x;
        const wy = baseRow + n.y;
        const wz = Math.max(12, baseElev + n.z);
        const pt = projectPoint(frame, wx, wy, wz);
        const sh = projectPoint(frame, wx + 22, wy + 16, 1);
        if (i === 0 && pt) {
          cl.screenX = pt.x;
          cl.screenY = pt.y;
        }
        projected.push(pt ? { x: pt.x, y: pt.y, z: pt.z } : null);
        shadows.push(sh ? { x: sh.x, y: sh.y, z: sh.z } : null);
      }
      cl.screenNodes = projected;

      const hubP = projected[0];
      const sh0 = shadows[0];

      // 1) Ground shadow web — clipped behind ANY raised standing card AND behind 3D standing titles!
      const shadowClip = this.getOccludingPaths(sh0 ?? hubP, occluders);
      ctx.save();
      for (const p of shadowClip) ctx.clip(p, 'evenodd');
      if (occluders?.titleCovers) {
        for (const tc of occluders.titleCovers) ctx.clip(tc.path, 'evenodd');
      }
      ctx.strokeStyle = shadowCol;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [a, b] of cl.links) {
        const sa = shadows[a];
        const sb = shadows[b];
        if (!sa || !sb) continue;
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
      }
      ctx.stroke();
      ctx.restore();

      // 2) Spider body, spokes, nodes & badge — clipped cleanly behind ANY raised standing card or closer 3D title!
      const bodyClip = this.getOccludingPaths(hubP, occluders);
      ctx.save();
      for (const p of bodyClip) ctx.clip(p, 'evenodd');
      if (hubP && occluders?.titleCovers) {
        for (const tc of occluders.titleCovers) {
          if (hubP.z > tc.z + 2) ctx.clip(tc.path, 'evenodd');
        }
      }

      const [sr, sg, sb] = SPIDER_COLOR;
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(alpha * 0.28).toFixed(3)})`;
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      for (const [a, b] of cl.links) {
        if (a === 0 || b === 0) continue;
        const pa = projected[a];
        const pb = projected[b];
        if (!pa || !pb) continue;
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
      ctx.stroke();

      if (cl.isFinishHero && hubP) {
        ctx.lineWidth = 1.05;
        for (let i = 1; i < cl.nodes.length; i++) {
          const p = projected[i];
          if (!p) continue;
          const [ir, ig, ib] = cl.nodes[i].ink;
          if (typeof ctx.createLinearGradient === 'function') {
            const grad = ctx.createLinearGradient(hubP.x, hubP.y, p.x, p.y);
            grad.addColorStop(0, `rgba(${ir},${ig},${ib},${(alpha * 0.92).toFixed(3)})`);
            grad.addColorStop(1, `rgba(255,255,255,${(alpha * 0.85).toFixed(3)})`);
            ctx.strokeStyle = grad;
          } else {
            ctx.strokeStyle = `rgba(${ir},${ig},${ib},${(alpha * 0.85).toFixed(3)})`;
          }
          ctx.beginPath();
          ctx.moveTo(hubP.x, hubP.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(alpha * 0.62).toFixed(3)})`;
        ctx.lineWidth = 0.95;
        ctx.beginPath();
        for (const [a, b] of cl.links) {
          if (a !== 0 && b !== 0) continue;
          const pa = projected[a];
          const pb = projected[b];
          if (!pa || !pb) continue;
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
        }
        ctx.stroke();
      }

      ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.94).toFixed(3)})`;
      for (let i = 1; i < cl.nodes.length; i++) {
        const p = projected[i];
        if (!p) continue;
        // Exact Shopify `P = u.hover === z || u.drag === z ? 1.5 : 1` hover/drag node emphasis!
        const emph = cl.hoverIdx === i || cl.dragIdx === i ? 1.55 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (cl.isFinishHero ? 3.2 : 3.0) * emph, 0, TWO_PI);
        ctx.fill();
      }

      if (hubP) {
        const hubEmph = cl.hoverIdx === 0 || cl.dragIdx === 0 ? 1.35 : 1;
        const sz = ((cl.isFinishHero ? 15 : 14) + cl.hoverAmount * 2) * hubEmph;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(hubP.x - sz * 0.5, hubP.y - sz * 0.5, sz, sz);
        if (!cl.isFinishHero) {
          ctx.font = tagFont;
          const tw = ctx.measureText(cl.label).width;
          const lx = hubP.x - tw - 22;
          const ly = hubP.y - 10;
          ctx.fillStyle = badgeBg;
          ctx.fillRect(lx, ly, tw + 12, 20);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(cl.label, lx + 6, hubP.y);
        }
      }

      ctx.restore();
    }
  }

  /** Verbatim Shopify `tr()` + `er()`: 3D extruded alternating black-and-white checkered finish strip across the runway (图三!). */
  private renderFinishBand(ctx: CanvasRenderingContext2D, frame: CurveFrame, scrollY: number) {
    const row = this.finishDocY - scrollY + frame.lead;
    if (row < -120 || row > frame.T + 140) return;

    const w = frame.W;
    const count = Math.max(4, Math.round(w / 54));
    const tile = w / count;
    const elev = tile * 0.14 * frame.rise;

    const drawPoly = (pts: ({ x: number; y: number } | null)[], fill: string) => {
      if (pts.some((p) => !p)) return;
      const v = pts as { x: number; y: number }[];
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
      ctx.closePath();
      ctx.fill();
    };

    for (let r = 0; r < 2; r++) {
      const y0 = row - tile + r * tile;
      const y1 = y0 + tile;
      for (let c = 0; c < count; c++) {
        const x0 = c * tile;
        const x1 = x0 + tile;
        const isWhite = (c + r) % 2 === 1;
        if (isWhite) {
          // 3D raised white tile: side bevel + front wall + bright top face (`er()`!)
          const tTL = projectPoint(frame, x0, y0, elev);
          const tTR = projectPoint(frame, x1, y0, elev);
          const tBR = projectPoint(frame, x1, y1, elev);
          const tBL = projectPoint(frame, x0, y1, elev);
          const bBL = projectPoint(frame, x0, y1, 0.5);
          const bBR = projectPoint(frame, x1, y1, 0.5);
          drawPoly([tTL, tTR, tBR, tBL], 'rgba(238,238,242,0.96)');
          drawPoly([tBL, tBR, bBR, bBL], 'rgba(176,176,184,0.94)');
        } else {
          // Recessed crisp black square
          const bTL = projectPoint(frame, x0, y0, 0.8);
          const bTR = projectPoint(frame, x1, y0, 0.8);
          const bBR = projectPoint(frame, x1, y1, 0.8);
          const bBL = projectPoint(frame, x0, y1, 0.8);
          drawPoly([bTL, bTR, bBR, bBL], 'rgba(8,8,10,0.96)');
        }
      }
    }
  }

  /** Renders verbatim Shopify large circular + rectangular 3D wormholes (`od` + `Nh`), slow sideways conveyor belts (`sd`), and curved launch ramps (`nd`)! */
  private renderCourseProps(
    ctx: CanvasRenderingContext2D,
    frame: CurveFrame,
    scrollY: number,
    inkRgb: [number, number, number],
    isDark: boolean,
    occluders?: OccluderSet,
  ) {
    const openK = this.obstacleOpenK;
    if (openK <= 0.01) return;

    const w = frame.W;
    const callFont = '600 11.5px "IBM Plex Mono", ui-monospace, monospace';
    const [ir, ig, ib] = inkRgb;
    const calloutMain = isDark ? `rgba(255,255,255,${(0.88 * openK).toFixed(3)})` : `rgba(${ir},${ig},${ib},${(0.88 * openK).toFixed(3)})`;
    const calloutSub = isDark ? `rgba(255,255,255,${(0.58 * openK).toFixed(3)})` : `rgba(${ir},${ig},${ib},${(0.62 * openK).toFixed(3)})`;

    // 1) Verbatim Shopify Slow Sideways Conveyor Push Belts (`sd` + `rd`!) — floor layer, always clipped behind standing 3D titles!
    const hasTitleClips = !!(occluders?.titleCovers && occluders.titleCovers.length > 0);
    if (hasTitleClips) {
      ctx.save();
      for (const tc of occluders!.titleCovers!) ctx.clip(tc.path, 'evenodd');
    }
    for (const belt of this.conveyors) {
      const r0 = belt.y0 - scrollY + frame.lead;
      const r1 = belt.y1 - scrollY + frame.lead;
      if (r1 < -40 || r0 > frame.T + 80) continue;

      const x0Raw = belt.uX0 * w;
      const x1Raw = belt.uX1 * w;
      const cx = (x0Raw + x1Raw) * 0.5;
      const d = (x1Raw - x0Raw) * openK;
      const x0 = cx - d * 0.5;
      const x1 = cx + d * 0.5;
      const ySpan = r1 - r0;
      const dir = Math.sign(belt.accel) || 1;

      const pTL = projectPoint(frame, x0, r0, 1.5);
      const pTR = projectPoint(frame, x1, r0, 1.5);
      const pBR = projectPoint(frame, x1, r1, 1.5);
      const pBL = projectPoint(frame, x0, r1, 1.5);
      if (!pTL || !pTR || !pBR || !pBL) continue;

      // Subtle translucent dark deck tint so white chevrons pop in both light & dark modes
      ctx.fillStyle = isDark ? `rgba(8,8,10,${(0.5 * openK).toFixed(3)})` : `rgba(6,32,18,${(0.42 * openK).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(pTL.x, pTL.y);
      ctx.lineTo(pTR.x, pTR.y);
      ctx.lineTo(pBR.x, pBR.y);
      ctx.lineTo(pBL.x, pBL.y);
      ctx.closePath();
      ctx.fill();

      // Crisp Shopify border outline
      ctx.strokeStyle = `rgba(255,255,255,${(0.85 * openK).toFixed(3)})`;
      ctx.lineWidth = 1.05;
      ctx.stroke();

      // Exact Shopify `sd()` slowly gliding directional chevrons (`>` or `<`)!
      const v = clamp(0.35 * ySpan, 22, 68);
      const stepW = 1.6 * v;
      const innerSpan = Math.max(stepW, d - 2 * v);
      const count = Math.max(1, Math.floor(innerSpan / stepW));
      const totalSpan = count * stepW;
      // Slow gentle drift speed matching Shopify `r * 2 * |a| / rt.push` (scaled smoothly)
      const shift = this.elapsedSec * 1.15 * (Math.abs(belt.accel) / GAME_CONFIG.push);

      ctx.lineWidth = 1.35;
      for (let c = 0; c < count; c++) {
        const off = (((c * stepW + shift * stepW) % totalSpan) + totalSpan) % totalSpan + 0.5 * stepW;
        const z = cx + dir * (off - 0.5 * totalSpan);
        const edgeFade = smooth01(Math.min(z - x0 - v * 0.5, x1 - v * 0.5 - z) / (0.5 * stepW));
        if (edgeFade <= 0.02) continue;
        const midY = (r0 + r1) * 0.5;
        const halfH = 0.3 * ySpan;
        const aPt = projectPoint(frame, z - dir * v * 0.5, midY - halfH, 2);
        const tipPt = projectPoint(frame, z + dir * v * 0.5, midY, 2);
        const bPt = projectPoint(frame, z - dir * v * 0.5, midY + halfH, 2);
        if (aPt && tipPt && bPt) {
          ctx.strokeStyle = `rgba(255,255,255,${(0.88 * openK * edgeFade).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(aPt.x, aPt.y);
          ctx.lineTo(tipPt.x, tipPt.y);
          ctx.lineTo(bPt.x, bPt.y);
          ctx.stroke();
        }
      }

      // Exact Shopify `rd()` callout beside conveyor belt (`push →` / `a = ... px/s²`)
      const onLeft = cx <= w * 0.5;
      const tx = onLeft ? x1 + 14 : x0 - 14;
      const align: CanvasTextAlign = onLeft ? 'left' : 'right';
      drawLyingText(ctx, frame, `push ${dir < 0 ? '←' : '→'}`, tx, (r0 + r1) * 0.5 - 8, 2, callFont, calloutMain, align);
      drawLyingText(ctx, frame, `a = ${Math.round(Math.abs(belt.accel)).toLocaleString('en-US')} px/s²`, tx, (r0 + r1) * 0.5 + 12, 2, callFont, calloutSub, align);
    }
    if (hasTitleClips) {
      ctx.restore();
    }

    // 2) Verbatim Shopify Circular + Rectangular 3D Wormhole Black Holes (`od` + `Nh`)
    for (const hole of this.holes) {
      const row = hole.docY - scrollY + frame.lead;
      const hx = hole.hx * openK;
      const hy = hole.hy * openK;
      const R = hole.R * openK;
      const lx = hole.lx * openK;
      const ly = hole.ly * openK;
      if (R < 2 || row + hy < -40 || row - hy > frame.T + 100) continue;
      const cx = hole.uX * w;

      const cTL = projectPoint(frame, cx - hx, row - hy, 1);
      const cTR = projectPoint(frame, cx + hx, row - hy, 1);
      const cBR = projectPoint(frame, cx + hx, row + hy, 1);
      const cBL = projectPoint(frame, cx - hx, row + hy, 1);
      if (!cTL || !cTR || !cBR || !cBL) continue;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cTL.x, cTL.y);
      ctx.lineTo(cTR.x, cTR.y);
      ctx.lineTo(cBR.x, cBR.y);
      ctx.lineTo(cBL.x, cBL.y);
      ctx.closePath();
      ctx.fillStyle = '#050506';
      ctx.fill();
      ctx.clip();

      const maxRim = R * Math.SQRT2;
      const throat = GAME_CONFIG.throat * R;
      const wormD = GAME_CONFIG.wormDepth * R;
      const tubeD = GAME_CONFIG.tube * R;
      const flowShift = (((this.elapsedSec * GAME_CONFIG.flow) % 1) + 1) % 1;

      const evalRingAt = (uDepth: number): { rad: number; lxS: number; lyS: number; depthZ: number } => {
        if (uDepth < 0.65) {
          const e = uDepth / 0.65;
          const rad = throat + (maxRim - throat) * (1 - e) * (1 - e);
          return { rad, lxS: lx * (1 - e * 0.65), lyS: ly * (1 - e * 0.65), depthZ: -wormD * e };
        }
        const e = (uDepth - 0.65) / 0.35;
        return { rad: throat, lxS: lx * 0.35, lyS: ly * 0.35, depthZ: -wormD - tubeD * e };
      };

      const rings = 12;
      for (let i = 0; i < rings; i++) {
        const uDepth = (i + flowShift) / rings;
        const { rad, lxS, lyS, depthZ } = evalRingAt(uDepth);
        const ringAlpha = 0.84 * openK * (1 - 0.78 * uDepth) * Math.min(1, uDepth * rings, (1 - uDepth) * rings);
        if (ringAlpha <= 0.02) continue;
        ctx.strokeStyle = `rgba(255,255,255,${ringAlpha.toFixed(3)})`;
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        let started = false;
        for (let k = 0; k <= 44; k++) {
          const [px, py] = roundedRectRingPoint(cx, row, rad, lxS, lyS, k / 44);
          const pt = projectPoint(frame, px, py, depthZ);
          if (!pt) continue;
          if (!started) {
            ctx.moveTo(pt.x, pt.y);
            started = true;
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        }
        if (started) ctx.stroke();
      }

      const meridians = Math.round(16 * Math.min(2.2, 1 + (lx + ly) / Math.max(1, Math.PI * R)));
      ctx.strokeStyle = `rgba(255,255,255,${(0.42 * openK).toFixed(3)})`;
      ctx.lineWidth = 0.75;
      for (let m = 0; m < meridians; m++) {
        const angU = m / meridians;
        ctx.beginPath();
        let started = false;
        for (let s = 0; s <= 12; s++) {
          const uDepth = s / 12;
          const { rad, lxS, lyS, depthZ } = evalRingAt(uDepth);
          const [px, py] = roundedRectRingPoint(cx, row, rad, lxS, lyS, angU);
          const pt = projectPoint(frame, px, py, depthZ);
          if (!pt) continue;
          if (!started) {
            ctx.moveTo(pt.x, pt.y);
            started = true;
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        }
        if (started) ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = `rgba(255,255,255,${(0.88 * openK).toFixed(3)})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cTL.x, cTL.y);
      ctx.lineTo(cTR.x, cTR.y);
      ctx.lineTo(cBR.x, cBR.y);
      ctx.lineTo(cBL.x, cBL.y);
      ctx.closePath();
      ctx.stroke();

      const isBox = Math.abs(hole.hx - hole.hy) >= 4;
      const dimLabel = isBox ? `hole ${Math.round(hole.hx * 2)} × ${Math.round(hole.hy * 2)} px` : `hole r = ${hole.R} px`;
      if (hole.frontTag) {
        drawLyingText(ctx, frame, dimLabel, cx, row + hy + 18, 2, callFont, calloutMain, 'center');
        drawLyingText(ctx, frame, 'fall in: game over', cx, row + hy + 38, 2, callFont, calloutSub, 'center');
      } else {
        const onLeft = cx <= w * 0.5;
        const tx = onLeft ? cx + hx + 14 : cx - hx - 14;
        const align: CanvasTextAlign = onLeft ? 'left' : 'right';
        drawLyingText(ctx, frame, dimLabel, tx, row - 10, 2, callFont, calloutMain, align);
        drawLyingText(ctx, frame, 'fall in: game over', tx, row + 12, 2, callFont, calloutSub, align);
      }
    }

    // 3) Verbatim Shopify Curved Quarter-Pipe Launch Ramps (`nd` + `To(h, L)`, zero speed boost!)
    for (const ramp of this.ramps) {
      const r0 = ramp.y0 - scrollY + frame.lead;
      const ry = ramp.ry - scrollY + frame.lead;
      const r1 = ramp.y1 - scrollY + frame.lead;
      if (r1 < -30 || r0 > frame.T + 80) continue;
      const x0 = ramp.uX * w - ramp.halfW;
      const x1 = ramp.uX * w + ramp.halfW;
      const L = ramp.ry - ramp.y0;
      const hz = ramp.height * openK;
      const segs = 10;

      const fillCol = isDark ? `rgba(10,10,12,${(0.92 * openK).toFixed(3)})` : `rgba(6,32,18,${(0.88 * openK).toFixed(3)})`;
      for (let i = 0; i < segs; i++) {
        const dA = (i / segs) * L;
        const dB = ((i + 1) / segs) * L;
        const zA = evalCurvedRamp(hz, L, dA);
        const zB = evalCurvedRamp(hz, L, dB);
        const p00 = projectPoint(frame, x0, ry - dA, zA);
        const p10 = projectPoint(frame, x1, ry - dA, zA);
        const p11 = projectPoint(frame, x1, ry - dB, zB);
        const p01 = projectPoint(frame, x0, ry - dB, zB);
        if (p00 && p10 && p11 && p01) {
          ctx.fillStyle = fillCol;
          ctx.beginPath();
          ctx.moveTo(p00.x, p00.y);
          ctx.lineTo(p10.x, p10.y);
          ctx.lineTo(p11.x, p11.y);
          ctx.lineTo(p01.x, p01.y);
          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.strokeStyle = `rgba(255,255,255,${(0.88 * openK).toFixed(3)})`;
      ctx.lineWidth = 1.05;
      for (const xSide of [x0, x1]) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i <= segs; i++) {
          const d = (i / segs) * L;
          const pt = projectPoint(frame, xSide, ry - d, evalCurvedRamp(hz, L, d));
          if (!pt) continue;
          if (!started) {
            ctx.moveTo(pt.x, pt.y);
            started = true;
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        }
        if (started) ctx.stroke();

        const gStart = projectPoint(frame, xSide, r1, 1);
        const gBack = projectPoint(frame, xSide, r0, 1);
        const topLip = projectPoint(frame, xSide, r0, hz);
        if (gStart && gBack && topLip) {
          ctx.beginPath();
          ctx.moveTo(gStart.x, gStart.y);
          ctx.lineTo(gBack.x, gBack.y);
          ctx.lineTo(topLip.x, topLip.y);
          ctx.stroke();
        }
        for (const strut of [0.55, 0.8]) {
          const sb = projectPoint(frame, xSide, ry - strut * L, 1);
          const st = projectPoint(frame, xSide, ry - strut * L, evalCurvedRamp(hz, L, strut * L));
          if (sb && st) {
            ctx.strokeStyle = `rgba(255,255,255,${(0.45 * openK).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(sb.x, sb.y);
            ctx.lineTo(st.x, st.y);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${(0.88 * openK).toFixed(3)})`;
          }
        }
      }

      const lipL = projectPoint(frame, x0, r0, hz);
      const lipR = projectPoint(frame, x1, r0, hz);
      const entL = projectPoint(frame, x0, r1, 1);
      const entR = projectPoint(frame, x1, r1, 1);
      if (lipL && lipR) {
        ctx.beginPath();
        ctx.moveTo(lipL.x, lipL.y);
        ctx.lineTo(lipR.x, lipR.y);
        ctx.stroke();
      }
      if (entL && entR) {
        ctx.beginPath();
        ctx.moveTo(entL.x, entL.y);
        ctx.lineTo(entR.x, entR.y);
        ctx.stroke();
      }

      ctx.strokeStyle = `rgba(255,255,255,${(0.55 * openK).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      const chevCount = 3;
      const shift = (this.elapsedSec * 1.2) % 1;
      for (let c = 0; c < chevCount; c++) {
        const u = ((c + shift) / chevCount) % 1;
        const d = u * L;
        const cy = ry - d;
        const cL = projectPoint(frame, x0 + 20, cy + 16, evalCurvedRamp(hz, L, Math.max(0, d - 16)) + 2);
        const cM = projectPoint(frame, ramp.uX * w, cy - 10, evalCurvedRamp(hz, L, Math.min(L, d + 10)) + 2);
        const cR = projectPoint(frame, x1 - 20, cy + 16, evalCurvedRamp(hz, L, Math.max(0, d - 16)) + 2);
        if (cL && cM && cR) {
          ctx.beginPath();
          ctx.moveTo(cL.x, cL.y);
          ctx.lineTo(cM.x, cM.y);
          ctx.lineTo(cR.x, cR.y);
          ctx.stroke();
        }
      }

      const jumpPreview = Math.round(Math.max(260, Math.min(GAME_CONFIG.jump * GAME_CONFIG.radius * this.grow * 1.35, 355)));
      if (ramp.isFinale) {
        drawLyingText(ctx, frame, 'finale jump', ramp.uX * w, r1 + 18, 2, callFont, calloutMain, 'center');
        drawLyingText(ctx, frame, `z ↑ ${jumpPreview} px`, ramp.uX * w, r1 + 36, 2, callFont, calloutSub, 'center');
      } else {
        const onLeft = ramp.uX <= 0.5;
        const tx = onLeft ? x1 + 14 : x0 - 14;
        const align: CanvasTextAlign = onLeft ? 'left' : 'right';
        drawLyingText(ctx, frame, 'jump ramp', tx, (r0 + ry) * 0.5 - 8, 2, callFont, calloutMain, align);
        drawLyingText(ctx, frame, `z ↑ ${jumpPreview} px`, tx, (r0 + ry) * 0.5 + 12, 2, callFont, calloutSub, align);
      }
    }
  }

  /** Verbatim Shopify `Ks()`: 3D rising rockets + branching colored spider-web fireworks behind the finish line! */
  private renderFireworks(ctx: CanvasRenderingContext2D, frame: CurveFrame, scrollY: number) {
    if (this.fireworks.length === 0) return;
    for (const fw of this.fireworks) {
      if (fw.state === 'wait' || fw.state === 'dead') continue;
      const [ir, ig, ib] = fw.ink;
      if (fw.state === 'rise') {
        const u = clamp(fw.t / fw.riseSec, 0, 1);
        const ease = 1 - (1 - u) * (1 - u);
        const curZ = lerp(fw.from[2], fw.to[2], ease);
        const row = fw.from[1] - scrollY + frame.lead;
        const p0 = projectPoint(frame, fw.from[0], row, Math.max(2, curZ - 65));
        const p1 = projectPoint(frame, fw.to[0], row, curZ);
        if (p0 && p1) {
          ctx.strokeStyle = `rgba(${ir},${ig},${ib},0.55)`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(p1.x, p1.y, 2.8, 0, TWO_PI);
          ctx.fill();
        }
      } else if (fw.state === 'burst') {
        const pts = fw.sparks.map((sp) => projectPoint(frame, sp.p[0], sp.p[1] - scrollY + frame.lead, Math.max(2, sp.p[2])));
        for (let i = 0; i < fw.sparks.length; i++) {
          const sp = fw.sparks[i];
          const p = pts[i];
          if (!p) continue;
          const lifeFrac = clamp(1 - fw.t / sp.life, 0, 1);
          const a = lifeFrac * Math.sqrt(lifeFrac);
          if (a <= 0.02) continue;
          if (sp.parent >= 0) {
            const pp = pts[sp.parent];
            if (pp) {
              ctx.strokeStyle = `rgba(${ir},${ig},${ib},${(a * (sp.parent ? 0.55 : 0.85)).toFixed(3)})`;
              ctx.lineWidth = sp.parent ? 0.85 : 1.15;
              ctx.beginPath();
              ctx.moveTo(pp.x, pp.y);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
            }
          }
          ctx.fillStyle = sp.parent > 0 ? `rgba(${ir},${ig},${ib},${a.toFixed(3)})` : `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (sp.parent < 0 ? 4.2 : 2.6) * (0.4 + 0.6 * lifeFrac), 0, TWO_PI);
          ctx.fill();
        }
      }
    }
  }

  /** Verbatim Shopify `Ms()` + `io()` + `cn()` + `Ss()`: 3D Standing Finish Board RISING UP OUT OF THE PAPER FLOOR (图三!)! */
  private renderFinishBoard3D(
    ctx: CanvasRenderingContext2D,
    frame: CurveFrame,
    scrollY: number,
  ) {
    this.againHitQuad = null;
    this.closeHitQuad = null;

    const riseK = this.finishBoardRise;
    if (riseK <= 0.005) return;

    const w = frame.W;
    const tile = w / Math.max(4, Math.round(w / 54));
    const boardDocY = this.fellInHole && this.finishHoleRef
      ? this.finishHoleRef.docY - this.finishHoleRef.hy - tile * 0.5
      : this.finishDocY - tile;
    const faceRow = boardDocY - scrollY + frame.lead;
    if (faceRow < 10 || faceRow > frame.T + 260) return;

    const fullH = 92 * frame.rise;
    const curH = fullH * riseK;
    const depth = 32;
    const backRow = faceRow - depth;

    const x0 = w * 0.015;
    const x1 = w * 0.985;
    const span = x1 - x0;

    const slabBg = 'rgba(20,20,22,0.97)';
    const roofBg = 'rgba(13,13,15,0.94)';
    const borderCol = 'rgba(255,255,255,0.92)';
    const dividerCol = 'rgba(255,255,255,0.32)';
    const dimText = 'rgba(255,255,255,0.58)';
    const brightText = 'rgba(255,255,255,0.98)';

    const drawQuad = (pts: ({ x: number; y: number } | null)[], fill: string, stroke?: string, lw = 1) => {
      if (pts.some((p) => !p)) return null;
      const v = pts as { x: number; y: number }[];
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      return v;
    };

    // 1) Side glowing distance ruler rails (`Ss()` — grow down the runway from both edges of the finish slab!)
    const railLen = Math.min(720, Math.max(0, (this.startScrollY + 380 - boardDocY))) * riseK;
    if (railLen > 12) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 0.9;
      for (const [edgeX, dir] of [[x0, 1], [x1, -1]] as const) {
        const innerX = edgeX + dir * 20;
        const p0 = projectPoint(frame, edgeX, faceRow, 1);
        const p1 = projectPoint(frame, edgeX, Math.min(frame.T, faceRow + railLen), 1);
        const q0 = projectPoint(frame, innerX, faceRow, 1);
        const q1 = projectPoint(frame, innerX, Math.min(frame.T, faceRow + railLen), 1);
        if (p0 && p1 && q0 && q1) {
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.moveTo(q0.x, q0.y);
          ctx.lineTo(q1.x, q1.y);
          ctx.stroke();
        }
      }
    }

    // 2) 3D Roof Slab (`cn()` — rises straight out of the paper floor from z=0 to z=curH!)
    const bTL = projectPoint(frame, x0, backRow, curH);
    const bTR = projectPoint(frame, x1, backRow, curH);
    const fTR = projectPoint(frame, x1, faceRow, curH);
    const fTL = projectPoint(frame, x0, faceRow, curH);
    const fBR = projectPoint(frame, x1, faceRow, 0);
    const fBL = projectPoint(frame, x0, faceRow, 0);
    if (!fTL || !fTR || !fBR || !fBL) return;

    drawQuad([bTL, bTR, fTR, fTL], roofBg, borderCol, 0.9);
    const faceQuad = drawQuad([fTL, fTR, fBR, fBL], slabBg, borderCol, 1.1);
    if (!faceQuad) return;

    // Clip face content cleanly inside the rising slab quad so text emerges smoothly OUT of the paper slot!
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(faceQuad[0].x, faceQuad[0].y);
    ctx.lineTo(faceQuad[1].x, faceQuad[1].y);
    ctx.lineTo(faceQuad[2].x, faceQuad[2].y);
    ctx.lineTo(faceQuad[3].x, faceQuad[3].y);
    ctx.closePath();
    ctx.clip();

    const snap = this.getHudSnapshot(w, scrollY);
    const totalPts = snap.collected + snap.wordsEaten + snap.jumpPoints;
    const sumText = snap.jumpPoints > 0
      ? `${snap.collected} nodes + ${snap.wordsEaten} words + ${snap.jumpPoints} for jumps`
      : `${snap.collected} nodes + ${snap.wordsEaten} words`;

    const kFont = '500 12px "IBM Plex Mono", ui-monospace, monospace';
    const bigFont = '300 24px "IBM Plex Mono", ui-monospace, monospace';
    const gradeFont = '700 22px "IBM Plex Mono", ui-monospace, monospace';
    const sumFont = '400 13px "IBM Plex Mono", ui-monospace, monospace';
    const btnFont = '600 14px "IBM Plex Mono", ui-monospace, monospace';

    // Text rises WITH the board (`zOffset = curH - fullH`, exact Shopify `io()`!)
    const zBase = curH - fullH;
    const zLabel = zBase + fullH * 0.76;
    const zVal = zBase + fullH * 0.34;

    const btnZoneFrac = 0.22;
    const dataEnd = x0 + span * (1 - btnZoneFrac);
    const dataW = dataEnd - x0;

    const cols = this.fellInHole
      ? [
          { u0: 0, u1: 0.22, k: 'distance', v: `${snap.distancePx.toLocaleString('en-US')} px`, kind: 'num' as const },
          { u0: 0.22, u1: 0.4, k: 'size', v: `${snap.sizePx} px`, kind: 'num' as const },
          { u0: 0.4, u1: 0.56, k: 'points', v: totalPts.toLocaleString('en-US'), kind: 'num' as const },
          { u0: 0.56, u1: 1.0, k: 'breakdown', v: sumText, kind: 'sum' as const },
        ]
      : [
          { u0: 0, u1: 0.14, k: 'finish', v: formatRunClock(snap.elapsedSec), kind: 'num' as const },
          { u0: 0.14, u1: 0.23, k: 'grade', v: snap.grade, kind: 'grade' as const },
          { u0: 0.23, u1: 0.39, k: 'distance', v: `${snap.distancePx.toLocaleString('en-US')} px`, kind: 'num' as const },
          { u0: 0.39, u1: 0.52, k: 'size', v: `${snap.sizePx} px`, kind: 'num' as const },
          { u0: 0.52, u1: 0.64, k: 'points', v: totalPts.toLocaleString('en-US'), kind: 'num' as const },
          { u0: 0.64, u1: 1.0, k: 'breakdown', v: sumText, kind: 'sum' as const },
        ];

    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const cx0 = x0 + col.u0 * dataW;
      if (i > 0) {
        const dT = projectPoint(frame, cx0, faceRow, curH);
        const dB = projectPoint(frame, cx0, faceRow, 0);
        if (dT && dB) {
          ctx.strokeStyle = dividerCol;
          ctx.lineWidth = 0.85;
          ctx.beginPath();
          ctx.moveTo(dT.x, dT.y);
          ctx.lineTo(dB.x, dB.y);
          ctx.stroke();
        }
      }
      drawStandingText(ctx, frame, col.k, cx0 + 14, faceRow, Math.max(0, zLabel), kFont, dimText, 'left');
      if (col.kind === 'grade') {
        drawStandingStamp(ctx, frame, col.v, cx0 + 14, faceRow, Math.max(0, zVal), Math.max(36, col.v.length * 16 + 14), 30, '#ffffff', '#141416', gradeFont);
      } else {
        drawStandingText(ctx, frame, col.v, cx0 + 14, faceRow, Math.max(0, zVal), col.kind === 'sum' ? sumFont : bigFont, brightText, 'left');
      }
    }

    // Divider before `↻ again` / `× close` button zone
    const bdT = projectPoint(frame, dataEnd, faceRow, curH);
    const bdB = projectPoint(frame, dataEnd, faceRow, 0);
    if (bdT && bdB) {
      ctx.strokeStyle = dividerCol;
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(bdT.x, bdT.y);
      ctx.lineTo(bdB.x, bdB.y);
      ctx.stroke();
    }

    // 3D Interactive `↻ again` (white filled) + `× close` (dark outlined) buttons right on the rising finish slab!
    const padX = 12;
    const gapX = 10;
    const btnW = (x1 - dataEnd - padX * 2 - gapX) * 0.5;
    const btnLo = Math.max(0, zBase + fullH * 0.14);
    const btnHi = Math.max(0, zBase + fullH * 0.86);
    const btnMid = (btnLo + btnHi) * 0.5;

    const ax0 = dataEnd + padX;
    const ax1 = ax0 + btnW;
    const againQ = drawQuad(
      [
        projectPoint(frame, ax0, faceRow, btnHi),
        projectPoint(frame, ax1, faceRow, btnHi),
        projectPoint(frame, ax1, faceRow, btnLo),
        projectPoint(frame, ax0, faceRow, btnLo),
      ],
      this.againHovered ? '#141416' : '#ffffff',
      '#ffffff',
      1.05,
    );
    if (againQ && riseK > 0.5) this.againHitQuad = againQ;
    drawStandingText(ctx, frame, '↻ again', (ax0 + ax1) * 0.5, faceRow, btnMid, btnFont, this.againHovered ? '#ffffff' : '#141416', 'center');

    const cx0 = ax1 + gapX;
    const cx1 = cx0 + btnW;
    const closeQ = drawQuad(
      [
        projectPoint(frame, cx0, faceRow, btnHi),
        projectPoint(frame, cx1, faceRow, btnHi),
        projectPoint(frame, cx1, faceRow, btnLo),
        projectPoint(frame, cx0, faceRow, btnLo),
      ],
      this.closeHovered ? '#ffffff' : 'rgba(20,20,22,0.9)',
      '#ffffff',
      1.05,
    );
    if (closeQ && riseK > 0.5) this.closeHitQuad = closeQ;
    drawStandingText(ctx, frame, '× close', (cx0 + cx1) * 0.5, faceRow, btnMid, btnFont, this.closeHovered ? '#141416' : '#ffffff', 'center');

    ctx.restore();
  }

  /** Renders Shopify's sleek top-left monospace run clock (`1:07.4`) and top-right `×` close square (`[×]`, 图三!). */
  private renderTopHud(ctx: CanvasRenderingContext2D, frame: CurveFrame, isDark: boolean) {
    if (!this.isPlayingOrFinished()) {
      this.topCloseHitRect = null;
      return;
    }
    const fg = isDark ? '#ffffff' : '#0b2617';
    const bg = isDark ? 'rgba(10,10,12,0.88)' : 'rgba(255,255,255,0.9)';
    const border = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(11,38,23,0.38)';

    // Top-left run clock (exact Shopify `.game-time`: `top: 28px; left: 20px`)
    ctx.save();
    ctx.font = '400 14px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatRunClock(this.elapsedSec), 22, 34);

    // Top-right 44×44 close button (exact Shopify `.game-close`: `top: 16px; right: 16px`)
    const bx = frame.W - 60;
    const by = 16;
    const bsz = 44;
    this.topCloseHitRect = { x: bx, y: by, w: bsz, h: bsz };
    ctx.fillStyle = this.topCloseHovered ? fg : bg;
    ctx.fillRect(bx, by, bsz, bsz);
    ctx.strokeStyle = this.topCloseHovered ? fg : border;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bsz - 1, bsz - 1);

    ctx.strokeStyle = this.topCloseHovered ? bg : fg;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + 15, by + 15);
    ctx.lineTo(bx + 29, by + 29);
    ctx.moveTo(bx + 29, by + 15);
    ctx.lineTo(bx + 15, by + 29);
    ctx.stroke();
    ctx.restore();
  }

  /** Verbatim Shopify standing 3D bottom console bar (`io` + `cn` + `Co` / `ia` flipping `start ↑` key). */
  private renderBoard3D(
    ctx: CanvasRenderingContext2D,
    frame: CurveFrame,
    scrollY: number,
    barFaceDocY: number,
    remainingPx: number,
    inkRgb: [number, number, number],
    voidBgHex: string,
    isDark: boolean,
  ) {
    this.startHitQuad = null;
    const faceRow = barFaceDocY - scrollY + frame.lead;
    if (faceRow < 20 || faceRow > frame.T + 260) return;

    const alpha = clamp(frame.fade * 0.96, 0, 1);
    if (alpha <= 0.02) return;

    const w = frame.W;
    const sideH = 68 * frame.rise;
    const sideDepth = 28;
    const startW = clamp(w * 0.155, 165, 235);
    const slotGap = 10;
    const startX0 = w * 0.5 - startW * 0.5;
    const startX1 = w * 0.5 + startW * 0.5;
    const leftX0 = 0;
    const leftX1 = startX0 - slotGap;
    const rightX0 = startX1 + slotGap;
    const rightX1 = w;

    const startH = 78 * frame.rise;
    const startDepth = 34;
    const startFaceRow = faceRow + 4;
    const startBackRow = startFaceRow - startDepth;

    const [ir, ig, ib] = inkRgb;
    const borderCol = `rgba(${ir},${ig},${ib},${(alpha * 0.85).toFixed(3)})`;
    const dividerCol = `rgba(${ir},${ig},${ib},${(alpha * 0.28).toFixed(3)})`;
    const wallBg = isDark ? `rgba(18,18,21,${(alpha * 0.95).toFixed(3)})` : voidBgHex;
    const roofBg = isDark ? `rgba(12,12,14,${(alpha * 0.92).toFixed(3)})` : `rgba(235,241,238,${(alpha * 0.92).toFixed(3)})`;
    const startWallBg = isDark
      ? (this.startHovered ? '#ffffff' : 'rgba(236,236,240,0.98)')
      : (this.startHovered ? '#082415' : 'rgba(13,66,38,0.98)');
    const startRoofBg = isDark ? 'rgba(175,175,182,0.92)' : 'rgba(26,96,58,0.92)';
    const startInk = isDark ? '#0a0a0b' : '#ffffff';
    const labelCol = `rgba(${ir},${ig},${ib},${(alpha * 0.58).toFixed(3)})`;
    const valueCol = `rgba(${ir},${ig},${ib},${(alpha * 0.96).toFixed(3)})`;

    const drawQuad = (pts: ({ x: number; y: number } | null)[], fill: string, stroke?: string, lw = 0.95) => {
      if (pts.some((p) => !p)) return null;
      const v = pts as { x: number; y: number }[];
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      return v;
    };

    const drawStandingBox = (
      x0: number,
      x1: number,
      fRow: number,
      depth: number,
      hz: number,
      fillWall: string,
      fillRoof: string,
    ) => {
      const bRow = fRow - depth;
      const bTL = projectPoint(frame, x0, bRow, hz);
      const bTR = projectPoint(frame, x1, bRow, hz);
      const fTR = projectPoint(frame, x1, fRow, hz);
      const fTL = projectPoint(frame, x0, fRow, hz);
      drawQuad([bTL, bTR, fTR, fTL], fillRoof, borderCol, 0.85);

      const bBL = projectPoint(frame, x0, bRow, 0);
      const bBR = projectPoint(frame, x1, bRow, 0);
      const fBL = projectPoint(frame, x0, fRow, 0);
      const fBR = projectPoint(frame, x1, fRow, 0);
      if (x0 > w * 0.5 && bBL && fBL && fTL && bTL) {
        drawQuad([bTL, fTL, fBL, bBL], fillRoof, borderCol, 0.8);
      } else if (x1 < w * 0.5 && bBR && fBR && fTR && bTR) {
        drawQuad([bTR, fTR, fBR, bBR], fillRoof, borderCol, 0.8);
      }

      return drawQuad([fTL, fTR, fBR, fBL], fillWall, borderCol, 1.0);
    };

    const kFont = '500 12px "IBM Plex Mono", ui-monospace, monospace';
    const vFont = '600 16px "IBM Plex Mono", ui-monospace, monospace';
    const startFont = '700 18px "IBM Plex Mono", ui-monospace, monospace';

    const drawSideCells = (x0: number, x1: number, cells: StandingCell[]) => {
      const span = x1 - x0;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const cx0 = x0 + c.u0 * span;
        if (i > 0) {
          const dT = projectPoint(frame, cx0, faceRow, sideH);
          const dB = projectPoint(frame, cx0, faceRow, 0);
          if (dT && dB) {
            ctx.strokeStyle = dividerCol;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(dT.x, dT.y);
            ctx.lineTo(dB.x, dB.y);
            ctx.stroke();
          }
        }
        drawStandingText(ctx, frame, c.k, cx0 + 14, faceRow, sideH * 0.72, kFont, labelCol, 'left');
        drawStandingText(ctx, frame, c.v, cx0 + 14, faceRow, sideH * 0.3, vFont, valueCol, 'left');
      }
    };

    drawStandingBox(leftX0, leftX1, faceRow, sideDepth, sideH, wallBg, roofBg);
    drawSideCells(leftX0, leftX1, [
      { u0: 0, u1: 0.28, k: 'hop', v: 'space' },
      { u0: 0.28, u1: 0.58, k: 'steer', v: '← →  A D' },
      { u0: 0.58, u1: 1.0, k: 'faster', v: '↑ W scroll up' },
    ]);

    drawStandingBox(rightX0, rightX1, faceRow, sideDepth, sideH, wallBg, roofBg);
    drawSideCells(rightX0, rightX1, [
      { u0: 0, u1: 0.4, k: 'brake', v: '↓ S scroll down' },
      { u0: 0.4, u1: 0.7, k: 'speed', v: 'v ≥ 350 px/s' },
      { u0: 0.7, u1: 1.0, k: 'to the finish', v: `↑ ${Math.max(0, Math.round(remainingPx)).toLocaleString('en-US')} px` },
    ]);

    const liftZ = Math.max(0, this.startLift * 1.1 * frame.rise);
    if (liftZ > 1) {
      const pTL = projectPoint(frame, startX0, startFaceRow, liftZ);
      const pTR = projectPoint(frame, startX1, startFaceRow, liftZ);
      const pBR = projectPoint(frame, startX1, startFaceRow, 0);
      const pBL = projectPoint(frame, startX0, startFaceRow, 0);
      drawQuad([pTL, pTR, pBR, pBL], roofBg, borderCol, 0.85);
    }

    const rowCenter = (startFaceRow + startBackRow) * 0.5;
    const elevCenter = liftZ + startH * 0.5;
    const halfD = startDepth * 0.5;
    const halfH = startH * 0.5;
    const ct = Math.cos(this.startTurn);
    const st = Math.sin(this.startTurn);
    const rotPt = (x: number, localRow: number, localElev: number) =>
      projectPoint(
        frame,
        x,
        rowCenter + localRow * ct + localElev * st,
        Math.max(0, elevCenter - localRow * st + localElev * ct),
      );

    const boxFaces: { name: 'front' | 'back' | 'top' | 'bot'; corners: [number, number, number][]; fill: string }[] = [
      { name: 'top', corners: [[startX0, -halfD, halfH], [startX1, -halfD, halfH], [startX1, halfD, halfH], [startX0, halfD, halfH]], fill: startRoofBg },
      { name: 'bot', corners: [[startX0, halfD, -halfH], [startX1, halfD, -halfH], [startX1, -halfD, -halfH], [startX0, -halfD, -halfH]], fill: startRoofBg },
      { name: 'front', corners: [[startX0, halfD, halfH], [startX1, halfD, halfH], [startX1, halfD, -halfH], [startX0, halfD, -halfH]], fill: startWallBg },
      { name: 'back', corners: [[startX0, -halfD, -halfH], [startX1, -halfD, -halfH], [startX1, -halfD, halfH], [startX0, -halfD, halfH]], fill: startWallBg },
    ];

    const signedArea = (q: { x: number; y: number }[]) =>
      q.reduce((sum, p, i) => {
        const n = q[(i + 1) % 4];
        return sum + p.x * n.y - n.x * p.y;
      }, 0);

    for (const bf of boxFaces) {
      const pts = bf.corners.map(([x, lr, le]) => rotPt(x, lr, le));
      if (pts.some((p) => !p)) continue;
      const valid = pts as { x: number; y: number }[];
      if (signedArea(valid) <= 0) continue;
      drawQuad(valid, bf.fill, borderCol, 1.0);
      if (bf.name === 'front' || bf.name === 'back') {
        this.startHitQuad = valid;
        const faceSign = bf.name === 'front' ? 1 : -1;
        const textRow = rowCenter + faceSign * halfD * ct;
        const textElev = Math.max(2, elevCenter - faceSign * halfD * st);
        const effTurn = bf.name === 'front' ? this.startTurn : this.startTurn - Math.PI;
        drawStandingText(ctx, frame, 'start ↑', w * 0.5, textRow, textElev, startFont, startInk, 'center', effTurn);
      }
    }

    const dimRow = faceRow + 24;
    const pL = projectPoint(frame, 0, dimRow, 1);
    const pR = projectPoint(frame, w, dimRow, 1);
    if (pL && pR) {
      ctx.strokeStyle = `rgba(${ir},${ig},${ib},${(alpha * 0.36).toFixed(3)})`;
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(pL.x, pL.y);
      ctx.lineTo(pR.x, pR.y);
      for (const xEnd of [0, w]) {
        const t0 = projectPoint(frame, xEnd, dimRow - 6, 1);
        const t1 = projectPoint(frame, xEnd, dimRow + 6, 1);
        if (t0 && t1) {
          ctx.moveTo(t0.x, t0.y);
          ctx.lineTo(t1.x, t1.y);
        }
      }
      ctx.stroke();
      drawLyingText(
        ctx,
        frame,
        `page   W = ${Math.round(frame.W).toLocaleString('en-US')} px`,
        w * 0.5,
        dimRow + 18,
        1,
        '500 12px "IBM Plex Mono", ui-monospace, monospace',
        `rgba(${ir},${ig},${ib},${(alpha * 0.48).toFixed(3)})`,
        'center',
      );
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    frame: CurveFrame,
    scrollY: number,
    paperEndDocY: number,
    inkRgb: [number, number, number],
    _accentRgb: [number, number, number],
    voidBgHex: string,
    isDark: boolean,
    occluders?: OccluderSet,
  ) {
    this.lastFrame = frame;
    this.orbVisible = false;
    this.orbJac = null;
    if (frame.rise <= 0.05) {
      this.startHitQuad = null;
      this.againHitQuad = null;
      this.closeHitQuad = null;
      this.topCloseHitRect = null;
      return;
    }

    const w = frame.W;
    // Exact Shopify `mt = wt + (Sa - 1) * H`: idle game spider & start bar sit cleanly OUTSIDE the bottom edge of the paper in the 3D grid void (图一!)!
    const orbHomeDocY = paperEndDocY + 118;
    let barFaceDocY = orbHomeDocY + 215;
    if (this.phase === 'idle') {
      const orbLow = projectPoint(frame, w * 0.5, orbHomeDocY + GAME_CONFIG.radius * 1.75 - scrollY + frame.lead, 0);
      if (orbLow) {
        const minBarTopY = orbLow.y + 14;
        for (let iter = 0; iter < 6; iter++) {
          const topPt = projectPoint(frame, w * 0.5, barFaceDocY + 4 - scrollY + frame.lead, (START_ANIM.hoverLift * 1.1 + 80) * frame.rise);
          if (!topPt || topPt.y >= minBarTopY) break;
          barFaceDocY += 28;
        }
      }
    }

    ctx.save();

    // 0) Exact Shopify `B(Vt(wt) + 24)` paper-bottom width dimension line right at the paper cutoff edge (`paperEndDocY + 24`, 图一!)
    const paperEndDimRow = paperEndDocY + 24 - scrollY + frame.lead;
    if (paperEndDimRow > 10 && paperEndDimRow < frame.T + 140) {
      const eL = projectPoint(frame, 0, paperEndDimRow, 1);
      const eR = projectPoint(frame, w, paperEndDimRow, 1);
      if (eL && eR) {
        const [ir, ig, ib] = inkRgb;
        ctx.strokeStyle = `rgba(${ir},${ig},${ib},${(frame.rise * 0.36).toFixed(3)})`;
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(eL.x, eL.y);
        ctx.lineTo(eR.x, eR.y);
        for (const xEnd of [0, w]) {
          const t0 = projectPoint(frame, xEnd, paperEndDimRow - 6, 1);
          const t1 = projectPoint(frame, xEnd, paperEndDimRow + 6, 1);
          if (t0 && t1) {
            ctx.moveTo(t0.x, t0.y);
            ctx.lineTo(t1.x, t1.y);
          }
        }
        ctx.stroke();
      }
    }

    // 1) Checkered 3D Finish Band (visible during active run & finish celebration, 图三!)
    if (this.isPlayingOrFinished()) {
      this.renderFinishBand(ctx, frame, scrollY);
    }

    // 2) Large 3D ambient page spiders + 2 colored finish-line hero spiders (WITH exact standing-card 3D depth occlusion!)
    this.renderAmbientSpiders(ctx, frame, scrollY, isDark, occluders);

    // 3) Active course obstacles: slow sideways conveyor belts, circular + rectangular wormholes, curved ramps
    if (this.isPlayingOrFinished()) {
      this.startHitQuad = null;
      this.renderCourseProps(ctx, frame, scrollY, inkRgb, isDark, occluders);
    }

    // 4) 3D Celebration Fireworks behind finish line
    if (this.phase === 'finished') {
      this.renderFireworks(ctx, frame, scrollY);
    }

    // 5) Render Shopify's spider-orb (preserves mid-air `this.zElev` across finish line, squash-and-stretch, step elevation & colored starburst!)
    const showOrb = !(this.phase === 'finished' && this.fellInHole);
    const runnerCol = this.phase === 'playing'
      ? (this.fallingHole ? this.fallBallX : this.xFrac * w)
      : this.phase === 'finished'
        ? this.finishBallX
        : w * 0.5;
    const runnerRow = this.phase === 'playing'
      ? (this.fallingHole ? this.fallBallY : this.scrollY + 380) - scrollY + frame.lead
      : this.phase === 'finished'
        ? this.finishBallY - scrollY + frame.lead
        : orbHomeDocY - scrollY + frame.lead;
    const orbR = GAME_CONFIG.radius * (this.phase === 'idle' ? 1.0 : this.grow);
    const squashZ = clamp(1 - this.hopS, 0.56, 1.28);
    const squashXY = 1 / Math.sqrt(squashZ);
    const orbZ = this.phase === 'playing'
      ? (this.fallingHole ? this.fallBallZ : orbR * squashZ + 16 + this.surfaceZ + this.zElev)
      : this.phase === 'finished'
        ? orbR * squashZ + 18 + this.zElev
        : orbR + 16;

    const centerP = showOrb ? projectPoint(frame, runnerCol, runnerRow, orbZ) : null;
    const pxP = showOrb ? projectPoint(frame, runnerCol + 1, runnerRow, orbZ) : null;
    const pyP = showOrb ? projectPoint(frame, runnerCol, runnerRow + 1, orbZ) : null;
    const pzP = showOrb ? projectPoint(frame, runnerCol, runnerRow, orbZ + 1) : null;
    const edgeP = showOrb ? projectPoint(frame, runnerCol + orbR * 1.65, runnerRow, orbZ) : null;
    const shadowP = showOrb ? projectPoint(frame, runnerCol, runnerRow + 10, 1 + (this.phase === 'playing' ? this.surfaceZ : 0)) : null;

    if (centerP && centerP.y > -180 && centerP.y < frame.H + 200) {
      this.orbVisible = true;
      this.orbScreenX = centerP.x;
      this.orbScreenY = centerP.y;
      this.orbScreenR = edgeP ? Math.max(24, Math.hypot(edgeP.x - centerP.x, edgeP.y - centerP.y)) : 40;
      if (pxP && pyP && pzP && pxP.x > centerP.x) {
        this.orbJac = {
          scaleX: pxP.x - centerP.x,
          dRowY: pyP.y - centerP.y,
          dElevY: pzP.y - centerP.y,
        };
      }

      ctx.save();
      if (this.phase === 'idle') {
        for (const p of this.getOccludingPaths(centerP, occluders)) ctx.clip(p, 'evenodd');
      }
      if (this.fallingHole && orbZ < orbR) {
        const fh = this.fallingHole;
        const hcx = fh.uX * w;
        const hrow = fh.docY - scrollY + frame.lead;
        const mTL = projectPoint(frame, hcx - fh.hx, hrow - fh.hy, 1);
        const mTR = projectPoint(frame, hcx + fh.hx, hrow - fh.hy, 1);
        const mBR = projectPoint(frame, hcx + fh.hx, hrow + fh.hy, 1);
        const mBL = projectPoint(frame, hcx - fh.hx, hrow + fh.hy, 1);
        if (mTL && mTR && mBR && mBL) {
          ctx.beginPath();
          ctx.moveTo(mTL.x, mTL.y);
          ctx.lineTo(mTR.x, mTR.y);
          ctx.lineTo(mBR.x, mBR.y);
          ctx.lineTo(mBL.x, mBL.y);
          ctx.closePath();
          ctx.clip();
        }
      }

      if (shadowP && !this.fallingHole && orbZ > 0) {
        const alt = this.isPlayingOrFinished() ? Math.max(0, this.zElev) : 0;
        const shScale = clamp(1 - alt / 320, 0.35, 1) * squashXY;
        ctx.save();
        if (occluders?.titleCovers) {
          for (const tc of occluders.titleCovers) ctx.clip(tc.path, 'evenodd');
        }
        ctx.fillStyle = isDark ? 'rgba(0,0,0,0.52)' : 'rgba(7,35,20,0.28)';
        ctx.beginPath();
        ctx.ellipse(shadowP.x, shadowP.y, orbR * 0.95 * shScale, orbR * 0.34 * shScale, 0, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
      }

      const [lr, lg, lb] = SPIDER_COLOR;
      const holeDepthFade = this.fallingHole
        ? clamp(1 + this.fallBallZ / Math.max(80, (GAME_CONFIG.wormDepth + 1.1) * this.fallingHole.R), 0.08, 1)
        : 1;

      // 5a) 2-bone IK word-grabbing spider legs (`X` in index-DLZuI34T.js)
      if (this.phase === 'playing' && !this.fallingHole && this.grabLegs.length > 0) {
        const chipFont = '600 11px "IBM Plex Mono", system-ui, sans-serif';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const leg of this.grabLegs) {
          if (leg.alpha <= 0.01) continue;
          const hipW: [number, number, number] = [
            runnerCol + leg.hipDir[0] * orbR * squashXY,
            runnerRow + leg.hipDir[1] * orbR * squashXY,
            orbZ + leg.hipDir[2] * orbR * squashZ,
          ];
          const pHip = projectPoint(frame, hipW[0], hipW[1], hipW[2]);
          const pKnee = projectPoint(frame, leg.knee[0], leg.knee[1] - scrollY + frame.lead, Math.max(4, leg.knee[2]));
          const pFoot = projectPoint(frame, leg.foot[0], leg.foot[1] - scrollY + frame.lead, Math.max(4, leg.foot[2]));
          if (!pHip || !pKnee || !pFoot) continue;

          const qx = 2 * pKnee.x - (pHip.x + pFoot.x) * 0.5;
          const qy = 2 * pKnee.y - (pHip.y + pFoot.y) * 0.5;
          const lit = leg.litSec >= 0 ? Math.max(leg.phase === 'plant' ? 0.4 : 0, Math.exp(-(this.elapsedSec - leg.litSec) / LEG_PHYS.glow)) : 0;

          if (lit > 0.02) {
            ctx.strokeStyle = `rgba(255,255,255,${(leg.alpha * 0.35 * lit).toFixed(3)})`;
            ctx.lineWidth = 0.85 + 2.0 * lit;
            ctx.beginPath();
            ctx.moveTo(pHip.x, pHip.y);
            ctx.quadraticCurveTo(qx, qy, pFoot.x, pFoot.y);
            ctx.stroke();
          }

          ctx.strokeStyle = `rgba(${lr},${lg},${lb},${(leg.alpha * 0.92).toFixed(3)})`;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(pHip.x, pHip.y);
          ctx.quadraticCurveTo(qx, qy, pFoot.x, pFoot.y);
          ctx.stroke();

          ctx.fillStyle = `rgba(255,255,255,${leg.alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(pFoot.x, pFoot.y, 2.4, 0, TWO_PI);
          ctx.fill();

          if (leg.phase === 'plant' || leg.phase === 'pull') {
            ctx.font = chipFont;
            const tw = ctx.measureText(leg.word.text).width;
            ctx.fillStyle = CHIP_PALETTE[leg.word.id % CHIP_PALETTE.length];
            ctx.fillRect(pFoot.x - tw * 0.5 - 4, pFoot.y - 8, tw + 8, 16);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(leg.word.text, pFoot.x, pFoot.y);
          }
        }
      }

      // 5b) Base 10-leg Fibonacci shell
      const shellR = orbR * 1.65;
      const worldNodes: [number, number, number][] = [[runnerCol, runnerRow, orbZ]];
      this.orbScreenNodes[0] = { x: centerP.x, y: centerP.y };

      for (let i = 1; i < BASE_NODE_COUNT; i++) {
        const rot = quatRotate(this.orbQuat, SPIDER_SHELL.dirs[i - 1]);
        const base = i * 3;
        const wx = runnerCol + rot[0] * shellR * squashXY + this.nodeOff[base];
        const wy = runnerRow + rot[1] * shellR * squashXY + this.nodeOff[base + 1];
        const wz = this.fallingHole
          ? orbZ + rot[2] * shellR * squashZ
          : Math.max(2, orbZ + rot[2] * shellR * squashZ + this.nodeOff[base + 2]);
        worldNodes.push([wx, wy, wz]);
        const sp = projectPoint(frame, wx, wy, wz);
        this.orbScreenNodes[i] = sp ? { x: sp.x, y: sp.y } : null;
      }

      ctx.lineWidth = 0.95;
      ctx.strokeStyle = `rgba(${lr},${lg},${lb},${(0.82 * holeDepthFade).toFixed(3)})`;
      ctx.beginPath();
      for (const [a, b] of SPIDER_SHELL.links) {
        const pa = this.orbScreenNodes[a];
        const pb = this.orbScreenNodes[b];
        if (!pa || !pb) continue;
        if (a === 0 && this.nodeSpringsActive) {
          const base = b * 3;
          const ox = this.nodeOff[base];
          const oy = this.nodeOff[base + 1];
          const oz = this.nodeOff[base + 2];
          if (Math.abs(ox) + Math.abs(oy) + Math.abs(oz) > 0.4) {
            const wa = worldNodes[a];
            const wb = worldNodes[b];
            const mid = projectPoint(
              frame,
              (wa[0] + wb[0]) * 0.5 - ox * 0.35,
              (wa[1] + wb[1]) * 0.5 - oy * 0.35,
              Math.max(2, (wa[2] + wb[2]) * 0.5 - oz * 0.35),
            );
            if (mid) {
              const cx = 2 * mid.x - (pa.x + pb.x) * 0.5;
              const cy = 2 * mid.y - (pa.y + pb.y) * 0.5;
              ctx.moveTo(pa.x, pa.y);
              ctx.quadraticCurveTo(cx, cy, pb.x, pb.y);
              continue;
            }
          }
        }
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
      ctx.stroke();

      ctx.fillStyle = `rgba(255,255,255,${(0.95 * holeDepthFade).toFixed(3)})`;
      for (let i = 1; i < BASE_NODE_COUNT; i++) {
        const p = this.orbScreenNodes[i];
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.3, 0, TWO_PI);
        ctx.fill();
      }

      // 5c) Fused extra spider legs: neutral white for section spiders, luminous `ink -> #ffffff` gradient for finish hero spiders (图三!)
      if (this.isPlayingOrFinished()) {
        for (const fn of this.fusedNodes) {
          if (fn.ageSec < fn.delaySec && !fn.landed) continue;
          const rot = quatRotate(this.orbQuat, fn.dir);
          const destX = runnerCol + rot[0] * orbR * fn.ra * squashXY;
          const destY = runnerRow + rot[1] * orbR * fn.ra * squashXY;
          const destZ = this.fallingHole
            ? orbZ + rot[2] * orbR * fn.ra * squashZ
            : Math.max(2, orbZ + rot[2] * orbR * fn.ra * squashZ);

          const u = fn.landed ? 1 : clamp((fn.ageSec - fn.delaySec) / LEG_PHYS.flySec, 0, 1);
          const ease = easeOutCubic(u);
          const fx = lerp(fn.fromWorld[0], destX, ease);
          const fy = lerp(fn.fromWorld[1] - scrollY + frame.lead, destY, ease);
          const fz = lerp(fn.fromWorld[2], destZ, ease) + Math.sin(ease * Math.PI) * 28;
          const fp = projectPoint(frame, fx, fy, fz);
          if (!fp) continue;

          const [ir, ig, ib] = fn.ink;
          const isColored = ir !== SPIDER_COLOR[0] || ig !== SPIDER_COLOR[1] || ib !== SPIDER_COLOR[2];
          if (isColored && typeof ctx.createLinearGradient === 'function') {
            const grad = ctx.createLinearGradient(centerP.x, centerP.y, fp.x, fp.y);
            grad.addColorStop(0, `rgba(${ir},${ig},${ib},${(0.92 * holeDepthFade).toFixed(3)})`);
            grad.addColorStop(0.55, `rgba(${Math.round((ir + 255) * 0.5)},${Math.round((ig + 255) * 0.5)},${Math.round((ib + 255) * 0.5)},${(0.84 * holeDepthFade).toFixed(3)})`);
            grad.addColorStop(1, `rgba(255,255,255,${(0.82 * holeDepthFade).toFixed(3)})`);
            ctx.strokeStyle = grad;
          } else {
            ctx.strokeStyle = `rgba(${ir},${ig},${ib},${(0.76 * holeDepthFade).toFixed(3)})`;
          }
          ctx.lineWidth = isColored ? 1.0 : 0.85;
          ctx.beginPath();
          ctx.moveTo(centerP.x, centerP.y);
          ctx.lineTo(fp.x, fp.y);
          ctx.stroke();

          const nearP = this.orbScreenNodes[fn.nearIdx];
          if (nearP) {
            ctx.strokeStyle = `rgba(255,255,255,${(0.18 * holeDepthFade).toFixed(3)})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(fp.x, fp.y);
            ctx.lineTo(nearP.x, nearP.y);
            ctx.stroke();
          }

          ctx.fillStyle = `rgba(255,255,255,${(0.95 * holeDepthFade).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(fp.x, fp.y, 2.5, 0, TWO_PI);
          ctx.fill();
        }

        // 5d) Word chips riding on the orb (capped at `maxVisibleWordChips` -> oldest auto-vanish!)
        const tinyFont = '600 9.5px "IBM Plex Mono", system-ui, sans-serif';
        for (let ci = 0; ci < this.wordChips.length; ci++) {
          const chip = this.wordChips[ci];
          const rot = quatRotate(this.orbQuat, chip.dir);
          const destX = runnerCol + rot[0] * orbR * chip.ra * squashXY;
          const destY = runnerRow + rot[1] * orbR * chip.ra * squashXY;
          const destZ = this.fallingHole
            ? orbZ + rot[2] * orbR * chip.ra * squashZ
            : Math.max(4, orbZ + rot[2] * orbR * chip.ra * squashZ);
          const u = chip.landed ? 1 : clamp(chip.ageSec / LEG_PHYS.flySec, 0, 1);
          const ease = easeOutCubic(u);
          const fx = lerp(chip.fromWorld[0], destX, ease);
          const fy = lerp(chip.fromWorld[1] - scrollY + frame.lead, destY, ease);
          const fz = lerp(chip.fromWorld[2], destZ, ease);
          const cp = projectPoint(frame, fx, fy, fz);
          if (!cp) continue;

          const ageFade = ci < 3 && this.wordChips.length > 8 ? 0.4 + ci * 0.2 : 1;
          ctx.globalAlpha = ageFade * holeDepthFade;
          ctx.font = tinyFont;
          const tw = ctx.measureText(chip.text).width;
          ctx.fillStyle = chip.bgHex;
          ctx.fillRect(cp.x - tw * 0.5 - 3, cp.y - 6, tw + 6, 12);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(chip.text, cp.x, cp.y);
          ctx.globalAlpha = 1;
        }
      }

      // Neutral bright center cube core
      const coreSz = lerp(11, 18, clamp((this.grow - 1) / 1.8, 0, 1));
      ctx.fillStyle = `rgba(255,255,255,${(0.98 * holeDepthFade).toFixed(3)})`;
      ctx.fillRect(centerP.x - coreSz * 0.5, centerP.y - coreSz * 0.5, coreSz, coreSz);

      ctx.restore();
    }

    // 6) Standing 3D Bottom Console Bar (idle) OR Rising 3D Finish Board (finished, growing up out of the paper floor!)
    if (this.phase === 'idle') {
      this.renderBoard3D(ctx, frame, scrollY, barFaceDocY, scrollY, inkRgb, voidBgHex, isDark);
    } else if (this.phase === 'finished') {
      this.renderFinishBoard3D(ctx, frame, scrollY);
    }

    // 7) Minimal top-left timer + top-right × close button (playing & finished)
    this.renderTopHud(ctx, frame, isDark);

    ctx.restore();
  }
}
