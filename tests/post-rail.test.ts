import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

let init: ((doc: Document, onActive?: (link: HTMLAnchorElement, changed: boolean) => void) => () => void) | undefined;
beforeAll(async () => {
  if (existsSync('src/scripts/post-rail.ts')) init = (await import('../src/scripts/post-rail')).initPostRail;
});

function fixture(clipboard: 'ok' | 'denied' | 'absent' = 'ok', onActive?: (link: HTMLAnchorElement, changed: boolean, snap?: boolean) => void, showShip = false) {
  const animations: { element: Box; keyframes: Keyframe[]; finish: () => void; cancelled: boolean; duration?: number }[] = [];
  const jumps: { target: Box; behavior?: ScrollBehavior }[] = [];
  let focused: Box | undefined;
  class Box extends EventTarget {
    hidden = true;
    disabled = false;
    textContent = '复制链接';
    attrs = new Map<string, string>();
    children = new Map<string, Box>();
    top = 0;
    getAttribute(name: string) { return this.attrs.get(name) ?? null; }
    get hash() { return this.attrs.get('href') ?? ''; }
    get href() { return this.hash; }
    hasAttribute(name: string) { return this.attrs.has(name); }
    setAttribute(name: string, value: string) { this.attrs.set(name, value); }
    removeAttribute(name: string) { this.attrs.delete(name); }
    getBoundingClientRect() { return { top: this.top }; }
    querySelector(selector: string) { return this.children.get(selector) ?? null; }
    focus() { focused = this; }
    scrollIntoView(options: ScrollIntoViewOptions) { jumps.push({ target: this, behavior: options.behavior }); }
    animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      let finish!: () => void;
      let reject!: (reason?: unknown) => void;
      const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
      const record = { element: this, keyframes, finish, cancelled: false, duration: options.duration as number };
      animations.push(record);
      return { finished, cancel() { record.cancelled = true; reject(new Error('已取消')); } };
    }
  }
  const links = [new Box(), new Box(), new Box()];
  const headings = [new Box(), new Box(), new Box()];
  headings.forEach((heading, i) => { heading.top = 400 + 400 * i; links[i].attrs.set('href', `#section-${i}`); });
  const copy = new Box();
  const status = new Box();
  status.textContent = '';
  const writes: string[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, () => void>();
  let nextId = 0;
  const reduce = Object.assign(new EventTarget(), { matches: false });
  const prose = new Box();
  const ship = new Box();
  const vessel = new Box();
  const portal = new Box();
  ship.hidden = !showShip;
  ship.children.set('.st-vessel', vessel);
  ship.children.set('.st-portal', portal);
  const view = Object.assign(new EventTarget(), {
    innerHeight: 900,
    scrollY: 0,
    scrollTo: () => {},
    matchMedia: () => reduce,
    visualViewport: Object.assign(new EventTarget(), { offsetTop: 0, height: 900 }),
    location: { hash: '' },
    getComputedStyle: (element: Box) => ({
      scrollMarginTop: '32px', scrollPaddingTop: '64px', opacity: element === portal ? '0' : '1', translate: 'none', scale: 'none',
    }),
    history: { state: { entry: true }, replaceState: (_state: unknown, _title: string, hash: string) => { view.location.hash = hash; } },
    navigator: { clipboard: clipboard === 'absent' ? undefined : { writeText: async (text: string) => {
      if (clipboard === 'denied') throw new Error('用户拒绝复制');
      writes.push(text);
    } } },
    requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout: (fn: () => void) => { timers.set(++nextId, fn); return nextId; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const doc = {
    defaultView: view,
    scrollingElement: { scrollHeight: 20000, clientHeight: 900 },
    querySelectorAll: () => links,
    getElementById: (id: string) => headings[Number(id.replace('section-', ''))] ?? null,
    querySelector: (selector: string) => selector.includes('canonical') ? { href: 'https://northcedar.top/posts/real-note/' }
      : selector === '.prose' ? prose : selector === '.st-ship' && showShip ? ship
        : selector === '[data-copy-link]' ? copy : selector === '[data-copy-status]' ? status : null,
  };
  const dispose = init?.(doc as unknown as Document, onActive);
  const flush = () => { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn(0)); };
  return { links, headings, copy, status, view, writes, frames, timers, dispose, flush, animations, jumps, reduce, prose, vessel, portal,
    focused: () => focused,
    jump(i: number) { links[i].dispatchEvent(Object.assign(new Event('click', { cancelable: true }), { button: 0 })); },
    async clickCopy() { copy.dispatchEvent(new Event('click')); await Promise.resolve(); await Promise.resolve(); },
  };
}

describe('文章阅读侧栏', () => {
  it('远章节在阅读区淡出后一次定位，再同步焦点与帆船并淡入', async () => {
    const calls: boolean[] = [];
    const page = fixture('ok', (_link, _changed, snap) => calls.push(Boolean(snap)));
    page.headings[2].top = 9000;
    page.flush();
    page.jump(2);
    expect(page.jumps).toEqual([]);
    expect(page.view.location.hash).toBe('');
    expect(page.animations[0]?.duration).toBe(110);
    page.animations[0].finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(page.jumps).toEqual([{ target: page.headings[2], behavior: 'instant' }]);
    expect(page.view.location.hash).toBe('#section-2');
    expect(page.links[2].getAttribute('aria-current')).toBe('location');
    expect(page.focused()).toBe(page.headings[2]);
    expect(calls.at(-1)).toBe(true);
    expect(page.animations[1]?.duration).toBe(180);
    page.dispose?.();
  });

  it('连点由最后一个远章节接手，用户滚动会中断尚未定位的传送', async () => {
    const page = fixture();
    page.headings[1].top = 7000;
    page.headings[2].top = 9000;
    page.jump(1);
    page.jump(2);
    expect(page.animations[0]?.cancelled).toBe(true);
    page.view.dispatchEvent(new Event('wheel'));
    expect(page.animations[1]?.cancelled).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(page.jumps).toEqual([]);
    expect(page.view.location.hash).toBe('');
    page.dispose?.();
  });

  it.each([1, -1])('远跳方向 %i 同步正文出入与帆船两侧的门', async direction => {
    const page = fixture('ok', undefined, true);
    page.view.scrollY = direction > 0 ? 0 : 10000;
    page.headings[2].top = direction * 8500;
    page.jump(2);
    const departure = [...page.animations];
    const keys = (phase: typeof departure, element: typeof page.prose) => phase.find(animation => animation.element === element)?.keyframes;

    expect(keys(departure, page.prose)?.at(-1)).toMatchObject({ translate: `0px ${-16 * direction}px`, opacity: 0 });
    expect(keys(departure, page.vessel)?.at(-1)).toMatchObject({ translate: `0px ${-11 * direction}px`, scale: .24, opacity: 0 });
    expect(keys(departure, page.portal)?.some(frame => Number(frame.opacity) > .5)).toBe(true);
    departure.forEach(animation => animation.finish());
    await Promise.resolve();
    await Promise.resolve();

    const arrival = page.animations.slice(departure.length);
    expect(page.jumps).toEqual([{ target: page.headings[2], behavior: 'instant' }]);
    expect(departure.every(animation => animation.cancelled)).toBe(true);
    expect(keys(arrival, page.prose)?.[0]).toMatchObject({ translate: `0px ${16 * direction}px`, opacity: 0 });
    expect(keys(arrival, page.vessel)?.[0]).toMatchObject({ translate: `0px ${11 * direction}px`, scale: .24 });
    expect(keys(arrival, page.vessel)?.at(-1)).toMatchObject({ translate: '0px 0px', scale: 1, opacity: 1 });
    expect(keys(arrival, page.portal)?.at(-1)).toMatchObject({ opacity: 0 });
    page.view.dispatchEvent(new Event('wheel'));
    expect(arrival.every(animation => animation.cancelled)).toBe(true);
    page.dispose?.();
  });

  it('正好七个视觉视口仍平滑滚动，多一像素才开始淡出', () => {
    const page = fixture();
    page.view.visualViewport.height = 800;
    const sevenScreens = 7 * 800 + 32 + 64;
    page.headings[1].top = sevenScreens;
    page.headings[2].top = sevenScreens + 1;
    page.jump(1);
    expect(page.jumps[0]?.behavior).toBe('smooth');
    expect(page.animations).toHaveLength(0);
    page.jump(2);
    expect(page.jumps).toHaveLength(1);
    expect(page.animations[0]?.duration).toBe(110);
    page.dispose?.();
  });

  it('近章节沿用平滑滚动，减少动态效果时远章节立即定位', () => {
    const page = fixture();
    page.jump(0);
    expect(page.jumps[0]?.behavior).toBe('smooth');
    expect(page.animations).toHaveLength(0);
    page.reduce.matches = true;
    page.headings[2].top = 9000;
    page.jump(2);
    expect(page.jumps[1]?.behavior).toBe('instant');
    expect(page.animations).toHaveLength(0);
    page.dispose?.();
  });

  it('当前位置回调区分换节与重排，同一节缩放仍能重测指示线',()=>{
    const calls:{link:HTMLAnchorElement;changed:boolean}[]=[];
    const page=fixture('ok',(link,changed)=>calls.push({link,changed}));page.flush();
    expect(calls[0]).toEqual({link:page.links[0],changed:true});
    page.view.dispatchEvent(new Event('resize'));page.flush();expect(calls[1].changed).toBe(false);
    page.headings[1].top=100;page.view.dispatchEvent(new Event('scroll'));page.flush();
    expect(calls[2]).toEqual({link:page.links[1],changed:true});page.dispose?.();
  });
  it('首屏标记第一节，滚动越过下一标题后更新当前节', () => {
    const page = fixture();
    page.flush();
    expect(page.links[0].getAttribute('aria-current')).toBe('location');
    page.headings[0].top = -400;
    page.headings[1].top = 100;
    page.view.dispatchEvent(new Event('scroll'));
    page.flush();
    expect(page.links.map(link => link.getAttribute('aria-current'))).toEqual([null, 'location', null]);
  });

  it('手机视觉视口偏移时仍优先停在跳转目标，继续滚动后跟随下一节', () => {
    const page = fixture();
    page.view.visualViewport.offsetTop = 420;
    page.view.visualViewport.height = 844;
    page.view.location.hash = '#section-1';
    page.headings[0].top = -100;
    page.headings[1].top = 452;
    page.headings[2].top = 520;
    page.flush();
    expect(page.links[1].getAttribute('aria-current')).toBe('location');
    page.headings[1].top = 430;
    page.view.visualViewport.dispatchEvent(new Event('scroll'));
    page.flush();
    expect(page.links[2].getAttribute('aria-current')).toBe('location');
    page.dispose?.();
  });

  it('滚动事件合并到一帧，重排后按最新标题位置计算', () => {
    const page = fixture();
    page.flush();
    for (let i = 0; i < 8; i++) page.view.dispatchEvent(new Event('scroll'));
    expect(page.frames.size).toBe(1);
    page.headings.forEach((heading, i) => { heading.top = -400 + 200 * i; });
    page.view.dispatchEvent(new Event('resize'));
    page.flush();
    expect(page.links[2].getAttribute('aria-current')).toBe('location');
  });

  it('复制正式地址，并以状态文字反馈成功', async () => {
    const page = fixture();
    expect(page.copy.hidden).toBe(false);
    await page.clickCopy();
    expect(page.writes).toEqual(['https://northcedar.top/posts/real-note/']);
    expect(page.copy.textContent).toBe('已复制');
    expect(page.status.textContent).toContain('已复制');
    expect(page.copy.disabled).toBe(false);
  });

  it('复制被拒绝时显示可执行的反馈，不误报成功', async () => {
    const page = fixture('denied');
    await page.clickCopy();
    expect(page.writes).toEqual([]);
    expect(page.status.textContent).toContain('地址栏');
    expect(page.copy.textContent).toBe('复制链接');
    expect(page.copy.disabled).toBe(false);
  });

  it('没有剪贴板能力时保持按钮隐藏，页面与目录仍可读', () => {
    const page = fixture('absent');
    page.flush();
    expect(page.copy.hidden).toBe(true);
    expect(page.links[0].getAttribute('aria-current')).toBe('location');
  });

  it('释放时取消待执行帧和提示定时器，不响应后续事件', async () => {
    const page = fixture();
    await page.clickCopy();
    page.dispose?.();
    expect(page.frames.size).toBe(0);
    expect(page.timers.size).toBe(0);
    page.view.dispatchEvent(new Event('scroll'));
    expect(page.frames.size).toBe(0);
  });
});
