export class WriterApiError extends Error {
  status:number;code:string;
  constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}
}
export async function writerApi<T=any>(path:string,init:RequestInit={}):Promise<T>{
  if(!/^\/(?:session|content|drafts|assets|audio|publish)(?:\?|$)/.test(path)) throw new WriterApiError(400,'invalid_path','写作接口地址不对');
  const headers=new Headers(init.headers),write=init.method&&init.method!=='GET';
  if(write){headers.set('X-NC-Request','1');if(typeof init.body==='string') headers.set('Content-Type','application/json');}
  const response=await fetch('/api/writer'+path,{...init,headers,cache:'no-store',credentials:'same-origin',redirect:'error'});
  const data=await response.json().catch(()=>({error:'服务返回异常，请保留编辑内容后重试',code:'invalid_response'}));
  if(!response.ok) throw new WriterApiError(response.status,data.code??'request_failed',data.error??'操作未完成，请重试');
  return data as T;
}
