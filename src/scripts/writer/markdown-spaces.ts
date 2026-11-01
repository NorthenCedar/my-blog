import type MarkdownIt from 'markdown-it';
import backticks from 'markdown-it/lib/rules_inline/backticks.mjs';

/** 当前 MarkdownIt 会误删纯空格代码两侧各一格；按原代码定界符内的长度恢复。 */
export function preserveCodeSpaces(markdown:MarkdownIt){
  markdown.inline.ruler.at('backticks',(state,silent)=>{
    const start=state.pos,count=state.tokens.length;
    const matched=backticks(state,silent);
    const token=state.tokens[state.tokens.length-1];
    if(!silent&&matched&&state.tokens.length>count&&token.type==='code_inline'){
      const raw=state.src.slice(start+token.markup.length,state.pos-token.markup.length).replace(/\n/g,' ');
      if(/^ +$/.test(raw))token.content=raw;
    }
    return matched;
  });
  return markdown;
}
