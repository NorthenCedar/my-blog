import {test} from 'vitest';
import assert from 'node:assert/strict';
import * as core from '../src/scripts/gallery-stage-core.mjs';
function wheel(){assert.equal(typeof core.createWheelIntent,'function');return core.createWheelIntent()}
test('触控板连续惯性只翻一册，停顿后可继续翻',()=>{
  const input=wheel();let count=0;
  for(let i=0;i<12;i++)count+=input.push(40-i*3,20*i);
  assert.equal(count,1);assert.equal(input.push(42,600),1);
});
test('尚未结束的同向手势可以立即反向',()=>{
  const input=wheel();assert.equal(input.push(50,0),1);assert.equal(input.push(-48,40),-1);
});
test('小幅抖动先累积，持续明确滚动也能继续翻',()=>{
  const input=wheel();assert.equal(input.push(8,0),0);assert.equal(input.push(12,20),0);assert.equal(input.push(20,40),1);
  for(let time=100;time<=600;time+=100)assert.equal(input.push(30,time),0);
  assert.equal(input.push(30,700),0);assert.equal(input.push(30,800),1);
});
test('章节数来自数据，端点不循环跳回，最新选择直接生效',()=>{
  assert.equal(typeof core.createNavigator,'function');const nav=core.createNavigator(3);
  assert.equal(nav.step(-1),0);assert.equal(nav.step(1),1);assert.equal(nav.go(2),2);
  assert.equal(nav.step(1),2);assert.equal(nav.go(0),0);assert.equal(nav.go(99),2);
  const one=core.createNavigator(1);assert.equal(one.step(1),0);
});
test('触摸上下滑切册，横向滑动与短触摸保留给点击',()=>{
  assert.equal(typeof core.swipeIntent,'function');
  assert.equal(core.swipeIntent(5,-80),1);assert.equal(core.swipeIntent(5,80),-1);
  assert.equal(core.swipeIntent(80,30),0);assert.equal(core.swipeIntent(0,15),0);
});
test('行数与像素滚轮统一成相同输入尺度',()=>{
  assert.equal(typeof core.wheelPixels,'function');
  assert.equal(core.wheelPixels(2,1,800),36);assert.equal(core.wheelPixels(1,2,800),800);
});
test('显影板和螺旋盘始终在封面前，新增相册保留自己的链接与顺序',()=>{
  assert.equal(typeof core.createSceneDeck,'function');
  const albums=[{id:'一些风景',title:'一些风景'},{id:'new-album',title:'新相册'}];
  const deck=core.createSceneDeck(albums);
  assert.deepEqual(deck.map(s=>s.kind),['develop','spiral','album','album']);
  assert.equal(deck[2].albumIndex,0);assert.equal(deck[3].albumIndex,1);
  assert.equal(deck[3].href,'https://northcedar.top/gallery/new-album/');
  assert.equal(deck[2].href,'https://northcedar.top/gallery/%E4%B8%80%E4%BA%9B%E9%A3%8E%E6%99%AF/');
  assert.equal(core.createSceneDeck([...albums,{id:'third',title:'第三册'}]).length,5);
});
test('只有装置时仍能正常翻页，装置不是一本虚构相册',()=>{
  assert.equal(typeof core.createSceneDeck,'function');
  const deck=core.createSceneDeck([]);assert.equal(deck.length,2);
  assert.deepEqual(deck.map(s=>s.title),['显影板','螺旋盘']);
  assert(deck.every(s=>s.albumIndex===undefined));
  const nav=core.createNavigator(deck.length);assert.equal(nav.step(1),1);assert.equal(nav.step(1),1);
});

function nativeWheelFixture(){
  const handlers=[],page=core.createNavigator(5);page.go(1);let nativeTurns=0;
  const element={addEventListener(type,fn,options){handlers.push({fn,capture:!!options.capture})}};
  core.mountWheelNavigation(element,{scene:()=>page.index===1?'spiral':'album',blocked:()=>false,nativeScroll:event=>event.inGrid,inside:event=>event.inPhoto,flip:direction=>page.step(direction),height:()=>800,now:()=>0});
  function wheel(inPhoto,atEdge=false,inGrid=false){
    let stopped=false;const event={inPhoto,inGrid,ctrlKey:false,metaKey:false,defaultPrevented:false,deltaX:0,deltaY:100,deltaMode:0,target:{closest:selector=>selector==='[data-spiral]'?{}:null},preventDefault(){this.defaultPrevented=true},stopPropagation(){stopped=true}};
    for(const h of handlers.filter(h=>h.capture))h.fn(event);
    if(!stopped){if(!atEdge){nativeTurns++;event.preventDefault()}for(const h of handlers.filter(h=>!h.capture))h.fn(event)}return event;
  }
  return {wheel,page,get nativeTurns(){return nativeTurns}};
}
test('使用本站原组件时，照片外留白先翻页，不让原组件截获滚轮',()=>{
  const e=nativeWheelFixture();e.wheel(false);assert.equal(e.page.index,2);assert.equal(e.nativeTurns,0);
});
test('照片内让原组件自己转盘，原组件到端点让路时再承接翻页',()=>{
  const e=nativeWheelFixture();e.wheel(true);assert.equal(e.nativeTurns,1);assert.equal(e.page.index,1);
  e.wheel(true,true);assert.equal(e.page.index,2);
});
test('减少动效的平铺网格保留原生滚动，不转盘也不误翻幕',()=>{
  const e=nativeWheelFixture(),event=e.wheel(true,false,true);
  assert.equal(event.defaultPrevented,false);assert.equal(e.nativeTurns,0);assert.equal(e.page.index,1);
});
