import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { planChanges, readPost } from '../src/lib/writer/content';
import { validateTarget, validateWriterValue } from '../src/lib/writer/model';

const base=(text:string)=>({commit:'1'.repeat(40),blobSha:'2'.repeat(40),text});
const textOf=(changes:ReturnType<typeof planChanges>)=>new TextDecoder().decode(changes[0].bytes);
const project={fields:{title:'桌面小机器人',summary:'第一次装配',tagline:'从一个轮子开始',category:'硬件',status:'制作中',order:3,tags:['手作'],visual:'image',effect:'stack',images:[],links:[]},body:'## 装配记录\n',assets:[]};

describe('造物台项目发布保持自己的内容契约',()=>{
  it('新项目的封面、暗色替图和正文图片进入当前项目，保留代码示例原样',()=>{
    const bytes=new Uint8Array([10,20,30]),sha=createHash('sha256').update(bytes).digest('hex'),ref='writer-asset:'+sha;
    const value={...project,fields:{...project.fields,images:[{src:ref,darkSrc:ref,alt:'装配后的机器人'}]},body:`![结构](${ref})\n\n![引用图][封面]\n\n[封面]: ${ref}\n\n\`![例子](${ref})\`\n`,assets:[{sha256:sha,alt:'结构'}]};
    const changes=planChanges({kind:'project',key:'small-robot',base:null,value},null,new Map([[sha,bytes]]));
    expect(changes.map(c=>c.path)).toEqual(['content/projects/small-robot/index.md',`content/projects/small-robot/writer-${sha}.webp`]);
    const published=readPost(textOf(changes));
    expect(published.fields.images).toEqual([{src:`./writer-${sha}.webp`,darkSrc:`./writer-${sha}.webp`,alt:'装配后的机器人'}]);
    expect(published.body).toContain(`![结构](./writer-${sha}.webp)`);
    expect(published.body).toContain(`[封面]: ./writer-${sha}.webp`);
    expect(published.body).toContain(`\`![例子](${ref})\``);
    expect(published.fields.draft).toBeUndefined();expect(published.fields.updated).toBeUndefined();
  });
  it('正文图片与图库采用同一目录边界，引用式图片也检查，代码示例不当成配图',()=>{
    const value=readPost(readFileSync('content/projects/northcedar/index.md','utf8'));
    for(const source of ['../other/secret.webp','./../other/secret.webp','https://example.com/pixel.webp']){
      for(const body of [`![跨界](${source})`,`![跨界][图片]\n\n[图片]: ${source}`])expect(()=>planChanges({kind:'project',key:'safe-project',base:null,value:{...value,body}},null,new Map()),body).toThrow();
    }
    for(const body of ['<!-- 说明 --> <img src="https://example.com/pixel.webp">','<!--\n说明\n--> <img src="../other/a.webp">','<svg><image href="../other/a.webp" /></svg>','<video poster="https://example.com/pixel.webp"></video>'])expect(()=>planChanges({kind:'project',key:'safe-project',base:null,value:{...value,body}},null,new Map()),body).toThrow();
    for(const body of ['<a href="javascript:alert(1)">打开</a>','<div style="background:url(https://example.com/pixel.png)">正文</div>','<meta http-equiv="refresh" content="0;url=https://example.com/">','[不安全](http://example.com/)','[凭据](https://u:p@example.com/)'])expect(()=>planChanges({kind:'project',key:'safe-project',base:null,value:{...value,body}},null,new Map()),body).toThrow();
    for(const body of ['<!--> <img src="https://example.com/a.png">','<!---> <a href="javascript:alert(1)">打开</a>','<!-- 说明 --!> <img src="https://example.com/a.png">'])expect(()=>planChanges({kind:'project',key:'safe-project',base:null,value:{...value,body}},null,new Map()),body).toThrow();
    const body='![合法](<./机器人 正面.webp>)\n\n`![示例](../secret.webp)`\n\n```md\n![示例](https://example.com/pixel.webp)\n```\n';
    expect(readPost(textOf(planChanges({kind:'project',key:'safe-project',base:null,value:{...value,body}},null,new Map()))).body).toBe(body);
  });
  it('既有界面模型可以无损保存，改正文保留preview、未知字段和注释',()=>{
    const source=readFileSync('content/projects/northcedar/index.md','utf8').replace('---\n','---\n# 原注释\ncustom: {keep: yes}\n').replace(/\r?\n/g,'\r\n');
    const value=readPost(source);
    expect(textOf(planChanges({kind:'project',key:'northcedar',base:base(source),value},source,new Map()))).toBe(source);
    value.body+='\r\n新的制作记录\r\n';
    const output=textOf(planChanges({kind:'project',key:'northcedar',base:base(source),value},source,new Map()));
    expect(output).toContain('# 原注释\r\n');expect(output).toContain('custom: {keep: yes}');
    expect(readPost(output).fields.preview).toEqual(value.fields.preview);expect(readPost(output).fields.visual).toBe('site');
    expect(()=>planChanges({kind:'project',key:'northcedar',base:base(source),value},source+'外部更新',new Map())).toThrow();
  });
  it('无封面、非法链接、越界配图、未知上传引用或任意页面路径不能发布',()=>{
    expect(()=>planChanges({kind:'project',key:'new-one',base:null,value:project},null,new Map())).toThrow();
    for(const src of ['../secret.webp','./a/../../secret.webp','https://other.example/a.webp','C:/secret.png']){
      const value={...project,fields:{...project.fields,images:[{src,alt:'图'}]}};
      expect(()=>planChanges({kind:'project',key:'new-one',base:null,value},null,new Map()),src).toThrow();
    }
    expect(()=>validateTarget('forge','about')).toThrow();
    expect(validateTarget('forge','forge')).toEqual({kind:'forge',key:'forge'});
    expect(validateTarget('project','small-robot')).toEqual({kind:'project',key:'small-robot'});
  });
});

describe('造物台单页文案发布',()=>{
  it('只修改固定页面的已编辑字段，工作手记换行可往返，保留未知字段和正文',()=>{
    const original=readFileSync('content/pages/forge.md','utf8')+'\n原有页面正文\n',value=readPost(original);
    value.fields.topline='从新的念头开始';
    value.fields.notes=[{title:'机器人计划',text:'先装配底盘\n再做转向：保留"引号"'}];
    const changes=planChanges({kind:'forge',key:'forge',base:base(original),value},original,new Map());
    expect(changes.map(c=>c.path)).toEqual(['content/pages/forge.md']);
    const output=readPost(textOf(changes));expect(output.body).toBe(value.body);expect(output.fields.notes).toEqual(value.fields.notes);
    expect(output.fields.date).toBeUndefined();expect(output.fields.draft).toBeUndefined();
    const bad=structuredClone(value);bad.fields.stages=['只有一条'];expect(()=>planChanges({kind:'forge',key:'forge',base:base(original),value:bad},original,new Map())).toThrow();
    expect(()=>planChanges({kind:'forge',key:'forge',base:base(original),value},original+'别处修改',new Map())).toThrow();
  });
  it('页面文案不接受上传图片，新项目允许亮暗图和正文图共用既有配额',()=>{
    const value={fields:{},body:'',assets:[{sha256:'a'.repeat(64),alt:'多余的图'}]};
    expect(()=>validateWriterValue('forge',value)).toThrow();
    expect(validateWriterValue('project',{...value,assets:Array.from({length:12},(_,i)=>({sha256:i.toString(16).padStart(64,'0'),alt:'项目图'}))}).assets).toHaveLength(12);
  });
});
