import { unwrapPage } from './page-controller-source';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { describe, it, expect } from 'vitest';

// 执行真实控制器，仅替代 DOM/时钟。验证事件状态，不冒充浏览器布局和原生手势验收。
const core = readFileSync('src/scripts/album-scene-core.ts', 'utf8').replace(/^export /gm, '');
const controller = unwrapPage(readFileSync('src/scripts/album-scene.ts', 'utf8')).replace(/^import .*\r?\n/gm, '');
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
    getBoundingClientRect() { return { left: 120, top: 80, width: this.clientWidth, height: this.clientHeight }; }
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
  const names = ['viewport', 'world', 'toggle', 'prev', 'next', 'controls', 'status', 'help', 'home', 'zoom-in', 'zoom-out'];
  const elements = Object.fromEntries(names.map((name) => [name, new Element()]));
  const toggleLabel=new Element(),toggleIcon=new Element();
  elements.toggle.append(toggleIcon,toggleLabel);
  elements.toggle.querySelector=selector=>selector==='[data-scene-toggle-label]'?toggleLabel:null;
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
  return { root, wall, figures, links, title, elements, toggleLabel, toggleIcon, emit, media, frame, pendingFrames: () => frames.size };
}

describe('真实相册控制器事件回归', () => {
  it('直接照片墙保留原 DOM 和原生滚动，不启动散片或切片控制器',()=>{
    const s=setup('wall',false,3);
    expect(s.root.classes.has('scene-on')).toBe(false);
    expect(s.figures.every(figure=>s.wall.contains(figure))).toBe(true);
    expect(s.elements.viewport.handlers.size).toBe(0);
    expect(s.pendingFrames()).toBe(0);
    const wheel=s.emit(s.elements.viewport,'wheel',{deltaX:0,deltaY:100,deltaMode:0});
    expect(wheel.defaultPrevented).toBe(false);
  });
  it('散片默认接受单指上下拖动，松手沿纵向继续滑行', () => {
    for (const dy of [-120, 120]) {
      const s = setup();
      s.emit(s.elements.viewport, 'pointerdown', { pointerType: 'touch', clientX: 200, clientY: 400, timeStamp: 0 });
      const move = s.emit(s.elements.viewport, 'pointermove', { pointerType: 'touch', clientX: 200, clientY: 400 + dy, timeStamp: 100 });
      expect(move.defaultPrevented).toBe(true);
      expect(s.elements.world.values.get('--scene-pan-y')).toBe(`${dy}px`);
      expect(s.elements.world.values.get('--scene-pan-x')).toBe('0px');
      s.emit(s.elements.viewport, 'pointerup', { pointerType: 'touch', timeStamp: 110 });
      s.frame();
      expect(Number.parseFloat(s.elements.world.values.get('--scene-pan-y')!) * Math.sign(dy)).toBeGreaterThan(120);
    }
  });
  it('散片单指横拖和斜拖保留两个方向的实际位移', () => {
    for (const [dx, dy] of [[120, 0], [-120, -60], [60, 120]]) {
      const s = setup();
      s.emit(s.elements.viewport, 'pointerdown', { pointerType: 'touch', clientX: 200, clientY: 400 });
      s.emit(s.elements.viewport, 'pointermove', { pointerType: 'touch', clientX: 200 + dx, clientY: 400 + dy, timeStamp: 50 });
      expect(s.elements.world.values.get('--scene-pan-x')).toBe(`${dx}px`);
      expect(s.elements.world.values.get('--scene-pan-y')).toBe(`${dy}px`);
    }
  });
  it('系统取消单指拖动后停止惯性，遗留点击不打开照片', () => {
    const s = setup(); let opens = 0;
    s.links[0].addEventListener('click', () => { opens++; });
    s.emit(s.elements.viewport, 'pointerdown', { pointerType: 'touch', clientX: 200, clientY: 400 });
    s.emit(s.elements.viewport, 'pointermove', { pointerType: 'touch', clientX: 200, clientY: 280, timeStamp: 50 });
    expect(s.elements.world.values.get('--scene-pan-y')).toBe('-120px');
    s.emit(s.elements.viewport, 'pointercancel', { pointerType: 'touch', timeStamp: 60 });
    s.emit(s.elements.viewport, 'pointermove', { pointerType: 'touch', clientX: 200, clientY: 150, timeStamp: 80 });
    for (let i = 0; i < 10; i++) s.frame();
    expect(s.elements.world.values.get('--scene-pan-y')).toBe('-120px');
    expect(s.elements.viewport.classes.has('dragging')).toBe(false);
    expect(s.pendingFrames()).toBe(0);
    expect(s.emit(s.links[0], 'click').defaultPrevented).toBe(true);
    expect(opens).toBe(0);
  });
  it('轻触照片不平移画布或吞掉灯箱点击', () => {
    const s = setup(); let opens = 0;
    s.links[0].addEventListener('click', () => { opens++; });
    s.emit(s.links[0], 'pointerdown', { pointerType: 'touch', clientX: 200, clientY: 400 });
    s.emit(s.links[0], 'pointermove', { pointerType: 'touch', clientX: 202, clientY: 402, timeStamp: 50 });
    s.emit(s.links[0], 'pointerup', { pointerType: 'touch', timeStamp: 60 });
    expect(s.emit(s.links[0], 'click').defaultPrevented).toBe(false);
    expect(opens).toBe(1);
    expect(s.elements.world.values.get('--scene-pan-y')).toBe('0px');
  });
  it('触屏从照片交接指针捕获给画布时，子元素的失去捕获事件不会中断拖动', () => {
    const s = setup();
    s.emit(s.links[0], 'pointerdown', { pointerType: 'touch', clientX: 200, clientY: 400 });
    s.emit(s.links[0], 'pointermove', { pointerType: 'touch', clientX: 200, clientY: 385, timeStamp: 50 });
    s.emit(s.links[0], 'lostpointercapture', { pointerType: 'touch', timeStamp: 60 });
    s.emit(s.elements.viewport, 'pointermove', { pointerType: 'touch', clientX: 200, clientY: 280, timeStamp: 100 });
    expect(s.elements.world.values.get('--scene-pan-y')).toBe('-120px');
    expect(s.elements.viewport.classes.has('dragging')).toBe(true);
    s.emit(s.elements.viewport, 'pointercancel', { pointerType: 'touch', timeStamp: 110 });
    expect(s.elements.viewport.classes.has('dragging')).toBe(false);
  });
  it('切片仍只响应单指横拖，纵向手势交还浏览器', () => {
    const s = setup('slices', false, 10);
    const before = s.figures[0].values.get('--scene-x');
    s.emit(s.elements.viewport, 'pointerdown', { pointerType: 'touch', clientX: 200, clientY: 400 });
    expect(s.emit(s.elements.viewport, 'pointermove', { pointerType: 'touch', clientX: 200, clientY: 280, timeStamp: 50 }).defaultPrevented).toBe(false);
    expect(s.figures[0].values.get('--scene-x')).toBe(before);
    s.emit(s.elements.viewport, 'pointerup', { pointerType: 'touch', timeStamp: 60 });
    s.emit(s.elements.viewport, 'pointerdown', { pointerType: 'touch', clientX: 200, clientY: 400 });
    expect(s.emit(s.elements.viewport, 'pointermove', { pointerType: 'touch', clientX: 80, clientY: 400, timeStamp: 100 }).defaultPrevented).toBe(true);
    expect(Number.parseFloat(s.figures[0].values.get('--scene-x')!)).toBeLessThan(0);
  });
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
  it('散片上滚放大、下滚缩小，偏离中心的鼠标位置对应世界坐标不变', () => {
    const s = setup();
    const scale = () => Number(s.elements.world.values.get('--scene-scale'));
    const initial = scale();
    const up = s.emit(s.links[0], 'wheel', { deltaX: 0, deltaY: -100, deltaMode: 0, clientX: 820, clientY: 580 });
    expect(up.defaultPrevented).toBe(true);
    expect(scale()).toBe(initial);
    s.frame();
    expect(scale()).toBeGreaterThan(initial);
    expect(scale()).toBeLessThan(initial * Math.exp(0.15));
    expect((200 - Number.parseFloat(s.elements.world.values.get('--scene-pan-x')!)) / scale()).toBeCloseTo(280);
    expect((100 - Number.parseFloat(s.elements.world.values.get('--scene-pan-y')!)) / scale()).toBeCloseTo(140);
    for (let i = 0; i < 60; i++) s.frame();
    s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: 100, deltaMode: 0, clientX: 820, clientY: 580 });
    s.frame();
    expect(scale()).toBeGreaterThan(initial);
    for (let i = 0; i < 60; i++) s.frame();
    expect(scale()).toBeCloseTo(initial);
    expect(Number.parseFloat(s.elements.world.values.get('--scene-pan-x')!)).toBeCloseTo(0);
    expect(s.pendingFrames()).toBe(0);
  });
  it('散片滚轮的像素、行和页单位产生相同缩放，单次异常大输入不突然跳到边界', () => {
    const scales = [[100, 0], [6.25, 1], [0.125, 2]].map(([deltaY, deltaMode]) => {
      const s = setup();
      s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY, deltaMode, clientX: 620, clientY: 480 });
      for (let i = 0; i < 60; i++) s.frame();
      return Number(s.elements.world.values.get('--scene-scale'));
    });
    expect(scales[0]).toBeLessThan(1000 / 1400);
    expect(scales[1]).toBeCloseTo(scales[0]);
    expect(scales[2]).toBeCloseTo(scales[0]);
    const s = setup();
    s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: -100000, deltaMode: 0, clientX: 620, clientY: 480 });
    for (let i = 0; i < 60; i++) s.frame();
    expect(Number(s.elements.world.values.get('--scene-scale'))).toBeGreaterThan(1000 / 1400);
    expect(Number(s.elements.world.values.get('--scene-scale'))).toBeLessThan(1);
  });
  it('散片滚轮与按钮共用 0.25 到 1.6 倍边界，回到中心恢复初始视野', () => {
    const s = setup();
    for (let i = 0; i < 40; i++) s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: -100, deltaMode: 0, clientX: 620, clientY: 480 });
    for (let i = 0; i < 60; i++) s.frame();
    expect(Number(s.elements.world.values.get('--scene-scale'))).toBe(1.6);
    s.emit(s.elements['zoom-in'], 'click');
    expect(Number(s.elements.world.values.get('--scene-scale'))).toBe(1.6);
    for (let i = 0; i < 40; i++) s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: 100, deltaMode: 0, clientX: 620, clientY: 480 });
    for (let i = 0; i < 60; i++) s.frame();
    expect(Number(s.elements.world.values.get('--scene-scale'))).toBe(0.25);
    s.emit(s.elements['zoom-out'], 'click');
    expect(Number(s.elements.world.values.get('--scene-scale'))).toBe(0.25);
    s.emit(s.elements.home, 'click');
    expect(Number(s.elements.world.values.get('--scene-scale'))).toBe(.25);
    s.frame();
    expect(Number(s.elements.world.values.get('--scene-scale'))).toBeGreaterThan(.25);
    for(let i=0;i<70;i++)s.frame();
    expect(Number(s.elements.world.values.get('--scene-scale'))).toBeCloseTo(1000 / 1400);
    expect(s.elements.world.values.get('--scene-pan-x')).toBe('0px');
  });
  it('Ctrl 和 Meta 滚轮不被两种场景拦截，散片横向或异常滚动也不缩放', () => {
    for (const layout of ['scatter', 'slices']) {
      const s = setup(layout);
      const before = new Map(s.elements.world.values);
      for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
        expect(s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: -100, deltaMode: 0, ...modifier }).defaultPrevented).toBe(false);
      }
      expect(s.elements.world.values).toEqual(before);
      expect(s.pendingFrames()).toBe(0);
    }
    const s = setup();
    const before = s.elements.world.values.get('--scene-scale');
    for (const deltaY of [0, NaN, Infinity]) {
      expect(s.emit(s.elements.viewport, 'wheel', { deltaX: 100, deltaY, deltaMode: 0 }).defaultPrevented).toBe(false);
    }
    expect(s.elements.world.values.get('--scene-scale')).toBe(before);
  });
  it('索引、减少动效和画布外滚轮不缩放，返回展览保留原倍率', () => {
    const s = setup();
    s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: -100, deltaMode: 0, clientX: 620, clientY: 480 });
    for (let i = 0; i < 60; i++) s.frame();
    const before = s.elements.world.values.get('--scene-scale');
    expect(s.emit(s.elements.home, 'wheel', { deltaY: -100, deltaMode: 0 }).defaultPrevented).toBe(false);
    s.emit(s.elements.toggle, 'click');
    expect(s.emit(s.elements.viewport, 'wheel', { deltaY: -100, deltaMode: 0 }).defaultPrevented).toBe(false);
    s.emit(s.elements.toggle, 'click');
    expect(s.elements.world.values.get('--scene-scale')).toBe(before);
    const reduced = setup('scatter', true);
    expect(reduced.emit(reduced.elements.viewport, 'wheel', { deltaY: -100, deltaMode: 0 }).defaultPrevented).toBe(false);
    expect(reduced.elements.world.values.has('--scene-scale')).toBe(false);
  });
  it('散片缩放停止拖动惯性，拖动进行中不接管滚轮', () => {
    const s = setup();
    s.emit(s.elements.viewport, 'pointerdown');
    s.emit(s.elements.viewport, 'pointermove', { clientX: 150, clientY: 80, timeStamp: 32 });
    expect(s.emit(s.elements.viewport, 'wheel', { deltaY: -100, deltaMode: 0 }).defaultPrevented).toBe(false);
    s.emit(s.elements.viewport, 'pointerup', { timeStamp: 40 });
    s.frame();
    expect(s.pendingFrames()).toBe(1);
    const scaleBefore = Number(s.elements.world.values.get('--scene-scale')!);
    s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: -100, deltaMode: 0, clientX: 620, clientY: 480 });
    for (let i = 0; i < 8; i++) s.frame(80);
    expect(Number(s.elements.world.values.get('--scene-scale')!)).toBeGreaterThan(scaleBefore);
    // 滚轮取消拖动惯性：只跑缩放收尾，落定后没有残留的滑行帧。
    expect(s.pendingFrames()).toBe(0);
  });
  it('停止输入后散片缩放自行收尾到目标并停下，异常滚动量也按帧缓动', () => {
    const s = setup();
    const scale = () => Number(s.elements.world.values.get('--scene-scale'));
    const initial = scale();
    s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: -120, deltaMode: 0, clientX: 620, clientY: 480 });
    s.frame();
    expect(scale()).toBeGreaterThan(initial);
    let previous = scale();
    let rises = 0;
    for (let i = 0; i < 60; i++) {
      s.frame(16);
      const now = scale();
      if (now > previous) rises++;
      previous = now;
    }
    expect(rises).toBeGreaterThan(5);
    expect(s.pendingFrames()).toBe(0);
    // 缩放按钮接管目标并平滑收尾，取消滚轮目标，不与缓动相互拉扯。
    s.emit(s.elements.viewport, 'wheel', { deltaX: 0, deltaY: -120, deltaMode: 0, clientX: 620, clientY: 480 });
    s.frame();
    s.emit(s.elements['zoom-out'], 'click');
    const clicked = scale();
    s.frame();
    expect(scale()).toBeLessThan(clicked);
    for (let i = 0; i < 70; i++) s.frame();
    expect(scale()).toBeCloseTo(clicked / 1.2, 3);
    expect(s.pendingFrames()).toBe(0);
    const fast = setup();
    fast.emit(fast.elements.viewport, 'wheel', { deltaX: 0, deltaY: -100000, deltaMode: 0, clientX: 620, clientY: 480 });
    fast.frame();
    expect(Number(fast.elements.world.values.get('--scene-scale'))).toBeLessThan(0.9642);
    for (let i = 0; i < 60; i++) fast.frame();
    // 单次异常大滚动量只走到封顶后的目标，不会一步冲到 1.6 的边界。
    expect(Number(fast.elements.world.values.get('--scene-scale'))).toBeCloseTo(0.9642, 3);
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

