import { onPage } from './page-lifecycle';

type Point = { x: number; y: number };
type Stamp = Point & { time: number };
type Glyph = Point & { char: string; width: number };
type Area = { left: number; top: number; right: number; bottom: number };

const RADIUS = 110;
const TRAIL_MS = 4000 / 3;
const TEXT_EDGE = 22;

onPage(({ document, window, matchMedia, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, MutationObserver }) => {
  const field = document.querySelector<HTMLElement>('[data-guestbook-words]');
  const drift = field?.querySelector<HTMLElement>('[data-word-drift]');
  const base = field?.querySelector<HTMLCanvasElement>('[data-word-base]');
  const overlay = field?.querySelector<HTMLCanvasElement>('[data-word-trail]');
  const baseContext = base?.getContext('2d');
  const context = overlay?.getContext('2d');
  if (!field || !drift || !base || !overlay || !baseContext || !context) return;

  const words = (field.dataset.words ?? '').split(' ').filter(Boolean).map(word => '.' + word);
  if (!words.length) return;
  const hover = matchMedia('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)');
  const main = document.querySelector('main');
  const range = document.createRange();
  const trail: Stamp[] = [];
  const levels = new Map<Glyph, number>();
  let rows: Glyph[][][] = [];
  let textAreas: DOMRect[] | undefined;
  let lineHeight = 0;
  let rowStep = 0;
  let dirty: Area | undefined;
  let queued: Point | undefined;
  let lastStamp: Stamp | undefined;
  let lastFrame = 0;
  let frame = 0;
  let layoutFrame = 0;
  let layoutKey = '';

  const clearPixels = () => {
    if (dirty) context.clearRect(dirty.left, dirty.top, dirty.right - dirty.left, dirty.bottom - dirty.top);
    dirty = undefined;
  };

  const clearTrail = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    queued = lastStamp = undefined;
    trail.length = 0;
    levels.clear();
    clearPixels();
  };

  const measureText = () => {
    const areas: DOMRect[] = [];
    if (!main) return areas;
    const include = (rect: DOMRect) => {
      if (rect.width && rect.height && rect.bottom >= -TEXT_EDGE && rect.top <= window.innerHeight + TEXT_EDGE) {
        areas.push(rect);
      }
    };
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || node.parentElement?.closest('[aria-hidden="true"],script,style')) continue;
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) include(rect);
    }
    for (const control of main.querySelectorAll('input,textarea,select')) {
      if (!control.closest('[aria-hidden="true"]')) include(control.getBoundingClientRect());
    }
    return areas;
  };

  const rebuild = () => {
    layoutFrame = 0;
    const width = drift.clientWidth;
    const height = drift.clientHeight;
    if (!width || !height) return;
    const style = window.getComputedStyle(drift);
    const accent = window.getComputedStyle(overlay).color;
    const gap = parseFloat(style.columnGap);
    const tracking = parseFloat(style.letterSpacing) || 0;
    const font = `${style.fontSize} ${style.fontFamily}`;
    const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (width * height)), 8192 / Math.max(width, height));
    const key = [width, height, font, style.lineHeight, style.rowGap, gap, tracking, style.color, accent, scale].join('|');
    if (key === layoutKey) return;
    layoutKey = key;
    clearTrail();
    textAreas = undefined;
    lineHeight = parseFloat(style.lineHeight);
    rowStep = lineHeight + parseFloat(style.rowGap);
    for (const [canvas, drawing] of [[base, baseContext], [overlay, context]] as const) {
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      drawing.setTransform(scale, 0, 0, scale, 0, 0);
      drawing.font = font;
      drawing.textBaseline = 'top';
    }
    baseContext.fillStyle = style.color;
    context.fillStyle = accent;
    const measured = words.map(word => {
      const chars = Array.from(word, char => ({ char, width: baseContext.measureText(char).width + tracking }));
      return { chars, width: chars.reduce((sum, glyph) => sum + glyph.width, 0) };
    });

    // 静态层只在尺寸或配色变化时绘制。每行按像素分桶，拖尾只查附近的字。
    rows = [];
    let nextWord = 0;
    for (let y = 0; y < height; y += rowStep) {
      const line: { word: typeof measured[number]; shade: number }[] = [];
      let span = 0;
      while (span < width) {
        const word = measured[nextWord % measured.length];
        if (line.length && span + word.width > width) break;
        line.push({ word, shade: 0.65 + (nextWord * 17 % 31) / 100 });
        span += word.width + gap;
        nextWord++;
      }
      let x = Math.max(0, (width - span + gap) / 2);
      const buckets: Glyph[][] = [];
      for (const { word, shade } of line) {
        baseContext.globalAlpha = shade;
        for (const { char, width: glyphWidth } of word.chars) {
          baseContext.fillText(char, x, y);
          const column = Math.floor((x + glyphWidth / 2) / RADIUS);
          (buckets[column] ??= []).push({ char, width: glyphWidth, x, y });
          x += glyphWidth;
        }
        x += gap;
      }
      rows.push(buckets);
    }
    baseContext.globalAlpha = 1;
    field.setAttribute('data-rendered', '');
  };

  const scheduleLayout = () => {
    if (!layoutFrame && !document.hidden) layoutFrame = requestAnimationFrame(rebuild);
  };

  const stamp = (point: Point, now: number) => {
    const previous = lastStamp && now - lastStamp.time < TRAIL_MS ? lastStamp : undefined;
    const dx = point.x - (previous?.x ?? point.x);
    const dy = point.y - (previous?.y ?? point.y);
    const travel = Math.hypot(dx, dy);
    if (previous && travel < 6) return;
    const steps = Math.max(1, Math.min(60, Math.ceil(travel / 12)));
    for (let step = 1; step <= steps; step++) {
      const remaining = 1 - step / steps;
      trail.push({
        x: point.x - dx * remaining,
        y: point.y - dy * remaining,
        time: now - (now - (previous?.time ?? now)) * remaining,
      });
    }
    if (trail.length > 60) trail.splice(0, trail.length - 60);
    lastStamp = { ...point, time: now };
  };

  const paint = (now: number) => {
    frame = 0;
    const box = drift.getBoundingClientRect();
    if (queued) {
      stamp({ x: queued.x - box.left, y: queued.y - box.top }, now);
      queued = undefined;
    }
    while (trail.length && now - trail[0].time >= TRAIL_MS) trail.shift();
    const targets = new Map<Glyph, number>();
    for (const sample of trail) {
      const age = (now - sample.time) / TRAIL_MS;
      const firstRow = Math.max(0, Math.ceil((sample.y - RADIUS - lineHeight / 2) / rowStep));
      const lastRow = Math.min(rows.length - 1, Math.floor((sample.y + RADIUS - lineHeight / 2) / rowStep));
      const firstColumn = Math.max(0, Math.floor((sample.x - RADIUS) / RADIUS));
      const lastColumn = Math.floor((sample.x + RADIUS) / RADIUS);
      for (let row = firstRow; row <= lastRow; row++) {
        for (let column = firstColumn; column <= lastColumn; column++) {
          for (const glyph of rows[row][column] ?? []) {
            const distance = Math.hypot(glyph.x + glyph.width / 2 - sample.x, glyph.y + lineHeight / 2 - sample.y);
            if (distance >= RADIUS) continue;
            const intensity = (1 - distance / RADIUS) ** (1 + 5 * age) * (1 - age * age);
            if (intensity > (targets.get(glyph) ?? 0)) targets.set(glyph, intensity);
          }
        }
      }
    }

    const elapsed = lastFrame ? now - lastFrame : 1000 / 60;
    lastFrame = now;
    clearPixels();
    textAreas ??= measureText();
    for (const glyph of targets.keys()) if (!levels.has(glyph)) levels.set(glyph, 0);
    for (const [glyph, level] of levels) {
      const target = targets.get(glyph) ?? 0;
      const next = level + (target - level) * (1 - Math.exp(-elapsed / (target > level ? 50 : 90)));
      if (next < 0.001 && target === 0) {
        levels.delete(glyph);
        continue;
      }
      levels.set(glyph, next);

      // 每个字符各自计算和正文的距离，附近几枚字变淡，拖尾的其他部分照常显示。
      const x = box.left + glyph.x + glyph.width / 2;
      const y = box.top + glyph.y + lineHeight / 2;
      let distance = TEXT_EDGE;
      for (const area of textAreas) {
        const dx = Math.max(area.left - x, x - area.right, 0);
        const dy = Math.max(area.top - y, y - area.bottom, 0);
        if (dx < TEXT_EDGE && dy < TEXT_EDGE) distance = Math.min(distance, Math.hypot(dx, dy));
      }
      const edge = distance / TEXT_EDGE;
      context.globalAlpha = 0.92 * next * (0.1 + 0.9 * edge * edge * (3 - 2 * edge));
      context.fillText(glyph.char, glyph.x, glyph.y);
      const left = glyph.x - 4, top = glyph.y - 4;
      const right = glyph.x + glyph.width + 4, bottom = glyph.y + lineHeight + 4;
      if (!dirty) dirty = { left, top, right, bottom };
      else {
        dirty.left = Math.min(dirty.left, left);
        dirty.top = Math.min(dirty.top, top);
        dirty.right = Math.max(dirty.right, right);
        dirty.bottom = Math.max(dirty.bottom, bottom);
      }
    }
    if (trail.length || levels.size) frame = requestAnimationFrame(paint);
    else lastFrame = 0;
  };

  const invalidateText = () => { textAreas = undefined; };
  window.addEventListener('pointermove', event => {
    if (!hover.matches || document.hidden || event.pointerType !== 'mouse' || !rows.length) return;
    queued = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });
  window.addEventListener('pointerout', event => {
    if (!event.relatedTarget) queued = lastStamp = undefined;
  });
  window.addEventListener('blur', clearTrail);
  window.addEventListener('pagehide', clearTrail);
  window.addEventListener('resize', scheduleLayout);
  window.addEventListener('scroll', invalidateText, { passive: true });
  hover.addEventListener('change', clearTrail);
  document.addEventListener('visibilitychange', () => {
    field.toggleAttribute('data-paused', document.hidden);
    if (document.hidden) clearTrail();
    else scheduleLayout();
  });
  new ResizeObserver(scheduleLayout).observe(drift);
  new MutationObserver(scheduleLayout).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  if (main) {
    new ResizeObserver(invalidateText).observe(main);
    new MutationObserver(invalidateText).observe(main, { childList: true, subtree: true, characterData: true });
  }
  scheduleLayout();
  return clearTrail;
}, '[data-guestbook-words]');
