// @vitest-environment happy-dom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {gsap} from 'gsap';
import {createLightboxMotion} from '../src/scripts/lightbox-motion';
let cleanup=()=>{};
beforeEach(()=>{
  /* ★ 2026-11-13：全量调度下 gsap 单例可能一帧都没推进，fromTo 的起始姿态
     会停在 lazy 渲染队列里，同步 getProperty 读到 0 —— 曾偶发
     「expected +0 to be close to -18」。本用例只负责姿态契约，不该和全局
     ticker 状态耦合：先清掉前置文件可能留下的假计时器，下方 stub 再让
     起始值同步落地。产品代码未改（真浏览器里 ticker 一直由 rAF 驱动）。
     机制实测 _probe/_gsap-lazy-probe.mjs：frame=0 时默认 0、lazy:false -18，
     rotation / x / scaleX 三组变异 3/3 被咬住。 */
  vi.useRealTimers();
  document.body.innerHTML='<div id="lb"><div class="lb-backdrop"></div><div class="lb-bar"></div><img id="large" alt="大图"></div><img id="small" alt="散片">';
  vi.spyOn(window,'matchMedia').mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}} as any);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();document.body.replaceChildren();});
describe('散片与灯箱共享旋转姿态',()=>{
  it('展开从原角度逐渐转正，收回逐渐回到原角度',()=>{
    const large=document.querySelector<HTMLImageElement>('#large')!,small=document.querySelector<HTMLImageElement>('#small')!;
    large.getBoundingClientRect=()=>({left:200,top:100,width:600,height:400}) as DOMRect;
    small.getBoundingClientRect=()=>({left:20,top:200,width:180,height:120,right:200,bottom:320}) as DOMRect;
    let tween:gsap.core.Tween;
    const fit=vi.fn(()=>({x:-320,y:-40,scaleX:.3,scaleY:.3,rotation:-18,skewX:0}));
    const engine={Flip:{fit},gsap:{...gsap,fromTo(t:any,f:any,v:any){tween=gsap.fromTo(t,f,{...v,paused:true,lazy:false});return tween;},to(t:any,v:any){const result=gsap.to(t,{...v,paused:true});if(t===large)tween=result;return result;}}};
    const motion=createLightboxMotion(document.querySelector('#lb')!,large,()=>engine as any);cleanup=motion.dispose;
    motion.open(small);
    expect(Number(gsap.getProperty(large,'rotation'))).toBeCloseTo(-18,1);
    tween!.progress(.5);const middle=Number(gsap.getProperty(large,'rotation'));expect(middle).toBeGreaterThan(-18);expect(middle).toBeLessThan(0);
    tween!.progress(1);motion.close(small,()=>{});tween!.progress(.99);
    expect(Number(gsap.getProperty(large,'rotation'))).toBeLessThan(-17);
    expect(fit).toHaveBeenCalledWith(large,small,expect.objectContaining({getVars:true,scale:true}));
  });
});
