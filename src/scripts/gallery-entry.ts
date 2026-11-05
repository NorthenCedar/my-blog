/** 时间切片的幕只负责一次交接，不把其背景留给后续相册场景。 */
export function finishGalleryEntry(root:HTMLElement,reduced=false){
  const win=root.ownerDocument.defaultView!,veil=root.querySelector<HTMLElement>('.tsl-veil');
  let timer=0;
  const clear=()=>{root.classList.remove('tsl-in');win.clearTimeout(timer);veil?.removeEventListener('animationend',clear);win.removeEventListener('pagehide',clear);};
  if(!root.classList.contains('tsl-in'))return clear;
  if(reduced){clear();return clear;}
  veil?.addEventListener('animationend',clear,{once:true});
  win.addEventListener('pagehide',clear,{once:true});
  timer=win.setTimeout(clear,1100);
  return clear;
}
