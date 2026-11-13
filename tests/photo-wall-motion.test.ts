// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initPhotoWall } from '../src/scripts/photo-wall';
import { intentPrefetch } from '../src/scripts/big-image';
import { gsap as realGsap } from 'gsap';

let dispose=()=>{};
let ready:(()=>void)[];
let imaging:any;
const click=(selector:string)=>document.querySelector<HTMLElement>(selector)!.click();
beforeEach(()=>{
  document.body.innerHTML='<main><div class="wf">'+[0,1,2].map(i=>'<figure data-album-title="相册" data-cap="照片'+i+'"><a class="frame" href="/big-'+i+'.webp"><img alt="照片'+i+'" src="/small-'+i+'.webp"></a></figure>').join('')+'</div></main><div id="lb" class="lb" role="dialog" aria-modal="true"><div class="lb-backdrop"></div><div class="lb-bar"><span id="lbAlbum"></span><span id="lbCap"></span><span id="lbPos"></span><button id="lbClose">关闭</button></div><div class="lb-stage"><button id="lbPrev">上一张</button><figure><img id="lbImg" src="/big-0.webp" alt="照片0"></figure><button id="lbNext">下一张</button><p id="lbStatus" hidden></p></div></div>';
  document.body.style.overflow='auto';
  ready=[];
  imaging={showBig:vi.fn((img:HTMLImageElement,big:string,callback:()=>void)=>{img.src=big;img.dataset.big=big;ready.push(callback);}),prefetch:vi.fn(),intentPrefetch:vi.fn()};
  vi.spyOn(window,'matchMedia').mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}} as any);
  const image=document.querySelector<HTMLImageElement>('#lbImg')!;
  Object.defineProperty(image,'naturalWidth',{configurable:true,value:1200});
  Object.defineProperty(image,'complete',{configurable:true,value:true});
  dispose=initPhotoWall(document,imaging,()=>null);
});
afterEach(()=>{dispose();vi.useRealTimers();vi.restoreAllMocks();document.body.replaceChildren();});
describe('单册灯箱的加载、动效与会话',()=>{
  it('离开页面取消尚未触发的悬停预取，也移除旧意图监听',()=>{
    vi.useFakeTimers();const events=new AbortController(),url=vi.fn(()=>'/big.webp'),a=document.querySelector<HTMLElement>('.frame')!;
    intentPrefetch(a,url,250,events.signal);
    a.dispatchEvent(new Event('pointerenter'));events.abort();vi.advanceTimersByTime(300);
    a.dispatchEvent(new Event('focus'));expect(url).not.toHaveBeenCalled();
  });
  it('不预加载整册，图注只在最新照片可绘制时同步',()=>{
    expect(imaging.showBig).not.toHaveBeenCalled();
    click('.frame');expect(document.querySelector('#lb')!.classList.contains('on')).toBe(true);
    expect(document.querySelector('#lbCap')!.textContent).toBe('');
    ready[0]();expect(document.querySelector('#lbCap')!.textContent).toBe('照片0');
    click('#lbNext');expect(document.querySelector('#lbCap')!.textContent).toBe('照片0');
    ready[1]();expect(document.querySelector('#lbCap')!.textContent).toBe('照片1');
    expect(document.querySelector('#lbPos')!.textContent).toBe('2');
  });
  it('慢图就绪时保持已经出现的暗幕，不重新变透明',()=>{
    dispose();
    const image=document.querySelector<HTMLImageElement>('#lbImg')!;
    image.getBoundingClientRect=()=>({left:200,top:80,width:800,height:600}) as DOMRect;
    document.querySelector<HTMLImageElement>('.frame img')!.getBoundingClientRect=()=>({left:20,top:180,width:120,height:90}) as DOMRect;
    const gsap={...realGsap,fromTo(target:any,from:any,to:any){return realGsap.fromTo(target,from,{...to,paused:true});}};
    dispose=initPhotoWall(document,imaging,()=>({gsap,Flip:{fit:()=>({x:0,y:0,scaleX:.2,scaleY:.2,rotation:-10})}}) as any);
    click('.frame');const backdrop=document.querySelector<HTMLElement>('.lb-backdrop')!;
    expect(Number(getComputedStyle(backdrop).opacity||'1')).toBe(1);
    ready[0]();expect(Number(getComputedStyle(backdrop).opacity||'1')).toBe(1);
  });
  it('快速换片与关闭重开同图，旧解码不能覆盖新会话',()=>{
    click('.frame');const old=ready[0];click('#lbNext');const next=ready[1];
    old();expect(document.querySelector('#lbCap')!.textContent).toBe('');
    click('#lbClose');click('.frame');next();old();
    expect(document.querySelector('#lbCap')!.textContent).toBe('');
    ready[2]();expect(document.querySelector('#lbCap')!.textContent).toBe('照片0');
  });
  it('关闭与销毁恢复原焦点、滚动状态及背景交互',()=>{
    const link=document.querySelector<HTMLElement>('.frame')!;link.focus();link.click();ready[0]();
    expect(document.querySelector('main')!.inert).toBe(true);expect(document.body.style.overflow).toBe('hidden');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    expect(document.activeElement).toBe(link);expect(document.querySelector('main')!.inert).toBe(false);
    expect(document.body.style.overflow).toBe('auto');expect(document.querySelector('#lbImg')!.hasAttribute('src')).toBe(false);
    click('.frame');dispose();ready[1]();expect(document.querySelector('#lb')!.classList.contains('on')).toBe(false);
  });
  it('保留修饰点击原图，左右切换循环，Tab局限在灯箱',()=>{
    const event=new MouseEvent('click',{ctrlKey:true,bubbles:true,cancelable:true});document.querySelector('.frame')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);expect(imaging.showBig).not.toHaveBeenCalled();
    click('.frame');ready[0]();click('#lbPrev');ready[1]();expect(document.querySelector('#lbPos')!.textContent).toBe('3');
    document.querySelector<HTMLElement>('#lbClose')!.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
    expect(document.activeElement?.id).toBe('lbNext');
  });
  it('失败照片给出可操作反馈，仍可关闭',()=>{
    click('.frame');Object.defineProperty(document.querySelector('#lbImg')!,'naturalWidth',{value:0});ready[0]();
    expect(document.querySelector('#lbStatus')!.textContent).toContain('重试');click('#lbClose');
    expect(document.querySelector('#lb')!.classList.contains('on')).toBe(false);
  });
  it('关闭动画尚未完成便重开，旧完成回调不能关闭新灯箱',()=>{
    dispose();const completions:(()=>void)[]=[];
    const fake={gsap:{killTweensOf(){},set(){},fromTo(_target:unknown,_from:unknown,to:{onComplete?:()=>void}){if(to.onComplete)completions.push(to.onComplete);},to(_target:unknown,to:{onComplete?:()=>void}){if(to.onComplete)completions.push(to.onComplete);}}};
    dispose=initPhotoWall(document,imaging,()=>fake as any);
    click('.frame');ready[0]();click('#lbClose');const oldClose=completions.at(-1)!;
    click('.frame');ready[1]();oldClose();expect(document.querySelector('#lb')!.classList.contains('on')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');expect(document.querySelector('#lbCap')!.textContent).toBe('照片0');
  });
  it('触屏打开后忽略同一次触碰补发的点击，下一次点击仍能关灯箱',()=>{
    dispose();
    vi.mocked(window.matchMedia).mockReturnValue({matches:true,addEventListener(){},removeEventListener(){}} as any);
    dispose=initPhotoWall(document,imaging,()=>null);
    const link=document.querySelector<HTMLElement>('.frame')!;
    const stage=document.querySelector<HTMLElement>('.lb-stage')!;
    const setSourceHidden=vi.fn();
    const tap=()=>stage.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1,cancelable:true}));
    link.dispatchEvent(new CustomEvent('photo-wall:open',{
      cancelable:true,
      detail:{trigger:link,readOrigin:()=>({rect:new DOMRect(20,50,100,80),radius:8}),setSourceHidden},
    }));
    expect(setSourceHidden).not.toHaveBeenCalled();
    tap();
    expect(document.querySelector('#lb')!.classList.contains('on')).toBe(true);
    ready[0]();
    expect(setSourceHidden).toHaveBeenLastCalledWith(true);
    stage.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
    tap();
    expect(document.querySelector('#lb')!.classList.contains('on')).toBe(false);
    expect(setSourceHidden).toHaveBeenLastCalledWith(false);
  });
  it('进入页面缓存时关闭并失效旧解码，返回后仍可再开',()=>{
    click('.frame');window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));ready[0]();
    expect(document.querySelector('#lb')!.classList.contains('on')).toBe(false);expect(document.body.style.overflow).toBe('auto');
    click('.frame');ready[1]();expect(document.querySelector('#lbCap')!.textContent).toBe('照片0');
  });
});
