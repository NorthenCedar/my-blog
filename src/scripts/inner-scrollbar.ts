/** 自绘滑块改变鼠标拖动的入口，滚轮、键盘和焦点仍作用于原滚动区。 */
function track(scroller: HTMLElement, frame: HTMLElement, axis: 'x' | 'y', signal: AbortSignal) {
  const rail = frame.ownerDocument.createElement('div');
  const thumb = frame.ownerDocument.createElement('span');
  rail.className = 'inner-scroll-rail';
  rail.dataset.axis = axis;
  rail.append(thumb);
  frame.append(rail);
  const horizontal = axis === 'x';
  const offset = horizontal ? 'scrollLeft' : 'scrollTop';
  const size = horizontal ? 'inlineSize' : 'blockSize';
  const options = { signal };
  let range = 0, length = 0, travel = 0, grab = 0;

  const paint = () => {
    if (range > 0) thumb.style.transform = `translate${axis.toUpperCase()}(${scroller[offset] / range * travel}px)`;
  };
  const coordinate = (event: PointerEvent) => {
    const box = rail.getBoundingClientRect();
    return horizontal ? (event.clientX - box.left) * length / box.width : (event.clientY - box.top) * length / box.height;
  };
  const seek = (position: number) => {
    scroller.scrollTo({ [horizontal ? 'left' : 'top']: (position - grab) / travel * range, behavior: 'instant' });
  };

  rail.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.pointerType !== 'mouse' || travel <= 0) return;
    const position = coordinate(event);
    event.preventDefault();
    const onThumb = event.target === thumb;
    grab = onThumb ? position - scroller[offset] / range * travel : (length - travel) / 2;
    rail.setPointerCapture(event.pointerId);
    rail.dataset.dragging = '';
    if (!onThumb) seek(position);
  }, options);
  rail.addEventListener('pointermove', event => {
    if (rail.hasPointerCapture(event.pointerId) && travel > 0) seek(coordinate(event));
  }, options);
  rail.addEventListener('lostpointercapture', () => { delete rail.dataset.dragging; }, options);
  rail.addEventListener('wheel', event => {
    const delta = horizontal ? event.deltaX || (event.shiftKey ? event.deltaY : 0) : event.deltaY;
    if (!delta || event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 2 ? length : event.deltaMode === 1 ? 16 : 1;
    scroller.scrollBy({ [horizontal ? 'left' : 'top']: delta * unit, behavior: 'instant' });
  }, { ...options, passive: false });
  scroller.addEventListener('scroll', paint, { ...options, passive: true });

  return (viewport: number, total: number, available: number) => {
    range = total - viewport;
    length = available;
    const hidden = range <= 0 || length <= 24;
    if (rail.hidden !== hidden) rail.hidden = hidden;
    travel = 0;
    if (hidden) return;
    const thumbSize = Math.max(24, length * viewport / total);
    travel = length - thumbSize;
    rail.style[size] = `${length}px`;
    thumb.style[size] = `${thumbSize}px`;
    paint();
  };
}

const scrolls = (overflow: string) => overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
const selector = '[data-scrollbars],.staggered-menu-panel,.notices-scroll,.dialog-scroll,.visitor-dialog,.original-plate,:is(.prose,.writer-preview) :is(pre,table),.writer-raw-block,textarea';

