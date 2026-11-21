import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import CircularGallery, { type GalleryItem } from '../vendor/react-bits/CircularGallery';

interface OverviewOptions {
  albums: GalleryItem[];
  restoredIndex?: number;
  onActiveChange: (index: number) => void;
  onOpen: (index: number) => void;
  onReady: (step: (direction: number) => void) => void;
  onUnavailable: () => void;
}

export function mountGalleryOverview(host: HTMLElement, options: OverviewOptions) {
  const root = createRoot(host, { onUncaughtError: options.onUnavailable });
  const onItemClick = (_item: GalleryItem, index: number) => options.onOpen(index);
  const width = matchMedia('(max-width: 640px)');
  const refresh = () => {
    const narrow = width.matches;
    root.render(createElement(CircularGallery, {
      items: options.albums,
      initialIndex: options.restoredIndex,
      intro: options.restoredIndex === undefined,
      'aria-label': '相册封面，使用方向键切换，按回车进入',
      bend: narrow ? 1.9 : 3.3,
      textColor: getComputedStyle(host).getPropertyValue('--ink').trim(),
      borderRadius: 0.022,
      itemSize: narrow ? 1.12 : 1.25,
      itemAspect: 0.94,
      gap: 0.16,
      scrollSpeed: narrow ? 2.25 : 1.8,
      scrollEase: 0.075,
      wave: 0.28,
      shadow: 0.17,
      fadeEdges: 0.055,
      snap: true,
      autoScroll: 0,
      showTitles: false,
      openOnClick: false,
      horizontalWheel: true,
      onItemClick,
      onActiveChange: options.onActiveChange,
      onReady: options.onReady,
      onUnavailable: options.onUnavailable,
    }));
  };
  refresh();
  const theme = new MutationObserver(refresh);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  width.addEventListener('change', refresh);
  return () => {
    theme.disconnect();
    width.removeEventListener('change', refresh);
    root.unmount();
  };
}
