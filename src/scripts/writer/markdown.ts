import MarkdownIt from 'markdown-it';
import { Schema,type Node } from 'prosemirror-model';
import { schema as commonmark,MarkdownParser,MarkdownSerializer,defaultMarkdownParser,defaultMarkdownSerializer,type MarkdownSerializerState } from 'prosemirror-markdown';
import { safeWriterLink } from './preview';
import type { WriterAssetRef } from '../../lib/writer/model';
import { withWriterStrike } from '../../lib/strike-markdown';
import { preserveCodeSpaces } from './markdown-spaces';
import { indentEntities,mergeVerbatim,splitTopLevelBlocks,type RawBlock } from './verbatim';

// 图片由编辑视图解析私密地址；模型中的原始引用永不直接成为网络请求。
export const writerSchema=new Schema({
  nodes:commonmark.spec.nodes.update('image',{
    ...commonmark.spec.nodes.get('image')!,
    toDOM:node=>['span',{'data-writer-image':''},`[配图：${node.attrs.alt??''}]`],
  }).addToEnd('raw_block',{
    // ★ 为什么有这一块（2026-11-16）：站主有好几篇笔记带原生表格或 <video> 标签，
    //   以前整篇被判进源码模式——「只打正文」在它们身上直接失效。表格和原始 HTML
    //   又没法无损往返成 ProseMirror 节点，所以改成「整块原样冻结」：节点里存原文，
    //   序列化时原字节吐回（配合 verbatim 的块级比对，没碰过就一个字节都不变），
    //   在编辑器里显示成只读小块，前后正文照常可视化编辑。
    group:'block',
    atom:true,
    selectable:true,
    attrs:{text:{default:''},kind:{default:'html'}},
    toDOM:(node:Node)=>['div',{'data-writer-raw':node.attrs.kind as string},node.attrs.text as string],
    parseDOM:[],
  }),
  marks:commonmark.spec.marks.update('link',{
    ...commonmark.spec.marks.get('link')!,
    toDOM:mark=>{
      const href=safeWriterLink(mark.attrs.href,'https://northcedar.top');
      return href?['a',{href,rel:'noopener noreferrer',title:mark.attrs.title},0]:['span',0];
    },
  // 删除线置于强调外层，避免中文句中的 ***~~文字~~*** 被识别成字面星号。
  }).addBefore('em','strike',{parseDOM:[{tag:'s'},{tag:'del'},{tag:'strike'}],toDOM:()=>['s',0]}),
});
const markdownTokenizer=preserveCodeSpaces(withWriterStrike(new MarkdownIt('commonmark',{html:false}).enable('strikethrough')));
/**
 * 喂给解析器之前先补两件事，否则「只打正文」的可视化编辑会把作者的排版吃掉：
 *   ① 段落续行行首 1–3 个空格换成 &#32;（CommonMark 解析阶段会吃掉这段缩进，
 *      与站点构建的 src/lib/markdown-preserve-indent.mjs 同一套规则）；
 *   ② 软换行（一个 segment 的结束）落成真正的换行，而不是一个空格。
 */
const OPERATOR_CHARS='=+-*/%&|^!<>~';
/** `int* p`、`x*(a+b)` 这类代码记号里的单个星号按字面处理，不吃成斜体。
 *  只有「紧跟在 ASCII 字母数字后面」或「后面紧跟运算符」的单个 `*` 才算代码记号；
 *  `**加粗**`、`*斜体*`（中文正文里最常见）不受影响，斜体按钮写的单个星号仍能往返。 */
