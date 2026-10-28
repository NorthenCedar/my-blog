/** 断链时间与轨迹独立于渲染器；同一进度可沿原路复原，不引入物理引擎。 */
const clamp=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const smooth=(a:number,b:number,value:number)=>{const t=clamp((value-a)/(b-a));return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export type ChainViewport={side:number;upper:number;halfWidth:number;height:number};

export function createChainRelease(){
  let amount=0,target=0,initialized=false,wasReduced=false;
  return {
    advance(progress:number,seconds:number,reduced=false){
      const p=clamp(progress);
      if(reduced){wasReduced=true;return {amount:1,active:false,restoring:false};}
      if(!initialized||wasReduced){
        initialized=true;wasReduced=false;amount=target=p>=.955?1:0;
      }else{
        // 两个阈值之间保持方向，触控板在终点的小幅回摆不会反复触发。
        if(p>=.955)target=1;else if(p<=.88)target=0;
        const step=Math.max(0,Math.min(.06,Number.isFinite(seconds)?seconds:0))/(target? .9:.62);
        amount=target?Math.min(1,amount+step):Math.max(0,amount-step);
        if(Math.abs(amount-target)<1e-7)amount=target;
      }
      return {amount,active:amount!==target,restoring:target===0&&amount>0};
    },
  };
}

/** 输入从屏幕外端到断口的世界坐标，首点始终固定在视口之外。 */
export function recoilChainArm(points:number[][],amount:number,view:ChainViewport):number[][]{
  if(!points.length)return [];
  const t=1-Math.pow(1-clamp((amount-.12)/.88),5),anchor=points[0];
  if(t===0)return points.map(point=>[...point]);
  // 外部锚点的纵坐标会随超宽屏延伸；断口自身必须重新落回视锥内。
  const endX=view.side*view.halfWidth*.8,endY=view.upper*view.height*.29;
  return points.map((point,index)=>{
    if(index===0)return [...anchor];
    const u=index/(points.length-1),arc=Math.sin(u*Math.PI);
    const target=[mix(anchor[0],endX,u),mix(anchor[1],endY,u)+view.upper*arc*view.height*.028,mix(anchor[2],.25,u)+arc*.18];
    const whip=Math.sin(t*Math.PI*3)*Math.exp(-t*5)*arc*view.height*.035;
    return [mix(point[0],target[0],t),mix(point[1],target[1],t)+view.upper*whip,mix(point[2],target[2],t)];
  });
}

const random=(index:number,salt:number)=>{const n=Math.sin(index*127.1+salt*311.7)*43758.5453;return n-Math.floor(n);};
export function chainFragmentPose(anchor:number[],index:number,amount:number,view:ChainViewport){
  const a=clamp(amount),age=clamp((a-.13)/.87),travel=1-Math.pow(1-age,2.3);
  const x=random(index,1),y=random(index,2),z=random(index,3);
  return {
    position:[anchor[0]+view.side*view.halfWidth*(.32+x*.6)*travel,
      anchor[1]+view.upper*view.height*(view.upper>0?.22+y*.18:.4+y*.16)*travel-view.height*.035*age*age,
      anchor[2]+(z-.5)*3*Math.sin(age*Math.PI)],
    rotation:[x*6+travel*(2+y)*Math.PI,y*6+travel*(1+z)*Math.PI,z*6+travel*Math.PI*1.5],
    scale:smooth(.12,.2,a)*(1-smooth(.65,.95,a))*(.8+x*.6),
  };
}
