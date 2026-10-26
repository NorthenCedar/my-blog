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

function fixture(width = 1440, reduced = false) {
  const document = new EventTarget() as EventTarget & { activeElement?: Box; body?: Box; defaultView?: unknown };
  const desktop = Object.assign(new EventTarget(), { matches: width >= 768 });
  const reduce = Object.assign(new EventTarget(), { matches: reduced });
  const motions: { box: Box; motion: Motion }[] = [];
  class Box extends EventTarget {
    hidden = false;
    inert = false;
    attrs = new Map<string, string>();
    parent?: Box;
    children: Box[] = [];
    ownerDocument = document;
    style = { height: '' };
    dataset: Record<string, string> = {};
    classList = { toggle: () => {} };
    constructor(public height = 100) { super(); }
    setAttribute(key: string, value: string) { this.attrs.set(key, value); }
    getAttribute(key: string) { return this.attrs.get(key) ?? null; }
    removeAttribute(key: string) { this.attrs.delete(key); }
    contains(node: Box | null): boolean { return !!node && (node === this || this.children.some(child => child.contains(node))); }
    append(...boxes: Box[]) { boxes.forEach(box => { box.parent = this; this.children.push(box); }); }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return { height: this.hidden ? 0 : this.height }; }
    animate() {
      const motion = new Motion();
      motions.push({ box: this, motion });
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
    querySelector = (selector: string) => selector === '[data-log-panel]' ? panel : selector === '[data-log-close]' ? close : null;
    querySelectorAll = (selector: string) => selector === '[data-log-trigger]' ? triggers : selector === '[data-log-entry]' ? entries : [];
  }
  const root = new Box();
  const triggers = [new Box(), new Box(), new Box()];
  const entries = [new Box(240), new Box(520), new Box(320)];
  const panel = new Box(300);
  const close = new Box();
  const outside = new Box();
  document.body = new Box();
  panel.hidden = true;
  entries.forEach(entry => { entry.hidden = true; });
  panel.append(close, ...entries);
  root.append(...triggers, panel);
  document.defaultView = {
    matchMedia: (query: string) => query.includes('prefers-reduced-motion') ? reduce : desktop,
    getComputedStyle: () => ({ getPropertyValue: (key: string) => key.includes('dur') ? '260ms' : 'ease-out' }),
  };
  const dispose = init?.(root as unknown as HTMLElement);
  return { root, triggers, entries, panel, close, outside, document, motions, dispose,
    resize(mobile: boolean) { desktop.matches = !mobile; desktop.dispatchEvent(new Event('change')); },
    async finish() { motions.forEach(({ motion }) => motion.finish()); await Promise.resolve(); await Promise.resolve(); },
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

  it('点击内容不收起，点击外部收起且不抢走外部焦点', async () => {
    const view = fixture();
    view.triggers[0].click();
    view.entries[0].click();
    expect(view.panel.hidden).toBe(false);
    view.outside.focus();
    view.outside.click();
    await view.finish();
    expect(view.panel.hidden).toBe(true);
    expect(view.document.activeElement).toBe(view.outside);
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
    Object.defineProperty(view.panel, 'animate', { value: undefined });
    view.triggers[1].click();
    expect(view.panel.hidden).toBe(false);
    view.outside.click();
    expect(view.panel.hidden).toBe(true);
  });
});
