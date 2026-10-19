import { afterEach, describe, expect, it, vi } from 'vitest';

// 保留真实控制器与窗口事件入口，仅把 GPU 场景换成可观察的边界。
const state = vi.hoisted(() => ({ scene: null as any }));
vi.mock('../src/scripts/fin-scene', () => ({ createFinScene: async () => state.scene }));
vi.mock('../src/scripts/rl-core', () => ({
  createActivityGate: () => ({ onScreen: true, visible: true, dispose() {} }),
  startLoop: () => () => {},
}));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

async function run() {
  const events = new Map<string, (e: any) => void>();
  const classes = new Set<string>();
  const host = {
    classList: { add: (v: string) => classes.add(v), remove: (v: string) => classes.delete(v) },
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 1000, height: 600 }),
  };
  const elements = {
    '[data-fin-infinity]': host,
    '[data-fin-view]': { hidden: true },
    '[data-fin-cv]': { addEventListener() {}, getBoundingClientRect: host.getBoundingClientRect },
    '[data-fin-static]': { setAttribute() {}, removeAttribute() {} },
  };
  const scene = state.scene = {
    // 这个返回值代表场景按当前可见几何给出的命中结果。
    hitTest: vi.fn(() => false), pulse: vi.fn(), resize: vi.fn(),
    setDenied() {}, setPalette() {}, setPointer() {}, playAssemble() {}, dispose() {},
  };
  let selection = '';
  vi.stubGlobal('document', { querySelector: () => null, documentElement: { classList: { contains: () => false } } });
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#ffffff' }));
  vi.stubGlobal('getSelection', () => selection);
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('WebGLRenderingContext', class {});
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('addEventListener', (name: string, fn: (e: any) => void) => events.set(name, fn));
  vi.stubGlobal('removeEventListener', (name: string) => events.delete(name));
  const { initFinInfinity } = await import('../src/scripts/fin-infinity');
  initFinInfinity({ querySelector: (name: keyof typeof elements) => elements[name] } as any);
  await vi.waitFor(() => expect(scene.resize).toHaveBeenCalled());
  return {
    scene,
    select: () => { selection = '选中的正文'; },
    click(x: number, y: number, control = false, extra = {}) {
      events.get('pointerdown')?.({ clientX: x, clientY: y, button: 0, isPrimary: true,
        target: { closest: () => control ? {} : null }, ...extra });
    },
  };
}

describe('关于页无限环 · 只响应模型命中', () => {
  it('画布内的空白与环内孔洞不触发脉冲', async () => {
    const r = await run();
    r.click(120, 80);
    r.click(600, 350);
    expect(r.scene.pulse).not.toHaveBeenCalled();
    expect(r.scene.hitTest).toHaveBeenCalledTimes(2);
  });

  it('命中可见鳍片后才触发，传入按画布位置归一化的坐标', async () => {
    const r = await run();
    r.scene.hitTest.mockReturnValue(true);
    r.click(850, 200);
    expect(r.scene.hitTest).toHaveBeenCalledWith(0.5, 0.5);
    expect(r.scene.pulse).toHaveBeenCalledExactlyOnceWith(0.25);
  });

  it('画布外的页面空白不会触发，也不执行 GPU 命中检查', async () => {
    const r = await run();
    r.scene.hitTest.mockReturnValue(true);
    r.click(10, 10);
    expect(r.scene.pulse).not.toHaveBeenCalled();
    expect(r.scene.hitTest).not.toHaveBeenCalled();
  });

  it.each(['链接', '选字', '右键', '非主指针'])('%s 不触发脉冲', async mode => {
    const r = await run();
    r.scene.hitTest.mockReturnValue(true);
    if (mode === '选字') r.select();
    r.click(850, 200, mode === '链接', mode === '右键' ? { button: 2 } : mode === '非主指针' ? { isPrimary: false } : {});
    expect(r.scene.pulse).not.toHaveBeenCalled();
    expect(r.scene.hitTest).not.toHaveBeenCalled();
  });
});
