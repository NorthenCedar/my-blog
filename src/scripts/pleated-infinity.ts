import { createPleats, hitPleats, PleatWaves, updatePleats } from './pleated-core';
import { createPleatedRenderer } from './pleated-renderer';

(() => {
  const host = document.querySelector<HTMLElement>('[data-pleated-infinity]');
  const canvas = host?.querySelector<HTMLCanvasElement>('canvas');
  if (!host || !canvas) return;
  const styles = getComputedStyle(host);
  const color = (name: string) => {
    let hex = styles.getPropertyValue(name).trim().slice(1);
    if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  };
  const palette = {
    base: color('--pleat-base'), wave: color('--pleat-wave'),
    opacity: parseFloat(styles.getPropertyValue('--pleat-opacity')),
    waveOpacity: parseFloat(styles.getPropertyValue('--pleat-wave-opacity')),
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pleats = createPleats(), waves = new PleatWaves();
  let renderer = createPleatedRenderer(canvas, palette);
  let seconds = 0, last = 0, raf = 0, suspended = false;
  let press: { x: number; y: number; time: number; id: number; moved: boolean } | null = null;
  const interactive = (target: EventTarget | null) => target instanceof Element && !!target.closest('a,button,input,textarea,select,label,[role="button"],[contenteditable="true"],.topbar,footer');
  const canAnimate = () => !!renderer && !reduced.matches && !document.hidden && !suspended;

  function paint() {
    updatePleats(pleats, seconds, waves);
    renderer?.draw(pleats);
  }
  function stop() {
    cancelAnimationFrame(raf); raf = 0; last = 0; press = null; waves.clear();
  }
  function frame(now: number) {
    raf = 0;
    if (!canAnimate()) return;
    if (!last) last = now;
    // 背景按约 30fps 绘制；运动量来自时间，不取决于显示器刷新率。
    if (now - last >= 1000 / 30 - 1) {
      seconds += Math.min((now - last) / 1000, 0.1); last = now;
      waves.prune(seconds); paint();
    }
    raf = requestAnimationFrame(frame);
  }
  function start() {
    canvas!.hidden = !renderer;
    host!.toggleAttribute('data-ready', !!renderer);
    if (!renderer || document.hidden) return;
    paint();
    if (canAnimate() && !raf) raf = requestAnimationFrame(frame);
  }

  document.addEventListener('pointerdown', (e: PointerEvent) => {
    press = canAnimate() && e.isPrimary && e.button === 0 && !interactive(e.target)
      ? { x: e.clientX, y: e.clientY, time: performance.now(), id: e.pointerId, moved: false } : null;
  }, { passive: true });
  document.addEventListener('pointermove', (e: PointerEvent) => {
    // 只用来排除拖选与滚动；没有镜头旋转或拖动操作。
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) press.moved = true;
  }, { passive: true });
  document.addEventListener('pointerup', (e: PointerEvent) => {
    const down = press; press = null;
    if (!down || !canAnimate() || e.pointerId !== down.id || down.moved || e.button !== 0
      || performance.now() - down.time > 700 || interactive(e.target) || document.getSelection()?.toString()
      || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    const rect = canvas!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    const origin = hitPleats(pleats, x, y, rect.width, rect.height);
    if (origin !== null) waves.trigger(origin, seconds);
  }, { passive: true });
  document.addEventListener('pointercancel', () => { press = null; }, { passive: true });
  window.addEventListener('scroll', () => { press = null; }, { passive: true });
  window.addEventListener('blur', () => { suspended = true; stop(); });
  window.addEventListener('focus', () => { suspended = false; start(); });
  window.addEventListener('pagehide', () => { suspended = true; stop(); });
  window.addEventListener('pageshow', () => { suspended = false; start(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  reduced.addEventListener('change', () => { stop(); start(); });
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); stop(); renderer = null; canvas.hidden = true; host.removeAttribute('data-ready');
  });
  canvas.addEventListener('webglcontextrestored', () => { renderer = createPleatedRenderer(canvas, palette); start(); });
  new ResizeObserver(() => { if (renderer && !document.hidden) paint(); }).observe(canvas);
  start();
})();
