import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { describe, it, expect } from 'vitest';

// 执行真实控制器，仅替代 DOM/时钟。验证事件状态，不冒充浏览器布局和原生手势验收。
const core = readFileSync('src/scripts/album-scene-core.ts', 'utf8').replace(/^export /gm, '');
const controller = readFileSync('src/scripts/album-scene.ts', 'utf8').replace(/^import .*\r?\n/, '');
const code = transformSync(`${core}\n${controller}`, { loader: 'ts' }).code;

function setup(layout = 'scatter', reduced = false, count = 2) {
  type Handler = { fn: (event: any) => void; capture: boolean };
  let emit: (target: Element, type: string, fields?: Record<string, unknown>) => any;
  class Element {
    parent: Element | null = null;
    handlers = new Map<string, Handler[]>();
    values = new Map<string, string>();
    classes = new Set<string>();
    children: Element[] = [];
    dataset: Record<string, string> = {};
    style = { setProperty: (key: string, value: string) => this.values.set(key, value) };
    classList = {
      add: (...keys: string[]) => keys.forEach((key) => this.classes.add(key)),
      remove: (...keys: string[]) => keys.forEach((key) => this.classes.delete(key)),
      toggle: (key: string, on: boolean) => on ? this.classes.add(key) : this.classes.delete(key),
    };
    clientWidth = 1000;
    clientHeight = 800;
    hidden = false;
    inert = false;
    tabIndex = 0;
    textContent = '';
    querySelector: (selector: string) => any = () => null;
    querySelectorAll: (selector: string) => any[] = () => [];
    addEventListener(type: string, fn: Handler['fn'], options: any = false) {
      const handlers = this.handlers.get(type) ?? [];
      handlers.push({ fn, capture: options === true || options.capture === true });
      this.handlers.set(type, handlers);
    }
    setAttribute(key: string, value: string) { this.values.set(key, value); }
    getAttribute(key: string) { return this.values.get(key) ?? null; }
    removeAttribute(key: string) { this.values.delete(key); }
    append(...nodes: Element[]) {
      for (const node of nodes) {
        if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node);
        node.parent = this; this.children.push(node);
      }
    }
    prepend(node: Element) { this.append(node); this.children.unshift(this.children.pop()!); }
    after(node: Element) { this.parent!.append(node); }
    contains(node: Element) { for (let p: Element | null = node; p; p = p.parent) if (p === this) return true; return false; }
    focus() { emit(this, 'focusin'); }
    setPointerCapture() {}
    releasePointerCapture() {}
    hasPointerCapture() { return false; }
  }
  const doc = new Element();
  Object.assign(doc, { body: new Element() });
  const win = new Element();
  doc.parent = win;
  const root = new Element(); doc.append(root);
  const names = ['viewport', 'world', 'toggle', 'prev', 'next', 'touch', 'controls', 'status', 'help', 'home', 'zoom-in', 'zoom-out'];
  const elements = Object.fromEntries(names.map((name) => [name, new Element()]));
  const title = new Element();
  root.append(...Object.values(elements));
  elements.viewport.append(title, elements.world);
  const wall = new Element(); root.append(wall);
  const figures = Array.from({ length: count }, () => new Element());
  const links = Array.from({ length: count }, () => new Element());
  wall.append(...figures);
  figures.forEach((figure, i) => {
    figure.append(links[i]); figure.querySelector = () => links[i];
    const img = new Element(); links[i].append(img); links[i].querySelector = () => img;
  });
  wall.querySelectorAll = () => figures;
  root.dataset = { layout, placements: JSON.stringify(Array.from({ length: count }, (_, i) => ({ x: i ? -560 * i : 560, y: i * 430, angle: 0, depth: 0, width: 300 }))) };
  root.querySelector = (selector) => selector === '.wf' ? wall : selector === '.scene-title' ? title : elements[selector.slice(12, -1)];
  doc.querySelectorAll = () => [root];
  const media = new Element() as Element & { matches: boolean };
  media.matches = reduced;
  emit = (target, type, fields = {}) => {
    const path: Element[] = [];
    for (let el: Element | null = target; el; el = el.parent) path.push(el);
    let stopped = false;
    const event = {
      type, target, isPrimary: true, pointerType: 'mouse', button: 0, pointerId: 1,
      clientX: 0, clientY: 0, timeStamp: 16, cancelable: true, detail: 1,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { stopped = true; }, ...fields,
    };
    for (const capture of [true, false]) {
      for (const el of capture ? [...path].reverse() : path) {
        for (const handler of el.handlers.get(type) ?? []) {
          if (stopped) break;
          if (handler.capture === capture) handler.fn(event);
        }
      }
    }
    return event;
  };
  let now = 0;
  let frameId = 0;
  const frames = new Map<number, (time: number) => void>();
  runInNewContext(code, {
    document: doc, window: Object.assign(win, { setTimeout: () => 1 }),
    matchMedia: (query: string) => query.includes('reduced-motion') ? media : { matches: false },
    ResizeObserver: class { observe() {} }, cancelAnimationFrame(id: number) { frames.delete(id); },
    requestAnimationFrame(fn: (time: number) => void) { const id = ++frameId; frames.set(id, fn); return id; },
    clearTimeout() {}, performance: { now: () => now }, console,
  });
  const frame = (elapsed = 16) => {
    now += elapsed;
    const pending = Array.from(frames.values());
    frames.clear();
    pending.forEach((fn) => fn(now));
  };
  return { root, wall, figures, links, title, elements, emit, media, frame, pendingFrames: () => frames.size };
}

