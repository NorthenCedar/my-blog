// 页面过渡（2026-09-30 站主定案换成 v3；2026-11-22 改为即时两段式 + 内存预取）：
// SPA 换页时点击当帧立刻起播墨色覆盖（pt-cover），同时后台并行拉取页面与样式，
// DOM 替换后立刻平滑斜切揭幕（pt-reveal），避免点完干等加载再播动画。
// 非 SPA 整页刷新仍走 Base.astro 首帧同步标记 + pt-play 完整兜底。

import type { TransitionBeforePreparationEvent, TransitionBeforeSwapEvent } from 'astro:transitions/client';

const KEY = 'pt';
const root = document.documentElement;
// 保留原整页过渡时长（--pt-sweep = 900ms）与兜底清理上限，供整页导航及测试契约共用。
const HANDOFF_MS = 1000;
const STALE_MS = 1500;
const COVER_MS = 230;
const REVEAL_MS = 480;
const HOLD_MAX_MS = 600;
const CACHE_TTL = 600_000;
const CACHE_MAX = 32;
const PARSED_MAX = 8;
const BG_MAX = 2;
const VIEWPORT_DWELL_MS = 220;
const VIEWPORT_MAX = 6;
const IDLE_DELAY_MS = 1200;
const NAV_TRIGGER = '[data-nav-open],.navbtn';
const NO_PT = '[target="_blank"],[download],[data-no-transition]';
const SKIP_EXT = /\.(?:xml|json|webp|png|jpe?g|gif|svg|ico|pdf|mp3|mp4|m4a|zip|glb|hdr|woff2?)$/i;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

type PageDoc = { html: string; redirected?: string; mediaType: 'text/html' | 'application/xhtml+xml'; parsed?: Document };
type CacheEntry = { at: number; promise: Promise<PageDoc | null> };

const pageCache = new Map<string, CacheEntry>();
const warmedStyles = new Set<string>();
const readyStyles = new Set<string>();
const warmedModules = new Set<string>();
const parsedQueue: PageDoc[] = [];
const bgQueue: string[] = [];
const bgQueued = new Set<string>();
const dwellTimers = new Map<Element, number>();
let parser: DOMParser | undefined;
let bgActive = 0;
let viewportCount = 0;
let io: IntersectionObserver | undefined;
let idleTimer: number | undefined;
let idleCancel: (() => void) | undefined;

const absUrl = (raw: string): string | null => {
  try { return new URL(raw, location.href).href; } catch { return null; }
};

function runWhenIdle(fn: () => void, ms: number): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => fn(), { timeout: 600 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, ms);
  return () => window.clearTimeout(id);
}

/** 站内、可整页跳转的普通左键点击才值得盖（其余一律放行，别影响正常浏览）。 */
function precheck(e: MouseEvent, a: HTMLAnchorElement): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.matches(NO_PT) || a.origin !== location.origin) return false;
  return !(a.pathname === location.pathname && a.search === location.search);
}

function normalizeUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, location.href);
    if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return null;
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/write') || SKIP_EXT.test(u.pathname)) return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}

function networkReady(): boolean {
  if (!navigator.onLine) return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !(conn && (conn.saveData || /2g/.test(conn.effectiveType ?? '')));
}

function canPrefetch(el: Element | null): string | null {
  if (!el || el.tagName !== 'A' || !networkReady()) return null;
  if (el.matches(`${NO_PT},[data-astro-reload],[data-astro-prefetch="false"]`)) return null;
  return normalizeUrl((el as HTMLAnchorElement).href || el.getAttribute('href') || '');
}

const headUrls = (selector: string, attr: 'href' | 'src') => {
  const set = new Set<string>();
  for (const el of document.querySelectorAll(selector)) {
    const raw = el.getAttribute(attr);
    const url = raw && absUrl(raw);
    if (url) set.add(url);
  }
  return set;
};

function parseDocument(html: string, mediaType: PageDoc['mediaType']): Document {
  parser ??= new DOMParser();
  const doc = parser.parseFromString(html, mediaType);
  doc.querySelectorAll('noscript').forEach((el) => el.remove());
  return doc;
}

function scheduleIdleParse(page: PageDoc) {
  if (page.parsed) return;
  runWhenIdle(() => {
    if (page.parsed || document.visibilityState === 'hidden') return;
    page.parsed = parseDocument(page.html, page.mediaType);
    if (parsedQueue.length >= PARSED_MAX) {
      const old = parsedQueue.shift();
      if (old && old !== page) old.parsed = undefined;
    }
    parsedQueue.push(page);
  }, 120);
}

