/* =============================================================================
 * 留言页 · 声纹带 VOICEPRINT —— 控制器（2026-10-14）
 *
 * 把 `comments.ts` 送来的留言流画成一条波形带。**排布数学全在 voiceprint-core**，
 * 本文件只管"取到数据 → 画出来 / 响应控件"，一行几何计算都不在这里。
 *
 * ★★★ 降级链：不是"装个弱的"，是**根本不注册**。
 *   装置那一档的四个前提 —— 页面有标记 / 允许动效 / 节点齐全 / 拿到了数据 —— 缺一个就安静退出，
 *   页面留在 Voiceprint.astro 的静态形态上（一条平的线 + 一句说明）。
 *     ④ 接口失败时事件压根没来，所以「没画」是**默认状态**，不是需要额外分支去挡的异常。
 *   ⚠️ 绝不用 `hidden` 做门控：站内踩过（`hidden` = display:none ⇒ 尺寸恒 0 ⇒
 *     永远画不出第一帧）。本装置用 SVG + viewBox，本身也不依赖任何测量。
 *   ⚠️ 也**零 rAF**：波形是一次性画完的确定图形（照准星那台的路子），
 *     所以减少动效档与无头截图都给得出确定性结果。
 *
 * ★★ 控件与装置分开注册：**排序不是动效**，减少动效的用户一样要能用；
 *   声纹带的时间窗在 reduce 下没有作用对象，由 CSS 把整组撤掉。
 *
 * 数据来源：`comments.ts` 的 `CustomEvent('voiceprint' / 'voiceprint:new')`。
 *   本文件**不 fetch**、不轮询、不观察 DOM —— 那三样都会与留言列表抢主线程，
 *   而且"DOM 变了"不是"留言成功了"的可靠信号。
 */
import { prefersReducedMotion, shouldAnimate } from './rl-core';
import { bucketize, envelope, ticks, pickUnit, toNotes, type Note } from './voiceprint-core';

