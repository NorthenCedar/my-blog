import {mountGalleryFields} from './gallery-editor';
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
import { restoreImageAssets, writerBodyImages } from './markdown';
import { mountProjectFields,mountForgeFields,mountLinksFields,renderForgePreview,projectImageReferences } from './forge-editor';
type Api=typeof writerApi;
type Store=ReturnType<typeof createRecoveryStore>;
type PendingImage={id:string;blob:Blob;alt:string;url:string;cover?:boolean;width?:number;height?:number;originalSize?:number};
type Options={user:{id:string;nickname:string};publish:boolean;onPublish?:(draft:WriterDraft,host:HTMLElement)=>Promise<void>;onJob?:(id:string)=>Promise<void>};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function mountWriterEditor(root:HTMLElement,api:Api,recovery:Store,options:Options){
  root.replaceChildren();const workspace=el('div','','writer-workspace'),sidebar=el('aside','','writer-sidebar'),catalog=el('details'),summary=el('summary','内容与草稿'),navigation=el('nav'),list=el('ul','','writer-list'),pane=el('section','','writer-editor'),notice=el('p','','writer-error');notice.hidden=true;notice.setAttribute('role','alert');
  catalog.open=matchMedia('(min-width:768px)').matches;catalog.append(summary,navigation,list);sidebar.append(catalog);workspace.append(sidebar,pane);root.append(notice,workspace);
  let active:WriterDraft|null=null,controller:ReturnType<typeof createSaveController>|null=null,generation=0,listGeneration=0,disposed=false,currentMode='drafts',pending:PendingImage[]=[],urls=new Set<string>(),tags:string[]=[];
  let draftSelection: AbortController | undefined;
  let galleryDestroy:(()=>void)|null=null;
  let bodyEditor:ReturnType<typeof mountWriterBody>|null=null;
  const status=el('p','','writer-status'),backup=el('p','','writer-backup');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const showError=(error:unknown)=>{if(disposed)return;notice.hidden=false;notice.textContent=errorText(error);};
  const perform=async(action:()=>Promise<unknown>, selection?:AbortSignal)=>{
    if(disposed||selection?.aborted)return;
    notice.hidden=true;
    try{await action();}catch(error){if(!selection?.aborted)showError(error);}
  };
  // 点击时就登记选择；现有编辑器继续保存，直到接替它的草稿确实准备好。
  const selectDraft = () => {
    draftSelection?.abort();
    draftSelection = new AbortController();
    return draftSelection.signal;
  };
  const releaseUrls=()=>{galleryDestroy?.();galleryDestroy=null;bodyEditor?.destroy();bodyEditor=null;for(const url of urls)URL.revokeObjectURL(url);urls.clear();pending=[];};
  const closeDraft = () => {
    const closing = controller?.dispose();
    controller = null;
    active = null;
    generation++;
    releaseUrls();
    return closing;
  };
  const imageUrl=(sha:string)=>'/api/writer/assets?sha256='+sha;
  const newValue=(kind:WriterKind):WriterValue=>({fields:kind==='gallery'?{title:'',titleEn:'',date:today(),images:[],layout:'scatter',draft:true}:kind==='post'?{title:'',date:today(),summary:'',tags:[],draft:false}:kind==='project'?{title:'',summary:'',tagline:'',category:'',status:'',order:0,tags:[],visual:'image',effect:'auto',images:[],links:[]}:kind==='talk'?{date:today()}:{},body:'',assets:[]});
  function markdownExport(){if(!controller)return;const d=controller.current();const text=d.kind!=='talk'?`---\n${Object.entries(d.value.fields).map(([k,v])=>JSON.stringify(k)+': '+JSON.stringify(v)).join('\n')}\n---\n${d.value.body}`:d.value.body;download(`${d.key}.md`,text,'text/markdown;charset=utf-8');}
  async function recoveryExport(name:string,copy:RecoveryRecord){
    const pendingImages=await Promise.all((copy.pendingImages??[]).map(async image=>{const bytes=new Uint8Array(await image.blob.arrayBuffer()),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return {id:image.id,alt:image.alt,cover:image.cover,mime:image.blob.type,sha256:Array.from(hash,b=>b.toString(16).padStart(2,'0')).join(''),bytes:btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''))};}));
    download(`${name}-recovery.json`,JSON.stringify({format:'northcedar-writer-recovery-1',copy:{...copy,pendingImages}}));
  }
  async function flush(){if(controller?.isDirty())await controller.saveNow();}
  async function loadList(mode=currentMode,commit?:string,page=1){
    if(disposed)return;
    currentMode=mode;const ticket=++listGeneration;list.replaceChildren(el('li','正在读取…'));let data:any;
    if(mode==='drafts')data=await api('/drafts');else if(mode==='jobs')data=await api('/publish');else data=await api(`/content?kind=${mode}&page=${page}${commit?'&commit='+commit:''}`);
    if(disposed||ticket!==listGeneration)return;list.replaceChildren();
    const items=mode==='drafts'?data.drafts:mode==='jobs'?data.jobs:data.items;
    for(const item of items){
      const row=el('li'),title=mode==='jobs'?`${JOB_LABELS[item.state]??item.state} · ${item.draftId.slice(0,8)}`:item.title||item.key||'未命名草稿';
      const b=button(title,()=>{
        if(disposed)return;
        const selection=selectDraft();
        return perform(async()=>{
          await flush();
          if(selection.aborted)return;
          if(mode==='jobs'){await options.onJob?.(item.id);return;}
          const result=mode==='drafts'
            ?await api('/drafts?id='+item.id,{signal:selection})
            :await api('/drafts',{method:'POST',body:JSON.stringify({action:'import',kind:mode==='links'?'forge':mode,key:item.key})});
          await openDraft(result.draft,selection,true);
          if(!selection.aborted)catalog.open=matchMedia('(min-width:768px)').matches;
        },selection);
      });
      b.append(el('small',mode==='drafts'?`${writerKindLabel(item.kind,item.key)} · ${item.revision===item.publishedRevision?'已发布':'未发布修改'}`:item.date??''));
      row.append(b);list.append(row);
    }
    if(!items.length)list.append(el('li','这里还没有内容。'));
    if(data.more){const row=el('li');row.append(button('下一页',()=>perform(()=>loadList(mode,data.commit,page+1))));list.append(row);}
    if(page>1){const row=el('li');row.append(button('上一页',()=>perform(()=>loadList(mode,data.commit,page-1))));list.prepend(row);}
  }
  function start(kind:WriterKind){
    if(kind==='forge'||disposed)return;
    const selection=selectDraft();
    return perform(async()=>{
      await flush();
      if(selection.aborted)return;
      const closing=closeDraft(), formGeneration=generation;
      pane.replaceChildren(el('h2','新建'+writerKindLabel(kind)));
      const form=el('form'),slug=field(`${kind==='gallery'?'相册':kind==='project'?'项目':'文章'}网址（创建后固定）`),title=field('标题');slug.input.name='key';title.input.name='title';if(kind!=='gallery')slug.input.pattern='[a-z0-9]+(-[a-z0-9]+)*';slug.input.maxLength=kind==='gallery'?100:60;slug.input.required=true;slug.input.placeholder=kind==='project'?'my-new-project':'my-new-post';
      if(kind==='post'||kind==='project'||kind==='gallery')form.append(title.label,slug.label);
      const create=el('button','创建私密草稿','primary');create.type='submit';form.append(create,el('p','创建和保存不会发布到网站。','writer-note'));pane.append(form);
      form.addEventListener('submit',event=>{
        event.preventDefault();
        if(disposed||generation!==formGeneration||create.disabled)return;
        const creation=selectDraft();
        void perform(async()=>{
          create.disabled=true;
          try{
            const value=newValue(kind);
            if(kind==='post'||kind==='project'||kind==='gallery')value.fields.title=title.input.value;
            const result=await api('/drafts',{method:'POST',body:JSON.stringify({action:'create',kind,key:slug.input.value,value})});
            await openDraft(result.draft,creation);
            if(!creation.aborted)await loadList('drafts');
          }finally{if(generation===formGeneration)create.disabled=false;}
        },creation);
      });
      if(kind==='talk')form.requestSubmit();
      await closing;
    },selection);
  }
  async function openDraft(draft:WriterDraft,selection:AbortSignal,saveCurrent=false){
    if(selection.aborted)return;
    let copies:RecoveryRecord[]=[], backupFailed=false;
    try{copies=await recovery.findDraft(options.user.id,draft.id);}catch{backupFailed=true;}
    if(selection.aborted)return;
    if(saveCurrent){
      await flush();
      if(selection.aborted)return;
      // 读取同一份草稿期间也可能保存了更新的版本。
      if(active?.id===draft.id&&controller!.current().revision>draft.revision)return;
    }
    const closing=closeDraft(), recoveryGeneration=generation;
    if(backupFailed)backup.textContent='本设备备份不可用，请及时保存或下载';
    const candidates=copies.filter(copy=>JSON.stringify(copy.value)!==JSON.stringify(draft.value)||copy.pendingImages?.length);
    if(candidates.length){
      pane.replaceChildren(el('h2','发现本设备恢复副本'),el('p','选择要继续编辑的版本。其他发布基线的副本也列在这里；恢复后仍会检查云端版本，不会覆盖其他设备的新内容。'));
      const comparison=(value:WriterValue)=>(draft.kind==='project'||draft.kind==='forge'||draft.kind==='gallery'?JSON.stringify(value.fields,null,2)+'\n\n':'')+value.body;
      const cloud=el('label',draft.kind==='project'||draft.kind==='forge'||draft.kind==='gallery'?'当前云端文案与正文（只读）':'当前云端正文','writer-field'),area=el('textarea');area.value=comparison(draft.value);area.readOnly=true;cloud.append(area);pane.append(cloud);
      for(const restore of candidates){
        const section=el('section'),base=restore.key.split('/').at(-1)??'new',label=el('label',`本设备 · ${new Date(restore.updatedAt).toLocaleString()} · 基线 ${base==='new'?'未发布':base.slice(0,12)}`,'writer-field'),body=el('textarea');body.value=comparison(restore.value);body.readOnly=true;label.append(body);
        const restoreButton=button('恢复本设备版本',()=>{
          if(recoveryGeneration!==generation)return;
          selectDraft();
          renderDraft(draft,restore);
        });
        section.append(label,el('p',`${restore.pendingImages?.length??0} 张待上传配图`,'writer-note'),restoreButton,button('下载恢复副本',()=>perform(()=>recoveryExport(draft.key,restore))));pane.append(section);
      }
      const useCloud=button('使用云端版本',()=>{
        if(recoveryGeneration!==generation)return;
        const choice=selectDraft();
        return perform(async()=>{
          for(const copy of copies){
            if(choice.aborted)return;
            await recovery.remove(copy.key);
          }
          if(!choice.aborted)renderDraft(draft);
        },choice);
      });
      pane.append(el('p','选择使用云端版本会清理本设备上此草稿的上述恢复副本，请先下载需要保留的版本。','writer-note'),useCloud);
    }else renderDraft(draft);
    await closing;
  }
  function renderDraft(draft:WriterDraft,restore?:RecoveryRecord){
    active=structuredClone(draft);if(restore){active.value=structuredClone(restore.value);active.revision=restore.revision;pending=(restore.pendingImages??[]).map(p=>{const url=URL.createObjectURL(p.blob);urls.add(url);return {...p,url};});}
    const ticket=++generation,working=active;pane.replaceChildren(el('h2',`${writerKindLabel(working.kind,working.key)} · ${working.key}`));
    let galleryFields:ReturnType<typeof mountGalleryFields>|undefined;
    let projectFields:ReturnType<typeof mountProjectFields>|undefined;
    const knownImages=new Map(working.value.assets.map(asset=>[asset.sha256,asset]));
    const tools=el('div','','writer-toolbar'),fields=el('div','','writer-fields'),bodyLabel=el('section','','writer-composer'),preview=el('article','','writer-preview'),images=el('div','','writer-images'),imageSection=el('section'),publishing=el('section'),conflict=el('section','','writer-conflict');
    preview.hidden=true;conflict.hidden=true;
    const storeCopy=async(copy:RecoveryCopy)=>{const key=recoveryKey(options.user.id,working);await recovery.put({...copy,key,user:options.user.id,draftId:working.id,pendingImages:pending.map(({id,blob,alt,cover})=>({id,blob,alt,cover}))});if(restore&&restore.key!==key)await recovery.remove(restore.key);};
    const edit=()=>{if(controller){if(bodyEditor)working.value.body=bodyEditor.getMarkdown();const restored=restoreImageAssets(working.value.body,working.value.assets,knownImages);if(restored.length!==working.value.assets.length){working.value.assets=restored;renderImages();}controller.edit(working.value);if(!preview.hidden)renderPreview();}};
    const resolveImage=(source:string)=>{
      if(source.startsWith('writer-asset:')){const sha=source.slice(13);return knownImages.has(sha)?imageUrl(sha):null;}
      if(working.kind==='forge'&&working.key==='links'){
        const raw=source.trim();
        if(!raw) return null;
        if(/^https?:\/\//i.test(raw)){
          if(raw==='https://northcedar.top/my-avatar') return working.base?`/api/writer/content?commit=${working.base.commit}&image=${encodeURIComponent('public/my-avatar.jpg')}`:'/my-avatar.jpg';
          return raw;
        }
        if(raw==='/my-avatar'||raw==='/my-avatar.jpg') return working.base?`/api/writer/content?commit=${working.base.commit}&image=${encodeURIComponent('public/my-avatar.jpg')}`:'/my-avatar.jpg';
        if(/^\/avatars\/friends\/[\p{L}\p{N}_ .-]+\.(?:png|jpe?g|webp|avif)$/u.test(raw)&&!raw.includes('..')){
          return working.base?`/api/writer/content?commit=${working.base.commit}&image=${encodeURIComponent('public'+raw)}`:raw;
        }
        return null;
      }
      if(!working.base)return null;let path:string;
      if(working.kind==='post'||working.kind==='project'||working.kind==='gallery'){
        const name=source.replace(/^\.\//,'');
        if(!/^[\p{L}\p{N}_ .-]+\.(?:png|jpe?g|webp|avif)$/u.test(name)||name.includes('..'))return null;
        path=`${writerAssetDirectory(working.kind,working.key)}${name}`;
      }
      else if(working.kind==='talk')path='src/assets/talks/'+source;else return null;
      return `/api/writer/content?commit=${working.base.commit}&image=${encodeURIComponent(path)}`;
    };
    const renderPreview=()=>{preview.replaceChildren();if(working.kind==='project'||working.kind==='forge')preview.append(renderForgePreview(working.kind,working.value,resolveImage,working.key));if(working.kind!=='forge')preview.append(renderWriterMarkdown(bodyEditor!.getMarkdown(),resolveImage));};
    async function showConflict(){
      try{const result=await api('/drafts?id='+working.id);if(ticket!==generation)return;conflict.hidden=false;conflict.replaceChildren(el('h3','对照版本'));const comparison=el('div','','writer-compare');
        for(const [name,text]of [['当前输入',JSON.stringify(controller!.current().value.fields,null,2)+'\n\n'+working.value.body],['云端版本',JSON.stringify(result.draft.value.fields,null,2)+'\n\n'+result.draft.value.body]]){const label=el('label',name,'writer-field'),area=el('textarea');area.value=text;area.readOnly=true;label.append(area);comparison.append(label);}
        const copyDraft=button('将当前输入另存为新草稿',()=>{
          if(ticket!==generation)return;
          const selection=selectDraft();
          return perform(async()=>{
            const current=controller!.current();
            const result=await api('/drafts',{method:'POST',body:JSON.stringify({action:'copy',id:current.id,baseCommit:current.base?.commit??null,value:current.value})});
            if(ticket!==generation)return;
            await openDraft(result.draft,selection);
            if(!selection.aborted)await loadList('drafts');
          },selection);
        });
        conflict.append(comparison,el('p','另存会保留当前输入和原内容网址，原草稿不变。发布前仍需对照仓库最新内容。','writer-note'),copyDraft,button('下载当前输入',markdownExport));
      }catch(error){if(ticket===generation)showError(error);}
    }
    controller=createSaveController({beforeSave:async()=>{await galleryFields?.prepare();},load:()=>draft,initialRecovery:restore,save:async input=>(await api('/drafts',{method:'POST',body:JSON.stringify({action:'save',...input})})).draft,recovery:{put:storeCopy},onState:(state,info)=>{if(disposed||ticket!==generation)return;status.textContent=SAVE_LABELS[state]+(state==='saved'&&info.revision===(controller?.current().publishedRevision??working.publishedRevision)?' · 已发布':' · 未发布修改');backup.textContent=info.backedUp?'':'本设备备份失败，请及时保存到云端或下载当前输入。';if(state==='conflict')void showConflict();}});
    const save=button('保存草稿',()=>perform(async()=>{await galleryFields?.prepare();await controller!.saveNow();await loadList('drafts');}),'primary'),toggle=button('预览',()=>{preview.hidden=!preview.hidden;bodyLabel.hidden=!preview.hidden;toggle.textContent=preview.hidden?'预览':'继续编辑';toggle.setAttribute('aria-pressed',String(!preview.hidden));if(!preview.hidden)renderPreview();});toggle.setAttribute('aria-pressed','false');
    const publish=button('发布',()=>perform(async()=>{if(pending.length)throw Error('还有等待确认的配图，请先上传或放弃后再发布');projectFields?.validate();galleryFields?.validate();await galleryFields?.prepare();if(working.kind==='gallery'){working.value.fields.draft=false;edit();}const current=await controller!.saveNow();if(options.onPublish)await options.onPublish(current,publishing);else showError(Error('发布暂不可用，草稿仍可保存和导出'));}),'primary');publish.disabled=!options.publish;
    tools.append(save,toggle,button('下载 Markdown',markdownExport),button('导出完整草稿',()=>perform(async()=>{await flush();const data=await api('/drafts?id='+working.id+'&export=1');download(`${working.key}-draft.json`,JSON.stringify(data));})),publish);
    const setField=(name:string,title:string,type='text',wide=false)=>{const f=field(title,type,wide);f.input.name=name;f.input.value=String(working.value.fields[name]??'');f.input.addEventListener('input',()=>{working.value.fields[name]=f.input.value;edit();});fields.append(f.label);return f.input;};
    const postCover = el('section','','writer-image wide');
    const coverImage = el('img');
    const coverAlt = field('封面说明');
    const coverSelect = el('select');
    const pendingCovers = el('div');
    function refreshCover() {
      const src = String(working.value.fields.cover ?? '');
      const url = resolveImage(src);
      if (url) coverImage.src = url;
      else coverImage.removeAttribute('src');
      coverImage.hidden = !url;
      coverAlt.label.hidden = !src;
      coverImage.alt = coverAlt.input.value = String(working.value.fields.coverAlt ?? '');
      coverSelect.value = src;
      if (coverSelect.selectedIndex < 0) coverSelect.selectedIndex = 0;
    }
    function setCover(src: string, alt: string) {
      working.value.fields.cover = src;
      working.value.fields.coverAlt = alt;
      refreshCover();
      edit();
    }
    function coverChoices() {
      const choices = writerBodyImages(bodyEditor!.getMarkdown());
      for (const asset of working.value.assets) {
        const src = 'writer-asset:'+asset.sha256;
        if (!choices.has(src)) choices.set(src,asset.alt);
      }
      const hint = el('option','从正文或已上传图片中选一张');
      hint.value = '';
      coverSelect.replaceChildren(hint);
      for (const [src, alt] of choices) if (resolveImage(src)) {
        const option = el('option',alt || src.split('/').at(-1));
        option.value = src;
        option.dataset.alt = alt;
        coverSelect.append(option);
      }
      coverSelect.value = String(working.value.fields.cover ?? '');
      if (coverSelect.selectedIndex < 0) coverSelect.selectedIndex = 0;
    }
    if(working.kind==='post'){setField('title','标题','text',true);const summary=setField('summary','摘要（80 字以内）','text',true);summary.maxLength=80;}
    if(working.kind==='post'||working.kind==='talk')setField('date','日期','date');
    if(working.kind==='post'){
      setField('updated','更新日期（可选）','date');const tagLabel=el('label','标签（按住 Ctrl 或在手机列表中选择，最多 3 个）','writer-field wide'),select=el('select');select.multiple=true;select.size=4;for(const tag of tags){const option=el('option',tag);option.value=tag;option.selected=Array.isArray(working.value.fields.tags)&&working.value.fields.tags.includes(tag);select.append(option);}select.addEventListener('change',()=>{if(select.selectedOptions.length>3){showError(Error('标签最多选择 3 个'));return;}working.value.fields.tags=Array.from(select.selectedOptions,o=>o.value);edit();});tagLabel.append(select);fields.append(tagLabel);
      const coverUpload = el('input');
      coverUpload.type = 'file';
      coverUpload.accept = 'image/jpeg,image/png,image/webp';
      coverUpload.name = 'post-cover-upload';
      coverUpload.setAttribute('aria-label','上传文章封面');
      coverUpload.addEventListener('change',()=>{
        void perform(()=>files(Array.from(coverUpload.files??[]),true));
        coverUpload.value='';
      });
      coverSelect.setAttribute('aria-label','选择文章封面');
      coverSelect.addEventListener('focus',coverChoices);
      coverSelect.addEventListener('change',()=>{
        if(coverSelect.value)setCover(coverSelect.value,coverSelect.selectedOptions[0].dataset.alt??'');
      });
      coverAlt.input.addEventListener('input',()=>{
        working.value.fields.coverAlt=coverImage.alt=coverAlt.input.value;
        edit();
      });
      postCover.append(el('h3','文章封面'),coverImage,coverSelect,coverUpload,coverAlt.label,button('清除封面',()=>{setCover('','');coverSelect.value='';}),pendingCovers);
      fields.append(postCover);
      refreshCover();
    }
    async function uploadLinkAvatar(file:File){
      if(pending.length) throw Error('还有未处理的待上传图片');
      const existing=publishedAssetHashes(working.base);
      if(working.value.assets.filter(a=>!existing.has(a.sha256)).length>=writerImageLimit(working.kind,working.key)) throw Error('友链上传头像数量已达上限');
      const prepared=await prepareWriterImage(file);
      URL.revokeObjectURL(prepared.previewUrl);
      if(ticket!==generation) throw Error('编辑会话已切换，请重新上传');
      const result=await api<{sha256:string}>('/assets',{method:'POST',headers:{'Content-Type':'image/webp'},body:prepared.blob});
      if(ticket!==generation) throw Error('编辑会话已切换，请重新上传');
      if(!working.value.assets.some(a=>a.sha256===result.sha256)) working.value.assets.push({sha256:result.sha256,alt:file.name||'友链头像'});
      knownImages.set(result.sha256,working.value.assets.find(a=>a.sha256===result.sha256)!);
      return 'writer-asset:'+result.sha256;
    }
    if(working.kind==='gallery'){galleryFields=mountGalleryFields(fields,{value:working.value,onChange:edit,resolveImage,index:working.base?.galleryIndex??0});galleryDestroy=()=>galleryFields?.destroy();}
    if(working.kind==='project')projectFields=mountProjectFields(fields,{value:working.value,onChange:edit,onError:showError,resolveImage});
    if(working.kind==='forge'){
      if(working.key==='links')mountLinksFields(fields,{value:working.value,onChange:edit,onError:showError,resolveImage,uploadAvatar:uploadLinkAvatar});
      else mountForgeFields(fields,{value:working.value,onChange:edit,onError:showError,resolveImage});
    }
    else bodyEditor=mountWriterBody(bodyLabel,working.value.body,{onChange:edit,resolveImage,onImageFiles:input=>void perform(()=>files(input)),onError:showError});
    const move=(from:number,to:number)=>{if(to<0||to>=working.value.assets.length)return;const [item]=working.value.assets.splice(from,1);working.value.assets.splice(to,0,item);edit();renderImages();};
    async function upload(image:PendingImage){
      if(!pending.includes(image))return;
      if(working.kind!=='gallery'&&!image.alt.trim())throw Error('请先填写图片说明');
      const result=await api<{sha256:string}>('/assets',{method:'POST',headers:{'Content-Type':'image/webp'},body:image.blob});if(ticket!==generation||!pending.includes(image))return;
      if(!working.value.assets.some(a=>a.sha256===result.sha256))working.value.assets.push({sha256:result.sha256,alt:image.alt});
      knownImages.set(result.sha256,working.value.assets.find(a=>a.sha256===result.sha256)!);
      if(working.kind==='post'){
        const src='writer-asset:'+result.sha256;
        if(image.cover)setCover(src,image.alt);
        else if(!bodyEditor!.insertImage(src,image.alt))throw Error('图片已上传，请完成当前文字输入后再次点击“上传并添加”；待添加图片会保留。');
      }
      galleryFields?.addUploaded(result.sha256,image.alt,{width:image.width,height:image.height});
      pending=pending.filter(p=>p!==image);URL.revokeObjectURL(image.url);urls.delete(image.url);edit();renderImages();
    }
    function renderImages(){
      projectFields?.refreshAssets();galleryFields?.refreshAssets();
      images.replaceChildren();pendingCovers.replaceChildren();(working.kind==='gallery'?[]:working.value.assets).forEach((asset,index)=>{
        const card=el('div','','writer-image');card.dataset.imageId=asset.sha256;const image=el('img');image.src=imageUrl(asset.sha256);image.alt=asset.alt||'已上传的配图';card.append(image);
        const alt=field('图片说明');alt.input.value=asset.alt;alt.input.addEventListener('input',()=>{asset.alt=alt.input.value;image.alt=asset.alt||'已上传的配图';edit();});card.append(alt.label);
        const actions=el('div','','writer-toolbar'),handle=button('按住拖动',()=>{});handle.dataset.imageHandle='';handle.setAttribute('aria-label',`拖动第 ${index+1} 张配图`);
        handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;handle.setPointerCapture(event.pointerId);card.dataset.dragging='';});
        handle.addEventListener('pointerup',event=>{if(!handle.hasPointerCapture(event.pointerId))return;delete card.dataset.dragging;handle.releasePointerCapture(event.pointerId);const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-image-id]');const to=working.value.assets.findIndex(a=>a.sha256===target?.dataset.imageId);if(to>=0)move(index,to);});handle.addEventListener('pointercancel',()=>delete card.dataset.dragging);
        actions.append(handle,button('上移',()=>move(index,index-1)),button('下移',()=>move(index,index+1)),button('移除',()=>{const source='writer-asset:'+asset.sha256;if(working.kind==='gallery'&&Array.isArray(working.value.fields.images)&&working.value.fields.images.some((i:any)=>i.src===source)){showError(Error('请先移除图库项，再解除上传资产引用'));return;}if(working.kind==='project'&&projectImageReferences(working.value,source)){showError(Error('请先从项目图库的主图或暗色替图中移除这张图片，再删除配图。'));return;}if((working.kind==='post'||working.kind==='project')&&!bodyEditor!.removeImage(source))return;working.value.assets.splice(index,1);if(working.value.fields.cover===`writer-asset:${asset.sha256}`){working.value.fields.cover='';working.value.fields.coverAlt='';}edit();renderImages();}));
        if(working.kind==='post')actions.append(button('设为封面',()=>setCover('writer-asset:'+asset.sha256,asset.alt)));if(working.kind==='project')actions.append(button('插入项目正文',()=>{if(bodyEditor!.insertImage('writer-asset:'+asset.sha256,asset.alt))edit();}));card.append(actions);images.append(card);
      });
      for(const image of pending){const card=el('div','','writer-image'),previewImage=el('img');previewImage.src=image.url;previewImage.alt=image.alt||'上传前的压缩预览';card.append(previewImage,el('p',`${image.width??''} × ${image.height??''} · 压缩后 ${Math.ceil(image.blob.size/1024)} KiB${image.originalSize?' / 原图 '+Math.ceil(image.originalSize/1024)+' KiB':''}`,'writer-note'));
        const alt=field(image.cover?'封面说明（上传前必填）':'图片说明（上传前必填）');alt.input.value=image.alt;alt.input.addEventListener('input',()=>{image.alt=alt.input.value;edit();});if(working.kind!=='gallery')card.append(alt.label,button(image.cover?'上传为封面':'上传并添加',()=>perform(()=>upload(image)),'primary'));card.append(button('放弃这张',()=>{pending=pending.filter(p=>p!==image);URL.revokeObjectURL(image.url);urls.delete(image.url);edit();renderImages();}));(image.cover?pendingCovers:images).append(card);}
      if(working.kind==='post'&&bodyEditor){refreshCover();coverChoices();}
    }
    const choose=el('input');choose.type='file';choose.accept='image/jpeg,image/png,image/webp';choose.multiple=true;choose.setAttribute('aria-label','选择配图');
    let fileQueue=Promise.resolve(),uploadBatch:Promise<void>|null=null;
    function files(input:File[],cover=false){const task=fileQueue.then(()=>prepareFiles(input,cover));fileQueue=task.catch(()=>{});return task;}
    async function uploadAll(){if(uploadBatch)return uploadBatch;uploadBatch=(async()=>{for(const image of pending.filter(image=>!image.cover)){if(ticket!==generation)return;await upload(image);}})().finally(()=>{uploadBatch=null;});return uploadBatch;}
    async function prepareFiles(input:File[],cover:boolean){for(const file of input){if(ticket!==generation)return;const existing=publishedAssetHashes(working.base);if(working.value.assets.filter(a=>!existing.has(a.sha256)).length+pending.length>=writerImageLimit(working.kind))throw Error('本篇新增图片数量已达上限');const result=await prepareWriterImage(file);if(ticket!==generation){URL.revokeObjectURL(result.previewUrl);return;}urls.add(result.previewUrl);pending.push({id:crypto.randomUUID(),blob:result.blob,url:result.previewUrl,alt:'',cover,...result});edit();renderImages();}}
    choose.addEventListener('change',()=>{void perform(()=>files(Array.from(choose.files??[])));choose.value='';});
    imageSection.append(el('h3','配图'),el('p',working.kind==='gallery'?'多选照片后点击“全部上传到相册”，可暂时不填图注。上传后在本册照片中补齐图注，发布前会检查。':working.kind==='project'?'先预览压缩结果并填写说明，再上传。上传后可在项目图库选择主图、暗色替图，或插入正文。图库顺序与下方上传列表独立。':'先预览压缩结果并填写说明，再上传。说说按下方顺序展示；文章内的位置由正文图片引用决定。','writer-note'),choose,button(working.kind==='gallery'?'全部上传到相册':'上传全部配图',()=>perform(uploadAll)),images);
    // 语音：文章插一行 `!audio[说明](writer-audio:<sha>)` 进正文，说说进 audio 列表，其余类型不给入口。
    const audioSection=el('div','','writer-images'),audioList=el('div','','writer-image-list'),audioChoose=el('input');
    audioChoose.type='file';audioChoose.accept='audio/mpeg,audio/wav,.mp3,.wav';audioChoose.setAttribute('aria-label','选择语音');
    function renderAudio(){
      if(!Array.isArray(working.value.audios))working.value.audios=[];
      audioList.replaceChildren();working.value.audios.forEach((clip,index)=>{
        const card=el('div','','writer-image'),player=el('audio');player.controls=true;player.preload='metadata';player.src='/api/writer/audio?sha256='+clip.sha256;player.setAttribute('aria-label',clip.label||'已上传的语音');card.append(player);
        const label=field('语音说明');label.input.value=clip.label??'';label.input.addEventListener('input',()=>{clip.label=label.input.value;edit();});card.append(label.label);
        const actions=el('div','','writer-toolbar');actions.append(button('移除',()=>{working.value.audios.splice(index,1);edit();renderAudio();}));card.append(actions);audioList.append(card);
      });
    }
    async function uploadAudio(file:File){
      const ext=/\.wav$/i.test(file.name)?'wav':/\.mp3$/i.test(file.name)?'mp3':'';
      if(!ext)throw Error('请选择 MP3 或 WAV 语音');
      if(file.size>1_500_000)throw Error('单条语音不能超过 1.5 MB（约 100 秒），请先裁剪');
      if(!Array.isArray(working.value.audios))working.value.audios=[];
      if(working.value.audios.length>=9)throw Error('一份草稿最多 9 条语音');
      const label=(prompt('这条语音的说明（可留空）')??'').trim().slice(0,120);
      const result=await api<{sha256:string;ext:'mp3'|'wav'}>(`/audio`,{method:'POST',headers:{'Content-Type':ext==='wav'?'audio/wav':'audio/mpeg'},body:file});
      if(!working.value.audios.some(a=>a.sha256===result.sha256))working.value.audios.push({sha256:result.sha256,ext:result.ext,label});
      if(working.kind==='post'&&!bodyEditor!.insertAudio('writer-audio:'+result.sha256,label))throw Error('语音已上传，请先在正文里定位光标后再插入');
      edit();renderAudio();
    }
    audioChoose.addEventListener('change',()=>{const picked=audioChoose.files?.[0];audioChoose.value='';if(picked)void perform(()=>uploadAudio(picked));});
    if(working.kind==='post'||working.kind==='talk'){
      audioSection.append(el('h3','语音'),el('p',working.kind==='post'?'上传后会把一行语音引用插进正文，发布时原件跟随仓库提交到 content/audio/。单条不超过 1.5 MB。':'上传后按顺序挂在说说下面。单条不超过 1.5 MB。','writer-note'),audioChoose,audioList);
    }
    const metadata=el('details'),metaSummary=el('summary','保留的原有资料');metadata.append(metaSummary,el('pre',JSON.stringify(working.value.fields,null,2),'writer-note'));
    const deleteDraft=button('删除这份云端草稿',()=>perform(async()=>{if(!confirm(`删除「${working.value.fields.title??working.key}」草稿及其已结束任务？网站上已发布的内容会保留。建议先导出。`))return;await api('/drafts',{method:'POST',body:JSON.stringify({action:'delete',id:working.id,revision:controller!.current().revision})});await controller!.dispose();controller=null;active=null;generation++;releaseUrls();pane.replaceChildren(el('p','草稿已删除，已发布内容仍在网站上。'));await loadList('drafts');}));
    pane.append(tools,status,backup,fields);if(working.kind!=='forge')pane.append(bodyLabel);pane.append(preview);if(working.kind!=='forge')pane.append(imageSection);if(working.kind==='post'||working.kind==='talk')pane.append(audioSection);pane.append(metadata,conflict,publishing,el('p',options.publish?'保存不会发布，点击发布后还需确认本次内容。':'发布尚未配置；私密草稿仍可保存和导出。','writer-note'),deleteDraft);renderImages();renderAudio();void controller.ready;
  }
  navigation.setAttribute('aria-label','内容分类');for(const [mode,label]of [['drafts','草稿'],['post','文章'],['talk','说说'],['links','友链'],['project','造物台项目'],['gallery','相册'],['forge','页面文案'],['jobs','发布记录']])navigation.append(button(label,()=>perform(()=>loadList(mode))));
  const newButtons=el('div','','writer-toolbar');newButtons.append(button('新文章',()=>start('post'),'primary'),button('新说说',()=>start('talk')),button('新项目',()=>start('project')),button('新相册',()=>start('gallery')));sidebar.prepend(newButtons);
  const storage=el('div','','writer-storage');storage.append(button('配图占用与清理',()=>perform(async()=>{await flush();await showWriterStorage(pane,api);})));sidebar.append(storage);
  pane.append(el('h2',`你好，${options.user.nickname}`),el('p','选择一份草稿，或写下新的文章、说说与造物台项目。造物台页面文案可从左侧导入编辑。保存只会留在你的私密空间里。'));
  void perform(async()=>{tags=(await api('/content?mode=tags')).tags;await loadList('drafts');});
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(controller?.isDirty()||pending.length){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  const online=()=>{if(controller)void perform(()=>controller!.saveNow());};window.addEventListener('online',online);
  return {getDraft:()=>controller?.current(),showError,
    async refreshPublished(draftId:string){if(!active||active.id!==draftId||!controller)return;const id=active.id,result=await api('/drafts?id='+id);if(!active||active.id!==id||!controller)return;const oldKey=recoveryKey(options.user.id,active);active.base=result.draft.base;active.publishedRevision=result.draft.publishedRevision;await controller.advanceBase(active.base,active.publishedRevision);if(oldKey!==recoveryKey(options.user.id,active))await recovery.remove(oldKey);},
    async dispose(){
      if(disposed)return;
      disposed=true;
      draftSelection?.abort();
      listGeneration++;
      window.removeEventListener('beforeunload',beforeUnload);
      window.removeEventListener('online',online);
      const closing=closeDraft();
      root.replaceChildren();
      await closing;
    }};
}
