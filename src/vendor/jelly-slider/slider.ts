import { sdBezier } from '@typegpu/sdf';
import type {
  SampledFlag,
  StorageFlag,
  TgpuBuffer,
  TgpuGuardedComputePipeline,
  TgpuRoot,
  TgpuTexture,
  TgpuUniform,
} from 'typegpu';
import { d, std } from 'typegpu';

const BEZIER_TEXTURE_SIZE = [256, 128] as const;

export class Slider {
  #root: TgpuRoot;
  #pos: d.v2f[];
  #normals: d.v2f[];
  #prev: d.v2f[];
  #invMass: Float32Array;
  #targetX: number;
  #controlPoints: d.v2f[];
  #yOffset: number;
  #computeBezierPipeline: TgpuGuardedComputePipeline;

  pointsBuffer: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  controlPointsBuffer: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  normalsBuffer: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  bezierTexture: TgpuTexture<{
    size: typeof BEZIER_TEXTURE_SIZE;
    format: 'rgba16float';
  }> &
    SampledFlag &
    StorageFlag;
  endCapUniform: TgpuUniform<d.Vec4f>;

  readonly n: number;
  readonly totalLength: number;
  readonly restLen: number;
  readonly baseY: number;
  readonly anchor: d.v2f;
  readonly bbox: [top: number, right: number, bottom: number, left: number];

  // Physics parameters
  iterations = 16;
  substeps = 6;
  damping = 0.01;
  bendingStrength = 0.1;
  /* ★ 本站改（2026-10-17 第二轮）：2 → 0.8。
     开关的行程很短（亮色端只剩 ~0.65），原版的 2 会把压缩段拱得很高、
     顶端还被光线步进的 bbox（top 0.65）切平 ⇒ 静止时看着像一块被削了角的楔子。
     0.8 只留一道低伏的隆起 —— 既保留"被挤住的果冻"的手感，又不会顶出槽。 */
  archStrength = 0.8;
  endFlatCount = 1;
  endFlatStiffness = 0.05;
  bendingExponent = 1.2;
  archEdgeDeadzone = 0.01;

  constructor(root: TgpuRoot, start: d.v2f, end: d.v2f, numPoints: number, yOffset = 0) {
    this.#root = root;
    this.n = Math.max(2, numPoints | 0);
    this.anchor = start;
    this.baseY = start.y;
    this.#targetX = end.x;
    this.#yOffset = yOffset;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    this.totalLength = Math.hypot(dx, dy);
    this.restLen = this.totalLength / (this.n - 1);

    this.#pos = Array.from({ length: this.n });
    this.#controlPoints = Array.from({ length: this.n - 1 });
    this.#normals = Array.from({ length: this.n });
    this.#prev = Array.from({ length: this.n });
    this.#invMass = new Float32Array(this.n);

    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const x = start[0] * (1 - t) + end[0] * t;
      const y = start[1] * (1 - t) + end[1] * t + this.#yOffset;
      this.#pos[i] = d.vec2f(x, y);
      this.#prev[i] = d.vec2f(x, y);
      this.#normals[i] = d.vec2f(0, 1);
      this.#invMass[i] = i === 0 || i === this.n - 1 ? 0 : 1;
      if (i < this.n - 1) {
        const t2 = (i + 0.5) / (this.n - 1);
        const cx = start[0] * (1 - t2) + end[0] * t2;
        const cy = start[1] * (1 - t2) + end[1] * t2 + this.#yOffset;
        this.#controlPoints[i] = d.vec2f(cx, cy);
      }
    }

