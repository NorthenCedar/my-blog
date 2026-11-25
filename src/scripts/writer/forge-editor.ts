import type { WriterValue } from '../../lib/writer/model';
import { FORGE_TEXT_FIELDS } from '../../lib/forge-fields';
import { el,button,field } from './ui';

type Context={value:WriterValue;onChange:()=>void;onError:(error:unknown)=>void;resolveImage:(source:string)=>string|null;uploadAvatar?:(file:File)=>Promise<string>};
type GalleryImage={src:string;alt:string;darkSrc?:string;[key:string]:unknown};
const EFFECTS=[['auto','自动选择'],['lift','轻抬'],['tilt','倾斜'],['stack','叠片'],['zoom','放大'],['scan','掠光'],['develop','显影']];
const gallery=(value:WriterValue)=>Array.isArray(value.fields.images)?value.fields.images as GalleryImage[]:[];
export const projectImageReferences=(value:WriterValue,source:string)=>gallery(value).some(image=>image.src===source||image.darkSrc===source);

function textField(host:HTMLElement,name:string,label:string,value:unknown,change:(text:string)=>void,options:{maxLength?:number;multiline?:boolean;wide?:boolean}={}){
  const wrapper=el('label',label,'writer-field'+(options.wide?' wide':'')),input=options.multiline?el('textarea'):el('input');
  input.name=name;input.value=String(value??'');if(options.maxLength)input.maxLength=options.maxLength;if(options.multiline)(input as HTMLTextAreaElement).rows=3;
  input.addEventListener('input',()=>change(input.value));wrapper.append(input);host.append(wrapper);return input;
}
function selectField(host:HTMLElement,name:string,label:string,current:unknown,choices:readonly (readonly string[])[],change:(value:string)=>void){
  const wrapper=el('label',label,'writer-field'),select=el('select');select.name=name;
  for(const [value,text]of choices){const option=el('option',text);option.value=value;option.selected=value===current;select.append(option);}select.value=String(current??'');
  select.addEventListener('change',()=>change(select.value));wrapper.append(select);host.append(wrapper);return select;
}
function thumbnail(host:HTMLElement,source:string,alt:string,resolve:Context['resolveImage'],label:string){
  const url=resolve(source),figure=el('figure','','writer-gallery-preview');figure.append(el('figcaption',label));
  if(url){const image=el('img');image.src=url;image.alt=alt;image.loading='lazy';figure.append(image);}else figure.append(el('p',source?'图片暂不可用':'尚未选择图片','writer-note'));
  host.append(figure);
}
export function safeProjectLink(value:string){
  if(/[\\\u0000-\u0020]/.test(value))return false;if(/^\/(?!\/)/.test(value))return true;if(!value.startsWith('https://'))return false;
  try{const url=new URL(value);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password;}catch{return false;}
}
export function mountProjectFields(host:HTMLElement,context:Context){
  const {value,onChange,onError,resolveImage}=context,fields=value.fields;
  for(const [name,label,maxLength]of [['title','项目名称',60],['summary','项目摘要（160 字以内）',160],['tagline','一句话介绍',60],['category','分类',undefined],['status','状态',undefined]] as const){
    textField(host,name,label,fields[name],text=>{fields[name]=text;onChange();},{maxLength,wide:name==='title'||name==='summary',multiline:name==='summary'});
  }
  const order=field('展示顺序（较小的在前）','number');order.input.name='order';order.input.min='0';order.input.step='1';order.input.value=String(fields.order??0);order.input.addEventListener('input',()=>{fields.order=order.input.value===''?'':Number(order.input.value);onChange();});host.append(order.label);
  const preview=fields.preview&&typeof fields.preview==='object'&&!Array.isArray(fields.preview)?fields.preview as Record<string,unknown>:{};
  // 只开放这份项目已有的模型；从照片切回时，沿用保留下来的原模型资料。
  const originalModel=Object.keys(preview).length&&(fields.visual==='site'||fields.visual==='desk')?fields.visual:typeof preview.wordmark==='string'&&preview.wordmark.trim()?'site':typeof preview.write==='string'&&preview.write.trim()?'desk':null;
  const visuals:[string,string][]=[['image','照片']];if(originalModel)visuals.push([originalModel,originalModel==='site'?'网站模型':'写作台模型']);
  selectField(host,'visual','展示模板',fields.visual??'image',visuals,visual=>{if(!visuals.some(([option])=>option===visual))return;fields.visual=visual;onChange();});
  selectField(host,'effect','照片动效',fields.effect??'auto',EFFECTS,effect=>{fields.effect=effect;onChange();});
  const tagSection=el('section','','wide writer-forge-section'),tagsList=el('div','','writer-repeat-list');tagSection.append(el('h3','项目标签'),el('p','最多 4 个。模型模板原有的预览资料会保留。','writer-note'),tagsList);host.append(tagSection);
  const getTags=()=>Array.isArray(fields.tags)?fields.tags as string[]:[];
  function renderTags(){tagsList.replaceChildren();getTags().forEach((tag,index)=>{const row=el('div','','writer-repeat-row');textField(row,`tag-${index}`,`标签 ${index+1}`,tag,text=>{getTags()[index]=text;onChange();});row.append(button('移除标签',()=>{getTags().splice(index,1);onChange();renderTags();}));tagsList.append(row);});const add=button('添加标签',()=>{fields.tags=[...getTags(),''];onChange();renderTags();});add.disabled=getTags().length>=4;tagsList.append(add);}renderTags();
  const imageSection=el('section','','wide writer-forge-section'),imageList=el('div','','writer-gallery');imageSection.append(el('h3','项目图库'),el('p','最多 6 张，第一张是封面。叠片使用前 3 张；暗色替图可选。先在下方配图区上传，再从列表选择。','writer-note'),imageList);host.append(imageSection);
  function sources(current=''){const choices:[string,string][]=[['','选择已上传配图']];if(current&&!current.startsWith('writer-asset:'))choices.push([current,`现有图片 · ${current}`]);for(const asset of value.assets)choices.push(['writer-asset:'+asset.sha256,asset.alt||`配图 ${choices.length}`]);return choices;}
  function renderGallery(){
    imageList.replaceChildren();gallery(value).forEach((image,index)=>{
      const card=el('section','','writer-image');card.append(el('h4',index===0?'第 1 张 · 封面':`第 ${index+1} 张`));
      const previews=el('div','','writer-gallery-previews'),refreshPreview=()=>{previews.replaceChildren();thumbnail(previews,image.src,image.alt,resolveImage,'主图');if(image.darkSrc)thumbnail(previews,image.darkSrc,image.alt,resolveImage,'暗色替图');};refreshPreview();card.append(previews);
      selectField(card,`image-${index}-src`,'主图',image.src,sources(image.src),src=>{image.src=src;onChange();refreshPreview();});
      textField(card,`image-${index}-alt`,'图片说明（必填）',image.alt,alt=>{image.alt=alt;onChange();refreshPreview();});
      selectField(card,`image-${index}-darkSrc`,'暗色替图（可选）',image.darkSrc??'',sources(image.darkSrc).map(([source,label])=>[source,source?label:'不使用暗色替图']),source=>{if(source)image.darkSrc=source;else delete image.darkSrc;onChange();refreshPreview();});
      const actions=el('div','','writer-toolbar'),up=button('上移',()=>move(index,index-1)),down=button('下移',()=>move(index,index+1));up.disabled=index===0;down.disabled=index===gallery(value).length-1;
      actions.append(up,down,button('移除图库项',()=>{gallery(value).splice(index,1);onChange();renderGallery();}));card.append(actions);imageList.append(card);
    });
    const add=button('添加图库图片',()=>{const available=value.assets.find(asset=>!gallery(value).some(image=>image.src==='writer-asset:'+asset.sha256));if(!available){onError(Error('请先在配图区上传一张新图片，再添加到图库。'));return;}fields.images=[...gallery(value),{src:'writer-asset:'+available.sha256,alt:available.alt}];onChange();renderGallery();});add.disabled=gallery(value).length>=6;imageList.append(add);
  }
  function move(from:number,to:number){const images=gallery(value);if(to<0||to>=images.length)return;const [image]=images.splice(from,1);images.splice(to,0,image);onChange();renderGallery();}renderGallery();
  const linksSection=el('section','','wide writer-forge-section'),linksList=el('div','','writer-repeat-list');linksSection.append(el('h3','项目链接'),el('p','最多 4 个，只接受站内路径（如 /archive/）或不含账户密码的 HTTPS 地址。','writer-note'),linksList);host.append(linksSection);
  const getLinks=()=>Array.isArray(fields.links)?fields.links as {label:string;href:string;[key:string]:unknown}[]:[];
  function renderLinks(){linksList.replaceChildren();getLinks().forEach((link,index)=>{const row=el('div','','writer-link-row');textField(row,`link-${index}-label`,`链接 ${index+1} · 名称`,link.label,text=>{link.label=text;onChange();});const href=textField(row,`link-${index}-href`,'地址',link.href,text=>{link.href=text;href.setCustomValidity(!text||safeProjectLink(text)?'':'请输入站内路径或不含凭据的 HTTPS 地址');onChange();});href.addEventListener('change',()=>{if(link.href&&!safeProjectLink(link.href))onError(Error('项目链接只接受站内路径或不含凭据的 HTTPS 地址'));});row.append(button('移除链接',()=>{getLinks().splice(index,1);onChange();renderLinks();}));linksList.append(row);});const add=button('添加项目链接',()=>{fields.links=[...getLinks(),{label:'',href:''}];onChange();renderLinks();});add.disabled=getLinks().length>=4;linksList.append(add);}renderLinks();
  return {refreshAssets:renderGallery,validate(){if(getLinks().some(link=>!safeProjectLink(link.href)))throw Error('项目链接只接受站内路径或不含凭据的 HTTPS 地址，请修正后再发布。');}};
}

