import { requireWriter,writerProof,writerError,writerJson,writerHeaders,type WriterEnv } from '../_lib/writer-auth';
import { putAudio,readAudio,deleteAudio,listAudio,WRITER_AUDIO_MAX } from '../_lib/writer-audio';
import { writerFail } from '../../../src/lib/writer/model';
/** 与配图同构的三条路由：列表 / 取字节 / 上传 / 删除。 */
export const onRequestGet:PagesFunction<WriterEnv>=async({request,env})=>{
  try{
    const user=await requireWriter(request,env),query=new URL(request.url).searchParams,sha=query.get('sha256');
    if(!sha) return writerJson(await listAudio(env.COMMENTS_DB,user.id));
    const clip=await readAudio(env.COMMENTS_DB,user.id,sha);
    return new Response(new Uint8Array(clip.bytes),{headers:{...writerHeaders,'Content-Type':clip.ext==='wav'?'audio/wav':'audio/mpeg','Content-Length':String(clip.size),'Content-Disposition':'inline'}});
  }catch(error){return writerError(error);}
};
export const onRequestPost:PagesFunction<WriterEnv>=async({request,env})=>{
  try{
    const user=await requireWriter(request,env,true);
    const length=Number(request.headers.get('Content-Length')??'0');
    if(!Number.isFinite(length)||length<=0||length>WRITER_AUDIO_MAX) writerFail(413,'content_too_large','单条语音不能超过 1.5 MB');
    const bytes=new Uint8Array(await request.arrayBuffer());
    return writerJson(await putAudio(env.COMMENTS_DB,await writerProof(request,user),bytes),201);
  }catch(error){return writerError(error);}
};
export const onRequestDelete:PagesFunction<WriterEnv>=async({request,env})=>{
  try{
    const user=await requireWriter(request,env,true);
    await deleteAudio(env.COMMENTS_DB,await writerProof(request,user),new URL(request.url).searchParams.get('sha256')??'');
    return writerJson({ok:true});
  }catch(error){return writerError(error);}
};