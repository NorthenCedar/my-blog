import {existsSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';

const gpu = vi.hoisted(() => ({ load: vi.fn(), create: vi.fn() }));
vi.mock('../src/scripts/forge-scene.js', () => {
  gpu.load();
  return { createForgeScene: gpu.create };
});

let dispose:(()=>void)|undefined;
afterEach(()=>{dispose?.();dispose=undefined;vi.unstubAllGlobals();vi.useRealTimers();});
async function fixture(){
  expect(existsSync('src/scripts/forge-scroll-lock.ts'),'尚未实现断链阶段的向下滚动限制').toBe(true);
  const {createForgeScrollLock}=await import('../src/scripts/forge-scroll-lock');
  const win=new EventTarget() as any,doc=new EventTarget() as any,body={dataset:{} as Record<string,string>,querySelector:()=>null};
  win.scrollY=0;win.innerHeight=800;doc.hidden=false;
  win.scrollTo=vi.fn((options:any)=>{win.scrollY=options.top;});
  vi.stubGlobal('window',win);vi.stubGlobal('document',doc);
  const gate=createForgeScrollLock(body as any,()=>({start:0,end:1600}));dispose=()=>gate.dispose();
  gate.setReady(true);gate.frame(0);
  const send=(type:string,props:Record<string,unknown>)=>{const event=new Event(type,{cancelable:true});Object.assign(event,props);win.dispatchEvent(event);return event;};
  const scroll=(top:number)=>{win.scrollY=top;send('scroll',{});};
  return {gate,body,win,doc,send,scroll};
}

describe('断链演出只限制页面向下滚动',()=>{
  it('开始锁定时立即取消尚在推进的浏览器平滑滚动，不等页面越界再拉回',async()=>{
    const f=await fixture();f.scroll(1580);f.win.scrollTo.mockClear();f.gate.frame(.02);
    expect(f.win.scrollTo).toHaveBeenCalledWith({top:1580,behavior:'instant'});
    f.win.scrollTo.mockClear();for(let i=0;i<10;i++)f.gate.frame(.02+i*.02);
    expect(f.win.scrollTo).not.toHaveBeenCalled();
  });
  it('一大步滚轮越过舞台时停在终点，断裂收尾完成后立即放行',async()=>{
    const f=await fixture();f.scroll(1500);
    expect(f.send('wheel',{deltaY:500,deltaMode:0}).defaultPrevented).toBe(true);expect(f.win.scrollY).toBe(1600);expect(f.body.dataset.chainScrollLock).toBe('true');
    f.gate.frame(.3);expect(f.send('wheel',{deltaY:120,deltaMode:0}).defaultPrevented).toBe(true);
    f.gate.frame(1);expect(f.body.dataset.chainScrollLock).toBe('false');expect(f.send('wheel',{deltaY:120,deltaMode:0}).defaultPrevented).toBe(false);
    f.scroll(1900);expect(f.win.scrollY).toBe(1900);
  });
  it('不阻止向上操作，跨回复原区后解除限制，复原后可以再次触发',async()=>{
    const f=await fixture();f.scroll(1580);f.gate.frame(.2);
    expect(f.send('wheel',{deltaY:-80,deltaMode:0}).defaultPrevented).toBe(false);
    f.scroll(1480);expect(f.send('wheel',{deltaY:50,deltaMode:0}).defaultPrevented).toBe(true);
    f.scroll(1300);expect(f.body.dataset.chainScrollLock).toBe('false');f.gate.frame(.1);expect(f.body.dataset.chainScrollLock).toBe('false');
    f.gate.frame(0);f.scroll(1550);expect(f.send('wheel',{deltaY:100,deltaMode:0}).defaultPrevented).toBe(true);
  });
  it('键盘、触屏和滚动条同样受限，但不会截获编辑控件的按键',async()=>{
    const f=await fixture();f.scroll(1580);
    expect(f.send('keydown',{key:'PageDown'}).defaultPrevented).toBe(true);expect(f.win.scrollY).toBe(1600);
    expect(f.send('keydown',{key:'ArrowUp'}).defaultPrevented).toBe(false);
    expect(f.send('keydown',{key:' ',shiftKey:true}).defaultPrevented).toBe(false);
    const input=new EventTarget() as any;input.closest=(selector:string)=>selector.includes('input')?input:null;
    const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'target',{value:input});Object.assign(event,{key:' '});f.win.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);
    f.send('touchstart',{touches:[{clientY:500}]});expect(f.send('touchmove',{touches:[{clientY:450}]}).defaultPrevented).toBe(true);
    expect(f.send('touchmove',{touches:[{clientY:520}]}).defaultPrevented).toBe(false);
    f.scroll(2400);expect(f.win.scrollY).toBe(1600);
  });
  it('正常浏览、减少动态、已完成状态和从深处恢复页面都不拦截',async()=>{
    const f=await fixture();expect(f.send('wheel',{deltaY:100,deltaMode:0}).defaultPrevented).toBe(false);
    f.gate.setReady(false);f.scroll(1500);expect(f.send('wheel',{deltaY:500,deltaMode:0}).defaultPrevented).toBe(false);
    f.gate.setReady(true);f.gate.frame(1);f.scroll(2800);expect(f.win.scrollY).toBe(2800);
    expect(f.send('keydown',{key:'End'}).defaultPrevented).toBe(false);
  });
  it('超时、后台、窗口变化和销毁均可放行，不会残留全页锁或反复重锁',async()=>{
    vi.useFakeTimers();const f=await fixture();f.scroll(1580);f.gate.frame(.2);expect(f.body.dataset.chainScrollLock).toBe('true');
    vi.advanceTimersByTime(2100);expect(f.body.dataset.chainScrollLock).toBe('false');f.gate.frame(.3);expect(f.body.dataset.chainScrollLock).toBe('false');
    f.scroll(1300);f.gate.frame(0);f.scroll(1580);f.gate.frame(.2);expect(f.body.dataset.chainScrollLock).toBe('true');
    f.doc.hidden=true;f.doc.dispatchEvent(new Event('visibilitychange'));expect(f.body.dataset.chainScrollLock).toBe('false');
    f.doc.hidden=false;f.scroll(1300);f.gate.frame(0);f.scroll(1580);f.gate.frame(.2);f.send('resize',{});expect(f.body.dataset.chainScrollLock).toBe('false');
    f.scroll(1300);f.gate.frame(0);f.scroll(1580);f.gate.frame(.2);f.gate.dispose();dispose=undefined;expect(f.body.dataset.chainScrollLock).toBeUndefined();
    expect(f.send('wheel',{deltaY:500,deltaMode:0}).defaultPrevented).toBe(false);expect(vi.getTimerCount()).toBe(0);
  });
  it('等待场景触发的超时后不会被零进度反复重锁，上滚回起始区才能重新待命',async()=>{
    vi.useFakeTimers();const f=await fixture();f.scroll(1500);f.send('wheel',{deltaY:500,deltaMode:0});
    vi.advanceTimersByTime(2100);f.gate.frame(0);
    expect(f.send('wheel',{deltaY:100,deltaMode:0}).defaultPrevented).toBe(false);
    f.scroll(2000);expect(f.win.scrollY).toBe(2000);f.gate.frame(.2);expect(f.body.dataset.chainScrollLock).toBe('false');
    f.scroll(1300);f.gate.frame(0);f.scroll(1500);expect(f.send('wheel',{deltaY:500,deltaMode:0}).defaultPrevented).toBe(true);
  });
});

