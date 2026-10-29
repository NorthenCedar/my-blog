const clamp=n=>Math.max(0,Math.min(1,n));
export function localProgress(progress,index,count){const a=clamp(index/Math.max(1,count-1));const p=clamp((clamp(progress)*1.42-a)/.42);return p*p*(3-2*p)}
// 按帧跟随目标，同时限制最大速度。后台恢复不会积累过大的位移。
export function followRelay(current,target,dt){
  const step=Math.max(0,Math.min(.05,dt));const delta=target-current;
  if(Math.abs(delta)<.00001)return target;
  const follow=delta*(1-Math.exp(-8*step));
  const urgency=clamp((Math.abs(delta)-.2)/.6);
  const speed=.85+.55*urgency*urgency*(3-2*urgency);const limit=speed*step;
  return current+Math.max(-limit,Math.min(limit,follow));
}
// 每次转向保留逐片当前位置；下一轮接力重新从移动方向的下角开始。
export function createRelayMotion(count){
  const values=new Float32Array(count);
  let progress=0,journey=null;
  const wrap=n=>((n%1)+1)%1;
  function begin(from,direction,flow){
    const to=direction>0?Math.min(2,Math.floor(from+1e-9)+1):Math.max(0,Math.ceil(from-1e-9)-1);
    const segment=Math.min(1,Math.floor((from+to)/2));
    const horizontal=(segment===0?-1:1)*direction>0?'right':'left';
    const phase=horizontal==='right'?.875:.375;
    const first=Math.ceil(wrap(phase-flow/count)*count-1e-9)%count;
    journey={from,to,direction,horizontal,first,flow,origins:values.slice()};
  }
  function apply(at,dt){
    if(!journey)return;
    const j=journey,p=clamp((at-j.from)/(j.to-j.from)),limit=5*dt;
    for(let i=0;i<count;i++){
      const order=(i-j.first+count)%count;
      const desired=j.origins[i]+(j.to-j.origins[i])*localProgress(p,order,count);
      values[i]+=Math.max(-limit,Math.min(limit,desired-values[i]));
    }
  }
  return {values,get progress(){return progress},get info(){return journey},
    advance(target,dt,flow){
      const step=Math.max(0,Math.min(.05,dt));
      const next=followRelay(progress,Math.max(0,Math.min(2,target)),step);
      const distance=Math.abs(next-progress),direction=Math.sign(next-progress);
      if(distance>1e-10){
        if(!journey||journey.direction!==direction||Math.abs(progress-journey.to)<1e-9)begin(progress,direction,flow);
        let cursor=progress;
        while((next-cursor)*direction>1e-10){
          const boundary=direction>0?Math.min(next,journey.to):Math.max(next,journey.to);
          apply(boundary,step*Math.abs(boundary-cursor)/distance);
          cursor=boundary;
          if((next-cursor)*direction>1e-10)begin(cursor,direction,flow);
        }
      }else apply(next,step);
      progress=next;
      return values;
    }
  };
}
export const RELAY_GLSL=/* glsl */ `
void rl_relayTransform(float idx,vec3 originalCentre,inout vec3 p,inout vec3 n){
  float a=clamp(aRelay,0.0,1.0),b=clamp(aRelay-1.0,0.0,1.0);
  // 空中缩小并进入错开的九条航道，片与片保持可辨认的间隙，落位时恢复原尺寸。
  float air=clamp(sin(3.14159265*a)+sin(3.14159265*b),0.0,1.0);
  float lane=mod(idx,9.0)-4.0;
  float scale=0.76-0.02*a+0.03*b;
  float yaw=-0.08+0.18*a-0.22*b;
  vec3 axis=vec3(0.0,1.0,0.0),rollAxis=vec3(0.0,0.0,1.0);
  float turn=air*(0.9+rl_hash11(idx)*0.8);
  float roll=air*(mod(idx,3.0)-1.0)*0.6;
  vec3 piece=rl_rotateAxis(p-originalCentre,axis,turn);
  piece=rl_rotateAxis(piece,rollAxis,roll)*(1.0-air*0.8);
  n=rl_rotateAxis(rl_rotateAxis(n,axis,turn),rollAxis,roll);
  vec3 centre=originalCentre*scale+vec3(175.0-350.0*a+340.0*b,12.0,0.0);
  centre+=vec3(sin(idx*2.399)*36.0,lane*42.0+38.0,cos(idx*1.618)*80.0)*air;
  p=rl_rotateAxis(centre+piece*scale,axis,yaw);
  n=rl_rotateAxis(n,axis,yaw);
}
`;
export function flightEnvelope(progress,index){const air=Math.max(0,Math.sin(Math.PI*progress));return{scale:1-.8*air,laneY:((index%9)-4)*42*air}}
export function chapterProgress(anchors,scrollY,height){
  let progress=0;
  for(let i=1;i<anchors.length;i++){
    const start=anchors[i]-height*.70,end=anchors[i]-height*.08;
    if(scrollY>=end)progress=i;
    else if(scrollY>start){progress=i-1+(scrollY-start)/(end-start);break;}
  }
  return Math.max(0,Math.min(anchors.length-1,progress));
}
