export type DockBox = {left:number;top:number;width:number;height:number};
type Size = {width:number;height:number};
type Insets = {left:number;right:number;top:number;bottom:number};
const intersects=(a:DockBox,b:DockBox,gap=8)=>a.left<b.left+b.width+gap&&a.left+a.width>b.left-gap&&a.top<b.top+b.height+gap&&a.top+a.height>b.top-gap;

/** 只为固定工具留位置；正文控件滚入时让出点击，不重新寻找停靠点。 */
export function chooseMusicDock(width:number,height:number,size:Size,fixed:DockBox[],safe:Insets={left:0,right:0,top:0,bottom:0}): {left:number;top:number}|null {
  const margin=12,left=width-margin-safe.right-size.width,minTop=margin+safe.top;
  if(left<margin+safe.left||height-safe.bottom-size.height-margin<minTop)return null;
  let top=height-margin-safe.bottom-size.height;
  for(const r of [...fixed].sort((a,b)=>b.top-a.top)) {
    if(intersects({left,top,...size},r))top=r.top-size.height-margin;
  }
  return top>=minTop?{left,top}:null;
}

export function createMusicDock(root:HTMLElement,onMove:()=>void) {
  const doc=root.ownerDocument,win=doc.defaultView!;
  const panel=root.querySelector<HTMLElement>('#music-panel')!,bar=root.querySelector<HTMLElement>('.music-bar')!;
  const fallback=doc.querySelector<HTMLElement>('[data-music-access]');
  const fixedSelector='[data-rule],[data-rail],.scene-controls,.chapter-nav,.hud,.osbar,[data-music-avoid]';
  const controls='button,a[href],input,select,textarea,summary,[role="button"]';
  let live=true,frame=0,opened=false,position='',dirty=true,available=true,yielding=false,restoreTimer=0;
  let elements:HTMLElement[]=[],fixed:HTMLElement[]=[];
  const safeArea=():Insets=>{
    const style=win.getComputedStyle(root),read=(side:string)=>parseFloat(style.getPropertyValue('--music-safe-'+side))||0;
    return {left:read('left'),right:read('right'),top:read('top'),bottom:read('bottom')};
  };
  const visibleBox=(el:HTMLElement,tool=false):DockBox|null=>{
    if(!el.isConnected||root.contains(el)||el===fallback||(!tool&&el.closest('[inert],:disabled,[aria-disabled="true"],[aria-hidden="true"]')))return null;
    const r=el.getBoundingClientRect(),style=win.getComputedStyle(el);
    if(!r.width||!r.height||style.visibility==='hidden'||style.display==='none'||style.opacity==='0'||(!tool&&style.pointerEvents==='none'))return null;
    let top=r.top;
    // 阅读尺从画外入场；底部工具条始终按最终停靠位置预留。
    if(tool&&el.matches('[data-rule],.scene-controls,.chapter-nav'))top=win.innerHeight-(parseFloat(style.bottom)||0)-r.height;
    if(r.right<=0||top+r.height<=0||r.left>=win.innerWidth||top>=win.innerHeight)return null;
    // 全屏场景的背景手势面不当成独立按钮；其真正的按钮仍逐一保护。
    if(!tool&&el.matches('[role="button"]')&&r.width>win.innerWidth*.8&&r.height>win.innerHeight*.6)return null;
    return {left:r.left,top,width:r.width,height:r.height};
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
    root.style.setProperty('--music-panel-x',x+'px');root.style.setProperty('--music-panel-y',y+'px');
  };
  const update=()=>{
    if(frame)win.cancelAnimationFrame(frame);frame=0;if(!live)return;
    if(dirty){
      dirty=false;
      const r=bar.getBoundingClientRect(),safe=safeArea();
      const p=chooseMusicDock(win.innerWidth,win.innerHeight,{width:r.width||224,height:r.height||52},fixed.flatMap(el=>{const r=visibleBox(el,true);return r?[r]:[];}),{...safe,bottom:safe.bottom+(parseFloat(win.getComputedStyle(root).getPropertyValue('--music-page-bottom'))||0)});
      available=!!p;
      const anchor=p||{left:Math.max(0,win.innerWidth-r.width-12-safe.right),top:Math.max(0,win.innerHeight-r.height-12-safe.bottom)};
      const key=anchor.left+':'+anchor.top;
      if(key!==position){onMove();position=key;root.style.setProperty('--music-dock-x',anchor.left+'px');root.style.setProperty('--music-dock-y',anchor.top+'px');}
    }
    const modal=!!doc.querySelector('.lb.on,.splb.on,dialog[open]');
    const anchor=bar.getBoundingClientRect();
    const footer=[...doc.querySelectorAll<HTMLElement>('footer')].find(el=>{const r=el.getBoundingClientRect();return anchor.top+anchor.height/2>=r.top&&anchor.top+anchor.height/2<=r.bottom;});
    root.style.setProperty('--music-page-ink',win.getComputedStyle(doc.body).color);
    if(footer)root.style.setProperty('--music-surface-ink',win.getComputedStyle(footer).color);
    root.toggleAttribute('data-over-footer',!!footer);
    root.toggleAttribute('data-over-develop',doc.documentElement.classList.contains('on-develop'));
    const blocked=!opened&&!modal&&elements.some(el=>{
      const r=visibleBox(el);if(!r)return false;
      const width=Math.max(0,Math.min(anchor.right,r.left+r.width)-Math.max(anchor.left,r.left));
      const height=Math.max(0,Math.min(anchor.bottom,r.top+r.height)-Math.max(anchor.top,r.top));
      return width*height>=r.width*r.height*.5;
    });
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
    observer.disconnect();observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open','inert','style']});
    elements=[...doc.querySelectorAll<HTMLElement>(controls)];fixed=[...doc.querySelectorAll<HTMLElement>(fixedSelector)];
    intersection?.disconnect();elements.forEach(el=>{if(!root.contains(el))intersection?.observe(el);});
    resize.disconnect();[bar,panel,...fixed].forEach(el=>resize.observe(el));layout();
  };
  const intersection=typeof win.IntersectionObserver==='function'?new win.IntersectionObserver(schedule):null;
  const resize=new ResizeObserver(layout);
  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.type==='childList'&&[...r.addedNodes,...r.removedNodes].some(n=>n instanceof Element)&&!root.contains(r.target)))refresh();
    else if(records.some(r=>!root.contains(r.target)&&r.attributeName!=='style'))layout();
    else if(records.some(r=>!root.contains(r.target)))schedule();
  });
  observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open','inert','style']});
  win.addEventListener('scroll',schedule,{passive:true,capture:true});win.addEventListener('resize',layout,{passive:true});doc.addEventListener('focusin',schedule);
  doc.fonts?.ready.then(refresh);refresh();update();
  return {
    setOpen(value:boolean){opened=value;root.toggleAttribute('data-music-open',value);update();},
    refresh,
    dispose(){live=false;win.clearTimeout(restoreTimer);win.cancelAnimationFrame(frame);observer.disconnect();intersection?.disconnect();resize.disconnect();win.removeEventListener('scroll',schedule,true);win.removeEventListener('resize',layout);doc.removeEventListener('focusin',schedule);},
  };
}
