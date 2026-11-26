import { afterEach,expect,it,vi } from 'vitest';
import { writerFixture } from './_writer';
import { writerProof } from '../functions/api/_lib/writer-auth';
import { createDraft,readDraft } from '../functions/api/_lib/writer-drafts';
import { authorizePush,claimJob,createJob,recordJob,setDispatchUnknown } from '../functions/api/_lib/writer-jobs';
import { onRequestGet } from '../functions/api/writer/publish';
import { readFileSync } from 'node:fs';

const requestId='1'.repeat(32),commit='3'.repeat(40),sha='4'.repeat(40);
const text='---\ntitle: 标题\ndate: 2026-10-23\nsummary: 简介\ntags: [随笔]\n---\n正文';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

async function setup(reconcile=true) {
  const fixture=await writerFixture({reconcile}),{db,owner,request}=fixture;
  const proof=await writerProof(request(),{id:owner,auth_version:0} as never);
  const draft=await createDraft(db,proof,{kind:'post',key:'example',base:null,value:{fields:{title:'标题',date:'2026-10-23',summary:'简介',tags:['随笔']},body:'字'.repeat(40000),assets:[]}});
  const job=await createJob(db,proof,{draftId:draft.id,revision:1,requestId});
  const env={...fixture.env,WRITER_GITHUB_TOKEN:'测试凭据'};
  const status=(lookup=`?id=${job.id}`)=>onRequestGet({request:request('/publish'+lookup),env} as never);
  const run={id:1001,display_title:`云端写作 ${job.id}`,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/cloud-writer.yml',repository:{full_name:'NorthenCedar/my-blog'},status:'in_progress',conclusion:null};
  return {...fixture,proof,draft,job,status,run};
}

it('同任务的两个标签按任务及回执查询，只触发一次 GitHub 核对',async()=>{
  const s=await setup();await setDispatchUnknown(s.db,s.job.id);
  let remoteStarted!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{remoteStarted=resolve;});
  const pending=new Promise<void>(resolve=>{release=resolve;});
  const github=vi.fn(async(_url:unknown)=>{remoteStarted();await pending;return Response.json({workflow_runs:[]});});
  vi.stubGlobal('fetch',github);
  const queries=vi.spyOn(s.db,'prepare');
  const first=s.status();await started;
  const second=s.status(`?requestId=${requestId}`);
  try {
    await vi.waitFor(()=>expect(queries.mock.calls.some(([sql])=>sql.includes('request_id'))).toBe(true));
  } finally { release(); }
  expect((await first).status).toBe(200);expect((await second).status).toBe(200);
  expect((await s.status()).status).toBe(200);
  expect(github).toHaveBeenCalledTimes(1);
  const jobReads=queries.mock.calls.map(([sql])=>sql).filter(sql=>/^SELECT.+FROM writer_jobs/.test(sql));
  expect(jobReads).toHaveLength(4);
  expect(jobReads.every(sql=>!/SELECT \*|snapshot_json/.test(sql))).toBe(true);
});

it('待确认期间跳过已结束运行，仍在下一次核对找回迟到的推送回执',async()=>{
  const s=await setup(),{lease}=await claimJob(s.db,s.job.id,'1001');
  await authorizePush(s.db,s.job.id,lease,'1001');
  s.sqlite.exec("UPDATE writer_jobs SET code='push_unconfirmed'");
  let now=Date.now(),arrived=false;
  vi.spyOn(Date,'now').mockImplementation(()=>now);
  const marker=`更新\n\nWriter-Job: ${s.job.id}`;
  const github=vi.fn(async(url:unknown)=>{
    const path=new URL(String(url)).pathname;
    if(path.includes('/actions/runs/'))return Response.json({...s.run,status:'completed'});
    if(path.endsWith('/commits'))return Response.json(arrived?[{sha:commit,commit:{message:marker}}]:[]);
    if(path.includes('/compare/'))return Response.json({status:'ahead'});
    if(path.includes('/contents/'))return Response.json({type:'file',encoding:'base64',sha,content:Buffer.from(text).toString('base64'),size:Buffer.byteLength(text)});
    if(path.endsWith(`/commits/${commit}`))return Response.json({commit:{message:marker}});
    throw Error(path);
  });
  vi.stubGlobal('fetch',github);
  const queries=vi.spyOn(s.db,'prepare');
  for(let i=0;i<4;i++){
    expect(await (await s.status()).json()).toMatchObject({job:{state:'ready',code:'push_unconfirmed'}});
    now+=15000;
  }
  expect(github).toHaveBeenCalledTimes(1);
  expect(queries.mock.calls.some(([sql])=>/SELECT \*|SELECT snapshot_json/.test(sql))).toBe(false);
  arrived=true;
  expect(await (await s.status()).json()).toMatchObject({job:{state:'pushed',commit}});
  expect(github).toHaveBeenCalledTimes(5);
  expect(github.mock.calls.every(([url])=>!String(url).includes('/actions/runs/'))).toBe(true);
  expect(queries.mock.calls.filter(([sql])=>/^SELECT snapshot_json/.test(sql))).toHaveLength(1);
  expect((await readDraft(s.db,s.owner,s.draft.id)).base).toMatchObject({commit,blobSha:sha,text});
});

