import { createHash } from 'node:crypto';
import { parseDocument,isMap,isSeq,isAlias,visit,type YAMLMap } from 'yaml';
import { TAGS } from '../../tag-registry.ts';
import { writerFail,utf8Length,validateTarget,validateWriterValue,type WriterValue,type WriterDraft,type WriterChange } from './model.ts';
const bad=(message='原文格式暂不支持安全编辑，请在本地处理')=>writerFail(400,'invalid_content',message);
const conflict=()=>writerFail(409,'content_conflict','这篇内容已在其他地方修改，请重新导入并对照当前草稿');
export const writerHash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
function document(text:string){
  if(utf8Length(text)>512*1024) writerFail(413,'content_too_large','原文过长，暂不能云端编辑');
  const doc=parseDocument(text,{schema:'core',customTags:[],uniqueKeys:true,stringKeys:true,prettyErrors:false,logLevel:'silent'});
  if(doc.errors.length||doc.warnings.length||!isMap(doc.contents)) return bad();
  // 不需要别名语法；在展开前拒绝，避免环、指数展开及未知类型。
  visit(doc,{Node(_key,node){if(isAlias(node)||node.tag&&!['tag:yaml.org,2002:str','tag:yaml.org,2002:int','tag:yaml.org,2002:bool','tag:yaml.org,2002:null','tag:yaml.org,2002:float','tag:yaml.org,2002:seq','tag:yaml.org,2002:map'].includes(node.tag)) bad();}});
  doc.toJS({maxAliasCount:0});
  return doc;
}
function split(text:string){
  const match=/^---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(text);
  if(!match||match.index!==0) return bad();
  const offset=text.indexOf('\n')+1,header=match[1],end=match[0].length;
  return {header,offset,end,body:text.slice(end),newline:text.includes('\r\n')?'\r\n':'\n',doc:document(header)};
}
export function readPost(text:string):WriterValue{
  const {doc,body}=split(text);
  return {fields:doc.toJS({maxAliasCount:0}),body,assets:[]};
}
function talkNodes(text:string){
  const source=split(text),sequence=source.doc.get('items',true);
  if(!isSeq(sequence)) return bad('说说 items 必须为列表');
  const days=new Map<string,number>(),keys=new Set<string>();
  const rows=sequence.items.map(node=>{
    if(!isMap(node)||!node.range) return bad();
    const fields=node.toJSON() as Record<string,unknown>,date=String(fields.date),nth=days.get(date)??0;days.set(date,nth+1);
    const key=String(fields.id??`talk-${date.replaceAll('-','')}${nth?String.fromCharCode(97+nth):''}`);
    validateTarget('talk',key);if(keys.has(key)) bad('原文存在重复的说说标识，请先在本地修正');keys.add(key);
    const body=String(fields.text??'');delete fields.text;
    return {key,node,fields,body,itemHash:writerHash(source.header.slice(node.range[0],node.range[2]))};
  });
  return {...source,sequence,rows};
}
export function readTalks(text:string):{key:string;value:WriterValue;itemHash:string}[]{
  return talkNodes(text).rows.map(({key,fields,body,itemHash})=>({key,value:{fields,body,assets:[]},itemHash}));
}
type Patch={start:number;end:number;text:string};
function apply(text:string,patches:Patch[]){
  for(const p of patches.sort((a,b)=>b.start-a.start)) text=text.slice(0,p.start)+p.text+text.slice(p.end);
  return text;
}
// 只替换改变的值区间：未知字段、相邻条目和未编辑注释保留源字节。
function updateMap(source:string,node:YAMLMap,values:Record<string,unknown>,newline:string,indent=0){
  const patches:Patch[]=[];
  for(const [key,value] of Object.entries(values)){
    const current=node.get(key,true);
    const before=node.get(key);
    if(JSON.stringify(before)===JSON.stringify(value)) continue;
    const encoded=JSON.stringify(value);
    if(encoded===undefined) return bad('字段值无法保存');
    if(current&&typeof current==='object'&&'range'in current&&current.range){
      const [start,end]=current.range as [number,number,number];
      patches.push({start,end,text:encoded+(source.slice(start,end).endsWith('\n')?newline:'')});
    }else{
      const end=node.range?.[1]??source.length;
      patches.push({start:end,end,text:`${' '.repeat(indent)}${JSON.stringify(key)}: ${encoded}${newline}`});
    }
  }
  return patches;
}
function jsonFields(fields:Record<string,unknown>,newline:string,indent=0){
  return Object.entries(fields).map(([key,value])=>`${' '.repeat(indent)}${JSON.stringify(key)}: ${JSON.stringify(value)}${newline}`).join('');
}
function replaceImages(body:string,resolve:(sha:string)=>string){
  let fence='',ticks=0;
  return body.split(/(?<=\n)/).map(line=>{
    const marker=/^ {0,3}(`{3,}|~{3,})/.exec(line.replace(/^(?: {0,3}> ?)+/,''))?.[1];
    if(marker){if(!fence) fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length) fence='';return line;}
    if(fence||/^ {4}|^\t/.test(line)) return line;
    let out='',position=0;
    const pattern=/(`+)|(!\[(?:\\.|[^\]\\])*\]\(\s*<?writer-asset:([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\))/g;
    for(const match of line.matchAll(pattern)){
      const start=match.index!,escaped=/\\+$/.exec(line.slice(0,start))?.[0].length??0;
      if(escaped%2) continue;
      if(match[1]){if(!ticks) ticks=match[1].length;else if(ticks===match[1].length) ticks=0;continue;}
      if(ticks) continue;
      out+=line.slice(position,start)+match[2].replace('writer-asset:'+match[3],resolve(match[3]));position=start+match[0].length;
    }
    return out+line.slice(position);
  }).join('');
}
export function validatePublish(kind:WriterDraft['kind'],value:WriterValue){
  validateWriterValue(kind,value);
  const fields=value.fields,date=fields.date;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) bad('请填写有效日期');
  if(value.assets.some(a=>!a.alt.trim())) bad('请为每张新增配图填写说明');
  if(kind==='post'&&(typeof fields.title!=='string'||!fields.title.trim()||typeof fields.summary!=='string'||!fields.summary.trim()||fields.summary.length>80||!Array.isArray(fields.tags)||fields.tags.length<1||fields.tags.length>3||fields.tags.some(t=>!(TAGS as readonly unknown[]).includes(t)))) bad('文章需填写标题、80 字内摘要及 1–3 个已登记标签');
  if(!value.body.trim()&&!value.assets.length&&!Array.isArray(fields.images)&&!Array.isArray(fields.videos)) bad('请先填写正文或配图');
}
export function planChanges(draft:Pick<WriterDraft,'kind'|'key'|'base'|'value'>,currentText:string|null,assetBytes:Map<string,Uint8Array>):WriterChange[]{
  const {kind,key}=validateTarget(draft.kind,draft.key),value=validateWriterValue(kind,draft.value);validatePublish(kind,value);
  const changes:WriterChange[]=[],known=new Map(value.assets.map(a=>[a.sha256,a]));
  for(const asset of value.assets){
    const bytes=assetBytes.get(asset.sha256);if(!bytes||writerHash(bytes)!==asset.sha256) bad('配图缺失或摘要不一致，请重新上传');
    changes.push({path:kind==='post'?`content/posts/${key}/writer-${asset.sha256}.webp`:`src/assets/talks/writer-${asset.sha256}.webp`,bytes});
  }
  const resolve=(sha:string)=>{if(!known.has(sha)) return bad('正文引用了未保存的图片');return `${kind==='post'?'./':''}writer-${sha}.webp`;};
  let text:string;
  if(kind==='post'){
    if(draft.base?currentText!==draft.base.text:currentText!==null) return conflict();
    const fields={...value.fields,draft:false};
    if(draft.base){const original=readPost(draft.base.text);if(fields.slug!==original.fields.slug) bad('旧文章网址标识不能修改');}
    else if(fields.slug!==undefined&&fields.slug!==key) bad('文章网址标识与目录不一致');
    if(typeof fields.cover==='string'&&fields.cover.startsWith('writer-asset:')) fields.cover=resolve(fields.cover.slice(13));
    const body=replaceImages(value.body,resolve);
    if(currentText!==null){const s=split(currentText);text=currentText.slice(0,s.offset)+apply(s.header,updateMap(s.header,s.doc.contents as YAMLMap,fields,s.newline))+`---${s.newline}`+body.replace(/\r?\n/g,s.newline);}
    else text=`---\n${jsonFields(fields,'\n')}---\n${body}`;
    changes.unshift({path:`content/posts/${key}/index.md`,bytes:new TextEncoder().encode(text)});
  }else{
    if(currentText===null) return bad('说说原文件不存在');
    const s=talkNodes(currentText),target=s.rows.find(r=>r.key===key),patches:Patch[]=[];
    if(draft.base?(!target||target.itemHash!==draft.base.itemHash):Boolean(target)) return conflict();
    const fields={...value.fields,id:key,text:value.body};
    const previousImages=Array.isArray(fields.images)?fields.images:[];
    if(value.assets.length) fields.images=[...previousImages,...value.assets.map(a=>({src:resolve(a.sha256),alt:a.alt}))];
    if(target) patches.push(...updateMap(s.header,target.node,fields,s.newline,4));
    // 插入前固定所有旧 ID，保持既有点赞、回复和通知归属。
    for(const row of s.rows) if(!row.fields.id&&row!==target) patches.push(...updateMap(s.header,row.node,{id:row.key},s.newline,4));
    if(!target){
      const entry=jsonFields(fields,s.newline,4).replace(/^ {4}/,'  - ');
      const first=s.sequence.items[0];
      const start=first&&typeof first==='object'&&'range'in first&&first.range?Math.max(0,s.header.lastIndexOf('\n',first.range[0]-1)+1):s.sequence.range![0];
      if(!s.rows.length){const range=s.sequence.range!;patches.push({start:range[0],end:range[1],text:s.newline+entry});}
      else patches.push({start,end:start,text:entry});
    }
    text=currentText.slice(0,s.offset)+apply(s.header,patches)+currentText.slice(s.offset+s.header.length);
    readTalks(text);
    changes.unshift({path:'content/pages/talks.md',bytes:new TextEncoder().encode(text)});
  }
  return changes;
}
