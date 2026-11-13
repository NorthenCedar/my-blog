import { showBig, prefetch, intentPrefetch } from './big-image';
import { getMotion, primeMotion, type MotionEngine } from './motion-loader';
import { createLightboxMotion, type TileOrigin } from './lightbox-motion';

export interface PhotoWallTile {
  trigger: HTMLElement | null;
  readOrigin: () => TileOrigin | undefined;
  setSourceHidden?: (hidden: boolean) => void;
}

export interface PhotoWallOpen extends PhotoWallTile {
  selectTile?: (index: number, direction: number) => PhotoWallTile | undefined;
}

type Imaging = {showBig: typeof showBig; prefetch: typeof prefetch; intentPrefetch: typeof intentPrefetch};
export function initPhotoWall(doc: Document, imaging: Imaging = {showBig,prefetch,intentPrefetch}, engine: ()=>MotionEngine|null=getMotion): ()=>void {
  const figs=[...doc.querySelectorAll<HTMLElement>('.wf figure')];
  const lb=doc.getElementById('lb');if(!lb||!figs.length)return()=>{};
  const win=doc.defaultView!;
  // 固定层脱离正文装饰的包含块，沿用本站灯箱 z-index 阶梯。
  doc.body.append(lb);
  const lbImg=doc.getElementById('lbImg') as HTMLImageElement;
  const lbAlbum=doc.getElementById('lbAlbum')!,lbCap=doc.getElementById('lbCap')!,lbPos=doc.getElementById('lbPos')!;
  const lbClose=doc.getElementById('lbClose') as HTMLButtonElement,lbPrev=doc.getElementById('lbPrev') as HTMLButtonElement,lbNext=doc.getElementById('lbNext') as HTMLButtonElement;
  const status=doc.getElementById('lbStatus')!;
  const events=new AbortController(),options={signal:events.signal};
  const motion=createLightboxMotion(lb,lbImg,engine);
  const unprime=primeMotion(doc.querySelector<HTMLElement>('.wf')!);
  let cur=0,shown=-1,request=0,opened=false,closing=false,live=true;
  let lastFocus:HTMLElement|null=null,previousOverflow='';
  let tileView: PhotoWallOpen | undefined;
  let shownTile: PhotoWallTile | undefined, shownThumb: HTMLImageElement | null = null;
  let pressedInLightbox=false;
  let inert:Map<HTMLElement,boolean>=new Map();
  const bigOf=(fig:HTMLElement|null|undefined)=>fig?.querySelector<HTMLAnchorElement>('a.frame')?.getAttribute('href');
  const busy=(value:boolean)=>{lb.setAttribute('aria-busy',String(value));status.hidden=!value;if(value)status.textContent='正在载入照片…';};
  const deactivate=(focus=true)=>{
    ++request;opened=false;closing=false;shown=-1;
    lb.classList.remove('on');delete lb.dataset.tileOpen;delete lb.dataset.exhibit;
    shownTile?.setSourceHidden?.(false);
    shownThumb?.removeAttribute('data-photo-wall-hidden');shownThumb=null;
    tileView=shownTile=undefined;
    busy(false);lbImg.removeAttribute('src');lbImg.dataset.big='';
    doc.body.style.overflow=previousOverflow;
    inert.forEach((value,el)=>{el.inert=value;});inert.clear();
    if(focus&&lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
  };
  const paint=(first=false,direction=1)=>{
    const i=cur,fig=figs[i],token=++request;
    busy(true);
    // 图像与文字一起提交；同图重开也用请求版本隔离旧会话。
    imaging.showBig(lbImg,bigOf(fig)!,()=>{
      if(i!==cur)return;
      if(!live||!opened||closing||token!==request)return;
      busy(false);
      if(lbImg.complete&&!lbImg.naturalWidth){
        motion.finish();lbImg.style.visibility='hidden';status.hidden=false;status.textContent='照片未能载入，请关闭后重试。';return;
      }
      lbImg.alt=fig.dataset.cap||'';lbAlbum.textContent=fig.dataset.albumTitle||'';lbCap.textContent=fig.dataset.cap||'';lbPos.textContent=String(i+1);
      lbImg.style.removeProperty('visibility');
      const nextTile=first ? tileView : tileView?.selectTile?.(i,direction);
      if(shownTile!==nextTile)shownTile?.setSourceHidden?.(false);
      shownTile=nextTile;
      if(!first&&!tileView)fig.dispatchEvent(new CustomEvent('photo-wall:select',{bubbles:true}));
      const origin=shownTile?.readOrigin();
      shownTile?.setSourceHidden?.(true);
      const inExhibit=lb.hasAttribute('data-exhibit');
      if(shownTile?.trigger)lastFocus=shownTile.trigger;
      const thumb=fig.querySelector('img');
      if(inExhibit&&!tileView){
        shownThumb?.removeAttribute('data-photo-wall-hidden');
        shownThumb=thumb;shownThumb?.setAttribute('data-photo-wall-hidden','');
        lastFocus=fig.querySelector('a.frame');
      }
      if(first)motion.open(origin ?? thumb);
      else motion.change(direction, inExhibit);
      shown=i;
    });
    imaging.prefetch(bigOf(figs[i+1]));
  };
  const open=(fig:HTMLElement,trigger:HTMLElement,source?:PhotoWallOpen)=>{
    if(!live)return;
    const i=figs.indexOf(fig);if(i<0)return;
    if(opened){motion.finish();if(opened)deactivate(false);}
    tileView=source;pressedInLightbox=false;
    if(source)lb.dataset.tileOpen='';
    if(source||fig.closest('[data-album-scene].scene-on'))lb.dataset.exhibit='';
    cur=i;shown=-1;opened=true;closing=false;lastFocus=trigger;previousOverflow=doc.body.style.overflow;
    inert=new Map([...doc.body.children].filter((el):el is HTMLElement=>el instanceof HTMLElement&&el!==lb).map(el=>[el,el.inert]));
    inert.forEach((_,el)=>{el.inert=true;});
    doc.body.style.overflow='hidden';lb.classList.add('on');lbImg.style.visibility='hidden';
    lbAlbum.textContent='';lbCap.textContent='';lbPos.textContent='—';
    lbClose.focus({preventScroll:true});paint(true);
  };
  const step=(direction:number)=>{
    if(!opened||closing||figs.length<2)return;
    cur=(cur+direction+figs.length)%figs.length;
    paint(false,direction);
  };
  const close=()=>{
    if(!opened||closing)return;
    closing=true;++request;busy(false);
    const index=shown>=0?shown:cur;
    const origin=figs[index]?.querySelector('img');
    const target=tileView
      ? shownTile?.readOrigin() ?? null
      : (origin?.isConnected ? origin : null);
    motion.close(target,()=>deactivate(),Boolean(tileView));
  };
  figs.forEach(fig=>{
    const a=fig.querySelector<HTMLAnchorElement>('a.frame')!;
    a.addEventListener('click',event=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();open(fig,a);},options);
    a.addEventListener('photo-wall:open', event => {
      const source = (event as CustomEvent<PhotoWallOpen>).detail;
      event.preventDefault();
      if (!opened) open(fig, source.trigger ?? a, source);
    }, options);
    imaging.intentPrefetch(a,()=>a.getAttribute('href'),250,events.signal);
  });
  lb.addEventListener('pointerdown',()=>{pressedInLightbox=true;},options);
  lb.addEventListener('pointercancel',()=>{pressedInLightbox=false;},options);
  lb.addEventListener('click',event=>{
    const pressed=pressedInLightbox;pressedInLightbox=false;
    // 画布在 pointerup 打开灯箱，触屏随后补发的 click 会落进刚出现的弹层。
    if(lb.hasAttribute('data-tile-open')&&event.detail>0&&!pressed){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },{...options,capture:true});
  lbClose.addEventListener('click',close,options);lbPrev.addEventListener('click',()=>step(-1),options);lbNext.addEventListener('click',()=>step(1),options);
  lb.addEventListener('click',event=>{if(event.target===lb||event.target===lb.querySelector('.lb-backdrop')||event.target===lb.querySelector('.lb-stage'))close();},options);
  doc.addEventListener('keydown',event=>{
    if(!opened)return;
    if(event.key==='Escape'){event.preventDefault();close();}
    else if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}
    else if(event.key==='ArrowRight'){event.preventDefault();step(1);}
    else if(event.key==='Tab'){
      const controls=[lbClose,lbPrev,lbNext],i=controls.indexOf(doc.activeElement as HTMLButtonElement);
      event.preventDefault();controls[(i+(event.shiftKey?-1:1)+controls.length)%controls.length].focus({preventScroll:true});
    }
  },options);
  const leave=()=>{motion.finish();if(opened)deactivate(false);};
  win.addEventListener('pagehide',leave,options);
  return()=>{if(!live)return;live=false;leave();events.abort();unprime();motion.dispose();};
}
