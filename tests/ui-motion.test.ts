// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap as realGsap } from 'gsap';
import { createPlayerMorph } from '../src/scripts/player-morph';

let root: HTMLElement;
let panel: HTMLElement;
let sheet: HTMLElement;
const rect = (x: number, y: number, width: number, height: number) => ({x,y,left:x,top:y,width,height,right:x+width,bottom:y+height,toJSON(){}});
function engine() {
  const completions: (() => void)[] = [];
  const gsap = {
    set(el: HTMLElement, vars: Record<string, unknown>) { for (const [key,value] of Object.entries(vars)) if (key === 'clearProps') el.removeAttribute('style'); else (el.style as any)[key] = value; },
    timeline(config: {onComplete: () => void}) {
      completions.push(config.onComplete);
      const tween = {to(){return tween;},set(){return tween;},kill(){}};
      return tween;
    },
  };
  return { gsap, completions };
}
beforeEach(() => {
  document.body.innerHTML = '<aside data-music><div class="music-bar"></div><div data-music-morph hidden></div><section id="music-panel" hidden><div data-music-content>内容</div></section></aside>';
  root = document.querySelector('[data-music]')!;
  panel = document.querySelector('#music-panel')!;
  sheet = document.querySelector('[data-music-morph]')!;
  root.getBoundingClientRect = () => rect(24,700,286,64);
  root.querySelector<HTMLElement>('.music-bar')!.getBoundingClientRect = () => rect(24,700,286,64);
  panel.getBoundingClientRect = () => rect(24,200,352,488);
  sheet.getBoundingClientRect = () => rect(24,200,352,488);
  vi.spyOn(window,'matchMedia').mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}} as any);
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('播放器玻璃壳的最新意图', () => {
  it('展开交接的每一帧至少保留一层完整玻璃，不把背景模糊一起淡出', () => {
    let timeline: ReturnType<typeof realGsap.timeline>;
    const gsap = {...realGsap, timeline(config: gsap.TimelineVars) { timeline = realGsap.timeline({...config,paused:true}); return timeline; }};
    const motion=createPlayerMorph(root,()=>({gsap}) as any);
    try {
      motion.setOpen(true);
      for (const time of [.01,.15,.22,.27,.3,.33,.35,.4]) {
        timeline!.time(time,false);
        const fullGlass=[sheet,panel].some(el=>!el.hidden&&getComputedStyle(el).visibility!=='hidden'&&Number(getComputedStyle(el).opacity || '1')===1);
        expect(fullGlass,'玻璃交接时间 '+time+'s').toBe(true);
      }
    } finally {motion.dispose();}
  });
  it('动效库未就绪时，展开和关闭立即可用', () => {
    const motion = createPlayerMorph(root, () => null);
    motion.setOpen(true);
    expect(panel.hidden).toBe(false);
    expect(panel.style.visibility).not.toBe('hidden');
    motion.setOpen(false);
    expect(panel.hidden).toBe(true);
    expect(sheet.hidden).toBe(true);
    motion.dispose();
  });
  it('开关开连点时，过期的关闭回调不能藏掉最新展开面板', () => {
    const e = engine();
    const motion = createPlayerMorph(root, () => e as any);
    motion.setOpen(true);
    motion.setOpen(false);
    motion.setOpen(true);
    expect(e.completions).toHaveLength(3);
    e.completions[1]();
    expect(panel.hidden).toBe(false);
    e.completions[2]();
    expect(panel.hidden).toBe(false);
    expect(panel.style.opacity).toBe('');
    expect(sheet.hidden).toBe(true);
    motion.dispose();
  });
  it('窗口变化直接落在最新终态，销毁后不留形变层', () => {
    const e = engine();
    const motion = createPlayerMorph(root, () => e as any);
    motion.setOpen(true);
    window.dispatchEvent(new Event('resize'));
    expect(panel.hidden).toBe(false);
    expect(sheet.hidden).toBe(true);
    motion.setOpen(false);
    motion.dispose();
    e.completions.at(-1)!();
    expect(sheet.hidden).toBe(true);
    expect(panel.hidden).toBe(true);
  });
  it('减少动态时不启动形变', () => {
    vi.mocked(window.matchMedia).mockReturnValue({matches:true,addEventListener(){},removeEventListener(){}} as any);
    const e = engine();
    const motion = createPlayerMorph(root, () => e as any);
    motion.setOpen(true);
    expect(panel.hidden).toBe(false);
    expect(e.completions).toHaveLength(0);
    motion.dispose();
  });
});
