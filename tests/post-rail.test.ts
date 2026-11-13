import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

let init: ((doc: Document, onActive?: (link: HTMLAnchorElement, changed: boolean) => void) => () => void) | undefined;
beforeAll(async () => {
  if (existsSync('src/scripts/post-rail.ts')) init = (await import('../src/scripts/post-rail')).initPostRail;
});

function fixture(clipboard: 'ok' | 'denied' | 'absent' = 'ok', onActive?: (link: HTMLAnchorElement, changed: boolean) => void) {
  class Box extends EventTarget {
    hidden = true;
    disabled = false;
    textContent = '复制链接';
    attrs = new Map<string, string>();
    top = 0;
    getAttribute(name: string) { return this.attrs.get(name) ?? null; }
    get hash() { return this.attrs.get('href') ?? ''; }
    setAttribute(name: string, value: string) { this.attrs.set(name, value); }
    removeAttribute(name: string) { this.attrs.delete(name); }
    getBoundingClientRect() { return { top: this.top }; }
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
  const view = Object.assign(new EventTarget(), {
    innerHeight: 900,
    visualViewport: Object.assign(new EventTarget(), { offsetTop: 0, height: 900 }),
    location: { hash: '' },
    getComputedStyle: () => ({ scrollMarginTop: '32px' }),
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
    querySelectorAll: () => links,
    getElementById: (id: string) => headings[Number(id.replace('section-', ''))] ?? null,
    querySelector: (selector: string) => selector.includes('canonical') ? { href: 'https://northcedar.top/posts/real-note/' }
      : selector === '[data-copy-link]' ? copy : selector === '[data-copy-status]' ? status : null,
  };
  const dispose = init?.(doc as unknown as Document, onActive);
  const flush = () => { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn(0)); };
  return { links, headings, copy, status, view, writes, frames, timers, dispose, flush,
    async clickCopy() { copy.dispatchEvent(new Event('click')); await Promise.resolve(); await Promise.resolve(); },
  };
}

describe('文章阅读侧栏', () => {
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
