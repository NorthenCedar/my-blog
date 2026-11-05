// @vitest-environment happy-dom
import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import {initMusicPlayer} from '../src/scripts/music-player';

afterEach(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide'));vi.unstubAllGlobals();vi.restoreAllMocks();document.body.replaceChildren();});
it('播放器已收起时，后台音源错误不弹开歌单覆盖正在操作的页面',()=>{
  const html=readFileSync('dist/archive/index.html','utf8');
  const player=html.match(/<aside\b[^>]*data-music\b[\s\S]*?<\/aside>/)![0];
  document.body.innerHTML='<button id="page-action">页面操作</button>'+player;
  vi.spyOn(window,'matchMedia').mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}} as any);
  vi.stubGlobal('fetch',vi.fn(()=>Promise.reject(new Error('测试音源不可用'))));
  const root=document.querySelector<HTMLElement>('[data-music]')!;
  initMusicPlayer(root);
  const page=document.querySelector<HTMLElement>('#page-action')!;page.focus();
  root.querySelector('audio')!.dispatchEvent(new Event('error'));
  expect(root.querySelector<HTMLElement>('#music-panel')!.hidden).toBe(true);
  expect(document.activeElement).toBe(page);
  expect(root.querySelector('[data-music-status]')!.textContent).toContain('失败');
});

it('横条与展开面板共用曲目和播放状态，两个播放键都可操作',async()=>{
  const html=readFileSync('dist/archive/index.html','utf8');
  document.body.innerHTML=html.match(/<aside\b[^>]*data-music\b[\s\S]*?<\/aside>/)![0];
  vi.spyOn(window,'matchMedia').mockReturnValue({matches:true,addEventListener(){},removeEventListener(){}} as any);
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>[{name:'测试歌曲',artist:'测试歌手',url:'https://api.qijieya.cn/meting/?type=url&id=123'}]})));
  const root=document.querySelector<HTMLElement>('[data-music]')!,audio=root.querySelector('audio')!,buttons=[...root.querySelectorAll<HTMLButtonElement>('[data-music-play]')];
  let paused=true;vi.spyOn(audio,'paused','get').mockImplementation(()=>paused);
  const play=vi.spyOn(audio,'play').mockImplementation(async()=>{paused=false;audio.dispatchEvent(new Event('playing'));});
  const pause=vi.spyOn(audio,'pause').mockImplementation(()=>{paused=true;audio.dispatchEvent(new Event('pause'));});
  initMusicPlayer(root);expect(buttons).toHaveLength(2);
  buttons[0].click();await vi.waitFor(()=>expect(play).toHaveBeenCalledOnce());
  expect([...root.querySelectorAll('[data-music-title]')].map(el=>el.textContent)).toEqual(['测试歌曲','测试歌曲']);
  expect(buttons.map(el=>el.getAttribute('aria-label'))).toEqual(['暂停音乐','暂停音乐']);
  pause.mockClear();buttons[1].click();expect(pause).toHaveBeenCalledOnce();
  expect(buttons.map(el=>el.getAttribute('aria-label'))).toEqual(['播放音乐','播放音乐']);
});
