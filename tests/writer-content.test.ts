import { expect,it,vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync,readdirSync,existsSync } from 'node:fs';
import sharp from 'sharp';
import { readPost,readTalks,planChanges } from '../src/lib/writer/content';
import type { WriterDraft } from '../src/lib/writer/model';
const post='---\r\n# 原有说明\r\ntitle: 原题 # 保留注释\r\ndate: 2026-10-23\r\nsummary: 简介\r\ntags: [随笔]\r\ndraft: true\r\ncustom: {keep: yes}\r\n---\r\n原正文\r\n';
const talks='---\r\n# 原有说明\r\ntitle: 说说\r\nitems:\r\n  - id: talk-old\r\n    date: 2026-10-23\r\n    text: 原文\r\n    videos:\r\n      - src: old.mp4\r\n        alt: 旧视频\r\n  - id: talk-neighbor\r\n    date: 2026-10-22\r\n    text: 邻居 # 邻居注释\r\n---\r\n';
const base=(text:string,itemHash?:string)=>({commit:'1'.repeat(40),blobSha:'2'.repeat(40),text,...(itemHash?{itemHash}:{})});
const decode=(changes:ReturnType<typeof planChanges>,path:string)=>new TextDecoder().decode(changes.find(c=>c.path===path)!.bytes);
it('封面可单独上传并发布，要求说明且不写入正文',()=>{
  const value=readPost(post),bytes=new Uint8Array([1,2,3]),sha=createHash('sha256').update(bytes).digest('hex');
  const publish=()=>planChanges({kind:'post',key:'example',base:base(post),value},post,new Map([[sha,bytes]]));
  value.fields.cover='writer-asset:'+sha;
  expect(publish).toThrow('封面说明');
  value.fields.coverAlt='封面图';
  expect(publish).toThrow('未上传');
  value.assets=[{sha256:sha,alt:'封面图'}];
  const result=readPost(decode(publish(),'content/posts/example/index.md'));
  expect(result.fields.cover).toBe('./writer-'+sha+'.webp');
  expect(result.body).toBe(value.body);
});
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
// updated 是手填字段，编辑正文的人不会记得同步它 ⇒ 页面印着过期的「更新于」。
// 判据取北京日期（Cloudflare 跑 UTC，早八点前直接取 UTC 会退一天）。
const dated='---\ndate: 2026-10-25\nupdated: 2026-10-25\ntitle: 题\nsummary: 简介\ntags: [随笔]\ndraft: false\n---\n原正文\n';
const write=(text:string,value:ReturnType<typeof readPost>,baseText=text)=>decode(planChanges({kind:'post',key:'example',base:base(baseText),value},text,new Map()),'content/posts/example/index.md');
it('正文改过就把 updated 推进到北京日期，并跨过 UTC 与北京的日期差',()=>{
  vi.useFakeTimers();
  try{
    vi.setSystemTime(new Date('2026-10-27T04:00:00Z'));  // 北京 10-27 12:00
    const value=readPost(dated);value.body='改过的正文\n';
    expect(readPost(write(dated,value)).fields.updated).toBe('2026-10-27');
    vi.setSystemTime(new Date('2026-10-27T20:00:00Z'));  // UTC 还是 27 日，北京已是 28 日
    expect(readPost(write(dated,value)).fields.updated).toBe('2026-10-28');
  }finally{vi.useRealTimers();}
});
it('updated 的三种例外：手动值不覆盖、没变化不动、更晚的日期不往回改',()=>{
  vi.useFakeTimers();
  try{
    vi.setSystemTime(new Date('2026-10-27T04:00:00Z'));
    const manual=readPost(dated);manual.body='改过的正文\n';manual.fields.updated='2026-11-02';
    expect(readPost(write(dated,manual)).fields.updated).toBe('2026-11-02');
    expect(readPost(write(dated,readPost(dated))).fields.updated).toBe('2026-10-25');
    const future=dated.replace('updated: 2026-10-25','updated: 2026-11-30'),later=readPost(future);later.body='改过的正文\n';
    expect(readPost(write(future,later)).fields.updated).toBe('2026-11-30');
    const fresh={fields:{title:'新题',date:'2026-10-27',summary:'简介',tags:['随笔']},body:'正文\n',assets:[]};
    const created=decode(planChanges({kind:'post',key:'fresh',base:null,value:fresh},null,new Map()),'content/posts/fresh/index.md');
    expect(readPost(created).fields.updated).toBeUndefined();
  }finally{vi.useRealTimers();}
});
it('updated 只进不退：客户端滞后不会顶回去，没有该字段的文章也不被加上',()=>{
  vi.useFakeTimers();
  try{
    vi.setSystemTime(new Date('2026-10-27T04:00:00Z'));
    // 原文已推进到 11-30，编辑器还拿着旧值 10-25 ⇒ 必须保持 11-30，不能倒回去
    const ahead=dated.replace('updated: 2026-10-25','updated: 2026-11-30'),stale=readPost(ahead);
    stale.body='又改一段\n';stale.fields.updated='2026-10-25';
    expect(readPost(write(ahead,stale)).fields.updated).toBe('2026-11-30');
    // 可选字段：原文没有 updated 就不主动添加（加不加是排版选择）
    const plain=dated.replace('updated: 2026-10-25\n',''),edit=readPost(plain);edit.body='改过的正文\n';
    expect(readPost(write(plain,edit)).fields.updated).toBeUndefined();
  }finally{vi.useRealTimers();}
});
it('说说正文含换行、引号、制表符与反斜杠时仍是无损的合法 YAML',()=>{
  const text='---\ntitle: 说说\nitems:\n  - id: talk-old\n    date: 2026-10-23\n    text: 原文\n---\n';
  const body='第一行\n第二行带"引号"\n\t制表符与\\反斜杠\n# 不是注释';
  const out=decode(planChanges({kind:'talk',key:'talk-new',base:null,value:{fields:{date:'2026-10-24'},body,assets:[]}},text,new Map()),'content/pages/talks.md');
  // 云端写入走 JSON.stringify ⇒ 换行落成转义序列；裸换行会让严格解析器报 Missing closing "quote。
  expect(out).toContain('\\n');expect(out).toContain('\\t');
  expect(readTalks(out).find(t=>t.key==='talk-new')!.value.body).toBe(body);
});
