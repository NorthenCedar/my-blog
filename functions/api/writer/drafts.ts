import { requireWriter,writerProof,writerJson,writerError,type WriterEnv } from '../_lib/writer-auth';
import { createDraft,saveDraft,readDraft,listDrafts,deleteDraft,exportDraft } from '../_lib/writer-drafts';
import { readJsonBody } from '../_lib/public-write';
import { randomToken } from '../_lib/visitor-core';
import { createWriterRepository,importPublished } from '../_lib/writer-repository';
import { writerFail,validateTarget,type WriterSave } from '../../../src/lib/writer/model';

export const onRequestGet:PagesFunction<WriterEnv>=async({request,env})=>{
  try {
    const user=await requireWriter(request,env),url=new URL(request.url),id=url.searchParams.get('id');
    if(!id) return writerJson({drafts:await listDrafts(env.COMMENTS_DB,user.id)});
    if(url.searchParams.get('export')==='1') {
      const result=writerJson(await exportDraft(env.COMMENTS_DB,user.id,id));
      result.headers.set('Content-Disposition',`attachment; filename="writer-${id}.json"`);return result;
    }
    return writerJson({draft:await readDraft(env.COMMENTS_DB,user.id,id)});
  } catch(error) {return writerError(error);}
};
export const onRequestPost:PagesFunction<WriterEnv>=async({request,env})=>{
  try {
    const user=await requireWriter(request,env,true),p=await readJsonBody(request,300*1024),proof=await writerProof(request,user);
    if(p.action==='create') {
      const {kind,key}=validateTarget(p.kind,p.kind==='talk'?`talk-${randomToken(16)}`:p.key);
      if(kind==='forge')writerFail(400,'import_required','请从页面文案列表导入现有造物台');
      return writerJson({draft:await createDraft(env.COMMENTS_DB,proof,{kind,key,base:null,value:p.value as never})},201);
    }
    if(p.action==='import') return writerJson({draft:await importPublished(createWriterRepository(env.WRITER_GITHUB_TOKEN??''),env.COMMENTS_DB,proof,p as never)},201);
    if(p.action==='copy') {
      const source=await readDraft(env.COMMENTS_DB,user.id,String(p.id));
      if(p.baseCommit!==(source.base?.commit??null))writerFail(409,'base_changed','发布基线已变化，请先下载当前输入，再重新打开草稿对照');
      return writerJson({draft:await createDraft(env.COMMENTS_DB,proof,{kind:source.kind,key:source.key,base:source.base,value:p.value as never})},201);
    }
    if(p.action==='save') return writerJson({draft:await saveDraft(env.COMMENTS_DB,proof,p as unknown as WriterSave)});
    if(p.action==='delete') {await deleteDraft(env.COMMENTS_DB,proof,String(p.id),Number(p.revision));return writerJson({ok:true});}
    writerFail(400,'invalid_action','未知草稿操作');
  } catch(error) {return writerError(error);}
};