describe('真实相册控制器事件回归', () => {
  it('键盘平移后打开关闭灯箱，程序化归还焦点保持相机位置', () => {
    const s = setup();
    s.emit(s.elements.viewport, 'keydown', { key: 'Tab' }); s.links[0].focus();
    s.emit(s.links[0], 'keydown', { key: 'ArrowRight' });
    const before = s.elements.world.values.get('--scene-pan-x');
    s.emit(s.links[0], 'keydown', { key: 'Enter' });
    s.emit(s.elements.home, 'keydown', { key: 'Escape' }); // 灯箱焦点在 viewport 之外。
    s.links[0].focus();
    expect(s.elements.world.values.get('--scene-pan-x')).toBe(before);
  });
  it('从画布外的按钮反向 Tab 到离屏照片，也会把该照片带入视野', () => {
    const s = setup();
    s.emit(s.elements.prev, 'pointerdown'); s.emit(s.elements.prev, 'click');
    const before = s.elements.world.values.get('--scene-pan-x');
    s.emit(s.elements.prev, 'keydown', { key: 'Tab', shiftKey: true }); s.links[0].focus();
    expect(s.elements.world.values.get('--scene-pan-x')).not.toBe(before);
    expect(Number.parseFloat(s.elements.world.values.get('--scene-pan-x')!)).toBeLessThan(0);
  });
  it('拖动后的鼠标点击被抑制，键盘点击仍能到达照片链接', () => {
    const s = setup(); let opens = 0;
    s.links[0].addEventListener('click', () => { opens++; });
    s.emit(s.elements.viewport, 'pointerdown');
    s.emit(s.elements.viewport, 'pointermove', { clientX: 150, clientY: 80, timeStamp: 32 });
    s.emit(s.elements.viewport, 'pointerup');
    expect(s.emit(s.links[0], 'click').defaultPrevented).toBe(true);
    expect(opens).toBe(0);
    s.emit(s.links[0], 'click', { detail: 0 });
    expect(opens).toBe(1);
  });
  it('查看全部归还同一组照片，返回陈列不改变相机', () => {
    const s = setup();
    s.emit(s.elements.next, 'click');
    const before = s.elements.world.values.get('--scene-pan-x');
    s.emit(s.elements.toggle, 'click');
    expect(s.wall.parent).toBe(s.root);
    expect(s.root.classes.has('scene-on')).toBe(false);
    s.emit(s.elements.toggle, 'click');
    expect(s.wall.parent).toBe(s.elements.world);
    expect(s.elements.world.values.get('--scene-pan-x')).toBe(before);
  });
  it('首次减少动效只显示索引，取消设置后也可进入场景', () => {
    const s = setup('scatter', true);
    expect(s.root.classes.has('scene-on')).toBe(false);
    s.media.matches = false; s.emit(s.media, 'change');
    expect(s.root.classes.has('scene-on')).toBe(true);
  });
  it('切片响应纵向滚轮并持续滑行，上滚反向，边缘照片从透明处进入', () => {
    const s = setup('slices', false, 10);
    expect(s.figures[4].getAttribute('aria-hidden')).toBe('true');
    const down = s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: 100, deltaMode: 0 });
    expect(down.defaultPrevented).toBe(true);
    s.frame(16);
    const first = Number.parseFloat(s.figures[0].values.get('--scene-x')!);
    s.frame(80);
    const coasting = Number.parseFloat(s.figures[0].values.get('--scene-x')!);
    expect(coasting).toBeLessThan(first);
    s.frame(80);
    s.frame(80);
    expect(Number.parseFloat(s.figures[4].values.get('--scene-opacity')!)).toBeGreaterThan(0);
    expect(s.figures[4].getAttribute('aria-hidden')).toBe('false');
    const beforeUp = Number.parseFloat(s.figures[0].values.get('--scene-x')!);
    s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: -100, deltaMode: 0 });
    s.frame(80);
    expect(Number.parseFloat(s.figures[0].values.get('--scene-x')!)).toBeGreaterThan(beforeUp);
  });
  it('触控板的极小正负滚动量也能结束动画，不留下空转帧', () => {
    for (const deltaY of [1, -1]) {
      const s = setup('slices', false, 10);
      s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY, deltaMode: 0 });
      for (let i = 0; i < 180; i++) s.frame();
      expect(s.pendingFrames()).toBe(0);
    }
  });
  it('惯性期间键盘打开照片时立即停住，灯箱归还焦点后位置不变', () => {
    const s = setup('slices', false, 10);
    let opens = 0;
    s.links[0].addEventListener('click', () => { opens++; s.elements.home.focus(); });
    s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: 200, deltaMode: 0 });
    s.frame();
    const before = s.figures[0].values.get('--scene-x');
    s.emit(s.links[0], 'click', { detail: 0 });
    for (let i = 0; i < 20; i++) s.frame();
    s.links[0].focus();
    expect(opens).toBe(1);
    expect(s.figures[0].values.get('--scene-x')).toBe(before);
    expect(s.figures[0].inert).toBe(false);
    expect(s.pendingFrames()).toBe(0);
  });
});
