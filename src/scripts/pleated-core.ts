/** 百褶环的弧长、几何和单向纵波；不依赖浏览器或帧率。 */
export type Vec3 = [number, number, number];
type Pulse = { origin: number; start: number };
const TAU = Math.PI * 2;
const SPEED = 0.22, WIDTH = 0.12, AMPLITUDE = 0.0033;
const wrap = (s: number) => ((s % 1) + 1) % 1;

export class PleatWaves {
  private pulses: Pulse[] = [];
  get activeCount() { return this.pulses.length; }
  trigger(origin: number, now: number) {
    if (!Number.isFinite(origin) || !Number.isFinite(now)) return;
    const last = this.pulses.at(-1);
    if (last && now - last.start < 0.16) return;
    this.prune(now);
    this.pulses.push({ origin: wrap(origin), start: now });
    this.pulses = this.pulses.slice(-4);
  }
  clear() { this.pulses = []; }
  prune(now: number) { this.pulses = this.pulses.filter(p => now - p.start <= (1 + WIDTH) / SPEED); }
  sample(s: number, now: number) {
    let offset = 0, weight = 0, green = 0;
    for (const pulse of this.pulses) {
      const age = now - pulse.start;
      if (age < 0) continue;
      // 只取沿弧长增加方向的距离；波前前方为零，不产生反向传播分支。
      const q = wrap(s - pulse.origin) - age * SPEED;
      if (q >= 0 || q <= -WIDTH) continue;
      const envelope = Math.sin(Math.PI * (q + WIDTH) / WIDTH) ** 2 * Math.exp(-age / 6);
      offset += AMPLITUDE * Math.sin(q / WIDTH * TAU * 2) * envelope;
      weight += envelope;
      green = Math.max(green, envelope);
    }
    return { offset: offset / Math.max(1, weight), green };
  }
}

const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const centerAt = (t: number): Vec3 => [2.42 * Math.sin(t), 1.10 * Math.sin(2 * t), 0.55 * Math.cos(t)];
type Basis = { s: number; t: number; center: Vec3; tangent: Vec3; across: Vec3; binormal: Vec3 };
export type Pleats = { bases: Basis[]; length: number; vertices: Float32Array };

export function createPleats(count = 216): Pleats {
  const lengths = [0];
  let previous = centerAt(0);
  for (let i = 1; i <= 2048; i++) {
    const p = centerAt(i / 2048 * TAU);
    lengths.push(lengths[i - 1] + Math.hypot(...p.map((n, k) => n - previous[k])));
    previous = p;
  }
  const length = lengths.at(-1)!;
  let j = 1;
  const bases = Array.from({ length: count }, (_, i): Basis => {
    const s = i / count, distance = s * length;
    while (j < 2048 && lengths[j] < distance) j++;
    const t = (j - 1 + (distance - lengths[j - 1]) / (lengths[j] - lengths[j - 1])) / 2048 * TAU;
    const tangent = unit([2.42 * Math.cos(t), 2.20 * Math.cos(2 * t), -0.55 * Math.sin(t)]);
    const across = unit([-tangent[1], tangent[0], 0]);
    return { s, t, center: centerAt(t), tangent, across, binormal: unit(cross(tangent, across)) };
  });
  return { bases, length, vertices: new Float32Array(count * 36 * 7) };
}

const FACES: [number[], number, number][] = [
  [[0, 2, 3, 1], 2, -1], [[4, 5, 7, 6], 2, 1], [[0, 4, 6, 2], 0, -1],
  [[1, 3, 7, 5], 0, 1], [[0, 1, 5, 4], 1, -1], [[2, 6, 7, 3], 1, 1],
];
export function updatePleats(pleats: Pleats, seconds: number, waves: PleatWaves) {
  let at = 0;
  const phase = seconds * 0.25;
  for (const b of pleats.bases) {
    const wave = waves.sample(b.s, seconds);
    const angle = 0.58 * Math.sin(2 * b.t - phase) + 0.26 * Math.cos(b.t + phase * 0.5);
    const c = Math.cos(angle), s = Math.sin(angle);
    const u = b.across.map((v, k) => v * c + b.binormal[k] * s);
    const v = b.binormal.map((n, k) => n * c - b.across[k] * s);
    const axes = [u, v, b.tangent];
    // 波只沿切线移动薄片，改变片间疏密，不转动镜头，也不做横向鼓包。
    const center = b.center.map((n, k) => n + b.tangent[k] * wave.offset * pleats.length);
    const corners = Array.from({ length: 8 }, (_, j) => center.map((n, k) => n
      + u[k] * 0.47 * ((j & 1) ? 1 : -1)
      + v[k] * 0.115 * ((j & 2) ? 1 : -1)
      + b.tangent[k] * 0.0125 * ((j & 4) ? 1 : -1)));
    for (const [ids, axis, sign] of FACES) {
      const normal = axes[axis].map(n => n * sign);
      for (const vertex of [ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]]) {
        pleats.vertices.set(corners[vertex], at);
        pleats.vertices.set(normal, at + 3);
        pleats.vertices[at + 6] = wave.green;
        at += 7;
      }
    }
  }
  return pleats.vertices;
}

/** 与顶点着色器相同的固定镜头；命中检测和静态后备图都复用它。 */
export function rotatePleatPoint(p: readonly number[]): Vec3 {
  const cy = Math.cos(-0.08), sy = Math.sin(-0.08), cx = Math.cos(0.28), sx = Math.sin(0.28);
  // 取消原先顺时针约 8.6° 的倾斜，保留纵深视角。
  const cz = Math.cos(0), sz = Math.sin(0);
  const x = cy * p[0] + sy * p[2], z = -sy * p[0] + cy * p[2];
  const y = cx * p[1] - sx * z, zz = sx * p[1] + cx * z;
  return [cz * x - sz * y, sz * x + cz * y, zz];
}
export function projectPleatPoint(p: readonly number[], width: number, height: number): Vec3 {
  const [x, y, z] = rotatePleatPoint(p), k = 7.5 / (7.5 - z);
  return [(x * k / 3.7 + 1) * width / 2, height / 2 - y * k / 3.7 * width / 2, z];
}
export function hitPleats(pleats: Pleats, x: number, y: number, width: number, height: number): number | null {
  let closest = -Infinity, result: number | null = null;
  const data = pleats.vertices;
  for (let at = 0; at < data.length; at += 21) {
    const points = [0, 7, 14].map(n => projectPleatPoint(data.subarray(at + n, at + n + 3), width, height));
    const [a, b, c] = points;
    const determinant = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(determinant) < 0.00001) continue;
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / determinant;
    const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / determinant;
    if (u < 0 || v < 0 || u + v > 1) continue;
    const z = u * a[2] + v * b[2] + (1 - u - v) * c[2];
    if (z > closest) { closest = z; result = pleats.bases[Math.floor(at / (36 * 7))].s; }
  }
  return result;
}