function literalPointerStars(children:{type:string;content?:string;markup?:string;tag?:string}[]){
  const open:number[]=[];
  const textAt=(index:number)=>typeof children[index]?.content==='string'?children[index].content??'':'';
  const charBefore=(index:number)=>{for(let i=index-1;i>=0;i--){const text=textAt(i);if(text)return text.slice(-1);}return '';};
  const charAfter=(index:number)=>{for(let i=index+1;i<children.length;i++){const text=textAt(i);if(text)return text.slice(0,1);}return '';};
  for(let i=0;i<children.length;i++){
    const token=children[i];
    if(token.type!=='em_open'&&token.type!=='em_close')continue;
    if(token.markup!=='*')continue;
    if(token.type==='em_open'){open.push(i);continue;}
    const start=open.pop();
    if(start===undefined)continue;
    if(!/[A-Za-z0-9]/.test(charBefore(start))&&!OPERATOR_CHARS.includes(charAfter(start)))continue;
    for(const index of [start,i]){const star=children[index];star.type='text';star.content='*';star.markup='';star.tag='';}
  }
}
const writerTokenizer={
  parse(text:string,env:Record<string,unknown>){
    const tokens=markdownTokenizer.parse(indentEntities(text),env);
    for(const block of tokens){
      literalPointerStars(block.children??[]);
      for(const child of block.children??[]){
        if(child.type!=='softbreak')continue;
        child.type='text';
        child.content='\n';
        child.markup='';
      }
    }
    return tokens;
  },
} as unknown as MarkdownIt;
const parser=new MarkdownParser(writerSchema,writerTokenizer,{
  ...defaultMarkdownParser.tokens,
  s:{mark:'strike'},
  image:{node:'image',getAttrs:token=>({src:token.attrGet('src'),title:token.attrGet('title')||null,alt:(token.children??[]).map(t=>t.content).join('')})},
});
/** 可视化行首与尾部空格用实体保留，避免四格正文重读时变为代码或被语法吞掉。 */
const preserveIndent=(kind:'paragraph'|'heading')=>(state:MarkdownSerializerState,node:Node,parent:Node,index:number)=>{
  const original=state.text;
  let lineStart=true;
  state.text=function(value:string,escape=true){
    if(!escape){if(value)lineStart=value.endsWith('\n');return original.call(this,value,false);}
    const lines=value.split('\n');
    for(let i=0;i<lines.length;i++){
      let line=lines[i];
      if(lineStart||this.atBlockStart||this.out.endsWith('\n')){
        const leading=/^ +/.exec(line)?.[0].length??0;
        if(leading){this.write('&#32;'.repeat(leading));line=line.slice(leading);}
      }
      const trailing=/ +$/.exec(line)?.[0].length??0;
      if(trailing)line=line.slice(0,-trailing);
      original.call(this,line,escape);
      if(trailing)this.write('&#32;'.repeat(trailing));
      if(lines[i])lineStart=false;
      if(i<lines.length-1){original.call(this,'\n',false);lineStart=true;}
    }
  };
  try{defaultMarkdownSerializer.nodes[kind](state,node,parent,index);}
  finally{state.text=original;}
};
const serializer=new MarkdownSerializer({...defaultMarkdownSerializer.nodes,
  paragraph:preserveIndent('paragraph'),
  heading:preserveIndent('heading'),
  // 站主的笔记一律用「- 」起头，不让序列化器改写成「* 」。
  bullet_list:(state,node)=>state.renderList(node,'  ',()=>'- '),
  // 冻结块原字节吐回：配合 verbatim 的块级比对，没碰过就是一个字节都不变。
  raw_block:(state,node)=>{state.write(node.attrs.text as string);state.closeBlock(node);},
},{
  ...defaultMarkdownSerializer.marks,strike:{open:'<del>',close:'</del>',expelEnclosingWhitespace:true},
},{escapeExtraCharacters:/</g});
const detector=withWriterStrike(new MarkdownIt({html:true}));
export function writerBodyImages(raw:string) {
  const images = new Map<string,string>();
  for (const block of detector.parse(raw, {})) {
    for (const token of block.children ?? []) {
      const src = token.type === 'image' && token.attrGet('src');
      if (src && !images.has(src)) images.set(src, token.content);
    }
  }
  return images;
}
/**
 * 可视化编辑里「整块只读」的原生块：Markdown 表格、原始 HTML（视频、details 等）。
 *
 * ★ 为什么不是解析成真节点（2026-11-16）：这两样都没有稳定的可逆映射——表格的列宽
 *   对齐、单元格里的转义竖线、HTML 的每个属性，往返一次就会被改写。既然站主要的是
 *   「正文能直接打字」，那就把它们当**不可拆的整块**：原文存进节点属性，序列化原样
 *   吐回，编辑器里显示成只读小块，前后段落照常编辑。
 */
export type WriterFrozenBlock={start:number;end:number;kind:'table'|'html';text:string};
/** 冻结块在解析期的占位符：用控制字符包住，作者正文里不可能出现。 */
const FROZEN_MARK='\u0001WRITERRAW';
const FROZEN_TOKEN=new RegExp(`^${FROZEN_MARK}(\\d+)\\u0001$`);

/** 找出顶层那些要整块冻结的原生块（与 splitTopLevelBlocks 的切块口径一致）。 */
export function writerFrozenBlocks(raw:string):WriterFrozenBlock[]{
  const lines=raw.split('\n');
  const offsets:number[]=[0];
  for(let i=1;i<lines.length;i++)offsets.push(offsets[i-1]!+lines[i-1]!.length+1);
  const at=(line:number)=>line>=lines.length?raw.length:offsets[line]??raw.length;
  const blocks:WriterFrozenBlock[]=[];
  for(const token of detector.parse(raw,{})){
    if(token.level!==0||!token.map)continue;
    const kind=token.type==='table_open'?'table':token.type==='html_block'?'html':null;
    if(!kind)continue;
    const [start,end]=token.map;
    blocks.push({start,end,kind,text:raw.slice(at(start),at(end))});
  }
  return blocks;
}

/** 把冻结块换成占位段落，让剩下的正文照常解析。 */
function maskFrozen(raw:string,blocks:readonly WriterFrozenBlock[]):string{
  const lines=raw.split('\n');
  const out:string[]=[];
  let line=0;
  blocks.forEach((block,index)=>{
    out.push(...lines.slice(line,block.start),`${FROZEN_MARK}${index}\u0001`,'');
    line=block.end;
  });
  out.push(...lines.slice(line));
  return out.join('\n');
}

