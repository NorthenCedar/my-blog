import { mkdirSync,readFileSync,writeFileSync,existsSync,lstatSync,rmSync } from 'node:fs';
import { join,resolve,sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writerId,writerFail } from '../../src/lib/writer/model.ts';
import { createHash } from 'node:crypto';
const endpoint='https://northcedar.top/api/writer/runner';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function context(){
  const jobId=writerId(process.env.WRITER_JOB_ID),runId=process.env.WRITER_RUN_ID;
  if(!/^\d{1,20}$/.test(runId??'')||process.env.GITHUB_REPOSITORY!=='NorthenCedar/personal'||process.env.GITHUB_REF!=='refs/heads/main'||!process.env.RUNNER_TEMP)writerFail(403,'invalid_runner','只能在固定仓库主分支的发布工作流运行');
  const base=resolve(process.env.RUNNER_TEMP),directory=join(base,'northcedar-writer-'+jobId);
  if(!directory.startsWith(base+sep)||lstatSync(directory,{throwIfNoEntry:false})?.isSymbolicLink())writerFail(400,'invalid_path','私密临时目录不安全');
  return {jobId,runId,directory,record:join(directory,'state.json')};
}
function saveState(ctx,state){if(lstatSync(ctx.record,{throwIfNoEntry:false})?.isSymbolicLink())writerFail(400,'invalid_path','任务文件不安全');writeFileSync(ctx.record,JSON.stringify(state),{mode:0o600});}
async function call(ctx,action,data={},binary=false){
  const secret=process.env.WRITER_RUNNER_SECRET??'';if(Buffer.byteLength(secret)<32)writerFail(503,'runner_unavailable','运行凭据未配置');
  const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({action,jobId:ctx.jobId,runId:ctx.runId,...data})});
  if(!response.ok){const result=await response.json().catch(()=>({}));writerFail(response.status,/^[a-z0-9_]{1,80}$/.test(result.code??'')?result.code:'runner_request_failed','运行服务未确认本次操作');}
  return binary?new Uint8Array(await response.arrayBuffer()):response.json();
}
async function assetsFor(ctx,snapshot,lease){
  const assets=new Map();
  for(const {sha256:hash}of snapshot.value.assets){
    if(assets.has(hash))continue;
    const bytes=await call(ctx,'asset',{lease,sha256:hash},true);
    if(bytes.length>300*1024||sha256(bytes)!==hash)writerFail(400,'invalid_asset','配图摘要不一致');assets.set(hash,bytes);
  }
  return assets;
}
function gitCredentials(token){
  if(!token)writerFail(503,'repository_unavailable','仓库凭据未配置');
  process.env.GIT_CONFIG_COUNT='1';process.env.GIT_CONFIG_KEY_0='http.https://github.com/.extraheader';process.env.GIT_CONFIG_VALUE_0='AUTHORIZATION: basic '+Buffer.from('x-access-token:'+token).toString('base64');
}
export async function runPhase(phase){
  const ctx=context();
  if(phase==='probe'){
    if(ctx.jobId!=='0'.repeat(32))writerFail(400,'invalid_probe','核验任务标识不对');
    const result=await call(ctx,'probe'),{waitForDeployment}=await import('./deployment.mjs');
    await waitForDeployment(result.commit,{token:process.env.GITHUB_TOKEN,attempts:1});
    console.log('配置核验通过：共享密钥一致，仓库读取、运行身份及临时令牌 Checks 读取正常；未写草稿或推送内容');return;
  }
  if(phase==='cleanup'){
    if(existsSync(ctx.directory)){
      const marker=JSON.parse(readFileSync(join(ctx.directory,'owner.json'),'utf8'));
      if(marker.jobId!==ctx.jobId||marker.runId!==ctx.runId)writerFail(403,'invalid_path','拒绝清理其他任务资料');
      rmSync(ctx.directory,{recursive:true,force:true});
    }return;
  }
  if(phase==='prepare'){
    if(existsSync(ctx.directory))writerFail(409,'job_claimed','本次运行已存在任务资料');
    mkdirSync(ctx.directory,{mode:0o700});writeFileSync(join(ctx.directory,'owner.json'),JSON.stringify({jobId:ctx.jobId,runId:ctx.runId}),{mode:0o600});
    const claimed=await call(ctx,'claim'),state={lease:claimed.lease,snapshot:claimed.snapshot,...(claimed.deploymentOnly?{deploymentOnly:true,receipt:{commit:claimed.commit}}:{})};saveState(ctx,state);
    if(state.deploymentOnly){console.log('已有准确推送回执，本次只重新检查上线，不再提交正文');return;}
    const assets=await assetsFor(ctx,state.snapshot,state.lease),{prepare}=await import('./prepare.mjs');
    gitCredentials(process.env.GITHUB_TOKEN);state.prepared=prepare({repoDir:process.cwd(),snapshot:state.snapshot,assets,jobId:ctx.jobId});saveState(ctx,state);console.log('已准备发布候选；私密正文和图片未写入日志');return;
  }
  if(phase==='failure'){
    if(!existsSync(ctx.record))return;
    const state=JSON.parse(readFileSync(ctx.record,'utf8'));if(!state.lease)return;
    const code=state.failure??'workflow_failed';
    // 推送应答不确定时保留任务供准确提交恢复，不能凭旧 ref 回读就判失败。
    if(state.receipt||code==='push_unconfirmed')return;
    await call(ctx,'record',{lease:state.lease,state:['content_conflict','remote_changed'].includes(code)?'conflict':'failed',code}).catch(()=>{});console.log('失败阶段已记录；草稿仍保留');return;
  }
  const state=JSON.parse(readFileSync(ctx.record,'utf8'));
  if(state.deploymentOnly&&['verify','publish'].includes(phase))return;
  if(phase==='deployment'){
    if(!state.receipt?.commit)writerFail(409,'missing_receipt','尚无准确推送回执');
    // 先恢复应答丢失的推送回执；已有回执时幂等，不重复写正文。
    if(!state.deploymentOnly)await call(ctx,'record',{lease:state.lease,state:'pushed',commit:state.receipt.commit});
    const {waitForDeployment}=await import('./deployment.mjs'),result=await waitForDeployment(state.receipt.commit,{token:process.env.GITHUB_TOKEN});
    const event={lease:state.lease,commit:state.receipt.commit,state:result};
    try{await call(ctx,'deployment',event);}catch(error){if([401,403].includes(error?.status))throw error;await call(ctx,'deployment',event);}
    console.log(result==='deployed'?'准确提交的本站 Cloudflare 部署已成功':result==='deployment_failed'?'内容已推送，本站部署失败，请检查 Cloudflare 日志':'内容已推送，部署仍待确认；可单独重新检查，不必再发布正文');return;
  }
  if(phase==='verify'){
    const {verifyPrepared}=await import('./validate.mjs');state.prepared=verifyPrepared({repoDir:process.cwd(),prepared:state.prepared});saveState(ctx,state);console.log('干净安装、完整构建与测试通过');return;
  }
  if(phase==='publish'){
    if(state.prepared.verifiedDigest!==state.prepared.contentDigest||state.prepared.verifiedHead!==state.prepared.baseHead)writerFail(409,'verification_missing','候选尚未完整校验');
    const {snapshot}=await call(ctx,'snapshot',{lease:state.lease}),assets=await assetsFor(ctx,snapshot,state.lease),{verifySnapshotCandidate}=await import('./prepare.mjs');verifySnapshotCandidate({repoDir:process.cwd(),prepared:state.prepared,snapshot,assets});
    gitCredentials(process.env.WRITER_PUBLISH_TOKEN);
    const {publish}=await import('./publish.mjs');state.receipt=await publish({repoDir:process.cwd(),prepared:state.prepared,authorize:()=>call(ctx,'authorize',{lease:state.lease})});saveState(ctx,state);
    const receipt={lease:state.lease,state:'pushed',commit:state.receipt.commit};
    try{await call(ctx,'record',receipt);}catch{await call(ctx,'record',receipt).catch(()=>{});}
    console.log('内容已推送，网站部署结果可在写作台查询');return;
  }
  writerFail(400,'invalid_phase','未知发布阶段');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runPhase(process.argv[2]).catch(error=>{
    const code=/^[a-z0-9_]{1,80}$/.test(error?.code??'')?error.code:'runner_failed';
    try{const ctx=context();if(existsSync(ctx.record)){const state=JSON.parse(readFileSync(ctx.record,'utf8'));state.failure=code;saveState(ctx,state);}}catch{}
    console.error('写作任务未完成：'+code);process.exitCode=1;
  });
}