it('GitHub 429 后各标签共用退避，指定时间到达后恢复原任务',async()=>{
  const s=await setup();await setDispatchUnknown(s.db,s.job.id);
  let now=Date.now(),limited=true;
  vi.spyOn(Date,'now').mockImplementation(()=>now);
  const github=vi.fn(async(_url:unknown)=>limited?new Response(null,{status:429,headers:{'Retry-After':'70'}}):Response.json({workflow_runs:[s.run]}));
  vi.stubGlobal('fetch',github);
  const response=await s.status();
  expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('70');
  expect(github).toHaveBeenCalledTimes(1);
  now+=69000;
  expect(await (await s.status(`?requestId=${requestId}`)).json()).toMatchObject({job:{id:s.job.id,state:'dispatch_unknown'}});
  expect(github).toHaveBeenCalledTimes(1);
  now+=1000;limited=false;
  expect(await (await s.status()).json()).toMatchObject({job:{id:s.job.id,runId:'1001'}});
  expect(github).toHaveBeenCalledTimes(2);
});

it('迁移保留旧任务及已领取的租约，核对期间仍接受该运行器的回执',async()=>{
  const s=await setup(false),{lease}=await claimJob(s.db,s.job.id,'1001');
  await authorizePush(s.db,s.job.id,lease,'1001');
  const before=s.sqlite.prepare('SELECT * FROM writer_jobs WHERE id=?').get(s.job.id);
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(s.run)));
  expect(await (await s.status()).json()).toMatchObject({job:{state:'ready',runId:'1001'}});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:429})));
  const limited=await s.status();expect(limited.status).toBe(429);expect(limited.headers.get('Retry-After')).toBe('60');
  expect(await (await s.status(`?id=${s.job.id}&statusOnly=1`)).json()).toMatchObject({job:{state:'ready',runId:'1001'}});
  expect(fetch).toHaveBeenCalledTimes(1);
  const migration=readFileSync('migrations/0014_writer_job_reconcile.sql','utf8');
  s.sqlite.exec(migration);s.sqlite.exec(migration);
  expect(s.sqlite.prepare('SELECT * FROM writer_jobs WHERE id=?').get(s.job.id)).toEqual(before);

  let notify!:()=>void,finish!:()=>void;
  const started=new Promise<void>(resolve=>{notify=resolve;});
  const paused=new Promise<void>(resolve=>{finish=resolve;});
  vi.stubGlobal('fetch',vi.fn(async()=>{notify();await paused;return Response.json(s.run);}));
  const reading=s.status();await started;
  try{
    await recordJob(s.db,s.job.id,lease,{state:'pushed',runId:'1001',commit,publishedBase:{commit,blobSha:sha,text}});
  }finally{finish();}
  expect(await (await reading).json()).toMatchObject({job:{id:s.job.id,state:'pushed',commit}});
  s.sqlite.prepare('DELETE FROM writer_drafts WHERE id=?').run(s.draft.id);
  expect(s.sqlite.prepare('SELECT count(*) AS count FROM writer_job_reconcile').get()?.count).toBe(0);
});

it('过期的核对预约可换实例继续查询，未到期仍能读取任务状态',async()=>{
  const s=await setup();await setDispatchUnknown(s.db,s.job.id);
  let now=Date.now(),expiry=now+240000;
  vi.spyOn(Date,'now').mockImplementation(()=>now);
  s.sqlite.prepare('INSERT INTO writer_job_reconcile(job_id,reconcile_after) VALUES(?,?)').run(s.job.id,expiry);
  const github=vi.fn(async()=>Response.json({workflow_runs:[s.run]}));vi.stubGlobal('fetch',github);
  expect(await (await s.status()).json()).toMatchObject({job:{state:'dispatch_unknown',runId:null}});
  expect(github).not.toHaveBeenCalled();
  now=expiry;
  expect(await (await s.status()).json()).toMatchObject({job:{id:s.job.id,runId:'1001'}});
  expect(github).toHaveBeenCalledTimes(1);
});