(() => {
  const root = document.querySelector<HTMLElement>('[data-voiceprint]');
  const list = document.querySelector<HTMLElement>('[data-list]');
  if (!root && !list) return;

  const animate = shouldAnimate(prefersReducedMotion());
  const NS = 'http://www.w3.org/2000/svg';
  /* viewBox 是 0 0 1000 100；`preserveAspectRatio="none"` 把它拉满版心。
     这几个常数是 **viewBox 坐标**，不是像素 —— 它们与实际宽高无关，改版心不会走形。 */
  /* viewBox 是 0 0 1000 100；`preserveAspectRatio="none"` 把它拉满版心。
   这几个常数是 **viewBox 坐标**，不是像素 —— 它们与实际宽高无关，改版心不会走形。
   ★ TOP 是峰值**上方**的留白（站主 2026-10-14：波形顶到带上缘时会贴着上面那行标题，
   12 改到 18）。SPAN 是波形实际可用的纵向跨度，两者之和 < H。 */
const W = 1000, H = 100, TOP = 18, SPAN = 68, SAMPLES = 240;
  const DAY = 86400000;

  let notes: Note[] = [];
  let windowed: Note[] = [];   // 当前时间窗筛出来的那些
  let windowDays = 0;          // 0 = 全部

  /** 取时间窗。★ 参照点是**今天**，不是"最新一条留言"。
   *  一开始写的是后者 ⇒ 最新那条永远落在窗口内 ⇒ "这段时间还没有人留言"
   *  成了**永远走不到的死代码**，而"最近 30 天没人来"恰恰是最该被说出口的一句话。
   *  ⇒ 用今天做参照点，窗口就可能真的空，而空的时候我们照实说。 */
  const applyWindow = () => {
    if (windowDays === 0) { windowed = notes.slice(); return; }
    const cut = Date.now() - windowDays * DAY;
    windowed = notes.filter((n) => {
      const t = Date.parse(n.createdAt);
      return Number.isFinite(t) && t >= cut;
    });
  };

  /* ---------- 装置本体（四个前提缺一不可）---------- */
  const wave = root?.querySelector<SVGPathElement>('[data-vp-wave]');
  const replies = root?.querySelector<SVGGElement>('[data-vp-replies]');
  const axis = root?.querySelector<HTMLElement>('[data-vp-axis]');
  const read = root?.querySelector<HTMLElement>('[data-vp-read]');
  const live = Boolean(root && wave && replies && axis && read && animate);

  const day = (t: number) => {
    const d = new Date(t);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  const draw = () => {
    if (!live || !wave || !replies || !axis || !read) return;
    /* ★ 每次重画**先摘掉**就绪态，再看要不要重新挂。
       只加不摘的话：从"有数据"切到"空窗口"（或从有到无）时，静态平线会继续隐身、
       屏幕上留着**上一条波形** —— 读数说"这段时间没人留言"、画面却还在讲旧故事。
       （这条是测试先抓出来的，不是想出来的。） */
    root?.classList.remove('is-ready');
    const win = windowDays === 0 ? '全部' : `近 ${windowDays} 天`;
    if (windowed.length === 0) {
      /* 窗口是空的也要说清**是哪一段**是空的 —— 只说"还没有人留言"，
         访客会不知道自己刚才点的是哪个窗口。 */
      read.textContent = `${win} · ${windowDays === 0 ? '还没有人留言。' : '这段时间还没有人留言。'}`;
      return;
    }
    let lo = Infinity, hi = -Infinity;
    for (const n of windowed) {
      const t = Date.parse(n.createdAt);
      if (!Number.isFinite(t)) continue;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    if (!Number.isFinite(lo)) { read.textContent = '还没有可读的留言时间。'; return; }

    const spanDays = (hi - lo) / DAY;
    const bins = bucketize(windowed, spanDays);
    const v = envelope(bins, SAMPLES);
    const t0 = bins[0].start;
    const span = Math.max(1, bins[bins.length - 1].end - t0);
    const xOf = (i: number) => (i / (SAMPLES - 1)) * W;

    /* 波形：包络点直接连成折线。稀疏时是两个小包、密集时是一条起伏的带 ——
       密度自己说话，不需要额外图例。 */
    let d = '';
    for (let i = 0; i < v.length; i++) {
      const y = H - TOP - v[i] * SPAN;
      d += (i === 0 ? 'M' : 'L') + xOf(i).toFixed(1) + ' ' + y.toFixed(1);
    }
    wave.setAttribute('d', d);

    /* 回复刻度：每个"有人回应"的桶画一根短竖。★ 每次重画先清空，
       否则新留言进来时旧刻度会累积。 */
    replies.replaceChildren();
    for (const b of bins) {
      if (b.replies <= 0) continue;
      const i = Math.round((((b.start + b.end) / 2) - t0) / span * (SAMPLES - 1));
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', xOf(i).toFixed(1));
      line.setAttribute('x2', xOf(i).toFixed(1));
      line.setAttribute('y1', String(H - TOP + 6));
      line.setAttribute('y2', String(H + 2));
      replies.appendChild(line);
    }

    /* 时间刻度用 **HTML**（绝对定位 + left 百分比），不是 SVG <text>。
       波形那条 SVG 用 `preserveAspectRatio="none"` 压扁 viewBox ⇒ 里面的文字会被纵向压变形，
       2026-10-14 的目检截图里就是这样：标签与波形互相穿过。 */
    axis.replaceChildren();
    for (const t of ticks(bins, pickUnit(spanDays))) {
      const el = document.createElement('span');
      el.style.left = `${(((t.at - t0) / span) * 100).toFixed(2)}%`;
      el.textContent = t.label;
      axis.appendChild(el);
    }

    /* ★ 读数必须诚实：接口有 LIMIT 200，所以这里说的是"**最近** N 条"，
       不是全站留言总量。没有留言的日子是一条平的线，而不是被抹掉。 */
    const top = windowed.reduce((n, x) => n + (x.isReply ? 0 : 1), 0);
    const rep = windowed.length - top;
    read.textContent = `${win} · ${windowed.length} 条 · ${top} 条留言 · ${rep} 条回应 · ${day(lo)} — ${day(hi)}`;
    root?.classList.add('is-ready');
  };

  const receive = () => { applyWindow(); draw(); };

  if (live) {
    window.addEventListener('voiceprint', (e) => {
      /* ★ 事件带的是**接口原样两张表**，摊平成一维是本装置的事 ——
         `comments.ts` 是文章页共用的，在那里 import core 会把整台装置拖进每篇文章的包
         （实测文章页 JS 超预算 1008 字节）。 */
      const d = (e as CustomEvent<{ comments?: Note[]; replies?: Note[] }>).detail;
      notes = toNotes(d?.comments ?? [], d?.replies ?? []);
      receive();
    });
    window.addEventListener('voiceprint:new', (e) => {
      const note = (e as CustomEvent<{ note: Note }>).detail?.note;
      if (!note) return;
      notes = [...notes, note];
      receive();
    });
  }

  /* ---------- 控件 ①：留言列表排序（无条件可用）---------- */
  /* ★ 只**重排现有节点**（appendChild），不重建 DOM ⇒ 每张 li 上已经展开的回复表单、
     正在输入的回复内容全都还在。重建 DOM 会把这些状态全丢掉。
     ★ 排序键用 `data-id`（接口的自增主键）而不是"保存一份原始顺序快照"：
       留言是 `prepend` 进列表的，快照会过期，新留言就会排到错的位置。 */
  const sortBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-vp-sort]'));
  for (const b of sortBtns) {
    b.addEventListener('click', () => {
      if (!list) return;
      const asc = b.dataset.vpSort === 'asc';
      const key = (n: Element) => Number((n as HTMLElement).dataset.id ?? 0);
      const target = Array.from(list.children).sort((x, y) => (asc ? key(x) - key(y) : key(y) - key(x)));
      for (const n of target) list.appendChild(n);
      for (const o of sortBtns) o.setAttribute('aria-pressed', String(o === b));
    });
  }

  /* ---------- 控件 ②：声纹带时间窗 ---------- */
  const winBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-vp-window]'));
  for (const b of winBtns) {
    b.addEventListener('click', () => {
      windowDays = b.dataset.vpWindow === 'all' ? 0 : Number(b.dataset.vpWindow) || 0;
      for (const o of winBtns) o.setAttribute('aria-pressed', String(o === b));
      receive();
    });
  }
})();