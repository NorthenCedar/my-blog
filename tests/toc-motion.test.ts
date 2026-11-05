// @vitest-environment happy-dom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createTocMotion} from '../src/scripts/toc-motion';

let dispose=()=>{}, top=70;
let nav:HTMLElement, marker:HTMLElement, list:HTMLOListElement, link:HTMLAnchorElement;
beforeEach(()=>{
  document.body.innerHTML='<nav class="toc"><div class="toc-index"><span data-toc-marker hidden></span><ol><li><a href="#one">多行章节标题</a></li></ol></div></nav><h2 id="one">章节</h2>';
  nav=document.querySelector('.toc')!;marker=document.querySelector('[data-toc-marker]')!;list=document.querySelector('ol')!;link=document.querySelector('a')!;top=70;
  const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height});
  nav.querySelector<HTMLElement>('.toc-index')!.getBoundingClientRect=()=>rect(100,50,200,200) as DOMRect;
  list.getBoundingClientRect=()=>rect(100,50,200,200) as DOMRect;
  link.getBoundingClientRect=()=>rect(116,top,184,44) as DOMRect;
  vi.spyOn(window,'matchMedia').mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}} as any);
});
afterEach(()=>{dispose();vi.restoreAllMocks();document.body.replaceChildren();});
describe('阅读目录当前位置指示线',()=>{
  it('没有引擎也按活动行的实际位置和多行高度定位',()=>{
    const motion=createTocMotion(nav,()=>null);dispose=motion.dispose;motion.moveTo(link,false);
    expect(marker.hidden).toBe(false);expect(marker.style.transform).toContain('16px, 20px');expect(marker.style.transform).toContain('44');
    expect(nav.hasAttribute('data-toc-enhanced')).toBe(true);
  });
  it('目录内部滚动重新测量，原生锚点不拦截也不滚动正文',()=>{
    const motion=createTocMotion(nav,()=>null);dispose=motion.dispose;motion.moveTo(link,false);
    const before=window.scrollY;top=30;list.dispatchEvent(new Event('scroll'));
    expect(marker.style.transform).toContain('16px, -20px');expect(window.scrollY).toBe(before);
    const click=new MouseEvent('click',{bubbles:true,cancelable:true});link.dispatchEvent(click);expect(click.defaultPrevented).toBe(false);
  });
  it('换节只调整目录自身，手动浏览目录后不抢回原位置',()=>{
    const scroll=vi.fn();list.scrollTo=scroll;top=260;
    const motion=createTocMotion(nav,()=>null);dispose=motion.dispose;motion.moveTo(link,true);
    expect(scroll).toHaveBeenCalledOnce();scroll.mockClear();list.dispatchEvent(new Event('scroll'));expect(scroll).not.toHaveBeenCalled();
  });
  it('减少动态直接定位，销毁恢复原生当前项样式',()=>{
    vi.mocked(window.matchMedia).mockReturnValue({matches:true,addEventListener(){},removeEventListener(){}} as any);
    const engine=vi.fn(()=>null),motion=createTocMotion(nav,engine);dispose=motion.dispose;motion.moveTo(link,false);
    expect(engine).not.toHaveBeenCalled();expect(marker.hidden).toBe(false);
    dispose();expect(marker.hidden).toBe(true);expect(nav.hasAttribute('data-toc-enhanced')).toBe(false);
    top=120;list.dispatchEvent(new Event('scroll'));expect(marker.hasAttribute('style')).toBe(false);
  });
});
