import type MarkdownIt from 'markdown-it';

/** 仅识别无属性的删除线标签；用于避免中文句中混合强调时的分隔符歧义。 */
export function withWriterStrike(markdown:MarkdownIt){
  markdown.inline.ruler.before('html_inline','writer_strike',(state,silent)=>{
    const raw=state.src.slice(state.pos),opening=raw.startsWith('<del>'),closing=raw.startsWith('</del>');
    if(!opening&&!closing)return false;
    if(closing&&state.tokens.reduce((depth,token)=>depth+(token.markup==='<del>'?1:token.markup==='</del>'?-1:0),0)<=0)return false;
    const markup=opening?'<del>':'</del>';
    if(!silent){const token=state.push(opening?'s_open':'s_close','s',opening?1:-1);token.markup=markup;}
    state.pos+=markup.length;return true;
  });
  return markdown;
}
