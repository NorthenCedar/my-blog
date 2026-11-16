import { codeLines,markdownBullet,textLines } from './bullet';

type TextEdit={body:string;start:number;end:number};

/**
 * Markdown 源码里的格式操作。
 *
 * 站主 2026-11-16：「源码写作的时候那些段落格式、加粗、斜体等等按钮都没用了，
 * 能改成之前那样吗，正文、章节目录、小标题都变成按钮，不用那个选项」。
 *
 * 可视化模式靠 ProseMirror 命令改文档；源码模式拿到的是纯文本 + 两个光标位置，
 * 所以这里是一组**纯函数**：进去是原文与选区，出来是新正文与新的选区，
 * 由 body-editor 的 applySourceEdit 写回 textarea（保留原生撤销）。
 *
 * 所有函数都遵守同一套边界：
 *   · 围栏代码块里的行不参与行首/标题改写（改了只会把代码写坏）；
 *   · 空行跳过；
 *   · CRLF 原样保留（写作台在 Windows 上回写用 CRLF，见 verbatim.ts）；
 *   · 选中的行全是空行或代码时抛错，由调用方显示给站主，绝不静默改坏原文。
 */
export type SourceFormat='strong'|'em'|'strike'|'bullet'|'ordered'|'quote'|'h0'|'h2'|'h3';

const MARKERS:Record<'strong'|'em'|'strike',string>={strong:'**',em:'*',strike:'~~'};
const clamp=(value:number,max:number)=>Math.max(0,Math.min(value,max));

/** 选区覆盖到的行；跳过空行与围栏代码（与 markdownBullet 同一套判断）。 */
function lineTargets(raw:string,start:number,end:number){
  const lines=textLines(raw);
  const first=Math.max(0,lines.findLastIndex(line=>line.offset<=start));
  const last=Math.max(first,lines.findLastIndex(line=>line.offset<end||line.offset<=start));
  const code=codeLines(lines.map(line=>line.text));
  const targets:number[]=[];
  for(let index=first;index<=last;index++){
    const text=lines[index].text;
    if(!text.trim()||code[index])continue;
    targets.push(index);
  }
  return {lines,targets};
}

/** 行首增删后把光标/选区映射到新位置：行首的光标落在插入的记号之后。 */
function mapPosition(lines:{offset:number}[],steps:Map<number,number>,position:number){
  let delta=0;
  for(const [index,step] of steps){
    if(position>lines[index].offset)delta+=step;
    else if(position===lines[index].offset)delta+=Math.max(0,step);
  }
  return Math.max(0,position+delta);
}

function rebuild(lines:{text:string;newline:string}[],steps:Map<number,number>,convert:(text:string,step:number)=>string){
  return lines.map((line,index)=>{
    const step=steps.get(index);
    return step===undefined?line.text+line.newline:convert(line.text,step)+line.newline;
  }).join('');
}

/** 行内标记：选中文字两侧加或去 `**`、`*`、`~~`；空选区插入一对记号把光标放中间。 */
function toggleInline(raw:string,start:number,end:number,marker:string):TextEdit{
  start=clamp(start,raw.length);end=clamp(end,raw.length);
  const inner=raw.slice(start,end),char=marker[0];
  // 相邻同字符有几颗，决定这次是「去掉已有记号」还是「再包一层」：
  // `**重点**` 点斜体要变成 `***重点***`（加），`***重点***` 点斜体才回 `**重点**`（减）。
  let before=0;while(start-1-before>=0&&raw[start-1-before]===char)before++;
  let after=0;while(end+after<raw.length&&raw[end+after]===char)after++;
  const unwrap=marker==='*'?before>0&&after>0&&before%2===1&&after%2===1:before>=marker.length&&after>=marker.length;
  if(inner&&unwrap){const cut=marker.length;return {body:raw.slice(0,start-cut)+inner+raw.slice(end+cut),start:start-cut,end:end-cut};}
  // 整段（含记号）被选中时，直接脱掉一层。
  if(inner.length>=marker.length*2&&inner.startsWith(marker)&&inner.endsWith(marker)&&(marker!=='*'||!(inner.startsWith('**')&&!inner.startsWith('***')))){
    return {body:raw.slice(0,start)+inner.slice(marker.length,inner.length-marker.length)+raw.slice(end),start,end:end-marker.length*2};
  }
  if(!inner)return {body:raw.slice(0,start)+marker+marker+raw.slice(end),start:start+marker.length,end:start+marker.length};
  return {body:raw.slice(0,start)+marker+inner+marker+raw.slice(end),start:start+marker.length,end:end+marker.length};
}

/** 行首记号（`> `、`1. `）：整段都已有就一起去掉，否则给还没有的行加上。 */
function togglePrefix(raw:string,start:number,end:number,prefix:string):TextEdit{
  const {lines,targets}=lineTargets(raw,start,end);
  if(!targets.length)throw Error('选中的行是空行或代码，格式未改动。');
  const remove=targets.every(index=>lines[index].text.startsWith(prefix));
  const steps=new Map<number,number>();
  for(const index of targets){
    const has=lines[index].text.startsWith(prefix);
    steps.set(index,remove?-prefix.length:has?0:prefix.length);
  }
  const body=rebuild(lines,steps,(text,step)=>remove?text.slice(prefix.length):(step?prefix:'')+text);
  return {body,start:mapPosition(lines,steps,start),end:mapPosition(lines,steps,end)};
}

