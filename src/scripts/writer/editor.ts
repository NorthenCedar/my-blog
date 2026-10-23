import type { writerApi } from './api';
import type { WriterDraft,WriterValue,WriterKind,WriterAssetRef } from '../../lib/writer/model';
import { publishedAssetHashes } from '../../lib/writer/model';
import { createSaveController,type RecoveryCopy } from './save';
import { createRecoveryStore,recoveryKey,type RecoveryRecord } from './recovery';
import { prepareWriterImage } from './images';
import { renderWriterMarkdown } from './preview';
import { el,button,field,download,errorText,SAVE_LABELS } from './ui';
import { JOB_LABELS } from './publish';
type Api=typeof writerApi;
type Store=ReturnType<typeof createRecoveryStore>;
type PendingImage={id:string;blob:Blob;alt:string;url:string;width?:number;height?:number;originalSize?:number};
type Options={user:{id:string;nickname:string};publish:boolean;onPublish?:(draft:WriterDraft,host:HTMLElement)=>Promise<void>;onJob?:(id:string)=>Promise<void>};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function mountWriterEditor(root:HTMLElement,api:Api,recovery:Store,options:Options){
  root.replaceChildren();const workspace=el('div','','writer-workspace'),sidebar=el('aside','','writer-sidebar'),catalog=el('details'),summary=el('summary','内容与草稿'),navigation=el('nav'),list=el('ul','','writer-list'),pane=el('section','','writer-editor'),notice=el('p','','writer-error');notice.hidden=true;notice.setAttribute('role','alert');
  catalog.open=matchMedia('(min-width:768px)').matches;catalog.append(summary,navigation,list);sidebar.append(catalog);workspace.append(sidebar,pane);root.append(notice,workspace);
  let active:WriterDraft|null=null,controller:ReturnType<typeof createSaveController>|null=null,generation=0,listGeneration=0,disposed=false,currentMode='drafts',pending:PendingImage[]=[],urls=new Set<string>(),tags:string[]=[];
  const status=el('p','','writer-status'),backup=el('p','','writer-backup');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const showError=(error:unknown)=>{notice.hidden=false;notice.textContent=errorText(error);};
  const perform=async(action:()=>Promise<unknown>)=>{notice.hidden=true;try{await action();}catch(error){showError(error);}};
  const releaseUrls=()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear();pending=[];};
  const imageUrl=(sha:string)=>'/api/writer/assets?sha256='+sha;
  const newValue=(kind:WriterKind):WriterValue=>({fields:kind==='post'?{title:'',date:today(),summary:'',tags:[],draft:false}:{date:today()},body:'',assets:[]});
  function markdownExport(){if(!controller)return;const d=controller.current();const text=d.kind==='post'?`---\n${Object.entries(d.value.fields).map(([k,v])=>JSON.stringify(k)+': '+JSON.stringify(v)).join('\n')}\n---\n${d.value.body}`:d.value.body;download(`${d.key}.md`,text,'text/markdown;charset=utf-8');}
  async function flush(){if(controller?.isDirty())await controller.saveNow();}
  async function loadList(mode=currentMode,commit?:string,page=1){
    currentMode=mode;const ticket=++listGeneration;list.replaceChildren(el('li','正在读取…'));let data:any;
    if(mode==='drafts')data=await api('/drafts');else if(mode==='jobs')data=await api('/publish');else data=await api(`/content?kind=${mode}&page=${page}${commit?'&commit='+commit:''}`);
    if(disposed||ticket!==listGeneration)return;list.replaceChildren();
    const items=mode==='drafts'?data.drafts:mode==='jobs'?data.jobs:data.items;
    for(const item of items){const row=el('li'),title=mode==='jobs'?`${JOB_LABELS[item.state]??item.state} · ${item.draftId.slice(0,8)}`:item.title||item.key||'未命名草稿';const b=button(title,()=>perform(async()=>{
      await flush();if(mode==='jobs'){await options.onJob?.(item.id);return;}
      const result=mode==='drafts'?await api('/drafts?id='+item.id):await api('/drafts',{method:'POST',body:JSON.stringify({action:'import',kind:mode,key:item.key})});await openDraft(result.draft);catalog.open=matchMedia('(min-width:768px)').matches;
    }));b.append(el('small',mode==='drafts'?`${item.kind==='post'?'文章':'说说'} · ${item.revision===item.publishedRevision?'已发布':'未发布修改'}`:item.date??''));row.append(b);list.append(row);}
    if(!items.length)list.append(el('li','这里还没有内容。'));
    if(data.more){const row=el('li');row.append(button('下一页',()=>perform(()=>loadList(mode,data.commit,page+1))));list.append(row);}
    if(page>1){const row=el('li');row.append(button('上一页',()=>perform(()=>loadList(mode,data.commit,page-1))));list.prepend(row);}
  }
  async function start(kind:WriterKind){
    await flush();await controller?.dispose();controller=null;active=null;generation++;releaseUrls();pane.replaceChildren(el('h2',kind==='post'?'新建文章':'新建说说'));
    const form=el('form'),slug=field('文章网址（创建后固定）'),title=field('标题');slug.input.pattern='[a-z0-9]+(-[a-z0-9]+)*';slug.input.maxLength=60;slug.input.required=true;slug.input.placeholder='my-new-post';
    if(kind==='post')form.append(title.label,slug.label);
    const create=el('button','创建私密草稿','primary');create.type='submit';form.append(create,el('p','创建和保存不会发布到网站。','writer-note'));pane.append(form);
    form.addEventListener('submit',event=>{event.preventDefault();void perform(async()=>{create.disabled=true;try{const value=newValue(kind);if(kind==='post')value.fields.title=title.input.value;const result=await api('/drafts',{method:'POST',body:JSON.stringify({action:'create',kind,key:slug.input.value,value})});await openDraft(result.draft);await loadList('drafts');}finally{create.disabled=false;}});});
    if(kind==='talk')form.requestSubmit();
  }
  async function openDraft(draft:WriterDraft){
    await controller?.dispose();releaseUrls();active=structuredClone(draft);const ticket=++generation,key=recoveryKey(options.user.id,draft);let restore:RecoveryRecord|undefined;
    try{restore=await recovery.get(key);}catch{backup.textContent='本设备备份不可用，请及时保存或下载';}
    if(disposed||ticket!==generation)return;
    if(restore&&(JSON.stringify(restore.value)!==JSON.stringify(draft.value)||restore.pendingImages?.length)){
      pane.replaceChildren(el('h2','发现本设备恢复副本'),el('p','选择要继续编辑的版本。恢复旧副本后仍会检查云端版本，不会覆盖其他设备的新内容。'));
      const compare=el('div','','writer-compare');for(const [name,value]of [['本设备',restore.value.body],['云端',draft.value.body]]){const label=el('label',name,'writer-field'),area=el('textarea');area.value=value;area.readOnly=true;label.append(area);compare.append(label);}pane.append(compare);
      pane.append(button('恢复本设备版本',()=>renderDraft(draft,restore)),button('使用云端版本',()=>perform(async()=>{await recovery.remove(key);renderDraft(draft);})),button('下载恢复副本',()=>download(`${draft.key}-recovery.json`,JSON.stringify(restore))));return;
    }
    renderDraft(draft);
  }
  function renderDraft(draft:WriterDraft,restore?:RecoveryRecord){
    active=structuredClone(draft);if(restore){active.value=structuredClone(restore.value);active.revision=restore.revision;pending=(restore.pendingImages??[]).map(p=>{const url=URL.createObjectURL(p.blob);urls.add(url);return {...p,url};});}
    const ticket=++generation,working=active;pane.replaceChildren(el('h2',`${working.kind==='post'?'文章':'说说'} · ${working.key}`));
    const tools=el('div','','writer-toolbar'),fields=el('div','','writer-fields'),bodyLabel=el('label','正文（Markdown）','writer-field'),body=el('textarea'),preview=el('article','','writer-preview'),images=el('div','','writer-images'),imageSection=el('section'),publishing=el('section'),conflict=el('section','','writer-conflict');
    body.className='writer-body';body.value=working.value.body;body.spellcheck=false;bodyLabel.append(body);preview.hidden=true;conflict.hidden=true;
    const storeCopy=async(copy:RecoveryCopy)=>{await recovery.put({...copy,key:recoveryKey(options.user.id,working),user:options.user.id,draftId:working.id,pendingImages:pending.map(({id,blob,alt})=>({id,blob,alt}))});};
    const edit=()=>{if(controller){working.value.body=body.value;controller.edit(working.value);if(!preview.hidden)renderPreview();}};
    const renderPreview=()=>{preview.replaceChildren(renderWriterMarkdown(body.value,source=>{
      if(source.startsWith('writer-asset:')){const sha=source.slice(13);return working.value.assets.some(a=>a.sha256===sha)?imageUrl(sha):null;}
      if(!working.base)return null;let path:string;
      if(source.startsWith('./'))path=`content/posts/${working.key}/${source.slice(2)}`;
      else if(working.kind==='talk')path='src/assets/talks/'+source;else return null;
      return `/api/writer/content?commit=${working.base.commit}&image=${encodeURIComponent(path)}`;
    }));};
    async function showConflict(){
      try{const result=await api('/drafts?id='+working.id);if(ticket!==generation)return;conflict.hidden=false;conflict.replaceChildren(el('h3','对照版本'));const comparison=el('div','','writer-compare');
        for(const [name,text]of [['当前输入',JSON.stringify(controller!.current().value.fields,null,2)+'\n\n'+body.value],['云端版本',JSON.stringify(result.draft.value.fields,null,2)+'\n\n'+result.draft.value.body]]){const label=el('label',name,'writer-field'),area=el('textarea');area.value=text;area.readOnly=true;label.append(area);comparison.append(label);}conflict.append(comparison,button('将当前输入另存为新草稿',()=>perform(async()=>{const current=controller!.current();if(current.kind==='post'){showError(Error('请先下载当前输入，再用新的文章网址创建草稿'));return;}const result=await api('/drafts',{method:'POST',body:JSON.stringify({action:'create',kind:current.kind,value:current.value})});await openDraft(result.draft);await loadList('drafts');})),button('下载当前输入',markdownExport));
      }catch(error){showError(error);}
    }
    controller=createSaveController({load:()=>draft,initialRecovery:restore,save:async input=>(await api('/drafts',{method:'POST',body:JSON.stringify({action:'save',...input})})).draft,recovery:{put:storeCopy},onState:(state,info)=>{if(disposed||ticket!==generation)return;status.textContent=SAVE_LABELS[state]+(working.revision===working.publishedRevision?' · 已发布':' · 未发布');backup.textContent=info.backedUp?'':'本设备备份失败，请及时保存到云端或下载当前输入。';if(state==='conflict')void showConflict();}});
    const save=button('保存草稿',()=>perform(async()=>{await controller!.saveNow();await loadList('drafts');}),'primary'),toggle=button('预览',()=>{preview.hidden=!preview.hidden;bodyLabel.hidden=!preview.hidden;toggle.textContent=preview.hidden?'预览':'继续编辑';toggle.setAttribute('aria-pressed',String(!preview.hidden));if(!preview.hidden)renderPreview();});toggle.setAttribute('aria-pressed','false');
    const publish=button('发布',()=>perform(async()=>{if(pending.length)throw Error('还有等待确认的配图，请先上传或放弃后再发布');const current=await controller!.saveNow();if(options.onPublish)await options.onPublish(current,publishing);else showError(Error('发布暂不可用，草稿仍可保存和导出'));}),'primary');publish.disabled=!options.publish;
    tools.append(save,toggle,button('下载 Markdown',markdownExport),button('导出完整草稿',()=>perform(async()=>{await flush();const data=await api('/drafts?id='+working.id+'&export=1');download(`${working.key}-draft.json`,JSON.stringify(data));})),publish);
    const setField=(name:string,title:string,type='text',wide=false)=>{const f=field(title,type,wide);f.input.name=name;f.input.value=String(working.value.fields[name]??'');f.input.addEventListener('input',()=>{working.value.fields[name]=f.input.value;edit();});fields.append(f.label);return f.input;};
    if(working.kind==='post'){setField('title','标题','text',true);const summary=setField('summary','摘要（80 字以内）','text',true);summary.maxLength=80;}
    setField('date','日期','date');
    if(working.kind==='post'){
      setField('updated','更新日期（可选）','date');const tagLabel=el('label','标签（按住 Ctrl 或在手机列表中选择，最多 3 个）','writer-field wide'),select=el('select');select.multiple=true;select.size=4;for(const tag of tags){const option=el('option',tag);option.value=tag;option.selected=Array.isArray(working.value.fields.tags)&&working.value.fields.tags.includes(tag);select.append(option);}select.addEventListener('change',()=>{if(select.selectedOptions.length>3){showError(Error('标签最多选择 3 个'));return;}working.value.fields.tags=Array.from(select.selectedOptions,o=>o.value);edit();});tagLabel.append(select);fields.append(tagLabel);
    }
    body.addEventListener('input',edit);
    const move=(from:number,to:number)=>{if(to<0||to>=working.value.assets.length)return;const [item]=working.value.assets.splice(from,1);working.value.assets.splice(to,0,item);edit();renderImages();};
    const escapedAlt=(text:string)=>text.replace(/[\\\[\]]/g,'\\$&');
    async function upload(image:PendingImage){
      if(!image.alt.trim())throw Error('请先填写图片说明');
      const result=await api<{sha256:string}>('/assets',{method:'POST',headers:{'Content-Type':'image/webp'},body:image.blob});if(ticket!==generation)return;
      if(!working.value.assets.some(a=>a.sha256===result.sha256))working.value.assets.push({sha256:result.sha256,alt:image.alt});
      if(working.kind==='post'){body.value+=(body.value.endsWith('\n')?'':'\n')+`\n![${escapedAlt(image.alt)}](writer-asset:${result.sha256})\n`;}
      pending=pending.filter(p=>p!==image);URL.revokeObjectURL(image.url);urls.delete(image.url);edit();renderImages();
    }
    function renderImages(){
      images.replaceChildren();working.value.assets.forEach((asset,index)=>{
        const card=el('div','','writer-image');card.dataset.imageId=asset.sha256;const image=el('img');image.src=imageUrl(asset.sha256);image.alt=asset.alt||'已上传的配图';card.append(image);
        const alt=field('图片说明');alt.input.value=asset.alt;alt.input.addEventListener('input',()=>{asset.alt=alt.input.value;image.alt=asset.alt||'已上传的配图';edit();});card.append(alt.label);
        const actions=el('div','','writer-toolbar'),handle=button('按住拖动',()=>{});handle.dataset.imageHandle='';handle.setAttribute('aria-label',`拖动第 ${index+1} 张配图`);
        handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;handle.setPointerCapture(event.pointerId);card.dataset.dragging='';});
        handle.addEventListener('pointerup',event=>{if(!handle.hasPointerCapture(event.pointerId))return;delete card.dataset.dragging;handle.releasePointerCapture(event.pointerId);const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-image-id]');const to=working.value.assets.findIndex(a=>a.sha256===target?.dataset.imageId);if(to>=0)move(index,to);});handle.addEventListener('pointercancel',()=>delete card.dataset.dragging);
        actions.append(handle,button('上移',()=>move(index,index-1)),button('下移',()=>move(index,index+1)),button('移除',()=>{working.value.assets.splice(index,1);if(working.kind==='post')body.value=body.value.replace(new RegExp(`!\\[(?:\\\\.|[^\\]\\\\])*\\]\\(writer-asset:${asset.sha256}\\)`,'g'),'');if(working.value.fields.cover===`writer-asset:${asset.sha256}`){working.value.fields.cover='';working.value.fields.coverAlt='';}edit();renderImages();}));
        if(working.kind==='post')actions.append(button('设为封面',()=>{working.value.fields.cover='writer-asset:'+asset.sha256;working.value.fields.coverAlt=asset.alt;edit();showError(Error('已设为封面，请保存草稿后发布'));}));card.append(actions);images.append(card);
      });
      for(const image of pending){const card=el('div','','writer-image'),previewImage=el('img');previewImage.src=image.url;previewImage.alt=image.alt||'上传前的压缩预览';card.append(previewImage,el('p',`${image.width??''} × ${image.height??''} · 压缩后 ${Math.ceil(image.blob.size/1024)} KiB${image.originalSize?' / 原图 '+Math.ceil(image.originalSize/1024)+' KiB':''}`,'writer-note'));
        const alt=field('图片说明（上传前必填）');alt.input.value=image.alt;alt.input.addEventListener('input',()=>{image.alt=alt.input.value;edit();});card.append(alt.label,button('上传并添加',()=>perform(()=>upload(image)),'primary'),button('放弃这张',()=>{pending=pending.filter(p=>p!==image);URL.revokeObjectURL(image.url);urls.delete(image.url);edit();renderImages();}));images.append(card);}
    }
    const choose=el('input');choose.type='file';choose.accept='image/jpeg,image/png,image/webp';choose.multiple=true;choose.setAttribute('aria-label','选择配图');
    async function files(input:File[]){for(const file of input){const existing=publishedAssetHashes(working.base);if(working.value.assets.filter(a=>!existing.has(a.sha256)).length+pending.length>=(working.kind==='post'?20:9))throw Error('本篇新增图片数量已达上限');const result=await prepareWriterImage(file);if(ticket!==generation){URL.revokeObjectURL(result.previewUrl);return;}urls.add(result.previewUrl);pending.push({id:crypto.randomUUID(),blob:result.blob,url:result.previewUrl,alt:'',...result});edit();renderImages();}}
    choose.addEventListener('change',()=>{void perform(()=>files(Array.from(choose.files??[])));choose.value='';});body.addEventListener('paste',event=>{const images=Array.from(event.clipboardData?.files??[]).filter(f=>f.type.startsWith('image/'));if(images.length){event.preventDefault();void perform(()=>files(images));}});
    imageSection.append(el('h3','配图'),el('p','先预览压缩结果并填写说明，再上传。说说按下方顺序展示；文章内的位置由正文图片引用决定。','writer-note'),choose,images);
    const metadata=el('details'),metaSummary=el('summary','保留的原有资料');metadata.append(metaSummary,el('pre',JSON.stringify(working.value.fields,null,2),'writer-note'));
    const deleteDraft=button('删除这份云端草稿',()=>perform(async()=>{if(!confirm(`删除「${working.value.fields.title??working.key}」草稿及其已结束任务？网站上已发布的内容会保留。建议先导出。`))return;await api('/drafts',{method:'POST',body:JSON.stringify({action:'delete',id:working.id,revision:controller!.current().revision})});await controller!.dispose();controller=null;active=null;generation++;releaseUrls();pane.replaceChildren(el('p','草稿已删除，已发布内容仍在网站上。'));await loadList('drafts');}));
    pane.append(tools,status,backup,fields,bodyLabel,preview,imageSection,metadata,conflict,publishing,el('p',options.publish?'保存不会发布，点击发布后还需确认本次内容。':'发布尚未配置；私密草稿仍可保存和导出。','writer-note'),deleteDraft);renderImages();void controller.ready;
  }
  navigation.setAttribute('aria-label','内容分类');for(const [mode,label]of [['drafts','草稿'],['post','文章'],['talk','说说'],['jobs','发布记录']])navigation.append(button(label,()=>perform(()=>loadList(mode))));
  const newButtons=el('div','','writer-toolbar');newButtons.append(button('新文章',()=>perform(()=>start('post')),'primary'),button('新说说',()=>perform(()=>start('talk'))));sidebar.prepend(newButtons);
  const storage=el('div','','writer-storage');storage.append(button('配图占用与清理',()=>perform(async()=>{await flush();const data=await api('/assets');pane.append(el('p',`已读取 ${data.images.length} 张私密配图。被草稿或任务引用的图片会保留。`));})));sidebar.append(storage);
  pane.append(el('h2',`你好，${options.user.nickname}`),el('p','选择一份草稿，或写下新的文章与说说。保存只会留在你的私密空间里。'));
  void perform(async()=>{tags=(await api('/content?mode=tags')).tags;await loadList('drafts');});
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(controller?.isDirty()||pending.length){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  const online=()=>{if(controller)void perform(()=>controller!.saveNow());};window.addEventListener('online',online);
  return {getDraft:()=>controller?.current(),showError,
    async refreshPublished(draftId:string){if(!active||active.id!==draftId||!controller)return;const id=active.id,result=await api('/drafts?id='+id);if(!active||active.id!==id||!controller)return;const oldKey=recoveryKey(options.user.id,active);active.base=result.draft.base;active.publishedRevision=result.draft.publishedRevision;await controller.advanceBase(active.base,active.publishedRevision);if(oldKey!==recoveryKey(options.user.id,active))await recovery.remove(oldKey);},
    async dispose(){disposed=true;generation++;listGeneration++;window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('online',online);await controller?.dispose();releaseUrls();root.replaceChildren();}};
}
