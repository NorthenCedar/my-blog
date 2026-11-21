import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { gsap } from 'gsap';
import { StaggeredMenu } from '../vendor/react-bits/StaggeredMenu';

export function mountSiteMenu(anchor: HTMLButtonElement, fallback: HTMLElement) {
  const dialog = document.createElement('dialog');
  dialog.className = 'site-menu-dialog';
  dialog.lang = 'en';
  dialog.setAttribute('aria-label', 'Site menu');
  document.body.append(dialog);

  const items = [...fallback.querySelectorAll<HTMLAnchorElement>('.sm-panel-item')].map(link => ({
    label: link.textContent!.trim(),
    ariaLabel: link.textContent!.trim(),
    link: link.getAttribute('href')!,
  }));
  const socialItems = [...fallback.querySelectorAll<HTMLAnchorElement>('.sm-socials-link')].map(link => ({
    label: link.textContent!.trim(),
    link: link.getAttribute('href')!,
  }));
  const current = fallback.querySelector('[aria-current="page"]')?.getAttribute('href');
  const root = createRoot(dialog);
  const events = new AbortController();
  const options = { signal: events.signal };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let closing = false;
  let travel: gsap.core.Tween | undefined;

  function anchorPosition() {
    const bounds = anchor.getBoundingClientRect();
    return { top: bounds.top, right: window.innerWidth - bounds.right };
  }

  function moveToggle(position: { top: number; right: number }, opening: boolean) {
    travel?.kill();
    travel = gsap.to(toggle, {
      ...position, duration: reduce.matches ? 0 : opening ? .55 : .42,
      ease: opening ? 'back.out(1.3)' : 'power3.inOut',
    });
    return travel;
  }

  function syncInk() {
    dialog.style.setProperty('--site-menu-anchor-ink', getComputedStyle(anchor).color);
  }

  function onMenuOpen() {
    syncInk();
    gsap.set(toggle, anchorPosition());
    anchor.dataset.menuMounted = '';
    panel.inert = false;
    panel.scrollTop = 0;
    dialog.showModal();
    moveToggle(cornerPosition(), true);
    toggle.focus({ preventScroll: true });
    if (reduce.matches) queueMicrotask(finishMotion);
  }

  function onMenuClose() {
    closing = true;
    toggle.focus({ preventScroll: true });
    panel.inert = true;
    syncInk();
    const returning = moveToggle(anchorPosition(), false);
    queueMicrotask(() => {
      if (reduce.matches) {
        finishMotion();
        finishClose();
        return;
      }
      const slide = gsap.getTweensOf(panel).at(-1);
      void Promise.all([slide, returning]).then(finishClose);
    });
  }

  function finishClose() {
    if (!dialog.isConnected || !closing) return;
    closing = false;
    delete anchor.dataset.menuMounted;
    dialog.close();
    anchor.focus({ preventScroll: true });
  }

  function finishMotion() {
    for (const tween of gsap.getTweensOf(dialog.querySelectorAll('*'))) {
      const timeline = tween.parent;
      (timeline && timeline !== gsap.globalTimeline ? timeline : tween).progress(1);
    }
  }

  function render() {
    root.render(createElement(StaggeredMenu, {
      className: 'site-staggered',
      isFixed: true,
      items,
      socialItems,
      logoUrl: '/brand-infinity.svg',
      colors: ['var(--nav-trail-first)', 'var(--nav-trail-second)'],
      accentColor: 'var(--accent-ink)',
      menuButtonColor: 'var(--site-menu-toggle-ink)',
      changeMenuColorOnOpen: false,
      onMenuOpen,
      onMenuClose,
    }));
  }

  // ★ 2026-11-16（站主：「把 close 往下调一点，还是比 menu 高一点，点开 menu 能看到那个 '+' 明显往上去了一点」）：
  // 关闭键开合时只该**横向**挪（从顶栏那颗 Menu 滑到抽屉右上角），纵向要留在原来那一行。
  // 原来 top 取的是抽屉 header 的 padding-top（16px），而顶栏 Menu 的纵向位置是 24px
  // （收成圆条后 36.8px）⇒ 点开时它先往上跳 8px、关上再跳回来，站主看到的就是「+ 往上一动」。
  // 纵向直接跟 anchor（那颗 Menu）走；横向仍用 header 的 padding-right
  // （实测 Menu 右边缘的 offset 与它相等，都是 48px，所以横向飞行观感不变）。
  function cornerPosition() {
    const header = dialog.querySelector('.staggered-menu-header')!;
    return {
      top: anchor.getBoundingClientRect().top,
      right: parseFloat(getComputedStyle(header).paddingRight),
    };
  }

  flushSync(render);
  const toggle = dialog.querySelector<HTMLButtonElement>('.sm-toggle')!;
  const panel = dialog.querySelector<HTMLElement>('.staggered-menu-panel')!;
  const selected = [...panel.querySelectorAll('.sm-panel-item')].find(link => link.getAttribute('href') === current);
  selected?.setAttribute('aria-current', 'page');
  panel.setAttribute('role', 'navigation');
  panel.setAttribute('aria-label', 'Main navigation');
  toggle.setAttribute('aria-haspopup', 'dialog');
  panel.inert = true;
  reduce.addEventListener('change', () => { if (reduce.matches) finishMotion(); }, options);
  window.addEventListener('resize', () => {
    if (dialog.open && !closing) moveToggle(cornerPosition(), true);
  }, options);
  const open = () => { if (!dialog.open) toggle.click(); };
  anchor.addEventListener('click', open, options);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!closing) toggle.click();
  }, options);
  toggle.addEventListener('click', event => {
    if (closing) event.stopPropagation();
  }, options);
  panel.addEventListener('click', event => {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
      && (event.target as Element).closest('.sm-panel-item')) toggle.click();
  }, options);
  open();

  return () => {
    events.abort();
    travel?.kill();
    gsap.killTweensOf(dialog.querySelectorAll('*'));
    root.unmount();
    dialog.remove();
    delete anchor.dataset.menuMounted;
  };
}
