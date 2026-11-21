import { fileURLToPath } from 'node:url';
import { contentLinkUrl, webContentUrl } from './content-urls.mjs';

const ELEMENTS = new Set(`
  a abbr article aside audio b blockquote br caption cite code dd del details div dl dt em
  figcaption figure h1 h2 h3 h4 h5 h6 hr i img input kbd li mark ol p pre q s samp section
  small source span strong sub summary sup table tbody td tfoot th thead tr track u ul var video
`.trim().split(/\s+/));
const COMMON_ATTRIBUTES = new Set(['class', 'className', 'dir', 'id', 'lang', 'role', 'title']);
const ELEMENT_ATTRIBUTES = new Map([
  ['a', ['href', 'rel', 'target', 'download', 'dataFootnoteRef', 'dataFootnoteBackref']],
  ['audio', ['src', 'controls', 'preload', 'loop', 'muted']],
  ['blockquote', ['cite']],
  ['del', ['cite', 'dateTime']],
  ['details', ['open']],
  ['div', ['dataAudio', 'dataSrc', 'dataLabel']],
  ['img', ['src', 'alt', 'width', 'height', 'loading', 'decoding']],
  ['input', ['type', 'checked', 'disabled']],
  ['li', ['value']],
  ['ol', ['start', 'reversed', 'type']],
  ['pre', ['dataLanguage', 'style', 'tabIndex', 'tabindex']],
  ['q', ['cite']],
  ['section', ['dataFootnotes']],
  ['source', ['src', 'type']],
  ['span', ['style']],
  ['td', ['colSpan', 'rowSpan', 'align', 'style']],
  ['th', ['colSpan', 'rowSpan', 'align', 'scope', 'style']],
  ['track', ['src', 'srcLang', 'label', 'kind', 'default']],
  ['video', ['src', 'poster', 'controls', 'playsInline', 'preload', 'width', 'height', 'loop', 'muted']],
]);

// 表格对齐和 Shiki 生成样式只需要这些声明，其他样式应由主题提供。
const TABLE_STYLE = /^text-align\s*:\s*(?:left|center|right);?$/;
const CODE_STYLE = /^(?:(?:background-color|color)\s*:\s*var\(--astro-code-[a-z-]+\)|overflow-x\s*:\s*auto|font-style\s*:\s*italic|font-weight\s*:\s*bold|text-decoration\s*:\s*(?:underline|line-through))$/;
const AUDIO_SOURCE = /^\/audio\/[a-f0-9]{64}\.(?:wav|mp3)$/;

function allowedAttribute(tag, key, value) {
  if (COMMON_ATTRIBUTES.has(key) || /^aria(?:[A-Z][A-Za-z]*|-[a-z-]+)$/.test(key)) return true;
  if (!ELEMENT_ATTRIBUTES.get(tag)?.includes(key)) return false;
  if (key === 'href') return Boolean(contentLinkUrl(value));
  if (key === 'src' || key === 'poster' || key === 'cite') return Boolean(webContentUrl(value));
  // 音频增强脚本会读取此地址，所以沿用音频标记自身的素材命名规则。
  if (key === 'dataSrc') return typeof value === 'string' && AUDIO_SOURCE.test(value);
  if (key === 'target') return typeof value === 'string' && ['_self', '_blank'].includes(value.toLowerCase());
  if (key === 'style') {
    if (typeof value !== 'string') return false;
    return tag === 'td' || tag === 'th'
      ? TABLE_STYLE.test(value.trim())
      : value.split(';').every(declaration => !declaration.trim() || CODE_STYLE.test(declaration.trim()));
  }
  return true;
}

export function markdownElementIssue(tag, attrs) {
  if (!ELEMENTS.has(tag)) return `不支持 <${tag}> 标签`;
  for (const [key, value] of Object.entries(attrs)) {
    if (!allowedAttribute(tag, key, value)) return `<${tag}> 的 ${key} 属性或值不受支持`;
  }
  if (tag === 'input' && (attrs.type !== 'checkbox' || attrs.disabled !== true)) {
    return '任务列表只允许静态复选框';
  }
  return null;
}

/** 在 Sätteri 的 HTML 解析之后校验整棵正文树，保留允许的原生富文本。 */
export const markdownContentPolicy = {
  name: 'northcedar-markdown-content-policy',
  before(root, context) {
    const path = context.fileURL?.protocol === 'file:' ? fileURLToPath(context.fileURL) : '正文';
    const reject = reason => { throw new Error(`Markdown 内容校验失败（${path}）${reason}`); };
    const visit = node => {
      if (node.type === 'raw' || node.type === 'doctype') reject('请使用支持的正文 HTML 标记');
      if (node.type === 'element') {
        const tag = node.tagName;
        const attrs = node.properties ?? {};
        const issue = markdownElementIssue(tag, attrs);
        if (issue) reject(issue);
        if (tag === 'a' && typeof attrs.target === 'string' && attrs.target.toLowerCase() === '_blank') {
          const rel = Array.isArray(attrs.rel) ? attrs.rel : [];
          context.setProperty(node, 'rel', [...new Set([...rel.filter(value => value.toLowerCase() !== 'opener'), 'noopener'])]);
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(root);
  },
};
