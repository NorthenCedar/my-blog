import { requireWriter,writerProof,writerJson,writerError,type WriterEnv } from '../_lib/writer-auth';
import { createJob,readJob,listJobs,cancelJob,setDispatchUnknown,jobRow,reconcileJob,closeUnconfirmedJob } from '../_lib/writer-jobs';
import { createWriterRepository } from '../_lib/writer-repository';
import { readJsonBody } from '../_lib/public-write';
import { writerFail } from '../../../src/lib/writer/model';
export const onRequestGet:PagesFunction<WriterEnv>=async({request,env})=>{
  try{
    const user=await requireWriter(request,env),query=new URL(request.url).searchParams;
    let id=query.get('id');
    if(!id&&query.has('requestId')){
      const requestId=query.get('requestId')??'';if(!/^[a-f0-9]{32}$/.test(requestId))writerFail(400,'invalid_id','发布请求标识不对');
      const row=await env.COMMENTS_DB.prepare('SELECT id FROM writer_jobs WHERE owner=? AND request_id=?').bind(user.id,requestId).first<{id:string}>();
      if(!row)writerFail(404,'job_missing','尚未找到此发布请求，请检查后重新确认');id=row.id;
    }
    if(!id)return writerJson({jobs:await listJobs(env.COMMENTS_DB,user.id)});
    let job=await readJob(env.COMMENTS_DB,user.id,id);
    if(env.WRITER_GITHUB_TOKEN)job=await reconcileJob(env.COMMENTS_DB,id,createWriterRepository(env.WRITER_GITHUB_TOKEN));
    return writerJson({job});
  }catch(error){return writerError(error);}
};
export const onRequestPost:PagesFunction<WriterEnv>=async({request,env})=>{
  try{
    const user=await requireWriter(request,env,true),p=await readJsonBody(request,4096),proof=await writerProof(request,user);
    if(p.action==='cancel') return writerJson({job:await cancelJob(env.COMMENTS_DB,proof,String(p.id))});
    if(p.action==='close_unconfirmed'){
      if(p.confirm!==true)writerFail(400,'confirmation_required','请先确认已检查仓库及运行记录');
      return writerJson({job:await closeUnconfirmedJob(env.COMMENTS_DB,proof,String(p.id),createWriterRepository(env.WRITER_GITHUB_TOKEN??''))});
    }
    if(p.action!=='publish') writerFail(400,'invalid_action','未知发布操作');
    if(!env.WRITER_GITHUB_TOKEN||!env.WRITER_RUNNER_SECRET||new TextEncoder().encode(env.WRITER_RUNNER_SECRET).length<32) writerFail(503,'publish_unavailable','发布尚未配置，草稿仍可保存和导出');
    const job=await createJob(env.COMMENTS_DB,proof,{draftId:String(p.draftId),revision:Number(p.revision),requestId:String(p.requestId)}),row=await jobRow(env.COMMENTS_DB,job.id);
    // 先标记为结果待查；重复点击不能因上次 HTTP 应答丢失而重复派发。
    if(row.state==='queued'){
      const changed=await env.COMMENTS_DB.prepare("UPDATE writer_jobs SET state='dispatch_unknown',version=version+1 WHERE id=? AND state='queued' RETURNING id").bind(job.id).first();
      if(changed) try{await createWriterRepository(env.WRITER_GITHUB_TOKEN).dispatch(job.id);}catch{await setDispatchUnknown(env.COMMENTS_DB,job.id);}
    }
    return writerJson({job:await readJob(env.COMMENTS_DB,user.id,job.id)},202);
  }catch(error){return writerError(error);}
};
