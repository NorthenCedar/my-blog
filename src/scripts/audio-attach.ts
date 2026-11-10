// 语音附件：播放条渲染 + 表单里的「＋ 语音」按钮（2026-11-10）。
//
// 抽成独立模块的两个理由：
//   ① 评论、回复、说说三处都要能挂语音，抄三份必然长歪；
//   ② 「上传 → 拿 id → 随正文提交」这条链有**失败语义**（传失败不能丢正文），
//      散在各表单里就没人记得清。
//
// 安全铁律同其它脚本：用户输入一律 textContent，不拼 innerHTML。

// 播放器按需加载：`.ap` 骨架先写进 DOM（原生 audio controls 顶上），
// 播放器模块（波形/键盘/单曲互斥）等它到货再接管 —— 评论页首屏因此不背这 7 KB。
function upgradeLater(root: ParentNode): void {
  void import('./audio-player').then((m) => m.upgradeAudio(root));
}

/** 与服务端 AUDIO_MAX 对齐（functions/api/_lib/comment-audio.ts）。前端先挡一次，省一趟往返。 */
export const AUDIO_MAX = 1_500_000;

/**
 * 一条语音的播放条（`.ap` 结构由 audio.css + audio-player.ts 定义）。
 * 传空字符串返回 null —— 调用方可以直接 `const node = audioPlayer(...); if (node) …`。
 */
export function audioPlayer(src: string, label = '', extra = ''): HTMLElement | null {
  if (!src) return null;
  const box = document.createElement('div');
  box.className = `ap ${extra}`.trim();
  box.dataset.audio = '';
  box.dataset.src = src;
  if (label) box.dataset.label = label;
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'metadata';
  audio.src = src;
  box.append(audio);
  upgradeLater(box);
  return box;
}

/**
 * 往一个表单里塞「＋ 语音」按钮。
 * 返回一个读取器：提交时调 `id()` 拿到已上传音频的 id（没传就是 ''）。
 *
 * 交互（全部用 aria-live 播报，键盘可达）：
 *   点按钮 → 选文件 → 立刻上传（不随表单提交）→ 状态栏变成「已附上 0:42」→ 再点 ✕ 取消。
 * ★ 为什么立刻上传：1.5 MB 跟着表单一起发，413/超时时用户文字已经写完，白写。
 */
export function audioPicker(host: HTMLElement, onPick: (id: string) => void = () => {}, before?: Element | null): () => string {
  let picked = '';

  const wrap = document.createElement('div');
  wrap.className = 'ap-attach';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/mpeg,audio/wav,.mp3,.wav';
  input.hidden = true;
  input.tabIndex = -1;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ap-attach-btn';
  button.textContent = '＋ 语音';

  const status = document.createElement('span');
  status.className = 'ap-attach-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'ap-attach-clear';
  clear.textContent = '✕';
  clear.setAttribute('aria-label', '移除语音');
  clear.hidden = true;

  const setPicked = (id: string, text: string) => {
    picked = id;
    status.textContent = text;
    clear.hidden = !id;
    button.disabled = false;
    onPick(id);
  };

  const reset = () => {
    input.value = '';
    setPicked('', '');
  };

  button.addEventListener('click', () => input.click());
  clear.addEventListener('click', reset);

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > AUDIO_MAX) {
      setPicked('', `太大了（上限 ${Math.round(AUDIO_MAX / 1000 / 100) / 10} MB）`);
      input.value = '';
      return;
    }
    const type = /\.wav$/i.test(file.name) ? 'audio/wav' : 'audio/mpeg';
    button.disabled = true;
    status.textContent = '上传中…';
    try {
      const res = await fetch('/api/audio', {
        method: 'POST',
        headers: { 'Content-Type': type, 'X-NC-Request': '1' },
        body: file,
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || '语音没传上去');
      setPicked(body.id, '已附上语音');
    } catch (error) {
      setPicked('', (error as Error).message || '语音没传上去');
      input.value = '';
    }
  });

  wrap.append(input, button, status, clear);
  host.insertBefore(wrap, before ?? null);
  return () => picked;
}