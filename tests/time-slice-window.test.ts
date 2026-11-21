import { describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { tslWindow } from '../src/scripts/time-slice-core';

const createScene = vi.hoisted(() => vi.fn());
vi.mock('../src/scripts/time-slice-scene', () => ({ createTslScene: createScene }));
vi.mock('astro:transitions/client', () => ({ navigate: vi.fn() }));
vi.mock('../src/scripts/rl-core', async importOriginal => ({
  ...await importOriginal<typeof import('../src/scripts/rl-core')>(),
  createActivityGate: () => ({ onScreen: true, visible: true, dispose() {} }),
  startLoop: () => () => {},
}));

function bounds(path: string) {
  const values = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const xs = values.filter((_, i) => i % 2 === 0);
  const ys = values.filter((_, i) => i % 2 === 1);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

describe('时间切片 · 双层玻璃入口', () => {
  it('入口接近正方形、四角圆滑，前后玻璃错开且有厚度连线', () => {
    const pane = tslWindow(1280, 720, 0);
    const box = bounds(pane.front);
    expect((box.right - box.left) / (box.bottom - box.top)).toBeGreaterThan(0.8);
    expect((box.right - box.left) / (box.bottom - box.top)).toBeLessThan(1.1);
    expect(pane.front.match(/Q/g)).toHaveLength(4);
    expect(pane.back).not.toBe(pane.front);
    expect(bounds(pane.back).left).toBeGreaterThan(box.left);
    expect(pane.edges.match(/M/g)).toHaveLength(4);
    expect(pane.opacity).toBe(1);
  });

  it.each([[1280, 720], [2560, 1080], [768, 1024]])('穿窗后覆盖 %i×%i 的整个视口，玻璃边框完全收起', (w, h) => {
    const pane = tslWindow(w, h, 1);
    const box = bounds(pane.front);
    expect(box.left).toBeLessThan(0);
    expect(box.right).toBeGreaterThan(w);
    expect(box.top).toBeLessThan(0);
    expect(box.bottom).toBeGreaterThan(h);
    expect(pane.opacity).toBe(0);
  });

  it('前进放大、反向逐点还原，缩放过程不跳形且没有非法坐标', () => {
    let width = 0;
    let opacity = 1;
    for (let i = 0; i <= 100; i++) {
      const pane = tslWindow(1440, 900, i / 100);
      const box = bounds(pane.front);
      expect(box.right - box.left).toBeGreaterThanOrEqual(width);
      expect(pane.opacity).toBeLessThanOrEqual(opacity);
      expect(pane.front + pane.back + pane.edges).not.toMatch(/NaN|Infinity/);
      expect(tslWindow(1440, 900, i / 100)).toEqual(pane);
      width = box.right - box.left;
      opacity = pane.opacity;
    }
    expect(tslWindow(1440, 900, -1)).toEqual(tslWindow(1440, 900, 0));
    expect(tslWindow(1440, 900, 2)).toEqual(tslWindow(1440, 900, 1));
  });
});

it.each(['就绪', '失败'])('时间切片快速重新启用后，旧场景迟到%s不干扰当前装置', async outcome => {
  const win = new Window();
  const doc = win.document;
  doc.body.innerHTML = `<div data-tsl>
    <div data-tsl-stage></div><div data-tsl-view hidden><canvas data-tsl-cv></canvas></div>
    <div data-tsl-hud></div><div data-tsl-green></div>
    <div data-tsl-wait hidden><span data-tsl-wait-text></span><a data-tsl-retry></a></div>
    <svg data-tsl-ring><path data-tsl-front/><path data-tsl-back/><path data-tsl-edges/></svg>
    <div class="tsl-static"><a href="/gallery/">进入相册</a></div>
  </div>`;
  const motion = new win.EventTarget() as unknown as MediaQueryList;
  const reduce = (matches: boolean) => {
    Object.defineProperty(motion, 'matches', { value: matches, configurable: true });
    motion.dispatchEvent(new win.Event('change') as unknown as Event);
  };
  reduce(false);
  const matchMedia = (query: string) => query.includes('reduced-motion') ? motion : { matches: true, addEventListener() {}, removeEventListener() {} };
  vi.spyOn(win, 'matchMedia').mockImplementation(matchMedia as typeof win.matchMedia);
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  vi.stubGlobal('history', win.history); vi.stubGlobal('matchMedia', matchMedia);
  vi.stubGlobal('getComputedStyle', win.getComputedStyle.bind(win));
  vi.stubGlobal('PageTransitionEvent', win.PageTransitionEvent);
  const oldScene = { resize: vi.fn(), dispose: vi.fn() };
  const newScene = { resize: vi.fn(), dispose: vi.fn() };
  let resolve!: (value: typeof oldScene) => void;
  let reject!: (reason: Error) => void;
  createScene.mockReturnValueOnce(new Promise((ok, fail) => { resolve = ok; reject = fail; })).mockResolvedValueOnce(newScene);
  try {
    await import('../src/scripts/time-slice');
    await vi.dynamicImportSettled();
    expect(createScene).toHaveBeenCalledOnce();
    reduce(true); reduce(false);
    await vi.dynamicImportSettled();
    expect(createScene).toHaveBeenCalledTimes(2);
    expect(createScene.mock.calls[0][2]()).toBe(false);
    if (outcome === '就绪') resolve(oldScene);
    else reject(new Error('旧动画加载失败'));
    await vi.dynamicImportSettled();
    expect(doc.querySelector('[data-tsl]')?.classList.contains('tsl-on')).toBe(true);
    expect(newScene.resize).toHaveBeenCalledOnce();
    expect(newScene.dispose).not.toHaveBeenCalled();
    expect(oldScene.resize).not.toHaveBeenCalled();
    if (outcome === '就绪') expect(oldScene.dispose).toHaveBeenCalledOnce();
  } finally {
    doc.dispatchEvent(new win.Event('astro:before-swap'));
    vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); createScene.mockReset();
  }
});
