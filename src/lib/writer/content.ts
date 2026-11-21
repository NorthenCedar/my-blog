import {validateAlbumFields} from '../album-presentation.mjs';
import { createHash } from 'node:crypto';
import { parseDocument,isMap,isSeq,isAlias,visit,type YAMLMap } from 'yaml';
import { TAGS } from '../../tag-registry.ts';
import { projectSchema,safeLink } from '../project-schema.ts';
import { forgePageSchema } from '../forge-page-schema.ts';
import { z } from 'astro/zod';
import MarkdownIt from 'markdown-it';
import { requireContentLink } from '../content-urls.mjs';
import { postMarkdownIssue } from './markdown-policy.ts';
import { writerFail,writerTargetPath,writerAssetDirectory,utf8Length,validateTarget,validateWriterValue,type WriterValue,type WriterDraft,type WriterChange } from './model.ts';
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
  return {header,offset,end,body:text.slice(end),newline:text.startsWith('---\r\n')?'\r\n':'\n',doc:document(header)};
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
// ── updated 自动推进（与桌面端 lib/content.py 的 sync_updated 同一套规则）──
// `updated` 是手填字段，编辑正文的人不会记得同步它 ⇒ 文章改了、页面还印着旧的「更新于」。
// 规则：原文没有该字段就不主动添加；手动清空就尊重；没有实质变化不动；
//       目标值 = max(今天, 当前值)，不晚于原文值就不写（「更新于」只进不退）。
// ★ 不区分"手填"是有意的：编辑器可能还停在上一次推进之前的日期，把"提交值早于原文"
//   当成手填，会把刚写好的日期顶回去（27→25→27 来回跳）。手填更晚的日期照样尊重。
// 站点主时区是北京时间，Cloudflare 跑在 UTC 上 ⇒ 用 Asia/Shanghai 取日期，否则早八点前会退一天。
function shanghaiToday(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
// 比较用的规范形：键排序、忽略 updated、正文行尾归一。
function shapeOf(fields:Record<string,unknown>,body:string,updated:unknown){
  const rest=Object.keys(fields).filter(key=>key!=='updated').sort().map(key=>[key,fields[key]??null]);
  return JSON.stringify([rest,body.replace(/\r\n/g,'\n'),updated==null?'':String(updated)]);
}
function advanceUpdated(fields:Record<string,unknown>,body:string,original:WriterValue,today=shanghaiToday()){
  const before=String(original.fields.updated??'');let current=String(fields.updated??'');
  if(!before||!current) return fields;
  // 「更新于」只进不退：客户端可能还停在上一次推进之前的日期，把原文值写回去。
  if(current<before){fields={...fields,updated:before};current=before;}
  if(shapeOf(fields,body,current)===shapeOf(original.fields,original.body,before)) return fields;
  // 钳位保证 current >= before，所以目标值只会前进或不变 —— 不需要再判"小于原文就不动"。
  const target=current>today?current:today;
  return {...fields,updated:target};
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
    if(key==='images'&&isSeq(current)&&Array.isArray(value)&&current.items.every(isMap)&&value.every(v=>v&&typeof v==='object'&&!Array.isArray(v))&&source[current.range![0]]!=='['){
      const originals=current.items as YAMLMap[];
      const available=[...originals];
      let output='';
      for(const image of value){
        const match=available.findIndex(item=>item.get('src')===image.src);
        if(match<0){output+=`${' '.repeat(indent+2)}- ${JSON.stringify(image)}${newline}`;continue;}
        const node=available.splice(match,1)[0],start=source.lastIndexOf('\n',node.range![0]-1)+1,end=node.range![2];
        const fragment=source.slice(start,end);
        output+=apply(fragment,updateMap(source,node,image,newline,indent+4).map(p=>({...p,start:p.start-start,end:p.end-start})));
      }
      const start=source.lastIndexOf('\n',current.range![0]-1)+1;
      patches.push({start,end:current.range![1],text:output});continue;
    }
    const encoded=JSON.stringify(value);
    if(encoded===undefined) return bad('字段值无法保存');
    if(current&&typeof current==='object'&&'range'in current&&current.range){
      const [start,end]=current.range as [number,number,number];
      // 原值若独占一行（前面就是换行），新值不能照抄原列：顶格的 `- title:` 会落到
      // 第 0 列，让 `notes:` 下面多出一个文档级根节点，YAML 当场非法（写作台旧版
      // 用 PyYAML 默认风格写列表就是顶格的）。统一按「键所在列 + 2」缩进。
      const atLineStart=start===0||source[start-1]==='\n';
      const text=(atLineStart?' '.repeat(indent+2):'')+encoded;
      patches.push({start,end,text:text+(source.slice(start,end).endsWith('\n')?newline:'')});
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
function replaceImages(body:string,resolve:(sha:string)=>string,references=false){
  let fence='',ticks=0;
  return body.split(/(?<=\n)/).map(line=>{
    const marker=/^ {0,3}(`{3,}|~{3,})/.exec(line.replace(/^(?: {0,3}> ?)+/,''))?.[1];
    if(marker){if(!fence) fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length) fence='';return line;}
    if(fence||/^ {4}|^\t/.test(line)) return line;
    if(references&&!ticks){
      const reference=/^( {0,3}\[(?:\\.|[^\]\\])+\]:[ \t]*<?)writer-asset:([a-f0-9]{64})(>?)/.exec(line);
      if(reference)return line.slice(0,reference.index)+reference[1]+resolve(reference[2])+reference[3]+line.slice(reference[0].length);
    }
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
/** 语音在正文里写作 `!audio[说明](writer-audio:<sha>)`，发布时换成 `/audio/<sha>.<ext>`。 */
function replaceAudio(body:string,resolve:(sha:string)=>string){
  let fence='';
  return body.split(/(?<=\n)/).map(line=>{
    const marker=/^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if(marker){if(!fence) fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length) fence='';return line;}
    if(fence) return line;
    return line.replace(/writer-audio:([a-f0-9]{64})/g,(_all,sha:string)=>resolve(sha));
  }).join('');
}
const projectImage = z.string().refine(src=>/^writer-asset:[a-f0-9]{64}$/.test(src)||/^(?:\.\/)?[\p{L}\p{N}_ .-]+\.(?:png|jpe?g|webp|avif)$/u.test(src)&&!src.includes('..'),'项目配图必须来自当前项目目录或已上传图片');
const publishedProject = projectSchema(()=>projectImage);
const projectMarkdown = new MarkdownIt({html:true});
function checkProjectBodyImages(body:string,assets:WriterValue['assets'],allowPrivate=true){
  const known=new Set(assets.map(asset=>'writer-asset:'+asset.sha256));
  const visit=(tokens:ReturnType<MarkdownIt['parse']>)=>{
    let strikeDepth=0;
    for(const token of tokens){
      if(token.type==='html_inline'||token.type==='html_block'){
        if(/<!--(?:>|->)|--!>/.test(token.content))bad('项目注释的结束方式不明确，请使用完整的 HTML 注释');
        const active=token.content.replace(/<!--[\s\S]*?(?:-->|$)/g,'');
        if(token.type==='html_inline'&&/^<\/?del>$/.test(active)){
          strikeDepth+=active==='<del>'?1:-1;if(strikeDepth<0)bad('项目删除线标签未配对');continue;
        }
        if(/<\/?[a-z][^>]*>/i.test(active))bad('造物台正文请使用 Markdown 文字与图片，不能嵌入 HTML 标签');
      }
      if(token.type==='link_open'){
        const href=token.attrGet('href')??'';
        if(!(/^#[^\\\u0000-\u0020]*$/.test(href)||safeLink.safeParse(href).success))bad('项目正文链接须为站内路径或不含凭据的 HTTPS 地址');
      }
      if(token.type==='image'){
        let source=token.attrGet('src')??'';
        try{source=decodeURIComponent(source);}catch{bad('项目正文图片路径编码不对');}
        if(!projectImage.safeParse(source).success)bad('项目正文图片只能来自当前项目目录或已上传图片');
        if(source.startsWith('writer-asset:')&&(!allowPrivate||!known.has(source)))bad('项目正文配图未保存或写法暂不支持，请重新插入这张图片');
      }
      if(token.children)visit(token.children);
    }
    if(strikeDepth!==0)bad('项目删除线标签未配对');
  };
  visit(projectMarkdown.parse(body,{}));
}
export function validatePublish(kind:WriterDraft['kind'],value:WriterValue,base:WriterDraft['base']=null){
  validateWriterValue(kind,value,base);
  if(kind==='gallery'){
    try{validateAlbumFields(value.fields,{publish:true});}catch(error){bad((error as Error).message);}
    const uploaded=new Set(value.assets.map(a=>'writer-asset:'+a.sha256));
    for(const image of value.fields.images as {src:string}[])if(image.src.startsWith('writer-asset:')&&!uploaded.has(image.src))bad('相册引用了未上传的图片');
    return;
  }
  if(kind==='forge'){
    const checked=forgePageSchema.safeParse(value.fields);
    if(!checked.success)bad('页面文案不完整：'+checked.error.issues[0].path.join('.')+'，请检查必填文字、三条滚动提示和工作手记');
    return;
  }
  if(kind==='project'){
    const checked=publishedProject.safeParse(value.fields);
    if(!checked.success)bad('项目资料不完整：'+checked.error.issues[0].path.join('.')+'，'+checked.error.issues[0].message);
    if(value.assets.some(a=>!a.alt.trim()))bad('请为每张新增配图填写说明');
    const uploaded=new Set(value.assets.map(a=>'writer-asset:'+a.sha256));
    for(const image of checked.data.images)for(const src of [image.src,image.darkSrc])if(typeof src==='string'&&src.startsWith('writer-asset:')&&!uploaded.has(src))bad('项目封面引用了未上传的图片');
    checkProjectBodyImages(value.body,value.assets);
    return;
  }
  const fields=value.fields,date=fields.date;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) bad('请填写有效日期');
  if(value.assets.some(a=>!a.alt.trim())) bad('请为每张新增配图填写说明');
  if(kind==='talk'&&fields.href!=null&&fields.href!==''){
    try{requireContentLink(fields.href,'说说链接');}catch(error){bad((error as Error).message);}
  }
  if(kind==='post'&&(typeof fields.title!=='string'||!fields.title.trim()||typeof fields.summary!=='string'||!fields.summary.trim()||fields.summary.length>80||!Array.isArray(fields.tags)||fields.tags.length<1||fields.tags.length>3||fields.tags.some(t=>!(TAGS as readonly unknown[]).includes(t)))) bad('文章需填写标题、80 字内摘要及 1–3 个已登记标签');
  if(kind==='post'&&fields.cover){
    if(typeof fields.coverAlt!=='string'||!fields.coverAlt.trim())bad('请填写文章封面说明');
    if(typeof fields.cover!=='string')bad('文章封面格式不对');
    const cover=fields.cover as string;
    if(cover.startsWith('writer-asset:')){
      if(!value.assets.some(asset=>'writer-asset:'+asset.sha256===cover))bad('文章封面引用了未上传的图片');
    }else if(cover!== (base && readPost(base.text).fields.cover) &&
      (!/^(?:\.\/)?[\p{L}\p{N}_ .-]+\.(?:png|jpe?g|webp|avif)$/u.test(cover)||cover.includes('..')))bad('请选择本篇文章目录中的封面图片');
  }
  if(!value.body.trim()&&!value.assets.length&&!Array.isArray(fields.images)&&!Array.isArray(fields.videos)) bad('请先填写正文或配图');
  if (kind === 'post' && value.body) {
    // 私密素材引用在实际发布时会变为这些站内路径，预检使用相同的正文替换方式。
    const withImages = replaceImages(value.body, sha => `./writer-${sha}.webp`);
    const issue = postMarkdownIssue(replaceAudio(withImages, sha => `/audio/${sha}.mp3`));
    if (issue) bad(`正文校验失败：${issue}`);
  }
}
export function planChanges(draft:Pick<WriterDraft,'kind'|'key'|'base'|'value'>,currentText:string|null,assetBytes:Map<string,Uint8Array>):WriterChange[]{
  const {kind,key}=validateTarget(draft.kind,draft.key),value=validateWriterValue(kind,draft.value,draft.base);validatePublish(kind,value,draft.base);
  const changes:WriterChange[]=[],known=new Map(value.assets.map(a=>[a.sha256,a]));
  const clips=new Map(value.audios.map(a=>[a.sha256,a]));
  for(const clip of clips.values()){
    const bytes=assetBytes.get(clip.sha256);if(!bytes||writerHash(bytes)!==clip.sha256) bad('语音缺失或摘要不一致，请重新上传');
    if(bytes.length>1500000) bad('单条语音不能超过 1.5 MB');
    changes.push({path:`content/audio/${clip.sha256}.${clip.ext}`,bytes});
  }
  const resolveAudio=(sha:string)=>{const clip=clips.get(sha);if(!clip) return bad('正文引用了未保存的语音');return `/audio/${sha}.${clip.ext}`;};
  const directory=writerAssetDirectory(kind,key);
  const galleryReferences=kind==='gallery'?new Set((value.fields.images as {src:string}[]).map(image=>image.src)):null;
  for(const asset of value.assets){
    if(galleryReferences&&!galleryReferences.has('writer-asset:'+asset.sha256))continue;
    const bytes=assetBytes.get(asset.sha256);if(!bytes||writerHash(bytes)!==asset.sha256) bad('配图缺失或摘要不一致，请重新上传');
    if(!directory)bad('页面文案不能发布配图');
    changes.push({path:`${directory}writer-${asset.sha256}.webp`,bytes});
  }
  const resolve=(sha:string)=>{if(!known.has(sha)) return bad('正文引用了未保存的图片');return `${kind==='talk'?'':'./'}writer-${sha}.webp`;};
  let text:string;
  if(kind==='project'||kind==='forge'||kind==='gallery'){
    if(draft.base?currentText!==draft.base.text:currentText!==null)return conflict();
    if(kind==='forge'&&!draft.base)bad('请先导入现有造物台页面文案');
    const fields={...value.fields};
    if(kind==='gallery'){
      fields.draft=false;
      fields.images=(fields.images as Record<string,unknown>[]).map(image=>({...image,src:typeof image.src==='string'&&image.src.startsWith('writer-asset:')?resolve(image.src.slice(13)):image.src}));
      if(typeof fields.cover==='string'&&fields.cover.startsWith('writer-asset:'))fields.cover=resolve(fields.cover.slice(13));
    }
    if(kind==='project'){
      const original=draft.base?readPost(draft.base.text):null;
      if(fields.slug!==(original?.fields.slug))bad('项目网址由目录决定，不能在编辑中更改');
      if(Array.isArray(fields.images))fields.images=fields.images.map(image=>{
        const result={...(image as Record<string,unknown>)};
        for(const field of ['src','darkSrc'])if(typeof result[field]==='string'&&(result[field] as string).startsWith('writer-asset:'))result[field]=resolve((result[field] as string).slice(13));
        return result;
      });
    }
    const body=kind==='project'?replaceImages(value.body,resolve,true):value.body;
    if(kind==='project')checkProjectBodyImages(body,value.assets,false);
    // 只改资料时，正文与结束分隔符保留原字节；编辑过的正文才跟随资料区的行尾。
    if(currentText!==null){
      const s=split(currentText),ending=currentText.slice(s.offset+s.header.length,s.end);
      const nextBody=body===s.body?body:body.replace(/\r?\n/g,s.newline);
      // 空正文文件可直接以 --- 结束；首次加入正文时补上必要的分隔换行。
      text=currentText.slice(0,s.offset)+apply(s.header,updateMap(s.header,s.doc.contents as YAMLMap,fields,s.newline))+ending+(nextBody&&!ending.endsWith('\n')?s.newline:'')+nextBody;
    }
    else text=`---\n${jsonFields(fields,'\n')}---\n${body}`;
    changes.unshift({path:writerTargetPath(kind,key),bytes:new TextEncoder().encode(text)});
  }else if(kind==='post'){
    if(draft.base?currentText!==draft.base.text:currentText!==null) return conflict();
    const fields={...value.fields,draft:false},original=draft.base?readPost(draft.base.text):null;
    if(original){if(fields.slug!==original.fields.slug) bad('旧文章网址标识不能修改');}
    else if(fields.slug!==undefined&&fields.slug!==key) bad('文章网址标识与目录不一致');
    if(typeof fields.cover==='string'&&fields.cover.startsWith('writer-asset:')) fields.cover=resolve(fields.cover.slice(13));
    const body=replaceAudio(replaceImages(value.body,resolve),resolveAudio);
    // 正文/字段真的变了才把 updated 推到今天；用户手填的值（含手动清空）一律不动。
    const synced=original?advanceUpdated(fields,body,original):fields;
    if(currentText!==null){const s=split(currentText);text=currentText.slice(0,s.offset)+apply(s.header,updateMap(s.header,s.doc.contents as YAMLMap,synced,s.newline))+`---${s.newline}`+body.replace(/\r?\n/g,s.newline);}
    else text=`---\n${jsonFields(synced,'\n')}---\n${body}`;
    changes.unshift({path:`content/posts/${key}/index.md`,bytes:new TextEncoder().encode(text)});
  }else{
    if(currentText===null) return bad('说说原文件不存在');
    const s=talkNodes(currentText),target=s.rows.find(r=>r.key===key),patches:Patch[]=[];
    if(draft.base?(!target||target.itemHash!==draft.base.itemHash):Boolean(target)) return conflict();
    const fields={...value.fields,id:key,text:value.body};
    const previousImages=Array.isArray(fields.images)?fields.images:[];
    if(value.assets.length) fields.images=[...previousImages,...value.assets.map(a=>({src:resolve(a.sha256),alt:a.alt}))];
    // 导入的已发布语音在 fields.audio，私有上传在 audios。追加时保留前者。
    if (value.audios.length) {
      const previous = fields.audio ?? target?.fields.audio;
      const bySource = new Map((Array.isArray(previous) ? previous : []).map(clip => [clip.src, clip]));
      for (const clip of clips.values()) {
        const src = resolveAudio(clip.sha256);
        bySource.set(src, { ...bySource.get(src), src, ...(clip.label ? { label: clip.label } : {}) });
      }
      fields.audio = [...bySource.values()];
    }
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
