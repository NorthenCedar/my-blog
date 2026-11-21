import { afterEach,describe,expect,it,vi } from 'vitest';
import * as THREE from '../src/vendor/three.module.min.js';

const rendered=vi.hoisted(()=>({scene:null as any,camera:null as any,frames:0}));
vi.mock('../src/vendor/three.module.min.js',async original=>{
  const real:any=await original();
  return {...real,WebGLRenderer:class{
    setClearAlpha(){}setPixelRatio(){}setSize(){}dispose(){}
    render(scene:any,camera:any){scene.updateMatrixWorld();camera.updateMatrixWorld();rendered.scene=scene;rendered.camera=camera;rendered.frames++;}
  },PMREMGenerator:class{fromEquirectangular(){return {texture:new real.Texture(),dispose(){}};}dispose(){}}};
});

let teardown:(()=>void)|undefined;
afterEach(()=>{teardown?.();teardown=undefined;vi.unstubAllGlobals();rendered.scene=null;rendered.frames=0;});
async function fixture(mobile=false,width=mobile?390:1440,height=900){
  let now=1000,id=0;const frames=new Map<number,FrameRequestCallback>();
  const document=new EventTarget() as any;document.body={};document.hidden=false;
  document.createElement=()=>({width:0,height:0,getContext:()=>({createLinearGradient:()=>({addColorStop(){}}),fillRect(){}})});
  vi.stubGlobal('document',document);vi.stubGlobal('getComputedStyle',()=>({getPropertyValue:()=> '#aac1ad'}));
  vi.stubGlobal('matchMedia',()=>({matches:mobile}));vi.stubGlobal('devicePixelRatio',1);
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++id,callback);return id;});
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
  vi.stubGlobal('ResizeObserver',class{callback:()=>void;constructor(callback:()=>void){this.callback=callback;}observe(){this.callback();}disconnect(){}});
  vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}});
  const canvas=new EventTarget() as any;canvas.clientWidth=width;canvas.clientHeight=height;canvas.dataset={};canvas.parentElement={dataset:{}};
  const {createForgeScene}=await import('../src/scripts/forge-scene.js');
  const onFrame=vi.fn();const scene=createForgeScene(canvas,onFrame);teardown=()=>scene.dispose();
  const tick=(count=1)=>{for(let i=0;i<count;i++){now+=1000/60;const queued=[...frames.values()];frames.clear();queued.forEach(callback=>callback(now));}};
  const named=(name:string)=>rendered.scene.getObjectByName(name);
  return {scene,canvas,tick,named,frames,document,onFrame};
}

