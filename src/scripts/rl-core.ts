/* =============================================================================
 * 内页装置共享层（RL CORE）—— 各页装置的公共底盘
 *
 * ★ 为什么现在才抽：十台装置（归档卷尺 / 关于亲笔 / 阅读尺 / 浮游 / ~~走时仪~~ /
 *   准星 / 墨滴 / 星座 / 裂痕）都要「帧率无关的循环 + 视口停帧 + 降级开关」。
 *   ★ 2026-10-04：「走时仪」**已兑现**（`src/pages/log.astro`，日志页那支时间刻线尺）。
 *     但划掉它的理由不是"它用完了这一层"，恰好相反 —— **它零 JS**：
 *     整台是构建期算好的一支 SVG + 几十行 CSS，没有 rAF / 停帧 / 降级开关可言。
 *     ⇒ 名单上它的位置改成这句注记，留着比删掉更有用：
 *       **有的装置根本不该有 JS，而那种装置是没有降级链可写的。**
 *   相册显影板（develop.ts）把这些**内联**在文件里；现在有了第二个消费者，
 *   按「按需逐步抽」口径，只把**真正通用且实现一致**的三样搬进来：
 *     ① 帧循环外壳（真实 dt，不「每帧固定系数」）
 *     ② 视口停帧（IntersectionObserver + visibilitychange）
 *     ③ 降级开关（reduced-motion / 无 JS）
 *
 * ★ 刻意**不**抽的（机制不同，硬抽是假共享）：
 *   · 弹簧 / 惯性 —— develop 用**一阶指数平滑**（无过冲，笔触「干净贴上」）；
 *     卷尺游标要**二阶欠阻尼弹簧**（有过冲，机械「咔哒」感）。两套算法，各自实现。
 *   · 笔刷 —— 只有显影板用，等「关于页 HAND 亲笔」真需要了再抽。
 *
 * ★ 约定（照抄 develop.ts 已踩平的三条，别破）：
 *   ① 时间基准用 performance.now() 的**绝对值**，平滑吃**真实 dt**（帧率无关）。
 *   ② 可见性不押在动画上 —— 装置是装饰，内容在服务端已经完整；装置默认 hidden，
 *      脚本到位才露面。
 *   ③ 停帧判据只看「是否在视口内 + 标签页是否可见」，不用 opacity / display。
 */

/* ------------------------------------------------------------------ 降级开关 */

/** reduced-motion 是否开启（mql 的 matches 是活的，别缓存成一次性布尔） */
export function prefersReducedMotion(): MediaQueryList {
  return matchMedia('(prefers-reduced-motion: reduce)');
}

/** 是否应跑动画：reduced-motion 下直接落到最终态，不跑 rAF */
export function shouldAnimate(reduce: MediaQueryList): boolean {
  return !reduce.matches;
}

/* ------------------------------------------------------------------ 帧循环外壳 */

/**
 * 帧循环：每帧喂真实 dt（毫秒）给 callback，返回 stop 函数。
 * ★ 回调里禁止「每帧 += 增量」—— 要平滑就拿 dt 去算（见 develop.ts 第十版那课）。
 * ★ 首帧 dt 是 0（没有上一帧），回调要能扛住 dt=0。
 */
