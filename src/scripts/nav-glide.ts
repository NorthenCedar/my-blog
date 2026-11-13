import { onPage } from './page-lifecycle';

const SELECTOR = 'nav[aria-label="主导航"]';

onPage(({ document, matchMedia, ResizeObserver, keep }) => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  for (const nav of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>(':scope > a'));
    const current = links.find(link => link.getAttribute('aria-current') === 'page');
    const pill = document.createElement('span');
    pill.className = 'nav-glide-pill';
    pill.setAttribute('aria-hidden', 'true');
    nav.prepend(pill);

    let hovered: HTMLAnchorElement | undefined;
    let focused: HTMLAnchorElement | undefined;
    let target: HTMLAnchorElement | undefined;
    let motion: Animation | undefined;

    function move(snap = false) {
      const next = hovered ?? focused ?? current;
      if (!snap && target === next) return;
      target = next;
      const visible = next && next.offsetWidth > 0;
      const width = pill.offsetWidth;
      const before = getComputedStyle(pill);
      const from = { transform: before.transform, width: `${width}px`, opacity: before.opacity };
      const oldX = before.transform === 'none' ? 0 : new DOMMatrixReadOnly(before.transform).m41;
      motion?.cancel();
      motion = undefined;
      nav.classList.toggle('nav-glide-ready', !!visible || !next);
      const x = visible ? next.offsetLeft : oldX;
      const y = visible ? next.offsetTop : pill.offsetTop;
      const w = visible ? next.offsetWidth : width;
      const to = { transform: `translate3d(${x}px,${y}px,0)`, width: `${w}px`, opacity: visible ? '1' : '0' };
      if (visible) pill.style.height = `${next.offsetHeight}px`;
      Object.assign(pill.style, to);
      if (snap || reduce.matches || !pill.animate) return;

      // 领先的一侧先拉长，随后另一侧追上；快速换目标时从当前画面接续。
      const shift = x - oldX;
      const stretch = Math.min(17, Math.abs(shift) * 0.13);
      const frames = visible && Number(from.opacity) > 0.15
        ? [{ ...from, offset: 0, easing: 'cubic-bezier(.19,.75,.32,1)' },
           { transform: `translate3d(${x + (shift < 0 ? -stretch : 0)}px,${y}px,0)`, width: `${w + stretch}px`, opacity: '1', offset: 0.65, easing: 'cubic-bezier(.25,.72,.35,1)' },
           { ...to, offset: 1 }]
        : [Number(from.opacity) < 0.15 && visible ? { ...to, opacity: '0' } : from, to];
      motion = pill.animate(frames, { duration: visible ? 365 : 170, easing: frames.length > 2 ? 'linear' : 'ease-out' });
    }

    const observer = new ResizeObserver(() => move(true));
    observer.observe(nav);
    for (const link of links) observer.observe(link);
    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    nav.addEventListener('pointerleave', () => { hovered = undefined; move(); }, options);
    nav.addEventListener('pointerover', event => {
      if (event.pointerType === 'touch') return;
      hovered = (event.target as Element).closest('a') ?? undefined;
      move();
    }, options);
    nav.addEventListener('focusin', event => {
      const link = (event.target as Element).closest('a:focus-visible');
      if (!(link instanceof HTMLAnchorElement)) return;
      hovered = undefined;
      focused = link;
      move();
    }, options);
    nav.addEventListener('focusout', event => {
      if (!links.includes(event.relatedTarget as HTMLAnchorElement)) { focused = undefined; move(); }
    }, options);
    reduce.addEventListener('change', () => move(true));
    keep(() => { listeners.abort(); motion?.cancel(); });
    move(true);
  }
}, SELECTOR);