describe('真实场景接线与资源生命周期',()=>{
  it('画布完成第一帧前保留静态无限环', async () => {
    const f = await fixture();
    expect(f.canvas.parentElement.dataset.ready).toBeUndefined();
    f.tick();
    expect(f.canvas.parentElement.dataset.ready).toBe('true');
  });
  it('从页面底部快速返回时先完整收回碎链，再展开无限环，不让场景进度抢跑',async()=>{
    const f=await fixture();f.scene.setProgress(1);f.tick(3);f.scene.setProgress(0);
    const rows:number[][]=[];
    for(let i=0;i<120;i++){f.tick();const row=f.onFrame.mock.lastCall;if(row)rows.push(row);}
    const reverse=rows.filter(([,amount])=>amount>0&&amount<1);
    expect(reverse.length).toBeGreaterThan(20);
    expect(reverse.every(([progress])=>progress>=.94)).toBe(true);
    const joined=rows.findIndex(([,amount])=>amount===0);expect(joined).toBeGreaterThan(0);
    expect(rows.slice(joined).some(([progress])=>progress<.1)).toBe(true);
  });
  it('终点出现四段断链、碎环退场，空闲之后停止请求动画帧，上滚会重新唤醒复原',async()=>{
    const f=await fixture();f.scene.setProgress(0);f.tick(100);f.scene.setProgress(1);f.tick(180);
    expect(f.canvas.dataset.chainRelease).toBe('1.000');
    for(let i=0;i<4;i++){
      const arm=f.named('forge-chain-arm-'+i);expect(arm,`缺少第${i}段真实断链`).toBeDefined();expect(arm.visible).toBe(true);expect(arm.count).toBeGreaterThan(0);
      const matrix=new THREE.Matrix4();arm.getMatrixAt(0,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix).project(rendered.camera);expect(Math.abs(p.x)).toBeGreaterThan(1);
    }
    expect(f.named('forge-broken-links').visible).toBe(false);expect(f.frames.size).toBe(0);
    f.scene.setProgress(.4);expect(f.frames.size).toBe(1);f.tick(180);
    expect(f.canvas.dataset.chainRelease).toBe('0.000');expect(f.named('forge-whole-chain-0').visible).toBe(true);expect(f.frames.size).toBe(0);
  });
  it('缩小停住后碎环仍继续运动，手机减量并在减少动态时直接静止收尾',async()=>{
    const f=await fixture(true);f.scene.setProgress(0);f.tick(100);f.scene.setProgress(1);
    for(let i=0;i<120&&Number(f.canvas.dataset.chainRelease||0)<.35;i++)f.tick();
    expect(Number(f.canvas.dataset.chainRelease)).toBeGreaterThan(.2);expect(f.named('forge-broken-links').visible).toBe(true);
    expect(f.onFrame.mock.lastCall?.[1]).toBeCloseTo(Number(f.canvas.dataset.chainRelease),3);
    expect(f.named('forge-broken-links').count).toBe(8);expect(f.frames.size).toBe(1);
    f.scene.setReduced(true);f.tick(2);
    expect(f.canvas.dataset.chainRelease).toBe('1.000');expect(f.named('forge-broken-links').visible).toBe(false);expect(f.frames.size).toBe(0);
    f.scene.dispose();expect(f.frames.size).toBe(0);teardown=undefined;
  });
  it('后台暂停不积累动画时间，销毁后释放共享断环几何和新增材质',async()=>{
    const f=await fixture();f.scene.setProgress(0);f.tick(100);f.scene.setProgress(1);
    for(let i=0;i<120&&Number(f.canvas.dataset.chainRelease||0)<.3;i++)f.tick();
    const before=Number(f.canvas.dataset.chainRelease);
    f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));expect(f.frames.size).toBe(0);f.tick(600);
    f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));f.tick();
    expect(Number(f.canvas.dataset.chainRelease)-before).toBeLessThan(.03);
    const mesh=f.named('forge-broken-links'),geometry=vi.spyOn(mesh.geometry,'dispose'),material=vi.spyOn(mesh.material,'dispose');
    const buffers:any[]=[];rendered.scene.traverse((object:any)=>{if(object.isInstancedMesh)buffers.push(vi.spyOn(object,'dispose'));});
    f.scene.dispose();teardown=undefined;
    expect(geometry).toHaveBeenCalledTimes(1);expect(material).toHaveBeenCalledTimes(1);expect(f.frames.size).toBe(0);
    for(const dispose of buffers)expect(dispose).toHaveBeenCalledTimes(1);
  });
  it.each([[320,740],[1920,620],[3840,1080]])('%s×%s的四个C形断尾都实际落在视锥内',async(width,height)=>{
    const f=await fixture(width<=760,width,height);f.scene.setProgress(1);f.tick(3);
    const tips=f.named('forge-chain-break-tips');expect(tips).toBeDefined();expect(tips.visible).toBe(true);expect(tips.count).toBe(4);
    for(let i=0;i<4;i++){
      const matrix=new THREE.Matrix4();tips.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix).project(rendered.camera);
      expect(Math.abs(p.x)).toBeLessThan(.95);expect(Math.abs(p.x)).toBeGreaterThan(.6);
      expect(Math.abs(p.y)).toBeLessThan(.9);expect(Math.abs(p.y)).toBeGreaterThan(.3);
    }
  });
});
