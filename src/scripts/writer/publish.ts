import { WriterApiError,type writerApi } from './api';
import type { WriterDraft,WriterJob } from '../../lib/writer/model';
import { writerKindLabel } from '../../lib/writer/model';
import { el,button,errorText } from './ui';
export const JOB_LABELS:Record<string,string>={queued:'等待运行',dispatch_unknown:'正在查询触发结果',validating:'完整校验中',ready:'已取得推送许可',pushed:'已推送，网站部署中',deployed:'已上线',conflict:'内容冲突，草稿仍保留',failed:'发布未完成，草稿仍保留',cancelled:'已取消',deployment_failed:'已推送，网站部署失败'};
const terminals=new Set(['deployed','conflict','failed','cancelled','deployment_failed']);
export const shouldPollJob=(job:WriterJob|null)=>!job||!terminals.has(job.state)||['deployment_check_queued','deployment_check_running','deployment_dispatch_unknown'].includes(job.code??'');
export const jobStorageKey=(owner:string)=>'nc-writer-job-'+owner;
const delays=[2000,4000,8000,15000];
type JobRecord={requestId:string;draftId:string;revision:number;id?:string};
type JobTarget={id?:string;record?:JobRecord;job?:WriterJob;pollIndex:number;pollBlocked?:boolean;retryAt?:number};
export function mountPublish(root:HTMLElement,api:typeof writerApi,options:{owner:string;onPublished?:(job:WriterJob)=>Promise<unknown>}){
  let disposed=false,pageHidden=false,timer:ReturnType<typeof setTimeout>|undefined,reading:AbortController|undefined;
  let target:JobTarget|null=null,mutating:JobTarget|null=null;
  const seenCommits=new Set<string>(),storageKey=jobStorageKey(options.owner);
  const status=el('p','','writer-status'),message=el('p','','writer-note'),actions=el('div','','writer-toolbar');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');

  function saveRecord(record:JobRecord,update=false){
    try{
      // 旧标签收到的回执不能盖掉本设备刚确认的另一个任务。
      if(update&&JSON.parse(localStorage.getItem(storageKey)??'null')?.requestId!==record.requestId)return;
      localStorage.setItem(storageKey,JSON.stringify(record));
    }catch{message.textContent='本设备无法记录任务入口，可从发布记录重新查询。';}
  }
  function rememberJob(next:JobTarget,job:WriterJob){
    next.id=job.id;
    if(next.record&&next.record.id!==job.id){next.record.id=job.id;saveRecord(next.record,true);}
  }
  function stopTimer(){if(timer!==undefined)clearTimeout(timer);timer=undefined;}
  function pauseReading(){
    stopTimer();const previous=reading;reading=undefined;previous?.abort();
  }
  function select(next:JobTarget|null){pauseReading();target=next;}
  const isCurrent=(next:JobTarget)=>!disposed&&root.isConnected&&target===next;
  const visible=()=>!pageHidden&&!document.hidden;
  function lookupPath(next:JobTarget){
    const path=next.id?'/publish?id='+next.id:'/publish?requestId='+next.record!.requestId;
    // 限流时仍读取运行器实时写入的轻量状态，到了可重试时间再访问 GitHub。
    return (next.retryAt??0)>Date.now()?path+'&statusOnly=1':path;
  }
  function rememberRetry(next:JobTarget,error:unknown){
    if(error instanceof WriterApiError&&error.retryAt!==undefined)next.retryAt=error.retryAt;
  }
  function needsPolling(next:JobTarget){
    const commit=next.job?.commit;
    return !next.pollBlocked&&(shouldPollJob(next.job??null)||!!commit&&!seenCommits.has(commit));
  }
  function schedule(){
    stopTimer();
    if(!target||!isCurrent(target)||!visible()||reading||mutating===target||!needsPolling(target))return;
    timer=setTimeout(()=>void query(),delays[Math.min(target.pollIndex++,delays.length-1)]);
  }
  async function show(next:JobTarget,job:WriterJob){
    rememberJob(next,job);
    if(!isCurrent(next)||!visible())return;
    next.job=job;next.pollBlocked=false;
    root.hidden=false;root.replaceChildren(el('h2','本次发布'),status,message,actions);
    status.textContent=job.code==='deployment_check_running'?'正在重新检查上线':job.code==='push_unconfirmed'?'推送结果待确认，请查询运行记录':job.code==='owner_closed_unconfirmed'?'已结束待确认任务，请核对仓库内容':JOB_LABELS[job.state]??'正在查询';
    message.textContent=job.code==='deployment_dispatch_unknown'?'部署检查触发结果待确认，请查看运行日志；不会自动重复触发。':job.code==='deployment_check_queued'?'独立部署检查已排队，只查询原提交，不再提交正文。':job.code==='deployment_pending'?'本次等待结束，部署仍待确认；可单独重新检查上线，无须再次发布正文。':job.state==='deployment_failed'?'内容提交仍在仓库中，网站可能继续显示上次成功版本。修复部署后点击“重新检查上线”，不必再次提交正文。':job.state==='ready'?'任务已获推送许可，正在确认实际结果。此时不能保证取消尚未完成的跨服务操作。':job.state==='dispatch_unknown'?'触发应答尚未确定；查询会寻找已有运行，不会重复提交正文。':'';
    actions.replaceChildren();
    if(job.runId){const link=el('a','查看运行日志');link.href=`https://github.com/NorthenCedar/personal/actions/runs/${job.runId}`;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}
    actions.append(button('重新查询',()=>query(true)));
    if(['pushed','deployment_failed'].includes(job.state))actions.append(button('重新检查上线',()=>mutate(next,()=>post({action:'check_deployment',id:job.id}))));
    if(job.state==='ready'&&job.code==='push_unconfirmed')actions.append(button('结束已停止的待确认任务',()=>{
      if(confirm('请先检查运行日志和仓库。结束只会解除发布占用，不代表本次未推送，也不会撤销仓库提交。确认继续？'))return mutate(next,()=>post({action:'close_unconfirmed',id:job.id,confirm:true}));
    }));
    if(['queued','dispatch_unknown','validating'].includes(job.state))actions.append(button('取消发布',()=>mutate(next,()=>post({action:'cancel',id:job.id}))));
    if(job.commit&&!seenCommits.has(job.commit)){
      seenCommits.add(job.commit);
      try{await options.onPublished?.(job);}
      catch(error){seenCommits.delete(job.commit);schedule();throw error;}
    }
  }
  async function query(manual=false){
    if(disposed)return;
    if(!root.isConnected){dispose();return;}
    const next=target;
    if(!next||!visible()||mutating===next||reading||!manual&&!needsPolling(next))return;
    stopTimer();const controller=new AbortController();reading=controller;
    try{
      const result=await api<{job:WriterJob}>(lookupPath(next),{signal:controller.signal});
      if(!controller.signal.aborted)await show(next,result.job);
    }catch(error){
      if(!controller.signal.aborted&&isCurrent(next)){
        next.pollBlocked=(error as {status?:number}).status===401;
        rememberRetry(next,error);
        message.textContent=errorText(error);
      }
    }finally{
      if(reading===controller){reading=undefined;schedule();}
    }
  }
  const post=(body:object)=>api<{job:WriterJob}>('/publish',{method:'POST',body:JSON.stringify(body)});
  async function mutate(next:JobTarget,send:()=>Promise<{job:WriterJob}>,showFailure=(error:unknown)=>{message.textContent=errorText(error);}){
    if(mutating||!isCurrent(next))return;
    mutating=next;pauseReading();
    try{await show(next,(await send()).job);}
    catch(error){if(isCurrent(next)){rememberRetry(next,error);showFailure(error);}}
    finally{mutating=null;schedule();}
  }
  function resume(){
    if(!target)return;
    target.pollBlocked=false;
    const state=target.job?.state;
    void query(state==='failed'||state==='deployment_failed');
  }
  function visibilityChanged(){if(document.hidden)pauseReading();else resume();}
  function pageLeft(event:PageTransitionEvent){
    if(event.persisted){pageHidden=true;pauseReading();}
    else dispose();
  }
  function pageReturned(event:PageTransitionEvent){if(event.persisted){pageHidden=false;resume();}}
  function dispose(){
    disposed=true;select(null);
    document.removeEventListener('visibilitychange',visibilityChanged);
    window.removeEventListener('pagehide',pageLeft);window.removeEventListener('pageshow',pageReturned);
  }
  document.addEventListener('visibilitychange',visibilityChanged);
  window.addEventListener('pagehide',pageLeft);window.addEventListener('pageshow',pageReturned);

  function displayLookup(){
    status.textContent='正在查询';message.textContent='';actions.replaceChildren(button('重新查询',()=>query(true)));
    root.replaceChildren(status,message,actions);root.hidden=false;
  }
  return {
    async open(draft:WriterDraft){
      if(disposed)return;
      select(null);
      const summary=String((draft.kind==='project'?draft.value.fields.summary:draft.kind==='forge'?(draft.key==='links'||draft.key==='resources'?draft.value.fields.intro:draft.value.fields.description):undefined)??draft.value.body);
      root.hidden=false;root.replaceChildren(el('h2','确认发布'),el('p',`${writerKindLabel(draft.kind,draft.key)} · ${String(draft.value.fields.title??draft.key)}`),el('p',`${summary.slice(0,160)}${summary.length>160?'…':''}`),el('p',`${draft.value.assets.length} 张已上传配图 · 本次只发布当前已保存版本`,'writer-note'),status,message,actions);
      status.textContent='请确认本次内容';message.textContent='发布后会在云端完整构建与测试，通过后推送到网站。';
      const requestId=crypto.randomUUID().replaceAll('-',''),record={requestId,draftId:draft.id,revision:draft.revision};
      const next:JobTarget={record,pollIndex:0};
      const confirmButton=button('确认发布',()=>{
        if(mutating||disposed||!confirmButton.isConnected)return;
        if(target!==next){select(next);saveRecord(record);}
        confirmButton.disabled=true;
        return mutate(next,async()=>{
          try{return await api<{job:WriterJob}>(lookupPath(next));}
          catch(error){if((error as {status?:number}).status!==404)throw error;}
          return post({action:'publish',draftId:record.draftId,revision:record.revision,requestId});
        },error=>{
          const statusCode=(error as {status?:number}).status;
          next.pollBlocked=statusCode!==undefined&&statusCode>=400&&statusCode<500&&statusCode!==429;
          status.textContent='发布尚未确认，草稿仍保留';message.textContent=errorText(error);confirmButton.disabled=false;
        });
      },'primary');
      actions.replaceChildren(confirmButton,button('先不发布',()=>{select(null);root.hidden=true;}));root.scrollIntoView({block:'nearest'});
    },
    async openJob(id:string){
      if(disposed)return;
      const next:JobTarget={id,pollIndex:0};select(next);displayLookup();await query();
      if(isCurrent(next))root.scrollIntoView({block:'nearest'});
    },
    async restore(){
      if(disposed)return;
      let record:JobRecord;
      try{record=JSON.parse(localStorage.getItem(storageKey)??'null');}catch{return;}
      if(!record||!/^[a-f0-9]{32}$/.test(record.requestId)||!/^[a-f0-9]{32}$/.test(record.draftId))return;
      select({record,id:/^[a-f0-9]{32}$/.test(record.id??'')?record.id:undefined,pollIndex:0});displayLookup();await query();
    },
    dispose,
  };
}
