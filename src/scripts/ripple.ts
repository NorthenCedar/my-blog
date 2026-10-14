/* =============================================================================
 * 留言页 · 指针声波 POINTER RIPPLE（2026-10-14，§6.80.1）
 *
 * 母题：指针掠过纸面，那里泛起一圈极淡的声波纹，几秒后自行淡去。
 *
 * ★★ 这层**占的是墨滴退场空出来的机制位**：「指针移动 → 局部响应 → 自行消退」。
 *   现存十二台里没有任何一台在用它 —— 显影板是「越抹越清楚、永久留痕」，
 *   星座是「指针停留吸引」，准星是「跟随」，三个都是另一回事。
 *
 * ★★★ 为什么是「一个元素一个环」而不是 canvas 像素场：
 *   ① **零累积状态**。每个环自己播完就删，层里不会攒下一张越用越脏的图 ——
 *      墨滴那条路的病根就是像素场：划一下留一片，越划越脏，最后只能整台换掉。
 *   ② **零 rAF**。动画全在 CSS 关键帧里，JS 只做两件事：按**距离**间隔生成一个元素、
 *      `animationend` 时回收。⇒ 不占帧循环、不与声纹带（也是零 rAF）抢主线程。
 *   ③ **不需要量尺寸**。元素是 fixed 容器里的绝对定位，坐标直接用 clientX/Y
 *      减版心左缘 ⇒ 绕开站上那个老坑（canvas 靠 clientWidth，一旦 hidden 就恒为 0）。
 *
 * ⚠ 强度：环的描边借站上底纹那一档（`--deco-orbit-soft` = 绿 9%），不许自己调深。
 *   墨滴就是重到压住了留言正文才被换掉的；本层**必须按像素量**过一遍（§6.80.6）。
 */
import { prefersReducedMotion, shouldAnimate } from './rl-core';

/** 距离间隔（px）。比这个近就不生成 —— 一次快速划屏不该拉出上百个环。 */
const STEP_PX = 90;
/** 同屏环数上界。兜底：极端情况下（用户匀速慢慢划）也不许无限堆。 */
const MAX_ALIVE = 12;

(() => {
  const layer = document.querySelector<HTMLElement>('[data-ripple]');
  if (!layer) return;
  if (!shouldAnimate(prefersReducedMotion())) return;   // 少动效档：一个都不生成

  const shell = document.querySelector<HTMLElement>('.shell');
  if (!shell) return;

  let lx = NaN, ly = NaN;   // 上一次的指针位置

  const spawn = (x: number, y: number) => {
    /* 同屏上界：满了就把最老的一个撤掉。⚠ 这里动的是"活着的环"，
       被撤的那个正播着动画，提前撤等于让它半途消失 —— 但它已经淡到很淡了，肉眼看不出。 */
    while (layer.children.length >= MAX_ALIVE) layer.firstElementChild?.remove();
    const ring = document.createElement('i');
    ring.className = 'vr-ring';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    /* ★ 播完自己走。不回收的话层里会一直攒着已经透明了的死元素。 */
    ring.addEventListener('animationend', () => ring.remove());
    layer.appendChild(ring);
  };

  window.addEventListener('pointermove', (e) => {
    const ev = e as PointerEvent;
    /* 触屏没有「悬停」：手指拖动划过会拉出满屏的环，而且它压着输入。 */
    if (ev.pointerType === 'touch') return;
    if (!Number.isFinite(ev.clientX) || !Number.isFinite(ev.clientY)) return;

    /* 只在版心之内生成（版心之外的空白上不铺装饰）。量一次并缓存 ——
       `.shell` 在页面过渡里会被 transform，那种情况下 getBoundingClientRect() 不可信，
       而过渡只跑 900ms，不值得为它每次事件都重量一次。 */
    const r = shell.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right) { lx = NaN; return; }

    if (Number.isFinite(lx) && Math.hypot(ev.clientX - lx, ev.clientY - ly) < STEP_PX) return;
    lx = ev.clientX; ly = ev.clientY;
    /* ★★ 坐标就是 `clientX/clientY` 本身，**不许减版心偏移**。
       波纹层是 `position:fixed; inset:0` ⇒ 它的坐标系原点就是视口 (0,0)，
       而 `clientX/clientY` 本来就是视口坐标。减掉 `r.left/r.top` 会把整层环平移
       (版心左缘, 版心上缘) —— 宽屏上那是 ≈(300, 100) px，看上去就是
       「环出现在光标的左上角」（2026-10-14 站主目检报的就是这个）。
       版心 rect 在这里**只**当"在不在版心内"的那道门控，不兼职坐标。 */
    spawn(ev.clientX, ev.clientY);
  }, { passive: true });
})();
