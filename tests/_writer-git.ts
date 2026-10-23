import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { afterEach } from 'vitest';
const cleanups:(()=>void)[]=[];
afterEach(()=>cleanups.splice(0).forEach(fn=>fn()));
export function gitFixture(){
  const root=mkdtempSync(join(tmpdir(),'nc-writer-git-')),remote=join(root,'remote.git'),cloud=join(root,'cloud'),local=join(root,'local');
  cleanups.push(()=>rmSync(root,{recursive:true,force:true}));
  const git=(cwd:string,args:string[])=>spawnSync('git',args,{cwd,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  const must=(cwd:string,args:string[])=>{const r=git(cwd,args);if(r.status!==0) throw new Error(r.stderr);return r.stdout.trim();};
  mkdirSync(remote);must(remote,['init','--bare','--initial-branch=main']);must(root,['clone',remote,cloud]);
  const identify=(cwd:string)=>{must(cwd,['config','user.name','写作测试']);must(cwd,['config','user.email','writer-test@example.invalid']);must(cwd,['config','core.autocrlf','false']);};
  identify(cloud);
  const write=(cwd:string,path:string,text:string|Uint8Array)=>{mkdirSync(join(cwd,path,'..'),{recursive:true});writeFileSync(join(cwd,path),text);};
  const commit=(cwd:string,path:string,text:string|Uint8Array)=>{write(cwd,path,text);must(cwd,['add','--',path]);must(cwd,['commit','-m','测试内容']);};
  commit(cloud,'README.md','初始仓库');must(cloud,['push','origin','HEAD:refs/heads/main']);must(root,['clone',remote,local]);identify(local);
  return {root,remote,cloud,local,git,must,write,
    cloudCommit:(path:string,text:string)=>{commit(cloud,path,text);must(cloud,['push','origin','HEAD:refs/heads/main']);},
    localCommit:(path:string,text:string)=>commit(local,path,text),localPush:()=>git(local,['push','origin','HEAD:refs/heads/main']),
    localMergeRemote:()=>{must(local,['fetch','origin','main']);must(local,['merge','--no-edit','FETCH_HEAD']);},localRead:(path:string)=>readFileSync(join(local,path),'utf8'),
  };
}
