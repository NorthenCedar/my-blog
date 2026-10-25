import MarkdownIt from 'markdown-it';
import { TextSelection,type Command } from 'prosemirror-state';

const markdown=new MarkdownIt('commonmark',{html:false});
// 旧文可以带 c#、f# 等 CommonMark 语言名；只拦围栏、空白及控制字符。
const languageValue=(value:string)=>{if(!/^[^\s`\u0000-\u001f\u007f]*$/u.test(value))throw Error('请选择有效的代码语言。');return value;};
const changeLanguage=(params:string,language:string)=>languageValue(language)+(params.trim().match(/^\S+(\s[\s\S]*)$/)?.[1]??'');

/** 只把明确选中的文字变成一个块；图片和跨既有代码块的选区不做有损转换。 */
export function codeBlockCommand(language:string):Command{
  languageValue(language);
  return (state,dispatch)=>{
    const {selection,schema}=state,{$from,$to,from,to}=selection;
    if($from.sameParent($to)&&$from.parent.type===schema.nodes.code_block)return true;
    let supported=true;
    if(!selection.empty)state.doc.nodesBetween(from,to,node=>{
      if(node.type===schema.nodes.code_block||node.isLeaf&&!node.isText&&node.type!==schema.nodes.hard_break)supported=false;
    });
    if(!supported)return false;
    if(dispatch){
      const text=selection.empty?'':state.doc.textBetween(from,to,'\n','\n');
      const tr=state.tr.replaceSelectionWith(schema.nodes.code_block.create({params:language},text?schema.text(text):null));
      let inserted:number|null=null;
      // 按替换步骤真正新增的范围定位，段首插入可能发生在原光标之前，不能向后搜旧代码块。
      tr.mapping.maps.forEach((map,index)=>map.forEach((_oldFrom,_oldTo,newFrom,newTo)=>{
        const rest=tr.mapping.slice(index+1),left=rest.map(newFrom,-1),right=rest.map(newTo,1);
        if(right>left)tr.doc.nodesBetween(left,right,(node,pos)=>{
          if(inserted===null&&node.type===schema.nodes.code_block&&pos>=left&&pos+node.nodeSize<=right)inserted=pos;
        });
      }));
      if(inserted===null)return false;
      tr.setSelection(TextSelection.create(tr.doc,inserted+1,inserted+1+text.length));dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export function codeLanguageCommand(language:string):Command{
  languageValue(language);
  return (state,dispatch)=>{
    const {$from,$to}=state.selection;
    if(!$from.sameParent($to)||$from.parent.type!==state.schema.nodes.code_block)return false;
    dispatch?.(state.tr.setNodeMarkup($from.before(),undefined,{...$from.parent.attrs,params:changeLanguage($from.parent.attrs.params??'',language)}));
    return true;
  };
}

type TextEdit={body:string;start:number;end:number};
function sourceBlocks(raw:string){
  const offsets=[0];for(const match of raw.matchAll(/\n/g))offsets.push(match.index!+1);
  const offset=(line:number)=>offsets[line]??raw.length;
  const blocks=markdown.parse(raw,{}).filter(token=>['fence','code_block'].includes(token.type)&&token.map).map(token=>({token,from:offset(token.map![0]),to:offset(token.map![1]),
    closed:token.type==='fence'&&token.map![1]-token.map![0]===(token.content.match(/\n/g)?.length??0)+2}));
  return {offset,blocks};
}
const intersects=(raw:string,start:number,end:number,block:{from:number;to:number;closed:boolean})=>start===end
  ?start>=block.from&&(start<block.to||start===raw.length&&block.to===raw.length&&(!block.closed||!raw.endsWith('\n')))
  :start<block.to&&end>block.from;
export function markdownCodeLanguage(raw:string,start:number,end:number):string|null{
  const blocks=sourceBlocks(raw).blocks.filter(block=>intersects(raw,start,end,block));
  return blocks.length===1&&start>=blocks[0].from&&end<=blocks[0].to?blocks[0].token.info.trim().split(/\s/)[0]||'text':null;
}
/** 源码模式定点编辑：外围原字节、缩进、围栏长度和语言以外的信息均保留。 */
export function markdownCodeBlock(raw:string,start:number,end:number,language:string,action:'insert'|'language'|'paragraph'='insert'):TextEdit{
  start=Math.max(0,Math.min(start,raw.length));end=Math.max(start,Math.min(end,raw.length));
  const unchanged={body:raw,start,end},{offset,blocks}=sourceBlocks(raw);
  const intersecting=blocks.filter(block=>intersects(raw,start,end,block));
  if(intersecting.length){
    const block=intersecting[0];
    if(intersecting.length!==1||start<block.from||end>block.to)throw Error('选区跨过已有代码块，请分别操作，原文已保留。');
    const first=block.token.map![0],last=block.token.map![1],openingEnd=raw.indexOf('\n',block.from);
    const openEnd=openingEnd<0?raw.length:openingEnd-(raw[openingEnd-1]==='\r'?1:0);
    const opening=/^( {0,3})(`{3,}|~{3,})([^\r\n]*)$/.exec(raw.slice(block.from,openEnd));
    if(!opening||block.token.level!==0)throw Error('当前代码位于列表、引用或缩进容器，请在源码中手动调整，原文已保留。');
    if(action==='insert')return unchanged;
    if(action==='language'){
      const leading=opening[3].match(/^\s*/)?.[0]??'';
      const header=opening[1]+opening[2]+leading+changeLanguage(opening[3].trimStart(),language);
      const body=raw.slice(0,block.from)+header+raw.slice(openEnd),delta=header.length-(openEnd-block.from);
      return {body,start:Math.max(block.from,start+delta),end:Math.max(block.from,end+delta)};
    }
    const contentStart=offset(first+1),lastLine=raw.slice(offset(last-1),block.to).replace(/\r?\n$/,'');
    const closed=new RegExp('^ {0,3}'+opening[2][0]+'{'+opening[2].length+',}[ \\t]*$').test(lastLine);
    const contentEnd=closed?offset(last-1):block.to;
    const content=raw.slice(contentStart,contentEnd),body=raw.slice(0,block.from)+content+raw.slice(block.to);
    const cursor=block.from+Math.max(0,Math.min(start-contentStart,content.length));
    return {body,start:cursor,end:cursor};
  }
  if(action!=='insert')return unchanged;
  languageValue(language);
  const newline=raw.includes('\r\n')?'\r\n':'\n',code=raw.slice(start,end),prefix=raw.slice(0,start),suffix=raw.slice(end);
  const longest=Math.max(2,...Array.from(code.matchAll(/`{3,}/g),match=>match[0].length));
  const fence='`'.repeat(longest+1);
  const before=!prefix||/(?:\r?\n){2}$/.test(prefix)?'':prefix.endsWith('\n')?newline:newline+newline;
  const after=!suffix||/^(?:\r?\n){2}/.test(suffix)?'':/^\r?\n/.test(suffix)?newline:newline+newline;
  const header=fence+language+newline,ending=(code.endsWith('\n')?'':newline)+fence;
  const body=prefix+before+header+code+ending+after+suffix,at=prefix.length+before.length+header.length;
  return {body,start:at,end:at+code.length};
}
