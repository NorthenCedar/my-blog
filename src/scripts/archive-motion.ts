import { getMotion, type MotionEngine } from './motion-loader';

export function createArchiveMotion(host: HTMLElement, engine: () => MotionEngine | null = getMotion) {
  const targets = [...host.querySelectorAll<HTMLElement>('.yeargroup,.index li')];
  const original = new Map(targets.map(el => [el, el.getAttribute('style')]));
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current: ReturnType<MotionEngine['Flip']['from']> | null = null;
  let lastEngine: MotionEngine | null = null;
  let version = 0;
  const restore = () => targets.forEach(el => {
    const style = original.get(el);
    if (style === null) el.removeAttribute('style'); else el.setAttribute('style', style!);
    el.removeAttribute('aria-hidden');
  });
  const finish = () => {
    ++version; current?.kill(); current = null;
    const motion = lastEngine;
    motion?.Flip.killFlipsOf(targets, false); motion?.gsap.killTweensOf(targets);
    restore();
  };
  window.addEventListener('resize', finish, {passive:true});
  media.addEventListener('change', finish);
  return {
    run(update: () => void) {
      const motion = media.matches ? null : engine();
      if (!motion) { finish(); update(); return; }
      lastEngine = motion;
      const token = ++version;
      current?.kill();
      motion.Flip.killFlipsOf(targets, false); motion.gsap.killTweensOf(targets);
      const state = motion.Flip.getState(targets, {props:'opacity'});
      restore();
      update();
      targets.forEach(el => { if (el.hidden) el.setAttribute('aria-hidden','true'); });
      current = motion.Flip.from(state, {
        duration:.28, ease:'power2.inOut', nested:true, absoluteOnLeave:true,
        onEnter: elements => motion.gsap.fromTo(elements, {opacity:0}, {opacity:1,duration:.18,stagger:.015}),
        onLeave: elements => motion.gsap.to(elements, {opacity:0,duration:.12}),
        onComplete: () => { if (token === version) { current = null; restore(); } },
      });
    },
    finish,
    dispose() { finish(); window.removeEventListener('resize',finish); media.removeEventListener('change',finish); },
  };
}
