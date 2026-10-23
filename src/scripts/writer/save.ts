import type { WriterDraft,WriterValue,WriterSave,WriterBase } from '../../lib/writer/model';
export type SaveState='saved'|'unsaved'|'saving'|'device'|'error'|'conflict'|'reauth';
export type RecoveryCopy={value:WriterValue;revision:number;pending:WriterSave|null;serial:number;pendingSerial:number;updatedAt:number};
type Clock={now:()=>number;setTimeout:typeof setTimeout;clearTimeout:typeof clearTimeout};
type Options={load:()=>WriterDraft|Promise<WriterDraft>;save:(input:WriterSave)=>Promise<{revision:number}>;recovery:{put:(copy:RecoveryCopy)=>Promise<unknown>};clock?:Clock;onState:(state:SaveState,info:{backedUp:boolean;error?:unknown;revision:number})=>void;initialRecovery?:RecoveryCopy};
export function createSaveController(options:Options){
  const clock=options.clock??{now:Date.now,setTimeout,clearTimeout};
  let draft:WriterDraft,latest:WriterValue,revision=0,serial=0,pendingSerial=0,dirty=false,pending:WriterSave|null=null,disposed=false,blocked=false,backedUp=true,state:SaveState='saved';
  let debounce:ReturnType<typeof setTimeout>|undefined,maximum:ReturnType<typeof setTimeout>|undefined,flight:Promise<void>|null=null,persistQueue=Promise.resolve();
  const report=(next:SaveState,error?:unknown)=>{state=next;if(!disposed) options.onState(next,{backedUp,error,revision});};
  const copy=():RecoveryCopy=>({value:structuredClone(latest),revision,pending:pending?structuredClone(pending):null,serial,pendingSerial,updatedAt:clock.now()});
  function persist(){
    const record=copy();
    persistQueue=persistQueue.then(async()=>{if(disposed)return;try{await options.recovery.put(record);backedUp=true;}catch{backedUp=false;report(state);}});
    return persistQueue;
  }
  const ready=Promise.resolve(options.load()).then(loaded=>{
    draft=structuredClone(loaded);latest=structuredClone(loaded.value);revision=loaded.revision;
    if(options.initialRecovery){const recovery=options.initialRecovery;latest=structuredClone(recovery.value);revision=recovery.revision;pending=recovery.pending;serial=recovery.serial;pendingSerial=recovery.pendingSerial;dirty=true;report('unsaved');}
    else report('saved');
  });
  const clearTimers=()=>{if(debounce!==undefined) clock.clearTimeout(debounce);if(maximum!==undefined) clock.clearTimeout(maximum);debounce=maximum=undefined;};
  function schedule(){
    if(disposed||blocked) return;
    if(debounce!==undefined) clock.clearTimeout(debounce);
    const run=()=>{clearTimers();void sendOnce().then(()=>{if(dirty&&!blocked) schedule();}).catch(()=>{});};
    debounce=clock.setTimeout(run,2000);maximum??=clock.setTimeout(run,15000);
  }
  async function sendOnce(){
    await ready;if(disposed||(!dirty&&!pending)) return;
    if(flight) return flight;
    if(!pending){pending={id:draft.id,requestId:crypto.randomUUID().replaceAll('-',''),expectedRevision:revision,value:structuredClone(latest)};pendingSerial=serial;}
    const input=pending,startedSerial=pendingSerial;
    flight=(async()=>{
      await persist();if(disposed)return;report('saving');
      try{
        const response=await options.save(input);if(disposed) return;
        if(response.revision!==input.expectedRevision+1) throw {status:409,code:'unexpected_revision'};
        revision=response.revision;pending=null;blocked=false;dirty=serial!==startedSerial;
        await persist();report(dirty?'unsaved':'saved');
      }catch(error){
        if(disposed) return;
        const status=(error as {status?:number})?.status;blocked=status===409||status===401||status===403;
        await persist();report(status===409?'conflict':status===401||status===403?'reauth':error instanceof TypeError?'device':'error',error);throw error;
      }
    })();
    try{await flight;}finally{flight=null;}
  }
  return {
    ready,
    edit(value:WriterValue){if(disposed)return;latest=structuredClone(value);serial++;dirty=true;report('unsaved');void persist();schedule();},
    async saveNow(){await ready;clearTimers();if(flight) await flight;blocked=false;while(!disposed&&(dirty||pending)) await sendOnce();return this.current();},
    current():WriterDraft{return {...structuredClone(draft),revision,value:structuredClone(latest)};},
    async advanceBase(base:WriterBase,publishedRevision:number){await ready;if(disposed)return;draft.base=structuredClone(base);draft.publishedRevision=Math.max(draft.publishedRevision,publishedRevision);await persist();report(state);},
    recoveryCopy:copy,
    isDirty:()=>dirty||Boolean(pending),
    dispose(){disposed=true;clearTimers();return persistQueue;},
  };
}
