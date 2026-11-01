
// 这里只连接外层换幕，不持有照片、悬停、放大、拖动或灯箱状态。
export function mountOriginalHelix(host){
  const viewport=host.querySelector('[data-spiral]'),items=[...host.querySelectorAll('[data-sp-item]')];
  const lightbox=document.getElementById('splb');if(lightbox.parentElement!==document.body)document.body.append(lightbox);let active=false;
  function containsPoint(x,y){
    if(!active||!Number.isFinite(x)||!Number.isFinite(y))return false;
    const view=viewport.getBoundingClientRect();
    if(x<view.left||x>view.right||y<view.top||y>view.bottom)return false;
    const rectangles=items.filter(item=>Number(item.style.opacity||1)>.2).map(item=>item.querySelector('img').getBoundingClientRect()).filter(rect=>rect.width>0&&rect.height>0&&rect.right>view.left&&rect.left<view.right&&rect.bottom>view.top&&rect.top<view.bottom);
    if(!rectangles.length)return false;
    return x>=Math.max(view.left,Math.min(...rectangles.map(r=>r.left))-24)&&x<=Math.min(view.right,Math.max(...rectangles.map(r=>r.right))+24)&&y>=Math.max(view.top,Math.min(...rectangles.map(r=>r.top))-24)&&y<=Math.min(view.bottom,Math.max(...rectangles.map(r=>r.bottom))+24);
  }
  return {
    containsPoint,
    get lightboxOpen(){return lightbox.classList.contains('on')},
    step(direction){viewport.dispatchEvent(new KeyboardEvent('keydown',{key:direction>0?'ArrowRight':'ArrowLeft',bubbles:true,cancelable:true}))},
    setActive(value){active=value;viewport.hidden=!value;if(value)window.dispatchEvent(new Event('resize'))}
  };
}
