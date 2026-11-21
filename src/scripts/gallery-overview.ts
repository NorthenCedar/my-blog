import { onPage } from './page-lifecycle';

onPage(({ document, keep, matchMedia, MutationObserver, requestAnimationFrame }) => {
  const overview = document.querySelector<HTMLElement>('[data-gallery-overview]')!;
  const list = overview.querySelector<HTMLElement>('[data-arc-fallback]');
  if (!list) return;
  const links = [...list.querySelectorAll<HTMLAnchorElement>('[data-album-link]')];
  const page = location.pathname + location.search;
  const saved = history.state?.galleryOverview;
  const restoredIndex = links.findIndex(link => link.getAttribute('href') === saved?.cover);
  let selected = restoredIndex >= 0 ? restoredIndex : undefined;
  let listTop = Number.isFinite(saved?.listTop) ? saved.listTop : 0;

  // Astro 已保存页面滚动。弧形封面与目录内滚动需要写入同一条历史记录。
  function remember(link: HTMLAnchorElement) {
    if (location.pathname + location.search !== page) return;
    if (!list!.hidden) listTop = list!.scrollTop;
    try {
      history.replaceState({
        ...history.state,
        galleryOverview: {
          cover: link.getAttribute('href'),
          listTop,
        },
      }, '');
    } catch { /* 浏览器限制历史记录时，链接仍可访问。 */ }
  }

  list.scrollTop = listTop;
  list.addEventListener('click', event => {
    if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('[data-album-link]');
    if (link) remember(link);
  });

  const arc = overview.querySelector<HTMLElement>('[data-cover-arc]');
  if (!arc) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const host = arc.querySelector<HTMLElement>('[data-cover-canvas]')!;
  const current = arc.querySelector<HTMLAnchorElement>('[data-cover-current]')!;
  const title = current.querySelector('[data-cover-title]')!;
  const count = current.querySelector('[data-cover-count]')!;
  const prev = arc.querySelector<HTMLButtonElement>('[data-cover-prev]')!;
  const next = arc.querySelector<HTMLButtonElement>('[data-cover-next]')!;
  let generation = 0, loading = false, ready = false, failed = false;
  let dispose: (() => void) | undefined;
  const active = () => overview.classList.contains('is-active');
  const eligible = () => active() && !document.hidden && !reduce.matches && !failed;
  function fallback() {
    generation++;
    loading = ready = false;
    const hadFocus = active() && arc!.contains(document.activeElement);
    arc!.hidden = true;
    list!.hidden = false;
    delete arc!.dataset.loading;
    prev.onclick = next.onclick = null;
    list!.scrollTop = listTop;
    if (hadFocus) links[selected ?? 0]?.focus({ preventScroll: true });
    dispose?.();
    dispose = undefined;
  }
  const showCover = (index: number) => {
    const link = links[index];
    if (!link) return;
    current.href = link.href;
    title.textContent = link.querySelector('[data-album-title]')!.textContent;
    count.textContent = link.querySelector('[data-album-count]')!.textContent;
  };
  if (selected !== undefined) showCover(selected);
  current.addEventListener('click', event => {
    if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = links.find(link => link.href === current.href);
    if (link) remember(link);
  });

  function sync() {
    if (!eligible()) {
      // 退场动画结束后卸载；还在加载的弧形无需等退场。
      if ((loading || dispose) && (!ready || reduce.matches || failed ||
          (!active() && !overview.classList.contains('is-out')))) fallback();
      return;
    }
    if (loading || dispose) return;
    loading = true;
    const ticket = ++generation;
    const currentLoad = () => ticket === generation;
    const unavailable = () => {
      if (!currentLoad()) return;
      failed = true;
      // React 可能在渲染或效果回调里报告失败，等这一轮提交完成后再卸载。
      queueMicrotask(() => { if (currentLoad()) fallback(); });
    };
    requestAnimationFrame(async () => {
      if (!currentLoad() || !eligible()) return;
      try {
        const { mountGalleryOverview } = await import('./gallery-overview-view');
        if (!currentLoad() || !eligible()) return;
        const albums = links.map(link => {
          const image = link.querySelector('img')!;
          return { image: image.src, alt: image.alt, text: link.querySelector('[data-album-title]')!.textContent! };
        });
        arc!.dataset.loading = '';
        arc!.hidden = false;
        dispose = mountGalleryOverview(host, {
          albums,
          restoredIndex: selected,
          onActiveChange(index) {
            if (!currentLoad()) return;
            selected = index;
            showCover(index);
            if (links[index]) remember(links[index]);
          },
          onOpen(index) {
            if (eligible() && currentLoad()) links[index]?.click();
          },
          onReady(step) {
            if (!eligible() || !currentLoad()) return;
            loading = false;
            ready = true;
            selected ??= 0;
            listTop = list!.scrollTop;
            const hadFocus = list!.contains(document.activeElement);
            delete arc!.dataset.loading;
            list!.hidden = true;
            prev.onclick = () => step(-1);
            next.onclick = () => step(1);
            if (hadFocus) current.focus({ preventScroll: true });
          },
          onUnavailable: unavailable,
        });
      } catch { unavailable(); }
    });
  }

  const state = new MutationObserver(sync);
  state.observe(overview, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', sync);
  keep(() => {
    state.disconnect();
    if (loading || dispose) fallback();
  });
  sync();
}, '[data-gallery-overview]');
