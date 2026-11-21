// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {createMusicDock} from '../src/scripts/music-dock';

const forgeScene = vi.hoisted(() => ({ draw: null as ((progress: number) => void) | null }));
vi.mock('../src/scripts/forge-scene.js', () => ({
  createForgeScene(_canvas: HTMLCanvasElement, draw: (progress: number) => void) {
    forgeScene.draw = draw;
    return { setTheme() {}, setProgress() {}, dispose() { forgeScene.draw = null; } };
  },
}));
vi.mock('../src/scripts/scene-startup', () => ({
  scheduleSceneStartup(run: () => void) {
    let canceled = false;
    queueMicrotask(() => { if (!canceled) run(); });
    return () => { canceled = true; };
  },
}));

let cleanup=()=>{};
const originalW=Object.getOwnPropertyDescriptor(window,'innerWidth'),originalH=Object.getOwnPropertyDescriptor(window,'innerHeight');
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();if(originalW)Object.defineProperty(window,'innerWidth',originalW);if(originalH)Object.defineProperty(window,'innerHeight',originalH);document.body.replaceChildren();});
const rect=(left:number,top:number,width:number,height:number)=>({left,top,right:left+width,bottom:top+height,width,height}) as DOMRect;
function setup(prefix=''){
  document.body.innerHTML=prefix+'<aside data-music><div class="music-bar"><button>播放</button><button>展开</button></div><section id="music-panel" hidden></section></aside>';
  Object.defineProperties(window,{innerWidth:{configurable:true,value:1280},innerHeight:{configurable:true,value:800}});
  const root=document.querySelector<HTMLElement>('[data-music]')!,bar=root.querySelector<HTMLElement>('.music-bar')!,panel=root.querySelector<HTMLElement>('#music-panel')!;
  const frames:FrameRequestCallback[]=[];
  vi.spyOn(window,'requestAnimationFrame').mockImplementation(fn=>{frames.push(fn);return frames.length;});
  vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
  bar.getBoundingClientRect=()=>rect(parseFloat(root.style.getPropertyValue('--music-dock-x'))||0,parseFloat(root.style.getPropertyValue('--music-dock-y'))||0,280,60);
  panel.getBoundingClientRect=()=>rect(0,0,300,160);
  return {root,bar,panel,flush:()=>{for(const fn of frames.splice(0))fn(0);}};
}
it('归档滚动只让出按钮点击，不改变横条位置；离开后稳定恢复',()=>{
  vi.useFakeTimers();
  const {root,bar,flush}=setup('<button id="page-action">页面按钮</button>');
  const action=document.getElementById('page-action')!;let actionRect=rect(100,100,80,44);
  action.getBoundingClientRect=()=>actionRect;
  const dock=createMusicDock(root,()=>{});cleanup=dock.dispose;
  const initial=root.style.cssText,r=bar.getBoundingClientRect();
  actionRect=rect(r.left+20,r.top+5,80,44);window.dispatchEvent(new Event('scroll'));flush();
  expect(root.style.cssText).toBe(initial);
  expect(bar.inert).toBe(true);expect(root.hasAttribute('data-dock-yielding')).toBe(true);
  actionRect=rect(100,100,80,44);window.dispatchEvent(new Event('scroll'));flush();
  expect(bar.inert).toBe(true);vi.advanceTimersByTime(600);flush();
  expect(root.style.cssText).toBe(initial);expect(bar.inert).toBe(false);expect(root.hasAttribute('data-dock-yielding')).toBe(false);
});
it.each(['lb','splb'])('%s灯箱打开时所有播放器界面退出，音频不被暂停，关闭后恢复',async(name)=>{
  const {root,bar,panel,flush}=setup('<div class="'+name+'"></div>');
  const audio=document.createElement('audio');root.append(audio);const pause=vi.spyOn(audio,'pause');
  const dock=createMusicDock(root,()=>{});cleanup=dock.dispose;dock.setOpen(true);
  const lb=document.querySelector('.'+name)!;lb.classList.add('on');await new Promise(resolve=>setTimeout(resolve,0));flush();
  expect(root.hasAttribute('data-modal-hidden')).toBe(true);expect(bar.inert).toBe(true);expect(panel.inert).toBe(true);expect(pause).not.toHaveBeenCalled();
  lb.classList.remove('on');await new Promise(resolve=>setTimeout(resolve,0));flush();
  expect(root.hasAttribute('data-modal-hidden')).toBe(false);expect(panel.inert).toBe(false);
});
it('普通对话框保持打开时，播放器仍可见并可操作',async()=>{
  const {root,bar,flush}=setup('<dialog class="site-menu-dialog"></dialog>');
  const dock=createMusicDock(root,()=>{});cleanup=dock.dispose;
  document.querySelector('dialog')!.show();
  await new Promise(resolve=>setTimeout(resolve,0));flush();
  expect(root.hasAttribute('data-modal-hidden')).toBe(false);
  expect(bar.inert).toBe(false);
});
it('面板打开时缩小窗口，横条与面板仍留在可见区域',()=>{
  const {root,bar,flush}=setup();const dock=createMusicDock(root,()=>{});cleanup=dock.dispose;dock.setOpen(true);
  Object.defineProperties(window,{innerWidth:{configurable:true,value:320},innerHeight:{configurable:true,value:240}});
  window.dispatchEvent(new Event('resize'));flush();
  const r=bar.getBoundingClientRect();expect(r.right).toBeLessThanOrEqual(320);expect(r.bottom).toBeLessThanOrEqual(240);expect(r.left).toBeGreaterThanOrEqual(0);expect(r.top).toBeGreaterThanOrEqual(0);
  expect(parseFloat(root.style.getPropertyValue('--music-panel-x'))+300).toBeLessThanOrEqual(320);
});
it('阅读尺在画外准备入场时也保留完整高度，不因其滑入而追位',()=>{
  const {root,bar}=setup('<aside data-rule></aside>');
  document.querySelector<HTMLElement>('[data-rule]')!.getBoundingClientRect=()=>rect(0,810,1280,52);
  const dock=createMusicDock(root,()=>{});cleanup=dock.dispose;
  expect(parseFloat(root.style.getPropertyValue('--music-dock-y'))+bar.getBoundingClientRect().height).toBeLessThanOrEqual(800-52-12);
});

