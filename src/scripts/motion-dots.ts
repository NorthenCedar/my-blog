import { onPage } from './page-lifecycle';

type Dot = { x: number; y: number; size: number; alpha: number; shape: number };
type Point = { x: number; y: number };
type Trail = Point & { time: number };

const SELECTOR = '[data-motion-dots]';
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const TRAIL_LIFE = 920;
const TRAIL_RADIUS = 126;

onPage(({ document, window, matchMedia, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, IntersectionObserver }) => {
  const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)');
  for (const field of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    const canvas = field.querySelector('canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) continue;

    const mosaic = field.dataset.motionDots === 'mosaic';
    const mark = field.dataset.mark;
    /* 拖动主题软条时的中间色（themepreview 事件带来，纯 hex）。 */
    let tint: Record<string, string> | null = null;
    const pointer = { x: 0, y: 0 };
    const trail: Trail[] = [];
    let target: Point | undefined;
    let strength = 0;
    let dots: Dot[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let layoutFrame = 0;
    let last = 0;
    let inView = false;
    let layoutKey = '';

    const paint = (now = performance.now()) => {
      ctx.clearRect(0, 0, width, height);
      const radius = mosaic ? 190 : 250;
      const wake = trail.map(point => ({
        ...point, weight: 0.86 * (1 - clamp((now - point.time) / TRAIL_LIFE)) ** 1.5,
      }));
      ctx.lineCap = 'round';
      for (const dot of dots) {
        const dx = dot.x - pointer.x, dy = dot.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        const proximity = strength * (1 - clamp(distance / radius)) ** 2;
        let afterglow = 0;
        for (const point of wake) {
          const tx = Math.abs(dot.x - point.x), ty = Math.abs(dot.y - point.y);
          if (tx >= TRAIL_RADIUS || ty >= TRAIL_RADIUS) continue;
          const falloff = 1 - (tx * tx + ty * ty) / (TRAIL_RADIUS * TRAIL_RADIUS);
          if (falloff > 0) afterglow = Math.max(afterglow, point.weight * falloff ** 2);
        }
        const angle = Math.atan2(dy, dx);
        const x = dot.x + Math.cos(angle) * proximity * (mosaic ? 8 : 18);
        const y = dot.y + Math.sin(angle) * proximity * (mosaic ? 8 : 18);
        const size = dot.size * (1 + proximity * 0.7);
        ctx.globalAlpha = clamp(dot.alpha + Math.max(proximity, afterglow) * (mosaic ? 0.72 : 0.57));
        ctx.beginPath();
        if (!mosaic) {
          const span = proximity * 12;
          const vx = Math.cos(angle + proximity * 0.8) * span;
          const vy = Math.sin(angle + proximity * 0.8) * span;
          ctx.lineWidth = size * 2;
          ctx.moveTo(x - vx - 0.01, y - vy);
          ctx.lineTo(x + vx, y + vy);
          ctx.stroke();
        } else {
          if (dot.shape === 0) ctx.arc(x, y, size, 0, Math.PI * 2);
          else if (dot.shape === 1) ctx.rect(x - size, y - size, size * 2, size * 2);
          else {
            ctx.moveTo(x, y - size);
            ctx.lineTo(x + size, y + size);
            ctx.lineTo(x - size, y + size);
            ctx.closePath();
          }
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    const rebuild = () => {
      layoutFrame = 0;
      width = field.clientWidth;
      height = field.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const style = window.getComputedStyle(field);
      /* 拖动软条时的中间色由 themepreview 事件带过来（`layoutKey` 里带了颜色，
         所以颜色一变就会重建点阵；重建成本 = 重排一次网格，可以接受）。 */
      const color = tint?.['--motion-dots-ink']
        || style.getPropertyValue('--motion-dots-ink').trim() || style.getPropertyValue('--accent').trim();
      const key = [width, height, ratio, color].join('|');
      if (key === layoutKey) return;
      layoutKey = key;
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = ctx.strokeStyle = color;

      const gap = mosaic ? (width < 540 ? 10 : 14) : (width < 540 ? 24 : 33);
      const columns = Math.ceil(width / gap);
      const rows = Math.ceil(height / gap);
      let cutout: Uint8ClampedArray | undefined;
      if (mosaic && mark) {
        const stencil = document.createElement('canvas');
        stencil.width = columns;
        stencil.height = rows;
        const glyphs = stencil.getContext('2d');
        if (glyphs) {
          const size = Math.min(rows * 0.86, columns / (Array.from(mark).length * 1.08));
          glyphs.font = `900 ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
          glyphs.textAlign = 'center';
          glyphs.textBaseline = 'middle';
          glyphs.fillText(mark, columns / 2, rows * 0.64);
          cutout = glyphs.getImageData(0, 0, columns, rows).data;
        }
      }

      dots = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          if ((cutout?.[(row * columns + col) * 4 + 3] ?? 0) > 110) continue;
          const x = (col + 0.5) * gap, y = (row + 0.5) * gap;
          const wave = Math.sin(col * 0.18 + row * 0.37) * Math.cos(row * 0.41 - col * 0.07);
          const shape = wave < -0.18 ? 0 : wave > 0.25 ? 1 : 2;
          const alpha = mosaic
            ? clamp(y / (height * 0.58)) * (0.14 + 0.23 * (wave + 1))
            : 0.14 + 0.09 * (wave + 1);
          dots.push({ x, y, shape, alpha, size: mosaic ? gap * 0.32 : 1.4 + (wave + 1) * 0.62 });
        }
      }
      paint();
      field.setAttribute('data-ready', '');
    };

    const scheduleLayout = () => {
      if (!layoutFrame) layoutFrame = requestAnimationFrame(rebuild);
    };
    const tick = (now: number) => {
      frame = 0;
      while (trail.length && now - trail[0].time >= TRAIL_LIFE) trail.shift();
      const elapsed = last ? Math.min(now - last, 40) : 16;
      last = now;
      const blend = 1 - Math.exp(-elapsed / (target ? 65 : 130));
      strength += ((target ? 1 : 0) - strength) * blend;
      if (target) {
        pointer.x += (target.x - pointer.x) * blend;
        pointer.y += (target.y - pointer.y) * blend;
      }
      const moving = target
        ? 1 - strength > 0.005 || Math.hypot(target.x - pointer.x, target.y - pointer.y) > 0.25
        : strength > 0.005;
      if (!moving) {
        strength = target ? 1 : 0;
        last = 0;
      }
      paint(now);
      if (moving || trail.length) frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!frame && inView && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const leave = () => {
      if (!target) return;
      target = undefined;
      wake();
    };
    const reset = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = last = strength = 0;
      target = undefined;
      trail.length = 0;
      paint();
    };

    window.addEventListener('pointermove', event => {
      if (!finePointer.matches || !inView || event.pointerType === 'touch') return;
      const bounds = field.getBoundingClientRect();
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) { leave(); return; }
      const local = { x: x * width / bounds.width, y: y * height / bounds.height };
      if (!target && strength < 0.01) Object.assign(pointer, local);
      if (mosaic) {
        const now = performance.now();
        const previous = trail.at(-1);
        if (!target || !previous || now - previous.time >= TRAIL_LIFE) trail.push({ ...local, time: now });
        else {
          const distance = Math.hypot(local.x - previous.x, local.y - previous.y);
          if (distance >= 32) {
            const steps = Math.min(8, Math.floor(distance / 32));
            for (let i = 1; i <= steps; i++) trail.push({
              x: previous.x + (local.x - previous.x) * i / steps,
              y: previous.y + (local.y - previous.y) * i / steps,
              time: now,
            });
          }
        }
        if (trail.length > 24) trail.splice(0, trail.length - 24);
      }
      target = local;
      wake();
    }, { passive: true });
    window.addEventListener('pointerout', event => { if (!event.relatedTarget) leave(); });
    window.addEventListener('scroll', leave, { passive: true });
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
    /* 主题终态与拖动中间态共用一个处理器（颜色进了 layoutKey，scheduleLayout 会重建点阵）。 */
    const syncTheme = (event: Event) => {
      tint = (event as CustomEvent<{ mixed?: Record<string, string> } | null>).detail?.mixed ?? null;
      scheduleLayout();
    };
    document.addEventListener('themechange', syncTheme);
    document.addEventListener('themepreview', syncTheme);
    finePointer.addEventListener('change', reset);
    new ResizeObserver(scheduleLayout).observe(field);
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (!inView) reset();
    }).observe(field);
    rebuild();
  }
}, SELECTOR);
