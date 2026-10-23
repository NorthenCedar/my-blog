import type { WriterProof } from './writer-auth';
import { createDraft } from './writer-drafts';
import { readPost,readTalks } from '../../../src/lib/writer/content';
import { validateTarget,writerId,writerFail,WriterError,type WriterKind } from '../../../src/lib/writer/model';
const root='https://api.github.com/repos/NorthenCedar/personal';
export const WRITER_REPOSITORY='NorthenCedar/personal';
export const WRITER_WORKFLOW='.github/workflows/cloud-writer.yml';
const revision=(sha:string)=>/^[a-f0-9]{40}$/.test(sha)?sha:writerFail(400,'invalid_commit','内容版本格式不对');
const runNumber=(id:string)=>/^\d{1,20}$/.test(id)?id:writerFail(400,'invalid_run','运行标识不对');
export type WriterRun={id:number|string;display_title:string;head_branch:string;event:string;path:string;status:string;conclusion:string|null;repository:{full_name:string};html_url?:string;head_sha?:string};
export function matchesWriterRun(run:WriterRun,jobId?:string){return run.repository?.full_name===WRITER_REPOSITORY&&run.event==='workflow_dispatch'&&run.head_branch==='main'&&run.path===WRITER_WORKFLOW&&(!jobId||run.display_title===`云端写作 ${jobId}`);}
export function createWriterRepository(token:string,fetchImpl:typeof fetch=fetch){
  async function request(path:string,body?:unknown,missing=false):Promise<any>{
    if(!token) writerFail(503,'repository_unavailable','仓库读取和发布尚未配置，仍可保存私密草稿');
    for(let attempt=0;attempt<3;attempt++){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
      try{
        // workerd 只实现 follow/manual；manual 将 3xx 留给下方失败检查，不外传凭据。
        const response=await fetchImpl(root+path,{method:body===undefined?'GET':'POST',redirect:'manual',signal:controller.signal,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'northcedar-cloud-writer',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
        if(body===undefined&&(response.status===429||response.status>=500)&&attempt<2){await response.body?.cancel();continue;}
        if(missing&&response.status===404){await response.body?.cancel();return null;}
        if(!response.ok){await response.body?.cancel();writerFail(502,'repository_http_'+response.status,'仓库服务暂时不可用，请检查配置或稍后重试');}
        if(response.status===204) return null;
        const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
        if(!reader) writerFail(502,'repository_error','仓库返回为空');
        try{for(;;){const {done,value}=await reader.read();if(done) break;size+=value.length;if(size>2*1024*1024){await reader.cancel();writerFail(502,'repository_response_too_large','仓库返回过大，请在本地处理');}chunks.push(value);}}finally{reader.releaseLock();}
        const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
        try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{writerFail(502,'repository_error','仓库返回格式异常');}
      }catch(error){if(error instanceof WriterError) throw error;writerFail(502,body===undefined?'repository_error':'dispatch_unknown',body===undefined?'连接仓库失败，请稍后重试':'运行触发结果未确定，正在查询已有任务');}
      finally{clearTimeout(timer);}
    }
    return writerFail(502,'repository_error','仓库服务暂时不可用');
  }
  async function file(commit:string,path:string){
    revision(commit);
    const result=await request(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${commit}`,undefined,true);
    if(result===null) writerFail(404,'content_missing','目标内容不存在');
    if(result.type!=='file'||result.encoding!=='base64'||typeof result.content!=='string'||result.submodule_git_url) writerFail(400,'unsupported_file','目标不是可编辑的普通文件');
    revision(result.sha);
    if(!/^[A-Za-z0-9+/=\r\n]*$/.test(result.content)) writerFail(502,'repository_error','仓库文件编码异常');
    const raw=atob(result.content.replace(/[\r\n]/g,'')),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if(bytes.length!==result.size||bytes.length>1024*1024) writerFail(413,'content_too_large','文件过大或内容不完整');
    return {sha:result.sha as string,bytes};
  }
  const textFile=async(commit:string,path:string)=>{const data=await file(commit,path);try{return {...data,text:new TextDecoder('utf-8',{fatal:true}).decode(data.bytes)};}catch{return writerFail(400,'invalid_encoding','文本编码不是 UTF-8，请在本地处理');}};
  return {
    async head():Promise<string>{const result=await request('/git/ref/heads/main');return revision(result?.object?.sha??'');},
    async listPosts(commit:string){revision(commit);const data=await request(`/contents/content/posts?ref=${commit}`);if(!Array.isArray(data)) writerFail(502,'repository_error','文章列表读取失败');return data.filter(d=>d.type==='dir'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.name)).map(d=>({key:d.name as string}));},
    async readPost(commit:string,key:string){validateTarget('post',key);return textFile(commit,`content/posts/${key}/index.md`);},
    async readTalks(commit:string){return textFile(commit,'content/pages/talks.md');},
    async readImage(commit:string,path:string){
      if(!/^(?:content\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\/|src\/assets\/talks\/)[\p{L}\p{N}_ .-]+\.(?:png|jpe?g|webp|avif)$/u.test(path)||path.includes('..')) writerFail(400,'invalid_path','配图路径不在内容范围内');
      return file(commit,path);
    },
    async dispatch(jobId:string){writerId(jobId);await request('/actions/workflows/cloud-writer.yml/dispatches',{ref:'main',inputs:{jobId}});},
    async findRun(jobId:string):Promise<WriterRun|null>{
      writerId(jobId);
      for(let page=1;page<=3;page++){
        const result=await request(`/actions/workflows/cloud-writer.yml/runs?branch=main&event=workflow_dispatch&per_page=100&page=${page}`),runs:WriterRun[]=result.workflow_runs??[];
        const run=runs.find(r=>matchesWriterRun(r,jobId));if(run) return run;if(runs.length<100) break;
      }return null;
    },
    async run(id:string):Promise<WriterRun>{const run=await request(`/actions/runs/${runNumber(id)}`);if(!matchesWriterRun(run)) writerFail(403,'invalid_run','运行不属于本站固定写作流程');return run;},
    async commitReceipt(commit:string,jobId:string){
      revision(commit);writerId(jobId);
      const [data,comparison]=await Promise.all([request(`/commits/${commit}`),request(`/compare/${commit}...main`)]);
      if(!String(data.commit?.message??'').split('\n').includes(`Writer-Job: ${jobId}`)||!['ahead','identical'].includes(comparison.status)) writerFail(409,'push_unconfirmed','尚未在 main 确认这次推送，请稍后查询');
      return {commit};
    },
    async findCommit(jobId:string):Promise<string|null>{
      writerId(jobId);
      for(let page=1;page<=3;page++){const commits=await request(`/commits?sha=main&per_page=100&page=${page}`);if(!Array.isArray(commits)) writerFail(502,'repository_error','提交记录读取失败');const match=commits.find(c=>String(c.commit?.message??'').split('\n').includes(`Writer-Job: ${jobId}`));if(match)return revision(match.sha);if(commits.length<100)break;}return null;
    },
  };
}
export type WriterRepository=ReturnType<typeof createWriterRepository>;
export async function importPublished(repo:WriterRepository,db:D1Database,proof:WriterProof,target:{kind:WriterKind;key:string}){
  const {kind,key}=validateTarget(target.kind,target.key),commit=await repo.head(),source=kind==='post'?await repo.readPost(commit,key):await repo.readTalks(commit);
  const item=kind==='talk'?readTalks(source.text).find(t=>t.key===key):null;
  if(kind==='talk'&&!item) writerFail(404,'content_missing','这条说说不存在');
  return createDraft(db,proof,{kind,key,base:{commit,blobSha:source.sha,text:source.text,...(item?{itemHash:item.itemHash}:{})},value:item?.value??readPost(source.text)});
}
