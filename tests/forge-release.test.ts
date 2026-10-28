import { existsSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

async function release(){
  expect(existsSync('src/lib/forge-release.ts'),'缺少断链演出的时间与几何模型').toBe(true);
  return import('../src/lib/forge-release');
}

describe('造物台末段的断链演出',()=>{
  it('缩小完成后触发一次，松开滚轮仍能收尾，停在末端不会重复爆炸',async()=>{
    const {createChainRelease}=await release(),clock=createChainRelease();
    expect(clock.advance(0,1/60).amount).toBe(0);
    for(let i=0;i<20;i++)expect(clock.advance(.94,1/60).amount).toBe(0);
    const first=clock.advance(.98,1/60);expect(first.amount).toBeGreaterThan(0);expect(first.active).toBe(true);
    for(let i=0;i<65;i++)clock.advance(.98,1/60);
    expect(clock.advance(1,1/60)).toEqual({amount:1,active:false});
    for(const p of [.95,.99,.94,1,.96])expect(clock.advance(p,1/60)).toEqual({amount:1,active:false});
  });
  it('上滚沿同一轨迹复原，复原之后再次下滚可以重新演出',async()=>{
    const {createChainRelease}=await release(),clock=createChainRelease();
    clock.advance(0,0);for(let i=0;i<70;i++)clock.advance(1,1/60);
    const reverse=clock.advance(.85,1/60);expect(reverse.amount).toBeLessThan(1);expect(reverse.active).toBe(true);
    for(let i=0;i<70;i++)clock.advance(.85,1/60);
    expect(clock.advance(.85,1/60)).toEqual({amount:0,active:false});
    expect(clock.advance(.98,1/60).amount).toBeGreaterThan(0);
  });
  it('恢复到末段或减少动态时直接给出静止终态，切回动态不补播爆炸',async()=>{
    const {createChainRelease}=await release();
    expect(createChainRelease().advance(1,1/60)).toEqual({amount:1,active:false});
    const clock=createChainRelease();clock.advance(0,0);
    expect(clock.advance(.1,1/60,true)).toEqual({amount:1,active:false});
    expect(clock.advance(.1,1/60,false)).toEqual({amount:0,active:false});
  });
  it('不依赖帧率，不让后台积累的大时间差一次跨过整个爆炸',async()=>{
    const {createChainRelease}=await release();
    const sample=(fps:number)=>{const clock=createChainRelease();clock.advance(0,0);for(let i=0;i<fps/2;i++)clock.advance(1,1/fps);return clock.advance(1,0).amount;};
    expect(sample(60)).toBeCloseTo(sample(120),6);
    const clock=createChainRelease();clock.advance(0,0);expect(clock.advance(1,100).amount).toBeLessThan(.1);
  });
});

describe('断链的屏幕锚点和碎环轨迹',()=>{
  it('各档视口的四段长链保持外端固定，收尾只在两侧各留约一成宽度',async()=>{
    const {recoilChainArm}=await release();
    for(const ratio of [320/740,390/844,1440/900,2560/1280,3440/1440]){
      const height=ratio<1?8.15/ratio:8.7,halfWidth=height*ratio/2;
      for(const side of [-1,1])for(const upper of [-1,1]){
        const points=[[side*(halfWidth+.65),upper*height*.3,0],[side*3,upper*1.2,.3],[side*2,upper*.2,.8]];
        expect(recoilChainArm(points,0,{side,upper,halfWidth,height})).toEqual(points);
        for(const amount of [.15,.3,.6,1]){
          const out=recoilChainArm(points,amount,{side,upper,halfWidth,height});
          expect(out[0]).toEqual(points[0]);expect(out.flat().every(Number.isFinite)).toBe(true);
        }
        const burstTip=recoilChainArm(points,.34,{side,upper,halfWidth,height}).at(-1)!;
        expect(burstTip[0]*side).toBeGreaterThan(halfWidth*.6);
        const tip=recoilChainArm(points,1,{side,upper,halfWidth,height}).at(-1)!;
        expect(tip[0]*side).toBeGreaterThan(halfWidth*.74);expect(tip[0]*side).toBeLessThan(halfWidth*.9);
      }
    }
  });
  it('超宽屏的外端可以在纵向画外，收尾断口仍落在视口四角',async()=>{
    const {recoilChainArm}=await release();
    for(const side of [-1,1])for(const upper of [-1,1]){
      const points=[[side*17,upper*9,0],[side*7,upper*3,.2],[side*2,upper*.3,.8]];
      const out=recoilChainArm(points,1,{side,upper,halfWidth:15,height:8.7});
      expect(out[0]).toEqual(points[0]);expect(Math.abs(out.at(-1)![1])).toBeLessThan(8.7*.4);
    }
  });
  it('碎环从四个断口向外飞，终态全部退场，同一进度反向采样完全一致',async()=>{
    const {chainFragmentPose}=await release();
    for(const side of [-1,1])for(const upper of [-1,1]){
      const anchor=[side*2,upper*.3,.8],options={side,upper,halfWidth:7,height:8.7};
      expect(chainFragmentPose(anchor,0,0,options).scale).toBe(0);
      const pose=chainFragmentPose(anchor,2,.4,options);
      expect(pose.scale).toBeGreaterThan(0);expect(pose.position[0]*side).toBeGreaterThan(2);
      expect([...pose.position,...pose.rotation,pose.scale].every(Number.isFinite)).toBe(true);
      expect(chainFragmentPose(anchor,2,.4,options)).toEqual(pose);
      expect(chainFragmentPose(anchor,3,.4,options)).not.toEqual(pose);
      expect(chainFragmentPose(anchor,2,1,options).scale).toBe(0);
    }
  });
  it('下方碎环避开两侧正文，并分散到不同位置而非叠成链团',async()=>{
    const {chainFragmentPose}=await release(),view={side:-1,upper:-1,halfWidth:7,height:8.7};
    const points=Array.from({length:4},(_,index)=>chainFragmentPose([-2,-.3,.8],index,.34,view).position);
    for(const point of points)expect(point[1]).toBeLessThan(-1.8);
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)expect(Math.hypot(points[i][0]-points[j][0],points[i][1]-points[j][1])).toBeGreaterThan(.25);
  });
});
