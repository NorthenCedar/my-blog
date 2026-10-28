import {existsSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';

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