export function mountForgeFields(host:HTMLElement,{value,onChange}:Context){
  const fields=value.fields;
  for(const item of FORGE_TEXT_FIELDS)textField(host,item.key,item.label,fields[item.key],text=>{fields[item.key]=text;onChange();},{maxLength:item.maxLength,multiline:'multiline' in item&&item.multiline,wide:true});
  const stages=el('section','','wide writer-forge-section');stages.append(el('h3','滚动提示（固定 3 条）'));host.append(stages);
  for(let index=0;index<3;index++)textField(stages,`stage-${index}`,`滚动提示 ${index+1}`,Array.isArray(fields.stages)?fields.stages[index]:'',text=>{const values=Array.isArray(fields.stages)?[...fields.stages]:['','',''];values[index]=text;fields.stages=values;onChange();},{multiline:true,maxLength:240});
  const section=el('section','','wide writer-forge-section'),list=el('div','','writer-repeat-list');section.append(el('h3','工作手记'),list);host.append(section);
  const getNotes=()=>Array.isArray(fields.notes)?fields.notes as {title:string;text:string;[key:string]:unknown}[]:[];
  function render(){list.replaceChildren();getNotes().forEach((note,index)=>{const row=el('section','','writer-note-card');textField(row,`note-${index}-title`,`手记 ${index+1} · 标题`,note.title,text=>{note.title=text;onChange();},{maxLength:120});textField(row,`note-${index}-text`,'手记正文',note.text,text=>{note.text=text;onChange();},{multiline:true,maxLength:4000});row.append(button('移除工作手记',()=>{getNotes().splice(index,1);onChange();render();}));list.append(row);});const add=button('添加工作手记',()=>{fields.notes=[...getNotes(),{title:'',text:''}];onChange();render();});add.disabled=getNotes().length>=12;list.append(add);}render();
}

