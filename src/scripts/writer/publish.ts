import type { writerApi } from './api';
import type { WriterDraft,WriterJob } from '../../lib/writer/model';
import { writerKindLabel } from '../../lib/writer/model';
import { el,button,errorText } from './ui';
export const JOB_LABELS:Record<string,string>={queued:'等待运行',dispatch_unknown:'正在查询触发结果',validating:'完整校验中',ready:'已取得推送许可',pushed:'已推送，网站部署中',deployed:'已上线',conflict:'内容冲突，草稿仍保留',failed:'发布未完成，草稿仍保留',cancelled:'已取消',deployment_failed:'已推送，网站部署失败'};
const terminals=new Set(['deployed','conflict','failed','cancelled','deployment_failed']);
export const shouldPollJob=(job:WriterJob|null)=>!job||!terminals.has(job.state)||['deployment_check_queued','deployment_check_running','deployment_dispatch_unknown'].includes(job.code??'');
export const jobStorageKey=(owner:string)=>'nc-writer-job-'+owner;
export function mountPublish(root:HTMLElement,api:typeof writerApi,options:{owner:string;onPublished?:(job:WriterJob)=>Promise<unknown>}){
  let disposed=false,timer:ReturnType<typeof setTimeout>|undefined,pollIndex=0,current:WriterJob|null=null,busy=false,record:{requestId:string;draftId:string;revision:number;id?:string}|null=null;
  const seenCommits=new Set<string>(),status=el('p','','writer-status'),message=el('p','','writer-note'),actions=el('div','','writer-toolbar');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const saveRecord=()=>{try{if(record)localStorage.setItem(jobStorageKey(options.owner),JSON.stringify(record));}catch{message.textContent='本设备无法记录任务入口，可从发布记录重新查询。';}};
  function stopTimer(){if(timer!==undefined)clearTimeout(timer);timer=undefined;}
  function schedule(){stopTimer();if(disposed||document.hidden||!root.isConnected||!shouldPollJob(current))return;timer=setTimeout(()=>void query(),[2000,4000,8000,15000][Math.min(pollIndex++,3)]);}
  async function show(job:WriterJob){
    if(disposed)return;current=job;root.hidden=false;root.replaceChildren(el('h2','本次发布'),status,message,actions);status.textContent=job.code==='deployment_check_running'?'正在重新检查上线':job.code==='push_unconfirmed'?'推送结果待确认，请查询运行记录':job.code==='owner_closed_unconfirmed'?'已结束待确认任务，请核对仓库内容':JOB_LABELS[job.state]??'正在查询';actions.replaceChildren();
    message.textContent=job.code==='deployment_dispatch_unknown'?'部署检查触发结果待确认，请查看运行日志；不会自动重复触发。':job.code==='deployment_check_queued'?'独立部署检查已排队，只查询原提交，不再提交正文。':job.code==='deployment_pending'?'本次等待结束，部署仍待确认；可单独重新检查上线，无须再次发布正文。':job.state==='deployment_failed'?'内容提交仍在仓库中，网站可能继续显示上次成功版本。修复部署后点击“重新检查上线”，不必再次提交正文。':job.state==='ready'?'任务已获推送许可，正在确认实际结果。此时不能保证取消尚未完成的跨服务操作。':job.state==='dispatch_unknown'?'触发应答尚未确定；查询会寻找已有运行，不会重复提交正文。':'';
    if(job.runId){const link=el('a','查看运行日志');link.href=`https://github.com/NorthenCedar/personal/actions/runs/${job.runId}`;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}
    actions.append(button('重新查询',()=>query()));
    if(['pushed','deployment_failed'].includes(job.state))actions.append(button('重新检查上线',async()=>{if(busy)return;busy=true;try{const result=await api('/publish',{method:'POST',body:JSON.stringify({action:'check_deployment',id:job.id})});await show(result.job);}catch(error){message.textContent=errorText(error);}finally{busy=false;}}));
    if(job.state==='ready'&&job.code==='push_unconfirmed')actions.append(button('结束已停止的待确认任务',async()=>{if(!confirm('请先检查运行日志和仓库。结束只会解除发布占用，不代表本次未推送，也不会撤销仓库提交。确认继续？'))return;try{const result=await api('/publish',{method:'POST',body:JSON.stringify({action:'close_unconfirmed',id:job.id,confirm:true})});await show(result.job);}catch(error){message.textContent=errorText(error);}}));
    if(['queued','dispatch_unknown','validating'].includes(job.state))actions.append(button('取消发布',async()=>{try{const result=await api('/publish',{method:'POST',body:JSON.stringify({action:'cancel',id:job.id})});await show(result.job);}catch(error){message.textContent=errorText(error);}}));
    if(job.commit&&!seenCommits.has(job.commit)){await options.onPublished?.(job);seenCommits.add(job.commit);}
    schedule();
  }
  async function query(){
    if(disposed||document.hidden||busy)return;if(!root.isConnected){dispose();return;}
    busy=true;try{const id=current?.id??record?.id,path=id?'/publish?id='+id:record?'/publish?requestId='+record.requestId:null;if(!path)return;const result=await api(path);if(record){record.id=result.job.id;saveRecord();}await show(result.job);}catch(error){message.textContent=errorText(error);if((error as {status?:number}).status!==401)schedule();}finally{busy=false;}
  }
  function visible(){if(!document.hidden){stopTimer();void query();}else stopTimer();}
  function dispose(){disposed=true;stopTimer();document.removeEventListener('visibilitychange',visible);}
  document.addEventListener('visibilitychange',visible);
  return {
    async open(draft:WriterDraft){
      const summary=String((draft.kind==='project'?draft.value.fields.summary:draft.kind==='forge'?draft.value.fields.description:undefined)??draft.value.body);
      stopTimer();current=null;root.hidden=false;root.replaceChildren(el('h2','确认发布'),el('p',`${writerKindLabel(draft.kind)} · ${String(draft.value.fields.title??draft.key)}`),el('p',`${summary.slice(0,160)}${summary.length>160?'…':''}`),el('p',`${draft.value.assets.length} 张已上传配图 · 本次只发布当前已保存版本`,'writer-note'),status,message,actions);status.textContent='请确认本次内容';message.textContent='发布后会在云端完整构建与测试，通过后推送到网站。';actions.replaceChildren();
      let requestId=crypto.randomUUID().replaceAll('-','');
      const confirm=button('确认发布',async()=>{
        if(busy)return;busy=true;confirm.disabled=true;record={requestId,draftId:draft.id,revision:draft.revision};saveRecord();
        try{
          let existing:any;try{existing=await api('/publish?requestId='+requestId);}catch(error){if((error as {status?:number}).status!==404)throw error;}
          const result=existing??await api('/publish',{method:'POST',body:JSON.stringify({action:'publish',draftId:draft.id,revision:draft.revision,requestId})});record.id=result.job.id;saveRecord();await show(result.job);
        }catch(error){status.textContent='发布尚未确认，草稿仍保留';message.textContent=errorText(error);confirm.disabled=false;}
        finally{busy=false;}
      },'primary');actions.append(confirm,button('先不发布',()=>{stopTimer();root.hidden=true;}));root.scrollIntoView({block:'nearest'});
    },
    async openJob(id:string){record=null;current={id} as WriterJob;root.replaceChildren(status,message,actions);root.hidden=false;await query();root.scrollIntoView({block:'nearest'});},
    async restore(){try{const data=JSON.parse(localStorage.getItem(jobStorageKey(options.owner))??'null');if(!data||!/^([a-f0-9]{32})$/.test(data.requestId)||!/^([a-f0-9]{32})$/.test(data.draftId))return;record=data;root.replaceChildren(status,message,actions);root.hidden=false;actions.append(button('重新查询',()=>query()));await query();}catch{}},
    dispose,
  };
}
