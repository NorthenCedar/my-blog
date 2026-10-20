import { afterEach, describe, expect, it, vi } from 'vitest';
import { type TgpuRoot } from 'typegpu';
import { NumberProvider } from '../src/vendor/jelly-slider/numbers';
import { setupScene } from '../src/vendor/jelly-slider/scene';
import {
  DARK_END, LIGHT_END, MOUSE_RANGE_MIN, MOUSE_RANGE_MAX,
} from '../src/vendor/jelly-slider/constants';

type Point = { x: number; y: number };

// 只替换浏览器和 GPU 边界：链条积分、事件平滑、首帧与停帧逻辑都跑真实实现。
async function createScene(initialX: number) {
  let points: Point[] = [];
  let pendingFrame: FrameRequestCallback | null = null;
  let bezierDispatches = 0;
  let now = 0;
  const snapshot = (values: readonly Point[]) => values.map(p => ({ x: p.x, y: p.y }));
  const pipeline = {
    with() { return this; },
    withColorAttachment() { return this; },
    draw() {},
    dispatchThreads() { bezierDispatches++; },
    dispatchWorkgroups() {},
  };
  const root = {
    enabledFeatures: new Set(),
    createBuffer(_schema: unknown, values: unknown) {
      const isPoints = Array.isArray(values) && values.length === 17 && points.length === 0;
      if (isPoints) points = snapshot(values);
      return {
        $usage() { return this; }, as() { return this; },
        write(next: Point[]) { if (isPoints) points = snapshot(next); },
      };
    },
    createTexture() {
      return { $usage() { return this; }, createView() { return this; } };
    },
    createUniform() { return { write() {}, patch() {} }; },
    createSampler() {}, createBindGroup() {},
    createGuardedComputePipeline() { return pipeline; },
    createComputePipeline() { return pipeline; },
    createRenderPipeline() { return pipeline; },
    with() { return this; },
  } as unknown as TgpuRoot;
  const canvas = Object.assign(new EventTarget(), {
    width: 220, height: 200,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 220, height: 200 }),
  });
  const pointerWindow = new EventTarget();
  vi.stubGlobal('window', pointerWindow);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingFrame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => { pendingFrame = null; });
  vi.spyOn(NumberProvider.prototype, 'fillAtlas').mockResolvedValue();
  const scene = await setupScene(root, { canvas } as unknown as GPUCanvasContext);
  scene.eventHandler.setInitial(initialX);
  function frame() {
    const callback = pendingFrame;
    pendingFrame = null;
    now += 1000 / 60;
    callback?.(now);
    return callback !== null;
  }
  return {
    scene, frame,
    get points() { return snapshot(points); },
    get bezierDispatches() { return bezierDispatches; },
    dragTo(end: number) {
      const clientX = (x: number) => 220 * (MOUSE_RANGE_MIN +
        (x - LIGHT_END) / (DARK_END - LIGHT_END) * (MOUSE_RANGE_MAX - MOUSE_RANGE_MIN));
      const pointer = (type: string, x: number) => Object.assign(new Event(type), {
        pointerId: 1, isPrimary: true, button: 0, clientX: clientX(x), clientY: 100,
      });
      const start = scene.eventHandler.currentMouseX;
      // GPU 边界没有可命中的像素；物理回归从已抓住端头的状态开始。
      scene.eventHandler.hitTest = () => true;
      canvas.dispatchEvent(pointer('pointerdown', start));
      for (let i = 1; i <= 60; i++) {
        pointerWindow.dispatchEvent(pointer('pointermove', start + (end - start) * i / 60));
        frame();
      }
      pointerWindow.dispatchEvent(pointer('pointerup', end));
      scene.eventHandler.snapTo(end);
    },
    settle() {
      let count = 0;
      while (frame() && count++ < 240) { /* 真实的静止停帧条件结束循环 */ }
      expect(count, '静止后渲染循环应自行停帧').toBeLessThan(240);
    },
  };
}

const maxDistance = (a: readonly Point[], b: readonly Point[]) =>
  Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('果冻的首帧平衡态', () => {
  it('亮色首帧与往返移动后的静止形状一致', async () => {
    const view = await createScene(LIGHT_END);
    view.frame();
    const initial = view.points;
    expect(view.bezierDispatches, '初始求解只上传最终形状、计算一次纹理').toBe(1);
    view.settle();
    expect(maxDistance(initial, view.points), '显示后不应继续从折叠态变成单拱')
      .toBeLessThan(0.005);
    view.dragTo(DARK_END);
    view.settle();
    view.dragTo(LIGHT_END);
    view.settle();

    expect(initial.at(-1)?.x, '首帧端头就在亮色端').toBe(0);
    expect(maxDistance(initial, view.points), '首帧不应比往返后多出折叠或贴地段')
      .toBeLessThan(0.03);
  }, 20000);

  it('深色首帧端头、纹理已就位，静止后仍保持同一形状', async () => {
    const view = await createScene(DARK_END);
    view.frame();
    const initial = view.points;
    expect(initial.at(-1)?.x).toBeCloseTo(0.9, 6);
    expect(view.bezierDispatches).toBe(1);
    view.settle();
    expect(maxDistance(initial, view.points)).toBeLessThan(0.005);
    expect(view.bezierDispatches, '正常物理帧仍然更新纹理').toBeGreaterThan(1);
  }, 20000);
});
