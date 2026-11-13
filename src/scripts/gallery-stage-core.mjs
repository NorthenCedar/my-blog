export function createWheelIntent(){
  let buffer=0,lastAt=-Infinity,lastStep=-Infinity,direction=0,consumed=false;
  return {push(delta,now){
    if(!Number.isFinite(delta)||!delta)return 0;
    const nextDirection=Math.sign(delta);
    if(now-lastAt>190||nextDirection!==direction){buffer=0;consumed=false;}
    if(consumed&&now-lastStep>640&&Math.abs(delta)>=24){buffer=0;consumed=false;}
    direction=nextDirection;lastAt=now;
    if(consumed)return 0;
    buffer+=delta;
    if(Math.abs(buffer)<34)return 0;
    consumed=true;lastStep=now;buffer=0;return direction;
  }};
}
export function createNavigator(count){
  let index=0;
  const clamp=n=>Math.max(0,Math.min(Math.max(0,count-1),n));
  return {get index(){return index},go(next){index=clamp(Math.round(next));return index},step(direction){index=clamp(index+Math.sign(direction));return index}};
}
export const swipeIntent=(dx,dy)=>Math.abs(dy)>=46&&Math.abs(dy)>Math.abs(dx)*1.15?(dy<0?1:-1):0;
export const wheelPixels=(delta,mode,height)=>delta*(mode===1?18:mode===2?height:1);
export function mountWheelNavigation(element,{scene,blocked,flip,passThrough=()=>false,nativeScroll=()=>false,inside=event=>!!event.target.closest('[data-spiral]'),height=()=>innerHeight,now=()=>performance.now()}){
  let pageWheel=createWheelIntent(),previousRegion=null;
  const ignored=event=>event.defaultPrevented||event.ctrlKey||event.metaKey||blocked();
  const pageInput=event=>{
    if(ignored(event))return;
    const delta=wheelPixels(event.deltaY,event.deltaMode,height());if(!Number.isFinite(delta)||!delta)return;
    event.preventDefault();if(previousRegion!=='page'){pageWheel=createWheelIntent();previousRegion='page';}
    const direction=pageWheel.push(delta,now());if(direction)flip(direction);
  };
  element.addEventListener('wheel',event=>{
    if(ignored(event))return;
    if(passThrough(event))return;
    if(nativeScroll(event)){event.stopPropagation();return;}
    if(scene()==='spiral'&&inside(event)){if(previousRegion!=='helix')pageWheel=createWheelIntent();previousRegion='helix';return;}
    // 只拦住原舞台中的外围留白；照片内的事件完整交给本站原组件。
    if(event.target.closest('[data-spiral]'))event.stopPropagation();
    pageInput(event);
  },{capture:true,passive:false});
  element.addEventListener('wheel',event=>{if(scene()==='spiral'&&inside(event))pageInput(event)},{passive:false});
}
export const createSceneDeck=albums=>[
  {kind:'develop',title:'显影板'},
  {kind:'spiral',title:'螺旋盘'},
  ...albums.map((album,albumIndex)=>({kind:'album',title:album.title,albumIndex,href:`https://northcedar.top/gallery/${encodeURIComponent(album.id)}/`}))
];
