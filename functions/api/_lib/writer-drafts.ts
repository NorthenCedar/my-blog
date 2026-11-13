import { digest,randomToken } from './visitor-core';
import { LIVE_ACCOUNT_SQL } from './visitor-store';
import type { WriterProof } from './writer-auth';
import { WriterError,writerFail,writerId,utf8Length,validateTarget,validateWriterValue,type WriterKind,type WriterValue,type WriterBase,type WriterSave,type WriterDraft } from '../../../src/lib/writer/model';

type DraftRow={id:string;owner:string;kind:WriterKind;target_key:string;revision:number;base_json:string;value_json:string;published_revision:number};
const fields='id,owner,kind,target_key,revision,base_json,value_json,published_revision';
export const activeJobs="'queued','dispatch_unknown','validating','ready','pushed'";
const decode=(r:DraftRow):WriterDraft=>({id:r.id,kind:r.kind,key:r.target_key,revision:r.revision,base:JSON.parse(r.base_json),value:JSON.parse(r.value_json),publishedRevision:r.published_revision});
export const proofValues=(p:WriterProof)=>[p.owner,p.authVersion,p.tokenHash,Date.now()];
export async function assertWriterProof(db:D1Database,proof:WriterProof) {
  if (!await db.prepare(`SELECT 1 WHERE ${LIVE_ACCOUNT_SQL}`).bind(...proofValues(proof)).first()) writerFail(401,'session_expired','登录已过期，请重新登录；草稿仍保留');
}
export function writerStoreError(error:unknown):never {
  if (error instanceof WriterError) throw error;
  const message=String(error);
  if (/writer_(?:count|image|total)_quota/.test(message)) writerFail(507,'quota_exceeded','写作存储已满，请先导出或清理不需要的草稿和图片');
  if (/FOREIGN KEY/.test(message)) writerFail(400,'asset_missing','部分配图不存在或仍被引用，请重新读取后处理');
  if (/UNIQUE constraint/.test(message)) writerFail(409,'version_conflict','内容已变化，请重新读取并保留当前输入');
  throw error;
}
export async function readDraft(db:D1Database,owner:string,id:string):Promise<WriterDraft> {
  writerId(id);
  const row=await db.prepare(`SELECT ${fields} FROM writer_drafts WHERE owner=? AND id=?`).bind(owner,id).first<DraftRow>();
  if(!row) writerFail(404,'draft_missing','这份草稿不存在，请返回草稿列表');
  return decode(row);
}
export async function listDrafts(db:D1Database,owner:string) {
  const rows=await db.prepare("SELECT id,kind,target_key AS key,revision,published_revision AS publishedRevision,updated_at AS updatedAt,json_extract(value_json,'$.fields.title') AS title FROM writer_drafts WHERE owner=? ORDER BY updated_at DESC,id LIMIT 100").bind(owner).all();
  return rows.results;
}
export function assetRefs(db:D1Database,proof:WriterProof,id:string,assets:WriterValue['assets'],marker:string) {
  return assets.map((asset,position)=>db.prepare('INSERT INTO writer_draft_assets(draft_id,owner,sha256,position) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM writer_requests WHERE id=? AND owner=?)').bind(id,proof.owner,asset.sha256,position,marker,proof.owner));
}
// 与删除素材使用同一个引用字段，写入时在 D1 的同一批次确认语音仍在。
const missingDraftAudio = `EXISTS (
  SELECT 1 FROM json_each(?, '$.audios') clip
  WHERE NOT EXISTS (
    SELECT 1 FROM writer_audio a WHERE a.owner=?
      AND a.sha256=json_extract(clip.value, '$.sha256')
      AND a.ext=json_extract(clip.value, '$.ext')
  )
)`;

async function assertDraftAudio(db: D1Database, owner: string, value: WriterValue, content: string) {
  if (value.audios?.length && await db.prepare(`SELECT 1 WHERE ${missingDraftAudio}`).bind(content, owner).first()) {
    writerFail(400, 'audio_missing', '部分语音已不存在或格式不符，请重新上传');
  }
}

