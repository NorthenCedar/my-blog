/** 执行真实控制器，WebGL 场景是测试边界；覆盖手机初始化与断点切换。 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), start: vi.fn(), stop: vi.fn() }));
vi.mock('../src/scripts/fin-scene', () => ({ createFinScene: mocks.create }));
vi.mock('../src/scripts/rl-core', () => ({
  createActivityGate: () => ({ onScreen: true, visible: true, dispose: vi.fn() }),
  startLoop: mocks.start,
}));

let init: typeof import('../src/scripts/fin-infinity').initFinInfinity;
beforeAll(async () => {
  vi.stubGlobal('document', { querySelector: () => null });
  init = (await import('../src/scripts/fin-infinity')).initFinInfinity;
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => {
  mocks.create.mockReset(); mocks.start.mockReset(); mocks.stop.mockReset();
  mocks.start.mockReturnValue(mocks.stop);
});

function harness({ mobile = false, reduce = false } = {}) {
  const media = (matches: boolean) => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const narrow = media(mobile), motion = media(reduce);
  const listeners = new Map<string, (event: unknown) => void>();
  const staticLayer = {
    hidden: false,
    setAttribute() { this.hidden = true; },
    removeAttribute() { this.hidden = false; },
  };
  const host = { classList: { add: vi.fn(), remove: vi.fn() }, getBoundingClientRect: () => ({ width: 640, height: 400 }) };
  const view = { hidden: true };
  const makeCanvas = (events = new Map<string, (event: unknown) => void>()): object => ({
    addEventListener: (name: string, handler: (event: unknown) => void) => events.set(name, handler),
    cloneNode: vi.fn(() => makeCanvas()), replaceWith: vi.fn(),
  });
  const canvas = makeCanvas(listeners);
  const nodes = { '[data-fin-infinity]': host, '[data-fin-view]': view, '[data-fin-cv]': canvas, '[data-fin-static]': staticLayer };
  const root = { querySelector: (selector: keyof typeof nodes) => nodes[selector] };
  const scene = { resize: vi.fn(), playAssemble: vi.fn(), setPalette: vi.fn(), setDenied: vi.fn(), dispose: vi.fn(), render: vi.fn() };
  mocks.create.mockResolvedValue(scene);
  vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('matchMedia', (query: string) => query.includes('max-width') ? narrow : motion);
  vi.stubGlobal('WebGLRenderingContext', class {});
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#eeeeee' }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('addEventListener', vi.fn());
  vi.stubGlobal('removeEventListener', vi.fn());
  const start = () => init(root as unknown as HTMLElement);
  const change = (mobile: boolean) => {
    narrow.matches = mobile;
    for (const [name, listener] of narrow.addEventListener.mock.calls) if (name === 'change') listener();
  };
  return { start, change, staticLayer, view, canvas, listeners, scene, narrow, motion };
}

describe('关于页静态背景与动态场景的互斥', () => {
  it('手机首次打开保留静态背景，并且不启动帧循环或三维场景', async () => {
    const h = harness({ mobile: true });
    h.start();
    await vi.dynamicImportSettled();
    expect(h.staticLayer.hidden).toBe(false);
    expect(h.view.hidden).toBe(true);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('桌面缩到手机时恢复静态背景并释放三维资源', async () => {
    const h = harness(); h.start();
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    await vi.dynamicImportSettled();
    expect(h.staticLayer.hidden).toBe(true);
    h.change(true);
    expect(h.staticLayer.hidden).toBe(false);
    expect(h.view.hidden).toBe(true);
    expect(h.scene.dispose).toHaveBeenCalledOnce();
    expect(mocks.stop).toHaveBeenCalled();
  });

  it('手机收到 WebGL 恢复事件也不会隐藏静态背景', () => {
    const h = harness({ mobile: true }); h.start();
    h.listeners.get('webglcontextrestored')?.({});
    expect(h.staticLayer.hidden).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('减少动态效果时收到恢复事件仍只显示静态背景', () => {
    const h = harness({ reduce: true }); h.start();
    h.listeners.get('webglcontextrestored')?.({});
    expect(h.staticLayer.hidden).toBe(false);
    expect(h.view.hidden).toBe(true);
  });

  it('异步场景尚未就绪就缩为手机，迟到结果只释放、不覆盖静态背景', async () => {
    const h = harness();
    let complete!: (value: typeof h.scene) => void;
    mocks.create.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    h.start();
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    h.change(true); complete(h.scene);
    await vi.dynamicImportSettled();
    expect(h.staticLayer.hidden).toBe(false);
    expect(h.scene.dispose).toHaveBeenCalledOnce();
    expect(h.view.hidden).toBe(true);
  });

  it('桌面场景释放后恢复宽屏使用新画布，旧画布的上下文事件不干扰新场景', async () => {
    const h = harness();
    let lost = false;
    h.scene.dispose.mockImplementation(() => { lost = true; });
    mocks.create.mockImplementation(async target => {
      if (target === h.canvas && lost) throw new Error('已释放的 WebGL 上下文不能直接复用');
      return h.scene;
    });
    h.start();
    await vi.dynamicImportSettled();
    expect(h.staticLayer.hidden).toBe(true);
    h.change(true); h.change(false);
    await vi.dynamicImportSettled();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls[1][0]).not.toBe(h.canvas);
    expect(h.staticLayer.hidden).toBe(true);
    h.listeners.get('webglcontextlost')?.({ preventDefault() {} });
    expect(h.staticLayer.hidden, '旧画布迟到的 lost 事件不能停用新场景').toBe(true);
  });
});
