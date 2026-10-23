import { expect,it } from 'vitest';
import { writerFixture } from './_writer';
import { writerProof } from '../functions/api/_lib/writer-auth';
import { createDraft,saveDraft,readDraft } from '../functions/api/_lib/writer-drafts';
import { createJob,readJob,claimJob,authorizePush,recordJob,cancelJob } from '../functions/api/_lib/writer-jobs';
import { putAsset,deleteAsset } from '../functions/api/_lib/writer-assets';
import sharp from 'sharp';
import { onRequestPost as runner } from '../functions/api/writer/runner';
async function setup(){const s=await writerFixture(),proof=await writerProof(s.request(),{id:s.owner,auth_version:0} as never),value={fields:{title:'标题',date:'2026-10-23',summary:'简介',tags:['随笔']},body:'准备发布',assets:[]};const draft=await createDraft(s.db,proof,{kind:'post',key:'example',base:null,value});return {...s,proof,draft,value};}
const requestId='1'.repeat(32),commit='3'.repeat(40);
it('冻结快照不随编辑变化，推送只推进基线和已发布版本，不覆盖新正文',async()=>{
  const s=await setup(),input={draftId:s.draft.id,revision:1,requestId},job=await createJob(s.db,s.proof,input);
  expect((await createJob(s.db,s.proof,input)).id).toBe(job.id);
  const {lease,snapshot}=await claimJob(s.db,job.id,'1001');expect(snapshot.value.body).toBe('准备发布');
  await saveDraft(s.db,s.proof,{id:s.draft.id,requestId:'2'.repeat(32),expectedRevision:1,value:{...s.value,body:'发布期间继续写的内容'}});
  expect(snapshot.value.body).toBe('准备发布');
  await authorizePush(s.db,job.id,lease,'1001');
  const event={state:'pushed' as const,runId:'1001',commit,publishedBase:{commit,blobSha:'4'.repeat(40),text:'已发布原文'}};
  await recordJob(s.db,job.id,lease,event);await recordJob(s.db,job.id,lease,event);
  const current=await readDraft(s.db,s.owner,s.draft.id);
  expect(current.value.body).toBe('发布期间继续写的内容');expect(current.publishedRevision).toBe(1);expect(current.base?.commit).toBe(commit);
  expect((await readJob(s.db,s.owner,job.id)).state).toBe('pushed');
});
it('不同请求并发只能创建一个活动发布，回执键不可挪用',async()=>{
  const s=await setup(),results=await Promise.allSettled([1,2].map(n=>createJob(s.db,s.proof,{draftId:s.draft.id,revision:1,requestId:String(n).repeat(32)})));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_jobs').get()?.n).toBe(1);
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_requests').get()?.n).toBe(0);
});
it.each(['password','logout','cancel','delete'])('%s 后不能取得新的推送许可，草稿及私密信息不越权',async(action)=>{
  const s=await setup(),job=await createJob(s.db,s.proof,{draftId:s.draft.id,revision:1,requestId}),claimed=await claimJob(s.db,job.id,'1001');
  if(action==='password') s.sqlite.exec('UPDATE visitor_accounts SET auth_version=auth_version+1');
  if(action==='logout') s.sqlite.exec('DELETE FROM visitor_sessions');
  if(action==='cancel') await cancelJob(s.db,s.proof,job.id);
  if(action==='delete') s.sqlite.exec('DELETE FROM visitor_accounts');
  await expect(authorizePush(s.db,job.id,claimed.lease,'1001')).rejects.toBeDefined();
  await expect(readJob(s.db,'c'.repeat(32),job.id)).rejects.toMatchObject({status:404});
});
it('错租约、旧 run、跳级回调和过期租约都不能修改任务',async()=>{
  const s=await setup(),job=await createJob(s.db,s.proof,{draftId:s.draft.id,revision:1,requestId}),{lease}=await claimJob(s.db,job.id,'1001');
  await expect(authorizePush(s.db,job.id,'f'.repeat(64),'1001')).rejects.toMatchObject({status:409});
  await expect(authorizePush(s.db,job.id,lease,'999')).rejects.toMatchObject({status:409});
  await expect(recordJob(s.db,job.id,lease,{state:'pushed',runId:'1001',commit})).rejects.toBeDefined();
  expect((await readJob(s.db,s.owner,job.id)).state).toBe('validating');
  s.sqlite.exec('UPDATE writer_jobs SET lease_expires=0');
  await expect(authorizePush(s.db,job.id,lease,'1001')).rejects.toMatchObject({status:409});
});
it('移除草稿图片引用之后，冻结快照仍保护该图片',async()=>{
  const s=await setup(),image=await putAsset(s.db,s.proof,new Uint8Array(await sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).webp().toBuffer()));
  await saveDraft(s.db,s.proof,{id:s.draft.id,requestId:'3'.repeat(32),expectedRevision:1,value:{...s.value,assets:[{sha256:image.sha256,alt:'冻结图片'}]}});
  const job=await createJob(s.db,s.proof,{draftId:s.draft.id,revision:2,requestId});
  await saveDraft(s.db,s.proof,{id:s.draft.id,requestId:'4'.repeat(32),expectedRevision:2,value:s.value});
  await expect(deleteAsset(s.db,s.proof,image.sha256)).rejects.toMatchObject({status:409});
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_job_assets WHERE job_id=?').get(job.id)?.n).toBe(1);
});
it('普通站主 Cookie 不能替代 runner 专用凭据，错误不泄露快照',async()=>{
  const s=await setup();
  const response=await runner({request:s.request('/runner','POST',{action:'claim',jobId:'a'.repeat(32),runId:'1001'}),env:{...s.env,WRITER_RUNNER_SECRET:'r'.repeat(64)}} as never);
  expect(response.status).toBe(401);expect(await response.text()).not.toContain('准备发布');
});
