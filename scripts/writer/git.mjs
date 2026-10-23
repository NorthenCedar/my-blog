import { spawnSync } from 'node:child_process';
import { writerFail } from '../../src/lib/writer/model.ts';
export function gitRunner(repoDir){return args=>spawnSync('git',['-c','core.hooksPath='+repoDir+'/.git/writer-no-hooks',...args],{cwd:repoDir,encoding:'utf8',maxBuffer:4*1024*1024,timeout:30000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});}
export function gitText(run,args){const result=run(args);if(result.status!==0) writerFail(502,'git_failed','Git 操作未完成，请查看任务阶段后重试');return result.stdout.trim();}
export function remoteHead(run){const result=gitText(run,['ls-remote','--exit-code','origin','refs/heads/main']);const sha=result.split(/\s+/)[0];if(!/^[a-f0-9]{40}$/.test(sha)) writerFail(502,'git_failed','远端 main 读取失败');return sha;}
