import { expect,it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync,readdirSync,existsSync } from 'node:fs';
import sharp from 'sharp';
import { readPost,readTalks,planChanges } from '../src/lib/writer/content';
import type { WriterDraft } from '../src/lib/writer/model';
const post='---\r\n# 原有说明\r\ntitle: 原题 # 保留注释\r\ndate: 2026-10-23\r\nsummary: 简介\r\ntags: [随笔]\r\ndraft: true\r\ncustom: {keep: yes}\r\n---\r\n原正文\r\n';
const talks='---\r\n# 原有说明\r\ntitle: 说说\r\nitems:\r\n  - id: talk-old\r\n    date: 2026-10-23\r\n    text: 原文\r\n    videos:\r\n      - src: old.mp4\r\n        alt: 旧视频\r\n  - id: talk-neighbor\r\n    date: 2026-10-22\r\n    text: 邻居 # 邻居注释\r\n---\r\n';
const base=(text:string,itemHash?:string)=>({commit:'1'.repeat(40),blobSha:'2'.repeat(40),text,...(itemHash?{itemHash}:{})});
const decode=(changes:ReturnType<typeof planChanges>,path:string)=>new TextDecoder().decode(changes.find(c=>c.path===path)!.bytes);
it('文章只定点更改字段和正文，保留 CRLF、未知字段与注释，最终公开',()=>{
  const value=readPost(post);value.fields.title='新题："引用"';value.body='新正文\n';
  const result=decode(planChanges({kind:'post',key:'example',base:base(post),value},post,new Map()),'content/posts/example/index.md');
  expect(result).toContain('# 原有说明\r\n');expect(result).toContain('# 保留注释');expect(result).toContain('custom: {keep: yes}\r\n');
  expect(readPost(result).fields.title).toBe('新题："引用"');expect(readPost(result).fields.draft).toBe(false);
  expect(result.replaceAll('\r\n','')).not.toContain('\n');
});
it('修改说说时允许最新文件新增其他条目，视频和邻居原始字节不变',()=>{
  const old=readTalks(talks).find(t=>t.key==='talk-old')!;
  const latest=talks.replace('items:\r\n','items:\r\n  - id: talk-from-desktop\r\n    date: 2026-10-23\r\n    text: 本地新说说\r\n');
  const value={...old.value,body:'这次修改'};
  const text=decode(planChanges({kind:'talk',key:old.key,base:base(talks,old.itemHash),value},latest,new Map()),'content/pages/talks.md');
  expect(text).toContain('# 原有说明');expect(text).toContain('id: talk-from-desktop');expect(text).toContain('videos:\r\n      - src: old.mp4\r\n        alt: 旧视频');
  expect(text).toContain('text: 邻居 # 邻居注释');expect(readTalks(text).find(t=>t.key===old.key)?.value.body).toBe('这次修改');
});
it('新说说先固定没有 ID 的旧说说，插入同日新内容不会改变旧评论归属',()=>{
  const text='---\nitems:\n  - date: 2026-10-23\n    text: 第一\n  - date: 2026-10-23\n    text: 第二\n---\n';
  const value={fields:{date:'2026-10-23'},body:'新说说',assets:[]};
  const result=decode(planChanges({kind:'talk',key:'talk-new',base:null,value},text,new Map()),'content/pages/talks.md');
  expect(readTalks(result).map(t=>[t.key,t.value.body])).toEqual([['talk-new','新说说'],['talk-20261023','第一'],['talk-20261023b','第二']]);
});
it('同篇、同说说冲突和重复 slug 均停止，不吞掉后来的修改',()=>{
  const value=readPost(post),old=readTalks(talks)[0];
  expect(()=>planChanges({kind:'post',key:'example',base:base(post),value},post+'不同',new Map())).toThrow();
  expect(()=>planChanges({kind:'post',key:'example',base:null,value},post,new Map())).toThrow();
  expect(()=>planChanges({kind:'talk',key:old.key,base:base(talks,old.itemHash),value:old.value},talks.replace('text: 原文','text: 他人修改'),new Map())).toThrow();
});
it('配图按摘要写入二进制，图片引用转换，代码块和行内代码不改',async()=>{
  const bytes=new Uint8Array(await sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).webp().toBuffer());
  const sha=createHash('sha256').update(bytes).digest('hex'),ref='writer-asset:'+sha;
  const value=readPost(post);value.assets=[{sha256:sha,alt:'配图'}];value.body=`![配图](${ref})\n\n\`![示例](${ref})\`\n\n\`\`\`md\n![示例](${ref})\n\`\`\`\n`;
  const changes=planChanges({kind:'post',key:'example',base:base(post),value},post,new Map([[sha,bytes]]));
  const text=decode(changes,'content/posts/example/index.md');
  expect(text).toContain(`![配图](./writer-${sha}.webp)`);expect(text).toContain('`![示例]('+ref+')`');expect(text).toContain('```md\r\n![示例]('+ref+')');
  expect(changes.find(c=>c.path.endsWith('.webp'))!.bytes).toEqual(bytes);
  expect(()=>planChanges({kind:'post',key:'example',base:base(post),value},post,new Map([[sha,new Uint8Array([0])]]))).toThrow();
});
it('路径越界、无摘要图、别名炸弹、重复 ID 被拒绝',()=>{
  const value=readPost(post);
  for(const key of ['../x','a/b','a\\b','%2e%2e','a\0']) expect(()=>planChanges({kind:'post',key,base:null,value},null,new Map())).toThrow();
  value.body='![图](writer-asset:'+'f'.repeat(64)+')';
  expect(()=>planChanges({kind:'post',key:'example',base:base(post),value},post,new Map())).toThrow();
  expect(()=>readPost('---\na: &x [a,a]\nb: [*x,*x]\n---\n')).toThrow();
  expect(()=>readTalks(talks.replace('talk-neighbor','talk-old'))).toThrow();
});
it('仓库真实文章和说说可无损读取，视频元数据保留',()=>{
  for(const entry of readdirSync('content/posts',{withFileTypes:true})){
    const path=`content/posts/${entry.name}/index.md`;
    if(entry.isDirectory()&&existsSync(path))expect(readPost(readFileSync(path,'utf8')).fields.title).toBeTypeOf('string');
  }
  const rows=readTalks(readFileSync('content/pages/talks.md','utf8'));
  expect(new Set(rows.map(row=>row.key)).size).toBe(rows.length);
  for(const row of rows){expect(row.value.body).toBeTypeOf('string');expect(row.value.fields.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);}
  // 固定期望只用于夹具，不能把实际文章标题或现有条目数变成内容发布限制。
  expect(readTalks(talks)[0].value.fields.videos).toEqual([{src:'old.mp4',alt:'旧视频'}]);
});
it('引用块中的代码围栏与参考式代码示例保持原样',()=>{
  const value=readPost(post),ref='writer-asset:'+'e'.repeat(64);
  value.body=`> \`\`\`md\n> ![示例](${ref})\n> \`\`\`\n`;
  const text=decode(planChanges({kind:'post',key:'example',base:base(post),value},post,new Map()),'content/posts/example/index.md');
  expect(text).toContain(`> ![示例](${ref})`);
});
