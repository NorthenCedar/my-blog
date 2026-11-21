import { requireWriter,writerProof,writerJson,writerError,type WriterEnv } from '../_lib/writer-auth';
import { createJob,readJob,readJobStatus,listJobs,cancelJob,setDispatchUnknown,closeUnconfirmedJob,requestDeploymentCheck } from '../_lib/writer-jobs';
import { createWriterRepository,WriterRepositoryRateLimit } from '../_lib/writer-repository';
import { readJsonBody } from '../_lib/public-write';
import { writerFail } from '../../../src/lib/writer/model';
function publishError(error:unknown){
  const response=writerError(error);
  if(error instanceof WriterRepositoryRateLimit)response.headers.set('Retry-After',String(Math.max(0,Math.ceil((error.retryAt-Date.now())/1000))));
  return response;
}
export const onRequestGet:PagesFunction<WriterEnv>=async(context)=>{
  const {request,env}=context;
  try{
    const user=await requireWriter(request,env),query=new URL(request.url).searchParams;
    const id=query.get('id'),requestId=query.get('requestId');
    if(!id&&requestId===null)return writerJson({jobs:await listJobs(env.COMMENTS_DB,user.id)});
    if(!id&&!/^[a-f0-9]{32}$/.test(requestId??''))writerFail(400,'invalid_id','发布请求标识不对');
    const repo=env.WRITER_GITHUB_TOKEN&&query.get('statusOnly')!=='1'?createWriterRepository(env.WRITER_GITHUB_TOKEN):undefined;
    const status=readJobStatus(env.COMMENTS_DB,user.id,id?{id}:{requestId:requestId!},repo);
    // 浏览器离页时，已发出的核对仍可收尾并释放共享预约。
    if(repo)context.waitUntil?.(status.catch(()=>{}));
    return writerJson({job:await status});
  }catch(error){return publishError(error);}
};
export const onRequestPost:PagesFunction<WriterEnv>=async({request,env})=>{
  try{
    const user=await requireWriter(request,env,true),p=await readJsonBody(request,4096),proof=await writerProof(request,user);
    if(p.action==='cancel') return writerJson({job:await cancelJob(env.COMMENTS_DB,proof,String(p.id))});
    if(p.action==='check_deployment')return writerJson({job:await requestDeploymentCheck(env.COMMENTS_DB,proof,String(p.id),createWriterRepository(env.WRITER_GITHUB_TOKEN??''))},202);
    if(p.action==='close_unconfirmed'){
      if(p.confirm!==true)writerFail(400,'confirmation_required','请先确认已检查仓库及运行记录');
      return writerJson({job:await closeUnconfirmedJob(env.COMMENTS_DB,proof,String(p.id),createWriterRepository(env.WRITER_GITHUB_TOKEN??''))});
    }
    if(p.action!=='publish') writerFail(400,'invalid_action','未知发布操作');
    if(!env.WRITER_GITHUB_TOKEN||!env.WRITER_RUNNER_SECRET||new TextEncoder().encode(env.WRITER_RUNNER_SECRET).length<32) writerFail(503,'publish_unavailable','发布尚未配置，草稿仍可保存和导出');
    const job=await createJob(env.COMMENTS_DB,proof,{draftId:String(p.draftId),revision:Number(p.revision),requestId:String(p.requestId)});
    // 先标记为结果待查；重复点击不能因上次 HTTP 应答丢失而重复派发。
    if(job.state==='queued'){
      const changed=await env.COMMENTS_DB.prepare("UPDATE writer_jobs SET state='dispatch_unknown',version=version+1 WHERE id=? AND state='queued' RETURNING id").bind(job.id).first();
      if(changed) try{await createWriterRepository(env.WRITER_GITHUB_TOKEN).dispatch(job.id);}catch{await setDispatchUnknown(env.COMMENTS_DB,job.id);}
    }
    return writerJson({job:await readJob(env.COMMENTS_DB,user.id,job.id)},202);
  }catch(error){return publishError(error);}
};
