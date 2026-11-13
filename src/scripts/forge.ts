import { onPage } from './page-lifecycle';
import { createForgeScrollLock } from './forge-scroll-lock';
import { initProjectDialogs } from './project-dialog-motion';

/** 本页控制器只读取构建好的正文，不接收 HTML 字符串，也不执行发布。 */
export function initForge(body: HTMLElement): () => void {
  const events = new AbortController(), options = {signal:events.signal};
  const hero = body.querySelector<HTMLElement>('.hero'), stage = body.querySelector<HTMLElement>('.hero-stage');
  const canvas = body.querySelector<HTMLCanvasElement>('#forge-scene');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)'), finePointer = matchMedia('(hover:hover) and (pointer:fine)');
  const stages = [...body.querySelectorAll<HTMLButtonElement>('[data-stage]')];
  const arrival = [...body.querySelectorAll<HTMLElement>('.arrival-note')];
  const caption = body.querySelector<HTMLElement>('#stage-caption');
  const captions: string[] = JSON.parse(caption?.dataset.captions || '[]');
  let reduced = reducedQuery.matches;
  let projectDialogs: ReturnType<typeof initProjectDialogs> | undefined;
  let disposed = false, scene: any, start = 0, distance = 1, pending = 0, activeStage = -1;
  const scrollLock=createForgeScrollLock(body,()=>({start,end:start+distance}));
  const clamp = (v:number) => Math.min(1,Math.max(0,v));
  const ease = (a:number,b:number,x:number) => { const t=clamp((x-a)/(b-a));return t*t*(3-2*t); };
  const draw = (progress:number,release=1) => {
    if (!stage || disposed) return;
    scrollLock.frame(release);
    if (reduced) progress=0;
    stage.style.setProperty('--progress', String(progress));
    stage.style.setProperty('--leave', String(ease(.22,.47,progress)));
    stage.style.setProperty('--connection', String(ease(.3,.47,progress)*(1-ease(.64,.76,progress))));
    const amount = ease(.68,.93,progress); stage.style.setProperty('--arrive',String(amount));
    stage.dataset.progress = progress.toFixed(3);
    const step=progress<.28?0:progress<.78?1:2;
    if(step!==activeStage){activeStage=step;stages.forEach((button,i)=>i===step?button.setAttribute('aria-current','step'):button.removeAttribute('aria-current'));if(caption)caption.textContent=captions[step]||'';}
    arrival.forEach(note=>{note.classList.toggle('is-active',amount>.9);note.inert=amount<.9;});
  };
  const update = () => { pending=0;const progress=clamp((scrollY-start)/distance);if(scene)scene.setProgress(progress);else draw(progress); };
  const measure = () => { if(!hero||!stage)return;start=hero.getBoundingClientRect().top+scrollY;distance=Math.max(1,hero.offsetHeight-stage.offsetHeight);update(); };
  const theme = () => { const value=document.documentElement.classList.contains('dark')?'dark':'light';scene?.setTheme(value); };
  /* ★ 拖动软条时 ∞ 的反光跟手（站主 2026-11-13）。mixed 里没有 `--forge-break-glint`
     （它两档都是 var() 引用、进不了预览的纯 hex 表），这里拿它两端的实际目标
     （亮档 --forge-light-key、暗档 --accent）自己按进度插值补进表再交给场景。 */
  const hexLerp = (a: string, b: string, t: number): string => {
    const n = (h: string) => [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16));
    const A = n(a), B = n(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const preview = (event: Event) => {
    const detail = (event as CustomEvent<{ progress?: number; mixed?: Record<string, string> }>).detail;
    if (!scene || !detail?.mixed) return;
    const w = detail.progress ?? 0;
    const mixed = { ...detail.mixed };
    const glintA = mixed['--forge-light-key'], glintB = mixed['--accent'];
    if (glintA && glintB) mixed['--forge-break-glint'] = hexLerp(glintA, glintB, w);
    scene.setPreview(mixed, w);
  };
  const motion = (value:boolean) => {
    scrollLock.setReady(Boolean(scene)&&!value);
    if(value)projectDialogs?.finishMotion();
    reduced=value;body.dataset.motion=value?'reduce':'full';
    scene?.setReduced(value);measure();
  };
  document.addEventListener('themechange',theme,options);
  document.addEventListener('themepreview',preview,options);
  reducedQuery.addEventListener('change',event=>motion(event.matches),options);
  window.addEventListener('scroll',()=>{if(!pending)pending=requestAnimationFrame(update);},{...options,passive:true});
  window.addEventListener('resize',measure,{...options,passive:true});
  canvas?.addEventListener('webglcontextlost',()=>scrollLock.setReady(false),options);
  canvas?.addEventListener('webglcontextrestored',()=>scrollLock.setReady(Boolean(scene)&&!reduced),options);
  window.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'&&!reduced&&scrollY<start+distance+100)scene?.setPointer(event.clientX/innerWidth*2-1,event.clientY/innerHeight*2-1);},{...options,passive:true});
  document.documentElement.addEventListener('pointerleave',()=>scene?.setPointer(0,0),options);
  stages.forEach(button=>button.addEventListener('click',()=>scrollTo({top:start+distance*Number(button.dataset.stage),behavior:reduced?'instant':'smooth'}),options));
  const observer = new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.12});
  body.querySelectorAll('.reveal').forEach(element=>observer.observe(element));body.classList.add('js-ready');
  if(canvas) import('./forge-scene.js').then(({createForgeScene})=>{
    if(disposed)return;scene=createForgeScene(canvas,draw);theme();motion(reduced);measure();
  }).catch(()=>{scrollLock.setReady(false);if(!disposed)canvas.parentElement!.dataset.ready='false';});
  theme();motion(reduced);measure();

  // 同一模板适用于真实照片、网页模型和后续的手工作品，触摸设备不绑定跟手倾斜。
  body.querySelectorAll<HTMLElement>('[data-effect="tilt"]').forEach(visual=>{
    const clear=()=>{visual.style.removeProperty('--tilt-x');visual.style.removeProperty('--tilt-y');};
    visual.addEventListener('pointermove',event=>{if(reduced||!finePointer.matches||event.pointerType!=='mouse')return;const r=visual.getBoundingClientRect();visual.style.setProperty('--tilt-x',`${-(event.clientY-r.top-r.height/2)/r.height*8}deg`);visual.style.setProperty('--tilt-y',`${(event.clientX-r.left-r.width/2)/r.width*10}deg`);},{...options,passive:true});
    visual.addEventListener('pointerleave',clear,options);visual.addEventListener('blur',clear,options);
  });
  projectDialogs=initProjectDialogs(body,()=>reduced);
  return ()=>{if(disposed)return;disposed=true;events.abort();scrollLock.dispose();observer.disconnect();if(pending)cancelAnimationFrame(pending);scene?.dispose();projectDialogs?.dispose();body.classList.remove('js-ready');};
}
onPage(({document}) => initForge(document.body), 'body.forge-page');
