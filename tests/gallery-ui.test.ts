// @vitest-environment happy-dom
import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import {finishGalleryEntry} from '../src/scripts/gallery-entry';
afterEach(()=>{vi.useRealTimers();document.head.replaceChildren();document.body.replaceChildren();document.body.className='';document.documentElement.className='';});
it('显影场景开启时，目录和关闭键仍接收鼠标',()=>{
  document.documentElement.className='gallery-stage-ready on-develop';document.body.className='gallery-story';
  const style=document.createElement('style');style.textContent=readFileSync('src/styles/gallery-stage.css','utf8');document.head.append(style);
  document.body.innerHTML='<main><dialog class="gallery-catalog" open><button>关闭目录</button></dialog></main>';
  expect(getComputedStyle(document.querySelector('dialog')!).pointerEvents).toBe('auto');
  expect(getComputedStyle(document.querySelector('button')!).pointerEvents).not.toBe('none');
});

it('时间切片交接结束后清理背景标记，动画事件缺失也有兜底',()=>{
  vi.useFakeTimers();document.documentElement.className='tsl-in';document.body.innerHTML='<div class="tsl-veil"></div>';
  const dispose=finishGalleryEntry(document.documentElement);document.querySelector('.tsl-veil')!.dispatchEvent(new Event('animationend'));
  expect(document.documentElement.classList.contains('tsl-in')).toBe(false);dispose();
  document.documentElement.className='tsl-in';const stop=finishGalleryEntry(document.documentElement);vi.advanceTimersByTime(1200);
  expect(document.documentElement.classList.contains('tsl-in')).toBe(false);stop();
});
