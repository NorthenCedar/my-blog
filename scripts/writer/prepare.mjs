import { lstatSync,readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { planChanges,readPost,writerHash } from '../../src/lib/writer/content.ts';
import { writerFail,writerId,validateTarget,writerTargetPath,writerAssetDirectory,utf8Length } from '../../src/lib/writer/model.ts';
import { gitRunner,gitText,remoteHead } from './git.mjs';
export function checkedPath(repoDir,path){
  if(path.includes('\\')||path.includes('\0')||path.includes('%')||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..')) writerFail(400,'invalid_path','候选路径越界');
  let current=resolve(repoDir);
  for(const part of path.split('/')){current=join(current,part);if(lstatSync(current,{throwIfNoEntry:false})?.isSymbolicLink()) writerFail(400,'symlink_rejected','发布目录包含符号链接，请在本地处理');}
  return current;
}
export function contentDigest(repoDir,paths){return writerHash(JSON.stringify([...paths].sort().map(path=>{const bytes=readFileSync(checkedPath(repoDir,path));return [path,bytes.length,writerHash(bytes)];})));}
export function assertCandidate(repoDir,prepared,run=gitRunner(repoDir)){
  writerId(prepared.jobId);const target=validateTarget(prepared.kind,prepared.key),allowed=new Set(prepared.paths);
  const targetPath=writerTargetPath(target.kind,target.key),directory=writerAssetDirectory(target.kind,target.key);
  if(allowed.size!==prepared.paths.length||prepared.paths.some(path=>path!==targetPath&&!(directory&&path.startsWith(directory)&&/^writer-[a-f0-9]{64}\.webp$/.test(path.slice(directory.length))))) writerFail(400,'invalid_path','候选文件超出本次内容范围');
  for(const path of prepared.paths){checkedPath(repoDir,path);const mode=gitText(run,['ls-files','--stage','--',path]).split(' ')[0];if(mode==='120000'||mode==='160000') writerFail(400,'symlink_rejected','候选文件不是普通文件');}
  const result=run(['status','--porcelain=v1','-z','--untracked-files=all']);
  if(result.status!==0) writerFail(502,'git_failed','无法读取工作区状态');
  const status=result.stdout;
  for(const row of status.split('\0').filter(Boolean)){
    const code=row.slice(0,2),path=row.slice(3);
    if(/[DRCU]/.test(code)||!allowed.has(path)) writerFail(409,'candidate_changed','校验期间出现内容范围以外的改动或删除，已停止发布');
  }
  if(contentDigest(repoDir,prepared.paths)!==prepared.contentDigest) writerFail(409,'candidate_changed','校验期间候选内容已变化，请重新校验');
}
export function prepare({repoDir,snapshot,assets,jobId}){
  writerId(jobId);validateTarget(snapshot.kind,snapshot.key);
  const run=gitRunner(repoDir),baseHead=gitText(run,['rev-parse','HEAD']);
  if(gitText(run,['status','--porcelain=v1','--untracked-files=all'])) writerFail(409,'dirty_checkout','发布工作区必须干净');
  if(remoteHead(run)!==baseHead) writerFail(409,'remote_changed','main 已更新，请在最新代码上重新校验');
  const path=writerTargetPath(snapshot.kind,snapshot.key),target=checkedPath(repoDir,path);
  const stagedMode=gitText(run,['ls-files','--stage','--',path]).split(' ')[0];if(stagedMode==='120000'||stagedMode==='160000') writerFail(400,'symlink_rejected','目标不是普通文件');
  if(snapshot.kind==='post'&&existsSync(join(repoDir,'content/posts'))){
    const wanted=snapshot.value.fields.slug??snapshot.key;
    for(const entry of readdirSync(join(repoDir,'content/posts'),{withFileTypes:true})){
      if(entry.name===snapshot.key||!entry.isDirectory()) continue;
      const other=`content/posts/${entry.name}/index.md`,file=checkedPath(repoDir,other);
      if(existsSync(file)&&(readPost(readFileSync(file,'utf8')).fields.slug??entry.name)===wanted) writerFail(409,'duplicate_slug','此文章网址已被另一篇文章使用');
    }
  }
  if(snapshot.kind==='gallery'){
    for(const image of snapshot.value.fields.images??[]){
      if(typeof image.src!=='string'||image.src.startsWith('writer-asset:'))continue;
      const imagePath=writerAssetDirectory('gallery',snapshot.key)+image.src.replace(/^\.\//,'');
      const file=checkedPath(repoDir,imagePath);
      if(!lstatSync(file,{throwIfNoEntry:false})?.isFile())writerFail(400,'missing_image','相册照片不存在，请重新选择或上传');
    }
  }
  const changes=planChanges(snapshot,existsSync(target)?readFileSync(target,'utf8'):null,assets);
  const text=new TextDecoder().decode(changes[0].bytes);
  if(utf8Length(JSON.stringify({commit:'0'.repeat(40),blobSha:'0'.repeat(40),text,itemHash:'0'.repeat(64)}))>262144) writerFail(413,'base_too_large','发布后的基线过大，请在本地处理');
  for(const change of changes){
    const destination=checkedPath(repoDir,change.path);
    if(change.path.endsWith('.webp')&&existsSync(destination)&&writerHash(readFileSync(destination))!==writerHash(change.bytes)) writerFail(409,'asset_collision','同名配图内容不一致，已停止发布');
    mkdirSync(resolve(destination,'..'),{recursive:true});writeFileSync(destination,change.bytes);
  }
  const prepared={jobId,kind:snapshot.kind,key:snapshot.key,baseHead,paths:changes.map(c=>c.path),contentDigest:contentDigest(repoDir,changes.map(c=>c.path))};
  assertCandidate(repoDir,prepared,run);return prepared;
}
/** 校验后从服务端重新取得快照，独立重算候选，不信任安装/测试可能改写的本地记录。 */
export function verifySnapshotCandidate({repoDir,prepared,snapshot,assets}){
  const run=gitRunner(repoDir),{kind,key}=validateTarget(snapshot.kind,snapshot.key);
  if(kind!==prepared.kind||key!==prepared.key||!/^[a-f0-9]{40}$/.test(prepared.baseHead))writerFail(409,'candidate_changed','候选与发布快照不一致');
  const path=writerTargetPath(kind,key),original=run(['show',`${prepared.baseHead}:${path}`]);
  const changes=planChanges(snapshot,original.status===0?original.stdout:null,assets),expected=writerHash(JSON.stringify(changes.map(c=>[c.path,c.bytes.length,writerHash(c.bytes)]).sort((a,b)=>a[0].localeCompare(b[0]))));
  if(JSON.stringify([...prepared.paths].sort())!==JSON.stringify(changes.map(c=>c.path).sort())||expected!==prepared.contentDigest)writerFail(409,'candidate_changed','候选摘要与服务端快照不一致');
  assertCandidate(repoDir,prepared,run);
}
