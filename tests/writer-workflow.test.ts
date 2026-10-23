import { afterEach,expect,it,vi } from 'vitest';
import { writerFixture } from './_writer';
import { writerProof } from '../functions/api/_lib/writer-auth';
import { createDraft } from '../functions/api/_lib/writer-drafts';
import { createJob,readJob,claimJob,authorizePush,recordJob,recordDeployment,requestDeploymentCheck,reconcileJob,setDispatchUnknown } from '../functions/api/_lib/writer-jobs';
import { createWriterRepository } from '../functions/api/_lib/writer-repository';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { onRequestPost } from '../functions/api/writer/publish';
import { onRequestPost as runner } from '../functions/api/writer/runner';
import { deploymentState,waitForDeployment } from '../scripts/writer/deployment.mjs';
afterEach(()=>vi.unstubAllGlobals());
const commit='3'.repeat(40),details='https://dash.cloudflare.com/4bcfa9cf29fad54bd0ca74b90903a10c/pages/view/personal/deployments/example';
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
async function setup(){const s=await writerFixture(),proof=await writerProof(s.request(),{id:s.owner,auth_version:0} as never),draft=await createDraft(s.db,proof,{kind:'post',key:'example',base:null,value:{fields:{title:'标题',date:'2026-10-23',summary:'简介',tags:['随笔']},body:'正文',assets:[]}}),job=await createJob(s.db,proof,{draftId:draft.id,revision:1,requestId:'1'.repeat(32)});return {...s,proof,draft,job};}
const run=(id:string)=>({id:1001,display_title:`云端写作 ${id}`,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/cloud-writer.yml',repository:{full_name:'NorthenCedar/personal'},status:'in_progress',conclusion:null});
it('细粒度令牌查询已推送任务时不调用它不支持的 Checks API',async()=>{
  const s=await setup(),{lease}=await claimJob(s.db,s.job.id,'1001');await authorizePush(s.db,s.job.id,lease,'1001');
  await recordJob(s.db,s.job.id,lease,{state:'pushed',runId:'1001',commit,publishedBase:{commit,blobSha:'4'.repeat(40),text:'已发布'}});
  const requests:string[]=[],repo=createWriterRepository('细粒度令牌',async(url)=>{requests.push(String(url));return new Response('{}',{status:403});});
  expect((await reconcileJob(s.db,s.job.id,repo)).state).toBe('pushed');expect(requests).toEqual([]);
});
it('派发应答丢失后从固定工作流运行恢复，不再次派发',async()=>{
  const s=await setup();await setDispatchUnknown(s.db,s.job.id);const requests:string[]=[];
  const repo=createWriterRepository('测试凭据',async(url,init)=>{requests.push(String(url));expect(init?.method).toBe('GET');return String(url).includes('/runs?')?json({workflow_runs:[run(s.job.id)]}):json(run(s.job.id));});
  await reconcileJob(s.db,s.job.id,repo);expect((await readJob(s.db,s.owner,s.job.id)).runId).toBe('1001');expect(requests.every(u=>!u.includes('dispatches'))).toBe(true);
});
it('准确提交的 Cloudflare 部署失败不能当作已经上线',async()=>{
  const s=await setup(),{lease}=await claimJob(s.db,s.job.id,'1001');await authorizePush(s.db,s.job.id,lease,'1001');
  await recordJob(s.db,s.job.id,lease,{state:'pushed',runId:'1001',commit,publishedBase:{commit,blobSha:'4'.repeat(40),text:'已发布'}});
  const state=deploymentState([{head_sha:commit,app:{id:85455,slug:'cloudflare-workers-and-pages'},details_url:details,status:'completed',conclusion:'failure'}],commit);
  await recordDeployment(s.db,s.job.id,lease,'1001',commit,state);expect((await readJob(s.db,s.owner,s.job.id)).state).toBe('deployment_failed');
});
it('其他 App、其他提交和其他 Pages 项目的成功不算本次上线',async()=>{
  const checks=[{head_sha:'5'.repeat(40),app:{id:85455,slug:'cloudflare-workers-and-pages'},details_url:details},{head_sha:commit,app:{id:1,slug:'another-app'},details_url:details},{head_sha:commit,app:{id:85455,slug:'cloudflare-workers-and-pages'},details_url:details.replace('/personal/','/another/')}].map(c=>({...c,status:'completed',conclusion:'success'}));
  expect(deploymentState(checks,commit)).toBe('pending');
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
it('站主明确结束已停止运行的待确认任务后解除互斥，旧回调不能再改状态',async()=>{
  const s=await setup(),{lease}=await claimJob(s.db,s.job.id,'1001');await authorizePush(s.db,s.job.id,lease,'1001');
  s.sqlite.exec("UPDATE writer_jobs SET code='push_unconfirmed'");let completed=false;
  vi.stubGlobal('fetch',async(url:unknown)=>String(url).includes('/actions/runs/')?json({...run(s.job.id),status:completed?'completed':'in_progress',conclusion:completed?'failure':null}):json([]));
  const env={...s.env,WRITER_GITHUB_TOKEN:'测试凭据'},request=()=>s.request('/publish','POST',{action:'close_unconfirmed',id:s.job.id,confirm:true});
  expect((await onRequestPost({request:request(),env} as never)).status).toBe(409);
  completed=true;const response=await onRequestPost({request:request(),env} as never);expect(response.status).toBe(200);
  const {job}=await response.json() as any;expect(job.state).toBe('failed');expect(job.code).toBe('owner_closed_unconfirmed');
  expect(s.sqlite.prepare('SELECT reserve_bytes FROM writer_jobs').get()?.reserve_bytes).toBe(0);
  await expect(recordJob(s.db,s.job.id,lease,{state:'failed',runId:'1001'})).rejects.toMatchObject({code:'invalid_transition'});
  expect((await createJob(s.db,s.proof,{draftId:s.draft.id,revision:1,requestId:'2'.repeat(32)})).state).toBe('queued');
});
it('工作流只手动接收任务 ID，固定主分支及完整 Action SHA，验证阶段无发布凭据',()=>{
  const workflow=parse(readFileSync('.github/workflows/cloud-writer.yml','utf8'));
  expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);expect(Object.keys(workflow.on.workflow_dispatch.inputs)).toEqual(['jobId','diagnostic','verifySource']);
  expect(workflow.permissions).toEqual({contents:'read'});expect(workflow.jobs.publish['timeout-minutes']).toBe(10);
  expect(workflow.jobs.publish.permissions).toEqual({contents:'read',checks:'read'});
  const steps=workflow.jobs.publish.steps;expect(steps.filter((s:any)=>s.uses).every((s:any)=>/@[a-f0-9]{40}$/.test(s.uses))).toBe(true);
  const checkout=steps.find((s:any)=>s.uses?.startsWith('actions/checkout@'));expect(checkout.with.ref).toBe('main');expect(checkout.with['persist-credentials']).toBe(false);
  expect(steps.filter((s:any)=>s.env?.WRITER_PUBLISH_TOKEN)).toHaveLength(1);
  const verify=steps.find((s:any)=>s.run==='node scripts/writer/run.mjs verify');expect(verify.env).toBeUndefined();
  expect(steps.findIndex((s:any)=>s===verify)).toBeLessThan(steps.findIndex((s:any)=>s.env?.WRITER_PUBLISH_TOKEN));
  expect(steps.some((s:any)=>String(s.uses).includes('upload-artifact'))).toBe(false);
  const deployment=steps.find((s:any)=>s.run==='node scripts/writer/run.mjs deployment');expect(deployment.env.GITHUB_TOKEN).toBe('${{ github.token }}');expect(deployment.env.WRITER_PUBLISH_TOKEN).toBeUndefined();
  expect(steps.indexOf(deployment)).toBeGreaterThan(steps.findIndex((s:any)=>s.env?.WRITER_PUBLISH_TOKEN));
  expect(workflow.jobs.probe.steps.some((s:any)=>s.env?.WRITER_PUBLISH_TOKEN)).toBe(false);
  const sourceCheck=workflow.jobs.probe.steps.find((s:any)=>s.name==='只读完整校验已提交源码');
  expect(sourceCheck).toMatchObject({if:'${{ inputs.verifySource }}',run:'npm ci && npm run verify'});
  expect(sourceCheck.env).toBeUndefined();expect(workflow.on.workflow_dispatch.inputs.verifySource.default).toBe(false);
});
it('待确认不算上线，成功回执幂等，旧租约、其他提交与未推送回执均拒绝',async()=>{
  const s=await setup(),{lease}=await claimJob(s.db,s.job.id,'1001');
  await expect(recordDeployment(s.db,s.job.id,lease,'1001',commit,'deployed')).rejects.toMatchObject({code:'invalid_deployment'});
  await authorizePush(s.db,s.job.id,lease,'1001');await recordJob(s.db,s.job.id,lease,{state:'pushed',runId:'1001',commit,publishedBase:{commit,blobSha:'4'.repeat(40),text:'已发布'}});
  expect((await recordDeployment(s.db,s.job.id,lease,'1001',commit,'pending')).state).toBe('pushed');
  await expect(recordDeployment(s.db,s.job.id,lease,'1001','9'.repeat(40),'deployed')).rejects.toMatchObject({code:'invalid_deployment'});
  const check=await claimJob(s.db,s.job.id,'1002');expect(check).toMatchObject({deploymentOnly:true,commit});expect(check).not.toHaveProperty('snapshot');expect(check.job.code).toBe('deployment_check_running');
  await expect(recordDeployment(s.db,s.job.id,lease,'1001',commit,'deployment_failed')).rejects.toMatchObject({code:'stale_lease'});
  await expect(authorizePush(s.db,s.job.id,check.lease,'1002')).rejects.toMatchObject({code:'push_not_authorized'});
  expect((await recordDeployment(s.db,s.job.id,check.lease,'1002',commit,'deployed')).state).toBe('deployed');
  expect((await recordDeployment(s.db,s.job.id,check.lease,'1002',commit,'deployed')).state).toBe('deployed');
});
it('单独部署检查只触发一次原任务，运行期间与重复点击不触发新提交',async()=>{
  const s=await setup(),{lease}=await claimJob(s.db,s.job.id,'1001');await authorizePush(s.db,s.job.id,lease,'1001');await recordJob(s.db,s.job.id,lease,{state:'pushed',runId:'1001',commit,publishedBase:{commit,blobSha:'4'.repeat(40),text:'已发布'}});
  let completed=false,dispatches=0;
  const repo=createWriterRepository('测试凭据',async(url,init)=>{if(init?.method==='POST'){dispatches++;expect(JSON.parse(String(init.body))).toEqual({ref:'main',inputs:{jobId:s.job.id}});return new Response(null,{status:204});}return json({...run(s.job.id),status:completed?'completed':'in_progress'});});
  await requestDeploymentCheck(s.db,s.proof,s.job.id,repo);expect(dispatches).toBe(0);completed=true;
  await requestDeploymentCheck(s.db,s.proof,s.job.id,repo);await requestDeploymentCheck(s.db,s.proof,s.job.id,repo);expect(dispatches).toBe(1);
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_jobs').get()?.n).toBe(1);
});
it('重新检查在领取前失败后恢复入口，触发应答未知时不重发',async()=>{
  const s=await setup(),{lease}=await claimJob(s.db,s.job.id,'1001');await authorizePush(s.db,s.job.id,lease,'1001');await recordJob(s.db,s.job.id,lease,{state:'pushed',runId:'1001',commit,publishedBase:{commit,blobSha:'4'.repeat(40),text:'已发布'}});
  let dispatches=0;
  const repo=createWriterRepository('测试凭据',async(url,init)=>{
    if(init?.method==='POST'){dispatches++;throw Error('应答丢失');}
    if(String(url).includes('/runs?'))return json({workflow_runs:[{...run(s.job.id),id:1002,status:'completed',conclusion:'failure'}]});
    return json({...run(s.job.id),status:'completed'});
  });
  expect((await requestDeploymentCheck(s.db,s.proof,s.job.id,repo)).code).toBe('deployment_dispatch_unknown');
  await requestDeploymentCheck(s.db,s.proof,s.job.id,repo);expect(dispatches).toBe(1);
  expect((await reconcileJob(s.db,s.job.id,repo)).code).toBe('deployment_pending');
  await requestDeploymentCheck(s.db,s.proof,s.job.id,repo);expect(dispatches).toBe(2);
});
it('临时令牌等待准确部署，权限拒绝只请求一次且不泄露远端响应',async()=>{
  let requests=0,pauses=0;
  const fetchImpl:typeof fetch=async()=>{requests++;return json({check_runs:requests===1?[]:[{head_sha:commit,app:{id:85455,slug:'cloudflare-workers-and-pages'},details_url:details,status:'completed',conclusion:'success'}]});};
  expect(await waitForDeployment(commit,{token:'临时令牌',fetchImpl,pause:async()=>{pauses++;}})).toBe('deployed');expect(pauses).toBe(1);
  requests=0;await expect(waitForDeployment(commit,{token:'临时令牌',fetchImpl:async()=>{requests++;return new Response('不应泄露的正文',{status:403});}})).rejects.toThrow('deployment_query_failed');expect(requests).toBe(1);
  expect(await waitForDeployment(commit,{token:'临时令牌',attempts:1,fetchImpl:async()=>json({check_runs:[]})})).toBe('pending');
});
it('配置核验必须有共享密钥和准确在运行的固定工作流，不创建草稿或任务',async()=>{
  const s=await writerFixture(),id='0'.repeat(32),env={...s.env,WRITER_GITHUB_TOKEN:'测试凭据',WRITER_RUNNER_SECRET:'s'.repeat(64)};
  const request=()=>s.request('/runner','POST',{action:'probe',jobId:id,runId:'1001'},{Authorization:'Bearer '+env.WRITER_RUNNER_SECRET});
  let active=true;vi.stubGlobal('fetch',async(url:unknown)=>String(url).includes('/actions/runs/')?json({...run(id),status:active?'in_progress':'completed'}):json({object:{type:'commit',sha:commit}}));
  expect((await runner({request:request(),env} as never)).status).toBe(200);
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_drafts').get()?.n).toBe(0);expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_jobs').get()?.n).toBe(0);
  active=false;expect((await runner({request:request(),env} as never)).status).toBe(424);
});
it('受保护配置核验保留上游认证失败状态，未授权请求仍为 401',async()=>{
  const s=await writerFixture(),env={...s.env,WRITER_GITHUB_TOKEN:'测试凭据',WRITER_RUNNER_SECRET:'s'.repeat(64)},body={action:'probe',jobId:'0'.repeat(32),runId:'1001'};let calls=0;
  vi.stubGlobal('fetch',async()=>{calls++;return new Response('不应泄露的上游正文',{status:401});});
  expect((await runner({request:s.request('/runner','POST',body),env} as never)).status).toBe(401);expect(calls).toBe(0);
  const response=await runner({request:s.request('/runner','POST',body,{Authorization:'Bearer '+env.WRITER_RUNNER_SECRET}),env} as never);
  expect(response.status).toBe(424);expect(await response.json()).toMatchObject({code:'repository_http_401',upstreamStatus:502});expect(calls).toBe(1);
});
