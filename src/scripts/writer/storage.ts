import type { writerApi } from './api';
import { el,button,errorText } from './ui';
type Image={sha256:string;size:number;width:number;height:number;referenced:number};
const mib=(bytes:number)=>(bytes/1024/1024).toFixed(2)+' MiB';
/** 只清理作者明确选中的未引用图；服务端会在删除语句中再次检查引用。 */
export async function showWriterStorage(host:HTMLElement,api:typeof writerApi){
  let panel=host.querySelector<HTMLElement>('[data-writer-storage-panel]');
  if(!panel){panel=el('section');panel.dataset.writerStoragePanel='';host.append(panel);}
  const target=panel;let page=1;
  async function load(){
    const data=await api<{images:Image[];more:boolean;usage:{draftCount:number;imageBytes:number;totalBytes:number}}>('/assets?page='+page);
    if(!target.isConnected)return;
    const selected=new Set<string>(),list=el('div','','writer-images'),review=el('section'),note=el('p','','writer-note');
    const clear=button('检查所选图片',()=>{
      review.replaceChildren(el('h4',`确认清理 ${selected.size} 张图片`),el('p','删除后无法从私密存储恢复。已发布的仓库图片会保留；建议先导出需要的草稿。'));
      const names=el('ul');for(const sha of selected)names.append(el('li',sha.slice(0,12)+'…'));review.append(names);
      const confirm=button('确认删除所选图片',async()=>{
        confirm.disabled=true;let count=0;const errors:string[]=[];
        for(const sha of selected){try{await api('/assets?sha256='+sha,{method:'DELETE'});count++;}catch(error){errors.push(errorText(error));}}
        await load();if(target.isConnected)target.append(el('p',`已清理 ${count} 张图片。${errors.join('；')}`,errors.length?'writer-error':'writer-note'));
      },'danger');
      review.append(confirm,button('取消清理',()=>review.replaceChildren()));
    });clear.disabled=true;
    target.replaceChildren(el('h3','有效载荷占用'),el('p',`草稿 ${data.usage.draftCount} / 100 份 · 配图 ${mib(data.usage.imageBytes)} / 64 MiB · 合计 ${mib(data.usage.totalBytes)} / 96 MiB`),el('p','这里统计写作数据的有效载荷，数据库实际占用还包含索引等其他数据。选择项仅限当前页。','writer-note'),list,clear,review,note);
    for(const image of data.images){
      const card=el('label','','writer-image'),check=el('input');check.type='checkbox';check.disabled=Boolean(image.referenced);check.setAttribute('aria-label','选择图片 '+image.sha256.slice(0,12));
      const preview=el('img');preview.src='/api/writer/assets?sha256='+image.sha256;preview.alt='私密配图 '+image.sha256.slice(0,12);preview.loading='lazy';
      check.addEventListener('change',()=>{if(check.checked)selected.add(image.sha256);else selected.delete(image.sha256);clear.disabled=!selected.size;clear.textContent=`检查所选图片（${selected.size} 张）`;review.replaceChildren();});
      card.append(check,preview,el('span',`${Math.ceil(image.size/1024)} KiB · ${image.width} × ${image.height}`),el('span',image.referenced?'草稿或发布快照正在引用':'未引用，可选择清理'));list.append(card);
    }
    if(!data.images.length)note.textContent='这里还没有私密配图。';
    const pages=el('div','','writer-toolbar');
    const navigate=async(next:number)=>{page=next;try{await load();}catch(error){note.textContent=errorText(error);}};
    if(page>1)pages.append(button('上一页配图',()=>navigate(page-1)));if(data.more)pages.append(button('下一页配图',()=>navigate(page+1)));pages.append(button('收起占用与清理',()=>target.remove()));target.append(pages);
  }
  await load();target.scrollIntoView({block:'nearest'});
}
