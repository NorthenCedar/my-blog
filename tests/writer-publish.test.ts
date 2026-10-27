import { expect,it,vi } from 'vitest';
import { readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { gitFixture } from './_writer-git';
import { prepare,verifySnapshotCandidate,contentDigest } from '../scripts/writer/prepare.mjs';
import { publish } from '../scripts/writer/publish.mjs';
import { verifyPrepared } from '../scripts/writer/validate.mjs';
// 真实 Git 子进程在 Windows 与全量并发校验中会超过默认 5 秒；没有网络操作。
// ★ 必须落在文件最前面：testTimeout 是在 it() 注册时读取的，写在用例之后只对后面注册的用例生效。
vi.setConfig({testTimeout:30000});
const value={fields:{title:'标题',date:'2026-10-23',summary:'简介',tags:['随笔']},body:'手机文章\n',assets:[]};
const snapshot={id:'a'.repeat(32),kind:'post',key:'phone-a',revision:1,base:null,publishedRevision:0,value};
const jobId='b'.repeat(32);
it('运行器收到非 JSON 平台错误时保留 HTTP 状态，不回显正文或重复请求',()=>{
  const s=gitFixture(),moduleUrl=pathToFileURL(join(process.cwd(),'scripts/writer/run.mjs')).href;
  const code=`import {runPhase} from ${JSON.stringify(moduleUrl)};let calls=0;globalThis.fetch=async()=>{calls++;return new Response('不应泄露的远端正文',{status:503});};try{await runPhase('probe');process.exitCode=1;}catch(error){if(error.code!=='runner_http_503'||calls!==1)throw error;console.log(error.code);}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:s.cloud,encoding:'utf8',env:{...process.env,RUNNER_TEMP:s.root,WRITER_JOB_ID:'0'.repeat(32),WRITER_RUN_ID:'1002',GITHUB_REPOSITORY:'NorthenCedar/personal',GITHUB_REF:'refs/heads/main',WRITER_RUNNER_SECRET:'s'.repeat(64)}});
  expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('runner_http_503');expect(result.stdout+result.stderr).not.toContain('不应泄露的远端正文');
});
it('Node 实际重查阶段跳过准备、verify 和推送，只读取准确部署并回传',()=>{
  const s=gitFixture(),moduleUrl=pathToFileURL(join(process.cwd(),'scripts/writer/run.mjs')).href;
  const code=`
    import {runPhase} from ${JSON.stringify(moduleUrl)};
    const calls=[],commit='3'.repeat(40);
    globalThis.fetch=async(url,init)=>{
      if(String(url).includes('/check-runs'))return Response.json({check_runs:[{head_sha:commit,app:{id:85455,slug:'cloudflare-workers-and-pages'},details_url:'https://dash.cloudflare.com/4bcfa9cf29fad54bd0ca74b90903a10c/pages/view/personal/deployments/example',status:'completed',conclusion:'success'}]});
      const body=JSON.parse(init.body);calls.push(body.action);
      if(body.action==='claim')return Response.json({deploymentOnly:true,commit,lease:'f'.repeat(64)});
      if(body.action==='deployment'&&body.commit===commit&&body.state==='deployed')return Response.json({job:{state:'deployed'}});
      throw Error('不应准备、校验或推送正文：'+body.action);
    };
    for(const phase of ['prepare','verify','publish','deployment'])await runPhase(phase);
    if(JSON.stringify(calls)!==JSON.stringify(['claim','deployment']))throw Error('运行调用不对');
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:s.cloud,encoding:'utf8',env:{...process.env,RUNNER_TEMP:s.root,WRITER_JOB_ID:jobId,WRITER_RUN_ID:'1002',GITHUB_REPOSITORY:'NorthenCedar/personal',GITHUB_REF:'refs/heads/main',WRITER_RUNNER_SECRET:'s'.repeat(64),GITHUB_TOKEN:'只读临时令牌'}});
  expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('本次只重新检查上线');
  expect(s.must(s.cloud,['status','--porcelain'])).toBe('');expect(s.must(s.remote,['rev-list','--count','main'])).toBe('1');
});
it('真正准备候选并普通推送，重复执行同一任务不产生第二次提交',async()=>{
  const s=gitFixture(),prepared=prepare({repoDir:s.cloud,snapshot,assets:new Map(),jobId});
  expect(prepared.paths).toEqual(['content/posts/phone-a/index.md']);
  verifySnapshotCandidate({repoDir:s.cloud,prepared,snapshot,assets:new Map()});
  const result=await publish({repoDir:s.cloud,prepared,authorize:async()=>({expiresAt:Date.now()+30000})});
  expect(result.pushed).toBe(true);expect(s.must(s.remote,['show','main:content/posts/phone-a/index.md'])).toContain('手机文章');
  expect((await publish({repoDir:s.cloud,prepared,authorize:async()=>{throw Error('不应再次申请');}})).commit).toBe(result.commit);
  expect(s.must(s.remote,['log','-1','--format=%B'])).toContain(`Writer-Job: ${jobId}`);
});
it('本地候选与摘要同时被改，也必须与服务端不可变快照比对',()=>{
  const s=gitFixture(),prepared=prepare({repoDir:s.cloud,snapshot,assets:new Map(),jobId});
  writeFileSync(join(s.cloud,prepared.paths[0]),'替换了正文');prepared.contentDigest=contentDigest(s.cloud,prepared.paths);
  expect(()=>verifySnapshotCandidate({repoDir:s.cloud,prepared,snapshot,assets:new Map()})).toThrow('快照不一致');
});
it('云端多篇内容与本地代码分叉，普通推送拒绝，合并后都保留',async()=>{
  const s=gitFixture();
  for(const [key,id] of [['phone-a','b'],['phone-b','c']]){
    const prepared=prepare({repoDir:s.cloud,snapshot:{...snapshot,key},assets:new Map(),jobId:id.repeat(32)});
    await publish({repoDir:s.cloud,prepared,authorize:async()=>({expiresAt:Date.now()+30000})});
  }
  s.localCommit('src/local-change.ts','export const n = 1');expect(s.localPush().status).not.toBe(0);s.localMergeRemote();
  expect(s.localRead('content/posts/phone-b/index.md')).toContain('手机文章');expect(s.localRead('src/local-change.ts')).toBe('export const n = 1');expect(s.localPush().status).toBe(0);
});
it('校验期间远端更新时停止，不能覆盖新内容',async()=>{
  const s=gitFixture(),prepared=prepare({repoDir:s.cloud,snapshot,assets:new Map(),jobId});
  s.localCommit('content/posts/from-desktop/index.md','桌面新文章');expect(s.localPush().status).toBe(0);
  await expect(publish({repoDir:s.cloud,prepared,authorize:async()=>({expiresAt:Date.now()+30000})})).rejects.toMatchObject({code:'remote_changed'});
  expect(s.must(s.remote,['show','main:content/posts/from-desktop/index.md'])).toBe('桌面新文章');
});
it('构建后内容被改、源码越界、删除文件均停止',async()=>{
  for(const kind of ['mutate','source','delete']){
    const s=gitFixture(),prepared=prepare({repoDir:s.cloud,snapshot,assets:new Map(),jobId});
    if(kind==='mutate') writeFileSync(join(s.cloud,prepared.paths[0]),'被改动');
    if(kind==='source') s.write(s.cloud,'src/source.ts','越界源码');
    if(kind==='delete') s.must(s.cloud,['rm','README.md']);
    await expect(publish({repoDir:s.cloud,prepared,authorize:async()=>({expiresAt:Date.now()+30000})})).rejects.toBeDefined();
  }
});
it('Node 24 可直接运行共用内容模块，不依赖 Vite 的扩展名解析',()=>{
  const result=spawnSync(process.execPath,['--input-type=module','-e',"import { readPost } from './src/lib/writer/content.ts'; console.log(readPost('---\\ntitle: x\\n---\\n正文').body)"],{cwd:process.cwd(),encoding:'utf8'});
  expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('正文');
});
it('编辑已有文章能进入候选，提交应答丢失后按远端祖先链确认',async()=>{
  const s=gitFixture(),text='---\ntitle: 旧题\ndate: 2026-10-23\nsummary: 简介\ntags: [随笔]\ndraft: false\n---\n旧正文\n';
  s.cloudCommit('content/posts/phone-a/index.md',text);
  const head=s.must(s.cloud,['rev-parse','HEAD']),prepared=prepare({repoDir:s.cloud,snapshot:{...snapshot,base:{commit:head,blobSha:'1'.repeat(40),text}},assets:new Map(),jobId});
  const result=await publish({repoDir:s.cloud,prepared,authorize:async()=>({expiresAt:Date.now()+30000}),runGit:(args:string[])=>{
    const result=s.git(s.cloud,args);return args[0]==='push'?{...result,status:1,stderr:'模拟丢失应答'}:result;
  }});
  expect(result.pushed).toBe(true);expect(s.must(s.remote,['show','main:content/posts/phone-a/index.md'])).toContain('手机文章');
});
it('临时检出实际执行 npm ci 与 verify，验证阶段不接收发布凭据',()=>{
  const s=gitFixture(),name='nc-writer-fixture';
  const command=`node -e "if(process.env.WRITER_PUBLISH_TOKEN||process.env.GITHUB_TOKEN)process.exit(1);require('node:fs').accessSync('content/posts/phone-a/index.md')"`;
  s.cloudCommit('package.json',JSON.stringify({name,version:'1.0.0',scripts:{verify:command}}));
  s.cloudCommit('package-lock.json',JSON.stringify({name,version:'1.0.0',lockfileVersion:3,requires:true,packages:{'':{name,version:'1.0.0'}}}));
  const prepared=prepare({repoDir:s.cloud,snapshot,assets:new Map(),jobId});
  const previous=process.env.WRITER_PUBLISH_TOKEN;process.env.WRITER_PUBLISH_TOKEN='仅测试隔离';
  try{expect(verifyPrepared({repoDir:s.cloud,prepared}).verifiedDigest).toBe(prepared.contentDigest);}finally{if(previous===undefined)delete process.env.WRITER_PUBLISH_TOKEN;else process.env.WRITER_PUBLISH_TOKEN=previous;}
},20000);
