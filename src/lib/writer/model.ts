export type WriterKind = 'post' | 'talk' | 'project' | 'forge';
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
  if (kind !== 'post' && kind !== 'talk' && kind !== 'project' && kind !== 'forge') writerFail(400,'invalid_kind','请选择要编辑的内容类型');
  if (typeof key !== 'string' || !(kind === 'forge' ? key==='forge' : kind === 'talk' ? /^talk-[a-z0-9-]{1,120}$/.test(key) : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) && key.length <= 60)) writerFail(400,'invalid_key','内容网址或标识格式不对');
  return {kind,key};
}
export const writerKindLabel = (kind:WriterKind) => ({post:'文章',talk:'说说',project:'造物台项目',forge:'造物台页面文案'})[kind];
export const writerImageLimit = (kind:WriterKind) => kind==='forge'?0:kind==='talk'?9:20;
export function writerTargetPath(kind:WriterKind,key:string):string {
  validateTarget(kind,key);
  return kind==='post'?`content/posts/${key}/index.md`:kind==='project'?`content/projects/${key}/index.md`:kind==='forge'?'content/pages/forge.md':'content/pages/talks.md';
}
export function writerAssetDirectory(kind:WriterKind,key:string):string|null {
  validateTarget(kind,key);
  return kind==='forge'?null:kind==='post'?`content/posts/${key}/`:kind==='project'?`content/projects/${key}/`:'src/assets/talks/';
}
export const publishedAssetHashes=(base:WriterBase)=>new Set([...(base?.text??'').matchAll(/\bwriter-([a-f0-9]{64})\.webp\b/g)].map(m=>m[1]));
export function validateWriterValue(kind: WriterKind, input: unknown,base:WriterBase=null): WriterValue {
  if (!input || typeof input !== 'object' || Array.isArray(input)) writerFail(400,'invalid_value','草稿内容格式不对');
  const v = input as Record<string,unknown>;
  if (!v.fields || typeof v.fields !== 'object' || Array.isArray(v.fields) || typeof v.body !== 'string' || !Array.isArray(v.assets)) writerFail(400,'invalid_value','草稿内容格式不对');
  if (utf8Length(v.body) > WRITER_LIMITS.body || utf8Length(JSON.stringify(v.fields)) > WRITER_LIMITS.body) writerFail(413,'content_too_large','草稿过长，请拆成几篇保存');
  if (utf8Length(JSON.stringify(v.assets))>WRITER_LIMITS.body) writerFail(413,'content_too_large','配图说明过长，请拆成几篇保存');
  const assets = v.assets.map((a: unknown) => {
    if (!a || typeof a !== 'object') return writerFail(400,'invalid_asset','配图信息不对');
    const image = a as Record<string,unknown>;
    if (typeof image.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(image.sha256) || typeof image.alt !== 'string' || utf8Length(image.alt) > 2048) writerFail(400,'invalid_asset','配图信息不对');
    return {sha256:image.sha256,alt:image.alt};
  });
  const existing=publishedAssetHashes(base);
  if(kind==='forge'&&assets.length) writerFail(400,'invalid_asset','页面文案不使用上传图片');
  if(assets.filter(a=>!existing.has(a.sha256)).length>writerImageLimit(kind)) writerFail(413,'too_many_images','这份草稿的新增配图过多');
  return {fields:structuredClone(v.fields) as Record<string,unknown>,body:v.body,assets};
}
