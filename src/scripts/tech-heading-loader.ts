import { onPage } from './page-lifecycle';

const titles = 'main h1:not(.sr-only), #catalog-title';
onPage(({ document, keep, matchMedia }) => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let live = true;
  let current: HTMLElement | undefined;
  let unmount: (() => void) | undefined;
  const clear = () => { unmount?.(); unmount = undefined; current = undefined; };
  reduce.addEventListener('change', clear);
  document.addEventListener('pointerover', event => {
    const heading = (event.target as Element).closest<HTMLElement>(titles);
    if (!heading || heading === current || event.buttons || reduce.matches
      || document.documentElement.classList.contains('boot-on')) return;
    clear();
    current = heading;
    void import('./tech-headings').then(({ mountTechHeading }) => {
      if (live && current === heading && !reduce.matches && heading.isConnected) unmount = mountTechHeading(heading);
    }).catch(() => { if (current === heading) clear(); });
  }, { passive: true });
  keep(() => { live = false; clear(); });
}, titles);