export type FriendItem={name:string;href:string;avatar?:string;desc?:string;[key:string]:unknown};
export type FriendGroup={title:string;note?:string;items:FriendItem[];[key:string]:unknown};
export type ResourceItemField={name:string;href:string;summary:string;detail?:string;badge?:string;cta?:string;code?:string;cover?:string;images?:string[];tags?:string[];[key:string]:unknown};
export type ResourceGroupField={title:string;note?:string;items:ResourceItemField[];[key:string]:unknown};
export function mountLinksFields(host:HTMLElement,{value,onChange,onError,resolveImage,uploadAvatar}:Context){
  const fields=value.fields;
  textField(host,'intro','页头引言',fields.intro,text=>{fields.intro=text;onChange();},{maxLength:320,multiline:true,wide:true});
  const section=el('section','','wide writer-forge-section'),list=el('div','','writer-repeat-list');
  section.append(el('h3','友链分组与卡片'),el('p','可在各分组下添加友链，支持填写链接或直接上传头像图片。','writer-note'),list);
  host.append(section);
  const getGroups=()=>{if(!Array.isArray(fields.groups))fields.groups=[{title:'友情链接',note:'',items:[]}];return fields.groups as FriendGroup[];};
  function render(){
    list.replaceChildren();
    getGroups().forEach((group,gi)=>{
      if(!Array.isArray(group.items))group.items=[];
      const card=el('section','','writer-note-card');
      textField(card,`group-${gi}-title`,`分组 ${gi+1} · 标题`,group.title,text=>{group.title=text;onChange();},{maxLength:80});
      textField(card,`group-${gi}-note`,'分组说明（可选）',group.note??'',text=>{group.note=text;onChange();},{maxLength:240});
      const itemsHost=el('div','','writer-repeat-list');
      group.items.forEach((item,ii)=>{
        const row=el('div','','writer-link-row');
        const thumb=el('img','','writer-link-avatar');
        const syncThumb=()=>{
          const src=typeof item.avatar==='string'&&item.avatar.trim()?resolveImage(item.avatar):null;
          if(src){thumb.src=src;thumb.alt=item.name||'友链头像';thumb.hidden=false;}
          else{thumb.removeAttribute('src');thumb.alt='';thumb.hidden=true;}
        };
        syncThumb();
        textField(row,`group-${gi}-item-${ii}-name`,`友链 ${ii+1} · 名称`,item.name,text=>{item.name=text;onChange();},{maxLength:80});
        textField(row,`group-${gi}-item-${ii}-href`,'链接地址',item.href,text=>{item.href=text;onChange();},{maxLength:500});
        const avatarInput=textField(row,`group-${gi}-item-${ii}-avatar`,'头像链接或已上传图片（可选）',item.avatar??'',text=>{
          if(text.trim())item.avatar=text.trim();
          else delete item.avatar;
          onChange();
          syncThumb();
          clearAvatar.disabled=!item.avatar;
        },{maxLength:400});
        const avatarTools=el('div','','writer-link-avatar-tools');
        avatarTools.append(thumb);
        const clearAvatar=button('清除头像',()=>{
          delete item.avatar;
          avatarInput.value='';
          onChange();
          render();
        });
        clearAvatar.disabled=!item.avatar;
        if(uploadAvatar){
          const fileInput=el('input');
          fileInput.type='file';
          fileInput.accept='image/jpeg,image/png,image/webp';
          fileInput.name=`group-${gi}-item-${ii}-avatar-file`;
          fileInput.hidden=true;
          fileInput.setAttribute('aria-label',`上传 ${item.name||`友链 ${ii+1}`} 的头像`);
          let uploadBtn!:HTMLButtonElement;
          fileInput.addEventListener('change',()=>{
            const picked=fileInput.files?.[0];
            fileInput.value='';
            if(!picked) return;
            uploadBtn.disabled=true;
            uploadAvatar(picked).then(ref=>{
              item.avatar=ref;
              onChange();
              render();
            }).catch(err=>{
              uploadBtn.disabled=false;
              onError(err);
            });
          });
          uploadBtn=button('上传头像',()=>fileInput.click());
          avatarTools.append(fileInput,uploadBtn);
        }
        avatarTools.append(clearAvatar);
        textField(row,`group-${gi}-item-${ii}-desc`,'一句话简介（可选）',item.desc??'',text=>{item.desc=text;onChange();},{maxLength:240,wide:true});
        row.append(avatarTools,button('移除友链',()=>{group.items.splice(ii,1);onChange();render();}));
        itemsHost.append(row);
      });
      const addItem=button('＋ 添加友链',()=>{group.items.push({name:'',href:'https://',desc:''});onChange();render();},'primary');
      const removeGroup=button('移除此分组',()=>{getGroups().splice(gi,1);onChange();render();});
      removeGroup.disabled=getGroups().length<=1;
      card.append(itemsHost,addItem,removeGroup);
      list.append(card);
    });
    const addGroup=button('＋ 添加分组',()=>{getGroups().push({title:'新分组',note:'',items:[{name:'',href:'https://',desc:''}]});onChange();render();});
    list.append(addGroup);
  }
  render();
}