export async function createDraft(db:D1Database,proof:WriterProof,input:{kind:WriterKind;key:string;base:WriterBase;value:WriterValue}):Promise<WriterDraft> {
  const {kind,key}=validateTarget(input.kind,input.key),value=validateWriterValue(kind,input.value,input.base);
  const base=JSON.stringify(input.base);
  if (utf8Length(base)>256*1024) writerFail(413,'base_too_large','原文过大，暂不能在云端编辑');
  const content=JSON.stringify(value),id=randomToken(16),marker=randomToken(16),now=Date.now();
  await assertWriterProof(db,proof);
  try {
    const results=await db.batch([
      db.prepare(`INSERT INTO writer_requests(id,owner) SELECT ?,? WHERE ${LIVE_ACCOUNT_SQL}${value.audios.length ? ` AND NOT ${missingDraftAudio}` : ''}`)
        .bind(marker,proof.owner,...proofValues(proof),...(value.audios.length ? [content, proof.owner] : [])),
      db.prepare('INSERT OR IGNORE INTO writer_usage(owner) SELECT ? WHERE EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(proof.owner,marker),
      db.prepare('INSERT INTO writer_drafts(id,owner,kind,target_key,base_json,value_json,payload_bytes,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(id,proof.owner,kind,key,base,content,utf8Length(base)+utf8Length(content),now,now,marker),
      ...assetRefs(db,proof,id,value.assets,marker),
      db.prepare('DELETE FROM writer_requests WHERE id=?').bind(marker),
    ]);
    if(!results[0].meta.changes) {
      await assertWriterProof(db,proof);
      await assertDraftAudio(db,proof.owner,value,content);
      writerFail(409,'version_conflict','请重新保存草稿');
    }
    return await readDraft(db,proof.owner,id);
  } catch(error) {return writerStoreError(error);}
}
export async function saveDraft(db:D1Database,proof:WriterProof,input:WriterSave):Promise<WriterDraft> {
  writerId(input.requestId);
  const before=await readDraft(db,proof.owner,input.id),value=validateWriterValue(before.kind,input.value,before.base);
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1) writerFail(400,'invalid_revision','草稿版本不对，请重新读取');
  const content=JSON.stringify(value),hash=await digest(JSON.stringify([input.id,input.expectedRevision,value]));
  await assertWriterProof(db,proof);
  const replay=async()=>{
    const receipt=await db.prepare('SELECT draft_id,payload_hash,revision FROM writer_save_receipts WHERE owner=? AND request_id=?').bind(proof.owner,input.requestId).first<{draft_id:string;payload_hash:string;revision:number}>();
    if(!receipt) return null;
    if(receipt.draft_id!==input.id||receipt.payload_hash!==hash) writerFail(409,'request_reused','此保存请求已用于其他内容，请重新保存');
    return {...before,revision:receipt.revision,value};
  };
  const previous=await replay();
  if(previous) return previous;
  const marker=randomToken(16),now=Date.now();
  try {
    const results=await db.batch([
      db.prepare(`INSERT INTO writer_requests(id,owner) SELECT ?,? WHERE EXISTS(SELECT 1 FROM writer_drafts WHERE owner=? AND id=? AND revision=?) AND ${LIVE_ACCOUNT_SQL}${value.audios.length ? ` AND NOT ${missingDraftAudio}` : ''}`)
        .bind(marker,proof.owner,proof.owner,input.id,input.expectedRevision,...proofValues(proof),...(value.audios.length ? [content, proof.owner] : [])),
      db.prepare('UPDATE writer_drafts SET value_json=?,payload_bytes=length(CAST(base_json AS BLOB))+?,revision=revision+1,updated_at=? WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(content,utf8Length(content),now,input.id,proof.owner,marker),
      db.prepare('DELETE FROM writer_draft_assets WHERE draft_id=? AND EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(input.id,marker),
      ...assetRefs(db,proof,input.id,value.assets,marker),
      db.prepare('INSERT INTO writer_save_receipts(owner,request_id,draft_id,payload_hash,revision,created_at) SELECT ?,?,?,?,revision,? FROM writer_drafts WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(proof.owner,input.requestId,input.id,hash,now,input.id,proof.owner,marker),
      db.prepare('DELETE FROM writer_save_receipts WHERE draft_id=? AND revision<=? AND EXISTS(SELECT 1 FROM writer_requests WHERE id=?)').bind(input.id,input.expectedRevision-99,marker),
      db.prepare('DELETE FROM writer_requests WHERE id=?').bind(marker),
    ]);
    if(!results[0].meta.changes) {
      await assertWriterProof(db,proof);
      const saved=await replay();
      if(saved) return saved;
      await assertDraftAudio(db,proof.owner,value,content);
      writerFail(409,'version_conflict','云端已有更新，请保留当前输入并对照处理');
    }
    return {...before,value,revision:input.expectedRevision+1};
  } catch(error) {return writerStoreError(error);}
}
export async function deleteDraft(db:D1Database,proof:WriterProof,id:string,revision:number) {
  writerId(id);
  await assertWriterProof(db,proof);
  const result=await db.prepare(`DELETE FROM writer_drafts WHERE id=? AND owner=? AND revision=? AND ${LIVE_ACCOUNT_SQL} AND NOT EXISTS(SELECT 1 FROM writer_jobs WHERE draft_id=? AND state IN (${activeJobs})) RETURNING id`).bind(id,proof.owner,revision,...proofValues(proof),id).first();
  if(!result) {await assertWriterProof(db,proof);writerFail(409,'draft_busy','草稿已变化或仍在发布，请稍后重新读取');}
}
export async function exportDraft(db:D1Database,owner:string,id:string) {
  writerId(id);
  // 同一批次读取正文与素材，自动保存不会混入另一份修订的引用。
  const [rows, images, audio] = await db.batch([
    db.prepare(`SELECT ${fields} FROM writer_drafts WHERE owner=? AND id=?`).bind(owner,id),
    db.prepare('SELECT a.sha256,a.bytes,a.width,a.height FROM writer_assets a JOIN writer_draft_assets r ON r.owner=a.owner AND r.sha256=a.sha256 WHERE r.draft_id=? AND a.owner=? ORDER BY r.position').bind(id,owner),
    db.prepare(`SELECT a.sha256,a.bytes,a.ext,a.size
      FROM writer_drafts d, json_each(d.value_json, '$.audios') clip
      JOIN writer_audio a ON a.owner=d.owner AND a.sha256=json_extract(clip.value, '$.sha256')
        AND a.ext=json_extract(clip.value, '$.ext')
      WHERE d.id=? AND d.owner=? ORDER BY clip.key`).bind(id,owner),
  ]);
  if (!rows.results.length) writerFail(404,'draft_missing','这份草稿不存在，请返回草稿列表');
  const draft = decode(rows.results[0] as unknown as DraftRow);
  if (audio.results.length !== (draft.value.audios?.length ?? 0)) {
    writerFail(409, 'audio_missing', '部分草稿语音缺失，无法生成完整备份');
  }
  const encodedImages = [];
  for (const row of images.results) encodedImages.push(await encodeBackupAsset(row, '配图'));
  const encodedAudio = [];
  for (const row of audio.results) encodedAudio.push(await encodeBackupAsset(row, '语音'));
  return { format: 'northcedar-writer-1', draft, images: encodedImages, audios: encodedAudio };
}

async function encodeBackupAsset(row: unknown, kind: string) {
  const asset = row as { bytes: ArrayBuffer; sha256: string };
  const bytes = new Uint8Array(asset.bytes);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== asset.sha256) writerFail(500, 'asset_corrupt', kind + '摘要不一致，本次未生成备份，请保留草稿并检查存储');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  }
  return { ...asset, bytes: btoa(binary) };
}
