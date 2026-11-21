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
    root.querySelectorAll('[data-music-title], [data-music-caption]').forEach(element => {
      element.textContent = element.hasAttribute('data-music-title') ? track.title : track.artist;
    });
  };
  const status = el('status');
  const playbackError = '音源连接失败，可重试或切换。';
  const report = (message: string) => {
    status.textContent = message;
    expand.title = message;
  };
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
  // 已载入的音频可以继续播放，即使刷新后的歌单里已经没有这首歌。
  let activeTrack: MusicTrack | undefined;
  let loading: Promise<boolean> | null = null;
  let requestId = 0;
  let resumeAt = 0;
  let lastWritten = 0;
  let shuffle = stored.shuffle;
  shuffleButton.setAttribute('aria-pressed', String(shuffle));
  audio.volume = stored.volume;
  volume.value = String(stored.volume);
  root.hidden = false;
  const dock = createMusicDock(root, () => morph.finish());

  function currentIndex() {
    const id = activeTrack?.id ?? stored.id;
    const index = tracks.findIndex(track => track.id === id);
    return activeTrack ? index : Math.max(0, index);
  }

  function playbackTime() {
    return audio.readyState ? audio.currentTime : resumeAt;
  }

  function musicUrl(type: 'playlist' | 'url', id: string) {
    const url = new URL(MUSIC_API);
    url.search = new URLSearchParams({ server: 'netease', type, id }).toString();
    return url;
  }

  function persist() {
    const id = activeTrack?.id ?? tracks[currentIndex()]?.id ?? stored.id;
    const time = activeTrack ? playbackTime() : (id === stored.id ? stored.time : 0);
    try { sessionStorage.setItem(key, JSON.stringify({ id, time, volume: audio.volume, shuffle })); } catch { /* 存储失败不影响声音 */ }
  }

  function renderList() {
    const query = search.value.trim().toLocaleLowerCase();
    const current = currentIndex();
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
      button.addEventListener('click', () => { void playTrack(track); });
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

  function loadPlaylist(refresh = false): Promise<boolean> {
    if (tracks.length && !refresh) return Promise.resolve(true);
    if (loading) return loading;
    const readingStatus = '正在读取歌单…';
    status.textContent = readingStatus;
    const unavailable = () => {
      report(tracks.length ? '刷新失败，已保留歌单，可重试。' : '歌单暂不可用，可重新载入。');
      return false;
    };
    loading = (async () => {
      const response = await fetch(musicUrl('playlist', MUSIC_PLAYLIST), { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
      if (!response.ok) return unavailable();
      const nextTracks = orderMusicTracks(normaliseTracks(await response.json()), root.dataset.musicOrder!.split(','));
      if (!nextTracks.length) return unavailable();

      tracks = nextTracks;
      queue.reset(tracks.length);
      const current = currentIndex();
      if (!activeTrack) setTrack(tracks[current]);
      else if (current >= 0) queue.record(current);
      if (status.textContent === readingStatus) status.textContent = `已读取 ${tracks.length} 首。`;
      renderList();
      return true;
    })().catch(unavailable).finally(() => { loading = null; });
    return loading;
  }

  function setOpen(open: boolean) {
    dock.setOpen(open);
    morph.setOpen(open);
    expand.setAttribute('aria-expanded', String(open));
    expand.setAttribute('aria-label', open ? '收起音乐播放器' : '打开音乐播放器');
    if (open) void loadPlaylist();
  }

  function playTrack(track: MusicTrack, restore = 0) {
    audio.pause();
    activeTrack = track;
    const current = currentIndex();
    if (current >= 0) queue.record(current);
    resumeAt = restore;
    audio.src = musicUrl('url', track.id).href;
    setTrack(track);
    seek.disabled = true;
    status.textContent = '正在连接音源…';
    renderList();
    persist();
    return resume();
  }

  async function resume() {
    const token = ++requestId;
    try { await audio.play(); }
    catch (error) {
      if (token !== requestId) return;
      report(error instanceof DOMException && error.name === 'NotAllowedError'
        ? '浏览器需要再点击一次播放。'
        : playbackError);
    }
  }

  function playAdjacent(step: -1 | 1) {
    if (!tracks.length) return;
    const current = currentIndex();
    if (step > 0) return playTrack(tracks[queue.next(current, shuffle)]);
    return playTrack(tracks[current < 0 ? tracks.length - 1 : queue.previous(current, shuffle)]);
  }

  playButtons.forEach(playButton => playButton.addEventListener('click', async () => {
    if (!audio.paused) { ++requestId; audio.pause(); return; }
    if (activeTrack) {
      if (audio.error) void playTrack(activeTrack, playbackTime());
      else void resume();
      return;
    }
    if (!(await loadPlaylist()) || activeTrack) return;
    const start = !stored.id && shuffle ? queue.next(-1, true) : currentIndex();
    const track = tracks[start];
    void playTrack(track, track.id === stored.id ? stored.time : 0);
  }));
  expand.addEventListener('click', () => setOpen(panel.hidden));
  document.querySelector('[data-music-access]')?.addEventListener('click', () => { setOpen(true); expand.focus({preventScroll:true}); });
  document.addEventListener('pointerdown', event => { if (!panel.hidden && !root.contains(event.target as Node)) setOpen(false); });
  const close = () => { setOpen(false); expand.focus(); };
  el('close').addEventListener('click', close);
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  shuffleButton.addEventListener('click', () => {
    shuffle = !shuffle;
    shuffleButton.setAttribute('aria-pressed', String(shuffle));
    persist();
  });
  for (const [name, step] of [['prev', -1], ['next', 1]] as const) {
    el(name).addEventListener('click', async () => {
      if (await loadPlaylist()) void playAdjacent(step);
    });
  }
  el('reload').addEventListener('click', () => {
    void loadPlaylist(true);
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
  const reflectPlayback = (event: Event) => {
    const playing = !audio.paused;
    if (playing !== (event.type === 'playing')) return;
    root.classList.toggle('is-playing', playing);
    playButtons.forEach(button => button.setAttribute('aria-label', playing ? '暂停音乐' : '播放音乐'));
    status.textContent = playing ? '正在播放' : '已暂停';
    if (playing) {
      document.querySelectorAll('video').forEach(video => {
        if (!video.paused) video.pause();
      });
      expand.removeAttribute('title');
    } else {
      persist();
    }
  };
  audio.addEventListener('playing', reflectPlayback);
  audio.addEventListener('pause', reflectPlayback);
  audio.addEventListener('error', () => report(playbackError));
  audio.addEventListener('timeupdate', () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    el('time').textContent = `${formatMusicTime(audio.currentTime)} / ${formatMusicTime(duration)}`;
    if (duration) seek.value = String(Math.round(audio.currentTime / duration * 1000));
    if (Date.now() - lastWritten > 5000) { persist(); lastWritten = Date.now(); }
  });
  audio.addEventListener('ended', () => { void playAdjacent(1); });
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
