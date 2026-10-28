import type { writerApi } from './api';
import type { WriterDraft,WriterValue,WriterKind } from '../../lib/writer/model';
import { publishedAssetHashes,writerKindLabel,writerImageLimit,writerAssetDirectory } from '../../lib/writer/model';
import { createSaveController,type RecoveryCopy } from './save';
import { createRecoveryStore,recoveryKey,type RecoveryRecord } from './recovery';
import { prepareWriterImage } from './images';
import { renderWriterMarkdown } from './preview';
import { el,button,field,download,errorText,SAVE_LABELS } from './ui';
import { JOB_LABELS } from './publish';
import { showWriterStorage } from './storage';
import { mountWriterBody } from './body-editor';
import { restoreImageAssets } from './markdown';
import { mountProjectFields,mountForgeFields,renderForgePreview,projectImageReferences } from './forge-editor';
type Api=typeof writerApi;
type Store=ReturnType<typeof createRecoveryStore>;
type PendingImage={id:string;blob:Blob;alt:string;url:string;width?:number;height?:number;originalSize?:number};
type Options={user:{id:string;nickname:string};publish:boolean;onPublish?:(draft:WriterDraft,host:HTMLElement)=>Promise<void>;onJob?:(id:string)=>Promise<void>};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function mountWriterEditor(root:HTMLElement,api:Api,recovery:Store,options:Options){
  root.replaceChildren();const workspace=el('div','','writer-workspace'),sidebar=el('aside','','writer-sidebar'),catalog=el('details'),summary=el('summary','内容与草稿'),navigation=el('nav'),list=el('ul','','writer-list'),pane=el('section','','writer-editor'),notice=el('p','','writer-error');notice.hidden=true;notice.setAttribute('role','alert');
  catalog.open=matchMedia('(min-width:768px)').matches;catalog.append(summary,navigation,list);sidebar.append(catalog);workspace.append(sidebar,pane);root.append(notice,workspace);
  let active:WriterDraft|null=null,controller:ReturnType<typeof createSaveController>|null=null,generation=0,listGeneration=0,disposed=false,currentMode='drafts',pending:PendingImage[]=[],urls=new Set<string>(),tags:string[]=[];
  let bodyEditor:ReturnType<typeof mountWriterBody>|null=null;
  const status=el('p','','writer-status'),backup=el('p','','writer-backup');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const showError=(error:unknown)=>{notice.hidden=false;notice.textContent=errorText(error);};
  const perform=async(action:()=>Promise<unknown>)=>{notice.hidden=true;try{await action();}catch(error){showError(error);}};
  const releaseUrls=()=>{bodyEditor?.destroy();bodyEditor=null;for(const url of urls)URL.revokeObjectURL(url);urls.clear();pending=[];};
  const imageUrl=(sha:string)=>'/api/writer/assets?sha256='+sha;
  const newValue=(kind:WriterKind):WriterValue=>({fields:kind==='post'?{title:'',date:today(),summary:'',tags:[],draft:false}:kind==='project'?{title:'',summary:'',tagline:'',category:'',status:'',order:0,tags:[],visual:'image',effect:'auto',images:[],links:[]}:kind==='talk'?{date:today()}:{},body:'',assets:[]});
  function markdownExport(){if(!controller)return;const d=controller.current();const text=d.kind!=='talk'?`---\n${Object.entries(d.value.fields).map(([k,v])=>JSON.stringify(k)+': '+JSON.stringify(v)).join('\n')}\n---\n${d.value.body}`:d.value.body;download(`${d.key}.md`,text,'text/markdown;charset=utf-8');}
  async function recoveryExport(name:string,copy:RecoveryRecord){
    const pendingImages=await Promise.all((copy.pendingImages??[]).map(async image=>{const bytes=new Uint8Array(await image.blob.arrayBuffer()),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return {id:image.id,alt:image.alt,mime:image.blob.type,sha256:Array.from(hash,b=>b.toString(16).padStart(2,'0')).join(''),bytes:btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))};}));
    download(`${name}-recovery.json`,JSON.stringify({format:'northcedar-writer-recovery-1',copy:{...copy,pendingImages}}));
  }
  async function flush(){if(controller?.isDirty())await controller.saveNow();}
  async function loadList(mode=currentMode,commit?:string,page=1){
    currentMode=mode;const ticket=++listGeneration;list.replaceChildren(el('li','正在读取…'));let data:any;
    if(mode==='drafts')data=await api('/drafts');else if(mode==='jobs')data=await api('/publish');else data=await api(`/content?kind=${mode}&page=${page}${commit?'&commit='+commit:''}`);
    if(disposed||ticket!==listGeneration)return;list.replaceChildren();
    const items=mode==='drafts'?data.drafts:mode==='jobs'?data.jobs:data.items;
    for(const item of items){const row=el('li'),title=mode==='jobs'?`${JOB_LABELS[item.state]??item.state} · ${item.draftId.slice(0,8)}`:item.title||item.key||'未命名草稿';const b=button(title,()=>perform(async()=>{
      await flush();if(mode==='jobs'){await options.onJob?.(item.id);return;}
      const result=mode==='drafts'?await api('/drafts?id='+item.id):await api('/drafts',{method:'POST',body:JSON.stringify({action:'import',kind:mode,key:item.key})});await openDraft(result.draft);catalog.open=matchMedia('(min-width:768px)').matches;
    }));b.append(el('small',mode==='drafts'?`${writerKindLabel(item.kind)} · ${item.revision===item.publishedRevision?'已发布':'未发布修改'}`:item.date??''));row.append(b);list.append(row);}
    if(!items.length)list.append(el('li','这里还没有内容。'));
    if(data.more){const row=el('li');row.append(button('下一页',()=>perform(()=>loadList(mode,data.commit,page+1))));list.append(row);}
    if(page>1){const row=el('li');row.append(button('上一页',()=>perform(()=>loadList(mode,data.commit,page-1))));list.prepend(row);}
  }
  async function start(kind:WriterKind){
    if(kind==='forge')return;
    await flush();await controller?.dispose();controller=null;active=null;generation++;releaseUrls();pane.replaceChildren(el('h2','新建'+writerKindLabel(kind)));
    const form=el('form'),slug=field(`${kind==='project'?'项目':'文章'}网址（创建后固定）`),title=field('标题');slug.input.name='key';title.input.name='title';slug.input.pattern='[a-z0-9]+(-[a-z0-9]+)*';slug.input.maxLength=60;slug.input.required=true;slug.input.placeholder=kind==='project'?'my-new-project':'my-new-post';
    if(kind==='post'||kind==='project')form.append(title.label,slug.label);
    const create=el('button','创建私密草稿','primary');create.type='submit';form.append(create,el('p','创建和保存不会发布到网站。','writer-note'));pane.append(form);
    form.addEventListener('submit',event=>{event.preventDefault();void perform(async()=>{create.disabled=true;try{const value=newValue(kind);if(kind==='post'||kind==='project')value.fields.title=title.input.value;const result=await api('/drafts',{method:'POST',body:JSON.stringify({action:'create',kind,key:slug.input.value,value})});await openDraft(result.draft);await loadList('drafts');}finally{create.disabled=false;}});});
    if(kind==='talk')form.requestSubmit();
  }
  async function openDraft(draft:WriterDraft){
    await controller?.dispose();releaseUrls();active=structuredClone(draft);const ticket=++generation;let copies:RecoveryRecord[]=[];
    try{copies=await recovery.findDraft(options.user.id,draft.id);}catch{backup.textContent='本设备备份不可用，请及时保存或下载';}
    if(disposed||ticket!==generation)return;
    const candidates=copies.filter(copy=>JSON.stringify(copy.value)!==JSON.stringify(draft.value)||copy.pendingImages?.length);
    if(candidates.length){
      pane.replaceChildren(el('h2','发现本设备恢复副本'),el('p','选择要继续编辑的版本。其他发布基线的副本也列在这里；恢复后仍会检查云端版本，不会覆盖其他设备的新内容。'));
      const comparison=(value:WriterValue)=>(draft.kind==='project'||draft.kind==='forge'?JSON.stringify(value.fields,null,2)+'\n\n':'')+value.body;
      const cloud=el('label',draft.kind==='project'||draft.kind==='forge'?'当前云端文案与正文（只读）':'当前云端正文','writer-field'),area=el('textarea');area.value=comparison(draft.value);area.readOnly=true;cloud.append(area);pane.append(cloud);
      for(const restore of candidates){
        const section=el('section'),base=restore.key.split('/').at(-1)??'new',label=el('label',`本设备 · ${new Date(restore.updatedAt).toLocaleString()} · 基线 ${base==='new'?'未发布':base.slice(0,12)}`,'writer-field'),body=el('textarea');body.value=comparison(restore.value);body.readOnly=true;label.append(body);section.append(label,el('p',`${restore.pendingImages?.length??0} 张待上传配图`,'writer-note'),button('恢复本设备版本',()=>renderDraft(draft,restore)),button('下载恢复副本',()=>perform(()=>recoveryExport(draft.key,restore))));pane.append(section);
      }
      pane.append(el('p','选择使用云端版本会清理本设备上此草稿的上述恢复副本，请先下载需要保留的版本。','writer-note'),button('使用云端版本',()=>perform(async()=>{for(const copy of copies)await recovery.remove(copy.key);renderDraft(draft);})));return;
    }
    renderDraft(draft);
  }
  function renderDraft(draft:WriterDraft,restore?:RecoveryRecord){
    active=structuredClone(draft);if(restore){active.value=structuredClone(restore.value);active.revision=restore.revision;pending=(restore.pendingImages??[]).map(p=>{const url=URL.createObjectURL(p.blob);urls.add(url);return {...p,url};});}
    const ticket=++generation,working=active;pane.replaceChildren(el('h2',`${writerKindLabel(working.kind)} · ${working.key}`));
    let projectFields:ReturnType<typeof mountProjectFields>|undefined;
    const knownImages=new Map(working.value.assets.map(asset=>[asset.sha256,asset]));
    const tools=el('div','','writer-toolbar'),fields=el('div','','writer-fields'),bodyLabel=el('section','','writer-composer'),preview=el('article','','writer-preview'),images=el('div','','writer-images'),imageSection=el('section'),publishing=el('section'),conflict=el('section','','writer-conflict');
    preview.hidden=true;conflict.hidden=true;
    const storeCopy=async(copy:RecoveryCopy)=>{const key=recoveryKey(options.user.id,working);await recovery.put({...copy,key,user:options.user.id,draftId:working.id,pendingImages:pending.map(({id,blob,alt})=>({id,blob,alt}))});if(restore&&restore.key!==key)await recovery.remove(restore.key);};
    const edit=()=>{if(controller){if(bodyEditor)working.value.body=bodyEditor.getMarkdown();const restored=restoreImageAssets(working.value.body,working.value.assets,knownImages);if(restored.length!==working.value.assets.length){working.value.assets=restored;renderImages();}controller.edit(working.value);if(!preview.hidden)renderPreview();}};
    const resolveImage=(source:string)=>{
      if(source.startsWith('writer-asset:')){const sha=source.slice(13);return knownImages.has(sha)?imageUrl(sha):null;}
      if(!working.base)return null;let path:string;
      if(working.kind==='project'){
        const name=source.replace(/^\.\//,'');
        if(!/^[\p{L}\p{N}_ .-]+\.(?:png|jpe?g|webp|avif)$/u.test(name)||name.includes('..'))return null;
        path=`${writerAssetDirectory(working.kind,working.key)}${name}`;
      }
      else if(source.startsWith('./')&&working.kind!=='forge')path=`${writerAssetDirectory(working.kind,working.key)}${source.slice(2)}`;
      else if(working.kind==='talk')path='src/assets/talks/'+source;else return null;
      return `/api/writer/content?commit=${working.base.commit}&image=${encodeURIComponent(path)}`;
    };
    const renderPreview=()=>{preview.replaceChildren();if(working.kind==='project'||working.kind==='forge')preview.append(renderForgePreview(working.kind,working.value,resolveImage));if(working.kind!=='forge')preview.append(renderWriterMarkdown(bodyEditor!.getMarkdown(),resolveImage));};
    async function showConflict(){
      try{const result=await api('/drafts?id='+working.id);if(ticket!==generation)return;conflict.hidden=false;conflict.replaceChildren(el('h3','对照版本'));const comparison=el('div','','writer-compare');
        for(const [name,text]of [['当前输入',JSON.stringify(controller!.current().value.fields,null,2)+'\n\n'+working.value.body],['云端版本',JSON.stringify(result.draft.value.fields,null,2)+'\n\n'+result.draft.value.body]]){const label=el('label',name,'writer-field'),area=el('textarea');area.value=text;area.readOnly=true;label.append(area);comparison.append(label);}conflict.append(comparison,el('p','另存会保留当前输入和原内容网址，原草稿不变。发布前仍需对照仓库最新内容。','writer-note'),button('将当前输入另存为新草稿',()=>perform(async()=>{const current=controller!.current();const result=await api('/drafts',{method:'POST',body:JSON.stringify({action:'copy',id:current.id,baseCommit:current.base?.commit??null,value:current.value})});if(ticket!==generation)return;await openDraft(result.draft);await loadList('drafts');})),button('下载当前输入',markdownExport));
      }catch(error){showError(error);}
    }
    controller=createSaveController({load:()=>draft,initialRecovery:restore,save:async input=>(await api('/drafts',{method:'POST',body:JSON.stringify({action:'save',...input})})).draft,recovery:{put:storeCopy},onState:(state,info)=>{if(disposed||ticket!==generation)return;status.textContent=SAVE_LABELS[state]+(state==='saved'&&info.revision===(controller?.current().publishedRevision??working.publishedRevision)?' · 已发布':' · 未发布修改');backup.textContent=info.backedUp?'':'本设备备份失败，请及时保存到云端或下载当前输入。';if(state==='conflict')void showConflict();}});
    const save=button('保存草稿',()=>perform(async()=>{await controller!.saveNow();await loadList('drafts');}),'primary'),toggle=button('预览',()=>{preview.hidden=!preview.hidden;bodyLabel.hidden=!preview.hidden;toggle.textContent=preview.hidden?'预览':'继续编辑';toggle.setAttribute('aria-pressed',String(!preview.hidden));if(!preview.hidden)renderPreview();});toggle.setAttribute('aria-pressed','false');
    const publish=button('发布',()=>perform(async()=>{if(pending.length)throw Error('还有等待确认的配图，请先上传或放弃后再发布');projectFields?.validate();const current=await controller!.saveNow();if(options.onPublish)await options.onPublish(current,publishing);else showError(Error('发布暂不可用，草稿仍可保存和导出'));}),'primary');publish.disabled=!options.publish;
    tools.append(save,toggle,button('下载 Markdown',markdownExport),button('导出完整草稿',()=>perform(async()=>{await flush();const data=await api('/drafts?id='+working.id+'&export=1');download(`${working.key}-draft.json`,JSON.stringify(data));})),publish);
    const setField=(name:string,title:string,type='text',wide=false)=>{const f=field(title,type,wide);f.input.name=name;f.input.value=String(working.value.fields[name]??'');f.input.addEventListener('input',()=>{working.value.fields[name]=f.input.value;edit();});fields.append(f.label);return f.input;};
    if(working.kind==='post'){setField('title','标题','text',true);const summary=setField('summary','摘要（80 字以内）','text',true);summary.maxLength=80;}
    if(working.kind==='post'||working.kind==='talk')setField('date','日期','date');
    if(working.kind==='post'){
      setField('updated','更新日期（可选）','date');const tagLabel=el('label','标签（按住 Ctrl 或在手机列表中选择，最多 3 个）','writer-field wide'),select=el('select');select.multiple=true;select.size=4;for(const tag of tags){const option=el('option',tag);option.value=tag;option.selected=Array.isArray(working.value.fields.tags)&&working.value.fields.tags.includes(tag);select.append(option);}select.addEventListener('change',()=>{if(select.selectedOptions.length>3){showError(Error('标签最多选择 3 个'));return;}working.value.fields.tags=Array.from(select.selectedOptions,o=>o.value);edit();});tagLabel.append(select);fields.append(tagLabel);
    }
    if(working.kind==='project')projectFields=mountProjectFields(fields,{value:working.value,onChange:edit,onError:showError,resolveImage});
    if(working.kind==='forge')mountForgeFields(fields,{value:working.value,onChange:edit,onError:showError,resolveImage});
    else bodyEditor=mountWriterBody(bodyLabel,working.value.body,{onChange:edit,resolveImage,onImageFiles:input=>void perform(()=>files(input)),onError:showError});
    const move=(from:number,to:number)=>{if(to<0||to>=working.value.assets.length)return;const [item]=working.value.assets.splice(from,1);working.value.assets.splice(to,0,item);edit();renderImages();};
    async function upload(image:PendingImage){
      if(!image.alt.trim())throw Error('请先填写图片说明');
      const result=await api<{sha256:string}>('/assets',{method:'POST',headers:{'Content-Type':'image/webp'},body:image.blob});if(ticket!==generation)return;
      if(!working.value.assets.some(a=>a.sha256===result.sha256))working.value.assets.push({sha256:result.sha256,alt:image.alt});
      knownImages.set(result.sha256,working.value.assets.find(a=>a.sha256===result.sha256)!);
      if(working.kind==='post'&&!bodyEditor!.insertImage('writer-asset:'+result.sha256,image.alt))throw Error('图片已上传，请完成当前文字输入后再次点击“上传并添加”；待添加图片会保留。');
      pending=pending.filter(p=>p!==image);URL.revokeObjectURL(image.url);urls.delete(image.url);edit();renderImages();
    }
    function renderImages(){
      projectFields?.refreshAssets();
      images.replaceChildren();working.value.assets.forEach((asset,index)=>{
        const card=el('div','','writer-image');card.dataset.imageId=asset.sha256;const image=el('img');image.src=imageUrl(asset.sha256);image.alt=asset.alt||'已上传的配图';card.append(image);
        const alt=field('图片说明');alt.input.value=asset.alt;alt.input.addEventListener('input',()=>{asset.alt=alt.input.value;image.alt=asset.alt||'已上传的配图';edit();});card.append(alt.label);
        const actions=el('div','','writer-toolbar'),handle=button('按住拖动',()=>{});handle.dataset.imageHandle='';handle.setAttribute('aria-label',`拖动第 ${index+1} 张配图`);
        handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;handle.setPointerCapture(event.pointerId);card.dataset.dragging='';});
        handle.addEventListener('pointerup',event=>{if(!handle.hasPointerCapture(event.pointerId))return;delete card.dataset.dragging;handle.releasePointerCapture(event.pointerId);const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-image-id]');const to=working.value.assets.findIndex(a=>a.sha256===target?.dataset.imageId);if(to>=0)move(index,to);});handle.addEventListener('pointercancel',()=>delete card.dataset.dragging);
        actions.append(handle,button('上移',()=>move(index,index-1)),button('下移',()=>move(index,index+1)),button('移除',()=>{const source='writer-asset:'+asset.sha256;if(working.kind==='project'&&projectImageReferences(working.value,source)){showError(Error('请先从项目图库的主图或暗色替图中移除这张图片，再删除配图。'));return;}if((working.kind==='post'||working.kind==='project')&&!bodyEditor!.removeImage(source))return;working.value.assets.splice(index,1);if(working.value.fields.cover===`writer-asset:${asset.sha256}`){working.value.fields.cover='';working.value.fields.coverAlt='';}edit();renderImages();}));
        if(working.kind==='post')actions.append(button('设为封面',()=>{working.value.fields.cover='writer-asset:'+asset.sha256;working.value.fields.coverAlt=asset.alt;edit();showError(Error('已设为封面，请保存草稿后发布'));}));if(working.kind==='project')actions.append(button('插入项目正文',()=>{if(bodyEditor!.insertImage('writer-asset:'+asset.sha256,asset.alt))edit();}));card.append(actions);images.append(card);
      });
      for(const image of pending){const card=el('div','','writer-image'),previewImage=el('img');previewImage.src=image.url;previewImage.alt=image.alt||'上传前的压缩预览';card.append(previewImage,el('p',`${image.width??''} × ${image.height??''} · 压缩后 ${Math.ceil(image.blob.size/1024)} KiB${image.originalSize?' / 原图 '+Math.ceil(image.originalSize/1024)+' KiB':''}`,'writer-note'));
        const alt=field('图片说明（上传前必填）');alt.input.value=image.alt;alt.input.addEventListener('input',()=>{image.alt=alt.input.value;edit();});card.append(alt.label,button('上传并添加',()=>perform(()=>upload(image)),'primary'),button('放弃这张',()=>{pending=pending.filter(p=>p!==image);URL.revokeObjectURL(image.url);urls.delete(image.url);edit();renderImages();}));images.append(card);}
    }
    const choose=el('input');choose.type='file';choose.accept='image/jpeg,image/png,image/webp';choose.multiple=true;choose.setAttribute('aria-label','选择配图');
    async function files(input:File[]){for(const file of input){const existing=publishedAssetHashes(working.base);if(working.value.assets.filter(a=>!existing.has(a.sha256)).length+pending.length>=writerImageLimit(working.kind))throw Error('本篇新增图片数量已达上限');const result=await prepareWriterImage(file);if(ticket!==generation){URL.revokeObjectURL(result.previewUrl);return;}urls.add(result.previewUrl);pending.push({id:crypto.randomUUID(),blob:result.blob,url:result.previewUrl,alt:'',...result});edit();renderImages();}}
    choose.addEventListener('change',()=>{void perform(()=>files(Array.from(choose.files??[])));choose.value='';});
    imageSection.append(el('h3','配图'),el('p',working.kind==='project'?'先预览压缩结果并填写说明，再上传。上传后可在项目图库选择主图、暗色替图，或插入正文。图库顺序与下方上传列表独立。':'先预览压缩结果并填写说明，再上传。说说按下方顺序展示；文章内的位置由正文图片引用决定。','writer-note'),choose,images);
    const metadata=el('details'),metaSummary=el('summary','保留的原有资料');metadata.append(metaSummary,el('pre',JSON.stringify(working.value.fields,null,2),'writer-note'));
    const deleteDraft=button('删除这份云端草稿',()=>perform(async()=>{if(!confirm(`删除「${working.value.fields.title??working.key}」草稿及其已结束任务？网站上已发布的内容会保留。建议先导出。`))return;await api('/drafts',{method:'POST',body:JSON.stringify({action:'delete',id:working.id,revision:controller!.current().revision})});await controller!.dispose();controller=null;active=null;generation++;releaseUrls();pane.replaceChildren(el('p','草稿已删除，已发布内容仍在网站上。'));await loadList('drafts');}));
    pane.append(tools,status,backup,fields);if(working.kind!=='forge')pane.append(bodyLabel);pane.append(preview);if(working.kind!=='forge')pane.append(imageSection);pane.append(metadata,conflict,publishing,el('p',options.publish?'保存不会发布，点击发布后还需确认本次内容。':'发布尚未配置；私密草稿仍可保存和导出。','writer-note'),deleteDraft);renderImages();void controller.ready;
  }
  navigation.setAttribute('aria-label','内容分类');for(const [mode,label]of [['drafts','草稿'],['post','文章'],['talk','说说'],['project','造物台项目'],['forge','页面文案'],['jobs','发布记录']])navigation.append(button(label,()=>perform(()=>loadList(mode))));
  const newButtons=el('div','','writer-toolbar');newButtons.append(button('新文章',()=>perform(()=>start('post')),'primary'),button('新说说',()=>perform(()=>start('talk'))),button('新项目',()=>perform(()=>start('project'))));sidebar.prepend(newButtons);
  const storage=el('div','','writer-storage');storage.append(button('配图占用与清理',()=>perform(async()=>{await flush();await showWriterStorage(pane,api);})));sidebar.append(storage);
  pane.append(el('h2',`你好，${options.user.nickname}`),el('p','选择一份草稿，或写下新的文章、说说与造物台项目。造物台页面文案可从左侧导入编辑。保存只会留在你的私密空间里。'));
  void perform(async()=>{tags=(await api('/content?mode=tags')).tags;await loadList('drafts');});
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(controller?.isDirty()||pending.length){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  const online=()=>{if(controller)void perform(()=>controller!.saveNow());};window.addEventListener('online',online);
  return {getDraft:()=>controller?.current(),showError,
    async refreshPublished(draftId:string){if(!active||active.id!==draftId||!controller)return;const id=active.id,result=await api('/drafts?id='+id);if(!active||active.id!==id||!controller)return;const oldKey=recoveryKey(options.user.id,active);active.base=result.draft.base;active.publishedRevision=result.draft.publishedRevision;await controller.advanceBase(active.base,active.publishedRevision);if(oldKey!==recoveryKey(options.user.id,active))await recovery.remove(oldKey);},
    async dispose(){disposed=true;generation++;listGeneration++;window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('online',online);await controller?.dispose();releaseUrls();root.replaceChildren();}};
}
