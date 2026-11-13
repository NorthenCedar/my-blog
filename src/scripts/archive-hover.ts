import { onPage } from './page-lifecycle';

onPage(({ document, window, matchMedia, MutationObserver }) => {
  const board = document.querySelector<HTMLElement>('[data-groups]')!;
  const highlight = board.querySelector<HTMLElement>('[data-archive-highlight]')!;
  const motion = matchMedia('(any-hover: hover) and (prefers-reduced-motion: no-preference)');
  let current: HTMLAnchorElement | undefined;

  function clear() {
    current = undefined;
    highlight.removeAttribute('data-active');
  }

  board.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch' || !motion.matches || board.dataset.view !== 'list') return;
    const row = (event.target as Element).closest('.index li');
    const link = row?.querySelector<HTMLAnchorElement>(':scope > a');
    if (!link) { clear(); return; }
    if (link === current) return;

    const rect = link.getBoundingClientRect();
    highlight.style.setProperty('--archive-highlight-top', `${rect.top - board.getBoundingClientRect().top}px`);
    highlight.style.setProperty('--archive-highlight-height', `${rect.height}px`);
    highlight.toggleAttribute('data-slide', Boolean(current));
    highlight.setAttribute('data-active', '');
    current = link;
  });
  board.addEventListener('pointerleave', clear);
  window.addEventListener('resize', clear);
  motion.addEventListener('change', clear);

  // 筛选、排序或切换版式时，撤掉旧位置上的高亮。
  new MutationObserver(clear).observe(board, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['hidden', 'data-view'],
  });
}, '[data-groups]:has([data-archive-highlight])');
