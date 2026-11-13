// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTocMotion } from '../src/scripts/toc-motion';

let dispose = () => {};
let top = 70;
let nav: HTMLElement, ship: HTMLElement, route: SVGPathElement, list: HTMLOListElement, link: HTMLAnchorElement;
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  document.body.innerHTML = '<nav><div class="toc-index"><svg class="st-rail"><path class="st-route"/></svg><div class="st-ship" hidden><svg class="st-wake"><ellipse/><ellipse/></svg></div><ol><li><a href="#one">多行章节标题</a></li><li><a href="#two">第二节</a></li></ol></div></nav>';
  nav = document.querySelector('nav')!;
  ship = nav.querySelector('.st-ship')!;
  route = nav.querySelector('.st-route')!;
  list = nav.querySelector('ol')!;
  link = list.querySelector('a')!;
  top = 70;
  const rect = (left: number, top: number, width: number, height: number) =>
    new DOMRect(left, top, width, height);
  nav.querySelector<HTMLElement>('.toc-index')!.getBoundingClientRect = () => rect(100, 50, 260, 200);
  nav.querySelector<SVGSVGElement>('.st-rail')!.getBoundingClientRect = () => rect(100, 50, 72, 200);
  list.getBoundingClientRect = () => rect(100, 50, 260, 200);
  link.getBoundingClientRect = () => rect(172, top, 176, 44);
  frames = new Map();
  let id = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++id, callback); return id; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener() {} } as unknown as MediaQueryList);
});
afterEach(() => {
  dispose();
  dispose = () => {};
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const shipY = () => parseFloat(ship.style.transform.match(/translateY\(([^p]+)/)?.[1] ?? 'NaN');
function tick(time: number) {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach(callback => callback(time));
}

describe('帆船目录', () => {
  it('多行标题按实际行中心停船，航线在船旁弯曲', () => {
    const motion = createTocMotion(nav);
    dispose = motion.dispose;
    motion.moveTo(link);
    expect(ship.hidden).toBe(false);
    expect(shipY()).toBeCloseTo(16.4);
    expect(route.getAttribute('d')).toContain('C22');
    expect(nav.hasAttribute('data-toc-enhanced')).toBe(true);
  });

  it('目录内部滚动重测活动项，锚点保持默认行为', () => {
    const motion = createTocMotion(nav);
    dispose = motion.dispose;
    motion.moveTo(link);
    top = 85;
    list.dispatchEvent(new Event('scroll'));
    expect(shipY()).toBeCloseTo(31.4);
    top = -100;
    list.dispatchEvent(new Event('scroll'));
    expect(ship.hidden).toBe(true);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('换节时只滚动目录，手动浏览不会被拉回当前项', () => {
    const scroll = vi.fn();
    list.scrollTo = scroll;
    const motion = createTocMotion(nav);
    dispose = motion.dispose;
    top = 260;
    motion.moveTo(link, true);
    expect(scroll).toHaveBeenCalledWith({ top: 54, behavior: 'instant' });
    scroll.mockClear();
    list.dispatchEvent(new Event('scroll'));
    expect(scroll).not.toHaveBeenCalled();
  });

  it('减少动态时直接定位，销毁后移除动效状态', () => {
    const motion = createTocMotion(nav);
    dispose = motion.dispose;
    motion.moveTo(link);
    expect(frames.size).toBe(0);
    motion.dispose();
    expect(ship.hidden).toBe(true);
    expect(nav.hasAttribute('data-toc-enhanced')).toBe(false);
    list.dispatchEvent(new Event('scroll'));
    expect(ship.hidden).toBe(true);
  });

  it('正常模式下逐帧靠近新章节，销毁时取消待执行帧', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false, addEventListener() {} } as unknown as MediaQueryList);
    const motion = createTocMotion(nav);
    dispose = motion.dispose;
    motion.moveTo(link);
    const from = shipY();
    top = 160;
    motion.moveTo(link);
    expect(shipY()).toBe(from);
    tick(10);
    tick(26);
    expect(shipY()).toBeGreaterThan(from);
    expect(shipY()).toBeLessThan(from + 90);
    motion.dispose();
    expect(frames.size).toBe(0);
  });

  it('目录往下滚时，帆船向上驶离，航线经过中间姿态再拉直', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false, addEventListener() {} } as unknown as MediaQueryList);
    const motion = createTocMotion(nav);
    dispose = motion.dispose;
    motion.moveTo(link);
    const from = shipY();
    const curved = route.getAttribute('d');
    top = -100;
    list.dispatchEvent(new Event('scroll'));
    expect(ship.hidden).toBe(false);
    expect(ship.style.opacity).not.toBe('0');
    expect(route.getAttribute('d')).toBe(curved);

    for (let time = 16; time <= 96; time += 16) tick(time);
    expect(shipY()).toBeLessThan(from);
    expect(route.getAttribute('d')).toContain('C');
    expect(route.getAttribute('d')).not.toBe(curved);

    for (let time = 112; time <= 1600; time += 16) tick(time);
    // 72px 的轨道上，船盒宽高各为 64/90 × 72px。
    expect(shipY() + 64 / 90 * 72).toBeLessThan(0);
    expect(ship.hidden).toBe(true);
    expect(route.getAttribute('d')).toMatch(/^M22 [\d.]+V[\d.]+$/);
  });
});
