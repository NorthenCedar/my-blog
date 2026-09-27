// 页面过渡（2026-09-27 站主定案）：点击站内链接时**先盖不播**，到目标页再播 800ms 的撕裂展开。
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

const KEY = 'pt';
const root = document.documentElement;
const HANDOFF_MS = 950; // 略长于最长的动画（800ms 可见 + 900ms 收尾）

/** 站内、可整页跳转的普通左键点击才值得盖（其余一律放行，别影响正常浏览）。 */
function precheck(e: MouseEvent, a: HTMLAnchorElement): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-no-transition')) return false;
  const href = a.getAttribute('href') || '';
  if (!href || href.startsWith('#')) return false;
  const to = new URL(a.href, location.href);
  if (to.origin !== location.origin) return false;
  // 同页（只有 hash 或查询串不同）不整页跳转，别盖
  return !(to.pathname === location.pathname && to.search === location.search);
}

// ---- 收尾：目标页播完就把标记摘掉 ----
// **必须摘**：`pt-content` 的结束帧带着 transform，留在类上就等于给 .shell 永久加了一个层叠上下文。
if (root.classList.contains('pt-play')) {
  setTimeout(() => root.classList.remove('pt-on', 'pt-play'), HANDOFF_MS);
}

// 系统开了「减少动态效果」就整套不参与（CSS 那边也有一套保险）
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target as Element | null;
      const a = el?.closest?.('a') as HTMLAnchorElement | null;
      if (!a || !precheck(e, a)) return;
      // 微任务：等本轮事件的所有同步处理器跑完，再看有没有人把它拦下（相册灯箱就是这么干的）
      queueMicrotask(() => {
        if (e.defaultPrevented) return; // 有人接管了这次点击 ⇒ 不盖、不写标记
        try {
          sessionStorage.setItem(KEY, '1');
        } catch {
          return; // 隐私模式下写不进去：这次就没有过渡，不影响导航
        }
        root.classList.add('pt-on');
        // 万一跳转没真的发生（被别的东西拦下、或用户中途取消），3 秒后自己收掉
        setTimeout(() => root.classList.remove('pt-on'), 3000);
      });
    },
    true, // 捕获阶段只做初筛；真正的判断在微任务里（见上）
  );
}
