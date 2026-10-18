import type { TgpuRoot, TgpuUniform } from 'typegpu';
import { d } from 'typegpu';
import * as m from 'wgpu-matrix';

export const Camera = d.struct({
  view: d.mat4x4f,
  proj: d.mat4x4f,
  viewInv: d.mat4x4f,
  projInv: d.mat4x4f,
});

function halton(index: number, base: number) {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f = f / base;
  }
  return result;
}

function* haltonSequence(base: number) {
  let index = 1;
  while (true) {
    yield halton(index, base);
    index++;
  }
}

export class CameraController {
  #uniform: TgpuUniform<typeof Camera>;
  #view: d.m4x4f;
  #proj: d.m4x4f;
  #viewInv: d.m4x4f;
  #projInv: d.m4x4f;
  #baseProj: d.m4x4f;
  #baseProjInv: d.m4x4f;
  #haltonX: Generator<number>;
  #haltonY: Generator<number>;
  #width: number;
  #height: number;

  constructor(
    root: TgpuRoot,
    position: d.v3f,
    target: d.v3f,
    up: d.v3f,
    fov: number,
    width: number,
    height: number,
    near = 0.1,
    far = 10,
  ) {
    this.#width = width;
    this.#height = height;

    this.#view = m.mat4.lookAt(position, target, up, d.mat4x4f());
    this.#baseProj = m.mat4.perspective(fov, width / height, near, far, d.mat4x4f());
    this.#proj = this.#baseProj;

    this.#viewInv = m.mat4.invert(this.#view, d.mat4x4f());
    this.#baseProjInv = m.mat4.invert(this.#baseProj, d.mat4x4f());
    this.#projInv = this.#baseProjInv;

    this.#uniform = root.createUniform(Camera, {
      view: this.#view,
      proj: this.#proj,
      viewInv: this.#viewInv,
      projInv: this.#projInv,
    });

    this.#haltonX = haltonSequence(2);
    this.#haltonY = haltonSequence(3);
  }

  jitter() {
    const [jx, jy] = [this.#haltonX.next().value, this.#haltonY.next().value] as [number, number];

    const jitterX = ((jx - 0.5) * 2.0) / this.#width;
    const jitterY = ((jy - 0.5) * 2.0) / this.#height;

    const jitterMatrix = m.mat4.identity(d.mat4x4f());
    jitterMatrix[12] = jitterX; // x translation in NDC
    jitterMatrix[13] = jitterY; // y translation in NDC

    const jitteredProj = m.mat4.mul(jitterMatrix, this.#baseProj, d.mat4x4f());
    const jitteredProjInv = m.mat4.invert(jitteredProj, d.mat4x4f());

    this.#uniform.patch({
      proj: jitteredProj,
      projInv: jitteredProjInv,
    });
  }

  updateView(position: d.v3f, target: d.v3f, up: d.v3f) {
    this.#view = m.mat4.lookAt(position, target, up, d.mat4x4f());
    this.#viewInv = m.mat4.invert(this.#view, d.mat4x4f());

    this.#uniform.patch({
      view: this.#view,
      viewInv: this.#viewInv,
    });
  }

  updateProjection(fov: number, width: number, height: number, near = 0.1, far = 100) {
    this.#width = width;
    this.#height = height;

    this.#baseProj = m.mat4.perspective(fov, width / height, near, far, d.mat4x4f());
    this.#baseProjInv = m.mat4.invert(this.#baseProj, d.mat4x4f());

    this.#uniform.patch({
      proj: this.#baseProj,
      projInv: this.#baseProjInv,
    });
  }

  get cameraUniform() {
    return this.#uniform;
  }

  /**
   * ★ 本站加（2026-10-17 第七轮）：世界坐标 → 画布归一化坐标（0..1，左上原点）。
   *
   * 唯一用途是 CPU 侧的**指针命中测试**（`events.ts` 判断"点没点在软条上"）——
   * 着色器里的 `getRay` 走的是逆矩阵反投影，方向正好相反，别互相替代。
   *
   * ⚠ 用**不含 jitter** 的 `#baseProj`，不用每帧抖动后的 `#proj`：命中判据要和
   *   "用户实际看到的构图"对齐，而半个像素的时域抖动对判据毫无意义，反而会让
   *   命中区每帧晃。`#baseProj` 只在 resize（`updateProjection`）时变。
   */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const viewPos = m.vec4.transformMat4(d.vec4f(x, y, z, 1), this.#view, d.vec4f());
    const clip = m.vec4.transformMat4(viewPos, this.#baseProj, d.vec4f());
    const w = clip[3] === 0 ? 1e-6 : clip[3];
    /* WebGPU 的 NDC：x 向右为正、y **向上**为正 ⇒ 屏幕 y 要翻过来 */
    return { x: (clip[0] / w) * 0.5 + 0.5, y: 0.5 - (clip[1] / w) * 0.5 };
  }
}
