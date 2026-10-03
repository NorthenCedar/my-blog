/* =============================================================================
 * 文章页 · 阅读尺（READING RULE）—— 视口底部的横向直尺
 *
 * ★ 机制与归档卷尺（index-tape.ts）**镜像**（口径 #5「每页一个机制上不同的互动」）：
 *
 *              INDEX TAPE（归档）            READING RULE（文章，本文件）
 *   方向       竖直                          水平
 *   存在       常驻（右侧 60vh 竖条）        滚动才抽出、停手 900ms 收回（口径 #8）
 *   谁在动     **游标在动、尺不动**          **尺在动、读头不动**
 *   手感       二阶弹簧过冲（机械惯性）      无弹簧（确定函数，不回弹）
 *   刻度       年份等距（离散刻度）          全文压缩地图 + 文章自己的 h2/h3
 *
 *   · 读头**钉在条左端**（bar-local x = 0）：读头左边 = 已读过的（被推出左侧），
 *     读头右边 = 还没读的。读数区显示 `§n / 总数  百分比`。
 *   · 纸带 = 全文的压缩地图：1% 小齿 / 5% 中齿 / 10% 大齿（带数字）；
 *     绿色长齿 = h2（带 §n 标签）、短齿 = h3。
 *   · 点尺面 = 按比例跳转（scrub）。
 *
 * ★ 「even 映射」（站主 2026-10-03 拍板）：读头位置按**节节点做分段线性插值**，
 *   节齿等距排（t = (i+1)/(m+1)）⇒ 保证「读头每读到新的一节，就**准确压在那根齿上**」。
 *   对照过的 linear 映射（读头 = 滚动比例）会把**末屏里的标题**全钳到 100%，
 *   在尺右端挤成一堆（探针实测 4 根齿叠在 tickT=1.0000）。
 *   ⇒ linear 那条路径**已删、不留开关**：站主已拍板，留着两套只会各自腐化。
 *
 * ★ 降级四态（照抄 develop.ts / index-tape.ts 的约定）：
 *   ① reduced-motion ⇒ 尺**常驻可见 + 无出入过渡**，位置随滚动即时更新（不跑 rAF 节流）。
 *   ② 无 JS ⇒ 装置**不存在**（[hidden] + aria-hidden），正文本身服务端渲染完整。
 *   ③ 移动端 ≤767px ⇒ 不渲染（CSS display:none，本脚本在窄屏直接不干活）。
 *   ④ 视口外 / 切标签 ⇒ 停帧（rl-core 的 activityGate）。
 *
 * ★ 时间/确定性约定：**没有动画循环、没有时间项** —— 读头位置是「滚动量 + 节节点」的
 *   纯函数，跨加载逐字节可复现（无随机源、无 dt）。
 */
import { createActivityGate, prefersReducedMotion, shouldAnimate } from './rl-core';

