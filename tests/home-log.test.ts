import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

// 用原生事件边界执行真实控制器，不模拟展开/关闭逻辑。
let init: ((root: HTMLElement) => () => void) | undefined;
beforeAll(async () => {
  if (existsSync('src/scripts/home-log.ts')) init = (await import('../src/scripts/home-log')).initHomeLog;
});

class Motion {
  resolve!: () => void;
  reject!: () => void;
  finished = new Promise<void>((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
  cancelled = false;
  cancel() { this.cancelled = true; this.reject(); }
  finish() { this.resolve(); }
}

function fixture(width = 1440, reduced = false, nativeDialog = true) {
  const document = new EventTarget() as EventTarget & { activeElement?: Box; body?: Box; documentElement?: Box; defaultView?: unknown };
  const desktop = Object.assign(new EventTarget(), { matches: width >= 768 });
  const reduce = Object.assign(new EventTarget(), { matches: reduced });
  const motions: { box: Box; motion: Motion; frames: Keyframe[] }[] = [];
  class Box extends EventTarget {
    hidden = false;
    inert = false;
    open = false;
    queueClose = false;
    closeEvents: Event[] = [];
    className = '';
    visualTransform = '';
    attrs = new Map<string, string>();
    parent?: Box;
    children: Box[] = [];
    ownerDocument = document;
    style: Record<string, string> = { height: '', transform: '', opacity: '', borderRadius: '', overflowY: '' };
    dataset: Record<string, string> = {};
    classList = { toggle: () => {} };
    constructor(public height = 100, public left = 100, public top = 200, public width = 280) { super(); }
    setAttribute(key: string, value: string) { this.attrs.set(key, value); }
    getAttribute(key: string) { return this.attrs.get(key) ?? null; }
    removeAttribute(key: string) { this.attrs.delete(key); }
    contains(node: Box | null): boolean { return !!node && (node === this || this.children.some(child => child.contains(node))); }
    append(...boxes: Box[]) { boxes.forEach(box => { box.parent = this; this.children.push(box); }); }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return { height: this.hidden ? 0 : this.height, left: this.left, top: this.top, width: this.width }; }
    closest(selector: string): Box | null { return selector === '.card' ? this.className === 'card' ? this : this.parent?.closest(selector) ?? null : null; }
    showModal() { this.open = true; close.focus(); }
    close() { this.open = false; const event = new Event('close'); if (this.queueClose) this.closeEvents.push(event); else this.dispatchEvent(event); }
    animate(frames: Keyframe[]) {
      const motion = new Motion();
      motions.push({ box: this, motion, frames });
      return motion;
    }
    dispatch(type: string, props: Record<string, unknown> = {}) {
      const event = new Event(type, { cancelable: true, bubbles: true });
      Object.defineProperty(event, 'target', { value: this });
      Object.assign(event, props);
      let at: Box | undefined = this;
      while (at) { at.dispatchEvent(event); at = at.parent; }
      document.dispatchEvent(event);
      return event;
    }
    click() { return this.dispatch('click', { button: 0 }); }
    querySelector = (selector: string) => selector === '[data-log-panel]' ? panel : selector === '[data-log-close]' ? close
      : selector === '[data-log-sheet]' ? sheet : selector === '[data-log-surface]' ? surface
      : selector === '[data-log-content]' ? content : selector === '[data-log-shade]' ? shade : null;
    querySelectorAll = (selector: string) => selector === '[data-log-trigger]' ? triggers : selector === '[data-log-entry]' ? entries
      : selector === '[data-log-version]' ? versions : [];
  }
  const root = new Box();
  const triggers = [new Box(), new Box(), new Box()];
  const cards = triggers.map((trigger, i) => { const card = new Box(210, 80 + 310 * i, 400, 280); card.className = 'card'; card.append(trigger); return card; });
  const versions = [new Box(), new Box(), new Box()];
  const entries = [new Box(240), new Box(520), new Box(320)];
  const panel = new Box(300);
  const sheet = new Box(640, 304, 180, 832);
  const surface = new Box();
  const content = new Box();
  const shade = new Box();
  const close = new Box();
  const outside = new Box();
  document.body = new Box();
  document.documentElement = new Box();
  document.documentElement.style.overflowY = 'scroll';
  panel.hidden = true;
  entries.forEach(entry => { entry.hidden = true; });
  content.append(close, ...versions, ...entries);
  sheet.append(surface, content);
  panel.append(shade, sheet);
  root.append(...cards, panel);
  document.defaultView = Object.assign(new EventTarget(), {
    scrollX: 0,
    scrollY: 2000,
    scrollTo(position: ScrollToOptions) { this.scrollX = position.left ?? this.scrollX; this.scrollY = position.top ?? this.scrollY; },
    matchMedia: (query: string) => query.includes('prefers-reduced-motion') ? reduce : desktop,
    getComputedStyle: (box: Box) => ({ transform: box.visualTransform || box.style.transform || 'none', opacity: box.style.opacity || '1', borderRadius: box.style.borderRadius || '16px',
      getPropertyValue: (key: string) => key.includes('dur') ? '420ms' : 'ease-out' }),
  });
  if (!nativeDialog) Object.defineProperty(panel, 'showModal', { value: undefined });
  const dispose = init?.(root as unknown as HTMLElement);
  return { root, triggers, cards, versions, entries, panel, sheet, surface, content, shade, close, outside, document, motions, dispose,
    view: document.defaultView as { scrollY: number },
    resize(mobile: boolean) { desktop.matches = !mobile; desktop.dispatchEvent(new Event('change')); },
    async finish() { for (let i = 0; i < 16; i++) { motions.forEach(({ motion }) => motion.finish()); await Promise.resolve(); await Promise.resolve(); } },
  };
}

describe('电脑首页完整版本更新', () => {
  it('点击版本在当前页面展开对应完整条目，并标明展开状态', () => {
    const view = fixture();
    expect(view.triggers[1].click().defaultPrevented).toBe(true);
    expect(view.panel.hidden).toBe(false);
    expect(view.entries.map(entry => entry.hidden)).toEqual([true, false, true]);
    expect(view.triggers.map(link => link.getAttribute('aria-expanded'))).toEqual(['false', 'true', 'false']);
  });

  it('点击内容不收起，点击外部缩回并将焦点还给原卡片', async () => {
    const view = fixture();
    view.triggers[0].click();
    view.entries[0].click();
    expect(view.panel.hidden).toBe(false);
    view.outside.focus();
    view.outside.click();
    await view.finish();
    expect(view.panel.hidden).toBe(true);
    expect(view.document.activeElement).toBe(view.triggers[0]);
  });

  it('快速切换与关闭后立即重开，旧动画不覆盖最后选择', async () => {
    const view = fixture();
    view.triggers[0].click();
    view.outside.click();
    view.triggers[2].click();
    view.triggers[1].click();
    await view.finish();
    expect(view.entries.map(entry => entry.hidden)).toEqual([true, false, true]);
    expect(view.panel.hidden).toBe(false);
    expect(view.motions.some(({ motion }) => motion.cancelled)).toBe(true);
  });

  it('Esc 关闭并把键盘焦点还给当前版本', async () => {
    const view = fixture();
    view.triggers[1].click();
    view.close.focus();
    view.close.dispatch('keydown', { key: 'Escape' });
    await view.finish();
    expect(view.panel.hidden).toBe(true);
    expect(view.document.activeElement).toBe(view.triggers[1]);
  });

  it('收起按钮与再次点击同一版本都能关闭', async () => {
    const view = fixture();
    view.triggers[0].click();
    view.triggers[0].click();
    await view.finish();
    expect(view.panel.hidden).toBe(true);
    view.triggers[2].click();
    view.close.click();
    await view.finish();
    expect(view.panel.hidden).toBe(true);
  });

  it('手机保留真实日志链接，跨回手机立即关闭详情', () => {
    const phone = fixture(390);
    expect(phone.triggers[0].click().defaultPrevented).toBe(false);
    expect(phone.panel.hidden).toBe(true);
    expect(phone.triggers[0].getAttribute('role')).toBeNull();
    phone.resize(false);
    phone.triggers[0].click();
    expect(phone.panel.hidden).toBe(false);
    phone.resize(true);
    expect(phone.panel.hidden).toBe(true);
    expect(phone.triggers[0].getAttribute('aria-expanded')).toBeNull();
  });

  it('减少动态效果时即时切换，不创建动画', () => {
    const view = fixture(1440, true);
    view.triggers[0].click();
    view.triggers[2].click();
    expect(view.panel.hidden).toBe(false);
    view.outside.click();
    expect(view.panel.hidden).toBe(true);
    expect(view.motions).toHaveLength(0);
  });

  it('第3个版本阅读中跨回手机，焦点转到可见的第一张卡片', () => {
    const view = fixture();
    view.triggers[2].click();
    view.close.focus();
    view.resize(true);
    expect(view.panel.hidden).toBe(true);
    expect(view.document.activeElement).toBe(view.triggers[0]);
  });

  it('浏览器先因手机CSS隐藏详情而把焦点清回body，仍能恢复到可见卡片', () => {
    const view = fixture();
    view.triggers[2].click();
    view.close.focus();
    view.document.activeElement = view.document.body;
    view.resize(true);
    expect(view.document.activeElement).toBe(view.triggers[0]);
  });

  it('释放控制器后不再拦截导航或响应旧事件', async () => {
    const view = fixture();
    view.triggers[0].click();
    view.dispose?.();
    await view.finish();
    expect(view.panel.hidden).toBe(true);
    expect(view.triggers[1].click().defaultPrevented).toBe(false);
  });

  it('空格键可展开，带修饰键的点击仍保留原生新标签行为', () => {
    const view = fixture();
    expect(view.triggers[0].dispatch('keydown', { key: ' ' }).defaultPrevented).toBe(true);
    expect(view.panel.hidden).toBe(false);
    expect(view.triggers[1].dispatch('click', { button: 0, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(view.entries.map(entry => entry.hidden)).toEqual([false, true, true]);
  });

  it('浏览器不支持 Web Animations 时仍能展开和关闭', () => {
    const view = fixture();
    Object.defineProperty(view.surface, 'animate', { value: undefined });
    view.triggers[1].click();
    expect(view.panel.hidden).toBe(false);
    view.outside.click();
    expect(view.panel.hidden).toBe(true);
  });

  it('卡面从原卡片矩形放大，文字独立淡入，原位置仍占位', () => {
    const view = fixture();
    const before = view.cards[1].getBoundingClientRect();
    view.triggers[1].click();
    expect(view.panel.open).toBe(true);
    expect(view.cards[1].getAttribute('data-log-origin-hidden')).toBe('');
    expect(view.cards[1].getBoundingClientRect()).toEqual(before);
    expect(view.document.documentElement?.style.overflowY).toBe('hidden');
    const shape = view.motions.find(({ box }) => box === view.surface)!;
    expect(shape.frames[0].transform).toContain('scale(');
    expect(shape.frames[0].transform).toContain('translate(');
    expect(shape.frames.at(-1)?.transform).toBe('none');
    expect(view.motions.filter(({ box }) => box === view.content).every(({ frames }) => frames.every(frame => !String(frame.transform).includes('scale')))).toBe(true);
  });

  it('打开中途关闭，从当前变换接续反向缩回并恢复页面滚动', async () => {
    const view = fixture();
    view.triggers[0].click();
    view.surface.visualTransform = 'matrix(0.7, 0, 0, 0.8, 12, 20)';
    view.outside.click();
    const reversed = view.motions.filter(({ box }) => box === view.surface).at(-1)!;
    expect(reversed.frames[0].transform).toBe(view.surface.visualTransform);
    await view.finish();
    expect(view.panel.open).toBe(false);
    expect(view.cards[0].getAttribute('data-log-origin-hidden')).toBeNull();
    expect(view.document.documentElement?.style.overflowY).toBe('scroll');
  });

  it('放大层顶部版本入口可连续切换，旧版本缩回后从新原点放大', async () => {
    const view = fixture();
    view.triggers[0].click();
    await view.finish();
    view.versions[2].click();
    await view.finish();
    expect(view.entries.map(entry => entry.hidden)).toEqual([true, true, false]);
    expect(view.cards[0].getAttribute('data-log-origin-hidden')).toBeNull();
    expect(view.cards[2].getAttribute('data-log-origin-hidden')).toBe('');
    expect(view.versions[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('没有原生对话框能力时不拦截日志链接，也不锁住页面', () => {
    const view = fixture(1440, false, false);
    expect(view.triggers[0].click().defaultPrevented).toBe(false);
    expect(view.triggers[0].getAttribute('role')).toBeNull();
    expect(view.document.documentElement?.style.overflowY).toBe('scroll');
  });

  it('浏览器原生取消事件先阻止瞬间消失，再执行反向缩回', async () => {
    const view = fixture();
    view.triggers[0].click();
    expect(view.panel.dispatch('cancel').defaultPrevented).toBe(true);
    await view.finish();
    expect(view.panel.open).toBe(false);
    expect(view.document.documentElement?.style.overflowY).toBe('scroll');
  });

  it('动画中释放控制器也恢复滚动与原卡片，不留下原生模态层', async () => {
    const view = fixture();
    view.triggers[1].click();
    view.dispose?.();
    await view.finish();
    expect(view.panel.open).toBe(false);
    expect(view.panel.hidden).toBe(true);
    expect(view.cards.every(card => card.getAttribute('data-log-origin-hidden') === null)).toBe(true);
    expect(view.document.documentElement?.style.overflowY).toBe('scroll');
  });

  it('原生close事件尚未派发就重开，仍恢复最初的页面滚动值', async () => {
    const view = fixture(1440, true);
    view.triggers[0].click();
    view.panel.queueClose = true;
    view.panel.close();
    view.triggers[1].click();
    view.panel.closeEvents.forEach(event => view.panel.dispatchEvent(event));
    view.close.click();
    await view.finish();
    expect(view.document.documentElement?.style.overflowY).toBe('scroll');
    expect(view.panel.open).toBe(false);
  });

  it('模态期间原生聚焦或程序滚动改变背景位置，缩回后恢复打开前的位置', async () => {
    const view = fixture();
    view.triggers[0].click();
    view.view.scrollY = 2027;
    view.close.click();
    await view.finish();
    expect(view.view.scrollY).toBe(2000);
  });
});
