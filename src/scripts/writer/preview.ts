export function safeWriterLink(value:string,origin:string):string|null{
  try{const url=new URL(value,origin);return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
export function safeWriterImage(value:string,origin:string):string|null{
  try{const url=new URL(value,origin);return url.protocol==='blob:'&&value.startsWith(`blob:${origin}/`)||url.origin===origin&&/^\/api\/writer\/(assets|content)$/.test(url.pathname)?url.href:null;}catch{return null;}
}
/** 基础 Markdown 预览；只创建节点，原始 HTML 始终作为文字。 */
export function renderWriterMarkdown(body:string,resolveImage:(source:string)=>string|null):DocumentFragment{
  const fragment=document.createDocumentFragment(),origin=location.origin;
  const node=(tag:string,text?:string)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  function inline(parent:HTMLElement,text:string){
    const tokens=/(`[^`\n]*`)|(!?\[([^\]\n]*)\]\(([^\s)]+)\))|(\*\*([^*\n]+)\*\*)/g;let end=0;
    for(const match of text.matchAll(tokens)){
      const start=match.index!;parent.append(document.createTextNode(text.slice(end,start)));end=start+match[0].length;
      if(match[1]){parent.append(node('code',match[1].slice(1,-1)));continue;}
      if(match[5]){parent.append(node('strong',match[6]));continue;}
      const image=match[2].startsWith('!'),href=image?resolveImage(match[4]):safeWriterLink(match[4],origin);
      if(image){
        const approved=href?safeWriterImage(href,origin):null;
        if(approved){const img=document.createElement('img');img.src=approved;img.alt=match[3];img.loading='lazy';img.decoding='async';parent.append(img);}else parent.append(document.createTextNode(`[配图：${match[3]||'待获取'}]`));
      }else if(href){const link=document.createElement('a');link.href=href;link.textContent=match[3];link.target='_blank';link.rel='noopener noreferrer';parent.append(link);}
      else parent.append(document.createTextNode(match[3]));
    }
    parent.append(document.createTextNode(text.slice(end)));
  }
  let fence='',code:string[]=[],paragraph:string[]=[],list:HTMLElement|null=null;
  const flush=()=>{if(paragraph.length){const p=node('p');paragraph.forEach((line,n)=>{if(n)p.append(node('br'));inline(p,line);});fragment.append(p);paragraph=[];}list=null;};
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
