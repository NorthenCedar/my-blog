import { requireWriter,writerProof,writerError,writerJson,writerHeaders,type WriterEnv } from '../_lib/writer-auth';
import { putAsset,readAsset,deleteAsset,listAssets,readUpload } from '../_lib/writer-assets';
export const onRequestGet:PagesFunction<WriterEnv>=async({request,env})=>{
  try{
    const user=await requireWriter(request,env),query=new URL(request.url).searchParams,sha=query.get('sha256');
    if(!sha) return writerJson(await listAssets(env.COMMENTS_DB,user.id,Number(query.get('page')??1)));
    const image=await readAsset(env.COMMENTS_DB,user.id,sha);
    return new Response(new Uint8Array(image.bytes),{headers:{...writerHeaders,'Content-Type':'image/webp','Content-Length':String(image.size),'Content-Disposition':'inline'}});
  }catch(error){return writerError(error);}
};
export const onRequestPost:PagesFunction<WriterEnv>=async({request,env})=>{
  try{const user=await requireWriter(request,env,true),bytes=await readUpload(request);return writerJson(await putAsset(env.COMMENTS_DB,await writerProof(request,user),bytes),201);}catch(error){return writerError(error);}
};
export const onRequestDelete:PagesFunction<WriterEnv>=async({request,env})=>{
  try{const user=await requireWriter(request,env,true);await deleteAsset(env.COMMENTS_DB,await writerProof(request,user),new URL(request.url).searchParams.get('sha256')??'');return writerJson({ok:true});}catch(error){return writerError(error);}
};
