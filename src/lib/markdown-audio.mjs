/**
 * 正文里的音频条（2026-11-10 站主：「加一个可以上传音频的功能（mp3 和 wav）……
 * 设计一下音频按钮，要和本站视觉风格匹配」）。
 *
 * 写法（单独一行）：
 *     !audio[说明文字](/audio/<64 位小写 SHA-256>.mp3)
 *     !audio[说明文字](/audio/<64 位小写 SHA-256>.wav)
 * 说明文字可空：`!audio[](/audio/….mp3)`。
 *
 * ★ 为什么在**喂给解析器之前**把这一行换成 HTML（而不是写 mdast 插件）：
 *   和 markdown-preserve-indent.mjs 同一个理由 —— 这层包装只能拿到源码字符串，
 *   拿不到语法树；而这一行本来就要求「独占一段」，源码级替换是够用的。
 *   好处是不必赌 Sätteri 的插件签名，坏处是这一行不能写在列表项里 ——
 *   所以下面的正则**只认整行**，写歪了就当普通文字，不会吐出半截标签。
 *
 * ★ 为什么要校验文件名是 64 位十六进制：
 *   这条路径会进 HTML 属性，作者内容虽是可信的，但一条能注入属性的语法
 *   迟早会被别的脚本（写作台的预览、第三方导入器）复用 —— 在那里它就不是可信的了。
 *   只放行 `/audio/<hex>.(mp3|wav)`，其余一律保留原样文字。
 */

const AUDIO_LINE = /^[ \t]*!audio\[([^\]\n]{0,120})\]\((\/audio\/[a-f0-9]{64}\.(?:mp3|wav))\)[ \t]*$/;

/** HTML 属性转义：说明文字里出现引号/尖括号时不能把标签撑破。 */
function attr(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 把一段 markdown 源码里的音频行换成播放条骨架。 */
export function expandAudioMarkup(markdown) {
  if (typeof markdown !== 'string' || !markdown.includes('!audio[')) return markdown;
  // 围栏代码块里原样保留（那里写的是「怎么用」，不是「要用」）。
  const lines = markdown.split('\n');
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^[ \t]*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1].startsWith('`') ? '```' : '~~~';
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const match = line.match(AUDIO_LINE);
    if (!match) continue;
    const [, label, src] = match;
    lines[i] =
      `<div class="ap" data-audio data-src="${src}" data-label="${attr(label)}">` +
      `<audio controls preload="metadata" src="${src}" aria-label="${attr(label || '音频')}"></audio>` +
      `</div>`;
  }
  return lines.join('\n');
}

/**
 * 给任意 Astro markdown 处理器套上「音频行 → 播放条」。
 * @template {object} T
 * @param {{ name: string, options: T, createRenderer: Function, createMdxRenderer?: Function }} base
 */
export function withAudioMarkup(base) {
  const wrapper = {
    name: `${base.name}+audio-markup`,
    options: base.options,
    async createRenderer(shared) {
      const renderer = await base.createRenderer(shared);
      return {
        render: (content, opts) => renderer.render(expandAudioMarkup(content), opts),
      };
    },
  };
  if (typeof base.createMdxRenderer === 'function') {
    wrapper.createMdxRenderer = (shared, mdx) => base.createMdxRenderer(shared, mdx);
  }
  return wrapper;
}