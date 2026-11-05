// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initArchiveFilters } from '../src/scripts/archive-filter';
import { createArchiveMotion } from '../src/scripts/archive-motion';

let dispose = () => {};
const visible = () => [...document.querySelectorAll<HTMLLIElement>('.index li')].filter(row => !row.hidden).map(row => row.id);
const input = () => document.querySelector<HTMLInputElement>('[data-q]')!;
function type(value: string) { input().value = value; input().dispatchEvent(new Event('input')); }
beforeEach(() => {
  document.body.innerHTML = '<form data-filters hidden><input data-q><select data-year><option value="all">全部</option><option>2026</option><option>2025</option></select><select data-month><option value="all">全部</option><option value="02">2月</option></select><button type="button" data-sort="desc">倒序</button><button type="button" data-sort="asc">正序</button><button type="button" data-clear>清空</button><p data-count></p></form><div data-groups><section class="yeargroup" data-year="2026"><ul class="index"><li id="a" data-q="甲文章" data-year="2026" data-month="02" data-date="2026-02-02"><a href="#a">甲</a></li><li id="b" data-q="乙文章" data-year="2026" data-month="01" data-date="2026-01-01"><a href="#b">乙</a></li></ul></section><section class="yeargroup" data-year="2025"><ul class="index"><li id="c" data-q="旧文" data-year="2025" data-month="02" data-date="2025-02-02"><a href="#c">旧文</a></li></ul></section></div><p data-empty hidden>没有匹配</p>';
  vi.spyOn(window,'matchMedia').mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}} as any);
});
afterEach(() => { dispose(); dispose = () => {}; vi.restoreAllMocks(); document.body.replaceChildren(); });
describe('归档筛选的连续操作', () => {
  it('筛选、空结果和清空都同步给出准确结果', () => {
    dispose = initArchiveFilters(document);
    type('甲');
    expect(visible()).toEqual(['a']);
    expect(document.querySelector('[data-count]')!.textContent).toBe('筛出 1 / 3 篇');
    type('不存在');
    expect(visible()).toEqual([]);
    expect(document.querySelector<HTMLElement>('[data-empty]')!.hidden).toBe(false);
    document.querySelector<HTMLButtonElement>('[data-clear]')!.click();
    expect(visible()).toEqual(['a','b','c']);
    expect(document.activeElement).toBe(input());
  });
  it('排序移动原节点，保留链接上的事件', () => {
    const link = document.querySelector<HTMLAnchorElement>('#b a')!, clicked = vi.fn(e => e.preventDefault());
    link.addEventListener('click', clicked);
    dispose = initArchiveFilters(document);
    document.querySelector<HTMLButtonElement>('[data-sort="asc"]')!.click();
    expect(visible()).toEqual(['c','b','a']);
    expect(document.querySelector('#b a')).toBe(link);
    link.click();
    expect(clicked).toHaveBeenCalledOnce();
  });
  it('中文组词期间不筛选，结束后立即使用完整词', () => {
    dispose = initArchiveFilters(document);
    input().dispatchEvent(new CompositionEvent('compositionstart'));
    type('甲');
    expect(visible()).toHaveLength(3);
    input().dispatchEvent(new CompositionEvent('compositionend'));
    expect(visible()).toEqual(['a']);
    type('乙');
    expect(visible()).toEqual(['b']);
  });
  it('销毁后不响应过期输入', () => {
    dispose = initArchiveFilters(document);
    dispose();
    type('甲');
    expect(visible()).toHaveLength(3);
  });
  it('资源查询在减少动态后返回空值仍清理上一轮淡入淡出', () => {
    const kill=vi.fn(),engine={gsap:{killTweensOf:kill,fromTo(){},to(){}},Flip:{killFlipsOf:vi.fn(),getState(){return{};},from(){return{kill(){}};}}};
    let available=true;
    const motion=createArchiveMotion(document.querySelector<HTMLElement>('[data-groups]')!,()=>available?engine as any:null);
    motion.run(()=>{});kill.mockClear();available=false;motion.finish();expect(kill).toHaveBeenCalledOnce();motion.dispose();
  });
  it('过期动画完成不能清除新一轮变换', () => {
    const callbacks: (()=>void)[] = [];
    const engine = {gsap:{killTweensOf(){},fromTo(){},to(){}},Flip:{killFlipsOf(){},getState(){return{};},from(_state:unknown,vars:any){callbacks.push(vars.onComplete);return{kill(){}};}}};
    const host = document.querySelector<HTMLElement>('[data-groups]')!;
    const motion = createArchiveMotion(host, () => engine as any);
    motion.run(() => {});
    motion.run(() => {});
    const row = document.querySelector<HTMLElement>('#a')!;
    row.style.transform = 'translateX(25px)';
    callbacks[0]();
    expect(row.style.transform).toBe('translateX(25px)');
    callbacks[1]();
    expect(row.style.transform).toBe('');
    motion.dispose();
  });
});
