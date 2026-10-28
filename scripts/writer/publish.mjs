import { writerFail,writerId,writerKindLabel } from '../../src/lib/writer/model.ts';
import { assertCandidate } from './prepare.mjs';
import { gitRunner,gitText,remoteHead } from './git.mjs';
/** 调用方必须先在候选目录完成 npm ci 和 npm run verify；工作流严格分步隔离凭据。 */
export async function publish({repoDir,prepared,authorize,runGit=gitRunner(repoDir)}){
  const run=runGit;
  writerId(prepared.jobId);
  const known=gitText(run,['log','-1','--format=%H','--fixed-strings',`--grep=Writer-Job: ${prepared.jobId}`]);
  if(known){
    gitText(run,['fetch','--no-tags','origin','main']);
    if(run(['merge-base','--is-ancestor',known,'FETCH_HEAD']).status===0) return {commit:known,pushed:true};
    writerFail(409,'push_unconfirmed','本地已有任务提交但远端尚未确认，请查询原任务');
  }
  if(gitText(run,['rev-parse','HEAD'])!==prepared.baseHead||remoteHead(run)!==prepared.baseHead) writerFail(409,'remote_changed','main 已更新，必须重新校验');
  assertCandidate(repoDir,prepared,run);
  const permission=await authorize();
  if(!permission||permission.expiresAt<=Date.now()) writerFail(409,'push_not_authorized','推送许可已失效');
  if(remoteHead(run)!==prepared.baseHead) writerFail(409,'remote_changed','申请许可期间 main 已更新，请重新校验');
  assertCandidate(repoDir,prepared,run);
  gitText(run,['add','--',...prepared.paths]);
  gitText(run,['-c','user.name=North_Cedar','-c','user.email=cloud-writer@users.noreply.github.com','commit','--allow-empty','-m',`云端写作：${writerKindLabel(prepared.kind)} ${prepared.key}\n\nWriter-Job: ${prepared.jobId}`]);
  const commit=gitText(run,['rev-parse','HEAD']);
  if(permission.expiresAt<=Date.now()) writerFail(409,'push_not_authorized','推送许可已失效，提交尚未推送');
  const result=run(['push','origin','HEAD:refs/heads/main']);
  // 无论应答成功与否，按准确提交核对；丢失应答不能造成第二个内容提交。
  const fetched=run(['fetch','--no-tags','origin','main']);
  if(fetched.status===0&&run(['merge-base','--is-ancestor',commit,'FETCH_HEAD']).status===0) return {commit,pushed:true};
  if(result.status!==0) writerFail(409,'push_unconfirmed','推送结果未确定，请查询原任务，不要再次提交正文');
  writerFail(502,'push_unconfirmed','推送已应答，远端确认暂不可用，请稍后查询');
}
