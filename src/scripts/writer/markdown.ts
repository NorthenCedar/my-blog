import MarkdownIt from 'markdown-it';
import { Schema,type Node } from 'prosemirror-model';
import { schema as commonmark,MarkdownParser,MarkdownSerializer,defaultMarkdownParser,defaultMarkdownSerializer,type MarkdownSerializerState } from 'prosemirror-markdown';
import { safeWriterLink } from './preview';
import type { WriterAssetRef } from '../../lib/writer/model';
import { withWriterStrike } from '../../lib/strike-markdown';
import { preserveCodeSpaces } from './markdown-spaces';

// 图片由编辑视图解析私密地址；模型中的原始引用永不直接成为网络请求。
export const writerSchema=new Schema({
  nodes:commonmark.spec.nodes.update('image',{
    ...commonmark.spec.nodes.get('image')!,
    toDOM:node=>['span',{'data-writer-image':''},`[配图：${node.attrs.alt??''}]`],
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
const parser=new MarkdownParser(writerSchema,preserveCodeSpaces(withWriterStrike(new MarkdownIt('commonmark',{html:false}).enable('strikethrough'))),{
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
const serializer=new MarkdownSerializer({...defaultMarkdownSerializer.nodes,paragraph:preserveIndent('paragraph'),heading:preserveIndent('heading')},{
  ...defaultMarkdownSerializer.marks,strike:{open:'<del>',close:'</del>',expelEnclosingWhitespace:true},
},{escapeExtraCharacters:/</g});
const detector=withWriterStrike(new MarkdownIt({html:true}));
export const parseWriterMarkdown=(raw:string):Node=>parser.parse(raw);
export function serializeWriterMarkdown(doc:Node,original?:{raw:string;doc:Node}):string{
  if(original&&doc.eq(original.doc))return original.raw;
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
  const env:{references?:unknown}={},tokens=detector.parse(raw,env);
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
        if(/(?:^|\n)\s*(?::::|import\s|export\s)|\{[^{}]*\}/.test(text))return '扩展语法或组件';
      }
      if(token.children){const issue=visit(token.children);if(issue)return issue;}
    }
    return null;
  };
  return visit(tokens);
}
