import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import FooterWaves from '../vendor/react-bits/FooterWaves.jsx';

export function mountLinksWaves(field: HTMLElement) {
  const root = createRoot(field);
  /* 拖动主题软条时的中间色（由 themepreview 事件带过来，纯 hex）。
     不 import 预览模块：那会把整块逻辑拉进首屏包，页面 JS 预算当场红。 */
  let tint: Record<string, string> | null = null;

  function render() {
    const theme = getComputedStyle(field);
    root.render(createElement(FooterWaves, {
      text: field.dataset.linksWaves!,
      /* 拖动时用中间色 —— 否则这一片点阵要等松手才换色，
         在"背景已经整片变暗"的衬托下就是一块突兀的亮色残留。 */
      color: tint?.['--links-mosaic-base'] || theme.getPropertyValue('--links-mosaic-base').trim(),
      /* ★ 水波色是**独立 token**（`--links-mosaic-hover`），不再借 `--links-mosaic-ink`：
         暗色档点阵本体是橙，水波继续用亮橙就是同色堆叠（站主 2026-11-13 报障）。 */
      hoverColor: tint?.['--links-mosaic-hover'] || theme.getPropertyValue('--links-mosaic-hover').trim(),
      backgroundColor: tint?.['--links-mosaic-bg'] || theme.getPropertyValue('--links-mosaic-bg').trim(),
    }));
  }

  render();
  document.addEventListener('themechange', render);
  /* 拖动预览：React 组件逐帧重渲染太重 —— 12fps 足够读成"连续变色"。 */
  let previewTimer = 0;
  const onPreview = (event: Event) => {
    tint = (event as CustomEvent<{ mixed?: Record<string, string> } | null>).detail?.mixed ?? null;
    if (previewTimer) return;
    previewTimer = window.setTimeout(() => { previewTimer = 0; render(); }, 80);
  };
  document.addEventListener('themepreview', onPreview);
  return () => {
    document.removeEventListener('themechange', render);
    document.removeEventListener('themepreview', onPreview);
    if (previewTimer) window.clearTimeout(previewTimer);
    root.unmount();
  };
}
