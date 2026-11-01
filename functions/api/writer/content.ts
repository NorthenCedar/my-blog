import { requireWriter,writerJson,writerHeaders,writerError,type WriterEnv } from '../_lib/writer-auth';
import { createWriterRepository } from '../_lib/writer-repository';
import { readPost,readTalks } from '../../../src/lib/writer/content';
import { TAGS } from '../../../src/tag-registry';
import { writerFail } from '../../../src/lib/writer/model';
export const onRequestGet:PagesFunction<WriterEnv>=async({request,env})=>{
  try{
    await requireWriter(request,env);
    const query=new URL(request.url).searchParams;
    if(query.get('mode')==='tags') return writerJson({tags:TAGS});
    const repo=createWriterRepository(env.WRITER_GITHUB_TOKEN??''),commit=query.get('commit')??await repo.head();
    const image=query.get('image');
    if(image){const asset=await repo.readImage(commit,image),ext=image.split('.').pop();return new Response(asset.bytes,{headers:{...writerHeaders,'Content-Type':ext==='jpg'||ext==='jpeg'?'image/jpeg':`image/${ext}`}});}
    const kind=query.get('kind'),page=Math.max(1,Math.min(100,Number(query.get('page'))||1));
    if(kind==='gallery'){const items=await repo.listGalleries(commit);return writerJson({commit,items:items.slice((page-1)*20,page*20),more:items.length>page*20});}
    if(kind==='post'){const items=await repo.listPosts(commit);return writerJson({commit,items:items.slice((page-1)*20,page*20),more:items.length>page*20});}
    if(kind==='project'){const items=await repo.listProjects(commit);return writerJson({commit,items:items.slice((page-1)*20,page*20),more:items.length>page*20});}
    if(kind==='forge'){const source=await repo.readForge(commit);return writerJson({commit,items:[{key:'forge',title:String(readPost(source.text).fields.title??'造物台页面文案')}],more:false});}
    if(kind==='talk'){const source=await repo.readTalks(commit),items=readTalks(source.text).map(r=>({key:r.key,title:r.value.body.slice(0,100),date:r.value.fields.date}));return writerJson({commit,items:items.slice((page-1)*20,page*20),more:items.length>page*20});}
    writerFail(400,'invalid_kind','请选择要编辑的内容类型');
  }catch(error){return writerError(error);}
};
