import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ scene: null as any, theme: 'light', writes: [] as string[], document: null as any }));
vi.mock('../src/vendor/jelly-slider/scene.ts', () => ({ setupScene: async () => state.scene }));
vi.mock('typegpu', async (original) => {
  const actual = await original<typeof import('typegpu')>();
  return { ...actual, tgpu: { ...actual.tgpu, init: async () => ({ configureContext: () => ({}) }) } };
});
vi.mock('../src/scripts/theme.ts', () => ({
  getTheme: () => state.theme,
  setTheme: (theme: string) => {
    state.theme = theme; state.writes.push(theme);
    state.document.documentElement.classList.toggle('dark', theme === 'dark');
    state.document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  },
}));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function run(theme = 'light', reduced = false) {
  state.theme = theme; state.writes = [];
  const windowEvents = new Map<string, (e: any) => void>();
  const canvasEvents = new Map<string, (e: any) => void>();
  const documentEvents = new Map<string, (e: any) => void>();
  const styles = new Map<string, string>(), attrs = new Map<string, string>();
  const classes = new Set(theme === 'dark' ? ['dark'] : []);
  const html = {
    classList: { contains: (v: string) => classes.has(v),
      add: (v: string) => classes.add(v), remove: (v: string) => classes.delete(v),
      toggle: (v: string, on: boolean) => on ? classes.add(v) : classes.delete(v) },
    style: { getPropertyValue: (n: string) => styles.get(n) || '', getPropertyPriority: () => '',
      setProperty: (n: string, v: string) => styles.set(n, v), removeProperty: (n: string) => styles.delete(n) },
    setAttribute: (n: string, v: string) => attrs.set(n, v), removeAttribute: (n: string) => attrs.delete(n),
    getAttribute: (n: string) => attrs.get(n) ?? null,
  };
  const document = state.document = {
    documentElement: html,
    addEventListener: (n: string, fn: (e: any) => void) => documentEvents.set(n, fn),
    dispatchEvent: (e: any) => documentEvents.get(e.type)?.(e),
  };
  const palette = (dark: boolean) => ({ '--paper': dark ? '#0b0b0c' : '#fafaf7',
    '--ink': dark ? '#f2f4f1' : '#1a1a1a', '--accent-ink': dark ? '#ffb570' : '#266b3b',
    '--jelly-tip-light': '#ff7313', '--jelly-tip-dark': '#266b3b' });
  vi.stubGlobal('getComputedStyle', () => {
    const p = palette(classes.has('dark'));
    return Object.assign(Object.keys(p), { getPropertyValue: (n: keyof typeof p) => styles.get(n) || p[n] || '' });
  });
  let pending: (() => void) | undefined;
  const events = {
    isPointerDown: false, didGrab: false, pointerTargetX: theme === 'dark' ? .9 : 0, currentMouseX: 0,
    setInitial: vi.fn((x: number) => { events.currentMouseX = x; events.pointerTargetX = x; }),
    snapTo: vi.fn((_x: number, done: () => void) => { pending = done; }),
    cancelDrag: vi.fn(() => { events.isPointerDown = false; events.didGrab = false; pending = undefined; }),
  };
  state.scene = { eventHandler: events, groundTint: null, jellyColor: null, onProgress: null };
  const canvas = { width: 0, height: 0, addEventListener: (n: string, fn: (e: any) => void) => canvasEvents.set(n, fn) };
  const root = { querySelector: () => canvas, setAttribute() {}, addEventListener() {} };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', { devicePixelRatio: 1, matchMedia: () => ({ matches: reduced }),
    addEventListener: (n: string, fn: (e: any) => void) => windowEvents.set(n, fn) });
  vi.stubGlobal('navigator', { gpu: {} });
  const { initJellyThemeToggle } = await import('../src/scripts/theme-toggle');
  await initJellyThemeToggle(root as any);
  const emit = (type: string, x: number) => ({ type, pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: 10 });
  return {
    styles, attrs, events, scene: state.scene,
    down(x: number, grabbed = true) { events.didGrab = grabbed; events.isPointerDown = grabbed; canvasEvents.get('pointerdown')?.(emit('pointerdown', x)); },
    move(x: number) { events.pointerTargetX = Math.max(0, Math.min(.9, x / 100 * .9)); windowEvents.get('pointermove')?.(emit('pointermove', x)); },
    frame(p: number) { events.currentMouseX = p * .9; state.scene.onProgress?.(p); },
    up(x: number) { events.isPointerDown = false; windowEvents.get('pointerup')?.(emit('pointerup', x)); },
    settle() { const done = pending; pending = undefined; done?.(); },
    cancel() { events.isPointerDown = false; windowEvents.get('pointercancel')?.(emit('pointercancel', 50)); },
  };
}