it('远离播放条的控件不用读取计算样式，覆盖的控件仍让出点击', () => {
  const { root, bar, flush } = setup('<button id="far">远处</button><button id="near">近处</button>');
  const far = document.getElementById('far')!;
  const near = document.getElementById('near')!;
  far.getBoundingClientRect = () => rect(16, 16, 80, 44);
  near.getBoundingClientRect = () => {
    const anchor = bar.getBoundingClientRect();
    return rect(anchor.left + 12, anchor.top + 4, 80, 44);
  };
  const style = vi.spyOn(window, 'getComputedStyle');
  const dock = createMusicDock(root, () => {});
  cleanup = dock.dispose;
  flush();
  expect(style.mock.calls.some(([element]) => element === far)).toBe(false);
  expect(style.mock.calls.some(([element]) => element === near)).toBe(true);
  expect(bar.inert).toBe(true);
});

it('按钮通过动效移入横条时也让出点击，不需要滚动来触发',async()=>{
  const {root,bar,flush}=setup('<button id="moving">移动中的按钮</button>');
  const moving=document.getElementById('moving')!;let box=rect(20,100,80,44);moving.getBoundingClientRect=()=>box;
  const dock=createMusicDock(root,()=>{});cleanup=dock.dispose;await new Promise(resolve=>setTimeout(resolve,0));flush();const initial=root.style.cssText,r=bar.getBoundingClientRect();
  box=rect(r.left+10,r.top+5,80,44);moving.style.transform='translateY(600px)';
  await new Promise(resolve=>setTimeout(resolve,0));flush();
  expect(bar.inert).toBe(true);expect(root.style.cssText).toBe(initial);
});

it('帆船与尾波的样式更新不会重测控件，移动按钮的容器仍会触发避让', async () => {
  const { root, bar, flush } = setup('<nav><span class="st-ship" aria-hidden="true"><i></i></span><div><button>页面操作</button></div></nav>');
  const button = document.querySelector('nav button')!;
  const measure = vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(rect(20, 100, 80, 44));
  const dock = createMusicDock(root, () => {});
  cleanup = dock.dispose;
  const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flush(); };
  await settle();
  measure.mockClear();
  document.querySelector<HTMLElement>('.st-ship')!.style.transform = 'translateY(10px)';
  document.querySelector<HTMLElement>('.st-ship i')!.style.opacity = '.2';
  await settle();
  expect(measure).not.toHaveBeenCalled();

  const anchor = bar.getBoundingClientRect();
  measure.mockReturnValue(rect(anchor.left + 10, anchor.top + 5, 80, 44));
  button.parentElement!.style.transform = 'translateY(600px)';
  await settle();
  expect(bar.inert).toBe(true);
});

