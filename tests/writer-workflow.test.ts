import { expect,it } from 'vitest';
import { writerFixture } from './_writer';
import { writerProof } from '../functions/api/_lib/writer-auth';
import { createDraft } from '../functions/api/_lib/writer-drafts';
import { createJob,readJob,claimJob,authorizePush,recordJob,reconcileJob,setDispatchUnknown } from '../functions/api/_lib/writer-jobs';
import { createWriterRepository } from '../functions/api/_lib/writer-repository';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
const commit='3'.repeat(40),details='https://dash.cloudflare.com/4bcfa9cf29fad54bd0ca74b90903a10c/pages/view/personal/deployments/example';
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
async function setup(){const s=await writerFixture(),proof=await writerProof(s.request(),{id:s.owner,auth_version:0} as never),draft=await createDraft(s.db,proof,{kind:'post',key:'example',base:null,value:{fields:{title:'标题',date:'2026-10-23',summary:'简介',tags:['随笔']},body:'正文',assets:[]}}),job=await createJob(s.db,proof,{draftId:draft.id,revision:1,requestId:'1'.repeat(32)});return {...s,proof,draft,job};}
const run=(id:string)=>({id:1001,display_title:`云端写作 ${id}`,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/cloud-writer.yml',repository:{full_name:'NorthenCedar/personal'},status:'in_progress',conclusion:null});
it('派发应答丢失后从固定工作流运行恢复，不再次派发',async()=>{
  const s=await setup();await setDispatchUnknown(s.db,s.job.id);const requests:string[]=[];
  const repo=createWriterRepository('测试凭据',async(url,init)=>{requests.push(String(url));expect(init?.method).toBe('GET');return String(url).includes('/runs?')?json({workflow_runs:[run(s.job.id)]}):json(run(s.job.id));});
  await reconcileJob(s.db,s.job.id,repo);expect((await readJob(s.db,s.owner,s.job.id)).runId).toBe('1001');expect(requests.every(u=>!u.includes('dispatches'))).toBe(true);
});
it('准确提交的 Cloudflare 部署失败不能当作已经上线',async()=>{
  const s=await setup(),{lease}=await claimJob(s.db,s.job.id,'1001');await authorizePush(s.db,s.job.id,lease,'1001');
  await recordJob(s.db,s.job.id,lease,{state:'pushed',runId:'1001',commit,publishedBase:{commit,blobSha:'4'.repeat(40),text:'已发布'}});
  const repo=createWriterRepository('测试凭据',async(url)=>String(url).includes('/check-runs')?json({check_runs:[{head_sha:commit,app:{id:85455,slug:'cloudflare-workers-and-pages'},name:'Cloudflare Pages',details_url:details,status:'completed',conclusion:'failure'}]}):json(run(s.job.id)));
  await reconcileJob(s.db,s.job.id,repo);expect((await readJob(s.db,s.owner,s.job.id)).state).toBe('deployment_failed');
});
it('其他 App、其他提交和其他 Pages 项目的成功不算本次上线',async()=>{
  const checks=[{head_sha:'5'.repeat(40),app:{id:85455,slug:'cloudflare-workers-and-pages'},details_url:details},{head_sha:commit,app:{id:1,slug:'another-app'},details_url:details},{head_sha:commit,app:{id:85455,slug:'cloudflare-workers-and-pages'},details_url:details.replace('/personal/','/another/')}].map(c=>({...c,status:'completed',conclusion:'success'}));
  const repo=createWriterRepository('测试凭据',async()=>json({check_runs:checks}));expect(await repo.deployment(commit)).toBe('pending');
});
it('运行失败但准确任务提交已在 main 时恢复推送和基线，不重复发布',async()=>{
  const s=await setup(),{lease}=await claimJob(s.db,s.job.id,'1001');await authorizePush(s.db,s.job.id,lease,'1001');
  const text='---\ntitle: 标题\ndate: 2026-10-23\nsummary: 简介\ntags: [随笔]\ndraft: false\n---\n正文';
  const repo=createWriterRepository('测试凭据',async(url)=>{
    const path=String(url);
    if(path.includes('/actions/runs/'))return json({...run(s.job.id),status:'completed',conclusion:'failure'});
    if(path.includes('/commits?'))return json([{sha:commit,commit:{message:`内容\n\nWriter-Job: ${s.job.id}`}}]);
    if(path.includes('/compare/'))return json({status:'identical'});
    if(path.includes('/contents/'))return json({type:'file',encoding:'base64',sha:'4'.repeat(40),content:Buffer.from(text).toString('base64'),size:Buffer.byteLength(text)});
    if(path.includes('/check-runs'))return json({check_runs:[]});
    return json({commit:{message:`内容\n\nWriter-Job: ${s.job.id}`}});
  });
  const restored=await reconcileJob(s.db,s.job.id,repo);expect(restored.commit).toBe(commit);expect(restored.state).toBe('pushed');
  expect(s.sqlite.prepare('SELECT published_revision FROM writer_drafts').get()?.published_revision).toBe(1);
});
it('已许可运行结束后仅一次没找到提交，不能误判没推送并释放预留',async()=>{
  const s=await setup(),{lease}=await claimJob(s.db,s.job.id,'1001');await authorizePush(s.db,s.job.id,lease,'1001');
  const repo=createWriterRepository('测试凭据',async(url)=>String(url).includes('/actions/runs/')?json({...run(s.job.id),status:'completed',conclusion:'failure'}):json([]));
  const result=await reconcileJob(s.db,s.job.id,repo);expect(result.state).toBe('ready');expect(result.code).toBe('push_unconfirmed');expect(s.sqlite.prepare('SELECT reserve_bytes FROM writer_jobs').get()?.reserve_bytes).toBe(262144);
});
it('工作流只手动接收任务 ID，固定主分支及完整 Action SHA，验证阶段无发布凭据',()=>{
  const workflow=parse(readFileSync('.github/workflows/cloud-writer.yml','utf8'));
  expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual(['jobId']);
  expect(workflow.permissions).toEqual({contents:'read'});expect(workflow.jobs.publish['timeout-minutes']).toBe(10);
  const steps=workflow.jobs.publish.steps;expect(steps.filter((s:any)=>s.uses).every((s:any)=>/@[a-f0-9]{40}$/.test(s.uses))).toBe(true);
  const checkout=steps.find((s:any)=>s.uses?.startsWith('actions/checkout@'));expect(checkout.with.ref).toBe('main');expect(checkout.with['persist-credentials']).toBe(false);
  expect(steps.filter((s:any)=>s.env?.WRITER_PUBLISH_TOKEN)).toHaveLength(1);
  const verify=steps.find((s:any)=>s.run==='node scripts/writer/run.mjs verify');expect(verify.env).toBeUndefined();
  expect(steps.findIndex((s:any)=>s===verify)).toBeLessThan(steps.findIndex((s:any)=>s.env?.WRITER_PUBLISH_TOKEN));
  expect(steps.some((s:any)=>String(s.uses).includes('upload-artifact'))).toBe(false);
});
