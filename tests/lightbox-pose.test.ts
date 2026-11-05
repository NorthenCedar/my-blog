// @vitest-environment happy-dom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {gsap} from 'gsap';
import {createLightboxMotion} from '../src/scripts/lightbox-motion';
let cleanup=()=>{};
beforeEach(()=>{
  document.body.innerHTML='<div id="lb"><div class="lb-backdrop"></div><div class="lb-bar"></div><img id="large" alt="大图"></div><img id="small" alt="散片">';
  vi.spyOn(window,'matchMedia').mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}} as any);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();document.body.replaceChildren();});
describe('散片与灯箱共享旋转姿态',()=>{
  it('展开从原角度逐渐转正，收回逐渐回到原角度',()=>{
    const large=document.querySelector<HTMLImageElement>('#large')!,small=document.querySelector<HTMLImageElement>('#small')!;
    large.getBoundingClientRect=()=>({left:200,top:100,width:600,height:400}) as DOMRect;
    small.getBoundingClientRect=()=>({left:20,top:200,width:180,height:120,right:200,bottom:320}) as DOMRect;
    let tween:gsap.core.Tween;
    const fit=vi.fn(()=>({x:-320,y:-40,scaleX:.3,scaleY:.3,rotation:-18,skewX:0}));
    const engine={Flip:{fit},gsap:{...gsap,fromTo(t:any,f:any,v:any){tween=gsap.fromTo(t,f,{...v,paused:true});return tween;},to(t:any,v:any){const result=gsap.to(t,{...v,paused:true});if(t===large)tween=result;return result;}}};
    const motion=createLightboxMotion(document.querySelector('#lb')!,large,()=>engine as any);cleanup=motion.dispose;
    motion.open(small);
    expect(Number(gsap.getProperty(large,'rotation'))).toBeCloseTo(-18,1);
    tween!.progress(.5);const middle=Number(gsap.getProperty(large,'rotation'));expect(middle).toBeGreaterThan(-18);expect(middle).toBeLessThan(0);
    tween!.progress(1);motion.close(small,()=>{});tween!.progress(.99);
    expect(Number(gsap.getProperty(large,'rotation'))).toBeLessThan(-17);
    expect(fit).toHaveBeenCalledWith(large,small,expect.objectContaining({getVars:true,scale:true}));
  });
});
