import { expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitFixture } from './_writer-git';
import { readPost,writerHash } from '../src/lib/writer/content';
import { prepare,assertCandidate,verifySnapshotCandidate } from '../scripts/writer/prepare.mjs';
import { publish } from '../scripts/writer/publish.mjs';
vi.setConfig({testTimeout:30000});

it('项目候选只允许当前项目文件，经过冻结复算后可普通推送本地裸远端',async()=>{
  const git=gitFixture(),value=readPost(readFileSync('content/projects/northcedar/index.md','utf8'));
  value.fields.title='新的本地项目夹具';value.body='只存在临时Git的制作记录\n';
  const snapshot={kind:'project',key:'fixture-project',base:null,value};
  const prepared=prepare({repoDir:git.cloud,snapshot,assets:new Map(),jobId:'a'.repeat(32)});
  expect(prepared.paths).toEqual(['content/projects/fixture-project/index.md']);
  verifySnapshotCandidate({repoDir:git.cloud,prepared,snapshot,assets:new Map()});
  const receipt=await publish({repoDir:git.cloud,prepared,authorize:async()=>({expiresAt:Date.now()+30000})});
  expect(receipt.pushed).toBe(true);
  expect(git.must(git.remote,['show','main:content/projects/fixture-project/index.md'])).toContain('只存在临时Git');
  expect(git.must(git.remote,['log','-1','--format=%B'])).toContain('造物台项目');
  expect(git.git(git.remote,['cat-file','-e','main:content/posts/fixture-project/index.md']).status).not.toBe(0);
});

it('页面候选只更新固定forge文件，不能混入另一页面或图片',()=>{
  const git=gitFixture(),text=readFileSync('content/pages/forge.md','utf8');
  git.cloudCommit('content/pages/forge.md',text);
  const value=readPost(text);value.fields.topline='新的页面文案';
  const snapshot={kind:'forge',key:'forge',base:{commit:git.must(git.cloud,['rev-parse','HEAD']),blobSha:'1'.repeat(40),text},value};
  const prepared=prepare({repoDir:git.cloud,snapshot,assets:new Map(),jobId:'b'.repeat(32)});
  expect(prepared.paths).toEqual(['content/pages/forge.md']);
  verifySnapshotCandidate({repoDir:git.cloud,prepared,snapshot,assets:new Map()});
  expect(readFileSync(join(git.cloud,'content/pages/forge.md'),'utf8')).toContain('新的页面文案');
  for(const path of ['content/pages/about.md','content/projects/other/index.md','src/assets/talks/writer-'+ 'c'.repeat(64)+'.webp']){
    expect(()=>assertCandidate(git.cloud,{...prepared,paths:[...prepared.paths,path]})).toThrow();
  }
});

it('友链候选支持导出已引用的上传头像到 public/avatars/friends/ 并保留既有头像',()=>{
  const git=gitFixture(),text=readFileSync('content/pages/links.md','utf8');
  git.cloudCommit('content/pages/links.md',text);
  const value=readPost(text);
  const bytes=new Uint8Array([9,8,7,6]),sha=writerHash(bytes);
  const groups=value.fields.groups as Array<{title:string;items:Array<{name:string;href:string;avatar?:string;desc?:string}>}>;
  expect(groups[0].items[0].avatar).toBe('/avatars/friends/willowxi.jpg');
  groups[0].items.push({name:'头像好友',href:'https://avatar.example.org/',avatar:'writer-asset:'+sha,desc:'带上传头像'});
  value.assets=[{sha256:sha,alt:'好友头像'}];
  const snapshot={kind:'forge',key:'links',base:{commit:git.must(git.cloud,['rev-parse','HEAD']),blobSha:'1'.repeat(40),text},value};
  const assets=new Map([[sha,bytes]]);
  const prepared=prepare({repoDir:git.cloud,snapshot,assets,jobId:'d'.repeat(32)});
  expect(prepared.paths).toEqual(['content/pages/links.md',`public/avatars/friends/writer-${sha}.webp`]);
  verifySnapshotCandidate({repoDir:git.cloud,prepared,snapshot,assets});
  const savedLinks=readFileSync(join(git.cloud,'content/pages/links.md'),'utf8');
  expect(savedLinks).toContain('/avatars/friends/willowxi.jpg');
  expect(savedLinks).toContain('https://northcedar.top/my-avatar');
  expect(savedLinks).toContain(`/avatars/friends/writer-${sha}.webp`);
});