it('查看全部切换只更新文字，保留玻璃按钮中的图标',()=>{
  const s=setup();expect(s.toggleLabel.textContent).toBe('查看全部');
  s.emit(s.elements.toggle,'click');expect(s.toggleLabel.textContent).toBe('返回展览');
  expect(s.toggleIcon.parent).toBe(s.elements.toggle);
  s.emit(s.elements.toggle,'click');expect(s.toggleLabel.textContent).toBe('查看全部');
});

it('散片按钮连点累积目标，中间帧平滑移动，归位也保留过渡',()=>{
  const s=setup();const x=()=>parseFloat(s.elements.world.values.get('--scene-pan-x')!);
  s.emit(s.elements.prev,'click');s.emit(s.elements.prev,'click');
  expect(x()).toBe(0);s.frame();expect(x()).toBeGreaterThan(0);expect(x()).toBeLessThan(400);
  for(let i=0;i<80;i++)s.frame();expect(x()).toBe(400);expect(s.pendingFrames()).toBe(0);
  s.emit(s.elements.home,'click');expect(x()).toBe(400);s.frame();expect(x()).toBeLessThan(400);expect(x()).toBeGreaterThan(0);
  for(let i=0;i<80;i++)s.frame();expect(x()).toBe(0);expect(s.pendingFrames()).toBe(0);
});
it('切片回到第一张先移动中间帧，再落到初始位置',()=>{
  const s=setup('slices',false,10);const x=()=>parseFloat(s.figures[0].values.get('--scene-x')!);
  s.emit(s.elements.next,'click');for(let i=0;i<90;i++)s.frame();const moved=x();expect(moved).toBeLessThan(0);
  s.emit(s.elements.home,'click');expect(x()).toBe(moved);s.frame();expect(x()).toBeGreaterThan(moved);expect(x()).toBeLessThan(0);
  for(let i=0;i<90;i++)s.frame();expect(x()).toBe(0);expect(s.pendingFrames()).toBe(0);
});