function preloadAssetsFromHtml(html: string) {
  const end = html.search(/<\/head>/i);
  const headHtml = end >= 0 ? html.slice(0, end) : html;
  const loadedCss = headUrls('head link[rel="stylesheet"]', 'href');
  const originPrefix = location.origin + '/';
  for (const [tag] of headHtml.matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)) {
    const m = tag.match(/\bhref=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const raw = m?.[1] ?? m?.[2] ?? m?.[3];
    const abs = raw && absUrl(raw);
    if (!abs || !abs.startsWith(originPrefix) || loadedCss.has(abs) || warmedStyles.has(abs)) continue;
    warmedStyles.add(abs);
    void fetch(abs, { priority: 'low' } as RequestInit)
      .then(async (res) => {
        if (!res.ok) { warmedStyles.delete(abs); return; }
        await res.text();
        readyStyles.add(abs);
      })
      .catch(() => { warmedStyles.delete(abs); });
  }
  const loadedJs = headUrls('script[src]', 'src');
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    if (!/\btype\s*=\s*(?:"module"|'module'|module(?=[\s/>]))/i.test(tag)) continue;
    const m = tag.match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const raw = m?.[1] ?? m?.[2] ?? m?.[3];
    const abs = raw && absUrl(raw);
    if (!abs || !abs.startsWith(originPrefix) || loadedJs.has(abs) || warmedModules.has(abs)) continue;
    warmedModules.add(abs);
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = abs;
    document.head.append(link);
  }
}

function fetchPage(url: string, prefetch: boolean): Promise<PageDoc | null> {
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    pageCache.delete(url);
    pageCache.set(url, cached);
    return cached.promise;
  }
  if (cached) pageCache.delete(url);

  const init: RequestInit & { priority?: string } = {
    headers: prefetch ? { Accept: 'text/html', Purpose: 'prefetch' } : { Accept: 'text/html' },
  };
  if (prefetch) init.priority = 'low';

  const promise = fetch(url, init)
    .then(async (res) => {
      if (!res.ok) return null;
      const mediaType = (res.headers.get('content-type') ?? '').split(';', 1)[0].trim();
      if (mediaType !== 'text/html' && mediaType !== 'application/xhtml+xml') return null;
      const html = await res.text();
      if (prefetch) preloadAssetsFromHtml(html);
      const doc: PageDoc = { html, redirected: res.redirected ? res.url : undefined, mediaType: mediaType as PageDoc['mediaType'] };
      if (prefetch) scheduleIdleParse(doc);
      return doc;
    })
    .catch(() => null)
    .then((doc) => {
      if (!doc) pageCache.delete(url);
      return doc;
    });

  if (pageCache.size >= CACHE_MAX) {
    const oldest = pageCache.keys().next().value;
    if (oldest) {
      const oldEntry = pageCache.get(oldest);
      void oldEntry?.promise.then((p) => { if (p) p.parsed = undefined; });
      pageCache.delete(oldest);
    }
  }
  pageCache.set(url, { at: Date.now(), promise });
  return promise;
}

function withAbort<T>(signal: AbortSignal, start: (done: (val: T | null) => void) => () => void): Promise<T | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    let stop = () => {};
    const done = (val: T | null) => {
      signal.removeEventListener('abort', onAbort);
      stop();
      resolve(val);
    };
    const onAbort = () => done(null);
    signal.addEventListener('abort', onAbort, { once: true });
    stop = start(done);
  });
}

function waitStyles(doc: Document, signal: AbortSignal): Promise<void> {
  const loaded = headUrls('head link[rel="stylesheet"]', 'href');
  const pending: Promise<void>[] = [];
  for (const link of doc.querySelectorAll('head link[rel="stylesheet"]')) {
    const href = link.getAttribute('href');
    const abs = href && absUrl(href);
    if (!href || !abs || loaded.has(abs) || readyStyles.has(abs)) continue;
    const persist = link.getAttribute('data-astro-transition-persist');
    if (persist && document.querySelector(`[data-astro-transition-persist="${persist}"]`)) continue;
    const el = document.createElement('link');
    el.rel = 'preload';
    el.as = 'style';
    el.href = href;
    pending.push(withAbort<void>(signal, (done) => {
      const fin = () => { readyStyles.add(abs); done(); };
      const fail = () => done();
      el.addEventListener('load', fin, { once: true });
      el.addEventListener('error', fail, { once: true });
      document.head.append(el);
      return () => { el.removeEventListener('load', fin); el.removeEventListener('error', fail); };
    }).then(() => {}));
  }
  return pending.length ? Promise.all(pending).then(() => {}) : Promise.resolve();
}

