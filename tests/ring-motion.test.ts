import { afterEach, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { angleDelta, advanceSpring, spring } from '../src/scripts/ring-motion-core';

const windows: Window[] = [];
afterEach(() => {
  for (const win of windows.splice(0)) win.document.dispatchEvent(new win.Event('astro:before-swap'));
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});
it('跨过角度接缝不会跳转；归位在30/120Hz一致并能停稳', () => {
  expect(angleDelta(-Math.PI + 0.01, Math.PI - 0.01)).toBeCloseTo(0.02);
  const run = (hz: number) => {
    const s = spring(); s.value = 40; s.velocity = 10;
    for (let i = 0; i < hz / 2; i++) advanceSpring(s, 1 / hz);
    const value = s.value;
    for (let i = 0; i < hz * 4; i++) advanceSpring(s, 1 / hz);
    expect(s.value).toBe(0); expect(s.velocity).toBe(0);
    return value;
  };
  expect(run(30)).toBeCloseTo(run(120), 4);
});

async function run(options: { reduced?: boolean; mobile?: boolean } = {}) {
  vi.resetModules();
  const win = new Window({ width: 1400, height: 900 }); windows.push(win);
  win.document.body.className = 'guestbook-plate';
  win.document.body.innerHTML = '<div data-ring-frame><div data-ring-motion><svg><path class="ring-pulse-core" /></svg></div></div><main><div class="prose"><textarea></textarea><a href="#">链接</a></div></main>';
  const frame = win.document.querySelector('[data-ring-frame]')!;
  const motion = win.document.querySelector('[data-ring-motion]') as any;
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1400, height: 900, right: 1400, bottom: 900 } as any);
  const path = win.document.querySelector('path') as any;
  path.getTotalLength = () => 240;
  path.getPointAtLength = (n: number) => ({ x: 100 + n, y: 200 });
  const frames = new Map<number, FrameRequestCallback>(); let id = 0, clock = 0;
  vi.spyOn(win, 'requestAnimationFrame').mockImplementation(fn => { frames.set(++id, fn); return id; });
  vi.spyOn(win, 'cancelAnimationFrame').mockImplementation(n => { frames.delete(n); });
  const queries: any[] = [];
  vi.spyOn(win, 'matchMedia').mockImplementation(query => {
    const m = new win.EventTarget() as any;
    m.matches = query.includes('reduced-motion') ? !!options.reduced : !options.mobile;
    queries.push(m); return m;
  });
  vi.stubGlobal('window', win); vi.stubGlobal('document', win.document);
  vi.stubGlobal('PageTransitionEvent', win.PageTransitionEvent);
  vi.stubGlobal('performance', { now: () => clock });
  await import('../src/scripts/ring-motion');
  const tick = (ms = 1000 / 60) => { clock += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(clock)); };
  const settle = () => { for (let i = 0; i < 500 && frames.size; i++) tick(); };
  settle();
  return {
    win, motion, frames, tick, settle,
    fire(type: string, x = 120, y = 200, target: any = win, pointerType = 'mouse', pointerId = 1) {
      const e = new win.PointerEvent(type, { clientX: x, clientY: y, pointerType, pointerId, button: 0, bubbles: true, cancelable: true });
      target.dispatchEvent(e); return e;
    },
    reduce() { queries[0].matches = true; queries[0].dispatchEvent(new win.Event('change')); },
  };
}
it('靠近环时倾斜，拖动连续旋转，松开回到初始姿态并停帧', async () => {
  const r = await run();
  r.fire('pointermove'); r.settle();
  expect(r.motion.style.transform).not.toContain('rotateX(0.000deg) rotateY(0.000deg)');
  expect(r.frames.size).toBe(0);
  expect(r.fire('pointerdown').defaultPrevented).toBe(true);
  r.fire('pointermove', 350, 100); r.settle();
  expect(r.motion.style.transform).not.toContain('rotateZ(0.000deg)');
  const spin = Number(r.motion.style.transform.match(/rotateZ\(([-.\d]+)deg\)/)![1]);
  expect(Math.abs(spin)).toBeLessThanOrEqual(12);
  r.fire('pointerup'); r.tick(3000);
  expect(r.motion.style.transform).toBe('rotateX(0.000deg) rotateY(0.000deg) rotateZ(0.000deg)');
  expect(r.win.document.body.hasAttribute('data-ring-dragging')).toBe(false);
  expect(r.frames.size).toBe(0);
});
it('环外、链接、正文、输入焦点及触屏不截取手势', async () => {
  const r = await run();
  expect(r.fire('pointerdown', 900, 800).defaultPrevented).toBe(false);
  for (const selector of ['a', '.prose', 'textarea']) {
    expect(r.fire('pointerdown', 120, 200, r.win.document.querySelector(selector)).defaultPrevented).toBe(false);
  }
  expect(r.fire('pointerdown', 120, 200, r.win, 'touch').defaultPrevented).toBe(false);
  r.win.document.querySelector('textarea')!.focus();
  expect(r.fire('pointerdown').defaultPrevented).toBe(false);
  r.settle(); expect(r.frames.size).toBe(0);
});
it.each([{ reduced: true }, { mobile: true }])('%j 保持静态', async options => {
  const r = await run(options);
  expect(r.fire('pointerdown').defaultPrevented).toBe(false);
  r.fire('pointermove'); expect(r.frames.size).toBe(0);
  expect(r.win.document.body.classList.contains('ring-can-drag')).toBe(false);
});
it('取消拖动、失焦、减少动态和离页均释放选择锁与待执行帧', async () => {
  const r = await run();
  r.fire('pointerdown'); r.fire('pointermove', 300, 100);
  r.fire('pointercancel'); r.settle();
  expect(r.win.document.body.hasAttribute('data-ring-dragging')).toBe(false);
  r.fire('pointerdown'); r.fire('pointermove', 300, 100);
  r.win.dispatchEvent(new r.win.Event('blur'));
  expect(r.motion.style.transform).toBe(''); expect(r.frames.size).toBe(0);
  r.fire('pointerdown'); r.reduce(); r.settle();
  expect(r.frames.size).toBe(0);
  r.win.document.dispatchEvent(new r.win.Event('astro:before-swap'));
  expect(r.frames.size).toBe(0);
  r.fire('pointermove'); expect(r.frames.size).toBe(0);
});
