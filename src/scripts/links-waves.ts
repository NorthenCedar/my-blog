import { onPage } from './page-lifecycle';

onPage(({ document, IntersectionObserver, keep }) => {
  const field = document.querySelector<HTMLElement>('[data-links-waves]')!;
  let live = true;

  const near = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    near.disconnect();
    void import('./links-waves-view').then(({ mountLinksWaves }) => {
      if (live) keep(mountLinksWaves(field));
    }).catch(() => { /* 加载失败时保留静态底纹。 */ });
  }, { rootMargin: '120px' });

  near.observe(field);
  keep(() => { live = false; });
}, '[data-links-waves]');
