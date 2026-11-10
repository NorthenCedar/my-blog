import { expect,it } from 'vitest';
import { writerFixture } from './_writer';
import { writerProof } from '../functions/api/_lib/writer-auth';
import { createDraft,saveDraft,readDraft,listDrafts,deleteDraft,exportDraft } from '../functions/api/_lib/writer-drafts';
const value=(body='正文')=>({fields:{title:'标题',videos:[{src:'旧视频'}]},body,assets:[]});
async function setup() {
  const s=await writerFixture();
  const user={id:s.owner,auth_version:0} as never;
  const proof=await writerProof(s.request(),user);
  return {...s,proof};
}
it('草稿保存到真实数据库并按站主隔离读取，导出保留未知字段',async()=>{
  const s=await setup(); const d=await createDraft(s.db,s.proof,{kind:'post',key:'new-post',base:null,value:value()});
  expect(d.revision).toBe(1);
  expect((await readDraft(s.db,s.owner,d.id)).value).toEqual({...value(),audios:[]});
  expect((await listDrafts(s.db,s.owner)).length).toBe(1);
  await expect(readDraft(s.db,'c'.repeat(32),d.id)).rejects.toMatchObject({status:404});
  expect((await exportDraft(s.db,s.owner,d.id)).draft.value.fields.videos).toEqual([{src:'旧视频'}]);
});
it('成功响应丢失后相同请求不重复增版本，另一设备不能覆盖旧 revision',async()=>{
  const s=await setup(); const d=await createDraft(s.db,s.proof,{kind:'post',key:'new-post',base:null,value:value()});
  const input={id:d.id,requestId:'1'.repeat(32),expectedRevision:1,value:value('第一次保存')};
  const first=await saveDraft(s.db,s.proof,input), again=await saveDraft(s.db,s.proof,input);
  expect([first.revision,again.revision]).toEqual([2,2]);
  await expect(saveDraft(s.db,s.proof,{...input,requestId:'2'.repeat(32)})).rejects.toMatchObject({status:409});
  await expect(saveDraft(s.db,s.proof,{...input,value:value('伪造重用请求')})).rejects.toMatchObject({status:409});
  expect((await readDraft(s.db,s.owner,d.id)).value.body).toBe('第一次保存');
});
it('同一版本并发保存恰好一个成功，失败不改变额度',async()=>{
  const s=await setup(); const d=await createDraft(s.db,s.proof,{kind:'post',key:'new-post',base:null,value:value()});
  const outcomes=await Promise.allSettled([1,2].map(n=>saveDraft(s.db,s.proof,{id:d.id,requestId:String(n).repeat(32),expectedRevision:1,value:value('设备'+n)})));
  expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect((await readDraft(s.db,s.owner,d.id)).revision).toBe(2);
  const row=s.sqlite.prepare('SELECT total_bytes FROM writer_usage').get()!;
  const sum=s.sqlite.prepare('SELECT SUM(payload_bytes) AS n FROM writer_drafts').get()!;
  expect(row.total_bytes).toBe(sum.n);
});
it('第 101 份草稿被拒绝，删除后额度和草稿名额释放',async()=>{
  const s=await setup(); const ids:string[]=[];
  for(let n=0;n<100;n++) ids.push((await createDraft(s.db,s.proof,{kind:'post',key:'post-'+n,base:null,value:value()})).id);
  await expect(createDraft(s.db,s.proof,{kind:'post',key:'extra',base:null,value:value()})).rejects.toMatchObject({status:507});
  expect(s.sqlite.prepare('SELECT draft_count FROM writer_usage').get()?.draft_count).toBe(100);
  await deleteDraft(s.db,s.proof,ids[0],1);
  expect((await listDrafts(s.db,s.owner)).length).toBe(99);
  expect((await createDraft(s.db,s.proof,{kind:'post',key:'extra',base:null,value:value()})).revision).toBe(1);
});
it('会话被撤销后的保存与删除不产生数据修改',async()=>{
  const s=await setup(); const d=await createDraft(s.db,s.proof,{kind:'post',key:'new-post',base:null,value:value()});
  s.sqlite.exec('DELETE FROM visitor_sessions');
  await expect(saveDraft(s.db,s.proof,{id:d.id,requestId:'3'.repeat(32),expectedRevision:1,value:value('不应写入')})).rejects.toMatchObject({status:401});
  await expect(deleteDraft(s.db,s.proof,d.id,1)).rejects.toMatchObject({status:401});
  expect((await readDraft(s.db,s.owner,d.id)).value.body).toBe('正文');
});
it('引用不存在的配图会回滚正文、版本、回执与额度',async()=>{
  const s=await setup(); const d=await createDraft(s.db,s.proof,{kind:'post',key:'new-post',base:null,value:value()});
  const before=s.sqlite.prepare('SELECT * FROM writer_usage').get();
  await expect(saveDraft(s.db,s.proof,{id:d.id,requestId:'4'.repeat(32),expectedRevision:1,value:{...value('错误改动'),assets:[{sha256:'f'.repeat(64),alt:'缺失图'}]}})).rejects.toMatchObject({status:400});
  expect((await readDraft(s.db,s.owner,d.id)).revision).toBe(1);
  expect(s.sqlite.prepare('SELECT * FROM writer_usage').get()).toEqual(before);
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_save_receipts').get()?.n).toBe(0);
});
it('同一请求并发重试都得到同一回执，只执行一次保存',async()=>{
  const s=await setup(),d=await createDraft(s.db,s.proof,{kind:'post',key:'retry',base:null,value:value()});
  const input={id:d.id,requestId:'6'.repeat(32),expectedRevision:1,value:value('重试')};
  let arrived=0,release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const concurrent={...s.db,batch:async(statements:Parameters<D1Database['batch']>[0])=>{
    if(++arrived===2) release();
    await gate;
    return s.db.batch(statements);
  }} as D1Database;
  const responses=await Promise.all([saveDraft(concurrent,s.proof,input),saveDraft(concurrent,s.proof,input)]);
  expect(responses.map(r=>r.revision)).toEqual([2,2]);
  expect((await readDraft(s.db,s.owner,d.id)).revision).toBe(2);
});
it('UTF-8 字节计费，额度满时增长回滚而缩短正文仍能保存',async()=>{
  const s=await setup(),d=await createDraft(s.db,s.proof,{kind:'post',key:'quota',base:null,value:value('中文正文')});
  const size=new TextEncoder().encode(JSON.stringify(null)+JSON.stringify(d.value)).length;
  expect(s.sqlite.prepare('SELECT total_bytes FROM writer_usage').get()?.total_bytes).toBe(size);
  s.sqlite.prepare('UPDATE writer_usage SET total_bytes=100663296').run();
  const input={id:d.id,requestId:'7'.repeat(32),expectedRevision:1,value:value('中文正文长一点')};
  await expect(saveDraft(s.db,s.proof,input)).rejects.toMatchObject({status:507});
  expect((await readDraft(s.db,s.owner,d.id)).revision).toBe(1);
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_requests').get()?.n).toBe(0);
  expect((await saveDraft(s.db,s.proof,{...input,value:value('短')})).revision).toBe(2);
});
it('删除草稿级联保存回执，注销账户级联草稿和额度',async()=>{
  const s=await setup(),d=await createDraft(s.db,s.proof,{kind:'post',key:'delete',base:null,value:value()});
  await saveDraft(s.db,s.proof,{id:d.id,requestId:'8'.repeat(32),expectedRevision:1,value:value('保存')});
  await deleteDraft(s.db,s.proof,d.id,2);
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_save_receipts').get()?.n).toBe(0);
  await createDraft(s.db,s.proof,{kind:'post',key:'cascade',base:null,value:value()});
  s.sqlite.prepare('DELETE FROM visitor_accounts WHERE id=?').run(s.owner);
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_drafts').get()?.n).toBe(0);
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_usage').get()?.n).toBe(0);
});