export function mountResourcesFields(host:HTMLElement,{value,onChange,onError,resolveImage,uploadAvatar}:Context){
  const fields=value.fields;
  textField(host,'intro','页头引言',fields.intro,text=>{fields.intro=text;onChange();},{maxLength:320,multiline:true,wide:true});
  const section=el('section','','wide writer-forge-section'),list=el('div','','writer-repeat-list');
  section.append(el('h3','资源分类与条目'),el('p','可自由新增或调整资源种类（如应用与安装包、小说、好用网站）。大文件放网盘或 R2，填写分享链接与提取码即可。','writer-note'),list);
  host.append(section);
  const getGroups=()=>{if(!Array.isArray(fields.groups))fields.groups=[{title:'应用与安装包',note:'',items:[]}];return fields.groups as ResourceGroupField[];};
  function render(){
    list.replaceChildren();
    getGroups().forEach((group,gi)=>{
      if(!Array.isArray(group.items))group.items=[];
      const card=el('section','','writer-note-card');
      textField(card,`group-${gi}-title`,`分类 ${gi+1} · 名称`,group.title,text=>{group.title=text;onChange();},{maxLength:60});
      textField(card,`group-${gi}-note`,'分类说明（可选）',group.note??'',text=>{if(text)group.note=text;else delete group.note;onChange();},{maxLength:200});
      const itemsHost=el('div','','writer-repeat-list');
      group.items.forEach((item,ii)=>{
        const row=el('div','','writer-link-row');
        const thumb=el('img','','writer-link-avatar');
        const syncThumb=()=>{
          const src=typeof item.cover==='string'&&item.cover.trim()?resolveImage(item.cover):null;
          if(src){thumb.src=src;thumb.alt=item.name||'资源封面';thumb.hidden=false;}
          else{thumb.removeAttribute('src');thumb.alt='';thumb.hidden=true;}
        };
        syncThumb();
        textField(row,`group-${gi}-item-${ii}-name`,`资源 ${ii+1} · 名称`,item.name,text=>{item.name=text;onChange();},{maxLength:80});
        textField(row,`group-${gi}-item-${ii}-href`,'链接地址',item.href,text=>{item.href=text;onChange();},{maxLength:500});
        textField(row,`group-${gi}-item-${ii}-summary`,'一句话简介（平放显示，160 字内）',item.summary??'',text=>{item.summary=text;onChange();},{maxLength:160,wide:true});
        textField(row,`group-${gi}-item-${ii}-badge`,'角标（可选，如 Windows · 免费）',item.badge??'',text=>{if(text.trim())item.badge=text.trim();else delete item.badge;onChange();},{maxLength:40});
        textField(row,`group-${gi}-item-${ii}-cta`,'按钮文案（可选，默认 前往获取）',item.cta??'',text=>{if(text.trim())item.cta=text.trim();else delete item.cta;onChange();},{maxLength:24});
        textField(row,`group-${gi}-item-${ii}-code`,'提取码（可选）',item.code??'',text=>{if(text.trim())item.code=text.trim();else delete item.code;onChange();},{maxLength:64});
        textField(row,`group-${gi}-item-${ii}-tags`,'标签（可选，逗号分隔，最多 4 个）',Array.isArray(item.tags)?item.tags.join(', '):'',text=>{
          const parsed=text.split(/[,，]/).map(s=>s.trim()).filter(Boolean).slice(0,4);
          if(parsed.length)item.tags=parsed;else delete item.tags;
          onChange();
        },{maxLength:90});
        textField(row,`group-${gi}-item-${ii}-detail`,'详细说明（立起模块内展示；支持 [文字](https://...) 或直接粘贴网址，展示时点击新标签页打开）',item.detail??'',text=>{if(text.trim())item.detail=text;else delete item.detail;onChange();},{maxLength:1200,multiline:true,wide:true});
        const contentImgsBox=el('div','','writer-res-images wide');
        const contentImgsHead=el('div','','writer-res-images-head');
        contentImgsHead.append(el('span','模块内容配图（最多 4 张，直接展示在立起模块内）','writer-note'));
        const contentImgsList=el('div','','writer-res-images-grid');
        const currentImgs=()=>Array.isArray(item.images)?item.images.filter(s=>typeof s==='string'&&Boolean(s.trim())):[];
        currentImgs().forEach((imgSrc,imgIdx)=>{
          const chip=el('div','','writer-res-img-card');
          const resolved=resolveImage(imgSrc);
          if(resolved){
            const previewImg=el('img','','writer-res-img-thumb');
            previewImg.src=resolved;previewImg.alt=`${item.name||`资源 ${ii+1}`} 内容图 ${imgIdx+1}`;previewImg.loading='lazy';
            chip.append(previewImg);
          }else{
            chip.append(el('p',imgSrc,'writer-note'));
          }
          const imgTools=el('div','','writer-toolbar');
          const leftBtn=button('前移',()=>{
            const arr=currentImgs();if(imgIdx<=0)return;
            [arr[imgIdx-1],arr[imgIdx]]=[arr[imgIdx],arr[imgIdx-1]];
            item.images=arr;onChange();render();
          });
          const rightBtn=button('后移',()=>{
            const arr=currentImgs();if(imgIdx>=arr.length-1)return;
            [arr[imgIdx],arr[imgIdx+1]]=[arr[imgIdx+1],arr[imgIdx]];
            item.images=arr;onChange();render();
          });
          leftBtn.disabled=imgIdx===0;rightBtn.disabled=imgIdx===currentImgs().length-1;
          imgTools.append(leftBtn,rightBtn,button('移除',()=>{
            const arr=currentImgs();arr.splice(imgIdx,1);
            if(arr.length)item.images=arr;else delete item.images;
            onChange();render();
          }));
          chip.append(imgTools);
          contentImgsList.append(chip);
        });
        const contentImgActions=el('div','','writer-link-avatar-tools');
        if(uploadAvatar){
          const multiInput=el('input');
          multiInput.type='file';
          multiInput.accept='image/jpeg,image/png,image/webp';
          multiInput.multiple=true;
          multiInput.name=`group-${gi}-item-${ii}-images-file`;
          multiInput.hidden=true;
          multiInput.setAttribute('aria-label',`上传 ${item.name||`资源 ${ii+1}`} 的模块内容图片`);
          let addImgBtn!:HTMLButtonElement;
          multiInput.addEventListener('change',()=>{
            const picked=Array.from(multiInput.files??[]);
            multiInput.value='';
            if(!picked.length) return;
            const remain=4-currentImgs().length;
            if(remain<=0){onError(Error('每个资源模块最多添加 4 张内容配图'));return;}
            addImgBtn.disabled=true;
            (async()=>{
              const arr=currentImgs();
              for(const f of picked.slice(0,remain)){
                const ref=await uploadAvatar(f);
                arr.push(ref);
              }
              item.images=arr;onChange();render();
            })().catch(err=>{addImgBtn.disabled=false;onError(err);});
          });
          addImgBtn=button('＋ 上传内容图片',()=>multiInput.click());
          addImgBtn.disabled=currentImgs().length>=4;
          contentImgActions.append(multiInput,addImgBtn);
        }
        const imgUrlInput=el('input');
        imgUrlInput.type='url';
        imgUrlInput.placeholder='或粘贴图片地址（https://... 或 /resources/covers/...）';
        imgUrlInput.name=`group-${gi}-item-${ii}-images-url`;
        imgUrlInput.maxLength=400;
        const addUrlBtn=button('添加图片链接',()=>{
          const next=imgUrlInput.value.trim();
          if(!next) return;
          const arr=currentImgs();
          if(arr.length>=4){onError(Error('每个资源模块最多添加 4 张内容配图'));return;}
          arr.push(next);
          item.images=arr;
          imgUrlInput.value='';
          onChange();render();
        });
        addUrlBtn.disabled=currentImgs().length>=4;
        contentImgActions.append(imgUrlInput,addUrlBtn);
        contentImgsBox.append(contentImgsHead,contentImgsList,contentImgActions);
        row.append(contentImgsBox);
        const coverInput=textField(row,`group-${gi}-item-${ii}-cover`,'封面/图标（可选）',item.cover??'',text=>{
          if(text.trim())item.cover=text.trim();else delete item.cover;
          onChange();syncThumb();clearCover.disabled=!item.cover;
        },{maxLength:400});
        const coverTools=el('div','','writer-link-avatar-tools');
        coverTools.append(thumb);
        const clearCover=button('清除封面',()=>{delete item.cover;coverInput.value='';onChange();render();});
        clearCover.disabled=!item.cover;
        if(uploadAvatar){
          const fileInput=el('input');
          fileInput.type='file';
          fileInput.accept='image/jpeg,image/png,image/webp';
          fileInput.name=`group-${gi}-item-${ii}-cover-file`;
          fileInput.hidden=true;
          fileInput.setAttribute('aria-label',`上传 ${item.name||`资源 ${ii+1}`} 的封面`);
          let uploadBtn!:HTMLButtonElement;
          fileInput.addEventListener('change',()=>{
            const picked=fileInput.files?.[0];
            fileInput.value='';
            if(!picked) return;
            uploadBtn.disabled=true;
            uploadAvatar(picked).then(ref=>{item.cover=ref;onChange();render();}).catch(err=>{uploadBtn.disabled=false;onError(err);});
          });
          uploadBtn=button('上传封面',()=>fileInput.click());
          coverTools.append(fileInput,uploadBtn);
        }
        coverTools.append(clearCover);
        const itemActions=el('div','','writer-toolbar');
        const moveItem=(from:number,to:number)=>{if(to<0||to>=group.items.length)return;const [entry]=group.items.splice(from,1);group.items.splice(to,0,entry);onChange();render();};
        const upItem=button('上移',()=>moveItem(ii,ii-1)),downItem=button('下移',()=>moveItem(ii,ii+1));
        upItem.disabled=ii===0;downItem.disabled=ii===group.items.length-1;
        itemActions.append(upItem,downItem,button('移除资源',()=>{group.items.splice(ii,1);onChange();render();}));
        row.append(coverTools,itemActions);
        itemsHost.append(row);
      });
      const addItem=button('＋ 添加资源',()=>{group.items.push({name:'',href:'https://',summary:''});onChange();render();},'primary');
      const upGroup=button('分类上移',()=>{if(gi<=0)return;const gs=getGroups();[gs[gi-1],gs[gi]]=[gs[gi],gs[gi-1]];onChange();render();});
      const downGroup=button('分类下移',()=>{const gs=getGroups();if(gi>=gs.length-1)return;[gs[gi],gs[gi+1]]=[gs[gi+1],gs[gi]];onChange();render();});
      upGroup.disabled=gi===0;downGroup.disabled=gi===getGroups().length-1;
      const removeGroup=button('移除此分类',()=>{getGroups().splice(gi,1);onChange();render();});
      removeGroup.disabled=getGroups().length<=1;
      card.append(itemsHost,addItem,upGroup,downGroup,removeGroup);
      list.append(card);
    });
    const addGroup=button('＋ 添加分类',()=>{getGroups().push({title:'新分类',note:'',items:[{name:'',href:'https://',summary:''}]});onChange();render();});
    list.append(addGroup);
  }
  render();
}