export function startLoop(cb: (dt: number, t: number) => void): () => void {
  let raf = 0;
  let last = performance.now();
  let stopped = false;
  const frame = (now: number) => {
    if (stopped) return;
    const dt = Math.min(now - last, 100); // 切回标签页的首帧 dt 会被拖大，钳到 100ms 防跳
    last = now;
    cb(dt, now);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

/* ------------------------------------------------------------------ 视口停帧 */

/**
 * 视口 + 标签页可见性合并的停帧开关：
 *   · 元素滚出视口（IntersectionObserver，rootMargin 预载 160px）⇒ onScreen=false
 *   · 切到别的标签页（visibilitychange）⇒ visible=false
 * 返回 { onScreen, visible, dispose }；调用方在每帧开头判 `onScreen && visible`。
 * ★ onScreen / visible 是活引用（对象属性），调用方读的是最新值，别解构成布尔。
 *
 * ★★★ 2026-10-06 墨滴实测修掉的真凶：`onScreen` 的初值必须是 **true**，不是 false。
 *   症状（留言页墨滴站主真浏览器）：**整页看不到任何墨痕，一开 F12 就全出现**
 *   （甚至没动鼠标就有了），刷新无用、换窗口尺寸无用、无头 Chrome 完全正常。
 *
 *   机制：IntersectionObserver 的**首次回调是异步的**，而 `startLoop` 的调用方
 *   每帧开头就 `if (!gate.onScreen) return`。IO 对 `position:fixed; inset:0`
 *   的满屏画布**不保证一定回调**——实测在 1920×1000 视口下自建 IO 回调 **0 次**
 *   （1440×900 下正常回调 1 次）。回调不来 ⇒ onScreen 永远停在初值
 *   ⇒ 每一帧都 early-return ⇒ **一笔墨都画不出来**。
 *   而 F12 一开，Chrome 强制重新布局 ⇒ 触发 IO 重新求值 ⇒ 恢复。
 *
 *   ⇒ 初值取 `true`（"默认认为在视口内，IO 来了再纠正"）而不是 `false`：
 *     · 对**固定定位/满屏**元素，IO 回调与否都应是 true，纠正不了什么，
 *       但初值 false 会让"IO 没来"直接等价于"永久停帧"（灾难性默认值）。
 *     · 对**随文档滚动**的元素，IO 首次回调通常在下一帧就到（只晚一帧），
 *       初值 true 的代价是首帧多画一次，可接受。
 *   ★ 代价换来的不变式：**「IO 不回调」永远不等于「停帧」**。
 */
export function createActivityGate(
  el: Element,
  opts: { onTick?: () => void; onHidden?: () => void; rootMargin?: string; initialOnScreen?: boolean } = {},
): { onScreen: boolean; visible: boolean; dispose: () => void } {
  /* ★★ 初值 true（不是 false）—— 见函数头那条★★★ 真凶注释：
     IO 首次回调是异步的，而调用方每帧开头就判 onScreen。
     初值 false ⇒「IO 没回调」直接等价于「永久停帧」⇒ 装置整个不工作，
     且只有强制重排（开 F12）才能恢复。默认 true，IO 来了再纠正。 */
  const state = { onScreen: opts.initialOnScreen ?? true, visible: document.visibilityState === 'visible' };

  const tick = () => opts.onTick?.();

  const onVis = () => {
    state.visible = document.visibilityState === 'visible';
    if (state.visible) tick();
    else opts.onHidden?.();
  };
  document.addEventListener('visibilitychange', onVis);

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) state.onScreen = e.isIntersecting;
      if (state.onScreen) tick();
    },
    { rootMargin: opts.rootMargin ?? '160px' },
  );
  io.observe(el);

  return {
    get onScreen() {
      return state.onScreen;
    },
    get visible() {
      return state.visible;
    },
    dispose() {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}

/* ------------------------------------------------------------------ 二阶欠阻尼弹簧 */

/**
 * 二阶欠阻尼弹簧（机械惯性过冲用）。
 * ★ 与 develop 的一阶指数平滑（1−e^(−t·18)，无过冲）**刻意不同**：
 *   卷尺游标要的是「停下时轻微回弹」的机械感，欠阻尼（ζ<1）才会过冲。
 * ★ 积分用**定步长子步**（1/120s 一片），不是「一帧一大步」——
 *   坑（2026-10-03 实测踩到，很隐蔽）：半隐式欧拉一次的稳定域是 dt < 2/c，
 *   k=110/c=23 时 ≈ 87ms，也就是**低于 11.5fps 就发散**；而 startLoop 把 dt
 *   钳在 100ms，所以慢机器（或软件渲染 / 长卡顿）上弹簧会炸成 Infinity→NaN，
 *   挂在上面的滚动进度跟着变 NaN ⇒ 装置直接跳到 0 或 1 的极端态。
 *   定步长后：ω·h ≈ 0.087、c·h ≈ 0.19，恒在稳定域内，且**真正**帧率无关
 *   （大 hitch 也只是多跑几步，落在 250ms 上限内）。
 * 单位与 target/当前值同域（都是 px 或比例）。
 */
const SPRING_H = 1 / 120; // 定步长（秒）
const SPRING_MAX = 250; // 单帧最多补的时长（ms）：更长的 hitch 直接放弃补，防瞬间追击
export interface SpringOpts {
  stiffness?: number; // k：越大越「硬」，回正越快（默认 170）
  damping?: number;   // c：越大越「粘」，过冲越小（默认 18，配 k=170 ⇒ ζ≈0.69 轻过冲）
}
export function createSpring(target: number, opts: SpringOpts = {}) {
  const k = opts.stiffness ?? 170;
  const c = opts.damping ?? 18;
  let x = target; // 位置
  let v = 0;      // 速度
  return {
    /** 推进 dt 毫秒，返回当前值（定步长积分，见上） */
    step(dt: number): number {
      let rem = Math.min(Math.max(0, dt), SPRING_MAX) / 1000; // 秒
      while (rem > 0) {
        const s = rem < SPRING_H ? rem : SPRING_H;
        const a = -k * (x - target) - c * v;
        v += a * s;
        x += v * s;
        rem -= s;
      }
      return x;
    },
    /** 直接跳到 target（拖动松手 / 定位用，速度归零 = 不产生回弹） */
    snap(next: number) {
      target = next;
      x = next;
      v = 0;
    },
    /** 换目标但保留当前速度（拖动跟手用，松手后从当前速度继续，才有过冲） */
    retarget(next: number) {
      target = next;
    },
    get value() {
      return x;
    },
    get settled() {
      return Math.abs(x - target) < 0.5 && Math.abs(v) < 0.5;
    },
  };
}
