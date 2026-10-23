import { requireWriter,writerJson,writerError,type WriterEnv } from '../_lib/writer-auth';

export const onRequestGet:PagesFunction<WriterEnv>=async({request,env})=>{
  try {
    const user=await requireWriter(request,env);
    return writerJson({user:{id:user.id,nickname:user.nickname},capabilities:{drafts:true,publish:Boolean(env.WRITER_GITHUB_TOKEN&&env.WRITER_RUNNER_SECRET)}});
  } catch(error) { return writerError(error); }
};