describe('主题开关 · 拖动连续预览，点按保持直接切换', () => {
  it('正向拖动跟随软条进度渐变，松手落定后才保存主题', async () => {
    const r = await run();
    r.down(0); r.move(50); r.frame(.5);
    expect(r.styles.get('--theme-preview-weight')).toBe('50%');
    expect(r.styles.get('--paper')).toContain('color-mix');
    expect(r.scene.groundTint.w).toBe(.5);
    expect(state.writes).toEqual([]);
    r.up(70); r.frame(.8);
    expect(r.styles.get('--theme-preview-weight')).toBe('80%');
    r.settle();
    expect(state.writes).toEqual(['dark']);
    expect(r.styles.has('--theme-preview-weight')).toBe(false);
    expect(r.styles.has('--paper')).toBe(false);
  });

  it('反向拖动也连续变亮，头部颜色从墨绿退回橙色', async () => {
    const r = await run('dark');
    r.down(100); r.move(60); r.frame(.6);
    const middle = r.scene.jellyColor;
    r.move(20); r.frame(.2);
    expect(r.styles.get('--theme-preview-weight')).toBe('20%');
    expect(r.scene.jellyColor.x).toBeGreaterThan(middle.x);
    expect(state.writes).toEqual([]);
    r.up(20); r.settle();
    expect(state.writes).toEqual(['light']);
  });

  it('点按和空白处挪动不进入渐变', async () => {
    const r = await run();
    r.down(0); r.up(0); r.frame(.5);
    expect(r.styles.size).toBe(0);
    r.settle(); expect(state.writes).toEqual(['dark']);
    r.down(50, false); r.move(80); r.frame(.7); r.up(80);
    expect(r.styles.size).toBe(0);
    expect(state.writes).toEqual(['dark']);
  });

  it('取消拖动会移除中间态，不保存半途主题', async () => {
    const r = await run();
    r.down(0); r.move(50); r.frame(.5); r.cancel();
    expect(r.styles.has('--paper')).toBe(false);
    expect(r.styles.has('--theme-preview-weight')).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('拖动吸附途中重新点按，不沿用上一轮渐变', async () => {
    const r = await run();
    r.down(0); r.move(70); r.frame(.7); r.up(70);
    r.down(70); r.up(70); r.frame(.8);
    expect(r.styles.size).toBe(0);
    expect(state.writes).toEqual([]);
    r.settle();
    expect(state.writes).toEqual(['dark']);
  });

  it('拖出后拉回起点仍算拖动，不误当点按切到另一端', async () => {
    const r = await run();
    r.down(0); r.move(70); r.frame(.7); r.move(0); r.up(0);
    r.frame(.1); r.settle();
    expect(state.writes).toEqual([]);
    expect(r.events.snapTo.mock.calls[0][0]).toBe(0);
    expect(r.styles.size).toBe(0);
  });

  it('减少动态效果时不生成中间态', async () => {
    const r = await run('light', true);
    r.down(0); r.move(70); r.frame(.7); r.up(70);
    expect(r.styles.size).toBe(0);
    expect(state.writes).toEqual(['dark']);
  });
});
