/** 留言页浅水的连续波面，坐标单位为模拟网格。 */
export class WaterSurface {
  values: Float32Array;
  private previous: Float32Array;
  private next: Float32Array;
  private absorption: Float32Array;
  private remainder = 0;
  private idle = 4000;
  constructor(readonly width: number, readonly height: number) {
    this.values = new Float32Array(width * height);
    this.previous = new Float32Array(width * height);
    this.next = new Float32Array(width * height);
    this.absorption = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
        this.absorption[y * width + x] = 0.985 - 0.12 * Math.max(0, 1 - edge / 10) ** 2;
      }
    }
  }
  /** 沿轨迹补齐笔触；注入量按走过的距离计，不随鼠标事件频率翻倍。 */
  disturb(x0: number, y0: number, x1: number, y1: number, amount: number) {
    if (![x0, y0, x1, y1, amount].every(Number.isFinite)) return;
    const distance = Math.hypot(x1 - x0, y1 - y0);
    if (!distance) return;
    const count = Math.min(512, Math.ceil(distance));
    const dose = Math.min(1, Math.max(0, amount)) * Math.min(distance / count, 1);
    // 扩大触水面积，让前端更宽圆；同时摊薄注入量，避免加宽后反而变浓。
    const radius = 5;
    for (let n = 1; n <= count; n++) {
      const cx = x0 + (x1 - x0) * n / count;
      const cy = y0 + (y1 - y0) * n / count;
      for (let y = Math.max(1, Math.floor(cy - radius)); y <= Math.min(this.height - 2, cy + radius); y++) {
        for (let x = Math.max(1, Math.floor(cx - radius)); x <= Math.min(this.width - 2, cx + radius); x++) {
          const r2 = ((x - cx) ** 2 + (y - cy) ** 2) / radius ** 2;
          if (r2 >= 1) continue;
          const i = y * this.width + x;
          const push = dose * (1 - r2) ** 2 * 0.35 * (3.5 / radius);
          this.values[i] = Math.max(-3, this.values[i] - push);
          this.previous[i] = Math.max(-3, this.previous[i] - push);
        }
      }
    }
    this.idle = 0;
  }
  /** 固定 60 Hz 子步保证不同刷新率下同速；长卡顿最多补 100ms。 */
  advance(ms: number): boolean {
    if (this.idle >= 4000 || !Number.isFinite(ms)) return false;
    const dt = Math.min(100, Math.max(0, ms));
    this.idle += dt;
    if (this.idle >= 4000) { this.clear(); return false; }
    this.remainder += dt;
    const step = 1000 / 60;
    while (this.remainder + 1e-6 >= step) {
      const w = this.width;
      const h = this.values, p = this.previous, next = this.next;
      for (let y = 1; y < this.height - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const lap = h[i - 1] + h[i + 1] + h[i - w] + h[i + w] - 4 * h[i];
          next[i] = Math.max(-3, Math.min(3, (2 * h[i] - p[i] + 0.44 * lap) * this.absorption[i]));
        }
      }
      this.previous = h;
      this.values = next;
      this.next = p;
      this.remainder -= step;
    }
    return true;
  }
  get opacity() { return Math.max(0, Math.min(1, (4000 - this.idle) / 1200)); }
  clear() {
    this.values.fill(0);
    this.previous.fill(0);
    this.next.fill(0);
    this.idle = 4000;
    this.remainder = 0;
  }
}
