import { onPage } from './page-lifecycle';
import type { PhotoWallOpen } from './photo-wall';

onPage(({ document, window, keep, matchMedia, MutationObserver }) => {
  const album = document.querySelector<HTMLElement>('[data-interactive-album]');
  if (!album || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const stage = album.querySelector<HTMLElement>('[data-album-stage]')!;
  const view = album.querySelector<HTMLElement>('[data-album-view]')!;
  const toggle = album.querySelector<HTMLButtonElement>('[data-album-toggle]')!;
  const wall = album.querySelector<HTMLElement>('.wf')!;
  const toggleLabel = toggle.querySelector('[data-album-toggle-label]')!;
  const links = Array.from(wall.querySelectorAll<HTMLAnchorElement>('a.frame'));
  if (!links.length) return;
  const photos = links.map(link => {
    const image = link.querySelector('img')!;
    return { src: image.src, full: link.href, alt: image.alt };
  });

  let live = true;
  let dispose: (() => void) | undefined;
  function showIndex(show: boolean) {
    album.dataset.scene = show ? 'index' : 'interactive';
    stage.hidden = show;
    wall.hidden = !show;
    toggleLabel.textContent = show ? '返回展览' : '查看全部';
    toggle.setAttribute('aria-pressed', String(show));
  }

  function fallback() {
    if (!live) return;
    delete album.dataset.scene;
    stage.hidden = true;
    toggle.hidden = true;
    wall.hidden = false;
  }

  keep(() => {
    live = false;
    toggle.onclick = null;
    dispose?.();
  });

  stage.dataset.loading = '';
  stage.hidden = false;
  import('./interactive-album-view').then(({ mountAlbum }) => {
    if (!live) return;
    const mounted = mountAlbum(view, {
      layout: album.dataset.layout === 'dome' ? 'dome' : 'infinite',
      photos,
      onOpen: (index, source) => {
        const link = links[index];
        if (!link) return;
        const event = new CustomEvent<PhotoWallOpen>('photo-wall:open', {
          detail: source, cancelable: true,
        });
        if (link.dispatchEvent(event)) link.click();
      },
      onReady: () => {
        if (!live) return;
        delete stage.dataset.loading;
        toggle.hidden = false;
        toggle.onclick = () => showIndex(!stage.hidden);
        showIndex(false);
      },
      onUnavailable: fallback,
    });
    dispose = mounted.dispose;
    const observer = new MutationObserver(mounted.refreshTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    matchMedia('(max-width: 640px)').addEventListener('change', mounted.refreshTheme);
    // 原生整页离开由浏览器回收，Astro 换页由页面作用域卸载。
  }).catch(error => {
    window.console.warn('相册陈列初始化失败', error);
    fallback();
  });
}, '[data-interactive-album]');
