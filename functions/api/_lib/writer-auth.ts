import { AccountError } from './visitor-core';
import { requireAccount, writeProof, type Account, type VisitorEnv } from './visitor-store';
import { WriterError,writerFail } from '../../../src/lib/writer/model';

export interface WriterEnv extends VisitorEnv {
  WRITER_LOCAL_DEV?: string;
  WRITER_GITHUB_TOKEN?: string;
  WRITER_RUNNER_SECRET?: string;
}
export type WriterProof = { owner:string; authVersion:number; tokenHash:string; values:unknown[] };

export function guardWriterOrigin(request: Request,env:WriterEnv,write=false) {
  const url=new URL(request.url);
  const local=env.WRITER_LOCAL_DEV==='1' && url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if (url.origin!=='https://northcedar.top' && !local) writerFail(403,'invalid_origin','请从本站写作台操作');
  const origin=request.headers.get('Origin');
  if (request.headers.get('Sec-Fetch-Site')==='cross-site' || (origin!==null && origin!==url.origin) || (write && (origin!==url.origin || request.headers.get('X-NC-Request')!=='1'))) writerFail(403,'invalid_origin','请从本站写作台操作');
}
export async function requireWriter(request:Request,env:WriterEnv,write=false):Promise<Account> {
  guardWriterOrigin(request,env,write);
  if (!env.OWNER_USER_ID) writerFail(503,'owner_missing','写作台尚未完成站主配置');
  const user=await requireAccount(request,env);
  if (user.id!==env.OWNER_USER_ID) writerFail(403,'owner_required','此处仅供站主使用');
  return user;
}
export async function writerProof(request:Request,user:Account):Promise<WriterProof> {
  const values=await writeProof(request,user);
  return {owner:user.id,authVersion:user.auth_version,tokenHash:values[2] as string,values};
}
export const writerHeaders = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'};
export const writerJson=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:writerHeaders});
export function writerError(error:unknown) {
  if (error instanceof WriterError) return writerJson({error:error.message,code:error.code},error.status);
  if (error instanceof AccountError) return writerJson({error:error.message,code:'account_error'},error.status);
  return writerJson({error:'写作服务暂时不可用，编辑内容请先保留后重试',code:'service_unavailable'},503);
}
