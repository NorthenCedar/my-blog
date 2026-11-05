import { getMotion, type MotionEngine } from './motion-loader';

/** 大档始终只有一张；这里只改变照片的位置，不参与图片加载与图注选择。 */
export function createLightboxMotion(root: HTMLElement, image: HTMLImageElement, engine: () => MotionEngine | null = getMotion) {
  const bar = root.querySelector<HTMLElement>('.lb-bar')!;
  const backdrop = root.querySelector<HTMLElement>('.lb-backdrop')!;
  const targets = [image,bar,backdrop];
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastEngine: MotionEngine | null = null, version = 0, active = false;
  let afterClose: (()=>void) | null = null;
  const stop = () => {++version;lastEngine?.gsap.killTweensOf(targets);};
  const clear = () => {
    lastEngine?.gsap.set(targets,{clearProps:'transform,opacity,visibility'});
    targets.forEach(el=>{el.style.removeProperty('transform');el.style.removeProperty('translate');el.style.removeProperty('rotate');el.style.removeProperty('scale');el.style.removeProperty('opacity');el.style.removeProperty('visibility');if(!el.getAttribute('style'))el.removeAttribute('style');});
  };
  const finish = () => {
    stop();
    if(active)clear();
    active=false;
    const done=afterClose;afterClose=null;done?.();
  };
  const motion = () => media.matches ? null : engine();
  const fit = (target: HTMLElement, m: MotionEngine) => {
    const r=target.getBoundingClientRect(),own=image.getBoundingClientRect();
    if(!r.width||!r.height||!own.width||!own.height)return null;
    // Flip 计算完整全局矩阵，包含散片祖先的旋转、缩放和倾斜。
    return m.Flip.fit(image,target,{getVars:true,scale:true}) as gsap.TweenVars|null;
  };
  window.addEventListener('resize',finish,{passive:true});
  media.addEventListener('change',finish);
  return {
    open(from: HTMLElement | null) {
      finish();active=true;
      const m=motion();lastEngine=m;
      if(!m||!from)return;
      const geometry=fit(from,m);if(!geometry)return;
      const token=version;
      // 暗幕与关闭按钮在等图时已经可见，解码完成后只展开照片，避免二次闪亮。
      m.gsap.fromTo(image,{...geometry,opacity:1},{x:0,y:0,scaleX:1,scaleY:1,rotation:0,skewX:0,duration:.38,ease:'power3.out',onComplete:()=>{if(token===version)clear();}});
    },
    change(direction: number) {
      finish();active=true;
      const m=motion();lastEngine=m;if(!m)return;
      const token=version;
      m.gsap.fromTo(image,{x:direction*24,opacity:.55},{x:0,opacity:1,duration:.22,ease:'power2.out',onComplete:()=>{if(token===version)clear();}});
    },
    close(to: HTMLElement | null, done: ()=>void) {
      stop();afterClose=done;
      const m=motion();if(!m||!active){finish();return;}
      lastEngine=m;
      const rect=to?.getBoundingClientRect();
      const token=version, visible=rect&&rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight;
      const geometry=visible?fit(to!,m):null;
      m.gsap.to([bar,backdrop],{opacity:0,duration:.22,ease:'power2.in'});
      m.gsap.to(image,{...(geometry||{opacity:0}),duration:geometry ? .3 : .18,ease:'power3.inOut',onComplete:()=>{if(token===version)finish();}});
    },
    finish,
    dispose(){finish();window.removeEventListener('resize',finish);media.removeEventListener('change',finish);},
  };
}
