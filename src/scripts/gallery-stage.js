import {mountWheelNavigation,createNavigator,swipeIntent} from './gallery-stage-core.mjs';
import './develop';
import {finishGalleryEntry} from './gallery-entry';
import {mountOriginalHelix} from './gallery-native.js';
import {coverMotion} from './gallery-cover-motion.mjs';
import '../styles/gallery-stage.css';
import { onPage } from './page-lifecycle';
onPage(({document, addEventListener, matchMedia, ResizeObserver}) => {
const root=document.documentElement,stage=document.querySelector('[data-stage]'),slides=[...document.querySelectorAll('[data-slide]')];
const selection=createNavigator(slides.length),reduce=matchMedia('(prefers-reduced-motion:reduce)');
const prev=document.querySelector('[data-prev]'),next=document.querySelector('[data-next]'),status=document.querySelector('[data-status]');
const dialog=document.querySelector('.gallery-catalog'),catalogButton=document.querySelector('[data-catalog]');
const animations=new Map();let generation=0;
const helix=mountOriginalHelix(document.querySelector('.kind-spiral'));
const film=document.querySelector('[data-film]');
const overlayOpen=()=>dialog.open||helix.lightboxOpen||!!document.querySelector('dialog:modal,[data-notices][aria-expanded="true"]');
const publicFooter=document.querySelector('body.gallery-story>.foot');if(publicFooter)document.querySelector('[data-gallery-site-meta]').append(publicFooter);
document.body.append(dialog);
finishGalleryEntry(root,reduce.matches);
const topbar=document.querySelector('body.gallery-story>.topbar');
function measureChrome(){root.style.setProperty('--gallery-topbar-height',`${topbar.getBoundingClientRect().height}px`)}
new ResizeObserver(measureChrome).observe(topbar);measureChrome();
const bath=document.querySelector('[data-bath]'),bathReady=bath&&!bath.hidden;
root.classList.add('gallery-stage-ready');
// 新输入接管当前姿态；取消旧动画之前先保存计算值，不让反向闪回起点。
function cancel(el){
  const animation=animations.get(el);if(!animation)return;
  const style=getComputedStyle(el),last=animation.effect.getKeyframes().at(-1);
  for(const key of Object.keys(last))if(!['offset','computedOffset','easing','composite'].includes(key))el.style[key]=style[key];
  animation.cancel();animations.delete(el);
}
function animate(el,to,{duration=650,delay=0,easing='cubic-bezier(.18,.8,.18,1)'}={}){
  cancel(el);if(reduce.matches){Object.assign(el.style,to);return Promise.resolve()}
  const style=getComputedStyle(el),from=Object.fromEntries(Object.keys(to).map(key=>[key,style[key]]));
  const animation=el.animate([from,to],{duration,delay,easing,fill:'both'});animations.set(el,animation);
  return animation.finished.then(()=>{if(animations.get(el)!==animation)return;Object.assign(el.style,to);animation.cancel();animations.delete(el)}).catch(()=>{});
}
function hide(slide){
  for(const el of [slide,...slide.querySelectorAll('[data-reveal],[data-draw],.cover-link img')])cancel(el);
  slide.classList.remove('is-active','is-out');slide.style.visibility='hidden';slide.style.opacity='0';slide.inert=true;slide.setAttribute('aria-hidden','true');
}
function syncHint(target=slides[selection.index]){
  document.querySelector('.desktop-hint').textContent=target.dataset.kind==='spiral'?'盘外滚轮翻页':'滚动翻页';
  document.querySelector('[data-hint]').textContent=target.dataset.kind==='develop'?'涂抹显影，再往下翻':target.dataset.kind==='spiral'?(reduce.matches?'平铺浏览 · 点图看大图':'点选放大 · 再点看大图'):'点击照片或文字看相册';
}
function show(index,direction=1,initial=false){
  const old=slides[selection.index],wasActive=slides[index]?.classList.contains('is-active');
  if(wasActive&&!initial)return;
  const previousIndex=selection.index;selection.go(index);index=selection.index;const target=slides[index];if(!target)return;
  const revision=++generation;
  root.classList.toggle('on-develop',target.dataset.kind==='develop');
  if(bathReady)bath.hidden=target.dataset.kind!=='develop';
  root.classList.toggle('on-spiral',target.dataset.kind==='spiral');
  helix.setActive(target.dataset.kind==='spiral');
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
  if(image){if(!returning){cancel(image);image.style.transform=`translateX(${direction*2}%) scale(1.055)`;}
  animate(image,{transform:'translateX(0%) scale(1)'},{duration:1100});}
  for(const el of target.querySelectorAll('[data-reveal]')){
    const order=Number(el.dataset.order);
    if(!returning){cancel(el);el.style.opacity=order<0?'0':'1';el.style.transform=order<0?'translateY(12px)':order<3?'translateY(120%) rotate(2deg)':'translateY(20px)';if(order>=3)el.style.opacity='0';}
    animate(el,{opacity:'1',transform:'translateY(0px) rotate(0deg)'},{duration:order<3?720:560,delay:reduce.matches?0:Math.max(80,180+order*80)});
  }
  for(const path of target.querySelectorAll('[data-draw]')){
    if(!returning){cancel(path);path.style.strokeDashoffset='1000';}
    animate(path,{strokeDashoffset:'0'},{duration:path.classList.contains('main-ink')?1180:800,delay:Number(path.dataset.delay)||0,easing:'cubic-bezier(.32,.06,.18,1)'});
  }
  document.querySelector('[data-current]').textContent=String(index+1).padStart(2,'0');
  document.querySelector('[data-current-title]').textContent=target.dataset.title;
  status.textContent=`第 ${index+1} 幕，共 ${slides.length} 幕：${target.dataset.title}`;
  syncHint(target);
  prev.disabled=index===0;next.disabled=index===slides.length-1;
  for(const button of dialog.querySelectorAll('[data-pick]'))button.setAttribute('aria-current',String(Number(button.dataset.pick)===index));
  stage.dataset.active=String(index);stage.dataset.generation=String(revision);
  try{history.replaceState({...history.state,galleryScene:index},'')}catch{}
}
function go(index){const current=selection.index;const clamped=Math.max(0,Math.min(slides.length-1,index));if(clamped!==current)show(clamped,Math.sign(clamped-current))}
prev.addEventListener('click',()=>go(selection.index-1));next.addEventListener('click',()=>go(selection.index+1));
document.querySelector('[data-advance]').addEventListener('click',()=>go(1));
mountWheelNavigation(document,{scene:()=>slides[selection.index].dataset.kind,blocked:overlayOpen,nativeScroll:event=>!root.classList.contains('sp-on')&&!!event.target.closest('.original-plate'),inside:event=>!!event.target.closest('[data-spiral]')&&helix.containsPoint(event.clientX,event.clientY),flip:direction=>go(selection.index+direction)});
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
  if(!root.classList.contains('sp-on')&&event.target.closest('.original-plate'))return;
  const key=event.key;let index=null;
  if(slides[selection.index].dataset.kind==='spiral'&&['ArrowLeft','ArrowRight'].includes(key)){event.preventDefault();helix.step(key==='ArrowRight'?1:-1);return;}
  if(['ArrowDown','ArrowRight','PageDown'].includes(key))index=selection.index+1;
  if(['ArrowUp','ArrowLeft','PageUp'].includes(key))index=selection.index-1;
  if(key==='Home')index=0;if(key==='End')index=slides.length-1;
  if(key===' '&&!event.target.closest('a,button'))index=selection.index+1;
  if(index!==null){event.preventDefault();go(index)}
});
let touch=null;
stage.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&!event.target.closest('[data-bath]')&&!(!root.classList.contains('sp-on')&&event.target.closest('.original-plate')))touch={x:event.clientX,y:event.clientY,target:event.target}});
stage.addEventListener('pointerup',event=>{
  if(event.pointerType!=='touch'||!touch)return;const direction=swipeIntent(event.clientX-touch.x,event.clientY-touch.y);touch=null;
  if(direction){go(selection.index+direction);suppressClickUntil=performance.now()+400;}
});
stage.addEventListener('pointercancel',()=>{touch=null});
let suppressClickUntil=0;
stage.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopPropagation()}},true);
catalogButton.addEventListener('click',()=>dialog.showModal());document.querySelector('[data-close-catalog]').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}});
for(const button of dialog.querySelectorAll('[data-pick]'))button.addEventListener('click',()=>{go(Number(button.dataset.pick));dialog.close()});
dialog.addEventListener('close',()=>catalogButton.focus({preventScroll:true}));
reduce.addEventListener('change',()=>{syncHint();if(reduce.matches)for(const [el,animation]of [...animations]){const to=animation.effect.getKeyframes().at(-1);cancel(el);for(const key of Object.keys(to))if(!['offset','computedOffset','easing','composite'].includes(key))el.style[key]=to[key];} });
for(const slide of slides)hide(slide);const saved=history.state?.galleryScene;show(Number.isInteger(saved)&&saved>=0&&saved<slides.length?saved:0,1,true);

},"[data-stage]");
