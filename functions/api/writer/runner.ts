import { guardWriterOrigin,writerJson,writerHeaders,writerError,type WriterEnv } from '../_lib/writer-auth';
import { jobRow,claimJob,authorizePush,recordJob,recordDeployment,checkLease,publishedBase,type JobEvent } from '../_lib/writer-jobs';
import { createWriterRepository,matchesWriterRun } from '../_lib/writer-repository';
import { readAsset } from '../_lib/writer-assets';
import { readTalks } from '../../../src/lib/writer/content';
import { writerFail,writerId } from '../../../src/lib/writer/model';
import { readJsonBody } from '../_lib/public-write';
import { digest } from '../_lib/visitor-core';
export async function requireRunner(request:Request,env:WriterEnv){
  guardWriterOrigin(request,env);
  const expected=env.WRITER_RUNNER_SECRET??'',received=request.headers.get('Authorization')??'';
  if(new TextEncoder().encode(expected).length<32||received.length>512) writerFail(503,'runner_unavailable','发布运行尚未配置');
  const [a,b]=await Promise.all([digest('Bearer '+expected),digest(received)]);let diff=0;for(let n=0;n<a.length;n++) diff|=a.charCodeAt(n)^b.charCodeAt(n);
  if(diff) writerFail(401,'runner_required','运行认证失败');
}
export const onRequestPost:PagesFunction<WriterEnv>=async({request,env})=>{
  try{
    await requireRunner(request,env);
    const p=await readJsonBody(request,8192),id=writerId(p.jobId),runId=String(p.runId);
    const repo=createWriterRepository(env.WRITER_GITHUB_TOKEN??'');
    const verifyRun=async()=>{const run=await repo.run(runId);if(!matchesWriterRun(run,id)||run.status!=='in_progress')writerFail(403,'invalid_run','运行不属于此发布任务或已经结束');};
    if(p.action==='probe'&&id==='0'.repeat(32)){
      // 认证仍在外层；只读诊断用依赖失败响应保留应用错误，避免混同网关 502。
      try{
        await verifyRun();
        if(!env.OWNER_USER_ID)writerFail(503,'owner_missing','尚未完成站主配置');
        const schema=await env.COMMENTS_DB.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('writer_assets','writer_draft_assets','writer_drafts','writer_job_assets','writer_jobs','writer_requests','writer_save_receipts','writer_usage')").first<{n:number}>();
        if(schema?.n!==8)writerFail(503,'writer_schema_missing','写作数据库尚未初始化');
        return writerJson({ok:true,commit:await repo.head()});
      }catch(error){const response=writerError(error);return writerJson({...await response.json() as object,upstreamStatus:response.status},424);}
    }
    await verifyRun();
    const row=await jobRow(env.COMMENTS_DB,id);
    if(!env.OWNER_USER_ID||row.owner!==env.OWNER_USER_ID) writerFail(404,'job_missing','发布任务不存在');
    if(p.action==='claim') return writerJson(await claimJob(env.COMMENTS_DB,id,runId));
    const lease=String(p.lease);
    if(p.action==='deployment')return writerJson({job:await recordDeployment(env.COMMENTS_DB,id,lease,runId,String(p.commit),String(p.state))});
    if(p.action==='snapshot'){
      const current=await checkLease(env.COMMENTS_DB,id,lease,runId);if(current.state!=='validating')writerFail(409,'job_ended','任务已结束或已取得许可');
      return writerJson({snapshot:JSON.parse(current.snapshot_json)});
    }
    if(p.action==='authorize') return writerJson(await authorizePush(env.COMMENTS_DB,id,lease,runId));
    if(p.action==='asset'){
      const current=await checkLease(env.COMMENTS_DB,id,lease,runId);
      if(!['validating','ready'].includes(current.state)) writerFail(409,'job_ended','任务已结束');
      const ref=await env.COMMENTS_DB.prepare('SELECT sha256 FROM writer_job_assets WHERE job_id=? AND owner=? AND sha256=?').bind(id,row.owner,String(p.sha256)).first();
      if(!ref) writerFail(404,'asset_missing','配图不属于此快照');
      const image=await readAsset(env.COMMENTS_DB,row.owner,String(p.sha256));
      return new Response(new Uint8Array(image.bytes),{headers:{...writerHeaders,'Content-Type':'image/webp'}});
    }
    if(p.action==='record'){
      const event={state:p.state,runId,commit:p.commit,code:p.code} as JobEvent;
      if(event.state==='pushed'){
        await checkLease(env.COMMENTS_DB,id,lease,runId);
        event.publishedBase=await publishedBase(repo,row,String(event.commit));
      }
      return writerJson({job:await recordJob(env.COMMENTS_DB,id,lease,event)});
    }
    writerFail(400,'invalid_action','未知运行操作');
  }catch(error){return writerError(error);}
};
