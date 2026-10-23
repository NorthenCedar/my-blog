import { expect,it,vi } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { writerFixture } from './_writer';
import { gitFixture } from './_writer-git';
import { writerProof } from '../functions/api/_lib/writer-auth';
import { createDraft,saveDraft,readDraft,exportDraft,deleteDraft } from '../functions/api/_lib/writer-drafts';
import { putAsset,readAsset,deleteAsset } from '../functions/api/_lib/writer-assets';
import { createJob,claimJob,authorizePush,recordJob } from '../functions/api/_lib/writer-jobs';
import { onRequestGet as assetsGet } from '../functions/api/writer/assets';
import { onRequestPost as draftsPost } from '../functions/api/writer/drafts';
import { prepare } from '../scripts/writer/prepare.mjs';
import { publish } from '../scripts/writer/publish.mjs';
vi.setConfig({testTimeout:30000});
const value={fields:{title:'手机中文文章',date:'2026-10-23',summary:'简介',tags:['随笔']},body:'尚未发布的正文\n',assets:[]};
const picture=async()=>new Uint8Array(await sharp({create:{width:17,height:23,channels:4,background:'#c8a46a80'}}).webp().toBuffer());
async function setup(){const s=await writerFixture();return {...s,proof:await writerProof(s.request(),{id:s.owner,auth_version:0} as never)};}
it('真实 SQLite 与 Git 贯通冻结、继续编辑、推送、回执和私密导出，损坏图片不能导出为有效备份',async()=>{
  const s=await setup(),git=gitFixture(),bytes=await picture(),image=await putAsset(s.db,s.proof,bytes);
  const draft=await createDraft(s.db,s.proof,{kind:'post',key:'phone-post',base:null,value:{...value,body:value.body+`![透明图片](writer-asset:${image.sha256})\n`,assets:[{sha256:image.sha256,alt:'透明图片'}]}});
  const job=await createJob(s.db,s.proof,{draftId:draft.id,revision:1,requestId:'1'.repeat(32)}),claimed=await claimJob(s.db,job.id,'1001');
  await saveDraft(s.db,s.proof,{id:draft.id,requestId:'2'.repeat(32),expectedRevision:1,value:{...draft.value,body:'发布期间继续输入\n',assets:[]}});
  await expect(deleteAsset(s.db,s.proof,image.sha256)).rejects.toMatchObject({status:409});
  const prepared=prepare({repoDir:git.cloud,snapshot:claimed.snapshot,assets:new Map([[image.sha256,new Uint8Array((await readAsset(s.db,s.owner,image.sha256)).bytes)]]),jobId:job.id});
  const result=await publish({repoDir:git.cloud,prepared,authorize:()=>authorizePush(s.db,job.id,claimed.lease,'1001')});
  const text=git.must(git.remote,['show','main:content/posts/phone-post/index.md']);
  const binary=git.git(git.remote,['show',`main:content/posts/phone-post/writer-${image.sha256}.webp`]);
  expect(text).toContain('尚未发布的正文');expect(text).not.toContain('发布期间继续输入');expect(text).toContain(`./writer-${image.sha256}.webp`);
  // 使用原始 Git stdout，避免二进制经过 UTF-8 转码。
  const {spawnSync}=await import('node:child_process');const raw=spawnSync('git',['show',`main:content/posts/phone-post/writer-${image.sha256}.webp`],{cwd:git.remote});expect(raw.status).toBe(0);expect(new Uint8Array(raw.stdout)).toEqual(bytes);expect(binary.status).toBe(0);
  const base={commit:result.commit,blobSha:git.must(git.remote,['rev-parse','main:content/posts/phone-post/index.md']),text};
  await recordJob(s.db,job.id,claimed.lease,{state:'pushed',runId:'1001',commit:result.commit,publishedBase:base});
  const reopened=await readDraft(s.db,s.owner,draft.id);expect(reopened.value.body).toBe('发布期间继续输入\n');expect(reopened.revision).toBe(2);expect(reopened.publishedRevision).toBe(1);expect(reopened.base).toEqual(base);
  await saveDraft(s.db,s.proof,{id:draft.id,requestId:'3'.repeat(32),expectedRevision:2,value:{...reopened.value,assets:draft.value.assets}});
  const bundle=await exportDraft(s.db,s.owner,draft.id),exported=Buffer.from(bundle.images[0].bytes,'base64');expect(bundle.format).toBe('northcedar-writer-1');expect(exported).toEqual(Buffer.from(bytes));expect(createHash('sha256').update(exported).digest('hex')).toBe(bundle.images[0].sha256);
  s.sqlite.prepare('UPDATE writer_assets SET bytes=? WHERE owner=? AND sha256=?').run(Buffer.alloc(bytes.length),s.owner,image.sha256);
  await expect(exportDraft(s.db,s.owner,draft.id)).rejects.toMatchObject({code:'asset_corrupt'});
});
it('配图列表分页显示实际有效载荷，并在清理时重新检查刚新增的引用',async()=>{
  const s=await setup(),bytes=await picture();s.sqlite.prepare('INSERT INTO writer_usage(owner) VALUES(?)').run(s.owner);
  const insert=s.sqlite.prepare('INSERT INTO writer_assets(owner,sha256,width,height,bytes,size,created_at) VALUES(?,?,17,23,?,?,?)');
  for(let i=0;i<52;i++)insert.run(s.owner,i.toString(16).padStart(64,'0'),bytes,bytes.length,i);
  const response=await assetsGet({request:s.request('/assets?page=1'),env:s.env} as never),first=await response.json() as any;
  expect(first.images).toHaveLength(50);expect(first.more).toBe(true);expect(first.usage).toMatchObject({draftCount:0,imageBytes:52*bytes.length,totalBytes:52*bytes.length});
  const second=await (await assetsGet({request:s.request('/assets?page=2'),env:s.env} as never)).json() as any;expect(second.images).toHaveLength(2);expect(second.more).toBe(false);expect(second.images.map((i:any)=>i.sha256).some((id:string)=>first.images.some((i:any)=>i.sha256===id))).toBe(false);
  const selected=first.images[0].sha256,draft=await createDraft(s.db,s.proof,{kind:'post',key:'ref',base:null,value:{...value,assets:[{sha256:selected,alt:'刚被引用'}]}});
  await expect(deleteAsset(s.db,s.proof,selected)).rejects.toMatchObject({code:'asset_referenced'});await deleteDraft(s.db,s.proof,draft.id,1);await deleteAsset(s.db,s.proof,selected);
  await expect(readAsset(s.db,s.owner,selected)).rejects.toMatchObject({status:404});
});
it('冲突时文章输入可另存独立草稿，基线由服务端保留且不覆盖原草稿',async()=>{
  const s=await setup(),base={commit:'3'.repeat(40),blobSha:'4'.repeat(40),text:'原文'},draft=await createDraft(s.db,s.proof,{kind:'post',key:'same-post',base,value});
  await saveDraft(s.db,s.proof,{id:draft.id,requestId:'4'.repeat(32),expectedRevision:1,value:{...value,body:'电脑更新'}});
  const response=await draftsPost({request:s.request('/drafts','POST',{action:'copy',id:draft.id,baseCommit:base.commit,value:{...value,body:'手机保留的输入'}}),env:s.env} as never);expect(response.status).toBe(201);
  const {draft:copy}=await response.json() as any;expect(copy.id).not.toBe(draft.id);expect(copy.key).toBe(draft.key);expect(copy.base).toEqual(base);expect(copy.value.body).toBe('手机保留的输入');expect((await readDraft(s.db,s.owner,draft.id)).value.body).toBe('电脑更新');
  const stale=await draftsPost({request:s.request('/drafts','POST',{action:'copy',id:draft.id,baseCommit:'5'.repeat(40),value}),env:s.env} as never);expect(stale.status).toBe(409);
});
