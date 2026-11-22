import {validateAlbumKey,validateAlbumFields} from '../album-presentation.mjs';
export type WriterKind = 'post' | 'talk' | 'project' | 'forge' | 'gallery';
export type WriterAssetRef = { sha256: string; alt: string };
/** 语音素材：sha256 是内容摘要，ext 决定发布出来的文件名与 MIME。 */
export type WriterAudioRef = { sha256: string; ext: 'mp3' | 'wav'; label: string };
export type WriterValue = { fields: Record<string, unknown>; body: string; assets: WriterAssetRef[]; audios: WriterAudioRef[] };
export type WriterBase = null | { commit: string; blobSha: string; text: string; itemHash?: string; galleryIndex?: number };
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
  if (kind !== 'post' && kind !== 'talk' && kind !== 'project' && kind !== 'forge' && kind !== 'gallery') writerFail(400,'invalid_kind','请选择要编辑的内容类型');
  if(kind==='gallery'){try{validateAlbumKey(key);}catch{writerFail(400,'invalid_key','相册标识格式不对');}return {kind,key:key as string};}
  if (typeof key !== 'string' || !(kind === 'forge' ? (key==='forge' || key==='links') : kind === 'talk' ? /^talk-[a-z0-9-]{1,120}$/.test(key) : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) && key.length <= 60)) writerFail(400,'invalid_key','内容网址或标识格式不对');
  return {kind,key};
}
export const writerKindLabel = (kind:WriterKind,key?:string) => kind==='forge'&&key==='links'?'友链':({post:'文章',talk:'说说',project:'造物台项目',forge:'造物台页面文案',gallery:'相册'})[kind];
export const writerImageLimit = (kind:WriterKind,key?:string) => kind==='forge'?(key==='links'?60:0):kind==='gallery'?100:kind==='talk'?9:20;
export function writerTargetPath(kind:WriterKind,key:string):string {
  validateTarget(kind,key);
  return kind==='gallery'?`content/gallery/${key}/index.md`:kind==='post'?`content/posts/${key}/index.md`:kind==='project'?`content/projects/${key}/index.md`:kind==='forge'?(key==='links'?'content/pages/links.md':'content/pages/forge.md'):'content/pages/talks.md';
}
export function writerAssetDirectory(kind:WriterKind,key:string):string|null {
  validateTarget(kind,key);
  return kind==='gallery'?`content/gallery/${key}/`:kind==='forge'?(key==='links'?'public/avatars/friends/':null):kind==='post'?`content/posts/${key}/`:kind==='project'?`content/projects/${key}/`:'src/assets/talks/';
}
export const publishedAssetHashes=(base:WriterBase)=>new Set([...(base?.text??'').matchAll(/\bwriter-([a-f0-9]{64})\.webp\b/g)].map(m=>m[1]));
/** 已发布的语音（`/audio/<sha>.<ext>`）：用于区分“新增”与“本来就在仓库里的那条”。 */
export const existingAudios=(base:WriterBase)=>new Set([...(base?.text??'').matchAll(/\/audio\/([a-f0-9]{64})\.(?:mp3|wav)/g)].map(m=>m[1]));
export function validateWriterValue(kind: WriterKind, input: unknown,base:WriterBase=null,key?:string): WriterValue {
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
  if(kind==='gallery'){try{validateAlbumFields(v.fields);}catch(error){writerFail(400,'invalid_content',String((error as Error).message));}}
  const existing=publishedAssetHashes(base);
  const isLinks=kind==='forge'&&(key==='links'||Array.isArray((v.fields as Record<string,unknown>).groups));
  if(kind==='forge'&&!isLinks&&assets.length) writerFail(400,'invalid_asset','页面文案不使用上传图片');
  if(assets.filter(a=>!existing.has(a.sha256)).length>writerImageLimit(kind,isLinks?'links':key)) writerFail(413,'too_many_images','这份草稿的新增配图过多');
  // 语音（第三版新增）：老草稿里没有这个字段，缺省当空数组，不能让它们因为“少一个键”打不开。
  const rawAudios = v.audios ?? [];
  if(!Array.isArray(rawAudios)) writerFail(400,'invalid_audio','语音信息不对');
  const audios = rawAudios.map((a: unknown) => {
    if (!a || typeof a !== 'object') return writerFail(400,'invalid_audio','语音信息不对');
    const clip = a as Record<string,unknown>;
    if (typeof clip.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(clip.sha256)) writerFail(400,'invalid_audio','语音信息不对');
    if (clip.ext !== 'mp3' && clip.ext !== 'wav') writerFail(400,'invalid_audio','语音格式只能是 MP3 或 WAV');
    const label = typeof clip.label === 'string' ? clip.label.trim() : '';
    if (utf8Length(label) > 240) writerFail(400,'invalid_audio','语音说明过长');
    return { sha256: clip.sha256, ext: clip.ext as 'mp3'|'wav', label };
  });
  if (kind === 'forge' && audios.length) writerFail(400,'invalid_audio','页面文案不使用语音');
  if (kind === 'gallery' && audios.length) writerFail(400,'invalid_audio','相册不支持语音');
  if (kind === 'project' && audios.length) writerFail(400,'invalid_audio','造物台项目暂不支持语音');
  if (audios.filter(a=>!existingAudios(base).has(a.sha256)).length > 9) writerFail(413,'too_many_audio','这份草稿的新增语音过多');
  return {fields:structuredClone(v.fields) as Record<string,unknown>,body:v.body,assets,audios};
}
