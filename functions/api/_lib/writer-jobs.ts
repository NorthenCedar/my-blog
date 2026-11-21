import type { WriterProof } from './writer-auth';
import { writerId,writerFail,utf8Length,type WriterJob,type WriterDraft,type WriterBase,type WriterJobState } from '../../../src/lib/writer/model';
import { validatePublish,readTalks } from '../../../src/lib/writer/content';
import { digest,randomToken } from './visitor-core';
import { LIVE_ACCOUNT_SQL } from './visitor-store';
import { readDraft,assertWriterProof,proofValues,writerStoreError } from './writer-drafts';
import type { WriterRepository } from './writer-repository';
import { matchesWriterRun,readPublishedSource,WriterRepositoryRateLimit } from './writer-repository';
export type JobRow={id:string;owner:string;draft_id:string;revision:number;request_id:string;state:WriterJobState;snapshot_json:string;owner_auth_version:number;owner_session_hash:string;lease_hash:string|null;lease_expires:number|null;run_id:string|null;commit_sha:string|null;code:string|null;version:number;created_at:number;updated_at:number};
type JobSummary=Pick<JobRow,'id'|'draft_id'|'revision'|'state'|'run_id'|'commit_sha'|'code'>;
type JobStatus=JobSummary&Pick<JobRow,'owner'|'version'>&{reconcile_after?:number};
type JobLookup={id:string}|{requestId:string};
const summaryColumns='id,draft_id,revision,state,run_id,commit_sha,code';
const statusColumns=`${summaryColumns},owner,version`;
const publicJob=(row:JobSummary):WriterJob=>({id:row.id,draftId:row.draft_id,revision:row.revision,state:row.state,runId:row.run_id,commit:row.commit_sha,code:row.code});
export async function jobRow(db:D1Database,id:string):Promise<JobRow>{
  const row=await db.prepare('SELECT * FROM writer_jobs WHERE id=?').bind(writerId(id)).first<JobRow>();
  if(!row) writerFail(404,'job_missing','发布任务不存在');return row;
}
const jobProof=(r:JobRow):WriterProof=>({owner:r.owner,authVersion:r.owner_auth_version,tokenHash:r.owner_session_hash,values:[]});
function jobSelect(db:D1Database,owner:string,lookup:JobLookup,columns:string,withReconcile=false){
  const key='id' in lookup?'id':'request_id',value=writerId('id' in lookup?lookup.id:lookup.requestId);
  const from=withReconcile?'writer_jobs LEFT JOIN writer_job_reconcile ON job_id=id':'writer_jobs';
  return db.prepare(`SELECT ${columns} FROM ${from} WHERE owner=? AND ${key}=?`).bind(owner,value);
}
function requireJob<T>(row:T|null,lookup:JobLookup):T {
  if(!row)writerFail(404,'job_missing','requestId' in lookup?'尚未找到此发布请求，请检查后重新确认':'发布任务不存在');
  return row;
}
export async function readJob(db:D1Database,owner:string,id:string){
  const row=await jobSelect(db,owner,{id},summaryColumns).first<JobSummary>();
  return publicJob(requireJob(row,{id}));
}
export async function listJobs(db:D1Database,owner:string){return (await db.prepare(`SELECT ${summaryColumns} FROM writer_jobs WHERE owner=? ORDER BY created_at DESC LIMIT 25`).bind(owner).all<JobSummary>()).results.map(publicJob);}
export async function createJob(db:D1Database,proof:WriterProof,input:{draftId:string;revision:number;requestId:string}):Promise<WriterJob>{
  writerId(input.requestId);const snapshot=await readDraft(db,proof.owner,input.draftId);await assertWriterProof(db,proof);
  const old=await jobSelect(db,proof.owner,{requestId:input.requestId},summaryColumns).first<JobSummary>();
  if(old){if(old.draft_id!==input.draftId||old.revision!==input.revision) writerFail(409,'request_reused','发布请求已用于另一版本');return publicJob(old);}
  if(snapshot.revision!==input.revision) writerFail(409,'version_conflict','草稿已变化，请先重新保存');
  validatePublish(snapshot.kind,snapshot.value,snapshot.base);
  const id=randomToken(16),marker=randomToken(16),text=JSON.stringify(snapshot),now=Date.now();
  try{
    const results=await db.batch([
      db.prepare(`INSERT INTO writer_requests(id,owner) SELECT ?,? WHERE EXISTS(SELECT 1 FROM writer_drafts WHERE id=? AND owner=? AND revision=?) AND ${LIVE_ACCOUNT_SQL}`).bind(marker,proof.owner,input.draftId,proof.owner,input.revision,...proofValues(proof)),
      db.prepare("INSERT INTO writer_jobs(id,owner,draft_id,revision,request_id,snapshot_json,payload_bytes,reserve_bytes,state,owner_auth_version,owner_session_hash,created_at,updated_at) SELECT ?,?,?,?,?,?,?,262144,'queued',?,?,?,? WHERE EXISTS(SELECT 1 FROM writer_requests WHERE id=?)").bind(id,proof.owner,input.draftId,input.revision,input.requestId,text,utf8Length(text),proof.authVersion,proof.tokenHash,now,now,marker),
      db.prepare('INSERT INTO writer_job_assets(job_id,owner,sha256,position) SELECT ?,owner,sha256,position FROM writer_draft_assets WHERE draft_id=? AND EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(id,input.draftId,marker),
      db.prepare('DELETE FROM writer_requests WHERE id=?').bind(marker),
    ]);
    if(!results[0].meta.changes){await assertWriterProof(db,proof);writerFail(409,'version_conflict','草稿已变化，请重新读取');}
    return readJob(db,proof.owner,id);
  }catch(error){
    // 同一点击的并发重试可能同时未见回执；唯一约束后重新读取既有任务。
    const previous=await jobSelect(db,proof.owner,{requestId:input.requestId},summaryColumns).first<JobSummary>();
    if(previous&&previous.draft_id===input.draftId&&previous.revision===input.revision){await assertWriterProof(db,proof);return publicJob(previous);}
    return writerStoreError(error);
  }
}
export async function claimJob(db:D1Database,id:string,runId:string){
  if(!/^\d{1,20}$/.test(runId)) writerFail(400,'invalid_run','运行标识不对');
  const row=await jobRow(db,id),proof=jobProof(row),lease=randomToken(),hash=await digest(lease),now=Date.now();
  // 已推送任务重新运行时只核对部署，不能再次准备或提交正文。
  if(row.commit_sha&&['pushed','deployment_failed','deployed'].includes(row.state)){
    if(BigInt(runId)<=BigInt(row.run_id??'0'))writerFail(409,'stale_run','旧运行不能重新领取部署检查');
    const changed=await db.prepare("UPDATE writer_jobs SET run_id=?,lease_hash=?,lease_expires=?,code='deployment_check_running',version=version+1,updated_at=? WHERE id=? AND version=? RETURNING id").bind(runId,hash,now+10*60000,now,id,row.version).first();
    if(!changed)writerFail(409,'job_claimed','任务已被其他运行领取');
    return {job:await readJob(db,row.owner,id),lease,deploymentOnly:true,commit:row.commit_sha};
  }
  await assertWriterProof(db,proof);
  const changed=await db.prepare(`UPDATE writer_jobs SET state='validating',run_id=?,lease_hash=?,lease_expires=?,version=version+1,updated_at=? WHERE id=? AND version=? AND state IN ('queued','dispatch_unknown') AND ${LIVE_ACCOUNT_SQL} RETURNING id`).bind(runId,hash,now+10*60000,now,id,row.version,...proofValues(proof)).first();
  if(!changed) writerFail(409,'job_claimed','任务已被领取或已结束，请查询原任务');
  return {job:await readJob(db,row.owner,id),lease,snapshot:JSON.parse(row.snapshot_json) as WriterDraft};
}
export async function checkLease(db:D1Database,id:string,lease:string,runId:string){
  const row=await jobRow(db,id);
  if(!/^[a-f0-9]{64}$/.test(lease)||row.run_id!==runId||row.lease_hash!==await digest(lease)||!row.lease_expires||row.lease_expires<Date.now()) writerFail(409,'stale_lease','发布运行或许可已过期，请查询任务结果');
  return row;
}
export async function recordDeployment(db:D1Database,id:string,lease:string,runId:string,commit:string,state:string){
  const row=await checkLease(db,id,lease,runId);
  if(!['pending','deployed','deployment_failed'].includes(state)||!row.commit_sha||commit!==row.commit_sha||!['pushed','deployment_failed','deployed'].includes(row.state))writerFail(409,'invalid_deployment','部署回执与已确认的提交不符');
  const changed=await db.prepare('UPDATE writer_jobs SET state=?,code=?,version=version+1,updated_at=? WHERE id=? AND version=? AND lease_hash=? AND run_id=? AND lease_expires>? RETURNING id').bind(state==='pending'?row.state:state,state==='pending'?'deployment_pending':null,Date.now(),id,row.version,row.lease_hash,runId,Date.now()).first();
  if(!changed)writerFail(409,'stale_event','部署检查已被更新的运行取代');
  return readJob(db,row.owner,id);
}
export async function requestDeploymentCheck(db:D1Database,proof:WriterProof,id:string,repo:WriterRepository){
  await assertWriterProof(db,proof);
  const row=requireJob(await jobSelect(db,proof.owner,{id},statusColumns).first<JobStatus>(),{id});
  if(!row.commit_sha||!['pushed','deployment_failed'].includes(row.state)||!row.run_id)writerFail(409,'deployment_not_ready','请先等待内容推送完成');
  if(['deployment_check_queued','deployment_dispatch_unknown'].includes(row.code??''))return publicJob(row);
  const run=await repo.run(row.run_id);
  if(!matchesWriterRun(run,id))writerFail(403,'invalid_run','运行不属于此发布任务');
  if(run.status!=='completed')return publicJob(row);
  const changed=await db.prepare(`UPDATE writer_jobs SET code='deployment_check_queued',version=version+1,updated_at=? WHERE id=? AND version=? AND ${LIVE_ACCOUNT_SQL} RETURNING id`).bind(Date.now(),id,row.version,...proofValues(proof)).first();
  if(!changed)writerFail(409,'stale_event','任务已变化，请重新查询');
  try{await repo.dispatch(id);}catch{await db.prepare("UPDATE writer_jobs SET code='deployment_dispatch_unknown' WHERE id=? AND code='deployment_check_queued' AND version=?").bind(id,row.version+1).run();}
  return readJob(db,proof.owner,id);
}
export async function authorizePush(db:D1Database,id:string,lease:string,runId:string){
  const row=await checkLease(db,id,lease,runId),proof=jobProof(row);await assertWriterProof(db,proof);
  const changed=await db.prepare(`UPDATE writer_jobs SET state='ready',version=version+1,updated_at=? WHERE id=? AND version=? AND state='validating' AND lease_hash=? AND run_id=? AND lease_expires>? AND ${LIVE_ACCOUNT_SQL} RETURNING id`).bind(Date.now(),id,row.version,row.lease_hash,runId,Date.now(),...proofValues(proof)).first();
  if(!changed) writerFail(409,'push_not_authorized','任务已取消、已获许可或状态已变化，请查询结果');
  return {job:await readJob(db,row.owner,id),expiresAt:Date.now()+30000};
}
export type JobEvent={state:WriterJobState;runId:string;commit?:string;publishedBase?:WriterBase;code?:string};
export async function recordJob(db:D1Database,id:string,lease:string,event:JobEvent):Promise<WriterJob>{
  const row=await checkLease(db,id,lease,event.runId);
  if(event.state==='pushed'&&(row.state==='pushed'||row.state==='deployed'||row.state==='deployment_failed')&&event.commit===row.commit_sha) return publicJob(row);
  if(!['failed','conflict','pushed'].includes(event.state)||!['validating','ready'].includes(row.state)) writerFail(409,'invalid_transition','任务状态已变化，旧回调已忽略');
  const code=event.code??null;if(code&&!/^[a-z0-9_]{1,80}$/.test(code)) writerFail(400,'invalid_code','任务结果格式不对');
  if(event.state==='pushed'&&(row.state!=='ready'||!event.commit||!/^[a-f0-9]{40}$/.test(event.commit)||!event.publishedBase||event.publishedBase.commit!==event.commit||!/^[a-f0-9]{40}$/.test(event.publishedBase.blobSha))) writerFail(409,'invalid_receipt','推送回执尚未验证');
  const marker=randomToken(16),base=event.publishedBase?JSON.stringify(event.publishedBase):null;
  if(base&&utf8Length(base)>262144) writerFail(413,'base_too_large','发布原文过大，请导出并在本地处理');
  try{
    const statements=[
      db.prepare('INSERT INTO writer_requests(id,owner) SELECT ?,owner FROM writer_jobs WHERE id=? AND version=? AND state=? AND lease_hash=? AND run_id=? AND lease_expires>?').bind(marker,id,row.version,row.state,row.lease_hash,event.runId,Date.now()),
      db.prepare('UPDATE writer_jobs SET state=?,commit_sha=?,code=?,reserve_bytes=0,version=version+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(event.state,event.commit??null,code,Date.now(),id,marker),
    ];
    if(event.state==='pushed') statements.push(db.prepare('UPDATE writer_drafts SET base_json=?,published_revision=?,payload_bytes=length(CAST(value_json AS BLOB))+? WHERE id=? AND owner=? AND published_revision<? AND EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(base,row.revision,utf8Length(base!),row.draft_id,row.owner,row.revision,marker));
    statements.push(db.prepare('DELETE FROM writer_requests WHERE id=?').bind(marker));
    const results=await db.batch(statements);if(!results[0].meta.changes) writerFail(409,'stale_event','任务结果已变化，请重新查询');
    return readJob(db,row.owner,id);
  }catch(error){return writerStoreError(error);}
}
export async function cancelJob(db:D1Database,proof:WriterProof,id:string){
  await assertWriterProof(db,proof);
  const changed=await db.prepare(`UPDATE writer_jobs SET state='cancelled',reserve_bytes=0,version=version+1,updated_at=? WHERE id=? AND owner=? AND state IN ('queued','dispatch_unknown','validating') AND ${LIVE_ACCOUNT_SQL} RETURNING id`).bind(Date.now(),writerId(id),proof.owner,...proofValues(proof)).first();
  if(!changed){await assertWriterProof(db,proof);writerFail(409,'job_cannot_cancel','任务已结束或已获推送许可，请查询实际结果');}
  return readJob(db,proof.owner,id);
}
export async function setDispatchUnknown(db:D1Database,id:string){await db.prepare("UPDATE writer_jobs SET state='dispatch_unknown',version=version+1 WHERE id=? AND state='queued'").bind(writerId(id)).run();}
export async function publishedBase(repo:WriterRepository,row:Pick<JobRow,'id'|'snapshot_json'>,commit:string):Promise<WriterBase>{
  await repo.commitReceipt(commit,row.id);
  const snapshot:WriterDraft=JSON.parse(row.snapshot_json),source=await readPublishedSource(repo,commit,snapshot.kind,snapshot.key),item=snapshot.kind==='talk'?readTalks(source.text).find(t=>t.key===snapshot.key):null;
  if(snapshot.kind==='talk'&&!item)writerFail(409,'invalid_receipt','发布的说说尚未确认');
  return {commit,blobSha:source.sha,text:source.text,...(item?{itemHash:item.itemHash}:{}),...(snapshot.kind==='gallery'&&snapshot.base?.galleryIndex!==undefined?{galleryIndex:snapshot.base.galleryIndex}:{})};
}
async function observePush(db:D1Database,row:JobStatus,commit:string,base:WriterBase){
  const encoded=JSON.stringify(base),marker=randomToken(16);if(utf8Length(encoded)>262144)writerFail(413,'base_too_large','发布基线超限，请先导出并在本地处理');
  try{
    await db.batch([
      db.prepare("INSERT INTO writer_requests(id,owner) SELECT ?,owner FROM writer_jobs WHERE id=? AND version=? AND state NOT IN ('cancelled','deployed')").bind(marker,row.id,row.version),
      db.prepare("UPDATE writer_jobs SET state='pushed',commit_sha=?,code=NULL,reserve_bytes=0,version=version+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM writer_requests WHERE id=?)").bind(commit,Date.now(),row.id,marker),
      db.prepare('UPDATE writer_drafts SET base_json=?,published_revision=?,payload_bytes=length(CAST(value_json AS BLOB))+? WHERE id=? AND owner=? AND published_revision<? AND EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(encoded,row.revision,utf8Length(encoded),row.draft_id,row.owner,row.revision,marker),
      db.prepare('DELETE FROM writer_requests WHERE id=?').bind(marker),
    ]);
  }catch(error){writerStoreError(error);}
}
async function recoverPush(db:D1Database,row:JobStatus,repo:WriterRepository,commit:string){
  const snapshot=await db.prepare('SELECT snapshot_json FROM writer_jobs WHERE id=? AND version=?').bind(row.id,row.version).first<Pick<JobRow,'snapshot_json'>>();
  if(snapshot)await observePush(db,row,commit,await publishedBase(repo,{id:row.id,...snapshot},commit));
}

const deploymentQueued=(row:JobStatus)=>row.code==='deployment_check_queued'||row.code==='deployment_dispatch_unknown';
const pushUnconfirmed=(row:JobStatus)=>row.state==='ready'&&row.code==='push_unconfirmed'&&!!row.run_id;
async function checkJobStatus(db:D1Database,row:JobStatus,repo:WriterRepository){
  const {id}=row;
  if(row.commit_sha){
    // Checks API 由工作流的短时令牌读取，状态查询只找独立部署检查的运行。
    if(row.code==='deployment_check_running'&&row.run_id){
      const run=await repo.run(row.run_id);
      if(!matchesWriterRun(run,id))writerFail(403,'invalid_run','运行不属于此发布任务');
      if(run.status==='completed')await db.prepare("UPDATE writer_jobs SET code='deployment_pending',version=version+1,updated_at=? WHERE id=? AND version=?").bind(Date.now(),id,row.version).run();
    }else if(deploymentQueued(row)){
      const run=await repo.findRun(id);
      // 新检查在领取前便失败时解除排队标记；派发应答不确定时不重复派发。
      if(run&&matchesWriterRun(run,id)&&BigInt(String(run.id))>BigInt(row.run_id??'0')&&run.status==='completed'){
        await db.prepare("UPDATE writer_jobs SET run_id=?,code='deployment_pending',version=version+1,updated_at=? WHERE id=? AND version=?").bind(String(run.id),Date.now(),id,row.version).run();
      }
    }
    return;
  }

  // 已有待确认标记表示之前见过运行结束；迟到的提交仍可找回，显式结束会重新核对运行。
  if(pushUnconfirmed(row)){
    const commit=await repo.findCommit(id);
    if(commit)await recoverPush(db,row,repo,commit);
    return;
  }
  const run=row.run_id?await repo.run(row.run_id):await repo.findRun(id);
  if(!run)return;
  if(!matchesWriterRun(run,id))writerFail(403,'invalid_run','运行不属于此发布任务');
  if(!row.run_id){
    const updated=await db.prepare(`UPDATE writer_jobs SET run_id=?,version=version+1,updated_at=? WHERE id=? AND version=? AND run_id IS NULL RETURNING ${statusColumns}`).bind(String(run.id),Date.now(),id,row.version).first<JobStatus>();
    if(!updated)return;
    row=updated;
  }
  if(run.status!=='completed')return;
  const commit=await repo.findCommit(id);
  if(commit)await recoverPush(db,row,repo,commit);
  else if(row.state==='ready')await db.prepare("UPDATE writer_jobs SET code='push_unconfirmed',version=version+1,updated_at=? WHERE id=? AND version=? AND state='ready'").bind(Date.now(),id,row.version).run();
  else if(['queued','dispatch_unknown','validating'].includes(row.state))await db.prepare("UPDATE writer_jobs SET state='failed',code=?,reserve_bytes=0,version=version+1,updated_at=? WHERE id=? AND version=? AND state IN ('queued','dispatch_unknown','validating') AND commit_sha IS NULL").bind(run.conclusion==='success'?'missing_receipt':'workflow_failed',Date.now(),id,row.version).run();
}

// 运行与提交历史各最多三页，多个上游请求超时或中断时，预约仍有有限的恢复时间。
const reconcileLeaseMs=4*60_000;
export async function readJobStatus(db:D1Database,owner:string,lookup:JobLookup,repo?:WriterRepository):Promise<WriterJob>{
  if(!repo)return publicJob(requireJob(await jobSelect(db,owner,lookup,summaryColumns).first<JobSummary>(),lookup));
  let row:JobStatus;
  try{
    row=requireJob(await jobSelect(db,owner,lookup,`${statusColumns},COALESCE(reconcile_after,0) AS reconcile_after`,true).first<JobStatus>(),lookup);
  }catch(error){
    // 新表按需登记，旧任务无需回填；部署仍连接旧库时继续查询已有任务。
    if(!/no such table:\s*writer_job_reconcile\b/i.test(String(error)))throw error;
    row=requireJob(await jobSelect(db,owner,lookup,statusColumns).first<JobStatus>(),lookup);
  }
  const {id}=row,now=Date.now();
  if(row.state==='cancelled'||row.state==='conflict'||(row.commit_sha&&!deploymentQueued(row)&&!(row.code==='deployment_check_running'&&row.run_id)))return publicJob(row);
  if(row.reconcile_after===undefined){
    await checkJobStatus(db,row,repo);
    return readJob(db,owner,id);
  }
  if(row.reconcile_after>now)return publicJob(row);
  const leaseUntil=now+reconcileLeaseMs;
  const claimed=await db.prepare(`INSERT INTO writer_job_reconcile(job_id,reconcile_after)
    SELECT id,? FROM writer_jobs WHERE id=? AND owner=? AND version=?
    ON CONFLICT(job_id) DO UPDATE SET reconcile_after=excluded.reconcile_after
    WHERE writer_job_reconcile.reconcile_after<=? RETURNING job_id`).bind(leaseUntil,id,owner,row.version,now).first();
  if(!claimed)return readJob(db,owner,id);

  let latest:JobSummary|null=null,limitedUntil=0;
  try{
    await checkJobStatus(db,row,repo);
  }catch(error){
    if(error instanceof WriterRepositoryRateLimit)limitedUntil=error.retryAt;
    throw error;
  }finally{
    const finished=Date.now();
    // 与运行器并发时保留更晚到的回执，冷却只写核对表。
    const [,status]=await db.batch<JobSummary>([
      db.prepare(`UPDATE writer_job_reconcile SET reconcile_after=MAX(?,CASE WHEN EXISTS(
        SELECT 1 FROM writer_jobs WHERE id=job_id AND state='ready' AND code='push_unconfirmed'
      ) THEN ? ELSE ? END) WHERE job_id=? AND reconcile_after=?`).bind(limitedUntil,finished+60000,finished+15000,id,leaseUntil),
      jobSelect(db,owner,{id},summaryColumns),
    ]);
    latest=status.results[0]??null;
  }
  return publicJob(requireJob(latest,{id}));
}
export async function closeUnconfirmedJob(db:D1Database,proof:WriterProof,id:string,repo:WriterRepository){
  await assertWriterProof(db,proof);
  const row=requireJob(await jobSelect(db,proof.owner,{id},statusColumns).first<JobStatus>(),{id});
  if(row.state!=='ready'||row.code!=='push_unconfirmed'||!row.run_id)writerFail(409,'job_cannot_close','请先查询任务，只有已停止运行的待确认任务可结束');
  const run=await repo.run(row.run_id);
  if(!matchesWriterRun(run,id)||run.status!=='completed')writerFail(409,'job_still_running','运行尚未结束，请继续查询；不能中断已获许可的推送');
  const commit=await repo.findCommit(id);
  if(commit){await recoverPush(db,row,repo,commit);return readJob(db,proof.owner,id);}
  // 作者明确解除互斥；这不是“没有推送”的证明。保留快照供后续核对和恢复。
  const changed=await db.prepare(`UPDATE writer_jobs SET state='failed',code='owner_closed_unconfirmed',reserve_bytes=0,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=? AND state='ready' AND code='push_unconfirmed' AND ${LIVE_ACCOUNT_SQL} RETURNING id`).bind(Date.now(),id,proof.owner,row.version,...proofValues(proof)).first();
  if(!changed){await assertWriterProof(db,proof);writerFail(409,'stale_event','任务已变化，请重新查询');}
  return readJob(db,proof.owner,id);
}
