import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { assertCandidate } from './prepare.mjs';
import { writerFail } from '../../src/lib/writer/model.ts';
export function verifyPrepared({repoDir,prepared}){
  assertCandidate(repoDir,prepared);
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(?:WRITER_|GITHUB_TOKEN$|GH_TOKEN$|GIT_CONFIG_|npm_config_|npm_package_|npm_lifecycle_|INIT_CWD$)/i.test(key)));
  const npmCli=process.env.npm_execpath?join(dirname(process.env.npm_execpath),'npm-cli.js'):undefined;
  for(const args of [['ci'],['run','verify']]){
    const command=npmCli&&existsSync(npmCli)?process.execPath:'npm',parameters=command===process.execPath?[npmCli,...args]:args;
    const result=spawnSync(command,parameters,{cwd:repoDir,env,encoding:'utf8',maxBuffer:8*1024*1024,timeout:8*60000});
    // 输出可能含正文或断言，不能原样写入 Actions 日志。
    if(result.status!==0) writerFail(422,'validation_failed',args[0]==='ci'?'干净安装未通过，内容尚未推送':'完整构建及测试未通过，内容尚未推送');
  }
  assertCandidate(repoDir,prepared);
  return {...prepared,verifiedDigest:prepared.contentDigest,verifiedHead:prepared.baseHead};
}
