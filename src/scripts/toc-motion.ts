import { createSailingTocVisual } from '../vendor/leibox/sailing-toc-motion';

/** 航线跟随活动条目，正文跳转继续由原生锚点负责。 */
export function createTocMotion(nav: HTMLElement) {
  const host = nav.querySelector<HTMLElement>('.toc-index')!;
  const list = host.querySelector<HTMLOListElement>('ol')!;
  const win = nav.ownerDocument.defaultView!;
  const media = win.matchMedia('(prefers-reduced-motion: reduce)');
  const visual = createSailingTocVisual(host);
  const links = [...list.querySelectorAll<HTMLAnchorElement>('a')];
  const events = new AbortController();
  const options = { signal: events.signal };
  let current: HTMLAnchorElement | null = null;

  function reveal(link: HTMLAnchorElement, behavior: ScrollBehavior) {
    const row = link.getBoundingClientRect();
    const view = list.getBoundingClientRect();
    const delta = row.top < view.top ? row.top - view.top : Math.max(0, row.bottom - view.bottom);
    if (delta) list.scrollTo({ top: Math.max(0, list.scrollTop + delta), behavior });
  }

  function place(snap = false) {
    if (!current) return;
    const box = host.getBoundingClientRect();
    const row = current.getBoundingClientRect();
    if (!box.height || !row.height) return;
    const center = row.top + row.height / 2 - box.top;
    visual.resize(box.height);
    visual.select(center, snap);
    nav.dataset.tocEnhanced = '';
  }

  const finish = () => place(true);
  list.addEventListener('scroll', () => place(), { ...options, passive: true });
  list.addEventListener('keydown', event => {
    const index = links.indexOf(event.target as HTMLAnchorElement);
    if (index < 0) return;
    const byKey: Record<string, HTMLAnchorElement | undefined> = {
      ArrowDown: links[Math.min(links.length - 1, index + 1)],
      ArrowUp: links[Math.max(0, index - 1)],
      Home: links[0],
      End: links.at(-1),
    };
    const next = byKey[event.key];
    if (!next) return;
    event.preventDefault();
    next.focus({ preventScroll: true });
    reveal(next, 'instant');
  }, options);
  win.addEventListener('resize', finish, { ...options, passive: true });
  media.addEventListener('change', finish, options);
  const observer = win.ResizeObserver ? new win.ResizeObserver(finish) : null;
  observer?.observe(host);

  return {
    moveTo(link: HTMLAnchorElement, bringIntoView = false) {
      if (events.signal.aborted || !list.contains(link)) return;
      current = link;
      if (bringIntoView) reveal(link, media.matches ? 'instant' : 'smooth');
      place();
    },
    finish,
    dispose() {
      if (events.signal.aborted) return;
      events.abort();
      observer?.disconnect();
      visual.dispose();
      current = null;
      delete nav.dataset.tocEnhanced;
    },
  };
}
