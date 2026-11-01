import {expect,it} from 'vitest';
import {validateTarget,writerTargetPath,writerAssetDirectory,writerImageLimit,validateWriterValue} from '../src/lib/writer/model';
import {readPost,planChanges,validatePublish,writerHash} from '../src/lib/writer/content';
const fields={title:'旧中文相册',date:'2026-11-01',layout:'wall',images:[{src:'./旧照片.jpg',alt:'旧图',credit:'作者'}]};
it('gallery 支持中文 id 和固定目录而其他类型仍严格',()=>{
 expect(validateTarget('gallery','旧中文相册').key).toBe('旧中文相册');
 expect(writerTargetPath('gallery','旧中文相册')).toBe('content/gallery/旧中文相册/index.md');
 expect(writerAssetDirectory('gallery','旧中文相册')).toBe('content/gallery/旧中文相册/');
 expect(writerImageLimit('gallery')).toBe(100);
 for(const key of ['../escape','a/b','a\\b','spiral','index','CON','nul.txt','.hidden','a%2fb'])expect(()=>validateTarget('gallery',key)).toThrow();
 expect(()=>validateTarget('post','中文')).toThrow();
});
it('gallery 草稿可空，发布至少一图、合法日期与图注，封面必须属于图库',()=>{
 expect(()=>validateWriterValue('gallery',{fields:{images:[],draft:true},body:'',assets:[]})).not.toThrow();
 expect(()=>validatePublish('gallery',{fields,body:'',assets:[]})).not.toThrow();
 for(const patch of [{images:[]},{date:'2026-02-30'},{cover:'./其他.jpg'},{images:[{src:'../bad.jpg',alt:'bad'}]},{images:[{src:'./旧照片.jpg',alt:''}]}])expect(()=>validatePublish('gallery',{fields:{...fields,...patch},body:'',assets:[]})).toThrow();
});
it('gallery 修改图注保留序列未知字段、注释与未编辑正文混合行尾',()=>{
 const text='---\r\ntitle: 旧中文相册\r\ndate: 2026-11-01\r\nimages:\r\n  - src: ./旧照片.jpg # 原图\r\n    alt: 旧图 # 图注\r\n    credit: 作者\r\nlayout: scatter\r\n---  \r\n正文\n原始行尾\r\n';
 const value=readPost(text);(value.fields.images as any[])[0].alt='新图注';
 const next=new TextDecoder().decode(planChanges({kind:'gallery',key:'旧中文相册',base:{commit:'a'.repeat(40),blobSha:'b'.repeat(40),text},value},text,new Map())[0].bytes);
 expect(next).toContain('credit: 作者');expect(next).toContain('# 原图');expect(next).toContain('# 图注');expect(next).toContain('alt: "新图注"');expect(next.endsWith('---  \r\n正文\n原始行尾\r\n')).toBe(true);
});
it('gallery 新图只发布本册且解析封面与图库引用',()=>{
 const bytes=new Uint8Array([1,2]),sha=writerHash(bytes),src='writer-asset:'+sha;
 const changes=planChanges({kind:'gallery',key:'new-album',base:null,value:{fields:{...fields,cover:src,images:[{src,alt:'新图'}]},body:'',assets:[{sha256:sha,alt:'新图'}]}},null,new Map([[sha,bytes]]));
 expect(changes.map(c=>c.path)).toEqual(['content/gallery/new-album/index.md',`content/gallery/new-album/writer-${sha}.webp`]);
 const next=readPost(new TextDecoder().decode(changes[0].bytes));expect(next.fields.cover).toBe(`./writer-${sha}.webp`);expect((next.fields.images as any[])[0].src).toBe(next.fields.cover);expect(next.fields.draft).toBe(false);
});
it('gallery 无改动资料保留原字节，排序复用源图片注释且改标题不规范正文行尾',()=>{
 const text='---\r\ntitle: 旧中文相册 # 标题\r\ndate: 2026-11-01\r\nimages:\r\n  - src: ./a.jpg # A\r\n    alt: 第一张\r\n    credit: 作者A\r\n  - src: ./b.jpg # B\r\n    alt: 第二张\r\n    credit: 作者B\r\nlayout: scatter\r\n---\r\n正文\n尾行\r\n';
 const value=readPost(text),base={commit:'a'.repeat(40),blobSha:'b'.repeat(40),text};
 const unchanged=new TextDecoder().decode(planChanges({kind:'gallery',key:'旧中文相册',base,value},text,new Map())[0].bytes);expect(unchanged).toBe(text.replace('---\r\n正文','"draft": false\r\n---\r\n正文'));
 (value.fields.images as any[]).reverse();value.fields.title='新标题';
 const changed=new TextDecoder().decode(planChanges({kind:'gallery',key:'旧中文相册',base,value},text,new Map())[0].bytes);expect(changed).toContain('src: ./a.jpg # A');expect(changed).toContain('src: ./b.jpg # B');expect(changed.indexOf('# B')).toBeLessThan(changed.indexOf('# A'));expect((readPost(changed).fields.images as any[]).map(i=>i.credit)).toEqual(['作者B','作者A']);expect(changed.endsWith('正文\n尾行\r\n')).toBe(true);
});

it('gallery 私密缓存中已解除引用的新图不复制进公开候选',()=>{
 const keep=new Uint8Array([1,2]),unused=new Uint8Array([3,4]),a=writerHash(keep),b=writerHash(unused);
 const changes=planChanges({kind:'gallery',key:'album',base:null,value:{fields:{...fields,images:[{src:'writer-asset:'+a,alt:'保留'}],cover:'writer-asset:'+a},body:'',assets:[{sha256:a,alt:''},{sha256:b,alt:''}]}},null,new Map([[a,keep]]));
 expect(changes.map(c=>c.path)).toEqual(['content/gallery/album/index.md',`content/gallery/album/writer-${a}.webp`]);
});
