// 页面过渡（2026-09-30 站主定案换成 v3）：点击站内链接时**先盖不播**，到目标页再播 900ms 的墨色浸染。
// v2 那套 2200ms 四段（无菌纸柔雾 / 坐标锁定 / 无菌舱门 / 内容落地）已整体作废，
// 换成了原型 v10.6 的过渡；本文件的**分工与两个 bug 的修法没变**，只有时长变了。
//
// 分工：
//   · 本脚本（每一页都加载）：拦截站内链接 → 打 handoff 标记 + 盖上蒙版（静止态）；到目标页后收尾。
//   · <head> 里的 inline 同步脚本（见 Base.astro）：目标页**首次绘制前**把蒙版补上并加 pt-play；
//   · src/styles/transition.css：四阶段时间线全在 CSS 里（transform / opacity）。
//
// 为什么上一页只盖不播：两页的静止态长得一样 ⇒ 换页过程无缝、不闪。动画只在目标页播一次。
//
// 2026-09-27 两个 bug 的修法都记在这（都真踩过）：
//   ① 相册点照片会触发过渡、且蒙版盖住灯箱 ⇒
//      灯箱是页面内 JS 拦下点击（preventDefault）自己开图，**不会真的跳转**。
//      而我原来在**捕获阶段当场**判断，那时别的处理器还没跑、`defaultPrevented` 还是 false ⇒ 误判成"要跳转"。
//      现在：捕获阶段只做初筛，真正的判断放进**微任务**（本轮事件的所有同步处理器都跑完之后），
//      只要 `defaultPrevented` 为真就什么都不做。另外蒙版 z-index 也降到灯箱（50）之下，双保险。
//   ② 手机端抽屉在非首页点不到、被内容盖住 ⇒
//      上一页点击时置了 handoff 标记、但那次跳转被拦下（没真发生）⇒ 下一个页面照样挂上 pt-play、
//      播了一遍"没人要的"过渡；而 `pt-content` 是 `fill: both`，结束帧的 `transform: scale(1)`
//      **会一直留在 .shell 上** ⇒ 一个非 none 的 transform 会造出**层叠上下文** ⇒
//      后面的 <main> 就盖住了顶栏里的抽屉（首页没事纯属侥幸：console 外壳只做淡入、不做缩放）。
//      现在：动画跑完（950ms）由本脚本把 `pt-on pt-play` 摘掉 ⇒ 那个 transform 随之消失。

import type { TransitionBeforePreparationEvent, TransitionBeforeSwapEvent } from 'astro:transitions/client';

const KEY = 'pt';
const root = document.documentElement;
const status = document.querySelector('.pt-status');
// v3（2026-09-30 站主定案）：换成**原型 v10.6 的墨色浸染**，时间线总长 900ms
// （--pt-sweep，值在 tokens.css / transition.css）。收尾多留 100ms ⇒ 1000ms 摘类，
// 保证摘的时候动画已经结束 —— 摘早了会把最后一帧（墨层刚收成一条线）硬切掉。
const HANDOFF_MS = 1000;
// 万一跳转没真的发生（被别的东西拦下、或用户中途取消），自己收掉。
// v2 是 3000ms（对应 2200ms 的时间线）；v3 只有 900ms，1.5s 足够。
const STALE_MS = 1500;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** 站内、可整页跳转的普通左键点击才值得盖（其余一律放行，别影响正常浏览）。 */
function precheck(e: MouseEvent, a: HTMLAnchorElement): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.matches('[target="_blank"],[download],[data-no-transition]')) return false;
  if (a.origin !== location.origin) return false;
  // 同页锚点由页面自己处理。
  return !(a.pathname === location.pathname && a.search === location.search);
}

// ---- 收尾：目标页播完就把标记摘掉 ----
// **必须摘**：`pt-content` 的结束帧带着 transform，留在类上就等于给 .shell 永久加了一个层叠上下文。
let cleanupTimer: number | undefined;
let waitTimer: number | undefined;
let preparing: AbortSignal | undefined;
let swapping: AbortSignal | undefined;
function showWait(pending = false) {
  window.clearTimeout(waitTimer);
  if (!status) return;
  if (!pending) status.textContent = '';
  else if (!status.textContent) waitTimer = window.setTimeout(() => { status.textContent = '正在打开页面…'; }, 180);
}
function clearOverlay() {
  window.clearTimeout(cleanupTimer);
  showWait();
  root.classList.remove('pt-on', 'pt-play');
}
function finishAfter(ms: number) {
  window.clearTimeout(cleanupTimer);
  cleanupTimer = window.setTimeout(clearOverlay, ms);
}
if (root.classList.contains('pt-play')) finishAfter(STALE_MS);
document.addEventListener('animationstart', event => {
  if (event.animationName !== 'pt-ink' || !root.classList.contains('pt-play')) return;
  // 等墨色层开始绘制再接棒，收尾也从实际开播起算。
  showWait();
  finishAfter(HANDOFF_MS);
});

// 客户端路由接管的点击由 before-preparation 接手，其余站内导航走浏览器。
window.addEventListener('click', event => {
  const link = (event.target as Element | null)?.closest?.('a');
  if (!link || !precheck(event, link)) return;
  if (!reducedMotion.matches) {
    try {
      sessionStorage.setItem(KEY, '1');
      root.classList.add('pt-on');
    } catch { /* 存储不可用时仍然显示等待状态。 */ }
  }
  showWait(true);
  finishAfter(STALE_MS);
});
window.addEventListener('pageshow', event => { if (event.persisted) clearOverlay(); });

// 客户端换页沿用原来的墨色过渡，不替换持久播放器。
document.addEventListener('astro:before-preparation', event => {
  const navigation = event as TransitionBeforePreparationEvent;
  const { signal, loader } = navigation;
  window.clearTimeout(cleanupTimer);
  preparing = signal;
  root.classList.remove('pt-play');
  if (!reducedMotion.matches) root.classList.add('pt-on');
  showWait(true);
  navigation.loader = async () => {
    try {
      await loader();
      if (preparing === signal && navigation.defaultPrevented) finishAfter(STALE_MS);
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
  window.clearTimeout(waitTimer);
  finishAfter(STALE_MS);
  if (!reducedMotion.matches) {
    root.classList.add('pt-on', 'pt-play');
  } else {
    // 减少动效仍让提示陪同目标页的第一帧。
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (swapping === signal && !preparing) clearOverlay();
    }));
  }
});

// 单册返回按钮只回到已经确认的站内来源。
document.addEventListener('astro:before-swap', event => {
  const { from, to, navigationType, newDocument, signal } = event as TransitionBeforeSwapEvent;
  swapping = signal;
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
