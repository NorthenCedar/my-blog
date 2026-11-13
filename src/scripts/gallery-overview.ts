import { onPage } from './page-lifecycle';

onPage(({ document, keep, matchMedia, MutationObserver }) => {
  const overview = document.querySelector<HTMLElement>('[data-gallery-overview]')!;
  const list = overview.querySelector<HTMLElement>('[data-arc-fallback]');
  if (!list) return;
  const links = [...list.querySelectorAll<HTMLAnchorElement>('[data-album-link]')];
  const page = location.pathname + location.search;
  const saved = history.state?.galleryOverview;
  const restoredIndex = links.findIndex(link => link.getAttribute('href') === saved?.cover);

  // Astro 已保存页面滚动。弧形封面与目录内滚动需要写入同一条历史记录。
  function remember(link: HTMLAnchorElement) {
    if (location.pathname + location.search !== page) return;
    try {
      history.replaceState({
        ...history.state,
        galleryOverview: {
          cover: link.getAttribute('href'),
          listTop: list!.hidden ? saved?.listTop ?? 0 : list!.scrollTop,
        },
      }, '');
    } catch { /* 浏览器限制历史记录时，链接仍可访问。 */ }
  }

  if (Number.isFinite(saved?.listTop)) list.scrollTop = saved.listTop;
  list.addEventListener('click', event => {
    if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('[data-album-link]');
    if (link) remember(link);
  });

  const arc = overview.querySelector<HTMLElement>('[data-cover-arc]');
  if (!arc || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = arc.querySelector<HTMLElement>('[data-cover-canvas]')!;
  const current = arc.querySelector<HTMLAnchorElement>('[data-cover-current]')!;
  const title = current.querySelector('[data-cover-title]')!;
  const count = current.querySelector('[data-cover-count]')!;
  const prev = arc.querySelector<HTMLButtonElement>('[data-cover-prev]')!;
  const next = arc.querySelector<HTMLButtonElement>('[data-cover-next]')!;
  const albums = links.map(link => {
    const image = link.querySelector('img')!;
    return {
      image: image.src,
      alt: image.alt,
      text: link.querySelector('[data-album-title]')!.textContent!,
      count: link.querySelector('[data-album-count]')!.textContent!,
      href: link.href,
    };
  });

  let live = true;
  let dispose: (() => void) | undefined;
  const fallback = () => {
    arc.hidden = true;
    list.hidden = false;
    delete arc.dataset.loading;
    prev.onclick = next.onclick = null;
    if (Number.isFinite(saved?.listTop)) list.scrollTop = saved.listTop;
  };
  keep(() => {
    live = false;
    dispose?.();
    fallback();
  });
  const showCover = (index: number) => {
    const album = albums[index];
    if (!album || !live) return;
    current.href = album.href;
    title.textContent = album.text;
    count.textContent = album.count;
  };
  if (restoredIndex >= 0) showCover(restoredIndex);
  current.addEventListener('click', event => {
    if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = links.find(link => link.href === current.href);
    if (link) remember(link);
  });
  arc.dataset.loading = '';
  arc.hidden = false;

  import('./gallery-overview-view').then(({ mountGalleryOverview }) => {
    if (!live) return;
    const mounted = mountGalleryOverview(host, {
      albums,
      restoredIndex: restoredIndex >= 0 ? restoredIndex : undefined,
      onActiveChange(index) {
        showCover(index);
        const link = links[index];
        if (link && live) remember(link);
      },
      onOpen(index) {
        if (live) links[index]?.click();
      },
      onReady(step) {
        if (!live) return;
        delete arc.dataset.loading;
        list.hidden = true;
        prev.onclick = () => step(-1);
        next.onclick = () => step(1);
      },
      onUnavailable: fallback,
    });
    dispose = mounted.dispose;
    const theme = new MutationObserver(mounted.refresh);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const width = matchMedia('(max-width: 640px)');
    width.addEventListener('change', mounted.refresh);
  }).catch(fallback);
}, '[data-gallery-overview]');