function mount(scroller: HTMLElement) {
  const frame = scroller.ownerDocument.createElement('div');
  const modal = scroller.tagName === 'DIALOG';
  frame.className = modal ? 'inner-scroll-frame is-fixed' : 'inner-scroll-frame';
  frame.setAttribute('aria-hidden', 'true');
  if (modal) scroller.append(frame);
  else scroller.after(frame);
  const events = new AbortController();
  const vertical = track(scroller, frame, 'y', events.signal);
  const horizontal = track(scroller, frame, 'x', events.signal);
  scroller.dataset.innerScroll = '';

  function align() {
    if (frame.hidden) return;
    const parent = frame.offsetParent as HTMLElement | null;
    let left = scroller.offsetLeft, top = scroller.offsetTop;
    if (modal || scroller.offsetParent !== parent) {
      const box = scroller.getBoundingClientRect();
      const origin = parent?.getBoundingClientRect();
      left = box.left - (origin?.left ?? 0) + (parent ? parent.scrollLeft - parent.clientLeft : 0);
      top = box.top - (origin?.top ?? 0) + (parent ? parent.scrollTop - parent.clientTop : 0);
    }
    frame.style.left = `${left + scroller.clientLeft}px`;
    frame.style.top = `${top + scroller.clientTop}px`;
  }

  return {
    align,
    refresh(style: CSSStyleDeclaration) {
      // 代码块工具栏可能在滑块先就绪后改写父容器。
      if (!modal && frame.previousElementSibling !== scroller) scroller.after(frame);
      const { clientWidth, clientHeight, scrollWidth, scrollHeight } = scroller;
      const y = scrolls(style.overflowY) && scrollHeight > clientHeight && clientHeight > 24;
      const x = scrolls(style.overflowX) && scrollWidth > clientWidth && clientWidth > 24;
      const hidden = !x && !y;
      if (frame.hidden !== hidden) frame.hidden = hidden;
      if (hidden) return;
      // 右下角留给文本框的原生缩放把手，双轴也在此错开。
      const resize = scroller.tagName === 'TEXTAREA' && style.resize !== 'none';
      frame.style.width = `${clientWidth}px`;
      frame.style.height = `${clientHeight}px`;
      vertical(clientHeight, y ? scrollHeight : 0, clientHeight - (x || resize ? 14 : 0));
      horizontal(clientWidth, x ? scrollWidth : 0, clientWidth - (y || resize ? 14 : 0));
      align();
    },
    dispose() {
      events.abort();
      delete scroller.dataset.innerScroll;
      frame.remove();
    },
  };
}

/** 只观察本站已知的滚动区。内容、面板开合和尺寸变化时才更新几何。 */
export function mountInnerScrollbars(doc: Document) {
  const win = doc.defaultView!;
  const mounted = new Map<HTMLElement, ReturnType<typeof mount>>();
  const observed = new Set<HTMLElement>();
  const events = new AbortController();
  const options = { signal: events.signal, passive: true };
  let frame = 0;
  let sticky: ReturnType<typeof mount>[] = [];

  const request = () => { if (!frame) frame = win.requestAnimationFrame(refresh); };
  const resize = new ResizeObserver(request);
  const root = doc.documentElement;
  const changes = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' ||
        (record.target as Element).closest?.(selector) ||
        [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) request();
  });

  function refresh() {
    frame = 0;
    const enabled = root.classList.contains('cursor-none');
    const scrollers = new Set(enabled ? doc.querySelectorAll<HTMLElement>(selector) : []);
    for (const scroller of observed) {
      if (scrollers.has(scroller)) continue;
      resize.unobserve(scroller);
      observed.delete(scroller);
      mounted.get(scroller)?.dispose();
      mounted.delete(scroller);
    }
    sticky = [];
    for (const scroller of scrollers) {
      if (!observed.has(scroller)) {
        observed.add(scroller);
        resize.observe(scroller);
      }
      if (!scroller.clientWidth || !scroller.clientHeight) {
        mounted.get(scroller)?.dispose();
        mounted.delete(scroller);
        continue;
      }
      const style = win.getComputedStyle(scroller);
      let control = mounted.get(scroller);
      if (!control) {
        const x = scrolls(style.overflowX) && scroller.scrollWidth > scroller.clientWidth;
        const y = scrolls(style.overflowY) && scroller.scrollHeight > scroller.clientHeight;
        if (!x && !y) continue;
        control = mount(scroller);
        mounted.set(scroller, control);
      }
      control.refresh(style);
      if (style.position === 'sticky') sticky.push(control);
    }
  }

  changes.observe(doc.body, { subtree: true, childList: true, attributeFilter: ['open', 'hidden', 'inert', 'aria-expanded'] });
  changes.observe(root, { attributeFilter: ['class'] });
  doc.addEventListener('input', request, options);
  win.addEventListener('resize', request, options);
  win.addEventListener('scroll', () => { for (const control of sticky) control.align(); }, options);
  doc.fonts?.addEventListener('loadingdone', request, options);
  refresh();
  return () => {
    events.abort();
    changes.disconnect();
    resize.disconnect();
    win.cancelAnimationFrame(frame);
    for (const control of mounted.values()) control.dispose();
  };
}
