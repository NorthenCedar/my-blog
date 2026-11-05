// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MotionEngine } from '../src/scripts/motion-loader';
let cleanup:()=>void=()=>{};
beforeEach(()=>{
 Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})});
 document.body.innerHTML='<article class="work-row" id="work-demo"><a class="work-visual" data-project-open="demo" href="/forge/demo/"><h3>封面里的标题</h3></a><div class="work-copy"><h3><span data-project-card-title>作品标题</span></h3><a class="text-link" data-project-open="demo" href="/forge/demo/">查看</a></div></article><dialog class="project-dialog" id="project-demo"><div class="dialog-scrim"></div><div class="dialog-scroll"><div class="dialog-card"><button aria-label="关闭作品详情">关闭</button><h2><span data-project-title>作品标题</span></h2><div data-project-hero></div><p>正文</p></div></div><div class="dialog-flight"></div></dialog>';
 const dialog=document.querySelector('dialog')!;
 dialog.showModal=()=>{dialog.setAttribute('open','');};
 dialog.close=()=>{dialog.removeAttribute('open');dialog.dispatchEvent(new Event('close'));};
 document.body.style.overflow='auto';
});
afterEach(()=>{cleanup();cleanup=()=>{};document.body.innerHTML='';});
async function mount(engine:()=>MotionEngine|null=()=>null,reduced=()=>false){const {initProjectDialogs}=await import('../src/scripts/project-dialog-motion');const controller=initProjectDialogs(document.body,reduced,engine);cleanup=controller.dispose;return controller;}
function click(selector:string){document.querySelector<HTMLElement>(selector)!.click();}
describe('造物台共享封面详情',()=>{
 it('详情标题使用可承接 Flip 变换的盒子',()=>{
  const style=document.createElement('style');style.textContent=readFileSync('src/styles/forge.css','utf8');document.head.append(style);document.body.classList.add('forge-page');
  try{expect(getComputedStyle(document.querySelector('[data-project-title]')!).display).toBe('inline-block');}
  finally{style.remove();document.body.classList.remove('forge-page');}
 });
 it('复用原封面并留下占位，关闭后返回原位置、焦点和滚动锁',async()=>{
  const cover=document.querySelector('.work-visual')!,trigger=document.querySelector<HTMLElement>('.text-link')!;
  await mount();trigger.focus();trigger.click();
  expect(document.querySelector('dialog')!.open).toBe(true);
  expect(document.querySelector('[data-project-hero]')!.contains(cover)).toBe(true);
  expect(document.querySelector('[data-project-placeholder]')).not.toBeNull();expect(document.body.style.overflow).toBe('hidden');
  click('[aria-label="关闭作品详情"]');
  expect(document.querySelector('.work-row')!.firstElementChild).toBe(cover);expect(document.querySelector('[data-project-placeholder]')).toBeNull();
  expect(document.body.style.overflow).toBe('auto');expect(document.activeElement).toBe(trigger);expect(document.querySelector('dialog')!.open).toBe(false);
 });
 it('原生关闭和控制器销毁也归还封面，不留下内联几何',async()=>{
  const cover=document.querySelector('.work-visual')!;await mount();click('.text-link');document.querySelector('dialog')!.close();
  expect(cover.parentElement!.className).toBe('work-row');expect(cover.getAttribute('style')).toBeNull();
  click('.text-link');cleanup();expect(cover.parentElement!.className).toBe('work-row');expect(document.body.style.overflow).toBe('auto');
 });
 it('保留修饰点击的独立页面链接',async()=>{
  await mount();const event=new MouseEvent('click',{ctrlKey:true,bubbles:true,cancelable:true});document.querySelector('.text-link')!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);expect(document.querySelector('dialog')!.open).toBe(false);
 });
 it('减少动态直接到终态，窗口变化可安全结束形变',async()=>{
  const engine=vi.fn(()=>null);const controller=await mount(engine,()=>true);click('.text-link');window.dispatchEvent(new Event('resize'));controller.finishMotion();
  expect(engine).not.toHaveBeenCalled();expect(document.querySelector('[data-project-hero] .work-visual')).not.toBeNull();click('[aria-label="关闭作品详情"]');expect(document.querySelector('.work-row .work-visual')).not.toBeNull();
 });
 it('展开中关闭后旧回调不能把封面搬回详情',async()=>{
  const completions:(()=>void)[]=[];
  const animation={kill:vi.fn()};
  const fake={Flip:{getState:vi.fn((el:HTMLElement)=>{el.style.setProperty('translate','none');return{};}),from:vi.fn((_s:unknown,o:{onComplete?:()=>void})=>{if(o.onComplete)completions.push(o.onComplete);return animation;}),killFlipsOf:vi.fn()},gsap:{to:vi.fn(()=>animation),fromTo:vi.fn(()=>animation),set:vi.fn(),killTweensOf:vi.fn()}} as unknown as MotionEngine;
  const controller=await mount(()=>fake);const cover=document.querySelector('.work-visual')!;click('.text-link');expect(completions.length).toBeGreaterThan(0);expect(fake.Flip.getState).toHaveBeenCalledWith(document.querySelector('[data-project-card-title]'));
  const stale=completions[0];click('[aria-label="关闭作品详情"]');stale();controller.finishMotion();
  expect(document.querySelector('.work-row')!.contains(cover)).toBe(true);expect(document.querySelector('[data-project-placeholder]')).toBeNull();expect(document.querySelector('dialog')!.open).toBe(false);expect(cover.getAttribute('style')).toBeNull();
 });
});
