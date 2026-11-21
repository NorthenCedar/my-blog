/** @vitest-environment happy-dom */
import { afterEach,expect,it,vi } from 'vitest';
import { writerApi,WriterApiError } from '../src/scripts/writer/api';
import { jobStorageKey,mountPublish } from '../src/scripts/writer/publish';
import type { WriterDraft,WriterJob } from '../src/lib/writer/model';

const owner='a'.repeat(32),id='b'.repeat(32),requestId='c'.repeat(32),anotherId='d'.repeat(32);
const draft:WriterDraft={id:'e'.repeat(32),kind:'post',key:'example',revision:1,base:null,publishedRevision:0,value:{fields:{title:'标题'},body:'准备发布',assets:[],audios:[]}};
const running:WriterJob={id,draftId:draft.id,revision:1,state:'validating',runId:'1001',commit:null,code:null};
const published:WriterJob={...running,commit:'3'.repeat(40),state:'deployed'};
function deferred<T>(){let resolve!:(value:T)=>void;const result=new Promise<T>(done=>{resolve=done;});return {result,resolve};}
function setup(api:typeof writerApi,onPublished?: (job:WriterJob)=>Promise<void>){
  const root=document.createElement('section');document.body.append(root);
  const publication=mountPublish(root,api,{owner,onPublished});
  return {root,publication};
}
function visibility(hidden:boolean){
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
  document.dispatchEvent(new Event('visibilitychange'));
}
afterEach(()=>{
  Reflect.deleteProperty(document,'hidden');document.body.replaceChildren();localStorage.clear();vi.useRealTimers();vi.unstubAllGlobals();
});

it('后台中止在途读取，忽略迟到响应，返回前台只查询原任务一次',async()=>{
  vi.useFakeTimers();visibility(false);
  const response=deferred<{job:WriterJob}>(),api=vi.fn(async(_path:string,_init?:RequestInit)=>response.result),onPublished=vi.fn(async()=>{});
  const {root,publication}=setup(api as typeof writerApi,onPublished);
  try{
    const opening=publication.openJob(id);
    visibility(true);
    response.resolve({job:published});await opening;
    expect(api.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(root.textContent).not.toContain('已上线');expect(onPublished).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60000);expect(api).toHaveBeenCalledTimes(1);
    visibility(false);await vi.advanceTimersByTimeAsync(0);
    expect(api.mock.calls.map(([path])=>path)).toEqual([`/publish?id=${id}`,`/publish?id=${id}`]);
    expect(root.textContent).toContain('已上线');expect(onPublished).toHaveBeenCalledTimes(1);
    visibility(true);visibility(false);await vi.advanceTimersByTimeAsync(60000);
    expect(api).toHaveBeenCalledTimes(2);
  }finally{publication.dispose();}
});

it('在途状态不能覆盖换选的任务，离页暂停后可从 BFCache 恢复',async()=>{
  vi.useFakeTimers();visibility(false);
  const response=deferred<{job:WriterJob}>(),other={...running,id:anotherId};
  const api=vi.fn(async(path:string,_init?:RequestInit)=>path.endsWith(id)?response.result:{job:other});
  const {root,publication}=setup(api as typeof writerApi);
  try{
    const opening=publication.openJob(id);await publication.openJob(anotherId);
    response.resolve({job:published});await opening;
    expect(root.textContent).toContain('完整校验中');expect(root.textContent).not.toContain('已上线');
    expect(api.mock.calls[0][1]?.signal?.aborted).toBe(true);
    window.dispatchEvent(Object.assign(new Event('pagehide'),{persisted:true}));
    await vi.advanceTimersByTimeAsync(60000);expect(api).toHaveBeenCalledTimes(2);
    window.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true}));await vi.advanceTimersByTimeAsync(0);
    expect(api.mock.calls.map(([path])=>path)).toEqual([`/publish?id=${id}`,`/publish?id=${anotherId}`,`/publish?id=${anotherId}`]);
  }finally{publication.dispose();}
});

