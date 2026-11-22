import {mountWheelNavigation,createNavigator,swipeIntent} from './gallery-stage-core.mjs';
import './develop';
import {finishGalleryEntry} from './gallery-entry';
import {coverMotion} from './gallery-cover-motion.mjs';
import { onPage } from './page-lifecycle';
onPage(({document, keep, matchMedia, ResizeObserver, requestAnimationFrame, addEventListener}) => {
const root=document.documentElement,stage=document.querySelector('[data-stage]'),slides=[...document.querySelectorAll('[data-slide]')];
if(!slides.length)return;
const selection=createNavigator(slides.length),reduce=matchMedia('(prefers-reduced-motion:reduce)');
const prev=document.querySelector('[data-prev]'),next=document.querySelector('[data-next]'),status=document.querySelector('[data-status]');
const dialog=document.querySelector('.gallery-catalog'),catalogButton=document.querySelector('[data-catalog]');
const animations=new Map();let generation=0;
const saved=history.state?.galleryScene;
let restoring=Number.isInteger(saved)&&saved>=0&&saved<slides.length;
const film=document.querySelector('[data-film]');
const overlayOpen=()=>!!(dialog&&dialog.open)||!!document.querySelector('dialog:modal,[data-notices][aria-expanded="true"]');
const siteMeta=document.querySelector('[data-gallery-site-meta]');
const publicFooter=document.querySelector('body.gallery-story>.foot');
keep(finishGalleryEntry(root,reduce.matches));
const topbar=document.querySelector('body.gallery-story>.topbar');
function measureChrome(){if(topbar)root.style.setProperty('--gallery-topbar-height',`${topbar.getBoundingClientRect().height}px`)}
if(topbar)new ResizeObserver(measureChrome).observe(topbar);measureChrome();
const bath=document.querySelector('[data-bath]'),bathReady=bath&&!bath.hidden;
// 新输入接管当前姿态；取消旧动画之前先保存计算值，不让反向闪回起点。
function cancel(el){
  const animation=animations.get(el);if(!animation)return;
  const style=getComputedStyle(el),last=animation.effect.getKeyframes().at(-1);
  for(const key of Object.keys(last))if(!['offset','computedOffset','easing','composite'].includes(key))el.style[key]=style[key];
  animation.cancel();animations.delete(el);
}
function animate(el,to,{duration=650,delay=0,easing='cubic-bezier(.18,.8,.18,1)'}={}){
  if(!el)return Promise.resolve();/* ★ 装饰层（film 等）落空时跳过，不能拖死第一幕 */
  try {
    cancel(el);
    if(!reduce.matches&&!restoring){
      const style=getComputedStyle(el),from=Object.fromEntries(Object.keys(to).map(key=>[key,style[key]]));
      const animation=el.animate([from,to],{duration,delay,easing,fill:'both'});animations.set(el,animation);
      return animation.finished.then(()=>{if(animations.get(el)!==animation)return;Object.assign(el.style,to);animation.cancel();animations.delete(el)}).catch(()=>{});
    }
  } catch { /* 单个动画失败时直接落到目标样式。 */ }
  Object.assign(el.style,to);
  return Promise.resolve();
}
function hide(slide){
  for(const el of [slide,...slide.querySelectorAll('[data-reveal],[data-draw],.cover-link img')])cancel(el);
  slide.classList.remove('is-active','is-out');slide.style.visibility='hidden';slide.style.opacity='0';slide.inert=true;slide.setAttribute('aria-hidden','true');
}
function syncHint(target=slides[selection.index]){
  const hints={arc:'左右拖动封面 · 点击进册'};
  const hint=document.querySelector('[data-hint]');if(hint)hint.textContent=hints[target.dataset.kind]||'点击照片或文字看相册';
}
function show(index,direction=1,initial=false){
  const old=slides[selection.index],wasActive=slides[index]?.classList.contains('is-active');
  if(wasActive&&!initial)return;
  const previousIndex=selection.index;selection.go(index);index=selection.index;const target=slides[index];if(!target)return;
  const revision=++generation;
  root.classList.toggle('on-develop',bathReady&&target.dataset.kind==='develop');
  if(bathReady)bath.hidden=target.dataset.kind!=='develop';
  const poses=['translate(0,0) rotate(-12deg) scale(1)','translate(4%,-3%) rotate(-9deg) scale(1.12)','translate(3%,1%) rotate(-14deg) scale(1)','translate(-4%,3%) rotate(11deg) scale(1.07)','translate(0,-4%) rotate(-5deg) scale(1.14)'];
  animate(film,{transform:poses[index%poses.length]},{duration:1150});
  for(const slide of slides)if(slide!==old&&slide!==target)hide(slide);
  if(old&&old!==target){
    old.classList.remove('is-active');old.classList.add('is-out');old.inert=true;old.setAttribute('aria-hidden','true');
    if(old.contains(document.activeElement))stage.focus({preventScroll:true});
    animate(old,coverMotion(old.dataset.transition,direction).exit,{duration:480}).then(()=>{if(revision===generation&&selection.index!==previousIndex)hide(old)});
  }
  const returning=target.classList.contains('is-out');
  cancel(target);target.classList.remove('is-out');target.classList.add('is-active');target.style.visibility='visible';target.inert=false;target.removeAttribute('aria-hidden');
  const motion=coverMotion(target.dataset.transition,direction);
  if(!returning)Object.assign(target.style,motion.enter);
  animate(target,motion.visible,{duration:760});
  const image=target.querySelector('.cover-link img');
  if(image){
    if(!returning){cancel(image);image.style.transform=`translateX(${direction*2}%) scale(1.055)`;}
    animate(image,{transform:'translateX(0%) scale(1)'},{duration:1100});
    const source=image.dataset.coverSrc;
    if(source)requestAnimationFrame(()=>{
      if(revision!==generation)return;
      const thumbnail=image.src;
      image.addEventListener('error',()=>{image.src=thumbnail;},{once:true});
      image.loading='eager';image.src=source;delete image.dataset.coverSrc;
    });
  }
  for(const el of target.querySelectorAll('[data-reveal]')){
    const order=Number(el.dataset.order);
    if(!returning){cancel(el);el.style.opacity=order<0?'0':'1';el.style.transform=order<0?'translateY(12px)':order<3?'translateY(120%) rotate(2deg)':'translateY(20px)';if(order>=3)el.style.opacity='0';}
    animate(el,{opacity:'1',transform:'translateY(0px) rotate(0deg)'},{duration:order<3?720:560,delay:reduce.matches?0:Math.max(80,180+order*80)});
  }
  for(const path of target.querySelectorAll('[data-draw]')){
    if(!returning){cancel(path);path.style.strokeDashoffset='1000';}
    animate(path,{strokeDashoffset:'0'},{duration:path.classList.contains('main-ink')?1180:800,delay:Number(path.dataset.delay)||0,easing:'cubic-bezier(.32,.06,.18,1)'});
  }
  const current=document.querySelector('[data-current]');if(current)current.textContent=String(index+1).padStart(2,'0');
  const currentTitle=document.querySelector('[data-current-title]');if(currentTitle)currentTitle.textContent=target.dataset.title;
  if(status)status.textContent=`第 ${index+1} 幕，共 ${slides.length} 幕：${target.dataset.title}`;
  syncHint(target);
  if(prev)prev.disabled=index===0;if(next)next.disabled=index===slides.length-1;
  for(const button of dialog?.querySelectorAll('[data-pick]')??[])button.setAttribute('aria-current',String(Number(button.dataset.pick)===index));
  stage.dataset.active=String(index);stage.dataset.generation=String(revision);
  try{history.replaceState({...history.state,galleryScene:index},'')}catch{}
}
function go(index){const current=selection.index;const clamped=Math.max(0,Math.min(slides.length-1,index));if(clamped!==current)show(clamped,Math.sign(clamped-current))}
/* ★ 绑定一律经 on()：控件缺了就跳过（装置降级），不许在首幕揭开前炸掉。 */
const on=(el,event,fn,options)=>el&&el.addEventListener(event,fn,options);
on(prev,'click',()=>go(selection.index-1));on(next,'click',()=>go(selection.index+1));
const advance=document.querySelector('[data-advance]');
on(advance,'click',()=>go(1));
addEventListener('hashchange',()=>{if(location.hash==='#gallery-overview')go(1);});
mountWheelNavigation(document,{
  scene:()=>slides[selection.index].dataset.kind,
  blocked:overlayOpen,
  passThrough:event=>{
    if(event.target.closest('[data-cover-canvas]'))return event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY);
    const list=event.target.closest('[data-arc-fallback]');
    return !!list&&(event.deltaY<0?list.scrollTop>0:list.scrollTop+list.clientHeight<list.scrollHeight-1);
  },
  flip:direction=>go(selection.index+direction)
});
// 浮在画布上的导航保持可点击；经过控件时把鼠标位置送回同一套显影逻辑。
let mirroredBathPointer=false,forwardingBathPointer=false;
document.addEventListener('pointermove',event=>{
  if(forwardingBathPointer)return;
  if(!bathReady||bath.hidden||overlayOpen()||event.pointerType!=='mouse'){mirroredBathPointer=false;return;}
  if(bath.contains(event.target)){mirroredBathPointer=false;return;}
  forwardingBathPointer=true;
  try{
    if(!mirroredBathPointer)bath.dispatchEvent(new PointerEvent('pointerenter',event));
    mirroredBathPointer=true;bath.dispatchEvent(new PointerEvent('pointermove',event));
  }finally{forwardingBathPointer=false;}
},{capture:true,passive:true});
document.addEventListener('pointerout',event=>{
  if(!bathReady||bath.hidden||event.relatedTarget!==null)return;
  mirroredBathPointer=false;bath.dispatchEvent(new PointerEvent('pointerleave',event));
},{passive:true});
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||overlayOpen()||event.ctrlKey||event.altKey||event.metaKey||event.target.closest('input,textarea,select,[contenteditable=true]'))return;
  const key=event.key;let index=null;
  if(['ArrowDown','ArrowRight','PageDown'].includes(key))index=selection.index+1;
  if(['ArrowUp','ArrowLeft','PageUp'].includes(key))index=selection.index-1;
  if(key==='Home')index=0;if(key==='End')index=slides.length-1;
  if(key===' '&&!event.target.closest('a,button'))index=selection.index+1;
  if(index!==null){event.preventDefault();go(index)}
});
let touch=null,suppressClickUntil=0;
on(stage,'pointerdown',event=>{
  suppressClickUntil=0;
  if(event.pointerType==='touch'&&event.isPrimary)touch={id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target};
},true);
on(stage,'pointerup',event=>{
  if(event.pointerId!==touch?.id)return;
  const {clientX,clientY}=event,dx=clientX-touch.x,dy=clientY-touch.y,target=touch.target;
  touch=null;
  // 紧接显影涂抹的轻触可能被浏览器抑制 click，按钮在确认抬手位置后直接翻页。
  const advanceTap=Math.hypot(dx,dy)<12&&advance?.contains(target)&&advance.contains(document.elementFromPoint(clientX,clientY));
  const direction=swipeIntent(dx,dy);
  if(!advanceTap&&!direction)return;
  // 抬手翻页后，浏览器仍可能把同一次触摸的点击派发到刚显示的封面。
  suppressClickUntil=performance.now()+400;
  go(advanceTap?1:selection.index+direction);
});
on(stage,'pointercancel',()=>{touch=null});
on(stage,'click',event=>{
  if(event.detail===0||performance.now()>=suppressClickUntil)return;
  suppressClickUntil=0;
  event.preventDefault();
  event.stopPropagation();
},true);
on(catalogButton,'click',()=>dialog.showModal());on(document.querySelector('[data-close-catalog]'),'click',()=>dialog.close());
on(dialog,'click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}});
for(const button of dialog?.querySelectorAll('[data-pick]')??[])on(button,'click',()=>{go(Number(button.dataset.pick));dialog.close()});
on(dialog,'close',()=>catalogButton?.focus({preventScroll:true}));
reduce.addEventListener('change',()=>{syncHint();if(reduce.matches)for(const [el,animation]of [...animations]){const to=animation.effect.getKeyframes().at(-1);cancel(el);for(const key of Object.keys(to))if(!['offset','computedOffset','easing','composite'].includes(key))el.style[key]=to[key];} });
// 首幕就绪后才启用固定舞台。初始化失败时恢复服务端目录和照片链接。
try {
  const initial=restoring?saved:location.hash==='#gallery-overview'?1:0;
  for(const slide of slides)hide(slide);
  show(!bathReady&&initial===0?1:initial,1,true);
  root.classList.add('gallery-stage-ready');
} catch(error) {
  root.classList.remove('on-develop');
  if(bath)bath.hidden=true;
  for(const animation of animations.values())animation.cancel();
  for(const slide of slides){
    slide.classList.remove('is-active','is-out');
    for(const name of ['visibility','opacity','transform','clip-path'])slide.style.removeProperty(name);
    slide.removeAttribute('aria-hidden');
    slide.inert=false;
    for(const el of slide.querySelectorAll('[data-reveal],[data-draw],.cover-link img')){
      for(const name of ['opacity','transform','stroke-dashoffset'])el.style.removeProperty(name);
    }
  }
  throw error;
}
if(publicFooter&&siteMeta)siteMeta.append(publicFooter);
if(dialog)document.body.append(dialog);
keep(()=>{
  for(const animation of animations.values())animation.cancel();
  if(dialog?.open)dialog.close();
  root.classList.remove('gallery-stage-ready','on-develop');
  root.style.removeProperty('--gallery-topbar-height');
});
restoring=false;

},"body.gallery-story [data-stage]");
