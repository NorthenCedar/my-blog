import { afterEach,describe,expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { writerFixture } from './_writer';
import { writerProof } from '../functions/api/_lib/writer-auth';
import { createWriterRepository,importPublished } from '../functions/api/_lib/writer-repository';
import { createJob,claimJob,publishedBase,jobRow } from '../functions/api/_lib/writer-jobs';
import { onRequestGet as contentGet } from '../functions/api/writer/content';
import { onRequestPost as draftsPost } from '../functions/api/writer/drafts';
const commit='1'.repeat(40),sha='2'.repeat(40);
const projectText=readFileSync('content/projects/northcedar/index.md','utf8'),pageText=readFileSync('content/pages/forge.md','utf8');
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const payload=(text:string)=>({type:'file',sha,encoding:'base64',size:Buffer.byteLength(text),content:Buffer.from(text).toString('base64')});
const urls:string[]=[];
const transport:typeof fetch=async url=>{
  const value=String(url);urls.push(value);
  if(value.endsWith('/git/ref/heads/main'))return json({object:{sha:commit}});
  if(value.includes('/contents/content/projects?'))return json([{type:'dir',name:'northcedar'},{type:'dir',name:'../secret'},{type:'file',name:'ignored.md'}]);
  if(value.includes('/contents/content/projects/northcedar/index.md?'))return json(payload(projectText));
  if(value.includes('/contents/content/pages/forge.md?'))return json(payload(pageText));
  return json({},404);
};
afterEach(()=>{vi.unstubAllGlobals();urls.length=0;});

describe('造物台沿用站主的私密草稿与发布任务',()=>{
  it('项目和单页从准确路径导入真实SQLite，发布快照及回执不被当成说说',async()=>{
    const s=await writerFixture(),proof=await writerProof(s.request(),{id:s.owner,auth_version:0} as never),repo=createWriterRepository('只存在测试的凭据',transport);
    for(const kind of ['project','forge'] as const){
      const key=kind==='project'?'northcedar':'forge',draft=await importPublished(repo,s.db,proof,{kind,key});
      expect(draft.kind).toBe(kind);expect(draft.base?.text).toBe(kind==='project'?projectText:pageText);
      const job=await createJob(s.db,proof,{draftId:draft.id,revision:1,requestId:(kind==='project'?'a':'b').repeat(32)}),claimed=await claimJob(s.db,job.id,'1001');
      expect(claimed.snapshot.kind).toBe(kind);
      const fakeReceiptRepo={...repo,commitReceipt:async()=>({})};
      expect((await publishedBase(fakeReceiptRepo,await jobRow(s.db,job.id),commit))?.text).toBe(draft.base?.text);
      // 下一个内容保留独立任务空间，测试不向任何远端发布。
      s.sqlite.prepare("UPDATE writer_jobs SET state='cancelled',reserve_bytes=0 WHERE id=?").run(job.id);
    }
    expect(urls.some(url=>url.includes('/contents/content/posts/'))).toBe(false);
    expect(urls.some(url=>url.includes('/contents/content/pages/talks.md'))).toBe(false);
  });
  it('已发布列表只列合法项目与固定页面，未登录者拿不到任何列表',async()=>{
    vi.stubGlobal('fetch',transport);
    const s=await writerFixture(),env={...s.env,WRITER_GITHUB_TOKEN:'测试凭据'};
    const projects=await contentGet({request:s.request('/content?kind=project'),env} as never);
    expect(projects.status).toBe(200);expect((await projects.json() as any).items).toEqual([{key:'northcedar'}]);
    const forge=await contentGet({request:s.request('/content?kind=forge'),env} as never);
    expect((await forge.json() as any).items).toEqual([{key:'forge',title:'造物台'}]);
    const before=urls.length,request=new Request('https://northcedar.top/api/writer/content?kind=project');
    expect((await contentGet({request,env} as never)).status).toBe(401);expect(urls.length).toBe(before);
  });
  it('新项目可保存不完整私密草稿，页面文案只能从现有页面导入',async()=>{
    const s=await writerFixture();
    const created=await draftsPost({request:s.request('/drafts','POST',{action:'create',kind:'project',key:'next-robot',value:{fields:{title:'准备中的机器人'},body:'尚未公开',assets:[]}}),env:s.env} as never);
    expect(created.status).toBe(201);expect((await created.json() as any).draft.kind).toBe('project');
    const freshPage=await draftsPost({request:s.request('/drafts','POST',{action:'create',kind:'forge',key:'forge',value:{fields:{},body:'',assets:[]}}),env:s.env} as never);
    expect(freshPage.status).toBe(400);expect((await freshPage.json() as any).code).toBe('import_required');
  });
});
