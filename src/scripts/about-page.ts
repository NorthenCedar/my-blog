
import { onPage } from './page-lifecycle';
onPage(({document, addEventListener, requestAnimationFrame, setTimeout, clearTimeout}) => {
/** 关于页只负责章节标记与邮箱复制，主题与鳍片仍使用各自的原控制器。 */
const sections=Array.from(document.querySelectorAll<HTMLElement>('[data-motion-stop]'));
const links=Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]'));
function markChapter(){
  let current=sections[0];
  for(const section of sections)if(section.getBoundingClientRect().top<innerHeight*.45)current=section;
  for(const link of links){
    if(link.dataset.chapter===current?.id)link.setAttribute('aria-current','true');
    else link.removeAttribute('aria-current');
  }
}
let frame=0;
addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;markChapter()})},{passive:true});
addEventListener('resize',markChapter);
markChapter();
const button=document.querySelector<HTMLButtonElement>('[data-copy-mail]');
const status=document.querySelector<HTMLElement>('.copy-status');
let timer:ReturnType<typeof setTimeout>;
button?.addEventListener('click',async()=>{
  clearTimeout(timer);
  try{await navigator.clipboard.writeText(button.dataset.copyMail!);status!.textContent='邮箱已复制';}
  catch{status!.textContent=button.dataset.copyMail!;}
  timer=setTimeout(()=>{status!.textContent=''},3500);
});

},"[data-motion-stop]");
