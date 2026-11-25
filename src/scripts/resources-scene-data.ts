import {
  CURVE_CONFIG,
  clamp,
  hingePoint,
  keyLightSlope,
  lerp,
  standingCharPos,
  stripRows,
  type CurveFrame,
  type ResourceBannerLayout,
  type ResourceCardLayout,
  type ResourceRenderState,
  type ResourceTitleLayout,
} from './resources-curve';
import { parseResourceDetail, type ResourceDetailSegment } from '../lib/resources-rich';

export type RGBA = [number, number, number, number];

export interface ResourcePalette {
  voidBg: RGBA;
  voidGrid: RGBA;
  voidMajor: RGBA;
  horizonHalo: RGBA;
  runwayBg: RGBA;
  runwayAlt: RGBA;
  runwayEdge: RGBA;
  runwayTick: RGBA;
  railInk: RGBA;
  cardBgCss: string;
  cardRaisedCss: string;
  cardBorderCss: string;
  cardEdge: RGBA;
  slabInkCss: string;
  slabMutedCss: string;
  cardAltBgCss: string;
  cardAltRaisedCss: string;
  cardAltBorderCss: string;
  cardAltEdge: RGBA;
  slabAltInkCss: string;
  slabAltMutedCss: string;
  cardInnerCss: string;
  cardInnerInkCss: string;
  cardInnerMutedCss: string;
  pillBgCss: string;
  pillFgCss: string;
  inkCss: string;
  mutedCss: string;
  accentCss: string;
  accentInkCss: string;
  sansFont: string;
  monoFont: string;
  pageBgRgb: [number, number, number];
  inkRgb: [number, number, number];
  mutedRgb: [number, number, number];
  themeKey: string;
}

const colorProbeCtx = typeof document !== 'undefined'
  ? document.createElement('canvas').getContext('2d')
  : null;

