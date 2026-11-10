import type { WriterProof } from './writer-auth';
import { LIVE_ACCOUNT_SQL } from './visitor-store';
import { randomToken } from './visitor-core';
import { assertWriterProof, proofValues, writerStoreError } from './writer-drafts';
import { writerFail } from '../../../src/lib/writer/model';

/** 单条语音上限 1.5 MB：云端素材存在 D1，而行上限约 2 MB（与访客语音同一口径）。 */
export const WRITER_AUDIO_MAX = 1_500_000;
const invalid = () => writerFail(400, 'invalid_audio', '请上传体积在 1.5 MB 以内的 MP3 或 WAV');
const sha = (value: string) => (/^[a-f0-9]{64}$/.test(value) ? value : writerFail(400, 'invalid_audio', '语音标识不对'));

/**
 * 只听文件头判断容器：Content-Type 和扩展名都是客户端说的，文件头才是它自己。
 * 返回 'mp3' | 'wav'，两者都不是就拒绝。
 */
export function inspectWriterAudio(bytes: Uint8Array): { ext: 'mp3' | 'wav'; sha256: string } {
  if (bytes.length < 4 || bytes.length > WRITER_AUDIO_MAX) return invalid();
  const tag = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  let ext: 'mp3' | 'wav' | null = null;
  if (tag(0, 4) === 'RIFF' && tag(8, 4) === 'WAVE') ext = 'wav';
  else if (tag(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) ext = 'mp3';
  if (!ext) return invalid();
  // 摘要交给调用方算（Worker 里 crypto.subtle 是异步的）。
  return { ext, sha256: '' };
}

export function audioDigest(bytes: Uint8Array): Promise<string> {
  return crypto.subtle.digest('SHA-256', bytes.slice().buffer).then((hash) =>
    Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
  );
}

export async function putAudio(db: D1Database, proof: WriterProof, bytes: Uint8Array) {
  const { ext } = inspectWriterAudio(bytes);
  const hash = await audioDigest(bytes);
  const marker = randomToken(16);
  await assertWriterProof(db, proof);
  try {
    const result = await db.batch([
      db.prepare(`INSERT INTO writer_requests(id,owner) SELECT ?,? WHERE ${LIVE_ACCOUNT_SQL}`).bind(marker, proof.owner, ...proofValues(proof)),
      db.prepare(
        'INSERT INTO writer_audio(owner,sha256,ext,bytes,size,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM writer_requests WHERE id=?) AND NOT EXISTS(SELECT 1 FROM writer_audio WHERE owner=? AND sha256=?)'
      ).bind(proof.owner, hash, ext, bytes.slice().buffer, bytes.length, Date.now(), marker, proof.owner, hash),
      db.prepare('DELETE FROM writer_requests WHERE id=?').bind(marker),
    ]);
    if (!result[0].meta.changes) await assertWriterProof(db, proof);
    return { sha256: hash, ext, size: bytes.length };
  } catch (error) {
    return writerStoreError(error);
  }
}

export async function readAudio(db: D1Database, owner: string, sha256: string) {
  const row = await db
    .prepare('SELECT bytes,size,ext FROM writer_audio WHERE owner=? AND sha256=?')
    .bind(owner, sha(sha256))
    .first<{ bytes: ArrayBuffer; size: number; ext: string }>();
  if (!row) writerFail(404, 'audio_missing', '语音不存在，请重新上传');
  return row;
}

export async function listAudio(db: D1Database, owner: string) {
  const rows = await db
    .prepare('SELECT sha256,size,ext,created_at AS createdAt FROM writer_audio WHERE owner=? ORDER BY created_at DESC LIMIT 50')
    .bind(owner)
    .all();
  return { audios: rows.results };
}

export async function deleteAudio(db: D1Database, proof: WriterProof, sha256: string) {
  await assertWriterProof(db, proof);
  const deleted = await db
    .prepare(
      `DELETE FROM writer_audio WHERE owner=? AND sha256=? AND ${LIVE_ACCOUNT_SQL} AND NOT EXISTS(SELECT 1 FROM writer_job_audio WHERE owner=? AND sha256=?) RETURNING sha256`
    )
    .bind(proof.owner, sha(sha256), ...proofValues(proof), proof.owner, sha256)
    .first();
  if (!deleted) {
    await assertWriterProof(db, proof);
    writerFail(409, 'audio_referenced', '语音正在发布或不存在，请刷新后检查');
  }
}