async function loadFromCache(nav: TransitionBeforePreparationEvent): Promise<boolean> {
  const url = normalizeUrl(nav.to.href);
  if (!url || nav.formData) return false;
  const page = await withAbort(nav.signal, (done) => {
    let active = true;
    void fetchPage(url, false).then((v) => { if (active) done(v); });
    return () => { active = false; };
  });
  if (nav.signal.aborted) return true;
  if (!page) return nav.preventDefault(), true;
  if (page.redirected) {
    const target = new URL(page.redirected);
    if (target.origin !== nav.to.origin) return nav.preventDefault(), true;
    const hash = nav.to.hash;
    nav.to = target;
    nav.to.hash = hash;
  }
  let doc = page.parsed;
  if (doc) {
    page.parsed = undefined;
    const idx = parsedQueue.indexOf(page);
    if (idx >= 0) parsedQueue.splice(idx, 1);
  } else {
    doc = parseDocument(page.html, page.mediaType);
  }
  nav.newDocument = doc;
  if (!nav.newDocument.querySelector('[name="astro-view-transitions-enabled"]')) return nav.preventDefault(), true;
  await waitStyles(nav.newDocument, nav.signal);
  return true;
}

// ---- 收尾：目标页播完就把标记摘掉 ----
// **必须摘**：结束帧带着 transform，留在类上会给 .shell 留下多余层叠上下文。
let cleanupTimer: number | undefined;
let hoverTimer: number | undefined;
let holdTimer: number | undefined;
let revealRaf1 = 0;
let revealRaf2 = 0;
let coverDone = false;
let coverAnchor = 0;
let onCoverDone: (() => void) | undefined;
let waitingReveal = false;
let preparing: AbortSignal | undefined;
let swapping: AbortSignal | undefined;

function cancelRevealSchedule() {
  window.clearTimeout(holdTimer);
  holdTimer = undefined;
  if (revealRaf1) cancelAnimationFrame(revealRaf1);
  if (revealRaf2) cancelAnimationFrame(revealRaf2);
  revealRaf1 = 0;
  revealRaf2 = 0;
}

function clearOverlay() {
  window.clearTimeout(cleanupTimer);
  cancelRevealSchedule();
  waitingReveal = false;
  onCoverDone = undefined;
  root.classList.remove('pt-on', 'pt-play');
  root.classList.remove('pt-cover', 'pt-hold', 'pt-reveal');
}

function finishAfter(ms: number) {
  window.clearTimeout(cleanupTimer);
  cleanupTimer = window.setTimeout(clearOverlay, ms);
}

function beginReveal() {
  if (!waitingReveal) return;
  waitingReveal = false;
  cancelRevealSchedule();
  if (!reducedMotion.matches) {
    root.classList.remove('pt-cover', 'pt-hold', 'pt-play');
    root.classList.add('pt-on', 'pt-reveal');
    finishAfter(STALE_MS);
  } else {
    clearOverlay();
  }
}

function scheduleReveal() {
  if (revealRaf1) cancelAnimationFrame(revealRaf1);
  if (revealRaf2) cancelAnimationFrame(revealRaf2);
  revealRaf2 = 0;
  revealRaf1 = requestAnimationFrame(() => {
    revealRaf1 = 0;
    revealRaf2 = requestAnimationFrame(() => {
      revealRaf2 = 0;
      beginReveal();
    });
  });
}

if (root.classList.contains('pt-play')) finishAfter(STALE_MS);

document.addEventListener('animationstart', (event) => {
  if (event.animationName === 'pt-ink' && root.classList.contains('pt-play')) {
    finishAfter(HANDOFF_MS);
  } else if (event.animationName === 'pt-ink-in' && root.classList.contains('pt-cover')) {
    coverAnchor = performance.now();
  } else if (event.animationName === 'pt-ink-out' && root.classList.contains('pt-reveal')) {
    finishAfter(REVEAL_MS);
  }
});

document.addEventListener('animationend', (event) => {
  if (event.animationName === 'pt-ink-in' && root.classList.contains('pt-cover')) {
    coverDone = true;
    const cb = onCoverDone;
    onCoverDone = undefined;
    cb?.();
  } else if (event.animationName === 'pt-ink-out' && root.classList.contains('pt-reveal')) {
    clearOverlay();
  }
});

// 后台并发限流预取队列 + 菜单触发预热 + 首屏空闲预取 + 视口链接驻留预取
const canBackgroundPrefetch = () => networkReady() && document.visibilityState !== 'hidden' && !preparing;

