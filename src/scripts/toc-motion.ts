import { getMotion, primeMotion, warmMotion, type MotionEngine } from './motion-loader';

/** 指示线只跟踪目录的盒子，章节跳转仍由原生锚点负责。 */
export function createTocMotion(nav: HTMLElement, engine: ()=>MotionEngine|null=getMotion) {
  const host=nav.querySelector<HTMLElement>('.toc-index')!;
  const list=nav.querySelector<HTMLOListElement>('ol')!;
  const marker=nav.querySelector<HTMLElement>('[data-toc-marker]')!;
  const win=nav.ownerDocument.defaultView!;
  const media=win.matchMedia('(prefers-reduced-motion: reduce)');
  const unprime=primeMotion(nav);
  let current:HTMLAnchorElement|null=null,lastEngine:MotionEngine|null=null,live=true,position='';
  const stop=()=>lastEngine?.gsap.killTweensOf(marker);
  const place=(animate=true)=>{
    if(!live||!current)return;
    const row=current.getBoundingClientRect(),box=host.getBoundingClientRect();
    if(!row.width||!row.height||!box.width){marker.hidden=true;nav.removeAttribute('data-toc-enhanced');return;}
    const x=row.left-box.left,y=row.top-box.top,height=row.height;
    const key=[x,y,height].join(':');if(key===position&&!marker.hidden)return;
    position=key;
    const m=media.matches?null:engine();stop();
    marker.hidden=false;nav.setAttribute('data-toc-enhanced','');
    if(m&&animate&&lastEngine){
      lastEngine=m;m.gsap.to(marker,{x,y,scaleY:height,duration:.24,ease:'power3.out',overwrite:true});
    }else{
      lastEngine=m;
      if(m)m.gsap.set(marker,{x,y,scaleY:height});
      else marker.style.transform='translate('+x+'px, '+y+'px) scaleY('+height+')';
    }
  };
  const finish=()=>{stop();position='';place(false);};
  const follow=()=>{stop();position='';place(false);};
  const warm=()=>{void warmMotion().then(()=>{if(live)finish();});};
  // 阅读滚动本身就是意图；首屏静止时不下载引擎。
  win.addEventListener('scroll',warm,{once:true,passive:true});
  win.addEventListener('resize',finish,{passive:true});
  list.addEventListener('scroll',follow,{passive:true});
  media.addEventListener('change',finish);
  const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(finish):null;
  observer?.observe(nav);
  return {
    moveTo(link: HTMLAnchorElement, reveal=false) {
      if(!live||!nav.contains(link))return;
      current=link;
      if(reveal){
        const row=link.getBoundingClientRect(),box=list.getBoundingClientRect();
        if(row.top<box.top||row.bottom>box.bottom){
          const delta=row.top<box.top?row.top-box.top:row.bottom-box.bottom;
          list.scrollTo({top:Math.max(0,list.scrollTop+delta),behavior:media.matches?'instant':'smooth'});
        }
      }
      place();
    },
    finish,
    dispose(){
      if(!live)return;live=false;stop();unprime();observer?.disconnect();
      win.removeEventListener('scroll',warm);win.removeEventListener('resize',finish);list.removeEventListener('scroll',follow);media.removeEventListener('change',finish);
      marker.hidden=true;marker.removeAttribute('style');nav.removeAttribute('data-toc-enhanced');
    },
  };
}
