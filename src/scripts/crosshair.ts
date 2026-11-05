
import { onPage } from './page-lifecycle';
onPage(({document, window, addEventListener, matchMedia}) => {
/* =============================================================================
 * 标签页 · 准星（CROSSHAIR）—— 示波器的十字光标
 *
 * 站主 2026-10-06 原话：
 *   「标签总览 CROSSHAIR 准星：鼠标所在行列亮淡绿准星（示波器十字光标）；
 *     键盘 Tab 有同样效果。矩阵本身，单标签 CROSSHAIR 准星与标签总览共用一套实现。」
 *   ★ 澄清过的一处歧义（拍板选「乙」）：**贯穿全屏的十字线**，不是"网格行列亮起" ——
 *     两条 1px 线横竖贯穿视口、跟随指针，矩阵只是被扫过的内容。
 *
 * ★★ 机制谱系上的第九台（口径 #5「每页一台机制不同的装置」）：
 *   （序号按落地顺序数内页装置：①显影板 ②索引卷尺 ③关于页 ④阅读尺 ⑤浮游 ⑥走时仪
 *     ⑦星座 ⑧墨滴（提交 faed3e8 自称"第八台"）⑨准星。下表第 3 行写"参考板"是沿用
 *     rhinelab-spec §6.34.3 那张谱系表的写法 —— 关于页的装置与底纹占同一格。）
 *
 *   介质           输入              驱动            退场
 *   显影板  Canvas像素场  指针（**路径**）      一阶指数平滑     常驻
 *   卷尺    DOM transform 滚动                二阶弹簧（过冲） 常驻
 *   参考板  静态 img      无                  —              常驻
 *   阅读尺  DOM transform 滚动+点击           确定映射         900ms 收回
 *   浮游    Canvas 2D     时间（无输入）      解析函数 f(t)    永续
 *   走时仪  零 JS SVG+CSS 时间                CSS keyframes    永续
 *   星座    Canvas 2D     指针（**离谁近**）   累积计时         常驻
 *   墨滴    Canvas 2D     指针（**停留/落下**）累积渗开         常驻
 *   ★ 准星  DOM CSS 变量  指针**绝对坐标** + **键盘焦点**  确定映射（即时） 常驻
 *
 *   ★ 与其余各台的分野（三处，缺一就不算"机制不同"）：
 *     ① **唯一吃"指针的绝对坐标"** —— 显影板吃走过的路径、星座吃"离谁近"、
 *        墨滴吃"停留多久"，都是**相对**量；准星要的就是"指针此刻在哪"本身。
 *     ② **唯一同时吃键盘焦点** —— 站主要"Tab 有同样效果"。两种输入源汇到**同一个
 *        `--ch-x/--ch-y`**：指针移动与焦点跳转写的是同一对变量，装置分不出（也不需分）。
 *     ③ **唯一零 rAF 的动效装置** —— 位置是"事件 → 变量"的直接映射，
 *        没有帧循环、没有平滑、没有时间项。示波器光标必须"就在这里"，
 *        任何缓动都是错的（见下）。
 *
 * ★★ 为什么不加过渡（这是本台最容易做错的一步）：
 *     `transition` 会让线滞后指针若干帧 —— 而"示波器光标"的全部意义就是**即时**。
 *     实测环境（60Hz）下 pointermove 本身已按帧合并，逐事件直写变量本来就顺滑；
 *     再加过渡只会制造"线追着指针跑"的拖尾感。
 *     ⇒ transform **无过渡**；只有"首次出现"的 opacity 淡入有 200ms（那是**出现**，
 *       不是**移动**，两件事别混）。
 *
 * ★ 降级（口径照抄 `CursorRing.astro` —— 站上已有的跟随指针组件，不是我自创的取舍）：
 *   ① **触摸设备 / reduced-motion ⇒ 整个装置不做**（CSS `display:none` + 本脚本提前 return）。
 *      CursorRing 就是这么定的：跟随指针的东西对触屏无意义，对动效敏感用户是干扰。
 *   ② 无 JS ⇒ 十字线不存在（`.crosshair` 恒 `opacity:0`，靠脚本加 `.is-on` 才显形）。
 *   ③ 指针离开窗口 / 切标签 ⇒ **收起**，下次 pointermove 再出现（等价于别的台的"停帧"）。
 *      ⚠ 本台**刻意不用 `createActivityGate`**：gate 的 `onTick` 是给"回到视口时补一次
 *        重绘"用的，而本台没有帧循环、也没有需要补的重绘 ⇒ 引入它只是形式主义。
 *        "切标签即收起"用 `visibilitychange` 直给，语义等价且更短。
 *        （两者是同一件事的两种写法，契约里守住"切标签必须收起"即可。）
 *
 * ★ 颜色只从 token 读（`--deco-crosshair-line` / `--deco-crosshair-dot`），
 *   alpha 由 token 内的 8 位 hex 承载 —— 本文件里**不出现任何字面色值**。
 * ==========================================================================*/

(() => {
  const root = document.querySelector<HTMLElement>('[data-crosshair]');
  if (!root) return;

  /* 触摸设备与 reduced-motion：不做（与 CursorRing 同一口径）。
     ⚠ 两者都要判 —— `hover: none` 覆盖触屏与部分触控板，
       `prefers-reduced-motion` 覆盖"要减少动效"的用户。 */
  if (!matchMedia('(hover: hover)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let seen = false;

  /**
   * 把交点放到视口坐标 (x, y)。
   * ★ 只写一对 CSS 变量，两条线与焦点环全靠 `var()` 派生 ——
   *   所以"指针"与"键盘焦点"两种输入天然共用同一条路径，不需要分别处理。
   */
  function place(x: number, y: number) {
    root.style.setProperty('--ch-x', x + 'px');
    root.style.setProperty('--ch-y', y + 'px');
    if (!seen) {
      seen = true;
      /* 第一次移动前不显形 —— 否则会从左上角（变量初值处）滑过来，像一条飞进来的线。
         与 CursorRing 的 `cursor-live` 是同一个考虑。 */
      root.classList.add('is-on');
    }
  }

  /** 收起：下次 pointermove 会重新显形。 */
  function hide() {
    seen = false;
    root.classList.remove('is-on');
  }

  /* ---------- ① 指针：绝对坐标的即时映射 ---------- */
  window.addEventListener(
    'pointermove',
    (e) => {
      place(e.clientX, e.clientY);
    },
    { passive: true },
  );

  /* ---------- ② 键盘：Tab 走焦点时，准星移到焦点元素中心 ---------- */
  document.addEventListener('focusin', () => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return;
    /* ★ 只在 `:focus-visible` 时响应。
       鼠标点击链接**也会**触发 focus，但那时准星已经在指针位置 ——
       若照样跳到元素中心，会看到十字线"啪"地弹一下，纯粹是干扰。
       `:focus-visible` 正好把"键盘来的焦点"与"指针来的焦点"分开。 */
    if (!el.matches(':focus-visible')) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return; // 不可见元素（display:none 等）不接
    place(r.left + r.width / 2, r.top + r.height / 2);
  });

  /* ---------- ③ 离开窗口 / 切标签：收起 ---------- */
  window.addEventListener('blur', hide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') hide();
  });
})();

},"[data-crosshair]");
