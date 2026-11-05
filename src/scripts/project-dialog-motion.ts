import { getMotion, primeMotion, type MotionEngine } from './motion-loader';

type Session = {
  dialog: HTMLDialogElement; trigger: HTMLElement; cover: HTMLElement; title: HTMLElement;
  hero: HTMLElement; flight: HTMLElement; card: HTMLElement; scrim: HTMLElement;
  placeholder: HTMLElement; style: string | null; tabIndex: string | null; inert: boolean;
  overflow: string; closing: boolean; motion: MotionEngine | null;
};

/** 原生 dialog 负责焦点约束，独立飞行层只搬运原封面。 */
export function initProjectDialogs(body: HTMLElement, isReduced: () => boolean, engine: () => MotionEngine | null = getMotion) {
  const events = new AbortController(), options = {signal:events.signal};
  const dialogs = [...body.querySelectorAll<HTMLDialogElement>('.project-dialog')];
  const links = [...body.querySelectorAll<HTMLAnchorElement>('[data-project-open]')];
  const unprime = links.map(primeMotion);
  let current: Session | null = null, version = 0, disposed = false;
  const activeEngine = () => isReduced() ? null : engine();
  const cancel = (session: Session) => {
    ++version;
    const motion = session.motion;
    motion?.Flip.killFlipsOf([session.cover, session.title], false);
    motion?.gsap.killTweensOf([session.cover,session.title,session.card,session.scrim]);
  };
  const reset = (session: Session) => {
    const motion = session.motion;
    motion?.gsap.set([session.cover,session.title,session.card,session.scrim], {clearProps:'all'});
    const attributes = () => {
      if (session.style === null) session.cover.removeAttribute('style'); else session.cover.setAttribute('style',session.style);
      session.title.removeAttribute('style'); session.card.removeAttribute('style'); session.scrim.removeAttribute('style');
    };
    attributes();
    // Flip 在用户回调后还会归整 transform 长属性；同一帧末尾恢复原样。
    const token = version;
    queueMicrotask(()=>{if(token===version)attributes();});
  };
  const dock = (session: Session) => {
    session.hero.append(session.cover); reset(session);
  };
  const restore = (session: Session, focus = true) => {
    if (current !== session) return;
    cancel(session); reset(session);
    session.placeholder.replaceWith(session.cover);
    session.cover.inert = session.inert;
    if(session.tabIndex === null) session.cover.removeAttribute('tabindex'); else session.cover.setAttribute('tabindex',session.tabIndex);
    body.style.overflow = session.overflow;
    current = null;
    if(session.dialog.open) session.dialog.close();
    if(focus && session.trigger.isConnected) session.trigger.focus({preventScroll:true});
  };
  const finishMotion = () => {
    if(!current) return;
    const session = current;
    if(session.closing) restore(session); else {cancel(session);dock(session);}
  };
  // 对话框不裁切飞行路径；封面最终布局仍由 hero 的 CSS 决定。
  const flyTo = (session: Session, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    session.flight.append(session.cover);
    Object.assign(session.cover.style, {position:'absolute',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',transform:'none'});
  };
  const close = () => {
    if(!current || current.closing) return;
    const session = current, motion = activeEngine();
    cancel(session); session.closing = true;
    if(!motion) {restore(session);return;}
    session.motion = motion;
    const token = version, state = motion.Flip.getState(session.cover);
    flyTo(session,session.placeholder);
    motion.gsap.to([session.card,session.scrim],{opacity:0,duration:.26,ease:'power2.in'});
    motion.Flip.from(state,{targets:session.cover,scale:true,duration:.3,ease:'power3.inOut',onComplete:()=>{if(token===version)restore(session);}});
  };
  links.forEach(link => link.addEventListener('click',event=>{
    if(disposed || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button!==0) return;
    const dialog = dialogs.find(item=>item.id==='project-'+link.dataset.projectOpen);
    const row = body.querySelector<HTMLElement>('#work-'+CSS.escape(link.dataset.projectOpen || ''));
    const cover = row?.querySelector<HTMLElement>('.work-visual'), sourceTitle = row?.querySelector<HTMLElement>('[data-project-card-title]');
    const hero = dialog?.querySelector<HTMLElement>('[data-project-hero]'), title = dialog?.querySelector<HTMLElement>('[data-project-title]');
    const flight = dialog?.querySelector<HTMLElement>('.dialog-flight'), card = dialog?.querySelector<HTMLElement>('.dialog-card'), scrim = dialog?.querySelector<HTMLElement>('.dialog-scrim');
    if(!dialog || !cover || !sourceTitle || !hero || !title || !flight || !card || !scrim || typeof dialog.showModal!=='function') return;
    event.preventDefault(); if(current) return;
    const motion = activeEngine();
    const originalStyle = cover.getAttribute('style');
    const coverState = motion?.Flip.getState(cover);
    // 相同 flip-id 将卡片标题的几何映射到详情标题，文字始终为真实 DOM。
    const flipId = 'project-title-'+link.dataset.projectOpen;
    sourceTitle.dataset.flipId = flipId; title.dataset.flipId = flipId;
    const titleState = motion?.Flip.getState(sourceTitle);
    const placeholder = document.createElement('div');
    placeholder.dataset.projectPlaceholder = ''; placeholder.setAttribute('aria-hidden','true');
    placeholder.style.width = '100%'; cover.before(placeholder);
    const session: Session = {dialog,trigger:link,cover,title,hero,flight,card,scrim,placeholder,style:originalStyle,tabIndex:cover.getAttribute('tabindex'),inert:cover.inert,overflow:body.style.overflow,closing:false,motion};
    current = session; body.style.overflow = 'hidden'; cover.inert = true; cover.tabIndex = -1;
    dialog.showModal(); const scroll = dialog.querySelector<HTMLElement>('.dialog-scroll'); if(scroll)scroll.scrollTop=0;
    if(!motion || !coverState) {dock(session);return;}
    const token = ++version;
    flyTo(session,hero);
    motion.gsap.fromTo(scrim,{opacity:0},{opacity:1,duration:.3});
    motion.gsap.fromTo(card,{opacity:0},{opacity:1,duration:.24,delay:.12});
    if(titleState)motion.Flip.from(titleState,{targets:title,scale:true,duration:.44,ease:'power3.inOut'});
    motion.Flip.from(coverState,{targets:cover,scale:true,duration:.44,ease:'power3.inOut',onComplete:()=>{if(token===version && current===session)dock(session);}});
  },options));
  dialogs.forEach(dialog=>{
    dialog.querySelector('[aria-label="关闭作品详情"]')?.addEventListener('click',close,options);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();},options);
    dialog.addEventListener('close',()=>{if(current?.dialog===dialog && !dialog.open)restore(current);},options);
    dialog.addEventListener('click',event=>{if(event.target===dialog || (event.target as HTMLElement).classList.contains('dialog-scroll'))close();},options);
  });
  window.addEventListener('resize',finishMotion,{...options,passive:true});
  return {
    finishMotion,
    dispose() {if(disposed)return;disposed=true;events.abort();unprime.forEach(fn=>fn());if(current)restore(current,false);},
  };
}
