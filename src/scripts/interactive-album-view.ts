import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { PhotoWallOpen, PhotoWallTile } from './photo-wall';

interface Photo { src: string; full: string; alt: string }
interface AlbumViewOptions {
  layout: 'dome' | 'infinite';
  photos: Photo[];
  onOpen: (index: number, source: PhotoWallOpen) => void;
  onReady: () => void;
  onUnavailable: () => void;
}

function domeTile(trigger: HTMLElement): PhotoWallTile {
  return {
    trigger,
    readOrigin: () => {
      const rect = trigger.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.right <= 0 || rect.left >= innerWidth || rect.bottom <= 0 || rect.top >= innerHeight) return;
      const radius = parseFloat(getComputedStyle(trigger).borderTopLeftRadius);
      const scale = Math.min(rect.width / trigger.offsetWidth, rect.height / trigger.offsetHeight);
      return { rect, radius: (radius || 0) * scale };
    },
    setSourceHidden: hidden => { trigger.toggleAttribute('data-photo-wall-hidden', hidden); },
  };
}

export function mountAlbum(host: HTMLElement, options: AlbumViewOptions) {
  const { layout, photos, onOpen, onReady, onUnavailable } = options;
  const root = createRoot(host, { onUncaughtError: onUnavailable });
  let disposed = false;
  let refreshTheme = () => {};
  const theme = () => document.documentElement.classList.contains('dark') ? 'dark' : 'light';

  if (layout === 'dome') {
    import('../vendor/react-bits/DomeGallery').then(({ default: DomeGallery }) => {
      if (disposed) return;
      refreshTheme = () => root.render(createElement(DomeGallery, {
        images: photos,
        // 对齐 React Bits 演示的球面密度、间距、透视和拖动范围。
        segments: 34,
        minRadius: 600,
        fit: 0.8,
        maxVerticalRotationDeg: 0,
        dragDampening: 2,
        grayscale: false,
        overlayBlurColor: 'var(--paper)',
        imageBorderRadius: '30px',
        onItemClick(index, trigger, focusPhoto) {
          onOpen(index, {
            ...domeTile(trigger),
            selectTile(photo, direction) {
              const selected = focusPhoto(photo, direction);
              return selected ? domeTile(selected) : undefined;
            },
          });
        },
        onReady,
      }));
      refreshTheme();
    }).catch(onUnavailable);
  } else {
    import('../vendor/react-bits/InfiniteMenu').then(({ default: InfiniteMenu }) => {
      if (disposed) return;
      const items = photos.map(photo => ({ image: photo.src, title: photo.alt }));
      refreshTheme = () => root.render(createElement(InfiniteMenu, {
        items,
        count: Math.min(400, Math.max(54, photos.length * 4)),
        zoom: 1.2,
        tileSize: 0.75,
        autoplay: 0,
        grayscale: false,
        dim: 0.17,
        theme: theme(),
        backgroundColor: 'var(--paper)',
        onReady,
        onUnavailable,
        onItemClick(_item, index, source, focusPhoto) {
          const trigger = host.querySelector<HTMLElement>('.infinite-menu__action') ?? host.querySelector<HTMLElement>('.infinite-menu');
          onOpen(index, {
            ...source,
            trigger,
            selectTile(photo, direction) {
              const selected = focusPhoto(photo, direction);
              return selected ? { ...selected, trigger } : undefined;
            },
          });
        },
        actionLabel: '放大照片',
        style: {
          '--infinite-menu-text': 'var(--ink)',
          '--infinite-menu-accent': 'var(--ink)',
          '--infinite-menu-on-accent': 'var(--paper)',
          '--infinite-menu-shadow': '0 2px 18px var(--paper)',
        },
      }));
      refreshTheme();
    }).catch(onUnavailable);
  }

  return {
    dispose() { disposed = true; root.unmount(); },
    refreshTheme() { refreshTheme(); },
  };
}
