export type WriterKind = 'post' | 'talk';
export type WriterAssetRef = { sha256: string; alt: string };
export type WriterValue = { fields: Record<string, unknown>; body: string; assets: WriterAssetRef[] };
export type WriterBase = null | { commit: string; blobSha: string; text: string; itemHash?: string };
export type WriterDraft = { id: string; kind: WriterKind; key: string; revision: number; base: WriterBase; value: WriterValue; publishedRevision: number };
export type WriterSave = { id: string; requestId: string; expectedRevision: number; value: WriterValue };
export type WriterJobState = 'queued' | 'dispatch_unknown' | 'validating' | 'ready' | 'pushed' | 'deployed' | 'conflict' | 'failed' | 'cancelled' | 'deployment_failed';
export type WriterJob = { id: string; draftId: string; revision: number; state: WriterJobState; runId: string | null; commit: string | null; code: string | null };
export type WriterChange = { path: string; bytes: Uint8Array };
export const WRITER_LIMITS = { body:128*1024, upload:320*1024, image:300*1024, images:64*1024*1024, total:96*1024*1024, drafts:100 } as const;
export class WriterError extends Error {
  status:number;
  code:string;
  constructor(status: number, code: string, message: string) { super(message);this.status=status;this.code=code; }
}
export const writerFail = (status: number, code: string, message: string): never => { throw new WriterError(status,code,message); };
export const utf8Length = (value: string) => new TextEncoder().encode(value).byteLength;
export const writerId = (id: unknown): string => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id) ? id : writerFail(400,'invalid_id','内容标识不对，请重新打开');
export function validateTarget(kind: unknown, key: unknown): { kind: WriterKind; key:string } {
  if (kind !== 'post' && kind !== 'talk') writerFail(400,'invalid_kind','请选择文章或说说');
  if (typeof key !== 'string' || !(kind === 'post' ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) && key.length <= 60 : /^talk-[a-z0-9-]{1,120}$/.test(key))) writerFail(400,'invalid_key','内容网址或标识格式不对');
  return {kind,key};
}
export function validateWriterValue(kind: WriterKind, input: unknown): WriterValue {
  if (!input || typeof input !== 'object' || Array.isArray(input)) writerFail(400,'invalid_value','草稿内容格式不对');
  const v = input as Record<string,unknown>;
  if (!v.fields || typeof v.fields !== 'object' || Array.isArray(v.fields) || typeof v.body !== 'string' || !Array.isArray(v.assets)) writerFail(400,'invalid_value','草稿内容格式不对');
  if (utf8Length(v.body) > WRITER_LIMITS.body || utf8Length(JSON.stringify(v.fields)) > WRITER_LIMITS.body) writerFail(413,'content_too_large','草稿过长，请拆成几篇保存');
  if (v.assets.length > (kind === 'post' ? 20 : 9)) writerFail(413,'too_many_images','这份草稿的新增配图过多');
  const assets = v.assets.map((a: unknown) => {
    if (!a || typeof a !== 'object') return writerFail(400,'invalid_asset','配图信息不对');
    const image = a as Record<string,unknown>;
    if (typeof image.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(image.sha256) || typeof image.alt !== 'string' || utf8Length(image.alt) > 2048) writerFail(400,'invalid_asset','配图信息不对');
    return {sha256:image.sha256,alt:image.alt};
  });
  return {fields:structuredClone(v.fields) as Record<string,unknown>,body:v.body,assets};
}