function pumpQueue() {
  while (bgActive < BG_MAX && bgQueue.length && canBackgroundPrefetch()) {
    const url = bgQueue.shift()!;
    const cached = pageCache.get(url);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      bgQueued.delete(url);
      continue;
    }
    bgActive++;
    void fetchPage(url, true).finally(() => {
      bgActive--;
      bgQueued.delete(url);
      pumpQueue();
    });
  }
}

function enqueuePrefetch(url: string, front = false) {
  const cached = pageCache.get(url);
  if ((cached && Date.now() - cached.at < CACHE_TTL) || bgQueued.has(url)) return;
  bgQueued.add(url);
  if (front) bgQueue.unshift(url);
  else bgQueue.push(url);
  pumpQueue();
}

function warmNavLinks(front = false) {
  if (!canBackgroundPrefetch()) return;
  for (const a of document.querySelectorAll('#site-menu a[href], .site-menu-dialog a[href]')) {
    const url = canPrefetch(a);
    if (url) enqueuePrefetch(url, front);
  }
}

function cancelIdleWarmup() {
  window.clearTimeout(idleTimer);
  idleTimer = undefined;
  idleCancel?.();
  idleCancel = undefined;
}

function scheduleIdleWarmup() {
  cancelIdleWarmup();
  idleTimer = window.setTimeout(() => {
    idleTimer = undefined;
    idleCancel = runWhenIdle(() => {
      idleCancel = undefined;
      if (!root.classList.contains('boot-on') && canBackgroundPrefetch()) {
        warmNavLinks(false);
        pumpQueue();
      }
    }, 150);
  }, IDLE_DELAY_MS);
}

function cleanupViewport() {
  io?.disconnect();
  io = undefined;
  for (const id of dwellTimers.values()) window.clearTimeout(id);
  dwellTimers.clear();
}

function observeViewportLinks() {
  cleanupViewport();
  viewportCount = 0;
  if (typeof IntersectionObserver !== 'function' || !canBackgroundPrefetch()) return;
  io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target;
      const old = dwellTimers.get(el);
      if (!entry.isIntersecting) {
        if (old !== undefined) { window.clearTimeout(old); dwellTimers.delete(el); }
        continue;
      }
      if (old !== undefined || viewportCount >= VIEWPORT_MAX) continue;
      dwellTimers.set(el, window.setTimeout(() => {
        dwellTimers.delete(el);
        io?.unobserve(el);
        if (viewportCount >= VIEWPORT_MAX || !canBackgroundPrefetch()) return;
        const url = canPrefetch(el);
        if (!url) return;
        viewportCount++;
        enqueuePrefetch(url, false);
      }, VIEWPORT_DWELL_MS));
    }
  });
  let observed = 0;
  for (const a of document.querySelectorAll('main a[href]')) {
    if (!canPrefetch(a)) continue;
    io.observe(a);
    if (++observed >= 16) break;
  }
}

// 三路委托预取：悬停（65ms 防抖）/ 键盘聚焦 / 触屏与鼠标按下（0ms 立即抢跑）。
const schedulePrefetch = (target: EventTarget | null, immediate = false) => {
  const el = target instanceof Element ? target : null;
  if (el?.closest(NAV_TRIGGER)) {
    warmNavLinks(true);
    return;
  }
  const url = canPrefetch(el?.closest('a') ?? null);
  if (!url) return;
  window.clearTimeout(hoverTimer);
  if (immediate) void fetchPage(url, true);
  else hoverTimer = window.setTimeout(() => { void fetchPage(url, true); }, 65);
};
const cancelHover = (e: Event) => {
  if (e instanceof MouseEvent) {
    const link = (e.target as Element | null)?.closest?.('a');
    if (link && e.relatedTarget instanceof Node && link.contains(e.relatedTarget)) return;
  }
  window.clearTimeout(hoverTimer);
};

document.addEventListener('mouseover', (e) => schedulePrefetch(e.target), { passive: true });
document.addEventListener('mouseout', cancelHover, { passive: true });
document.addEventListener('focusin', (e) => schedulePrefetch(e.target), { passive: true });
document.addEventListener('focusout', cancelHover, { passive: true });
document.addEventListener('pointerdown', (e) => schedulePrefetch(e.target, true), { passive: true });
document.addEventListener('touchstart', (e) => schedulePrefetch(e.target, true), { passive: true });
document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest?.(NAV_TRIGGER)) warmNavLinks(true);
}, { passive: true });

