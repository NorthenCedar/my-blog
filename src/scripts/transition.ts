// 页面过渡（2026-09-27 站主定案）：点击站内链接时**先盖不播**，到目标页再播 800ms 的撕裂展开。
//
// 分工：
//   · 本脚本（每一页都加载）：拦截站内链接 → 打 handoff 标记 + 盖上蒙版（静止态）；
//   · <head> 里的 inline 同步脚本（见 Base.astro）：目标页**首次绘制前**把蒙版补上并加 pt-play；
//   · src/styles/transition.css：四阶段时间线全在 CSS 里（transform / opacity）。
//
// 为什么上一页只盖不播：两页的静止态长得一样 ⇒ 换页过程无缝、不闪。动画只在目标页播一次。

const KEY = 'pt';
const root = document.documentElement;

/** 站内、可整页跳转的普通左键点击才算（其余一律放行，别影响正常导航）。 */
function shouldTransition(e: MouseEvent, a: HTMLAnchorElement): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-no-transition')) return false;
  const href = a.getAttribute('href') || '';
  if (!href || href.startsWith('#')) return false;
  const to = new URL(a.href, location.href);
  if (to.origin !== location.origin) return false;
  // 同页（只有 hash 或查询串不同）不整页跳转，别盖
  return !(to.pathname === location.pathname && to.search === location.search);
}

// 系统开了「减少动态效果」就整套不参与（CSS 那边也有一套保险）
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target as Element | null;
      const a = el?.closest?.('a') as HTMLAnchorElement | null;
      if (!a || !shouldTransition(e, a)) return;
      try {
        sessionStorage.setItem(KEY, '1');
      } catch {
        /* 隐私模式下写不进去：那这次就没有过渡，不影响导航 */
        return;
      }
      root.classList.add('pt-on');
      // 万一这次跳转没真的发生（被别的东西拦下、或用户中途取消），3 秒后自己收掉
      setTimeout(() => root.classList.remove('pt-on'), 3000);
    },
    true, // 捕获阶段：早于其它点击处理，保证蒙版在导航开始前就挂上
  );
}
