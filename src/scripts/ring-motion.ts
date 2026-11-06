import { onPage } from './page-lifecycle';
import { angleDelta, advanceSpring, spring } from './ring-motion-core';

onPage(({ document, window, matchMedia, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, keep }) => {
  const frame = document.querySelector<HTMLElement>('[data-ring-frame]');
  const motion = frame?.querySelector<HTMLElement>('[data-ring-motion]');
  if (!frame || !motion) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)');
  const body = document.body;
  const x = spring(), y = spring(), z = spring();
  let raf = 0, layoutRaf = 0, last = 0;
  let rect = frame.getBoundingClientRect();
  let protectedAreas: DOMRect[] = [];
  let points: { x: number; y: number }[] = [];
  let drag: { id: number; angle: number; value: number } | undefined;
  const enabled = () => desktop.matches && !reduce.matches && document.visibilityState === 'visible';
  const paint = () => {
    motion.style.transform = `rotateX(${x.value.toFixed(3)}deg) rotateY(${y.value.toFixed(3)}deg) rotateZ(${z.value.toFixed(3)}deg)`;
  };
  function stop() {
    cancelAnimationFrame(raf); raf = 0; drag = undefined;
    delete body.dataset.ringDragging;
    for (const s of [x, y, z]) s.value = s.target = s.velocity = 0;
    motion.style.removeProperty('transform');
  }
  function tick(now: number) {
    raf = 0;
    if (!enabled()) { stop(); return; }
    const dt = Math.max(0, (now - last) / 1000); last = now;
    const active = [x, y, z].map(s => advanceSpring(s, dt)).some(Boolean);
    paint();
    if (active) raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function release() {
    drag = undefined; delete body.dataset.ringDragging;
    x.target = y.target = z.target = 0;
    if (enabled()) wake(); else stop();
  }
  function measure() {
    layoutRaf = 0;
    release(); rect = frame.getBoundingClientRect();
    protectedAreas = [];
    for (const el of document.querySelectorAll('.pagehead h1,.pagehead p,.vp,.prose,.topbar,.foot,.music')) {
      if (el.matches('.pagehead h1,.pagehead p')) {
        const range = document.createRange(); range.selectNodeContents(el);
        protectedAreas.push(...range.getClientRects());
      } else protectedAreas.push(el.getBoundingClientRect());
    }
    // 使用原光槽路径取样作为命中区域，环外的空白不会抢走文字选择手势。
    points = [];
    for (const path of frame.querySelectorAll<SVGPathElement>('.ring-pulse-core')) {
      const length = path.getTotalLength();
      for (let distance = 0; distance <= length; distance += 24) {
        const p = path.getPointAtLength(distance); points.push({ x: p.x, y: p.y });
      }
    }
    body.classList.toggle('ring-can-drag', enabled());
  }
  const scheduleMeasure = () => { if (!layoutRaf) layoutRaf = requestAnimationFrame(measure); };
  function eligible(event: PointerEvent) {
    if (!enabled() || event.pointerType === 'touch') return false;
    if ((event.target as Element)?.closest?.('a,button,input,textarea,select,[contenteditable],[role="button"],[role="switch"],dialog,.vp,.music,.prose,.topbar,.foot')) return false;
    if (document.activeElement?.matches('input,textarea,select,[contenteditable]')) return false;
    return !protectedAreas.some(b => event.clientX >= b.left - 8 && event.clientX <= b.right + 8 && event.clientY >= b.top - 8 && event.clientY <= b.bottom + 8);
  }
  function nearRing(event: PointerEvent) {
    const px = (event.clientX - rect.left) / rect.width * 1400;
    const py = (event.clientY - rect.top) / rect.height * 900;
    return Number.isFinite(px) && Number.isFinite(py) && points.some(p => Math.hypot(p.x - px, p.y - py) < 75);
  }
  window.addEventListener('pointermove', (event: PointerEvent) => {
    if (drag) {
      if (event.pointerId !== drag.id) return;
      const next = Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2));
      drag.value += angleDelta(next, drag.angle) * 180 / Math.PI; drag.angle = next;
      z.target = Math.max(-12, Math.min(12, drag.value));
      x.target = 1.5; y.target = -1.5;
      event.preventDefault(); wake(); return;
    }
    if (!eligible(event) || !nearRing(event)) { release(); return; }
    x.target = -((event.clientY - rect.top) / rect.height - 0.5) * 4;
    y.target = ((event.clientX - rect.left) / rect.width - 0.5) * 4;
    wake();
  }, { passive: false });
  window.addEventListener('pointerdown', (event: PointerEvent) => {
    if (drag || event.button !== 0 || !eligible(event) || !nearRing(event)) return;
    drag = { id: event.pointerId, angle: Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)), value: z.value };
    body.dataset.ringDragging = '';
    event.preventDefault();
  });
  window.addEventListener('pointerup', (event: PointerEvent) => { if (drag?.id === event.pointerId) release(); });
  window.addEventListener('pointercancel', (event: PointerEvent) => { if (drag?.id === event.pointerId) release(); });
  window.addEventListener('pointerout', (event: PointerEvent) => { if (!event.relatedTarget) release(); });
  window.addEventListener('blur', stop);
  window.addEventListener('pagehide', stop);
  window.addEventListener('resize', scheduleMeasure, { passive: true });
  window.addEventListener('scroll', scheduleMeasure, { passive: true });
  document.addEventListener('focusin', release);
  document.addEventListener('visibilitychange', () => { stop(); body.classList.toggle('ring-can-drag', enabled()); });
  reduce.addEventListener('change', () => { stop(); scheduleMeasure(); });
  desktop.addEventListener('change', () => { stop(); scheduleMeasure(); });
  const observer = new ResizeObserver(scheduleMeasure);
  const main = document.querySelector('main'); if (main) observer.observe(main);
  observer.observe(frame);
  let live = true;
  void document.fonts?.ready.then(() => { if (live) scheduleMeasure(); });
  keep(() => { live = false; stop(); cancelAnimationFrame(layoutRaf); observer.disconnect(); body.classList.remove('ring-can-drag'); });
  measure();
}, 'body.guestbook-plate [data-ring-motion]');
