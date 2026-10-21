/* =============================================================================
 * 归档页 · 索引卷尺（INDEX TAPE）—— 右侧竖向刻度尺
 *
 * 机制（与相册显影板的「连续密度场 + 等值线」**对立**，是「离散刻度 + 刚性位移」）：
 *
 *   · 竖条 = 一条按年份**等距**打刻度的卷尺；年份是「大齿」、月份是「小齿」。
 *   · 游标随页面滚动**连续**下滑，用**二阶欠阻尼弹簧**追（停下时轻微过冲 —— 机械感）。
 *   · 已经「卷过」（滚过）的刻度**留墨**：从淡灰变成绿；未卷到的是淡灰。
 *   · 读数区实时显示「当前年份 · 该年 N 篇」。
 *   · 点击 / 拖动某个刻度 ⇒ 平滑滚到对应年份分组（机械「咔哒」跳转）。
 *
 * ★ 降级四态（照抄 develop.ts 的约定）：
 *   ① reduced-motion ⇒ 落到最终态：游标直接贴到目标（不跑 rAF、不过冲）。
 *   ② 无 JS ⇒ 装置不存在（[hidden] + aria-hidden），归档列表服务端已渲染完整。
 *   ③ 移动端 ≤767px ⇒ 不渲染；跨回桌面时重新测量，不缓存隐藏态的零高度。
 *   ④ 视口外 / 切标签 ⇒ 停帧（rl-core 的 activityGate）。
 *
 * ★ 时间/平滑约定：位置吃**真实 dt**（二阶弹簧半隐式欧拉），禁「每帧固定系数」；
 *   无随机源 —— 游标位置是 t 与滚动量的确定函数，可跨加载逐点比对。
 */
import { startLoop, createSpring, createActivityGate, shouldAnimate, prefersReducedMotion } from './rl-core';

