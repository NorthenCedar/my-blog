import {expect,it,vi} from 'vitest';
import {gitFixture} from './_writer-git';
import {prepare,verifySnapshotCandidate,assertCandidate} from '../scripts/writer/prepare.mjs';
import {writerHash} from '../src/lib/writer/content';
vi.setConfig({testTimeout:30000});
it('相册已有图片必须确实在本册目录，缺图在写入候选前拒绝',()=>{
 const git=gitFixture(),snapshot={kind:'gallery',key:'album',base:null,value:{fields:{title:'相册',date:'2026-11-01',images:[{src:'./missing.webp',alt:'不存在'}]},body:'',assets:[]}};
 expect(()=>prepare({repoDir:git.cloud,snapshot,assets:new Map(),jobId:'a'.repeat(32)})).toThrow(/相册照片不存在/);
 expect(git.must(git.cloud,['status','--porcelain'])).toBe('');
});
it('新相册上传图构成隔离候选且冻结复算完整',()=>{
 const git=gitFixture(),bytes=new Uint8Array([1,2]),sha=writerHash(bytes),src='writer-asset:'+sha;
 const snapshot={kind:'gallery',key:'中文册',base:null,value:{fields:{title:'相册',date:'2026-11-01',cover:src,images:[{src,alt:'照片'}]},body:'',assets:[{sha256:sha,alt:'照片'}]}};
 const assets=new Map([[sha,bytes]]),prepared=prepare({repoDir:git.cloud,snapshot,assets,jobId:'b'.repeat(32)});expect(prepared.paths).toEqual(['content/gallery/中文册/index.md',`content/gallery/中文册/writer-${sha}.webp`]);verifySnapshotCandidate({repoDir:git.cloud,prepared,snapshot,assets});
 for(const path of ['content/posts/other/index.md','content/gallery/other/index.md'])expect(()=>assertCandidate(git.cloud,{...prepared,paths:[...prepared.paths,path]})).toThrow();
});
