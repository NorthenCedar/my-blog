// 正文/说说/留言里的音频条（2026-11-10 站主：「加一个可以上传音频的功能（mp3 和 wav）……
// 设计一下音频按钮，要和本站视觉风格匹配」）。
//
// 服务端只吐一个稳定的骨架（见 src/lib/markdown-audio.mjs 与 Talks/评论渲染）：
//   <div class="ap" data-audio data-src="/audio/<hash>.mp3" data-label="说明">
//     <audio controls preload="metadata" src="…">…</audio>
//   </div>
// 没 JS 时原生控件就能播；有 JS 时这里把它换成站内那套（方块按钮 + 波形 + 单色时间）。
//
// ★ 波形不是真波形：按 src 的哈希出 40 根高度稳定的竖条。
//   真波形要 WebAudio 解码整段音频 —— 一页放三条语音就要解码三次，
//   而我们真正要表达的是「这里有一段声音、播到哪儿了」，不是「声压包络」。
//   哈希保证同一个文件永远同一张波形，刷新不闪。
//
// ★ 同一时间只播一条：长按播放两条叠在一起，读者分不清在听谁。

const BARS = 40;

/** 32 位 FNV-1a：只为「同一串字符 → 同一串随机数」，不需要密码学强度。 */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}

const PLAY = 'M8 5.5 19 12 8 18.5Z';
const PAUSE = 'M9 6v12M16 6v12';
const DOWNLOAD = 'M12 4v11M8 11l4 4 4-4M5 20h14';

let playing: HTMLAudioElement | null = null;

function upgrade(root: HTMLElement): void {
  const audio = root.querySelector<HTMLAudioElement>(':scope > audio');
  if (!audio) return; // 骨架里没有 audio ⇒ 不是我们的目标（或已被别的脚本接管）

  const src = root.dataset.src || audio.getAttribute('src') || '';
  const label = root.dataset.label || '';

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'ap-play';
  play.setAttribute('aria-label', '播放');
  play.append(icon(PLAY), icon(PAUSE));
  play.lastElementChild!.setAttribute('class', 'ap-glyph-pause');
  play.firstElementChild!.setAttribute('class', 'ap-glyph-play');

  const wave = document.createElement('div');
  wave.className = 'ap-wave';
  wave.tabIndex = 0;
  wave.setAttribute('role', 'slider');
  wave.setAttribute('aria-label', '播放进度');
  wave.setAttribute('aria-valuemin', '0');
  wave.setAttribute('aria-valuemax', '100');
  wave.setAttribute('aria-valuenow', '0');

  const seed = seedOf(src);
  const bars: HTMLElement[] = [];
  for (let i = 0; i < BARS; i++) {
    const bar = document.createElement('i');
    // 三段不同频率的正弦叠一起 —— 纯 LCG 会出锯齿状的「假」；
    // 叠出来更像人说话的包络（有起伏、有停顿）。
    const t = i / BARS;
    const h =
      0.30 +
      0.36 * Math.abs(Math.sin(t * 7.3 + seed * 0.0007)) +
      0.22 * Math.abs(Math.sin(t * 17.1 + seed * 0.0011)) +
      0.12 * Math.abs(Math.sin(t * 31.7 + seed * 0.0019));
    bar.style.setProperty('--h', `${Math.min(1, h) * 100}%`);
    wave.append(bar);
    bars.push(bar);
  }

  const time = document.createElement('span');
  time.className = 'ap-time';
  const now = document.createElement('b');
  now.textContent = '0:00';
  time.append(now, document.createTextNode(' / 0:00'));

  root.append(play, wave, time);

  if (label) {
    const tag = document.createElement('span');
    tag.className = 'ap-label';
    tag.textContent = label; // ← 一律 textContent，任何地方都不用 innerHTML
    root.append(tag);
  }

  if (src) {
    const dl = document.createElement('a');
    dl.className = 'ap-dl';
    dl.href = src;
    dl.download = '';
    dl.setAttribute('aria-label', '下载音频');
    dl.append(icon(DOWNLOAD));
    root.append(dl);
  }

  root.dataset.apReady = '';

  const paint = (): void => {
    const duration = audio.duration;
    const ratio = Number.isFinite(duration) && duration > 0 ? audio.currentTime / duration : 0;
    const cut = Math.round(ratio * BARS);
    for (let i = 0; i < BARS; i++) {
      if (i < cut) bars[i].dataset.played = '';
      else delete bars[i].dataset.played;
    }
    wave.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    now.textContent = fmt(audio.currentTime);
    if (Number.isFinite(duration) && duration > 0) {
      time.lastChild!.textContent = ` / ${fmt(duration)}`;
    }
  };

  const toggle = (): void => {
    if (audio.paused) {
      if (playing && playing !== audio) playing.pause();
      void audio.play().catch(() => {
        root.removeAttribute('data-ap-playing');
        play.setAttribute('aria-label', '播放');
      });
    } else {
      audio.pause();
    }
  };

  play.addEventListener('click', toggle);

  wave.addEventListener('click', (event) => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = wave.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    paint();
  });

  wave.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0;
    if (step === 0) return;
    event.preventDefault();
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + step));
    paint();
  });

  audio.addEventListener('play', () => {
    playing = audio;
    root.dataset.apPlaying = '';
    play.setAttribute('aria-label', '暂停');
  });
  audio.addEventListener('pause', () => {
    if (playing === audio) playing = null;
    root.removeAttribute('data-ap-playing');
    play.setAttribute('aria-label', '播放');
  });
  audio.addEventListener('ended', () => {
    root.removeAttribute('data-ap-playing');
    paint();
  });
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('loadedmetadata', paint);
  audio.addEventListener('error', () => {
    root.removeAttribute('data-ap-playing');
    time.textContent = '载入失败';
  });

  // 骨架里若已经带了 label（服务端渲染的），就用它，别重复加一遍。
  const existing = root.querySelector(':scope > .ap-label');
  if (existing && label && !existing.textContent) existing.textContent = label;
}

export function upgradeAudio(root: ParentNode = document): void {
  for (const node of root.querySelectorAll<HTMLElement>('[data-audio]:not([data-ap-ready])')) {
    upgrade(node);
  }
}

if (typeof document !== 'undefined') {
  upgradeAudio();
  // 评论是异步取回来的：新插进来的音频条要能自己长出来。
  document.addEventListener('voiceprint:new', (event) => {
    const detail = (event as CustomEvent<{ comment?: { audio?: string } }>).detail;
    if (detail?.comment?.audio) upgradeAudio();
  });
  document.addEventListener('ap:refresh', () => upgradeAudio());
}