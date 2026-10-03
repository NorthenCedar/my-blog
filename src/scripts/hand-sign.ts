/* =============================================================================
 * 关于页 · 亲笔签名落笔（HAND SIGN）—— 内页第三台装置
 *
 * 机制：**横向揭幕**（clip-path: inset(0 X% 0 0)，X 从 100 走到 0）。
 *
 * ★ 为什么是「揭幕」而不是「逐笔」：
 *   签名是站主手迹**原件的照片**（已抠白底转墨绿，见 _probe/hand-sign-prep.mjs），
 *   位图**没有路径**，只有像素 ⇒ `stroke-dashoffset` 那种逐笔描红只对矢量路径成立。
 *   要真逐笔就得先矢量化，而矢量化会用算法破坏笔锋的提按（本站已吃过一次亏：
 *   手写路径的第一版把「北」写成了「丰」）。⇒ 横向揭幕是**不破坏原件**的那条路，
 *   视觉上就是「手从左往右写过去」。
 *
 * ★ 与另两台装置的机制必须不同（口径 #5「一套引擎换形态」已被否掉）：
 *   | 页| 驱动源        | 状态| 逐帧成本 |
 *   | 显影板          | 指针轨迹        | 有状态（累积擦痕）| 高（密度场） |
 *   | 索引卷尺        | 滚动位置        | 无状态          | 低        |
 *   | **亲笔签名（本页）**| **进入视口一次** | **无状态**      | **极低** |
 *
 * ★ 手感：**匀速，不用弹簧**。
 *   显影板用一阶平滑、卷尺用二阶欠阻尼（要机械过冲），而笔迹**要的是匀速** ——
 *   弹簧的过冲会让"写字"变成"甩笔"，一眼假。位置吃**真实 dt**（禁「每帧固定系数」，
 *   那个坑让线场的弹性随刷新率变，见 AGENTS 事故表）。
 *
 * ★ 降级四态（照抄前两台的约定）：
 *   ① reduced-motion ⇒ 直接落最终态（不跑 rAF、不揭幕）。
 *   ② 无 JS ⇒ 图照常显示（服务端渲染的是完整图），只是**不揭幕**—— 不是"看不见"。
 *   ③ 手机 ≤767px ⇒ 保留极简版（见 about.astro 的媒体查询），动画照跑。
 *   ④ 视口外 / 切标签 ⇒ 停帧（rl-core 的 activityGate）。
 * ============================================================================= */

import { startLoop, createActivityGate, shouldAnimate, prefersReducedMotion } from './rl-core';

(() => {
  const img = document.querySelector<HTMLElement>('[data-sign-img]');
  if (!img) return;

  const reduce = prefersReducedMotion();
  const animate = shouldAnimate(reduce);

  /* 揭幕进度：1 = 全部盖住（未写），0 = 全部露出（写完）。
     ★ 变量名叫 `cover` 而不是 `progress`，是为了让 `cover = 1 - p` 读起来
     与 CSS 的 inset 百分比同向 —— 少一次换算出错的机会。 */
  let cover = 1;
  const paint = () => {
    img.style.clipPath = `inset(0 ${(cover * 100).toFixed(2)}% 0 0)`;
  };

  /* reduced-motion / 无脚本：直接最终态。两种情况都落到同一处，是刻意的——
     降级的目标只有一个「看得见图」，不该让两条路径渲染出两个样子。 */
  if (!animate) {
    cover = 0;
    paint();
    return;
  }

  /* ★ 首屏已经看得见的切片**不揭幕**，直接显示最终态。
     2026-10-03 目检踩到：签名切片就在首屏里，一进页面 `cover = 1`
     ⇒ 读者第一眼看到的是**一块空深底板**，签名要等1.8s 后才出现 ——
     而那一屏根本没有"滚下去"这个动作，揭幕等于白等。
     ⇒ 判据：切片此刻已与视口有实际重叠才揭幕（`rect.top < innerHeight`），
        否则直接给最终态。往下滚才遇到的切片（如果有）才走揭幕。 */
  const rect = img.getBoundingClientRect();
  const inFirstScreen = rect.top < window.innerHeight && rect.bottom > 0;
  if (inFirstScreen) {
    cover = 0;
    paint();
    return;
  }

  /* 匀速推进：每秒揭掉 SIGN_SPEED 的比例（0~1）。
     ★ 不是「每帧 -= 固定量」—— 那等于把 dt 当成恒定 1/60，帧率一变速度就变
       （同 AGENTS 里线场那个坑）。 */
  const SIGN_SPEED = 0.55;   // 全程约 1.8s
  const step = (dt: number) => {
    if (cover <= 0) return;
    cover = Math.max(0, cover - (SIGN_SPEED * dt) / 1000);
    paint();
  };

  /* 视口外 / 切标签 ⇒ 停帧。★ onTick 在回到视口时不重置进度 ——
     签名的语义是「进入视口时写一次」，滚出去再回来不该重写一遍。 */
  const gate = createActivityGate(img, { onTick: () => {} });

  const stop = startLoop((dt) => {
    if (gate.onScreen && gate.visible) step(dt);
  });

  window.addEventListener(
    'beforeunload',
    () => {
      stop();
      gate.dispose();
    },
    { once: true }
  );
})();
