import {unwrapPage} from './page-controller-source';
import {test} from 'vitest';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(resolve('package.json'));
const script=unwrapPage(readFileSync('src/components/SpiralPlate.astro','utf8').match(/<script>([\s\S]*?)<\/script>/)[1]);
const adapter=resolve('src/scripts/gallery-native.js').replaceAll('\\','/');
const bundle=require('esbuild').buildSync({stdin:{contents:script+'\nexport {mountOriginalHelix} from '+JSON.stringify(adapter),resolveDir:resolve('src/components'),loader:'ts'},bundle:true,write:false,format:'iife',globalName:'OriginalSpiral',platform:'browser'}).outputFiles[0].text;

// 跑实际打包入口、原脚本和原依赖；仅用可控 DOM、时钟与图片解码替代浏览器边界。
function environment(reduced=false){
  let time=0,id=0;const frames=new Map(),timers=new Map(),prefetched=[];
  const later=(fn,delay)=>{const n=++id;timers.set(n,{fn,at:time+delay});return n};
  class Event{constructor(type,options={}){Object.assign(this,{type,defaultPrevented:false,...options})}preventDefault(){this.defaultPrevented=true}}
  class Node{
    constructor(){this.handlers={};this.dataset={};this.attrs={};this.style={setProperty(name,value){this[name]=value}};this.classes=new Set();this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),remove:(...names)=>names.forEach(name=>this.classes.delete(name)),contains:name=>this.classes.has(name),toggle:(name,value)=>{const next=value??!this.classes.has(name);next?this.classes.add(name):this.classes.delete(name);return next}};}
    addEventListener(type,fn){(this.handlers[type]??=[]).push(fn)}
    fire(type,options={}){const event=options instanceof Event?options:new Event(type,{target:this,...options});event.target??=this;for(const fn of this.handlers[type]??[])fn(event);return event}
    dispatchEvent(event){this.fire(event.type,event);return !event.defaultPrevented}
    setAttribute(name,value){this.attrs[name]=String(value)}getAttribute(name){return this.attrs[name]??null}removeAttribute(name){delete this.attrs[name]}
    append(child){child.parentElement=this}
    focus(){doc.activeElement=this}
    closest(selector){return selector==='[data-sp-item]'?this.item??null:null}
    setPointerCapture(){}
    getBoundingClientRect(){return this.rect??{left:400,top:100,right:600,bottom:250,width:200,height:150}}
    decode(){return Promise.resolve()}
  }
  const doc=new Node(),window=new Node(),root=new Node(),vp=new Node(),rig=new Node(),host=new Node();
  doc.documentElement=root;doc.body=new Node();doc.visibilityState='visible';doc.activeElement=vp;
  vp.dataset.spMode='embed';vp.rect={left:0,top:0,right:900,bottom:340,width:900,height:340};
  const items=Array.from({length:82},(_,i)=>{const item=new Node(),a=new Node(),img=new Node();item.offsetWidth=196;item.item=item;a.item=item;img.item=item;item.dataset={spItem:String(i),albumTitle:'相册',no:String(i+1).padStart(3,'0'),cap:'照片'+i};a.setAttribute('href','big-'+i);item.querySelector=selector=>selector==='img'?img:a;return item});
  const singles={'[data-spiral]':vp,'[data-sp-rig]':rig,'[data-sp-mark]':new Node(),'[data-sp-note]':new Node(),'[data-sp-hud-pos]':new Node(),'[data-sp-hud-album]':new Node(),'[data-sp-hud-no]':new Node(),'[data-sp-hud-cap]':new Node()};
  const scrub=new Node();vp.querySelector=selector=>selector==='[data-sp-scrub]'?scrub:null;
  const ids=Object.fromEntries(['splb','splbImg','splbAlbum','splbCap','splbNo','splbClose','splbPrev','splbNext'].map(name=>[name,new Node()]));
  doc.querySelector=selector=>singles[selector]??null;doc.querySelectorAll=selector=>selector==='[data-sp-item]'?items:[];doc.getElementById=name=>ids[name]??null;
  host.querySelector=doc.querySelector;host.querySelectorAll=doc.querySelectorAll;
  const media={matches:reduced,addEventListener(){}};window.setTimeout=later;
  const context=vm.createContext({document:doc,window,Event,KeyboardEvent:Event,matchMedia:()=>media,getComputedStyle:()=>({getPropertyValue:()=>28}),IntersectionObserver:class{observe(){}disconnect(){}},Image:class{set src(url){prefetched.push(url)}},requestAnimationFrame:fn=>{const n=++id;frames.set(n,fn);return n},cancelAnimationFrame:n=>frames.delete(n),setTimeout:later,clearTimeout:n=>timers.delete(n),performance:{now:()=>time},location:{reload(){}}});
  vm.runInContext(bundle,context);const api=context.OriginalSpiral.mountOriginalHelix(host);api.setActive(true);
  const advance=(count=240)=>{for(let i=0;i<count;i++){time+=16;for(const [n,timer]of [...timers])if(timer.at<=time){timers.delete(n);timer.fn()}const current=[...frames.values()];frames.clear();for(const fn of current)fn(time)}};
  function click(index=null){const target=index===null?vp:items[index].querySelector('img');vp.fire('pointerdown',{target,pointerType:'mouse',button:0,pointerId:1,clientX:100});vp.fire('pointerup',{target:vp,pointerId:1});}
  return {doc,window,root,vp,items,api,ids,advance,click,prefetched,scrub,
    mark:()=>Number(singles['[data-sp-mark]'].style['--p']),hud:()=>singles['[data-sp-hud-pos]'].textContent};
}
test('定位刻度连续追随，途中改向从当前画面接续并落到指定帧',()=>{
  const e=environment();
  e.scrub.valueAsNumber=41;e.scrub.fire('input');
  assert.equal(e.mark(),0);
  e.advance(8);
  assert(e.mark()>0&&e.mark()<40/81);
  assert.equal(e.scrub.value,'41');
  assert.match(e.scrub.getAttribute('aria-valuetext'),/第 41 张.*照片40/);
  const midway=e.mark();
  e.scrub.valueAsNumber=18;e.scrub.fire('input');
  assert.equal(e.mark(),midway);
  e.advance();
  assert.equal(e.mark(),17/81);assert.equal(e.hud(),'018 / 082');
  e.api.step(1);e.advance();
  assert.equal(e.scrub.value,'19');assert.equal(e.hud(),'019 / 082');
});
test('首次点图按原站放大，再点同一张打开原灯箱，关闭后焦点回到盘面',async()=>{
  const e=environment();e.click(0);assert(e.items[0].classList.contains('zoom'));assert.equal(e.api.lightboxOpen,false);
  e.click(0);await Promise.resolve();assert.equal(e.api.lightboxOpen,true);assert.equal(e.ids.splbImg.src,'big-0');assert.equal(e.ids.splbCap.textContent,'照片0');
  e.ids.splbClose.fire('click');assert.equal(e.api.lightboxOpen,false);assert.equal(e.doc.activeElement,e.vp);
});
test('点空白按原站撤放大，并保留缩回保护层直到过渡结束',()=>{
  const e=environment();e.click(0);e.click();assert.equal(e.items[0].classList.contains('zoom'),false);assert(e.items[0].classList.contains('sp-unzoom'));
  e.advance(90);assert.equal(e.items[0].classList.contains('sp-unzoom'),false);
});
test('点邻片会转过去并放大，换片时放大跟随当前焦点',()=>{
  const e=environment();e.click(3);e.advance();assert.equal(e.hud(),'004 / 082');assert(e.items[3].classList.contains('zoom'));
  e.api.step(1);e.advance();assert.equal(e.hud(),'005 / 082');assert(e.items[4].classList.contains('zoom'));assert.equal(e.items[3].classList.contains('zoom'),false);
});
test('滚轮与端点让路直接运行原站处理器',()=>{
  const e=environment();const first=e.vp.fire('wheel',{deltaY:-100,deltaX:0,deltaMode:0});assert.equal(first.defaultPrevented,false);
  const second=e.vp.fire('wheel',{deltaY:100,deltaX:0,deltaMode:0});assert.equal(second.defaultPrevented,true);e.advance();assert.equal(e.hud(),'002 / 082');
});
test('悬停意图预取保持原站 250ms 延迟，提前移开会取消',()=>{
  const e=environment(),a=e.items[0].querySelector('a');a.fire('pointerenter');e.advance(15);assert.equal(e.prefetched.length,0);e.advance(1);assert.deepEqual(e.prefetched,['big-0']);
  const b=e.items[1].querySelector('a');b.fire('pointerenter');e.advance(8);b.fire('pointerleave');e.advance(20);assert.deepEqual(e.prefetched,['big-0']);
});
test('灯箱按原站顺序翻大图，图片解码后同步图注',async()=>{
  const e=environment();e.click(0);e.click(0);await Promise.resolve();e.ids.splbNext.fire('click');await Promise.resolve();
  assert.equal(e.ids.splbImg.src,'big-1');assert.equal(e.ids.splbCap.textContent,'照片1');assert.equal(e.ids.splbNo.textContent,'002');
});
test('减少动效保留原站平铺视图及原图链接，不建立另一套静态转盘',()=>{
  const e=environment(true);assert.equal(e.root.classList.contains('sp-on'),false);assert.equal(e.vp.handlers.pointerdown,undefined);assert.equal(e.items[0].querySelector('a').getAttribute('href'),'big-0');
});
test('外层只控制显示与响应范围，不接管原组件的放大状态',()=>{
  const e=environment();assert.equal(e.api.containsPoint(500,180),true);assert.equal(e.api.containsPoint(10,10),false);
  e.click(0);e.api.setActive(false);assert.equal(e.vp.hidden,true);assert.equal(e.api.containsPoint(500,180),false);e.api.setActive(true);assert(e.items[0].classList.contains('zoom'));
});
