import { getTheme, setTheme } from './theme';
import { createForgeScrollLock } from './forge-scroll-lock';

/** 本页控制器只读取构建好的正文，不接收 HTML 字符串，也不执行发布。 */
export function initForge(body: HTMLElement): () => void {
  const events = new AbortController(), options = {signal:events.signal};
  const hero = body.querySelector<HTMLElement>('.hero'), stage = body.querySelector<HTMLElement>('.hero-stage');
  const canvas = body.querySelector<HTMLCanvasElement>('#forge-scene');
  const motionButton = body.querySelector<HTMLButtonElement>('.motion-toggle'), themeButton = body.querySelector<HTMLButtonElement>('.theme-toggle');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)'), finePointer = matchMedia('(hover:hover) and (pointer:fine)');
  const stages = [...body.querySelectorAll<HTMLButtonElement>('[data-stage]')];
  const arrival = [...body.querySelectorAll<HTMLElement>('.arrival-note')];
  const caption = body.querySelector<HTMLElement>('#stage-caption');
  const captions: string[] = JSON.parse(caption?.dataset.captions || '[]');
  // 页面返回可能命中 bfcache，也可能重新载入；两条路径都保留本标签页的手动选择。
  let motionChoice: string | null = null;
  try { motionChoice=sessionStorage.getItem('forge-motion'); } catch { motionChoice=body.dataset.motion || null; }
  let reduced = motionChoice ? motionChoice === 'reduce' : reducedQuery.matches;
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
  const theme = () => { const value=document.documentElement.classList.contains('dark')?'dark':'light';themeButton?.setAttribute('aria-label',value==='dark'?'切换为亮色':'切换为暗色');scene?.setTheme(value); };
  const motion = (value:boolean) => {
    scrollLock.setReady(Boolean(scene)&&!value);
    reduced=value;body.dataset.motion=value?'reduce':'full';motionButton?.setAttribute('aria-pressed',String(value));motionButton?.setAttribute('aria-label',value?'启用动态':'减少动态');
    if(motionButton?.firstChild)motionButton.firstChild.textContent=value?'静态 ':'动态 ';scene?.setReduced(value);measure();
  };
  themeButton?.addEventListener('click',()=>setTheme(getTheme()==='dark'?'light':'dark'),options);
  document.addEventListener('themechange',theme,options);
  motionButton?.addEventListener('click',()=>{motionChoice=reduced?'full':'reduce';try{sessionStorage.setItem('forge-motion',motionChoice);}catch{}motion(!reduced);},options);
  reducedQuery.addEventListener('change',event=>{if(!motionChoice)motion(event.matches);},options);
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
  const dialogs=[...body.querySelectorAll<HTMLDialogElement>('.project-dialog')];
  let current:HTMLDialogElement|null=null, trigger:HTMLElement|null=null, animation:Animation|null=null, closing=false, previousOverflow='';
  const restore=()=>{body.style.overflow=previousOverflow;current=null;closing=false;animation?.cancel();animation=null;trigger?.focus({preventScroll:true});};
  const close=async()=>{
    if(!current||closing)return;closing=true;const dialog=current;animation?.cancel();
    if(reduced||typeof dialog.animate!=='function'){dialog.close();restore();return;}
    animation=dialog.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.97) translateY(8px)'}],{duration:reduced?1:220,easing:'cubic-bezier(.4,0,.8,1)',fill:'forwards'});
    try{await animation.finished;}catch{}
    if(disposed)return;dialog.close();restore();
  };
  body.querySelectorAll<HTMLAnchorElement>('[data-project-open]').forEach(link=>link.addEventListener('click',event=>{
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
    const dialog=dialogs.find(item=>item.id===`project-${link.dataset.projectOpen}`);
    if(!dialog||typeof dialog.showModal!=='function')return;event.preventDefault();if(current)return;
    trigger=link;current=dialog;previousOverflow=body.style.overflow;body.style.overflow='hidden';dialog.showModal();dialog.scrollTop=0;
    const from=link.getBoundingClientRect(),to=dialog.getBoundingClientRect();
    if(!reduced&&typeof dialog.animate==='function')animation=dialog.animate([{opacity:0,transform:`translate(${(from.left+from.width/2-to.left-to.width/2)*.12}px,${(from.top+from.height/2-to.top-to.height/2)*.12}px) scale(.94)`},{opacity:1,transform:'translate(0,0) scale(1)'}],{duration:430,easing:'cubic-bezier(.22,1,.36,1)'});
  },options));
  dialogs.forEach(dialog=>{
    dialog.querySelector('[aria-label="关闭作品详情"]')?.addEventListener('click',close,options);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();},options);
    dialog.addEventListener('close',()=>{if(current===dialog&&!dialog.open)restore();},options);
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();},options);
  });
  return ()=>{if(disposed)return;disposed=true;events.abort();scrollLock.dispose();observer.disconnect();if(pending)cancelAnimationFrame(pending);scene?.dispose();animation?.cancel();if(current){current.close();body.style.overflow=previousOverflow;}body.classList.remove('js-ready');};
}
let cleanup = () => {};
function mount(){cleanup();if(document.body.classList.contains('forge-page'))cleanup=initForge(document.body);}
mount();window.addEventListener('pagehide',()=>cleanup());window.addEventListener('pageshow',event=>{if(event.persisted)mount();});
