
import { onPage } from './page-lifecycle';
onPage(({document, window, addEventListener, matchMedia, requestAnimationFrame, ResizeObserver}) => {
/* =============================================================================
 * 文章与日志 · 滚动轨（SCROLL RAIL）—— 页面右侧一根**可拖动**的滚动条
 *
 * ★ 为什么需要它（站主 2026-10-08：「再加一个拖动的条要不然太长了」）：
 *   全站的原生滚动条在 2026-10-02 被**站主自己要求删掉**了 —— 见 `src/styles/base.css`
 *   那两行（`scrollbar-width:none` 管 Firefox，`::-webkit-scrollbar{display:none}` 管
 *   Chrome/Edge/Safari）：「那条浅色滚动条压在深绿/纸白底上很扎眼」。
 *   只不画那根条本身是对的，但**代价**当时没显出来：超长页从此没有任何「能拖的东西」。
 *   日志页 33 条、其中十几条是整段文字，靠滚轮一屏屏往下翻很累。
 *   本轨就是把「能拖」补回来，而且**不还原那条原生皮肤**（仍按站上的纸白/墨绿配色）。
 *
 * ★ 它与页面上另外两根「竖的」东西是**对照**，不是第三个同类：
 *   走时仪（`.chrono`）是**内容的一部分**：齿高是数据的函数、能点跳到某天；
 *   本轨是**视口的函数**：与日志内容完全无关，换到任何长页它照样成立。
 *   ⇒ 所以它不读 `items`、不吃任何内容数据，也不写进 log.astro 那段装置注释里。
 *
 * ★ 降级（照抄站上装置既有的约定）：
 *   ① 无 JS ⇒ 整根条不存在。HTML 里默认挂着 `hidden`，只有脚本把 data-ready 挂上才露面。
 *   ② reduced-motion ⇒ 行为**完全一致**。本控件本来就没有过渡、没有动画 ——
 *      滑块位置是「滚动量」的即时映射（纯函数，无时间项），不是"动画出来的"。
 *   ③ 窄屏 ≤767px ⇒ 不渲染（CSS display:none）。手机上触屏滚动更自然，条只会挡内容。
 *   ④ 页面不满一屏（没有可滚的余量）⇒ 脚本自己藏起来，不留一根拉不动的条。
 *
 * ★ 没有帧循环：只在 scroll / pointermove 时**按需** rAF 一次。
 *   这也是它不引 rl-core 的原因 —— 那里给的是帧循环 + 视口停帧 + 降级开关，
 *   本控件三样都用不上。
 * ========================================================================== */

(() => {
  const rail = document.querySelector<HTMLElement>('[data-rail]');
  const thumb = document.querySelector<HTMLElement>('[data-rail-thumb]');
  if (!rail || !thumb) return;

  /* 窄屏直接不干活（CSS 那边也不渲染）。照抄 reading-rule.ts 的约定。 */
  const wide = matchMedia('(min-width: 768px)');

  const doc = document.documentElement;
  let raf = 0;
  let trackH = 0; // 轨的可拖长度
  let thumbH = 0; // 滑块高度（按"视口 / 文档"的比例）
  let maxScroll = 0; // 可滚动的最大位移

  /** 量几何。字体加载 / 改窗口 / 内容变化都会改文档高度，所以要重量。 */
  function measure() {
    if (!wide.matches) {
      rail!.hidden = true;
      return;
    }
    maxScroll = Math.max(0, doc.scrollHeight - window.innerHeight);
    /* ★ 先露面再量：元素是 `display:none` 时 getBoundingClientRect 恒为 0，
       量出来的轨长会是 0，滑块位置于是永远贴顶（v1.25 那条同族坑）。 */
    rail!.hidden = false;
    trackH = rail!.getBoundingClientRect().height;
    /* 滑块最小 24px：太短了抓不住（可拖余量 trackH - thumbH 也随之不为 0） */
    thumbH = maxScroll > 0 ? Math.max(24, Math.min(trackH, (window.innerHeight / doc.scrollHeight) * trackH)) : 0;
    thumb!.style.height = `${thumbH}px`;
    /* 不满一屏 ⇒ 这根条没有意义，藏掉 */
    rail!.hidden = maxScroll <= 0;
    paint();
  }

  /** 把当前滚动位置画到滑块上。纯函数，不含时间项 ⇒ reduced-motion 下天然一致。 */
  function paint() {
    if (maxScroll <= 0 || trackH <= thumbH) return;
    const t = window.scrollY / maxScroll;
    thumb!.style.top = `${t * (trackH - thumbH)}px`;
  }

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      paint();
    });
  }

  /** 让**滑块中心**对准指针 ⇒ 反解 scrollY（点轨空白处也走这条 = 跳转）。 */
  function seek(clientY: number) {
    if (maxScroll <= 0 || trackH <= thumbH) return;
    const top = rail!.getBoundingClientRect().top;
    const t = (clientY - top - thumbH / 2) / (trackH - thumbH);
    /* ★ 2026-11-16（站主：「文章页最右边那个能拖的条现在拖得非常不顺」）：
       文章页的 CSS 允许动效时给 `html:has(body.post-plate)` 开了 `scroll-behavior: smooth`
       —— `scrollTo(x, y)` 这种**数值形式**会走那个计算值，于是拖动的每一次 pointermove
       都起一段「平滑滚动」动画，下一帧又被下一段打断 ⇒ 正文永远追不上滑块，手感发飘。
       `behavior: 'instant'` 明确要即时滚动才绕得开它（`auto` 不算，它正是回落到 CSS 值）。
       越界的 t 不用夹：`scrollTo` 自己会把目标钳在 [0, maxScroll]。 */
    scrollTo({ top: t * maxScroll, behavior: 'instant' });
  }

  measure();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure);
  /* 自托管字体到位后行高会变 ⇒ 文档高度跟着变，重量一次 */
  document.fonts?.ready.then(measure).catch(() => {});
  window.addEventListener('load', measure);
  // 评论、图片等异步内容改变文档高度后，重新计算拖动范围。
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);

  let dragging = false;
  rail.addEventListener('pointerdown', (e) => {
    dragging = true;
    /* 指针捕获：拖出这根条（往左拖进正文）时也继续收 move，手感不断 */
    rail.setPointerCapture(e.pointerId);
    seek(e.clientY);
  });
  rail.addEventListener('pointermove', (e) => {
    if (dragging) seek(e.clientY);
  });
  const end = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (rail.hasPointerCapture(e.pointerId)) rail.releasePointerCapture(e.pointerId);
  };
  rail.addEventListener('pointerup', end);
  rail.addEventListener('pointercancel', end);

  /* ★ 键盘与读屏用户走的是**原生滚动**（PageDown / Home / End / 空格 / 方向键），
     不靠这根条 ⇒ 它在 HTML 里标了 aria-hidden 且不进 Tab 序（tabindex="-1"）。
     做成 `role="scrollbar"` 反而要维持一整套 aria-valuenow 状态，而那条路
     对读屏用户并不比原生滚动更好 —— 不如不给一个半对的可访问性接口。 */
})();

});
