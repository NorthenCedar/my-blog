import MarkdownIt from 'markdown-it';
import { contentLinkUrl } from '../../lib/content-urls.mjs';
import { withWriterStrike } from '../../lib/strike-markdown';
import { preserveCodeSpaces } from './markdown-spaces';
const inlineMarkdown=preserveCodeSpaces(withWriterStrike(new MarkdownIt({html:false,linkify:false})));

export function safeWriterLink(value:string,origin:string):string|null{
  return contentLinkUrl(value,origin)?.href??null;
}
export function safeWriterImage(value:string,origin:string):string|null{
  try{const url=new URL(value,origin);return url.protocol==='blob:'&&value.startsWith(`blob:${origin}/`)||url.origin===origin&&/^\/api\/writer\/(assets|content)$/.test(url.pathname)?url.href:null;}catch{return null;}
}
/** 基础 Markdown 预览；只创建节点，原始 HTML 始终作为文字。 */
export function renderWriterMarkdown(body:string,resolveImage:(source:string)=>string|null):DocumentFragment{
  const fragment=document.createDocumentFragment(),origin=location.origin;
  const node=(tag:string,text?:string)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  function inline(parent:HTMLElement,text:string){
    const stack=[parent];
    for(const token of inlineMarkdown.parseInline(text,{})[0]?.children??[]){
      const current=stack[stack.length-1];
      if(token.type==='text'){current.append(document.createTextNode(token.content));continue;}
      if(token.type==='code_inline'){current.append(node('code',token.content));continue;}
      if(token.type==='softbreak'||token.type==='hardbreak'){current.append(node('br'));continue;}
      if(token.type==='image'){
        const resolved=resolveImage(token.attrGet('src')??''),approved=resolved?safeWriterImage(resolved,origin):null;
        const alt=(token.children??[]).map(child=>child.content).join('');
        if(approved){const img=document.createElement('img');img.src=approved;img.alt=alt;img.loading='lazy';img.decoding='async';current.append(img);}else current.append(document.createTextNode(`[配图：${alt||'待获取'}]`));
        continue;
      }
      if(['strong_open','em_open','s_open','link_open'].includes(token.type)){
        const child=node(token.type==='link_open'?'span':token.tag);
        if(token.type==='link_open'){
          const href=safeWriterLink(token.attrGet('href')??'',origin);
          if(href){const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener noreferrer';current.append(link);stack.push(link);continue;}
        }
        current.append(child);stack.push(child);
      }else if(token.nesting===-1&&stack.length>1)stack.pop();
    }
  }
  let fence='',code:string[]=[],paragraph:string[]=[],list:HTMLElement|null=null;
  const flush=()=>{if(paragraph.length){const p=node('p');inline(p,paragraph.join('\n'));fragment.append(p);paragraph=[];}list=null;};
  for(const raw of body.replaceAll('\r\n','\n').split('\n')){
    const line=raw.replace(/^(?: {0,3}> ?)+/,''),marker=/^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if(fence){if(marker&&marker[0]===fence[0]&&marker.length>=fence.length){const pre=node('pre');pre.append(node('code',code.join('\n')));fragment.append(pre);fence='';code=[];}else code.push(line);continue;}
    if(marker){flush();fence=marker;continue;}
    if(!line.trim()){flush();continue;}
    const heading=/^(#{1,6})\s+(.+)$/.exec(line),item=/^\s*(?:[-*+] |\d+\. )(.+)$/.exec(line);
    if(heading){flush();const h=node('h'+heading[1].length);inline(h,heading[2]);fragment.append(h);}
    else if(item){if(paragraph.length)flush();if(!list){list=node('ul');fragment.append(list);}const li=node('li');inline(li,item[1]);list.append(li);}
    else{list=null;paragraph.push(line);}
  }
  flush();if(fence){const pre=node('pre');pre.append(node('code',code.join('\n')));fragment.append(pre);}
  return fragment;
}
