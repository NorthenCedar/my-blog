import { expect,it } from 'vitest';
import sharp from 'sharp';
import { writerFixture } from './_writer';
import { writerProof } from '../functions/api/_lib/writer-auth';
import { putAsset,readAsset,deleteAsset,inspectWriterWebp } from '../functions/api/_lib/writer-assets';
import { createDraft } from '../functions/api/_lib/writer-drafts';
import { onRequestGet,onRequestPost } from '../functions/api/writer/assets';
import { readUpload } from '../functions/api/_lib/writer-assets';
async function setup(){const s=await writerFixture();return {...s,proof:await writerProof(s.request(),{id:s.owner,auth_version:0} as never)};}
const picture=async()=>new Uint8Array(await sharp({create:{width:17,height:23,channels:4,background:'#c8a46a80'}}).webp().toBuffer());
it('真实 WebP 字节私有保存，重复上传不重复计费，删除恢复额度',async()=>{
  const s=await setup(),bytes=await picture();
  const one=await putAsset(s.db,s.proof,bytes),two=await putAsset(s.db,s.proof,bytes);
  expect(one).toEqual({...two,width:17,height:23});
  expect(new Uint8Array((await readAsset(s.db,s.owner,one.sha256)).bytes)).toEqual(bytes);
  await expect(readAsset(s.db,'c'.repeat(32),one.sha256)).rejects.toMatchObject({status:404});
  expect(s.sqlite.prepare('SELECT count(*) AS n FROM writer_assets').get()?.n).toBe(1);
  expect(s.sqlite.prepare('SELECT image_bytes FROM writer_usage').get()?.image_bytes).toBe(bytes.length);
  await deleteAsset(s.db,s.proof,one.sha256);
  expect(s.sqlite.prepare('SELECT image_bytes FROM writer_usage').get()?.image_bytes).toBe(0);
});
it('拒绝伪造类型、截断、动画、超尺寸与超字节图片',async()=>{
  const bytes=await picture();
  for(const bad of [new TextEncoder().encode('<svg/>'),bytes.slice(0,-1),new Uint8Array(307201)]) await expect(inspectWriterWebp(bad)).rejects.toMatchObject({status:400});
  const animation=bytes.slice();animation[20]|=2;
  await expect(inspectWriterWebp(animation)).rejects.toMatchObject({status:400});
  const large=new Uint8Array(await sharp({create:{width:1921,height:1,channels:3,background:'#111'}}).webp().toBuffer());
  await expect(inspectWriterWebp(large)).rejects.toMatchObject({status:400});
});
it('草稿引用图片时不能清理，移除草稿后才可删除',async()=>{
  const s=await setup(),image=await putAsset(s.db,s.proof,await picture());
  await createDraft(s.db,s.proof,{kind:'post',key:'image',base:null,value:{fields:{title:'图片'},body:'',assets:[{sha256:image.sha256,alt:'图'}]}});
  await expect(deleteAsset(s.db,s.proof,image.sha256)).rejects.toMatchObject({status:409});
  expect((await readAsset(s.db,s.owner,image.sha256)).size).toBeGreaterThan(0);
});
it('临界额度并发上传只占一次，改密后上传被拒绝',async()=>{
  const s=await setup(),bytes=await picture();
  s.sqlite.prepare('INSERT INTO writer_usage(owner,image_bytes,total_bytes) VALUES(?,?,?)').run(s.owner,67108864-bytes.length,67108864-bytes.length);
  const results=await Promise.all([putAsset(s.db,s.proof,bytes),putAsset(s.db,s.proof,bytes)]);
  expect(results[0].sha256).toBe(results[1].sha256);
  expect(s.sqlite.prepare('SELECT image_bytes FROM writer_usage').get()?.image_bytes).toBe(67108864);
  const extra=new Uint8Array(await sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).webp().toBuffer());
  await expect(putAsset(s.db,s.proof,extra)).rejects.toMatchObject({status:507});
  s.sqlite.exec('UPDATE visitor_accounts SET auth_version=auth_version+1');
  await expect(putAsset(s.db,s.proof,bytes)).rejects.toMatchObject({status:401});
});
it('HTTP 匿名读取拒绝、伪造 Content-Length 不能突破实际流上限',async()=>{
  const s=await setup();
  const request=new Request('https://northcedar.top/api/writer/assets?sha256='+'f'.repeat(64));
  const response=await onRequestGet({request,env:s.env} as never);
  expect(response.status).toBe(401);expect(response.headers.get('Cache-Control')).toBe('no-store');
  const oversized=new Request(request.url,{method:'POST',headers:{'Content-Length':'1'},body:new Uint8Array(327681)});
  await expect(readUpload(oversized)).rejects.toMatchObject({status:413});
});
it('HTTP 二进制往返不经过文本转换且 VP8L 也可接收',async()=>{
  const s=await setup(),bytes=new Uint8Array(await sharp({create:{width:3,height:5,channels:4,background:'#ffaacc88'}}).webp({lossless:true}).toBuffer());
  const request=new Request('https://northcedar.top/api/writer/assets',{method:'POST',headers:{Cookie:`__Host-nc_session=${s.token}`,Origin:'https://northcedar.top','X-NC-Request':'1','Content-Type':'text/plain'},body:bytes});
  const result=await onRequestPost({request,env:s.env} as never);expect(result.status).toBe(201);
  const data=await result.json() as {sha256:string};
  const image=await onRequestGet({request:s.request('/assets?sha256='+data.sha256),env:s.env} as never);
  expect(image.headers.get('Content-Type')).toBe('image/webp');
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(bytes);
});