it('按照旧请求记录恢复，限流后重查同一回执，确认另一份草稿时不再查询旧任务',async()=>{
  vi.useFakeTimers();visibility(false);
  localStorage.setItem(jobStorageKey(owner),JSON.stringify({requestId,draftId:draft.id,revision:1}));
  const api=vi.fn(async(_path:string,_init?:RequestInit)=>({job:running})).mockRejectedValueOnce(new WriterApiError(429,'repository_rate_limited','暂时受限'));
  const {root,publication}=setup(api as typeof writerApi);
  try{
    await publication.restore();expect(root.textContent).toContain('暂时受限');
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.mock.calls.map(([path])=>path)).toEqual([`/publish?requestId=${requestId}`,`/publish?requestId=${requestId}`]);
    expect(JSON.parse(localStorage.getItem(jobStorageKey(owner))??'null').id).toBe(id);
    await publication.open(draft);visibility(true);visibility(false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(api).toHaveBeenCalledTimes(2);expect(root.textContent).toContain('请确认本次内容');
  }finally{publication.dispose();}
});

it('确认发布应答丢失后使用同一个回执找回任务，只派发一次',async()=>{
  vi.useFakeTimers();visibility(false);
  const api=vi.fn(async(_path:string,_init?:RequestInit)=>({job:running}))
    .mockRejectedValueOnce(new WriterApiError(404,'job_missing','未找到此发布请求'))
    .mockRejectedValueOnce(new TypeError('断线，未收到确认回执'));
  const {root,publication}=setup(api as typeof writerApi);
  try{
    await publication.open(draft);
    [...root.querySelectorAll('button')].find(button=>button.textContent==='确认发布')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.textContent).toContain('发布尚未确认');
    const sent=JSON.parse(String(api.mock.calls[1][1]?.body));
    expect(sent).toMatchObject({action:'publish',draftId:draft.id,revision:1});
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.mock.calls.map(([path])=>path)).toEqual([`/publish?requestId=${sent.requestId}`,'/publish',`/publish?requestId=${sent.requestId}`]);
    expect(api.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1);
    expect(root.textContent).toContain('完整校验中');
  }finally{publication.dispose();}
});

it('收到 HTTP Retry-After 后继续查实时状态，到时恢复仓库核对',async()=>{
  vi.useFakeTimers();visibility(false);
  const transport=vi.fn(async(_url:unknown)=>Response.json({job:running})).mockResolvedValueOnce(
    Response.json({code:'repository_rate_limited',error:'查询暂时受限'},{status:429,headers:{'Retry-After':'5'}}),
  );
  vi.stubGlobal('fetch',transport);
  const {root,publication}=setup(writerApi);
  try{
    await publication.openJob(id);expect(root.textContent).toContain('查询暂时受限');
    await vi.advanceTimersByTimeAsync(2000);
    expect(transport.mock.calls[1][0]).toBe(`/api/writer/publish?id=${id}&statusOnly=1`);
    expect(root.textContent).toContain('完整校验中');
    await vi.advanceTimersByTimeAsync(4000);
    expect(transport.mock.calls[2][0]).toBe(`/api/writer/publish?id=${id}`);
  }finally{publication.dispose();}
});

it('切到后台保留已确认的发布请求，等唤醒再更新显示',async()=>{
  vi.useFakeTimers();visibility(false);
  const response=deferred<{job:WriterJob}>(),onPublished=vi.fn(async()=>{});
  const api=vi.fn(async(_path:string,init?:RequestInit)=>init?.method==='POST'?response.result:{job:published})
    .mockRejectedValueOnce(new WriterApiError(404,'job_missing','未找到此发布请求'));
  const {root,publication}=setup(api as typeof writerApi,onPublished);
  try{
    await publication.open(draft);
    [...root.querySelectorAll('button')].find(button=>button.textContent==='确认发布')!.click();
    await vi.advanceTimersByTimeAsync(0);expect(api.mock.calls[1][1]?.method).toBe('POST');
    visibility(true);response.resolve({job:published});await vi.advanceTimersByTimeAsync(60000);
    expect(api).toHaveBeenCalledTimes(2);expect(api.mock.calls[1][1]?.signal).toBeUndefined();
    expect(onPublished).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(jobStorageKey(owner))??'null').id).toBe(id);
    visibility(false);await vi.advanceTimersByTimeAsync(0);
    expect(api.mock.calls[2][0]).toBe(`/publish?id=${id}`);expect(onPublished).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('已上线');
  }finally{publication.dispose();}
});
