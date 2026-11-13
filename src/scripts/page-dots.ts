import { onPage } from './page-lifecycle';

onPage(({ document, IntersectionObserver, keep, matchMedia }) => {
  const field = document.querySelector<HTMLElement>('[data-dot-grid]')!;
  const motion = matchMedia('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)');
  let visible = false;
  let live = true;
  let loading = false;
  let unmount: (() => void) | undefined;

  function sync() {
    if (!motion.matches) {
      unmount?.();
      unmount = undefined;
      return;
    }
    if (!visible || loading || unmount) return;
    loading = true;
    import('./page-dots-view').then(({ mountPageDots }) => {
      if (live && visible && motion.matches) unmount = mountPageDots(field);
    }).catch(() => {
      // 动态组件不可用时，保留 CSS 点阵。
    }).finally(() => { loading = false; });
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(field);
  motion.addEventListener('change', sync);
  keep(() => { live = false; unmount?.(); });
}, '[data-dot-grid]');