/** 把占位段落换回冻结节点；返回换回去了几个（少于冻结块数说明占位符被别的语法吃了）。 */
function restoreFrozen(doc:Node,blocks:readonly WriterFrozenBlock[]):{doc:Node;restored:number}{
  const children:Node[]=[];
  let restored=0;
  doc.forEach(node=>{
    const match=node.type===writerSchema.nodes.paragraph&&node.childCount===1?FROZEN_TOKEN.exec(node.textContent):null;
    const block=match?blocks[Number(match[1])]:undefined;
    if(block){children.push(writerSchema.nodes.raw_block.create({text:block.text,kind:block.kind}));restored++;return;}
    children.push(node);
  });
  return {doc:doc.type.create(doc.attrs,children,doc.marks),restored};
}

/** 解析 + 冻结块替换。`ok` 为假表示占位符没能全部还原，调用方应退回源码模式。 */
function parseBody(raw:string):{doc:Node;frozen:WriterFrozenBlock[];ok:boolean}{
  const frozen=writerFrozenBlocks(raw);
  if(!frozen.length)return {doc:parser.parse(raw),frozen,ok:true};
  const {doc,restored}=restoreFrozen(parser.parse(maskFrozen(raw,frozen)),frozen);
  return {doc:frozen.length?doc:parser.parse(raw),frozen,ok:restored===frozen.length};
}

const blockCache=new WeakMap<Node,{raw:string;blocks:RawBlock[]}>();
export const parseWriterMarkdown=(raw:string):Node=>{
  const {doc}=parseBody(raw);
  blockCache.set(doc,{raw,blocks:splitTopLevelBlocks(raw,detector)});
  return doc;
};
export function serializeWriterMarkdown(doc:Node,original?:{raw:string;doc:Node}):string{
  if(original&&doc.eq(original.doc))return original.raw;
  // 只重写改动过的顶层块，其余块连同空行原样吐回，避免一次编辑漂白整篇源码。
  const cached=original?blockCache.get(original.doc):undefined;
  if(original&&cached&&cached.blocks.length){
    const render=(node:Node)=>serializer.serialize(writerSchema.nodes.doc.create(null,node)).replace(/\n+$/,'');
    return mergeVerbatim(doc.content.content,original.doc.content.content,cached.blocks,render);
  }
  return serializer.serialize(doc);
}
/** 撤销正文中的移图时，一同恢复本次编辑会话已知的资产资料。 */
export function restoreImageAssets(raw:string,assets:WriterAssetRef[],known:ReadonlyMap<string,WriterAssetRef>):WriterAssetRef[]{
  const result=[...assets],seen=new Set(assets.map(a=>a.sha256));
  parseWriterMarkdown(raw).descendants(node=>{
    if(node.type.name!=='image')return;
    const sha=/^writer-asset:([0-9a-f]{64})$/.exec(node.attrs.src)?.[1];
    if(sha&&!seen.has(sha)&&known.has(sha)){result.push(known.get(sha)!);seen.add(sha);}
  });
  return result;
}

/** 不认识的格式交给源码模式，绝不把预览 DOM 当作可逆的正文。 */
export function visualMarkdownIssue(raw:string):string|null{
  let source=raw;
  const frozen=writerFrozenBlocks(raw);
  if(frozen.length){
    // 顶层表格 / 原生 HTML 现在是「整块只读」，不再算不认识的格式；但占位符没能
    // 完整还原（例如表格写在引用或列表里）时，仍然整篇退回源码模式，绝不半懂不懂地改。
    if(!parseBody(raw).ok)return frozen[0]!.kind==='table'?'表格':'HTML、视频或组件';
    source=maskFrozen(raw,frozen);
  }
  const env:{references?:unknown}={},tokens=detector.parse(source,env);
  if(env.references)return '引用式链接或图片';
  const visit=(items:typeof tokens):string|null=>{
    for(const token of items){
      if(['html_block','html_inline'].includes(token.type))return 'HTML、视频或组件';
      if(token.type==='table_open')return '表格';
      if(token.type==='inline'){
        let strikeDepth=0;
        for(const child of token.children??[]){
          if(child.markup==='<del>')strikeDepth++;
          else if(child.markup==='</del>'&&--strikeDepth<0)return '未配对的删除线标签';
        }
        if(strikeDepth!==0)return '未配对的删除线标签';
        const text=(token.children??[]).filter(t=>t.type==='text').map(t=>t.content).join('\n');
        if(/(?:^|\n)\s*(?:[-+*]|\d+[.)])?\s*\[[ xX]\]\s/m.test(text))return '任务列表';
        if(/\[\^[^\]]+\]/.test(text))return '脚注';
        if(/\$[^$\n]+\$|\\\(|\\\[/.test(text))return '数学公式';
        // 单花括号在正文里是普通字符（讲课笔记常写 int a[10] = {2};、定义空字典 {}），
// 只有双花括号的组件占位符才算扩展语法，否则这些文章会被白判成源码模式。
if(/(?:^|\n)\s*(?::::|import\s|export\s)|\{\{[^{}\n]*\}\}/.test(text))return '扩展语法或组件';
      }
      if(token.children){const issue=visit(token.children);if(issue)return issue;}
    }
    return null;
  };
  return visit(tokens);
}
