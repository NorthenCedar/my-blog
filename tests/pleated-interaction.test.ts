import { describe, it, expect } from 'vitest';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { projectPleatPoint } from '../src/scripts/pleated-core';

const code = buildSync({ entryPoints: ['src/scripts/pleated-infinity.ts'], bundle: true, write: false, format: 'iife' }).outputFiles[0].text;

/** 仅替换 DOM、时钟和 GPU 边界，命中与波的计算仍运行生产代码。 */
function run(options: { reduced?: boolean; context?: boolean; hidden?: boolean } = {}) {
  const events = new Map<string, (event?: any) => void>();
  const frames = new Map<number, (time: number) => void>();
  let time = 0, id = 0, vertices = new Float32Array(), selection = '';
  let dark = false;
  const colors = new Map<string, number[]>();
  const scalars = new Map<string, number>();
  class Element { constructor(public control = false) {} closest() { return this.control ? this : null; } }
  const target = new Element();
  const listen = (name: string, fn: () => void) => events.set(name, fn);
  const gl = new Proxy({
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    getShaderParameter: () => true, getProgramParameter: () => true, getAttribLocation: () => 0,
    getUniformLocation: (_: unknown, name: string) => name,
    uniform3fv: (name: string, values: number[]) => { colors.set(name, [...values]); },
    uniform1f: (name: string, value: number) => { scalars.set(name, value); },
    bufferData: (_: unknown, data: Float32Array) => { vertices = data.slice(); },
  }, { get: (object, key) => key in object ? object[key as keyof typeof object] : () => {} });
  let context = options.context !== false;
  const canvas = {
    hidden: true, width: 0, height: 0, clientWidth: 1000, clientHeight: 600,
    getContext: () => context ? gl : null, addEventListener: listen,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 1000, height: 600 }),
  };
  const host = { ready: false, querySelector: () => canvas, toggleAttribute: (_: string, on: boolean) => { host.ready = on; }, removeAttribute: () => { host.ready = false; } };
  const document = { hidden: !!options.hidden, querySelector: () => host, addEventListener: listen, getSelection: () => selection };
  const query = { matches: !!options.reduced, change: () => {}, addEventListener: (_: string, fn: () => void) => { query.change = fn; } };
  runInNewContext(code, {
    document, Element, performance: { now: () => time },
    window: { devicePixelRatio: 1, addEventListener: listen },
    matchMedia: () => query,
    getComputedStyle: () => ({ getPropertyValue: (name: string) => (dark
      ? { '--pleat-base': '#b47a4a', '--pleat-wave': '#ffd0a0', '--pleat-opacity': '.52', '--pleat-wave-opacity': '.52', '--pleat-contrast': '.65', '--pleat-glow': '.28' }
      : { '--pleat-base': '#fff', '--pleat-wave': '#a4cfad', '--pleat-opacity': '.3', '--pleat-wave-opacity': '.58', '--pleat-contrast': '.5', '--pleat-glow': '0' })[name] }),
    requestAnimationFrame: (fn: (time: number) => void) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    ResizeObserver: class { observe() {} },
  });
  return {
    canvas, host, frames, colors, scalars,
    get green() { let max = 0; for (let n = 6; n < vertices.length; n += 7) max = Math.max(max, vertices[n]); return max; },
    point() {
      // 从实际首帧薄片三角形内部取一点，带上画布在视口中的偏移。
      const points = [0, 7, 14].map(n => projectPleatPoint(vertices.subarray(n, n + 3), 1000, 600));
      return [100 + points.reduce((sum, p) => sum + p[0], 0) / 3, 50 + points.reduce((sum, p) => sum + p[1], 0) / 3];
    },
    emit(name: string, point = [0, 0], control = false, extra = {}) {
      events.get(name)?.({ clientX: point[0], clientY: point[1], pointerId: 1, button: 0, isPrimary: true, target: control ? new Element(true) : target, preventDefault() {}, ...extra });
    },
    tick(count = 1) { for (let n = 0; n < count; n++) { time += 40; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time)); } },
    select() { selection = '选中的正文'; },
    hide(hidden: boolean) { document.hidden = hidden; events.get('visibilitychange')?.(); },
    reduce(reduced: boolean) { query.matches = reduced; query.change(); },
    restore() { context = true; events.get('webglcontextrestored')?.(); },
    theme(value: boolean) { dark = value; events.get('themechange')?.(); },
  };
}