export function renderForgePreview(kind:'project'|'forge',value:WriterValue,resolveImage:Context['resolveImage'],key?:string){
  const fragment=document.createDocumentFragment(),fields=value.fields;fragment.append(el('h2',String(fields.title??(key==='links'?'友链':key==='resources'?'资源':''))));
  if(kind==='project'){
    fragment.append(el('p',String(fields.summary??'')),el('p',String(fields.tagline??''),'writer-note'));
    const images=el('div','','writer-gallery');for(const image of gallery(value)){const card=el('section','','writer-image');thumbnail(card,image.src,image.alt,resolveImage,'主图');if(image.darkSrc)thumbnail(card,image.darkSrc,image.alt,resolveImage,'暗色替图');images.append(card);}fragment.append(images);
  }else if(key==='resources'){
    if(fields.intro)fragment.append(el('p',String(fields.intro)));
    for(const g of (Array.isArray(fields.groups)?fields.groups as ResourceGroupField[]:[])){
      fragment.append(el('h3',String(g.title??'')));
      if(g.note)fragment.append(el('p',String(g.note),'writer-note'));
      for(const it of (Array.isArray(g.items)?g.items:[])){
        const row=el('p','','writer-link-preview');
        const coverUrl=typeof it.cover==='string'&&it.cover.trim()?resolveImage(it.cover):null;
        if(coverUrl){const img=el('img','','writer-link-avatar');img.src=coverUrl;img.alt='';row.append(img);}
        row.append(el('span',`${it.name??''}${it.badge?` [${it.badge}]`:''} · ${it.href??''} — ${it.summary??''}${it.code?`（提取码 ${it.code}）`:''}`));
        fragment.append(row);
        if(Array.isArray(it.images)&&it.images.length){
          const strip=el('div','','writer-res-images-grid');
          for(const imgSrc of it.images){
            const imgUrl=typeof imgSrc==='string'&&imgSrc.trim()?resolveImage(imgSrc):null;
            if(imgUrl){const im=el('img','','writer-res-img-thumb');im.src=imgUrl;im.alt=it.name??'';strip.append(im);}
          }
          if(strip.childElementCount)fragment.append(strip);
        }
      }
    }
  }else if(key==='links'||Array.isArray(fields.groups)){
    if(fields.intro)fragment.append(el('p',String(fields.intro)));
    for(const g of (Array.isArray(fields.groups)?fields.groups as FriendGroup[]:[])){
      fragment.append(el('h3',String(g.title??'')));
      if(g.note)fragment.append(el('p',String(g.note),'writer-note'));
      for(const it of (Array.isArray(g.items)?g.items:[])){
        const row=el('p','','writer-link-preview');
        const avatarUrl=typeof it.avatar==='string'&&it.avatar.trim()?resolveImage(it.avatar):null;
        if(avatarUrl){const img=el('img','','writer-link-avatar');img.src=avatarUrl;img.alt='';row.append(img);}
        row.append(el('span',`${it.name??''} · ${it.href??''}${it.desc?' — '+it.desc:''}`));
        fragment.append(row);
      }
    }
  }else{
    for(const item of FORGE_TEXT_FIELDS.filter(item=>item.key!=='title'))fragment.append(el('p',String(fields[item.key]??'')));
    if(Array.isArray(fields.stages))for(const stage of fields.stages)fragment.append(el('p',String(stage),'writer-note'));
    if(Array.isArray(fields.notes))for(const note of fields.notes){const entry=note as Record<string,unknown>;fragment.append(el('h3',String(entry.title??'')),el('p',String(entry.text??'')));}
  }
  return fragment;
}
