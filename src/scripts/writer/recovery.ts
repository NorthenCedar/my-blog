import type { WriterDraft } from '../../lib/writer/model';
import type { RecoveryCopy } from './save';
export type RecoveryRecord=RecoveryCopy&{key:string;user:string;draftId:string;pendingImages?:{id:string;blob:Blob;alt:string;cover?:boolean}[]};
export const recoveryKey=(user:string,draft:WriterDraft)=>`${user}/${draft.id}/${draft.base?.commit??'new'}`;
export function createRecoveryStore(factory:IDBFactory|undefined){
  let opening:Promise<IDBDatabase>|undefined;
  function open(){
    if(!factory) return Promise.reject(new Error('本设备备份不可用，请及时保存或下载'));
    return opening??=new Promise<IDBDatabase>((resolve,reject)=>{
      const request=factory.open('northcedar-writer-recovery',1),timer=setTimeout(()=>reject(Error('本设备备份被其他页面占用，请关闭旧页面后重试')),4000);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('copies')){const store=request.result.createObjectStore('copies',{keyPath:'key'});store.createIndex('user','user');}};
      request.onsuccess=()=>{clearTimeout(timer);request.result.onversionchange=()=>request.result.close();resolve(request.result);};
      request.onerror=()=>{clearTimeout(timer);reject(Error('本设备备份无法打开，请及时下载'));};
    });
  }
  async function transact<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore,done:(value:T)=>void)=>void):Promise<T>{
    const db=await open();return new Promise<T>((resolve,reject)=>{const tx=db.transaction('copies',mode);let result:T;action(tx.objectStore('copies'),value=>{result=value;});tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('本设备备份失败，请及时下载或复制正文'));});
  }
  return {
    get:(key:string)=>transact<RecoveryRecord|undefined>('readonly',(s,done)=>{const r=s.get(key);r.onsuccess=()=>done(r.result);}),
    findDraft:(user:string,draftId:string)=>transact<RecoveryRecord[]>('readonly',(s,done)=>{
      const found:RecoveryRecord[]=[],request=s.index('user').openCursor(IDBKeyRange.only(user));
      request.onsuccess=()=>{const cursor=request.result;if(!cursor){done(found.sort((a,b)=>b.updatedAt-a.updatedAt));return;}const copy=cursor.value as RecoveryRecord;if(copy.draftId===draftId&&copy.key.startsWith(`${user}/${draftId}/`))found.push(copy);cursor.continue();};
    }),
    put:(record:RecoveryRecord)=>transact<void>('readwrite',(s,done)=>{s.put(record);done();}),
    remove:(key:string)=>transact<void>('readwrite',(s,done)=>{s.delete(key);done();}),
    clearUser:(user:string)=>transact<void>('readwrite',(s,done)=>{const r=s.index('user').openCursor(IDBKeyRange.only(user));r.onsuccess=()=>{const c=r.result;if(c){c.delete();c.continue();}else done();};}),
    clearOtherUsers:(user:string)=>transact<void>('readwrite',(s,done)=>{const r=s.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(c.value.user!==user)c.delete();c.continue();}else done();};}),
    async close(){(await opening)?.close();opening=undefined;},
  };
}
