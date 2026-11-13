import { onPage } from './page-lifecycle';
import type { TagFlowMenuItem } from '../components/tag-flow-menu';

onPage(({ document, matchMedia, IntersectionObserver, keep }) => {
  const host = document.querySelector<HTMLElement>('[data-tag-flow-menu]')!;
  const motion = matchMedia('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)');
  if (!motion.matches || !IntersectionObserver) return;
  let live = true;
  keep(() => { live = false; });

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    Promise.all([import('react-dom/client'), import('../components/tag-flow-menu')]).then(
      ([{ hydrateRoot }, { tagFlowMenu }]) => {
        if (!live || !motion.matches) return;
        const items: TagFlowMenuItem[] = JSON.parse(host.dataset.tagFlowMenu!);
        const photos: string[] = JSON.parse(host.dataset.tagFlowPhotos!);
        const root = hydrateRoot(host, tagFlowMenu(items, photos.length > 0, host.hasAttribute('data-tag-flow-articles')));
        keep(() => root.unmount());

        if (!photos.length) return;
        const remaining = [...photos];
        const prepared = new WeakSet<HTMLElement>();

        function preparePhotos(event: Event) {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const row = target.closest<HTMLElement>('.flowing-menu__item');
          if (!row || prepared.has(row)) return;
          const part = row.querySelector('.flowing-menu__part');
          if (!part) return;

          prepared.add(row);
          // 只给当前行分配照片，循环的副本共用同一组。整页抽完后才允许重复。
          for (const photo of part.querySelectorAll<HTMLElement>('[data-tag-flow-photo]')) {
            if (!remaining.length) remaining.push(...photos);
            const [src] = remaining.splice(Math.floor(Math.random() * remaining.length), 1);
            host.style.setProperty(photo.dataset.tagFlowPhoto!, 'url(' + JSON.stringify(src) + ')');
          }
        }

        host.addEventListener('pointermove', preparePhotos, { passive: true });
        host.addEventListener('focusin', preparePhotos);
        keep(() => {
          host.removeEventListener('pointermove', preparePhotos);
          host.removeEventListener('focusin', preparePhotos);
        });
      },
    ).catch(() => {
      // 加载动效失败时，服务端生成的标签链接仍可直接访问。
    });
  });
  observer.observe(host);
}, '[data-tag-flow-menu]');