(() => {
  const rule = document.querySelector<HTMLElement>('[data-rule]');
  const prose = document.querySelector<HTMLElement>('.prose');
  if (!rule || !prose) return;

  const bar = rule.querySelector<HTMLElement>('[data-rule-bar]');
  const tape = rule.querySelector<HTMLElement>('[data-rule-tape]');
  const readSec = rule.querySelector<HTMLElement>('[data-rule-sec]');
  const readTotal = rule.querySelector<HTMLElement>('[data-rule-total]');
  const readPct = rule.querySelector<HTMLElement>('[data-rule-pct]');
  if (!bar || !tape || !readSec || !readTotal || !readPct) return;

  const heads = Array.from(prose.querySelectorAll<HTMLElement>('h2, h3'));
  if (heads.length === 0) return; // 没有节 ⇒ 尺上没有齿可压，不装

  const scroller = () => document.scrollingElement || document.documentElement;
  const maxScroll = () => Math.max(1, scroller().scrollHeight - window.innerHeight);
  const progress = () => Math.min(1, Math.max(0, scroller().scrollTop / maxScroll()));

  const narrow = matchMedia('(max-width: 767px)');
  const reduce = prefersReducedMotion();
  const animate = shouldAnimate(reduce);

  /* ★ 必须先摘 [hidden] 再量尺寸：display:none 时 clientWidth 是 0，刻度会全算成 0
     （同 develop.ts / 卷尺的「先露面再量尺寸」）。摘掉 [hidden] 后 .rule 仍是
     translateY(110%) —— 停在视口外，不影响任何测量，也不会闪一下。 */
  rule.hidden = false;

  let secPos: { o: number; h2: boolean }[] = [];
  let nodes: { o: number; t: number }[] = []; // even 映射的分段线性节点

  /* 量标题偏移。★ 必须量两次：字体 swap 会改变行高 ⇒ 首量的偏移不可信
     （见文末 document.fonts.ready），这是实验台里实测偏差很大的一条。 */
  function measure() {
    const base = scroller().scrollTop;
    const ms = maxScroll();
    secPos = heads.map((h) => ({
      o: h.getBoundingClientRect().top + base,
      h2: h.tagName === 'H2',
    }));
    const m = heads.length;
    nodes = [{ o: 0, t: 0 }];
    secPos.forEach((s, i) => nodes.push({ o: Math.min(s.o, ms), t: (i + 1) / (m + 1) }));
    nodes.push({ o: ms, t: 1 });
    /* 单调性兜底：末屏里的若干标题会被钳到同一个 o ⇒ t 可能回退。强制非降，
       否则 headT 会在「并列节点」上跳变（实验台里量到过）。 */
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i].t < nodes[i - 1].t) nodes[i].t = nodes[i - 1].t;
    }
  }

  /* 纸带 = 全文的压缩地图：刻度 local = (t + 1) × bw，t 从 −1 排到 +2
     ⇒ 读头两侧永远有纸，任何进度下都不会露出空条。 */
  function build() {
    const bw = bar.clientWidth;
    if (!bw) return; // 窄屏（display:none）宽为 0 ⇒ 等 resize 时重建
    tape.style.width = bw * 3 + 'px';
    /* 清空纸带：**不许用 innerHTML**（本站硬约束，dist 全量 JS 扫描有测试守着）⇒ 逐个摘子节点。
       节点都在本地创建、没有任何用户输入进来，这里也没有 XSS 面。 */
    while (tape.firstChild) tape.removeChild(tape.firstChild);
    for (let i = -100; i <= 200; i++) {
      const t = document.createElement('span');
      t.className = 'tk ' + (i % 10 === 0 ? 'tk-major' : i % 5 === 0 ? 'tk-mid' : 'tk-minor');
      t.style.left = ((i + 100) * bw) / 100 + 'px';
      if (i >= 10 && i <= 100 && i % 10 === 0) {
        const b = document.createElement('b');
        b.textContent = String(i);
        t.appendChild(b);
      }
      tape.appendChild(t);
    }
    /* 节齿：等距（even），h2 = 长齿带 §n 标签、h3 = 短齿不带标签 */
    let n = 0;
    let lastLabelX = -1e9;
    heads.forEach((_h, idx) => {
      const h2 = secPos[idx].h2;
      const el = document.createElement('span');
      el.className = 'tk tk-sec' + (h2 ? '' : ' is-h3');
      const x = ((idx + 1) / (heads.length + 1) + 1) * bw;
      el.style.left = x + 'px';
      if (h2) {
        n++;
        /* 标签防撞：与前一个标签不足 30px 就不印（齿仍留下）——
           不这么做会出现「§5§6 叠在一起」。 */
        if (x - lastLabelX > 30) {
          const lab = document.createElement('i');
          lab.textContent = '§' + n;
          el.appendChild(lab);
          lastLabelX = x;
        }
      }
      tape.appendChild(el);
    });
    readTotal.textContent = '/ ' + n;
  }

  /* 滚动比例 → 读头位置 t（even：在节节点之间分段线性插值） */
  function headT(p: number) {
    if (nodes.length < 3) return p;
    const y = p * maxScroll();
    for (let i = 1; i < nodes.length; i++) {
      if (y <= nodes[i].o) {
        const a = nodes[i - 1];
        const b = nodes[i];
        const k = b.o > a.o ? (y - a.o) / (b.o - a.o) : 1;
        return a.t + (b.t - a.t) * k;
      }
    }
    return 1;
  }

  /* 读头位置 t → 滚动比例（点尺面跳转用；even 要**反解**分段线性） */
  function scrollForT(t: number) {
    if (nodes.length < 3) return t;
    for (let i = 1; i < nodes.length; i++) {
      if (t <= nodes[i].t) {
        const a = nodes[i - 1];
        const b = nodes[i];
        const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
        return (a.o + (b.o - a.o) * k) / maxScroll();
      }
    }
    return 1;
  }

  /* 走纸映射：T = −(1 + t)·bw ⇒ 读头在条左端（screen = (t′ − t)·bw）。
     t = 0 时整条尺（0..100）正好铺满屏幕 —— 最像「一把完整的尺」。 */
  function paint() {
    const bw = bar.clientWidth;
    if (!bw) return;
    const p = progress();
    const t = headT(p);
    tape.style.transform = `translateX(${-(1 + t) * bw}px)`;
    readPct.textContent = Math.round(t * 100) + '%';
    /* 节号 = 「偏移已被越过」的最后一个 h2 的序号；一节都没到过时显示「序」 */
    const y = p * maxScroll();
    let upTo = -1;
    secPos.forEach((s, i) => {
      if (s.o <= y + 1) upTo = i;
    });
    let k = 0;
    for (let i = 0; i <= upTo; i++) if (secPos[i].h2) k++;
    readSec.textContent = upTo < 0 ? '序' : '§' + Math.max(1, k);
  }

  /* 停手 900ms 收回（口径 #8：阅读型页面的装置滚动即退场，不打断阅读）。
     reduced-motion 下尺**常驻**、不做抽出-收回。 */
  let idle = 0;
  const show = () => {
    rule.classList.add('is-out');
    if (!animate) return;
    clearTimeout(idle);
    idle = window.setTimeout(() => rule.classList.remove('is-out'), 900);
  };

  /* 停帧：观察 **正文**，不是观察 .rule —— .rule 自己就是 fixed，收起时
     translateY(110%) 会移出视口，IntersectionObserver 会判它不在屏，
     于是「一旦收回就再也醒不过来」。观察正文的语义也更准：
     正文不在屏上（读到评论区 / 还没滚到正文）时，尺本就不该工作。 */
  const gate = createActivityGate(prose, {
    onTick: () => {
      if (animate) paint(); // 滚回视口 / 切回标签页：补一次重绘（**不**主动把尺抽出来）
    },
  });

  let raf = 0;
  const onScroll = () => {
    if (narrow.matches) return; // 移动端不渲染 ⇒ 脚本也不干活
    if (!gate.onScreen) return; // 正文已滚出视口 ⇒ 停帧（也顺带让尺保持收回）
    show();
    if (!animate) {
      paint(); // reduced-motion：随事件即时重绘，不排 rAF
      return;
    }
    if (raf) return; // 一帧只重绘一次（滚动事件远密于帧）
    raf = requestAnimationFrame(() => {
      raf = 0;
      paint();
    });
  };

  let rz = 0;
  const onResize = () => {
    clearTimeout(rz);
    rz = window.setTimeout(() => {
      measure();
      build();
      paint();
    }, 180);
  };

  /* 点尺面 = 按比例跳转：条上的 x 位置 = 「读头右侧第几个 t」 */
  bar.addEventListener('click', (e) => {
    const r = bar.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, headT(progress()) + (e.clientX - r.left) / r.width));
    scroller().scrollTop = scrollForT(t) * maxScroll();
  });

  /* 首帧 */
  measure();
  build();
  paint();

  if (animate) {
    window.addEventListener('scroll', onScroll, { passive: true });
  } else {
    /* reduced-motion：尺常驻（is-out）+ 去掉出入过渡（is-instant） */
    rule.classList.add('is-out', 'is-instant');
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  window.addEventListener('resize', onResize, { passive: true });

  /* 字体 swap 会改行高 ⇒ 首量的标题偏移不可信，就绪后**再量一次**。 */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      measure();
      build();
      paint();
    });
  }
})();
