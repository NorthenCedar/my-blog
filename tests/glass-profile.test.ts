import {expect,it} from 'vitest';
import {glassVector} from '../scripts/glass-profile.mjs';
it('镜片中心不变形，边缘采样向内，没有中心奇点',()=>{
  expect(glassVector(112,26,224,52)).toEqual([0,0]);
  expect(glassVector(2,26,224,52)[0]).toBeGreaterThan(.5);
  expect(glassVector(222,26,224,52)[0]).toBeLessThan(-.5);
  expect(glassVector(112,2,224,52)[1]).toBeGreaterThan(.5);
  for(let y=0;y<=44;y+=4)for(let x=0;x<=44;x+=4)expect(glassVector(x,y,44,44).every(v=>Number.isFinite(v)&&Math.abs(v)<=1)).toBe(true);
});
it('圆形和胶囊的左右折射对称，避免边界接缝',()=>{
  for(const [w,h]of [[44,44],[96,40],[224,52]]){
    const left=glassVector(2,h/2,w,h),right=glassVector(w-2,h/2,w,h);
    expect(left[0]+right[0]).toBeCloseTo(0,8);expect(left[1]).toBeCloseTo(0,8);
  }
});

it('胶囊直边沿局部法线折射，四周每一边都有效，外部圆角保持中性',()=>{
  for(const x of [40,80,112,144,184]){
    const top=glassVector(x,2,224,52),bottom=glassVector(x,50,224,52);
    expect(Math.abs(top[0])).toBeLessThan(.001);expect(top[1]).toBeGreaterThan(.5);
    expect(Math.abs(bottom[0])).toBeLessThan(.001);expect(bottom[1]).toBeLessThan(-.5);
  }
  expect(glassVector(0,0,224,52)).toEqual([0,0]);
});
