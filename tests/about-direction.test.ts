import {test} from 'vitest';
import assert from 'node:assert/strict';
import * as relay from '../src/scripts/about-relay.mjs';
const count=400;
function motion(){assert.equal(typeof relay.createRelayMotion,'function','需要按实际移动方向安排断开顺序');return relay.createRelayMotion(count)}
function settle(m,target,flow=0){for(let i=0;i<900;i++)m.advance(target,1/60,flow)}
function corner(m,expected,flow){
  assert.equal(m.info.horizontal,expected);
  const phase=((m.info.first+flow)/count)%1;
  const angle=phase*Math.PI*2,x=Math.cos(angle),y=Math.sin(angle)*Math.cos(angle);
  assert(y<-.25,'第一片从该侧的下沿开始');
  assert(expected==='right'?x>.65:x<-.65,'第一片必须在移动方向的外侧');
}
test('下翻：往左从左侧开始，往右从右侧开始',()=>{
  const m=motion();m.advance(1,1/60,37);corner(m,'left',37);
  settle(m,1,37);m.advance(2,1/60,63);corner(m,'right',63);
});
test('上翻：往左从左侧开始，往右从右侧开始',()=>{
  const m=motion();settle(m,2);m.advance(1,1/60,101);corner(m,'left',101);
  settle(m,1,101);m.advance(0,1/60,145);corner(m,'right',145);
});
test('靠起点的片先离开，另一侧仍保持完整',()=>{
  const m=motion();m.advance(1,1/60,37);const first=m.info.first;
  assert(m.lift[first]>0);assert.equal(m.lift[(first+100)%count],0);
});
test('中途反向沿当前轨迹折返，逐片保持连续',()=>{
  const m=motion();for(let i=0;i<25;i++)m.advance(1,1/60,19);
  const previous=m.poses.slice();
  const path=m.info;
  m.advance(0,1/60,21);
  assert.equal(m.info,path);
  for(let i=0;i<count;i++)assert(Math.abs(previous[i*4]-m.poses[i*4])<80);
  settle(m,0,21);assert(m.values.every(v=>v===0));
});
test('跨越两段与频繁反向不排队，最终完整落在最新章节',()=>{
  const m=motion();for(const target of [2,0,2,1,0,2])for(let i=0;i<8;i++)m.advance(target,1/30,8);
  settle(m,2,8);assert(m.values.every(v=>v===2));assert.equal(m.progress,2);
  settle(m,0,88);assert(m.values.every(v=>v===0));
});
test('快速跨章节时，空中的鳍片从当前位置转向，跳过左侧落位',()=>{
  const m=motion();
  for(let i=0;i<24;i++)m.advance(1,1/60,0);
  assert(m.values.some(v=>v>0&&v<1));
  const old=m.poses.slice();
  m.advance(2,1/60,0);
  assert.equal(m.info.to,2);
  for(let i=0;i<count;i++)assert(Math.abs(m.poses[i*4]-old[i*4])<80);
  let skipped=false;
  for(let i=0;i<144;i++){
    m.advance(2,1/60,0);
    if(m.values.some(v=>v>1.05)&&m.values.some(v=>v<.95))skipped=true;
  }
  assert(skipped,'已有鳍片朝新落点飞行时，仍有鳍片没落到中间章节');
  assert(m.values.every(v=>v===2));
});
test('连续快滚换目标时，从当前姿态接续，最终完整落位',()=>{
  const m=motion();
  for(let i=0;i<15;i++)m.advance(2,1/60,0);
  const schedule=m.info;
  m.advance(1.53,1/60,0);
  assert.equal(m.info,schedule);
  for(const target of [1,.7,1.9,.2,2]){
    for(let frame=0;frame<6;frame++){
      const previous=m.poses.slice();
      m.advance(target,1/60,0);
      for(let i=0;i<count;i++){
        const offset=i*4;
        assert(m.poses[offset+3]<=1);
        assert(Math.abs(previous[offset]-m.poses[offset])<80,'横向位置连续');
        assert(Math.abs(previous[offset+3]-m.poses[offset+3])<.6,'腾空姿态连续');
      }
    }
  }
  settle(m,2);
  assert(m.values.every(value=>value===2));
});
test('快滚打断后，已出发的鳍片沿弧线回飞，后续鳍片错开起飞',()=>{
  const m=motion();
  for(let i=0;i<17;i++)m.advance(2,1/60,0);
  assert(m.lift.some(height=>height>8),'已经离开的鳍片应飞出原平面');
  assert(m.lift.some(height=>height===0),'尚未轮到的鳍片继续留在原位');
  const previous=m.lift.slice();
  m.advance(0,1/60,0);
  assert(m.lift.every((height,i)=>Math.abs(height-previous[i])<18));
  settle(m,0);
  assert(m.lift.every(height=>height===0));
});
test('快滚后仍可停在章节之间，并跟随下一次滚动',()=>{
  const m=motion();
  m.advance(2,1/60,0);
  settle(m,.76);
  assert.equal(m.progress,.76);
  assert(m.lift.some(height=>height>12),'停在章节之间仍保留悬空鳍片');
  const before=m.poses.slice();
  let departing=false;
  for(let frame=0;frame<18;frame++){
    m.advance(0,1/60,0);
    if(m.lift.some(height=>height>12)&&m.poses.some((x,i)=>i%4===0&&Math.abs(x-before[i])>5))departing=true;
  }
  assert(departing,'已经起飞的鳍片沿轨迹回飞');
  settle(m,0);
  assert(m.values.every(value=>value===0));
});
test('接近左侧落点时突然折返，鳍片不会大批保持环形横移',()=>{
  const m=motion();
  for(let frame=0;frame<44;frame++)m.advance(1,1/60,0);
  let mostSliding=0, peakAir=0, firstReverse;
  for(let frame=0;frame<110;frame++){
    const previous=m.poses.slice();
    m.advance(0,1/60,0);
    let sliding=0;
    for(let i=0;i<count;i++){
      const offset=i*4, dx=m.poses[offset]-previous[offset];
      if(dx>1.5 && m.poses[offset+3]<.25)sliding++;
      if(dx>2)firstReverse??=frame;
      peakAir=Math.max(peakAir,m.poses[offset+3]);
    }
    mostSliding=Math.max(mostSliding,sliding);
  }
  assert(mostSliding<100,`同一帧最多有 ${mostSliding} 片以接近落位的姿态横移`);
  assert(firstReverse<14,'空中的鳍片应尽快转向');
  assert(peakAir>.85,'飞行中段保留旧版明显的缩小和翻转');
  assert(m.values.every(v=>v===0));
});
test('停在相邻章节之间时可以悬停，离开后接着飞向下一节或折返',()=>{
  for(const [from,to,exit] of [[0,1,1],[1,0,1],[1,2,2],[2,1,2]]){
    const m=motion();
    settle(m,from);
    const middle=(from+to)/2;
    settle(m,middle);
    const pose=m.poses.slice();
    const inAir=m.lift.filter(height=>height>12).length;
    assert(inAir>count*.2&&inAir<count*.8,'悬停时带面仍有一部分完整，另一部分鳍片在空中');
    settle(m,middle);
    assert(m.poses.every((value,i)=>value===pose[i]),'固定滚动位置时飞行不会自行结束');
    m.advance(exit,1/60,0);
    for(let i=0;i<count;i++)assert(Math.abs(m.poses[i*4]-pose[i*4])<80);
    settle(m,exit);
    assert(m.values.every(value=>value===exit));
    assert(m.lift.every(height=>height===0));
  }
});
test('滚一小段后减速停在对应进度，下一小段才继续飞',()=>{
  const m=motion();
  for(let frame=0;frame<8;frame++)m.advance(.18,1/60,0);
  const early=m.progress;
  const pose=m.poses.slice();
  settle(m,.18);
  assert(early>0&&early<.18,'停手时仍有一点余速');
  assert.notDeepEqual(m.poses,pose,'用余速继续移动一小段');
  assert.equal(m.progress,.18);
  const first=m.poses.slice();
  settle(m,.36);
  assert.equal(m.progress,.36);
  assert.notDeepEqual(m.poses,first,'下一次滚动才继续推进飞行');
  settle(m,.18);
  assert.deepEqual(m.poses,first,'回到同一滚动位置时回到同一飞行姿态');
});
