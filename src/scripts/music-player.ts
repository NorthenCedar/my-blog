import { MUSIC_API, MUSIC_PLAYLIST, normaliseTracks, orderMusicTracks, restoreMusicState, formatMusicTime, MusicQueue, type MusicTrack } from '../lib/music';
import { createPlayerMorph } from './player-morph';
import { createMusicDock } from './music-dock';

const root = document.querySelector<HTMLElement>('[data-music]');
if (root) initMusicPlayer(root);
document.addEventListener('astro:page-load', () => {
  const player = document.querySelector<HTMLElement>('[data-music]');
  if (player && !player.dataset.musicInitialized) initMusicPlayer(player);
});

export function initMusicPlayer(root: HTMLElement) {
  if (root.dataset.musicInitialized) return;
  root.dataset.musicInitialized = 'true';
  const el = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-music-${name}]`)!;
  const audio = el<HTMLAudioElement>('audio');
  const panel = root.querySelector<HTMLElement>('#music-panel')!;
  const morph = createPlayerMorph(root);
  const playButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-music-play]')];
  const expand = el<HTMLButtonElement>('expand');
  const setTrack = (track: MusicTrack) => {
    root.querySelectorAll('[data-music-title]').forEach(el => { el.textContent = track.title; });
    root.querySelectorAll('[data-music-caption]').forEach(el => { el.textContent = track.artist; });
  };
  const status = el('status');
  const list = el<HTMLOListElement>('list');
  const search = el<HTMLInputElement>('search');
  const seek = el<HTMLInputElement>('seek');
  const volume = el<HTMLInputElement>('volume');
  const shuffleButton = el<HTMLButtonElement>('shuffle');
  const queue = new MusicQueue();
  const key = `northcedar-music-${MUSIC_PLAYLIST}`;
  let stored = restoreMusicState(null);
  try { stored = restoreMusicState(sessionStorage.getItem(key)); } catch { /* 隐私模式仍可播放 */ }
  let tracks: MusicTrack[] = [];
  let current = 0;
  let loading: Promise<void> | null = null;
  let requestId = 0;
  let resumeAt = stored.time;
  let lastWritten = 0;
  let shuffle = stored.shuffle;
  shuffleButton.setAttribute('aria-pressed', String(shuffle));
  audio.volume = stored.volume;
  volume.value = String(stored.volume);
  root.hidden = false;
  const dock = createMusicDock(root, () => morph.finish());

  function persist() {
    const id = tracks[current]?.id || stored.id;
    const time = audio.src ? (audio.readyState ? audio.currentTime : resumeAt) : stored.time;
    try { sessionStorage.setItem(key, JSON.stringify({ id, time, volume: audio.volume, shuffle })); } catch { /* 存储失败不影响声音 */ }
  }

  function renderList() {
    const query = search.value.trim().toLocaleLowerCase();
    const fragment = document.createDocumentFragment();
    tracks.forEach((track, index) => {
      if (query && !`${track.title} ${track.artist}`.toLocaleLowerCase().includes(query)) return;
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const song = document.createElement('span');
      const artist = document.createElement('small');
      song.textContent = track.title;
      artist.textContent = track.artist;
      button.append(song, artist);
      if (index === current) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => { void select(index); });
      item.append(button);
      fragment.append(item);
    });
    list.replaceChildren(fragment);
    if (!list.childElementCount) {
      const item = document.createElement('li');
      item.textContent = '没有找到匹配的歌曲';
      list.append(item);
    }
  }

  function loadPlaylist(): Promise<void> {
    if (tracks.length) return Promise.resolve();
    if (loading) return loading;
    status.textContent = '正在读取歌单…';
    const url = new URL(MUSIC_API);
    url.search = new URLSearchParams({ server: 'netease', type: 'playlist', id: MUSIC_PLAYLIST }).toString();
    loading = (async () => {
      const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('读取歌单失败');
      tracks = orderMusicTracks(normaliseTracks(await response.json()), root.dataset.musicOrder!.split(','));
      if (!tracks.length) throw new Error('暂时读不到曲目');
      queue.reset(tracks.length);
      current = Math.max(0, tracks.findIndex(track => track.id === stored.id));
      if (tracks[current].id !== stored.id) resumeAt = 0;
      setTrack(tracks[current]);
      status.textContent = `已读取 ${tracks.length} 首，点击歌曲开始播放。`;
      renderList();
    })().catch(error => {
      status.textContent = '歌单暂时不可用，点击「重新载入」重试。';
      throw error;
    }).finally(() => { loading = null; });
    return loading;
  }

  function setOpen(open: boolean) {
    dock.setOpen(open);
    morph.setOpen(open);
    expand.setAttribute('aria-expanded', String(open));
    expand.setAttribute('aria-label', open ? '收起音乐播放器' : '打开音乐播放器');
    if (open) void loadPlaylist().catch(() => {});
  }

  async function select(index: number, restore = 0) {
    const token = ++requestId;
    audio.pause();
    current = (index + tracks.length) % tracks.length;
    const track = tracks[current];
    if (!track) return;
    queue.record(current);
    resumeAt = restore;
    const url = new URL(MUSIC_API);
    url.search = new URLSearchParams({ server: 'netease', type: 'url', id: track.id }).toString();
    audio.src = url.href;
    setTrack(track);
    seek.disabled = true;
    status.textContent = '正在连接音源…';
    renderList();
    persist();
    try { await audio.play(); }
    catch (error) {
      if (token !== requestId) return;
      status.textContent = error instanceof DOMException && error.name === 'NotAllowedError'
        ? '浏览器需要再点击一次播放。'
        : '这首暂时无法播放，可重试或切换下一首。';
      expand.title = status.textContent || '音源暂时不可用';
    }
  }

  playButtons.forEach(playButton => playButton.addEventListener('click', async () => {
    if (!audio.paused) { audio.pause(); return; }
    try {
      await loadPlaylist();
      if (!audio.src || audio.error) {
        const start = !audio.src && !stored.id && shuffle ? queue.next(-1, true) : current;
        await select(start, resumeAt);
      }
      else {
        try { await audio.play(); }
        catch { status.textContent = '播放未开始，请重试或切换曲目。'; expand.title = status.textContent; }
      }
    } catch { expand.title = status.textContent || '暂时无法播放'; }
  }));
  expand.addEventListener('click', () => setOpen(panel.hidden));
  document.querySelector('[data-music-access]')?.addEventListener('click', () => { setOpen(true); expand.focus({preventScroll:true}); });
  document.addEventListener('pointerdown', event => { if (!panel.hidden && !root.contains(event.target as Node)) setOpen(false); });
  el('close').addEventListener('click', () => { setOpen(false); expand.focus(); });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { setOpen(false); expand.focus(); }
  });
  shuffleButton.addEventListener('click', () => {
    shuffle = !shuffle;
    shuffleButton.setAttribute('aria-pressed', String(shuffle));
    persist();
  });
  for (const [name, step] of [['prev', -1], ['next', 1]] as const) {
    el(name).addEventListener('click', async () => {
      try {
        await loadPlaylist();
        await select(step < 0 ? queue.previous(current, shuffle) : queue.next(current, shuffle));
      } catch { expand.title = status.textContent || '暂时无法播放'; }
    });
  }
  el('reload').addEventListener('click', () => {
    if (loading) return;
    stored = { id: tracks[current]?.id || stored.id, time: audio.currentTime, volume: audio.volume, shuffle };
    tracks = [];
    void loadPlaylist().catch(() => {});
  });
  search.addEventListener('input', renderList);
  seek.addEventListener('input', () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) * audio.duration / 1000;
  });
  seek.addEventListener('change', persist);
  volume.addEventListener('input', () => { audio.volume = Number(volume.value); persist(); });
  audio.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    if (resumeAt > 0) audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 1));
    resumeAt = 0;
    seek.disabled = false;
  });
  audio.addEventListener('playing', () => {
    document.querySelectorAll('video').forEach(video => {
      if (!video.paused) video.pause();
    });
    root.classList.add('is-playing');
    playButtons.forEach(button => button.setAttribute('aria-label', '暂停音乐'));
    status.textContent = '正在播放';
  });
  audio.addEventListener('pause', () => {
    root.classList.remove('is-playing');
    playButtons.forEach(button => button.setAttribute('aria-label', '播放音乐'));
    status.textContent = '已暂停';
    persist();
  });
  audio.addEventListener('error', () => {
    status.textContent = '音源连接失败，可点击播放重试，或切换下一首。';
    expand.title = status.textContent;
  });
  audio.addEventListener('timeupdate', () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    el('time').textContent = `${formatMusicTime(audio.currentTime)} / ${formatMusicTime(duration)}`;
    if (duration) seek.value = String(Math.round(audio.currentTime / duration * 1000));
    if (Date.now() - lastWritten > 5000) { persist(); lastWritten = Date.now(); }
  });
  audio.addEventListener('ended', () => { void select(queue.next(current, shuffle)); });
  document.addEventListener('play', event => {
    if (event.target instanceof HTMLVideoElement && !audio.paused) {
      audio.pause();
      status.textContent = '视频播放中，音乐已暂停。';
    }
  }, true);
  document.addEventListener('astro:page-load', () => dock.refresh());
  window.addEventListener('pagehide', event => {
    persist(); morph.finish();
    if (!event.persisted && !(event as PageTransitionEvent & {astroNavigation?:boolean}).astroNavigation) { morph.dispose(); dock.dispose(); }
  });
}
