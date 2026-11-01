import type {WriterValue} from '../../lib/writer/model';
import {ALBUM_OPTIONS,ALBUM_PRESETS,resolvePresentation,validateAlbumFields} from '../../lib/album-presentation.mjs';
import {mountCoverPreview} from '../album-cover-preview.js';
import '../../styles/album-cover-preview.css';
import {el,button,field} from './ui';
type Image={src:string;alt:string;width?:number;height?:number;[key:string]:unknown};
type Context={value:WriterValue;onChange:()=>void;resolveImage:(source:string)=>string|null;index?:number};
export function mountGalleryFields(host:HTMLElement,{value,onChange,resolveImage,index=0}:Context){
 const fields=value.fields,getImages=()=>Array.isArray(fields.images)?fields.images as Image[]:[];
 const previews:ReturnType<typeof mountCoverPreview>[]=[];
 const presetPreviews:{preview:ReturnType<typeof mountCoverPreview>;presentation:Record<string,string>}[]=[];
 const initialCover=typeof fields.cover==='string'?fields.cover:getImages()[0]?.src;
 const dimensions=new Map<string,{width:number;height:number}>(),loads=new Map<string,Promise<void>>();let disposed=false;
 const previewFields=()=>({...fields,images:getImages().map(image=>({...image,...dimensions.get(image.src)}))});
 const recommendation=()=>resolvePresentation(previewFields(),index);
 const needsPresentation=()=>!fields.presentation||!Object.keys(fields.presentation as object).length;
 function measured(image:Image|undefined){return !image||!!(image.width&&image.height)||dimensions.has(image.src);}
 function pin(){if(!fields.cover&&getImages().length)fields.cover=getImages().some(i=>i.src===initialCover)?initialCover:getImages()[0].src;const cover=getImages().find(image=>image.src===fields.cover)??getImages()[0];if(needsPresentation()&&getImages().length&&measured(cover))fields.presentation={...recommendation()};}
 function remember(source:string,image:HTMLImageElement){if(image.naturalWidth>0&&image.naturalHeight>0)dimensions.set(source,{width:image.naturalWidth,height:image.naturalHeight});}
 async function measureCover(force=false){const image=getImages().find(image=>image.src===fields.cover)??getImages()[0];if(!image||measured(image)||(!needsPresentation()&&!force))return;let load=loads.get(image.src);if(!load){const source=resolveImage(image.src);if(!source)throw Error('封面暂不可读取，请联网后重新保存');const probe=host.ownerDocument.createElement('img');probe.src=source;load=(async()=>{try{await probe.decode();remember(image.src,probe);if(!dimensions.has(image.src))throw Error('封面尺寸未读取完成');}catch{loads.delete(image.src);throw Error('封面尺寸未读取完成，请等待图片加载后保存');}})();loads.set(image.src,load);}await load;const current=getImages().find(item=>item.src===fields.cover)??getImages()[0];if(current?.src!==image.src)await measureCover(force);}
 const previewHost=el('section','','wide'),galleryHost=el('section','','wide writer-gallery');
 function refreshPreviews(){mainPreview.update(previewFields());for(const item of presetPreviews)item.preview.update({...previewFields(),presentation:item.presentation});}
 function changed(){onChange();refreshPreviews();}
 for(const [name,label,type]of [['title','相册名称','text'],['titleEn','英文标题（可选）','text'],['date','日期','date']]){
  const f=field(label,type);f.input.name=name;f.input.value=String(fields[name]??'');f.input.addEventListener('input',()=>{pin();fields[name]=f.input.value;changed();});host.append(f.label);
 }
 function select(parent:HTMLElement,name:string,label:string,choices:readonly (readonly string[])[],current:unknown,change:(text:string)=>void){const wrapper=el('label',label,'writer-field'),input=el('select');input.name=name;for(const [key,text]of choices){const option=el('option',text);option.value=key;input.append(option);}input.value=String(current??'');input.addEventListener('change',()=>change(input.value));wrapper.append(input);parent.append(wrapper);return input;}
 select(host,'layout','册内展示',ALBUM_OPTIONS.layout,fields.layout??'scatter',text=>{pin();fields.layout=text;changed();});
 const draft=field('保留为相册草稿','checkbox');draft.input.name='draft';draft.input.checked=fields.draft===true;draft.input.addEventListener('change',()=>{pin();fields.draft=draft.input.checked;changed();});host.append(draft.label);
 previewHost.append(el('h3','真实封面预览'));host.append(previewHost);const mainPreview=mountCoverPreview(previewHost,{fields:previewFields(),resolveImage,index});previews.push(mainPreview);
 const presets=el('section','','wide writer-gallery');presets.append(el('h3','封面编排'));host.append(presets);
 for(const preset of ALBUM_PRESETS){const card=el('section','','writer-image'),thumb=el('div');card.append(thumb);const {title,...presentation}=preset;const miniature=mountCoverPreview(thumb,{fields:{...previewFields(),presentation},resolveImage,index});previews.push(miniature);presetPreviews.push({preview:miniature,presentation});card.append(button(title,()=>{pin();fields.presentation={...(fields.presentation as object),...presentation};changed();refreshControls();}));presets.append(card);}
 const details=el('details'),controls=el('div','','writer-fields');details.append(el('summary','进一步调整'),controls);host.append(details);
 function refreshControls(){controls.replaceChildren();for(const [name,label]of [['arrangement','照片位置'],['transition','翻页动作'],['stroke','笔触'],['weight','笔触粗细']])select(controls,name,label,ALBUM_OPTIONS[name].filter(([key]:string[])=>key!=='auto'),(fields.presentation as any)?.[name]??recommendation()[name],text=>{pin();fields.presentation={...(fields.presentation as object),[name]:text};changed();});}
 refreshControls();details.append(button('重新推荐',()=>{void(async()=>{await measureCover(true);if(disposed)return;pin();fields.presentation=resolvePresentation({...previewFields(),presentation:undefined},index);changed();refreshControls();})().catch(error=>{const message=el('p',String(error.message),'writer-error');details.append(message);});}));
 host.append(galleryHost);
 function move(from:number,to:number){const images=getImages();if(to<0||to>=images.length)return;pin();const [image]=images.splice(from,1);images.splice(to,0,image);changed();render();}
 function render(){galleryHost.replaceChildren(el('h3','本册照片与图注'));getImages().forEach((image,index)=>{
  const card=el('section','','writer-image');card.dataset.galleryIndex=String(index);const thumb=el('img'),url=resolveImage(image.src);if(url){thumb.src=url;thumb.alt=image.alt;thumb.addEventListener('load',()=>{remember(image.src,thumb);if(!disposed){refreshPreviews();refreshControls();}});card.append(thumb);}card.append(el('p',`${index+1} · ${image.src}${fields.cover===image.src?' · 封面':''}`));
  const alt=field('照片图注（发布必填）');alt.input.name=`gallery-image-${index}-alt`;alt.input.value=image.alt;alt.input.addEventListener('input',()=>{pin();image.alt=alt.input.value;changed();});card.append(alt.label);
  const handle=button('按住拖动照片',()=>{});handle.addEventListener('pointerdown',event=>{if(event.button===0)handle.setPointerCapture(event.pointerId);});handle.addEventListener('pointerup',event=>{if(!handle.hasPointerCapture(event.pointerId))return;handle.releasePointerCapture(event.pointerId);const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-gallery-index]');if(target)move(index,Number(target.dataset.galleryIndex));});
  card.append(handle,button('上移',()=>move(index,index-1)),button('下移',()=>move(index,index+1)),button('设为封面',()=>{pin();fields.cover=image.src;changed();render();}),button('移除图库项',()=>{pin();getImages().splice(index,1);if(fields.cover===image.src){if(getImages().length)fields.cover=getImages()[0].src;else delete fields.cover;}changed();render();}));galleryHost.append(card);
 });}
 render();
 return {async prepare(){const before=JSON.stringify(fields);await measureCover();if(disposed)return;pin();if(JSON.stringify(fields)!==before)onChange();refreshPreviews();refreshControls();},validate(){validateAlbumFields(fields,{publish:true});},refreshAssets(){render();refreshPreviews();},addUploaded(sha:string,alt:string,size:{width?:number;height?:number}){const src='writer-asset:'+sha;if(!getImages().some(i=>i.src===src)){pin();fields.images=[...getImages(),{src,alt,...size}];if(!fields.cover)fields.cover=src;pin();changed();render();refreshControls();}},destroy(){disposed=true;for(const preview of previews)preview.destroy();}};
}