it('造物台连接阶段的 30 帧装饰变化不测量控件，实际出现的链接仍会触发避让', async () => {
  const { root, bar, flush } = setup(`<section class="hero"><div class="hero-stage">
    <div class="etched-surface"></div><div class="hero-heading"></div><div class="connection-copy"></div>
    <div class="scene-wrap"><canvas id="forge-scene"></canvas></div>
    <div class="stage-progress"><i></i></div><button data-stage="0.48">连接</button>
    <div class="arrival-note" inert><a href="#works">看作品</a></div>
  </div></section>${'<button>页面操作</button>'.repeat(58)}`);
  const stage = document.querySelector<HTMLElement>('.hero-stage')!;
  const link = stage.querySelector('a')!;
  stage.getBoundingClientRect = () => rect(0, 0, 1280, 600);
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      if (target === stage) this.callback([{ intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    disconnect() {}
  });
  const measures = [...document.querySelectorAll('button:not(.music-bar button), .arrival-note a')]
    .map(control => vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(rect(20, 100, 80, 44)));

  const { initForge } = await import('../src/scripts/forge');
  const disposeForge = initForge(document.body);
  cleanup = disposeForge;
  await vi.dynamicImportSettled();
  const draw = forgeScene.draw!;
  expect(typeof draw).toBe('function');
  const dock = createMusicDock(root, () => {});
  cleanup = () => { dock.dispose(); disposeForge(); };
  const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flush(); };
  draw(.32);
  await settle();
  for (const measure of measures) measure.mockClear();

  for (let frame = 1; frame <= 30; frame++) {
    draw(.32 + frame * .003);
    await settle();
  }
  expect(stage.dataset.progress).toBe('0.410');
  expect(measures.reduce((reads, measure) => reads + measure.mock.calls.length, 0)).toBe(0);

  const anchor = bar.getBoundingClientRect();
  vi.mocked(link.getBoundingClientRect).mockReturnValue(rect(anchor.left + 10, anchor.top + 5, 80, 44));
  draw(.92);
  await settle();
  expect(bar.inert).toBe(true);
});

it('大卡片轻微相交、禁用按钮和不接收指针的装饰都不让横条消失',()=>{
  const {root,bar}=setup('<a id="card" href="/posts/">整张文章卡片</a><button id="disabled" disabled>未开放</button><button id="decoration" style="pointer-events:none">读数装饰</button>');
  document.getElementById('card')!.getBoundingClientRect=()=>rect(12,600,1256,200);
  document.getElementById('disabled')!.getBoundingClientRect=()=>rect(1080,730,44,44);
  document.getElementById('decoration')!.getBoundingClientRect=()=>rect(1140,730,44,44);
  const dock=createMusicDock(root,()=>{});cleanup=dock.dispose;
  expect(root.hasAttribute('data-dock-yielding')).toBe(false);expect(bar.inert).toBe(false);
});

it('页脚上的横条文字跟随实际表面颜色，替换页面后重新观察当前 body',async()=>{
  const {root,bar,flush}=setup('<footer style="color:#eeeeee"></footer>');
  const footer=document.querySelector('footer')!;footer.getBoundingClientRect=()=>rect(0,650,1280,150);
  const dock=createMusicDock(root,()=>{});cleanup=dock.dispose;
  expect(root.hasAttribute('data-over-footer')).toBe(true);
  expect(root.style.getPropertyValue('--music-surface-ink')).toMatch(/^(?:#eeeeee|rgb\(238, 238, 238\))$/);
  const next=document.createElement('body');next.append(root);document.body.replaceWith(next);dock.refresh();flush();
  expect(root.hasAttribute('data-over-footer')).toBe(false);
  const button=document.createElement('button');button.textContent='新页面操作';next.append(button);
  const r=bar.getBoundingClientRect();button.getBoundingClientRect=()=>rect(r.left+10,r.top+5,44,44);
  await new Promise(resolve=>setTimeout(resolve,0));flush();expect(bar.inert).toBe(true);
});
