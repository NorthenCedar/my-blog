/**
 * 保住正文里的行首缩进（包在 Astro 的 markdown 处理器外面的一层）。
 *
 * ★ 为什么需要（2026-11-04 站主报）：
 *   站主写笔记是「一行一条、子项用两个空格缩进」的：
 *       1.int x = '\144';是八进制数
 *         int x = '\x64';是十六进制数
 *   CommonMark 会把段落**续行**开头的空白当缩进吃掉，第二行就顶到最左边。
 *   这跟「段内换行」是两件事：换行由 prose.css 的 white-space: pre-wrap 保住，
 *   而空格在 markdown **解析阶段之前**就已经被吃掉了 —— 所以 CSS 救不回来，
 *   mdast 插件也救不回来（实测：Sätteri 交给 text 节点的值里已经没有那些空格）。
 *   唯一来得及的地方是**喂给解析器的字符串本身**。
 *
 * 做法：渲染前把「行首 1–3 个空格」换成 U+00A0（不换行空格）。
 *   nbsp 在 HTML 里不会被折叠，宽度与普通空格相同，pre-wrap 下照样当缩进用。
 *
 * ★ 为什么只换 1–3 个空格、而且要挑行：
 *   - 4 个及以上是 markdown 的缩进代码块，动了就把代码变成正文；
 *   - 行首之后紧跟 `-`/`*`/`+`/`1.`/`>`/`#`/`|`/`<`/围栏 的行是块级结构，
 *     动了会把「嵌套列表」变成「一行字」；
 *   - 围栏代码块（``` / ~~~）里的一切原样保留。
 *   写作台的预览（blog-desk 的 ui/app.js）用同一条规则，两边才长得一样。
 */

const NBSP = '\u00A0';

/** 行首之后出现这些，就当它是块级结构，不碰。 */
const BLOCK_START = /^(?:[-*+]|\d+[.)]|>|#|\||<|```|~~~)/;

/**
 * 把 markdown 源码里「段落续行的行首空格」换成不换行空格。
 * @param {string} markdown
 * @returns {string}
 */
export function keepLineIndent(markdown) {
  if (typeof markdown !== 'string' || !markdown.includes('\n')) return markdown;

  const lines = markdown.split('\n');
  let fence = null; // 当前所在的围栏：'```' / '~~~'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1].startsWith('`') ? '```' : '~~~';
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;

    // `(?! )` 是必须的：只有「1–3 个空格紧跟着非空格」才算作者的缩进；
    // 4 个以上是缩进代码块，贪婪匹配 3 个会把代码变成正文（踩过一次）。
    const lead = line.match(/^( {1,3})(?! )/);
    if (!lead) continue;
    if (BLOCK_START.test(line.slice(lead[0].length))) continue;
    // 上一行是空的或不存在 ⇒ 这是段落的**首行**，缩进属于「块级缩进」，不动
    if (i === 0 || lines[i - 1].trim() === '') continue;

    lines[i] = NBSP.repeat(lead[0].length) + line.slice(lead[0].length);
  }

  return lines.join('\n');
}

/**
 * 给任意 Astro markdown 处理器套上「保住行首缩进」。
 * @template {object} T
 * @param {{ name: string, options: T, createRenderer: Function, createMdxRenderer?: Function }} base
 */
export function withPreservedIndent(base) {
  const wrapper = {
    name: `${base.name}+preserve-indent`,
    options: base.options,
    async createRenderer(shared) {
      const renderer = await base.createRenderer(shared);
      return {
        render: (content, opts) => renderer.render(keepLineIndent(content), opts),
      };
    },
  };
  if (typeof base.createMdxRenderer === 'function') {
    wrapper.createMdxRenderer = (shared, mdx) => base.createMdxRenderer(shared, mdx);
  }
  return wrapper;
}