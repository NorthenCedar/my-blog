export type DockBox = {left:number;top:number;width:number;height:number};
type Size = {width:number;height:number};
type Insets = {left:number;right:number;top:number;bottom:number};

/** 只为固定工具留位置；正文控件滚入时让出点击，不重新寻找停靠点。 */
export function chooseMusicDock(width:number,height:number,size:Size,fixed:DockBox[],safe:Insets={left:0,right:0,top:0,bottom:0}): {left:number;top:number}|null {
  const margin=12,left=width-margin-safe.right-size.width,minTop=margin+safe.top;
  let top=height-margin-safe.bottom-size.height;
  if(left<margin+safe.left||top<minTop)return null;
  for(const r of [...fixed].sort((a,b)=>b.top-a.top)) {
    if (left < r.left + r.width + 8 && left + size.width > r.left - 8 &&
        top < r.top + r.height + 8 && top + size.height > r.top - 8) top = r.top - size.height - margin;
  }
  return top>=minTop?{left,top}:null;
}

export function createMusicDock(root:HTMLElement,onMove:()=>void) {
  const doc=root.ownerDocument,win=doc.defaultView!;
  const panel=root.querySelector<HTMLElement>('#music-panel')!,bar=root.querySelector<HTMLElement>('.music-bar')!;
  const fallback=doc.querySelector<HTMLElement>('[data-music-access]');
  const fixedSelector='[data-rule],[data-rail],.scene-controls,.chapter-nav,.hud,.osbar,[data-music-avoid]';
  const controls='button,a[href],input,select,textarea,summary,[role="button"]';
  const watched = controls + ',' + fixedSelector + ',footer';
  let live=true,frame=0,opened=false,position='',dirty=true,available=true,yielding=false,restoreTimer=0;
  let elements:HTMLElement[]=[],fixed:HTMLElement[]=[];
  const safeArea=()=>{
    const style=win.getComputedStyle(root),read=(name:string)=>parseFloat(style.getPropertyValue('--music-'+name))||0;
    return {left:read('safe-left'),right:read('safe-right'),top:read('safe-top'),bottom:read('safe-bottom'),pageBottom:read('page-bottom')};
  };
  const visibleStyle = (style: CSSStyleDeclaration) =>
    style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  const fixedBox = (el: HTMLElement): DockBox | null => {
    if (!el.isConnected) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const style = win.getComputedStyle(el);
    if (!visibleStyle(style)) return null;

    // 阅读尺从画外入场；底部工具条始终按最终停靠位置预留。
    const top = el.matches('[data-rule],.scene-controls,.chapter-nav')
      ? win.innerHeight - (parseFloat(style.bottom) || 0) - rect.height
      : rect.top;
    if (rect.right <= 0 || top + rect.height <= 0 || rect.left >= win.innerWidth || top >= win.innerHeight) return null;
    return { left: rect.left, top, width: rect.width, height: rect.height };
  };
  const coversControl = (el: HTMLElement, anchor: DOMRect) => {
    if (!el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const width = Math.min(anchor.right, rect.right) - Math.max(anchor.left, rect.left);
    const height = Math.min(anchor.bottom, rect.bottom) - Math.max(anchor.top, rect.top);
    if (width <= 0 || height <= 0 || width * height < rect.width * rect.height * .5) return false;

    if (el.closest('[inert],:disabled,[aria-disabled="true"],[aria-hidden="true"]')) return false;
    // 全屏手势面不当成独立按钮。
    if (el.matches('[role="button"]') && rect.width > win.innerWidth * .8 && rect.height > win.innerHeight * .6) return false;
    const style = win.getComputedStyle(el);
    return visibleStyle(style) && style.pointerEvents !== 'none';
  };
  const place = (part: string, x: number, y: number) => {
    root.style.setProperty(`--music-${part}-x`, x+'px');
    root.style.setProperty(`--music-${part}-y`, y+'px');
  };
  const placePanel=()=>{
    if(!opened)return;
    const hidden=panel.hidden,visibility=panel.style.visibility;
    panel.style.visibility='hidden';panel.hidden=false;
    const p=panel.getBoundingClientRect(),anchor=bar.getBoundingClientRect();
    panel.hidden=hidden;panel.style.visibility=visibility;
    const safe=safeArea(),minX=12+safe.left,minY=12+safe.top;
    const x=Math.max(minX,Math.min(win.innerWidth-p.width-12-safe.right,anchor.right-p.width));
    let y=anchor.top-p.height-12;
    if(y<minY)y=anchor.bottom+12;
    y=Math.max(minY,Math.min(win.innerHeight-p.height-12-safe.bottom,y));
    place('panel', x, y);
  };
  const update=()=>{
    if(frame)win.cancelAnimationFrame(frame);frame=0;if(!live)return;
    if(dirty){
      dirty=false;
      const r=bar.getBoundingClientRect(),safe=safeArea();
      const obstacles = fixed.map(fixedBox).filter((box): box is DockBox => box !== null);
      const p=chooseMusicDock(win.innerWidth,win.innerHeight,{width:r.width||224,height:r.height||52},obstacles,{...safe,bottom:safe.bottom+safe.pageBottom});
      available=!!p;
      const anchor=p||{left:Math.max(0,win.innerWidth-r.width-12-safe.right),top:Math.max(0,win.innerHeight-r.height-12-safe.bottom)};
      const key=anchor.left+':'+anchor.top;
      if(key!==position){onMove();position=key;place('dock',anchor.left,anchor.top);}
    }
    // 菜单收起后仍用非模态 dialog 承载入口，播放器只在真正的遮罩期间退让。
    const modal=!!doc.querySelector('.lb.on,.splb.on,dialog:modal');
    const anchor=bar.getBoundingClientRect();
    const center = anchor.top + anchor.height / 2;
    const footer=[...doc.querySelectorAll('footer')].find(el=>{const r=el.getBoundingClientRect();return center>=r.top&&center<=r.bottom;});
    const blocked = !opened && !modal && elements.some(el => coversControl(el, anchor));
    root.style.setProperty('--music-page-ink',win.getComputedStyle(doc.body).color);
    if(footer)root.style.setProperty('--music-surface-ink',win.getComputedStyle(footer).color);
    root.toggleAttribute('data-over-footer',!!footer);
    root.toggleAttribute('data-over-develop',doc.documentElement.classList.contains('on-develop'));
    if(blocked||opened||modal){
      win.clearTimeout(restoreTimer);restoreTimer=0;yielding=blocked;
    }else if(yielding&&!restoreTimer){
      // 连续离开控件一小段时间再恢复，避免滚动经过边缘时闪来闪去。
      restoreTimer=win.setTimeout(()=>{restoreTimer=0;yielding=false;update();},350);
    }
    root.toggleAttribute('data-modal-hidden',modal);
    root.toggleAttribute('data-dock-hidden',!available&&!opened);
    root.toggleAttribute('data-dock-yielding',yielding);
    bar.inert=modal||yielding||!available;
    panel.inert=modal;
    if(fallback){const hidden=available||opened||modal;if(fallback.hidden!==hidden)fallback.hidden=hidden;}
    placePanel();root.setAttribute('data-dock-ready','');
  };
  const schedule=()=>{if(live&&!frame)frame=win.requestAnimationFrame(update);};
  const layout=()=>{dirty=true;schedule();};
  const refresh=()=>{
    if(!live)return;
    observer.disconnect();
    observer.observe(doc.body,{subtree:true,childList:true,attributeFilter:['class','hidden','open','inert','disabled','aria-disabled','aria-hidden','role','href','style']});
    observer.observe(doc.documentElement,{attributes:true,attributeFilter:['class']});
    elements = [...doc.querySelectorAll<HTMLElement>(controls)].filter(el => el !== fallback && !root.contains(el));
    fixed = [...doc.querySelectorAll<HTMLElement>(fixedSelector)].filter(el => el !== fallback && !root.contains(el));
    intersection?.disconnect();
    elements.forEach(el => intersection?.observe(el));
    resize.disconnect();[doc.body,bar,panel,...fixed].forEach(el=>resize.observe(el));layout();
  };
  const intersection=typeof win.IntersectionObserver==='function'?new win.IntersectionObserver(schedule):null;
  const resize=new ResizeObserver(layout);
  const observer = new MutationObserver(records => {
    // 帆船等装饰只改自身样式时，到此为止；控件自身及祖先仍能触发避让。
    const page = records.filter(({ target, attributeName }) => !root.contains(target) && (attributeName !== 'style' ||
      (target as Element).matches(watched) || (target as Element).querySelector(watched)));
    if (page.some(record => record.attributeName === 'href' || record.attributeName === 'role' ||
      (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (node.matches(watched) || node.querySelector(watched)))))) {
      refresh();
    } else if (page.some(record => record.type === 'attributes')) {
      layout();
    } else if (page.length) {
      schedule();
    }
  });
  win.addEventListener('scroll',schedule,{passive:true,capture:true});win.addEventListener('resize',layout,{passive:true});doc.addEventListener('focusin',schedule);
  doc.fonts?.ready.then(layout);refresh();update();
  return {
    setOpen(value:boolean){opened=value;root.toggleAttribute('data-music-open',value);update();},
    refresh,
    dispose(){live=false;win.clearTimeout(restoreTimer);win.cancelAnimationFrame(frame);observer.disconnect();intersection?.disconnect();resize.disconnect();win.removeEventListener('scroll',schedule,true);win.removeEventListener('resize',layout);doc.removeEventListener('focusin',schedule);},
  };
}
