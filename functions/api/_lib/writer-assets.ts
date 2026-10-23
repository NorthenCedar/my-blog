import type { WriterProof } from './writer-auth';
import { LIVE_ACCOUNT_SQL } from './visitor-store';
import { randomToken } from './visitor-core';
import { assertWriterProof,proofValues,writerStoreError } from './writer-drafts';
import { WRITER_LIMITS,writerFail } from '../../../src/lib/writer/model';
const invalid=()=>writerFail(400,'invalid_image','请使用静态 WebP 配图，长边不超过 1920 像素、大小不超过 300 KiB');
const sha=(value:string)=>/^[a-f0-9]{64}$/.test(value)?value:writerFail(400,'invalid_asset','图片标识不对');
export async function inspectWriterWebp(bytes:Uint8Array):Promise<{width:number;height:number;sha256:string}>{
  if(bytes.length<20||bytes.length>WRITER_LIMITS.image) return invalid();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const tag=(offset:number)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
  if(tag(0)!=='RIFF'||tag(8)!=='WEBP'||view.getUint32(4,true)+8!==bytes.length) return invalid();
  const u24=(p:number)=>bytes[p]|bytes[p+1]<<8|bytes[p+2]<<16;
  let width=0,height=0,canvasWidth=0,canvasHeight=0,frames=0;
  for(let p=12;p<bytes.length;){
    if(p+8>bytes.length) return invalid();
    const type=tag(p),length=view.getUint32(p+4,true),start=p+8,end=start+length;
    if(end+(length%2)>bytes.length) return invalid();
    if(type==='ANIM'||type==='ANMF') return invalid();
    if(type==='VP8X'){
      if(p!==12||length!==10||(bytes[start]&0xc3)!==0) return invalid();
      canvasWidth=u24(start+4)+1;canvasHeight=u24(start+7)+1;
    }else if(type==='VP8 '){
      if(length<10||bytes[start]&1||bytes[start+3]!==0x9d||bytes[start+4]!==1||bytes[start+5]!==0x2a) return invalid();
      width=view.getUint16(start+6,true)&0x3fff;height=view.getUint16(start+8,true)&0x3fff;frames++;
    }else if(type==='VP8L'){
      if(length<5||bytes[start]!==0x2f||bytes[start+4]>>5) return invalid();
      const bits=view.getUint32(start+1,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;frames++;
    }else if(!['ALPH','ICCP','EXIF','XMP '].includes(type)) return invalid();
    p=end+(length%2);
  }
  if(frames!==1||!width||!height||width>1920||height>1920||(canvasWidth&&(canvasWidth!==width||canvasHeight!==height))) return invalid();
  const hash=await crypto.subtle.digest('SHA-256',bytes.slice().buffer);
  return {width,height,sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};
}
export async function putAsset(db:D1Database,proof:WriterProof,bytes:Uint8Array){
  const image=await inspectWriterWebp(bytes),marker=randomToken(16);
  await assertWriterProof(db,proof);
  try{
    const result=await db.batch([
      db.prepare(`INSERT INTO writer_requests(id,owner) SELECT ?,? WHERE ${LIVE_ACCOUNT_SQL}`).bind(marker,proof.owner,...proofValues(proof)),
      db.prepare('INSERT OR IGNORE INTO writer_usage(owner) SELECT ? WHERE EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(proof.owner,marker),
      db.prepare('INSERT INTO writer_assets(owner,sha256,width,height,bytes,size,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM writer_requests WHERE id=?) AND NOT EXISTS(SELECT 1 FROM writer_assets WHERE owner=? AND sha256=?)').bind(proof.owner,image.sha256,image.width,image.height,bytes.slice().buffer,bytes.length,Date.now(),marker,proof.owner,image.sha256),
      db.prepare('DELETE FROM writer_requests WHERE id=?').bind(marker),
    ]);
    if(!result[0].meta.changes) await assertWriterProof(db,proof);
    return image;
  }catch(error){return writerStoreError(error);}
}
export async function readAsset(db:D1Database,owner:string,sha256:string):Promise<{bytes:ArrayBuffer;size:number;width:number;height:number}>{
  const asset=await db.prepare('SELECT bytes,size,width,height FROM writer_assets WHERE owner=? AND sha256=?').bind(owner,sha(sha256)).first<{bytes:ArrayBuffer;size:number;width:number;height:number}>();
  if(!asset) writerFail(404,'asset_missing','图片不存在，请重新上传');
  return asset;
}
export async function listAssets(db:D1Database,owner:string){
  return (await db.prepare('SELECT sha256,size,width,height,created_at AS createdAt,EXISTS(SELECT 1 FROM writer_draft_assets d WHERE d.owner=a.owner AND d.sha256=a.sha256) OR EXISTS(SELECT 1 FROM writer_job_assets j WHERE j.owner=a.owner AND j.sha256=a.sha256) AS referenced FROM writer_assets a WHERE owner=? ORDER BY created_at DESC LIMIT 500').bind(owner).all()).results;
}
export async function deleteAsset(db:D1Database,proof:WriterProof,sha256:string){
  await assertWriterProof(db,proof);
  const deleted=await db.prepare(`DELETE FROM writer_assets WHERE owner=? AND sha256=? AND ${LIVE_ACCOUNT_SQL} AND NOT EXISTS(SELECT 1 FROM writer_draft_assets WHERE owner=? AND sha256=?) AND NOT EXISTS(SELECT 1 FROM writer_job_assets WHERE owner=? AND sha256=?) RETURNING sha256`).bind(proof.owner,sha(sha256),...proofValues(proof),proof.owner,sha256,proof.owner,sha256).first();
  if(!deleted){await assertWriterProof(db,proof);writerFail(409,'asset_referenced','图片已被引用或不存在，请刷新后检查');}
}
export async function readUpload(request:Request){
  if(!request.body) return invalid();
  const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done) break;size+=value.length;if(size>WRITER_LIMITS.upload){await reader.cancel();writerFail(413,'upload_too_large','上传过大，请压缩后重试');}parts.push(value);}}
  finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
