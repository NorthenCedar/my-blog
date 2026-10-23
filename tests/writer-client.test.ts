import { afterEach,expect,it,vi } from 'vitest';
import { createSaveController } from '../src/scripts/writer/save';
import type { WriterValue,WriterSave } from '../src/lib/writer/model';
import { safeWriterLink,safeWriterImage } from '../src/scripts/writer/preview';
import { createRecoveryStore,recoveryKey } from '../src/scripts/writer/recovery';
import { writerApi } from '../src/scripts/writer/api';
const value=(body:string):WriterValue=>({fields:{title:'题'},body,assets:[]});
const draft={id:'a'.repeat(32),kind:'post' as const,key:'example',revision:1,base:null,publishedRevision:0,value:value('初始')};
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('迟到响应不能把新输入标成已保存，新的保存使用已确认版本',async()=>{
  vi.useFakeTimers();const first=deferred<any>(),second=deferred<any>(),inputs:WriterSave[]=[],states:string[]=[];
  const c=createSaveController({load:()=>draft,save:(input:WriterSave)=>{inputs.push(input);return inputs.length===1?first.promise:second.promise;},recovery:{put:async()=>{}},onState:(state:string)=>states.push(state)});
  await c.ready;c.edit(value('第一版'));await vi.advanceTimersByTimeAsync(2000);expect(inputs).toHaveLength(1);
  c.edit(value('第二版'));first.resolve({...draft,revision:2});await vi.advanceTimersByTimeAsync(0);expect(states.at(-1)).not.toBe('saved');
  await vi.advanceTimersByTimeAsync(2000);expect(inputs[1].expectedRevision).toBe(2);second.resolve({...draft,revision:3});await vi.advanceTimersByTimeAsync(0);
  expect(states.at(-1)).toBe('saved');expect(c.current().value.body).toBe('第二版');c.dispose();
});
it('成功响应丢失后复用原请求，确认后才发送后来输入',async()=>{
  const inputs:WriterSave[]=[],states:string[]=[];let attempts=0;
  const c=createSaveController({load:()=>draft,save:async(input:WriterSave)=>{inputs.push(structuredClone(input));if(++attempts===1) throw new TypeError('断网');return {...draft,revision:input.expectedRevision+1};},recovery:{put:async()=>{}},onState:(s:string)=>states.push(s)});
  await c.ready;c.edit(value('第一版'));await expect(c.saveNow()).rejects.toBeDefined();c.edit(value('第二版'));await c.saveNow();
  expect(inputs[0]).toEqual(inputs[1]);expect(inputs[2].value.body).toBe('第二版');expect(inputs[2].expectedRevision).toBe(2);expect(states.at(-1)).toBe('saved');c.dispose();
});
it.each([401,409])('%s 保留当前输入、停止自动重试，并可供导出',async(status)=>{
  vi.useFakeTimers();let calls=0;const states:string[]=[];
  const c=createSaveController({load:()=>draft,save:async()=>{calls++;throw {status,code:'test'};},recovery:{put:async()=>{}},onState:(s:string)=>states.push(s)});
  await c.ready;c.edit(value('不能丢'));await vi.advanceTimersByTimeAsync(2000);await vi.advanceTimersByTimeAsync(60000);
  expect(calls).toBe(1);expect(c.current().value.body).toBe('不能丢');expect(states.at(-1)).toBe(status===409?'conflict':'reauth');c.dispose();
});
it('持续输入 15 秒内尝试保存，本设备备份失败仍明确报告',async()=>{
  vi.useFakeTimers();let calls=0;const details:any[]=[];
  const c=createSaveController({load:()=>draft,save:async(input:WriterSave)=>{calls++;return {...draft,revision:input.expectedRevision+1};},recovery:{put:async()=>{throw Error('IDB 禁用');}},onState:(s:string,info:any)=>details.push({s,...info})});
  await c.ready;for(let n=0;n<16;n++){c.edit(value(String(n)));await vi.advanceTimersByTimeAsync(1000);}
  expect(calls).toBeGreaterThanOrEqual(1);expect(details.some(d=>d.backedUp===false)).toBe(true);c.dispose();
});
it('预览仅接受安全链接和私密受控图片地址',()=>{
  const origin='https://northcedar.top';
  expect(safeWriterLink('https://example.com/',origin)).toBe('https://example.com/');
  for(const url of ['javascript:alert(1)','java\nscript:alert(1)','data:text/html,x','file:///x']) expect(safeWriterLink(url,origin)).toBeNull();
  expect(safeWriterImage('/api/writer/assets?sha256='+'a'.repeat(64),origin)).toContain('/api/writer/assets');
  expect(safeWriterImage('https://tracker.example/image.png',origin)).toBeNull();expect(safeWriterImage('/api/writer/runner',origin)).toBeNull();
});
it('恢复副本按账户、草稿、发布基线隔离，IDB 不可用明确失败',async()=>{
  expect(recoveryKey('owner',draft)).not.toBe(recoveryKey('other',draft));
  expect(recoveryKey('owner',draft)).not.toBe(recoveryKey('owner',{...draft,base:{commit:'1'.repeat(40),blobSha:'2'.repeat(40),text:''}}));
  await expect(createRecoveryStore(undefined).get('test')).rejects.toThrow('本设备备份不可用');
});
it('浏览器 HTTP 不缓存草稿、不把 401 当成功，固定同源路径',async()=>{
  const requests:{url:unknown;init:RequestInit|undefined}[]=[];
  vi.stubGlobal('fetch',async(url:unknown,init?:RequestInit)=>{requests.push({url,init});return new Response(JSON.stringify({error:'请重新登录',code:'account_error'}),{status:401});});
  await expect(writerApi('/drafts',{method:'POST',body:JSON.stringify({action:'save'})})).rejects.toMatchObject({status:401});
  expect(requests[0].init?.cache).toBe('no-store');expect(new Headers(requests[0].init?.headers).get('X-NC-Request')).toBe('1');
  await expect(writerApi('https://other.example/')).rejects.toMatchObject({status:400});expect(requests).toHaveLength(1);
});
