import type MarkdownIt from 'markdown-it';

/** 仅识别无属性的删除线标签；供写作台与公开说说复用，避免混合强调的定界歧义。 */
export function withWriterStrike(markdown:MarkdownIt){
  markdown.inline.ruler.before('html_inline','writer_strike',(state,silent)=>{
    if(state.env.writerLiteralStrike)return false;
    const raw=state.src.slice(state.pos),opening=raw.startsWith('<del>'),closing=raw.startsWith('</del>');
    if(!opening&&!closing)return false;
    if(closing&&state.tokens.reduce((depth,token)=>depth+(token.markup==='<del>'?1:token.markup==='</del>'?-1:0),0)<=0)return false;
    const markup=opening?'<del>':'</del>';
    if(!silent){const token=state.push(opening?'s_open':'s_close','s',opening?1:-1);token.markup=markup;}
    state.pos+=markup.length;return true;
  });
  return markdown;
}
