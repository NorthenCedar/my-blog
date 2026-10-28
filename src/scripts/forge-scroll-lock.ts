/** 只给断链演出设置向下滚动上限，不改全页 overflow，向上操作仍然可用。 */
export function createForgeScrollLock(body:HTMLElement,bounds:()=>{start:number;end:number}){
  const events=new AbortController(),options={signal:events.signal};
  const previous=body.dataset.chainScrollLock;
  let ready=false,hasFrame=false,completed=false,bypassed=false,disposed=false,locked=false;
  let ceiling=0,lastAmount=0,touchY:number|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  const clear=()=>{locked=false;body.dataset.chainScrollLock='false';if(timer!==undefined){clearTimeout(timer);timer=undefined;}};
  const suspend=()=>{bypassed=true;clear();};
  const eligible=()=>ready&&hasFrame&&!completed&&!bypassed&&!disposed&&!document.hidden;
  const position=()=>{const value=bounds();return Number.isFinite(value.start)&&Number.isFinite(value.end)&&value.end>value.start?value:null;};
  const rewind=(y:number,range:{start:number;end:number})=>y<=range.start+(range.end-range.start)*.88;
  const move=(top:number)=>{if(window.scrollY>top+.5||window.scrollY<top-.5)window.scrollTo({top,behavior:'instant'});};
  function hold(top:number){
    if(!locked){
      locked=true;ceiling=top;body.dataset.chainScrollLock='true';
      // 即使位置没变也要调用一次，取消此前滚轮或锚点留下的平滑滚动。
      window.scrollTo({top:ceiling,behavior:'instant'});
      ceiling=window.scrollY;
      // 低帧率、上下文丢失等情况下也不能留下永久滚动限制。
      timer=setTimeout(()=>{timer=undefined;suspend();},2000);
    }else ceiling=Math.min(ceiling,top);
  }
  const overlay=(target:EventTarget|null)=>(target as HTMLElement|null)?.closest?.('dialog[open],.navpanel');
  function down(event:Event,delta:number){
    if(delta<=0||!eligible()||overlay(event.target))return;
    const range=position();if(!range)return;
    if(locked){if(event.cancelable)event.preventDefault();return;}
    if(window.scrollY+delta>range.end){
      if(event.cancelable)event.preventDefault();hold(range.end);move(range.end);
    }
  }
  window.addEventListener('wheel',event=>{
    if(event.ctrlKey)return;
    down(event,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1));
  },{...options,passive:false});
  window.addEventListener('touchstart',event=>{touchY=event.touches.length===1?event.touches[0].clientY:null;},{...options,passive:true});
  window.addEventListener('touchmove',event=>{
    if(touchY===null||event.touches.length!==1)return;
    const next=event.touches[0].clientY,delta=touchY-next;touchY=next;down(event,delta);
  },{...options,passive:false});
  window.addEventListener('touchend',()=>{touchY=null;},options);
  window.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||(event.key===' '&&event.shiftKey))return;
    const target=event.target as HTMLElement|null;
    if(target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return;
    if(event.key===' '&&target?.closest?.('button,a[href],[role="button"]'))return;
    const delta=event.key==='ArrowDown'?40:event.key==='PageDown'||event.key===' '?window.innerHeight*.85:event.key==='End'?Infinity:0;
    down(event,delta);
  },options);
  window.addEventListener('scroll',()=>{
    if(!eligible())return;const range=position();if(!range)return;
    const y=window.scrollY;
    if(rewind(y,range)){clear();return;}
    if(locked){ceiling=Math.min(ceiling,y);if(y>ceiling+.5)move(ceiling);}
    else if(y>range.end){hold(range.end);move(range.end);}
  },{...options,passive:true});
  window.addEventListener('resize',suspend,options);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();},options);
  return {
    setReady(value:boolean){ready=value;if(!value){hasFrame=false;suspend();}},
    frame(amount:number){
      if(disposed||!ready)return;
      if(!Number.isFinite(amount)){suspend();return;}
      hasFrame=true;
      if(amount>=1){completed=true;bypassed=false;lastAmount=1;clear();return;}
      completed=false;
      if(amount<=0){
        // 等待触发时也可能超时；必须真正上滚离开演出区后才重新待命。
        const range=position();if(range&&rewind(window.scrollY,range))bypassed=false;
        lastAmount=0;if(!locked)clear();return;
      }
      const reversing=amount<lastAmount;lastAmount=amount;
      const range=position();if(!eligible()||!range)return;
      if(reversing||rewind(window.scrollY,range)){clear();return;}
      hold(Math.min(window.scrollY,range.end));if(window.scrollY>ceiling+.5)move(ceiling);
    },
    dispose(){if(disposed)return;disposed=true;events.abort();clear();if(previous===undefined)delete body.dataset.chainScrollLock;else body.dataset.chainScrollLock=previous;},
  };
}
