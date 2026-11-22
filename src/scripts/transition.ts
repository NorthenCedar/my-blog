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
const REVEAL_MS = 520;
const CACHE_TTL = 45_000;
const CACHE_MAX = 12;
const NO_PT = '[target="_blank"],[download],[data-no-transition]';
const SKIP_EXT = /\.(?:xml|json|webp|png|jpe?g|gif|svg|ico|pdf|mp3|mp4|m4a|zip|glb|hdr|woff2?)$/i;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

type PageDoc = { html: string; redirected?: string; mediaType: 'text/html' | 'application/xhtml+xml' };
type CacheEntry = { at: number; promise: Promise<PageDoc | null> };

const pageCache = new Map<string, CacheEntry>();
const warmedStyles = new Set<string>();
let parser: DOMParser | undefined;

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

function canPrefetch(el: Element | null): string | null {
  if (!el || el.tagName !== 'A' || !navigator.onLine) return null;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn && (conn.saveData || /2g/.test(conn.effectiveType ?? ''))) return null;
  if (el.matches(`${NO_PT},[data-astro-reload],[data-astro-prefetch="false"]`)) return null;
  return normalizeUrl((el as HTMLAnchorElement).href || el.getAttribute('href') || '');
}

const headStyles = () =>
  new Set([...document.head.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href')).filter(Boolean) as string[]);

function preloadStylesFromHtml(html: string) {
  const end = html.search(/<\/head>/i);
  if (end < 0) return;
  const loaded = headStyles();
  for (const [tag] of html.slice(0, end).matchAll(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi)) {
    const m = tag.match(/\bhref=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const raw = m?.[1] ?? m?.[2] ?? m?.[3];
    if (!raw || loaded.has(raw)) continue;
    try {
      const abs = new URL(raw, location.href);
      if (abs.origin !== location.origin || warmedStyles.has(abs.href)) continue;
      warmedStyles.add(abs.href);
      void fetch(abs.href, { priority: 'low' } as RequestInit).catch(() => {});
    } catch { /* 忽略异常样式地址。 */ }
  }
}

function fetchPage(url: string, prefetch: boolean): Promise<PageDoc | null> {
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.promise;
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
      if (prefetch) preloadStylesFromHtml(html);
      return { html, redirected: res.redirected ? res.url : undefined, mediaType: mediaType as PageDoc['mediaType'] };
    })
    .catch(() => null)
    .then((doc) => {
      if (!doc) pageCache.delete(url);
      return doc;
    });

  if (pageCache.size >= CACHE_MAX) {
    const oldest = pageCache.keys().next().value;
    if (oldest) pageCache.delete(oldest);
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
  const loaded = headStyles();
  const pending: Promise<void>[] = [];
  for (const link of doc.querySelectorAll('head link[rel="stylesheet"]')) {
    const href = link.getAttribute('href');
    if (!href || loaded.has(href)) continue;
    const persist = link.getAttribute('data-astro-transition-persist');
    if (persist && document.querySelector(`[data-astro-transition-persist="${persist}"]`)) continue;
    const el = document.createElement('link');
    el.rel = 'preload';
    el.as = 'style';
    el.href = href;
    pending.push(withAbort<void>(signal, (done) => {
      const fin = () => done();
      el.addEventListener('load', fin, { once: true });
      el.addEventListener('error', fin, { once: true });
      document.head.append(el);
      return () => { el.removeEventListener('load', fin); el.removeEventListener('error', fin); };
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
  parser ??= new DOMParser();
  nav.newDocument = parser.parseFromString(page.html, page.mediaType);
  nav.newDocument.querySelectorAll('noscript').forEach((el) => el.remove());
  if (!nav.newDocument.querySelector('[name="astro-view-transitions-enabled"]')) return nav.preventDefault(), true;
  await waitStyles(nav.newDocument, nav.signal);
  return true;
}

// ---- 收尾：目标页播完就把标记摘掉 ----
// **必须摘**：结束帧带着 transform，留在类上会给 .shell 留下多余层叠上下文。
let cleanupTimer: number | undefined;
let hoverTimer: number | undefined;
let preparing: AbortSignal | undefined;
let swapping: AbortSignal | undefined;

function clearOverlay() {
  window.clearTimeout(cleanupTimer);
  root.classList.remove('pt-on', 'pt-play');
  root.classList.remove('pt-cover', 'pt-reveal');
}

function finishAfter(ms: number) {
  window.clearTimeout(cleanupTimer);
  cleanupTimer = window.setTimeout(clearOverlay, ms);
}

if (root.classList.contains('pt-play')) finishAfter(STALE_MS);

document.addEventListener('animationstart', (event) => {
  if (event.animationName === 'pt-ink' && root.classList.contains('pt-play')) {
    finishAfter(HANDOFF_MS);
  } else if (event.animationName === 'pt-ink-out' && root.classList.contains('pt-reveal')) {
    finishAfter(REVEAL_MS);
  }
});

document.addEventListener('animationend', (event) => {
  if (event.animationName === 'pt-ink-out' && root.classList.contains('pt-reveal')) {
    clearOverlay();
  }
});

// 三路委托预取：悬停（65ms 防抖）/ 键盘聚焦 / 触屏与鼠标按下（0ms 立即抢跑）。
const schedulePrefetch = (target: EventTarget | null, immediate = false) => {
  const url = canPrefetch(target instanceof Element ? target.closest('a') : null);
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

// 客户端换页：点击即刻覆盖，并行等待内容与最小覆盖时长后立刻揭幕。
document.addEventListener('astro:before-preparation', (event) => {
  const navigation = event as TransitionBeforePreparationEvent;
  const { signal, loader } = navigation;
  const started = performance.now();
  window.clearTimeout(cleanupTimer);
  try { sessionStorage.removeItem(KEY); } catch { /* 忽略无权限场景。 */ }
  preparing = signal;
  root.classList.remove('pt-play', 'pt-reveal');
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
      const left = COVER_MS - (performance.now() - started);
      if (!reducedMotion.matches && left > 8) {
        await withAbort(signal, (done) => {
          const id = window.setTimeout(() => done(null), left);
          return () => window.clearTimeout(id);
        });
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
    root.classList.remove('pt-cover', 'pt-play');
    root.classList.add('pt-on', 'pt-reveal');
    finishAfter(STALE_MS);
  } else {
    if (swapping === signal && !preparing) clearOverlay();
  }
});

// 换页前把揭幕态和当前亮暗主题写进新文档根元素，避免 swap 瞬间白闪。
document.addEventListener('astro:before-swap', (event) => {
  const { from, to, navigationType, newDocument, signal } = event as TransitionBeforeSwapEvent;
  swapping = signal;
  if (preparing === signal) {
    const nextRoot = newDocument.documentElement;
    if (root.classList.contains('dark')) nextRoot.classList.add('dark');
    if (!reducedMotion.matches) {
      nextRoot.classList.remove('pt-cover', 'pt-play');
      nextRoot.classList.add('pt-on', 'pt-reveal');
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
