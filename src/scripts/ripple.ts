/** 留言页浅水：按需绘制连续波面，平静、后台及减少动态效果时停帧。 */
import { WaterSurface } from './water-core';
import { prefersReducedMotion } from './rl-core';

(() => {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-ripple]');
  if (!canvas) return;
  const reduce = prefersReducedMotion();
  const desktop = matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let water: WaterSurface;
  let image: ImageData;
  let raf = 0, lastTime = 0;
  let previous: { x: number; y: number; time: number } | undefined;
  const styles = getComputedStyle(canvas);
  const color = (name: string) => {
    let hex = styles.getPropertyValue(name).trim().slice(1);
    // 构建器会把六位色压成三位，必须先展开再读通道。
    if (hex.length === 3) hex = [...hex].map((digit) => digit + digit).join('');
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  };
  const shadow = color('--water-shadow');
  const light = color('--water-light');
  const strength = parseFloat(styles.getPropertyValue('--water-strength'));
  const enabled = () => !reduce.matches && desktop.matches && document.visibilityState === 'visible';

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    previous = undefined;
    water?.clear();
    ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
  }

  function resize() {
    stop();
    canvas!.hidden = !enabled();
    if (!enabled()) return;
    /* 网格约 4px 一格；大屏控制最长边与总面积，不乘设备像素比。 */
    const scale = Math.max(4, window.innerWidth / 420, window.innerHeight / 420,
      Math.sqrt(window.innerWidth * window.innerHeight / 90000));
    canvas!.width = Math.max(8, Math.ceil(window.innerWidth / scale));
    canvas!.height = Math.max(8, Math.ceil(window.innerHeight / scale));
    water = new WaterSurface(canvas!.width, canvas!.height);
    image = ctx!.createImageData(canvas!.width, canvas!.height);
  }

  function paint() {
    const h = water.values, w = water.width, pixels = image.data;
    const fade = water.opacity;
    /* 用水面法线的明暗表现起伏；每帧覆盖像素，重叠不会积成一片墨。 */
    for (let y = 1; y < water.height - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, p = i * 4;
        const slope = (h[i - 1] - h[i + 1]) * 0.65 + (h[i - w] - h[i + w]) * 0.76;
        const shade = slope > 0 ? light : shadow;
        pixels[p] = shade[0]; pixels[p + 1] = shade[1]; pixels[p + 2] = shade[2];
        pixels[p + 3] = Math.min(1, Math.abs(slope) * 2.5) * strength * (slope > 0 ? 2.6 : 1) * fade * 255;
      }
    }
    ctx!.putImageData(image, 0, 0);
  }

  function frame(now: number) {
    raf = 0;
    if (!enabled()) { stop(); return; }
    const active = water.advance(now - lastTime);
    lastTime = now;
    if (!active) { stop(); return; }
    paint();
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', (event: PointerEvent) => {
    if (event.pointerType === 'touch' || !enabled() || !water) return;
    const { clientX: x, clientY: y } = event;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const now = performance.now();
    const last = previous;
    previous = { x, y, time: now };
    if (!last || now - last.time > 200) return;
    const distance = Math.hypot(x - last.x, y - last.y);
    if (distance < 0.2) return;
    const speed = distance / Math.max(8, now - last.time);
    const amount = 0.18 + 0.55 * Math.min(1, speed / 1.6);
    water.disturb(last.x / window.innerWidth * water.width, last.y / window.innerHeight * water.height,
      x / window.innerWidth * water.width, y / window.innerHeight * water.height, amount);
    if (!raf) { lastTime = now; raf = requestAnimationFrame(frame); }
  }, { passive: true });
  window.addEventListener('pointerout', (event: PointerEvent) => { if (!event.relatedTarget) previous = undefined; });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('blur', stop);
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => {
    if (!enabled()) stop();
    else if (canvas.hidden) resize();
  });
  reduce.addEventListener('change', resize);
  desktop.addEventListener('change', resize);
  resize();
})();
