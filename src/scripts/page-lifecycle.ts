/** 页面替换时只保留播放器；其余控制器的监听、计时器和观察器随页面销毁。 */
type Cleanup = () => void;
export function createPageScope(win: Window & typeof globalThis, doc: Document) {
  let live = true;
  const cleanups = new Set<Cleanup>();
  const timers = new Map<number, Cleanup>();
  const frames = new Map<number, Cleanup>();
  const idleCallbacks = new Map<number, Cleanup>();
  const keep = (off: Cleanup) => { if (live) cleanups.add(off); else off(); return off; };
  const listen = (target: EventTarget, type: string, listener: any, options?: any) => {
    if (!live) return;
    target.addEventListener(type, listener, options);
    keep(() => { target.removeEventListener(type, listener, options); if (type === 'beforeunload' && typeof listener === 'function') listener(new Event('beforeunload')); });
  };
  const targets = new WeakMap<object, any>();
  const wrapTarget = <T extends object>(target: T): T => {
    if (targets.has(target)) return targets.get(target);
    const proxy = new Proxy(target, { get(t, key) {
      if (key === 'addEventListener') return (type: string, fn: any, opts?: any) => listen(t as EventTarget, type, fn, opts);
      if (key === 'defaultView') return scopedWindow;
      if (t === win && key in api) return api[key as keyof typeof api];
      const value = Reflect.get(t, key, t);
      return typeof value === 'function' && !/^[A-Z]/.test(String(key)) ? value.bind(t) : value;
    }, set(t, key, value) { if (String(key).startsWith('on')) keep(() => Reflect.set(t,key,null)); return live && Reflect.set(t,key,value); }});
    targets.set(target, proxy); return proxy;
  };
  const forget = (pending: Map<number, Cleanup>, id: number | undefined) => {
    if (id === undefined) return;
    const off = pending.get(id);
    if (off) cleanups.delete(off);
    pending.delete(id);
  };
  const track = (pending: Map<number, Cleanup>, id: number, off: Cleanup) => {
    pending.set(id, keep(off));
    return id;
  };
  const clearTimeout = win.clearTimeout?.bind(win) ?? globalThis.clearTimeout;
  const clearInterval = win.clearInterval?.bind(win) ?? globalThis.clearInterval;
  const cancelFrame = win.cancelAnimationFrame?.bind(win) ?? globalThis.cancelAnimationFrame;
  const requestFrame = win.requestAnimationFrame?.bind(win) ?? globalThis.requestAnimationFrame;
  const setTimeout = win.setTimeout?.bind(win) ?? globalThis.setTimeout;
  const setInterval = win.setInterval?.bind(win) ?? globalThis.setInterval;
  const later = (repeat: boolean, fn: TimerHandler, delay?: number, ...args: any[]) => {
    if (!live) return 0;
    const schedule = repeat ? setInterval : setTimeout;
    const id = schedule(() => {
      if (!repeat) forget(timers, id);
      if (live && typeof fn === 'function') fn(...args);
    }, delay);
    return track(timers, id, () => (repeat ? clearInterval : clearTimeout)(id));
  };
  const observe = <T extends typeof ResizeObserver | typeof IntersectionObserver | typeof MutationObserver>(Base: T): T => Base && new Proxy(Base, {
    construct(Ctor, args) { const observer = Reflect.construct(Ctor, args); keep(() => observer.disconnect()); return observer; },
  });
  const api = {
    addEventListener: (type: string, fn: any, opts?: any) => listen(win, type, fn, opts),
    removeEventListener: (win.removeEventListener ?? globalThis.removeEventListener)?.bind(win),
    matchMedia: (query: string) => wrapTarget((win.matchMedia ?? globalThis.matchMedia)(query)),
    requestAnimationFrame: (fn: FrameRequestCallback) => {
      if (!live) return 0;
      const id = requestFrame(now => {
        forget(frames, id);
        if (live) fn(now);
      });
      return track(frames, id, () => cancelFrame(id));
    },
    cancelAnimationFrame: (id: number) => { forget(frames, id); cancelFrame(id); },
    setTimeout: (fn: TimerHandler, ms?: number, ...args: any[]) => later(false, fn, ms, ...args),
    clearTimeout: (id?: number) => { forget(timers, id); clearTimeout(id); },
    setInterval: (fn: TimerHandler, ms?: number, ...args: any[]) => later(true, fn, ms, ...args),
    clearInterval: (id?: number) => { forget(timers, id); clearInterval(id); },
    requestIdleCallback: typeof win.requestIdleCallback === 'function'
      ? (fn: IdleRequestCallback, options?: IdleRequestOptions) => {
          if (!live) return 0;
          const id = win.requestIdleCallback(deadline => {
            forget(idleCallbacks, id);
            if (live) fn(deadline);
          }, options);
          return track(idleCallbacks, id, () => win.cancelIdleCallback(id));
        }
      : undefined,
    cancelIdleCallback: typeof win.cancelIdleCallback === 'function'
      ? (id: number) => { forget(idleCallbacks, id); win.cancelIdleCallback(id); }
      : undefined,
    ResizeObserver: observe(win.ResizeObserver ?? globalThis.ResizeObserver),
    IntersectionObserver: observe(win.IntersectionObserver ?? globalThis.IntersectionObserver),
    MutationObserver: observe(win.MutationObserver ?? globalThis.MutationObserver),
  };
  const scopedWindow = wrapTarget(win);
  return { ...api, window: scopedWindow, document: wrapTarget(doc), keep,
    dispose() {
      if (!live) return;
      live = false;
      for (const off of cleanups) {
        try { off(); }
        catch (error) { win.console.error('页面资源清理失败', error); }
      }
      cleanups.clear();
      timers.clear();
      frames.clear();
      idleCallbacks.clear();
    },
  };
}
type Scope = ReturnType<typeof createPageScope>;
const mounts = new Set<{ init: (scope: Scope) => void | Cleanup; selector?: string; generation?:number }>();
let ready = true;
let generation = 0;
let scopes: Scope[] = [];
export function onPage(init: (scope: Scope) => void | Cleanup, selector?: string) {
  const mount = { init, selector }; mounts.add(mount);
  if (ready && typeof document !== 'undefined') run(mount);
}
function run(mount: { init: (scope: Scope) => void | Cleanup; selector?: string; generation?:number }) {
  const {init,selector}=mount;
  if(mount.generation===generation)return;
  mount.generation=generation;
  if (selector && !document.querySelector(selector)) return;
  const scope = createPageScope(window, document);
  try {
    const off = init(scope);
    if (typeof off === 'function') scope.keep(off);
    scopes.push(scope);
  } catch (error) {
    scope.dispose();
    console.error('页面初始化失败', selector, error);
  }
}
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('astro:before-swap', () => {
    ready = false; generation++;
    // 兼容已有页面控制器的 GPU、灯箱清理；播放器识别标记并继续播放。
    const leave = new PageTransitionEvent('pagehide');
    Object.defineProperty(leave, 'astroNavigation', { value: true });
    window.dispatchEvent(leave);
    for (const scope of scopes) scope.dispose(); scopes = [];
  });
  document.addEventListener('astro:page-load', () => { ready = true; for (const mount of mounts) run(mount); });
}