/** 标题级别：0 = 正文（去掉原有 `#` 前缀），2 / 3 = 章节与小标题。 */
function setHeading(raw:string,start:number,end:number,level:number):TextEdit{
  const {lines,targets}=lineTargets(raw,start,end);
  if(!targets.length)throw Error('选中的行是空行或代码，标题未改动。');
  const existing=/^ {0,3}#{1,6}[ \t]+/;
  const same=level>0&&targets.every(index=>new RegExp(`^ {0,3}#{${level}}[ \\t]+`).test(lines[index].text));
  const prefix=`${'#'.repeat(level)} `;
  const next=new Map<number,string>(),steps=new Map<number,number>();
  for(const index of targets){
    const text=lines[index].text,stripped=text.replace(existing,'');
    // 只剩 `## ` 这种空标题时保留原样，别把这一行删空。
    const result=same?stripped||text:level>0?prefix+stripped:stripped||text;
    next.set(index,result+lines[index].newline);steps.set(index,result.length-text.length);
  }
  const body=lines.map((line,index)=>next.get(index)??line.text+line.newline).join('');
  return {body,start:mapPosition(lines,steps,start),end:mapPosition(lines,steps,end)};
}

/** 源码模式的一次格式操作：给格式名，拿回新正文与新选区。 */
export function markdownFormat(raw:string,start:number,end:number,format:SourceFormat):TextEdit{
  if(format==='bullet')return markdownBullet(raw,start,end);
  if(format==='ordered')return togglePrefix(raw,start,end,'1. ');
  if(format==='quote')return togglePrefix(raw,start,end,'> ');
  if(format==='h0')return setHeading(raw,start,end,0);
  if(format==='h2')return setHeading(raw,start,end,2);
  if(format==='h3')return setHeading(raw,start,end,3);
  return toggleInline(raw,start,end,MARKERS[format]);
}

/** 源码模式写链接：有选中文字就包成 `[文字](地址)`，否则插入 `[地址](地址)` 并把文字选中。 */
export function markdownLink(raw:string,start:number,end:number,url:string,label?:string):TextEdit{
  start=clamp(start,raw.length);end=clamp(end,raw.length);
  const text=raw.slice(start,end)||label||url;
  const snippet=`[${text.replace(/[\\[\]]/g,'\\$&')}](${url})`;
  if(raw.slice(start,end)===text)return {body:raw.slice(0,start)+snippet+raw.slice(end),start:start+1,end:start+1+text.length};
  return {body:raw.slice(0,start)+snippet+raw.slice(end),start:start+1,end:start+1+text.length};
}

/** 去掉选区上已有的链接外壳（`[文字](地址)` → `文字`）；没有链接就原样返回。 */
export function markdownUnlink(raw:string,start:number,end:number):TextEdit{
  start=clamp(start,raw.length);end=clamp(end,raw.length);
  const before=raw.lastIndexOf('[',start),after=raw.indexOf(']',end);
  if(before<0||after<0||after+1>=raw.length||raw[after+1]!=='(')return {body:raw,start,end};
  const close=raw.indexOf(')',after);
  if(close<0)return {body:raw,start,end};
  const text=raw.slice(before+1,after);
  return {body:raw.slice(0,before)+text+raw.slice(close+1),start:before,end:before+text.length};
}

/** 当前光标处的格式状态：给工具栏点亮 aria-pressed 用，不修改原文。 */
export function sourceFormatActive(raw:string,start:number,end:number):Record<SourceFormat,boolean>{
  const active:Record<SourceFormat,boolean>={
    strong:false,em:false,strike:false,bullet:false,ordered:false,quote:false,h0:false,h2:false,h3:false,
  };
  start=clamp(start,raw.length);end=clamp(end,raw.length);
  for(const [format,marker] of Object.entries(MARKERS) as ['strong'|'em'|'strike',string][]){
    const inner=raw.slice(start,end);
    const before=raw.slice(Math.max(0,start-marker.length),start);
    const after=raw.slice(end,end+marker.length);
    active[format]=Boolean(inner&&before===marker&&after===marker)||(inner.length>marker.length*2&&inner.startsWith(marker)&&inner.endsWith(marker));
  }
  const at=textLines(raw).findLastIndex(line=>line.offset<=start);
  const line=at>=0?textLines(raw)[at].text:'';
  active.bullet=/^ {0,3}[-*+][ \t]+/.test(line);
  active.ordered=/^ {0,3}\d+[.)][ \t]+/.test(line);
  active.quote=/^ {0,3}>/.test(line);
  const heading=/^ {0,3}(#{1,6})[ \t]+/.exec(line);
  active.h0=!heading;active.h2=heading?.[1]==='##';active.h3=heading?.[1]==='###';
  return active;
}