(() => {
  const host = document.querySelector<HTMLElement>('[data-tape]');
  if (!host) return;
  const track = host.querySelector<HTMLElement>('[data-tape-track]');
  const cursor = host.querySelector<HTMLElement>('[data-tape-cursor]');
  const readYear = host.querySelector<HTMLElement>('[data-tape-year]');
  const readCount = host.querySelector<HTMLElement>('[data-tape-count]');
  if (!track || !cursor || !readYear || !readCount) return;

  /* 年份刻度（大齿）+ 页面里的年份分组（跳转目标）。都按 data-year 对齐。 */
  const ticks = Array.from(host.querySelectorAll<HTMLElement>('.tape-tick.is-year[data-year]'));
  const groups = new Map<string, HTMLElement>();
  for (const g of document.querySelectorAll<HTMLElement>('.yeargroup[data-year]')) {
    groups.set(g.dataset.year!, g);
  }
  if (ticks.length === 0) return;

  /* ★ 必须先摘 [hidden] 再量尺寸：display:none 时 clientHeight 是 0，刻度位置会全算成 0。
     （同 develop.ts 的「必须先露面再量尺寸」。） */
  host.hidden = false;

  /* 高度随断点和视口变化；隐藏态的零高度不能用作除数。 */
  let trackH = 0;
  const desktop = matchMedia('(min-width: 768px)');
  const yearPos: { year: string; count: number; y: number }[] = ticks.map((el) => ({
    year: el.dataset.year!,
    count: Number(el.dataset.count ?? 0),
    y: 0,
  }));

  const reduce = prefersReducedMotion();
  const animate = shouldAnimate(reduce);

  /* 读数：默认显示最顶（最新）那一年 */
  const paintReadout = (year: string, count: number) => {
    readYear.textContent = year;
    readCount.textContent = `· ${count} 篇`;
  };
  paintReadout(yearPos[0].year, yearPos[0].count);

  /* 游标：二阶欠阻尼弹簧（轻过冲）。游标值域 = 轨道高。 */
  const spring = createSpring(0, { stiffness: 170, damping: 18 });

  /* 当前滚动进度 → 游标目标（轨道顶 = 最新年，底 = 最早年） */
  const scroller = () => document.scrollingElement || document.documentElement;
  const scrollable = () => Math.max(1, scroller().scrollHeight - window.innerHeight);
  const targetFor = () => {
    const p = Math.min(1, Math.max(0, scroller().scrollTop / scrollable()));
    return p * trackH;
  };
  const yearAt = (y: number) => {
    const p = trackH > 0 ? Math.min(1, Math.max(0, y / trackH)) : 0;
    /* p → 最近的年份刻度索引（等距刻度 ⇒ 线性映射，确定函数） */
    const idx = Math.round(p * (yearPos.length - 1));
    return yearPos[idx];
  };

  /* 「卷过的刻度留墨」：游标上方（已滚过）的刻度加 .past */
  const paintPast = (y: number) => {
    for (let i = 0; i < yearPos.length; i++) {
      const el = ticks[i];
      const above = yearPos[i].y <= y + 0.5; // 刻度位置 ≤ 游标 ⇒ 已卷过
      el.classList.toggle('past', above);
    }
  };

  const setCursor = (y: number) => {
    cursor.style.transform = `translateY(${y}px)`;
  };

  /* 单帧：推进弹簧 + 写游标 + 更新读数与留墨 */
  let lastYear = yearPos[0].year;
  const render = (dt: number) => {
    if (trackH <= 0) return;
    const y = animate ? spring.step(dt) : targetFor(); // reduced-motion：直接贴目标
    setCursor(y);
    const cur = yearAt(y);
    if (cur.year !== lastYear) {
      lastYear = cur.year;
      paintReadout(cur.year, cur.count);
    }
    paintPast(y);
  };

  /* 滚动：把游标目标换成最新进度，弹簧自己追过去（松手后从当前速度继续 ⇒ 过冲） */
  const onScroll = () => {
    if (trackH <= 0) return;
    spring.retarget(targetFor());
    if (!animate) render(0);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  const measure = () => {
    host.hidden = !desktop.matches;
    trackH = desktop.matches ? track.clientHeight : 0;
    for (let i = 0; i < ticks.length; i++) {
      yearPos[i].y = (parseFloat(ticks[i].dataset.pos!) / 100) * trackH;
    }
    spring.snap(targetFor());
    render(0);
  };
  window.addEventListener('resize', measure, { passive: true });
  desktop.addEventListener('change', measure);
  const sizeObserver = new ResizeObserver(measure);
  sizeObserver.observe(track);

  /* 首帧：游标直接停在当前进度（入场不做滑行动画 —— 初始 scrollTop 在顶部，滑了也看不见） */
  measure();

  /* ===== 交互：点击 / 拖动刻度 ⇒ 跳转到对应年份分组 ===== */
  const jumpTo = (year: string) => {
    const g = groups.get(year);
    if (!g) return;
    g.scrollIntoView({ behavior: animate ? 'smooth' : 'auto', block: 'start' });
  };
  /* 点击年份刻度（含刻度旁的数字 i）跳转 */
  for (const el of ticks) {
    el.addEventListener('click', () => jumpTo(el.dataset.year!));
  }
  /* 拖动轨道：pointermove 期间按 y 算最近的年份刻度，松手跳过去。
     ★ capture 挂在 **track**（监听所在的元素）上：挂到 host 的话，pointerup 会被
       重定向到 host、track 收不到 ⇒ jumpTo 永远不触发（实测踩过）。 */
  let dragging = false;
  const onPointerDown = (e: PointerEvent) => {
    if (trackH <= 0) return;
    dragging = true;
    track.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const rect = track.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const cur = yearAt(Math.min(Math.max(0, y), rect.height));
    paintReadout(cur.year, cur.count);
    /* 拖动时游标跟手（直接贴，不弹），松手再跳 */
    setCursor(y);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    const rect = track.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const cur = yearAt(Math.min(Math.max(0, y), rect.height));
    jumpTo(cur.year);
  };
  track.addEventListener('pointerdown', onPointerDown);
  track.addEventListener('pointermove', onPointerMove);
  track.addEventListener('pointerup', onPointerUp);

  /* ===== 停帧（视口外 / 切标签）===== */
  const gate = createActivityGate(host, {
    onTick: () => {
      spring.retarget(targetFor());
    },
  });

  /* ===== 启动 ===== */
  if (animate) {
    /* 正常：跑 rAF，每帧判门（视口外/切标签不推进弹簧，游标停在原处不闪）。
       gate 的 onTick（见 createActivityGate 传参）在滚回视口/切回标签页时把目标换成最新进度。 */
    const stop = startLoop((dt) => {
      if (trackH > 0 && gate.onScreen && gate.visible) render(dt);
    });
    /* 页面卸载时清理（bfcache 回来不重跑脚本，这里只清 rAF 与 observer） */
    window.addEventListener('beforeunload', () => {
      stop();
      gate.dispose();
      sizeObserver.disconnect();
    }, { once: true });
  } else {
    /* reduced-motion：不跑 rAF，直接画最终态 */
    setCursor(targetFor());
    const cur = yearAt(targetFor());
    paintReadout(cur.year, cur.count);
    paintPast(targetFor());
  }
})();
