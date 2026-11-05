/** 页面替换时只保留播放器；其余控制器的监听、计时器和观察器随页面销毁。 */
type Cleanup = () => void;
export function createPageScope(win: Window & typeof globalThis, doc: Document) {
  let live = true;
  const cleanups = new Set<Cleanup>();
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
  const later = (repeat: boolean, fn: TimerHandler, delay?: number, ...args: any[]) => {
    if (!live) return 0;
    let off: Cleanup;
    const id = (repeat ? (win.setInterval ?? globalThis.setInterval) : (win.setTimeout ?? globalThis.setTimeout))(() => { if (!repeat) cleanups.delete(off); if (live && typeof fn === 'function') fn(...args); }, delay);
    off = keep(() => (repeat ? (win.clearInterval ?? globalThis.clearInterval) : (win.clearTimeout ?? globalThis.clearTimeout))(id)); return id;
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
      let off: Cleanup;
      const id = (win.requestAnimationFrame ?? globalThis.requestAnimationFrame)(now => { cleanups.delete(off); if (live) fn(now); });
      off = keep(() => (win.cancelAnimationFrame ?? globalThis.cancelAnimationFrame)(id)); return id;
    },
    cancelAnimationFrame: (win.cancelAnimationFrame ?? globalThis.cancelAnimationFrame)?.bind(win),
    setTimeout: (fn: TimerHandler, ms?: number, ...args: any[]) => later(false, fn, ms, ...args),
    clearTimeout: (win.clearTimeout ?? globalThis.clearTimeout)?.bind(win),
    setInterval: (fn: TimerHandler, ms?: number, ...args: any[]) => later(true, fn, ms, ...args),
    clearInterval: (win.clearInterval ?? globalThis.clearInterval)?.bind(win),
    requestIdleCallback: (fn: IdleRequestCallback, options?: IdleRequestOptions) => {
      if (!live) return 0;
      const id = win.requestIdleCallback(deadline => { if (live) fn(deadline); }, options);
      keep(() => win.cancelIdleCallback(id)); return id;
    },
    ResizeObserver: observe(win.ResizeObserver ?? globalThis.ResizeObserver),
    IntersectionObserver: observe(win.IntersectionObserver ?? globalThis.IntersectionObserver),
    MutationObserver: observe(win.MutationObserver ?? globalThis.MutationObserver),
  };
  const scopedWindow = wrapTarget(win);
  return { ...api, window: scopedWindow, document: wrapTarget(doc), keep,
    dispose() { if (!live) return; live = false; for (const off of cleanups) off(); cleanups.clear(); },
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
  const scope = createPageScope(window, document); scopes.push(scope);
  const off = init(scope); if (typeof off === 'function') scope.keep(off);
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
