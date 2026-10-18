import { describe, it, expect } from 'vitest';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';

const code = buildSync({ entryPoints: ['src/scripts/ripple.ts'], bundle: true, write: false, format: 'iife' }).outputFiles[0].text;

/** 只替换浏览器边界；轨迹、波面和像素渲染均执行生产代码。 */
function run(opts: { reduced?: boolean; mobile?: boolean; context?: boolean; hidden?: boolean } = {}) {
  const events = new Map<string, (e?: any) => void>();
  const frames = new Map<number, (t: number) => void>();
  const queries: { matches: boolean; change?: () => void }[] = [];
  let clock = 0, id = 0;
  let pixels = new Uint8ClampedArray();
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (image: { data: Uint8ClampedArray }) => { pixels = image.data.slice(); },
    clearRect: () => { pixels.fill(0); },
  };
  const canvas = { width: 0, height: 0, hidden: true, getContext: () => opts.context === false ? null : ctx };
  const document = { querySelector: (s: string) => s === '[data-ripple]' ? canvas : null, visibilityState: opts.hidden ? 'hidden' : 'visible', addEventListener: (name: string, fn: () => void) => events.set(name, fn) };
  const window = {
    innerWidth: opts.mobile ? 390 : 1200, innerHeight: 800,
    addEventListener: (name: string, fn: () => void) => events.set(name, fn),
  };
  runInNewContext(code, {
    window, document, Float32Array, Uint8ClampedArray, Math,
    performance: { now: () => clock },
    requestAnimationFrame: (fn: (t: number) => void) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (n: number) => frames.delete(n),
    matchMedia: (q: string) => {
      const query = { matches: q.includes('reduced-motion') ? !!opts.reduced : !opts.mobile, change: undefined as (() => void) | undefined };
      queries.push(query);
      return Object.assign(query, { addEventListener: (_: string, fn: () => void) => { query.change = fn; } });
    },
    getComputedStyle: () => ({ getPropertyValue: (name: string) => ({ '--water-shadow': '#53645a', '--water-light': '#fff', '--water-strength': '0.17' })[name] ?? '' }),
  });
  return {
    canvas, frames, document,
    get pixels() { return pixels; },
    move(x: number, y: number, pointerType = 'mouse') { clock += 16; events.get('pointermove')?.({ clientX: x, clientY: y, pointerType }); },
    tick(ms = 1000 / 60) { clock += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(clock)); },
    hide() { document.visibilityState = 'hidden'; events.get('visibilitychange')?.(); },
    show() { document.visibilityState = 'visible'; events.get('visibilitychange')?.(); },
    reduce() { queries[0].matches = true; queries[0].change?.(); },
  };
}
const alpha = (pixels: Uint8ClampedArray) => pixels.reduce((n, v, i) => n + (i % 4 === 3 ? v : 0), 0);

describe('留言页浅水 · 指针与生命周期', () => {
  it('移动即可起波，视口左侧空白也有效，坐标不减版心偏移', () => {
    const r = run();
    expect(r.frames.size).toBe(0);
    r.move(40, 300); r.move(90, 300); r.tick();
    expect(alpha(r.pixels)).toBeGreaterThan(0);
    let weightedX = 0, weight = 0;
    for (let i = 3; i < r.pixels.length; i += 4) { weightedX += ((i - 3) / 4 % r.canvas.width) * r.pixels[i]; weight += r.pixels[i]; }
    expect(weightedX / weight * 1200 / r.canvas.width).toBeGreaterThan(30);
    expect(weightedX / weight * 1200 / r.canvas.width).toBeLessThan(110);
  });

  it('波消散后停止申请帧，再移动可以唤醒', () => {
    const r = run();
    r.move(300, 300); r.move(500, 300); r.tick();
    expect(alpha(r.pixels)).toBeGreaterThan(0);
    // 生命周期只关心经过时间；每次推进 100ms，帧率等价性由波面测试覆盖。
    for (let i = 0; i < 45; i++) r.tick(100);
    expect(r.frames.size).toBe(0);
    expect(alpha(r.pixels)).toBe(0);
    r.move(600, 300); r.move(650, 300); r.tick();
    expect(alpha(r.pixels)).toBeGreaterThan(0);
    /* ★ 显式给预算：这里推进的是**模拟时间**（45×100ms），不真的等 ——
       但 45 帧的场递推本身是纯计算，单跑 2.6 秒、46 个 worker 满负载时 6.4 秒，
       会撞上 vitest 默认的 5 秒上限，报的是「Test timed out」而不是断言失败。
       （同一类坑：tests/tokens.test.ts 里那条 fork 子进程的用例。） */
  }, 20000);

  it.each([{ reduced: true }, { mobile: true }, { context: false }])('降级条件 %j 不运行', (opts) => {
    const r = run(opts);
    r.move(100, 200); r.move(250, 200); r.tick();
    expect(r.frames.size).toBe(0);
    expect(r.canvas.hidden).toBe(true);
  });

  it('构建压缩后的三位白色色值仍呈中性反光', () => {
    const r = run();
    r.move(300, 300); r.move(500, 300); r.tick();
    let highlights = 0;
    for (let i = 0; i < r.pixels.length; i += 4) {
      if (r.pixels[i] < 200 || r.pixels[i + 3] === 0) continue;
      highlights++;
      expect(r.pixels[i + 1]).toBe(r.pixels[i]);
      expect(r.pixels[i + 2]).toBe(r.pixels[i]);
    }
    expect(highlights).toBeGreaterThan(0);
  });

  it('触屏不触发；切到后台或运行中开启减少动效会清场停帧', () => {
    for (const stop of ['hide', 'reduce'] as const) {
      const r = run();
      r.move(100, 300, 'touch'); r.move(300, 300, 'touch'); r.tick();
      expect(alpha(r.pixels)).toBe(0);
      r.move(100, 300); r.move(300, 300); r.tick();
      expect(alpha(r.pixels)).toBeGreaterThan(0);
      r[stop]();
      expect(r.frames.size).toBe(0);
      expect(alpha(r.pixels)).toBe(0);
    }
  });

  it('在后台打开页面，切到前台后仍可起波', () => {
    const r = run({ hidden: true });
    expect(r.canvas.hidden).toBe(true);
    r.show();
    r.move(300, 300); r.move(500, 300); r.tick();
    expect(r.canvas.hidden).toBe(false);
    expect(alpha(r.pixels)).toBeGreaterThan(0);
  });
});
