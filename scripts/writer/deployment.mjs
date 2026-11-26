// 仅供 Actions 的只读临时令牌使用，细粒度 PAT 不调用 Checks API。
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function deploymentState(checks,commit){
  if(!/^[a-f0-9]{40}$/.test(commit))fail('invalid_commit');
  const own=checks.filter(r=>{
    if(r.head_sha!==commit||r.app?.id!==85455||r.app?.slug!=='cloudflare-workers-and-pages')return false;
    try{const url=new URL(r.details_url),path=url.searchParams.get('to')??url.pathname;return url.origin==='https://dash.cloudflare.com'&&/^\/4bcfa9cf29fad54bd0ca74b90903a10c\/pages\/view\/personal\//.test(path);}catch{return false;}
  });
  if(!own.length||own.some(r=>r.status!=='completed'))return 'pending';
  return own.every(r=>r.conclusion==='success')?'deployed':'deployment_failed';
}
export async function waitForDeployment(commit,{token,fetchImpl=fetch,attempts=20,pause=()=>new Promise(resolve=>setTimeout(resolve,15000))}={}){
  if(!token||!/^[a-f0-9]{40}$/.test(commit))fail('deployment_query_unavailable');
  for(let attempt=0;attempt<attempts;attempt++){
    const response=await fetchImpl(`https://api.github.com/repos/NorthenCedar/my-blog/commits/${commit}/check-runs?filter=latest&per_page=100`,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'northcedar-cloud-writer'}});
    // 权限拒绝立即停止；不回显 GitHub 正文或凭据。
    if(!response.ok){await response.body?.cancel();fail('deployment_query_failed');}
    const reader=response.body?.getReader(),parts=[];let size=0;
    if(!reader)fail('deployment_response_invalid');
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024){await reader.cancel();fail('deployment_response_too_large');}parts.push(value);}}finally{reader.releaseLock();}
    const result=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!Array.isArray(result.check_runs)||result.total_count>100)fail('deployment_response_invalid');
    const state=deploymentState(result.check_runs,commit);if(state!=='pending')return state;
    if(attempt<attempts-1)await pause();
  }
  return 'pending';
}
