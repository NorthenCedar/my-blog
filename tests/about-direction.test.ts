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
  assert(y<-.49,'第一片必须在下侧');
  assert(expected==='right'?x>.65:x<-.65,'第一片必须在移动方向的外侧');
}
test('下翻：右到左从左下角断，左到右从右下角断',()=>{
  const m=motion();m.advance(1,1/60,37);corner(m,'left',37);
  settle(m,1,37);m.advance(2,1/60,63);corner(m,'right',63);
});
test('上翻：右到左从左下角断，左到右从右下角断',()=>{
  const m=motion();settle(m,2);m.advance(1,1/60,101);corner(m,'left',101);
  settle(m,1,101);m.advance(0,1/60,145);corner(m,'right',145);
});
test('首批离开的片位于起始下角，相邻后片暂时留在原位',()=>{
  const m=motion();m.advance(1,1/60,37);const first=m.info.first;
  assert(m.values[first]>0);assert.equal(m.values[(first+100)%count],0);
});
test('中途反向重新从相应下角接力，每片保留当前位置并限制单帧位移',()=>{
  const m=motion();for(let i=0;i<25;i++)m.advance(1,1/60,19);
  const previous=Array.from(m.values);m.advance(0,1/60,21);corner(m,'right',21);
  for(let i=0;i<count;i++)assert(Math.abs(previous[i]-m.values[i])<=5/60+.000001);
  settle(m,0,21);assert(m.values.every(v=>v===0));
});
test('跨越两段与频繁反向不排队，最终完整落在最新章节',()=>{
  const m=motion();for(const target of [2,0,2,1,0,2])for(let i=0;i<8;i++)m.advance(target,1/30,8);
  settle(m,2,8);assert(m.values.every(v=>v===2));assert.equal(m.progress,2);
  settle(m,0,88);assert(m.values.every(v=>v===0));
});
