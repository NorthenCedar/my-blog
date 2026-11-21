import MarkdownIt from 'markdown-it';
import { withWriterStrike } from './strike-markdown';
import { contentLinkUrl } from './content-urls.mjs';

const markdown = withWriterStrike(new MarkdownIt('commonmark', {
  html: false,
  breaks: true,
  xhtmlOut: false,
  linkify: false,
  typographer: false,
}).enable('strikethrough'));

// 中文常把结束标点一起加粗，闭合 ** 后也不留空格；CommonMark 会拒绝这种右定界。
// 仅给这类双星号补上闭合资格，配对、嵌套及 strong 生成仍交给原有强调后处理。
// 此规则排在代码、转义之后，不改原文，也不重新解释已经消费的文字。
markdown.inline.ruler.before('emphasis', 'talk_cjk_strong', (state, silent) => {
  if (silent || state.src.charCodeAt(state.pos) !== 0x2a) return false;
  const scanned = state.scanDelims(state.pos, true);
  if (scanned.length !== 2 || scanned.can_close) return false;
  const before = state.src.slice(state.pos - 1, state.pos);
  const after = state.src.slice(state.pos + 2, state.pos + 4);
  if (!/^[，。！？；：、）》」』】〉〕〗〙〛”’…—]$/u.test(before)
    || !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(after)) return false;
  for (let index = 0; index < 2; index++) {
    state.push('text', '', 0).content = '*';
    state.delimiters.push({
      marker: 0x2a,
      length: 2,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: true,
    });
  }
  state.pos += 2;
  return true;
});

// 默认校验会放过部分 data:image；说说正文仅允许网页、邮箱和相对链接。
markdown.validateLink = (value: string): boolean => {
  // 首段带冒号时必须明确写允许的协议，避免编码控制字符被当成相对地址。
  if (/^[^/?#]*:/.test(value) && !/^(?:https?|mailto):/i.test(value)) return false;
  return Boolean(contentLinkUrl(value));
};

// 配图仍走页面既有的构建期资源管线，正文图片只保留转义后的替代文字。
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);

/** 只生成 p 内合法的行内标记，原始 HTML 始终转义。 */
export function renderTalkText(text: string): string {
  const env={},tokens=markdown.parseInline(text,env);
  const balanced=tokens.every(token=>{
    let depth=0;
    for(const child of token.children??[]){if(child.markup==='<del>')depth++;else if(child.markup==='</del>'&&--depth<0)return false;}
    return depth===0;
  });
  // 不完整标签退回字面文字，避免 set:html 中未闭合的格式影响下一条说说。
  return balanced?markdown.renderer.render(tokens,markdown.options,env):markdown.renderInline(text,{writerLiteralStrike:true});
}
