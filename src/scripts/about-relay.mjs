const clamp=n=>Math.max(0,Math.min(1,n));
const smooth = n => {const t=clamp(n);return t*t*(3-2*t);};

const flightDuration = .30;
const wrap = n => ((n % 1) + 1) % 1;

export function finLaunchTime(index,count,flow,horizontal){
  const origin=horizontal==='right'?.94:.44;
  const phase=wrap((index+flow)/count-origin);
  // 从前方外侧依次绕向背面。两条弧交错一片起步，边缘不会齐刷刷断开。
  const order=phase<.5 ? 2*phase : 2*(1-phase)+.5/count;
  return .64*order+((index%5)/5)*.008;
}

export function finFlightProgress(progress,launch,span=flightDuration){
  return smooth((progress-launch)/span);
}
// 按帧跟随目标，同时限制最大速度。后台恢复不会积累过大的位移。
export function followRelay(current,target,dt){
  const step=Math.max(0,Math.min(.05,dt));const delta=target-current;
  if(Math.abs(delta)<.00001)return target;
  const follow=delta*(1-Math.exp(-12*step));
  const urgency=clamp((Math.abs(delta)-.2)/.6);
  const speed=1.2+.95*urgency*urgency*(3-2*urgency);const limit=speed*step;
  return current+Math.max(-limit,Math.min(limit,follow));
}
const docks=[[175,.76,-.08,0],[-175,.74,.10,0],[165,.77,-.12,0]];
const lerp=(a,b,t)=>a+(b-a)*t;

export function createRelayMotion(count){
  const values=new Float32Array(count);
  const poses=new Float32Array(count*4);
  const lift=new Float32Array(count);
  let progress=0,track=null,shortcut=null;
  for(let i=0;i<count;i++)poses.set(docks[0],i*4);

  function route(from,to,flow,origins=null){
    let x=docks[from]?.[0];
    if(origins){
      x=0;
      for(let i=0;i<count;i++)x+=origins.poses[i*4]/count;
    }
    const horizontal=docks[to][0]>=x?'right':'left';
    const launches=new Float32Array(count);
    let first=0;
    for(let i=0;i<count;i++){
      launches[i]=finLaunchTime(i,count,flow,horizontal);
      if(launches[i]<launches[first])first=i;
    }
    return {from,to,horizontal,first,flow,launches,origins};
  }

  function sample(path,at){
    const phase=clamp((at-path.from)/(path.to-path.from));
    const arrival=docks[path.to];
    const origins=path.origins;
    for(let i=0;i<count;i++){
      const offset=i*4;
      const from=origins?origins.poses:docks[path.from];
      const start=origins?offset:0;
      const stagger=path.launches[i]/.65;
      const startAir=from[start+3];
      const delay=path.launches[i]*.82*(1-startAir*.86);
      const t=clamp((phase-delay)/(.36+.10*stagger));
      const along=finFlightProgress(t,.10,.76);
      const crest=.34+.12*stagger,peak=.92+(i%7)*.013;
      // 先翻开，再越过空中，靠近落点才把鳍片展开接回。
      const air=t<crest
        ? lerp(startAir,peak,smooth(t/crest))
        : peak*(1-finFlightProgress(t,.73,.27));
      const fromX=from[start];
      const bend=origins&&Math.abs(fromX-arrival[0])<45?116*Math.sin(Math.PI*along)**2:0;
      poses[offset]=lerp(fromX,arrival[0],along)+bend;
      poses[offset+1]=lerp(from[start+1],arrival[1],along);
      poses[offset+2]=lerp(from[start+2],arrival[2],along);
      poses[offset+3]=air;
      lift[i]=air*(18+(i%9)*4);
      values[i]=lerp(origins?origins.values[i]:path.from,path.to,along);
    }
  }

  return {values,poses,lift,get progress(){return progress},get info(){return shortcut??track},
    advance(target,dt,flow){
      target=Math.max(0,Math.min(2,target));
      const direction=Math.sign(target-progress);
      if(!direction||dt<=0)return values;
      // 大步跨过中间章节，从当前姿态起飞。折返在原轨迹上取样，
      // 只有滚出轨迹或明确停在中间章节时，才从当前姿态接一段新弧。
      const crossesMiddle=(progress<1&&target>1.55)||(progress>1&&target<.45);
      const outside=shortcut&&(
        target<Math.min(shortcut.from,shortcut.to)||target>Math.max(shortcut.from,shortcut.to)
      );
      if(outside||(!shortcut&&crossesMiddle)||(shortcut&&target===1&&shortcut.to!==1)){
        const dock=direction>0?Math.ceil(target):Math.floor(target);
        shortcut=route(progress,dock,flow,{poses:poses.slice(),values:values.slice()});
      }
      let next=followRelay(progress,target,dt);
      if(shortcut){
        const step=Math.min(.05,dt);
        const limit=Math.abs(shortcut.to-shortcut.from)*1.85*step;
        if(Math.abs(next-progress)>limit)next=progress+direction*limit;
        if(Math.abs(target-next)<.00001)next=target;
        sample(shortcut,next);
      }else{
        const leg=Math.floor(direction>0&&Number.isInteger(next)?next-1:next);
        if(!track||Math.min(track.from,track.to)!==leg){
          track=direction>0?route(leg,leg+1,flow):route(leg+1,leg,flow);
        }
        sample(track,next);
      }
      progress=next;
      if(Number.isInteger(progress)&&(!shortcut||progress===shortcut.to)){
        track=null;
        shortcut=null;
      }
      return values;
    }
  };
}
export const RELAY_GLSL=/* glsl */ `
void rl_relayTransform(float idx,vec3 originalCentre,inout vec3 p,inout vec3 n){
  // 保留原来错开的飞行航道和翻滚，落位时恢复原尺寸。
  float air=aRelay.w;
  float seed=rl_hash11(idx*1.618+4.7);
  float lane=mod(idx,9.0)-4.0;
  float peel=air*(1.55-0.55*air);
  float scale=aRelay.y;
  float yaw=aRelay.z;
  vec3 axis=vec3(0.0,1.0,0.0),rollAxis=vec3(0.0,0.0,1.0);
  float turn=peel*(0.9+seed*0.8);
  float roll=peel*(mod(idx,3.0)-1.0)*0.6;
  vec3 piece=rl_rotateAxis(p-originalCentre,axis,turn);
  piece=rl_rotateAxis(piece,rollAxis,roll)*(1.0-air*0.8);
  n=rl_rotateAxis(rl_rotateAxis(n,axis,turn),rollAxis,roll);
  vec3 centre=originalCentre*scale+vec3(aRelay.x,12.0+aRelayLift,aRelayLift*0.45);
  centre+=vec3(sin(idx*2.399)*36.0,lane*36.0+32.0,cos(idx*1.618)*80.0)*air;
  p=rl_rotateAxis(centre+piece*scale,axis,yaw);
  n=rl_rotateAxis(n,axis,yaw);
}
`;
export function chapterProgress(anchors,scrollY,height){
  let progress=0;
  for(let i=1;i<anchors.length;i++){
    const start=anchors[i]-height*.70,end=anchors[i]-height*.08;
    if(scrollY>=end)progress=i;
    else if(scrollY>start){progress=i-1+(scrollY-start)/(end-start);break;}
  }
  return Math.max(0,Math.min(anchors.length-1,progress));
}
