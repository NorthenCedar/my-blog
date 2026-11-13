import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import TechText from '../vendor/react-bits/TechText';

/** 用原排版的实际行盒绘制，每行保留独立的拖动范围。 */
export function mountTechHeading(heading: HTMLElement) {
  const source = document.createElement('span');
  source.className = 'tech-heading-source';
  const nodes = [...heading.childNodes];
  source.append(...nodes);
  heading.append(source);
  const previousLabel = heading.getAttribute('aria-label');
  const name = source.querySelector('.display-sr')?.textContent ?? source.textContent ?? '';
  const layer = document.createElement('span');
  layer.className = 'tech-heading-layer';
  layer.setAttribute('aria-hidden', 'true');
  heading.append(layer);
  heading.setAttribute('data-tech-title-mounted', '');
  if (getComputedStyle(heading).position === 'static') heading.setAttribute('data-tech-title-static', '');

  const root = createRoot(layer);
  const range = document.createRange();
  let lastLayout = '';
  let revision = 0;
  let disposed = false;

  function render() {
    if (disposed) return;
    const headingBox = heading.getBoundingClientRect();
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest('.display-sr, .heading-dot')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const lines: { text: string; x: number; y: number; right: number; height: number }[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let offset = 0;
      for (const char of node.textContent ?? '') {
        range.setStart(node, offset);
        offset += char.length;
        range.setEnd(node, offset);
        const box = range.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const y = box.top - headingBox.top;
        const last = lines.at(-1);
        if (last && Math.abs(last.y - y) < 2) {
          last.text += char;
          last.right = Math.max(last.right, box.right - headingBox.left);
        } else {
          lines.push({ text: char, x: box.left - headingBox.left, y, right: box.right - headingBox.left, height: box.height });
        }
      }
    }
    const visibleLines = lines.filter(line => line.text.trim());
    if (!visibleLines.length) return;
    const style = getComputedStyle(heading);
    const size = Number.parseFloat(style.fontSize);
    const spacing = (Number.parseFloat(style.letterSpacing) || 0) / size;
    const layout = JSON.stringify([visibleLines, style.fontFamily, style.fontWeight, size, spacing]);
    if (layout === lastLayout) return;
    lastLayout = layout;
    const ticket = ++revision;
    heading.removeAttribute('data-tech-ready');
    let ready = 0;
    root.render(visibleLines.map((line, index) => createElement(TechText, {
      key: ticket + ':' + index,
      text: line.text.trimEnd(),
      fontFamily: style.fontFamily,
      fontSize: size,
      fontWeight: Number(style.fontWeight) || 600,
      letterSpacing: spacing,
      naturalSize: true,
      reach: 110,
      align: 'left',
      sweep: false,
      labels: false,
      style: { position: 'absolute', left: line.x, top: line.y, width: line.right - line.x, height: line.height },
      onFirstFrame: () => {
        if (!disposed && ticket === revision && ++ready === visibleLines.length) {
          heading.setAttribute('aria-label', name);
          heading.setAttribute('data-tech-ready', '');
        }
      },
    })));
  }

  const size = new ResizeObserver(render);
  size.observe(heading);
  void document.fonts?.ready.then(render);
  render();
  return () => {
    disposed = true;
    size.disconnect();
    root.unmount();
    layer.remove();
    source.replaceWith(...source.childNodes);
    heading.removeAttribute('data-tech-ready');
    heading.removeAttribute('data-tech-title-mounted');
    heading.removeAttribute('data-tech-title-static');
    if (previousLabel === null) heading.removeAttribute('aria-label');
    else heading.setAttribute('aria-label', previousLabel);
  };
}