observeViewportLinks();
scheduleIdleWarmup();

// 兜底未被客户端路由接管的站内整页跳转（如 [data-astro-reload]）。
window.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest?.('a');
  if (!link || !precheck(event, link)) return;
  if (!reducedMotion.matches) {
    try {
      sessionStorage.setItem(KEY, '1');
      root.classList.add('pt-on');
    } catch { /* 存储不可用时直接跳过过渡记录。 */ }
  }
  finishAfter(STALE_MS);
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) clearOverlay();
});

// 客户端换页：点击即刻覆盖，并行等待内容与最小覆盖时长后稳幕待命，等新页脚本及首帧就绪再揭幕。
document.addEventListener('astro:before-preparation', (event) => {
  const navigation = event as TransitionBeforePreparationEvent;
  const { signal, loader } = navigation;
  const started = performance.now();
  window.clearTimeout(cleanupTimer);
  cancelIdleWarmup();
  cancelRevealSchedule();
  waitingReveal = false;
  coverDone = false;
  coverAnchor = started;
  onCoverDone = undefined;
  try { sessionStorage.removeItem(KEY); } catch { /* 忽略无权限场景。 */ }
  preparing = signal;
  root.classList.remove('pt-play', 'pt-hold', 'pt-reveal');
  if (!reducedMotion.matches) root.classList.add('pt-on', 'pt-cover');

  navigation.loader = async () => {
    try {
      let handled = false;
      try { handled = await loadFromCache(navigation); } catch { handled = false; }
      if (!handled && !signal.aborted) await loader();
      if (preparing !== signal || signal.aborted) return;
      if (navigation.defaultPrevented) {
        finishAfter(STALE_MS);
        return;
      }
      if (!reducedMotion.matches && !coverDone) {
        const left = Math.min(
          COVER_MS + 140 - (performance.now() - started),
          COVER_MS - (performance.now() - coverAnchor),
        );
        if (left > 8) {
          await withAbort(signal, (done) => {
            const finish = () => {
              if (onCoverDone === finish) onCoverDone = undefined;
              done(null);
            };
            onCoverDone = finish;
            const id = window.setTimeout(finish, left);
            return () => {
              window.clearTimeout(id);
              if (onCoverDone === finish) onCoverDone = undefined;
            };
          });
        }
      }
    } catch (error) {
      if (preparing === signal) clearOverlay();
      throw error;
    }
  };

  signal.addEventListener('abort', () => {
    if (preparing !== signal) return;
    preparing = undefined;
    clearOverlay();
  }, { once: true });
});

document.addEventListener('astro:after-swap', () => {
  if (!preparing || preparing !== swapping) return;
  const signal = preparing;
  preparing = undefined;
  if (!reducedMotion.matches) {
    cancelRevealSchedule();
    root.classList.remove('pt-cover', 'pt-play', 'pt-reveal');
    root.classList.add('pt-on', 'pt-hold');
    waitingReveal = true;
    holdTimer = window.setTimeout(beginReveal, HOLD_MAX_MS);
    finishAfter(STALE_MS);
  } else {
    if (swapping === signal && !preparing) clearOverlay();
  }
});

document.addEventListener('astro:page-load', () => {
  if (waitingReveal) scheduleReveal();
  observeViewportLinks();
  scheduleIdleWarmup();
  pumpQueue();
});

// 换页前把稳幕待命态与当前亮暗主题写进新文档根元素，避免 swap 瞬间白闪且隔离主线程峰值。
document.addEventListener('astro:before-swap', (event) => {
  const { from, to, navigationType, newDocument, signal } = event as TransitionBeforeSwapEvent;
  swapping = signal;
  cleanupViewport();
  cancelIdleWarmup();
  if (preparing === signal) {
    const nextRoot = newDocument.documentElement;
    if (root.classList.contains('dark')) nextRoot.classList.add('dark');
    if (!reducedMotion.matches) {
      nextRoot.classList.remove('pt-cover', 'pt-play', 'pt-reveal');
      nextRoot.classList.add('pt-on', 'pt-hold');
    }
  }
  if (navigationType !== 'push' || from.origin !== to.origin || from.pathname === to.pathname) return;
  if (!newDocument.querySelector('[data-album-return]')) return;

  // Astro 先写入本次导航的历史条目，再触发 after-swap。
  document.addEventListener('astro:after-swap', () => {
    if (location.href !== to.href) return;
    try {
      history.replaceState({ ...history.state, albumReturn: true }, '');
    } catch { /* 保留链接指向的相册首页。 */ }
  }, { once: true, signal });
});
