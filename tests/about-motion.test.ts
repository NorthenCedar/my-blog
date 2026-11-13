import {test} from 'vitest';import assert from 'node:assert/strict';
import {followRelay,finFlightProgress,finLaunchTime,chapterProgress} from '../src/scripts/about-relay.mjs';
test('大步滚轮输入也不让任何鳍片一帧走完路程',()=>{
  const start=.35;const target=.35+40/301*2;
  const next=followRelay(start,target,1/60);
  const changes=Array.from({length:400},(_,i)=>{
    const launch=finLaunchTime(i,400,0,'right');
    return Math.abs(finFlightProgress(next,launch)-finFlightProgress(start,launch));
  });
  assert(Math.max(...changes)<.12,`单帧单片最大变化 ${Math.max(...changes)}`);
});
test('停止输入后仍按动画帧连续跟随，最终收敛',()=>{
  let current=0;const values=[];for(let i=0;i<240;i++){current=followRelay(current,1,1/60);values.push(current)}
  assert(values[0]<.04);assert(values[5]>values[0]);assert(Math.abs(current-1)<.0001);
});
test('中途反向从当前位置连续返回，不过冲',()=>{
  const current=.43;const next=followRelay(current,0,1/60);assert(next<current&&next>current-.03);
});
test('30、60、120Hz 下同一秒的跟随结果接近',()=>{
  const results=[30,60,120].map(hz=>{let p=0;for(let i=0;i<hz;i++)p=followRelay(p,1,1/hz);return p});
  assert(Math.max(...results)-Math.min(...results)<.015);
});
test('一片接一片，半程同时有已接回、飞行中与未出发的鳍片',()=>{
  const launch=Array.from({length:400},(_,i)=>finLaunchTime(i,400,0,'right')).sort((a,b)=>a-b);
  const v=launch.map(at=>finFlightProgress(.5,at));assert(v.some(n=>n===1)&&v.some(n=>n===0)&&v.some(n=>n>0&&n<1));
  assert(launch[60]-launch[0]>.06,'不能让整侧在同一时刻起步');
  for(let i=1;i<v.length;i++)assert(v[i]<=v[i-1]);for(const at of launch){assert.equal(finFlightProgress(0,at),0);assert.equal(finFlightProgress(1,at),1)}
  assert.equal(followRelay(.5,.5,1/60),.5);
});
test('快滚仍保留至少约0.2秒的单片飞行窗口，输入队列不积累',()=>{
  const half=finFlightProgress(.45,.30);
  assert(Math.abs(half-.5)<.001&&finFlightProgress(.59,.30)<1);
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
