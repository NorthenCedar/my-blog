import {expect,it,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {writerFixture} from './_writer';
import {writerProof} from '../functions/api/_lib/writer-auth';
import {createWriterRepository,importPublished} from '../functions/api/_lib/writer-repository';
import {createJob,claimJob,publishedBase,jobRow} from '../functions/api/_lib/writer-jobs';
import {onRequestGet} from '../functions/api/writer/content';
const commit='1'.repeat(40),sha='2'.repeat(40),text='---\ntitle: 中文旧册\ndate: 2026-11-01\nimages:\n  - src: ./旧图.webp\n    alt: 旧图\n---\n原文\r\n';
const json=(x:any,status=200)=>new Response(JSON.stringify(x),{status});
const seen:string[]=[];
const transport:typeof fetch=async url=>{const u=decodeURIComponent(String(url));seen.push(u);if(u.endsWith('/git/ref/heads/main'))return json({object:{sha:commit}});if(u.includes('/contents/content/gallery?'))return json([{type:'dir',name:'中文旧册'},{type:'dir',name:'../escape'},{type:'dir',name:'spiral'}]);if(u.includes('/contents/content/gallery/中文旧册/'))return json({type:'file',sha,encoding:'base64',size:Buffer.byteLength(text),content:Buffer.from(text).toString('base64')});return json({},404);};
afterEach(()=>{vi.unstubAllGlobals();seen.length=0;});
it('中文相册导入、不可变任务与发布回执始终读取固定相册路径',async()=>{
 const s=await writerFixture();s.sqlite.exec(readFileSync('migrations/0009_writer_gallery.sql','utf8'));
 const proof=await writerProof(s.request(),{id:s.owner,auth_version:0} as never),repo=createWriterRepository('测试',transport);
 const draft=await importPublished(repo,s.db,proof,{kind:'gallery',key:'中文旧册'});expect(draft.value.body).toBe('原文\r\n');expect(draft.value.assets).toEqual([]);
 const job=await createJob(s.db,proof,{draftId:draft.id,revision:1,requestId:'d'.repeat(32)}),claimed=await claimJob(s.db,job.id,'1001');expect(claimed.snapshot.kind).toBe('gallery');
 expect((await publishedBase({...repo,commitReceipt:async()=>({})} as any,await jobRow(s.db,job.id),commit))?.text).toBe(text);
 expect(seen.some(u=>u.includes('talks.md'))).toBe(false);
});
it('相册列表过滤危险目录，图片仅允许相册内平铺文件，匿名不可读',async()=>{
 vi.stubGlobal('fetch',transport);const s=await writerFixture(),env={...s.env,WRITER_GITHUB_TOKEN:'测试'};
 const result=await onRequestGet({request:s.request('/content?kind=gallery'),env} as never);expect(result.status).toBe(200);expect((await result.json() as any).items).toEqual([{key:'中文旧册'}]);
 const repo=createWriterRepository('测试',transport);await expect(repo.readImage(commit,'content/gallery/中文旧册/旧图.webp')).resolves.toBeDefined();
 for(const path of ['content/gallery/../旧图.webp','content/gallery/spiral/旧图.webp','content/gallery/中文旧册/other/a.webp','content/posts/中文/旧图.webp'])await expect(repo.readImage(commit,path)).rejects.toThrow();
 const before=seen.length;expect((await onRequestGet({request:new Request('https://northcedar.top/api/writer/content?kind=gallery'),env} as never)).status).toBe(401);expect(seen.length).toBe(before);
});
it('新相册空草稿可保存和导出，旧revision不能覆盖且发布快照不随后续图注改变',async()=>{
 const {onRequestPost,onRequestGet}=await import('../functions/api/writer/drafts');const s=await writerFixture();s.sqlite.exec(readFileSync('migrations/0009_writer_gallery.sql','utf8'));
 const response=await onRequestPost({request:s.request('/drafts','POST',{action:'create',kind:'gallery',key:'准备中的册',value:{fields:{title:'',draft:true,images:[]},body:'',assets:[]}}),env:s.env} as never);expect(response.status).toBe(201);const {draft}=await response.json() as any;
 const value={fields:{title:'相册',date:'2026-11-01',images:[{src:'./旧图.webp',alt:'旧图注',credit:'保留'}]},body:'原文\r\n',assets:[]};
 const save={action:'save',id:draft.id,requestId:'c'.repeat(32),expectedRevision:1,value};const saved=await onRequestPost({request:s.request('/drafts','POST',save),env:s.env} as never);expect(saved.status).toBe(200);
 const stale=await onRequestPost({request:s.request('/drafts','POST',{...save,requestId:'d'.repeat(32)}),env:s.env} as never);expect(stale.status).toBe(409);
 const proof=await writerProof(s.request(),{id:s.owner,auth_version:0} as never),job=await createJob(s.db,proof,{draftId:draft.id,revision:2,requestId:'e'.repeat(32)});
 value.fields.images[0].alt='后续图注';expect((await onRequestPost({request:s.request('/drafts','POST',{...save,requestId:'f'.repeat(32),expectedRevision:2,value}),env:s.env} as never)).status).toBe(200);
 expect(JSON.parse((await jobRow(s.db,job.id)).snapshot_json).value.fields.images[0].alt).toBe('旧图注');
 const exported=await onRequestGet({request:s.request('/drafts?id='+draft.id+'&export=1'),env:s.env} as never);expect(exported.status).toBe(200);expect(JSON.stringify(await exported.json())).toContain('后续图注');
});

it('导入相册按发布日期倒序、同日key代码序定位，排除草稿且不污染公开fields',async()=>{
 const s=await writerFixture();s.sqlite.exec(readFileSync('migrations/0009_writer_gallery.sql','utf8'));
 const sources:any={z:text.replace('中文旧册','末册'),a:text.replace('中文旧册','首册'),hidden:text.replace('images:', 'draft: true\nimages:')};
 const repo=createWriterRepository('测试',transport);Object.assign(repo,{listGalleries:async()=>[{key:'z'},{key:'hidden'},{key:'a'}],readGallery:async(_commit:string,key:string)=>({sha,text:sources[key]})});
 const proof=await writerProof(s.request(),{id:s.owner,auth_version:0} as never),draft=await importPublished(repo,s.db,proof,{kind:'gallery',key:'z'});
 expect(draft.base).toHaveProperty('galleryIndex',1);expect(draft.value.fields).not.toHaveProperty('galleryIndex');
});
