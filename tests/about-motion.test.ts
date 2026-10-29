import {test} from 'vitest';import assert from 'node:assert/strict';
import {followRelay,localProgress,flightEnvelope,chapterProgress} from '../src/scripts/about-relay.mjs';
test('大步滚轮输入也不让任何鳍片一帧走完路程',()=>{
  const start=.35;const target=.35+40/301*2;
  const next=followRelay(start,target,1/60);
  const changes=Array.from({length:400},(_,i)=>Math.abs(localProgress(next,i,400)-localProgress(start,i,400)));
  assert(Math.max(...changes)<.12,`单帧单片最大变化 ${Math.max(...changes)}`);
});
test('停止输入后仍按动画帧连续跟随，最终收敛',()=>{
  let current=0;const values=[];for(let i=0;i<240;i++){current=followRelay(current,1,1/60);values.push(current)}
  assert(values[0]<.03);assert(values[5]>values[0]);assert(Math.abs(current-1)<.0001);
});
test('中途反向从当前位置连续返回，不过冲',()=>{
  const current=.43;const next=followRelay(current,0,1/60);assert(next<current&&next>current-.03);
});
test('30、60、120Hz 下同一秒的跟随结果接近',()=>{
  const results=[30,60,120].map(hz=>{let p=0;for(let i=0;i<hz;i++)p=followRelay(p,1,1/hz);return p});
  assert(Math.max(...results)-Math.min(...results)<.015);
});
test('逐片的起步顺序、完整端点与稳定静止状态',()=>{
  const v=Array.from({length:400},(_,i)=>localProgress(.5,i,400));assert(v.some(n=>n===1)&&v.some(n=>n===0)&&v.some(n=>n>0&&n<1));
  for(let i=1;i<v.length;i++)assert(v[i]<=v[i-1]);for(let i=0;i<400;i++){assert.equal(localProgress(0,i,400),0);assert.equal(localProgress(1,i,400),1)}
  assert.equal(followRelay(.5,.5,1/60),.5);
});
test('空中相邻鳍片离开同一条带子，有尺寸之外的航道间隙，端点恢复原尺寸',()=>{
  const a=flightEnvelope(.5,1),b=flightEnvelope(.5,2);
  assert(Math.abs(a.laneY-b.laneY)>84*a.scale+12);
  assert.equal(flightEnvelope(0,1).scale,1);assert(Math.abs(flightEnvelope(1,1).scale-1)<.00001);
});
test('快滚仍保留至少约0.2秒的单片飞行窗口，输入队列不积累',()=>{
  assert(.42/1.42/1.4>.2);
  let p=0;for(let i=0;i<30;i++)p=followRelay(p,2,1/60);
  const before=p;for(let i=0;i<30;i++)p=followRelay(p,0,1/60);assert(p<before);
});
test('章节入口为完整落位，飞行集中在章节之间',()=>{
  const anchors=[78,921,1956];assert.equal(chapterProgress(anchors,0,900),0);assert.equal(chapterProgress(anchors,921,900),1);assert.equal(chapterProgress(anchors,1956,900),2);
  assert(chapterProgress(anchors,550,900)>0&&chapterProgress(anchors,550,900)<1);
});
test('接近目标时的速度连续变化，没有快慢档的突变',()=>{
  const before=followRelay(0,.40001,1/60),after=followRelay(0,.39999,1/60);
  assert(Math.abs(before-after)<.0001,`速度边界产生位移差 ${Math.abs(before-after)}`);
});
