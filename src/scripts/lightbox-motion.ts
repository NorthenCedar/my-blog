import { getMotion, type MotionEngine } from './motion-loader';

export interface TileOrigin {
  rect: DOMRectReadOnly;
  radius: number;
}

type Origin = HTMLElement | TileOrigin | null;
const tileEase = 'cubic-bezier(.24,.76,.25,1)';

function tilePose(image: HTMLImageElement, { rect: origin, radius }: TileOrigin) {
  const own = image.getBoundingClientRect();
  if (!own.width || !own.height || !origin.width || !origin.height) return null;
  const scale = Math.max(origin.width / own.width, origin.height / own.height);
  const x = origin.left + origin.width / 2 - own.left - own.width / 2;
  const y = origin.top + origin.height / 2 - own.top - own.height / 2;
  const clipX = Math.max(0, (1 - origin.width / (own.width * scale)) * 50);
  const clipY = Math.max(0, (1 - origin.height / (own.height * scale)) * 50);
  return {
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
    clipPath: `inset(${clipY}% ${clipX}% round ${radius / scale}px)`,
    opacity: '1',
  };
}

/** 大档始终只有一张；这里只改变照片的位置，不参与图片加载与图注选择。 */
export function createLightboxMotion(root: HTMLElement, image: HTMLImageElement, engine: () => MotionEngine | null = getMotion) {
  const bar = root.querySelector<HTMLElement>('.lb-bar')!;
  const backdrop = root.querySelector<HTMLElement>('.lb-backdrop')!;
  const controls = [...root.querySelectorAll<HTMLElement>('.lb-stage > button')];
  const targets = [image,bar,backdrop,...controls];
  const tileRest = () => ({
    transform: 'translate(0, 0) scale(1)',
    clipPath: `inset(0% round ${getComputedStyle(image).borderTopLeftRadius || '0px'})`,
    opacity: '1',
  });
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastEngine: MotionEngine | null = null, version = 0, active = false;
  let afterClose: (()=>void) | null = null;
  const running = new Set<Animation>();
  const animate = (el: HTMLElement, frames: Keyframe[], duration: number, done?: () => void) => {
    const animation = el.animate(frames, { duration, easing: tileEase, fill: 'both' });
    running.add(animation);
    animation.finished.then(() => {
      running.delete(animation);
      done?.();
      animation.cancel();
    }, () => running.delete(animation));
  };
  const stop = () => {
    ++version;
    for (const animation of running) animation.cancel();
    running.clear();
    lastEngine?.gsap.killTweensOf(targets);
  };
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
    open(from: Origin) {
      finish();active=true;
      if (from && !(from instanceof HTMLElement)) {
        const geometry = tilePose(image, from);
        if (geometry && !media.matches) animate(image, [geometry, tileRest()], 460);
        return;
      }
      const m=motion();lastEngine=m;
      if(!m||!from)return;
      const geometry=fit(from,m);if(!geometry)return;
      const token=version;
      // 暗幕与关闭按钮在等图时已经可见，解码完成后只展开照片，避免二次闪亮。
      m.gsap.fromTo(image,{...geometry,opacity:1},{x:0,y:0,scaleX:1,scaleY:1,rotation:0,skewX:0,duration:.38,ease:'power3.out',onComplete:()=>{if(token===version)clear();}});
    },
    change(direction: number, fromTile = false) {
      finish();active=true;
      if (fromTile && !media.matches) {
        animate(image, [{ transform: `translateX(${direction * 20}px)`, opacity: '.55' }, tileRest()], 230);
        return;
      }
      const m=motion();lastEngine=m;if(!m)return;
      const token=version;
      m.gsap.fromTo(image,{x:direction*24,opacity:.55},{x:0,opacity:1,duration:.22,ease:'power2.out',onComplete:()=>{if(token===version)clear();}});
    },
    close(to: Origin, done: ()=>void, fromTile = false) {
      if (fromTile || (to && !(to instanceof HTMLElement))) {
        const style = getComputedStyle(image);
        const start = { transform: style.transform, clipPath: style.clipPath === 'none' ? tileRest().clipPath : style.clipPath, opacity: style.opacity };
        stop();afterClose=done;
        if (media.matches) { finish(); return; }
        const geometry = to && !(to instanceof HTMLElement) ? tilePose(image, to) : null;
        const duration = geometry ? 340 : 210;
        for (const el of [bar, backdrop, ...controls]) animate(el, [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], duration);
        animate(image, [start, geometry ?? { ...start, opacity: '0' }], duration, finish);
        return;
      }
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