    this.pointsBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec2f, this.n), this.#pos)
      .$usage('storage');

    this.controlPointsBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec2f, this.n - 1), this.#controlPoints)
      .$usage('storage');

    this.normalsBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec2f, this.n), this.#normals)
      .$usage('storage');

    this.bezierTexture = this.#root
      .createTexture({
        size: BEZIER_TEXTURE_SIZE,
        format: 'rgba16float',
      })
      .$usage('sampled', 'storage', 'render');

    this.endCapUniform = this.#root.createUniform(d.vec4f, d.vec4f(0, 0, 0, 0));

    const bezierWriteView = this.bezierTexture.createView(
      d.textureStorage2d('rgba16float', 'write-only'),
    );
    const pointsView = this.pointsBuffer.as('readonly');
    const controlPointsView = this.controlPointsBuffer.as('readonly');

    const padding = 0.01;
    /* ★ 本站改（2026-10-17 第二轮）：左侧余量 1% → 5%。
       开关的亮色端被压得很短（~0.65），积分 + 约束会把中段往锚点**左侧**挤出去；
       1% 的余量（左边只到 -1.019）不够 ⇒ 挤出去的那一截被光线步进的 bbox 直切，
       静止时看起来是一块"削了角的楔子"。放到 5%（-1.095）刚好兜住。
       ⚠ 右侧仍是 10%：深色端在 1.0，本来就留得够。 */
    const left = start.x - this.totalLength * 0.05;
    const right = end.x + this.totalLength * padding * 10;
    const bottom = -0.3;
    const top = 0.65;

    this.bbox = [top, right, bottom, left];

    this.#computeBezierPipeline = this.#root.createGuardedComputePipeline((x, y) => {
      'use gpu';
      const size = std.textureDimensions(bezierWriteView.$);
      const pixelUV = d.vec2f(x, y).add(0.5).div(d.vec2f(size));

      const sliderPos = d.vec2f(
        left + pixelUV.x * (right - left),
        top - pixelUV.y * (top - bottom),
      );

      let minDist = d.f32(1e10);
      let closestSegment = d.i32(0);
      let closestT = d.f32(0);

      const epsilon = d.f32(0.03);
      const xOffset = d.vec2f(epsilon, 0.0);
      const yOffset = d.vec2f(0.0, epsilon);

      let xPlusDist = d.f32(1e10);
      let xMinusDist = d.f32(1e10);
      let yPlusDist = d.f32(1e10);
      let yMinusDist = d.f32(1e10);

      for (let i = 0; i < pointsView.$.length - 1; i++) {
        const A = pointsView.$[i];
        const B = pointsView.$[i + 1];
        const C = controlPointsView.$[i];

        const dist = sdBezier(sliderPos, A, C, B);
        if (dist < minDist) {
          minDist = dist;
          closestSegment = i;

          const AB = B.sub(A);
          const AP = sliderPos.sub(A);
          const ABLength = std.length(AB);

          if (ABLength > 0.0) {
            closestT = std.clamp(std.dot(AP, AB) / (ABLength * ABLength), 0.0, 1.0);
          } else {
            closestT = 0.0;
          }
        }

        xPlusDist = std.min(xPlusDist, sdBezier(sliderPos.add(xOffset), A, C, B));
        xMinusDist = std.min(xMinusDist, sdBezier(sliderPos.sub(xOffset), A, C, B));
        yPlusDist = std.min(yPlusDist, sdBezier(sliderPos.add(yOffset), A, C, B));
        yMinusDist = std.min(yMinusDist, sdBezier(sliderPos.sub(yOffset), A, C, B));
      }

      const overallProgress = (d.f32(closestSegment) + closestT) / d.f32(pointsView.$.length - 1);

      const normalX = (xPlusDist - xMinusDist) / (2.0 * epsilon);
      const normalY = (yPlusDist - yMinusDist) / (2.0 * epsilon);

      std.textureStore(
        bezierWriteView.$,
        d.vec2u(x, y),
        d.vec4f(minDist, overallProgress, normalX, normalY),
      );
    });
  }

  setDragX(x: number) {
    const minX = this.anchor[0] - this.totalLength;
    const maxX = this.anchor[0] + this.totalLength;
    this.#targetX = std.clamp(x, minX, maxX);
  }

  /** 直接在目标端求初始平衡态，不通过移动端点制造形变。 */
  setInitial(x: number) {
    this.setDragX(x);
    const dx = this.#targetX - this.anchor.x;
    const dy = 0.08 - this.anchor.y;
    const curve = (t: number, height: number) =>
      this.anchor.y + this.#yOffset + dy * t + height * Math.sin(Math.PI * t);
    const samples = 128;
    const curveLength = (height: number) => {
      let length = 0;
      for (let i = 1; i <= samples; i++) {
        length += Math.hypot(dx / samples,
          curve(i / samples, height) - curve((i - 1) / samples, height));
      }
      return length;
    };
    // 用同长度的单拱避开水平压缩产生的自折叠，再交还原有约束求解器。
    let lo = 0;
    let hi = this.totalLength;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (curveLength(mid) < this.totalLength) lo = mid;
      else hi = mid;
    }
    const lengths = [0];
    for (let i = 1; i <= samples; i++) {
      lengths[i] = lengths[i - 1] + Math.hypot(dx / samples,
        curve(i / samples, lo) - curve((i - 1) / samples, lo));
    }
    let segment = 1;
    for (let i = 0; i < this.n; i++) {
      const distance = lengths[samples] * i / (this.n - 1);
      while (segment < samples && lengths[segment] < distance) segment++;
      const t = (segment - 1 + (distance - lengths[segment - 1]) /
        (lengths[segment] - lengths[segment - 1] || 1)) / samples;
      const px = this.anchor.x + dx * t;
      const py = curve(t, lo);
      this.#pos[i] = d.vec2f(px, py);
      this.#prev[i] = d.vec2f(px, py);
    }
    let stable = 0;
    for (let i = 0; i < 240 && stable < 4; i++) {
      this.#step(1 / 60);
      const movement = Math.max(...this.#pos.map((p, index) =>
        Math.hypot(p.x - this.#prev[index].x, p.y - this.#prev[index].y)));
      stable = movement < 1e-5 ? stable + 1 : 0;
    }
    // 首帧与前一物理帧一致；剩余速度不能在显示后再把初态顶开。
    this.#prev = this.#pos.map(p => d.vec2f(p.x, p.y));
    this.#publish();
  }

  /**
   * ★ 本站加（2026-10-17 第七轮）：当前链条各点的**只读快照**。
   *
   * 给 CPU 侧的指针命中测试用（`scene.ts` 的 `eventHandler.hitTest`）：
   * `#pos` 就是物理积分后的真实形状 —— 被压缩时会拱起、跟手时会弯，
   * 用固定矩形做命中区会在链条拱起来时"点得到空处"，在它趴下时又"整块都能点"。
   * ⚠ 这是内部数组本身，不是拷贝 —— 别在调用方改它。
   */
  get points(): readonly d.v2f[] {
    return this.#pos;
  }

  // 默认把当前物理帧上传 GPU；离线物理采样可跳过纹理计算。
  update(dt: number, dispatchBezier = true) {
    if (dt <= 0) return;

    this.#step(dt);
    this.#publish(dispatchBezier);
  }

  #step(dt: number) {
    const h = dt / this.substeps;
    const damp = std.clamp(this.damping, 0, 0.999);
    const compression = Math.max(
      0,
      1 - Math.abs(this.#targetX - this.anchor[0]) / this.totalLength,
    );

    for (let s = 0; s < this.substeps; s++) {
      this.#integrate(h, damp, compression);
      this.#projectConstraints();
    }
  }

  #publish(dispatchBezier = true) {
    this.#computeNormals();
    this.#computeControlPoints();
    this.#updateGPUBuffer();
    if (dispatchBezier) {
      this.#computeBezierPipeline.dispatchThreads(...BEZIER_TEXTURE_SIZE);
    }
  }

  #integrate(h: number, damp: number, compression: number) {
    for (let i = 0; i < this.n; i++) {
      const px = this.#pos[i].x;
      const py = this.#pos[i].y;

      // Pin endpoints
      if (i === 0) {
        this.#pos[i] = d.vec2f(this.anchor[0], this.anchor[1] + this.#yOffset);
        this.#prev[i] = d.vec2f(this.anchor[0], this.anchor[1] + this.#yOffset);
        continue;
      }
      if (i === this.n - 1) {
        this.#pos[i] = d.vec2f(this.#targetX, 0.08 + this.#yOffset);
        this.#prev[i] = d.vec2f(this.#targetX, 0.08 + this.#yOffset);
        continue;
      }

      // Verlet integration with damping
      const vx = (px - this.#prev[i].x) * (1 - damp);
      const vy = (py - this.#prev[i].y) * (1 - damp);

      // Arch bias in middle section only
      let ay = 0;
      if (compression > 0) {
        const t = i / (this.n - 1);
        const edge = this.archEdgeDeadzone;
        const window = std.smoothstep(edge, 1 - edge, t) * std.smoothstep(edge, 1 - edge, 1 - t);
        const profile = Math.sin(Math.PI * t) * window;
        ay = this.archStrength * profile * compression;
      }

      this.#prev[i] = d.vec2f(px, py);
      this.#pos[i] = d.vec2f(px + vx, py + vy + ay * h * h);

      // Keep above baseline
      if (this.#pos[i].y < this.baseY + this.#yOffset) {
        this.#pos[i] = d.vec2f(this.#pos[i].x, this.baseY + this.#yOffset);
      }
    }
  }

  #projectConstraints() {
    for (let it = 0; it < this.iterations; it++) {
      // Segment length constraints
      for (let i = 0; i < this.n - 1; i++) {
        this.#projectDistance(i, i + 1, this.restLen, 0.1);
      }

      // Bending resistance (stronger at ends)
      for (let i = 1; i < this.n - 1; i++) {
        const t = i / (this.n - 1);
        const distFromCenter = Math.abs(t - 0.5) * 2;
        const strength = distFromCenter ** this.bendingExponent;
        const k = this.bendingStrength * (0.05 + 0.95 * strength);
        this.#projectDistance(i - 1, i + 1, 2 * this.restLen, k);
      }

      // Flatten ends
      if (this.endFlatCount > 0) {
        const count = Math.min(this.endFlatCount, this.n - 2);
        for (let i = 1; i <= count; i++) {
          this.#projectLineY(i, this.baseY + this.#yOffset, this.endFlatStiffness);
        }
        for (let i = this.n - 1 - count; i < this.n - 1; i++) {
          this.#projectLineY(i, this.baseY + this.#yOffset, this.endFlatStiffness);
        }
      }

      // Re-pin endpoints
      this.#pos[0] = d.vec2f(this.anchor[0], this.anchor[1] + this.#yOffset);
      this.#pos[this.n - 1] = d.vec2f(this.#targetX, 0.08 + this.#yOffset);

      /* ★★ 本站加（2026-10-18 第十一轮，站主截图：软条中段拱成一团、端头竖成一片）。
       *
       * **先量几何，再谈修法**（`_probe/_slider_sim.py` 是这段物理的逐行移植，判据都在那）：
       *
       *   链长 1.9（17 点 × restLen 0.11875），亮色档 `targetX = 0`
       *   ⇒ 水平跨度只有 1.0 ⇒ **富余 0.9 的长度是消不掉的**。
       *   链长固定 ⇒ 这 0.9 只能变成「拱起」或「折返」，二选一，没有第三条路。
       *   （原版的亮色端更靠左：`TARGET_MIN+TARGET_OFFSET = -0.33` ⇒ 压缩更狠、
       *     折返更多 —— 堆起来是原版就有的样子，本站只是把它摆到了取景正中。）
       *
       * 站主要修的是**端头竖起来的那一片**，实测（线上真浏览器，`__ttscene.probe`）：
       *   `tipDeg = 145.8°`、`folds = 4`、`lift = 0.17`。
       *   病灶是 `scene.ts` 的 `cap3D`：
       *       const angle = atan2(last.y - secondLast.y, last.x - secondLast.x);
       *   末段一旦朝左（负 dx），这个角就翻到 ±180° 附近 ⇒ 那个饼形端面被摆成竖片。
       *   ⇒ 真凶是**末段朝左**，不是"拱得太高"。
       *
       * 修法为什么是「关进槽里」而不是「禁止折返」：
       *   · 试过硬性 `x[i] >= x[i-1]`（`_slider_sweep.py`）：**与段长约束直接打架**，
       *     富余的 0.9 被强行摊进 1.0 的跨度 ⇒ 最长段被拉到 **2.02 倍** restLen
       *     （实测 segMax 1.11~2.02），画面上是"某一段被拽长的橡皮筋"，比原来更糟。
       *   · 试过硬性端头护栏（`tip_guard`）：同样打架，segMax 2.02。
       *   ⇒ 96 组参数扫描（`_slider_search.py`，旋钮 = archStrength / bendingStrength /
       *     damping / yCap / tipGuard）**过判据 0 组** —— 这不是"还没调到"，
       *     是这个方向本身走不通。
       *
       *   真正对症的是**取消折返的空间**：槽（capsule）在世界坐标里就是
       *   `x ∈ [anchor.x, targetX]` 这一段。链跑出 `targetX` 右边，既出了槽，
       *   又让末段朝左。把它夹回槽内，富余长度就只能向上拱（`archStrength` 那一项），
       *   末段自然朝右。实测（同上脚本，亮色档 targetX=0）：
       *       不夹：tipDeg 172°、segMax 1.42
       *       夹住：tipDeg  37°、segMax 1.05   ← 37° 是端头本来的造型，见下
       *
       * ⚠ 剩下的 ~38° 不是 bug：`#integrate` 把端点 pin 在 `y = 0.08 + yOffset`，
       *   而链身躺在 `yOffset` —— 落差 0.11 配 restLen 0.119 ⇒
       *   `atan2(0.11, 0.119) = 42.8°`。端头本来就是这个斜度（`cap3D` 那个饼形端面）。
       * ⚠ 别在这里加"高度上限"：实测 yCap 一开就把段长拉到 1.35~1.55 倍
       *   （压高度 = 逼链缩短 = 段长约束被违反），得不偿失。堆高交给 archStrength。
       * ⚠ 两端取 min/max 是防一手：`setDragX` 的钳位区间是
       *   `[anchor.x − totalLength, anchor.x + totalLength]`，理论上允许 targetX < anchor.x。
       *   那种情况下 `lo > hi`，两个分支会来回抢同一个点（每帧在两个值间抖）。
       *   本站行程 [LIGHT_END, DARK_END] = [0, 0.9] 恒在 anchor 右边，但别依赖这个前提。
       */
      const lo = Math.min(this.anchor[0], this.#targetX);
      const hi = Math.max(this.anchor[0], this.#targetX);
      for (let i = 1; i < this.n - 1; i++) {
        if (this.#pos[i].x < lo) {
          this.#pos[i].x = lo;
        } else if (this.#pos[i].x > hi) {
          this.#pos[i].x = hi;
        }
      }
    }
  }

  #projectDistance(i: number, j: number, rest: number, k: number) {
    const dx = this.#pos[j].x - this.#pos[i].x;
    const dy = this.#pos[j].y - this.#pos[i].y;
    const len = Math.hypot(dx, dy);

    if (len < 1e-8) return;

    const w1 = this.#invMass[i];
    const w2 = this.#invMass[j];
    const wsum = w1 + w2;
    if (wsum <= 0) return;

    const diff = (len - rest) / len;
    const c1 = (w1 / wsum) * k;
    const c2 = (w2 / wsum) * k;

    this.#pos[i] = d.vec2f(this.#pos[i].x + dx * diff * c1, this.#pos[i].y + dy * diff * c1);
    this.#pos[j] = d.vec2f(this.#pos[j].x - dx * diff * c2, this.#pos[j].y - dy * diff * c2);
  }

  #projectLineY(i: number, yTarget: number, k: number) {
    if (i <= 0 || i >= this.n - 1 || this.#invMass[i] <= 0) return;
    this.#pos[i] = d.vec2f(
      this.#pos[i].x,
      this.#pos[i].y + (yTarget - this.#pos[i].y) * std.saturate(k),
    );
  }

  #computeNormals() {
    const n = this.n;
    const eps = 1e-6;
    for (let i = 0; i < n; i++) {
      let dx: number;
      let dy: number;

      if (i === 0 && n > 1) {
        dx = this.#pos[1].x - this.#pos[0].x;
        dy = this.#pos[1].y - this.#pos[0].y;
      } else if (i === n - 1 && n > 1) {
        dx = this.#pos[n - 1].x - this.#pos[n - 2].x;
        dy = this.#pos[n - 1].y - this.#pos[n - 2].y;
      } else {
        dx = this.#pos[i + 1].x - this.#pos[i - 1].x;
        dy = this.#pos[i + 1].y - this.#pos[i - 1].y;
      }

      let len = Math.hypot(dx, dy);
      if (len < eps) {
        if (i > 0) {
          dx = this.#pos[i].x - this.#pos[i - 1].x;
          dy = this.#pos[i].y - this.#pos[i - 1].y;
          len = Math.hypot(dx, dy);
        }
        if (len < eps && i < n - 1) {
          dx = this.#pos[i + 1].x - this.#pos[i].x;
          dy = this.#pos[i + 1].y - this.#pos[i].y;
          len = Math.hypot(dx, dy);
        }
        if (len < eps) {
          this.#normals[i] = i > 0 ? this.#normals[i - 1] : d.vec2f(0, 1);
          continue;
        }
      }

      dx /= len;
      dy /= len;
      this.#normals[i] = d.vec2f(-dy, dx);
    }
  }

  #computeControlPoints() {
    for (let i = 0; i < this.n - 1; i++) {
      const A = this.#pos[i];
      const B = this.#pos[i + 1];

      const nA = this.#normals[i];
      const nB = this.#normals[i + 1];

      if (i === 0 || i === this.n - 2) {
        this.#controlPoints[i] = d.vec2f((A.x + B.x) * 0.5, (A.y + B.y) * 0.5);
        continue;
      }

      if (std.dot(nA, nB) > 0.99) {
        // Nearly parallel normals; midpoint fallback prevents explosions.
        // tiny offset opposite to the normal (any of them)
        this.#controlPoints[i] = d.vec2f((A.x + B.x) * 0.5, (A.y + B.y) * 0.5);
        continue;
      }

      const tA = d.vec2f(nA.y, -nA.x);
      const tB = d.vec2f(nB.y, -nB.x);

      // Solve A + t*tA = B - s*tB  ->  t*tA + s*tB = (B - A)
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const denom = tA.x * tB.y - tA.y * tB.x; // cross(tA, tB)

      if (Math.abs(denom) <= 1e-6) {
        // Nearly parallel tangents; midpoint fallback prevents explosions.
        this.#controlPoints[i] = d.vec2f((A.x + B.x) * 0.5, (A.y + B.y) * 0.5);
        continue;
      }

      // t = cross(B - A, tB) / cross(tA, tB)
      const t = (dx * tB.y - dy * tB.x) / denom;
      const cx = A.x + t * tA.x;
      const cy = A.y + t * tA.y;
      this.#controlPoints[i] = d.vec2f(cx, cy);
    }
  }

  #updateGPUBuffer() {
    this.pointsBuffer.write(this.#pos);
    this.controlPointsBuffer.write(this.#controlPoints);
    this.normalsBuffer.write(this.#normals);

    const len = this.#pos.length;
    const secondLast = this.#pos[len - 2];
    const last = this.#pos[len - 1];
    this.endCapUniform.write(d.vec4f(secondLast.x, secondLast.y, last.x, last.y));
  }
}