it('只有看得见且允许动效的舞台在静态首帧之后加载，失去上下文时释放并等待恢复', async () => {
  const { initForge } = await import('../src/scripts/forge');
  const win = new Window({ url: 'http://localhost/forge/#works' });
  const doc = win.document;
  Object.defineProperty(doc, 'readyState', { value: 'loading' });
  doc.body.innerHTML = '<section class="hero"><div class="hero-stage"><div data-scene><canvas id="forge-scene"></canvas><svg class="scene-fallback"></svg></div></div></section><section id="works"></section>';
  const stage = doc.querySelector<HTMLElement>('.hero-stage')!;
  const canvas = doc.querySelector<HTMLCanvasElement>('canvas')!;
  const rect = new win.DOMRect(0, -800, 1000, 600);
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(rect);
  const media = new win.EventTarget() as unknown as MediaQueryList;
  Object.defineProperty(media, 'matches', { value: true, writable: true });
  const reduce = (active: boolean) => {
    Object.defineProperty(media, 'matches', { value: active });
    media.dispatchEvent(Object.assign(new win.Event('change'), { matches: active }) as unknown as Event);
  };
  const frames = new Map<number, FrameRequestCallback>();
  const idles = new Map<number, () => void>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => { idles.set(++id, callback); return id; });
  vi.stubGlobal('cancelIdleCallback', (key: number) => idles.delete(key));
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  vi.stubGlobal('AbortController', win.AbortController);
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal('innerHeight', 600); vi.stubGlobal('scrollY', 0);
  let intersection!: IntersectionObserverCallback;
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) { if (target === stage) intersection = this.callback; }
    disconnect() {}
  });
  const show = (visible: boolean) => {
    rect.y = visible ? 0 : -800;
    intersection([{ intersectionRatio: Number(visible) } as IntersectionObserverEntry], {} as IntersectionObserver);
  };
  const paint = () => { for (const [key, callback] of [...frames]) if (frames.delete(key)) callback(0); };
  const idle = () => { for (const [key, callback] of [...idles]) if (idles.delete(key)) callback(); };
  const scene = { setTheme: vi.fn(), setProgress: vi.fn(), dispose: vi.fn() };
  gpu.create.mockReturnValue(scene);
  dispose = initForge(doc.body as unknown as HTMLElement);
  show(true); reduce(false); paint(); paint(); idle();
  expect(gpu.load).not.toHaveBeenCalled();
  show(false); reduce(false); paint(); paint(); idle();
  expect(gpu.load).not.toHaveBeenCalled();
  reduce(true); show(true); paint(); paint(); idle();
  expect(gpu.load).not.toHaveBeenCalled();

  reduce(false);
  paint();
  expect(gpu.load).not.toHaveBeenCalled();
  paint(); idle();
  await vi.dynamicImportSettled();
  expect(gpu.load).toHaveBeenCalledOnce();
  expect(gpu.create).not.toHaveBeenCalled();
  show(false); paint(); paint(); idle();
  expect(gpu.create).not.toHaveBeenCalled();

  show(true); paint(); paint(); idle();
  await vi.dynamicImportSettled();
  paint(); paint(); idle();
  expect(gpu.create).toHaveBeenCalledOnce();
  canvas.parentElement!.dataset.ready = 'true';
  const loss = new win.Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(loss);
  expect(loss.defaultPrevented).toBe(true);
  expect(scene.dispose).toHaveBeenCalledOnce();
  expect(canvas.parentElement!.dataset.ready).toBeUndefined();
  show(true); paint(); paint(); idle();
  expect(gpu.create).toHaveBeenCalledOnce();
  canvas.dispatchEvent(new win.Event('webglcontextrestored'));
  paint(); paint(); idle();
  await vi.dynamicImportSettled();
  paint(); paint(); idle();
  expect(gpu.create).toHaveBeenCalledTimes(2);
  expect(gpu.create.mock.calls[1][0]).not.toBe(canvas);
});
