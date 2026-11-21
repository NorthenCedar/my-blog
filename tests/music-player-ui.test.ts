// @vitest-environment happy-dom
import {readFileSync} from 'node:fs';
import {afterEach,expect,it,vi} from 'vitest';
import {MUSIC_API, MUSIC_PLAYLIST} from '../src/lib/music';
import {initMusicPlayer} from '../src/scripts/music-player';

afterEach(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide'));sessionStorage.clear();vi.unstubAllGlobals();vi.restoreAllMocks();document.body.replaceChildren();});
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

const storageKey = `northcedar-music-${MUSIC_PLAYLIST}`;
const playlistResponse = (...songs: [id: string, name: string][]) => ({
  ok: true,
  json: async () => songs.map(([id, name]) => ({name, artist: '测试歌手', url: `${MUSIC_API}?id=${id}`})),
});

function setupPlaylist(initial: ReturnType<typeof playlistResponse>, stored = {id: '', time: 0}) {
  const html = readFileSync('dist/archive/index.html', 'utf8');
  document.body.innerHTML = html.match(/<aside\b[^>]*data-music\b[\s\S]*?<\/aside>/)![0];
  vi.spyOn(window, 'matchMedia').mockReturnValue({matches: true, addEventListener() {}, removeEventListener() {}} as any);
  sessionStorage.setItem(storageKey, JSON.stringify({...stored, shuffle: false}));
  const fetchPlaylist = vi.fn<() => Promise<ReturnType<typeof playlistResponse>>>().mockResolvedValueOnce(initial);
  vi.stubGlobal('fetch', fetchPlaylist);

  const root = document.querySelector<HTMLElement>('[data-music]')!;
  const audio = root.querySelector('audio')!;
  let paused = true;
  vi.spyOn(audio, 'paused', 'get').mockImplementation(() => paused);
  vi.spyOn(audio, 'readyState', 'get').mockReturnValue(1);
  vi.spyOn(audio, 'duration', 'get').mockReturnValue(180);
  const play = vi.spyOn(audio, 'play').mockImplementation(async () => {
    paused = false;
    audio.dispatchEvent(new Event('playing'));
  });
  vi.spyOn(audio, 'pause').mockImplementation(() => {
    if (paused) return;
    paused = true;
    audio.dispatchEvent(new Event('pause'));
  });
  initMusicPlayer(root);
  return {
    audio, fetchPlaylist, play,
    control: (name: string) => root.querySelector<HTMLElement>(`[data-music-${name}]`)!,
    titles: () => [...root.querySelectorAll('[data-music-title]')].map(el => el.textContent),
    songs: () => [...root.querySelectorAll<HTMLButtonElement>('[data-music-list] button')],
    highlighted: () => root.querySelector('[data-music-list] [aria-current] span')?.textContent,
    playingId: () => new URL(audio.src).searchParams.get('id'),
  };
}

it.each([['下一首', 'next', '201'], ['上一首', 'prev', '202']])('刷新移除了正在播放的歌曲，%s 从新歌单的一端接播', async (_label, direction, nextId) => {
  const player = setupPlaylist(playlistResponse(['101', '旧歌']));
  player.fetchPlaylist.mockResolvedValueOnce(playlistResponse(['201', '新歌甲'], ['202', '新歌乙']));
  player.control('play').click();
  await vi.waitFor(() => expect(player.titles()).toEqual(['旧歌', '旧歌']));
  player.audio.dispatchEvent(new Event('loadedmetadata'));
  player.audio.currentTime = 42;
  player.audio.dispatchEvent(new Event('timeupdate'));

  player.control('reload').click();
  await vi.waitFor(() => expect(player.songs()).toHaveLength(2));
  expect(player.titles()).toEqual(['旧歌', '旧歌']);
  expect(player.highlighted()).toBeUndefined();
  expect(player.playingId()).toBe('101');
  expect(player.audio.paused).toBe(false);
  expect(player.audio.currentTime).toBe(42);
  expect(player.control('time').textContent).toBe('0:42 / 3:00');
  expect(player.play).toHaveBeenCalledOnce();

  player.control('play').click();
  expect(player.audio.paused).toBe(true);
  expect(JSON.parse(sessionStorage.getItem(storageKey)!)).toMatchObject({id: '101', time: 42});
  player.control('play').click();
  await vi.waitFor(() => expect(player.audio.paused).toBe(false));
  expect(player.playingId()).toBe('101');
  player.control(direction).click();
  await vi.waitFor(() => expect(player.playingId()).toBe(nextId));
});

it('刷新期间可从旧歌单切歌，连续点击只读取一次，成功后按实际播放曲目更新标记', async () => {
  const player = setupPlaylist(playlistResponse(['101', '旧歌甲'], ['102', '旧歌乙']));
  let complete!: (value: ReturnType<typeof playlistResponse>) => void;
  player.fetchPlaylist.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  player.control('play').click();
  await vi.waitFor(() => expect(player.highlighted()).toBe('旧歌甲'));
  player.control('reload').click();
  player.control('reload').click();
  expect(player.fetchPlaylist).toHaveBeenCalledTimes(2);

  player.control('next').click();
  await vi.waitFor(() => expect(player.playingId()).toBe('102'));
  complete(playlistResponse(['201', '新歌'], ['102', '旧歌乙']));
  await vi.waitFor(() => expect(player.songs()[0].textContent).toContain('新歌'));
  expect(player.titles()).toEqual(['旧歌乙', '旧歌乙']);
  expect(player.highlighted()).toBe('旧歌乙');
  expect(player.play).toHaveBeenCalledTimes(2);
});

it('空歌单或读取失败时保留旧歌单，恢复服务后仍可刷新', async () => {
  const player = setupPlaylist(playlistResponse(['101', '旧歌甲'], ['102', '旧歌乙']));
  player.fetchPlaylist.mockResolvedValueOnce(playlistResponse());
  player.fetchPlaylist.mockRejectedValueOnce(new Error('测试歌单读取失败'));
  player.fetchPlaylist.mockResolvedValueOnce(playlistResponse(['201', '新歌']));
  player.control('play').click();
  await vi.waitFor(() => expect(player.highlighted()).toBe('旧歌甲'));

  for (let i = 0; i < 2; i++) {
    player.control('reload').click();
    await vi.waitFor(() => expect(player.control('status').textContent).toContain('重试'));
    expect(player.songs()).toHaveLength(2);
    expect(player.titles()).toEqual(['旧歌甲', '旧歌甲']);
    expect(player.audio.paused).toBe(false);
  }

  player.control('next').click();
  await vi.waitFor(() => expect(player.playingId()).toBe('102'));
  expect(player.fetchPlaylist).toHaveBeenCalledTimes(3);
  player.control('reload').click();
  await vi.waitFor(() => expect(player.songs()[0].textContent).toContain('新歌'));
  player.audio.dispatchEvent(new Event('ended'));
  expect(player.playingId()).toBe('201');
});

it('播出前重新载入保留所存曲目与续播进度', async () => {
  const player = setupPlaylist(playlistResponse(['101', '旧歌甲'], ['102', '旧歌乙']), {id: '102', time: 27});
  player.fetchPlaylist.mockResolvedValueOnce(playlistResponse(['102', '旧歌乙'], ['201', '新歌']));
  player.control('expand').click();
  await vi.waitFor(() => expect(player.highlighted()).toBe('旧歌乙'));
  player.control('reload').click();
  await vi.waitFor(() => expect(player.songs()[1].textContent).toContain('新歌'));
  player.control('shuffle').click();
  expect(JSON.parse(sessionStorage.getItem(storageKey)!)).toMatchObject({id: '102', time: 27});
  player.control('play').click();
  await vi.waitFor(() => expect(player.playingId()).toBe('102'));
  player.audio.dispatchEvent(new Event('loadedmetadata'));
  expect(player.audio.currentTime).toBe(27);
});

it('刷新移除当前曲目后，音源出错时播放键仍可重试原曲', async () => {
  const player = setupPlaylist(playlistResponse(['101', '旧歌']));
  player.fetchPlaylist.mockResolvedValueOnce(playlistResponse(['201', '新歌']));
  player.control('play').click();
  await vi.waitFor(() => expect(player.play).toHaveBeenCalledOnce());
  player.audio.currentTime = 36;
  player.control('reload').click();
  await vi.waitFor(() => expect(player.songs()[0].textContent).toContain('新歌'));

  player.audio.pause();
  vi.spyOn(player.audio, 'error', 'get').mockReturnValue({code: 2, message: '测试音源错误'} as MediaError);
  player.audio.dispatchEvent(new Event('error'));
  player.control('play').click();
  await vi.waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
  expect(player.playingId()).toBe('101');
  player.audio.dispatchEvent(new Event('loadedmetadata'));
  expect(player.audio.currentTime).toBe(36);
});
