import { onPage } from './page-lifecycle';
import {
  CURVE_CONFIG,
  RAIL_ARC_CONFIG,
  TitleSpring,
  WIRE_STYLE,
  buildRailSemicircle,
  clamp,
  computeCurveFrame,
  computeLead,
  computeRaisedCovers,
  cornerIconPaths,
  easeOutQuart,
  expApproach,
  hingePoint,
  lerp,
  projectPoint,
  railArcDistAtY,
  railArcPointAt,
  smoothstep,
  standingCharPos,
  unprojectPoint,
  wireBezierPoint,
  wireFadeWeight,
  wireHandle,
  type BannerTextItem,
  type CurveFrame,
  type RailSemicircle,
  type ResourceBandSpan,
  type ResourceBannerLayout,
  type ResourceCardLayout,
  type ResourceTitleLayout,
  type Resources3DRenderer,
} from './resources-curve';
import { ResourcesGLRenderer } from './resources-gl';
import { RunwayGameController, type AmbientSpiderSpec, type CardStepBox, type OccluderSet, type PageWordToken, type TitleCoverOccluder } from './resources-game';
import { SidePropsController, type RulerGroupMark } from './resources-props';
import { applyMixedOverridesToPalette, cardElevAt, computeCardHotspots, readResourcePalette, type CardRect, type ResourcePalette } from './resources-scene-data';
import { ResourcesWebGPURenderer } from './resources-webgpu';

const DESKTOP_MIN_WIDTH = 900;
const TILT_MAX_DEG = 46;
const SCROLL_TRIGGER_PX = 24;
const SCROLL_RESET_PX = 4;
const DEG = Math.PI / 180;

interface TiltAnim {
  from: number;
  to: number;
  t0: number;
  at: number;
}

interface RailArcEntry {
  to: number;
  live: boolean;
  presence: number;
  age: number;
  left: number;
}