describe('百褶环 · 点击和浏览器生命周期', () => {
  it('点击实际薄片产生绿波，点击孔洞外的空白不触发', () => {
    const r = run();
    r.emit('pointerdown', [101, 51]); r.emit('pointerup', [101, 51]); r.tick(10);
    expect(r.green).toBe(0);
    const point = r.point();
    r.emit('pointerdown', point); r.emit('pointerup', point); r.tick(10);
    expect(r.green).toBeGreaterThan(.5);
    r.tick(150);
    expect(r.green).toBe(0);
  });

  it.each(['drag', 'scroll', 'selection', 'link', 'cancel', 'secondary', 'long'])('%s 不误触发，背景不接管拖动', mode => {
    const r = run(), point = r.point();
    r.emit('pointerdown', point, mode === 'link', mode === 'secondary' ? { button: 2 } : {});
    if (mode === 'drag') r.emit('pointermove', [point[0] + 30, point[1]]);
    if (mode === 'scroll') r.emit('scroll');
    if (mode === 'selection') r.select();
    if (mode === 'cancel') r.emit('pointercancel');
    if (mode === 'long') r.tick(20);
    r.emit('pointerup', point, mode === 'link'); r.tick(10);
    expect(r.green).toBe(0);
  });

  it('失焦和后台停帧，回来只运行一个动画循环', () => {
    const r = run();
    r.emit('blur'); expect(r.frames.size).toBe(0);
    r.emit('focus'); r.emit('pageshow'); expect(r.frames.size).toBe(1);
    r.hide(true); expect(r.frames.size).toBe(0);
    r.hide(false); expect(r.frames.size).toBe(1);
    r.emit('pagehide'); expect(r.frames.size).toBe(0);
  });

  it('减少动效静止且不响应点击，运行中切换也立即清除波', () => {
    const r = run({ reduced: true }), point = r.point();
    r.emit('pointerdown', point); r.emit('pointerup', point); r.tick(10);
    expect(r.frames.size).toBe(0); expect(r.green).toBe(0);
    r.reduce(false); r.emit('pointerdown', point); r.emit('pointerup', point); r.tick(10);
    expect(r.green).toBeGreaterThan(0);
    r.reduce(true); expect(r.frames.size).toBe(0); expect(r.green).toBe(0);
  });

  it('WebGL 不可用或丢失时显示后备图，恢复后可以继续', () => {
    const absent = run({ context: false });
    expect(absent.host.ready).toBe(false); expect(absent.canvas.hidden).toBe(true); expect(absent.frames.size).toBe(0);
    const r = run(); r.emit('webglcontextlost');
    expect(r.host.ready).toBe(false); expect(r.canvas.hidden).toBe(true); expect(r.frames.size).toBe(0);
    r.restore(); expect(r.host.ready).toBe(true); expect(r.frames.size).toBe(1);
  });

  it('切换主题即刻更新薄片与脉冲色，保留传播中的波及单一帧循环', () => {
    const r = run(), point = r.point();
    r.emit('pointerdown', point); r.emit('pointerup', point); r.tick(5);
    const wave = r.green;
    expect(wave).toBeGreaterThan(0);
    r.theme(true);
    expect(r.colors.get('uBase')).toEqual([180, 122, 74].map(c => c / 255));
    expect(r.colors.get('uWave')).toEqual([255, 208, 160].map(c => c / 255));
    expect(r.green).toBe(wave);
    expect(r.frames.size).toBe(1);
    r.theme(false);
    expect(r.colors.get('uBase')).toEqual([1, 1, 1]);
    expect(r.colors.get('uWave')).toEqual([164, 207, 173].map(c => c / 255));
    expect(r.frames.size).toBe(1);
    r.emit('webglcontextlost'); r.theme(true); r.restore();
    expect(r.colors.get('uWave')).toEqual([255, 208, 160].map(c => c / 255));
  });

  it('暗色常驻辉光无需点击，亮色归零，上下文恢复后保留当前强度', () => {
    const r = run();
    expect(r.scalars.get('uGlow')).toBe(0);
    r.theme(true);
    expect(r.green).toBe(0);
    expect(r.scalars.get('uGlow')).toBeGreaterThan(0);
    expect(r.frames.size).toBe(1);
    r.emit('webglcontextlost'); r.restore();
    expect(r.scalars.get('uGlow')).toBe(.28);
    r.theme(false);
    expect(r.scalars.get('uGlow')).toBe(0);
    expect(r.green).toBe(0);
  });
});