export function parseCssColor(raw: string, fallback: RGBA = [0, 0, 0, 1]): { rgba: RGBA; css: string } {
  const s = (raw || '').trim();
  if (!s) {
    return {
      rgba: fallback,
      css: `rgba(${Math.round(fallback[0] * 255)}, ${Math.round(fallback[1] * 255)}, ${Math.round(fallback[2] * 255)}, ${fallback[3]})`,
    };
  }
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (hex) {
    const h = hex[1];
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { rgba: [r, g, b, a], css: s };
  }
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/i.exec(s);
  if (srgb) {
    const r = clamp(Number(srgb[1]), 0, 1);
    const g = clamp(Number(srgb[2]), 0, 1);
    const b = clamp(Number(srgb[3]), 0, 1);
    const a = srgb[4] !== undefined ? clamp(Number(srgb[4]), 0, 1) : 1;
    return { rgba: [r, g, b, a], css: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})` };
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i.exec(s);
  if (rgb) {
    const r = clamp(Number(rgb[1]) / 255, 0, 1);
    const g = clamp(Number(rgb[2]) / 255, 0, 1);
    const b = clamp(Number(rgb[3]) / 255, 0, 1);
    const a = rgb[4] !== undefined ? clamp(Number(rgb[4]), 0, 1) : 1;
    return { rgba: [r, g, b, a], css: s };
  }
  if (colorProbeCtx) {
    colorProbeCtx.fillStyle = '#000000';
    colorProbeCtx.fillStyle = s;
    const norm = colorProbeCtx.fillStyle;
    if (norm !== '#000000' || s.toLowerCase() === 'black' || s === '#000') {
      return parseCssColor(norm, fallback);
    }
  }
  return { rgba: fallback, css: s };
}

export function readResourcePalette(styleHost: HTMLElement): ResourcePalette {
  const doc = styleHost.ownerDocument;
  const win = doc?.defaultView;
  const cs = win?.getComputedStyle?.(styleHost);
  const g = (name: string) => cs?.getPropertyValue(name).trim() || '';
  const isDark = doc?.documentElement?.classList.contains('dark') ?? false;
  const p = (name: string, fb: RGBA) => parseCssColor(g(name), fb);

  const voidBg = p('--res-void', [0, 0, 0, 1]);
  const voidGrid = p('--res-void-grid', [1, 1, 1, 0.1]);
  const voidMajor = p('--res-void-major', isDark ? [1, 0.48, 0, 0.22] : [1, 1, 1, 0.2]);
  const horizonHalo = p('--res-horizon-halo', isDark ? [1, 0.42, 0, 0.25] : [0.05, 0.41, 0.22, 0.28]);
  const runwayBg = p('--res-runway-bg', isDark ? [0.91, 0.36, 0, 1] : [0.05, 0.41, 0.22, 1]);
  const runwayAlt = p('--res-runway-alt', isDark ? [0.85, 0.33, 0, 1] : [0.04, 0.36, 0.19, 1]);
  const runwayEdge = p('--res-runway-edge', [1, 1, 1, 0.3]);
  const runwayTick = p('--res-runway-tick', [1, 1, 1, 0.45]);
  const railInk = p('--res-rail-ink', isDark ? [1, 1, 1, 1] : [0.04, 0.15, 0.09, 1]);
  const cardBg = p('--res-card-bg', isDark ? [0.11, 0.22, 0.77, 1] : [0.71, 0.92, 0.2, 1]);
  const cardRaised = p('--res-card-raised', isDark ? [0.16, 0.28, 0.88, 1] : [0.77, 0.95, 0.31, 1]);
  const cardBorder = p('--res-card-border', isDark ? [1, 1, 1, 0.36] : [0.04, 0.15, 0.09, 0.26]);
  const cardEdge = p('--res-card-edge', isDark ? [0.06, 0.13, 0.48, 1] : [0.43, 0.61, 0.06, 1]);
  const slabInk = p('--res-slab-ink', isDark ? [1, 1, 1, 1] : [0.04, 0.15, 0.09, 1]);
  const slabMuted = p('--res-slab-muted', isDark ? [0.86, 0.9, 1, 1] : [0.11, 0.26, 0.16, 1]);
  const cardAltBg = p('--res-card-alt-bg', isDark ? [1, 0.42, 0, 1] : [0.05, 0.41, 0.22, 1]);
  const cardAltRaised = p('--res-card-alt-raised', isDark ? [1, 0.5, 0.14, 1] : [0.07, 0.49, 0.27, 1]);
  const cardAltBorder = p('--res-card-alt-border', [1, 1, 1, 0.38]);
  const cardAltEdge = p('--res-card-alt-edge', isDark ? [0.7, 0.28, 0, 1] : [0.02, 0.24, 0.12, 1]);
  const slabAltInk = p('--res-slab-alt-ink', [1, 1, 1, 1]);
  const slabAltMuted = p('--res-slab-alt-muted', isDark ? [1, 0.94, 0.89, 1] : [0.9, 0.96, 0.93, 1]);
  const cardInner = p('--res-card-inner', isDark ? [0.08, 0.07, 0.06, 1] : [1, 1, 1, 1]);
  const cardInnerInk = p('--res-card-inner-ink', isDark ? [0.97, 0.95, 0.94, 1] : [0.07, 0.13, 0.09, 1]);
  const cardInnerMuted = p('--res-card-inner-muted', isDark ? [0.75, 0.71, 0.67, 1] : [0.29, 0.36, 0.32, 1]);
  const pillBg = p('--res-pill-bg', isDark ? [0.09, 0.05, 0.02, 0.9] : [0.02, 0.16, 0.09, 0.9]);
  const pillFg = p('--res-pill-fg', [1, 1, 1, 1]);
  const ink = p('--ink', isDark ? [0.93, 0.92, 0.9, 1] : [0.11, 0.14, 0.12, 1]);
  const muted = p('--muted', isDark ? [0.68, 0.65, 0.61, 1] : [0.36, 0.42, 0.38, 1]);
  const accent = p('--accent', isDark ? [1, 0.48, 0, 1] : [0.18, 0.49, 0.27, 1]);
  const accentInk = p('--accent-ink', isDark ? [1, 0.71, 0.44, 1] : [0.15, 0.42, 0.23, 1]);
  const paper = p('--paper', isDark ? [0.06, 0.06, 0.06, 1] : [0.97, 0.97, 0.95, 1]);

  return {
    voidBg: voidBg.rgba,
    voidGrid: voidGrid.rgba,
    voidMajor: voidMajor.rgba,
    horizonHalo: horizonHalo.rgba,
    runwayBg: runwayBg.rgba,
    runwayAlt: runwayAlt.rgba,
    runwayEdge: runwayEdge.rgba,
    runwayTick: runwayTick.rgba,
    railInk: railInk.rgba,
    cardBgCss: cardBg.css,
    cardRaisedCss: cardRaised.css,
    cardBorderCss: cardBorder.css,
    cardEdge: cardEdge.rgba,
    slabInkCss: slabInk.css,
    slabMutedCss: slabMuted.css,
    cardAltBgCss: cardAltBg.css,
    cardAltRaisedCss: cardAltRaised.css,
    cardAltBorderCss: cardAltBorder.css,
    cardAltEdge: cardAltEdge.rgba,
    slabAltInkCss: slabAltInk.css,
    slabAltMutedCss: slabAltMuted.css,
    cardInnerCss: cardInner.css,
    cardInnerInkCss: cardInnerInk.css,
    cardInnerMutedCss: cardInnerMuted.css,
    pillBgCss: pillBg.css,
    pillFgCss: pillFg.css,
    inkCss: ink.css,
    mutedCss: muted.css,
    accentCss: accent.css,
    accentInkCss: accentInk.css,
    sansFont: g('--f-sans') || 'system-ui, -apple-system, sans-serif',
    monoFont: g('--f-mono') || 'ui-monospace, monospace',
    pageBgRgb: [paper.rgba[0], paper.rgba[1], paper.rgba[2]],
    inkRgb: [ink.rgba[0], ink.rgba[1], ink.rgba[2]],
    mutedRgb: [muted.rgba[0], muted.rgba[1], muted.rgba[2]],
    themeKey: [isDark ? '1' : '0', cardBg.css, cardAltBg.css, cardInner.css, runwayBg.css, runwayAlt.css].join('|'),
  };
}

/** O(1) theme-slider preview palette updater using pre-mixed hex tokens (zero getComputedStyle reflow!). */
export function applyMixedOverridesToPalette(
  base: ResourcePalette,
  mixed: Record<string, string>,
): ResourcePalette {
  const m = (name: string, fb: RGBA) => {
    const raw = mixed[name];
    return raw ? parseCssColor(raw, fb) : { rgba: fb, css: '' };
  };
  const mCss = (name: string, fbCss: string, fbRgba: RGBA) => {
    const raw = mixed[name];
    return raw ? parseCssColor(raw, fbRgba) : { rgba: fbRgba, css: fbCss };
  };
  const voidBg = m('--res-void', base.voidBg);
  const voidGrid = m('--res-void-grid', base.voidGrid);
  const voidMajor = m('--res-void-major', base.voidMajor);
  const horizonHalo = m('--res-horizon-halo', base.horizonHalo);
  const runwayBg = m('--res-runway-bg', base.runwayBg);
  const runwayAlt = m('--res-runway-alt', base.runwayAlt);
  const runwayEdge = m('--res-runway-edge', base.runwayEdge);
  const runwayTick = m('--res-runway-tick', base.runwayTick);
  const railInk = m('--res-rail-ink', base.railInk);
  const cardBg = mCss('--res-card-bg', base.cardBgCss, [0.71, 0.92, 0.2, 1]);
  const cardRaised = mCss('--res-card-raised', base.cardRaisedCss, [0.77, 0.95, 0.31, 1]);
  const cardBorder = mCss('--res-card-border', base.cardBorderCss, [1, 1, 1, 0.4]);
  const cardEdge = m('--res-card-edge', base.cardEdge);
  const slabInk = mCss('--res-slab-ink', base.slabInkCss, [0.04, 0.15, 0.09, 1]);
  const slabMuted = mCss('--res-slab-muted', base.slabMutedCss, [0.11, 0.26, 0.16, 1]);
  const cardAltBg = mCss('--res-card-alt-bg', base.cardAltBgCss, [0.05, 0.41, 0.22, 1]);
  const cardAltRaised = mCss('--res-card-alt-raised', base.cardAltRaisedCss, [0.07, 0.49, 0.27, 1]);
  const cardAltBorder = mCss('--res-card-alt-border', base.cardAltBorderCss, [1, 1, 1, 0.4]);
  const cardAltEdge = m('--res-card-alt-edge', base.cardAltEdge);
  const slabAltInk = mCss('--res-slab-alt-ink', base.slabAltInkCss, [1, 1, 1, 1]);
  const slabAltMuted = mCss('--res-slab-alt-muted', base.slabAltMutedCss, [0.95, 0.96, 0.95, 1]);
  const cardInner = mCss('--res-card-inner', base.cardInnerCss, [1, 1, 1, 1]);
  const cardInnerInk = mCss('--res-card-inner-ink', base.cardInnerInkCss, [0.07, 0.13, 0.09, 1]);
  const cardInnerMuted = mCss('--res-card-inner-muted', base.cardInnerMutedCss, [0.29, 0.36, 0.32, 1]);
  const pillBg = mCss('--res-pill-bg', base.pillBgCss, [0.02, 0.16, 0.09, 0.9]);
  const pillFg = mCss('--res-pill-fg', base.pillFgCss, [1, 1, 1, 1]);
  const ink = mCss('--ink', base.inkCss, [...base.inkRgb, 1]);
  const muted = mCss('--muted', base.mutedCss, [...base.mutedRgb, 1]);
  const accent = mCss('--accent', base.accentCss, [0.18, 0.49, 0.27, 1]);
  const accentInk = mCss('--accent-ink', base.accentInkCss, [0.15, 0.42, 0.23, 1]);
  const paper = m('--paper', [...base.pageBgRgb, 1]);

  return {
    ...base,
    voidBg: voidBg.rgba,
    voidGrid: voidGrid.rgba,
    voidMajor: voidMajor.rgba,
    horizonHalo: horizonHalo.rgba,
    runwayBg: runwayBg.rgba,
    runwayAlt: runwayAlt.rgba,
    runwayEdge: runwayEdge.rgba,
    runwayTick: runwayTick.rgba,
    railInk: railInk.rgba,
    cardBgCss: cardBg.css,
    cardRaisedCss: cardRaised.css,
    cardBorderCss: cardBorder.css,
    cardEdge: cardEdge.rgba,
    slabInkCss: slabInk.css,
    slabMutedCss: slabMuted.css,
    cardAltBgCss: cardAltBg.css,
    cardAltRaisedCss: cardAltRaised.css,
    cardAltBorderCss: cardAltBorder.css,
    cardAltEdge: cardAltEdge.rgba,
    slabAltInkCss: slabAltInk.css,
    slabAltMutedCss: slabAltMuted.css,
    cardInnerCss: cardInner.css,
    cardInnerInkCss: cardInnerInk.css,
    cardInnerMutedCss: cardInnerMuted.css,
    pillBgCss: pillBg.css,
    pillFgCss: pillFg.css,
    inkCss: ink.css,
    mutedCss: muted.css,
    accentCss: accent.css,
    accentInkCss: accentInk.css,
    pageBgRgb: [paper.rgba[0], paper.rgba[1], paper.rgba[2]],
    inkRgb: [ink.rgba[0], ink.rgba[1], ink.rgba[2]],
    mutedRgb: [muted.rgba[0], muted.rgba[1], muted.rgba[2]],
    themeKey: ['P', cardBg.css, cardAltBg.css, cardInner.css, runwayBg.css, runwayAlt.css].join('|'),
  };
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(current);
      current = '';
      if (lines.length >= maxLines) break;
      continue;
    }
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
      if (lines.length >= maxLines) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : '…';
        return lines;
      }
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (!img.complete || img.naturalWidth <= 0) return;
  ctx.save();
  drawRoundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const srcRatio = img.naturalWidth / img.naturalHeight;
  const dstRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (srcRatio > dstRatio) {
    sw = sh * dstRatio;
    sx = (img.naturalWidth - sw) * 0.5;
  } else {
    sh = sw / dstRatio;
    sy = (img.naturalHeight - sh) * 0.5;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function drawContainImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): CardRect {
  if (!img.complete || img.naturalWidth <= 0 || w <= 2 || h <= 2) {
    return { x, y, w, h };
  }
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = x + (w - dw) * 0.5;
  const dy = y + (h - dh) * 0.5;
  ctx.save();
  drawRoundRect(ctx, dx, dy, dw, dh, r);
  ctx.clip();
  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, dx, dy, dw, dh);
  ctx.restore();
  return { x: dx, y: dy, w: dw, h: dh };
}

export interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardLinkHotspot {
  href: string;
  label: string;
  rect: CardRect;
}

export interface CardHotspots {
  cta: CardRect;
  copy: CardRect | null;
  inner: CardRect;
  detailLinks: CardLinkHotspot[];
}

function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    w += /[^\x00-\xff]/.test(ch) ? fontSize * 1.02 : fontSize * 0.6;
  }
  return w;
}

interface DetailLayoutRun {
  kind: 'text' | 'link';
  text: string;
  href?: string;
  x: number;
  w: number;
}

interface DetailLayoutLine {
  y: number;
  runs: DetailLayoutRun[];
}

interface DetailLayoutResult {
  lines: DetailLayoutLine[];
  links: CardLinkHotspot[];
  bottomY: number;
}

function makeDetailMeasurer(
  ctx: CanvasRenderingContext2D | null,
  fontFamily: string,
): (text: string, isLink: boolean) => number {
  const probe = ctx ?? colorProbeCtx;
  let canUseCanvas = false;
  if (probe) {
    try {
      probe.font = `400 16.5px ${fontFamily}`;
      canUseCanvas = probe.measureText('M').width > 0;
    } catch {
      canUseCanvas = false;
    }
  }
  if (!canUseCanvas || !probe) {
    return (text: string) => estimateTextWidth(text, 16.5);
  }
  return (text: string, isLink: boolean) => {
    probe.font = `${isLink ? 500 : 400} 16.5px ${fontFamily}`;
    return probe.measureText(text).width;
  };
}

function layoutRichDetailLines(
  segments: ResourceDetailSegment[],
  measure: (text: string, isLink: boolean) => number,
  startX: number,
  startY: number,
  maxWidth: number,
  maxLines: number,
  lineH: number,
): DetailLayoutResult {
  const safeMaxW = Math.max(60, maxWidth);
  const safeMaxL = Math.max(1, maxLines);
  const lines: DetailLayoutLine[] = [];
  let curRuns: DetailLayoutRun[] = [];
  let curX = 0;
  let truncated = false;

  const commitLine = () => {
    lines.push({ y: startY + lines.length * lineH, runs: curRuns });
    curRuns = [];
    curX = 0;
  };

  const appendCharToRun = (kind: 'text' | 'link', ch: string, chW: number, href?: string) => {
    const prev = curRuns[curRuns.length - 1];
    if (prev && prev.kind === kind && prev.href === href) {
      prev.text += ch;
      prev.w = measure(prev.text, kind === 'link');
      curX = prev.x - startX + prev.w;
    } else {
      curRuns.push({ kind, text: ch, href, x: startX + curX, w: chW });
      curX += chW;
    }
  };

  for (const seg of segments) {
    if (truncated) break;
    const text = seg.kind === 'link' ? seg.label : seg.text;
    const href = seg.kind === 'link' ? seg.href : undefined;
    for (const ch of text) {
      if (ch === '\n') {
        commitLine();
        if (lines.length >= safeMaxL) {
          truncated = true;
          break;
        }
        continue;
      }
      const prev = curRuns[curRuns.length - 1];
      let nextLineW: number;
      let chW: number;
      if (prev && prev.kind === seg.kind && prev.href === href) {
        const grown = measure(prev.text + ch, seg.kind === 'link');
        chW = Math.max(0, grown - prev.w);
        nextLineW = (prev.x - startX) + grown;
      } else {
        chW = measure(ch, seg.kind === 'link');
        nextLineW = curX + chW;
      }

      if (nextLineW > safeMaxW && curRuns.length > 0) {
        commitLine();
        if (lines.length >= safeMaxL) {
          const lastLine = lines[safeMaxL - 1];
          const lastRun = lastLine?.runs[lastLine.runs.length - 1];
          if (lastRun && lastRun.text.length > 1) {
            lastRun.text = `${lastRun.text.slice(0, -1)}…`;
            lastRun.w = measure(lastRun.text, lastRun.kind === 'link');
          }
          truncated = true;
          break;
        }
        const freshW = measure(ch, seg.kind === 'link');
        appendCharToRun(seg.kind, ch, freshW, href);
      } else {
        appendCharToRun(seg.kind, ch, chW, href);
      }
    }
  }

  if (!truncated && curRuns.length > 0 && lines.length < safeMaxL) {
    commitLine();
  }

  const links: CardLinkHotspot[] = [];
  for (const line of lines) {
    for (const run of line.runs) {
      if (run.kind === 'link' && run.href && run.w > 0) {
        links.push({
          href: run.href,
          label: run.text,
          rect: { x: run.x, y: line.y - 2, w: run.w, h: lineH },
        });
      }
    }
  }

  return {
    lines,
    links,
    bottomY: startY + lines.length * lineH,
  };
}

function computeDetailStageMetrics(
  card: ResourceCardLayout,
  inner: CardRect,
  hasCover: boolean,
  hasContentImgs: boolean,
) {
  const inPad = 24;
  const bodyTop = inner.y + 52;
  const tagsReserve = card.tags.length > 0 ? 50 : 20;
  const bodyBottom = inner.y + inner.h - tagsReserve;
  const availBodyH = Math.max(52, bodyBottom - bodyTop);
  let contentMaxW = inner.w - inPad * 2;
  let coverRect: CardRect | null = null;
  if (hasCover) {
    const imgW = Math.min(card.wide ? 280 : 180, Math.round(inner.w * 0.34));
    const imgH = Math.max(96, Math.min(180, inner.h - 96));
    coverRect = { x: inner.x + inner.w - inPad - imgW, y: bodyTop, w: imgW, h: imgH };
    contentMaxW -= imgW + 24;
  }
  const dLineH = hasContentImgs ? 25 : 28;
  const galleryReserve = hasContentImgs ? clamp(Math.round(availBodyH * 0.62), 140, 380) : 0;
  const textMaxH = hasContentImgs ? Math.max(dLineH * 2, availBodyH - galleryReserve - 10) : availBodyH;
  const maxLines = Math.max(2, Math.floor(textMaxH / dLineH));
  return { inPad, bodyTop, bodyBottom, contentMaxW, coverRect, dLineH, galleryReserve, maxLines };
}

export function computeCardHotspots(
  card: ResourceCardLayout,
  fontFamily = 'system-ui, -apple-system, sans-serif',
  measureCtx: CanvasRenderingContext2D | null = null,
): CardHotspots {
  const cw = Math.max(240, Math.round(card.width));
  const ch = Math.max(220, Math.round(card.height));
  const padX = 35;
  const barY = 144;
  const barH = 38;

  const ctaLabel = `${card.cta || '前往获取'} ↗`;
  const maxBarW = Math.max(120, cw - padX * 2);
  const ctaW = Math.min(maxBarW, Math.max(116, Math.ceil(estimateTextWidth(ctaLabel, 15)) + 34));
  const cta: CardRect = { x: padX, y: barY, w: ctaW, h: barH };

  let copy: CardRect | null = null;
  if (card.code) {
    const copyLabel = `提取码 ${card.code} · 复制`;
    const avail = cw - padX * 2 - ctaW - 14;
    if (avail >= 110) {
      const copyW = Math.min(avail, Math.max(146, Math.ceil(estimateTextWidth(copyLabel, 13.5)) + 28));
      copy = { x: padX + ctaW + 14, y: barY + 1, w: copyW, h: barH - 2 };
    }
  }

  const innerY = barY + barH + 18;
  const innerH = Math.max(96, ch - innerY - 24);
  const innerW = Math.max(160, cw - padX * 2);
  const inner: CardRect = { x: padX, y: innerY, w: innerW, h: innerH };

  const parsed = parseResourceDetail(card.detail || card.summary);
  const hasContentImgs = (card.images?.length ?? 0) > 0 || parsed.inlineImages.length > 0;
  const m = computeDetailStageMetrics(card, inner, Boolean(card.coverUrl), hasContentImgs);
  const measure = makeDetailMeasurer(measureCtx, fontFamily);
  const detailLayout = layoutRichDetailLines(
    parsed.segments,
    measure,
    inner.x + m.inPad,
    m.bodyTop,
    m.contentMaxW,
    m.maxLines,
    m.dLineH,
  );

  return { cta, copy, inner, detailLinks: detailLayout.links };
}

/** Paint Shopify-style large emerald/orange card matching 2D DOM card 1:1.
 *  When `raised` is true, full interactive details & action pills sit directly on the tilted 3D slab (no close button; outer border clicks lower it). */
export function paintCardCanvas(
  canvas: HTMLCanvasElement,
  card: ResourceCardLayout,
  pal: ResourcePalette,
  raised: boolean,
  dpr: number,
  coverImg: HTMLImageElement | null,
  copied = false,
  contentImgs: (HTMLImageElement | null)[] = [],
) {
  const scale = clamp(dpr, 1.5, 2.25);
  const cw = Math.max(240, Math.round(card.width));
  const ch = Math.max(220, Math.round(card.height));
  canvas.width = Math.round(cw * scale);
  canvas.height = Math.round(ch * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  const isAltBand = card.groupIdx % 2 === 1;
  const slabBg = isAltBand
    ? (raised ? pal.cardAltRaisedCss : pal.cardAltBgCss)
    : (raised ? pal.cardRaisedCss : pal.cardBgCss);
  const slabInk = isAltBand ? pal.slabAltInkCss : pal.slabInkCss;
  const slabMuted = isAltBand ? pal.slabAltMutedCss : pal.slabMutedCss;
  const slabBorder = isAltBand ? pal.cardAltBorderCss : pal.cardBorderCss;

  // Outer slab body + hairline border
  drawRoundRect(ctx, 1, 1, cw - 2, ch - 2, 14);
  ctx.fillStyle = slabBg;
  ctx.fill();
  ctx.lineWidth = raised ? 2.4 : 1.5;
  ctx.strokeStyle = raised ? slabInk : slabBorder;
  ctx.stroke();

  const padX = 35;
  const topY = 32;
  const spots = computeCardHotspots(card, pal.sansFont, ctx);

  // Title (no 收起 button; outer colored frame around the inner panel lowers the slab)
  ctx.font = `700 32px ${pal.sansFont}`;
  ctx.fillStyle = slabInk;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const titleLines = wrapLines(ctx, card.name, cw - padX * 2, 1);
  ctx.fillText(titleLines[0] || card.name, padX, topY);

  let curY = topY + 44;
  ctx.font = `400 17px ${pal.sansFont}`;
  ctx.fillStyle = slabMuted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const sumLines = wrapLines(ctx, card.summary, cw - padX * 2, 2);
  for (const line of sumLines) {
    ctx.fillText(line, padX, curY);
    curY += 26;
  }

  // Action pill bar matching 2D DOM order: CTA -> Copy Code -> Badge
  const ctaLabel = raised ? `${card.cta || '前往获取'} ↗` : (card.cta || '前往获取');
  drawRoundRect(ctx, spots.cta.x, spots.cta.y, spots.cta.w, spots.cta.h, spots.cta.h * 0.5);
  ctx.fillStyle = pal.pillBgCss;
  ctx.fill();
  if (raised) {
    ctx.strokeStyle = slabInk;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.font = `600 14.5px ${pal.sansFont}`;
  ctx.fillStyle = pal.pillFgCss;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(ctaLabel, spots.cta.x + spots.cta.w * 0.5, spots.cta.y + spots.cta.h * 0.5, spots.cta.w - 18);

  let nextPillX = spots.cta.x + spots.cta.w + 14;
  if (spots.copy && card.code) {
    const codeLabel = copied ? '已复制 ✓' : `提取码 ${card.code} · 复制`;
    drawRoundRect(ctx, spots.copy.x, spots.copy.y, spots.copy.w, spots.copy.h, spots.copy.h * 0.5);
    ctx.fillStyle = raised ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = raised ? slabInk : slabBorder;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.font = `600 13.5px ${pal.monoFont}`;
    ctx.fillStyle = slabInk;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(codeLabel, spots.copy.x + spots.copy.w * 0.5, spots.copy.y + spots.copy.h * 0.5, spots.copy.w - 16);
    nextPillX = spots.copy.x + spots.copy.w + 14;
  }

  if (card.badge) {
    ctx.font = `600 13px ${pal.monoFont}`;
    const bw = Math.min(cw - nextPillX - padX, Math.ceil(ctx.measureText(card.badge).width) + 24);
    if (bw > 44) {
      drawRoundRect(ctx, nextPillX, spots.cta.y + 3, bw, spots.cta.h - 6, 16);
      ctx.strokeStyle = slabBorder;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = slabInk;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(card.badge, nextPillX + bw * 0.5, spots.cta.y + spots.cta.h * 0.5, bw - 14);
    }
  }

  // Inner high-contrast showcase card window (1:1 parity with 2D .res-card-stage)
  const { x: innerX, y: innerY, w: innerW, h: innerH } = spots.inner;
  if (innerH >= 96 && innerW >= 160) {
    drawRoundRect(ctx, innerX, innerY, innerW, innerH, 12);
    ctx.fillStyle = pal.cardInnerCss;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const inPad = 24;
    const barY = innerY + 24;
    ctx.font = `600 13.5px ${pal.monoFont}`;
    ctx.fillStyle = pal.cardInnerMutedCss;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let hostLabel = card.href;
    try {
      if (/^https?:/i.test(card.href)) hostLabel = new URL(card.href).hostname;
    } catch {
      hostLabel = card.href;
    }
    ctx.fillText(hostLabel, innerX + inPad, barY, innerW - inPad * 2 - 80);

    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(innerX + innerW - inPad - i * 16, barY, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? pal.accentCss : pal.cardInnerMutedCss;
      ctx.globalAlpha = i === 0 ? 0.92 : 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const coverReady = !!(coverImg && coverImg.complete && coverImg.naturalWidth > 0);
    const parsed = parseResourceDetail(card.detail || card.summary);
    const imgSlotCount = Math.min(4, Math.max(contentImgs.length, card.images?.length ?? 0));
    const hasContentImgs = imgSlotCount > 0;
    const m = computeDetailStageMetrics(card, spots.inner, Boolean(card.coverUrl), hasContentImgs);

    if (coverImg && coverReady && m.coverRect) {
      drawCoverImage(ctx, coverImg, m.coverRect.x, m.coverRect.y, m.coverRect.w, m.coverRect.h, 8);
    }

    // Rich detail text with highlighted & underlined clickable links
    const measure = makeDetailMeasurer(ctx, pal.sansFont);
    const detailLayout = layoutRichDetailLines(
      parsed.segments,
      measure,
      innerX + m.inPad,
      m.bodyTop,
      m.contentMaxW,
      m.maxLines,
      m.dLineH,
    );
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (const line of detailLayout.lines) {
      for (const run of line.runs) {
        if (run.kind === 'link') {
          ctx.font = `500 16.5px ${pal.sansFont}`;
          ctx.fillStyle = pal.accentInkCss;
          ctx.fillText(run.text, run.x, line.y);
          ctx.fillRect(run.x, line.y + 19.5, run.w, 1.5);
        } else {
          ctx.font = `400 16.5px ${pal.sansFont}`;
          ctx.fillStyle = pal.cardInnerInkCss;
          ctx.fillText(run.text, run.x, line.y);
        }
      }
    }

    // Module content images strip (up to 4 uploaded/linked images inside .res-card-stage, rendered uncropped!)
    if (hasContentImgs) {
      const galleryY = Math.max(detailLayout.bottomY + 12, m.bodyTop + 36);
      const galleryH = Math.max(64, m.bodyBottom - galleryY - 4);
      if (galleryH >= 64) {
        const gap = 12;
        const colW = (m.contentMaxW - gap * (imgSlotCount - 1)) / imgSlotCount;
        for (let i = 0; i < imgSlotCount; i++) {
          const ix = innerX + m.inPad + i * (colW + gap);
          const im = contentImgs[i];
          if (im && im.complete && im.naturalWidth > 0) {
            const drawn = drawContainImage(ctx, im, ix, galleryY, colW, galleryH, 8);
            drawRoundRect(ctx, drawn.x + 0.5, drawn.y + 0.5, drawn.w - 1, drawn.h - 1, 8);
            ctx.strokeStyle = 'rgba(128,128,128,0.28)';
            ctx.lineWidth = 1;
            ctx.stroke();
          } else {
            drawRoundRect(ctx, ix, galleryY, colW, galleryH, 8);
            ctx.fillStyle = pal.accentCss;
            ctx.globalAlpha = 0.08;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(128,128,128,0.18)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
    }

    if (card.tags.length > 0 && innerH >= 110) {
      let tx = innerX + inPad;
      const ty = innerY + innerH - 44;
      ctx.font = `600 12px ${pal.monoFont}`;
      ctx.textBaseline = 'middle';
      for (const tag of card.tags.slice(0, 4)) {
        const tw = Math.ceil(ctx.measureText(tag).width) + 20;
        if (tx + tw > innerX + inPad + m.contentMaxW) break;
        drawRoundRect(ctx, tx, ty, tw, 26, 6);
        ctx.fillStyle = pal.accentCss;
        ctx.globalAlpha = 0.14;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal.accentInkCss;
        ctx.textAlign = 'center';
        ctx.fillText(tag, tx + tw * 0.5, ty + 13);
        tx += tw + 8;
      }
    }
  }
}

export function paintBannerCanvas(
  canvas: HTMLCanvasElement,
  b: ResourceBannerLayout,
  pal: ResourcePalette,
  dpr: number,
) {
  const scale = clamp(dpr, 1.5, 2.25);
  const bw = Math.max(16, Math.round(b.width));
  const bh = Math.max(16, Math.round(b.height));
  canvas.width = Math.round(bw * scale);
  canvas.height = Math.round(bh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Render in pure white so the GPU vertex tint smoothly lerps 2D muted color -> 3D crisp white at exact DOM coordinates
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  if (b.items && b.items.length > 0) {
    for (const item of b.items) {
      if (!item.text) continue;
      ctx.font = `${item.fontWeight} ${item.fontSize}px ${item.fontFamily}`;
      const maxW = Math.max(40, item.width > 0 ? item.width + 6 : bw - item.x);
      const lineH = item.lineHeight > 0 ? item.lineHeight : Math.round(item.fontSize * 1.65);
      const lines = wrapLines(ctx, item.text, maxW, 3);
      lines.forEach((line, idx) => {
        ctx.fillText(line, item.x, item.y + lineH * 0.5 + idx * lineH);
      });
    }
    return;
  }

  ctx.textBaseline = 'top';
  if (b.kind === 'hero' && b.note) {
    ctx.font = `400 16px ${pal.sansFont}`;
    const lines = wrapLines(ctx, b.note, bw - 20, 2);
    lines.forEach((line, idx) => ctx.fillText(line, 0, idx * 24));
  } else if (b.note) {
    ctx.font = `400 16px ${pal.sansFont}`;
    ctx.fillText(b.note, 0, 0, bw);
  }
}

const MS_TABLE: readonly (readonly number[])[] = [
  [],
  [3, 2],
  [2, 1],
  [3, 1],
  [0, 1],
  [0, 3, 2, 1],
  [0, 2],
  [0, 3],
  [3, 0],
  [2, 0],
  [3, 2, 0, 1],
  [1, 0],
  [1, 3],
  [1, 2],
  [2, 3],
  [],
];

/** Extracts continuous Marching Squares outline segments in local glyph space for watertight 3D side walls. */
export function extractGlyphOutlineSegments(
  alphaData: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  pxSlotX: number,
  pxSlotW: number,
  pxCellH: number,
  localW: number,
  loY: number,
  hiY: number,
  threshold = 115,
): Float32Array {
  const step = Math.max(1, Math.round(Math.max(pxSlotW, pxCellH) / 64));
  const gw = Math.max(2, Math.floor(pxSlotW / step));
  const gh = Math.max(2, Math.floor(pxCellH / step));
  const grid = new Uint8Array((gw + 1) * (gh + 1));

  for (let gy = 0; gy <= gh; gy++) {
    const py = gy * step;
    for (let gx = 0; gx <= gw; gx++) {
      const px = gx * step;
      if (gx === 0 || gy === 0 || gx === gw || gy === gh || px >= pxSlotW || py >= pxCellH) {
        grid[gy * (gw + 1) + gx] = 0;
        continue;
      }
      const ax = Math.min(imgW - 1, pxSlotX + px);
      const ay = Math.min(imgH - 1, py);
      grid[gy * (gw + 1) + gx] = alphaData[(ay * imgW + ax) * 4 + 3];
    }
  }

  const out: number[] = [];
  const halfW = localW * 0.5;
  const spanY = hiY - loY;
  const interp = (va: number, vb: number) => {
    const d = vb - va;
    return Math.abs(d) < 1e-4 ? 0.5 : clamp((threshold - va) / d, 0, 1);
  };
  const edgePt = (e: number, gx: number, gy: number, a00: number, a10: number, a11: number, a01: number): [number, number] => {
    let fx = gx;
    let fy = gy;
    if (e === 0) {
      fx = gx + interp(a00, a10);
    } else if (e === 1) {
      fx = gx + 1;
      fy = gy + interp(a10, a11);
    } else if (e === 2) {
      fx = gx + interp(a01, a11);
      fy = gy + 1;
    } else {
      fy = gy + interp(a00, a01);
    }
    const lx = ((fx * step) / pxSlotW) * localW - halfW;
    const ly = hiY - ((fy * step) / pxCellH) * spanY;
    return [lx, ly];
  };

  for (let gy = 0; gy < gh; gy++) {
    const row0 = gy * (gw + 1);
    const row1 = (gy + 1) * (gw + 1);
    for (let gx = 0; gx < gw; gx++) {
      const a00 = grid[row0 + gx];
      const a10 = grid[row0 + gx + 1];
      const a11 = grid[row1 + gx + 1];
      const a01 = grid[row1 + gx];
      const mask = (a00 >= threshold ? 8 : 0) | (a10 >= threshold ? 4 : 0) | (a11 >= threshold ? 2 : 0) | (a01 >= threshold ? 1 : 0);
      const edges = MS_TABLE[mask];
      if (!edges.length) continue;
      for (let k = 0; k < edges.length; k += 2) {
        const p0 = edgePt(edges[k], gx, gy, a00, a10, a11, a01);
        const p1 = edgePt(edges[k + 1], gx, gy, a00, a10, a11, a01);
        out.push(p0[0], p0[1], p1[0], p1[1]);
      }
    }
  }
  return new Float32Array(out);
}

export interface GlyphRun {
  tex: WebGLTexture | null;
  gpuTexKey: string;
  chars: { ch: string; cx: number; w: number; h: number; boxH: number; u0: number; u1: number; wallSegments: Float32Array }[];
  totalHeight: number;
}

export function buildTitleGlyphRun(
  canvas: HTMLCanvasElement,
  title: ResourceTitleLayout,
  dpr: number,
): GlyphRun['chars'] {
  const scale = clamp(dpr * 1.3, 2, 2.6);
  const fSize = Math.max(16, title.fontSize);
  const fWeight = title.fontWeight || '700';
  const measureCtx = canvas.getContext('2d')!;
  const fontStr = `${fWeight} ${fSize}px ${title.fontFamily}`;
  measureCtx.font = fontStr;

  const chars = [...title.text];
  const boxH = Math.max(fSize * 1.04, title.docBottom - title.docTop);
  const cellPad = Math.ceil(fSize * 0.24);
  const cellW = Math.ceil(fSize * 1.18) + cellPad * 2;
  const cellH = Math.ceil(boxH * 1.32);

  const pxW = Math.max(1, Math.round(chars.length * cellW * scale));
  const pxH = Math.max(1, Math.round(cellH * scale));
  canvas.width = pxW;
  canvas.height = pxH;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.font = fontStr;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!/\s/.test(ch)) {
      ctx.fillText(ch, i * cellW + cellW * 0.5, cellH * 0.5);
    }
  }

  let imgData: Uint8ClampedArray | null = null;
  try {
    imgData = ctx.getImageData(0, 0, pxW, pxH).data;
  } catch {
    imgData = null;
  }

  const loY = boxH * 0.5 - cellH * 0.5;
  const hiY = boxH * 0.5 + cellH * 0.5;
  const pxSlotW = Math.max(1, Math.round(cellW * scale));

  const metrics: GlyphRun['chars'] = [];
  let cursorX = title.x0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const adv = Math.max(fSize * 0.28, ctx.measureText(ch).width);
    const cx = title.charCenters?.[i] ?? (cursorX + adv * 0.5);
    const wallSegments = imgData && !/\s/.test(ch)
      ? extractGlyphOutlineSegments(imgData, pxW, pxH, Math.round(i * cellW * scale), pxSlotW, pxH, cellW, loY, hiY, 115)
      : new Float32Array(0);
    metrics.push({
      ch,
      cx,
      w: cellW,
      h: cellH,
      boxH,
      u0: i / chars.length,
      u1: (i + 1) / chars.length,
      wallSegments,
    });
    cursorX += adv;
  }
  return metrics;
}

export interface VertexSink {
  pushQuad(
    a: [number, number, number, number, number],
    b: [number, number, number, number, number],
    c: [number, number, number, number, number],
    d: [number, number, number, number, number],
    col: RGBA,
    mode: number,
  ): void;
}

/** Populate full-width (0..W) Shopify curved paper ribbon stopping cleanly at `paperEndDocY` (before the idle game zone in the grid void!). */
export function emitFullWidthRunway(
  sink: VertexSink,
  frame: CurveFrame,
  scrollY: number,
  bands: { docTop: number; docBottom: number; alt: boolean }[],
  pal: ResourcePalette,
  dimMul: number,
  paperEndDocY = Infinity,
) {
  const docToRow = (y: number) => y - scrollY + frame.lead;
  const maxRow = Number.isFinite(paperEndDocY) ? clamp(docToRow(paperEndDocY), 0, frame.T) : frame.T;
  if (maxRow <= 0.5) return;

  const lerpFlat = (c: RGBA): RGBA => [
    lerp(pal.pageBgRgb[0], c[0], frame.fade) * dimMul,
    lerp(pal.pageBgRgb[1], c[1], frame.fade) * dimMul,
    lerp(pal.pageBgRgb[2], c[2], frame.fade) * dimMul,
    1,
  ];

  const sorted = bands
    .map((b) => ({ r0: clamp(docToRow(b.docTop), 0, maxRow), r1: clamp(docToRow(b.docBottom), 0, maxRow), alt: b.alt }))
    .filter((b) => b.r1 > b.r0 + 0.5)
    .sort((a, b) => a.r0 - b.r0);

  const emitStrip = (r0: number, r1: number, col: RGBA) => {
    if (r1 <= r0 + 0.5) return;
    const rows = stripRows(frame, r0, r1);
    for (let i = 0; i + 1 < rows.length; i++) {
      const y0 = rows[i];
      const y1 = rows[i + 1];
      sink.pushQuad(
        [0, y0, 0.0, 0, 0],
        [frame.W, y0, 0.0, 1, 0],
        [frame.W, y1, 0.0, 1, 1],
        [0, y1, 0.0, 0, 1],
        col,
        0,
      );
    }
  };

  let cursor = 0;
  for (const band of sorted) {
    if (band.r0 > cursor + 0.5) emitStrip(cursor, band.r0, lerpFlat(pal.runwayBg));
    emitStrip(band.r0, band.r1, lerpFlat(band.alt ? pal.runwayAlt : pal.runwayBg));
    cursor = Math.max(cursor, band.r1);
  }
  if (cursor < maxRow - 0.5) emitStrip(cursor, maxRow, lerpFlat(pal.runwayBg));
}

export function emitEdgeRailsAndTicks(
  sink: VertexSink,
  frame: CurveFrame,
  scrollY: number,
  pal: ResourcePalette,
  dimMul: number,
  paperEndDocY = Infinity,
) {
  if (frame.fade <= 0.01) return;
  const docToRow = (y: number) => y - scrollY + frame.lead;
  const maxRow = Number.isFinite(paperEndDocY) ? clamp(docToRow(paperEndDocY), 0, frame.T) : frame.T;
  if (maxRow <= 0.5) return;

  const rows = stripRows(frame, 0, maxRow);
  const railColor: RGBA = [pal.runwayEdge[0] * dimMul, pal.runwayEdge[1] * dimMul, pal.runwayEdge[2] * dimMul, pal.runwayEdge[3] * frame.fade];
  for (let i = 0; i + 1 < rows.length; i++) {
    const y0 = rows[i];
    const y1 = rows[i + 1];
    sink.pushQuad([0, y0, 0.8, 0, 0], [3.5, y0, 0.8, 1, 0], [3.5, y1, 0.8, 1, 1], [0, y1, 0.8, 0, 1], railColor, 0);
    sink.pushQuad([frame.W - 3.5, y0, 0.8, 0, 0], [frame.W, y0, 0.8, 1, 0], [frame.W, y1, 0.8, 1, 1], [frame.W - 3.5, y1, 0.8, 0, 1], railColor, 0);
  }

  // Crisp bottom paper edge hairline matching Shopify's page bottom boundary (图一!)
  if (Number.isFinite(paperEndDocY) && maxRow > 2 && maxRow < frame.T - 2) {
    sink.pushQuad([0, maxRow - 2.5, 0.8, 0, 0], [frame.W, maxRow - 2.5, 0.8, 1, 0], [frame.W, maxRow, 0.8, 1, 1], [0, maxRow, 0.8, 0, 1], railColor, 0);
  }

  const tickColor: RGBA = [pal.runwayTick[0] * dimMul, pal.runwayTick[1] * dimMul, pal.runwayTick[2] * dimMul, pal.runwayTick[3] * frame.rise];
  const step = 450;
  const firstTick = Math.ceil(-scrollY / step) * step;
  for (let docTick = firstTick; docToRow(docTick) < maxRow; docTick += step) {
    const row = docToRow(docTick);
    if (row < 20 || row > maxRow - 12) continue;
    sink.pushQuad([-34, row - 1.3, 0.8, 0, 0], [0, row - 1.3, 0.8, 1, 0], [0, row + 1.3, 0.8, 1, 1], [-34, row + 1.3, 0.8, 0, 1], tickColor, 0);
    sink.pushQuad([frame.W, row - 1.3, 0.8, 0, 0], [frame.W + 34, row - 1.3, 0.8, 1, 0], [frame.W + 34, row + 1.3, 0.8, 1, 1], [frame.W, row + 1.3, 0.8, 0, 1], tickColor, 0);
  }
}

export function emitRoundedSlabWalls(
  sink: VertexSink,
  x0: number,
  x1: number,
  r0: number,
  r1: number,
  elev: number,
  tiltRad: number,
  wallBase: RGBA,
  dimMul: number,
  mode = 0,
) {
  if (elev <= 0.1) return;
  const w = x1 - x0;
  const h = r1 - r0;
  const rad = Math.min(14, w * 0.25, h * 0.25);
  const cornerSteps = 4;
  const hingeStrips = 8;

  const sampleAlong = (along: number) => {
    const dEdge = Math.max(0, rad - Math.min(along, h - along));
    const inset = dEdge > 0 ? rad - Math.sqrt(Math.max(0, rad * rad - dEdge * dEdge)) : 0;
    return [x0 + inset, x1 - inset];
  };

  const yStops: number[] = [];
  if (rad > 0.5) {
    for (let i = 0; i <= cornerSteps; i++) yStops.push((rad * i) / cornerSteps);
    for (let i = 1; i < hingeStrips; i++) yStops.push(rad + ((h - 2 * rad) * i) / hingeStrips);
    for (let i = cornerSteps; i >= 0; i--) yStops.push(h - (rad * i) / cornerSteps);
  } else {
    for (let i = 0; i <= hingeStrips; i++) yStops.push((h * i) / hingeStrips);
  }

  const ptsAlong = yStops.map((along) => {
    const [lx, rx] = sampleAlong(along);
    return { along, lx, rx };
  });

  const ring: [number, number][] = [
    ...ptsAlong.map((p): [number, number] => [p.lx, p.along]).reverse(),
    ...ptsAlong.map((p): [number, number] => [p.rx, p.along]),
  ];
  ring.push(ring[0]);

  const toPos = (col: number, along: number, z: number): [number, number, number] =>
    tiltRad > 0.002 ? hingePoint(col, along, z, r1, 0, tiltRad) : [col, r1 - along, z];

  for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, aa] = ring[i];
    const [bx, ba] = ring[i + 1];
    const dx = bx - ax;
    const da = ba - aa;
    if (Math.hypot(dx, da) < 0.05) continue;

    let shade = 0.85;
    if (Math.abs(dx) >= Math.abs(da)) shade = aa < h * 0.5 ? 1.15 : 0.65;
    else shade = ax < (x0 + x1) * 0.5 ? 0.96 : 0.72;

    const c: RGBA = [
      clamp(wallBase[0] * shade * dimMul, 0, 1),
      clamp(wallBase[1] * shade * dimMul, 0, 1),
      clamp(wallBase[2] * shade * dimMul, 0, 1),
      wallBase[3],
    ];
    const p0 = toPos(ax, aa, 0);
    const p1 = toPos(bx, ba, 0);
    const p2 = toPos(bx, ba, elev);
    const p3 = toPos(ax, aa, elev);
    sink.pushQuad([p0[0], p0[1], p0[2], 0, 0], [p1[0], p1[1], p1[2], 1, 0], [p2[0], p2[1], p2[2], 1, 1], [p3[0], p3[1], p3[2], 0, 1], c, mode);
  }
}

export function emitCardTopFace(
  sink: VertexSink,
  frame: CurveFrame,
  x0: number,
  x1: number,
  r0: number,
  r1: number,
  elev: number,
  tiltRad: number,
  tint: RGBA,
  mode = 1,
) {
  if (tiltRad <= 0.002) {
    const rows = stripRows(frame, r0, r1);
    const span = r1 - r0;
    for (let i = 0; i + 1 < rows.length; i++) {
      const y0 = rows[i];
      const y1 = rows[i + 1];
      sink.pushQuad(
        [x0, y0, elev, 0, (y0 - r0) / span],
        [x1, y0, elev, 1, (y0 - r0) / span],
        [x1, y1, elev, 1, (y1 - r0) / span],
        [x0, y1, elev, 0, (y1 - r0) / span],
        tint,
        mode,
      );
    }
    return;
  }
  const h = r1 - r0;
  const strips = 8;
  for (let i = 0; i < strips; i++) {
    const a0 = (h * i) / strips;
    const a1 = (h * (i + 1)) / strips;
    const v0 = 1 - a0 / h;
    const v1 = 1 - a1 / h;
    const lb = hingePoint(x0, a0, elev, r1, 0, tiltRad);
    const rb = hingePoint(x1, a0, elev, r1, 0, tiltRad);
    const rt = hingePoint(x1, a1, elev, r1, 0, tiltRad);
    const lt = hingePoint(x0, a1, elev, r1, 0, tiltRad);
    sink.pushQuad([lt[0], lt[1], lt[2], 0, v1], [rt[0], rt[1], rt[2], 1, v1], [rb[0], rb[1], rb[2], 1, v0], [lb[0], lb[1], lb[2], 0, v0], tint, mode);
  }
}

/** Emits watertight, pure flat light-grey 3D side walls from Marching Squares glyph contours (scales cleanly 1x -> titleScale3D with rise). */
export function emitStandingTitleWalls(
  sink: VertexSink,
  chars: GlyphRun['chars'],
  anchorX: number,
  baseRow: number,
  standRad: number,
  floatPx: number,
  angles: Float32Array | undefined,
  rise = 1,
) {
  if (rise <= 0.02) return;
  const r = clamp(rise, 0, 1);
  const titleScale = lerp(1, CURVE_CONFIG.titleScale3D, r);
  const thick = 20 * r;
  const sideGray = 0.72;
  const sideCol: RGBA = [sideGray, sideGray, sideGray, 1];

  for (let i = 0; i < chars.length; i++) {
    const g = chars[i];
    if (/\s/.test(g.ch) || g.wallSegments.length < 4) continue;
    const turn = angles?.[i] ?? 0;
    const cx = anchorX + (g.cx - anchorX) * titleScale;
    const segs = g.wallSegments;
    for (let k = 0; k < segs.length; k += 4) {
      const ax = segs[k] * titleScale;
      const ay = segs[k + 1] * titleScale;
      const bx = segs[k + 2] * titleScale;
      const by = segs[k + 3] * titleScale;
      const p0 = standingCharPos(cx, ax, ay, 0, baseRow, 1, standRad, turn, floatPx);
      const p1 = standingCharPos(cx, bx, by, 0, baseRow, 1, standRad, turn, floatPx);
      const p2 = standingCharPos(cx, bx, by, thick, baseRow, 1, standRad, turn, floatPx);
      const p3 = standingCharPos(cx, ax, ay, thick, baseRow, 1, standRad, turn, floatPx);
      sink.pushQuad(
        [p0[0], p0[1], p0[2], 0, 0],
        [p1[0], p1[1], p1[2], 1, 0],
        [p2[0], p2[1], p2[2], 1, 1],
        [p3[0], p3[1], p3[2], 0, 1],
        sideCol,
        4,
      );
    }
  }
}

/** Emits crisp front & back faces for 3D standing letters (scales smoothly 1x in 2D -> titleScale3D in 3D around anchorX). */
export function emitStandingTitleChars(
  sink: VertexSink,
  chars: GlyphRun['chars'],
  anchorX: number,
  baseRow: number,
  standRad: number,
  floatPx: number,
  angles: Float32Array | undefined,
  dimMul: number,
  faceRgb: [number, number, number] = [1, 1, 1],
  rise = 1,
) {
  const r = clamp(rise, 0, 1);
  const titleScale = lerp(1, CURVE_CONFIG.titleScale3D, r);
  const thick = 20 * r;
  const faceCol: RGBA = [faceRgb[0] * dimMul, faceRgb[1] * dimMul, faceRgb[2] * dimMul, 1];

  for (let i = 0; i < chars.length; i++) {
    const g = chars[i];
    if (/\s/.test(g.ch)) continue;
    const turn = angles?.[i] ?? 0;
    const cx = anchorX + (g.cx - anchorX) * titleScale;
    const halfW = g.w * 0.5 * titleScale;
    const loY = (g.boxH * 0.5 - g.h * 0.5) * titleScale;
    const hiY = (g.boxH * 0.5 + g.h * 0.5) * titleScale;

    if (rise > 0.02) {
      // Back face (white when a character spins 360°)
      const blBack = standingCharPos(cx, -halfW, loY, 0, baseRow, 1, standRad, turn, floatPx);
      const brBack = standingCharPos(cx, halfW, loY, 0, baseRow, 1, standRad, turn, floatPx);
      const trBack = standingCharPos(cx, halfW, hiY, 0, baseRow, 1, standRad, turn, floatPx);
      const tlBack = standingCharPos(cx, -halfW, hiY, 0, baseRow, 1, standRad, turn, floatPx);
      sink.pushQuad(
        [tlBack[0], tlBack[1], tlBack[2], g.u0, 0],
        [trBack[0], trBack[1], trBack[2], g.u1, 0],
        [brBack[0], brBack[1], brBack[2], g.u1, 1],
        [blBack[0], blBack[1], blBack[2], g.u0, 1],
        faceCol,
        3,
      );
    }

    // Crisp front face closest to camera (sits at exact 1x DOM size & position when rise=0)
    const frontDepth = rise > 0.02 ? thick : 0;
    const bl = standingCharPos(cx, -halfW, loY, frontDepth, baseRow, 1, standRad, turn, floatPx);
    const br = standingCharPos(cx, halfW, loY, frontDepth, baseRow, 1, standRad, turn, floatPx);
    const tr = standingCharPos(cx, halfW, hiY, frontDepth, baseRow, 1, standRad, turn, floatPx);
    const tl = standingCharPos(cx, -halfW, hiY, frontDepth, baseRow, 1, standRad, turn, floatPx);
    sink.pushQuad(
      [tl[0], tl[1], tl[2], g.u0, 0],
      [tr[0], tr[1], tr[2], g.u1, 0],
      [br[0], br[1], br[2], g.u1, 1],
      [bl[0], bl[1], bl[2], g.u0, 1],
      faceCol,
      3,
    );
  }
}

/** Emits diagonal floor shadow quads for each standing title character in WebGL2 fallback. */
export function emitStandingTitleShadowQuads(
  sink: VertexSink,
  chars: GlyphRun['chars'],
  anchorX: number,
  baseRow: number,
  standRad: number,
  floatPx: number,
  angles: Float32Array | undefined,
  dimMul: number,
  rise: number,
) {
  if (rise <= 0.02) return;
  const r = clamp(rise, 0, 1);
  const titleScale = lerp(1, CURVE_CONFIG.titleScale3D, r);
  const [lx, ly] = keyLightSlope();
  const shCol: RGBA = [0, 0, 0, 0.42 * dimMul * r];
  const midDepth = 10 * r;
  const projShadow = (p: [number, number, number]): [number, number, number] => [
    p[0] - p[2] * lx,
    p[1] - p[2] * ly,
    1.2,
  ];

  for (let i = 0; i < chars.length; i++) {
    const g = chars[i];
    if (/\s/.test(g.ch)) continue;
    const turn = angles?.[i] ?? 0;
    const cx = anchorX + (g.cx - anchorX) * titleScale;
    const halfW = g.w * 0.5 * titleScale;
    const loY = (g.boxH * 0.5 - g.h * 0.5) * titleScale;
    const hiY = (g.boxH * 0.5 + g.h * 0.5) * titleScale;
    const bl = projShadow(standingCharPos(cx, -halfW, loY, midDepth, baseRow, 1, standRad, turn, floatPx));
    const br = projShadow(standingCharPos(cx, halfW, loY, midDepth, baseRow, 1, standRad, turn, floatPx));
    const tr = projShadow(standingCharPos(cx, halfW, hiY, midDepth, baseRow, 1, standRad, turn, floatPx));
    const tl = projShadow(standingCharPos(cx, -halfW, hiY, midDepth, baseRow, 1, standRad, turn, floatPx));
    sink.pushQuad(
      [tl[0], tl[1], tl[2], g.u0, 0],
      [tr[0], tr[1], tr[2], g.u1, 0],
      [br[0], br[1], br[2], g.u1, 1],
      [bl[0], bl[1], bl[2], g.u0, 1],
      shCol,
      1,
    );
  }
}

export function cardElevAt(frame: CurveFrame, r0: number, r1: number, hovered: boolean, depthScale = 1): number {
  const grow = 1 + CURVE_CONFIG.cityGrow * Math.max(0, frame.T - (r0 + r1) * 0.5) / Math.max(1, frame.H);
  return CURVE_CONFIG.slabDepth * depthScale * grow + (hovered ? 4 : 0);
}

export function extractRenderStateHelpers(state: ResourceRenderState, frame: CurveFrame) {
  const docToRow = (y: number) => y - state.scrollY + frame.lead;
  return { docToRow };
}