export function initResourcesRunway(doc: Document): () => void {
  const root = doc.querySelector<HTMLElement>('[data-resources-page]');
  if (!root) return () => {};
  const track = root.querySelector<HTMLElement>('[data-res-track]');
  const stage = root.querySelector<HTMLElement>('[data-res-stage]');
  const runway = root.querySelector<HTMLElement>('[data-res-runway]');
  if (!track || !stage || !runway) return () => {};

  let canvas = stage.querySelector<HTMLCanvasElement>('[data-res-canvas]');
  const wireCanvas = stage.querySelector<HTMLCanvasElement>('[data-res-wires]');
  let wireCtx: CanvasRenderingContext2D | null = null;
  try {
    wireCtx = wireCanvas?.getContext('2d') ?? null;
  } catch {
    wireCtx = null;
  }

  const dimToggle = root.querySelector<HTMLButtonElement>('[data-dim-toggle]');
  const dimLabel = dimToggle?.querySelector<HTMLElement>('[data-dim-label]');
  const svgHidden = dimToggle?.querySelector<SVGPathElement>('[data-svg-hidden]');
  const svgShadow = dimToggle?.querySelector<SVGPathElement>('[data-svg-shadow]');
  const svgSolid = dimToggle?.querySelector<SVGPathElement>('[data-svg-solid]');
  const svgCurve = dimToggle?.querySelector<SVGPathElement>('[data-svg-curve]');
  const svgTip = dimToggle?.querySelector<SVGCircleElement>('[data-svg-tip]');

  const searchInput = root.querySelector<HTMLInputElement>('[data-res-search]');
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-res-clear]');
  const countEl = root.querySelector<HTMLElement>('[data-res-count]');
  const emptyEl = root.querySelector<HTMLElement>('[data-res-empty]');
  const hero = root.querySelector<HTMLElement>('[data-res-hero]');
  const cards = [...root.querySelectorAll<HTMLElement>('[data-res-card]')];
  const groups = [...root.querySelectorAll<HTMLElement>('[data-res-group]')];
  const titleEls = [...root.querySelectorAll<HTMLElement>('[data-res-title3d]')];
  const railEl = root.querySelector<HTMLElement>('[data-res-rail]');
  const railArcsCanvas = root.querySelector<HTMLCanvasElement>('[data-res-rail-arcs]');
  let railArcsCtx: CanvasRenderingContext2D | null = null;
  try {
    railArcsCtx = railArcsCanvas?.getContext('2d') ?? null;
  } catch {
    railArcsCtx = null;
  }
  const railButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-rail-target]')];
  const gameDock = root.querySelector<HTMLElement>('[data-res-game-dock]');
  const gameStartBtn = root.querySelector<HTMLButtonElement>('[data-res-game-start]');
  const gameStartLabel = root.querySelector<HTMLElement>('[data-res-game-start-label]');
  const gameSpeedEl = root.querySelector<HTMLElement>('[data-res-game-speed]');
  const gameDistEl = root.querySelector<HTMLElement>('[data-res-game-dist]');
  const gameWidthEl = root.querySelector<HTMLElement>('[data-res-game-width]');
  const gameFinishEl = root.querySelector<HTMLElement>('[data-res-game-finish]');
  const gameGradeEl = root.querySelector<HTMLElement>('[data-res-game-grade]');
  const gameSummaryEl = root.querySelector<HTMLElement>('[data-res-game-summary]');
  const gameReplayBtn = root.querySelector<HTMLButtonElement>('[data-res-game-replay]');
  const gameExitBtn = root.querySelector<HTMLButtonElement>('[data-res-game-exit]');

  const win = doc.defaultView ?? window;
  const reducedMotion = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const canUse3D = () => win.innerWidth >= DESKTOP_MIN_WIDTH && !reducedMotion();

  const sideProps = new SidePropsController();
  const game = new RunwayGameController();

  let renderer: Resources3DRenderer | null = null;
  let glDirty = false;
  let pageColor: [number, number, number] = [0.97, 0.97, 0.95];
  let wireRgb: [number, number, number] = [10, 38, 23];
  let accentRgb: [number, number, number] = [16, 163, 74];
  let voidBgHex = '#ffffff';
  let isDarkTheme = false;
  let docTotalHeight = 2400;
  let contentEndDocY = 2000;
  let groupMarks: RulerGroupMark[] = [];
  let themeDirty = false;
  let themeSettleTimer = 0;
  let lastPalette: ResourcePalette | null = null;
  let pendingMixedTheme: Record<string, string> | null = null;
  let previewDarkOverride: boolean | null = null;
  const bootMs = typeof win.performance?.now === 'function' ? win.performance.now() : Date.now();

  // 800ms Shopify time-driven transition timeline (`t`: 0 = flat 2D, 1 = curved 3D)
  let userForceFlat = false;
  let userForce3D = false;
  let currentT = 0;
  let animFrom = 0;
  let animTo = 0;
  let animStart = -1;
  let currentScroll = 0;
  let maxScroll = 0;
  let rafId = 0;
  let lastStepMs = 0;
  let hoverCorner = 0;
  let lastCornerProgress = -1;

  let raisedCard: HTMLElement | null = null;
  let raisedId = -1;
  let copiedCardId = -1;
  let copiedTimer = 0;
  let hoveredCardId = -1;
  let hoveredRailIdx = -1;
  let activeRailIdx = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let railMetrics: { left: number; top: number; width: number; height: number; dotX: number; ys: number[]; hasRealRect: boolean } | null = null;
  const tiltAnims = new Map<number, TiltAnim>();
  const titleSprings = new Map<number, TitleSpring>();
  let railArcEntries: RailArcEntry[] = [];
  const wireHeads = new Map<number, number>();

  let cachedW = 0;
  let cachedH = 0;
  let cachedLead = 0;
  let cardLayouts: ResourceCardLayout[] = [];
  let bannerLayouts: ResourceBannerLayout[] = [];
  let titleLayouts: ResourceTitleLayout[] = [];
  let bands: ResourceBandSpan[] = [];

  let live = true;
  const cleanups: (() => void)[] = [];

  const listen = (target: EventTarget, event: string, fn: EventListener, options?: AddEventListenerOptions) => {
    target.addEventListener(event, fn, options);
    cleanups.push(() => target.removeEventListener(event, fn, options));
  };

  function nowMs(): number {
    return typeof win.performance?.now === 'function' ? win.performance.now() : Date.now();
  }

  function isDesktopStage(): boolean {
    return canUse3D();
  }

  function startTransition(target: number) {
    if (Math.abs(target - animTo) < 0.001 && animStart >= 0) return;
    if (Math.abs(currentT - target) < 0.001) {
      currentT = target;
      animFrom = target;
      animTo = target;
      animStart = -1;
      syncToggleUI();
      requestFrame();
      return;
    }
    animFrom = currentT;
    animTo = target;
    animStart = nowMs();
    requestFrame();
  }

  function evalTilt(id: number, now: number, scrollPos = currentScroll): number {
    const anim = tiltAnims.get(id);
    if (!anim) return 0;
    const u = clamp((now - anim.t0) / CURVE_CONFIG.tiltDurationMs, 0, 1);
    const base = lerp(anim.from, anim.to, easeOutQuart(u));
    const h = cachedH || win.innerHeight || 800;
    const fadeDist = Math.max(220, CURVE_CONFIG.tiltFade * h);
    const scrollFade = anim.at >= 0 ? clamp(1 - Math.abs(scrollPos - anim.at) / fadeDist, 0, 1) : 1;
    const val = base * scrollFade;
    if (scrollFade <= 0.001 || (u >= 1 && anim.to === 0)) {
      tiltAnims.delete(id);
      return 0;
    }
    return val;
  }

  function clearRaisedDom() {
    if (raisedCard) {
      delete raisedCard.dataset.raised;
      raisedCard.setAttribute('aria-expanded', 'false');
    }
    raisedCard = null;
    raisedId = -1;
    delete stage.dataset.hasRaised;
  }

  function syncCornerIcon(t: number) {
    const prog = clamp(Math.max(hoverCorner * 0.45, t), 0, 1);
    if (Math.abs(prog - lastCornerProgress) < 0.002) return;
    lastCornerProgress = prog;
    if (!svgSolid || !svgCurve) return;
    const g = cornerIconPaths(prog);
    svgHidden?.setAttribute('d', g.hidden);
    svgHidden?.setAttribute('opacity', (0.35 * prog).toFixed(3));
    svgShadow?.setAttribute('d', g.shadow);
    svgShadow?.setAttribute('opacity', (0.35 * prog).toFixed(3));
    svgSolid.setAttribute('d', g.solid);
    svgCurve.setAttribute('d', g.curve);
    svgTip?.setAttribute('cx', g.tip[0].toFixed(3));
    svgTip?.setAttribute('cy', g.tip[1].toFixed(3));
    if (svgTip) svgTip.style.opacity = prog > 0.02 ? '1' : '0';
  }

  function syncToggleUI() {
    if (!dimToggle) return;
    const is3DActive = isDesktopStage() && (animTo > 0.5 || currentT > 0.12);
    dimToggle.setAttribute('aria-pressed', String(is3DActive));
    if (dimLabel) dimLabel.textContent = is3DActive ? '平面视图' : '立体视图';
    syncCornerIcon(currentT);
  }

  function docRect(el: HTMLElement, curScrollY: number) {
    const r = el.getBoundingClientRect();
    return {
      left: r.left + (win.scrollX || 0),
      right: r.right + (win.scrollX || 0),
      top: r.top + curScrollY,
      bottom: r.bottom + curScrollY,
      width: r.width || el.offsetWidth || 0,
      height: r.height || el.offsetHeight || 0,
    };
  }

  let pickMeasureCtx: CanvasRenderingContext2D | null | undefined;
  function getPickMeasureCtx(): CanvasRenderingContext2D | null {
    if (pickMeasureCtx === undefined) {
      try {
        pickMeasureCtx = doc.createElement('canvas').getContext('2d');
      } catch {
        pickMeasureCtx = null;
      }
    }
    return pickMeasureCtx;
  }

  function measureBannerTextItem(
    el: HTMLElement | null,
    boxLeft: number,
    boxTop: number,
    curScrollY: number,
  ): BannerTextItem | null {
    if (!el || el.hidden) return null;
    const text = el.textContent?.trim() || '';
    if (!text) return null;
    const r = docRect(el, curScrollY);
    const cs = win.getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize) || 15;
    const rawLh = parseFloat(cs.lineHeight);
    const lineHeight = Number.isFinite(rawLh) && rawLh > 0 ? rawLh : fontSize * 1.65;
    return {
      text,
      x: Math.max(0, r.left - boxLeft),
      y: Math.max(0, r.top - boxTop),
      width: r.width,
      lineHeight,
      fontSize,
      fontWeight: cs.fontWeight || '400',
      fontFamily: cs.fontFamily || 'system-ui, sans-serif',
    };
  }

  function measureCharCenters(target: HTMLElement, trimmedText: string): number[] | undefined {
    if (typeof doc.createRange !== 'function' || typeof doc.createTreeWalker !== 'function') return undefined;
    const raw = target.textContent || '';
    const startIdx = raw.indexOf(trimmedText);
    if (startIdx < 0) return undefined;
    const leadChars = [...raw.slice(0, startIdx)].length;
    const wantedLen = [...trimmedText].length;
    const centers: number[] = [];
    const range = doc.createRange();
    const sx = win.scrollX || 0;
    const walker = doc.createTreeWalker(target, 4);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const val = node.textContent || '';
      let offset = 0;
      for (const ch of val) {
        const len = ch.length;
        try {
          range.setStart(node, offset);
          range.setEnd(node, offset + len);
          const r = range.getBoundingClientRect();
          centers.push(r.width > 0 || r.height > 0 ? r.left + sx + r.width * 0.5 : NaN);
        } catch {
          centers.push(NaN);
        }
        offset += len;
      }
    }
    const sliced = centers.slice(leadChars, leadChars + wantedLen);
    if (sliced.length !== wantedLen || sliced.some((v) => !Number.isFinite(v))) return undefined;
    return sliced;
  }

  let cardSansFont = 'system-ui, -apple-system, sans-serif';

  function extractDetailRaw(descEl: HTMLElement | null): string {
    if (!descEl) return '';
    const attr = descEl.dataset.detailRaw?.trim();
    if (attr) return attr;
    let out = '';
    for (const node of Array.from(descEl.childNodes)) {
      if (node.nodeType === 1 && (node as HTMLElement).tagName === 'A') {
        const a = node as HTMLAnchorElement;
        const href = a.getAttribute('href')?.trim() || '';
        const label = a.textContent?.trim() || href;
        out += href ? `[${label}](${href})` : label;
      } else {
        out += node.textContent || '';
      }
    }
    return out.trim();
  }

  function syncPaletteColors(pal: ReturnType<typeof readResourcePalette>) {
    lastPalette = pal;
    pageColor = pal.pageBgRgb;
    cardSansFont = pal.sansFont;
    wireRgb = [
      Math.round(pal.railInk[0] * 255),
      Math.round(pal.railInk[1] * 255),
      Math.round(pal.railInk[2] * 255),
    ];
    isDarkTheme = previewDarkOverride !== null ? previewDarkOverride : doc.documentElement.classList.contains('dark');
    voidBgHex = `rgb(${Math.round(pal.voidBg[0] * 255)},${Math.round(pal.voidBg[1] * 255)},${Math.round(pal.voidBg[2] * 255)})`;
    accentRgb = [
      Math.round(pal.runwayBg[0] * 255),
      Math.round(pal.runwayBg[1] * 255),
      Math.round(pal.runwayBg[2] * 255),
    ];
  }

  function flushTheme(fastPreview: boolean, mixedOverrides?: Record<string, string>) {
    themeDirty = false;
    const pal = mixedOverrides && lastPalette
      ? applyMixedOverridesToPalette(lastPalette, mixedOverrides)
      : readResourcePalette(stage);
    syncPaletteColors(pal);
    renderer?.refreshTheme(fastPreview, mixedOverrides);
    glDirty = true;
  }

  function getBottomScroll(): number {
    const winH = win.innerHeight || cachedH || 800;
    const docH = Math.max(
      doc.documentElement?.scrollHeight || 0,
      doc.body?.scrollHeight || 0,
      runway.scrollHeight || 0,
    );
    return Math.max(0, docH - winH);
  }

  function syncLayoutCache() {
    const curScrollY = win.scrollY || 0;
    const stageW = win.innerWidth || 1280;
    const stageH = win.innerHeight || 800;
    if (stageW !== cachedW || stageH !== cachedH) {
      cachedW = stageW;
      cachedH = stageH;
      cachedLead = computeLead(stageH);
    }

    syncPaletteColors(readResourcePalette(stage));
    const runwayH = runway.scrollHeight || 0;
    docTotalHeight = Math.max(1600, runwayH);
    maxScroll = Math.max(getBottomScroll(), runwayH - stageH * 0.12);

    bannerLayouts = [];
    titleLayouts = [];
    bands = [];
    cardLayouts = [];
    groupMarks = [];
    let lastContentBottom = 0;

    if (hero) {
      const introEl = hero.querySelector<HTMLElement>('.res-head-note');
      if (introEl && introEl.textContent?.trim()) {
        const noteR = docRect(introEl, curScrollY);
        const item = measureBannerTextItem(introEl, noteR.left, noteR.top, curScrollY);
        if (item && noteR.width > 0 && noteR.height > 0) {
          bannerLayouts.push({
            key: 'hero',
            kind: 'hero',
            x0: noteR.left,
            x1: noteR.right,
            docTop: noteR.top,
            docBottom: noteR.bottom,
            width: noteR.width,
            height: noteR.height,
            eyebrow: '',
            note: item.text,
            meta: '',
            items: [item],
          });
        }
      }
    }

    groups.forEach((group, gi) => {
      if (group.hidden) return;
      const gr = docRect(group, curScrollY);
      bands.push({ docTop: gr.top - 24, docBottom: gr.bottom + 24, alt: gi % 2 === 1 });
      if (gr.bottom > lastContentBottom) lastContentBottom = gr.bottom;
      const groupTitle = group.querySelector('h2')?.textContent?.trim() || '';
      if (groupTitle) groupMarks.push({ title: groupTitle, docTop: gr.top });

      const gh = group.querySelector<HTMLElement>('.res-group-head');
      if (gh) {
        const ghr = docRect(gh, curScrollY);
        const items: BannerTextItem[] = [];
        for (const sel of ['.res-group-code', '.res-group-count', '.res-group-note']) {
          const item = measureBannerTextItem(gh.querySelector<HTMLElement>(sel), ghr.left, ghr.top, curScrollY);
          if (item) items.push(item);
        }
        if (items.length > 0) {
          bannerLayouts.push({
            key: `group:${gi}`,
            kind: 'group',
            x0: ghr.left,
            x1: ghr.right,
            docTop: ghr.top,
            docBottom: Math.max(ghr.top + 48, ghr.bottom),
            width: Math.max(200, ghr.width),
            height: Math.max(48, ghr.height),
            eyebrow: gh.querySelector('.res-group-code')?.textContent?.trim() || '',
            note: gh.querySelector('.res-group-note')?.textContent?.trim() || '',
            meta: gh.querySelector('.res-group-count')?.textContent?.trim() || '',
            items,
            onAltBand: gi % 2 === 1,
          });
        }
      }

      const pn = group.querySelector<HTMLElement>('.res-paper-notes');
      if (pn && !pn.hidden) {
        const pnr = docRect(pn, curScrollY);
        const cols = [...pn.querySelectorAll<HTMLElement>('.res-paper-note-col')];
        const noteItems: BannerTextItem[] = [];
        for (const col of cols) {
          const item = measureBannerTextItem(col, pnr.left, pnr.top, curScrollY);
          if (item) noteItems.push(item);
        }
        if (noteItems.length > 0 && pnr.width > 40 && pnr.height > 12) {
          bannerLayouts.push({
            key: `notes:${gi}`,
            kind: 'note',
            x0: pnr.left,
            x1: pnr.right,
            docTop: pnr.top,
            docBottom: Math.max(pnr.top + 28, pnr.bottom),
            width: pnr.width,
            height: Math.max(28, pnr.height),
            eyebrow: '',
            note: '',
            meta: '',
            items: noteItems,
            onAltBand: gi % 2 === 1,
          });
        }
      }
    });

    titleEls.forEach((wrapper, ti) => {
      const parentGroup = wrapper.closest<HTMLElement>('[data-res-group]');
      if (parentGroup?.hidden) return;
      const target = wrapper.matches('h1, h2') ? wrapper : wrapper.querySelector<HTMLElement>('h1, h2') || wrapper;
      const text = target.textContent?.trim() || '';
      if (!text) return;
      const tr = docRect(target, curScrollY);
      const cs = win.getComputedStyle(target);
      const fontSize = parseFloat(cs.fontSize) || 40;
      const fontWeight = cs.fontWeight || '800';
      const charCenters = measureCharCenters(target, text);
      titleLayouts.push({
        id: ti,
        key: wrapper.dataset.resTitle3d || `t-${ti}`,
        el: target,
        text,
        x0: tr.left,
        x1: Math.max(tr.right, tr.left + text.length * fontSize * 0.65),
        docTop: tr.top,
        docBottom: Math.max(tr.bottom, tr.top + fontSize),
        baselineY: Math.max(tr.bottom, tr.top + fontSize),
        fontSize,
        fontWeight,
        fontFamily: cs.fontFamily || 'system-ui, sans-serif',
        charCenters,
        isHero: wrapper.dataset.resTitle3d === 'hero',
      });
      if (!titleSprings.has(ti)) titleSprings.set(ti, new TitleSpring());
    });

    cards.forEach((card, idx) => {
      if (card.hidden) return;
      const cr = docRect(card, curScrollY);
      if (cr.width <= 0 || cr.height <= 0) return;
      const groupEl = card.closest<HTMLElement>('[data-res-group]');
      const groupIdx = groupEl ? Number(groupEl.dataset.resGroup || 0) : 0;
      const coverEl = card.querySelector<HTMLImageElement>('.res-cover');
      const descEl = card.querySelector<HTMLElement>('.res-stage-desc');
      const stageImgs = [...card.querySelectorAll<HTMLImageElement>('.res-stage-img')]
        .map((im) => im.getAttribute('src')?.trim() || '')
        .filter(Boolean)
        .slice(0, 4);
      const tags = [...card.querySelectorAll('.res-tag')].map((t) => t.textContent?.trim() || '').filter(Boolean);
      const isWide = card.dataset.wide === 'true';
      const hasMedia = stageImgs.length > 0;
      const jitter = ((idx * 37) % 5) * 0.08;
      const depthScale = isWide
        ? (hasMedia ? 2.35 : 2.0) + jitter * 0.5
        : cr.width >= 600 || hasMedia
          ? (hasMedia ? 1.72 : 1.48) + jitter * 0.6
          : 0.92 + jitter;
      cardLayouts.push({
        id: idx,
        el: card,
        x0: cr.left,
        x1: cr.right,
        docTop: cr.top,
        docBottom: cr.bottom,
        width: cr.width,
        height: cr.height,
        name: card.querySelector('h3')?.textContent?.trim() || '',
        summary: card.querySelector('.res-summary')?.textContent?.trim() || '',
        detail: extractDetailRaw(descEl),
        badge: card.querySelector('.res-badge')?.textContent?.trim() || '',
        cta: card.querySelector('.res-cta')?.textContent?.trim() || '前往获取',
        code: card.querySelector<HTMLButtonElement>('[data-copy-code]')?.dataset.copyCode || '',
        href: card.querySelector<HTMLAnchorElement>('.res-cta')?.getAttribute('href') || '#',
        tags,
        coverUrl: coverEl?.getAttribute('src') || '',
        images: stageImgs,
        wide: isWide,
        groupIdx,
        depthScale,
      });
      if (cr.bottom > lastContentBottom) lastContentBottom = cr.bottom;
    });

    contentEndDocY = lastContentBottom > 0 ? lastContentBottom : Math.max(800, docTotalHeight - 360);

    // Feed real page words & section hubs into the game for ambient 3D page spiders (图一) and articulated word-grabbing legs!
    const pageWords: PageWordToken[] = [];
    for (const c of cardLayouts) {
      const cx = (c.x0 + c.x1) * 0.5;
      if (c.name) pageWords.push({ text: c.name.slice(0, 10), col: c.x0 + 70, docY: c.docTop + 34 });
      if (c.badge) pageWords.push({ text: c.badge.slice(0, 10), col: c.x1 - 80, docY: c.docTop + 88 });
      c.tags.forEach((tag, ti) => {
        pageWords.push({
          text: tag.slice(0, 10),
          col: c.x0 + 60 + ti * 78,
          docY: c.docBottom - 44,
        });
      });
      if (c.summary) {
        const snippet = c.summary.split(/[，。、\s]+/).find((s) => s.length >= 2) || c.summary.slice(0, 6);
        pageWords.push({ text: snippet.slice(0, 8), col: cx, docY: (c.docTop + c.docBottom) * 0.5 });
      }
    }

    const ambientSpiders: AmbientSpiderSpec[] = groupMarks.map((g, gi) => {
      const groupCards = cardLayouts.filter((c) => c.groupIdx === gi);
      const nodeLabels = [
        ...groupCards.map((c) => c.name.slice(0, 8)),
        ...groupCards.flatMap((c) => c.tags.slice(0, 2)),
      ].slice(0, 8);
      return {
        id: `grp-${gi}`,
        label: g.title,
        docY: Math.max(240, g.docTop - 42),
        uX: gi % 2 === 0 ? 0.56 : 0.44,
        nodeLabels,
      };
    });
    const cardStepBoxes: CardStepBox[] = cardLayouts.map((c) => ({
      id: c.id,
      x0: c.x0,
      x1: c.x1,
      y0: c.docTop,
      y1: c.docBottom,
      top: CURVE_CONFIG.slabDepth * (c.depthScale ?? 1),
    }));
    game.setPageContent(pageWords, ambientSpiders, cardStepBoxes);

    if (canvas && renderer) {
      const dpr = clamp(win.devicePixelRatio || 1, 1, 2);
      const pxW = Math.max(1, Math.round(stageW * dpr));
      const pxH = Math.max(1, Math.round(stageH * dpr));
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
      }
      renderer.resize(pxW, pxH);
    }
    if (wireCanvas) {
      const dpr = clamp(win.devicePixelRatio || 1, 1, 2);
      const pxW = Math.max(1, Math.round(stageW * dpr));
      const pxH = Math.max(1, Math.round(stageH * dpr));
      if (wireCanvas.width !== pxW || wireCanvas.height !== pxH) {
        wireCanvas.width = pxW;
        wireCanvas.height = pxH;
      }
    }
    railMetrics = null;
    glDirty = true;
  }

  function syncStageMode() {
    const mode = isDesktopStage() ? '3d' : '2d';
    stage.dataset.stageMode = mode;
    if (mode === '2d') {
      track.style.height = '';
      stage.dataset.glActive = 'false';
      stage.dataset.gpuBackend = '2d';
      stage.dataset.domHidden = 'false';
      stage.dataset.controlsDock = 'inline';
      stage.style.removeProperty('--res-t');
      stage.style.removeProperty('--runway-tilt');
      stage.style.removeProperty('--res-canvas-op');
      stage.style.removeProperty('--res-dom-op');
      stage.style.removeProperty('--res-controls-op');
      doc.body.style.setProperty('--res-2d-vis', '1');
      syncToggleUI();
      return;
    }
    syncLayoutCache();
  }

  function measureRailMetrics() {
    if (!railEl || !railButtons.length) return null;
    const rr = railEl.getBoundingClientRect();
    const hasRealRect = rr.width > 0 && rr.height > 0;
    if (!hasRealRect) {
      return {
        left: 24,
        top: 280,
        width: 122,
        height: Math.max(84, railButtons.length * 28),
        dotX: 118,
        ys: railButtons.map((_, i) => 12 + i * 28),
        hasRealRect: false,
      };
    }
    let dotX = rr.width - 3;
    const ys: number[] = [];
    for (let i = 0; i < railButtons.length; i++) {
      const btn = railButtons[i];
      const dot = btn.querySelector<HTMLElement>('.res-rail-dot');
      const br = btn.getBoundingClientRect();
      if (dot) {
        const dr = dot.getBoundingClientRect();
        if (dr.width > 0) dotX = dr.left - rr.left + dr.width * 0.5;
        ys.push(dr.height > 0 ? dr.top - rr.top + dr.height * 0.5 : br.top - rr.top + br.height * 0.5);
      } else {
        ys.push(br.top - rr.top + br.height * 0.5);
      }
    }
    return { left: rr.left, top: rr.top, width: rr.width, height: rr.height, dotX, ys, hasRealRect: true };
  }

  function strokeArcSpan(ctx: CanvasRenderingContext2D, arc: RailSemicircle, d0: number, d1: number) {
    if (d1 <= d0) return;
    const p0 = railArcPointAt(arc, d0);
    const p1 = railArcPointAt(arc, d1);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < arc.pts.length; i++) {
      if (arc.len[i] <= d0) continue;
      if (arc.len[i] >= d1) break;
      ctx.lineTo(arc.pts[i].x, arc.pts[i].y);
    }
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  function strokeArcPulse(ctx: CanvasRenderingContext2D, arc: RailSemicircle, headDist: number, presence: number) {
    const segLen = RAIL_ARC_CONFIG.pulseTailPx / RAIL_ARC_CONFIG.pulseSegments;
    ctx.lineWidth = RAIL_ARC_CONFIG.pulseWidth;
    for (let a = 0; a < RAIL_ARC_CONFIG.pulseSegments; a++) {
      const d = headDist - a * segLen;
      if (d <= 0 || d - segLen >= arc.total) continue;
      ctx.globalAlpha = presence * (1 - a / RAIL_ARC_CONFIG.pulseSegments);
      strokeArcSpan(ctx, arc, Math.max(0, d - segLen), Math.min(arc.total, d));
    }
    ctx.lineWidth = RAIL_ARC_CONFIG.lineWidth;
  }

  function syncRailHoverTarget(nextIdx: number) {
    const liveEntry = railArcEntries.find((e) => e.live);
    if (liveEntry?.to === nextIdx) return;
    if (liveEntry) liveEntry.live = false;
    if (nextIdx >= 0 && nextIdx < railButtons.length && !railButtons[nextIdx]?.hidden) {
      const existing = railArcEntries.find((e) => e.to === nextIdx);
      if (existing) {
        existing.live = true;
      } else {
        railArcEntries.push({ to: nextIdx, live: true, presence: 0, age: 0, left: 0 });
      }
    }
  }

  function stepRailArcs(dt: number): boolean {
    const rm = reducedMotion();
    for (const entry of railArcEntries) {
      entry.age += dt;
      entry.left = entry.live ? 0 : entry.left + dt;
      const holding = entry.live || entry.left < RAIL_ARC_CONFIG.holdSec;
      const target = holding ? 1 : 0;
      entry.presence = rm
        ? target
        : expApproach(entry.presence, target, dt, holding ? RAIL_ARC_CONFIG.fadeInHalfLife : RAIL_ARC_CONFIG.fadeOutHalfLife);
    }
    railArcEntries = railArcEntries.filter((e) => e.live || e.presence > 0.004);
    if (railArcsCanvas) {
      railArcsCanvas.dataset.railArcCount = String(railArcEntries.length);
    }
    return railArcEntries.length > 0;
  }

  /** Shopify verbatim DesktopNavigation canvas renderer: semicircle + fast 260px/s pulses + intermediate horizontal rungs + active-dot sonar square. */
  function renderRailArcs(activeIdx: number) {
    if (!railArcsCanvas || !railButtons.length) return;
    if (!railMetrics) railMetrics = measureRailMetrics();
    if (!railMetrics) return;
    railArcsCanvas.dataset.railArcCount = String(railArcEntries.length);
    if (!railArcsCtx) return;

    const { width, height, dotX, ys } = railMetrics;
    const dpr = Math.min(2, win.devicePixelRatio || 1);
    const cssW = Math.ceil(width + RAIL_ARC_CONFIG.dotOffsetX + height * 0.5 + 16);
    const cssH = Math.ceil(height + 24);
    if (railArcsCanvas.style.width !== `${cssW}px`) railArcsCanvas.style.width = `${cssW}px`;
    if (railArcsCanvas.style.height !== `${cssH}px`) railArcsCanvas.style.height = `${cssH}px`;
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    if (railArcsCanvas.width !== pxW || railArcsCanvas.height !== pxH) {
      railArcsCanvas.width = pxW;
      railArcsCanvas.height = pxH;
    }

    const ctx = railArcsCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pxW, pxH);
    if (!railArcEntries.length) return;

    const yActive = ys[activeIdx];
    if (yActive === undefined) return;

    const rm = reducedMotion();
    const [wr, wg, wb] = wireRgb;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = `rgb(${wr},${wg},${wb})`;
    ctx.lineWidth = RAIL_ARC_CONFIG.lineWidth;

    const easeOutCubic = (u: number) => 1 - (1 - clamp(u, 0, 1)) ** 3;

    for (const entry of railArcEntries) {
      const yTarget = ys[entry.to];
      if (yTarget === undefined || railButtons[entry.to]?.hidden) continue;
      const w = entry.presence;
      if (w <= 0.002) continue;

      // Hovering active dot itself -> Shopify's subtle expanding square sonar ring
      if (entry.to === activeIdx) {
        if (rm) continue;
        const a = easeOutCubic((entry.age % 1.6) / 0.9);
        const sz = Math.round(6 + a * 16);
        ctx.globalAlpha = w * (1 - a) * 0.9;
        ctx.strokeRect(Math.round(dotX - sz * 0.5) + 0.5, Math.round(yTarget - sz * 0.5) + 0.5, sz - 1, sz - 1);
        continue;
      }

      const arc = buildRailSemicircle(
        { x: dotX + RAIL_ARC_CONFIG.dotOffsetX, y: yActive },
        { x: dotX + RAIL_ARC_CONFIG.dotOffsetX, y: yTarget },
      );
      if (arc.total <= 1) continue;

      const drawProgress = rm ? 1 : easeOutCubic(entry.age / RAIL_ARC_CONFIG.drawInSec);
      const S = arc.total * (entry.live ? drawProgress : 1);

      // 1) Base semicircle arc (wipes away gracefully from start as presence decays after 0.4s hold!)
      ctx.globalAlpha = RAIL_ARC_CONFIG.arcAlpha * w;
      strokeArcSpan(ctx, arc, entry.live ? 0 : arc.total * (1 - w), S);

      // 2) Fast 260px/s traveling pulses while live
      const pulseHeads: number[] = [];
      if (!rm && entry.live) {
        const cycle = arc.total + RAIL_ARC_CONFIG.pulseTailPx + 60;
        for (let k = 0; k < 2; k++) {
          const head = (entry.age * RAIL_ARC_CONFIG.pulseSpeedPx + (k * cycle) * 0.5) % cycle;
          if (head <= S + RAIL_ARC_CONFIG.pulseTailPx) {
            pulseHeads.push(head);
            strokeArcPulse(ctx, arc, Math.min(head, S + RAIL_ARC_CONFIG.pulseTailPx), w);
          }
        }
      }

      // 3) Horizontal rung lines from every intermediate dot out to its intersection on the semicircle (brightens as pulse passes!)
      const lo = Math.min(activeIdx, entry.to);
      const hi = Math.max(activeIdx, entry.to);
      for (let m = lo + 1; m < hi; m++) {
        if (railButtons[m]?.hidden) continue;
        const ym = ys[m];
        if (ym === undefined) continue;
        const distAtRow = railArcDistAtY(arc, ym);
        if (distAtRow > S) continue;
        let boost = 0;
        for (const pHead of pulseHeads) {
          const diff = pHead - distAtRow;
          if (diff >= 0 && diff < RAIL_ARC_CONFIG.pulseTailPx * 2) {
            boost = Math.max(boost, 1 - diff / (RAIL_ARC_CONFIG.pulseTailPx * 2));
          }
        }
        const qy = Math.round(ym) + 0.5;
        ctx.globalAlpha = w * (RAIL_ARC_CONFIG.rungIdleAlpha + (RAIL_ARC_CONFIG.rungPeakAlpha - RAIL_ARC_CONFIG.rungIdleAlpha) * boost);
        ctx.beginPath();
        ctx.moveTo(dotX + 5, qy);
        ctx.lineTo(railArcPointAt(arc, distAtRow).x, qy);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function clearWireOverlay() {
    if (!wireCtx || !wireCanvas) return;
    wireCtx.setTransform(1, 0, 0, 1, 0, 0);
    wireCtx.clearRect(0, 0, wireCanvas.width, wireCanvas.height);
  }

  function computeTitleCovers(frame: CurveFrame, scrollY: number): TitleCoverOccluder[] {
    if (frame.rise <= 0.04 || typeof Path2D === 'undefined') return [];
    const floatPx = CURVE_CONFIG.headingFloat * frame.rise;
    const standRad = CURVE_CONFIG.headingStandDeg * DEG * frame.rise;
    const titleScale = lerp(1, CURVE_CONFIG.titleScale3D, frame.rise);
    const thick = 20 * frame.rise;
    const mctx = getPickMeasureCtx();
    const out: TitleCoverOccluder[] = [];

    for (const t of titleLayouts) {
      const baseRow = t.docBottom - scrollY + frame.lead;
      if (baseRow < -160 || baseRow > frame.T + 160) continue;
      const chars = [...t.text];
      const fSize = Math.max(16, t.fontSize);
      const boxH = Math.max(fSize * 1.04, t.docBottom - t.docTop);
      const glyphLoY = -fSize * 0.08 * titleScale;
      const glyphHiY = (boxH * 0.94) * titleScale;
      if (mctx) mctx.font = `${t.fontWeight || '800'} ${fSize}px ${t.fontFamily}`;
      const angles = titleSprings.get(t.id)?.angles;

      const path = new Path2D();
      path.rect(0, 0, frame.W, frame.H);
      let hasAny = false;
      let zSum = 0;
      let zCount = 0;
      let cursorX = t.x0;

      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const adv = mctx
          ? Math.max(fSize * 0.28, mctx.measureText(ch).width)
          : (/\s/.test(ch) ? fSize * 0.3 : /[^\x00-\xff]/.test(ch) ? fSize * 1.02 : fSize * 0.58);
        const rawCx = t.charCenters?.[i] ?? (cursorX + adv * 0.5);
        const cx = t.x0 + (rawCx - t.x0) * titleScale;
        cursorX += adv;
        if (/\s/.test(ch)) continue;

        const halfW = Math.max(adv * 0.46, fSize * 0.32) * titleScale;
        const turn = angles?.[i] ?? 0;
        const pts = [
          standingCharPos(cx, -halfW, glyphLoY, 0, baseRow, 1, standRad, turn, floatPx),
          standingCharPos(cx, halfW, glyphLoY, 0, baseRow, 1, standRad, turn, floatPx),
          standingCharPos(cx, halfW, glyphHiY, 0, baseRow, 1, standRad, turn, floatPx),
          standingCharPos(cx, -halfW, glyphHiY, 0, baseRow, 1, standRad, turn, floatPx),
          standingCharPos(cx, -halfW, glyphLoY, thick, baseRow, 1, standRad, turn, floatPx),
          standingCharPos(cx, halfW, glyphLoY, thick, baseRow, 1, standRad, turn, floatPx),
          standingCharPos(cx, halfW, glyphHiY, thick, baseRow, 1, standRad, turn, floatPx),
          standingCharPos(cx, -halfW, glyphHiY, thick, baseRow, 1, standRad, turn, floatPx),
        ]
          .map((p) => projectPoint(frame, p[0], p[1], p[2]))
          .filter((p): p is NonNullable<typeof p> => !!p);

        if (pts.length >= 4) {
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          let minZ = Infinity;
          for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
            if (p.z < minZ) minZ = p.z;
          }
          if (maxX > -20 && minX < frame.W + 20 && maxY > -20 && minY < frame.H + 20) {
            path.rect(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
            hasAny = true;
            zSum += minZ;
            zCount++;
          }
        }
      }

      if (hasAny && zCount > 0) {
        out.push({ path, z: zSum / zCount });
      }
    }
    return out;
  }

  function renderWiresOverlay(
    frame: CurveFrame | null,
    scrollY: number,
    railWireStart: [number, number] | null,
    tiltByCard: Map<number, number>,
    dt: number,
    nowSec: number,
  ): boolean {
    if (!wireCtx || !wireCanvas) return false;
    const wireVis = frame ? frame.rise : 0;
    if (!frame || frame.fade <= 0.004) {
      clearWireOverlay();
      wireHeads.clear();
      return false;
    }

    const dpr = clamp(win.devicePixelRatio || 1, 1, 2);
    const pxW = Math.max(1, Math.round(frame.W * dpr));
    const pxH = Math.max(1, Math.round(frame.H * dpr));
    if (wireCanvas.width !== pxW || wireCanvas.height !== pxH) {
      wireCanvas.width = pxW;
      wireCanvas.height = pxH;
    }

    const ctx = wireCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, frame.W, frame.H);

    // Build Shopify even-odd occlusion covers FIRST so raised standing cards occlude rulers, floating 3D props, wires AND ambient spiders behind them!
    const tiltedSlabs: { id: number; x0: number; x1: number; r0: number; r1: number; elev: number; tiltRad: number }[] = [];
    for (const c of cardLayouts) {
      const tilt = tiltByCard.get(c.id) ?? 0;
      if (tilt <= 0.01) continue;
      const r0 = c.docTop - scrollY + frame.lead;
      const r1 = c.docBottom - scrollY + frame.lead;
      if (r1 < 0 || r0 > frame.T) continue;
      const cr0 = clamp(r0, 0, frame.T);
      const cr1 = clamp(r1, 0, frame.T);
      const tiltRad = tilt * CURVE_CONFIG.tiltDeg * DEG * frame.rise;
      if (tiltRad <= 0.05) continue;
      const elev = cardElevAt(frame, cr0, cr1, c.id === hoveredCardId, c.depthScale ?? 1);
      tiltedSlabs.push({ id: c.id, x0: c.x0, x1: c.x1, r0: cr0, r1: cr1, elev, tiltRad });
    }

    const covers = computeRaisedCovers(frame, tiltedSlabs);
    const coverPaths = covers.map((cov) => {
      const p = new Path2D();
      p.rect(0, 0, frame.W, frame.H);
      p.moveTo(cov.ring[0].x, cov.ring[0].y);
      for (let i = 1; i < cov.ring.length; i++) p.lineTo(cov.ring[i].x, cov.ring[i].y);
      p.closePath();
      return p;
    });
    const occluders = { covers, coverPaths };
    (occluders as OccluderSet).titleCovers = computeTitleCovers(frame, scrollY);

    // 1) Paper-edge rulers (stopping cleanly at paper bottom edge `paperEndDocY`), formulas, tumbling cubes & 8 floating polyhedra — occluded by raised cards!
    const paperEndDocY = contentEndDocY + 48;
    sideProps.render(ctx, frame, scrollY, paperEndDocY, groupMarks, nowSec, {
      inkRgb: wireRgb,
      voidBgHex,
      accentRgb,
      isDark: isDarkTheme,
    }, occluders);

    if (wireVis <= 0.004 || !railWireStart) {
      if (wireVis <= 0.004) wireHeads.clear();
      game.render(ctx, frame, scrollY, paperEndDocY, wireRgb, accentRgb, voidBgHex, isDarkTheme, occluders);
      return false;
    }

    const from = { x: railWireStart[0], y: railWireStart[1] };
    const topClip = 72;
    const botClip = frame.H - 76;
    const groupCards = cardLayouts.filter((c) => c.groupIdx === activeRailIdx);
    const candidateIds = new Set<number>();
    for (const c of groupCards) {
      if (candidateIds.size >= 4) break;
      const r0 = c.docTop - scrollY + frame.lead;
      const r1 = c.docBottom - scrollY + frame.lead;
      if (r1 >= 0 && r0 <= frame.T) candidateIds.add(c.id);
    }
    if (candidateIds.size === 0) {
      for (const c of cardLayouts) {
        if (candidateIds.size >= 3) break;
        const r0 = c.docTop - scrollY + frame.lead;
        const r1 = c.docBottom - scrollY + frame.lead;
        if (r1 >= 0 && r0 <= frame.T) candidateIds.add(c.id);
      }
    }
    if (raisedId >= 0) candidateIds.add(raisedId);

    const [wr, wg, wb] = wireRgb;
    const baseAlpha = (isDarkTheme ? 0.44 : 0.42) * wireVis;
    let animating = false;

    for (const c of cardLayouts) {
      const r0 = c.docTop - scrollY + frame.lead;
      const r1 = c.docBottom - scrollY + frame.lead;
      const cr0 = clamp(r0, 0, frame.T);
      const cr1 = clamp(r1, 0, frame.T);
      const tilt = tiltByCard.get(c.id) ?? 0;
      const tiltRad = tilt * CURVE_CONFIG.tiltDeg * DEG * frame.rise;
      const elev = cardElevAt(frame, cr0, cr1, c.id === hoveredCardId, c.depthScale ?? 1);

      let endPt: { x: number; y: number; z: number } | null = null;
      if (r1 >= 0 && r0 <= frame.T && cr1 > cr0 + 2) {
        const hSpan = cr1 - cr0;
        const offsetTop = Math.min(42, hSpan * 0.22);
        const along = Math.max(0, hSpan - offsetTop);
        const p3d = tiltRad > 0.002
          ? hingePoint(c.x0, along, elev, cr1, 0, tiltRad)
          : [c.x0, cr0 + offsetTop, elev] as [number, number, number];
        endPt = projectPoint(frame, p3d[0], p3d[1], p3d[2]);
      }

      const want =
        candidateIds.has(c.id) &&
        !!endPt &&
        endPt.x > from.x + 18 &&
        endPt.y > topClip &&
        endPt.y < botClip;

      let head = wireHeads.get(c.id) ?? 0;
      if (want && head < 1) {
        head = Math.min(1, head + dt / WIRE_STYLE.drawInSec);
        wireHeads.set(c.id, head);
        if (head < 1) animating = true;
      } else if (!want && head > 0) {
        head = Math.max(0, head - dt / WIRE_STYLE.drawOutSec);
        if (head <= 0.001) wireHeads.delete(c.id);
        else {
          wireHeads.set(c.id, head);
          animating = true;
        }
      }

      if (head <= 0.001 || !endPt || endPt.x <= from.x + 10) continue;

      const reach = 1 - (1 - head) ** 3;
      const to = { x: endPt.x, y: endPt.y };
      const handle = wireHandle(from, to);

      // Shopify exact occlusion check: only clip wires whose endpoint depth is behind a raised cover
      const behindIdx: number[] = [];
      for (let ci = 0; ci < covers.length; ci++) {
        if (covers[ci].cardId === c.id) continue;
        if (endPt.z > covers[ci].depthAt(endPt.x, endPt.y) + 1) behindIdx.push(ci);
      }

      ctx.save();
      for (const ci of behindIdx) ctx.clip(coverPaths[ci], 'evenodd');

      // 1) Silky 0.75px Bezier wire with Shopify's start->mid->end soft opacity fade
      const segs = Math.max(4, Math.ceil(28 * reach));
      ctx.lineWidth = WIRE_STYLE.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      let prev = from;
      for (let s = 1; s <= segs; s++) {
        const u = (s / segs) * reach;
        const pt = wireBezierPoint(from, to, handle, u);
        const uMid = ((s - 0.5) / segs) * reach;
        const segAlpha = baseAlpha * wireFadeWeight(uMid);
        ctx.strokeStyle = `rgba(${wr},${wg},${wb},${segAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        prev = pt;
      }

      // 2) Shopify's gentle flowing light pulses along fully connected wires
      if (head >= 0.99 && baseAlpha > 0.05) {
        animating = true;
        ctx.lineWidth = WIRE_STYLE.pulseWidth;
        const seed = ((c.id * 0.371) % 1 + 1) % 1;
        for (let k = 0; k < WIRE_STYLE.pulses; k++) {
          const pHead = ((nowSec / WIRE_STYLE.pulseSeconds) + k / WIRE_STYLE.pulses + seed) % 1;
          const pTail = Math.max(0, pHead - WIRE_STYLE.pulseTail);
          if (pHead - pTail < 0.005) continue;
          const pFade = Math.min(1, pHead / 0.1, (1 - pHead) / 0.2);
          const pAlpha = baseAlpha * 1.15 * pFade;
          if (pAlpha < 0.01) continue;
          let pp = wireBezierPoint(from, to, handle, pTail);
          for (let s = 1; s <= 8; s++) {
            const frac = s / 8;
            const np = wireBezierPoint(from, to, handle, pTail + (pHead - pTail) * frac);
            ctx.strokeStyle = `rgba(${wr},${wg},${wb},${(pAlpha * frac).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(pp.x, pp.y);
            ctx.lineTo(np.x, np.y);
            ctx.stroke();
            pp = np;
          }
        }
      }

      // 3) Subtle marker dot at the card attachment edge
      if (reach >= 0.98) {
        ctx.fillStyle = `rgba(${wr},${wg},${wb},${Math.min(1, baseAlpha * 1.65).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(to.x, to.y, WIRE_STYLE.markerRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // 3) 3D Runway Runner Mini-Game: start console & spider OUTSIDE paper bottom edge (`paperEndDocY`), ambient spiders, course & finish board
    game.render(ctx, frame, scrollY, paperEndDocY, wireRgb, accentRgb, voidBgHex, isDarkTheme, occluders);

    return animating;
  }

  function syncGameDock(_t: number, scrollY: number, _frame: CurveFrame | null) {
    if (!gameDock) return;
    // When the 3D overlay canvas is active (`wireCtx !== null`), the start bar, minimal top HUD, and rising 3D finish board
    // all render directly on canvas in exact Shopify style, keeping the DOM dock visually silent while preserving accessible state.
    const visible = isDesktopStage() && game.phase !== 'idle';
    gameDock.dataset.mode = 'hud';
    gameDock.dataset.canvasUi = String(wireCtx !== null);
    gameDock.style.removeProperty('top');
    gameDock.dataset.visible = String(visible);
    gameDock.dataset.phase = game.phase;

    const snap = game.getHudSnapshot(cachedW || win.innerWidth || 1280, scrollY);
    if (gameStartLabel) {
      gameStartLabel.textContent = game.phase === 'playing' ? 'stop ×' : game.phase === 'finished' ? 'replay ↑' : 'start ↑';
    }
    if (gameSpeedEl) {
      gameSpeedEl.textContent = game.phase === 'playing'
        ? `${snap.speedPx.toLocaleString('en-US')} px/s`
        : 'v ≥ 350 px/s';
    }
    if (gameDistEl) {
      gameDistEl.textContent = `↑ ${snap.remainingPx.toLocaleString('en-US')} px`;
    }
    if (gameWidthEl) {
      gameWidthEl.textContent = `page W = ${snap.pageWidthPx.toLocaleString('en-US')} px`;
    }
    if (gameFinishEl) {
      gameFinishEl.hidden = game.phase !== 'finished';
      if (game.phase === 'finished') {
        if (gameGradeEl) gameGradeEl.textContent = snap.fellInHole ? 'HOLE' : snap.grade;
        const finishHeading = gameFinishEl.querySelector('strong');
        if (finishHeading) finishHeading.textContent = snap.fellInHole ? '掉进黑洞了' : '冲线完成';
        if (gameSummaryEl) {
          gameSummaryEl.textContent = `融合 ${snap.collected} 节点（${snap.totalLegs} 足）· 粘起 ${snap.wordsEaten} 词 · 跃洞 ${snap.jumpsCleared} 次 · 用时 ${snap.elapsedSec.toFixed(1)} s`;
        }
      }
    }
  }

  function updateRail(scrollPos: number): [number, number] | null {
    if (!railButtons.length || !groups.length) return null;
    const focalDocY = scrollPos + (isDesktopStage() && currentT > 0.2 ? (cachedH || 800) * 0.44 : 200);
    let activeIdx = -1;
    const curScrollY = win.scrollY || 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (railButtons[i]) railButtons[i].hidden = g.hidden;
      if (g.hidden) continue;
      if (activeIdx < 0) activeIdx = i;
      const topDoc = g.getBoundingClientRect().top + curScrollY;
      if (topDoc <= focalDocY) activeIdx = i;
    }
    if (activeIdx < 0) activeIdx = 0;
    activeRailIdx = activeIdx;
    for (let i = 0; i < railButtons.length; i++) {
      railButtons[i].setAttribute('aria-current', String(i === activeIdx));
    }
    renderRailArcs(activeIdx);
    if (railMetrics?.hasRealRect && railMetrics.ys[activeIdx] !== undefined) {
      return [railMetrics.left + railMetrics.dotX, railMetrics.top + railMetrics.ys[activeIdx]];
    }
    return null;
  }

  function applyFrame(t: number, scrollY: number, dt = 1 / 60): boolean {
    const tiltDeg = t * TILT_MAX_DEG;
    stage.style.setProperty('--res-t', t.toFixed(4));
    stage.style.setProperty('--runway-tilt', `${tiltDeg.toFixed(2)}deg`);

    // Smooth crossfade in the flat handoff zone (t in [0, 0.16]) + search bar fade + starfield infinity fade
    const useGpu = !!renderer && isDesktopStage() && (t > 0.004 || animStart >= 0);
    const canvasOp = useGpu ? smoothstep(0.0, 0.16, t) : 0;
    const domOp = useGpu ? 1 - smoothstep(0.04, 0.2, t) : 1;
    const vis2d = isDesktopStage() ? 1 - smoothstep(0.0, 0.28, t) : 1;
    stage.style.setProperty('--res-canvas-op', canvasOp.toFixed(4));
    stage.style.setProperty('--res-dom-op', domOp.toFixed(4));
    stage.dataset.domHidden = String(useGpu && domOp <= 0.005);
    doc.body.style.setProperty('--res-2d-vis', vis2d.toFixed(4));

    const dockFloat = isDesktopStage() && t >= 0.3;
    stage.dataset.controlsDock = dockFloat ? 'float' : 'inline';
    const controlsOp = isDesktopStage()
      ? (dockFloat ? smoothstep(0.36, 0.68, t) : 1 - smoothstep(0.02, 0.24, t))
      : 1;
    stage.style.setProperty('--res-controls-op', controlsOp.toFixed(4));

    syncToggleUI();

    const now = nowMs();
    const tiltByCard = new Map<number, number>();
    for (const [id] of [...tiltAnims]) {
      const v = evalTilt(id, now, scrollY);
      if (v > 0.001) tiltByCard.set(id, v);
    }
    if (raisedId >= 0) {
      const anim = tiltAnims.get(raisedId);
      const flattenedAtTop =
        t <= 0.004 && animStart < 0 && scrollY <= SCROLL_RESET_PX && !!anim && anim.at > SCROLL_TRIGGER_PX;
      if (flattenedAtTop) {
        tiltAnims.delete(raisedId);
        clearRaisedDom();
      } else if (!tiltByCard.has(raisedId) && !tiltAnims.has(raisedId)) {
        clearRaisedDom();
      }
    }

    stage.dataset.glActive = String(useGpu);
    const railWireStart = updateRail(scrollY);
    if (!useGpu) {
      syncGameDock(t, scrollY, null);
      clearWireOverlay();
      return false;
    }

    const w = cachedW || win.innerWidth || 1280;
    const h = cachedH || win.innerHeight || 800;
    const lead = cachedLead || computeLead(h);
    const frame = computeCurveFrame(t, w, h, lead);
    syncGameDock(t, scrollY, frame);

    const titleAngles = new Map<number, Float32Array>();
    for (const [tid, sp] of titleSprings) {
      titleAngles.set(tid, sp.angles);
    }

    const timeSec = (now - bootMs) / 1000;

    renderer!.render(
      {
        frame,
        scrollY,
        pageColor,
        cards: cardLayouts,
        banners: bannerLayouts,
        titles: titleLayouts,
        bands,
        hoveredCardId,
        raisedCardId: raisedId,
        copiedCardId,
        tiltByCard,
        titleAngles,
        dimAmount: 0,
        timeSec,
        paperEndDocY: contentEndDocY + 48,
      },
      win.devicePixelRatio || 1,
    );

    return renderWiresOverlay(frame, scrollY, railWireStart, tiltByCard, dt, timeSec);
  }

  function evaluateScrollIntent() {
    if (!isDesktopStage()) return;
    const sy = clamp(win.scrollY || 0, 0, maxScroll);
    if (!userForceFlat && !userForce3D) {
      if (sy >= SCROLL_TRIGGER_PX && animTo < 0.5) startTransition(1);
      else if (sy <= SCROLL_RESET_PX && animTo > 0.5) startTransition(0);
    }
  }

  function step() {
    rafId = 0;
    if (!live || !isDesktopStage()) return;

    const now = nowMs();
    const dt = lastStepMs > 0 ? Math.min(0.05, Math.max(0.001, (now - lastStepMs) / 1000)) : 1 / 60;
    lastStepMs = now;

    if (themeDirty) {
      const mixed = pendingMixedTheme;
      pendingMixedTheme = null;
      flushTheme(true, mixed ?? undefined);
    }

    // Update 800ms timeline
    if (animStart >= 0) {
      const rawU = clamp((now - animStart) / CURVE_CONFIG.durationMs, 0, 1);
      currentT = lerp(animFrom, animTo, rawU);
      if (rawU >= 1) {
        currentT = animTo;
        animStart = -1;
      }
    }

    // Active mini-game & post-finish celebration drive camera smoothly; otherwise track native scroll
    let gameMoving = false;
    if (game.isPlayingOrFinished()) {
      gameMoving = game.step(dt, cachedW || win.innerWidth || 1280);
      const pending = game.consumePendingAction();
      if (pending === 'close') {
        syncGameDock(currentT, currentScroll, null);
      } else {
        currentScroll = clamp(game.scrollY, 0, maxScroll);
        win.scrollTo(0, currentScroll);
      }
    } else {
      game.step(dt, cachedW || win.innerWidth || 1280);
      const targetScroll = clamp(win.scrollY || 0, 0, maxScroll);
      const diffScroll = targetScroll - currentScroll;
      if (Math.abs(diffScroll) < 0.4 || currentT < 0.18) currentScroll = targetScroll;
      else currentScroll += diffScroll * 0.34;
    }

    if (currentT > 0.05) {
      sideProps.step(dt);
    }

    let anyTitleMoving = false;
    for (const sp of titleSprings.values()) {
      if (sp.step(dt)) anyTitleMoving = true;
    }

    const railArcMoving = stepRailArcs(dt);
    const hasTiltAnim = [...tiltAnims.values()].some((a) => now - a.t0 < CURVE_CONFIG.tiltDurationMs);
    const wireMoving = applyFrame(currentT, currentScroll, dt);
    glDirty = false;

    const targetScroll = clamp(win.scrollY || 0, 0, maxScroll);
    const diffScroll = game.isPlayingOrFinished() ? 0 : targetScroll - currentScroll;
    const ambient3D = currentT > 0.05 && !reducedMotion() && wireCtx !== null;
    if (
      animStart >= 0 ||
      Math.abs(diffScroll) >= 0.4 ||
      hasTiltAnim ||
      anyTitleMoving ||
      railArcMoving ||
      wireMoving ||
      gameMoving ||
      ambient3D
    ) {
      rafId = win.requestAnimationFrame(step);
    } else {
      lastStepMs = 0;
    }
  }

  function requestFrame() {
    if (!live || !isDesktopStage() || rafId) return;
    rafId = win.requestAnimationFrame(step);
  }

  function setRaised(card: HTMLElement | null) {
    const now = nowMs();
    const curSy = clamp(win.scrollY || 0, 0, maxScroll);
    if (raisedId >= 0) {
      const prevTilt = evalTilt(raisedId, now, currentScroll);
      if (prevTilt > 0) tiltAnims.set(raisedId, { from: prevTilt, to: 0, t0: now, at: -1 });
    }
    if (raisedCard && raisedCard !== card) {
      delete raisedCard.dataset.raised;
      raisedCard.setAttribute('aria-expanded', 'false');
    }

    raisedCard = card;
    raisedId = card ? cards.indexOf(card) : -1;

    if (card && raisedId >= 0) {
      card.dataset.raised = 'true';
      card.setAttribute('aria-expanded', 'true');
      stage.dataset.hasRaised = 'true';
      const curTilt = evalTilt(raisedId, now, currentScroll);
      tiltAnims.set(raisedId, { from: curTilt, to: 1, t0: now, at: curSy });
    } else {
      delete stage.dataset.hasRaised;
    }
    requestFrame();
  }

  function pickTitleAt(clientX: number, clientY: number): { title: ResourceTitleLayout; charIdx: number; len: number } | null {
    if (!renderer || stage.dataset.glActive !== 'true' || currentT < 0.35) return null;
    const h = cachedH || win.innerHeight || 800;
    const w = cachedW || win.innerWidth || 1280;
    const lead = cachedLead || computeLead(h);
    const frame = computeCurveFrame(currentT, w, h, lead);
    const floatPx = CURVE_CONFIG.headingFloat * frame.rise;
    const standRad = CURVE_CONFIG.headingStandDeg * DEG * frame.rise;
    const titleScale = lerp(1, CURVE_CONFIG.titleScale3D, frame.rise);
    const thick = 20 * frame.rise;
    const mctx = getPickMeasureCtx();

    for (const t of titleLayouts) {
      const baseRow = t.docBottom - currentScroll + frame.lead;
      if (baseRow < -160 || baseRow > frame.T + 160) continue;
      const chars = [...t.text];
      const fSize = Math.max(16, t.fontSize);
      const boxH = Math.max(fSize * 1.04, t.docBottom - t.docTop);
      const cellH = Math.ceil(boxH * 1.32);
      const loY = (boxH * 0.5 - cellH * 0.5) * titleScale;
      const hiY = (boxH * 0.5 + cellH * 0.5) * titleScale;
      if (mctx) mctx.font = `${t.fontWeight || '800'} ${fSize}px ${t.fontFamily}`;
      const angles = titleSprings.get(t.id)?.angles;

      let cursorX = t.x0;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const adv = mctx
          ? Math.max(fSize * 0.28, mctx.measureText(ch).width)
          : (/\s/.test(ch) ? fSize * 0.3 : /[^\x00-\xff]/.test(ch) ? fSize * 1.02 : fSize * 0.58);
        const rawCx = t.charCenters?.[i] ?? (cursorX + adv * 0.5);
        const cx = t.x0 + (rawCx - t.x0) * titleScale;
        cursorX += adv;
        if (/\s/.test(ch)) continue;

        const hitW = Math.max(adv * 0.55, fSize * 0.42) * titleScale;
        const turn = angles?.[i] ?? 0;
        const corners = [
          standingCharPos(cx, -hitW, loY, thick, baseRow, 1, standRad, turn, floatPx),
          standingCharPos(cx, hitW, loY, thick, baseRow, 1, standRad, turn, floatPx),
          standingCharPos(cx, hitW, hiY, thick, baseRow, 1, standRad, turn, floatPx),
          standingCharPos(cx, -hitW, hiY, thick, baseRow, 1, standRad, turn, floatPx),
        ]
          .map((p) => projectPoint(frame, p[0], p[1], p[2]))
          .filter((p): p is NonNullable<typeof p> => !!p);
        if (corners.length === 4) {
          const minX = Math.min(...corners.map((c) => c.x)) - 4;
          const maxX = Math.max(...corners.map((c) => c.x)) + 4;
          const minY = Math.min(...corners.map((c) => c.y)) - 4;
          const maxY = Math.max(...corners.map((c) => c.y)) + 4;
          if (clientX >= minX && clientX <= maxX && clientY >= minY && clientY <= maxY) {
            return { title: t, charIdx: i, len: chars.length };
          }
        }
      }
    }
    return null;
  }

  function hitCardRect(x: number, y: number, r: CardRect, pad = 6): boolean {
    return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  }

  function pickRaisedCardLocal(
    frame: CurveFrame,
    rc: ResourceCardLayout,
    clientX: number,
    clientY: number,
    elev: number,
    tiltRad: number,
  ): [number, number] | null {
    const r1 = rc.docBottom - currentScroll + frame.lead;
    let col = (rc.x0 + rc.x1) * 0.5;
    let along = rc.height * 0.5;
    for (let i = 0; i < 6; i++) {
      const a = projectPoint(frame, ...hingePoint(col, along, elev, r1, 0, tiltRad));
      const c = projectPoint(frame, ...hingePoint(col + 1, along, elev, r1, 0, tiltRad));
      const l = projectPoint(frame, ...hingePoint(col, along + 1, elev, r1, 0, tiltRad));
      if (!a || !c || !l) return null;
      const h = c.x - a.x;
      const p = l.x - a.x;
      const f = c.y - a.y;
      const d = l.y - a.y;
      const det = h * d - p * f;
      if (Math.abs(det) < 1e-8) break;
      const u = clientX - a.x;
      const m = clientY - a.y;
      col += (d * u - p * m) / det;
      along += (h * m - f * u) / det;
    }
    const lx = col - rc.x0;
    const ly = rc.height - along;
    if (lx >= -6 && lx <= rc.width + 6 && ly >= -6 && ly <= rc.height + 6) {
      return [lx, ly];
    }
    return null;
  }

  function pickCardAt(clientX: number, clientY: number): number {
    if (!renderer || stage.dataset.glActive !== 'true') return -1;
    const h = cachedH || win.innerHeight || 800;
    const w = cachedW || win.innerWidth || 1280;
    const lead = cachedLead || computeLead(h);
    const frame = computeCurveFrame(currentT, w, h, lead);

    if (raisedId >= 0) {
      const rc = cardLayouts.find((c) => c.id === raisedId);
      if (rc) {
        const r0 = rc.docTop - currentScroll + frame.lead;
        const r1 = rc.docBottom - currentScroll + frame.lead;
        const elev = cardElevAt(frame, clamp(r0, 0, frame.T), clamp(r1, 0, frame.T), false, rc.depthScale ?? 1);
        const tiltRad = evalTilt(rc.id, nowMs(), currentScroll) * CURVE_CONFIG.tiltDeg * DEG * frame.rise;
        if (pickRaisedCardLocal(frame, rc, clientX, clientY, elev, tiltRad)) {
          return rc.id;
        }
      }
    }

    const sorted = [...cardLayouts].sort((a, b) => b.docBottom - a.docBottom);
    for (const card of sorted) {
      const r0 = card.docTop - currentScroll + frame.lead;
      const r1 = card.docBottom - currentScroll + frame.lead;
      if (r1 < 0 || r0 > frame.T) continue;
      const elev = cardElevAt(frame, clamp(r0, 0, frame.T), clamp(r1, 0, frame.T), false, card.depthScale ?? 1);
      const hit = unprojectPoint(frame, clientX, clientY, elev, [(card.x0 + card.x1) * 0.5, (r0 + r1) * 0.5]);
      if (!hit) continue;
      const [col, row] = hit;
      const docY = row + currentScroll - frame.lead;
      if (col >= card.x0 - 8 && col <= card.x1 + 8 && docY >= card.docTop - 8 && docY <= card.docBottom + 8) {
        return card.id;
      }
    }
    return -1;
  }

  function applyFilter() {
    const q = (searchInput?.value ?? '').trim().toLowerCase();
    let shown = 0;
    for (const card of cards) {
      const hit = !q || (card.dataset.q ?? '').includes(q);
      card.hidden = !hit;
      if (hit) shown++;
      else if (card === raisedCard) setRaised(null);
    }
    for (const group of groups) {
      const hasVisible = [...group.querySelectorAll<HTMLElement>('[data-res-card]')].some((c) => !c.hidden);
      group.hidden = !hasVisible;
    }
    if (clearBtn) clearBtn.hidden = !q;
    if (emptyEl) emptyEl.hidden = shown > 0;
    if (countEl) countEl.textContent = q ? `筛出 ${shown} / ${cards.length} 项` : `共 ${cards.length} 项`;
    syncStageMode();
    if (isDesktopStage()) {
      currentScroll = clamp(win.scrollY || 0, 0, maxScroll);
      applyFrame(currentT, currentScroll);
    }
  }

  function toggleDimension() {
    if (!isDesktopStage()) return;
    const isGoingFlat = animTo > 0.5 || currentT > 0.5;
    if (isGoingFlat) {
      userForceFlat = true;
      userForce3D = false;
      startTransition(0);
    } else {
      userForceFlat = false;
      userForce3D = (win.scrollY || 0) < SCROLL_TRIGGER_PX;
      startTransition(1);
    }
    syncToggleUI();
  }

  function wireCopyButton(btn: HTMLButtonElement) {
    listen(btn, 'click', (event) => {
      event.stopPropagation();
      const code = btn.dataset.copyCode ?? '';
      if (!code || !win.navigator?.clipboard?.writeText) return;
      void win.navigator.clipboard.writeText(code).then(() => {
        const orig = btn.textContent ?? '复制';
        btn.textContent = '已复制';
        win.setTimeout(() => {
          if (live) btn.textContent = orig;
        }, 1600);
      }).catch(() => {});
    });
  }

  function pickActiveRaisedCard(clientX: number, clientY: number): { rc: ResourceCardLayout; local: [number, number] } | null {
    if (raisedId < 0 || !renderer || stage.dataset.glActive !== 'true') return null;
    const rc = cardLayouts.find((c) => c.id === raisedId);
    if (!rc) return null;
    const h = cachedH || win.innerHeight || 800;
    const w = cachedW || win.innerWidth || 1280;
    const lead = cachedLead || computeLead(h);
    const frame = computeCurveFrame(currentT, w, h, lead);
    const r0 = rc.docTop - currentScroll + frame.lead;
    const r1 = rc.docBottom - currentScroll + frame.lead;
    const elev = cardElevAt(frame, clamp(r0, 0, frame.T), clamp(r1, 0, frame.T), false, rc.depthScale ?? 1);
    const tiltRad = evalTilt(rc.id, nowMs(), currentScroll) * CURVE_CONFIG.tiltDeg * DEG * frame.rise;
    const local = pickRaisedCardLocal(frame, rc, clientX, clientY, elev, tiltRad);
    return local ? { rc, local } : null;
  }

  function wireCanvasHandlers(targetCanvas: HTMLCanvasElement) {
    listen(targetCanvas, 'pointerdown', (event) => {
      const pe = event as PointerEvent;
      if (stage.dataset.glActive !== 'true') return;
      if (pe.button !== 0) return;
      // Foreground raised standing card ALWAYS wins over background ambient spiders & floating props!
      if (!game.isPlayingOrFinished() && pickActiveRaisedCard(pe.clientX, pe.clientY)) {
        return;
      }
      if (game.onPointerDown(pe.clientX, pe.clientY)) {
        try {
          targetCanvas.setPointerCapture?.(pe.pointerId);
        } catch {
          // ignore synthetic pointer events
        }
        targetCanvas.style.cursor = 'grabbing';
        pe.preventDefault();
        requestFrame();
        return;
      }
      if (game.isPlayingOrFinished()) return;
      if (sideProps.onPointerDown(pe.clientX, pe.clientY)) {
        try {
          targetCanvas.setPointerCapture?.(pe.pointerId);
        } catch {
          // ignore synthetic pointer events
        }
        targetCanvas.style.cursor = 'grabbing';
        pe.preventDefault();
        requestFrame();
      }
    });

    listen(targetCanvas, 'pointerup', (event) => {
      const pe = event as PointerEvent;
      if (game.isDraggingOrb()) {
        game.onPointerUp();
        try {
          targetCanvas.releasePointerCapture?.(pe.pointerId);
        } catch {
          // ignore
        }
        targetCanvas.style.cursor = game.isHoveringInteractive() ? 'pointer' : '';
        requestFrame();
      }
      if (sideProps.isDragging()) {
        sideProps.onPointerUp();
        try {
          targetCanvas.releasePointerCapture?.(pe.pointerId);
        } catch {
          // ignore
        }
        targetCanvas.style.cursor = sideProps.getCursor();
        requestFrame();
      }
    });

    listen(targetCanvas, 'pointercancel', () => {
      if (game.isDraggingOrb()) {
        game.onPointerUp();
        targetCanvas.style.cursor = '';
      }
      if (sideProps.isDragging()) {
        sideProps.onPointerUp();
        targetCanvas.style.cursor = '';
      }
    });

    listen(targetCanvas, 'pointermove', (event) => {
      const pe = event as PointerEvent;
      if (stage.dataset.glActive !== 'true') return;
      const moveDir = Math.abs(pe.clientX - lastPointerX) >= Math.abs(pe.clientY - lastPointerY)
        ? (pe.clientX >= lastPointerX ? 1 : -1)
        : 1;
      lastPointerX = pe.clientX;
      lastPointerY = pe.clientY;

      // If pointer is over a foreground raised standing card, do NOT leak hover/nudge to spiders or floating props behind it!
      if (!game.isPlayingOrFinished()) {
        const raisedHit = pickActiveRaisedCard(pe.clientX, pe.clientY);
        if (raisedHit) {
          const { rc, local } = raisedHit;
          if (hoveredCardId !== rc.id) {
            hoveredCardId = rc.id;
            glDirty = true;
            requestFrame();
          }
          const spots = computeCardHotspots(rc, cardSansFont, getPickMeasureCtx());
          const overInner = hitCardRect(local[0], local[1], spots.inner, 0);
          const overDetailLink = spots.detailLinks.some((l) => hitCardRect(local[0], local[1], l.rect, 4));
          const overBtn =
            (!!rc.href && rc.href !== '#' && hitCardRect(local[0], local[1], spots.cta)) ||
            (!!spots.copy && !!rc.code && hitCardRect(local[0], local[1], spots.copy)) ||
            overDetailLink;
          targetCanvas.style.cursor = overBtn || !overInner ? 'pointer' : 'default';
          return;
        }
      }

      const hitGame = game.onPointerMove(pe.clientX, pe.clientY);
      if (game.isDraggingOrb()) {
        targetCanvas.style.cursor = 'grabbing';
        requestFrame();
        return;
      }
      if (hitGame) {
        targetCanvas.style.cursor = 'pointer';
        requestFrame();
      }
      if (game.isPlayingOrFinished()) {
        if (!hitGame) targetCanvas.style.cursor = '';
        return;
      }

      const hitProp = sideProps.onPointerMove(pe.clientX, pe.clientY);
      if (sideProps.isDragging()) {
        targetCanvas.style.cursor = 'grabbing';
        requestFrame();
        return;
      }
      if (hitProp) {
        targetCanvas.style.cursor = sideProps.getCursor() || 'pointer';
        requestFrame();
      }

      const hitTitle = pickTitleAt(pe.clientX, pe.clientY);
      if (hitTitle) {
        titleSprings.get(hitTitle.title.id)?.hover(hitTitle.charIdx, hitTitle.len, moveDir);
        targetCanvas.style.cursor = 'pointer';
        requestFrame();
        return;
      }

      const id = pickCardAt(pe.clientX, pe.clientY);
      if (id !== hoveredCardId) {
        hoveredCardId = id;
        glDirty = true;
        requestFrame();
      }
      if (raisedId >= 0 && id === raisedId) {
        const rc = cardLayouts.find((c) => c.id === raisedId);
        if (rc) {
          const h = cachedH || win.innerHeight || 800;
          const w = cachedW || win.innerWidth || 1280;
          const lead = cachedLead || computeLead(h);
          const frame = computeCurveFrame(currentT, w, h, lead);
          const r0 = rc.docTop - currentScroll + frame.lead;
          const r1 = rc.docBottom - currentScroll + frame.lead;
          const elev = cardElevAt(frame, clamp(r0, 0, frame.T), clamp(r1, 0, frame.T), false);
          const tiltRad = evalTilt(rc.id, nowMs(), currentScroll) * CURVE_CONFIG.tiltDeg * DEG * frame.rise;
          const local = pickRaisedCardLocal(frame, rc, pe.clientX, pe.clientY, elev, tiltRad);
          if (local) {
            const spots = computeCardHotspots(rc, cardSansFont, getPickMeasureCtx());
            const overInner = hitCardRect(local[0], local[1], spots.inner, 0);
            const overDetailLink = spots.detailLinks.some((l) => hitCardRect(local[0], local[1], l.rect, 4));
            const overBtn =
              (!!rc.href && rc.href !== '#' && hitCardRect(local[0], local[1], spots.cta)) ||
              (!!spots.copy && !!rc.code && hitCardRect(local[0], local[1], spots.copy)) ||
              overDetailLink;
            targetCanvas.style.cursor = overBtn || !overInner ? 'pointer' : 'default';
            return;
          }
        }
      }
      targetCanvas.style.cursor = id >= 0 || hitGame ? 'pointer' : (hitProp ? sideProps.getCursor() : '');
    });

    listen(targetCanvas, 'pointerleave', () => {
      game.onPointerLeave();
      sideProps.onPointerLeave();
      if (hoveredCardId >= 0) {
        hoveredCardId = -1;
        targetCanvas.style.cursor = '';
        glDirty = true;
        requestFrame();
      }
    });

    listen(targetCanvas, 'click', (event) => {
      const me = event as MouseEvent;
      if (stage.dataset.glActive !== 'true') return;

      // Foreground raised standing card ALWAYS handles clicks FIRST so spiders/props behind it never swallow clicks!
      if (!game.isPlayingOrFinished()) {
        const raisedHit = pickActiveRaisedCard(me.clientX, me.clientY);
        if (raisedHit) {
          const { rc, local } = raisedHit;
          const [lx, ly] = local;
          const spots = computeCardHotspots(rc, cardSansFont, getPickMeasureCtx());
          if (hitCardRect(lx, ly, spots.cta) && rc.href && rc.href !== '#') {
            if (/^https?:/i.test(rc.href)) win.open(rc.href, '_blank', 'noopener,noreferrer');
            else win.location.href = rc.href;
            return;
          }
          if (spots.copy && rc.code && hitCardRect(lx, ly, spots.copy)) {
            if (win.navigator?.clipboard?.writeText) {
              void win.navigator.clipboard.writeText(rc.code).catch(() => {});
            }
            copiedCardId = rc.id;
            if (copiedTimer) win.clearTimeout(copiedTimer);
            copiedTimer = win.setTimeout(() => {
              if (!live) return;
              copiedCardId = -1;
              glDirty = true;
              requestFrame();
            }, 1600);
            glDirty = true;
            requestFrame();
            return;
          }
          const hitDetailLink = spots.detailLinks.find((l) => hitCardRect(lx, ly, l.rect, 4));
          if (hitDetailLink) {
            win.open(hitDetailLink.href, '_blank', 'noopener,noreferrer');
            return;
          }
          // Clicking inside the center white/black showcase box keeps the module raised (and blocks spiders behind it); only clicking the outer colored border lowers it!
          if (hitCardRect(lx, ly, spots.inner, 0)) {
            return;
          }
          setRaised(null);
          return;
        }
      }

      const gameClick = game.onClick(me.clientX, me.clientY);
      if (gameClick === 'start') {
        launchGame();
        return;
      }
      if (gameClick === 'again') {
        game.requestAgain();
        requestFrame();
        return;
      }
      if (gameClick === 'close') {
        game.requestClose();
        syncGameDock(currentT, currentScroll, null);
        requestFrame();
        return;
      }
      if (gameClick === 'orb') {
        requestFrame();
        return;
      }
      if (game.isPlayingOrFinished()) return;
      if (sideProps.onClick(me.clientX, me.clientY)) {
        requestFrame();
        return;
      }
      const hitTitle = pickTitleAt(me.clientX, me.clientY);
      if (hitTitle) {
        titleSprings.get(hitTitle.title.id)?.wave(hitTitle.len, 1);
        requestFrame();
        return;
      }

      const id = pickCardAt(me.clientX, me.clientY);
      if (id >= 0) {
        const targetCard = cards[id];
        if (targetCard) {
          setRaised(raisedCard === targetCard ? null : targetCard);
          return;
        }
      }
      if (raisedCard) setRaised(null);
    });
  }

  for (const card of cards) {
    listen(card, 'click', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('a, button[data-copy-code]')) return;
      if (raisedCard === card) {
        if (target?.closest('.res-card-stage')) return;
        setRaised(null);
        return;
      }
      setRaised(card);
    });
    listen(card, 'keydown', (event) => {
      const ke = event as KeyboardEvent;
      if (ke.key !== 'Enter' && ke.key !== ' ') return;
      const target = ke.target as HTMLElement | null;
      if (target !== card && target?.closest('a, button')) return;
      ke.preventDefault();
      setRaised(raisedCard === card ? null : card);
    });
    const copyBtn = card.querySelector<HTMLButtonElement>('[data-copy-code]');
    if (copyBtn) wireCopyButton(copyBtn);
  }

  if (canvas) wireCanvasHandlers(canvas);

  listen(stage, 'click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target === canvas) return;
    if (!target?.closest('[data-res-card], [data-dim-toggle], [data-res-rail], [data-res-search], [data-res-clear], [data-res-game-dock]')) {
      if (raisedCard) setRaised(null);
    }
  });

  function launchGame() {
    if (!isDesktopStage()) return;
    setRaised(null);
    userForceFlat = false;
    userForce3D = true;
    startTransition(1);
    const launchScroll = Math.max(getBottomScroll(), 600);
    game.start(launchScroll);
    currentScroll = game.scrollY;
    win.scrollTo(0, currentScroll);
    syncGameDock(Math.max(currentT, 1), currentScroll, null);
    requestFrame();
  }

  function exitGame() {
    game.stop();
    syncGameDock(currentT, currentScroll, null);
    requestFrame();
  }

  if (gameStartBtn) {
    listen(gameStartBtn, 'click', () => {
      if (game.isActive()) exitGame();
      else launchGame();
    });
  }
  if (gameReplayBtn) {
    listen(gameReplayBtn, 'click', () => launchGame());
  }
  if (gameExitBtn) {
    listen(gameExitBtn, 'click', () => exitGame());
  }

  if (dimToggle) {
    listen(dimToggle, 'click', () => toggleDimension());
    listen(dimToggle, 'pointerenter', () => {
      hoverCorner = 1;
      syncCornerIcon(currentT);
    });
    listen(dimToggle, 'pointerleave', () => {
      hoverCorner = 0;
      syncCornerIcon(currentT);
    });
  }

  for (let i = 0; i < railButtons.length; i++) {
    const btn = railButtons[i];
    const enterRail = () => {
      if (hoveredRailIdx !== i) {
        hoveredRailIdx = i;
        syncRailHoverTarget(i);
        renderRailArcs(activeRailIdx);
        requestFrame();
      }
    };
    const leaveRail = () => {
      if (hoveredRailIdx === i) {
        hoveredRailIdx = -1;
        syncRailHoverTarget(-1);
        requestFrame();
      }
    };
    listen(btn, 'pointerenter', enterRail);
    listen(btn, 'focus', enterRail);
    listen(btn, 'pointerleave', leaveRail);
    listen(btn, 'blur', leaveRail);
    listen(btn, 'click', () => {
      const g = groups[i];
      if (!g || g.hidden) return;
      setRaised(null);
      if (isDesktopStage()) {
        const groupTop = g.getBoundingClientRect().top + (win.scrollY || 0);
        const dest = clamp(groupTop - 160, 0, maxScroll);
        win.scrollTo({ top: dest, behavior: 'smooth' });
      } else {
        g.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  if (railEl) {
    listen(railEl, 'pointerleave', () => {
      if (hoveredRailIdx >= 0) {
        hoveredRailIdx = -1;
        syncRailHoverTarget(-1);
        requestFrame();
      }
    });
  }

  if (searchInput) listen(searchInput, 'input', () => applyFilter());
  if (clearBtn && searchInput) {
    listen(clearBtn, 'click', () => {
      searchInput.value = '';
      applyFilter();
      searchInput.focus();
    });
  }

  listen(win, 'scroll', () => {
    const sy = win.scrollY || 0;
    evaluateScrollIntent();
    if (userForce3D && sy >= SCROLL_TRIGGER_PX) userForce3D = false;
    requestFrame();
  }, { passive: true });

  listen(win, 'resize', () => {
    syncStageMode();
    if (isDesktopStage()) {
      currentScroll = clamp(win.scrollY || 0, 0, maxScroll);
      applyFrame(currentT, currentScroll);
    }
  });

  listen(doc, 'keydown', (event) => {
    const ke = event as KeyboardEvent;
    const active = doc.activeElement;
    const typing = !!active && active.matches('input, textarea, select, [contenteditable="true"]');
    if (!typing && game.isPlayingOrFinished()) {
      if (game.onKeyDown(ke.key)) {
        ke.preventDefault();
        syncGameDock(currentT, currentScroll, null);
        requestFrame();
        return;
      }
    }
    if (ke.key === 'Escape' && raisedCard) {
      const raised = raisedCard;
      setRaised(null);
      raised.focus({ preventScroll: true });
      return;
    }
    if ((ke.key === '`' || ke.key === '~' || ke.code === 'Backquote') && !ke.ctrlKey && !ke.metaKey && !ke.altKey) {
      if (typing) return;
      ke.preventDefault();
      toggleDimension();
    }
  });

  listen(doc, 'keyup', (event) => {
    const ke = event as KeyboardEvent;
    if (game.isActive()) game.onKeyUp(ke.key);
  });

  listen(win, 'wheel', (event) => {
    if (!game.isActive()) return;
    const we = event as WheelEvent;
    we.preventDefault();
    game.onWheel(we.deltaY);
    syncGameDock(currentT, currentScroll, null);
    requestFrame();
  }, { passive: false });

  // Fast O(1) theme-slider preview hook: avoids full DOM getComputedStyle reflow on every frame while dragging the jelly toggle!
  listen(doc, 'themepreview', (event) => {
    const detail = (event as CustomEvent<{ progress?: number; mixed?: Record<string, string> } | null>).detail;
    if (detail && detail.mixed) {
      pendingMixedTheme = { ...detail.mixed };
      if (typeof detail.progress === 'number') {
        previewDarkOverride = detail.progress >= 0.5;
      }
      themeDirty = true;
      if (themeSettleTimer) {
        win.clearTimeout(themeSettleTimer);
        themeSettleTimer = 0;
      }
      requestFrame();
    } else {
      pendingMixedTheme = null;
      previewDarkOverride = null;
      if (themeSettleTimer) win.clearTimeout(themeSettleTimer);
      themeSettleTimer = win.setTimeout(() => {
        themeSettleTimer = 0;
        if (!live) return;
        flushTheme(false);
        requestFrame();
      }, 60);
    }
  });

  if (typeof win.MutationObserver === 'function') {
    const mo = new win.MutationObserver(() => {
      // During active jelly slider drag, `themepreview` already feeds pre-mixed colors with zero style recalc!
      if (doc.documentElement.classList.contains('theme-previewing')) return;
      themeDirty = true;
      if (themeSettleTimer) win.clearTimeout(themeSettleTimer);
      themeSettleTimer = win.setTimeout(() => {
        themeSettleTimer = 0;
        if (!live) return;
        flushTheme(false);
        requestFrame();
      }, 130);
      requestFrame();
    });
    mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
    cleanups.push(() => {
      mo.disconnect();
      if (themeSettleTimer) win.clearTimeout(themeSettleTimer);
    });
  }

  if (doc.fonts?.ready) {
    void doc.fonts.ready.then(() => {
      if (!live) return;
      renderer?.refreshTheme();
      syncLayoutCache();
      requestFrame();
    });
  }

  if (typeof win.ResizeObserver === 'function') {
    const ro = new win.ResizeObserver(() => {
      if (doc.documentElement.classList.contains('theme-previewing')) return;
      syncStageMode();
      if (isDesktopStage()) {
        currentScroll = clamp(win.scrollY || 0, 0, maxScroll);
        applyFrame(currentT, currentScroll);
      }
    });
    ro.observe(runway);
    cleanups.push(() => ro.disconnect());
  }

  // Boot GPU renderer async (WebGPU first, fresh canvas fallback to WebGL2)
  if (canvas && isDesktopStage()) {
    const onAsset = () => {
      glDirty = true;
      requestFrame();
    };
    void (async () => {
      try {
        let nextRenderer: Resources3DRenderer | null = await ResourcesWebGPURenderer.create(canvas!, stage, onAsset);
        if (!live) {
          nextRenderer?.dispose();
          return;
        }
        if (!nextRenderer) {
          const clone = canvas!.cloneNode(false) as HTMLCanvasElement;
          canvas!.replaceWith(clone);
          canvas = clone;
          wireCanvasHandlers(canvas);
          nextRenderer = ResourcesGLRenderer.create(canvas, stage, onAsset);
        }
        if (!live) {
          nextRenderer?.dispose();
          return;
        }
        renderer = nextRenderer;
        stage.dataset.gpuBackend = renderer ? renderer.backend : '2d';
        syncLayoutCache();
        evaluateScrollIntent();
        applyFrame(currentT, currentScroll);
        if (currentT > 0 || animStart >= 0) requestFrame();
      } catch {
        if (live) stage.dataset.gpuBackend = '2d';
      }
    })();
  }

  applyFilter();
  if (isDesktopStage()) {
    currentScroll = clamp(win.scrollY || 0, 0, maxScroll);
    evaluateScrollIntent();
    applyFrame(currentT, currentScroll);
  }

  return () => {
    live = false;
    doc.body.style.removeProperty('--res-2d-vis');
    if (rafId) win.cancelAnimationFrame(rafId);
    if (copiedTimer) win.clearTimeout(copiedTimer);
    for (const off of cleanups) off();
    renderer?.dispose();
    renderer = null;
  };
}

onPage(({ document }) => initResourcesRunway(document), '[data-resources-page]');
