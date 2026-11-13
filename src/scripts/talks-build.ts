/**
 * 说说页的装置：**多光标搭建**（站主 2026-11-12 指定，照参考站 LeiBox multi-cursor-builder）。
 *
 * 口径（站主四轮原话）：
 *   · 「说说页我想做成 leibox 那种多光标页面搭建的效果」；
 *   · 「我是让你用多光标页面搭建这个效果把说说页搭建起来，不是让你直接把这个放到说说页」；
 *   · 「多光标搭建你直接抄那个参考站的，不要自己做」；
 *   · 「文字和图片都要有单独拉过来的感觉……每一个板块都要是拉过来的一样，不要直接浮现」。
 *   ⇒ 不是插一块演示，而是**这一页本身**由七枚光标搭出来，且每种板块的搭法不同。
 *
 * 抄的是参考站源码（`_probe/reference/multi-cursor-builder.html`）里的**三种动作**：
 *   · text  —— 十字扫过拉出文字框 → 变 I-beam → **逐字打出来**；
 *   · carry —— 光标飞到远处，**整块跟着它被拖回来**（`translate3d` + drop-shadow，落地归位）；
 *   · rect  —— 十字拉框、clip-path 从左擦出 → 光标飞远 → **拖着一张缩略图飞回来**落进框里。
 * 上一版只做了"框 + 浮现"，所以站主看到"图片在原地没动" —— 缺的就是那只手里被拖的图。
 *
 * 时间轴也照参考站：进度 s ∈ [0, D]，**由光标自己走完**（不是随滚动连续给值）；
 * 滚动只决定"该不该开始"（top < 82% 视口高）/ "该不该撤"（top > 92%）；撤回 2.2×；
 * 每块的 D 按参考站公式（carry 1.04s、rect 2.08s、text ≈ 0.59s + 字数/46~110）。
 * 搭建比参考站默认时钟稍快，拖拽、打字和撤回沿用原时间线。
 *
 * 多光标：七枚光标空闲时满视口漂移，谁离目标最近谁接活；前一块搭到 20% 才轮到下一块
 * （参考站的节奏约束），所以屏上同时有 2~4 块在被不同的手搭 —— 这就是"多光标"。
 *
 * ⚠ 坐标一律走缓存（`bx/by/bw/bh`）。**绝不能在带 transform 的元素上读
 *   `getBoundingClientRect`**：carry 让整块位移，测回来的是位移后的框，
 *   于是"拿它当基准再算位移"会把元素推得越来越远（正反馈）。
 *   滚动时用差量修正缓存，无变换的段落才重读实测值校准。
 *
 * 预算：本页 JS 有硬预算（tests/talks-float.test.ts）。不引库、不复制整台引擎。
 */

type Kind = 'text' | 'carry' | 'rect';
/** 光标工具形态（参考站那四个）。 */
type Tool = 'arrow' | 'cross' | 'ibeam' | 'grab';

type Seg = {
  el: HTMLElement;
  k: Kind;
  /** 建造进度 0 → D。 */
  s: number;
  /** 这一块的总时长（秒）。 */
  D: number;
  dir: 1 | -1 | 0;
  want: 1 | -1 | 0;
  cur: Cur | null;
  att: boolean;
  tr: { x: number; y: number; t: number; d: number } | null;
  /** 完成时刻（框的收尾淡出用）。 */
  done: number;
  last: number;
  /** 基准矩形（视口坐标，元素**未**变换时的位置）。 */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  side: 1 | -1;
  /** 已落定（跳过动画、不再回滚）：滚出视口上方 / 排队超时 / 安全网。 */
  frozen: boolean;
  /** text：逐字单元（首次施工时才拆，避免首屏就造上千个 span）。 */
  units: HTMLElement[] | null;
  on: number;
  /** 行高（caret 用），首次施工时缓存。 */
  lh: number;
  /** rect：拖拽的缩略图来源 + 文件名胶囊 + 圆角。 */
  src: CanvasImageSource | null;
  label: string;
  radius: string;
  tag: string;
};

type Cur = {
  name: string;
  col: string;
  x: number;
  y: number;
  tool: Tool;
  down: boolean;
  a: number;
  nm: number;
  ph: number;
  hx: number;
  hy: number;
  job: Seg | null;
  tr: { x: number; y: number; t: number; d: number } | null;
};

/** 七枚光标：简单、有诗意的单词。配色沿用参考站那套（Figma 取色，亮暗都够对比）。 */
const NAMES = ['Lumen', 'Vesper', 'Wisp', 'Moss', 'Aster', 'Ember', 'Rill'] as const;
const COLS = ['#0d99ff', '#9747ff', '#ff24bd', '#14ae5c', '#ffa629', '#f24822', '#00b5ce'] as const;

const BLUE = '#0d99ff';

const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const FONT = '600 10.5px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
/** 文件名胶囊：太长会盖住被拖的图本身（参考站的名字本来就很短）。 */
const short = (s: string) => (s.length > 22 ? `${s.slice(0, 19)}…${s.slice(-2)}` : s);

export function initTalksBuild(): void {
  /* `[data-talks-build]` 只是"这一页装了这台装置"的标记（挂在 `<ol>` 上）。
     要搭的**不只是**列表：页头、说明也在其中，所以目标从**整页**找。 */
  if (!document.querySelector('[data-talks-build]')) return;
  /* 减少动效：不建。内容本来就可见（CSS 只在 html.build-ok 下才藏）。 */
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const nodes = [...document.querySelectorAll<HTMLElement>('[data-build]')];
  if (!nodes.length) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'tb-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  document.documentElement.classList.add('build-ok');

  /* ---------- 视口 / DPR ---------- */
  let vw = 0;
  let vh = 0;
  const resize = () => {
    vw = innerWidth;
    vh = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  /* ---------- 登记板块 ---------- */
  const tagOf = (el: HTMLElement, k: Kind): string => {
    if (k === 'text') return '文字';
    if (k === 'rect') return el.querySelector('video') ? '视频' : '图片';
    if (el.tagName === 'TIME') return '日期';
    if (el.classList.contains('talk-audio')) return '语音';
    if (el.classList.contains('acts')) return '操作';
    if (el.classList.contains('pagehead')) return '标题';
    return '组件';
  };

  const segs: Seg[] = nodes.map((el) => {
    const raw = el.dataset.build;
    let k: Kind = raw === 'text' || raw === 'rect' ? raw : 'carry';
    /* 正文里要是有图片、按钮、表单之类，逐字拆会把结构搞坏 ⇒ 退化成整块拖。
       （`**加粗**` 与链接是行内元素，可以拆。） */
    if (k === 'text' && el.querySelector('img, video, audio, button, input, textarea, form, select'))
      k = 'carry';
    const txt = k === 'text' ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
    const len = txt.length;
    const D =
      k === 'text'
        ? 0.45 + 0.14 + len / (len > 60 ? 110 : 46) /* 参考站 text 公式 */
        : k === 'rect'
          ? 2.08 /* .6 拉框 + .38 飞走 + .8 拖回 + .3 收尾 */
          : 1.04; /* .32 + .72 */
    return {
      el,
      k,
      s: 0,
      D,
      dir: 0,
      want: 0,
      cur: null,
      att: false,
      tr: null,
      done: -9,
      last: -1,
      bx: 0,
      by: 0,
      bw: 0,
      bh: 0,
      side: 1,
      frozen: false,
      units: null,
      on: -1,
      lh: 0,
      src: null,
      label: '',
      radius: '',
      tag: tagOf(el, k),
    };
  });

  const read = (g: Seg) => {
    const r = g.el.getBoundingClientRect();
    g.bx = r.left;
    g.by = r.top;
    g.bw = r.width;
    g.bh = r.height;
    g.side = r.left + r.width / 2 < vw / 2 ? -1 : 1;
  };

  /* ★★ 2026-11-13 站主：「鼠标搭建动画在评论上面」。
     评论展开后是一块**可交互的内容区**（列表 + 表单），光标与拉框压在上面既乱又挡。
     ⇒ 登记所有评论盒，`measure()` 里把「展开着的」现算成禁入矩形（`avoid`）：
       · 展开高度是 320ms 动画出来的，缓存矩形会过期，所以每次 measure 重算；
       · 判定用 `inert`（收起时 talks.ts 会给它加上），比读 `aria-hidden` 稳。 */
  const cboxes = [...document.querySelectorAll<HTMLElement>('.cbox')];
  const avoid: { l: number; t: number; r: number; b: number }[] = [];

  /** 把块退回"没搭"的样子：摘掉脚本写的 inline 样式 ⇒ 交还给 CSS 的 `opacity:0`。
   *  撤回走到头、以及"没人看得见所以不必演"的场合都用它。 */
  function reset(g: Seg) {
    const el = g.el;
    el.style.opacity = '';
    el.style.transform = '';
    el.style.filter = '';
    el.style.clipPath = '';
    el.style.willChange = '';
    /* 已拆字的块要逐字收回去，否则下次重搭时 `apply` 会以为它们还在（`on/last` 缓存）。 */
    if (g.k === 'text') {
      for (const u of g.units ?? []) u.style.opacity = '0';
      g.last = -1;
      g.on = -1;
    }
  }

  /** 立刻收回到"没搭"的状态（不演一个来回）：滚出视口下方时用。 */
  function hide(g: Seg) {
    release(g);
    g.frozen = false;
    g.s = 0;
    g.dir = 0;
    g.want = -1;
    g.done = -9;
    reset(g);
  }

  /** 落定：直接到完成态，**不拆字**（拆了反而要多写一层样式）。
      未拆字的元素本来就该整段可见 —— 摘掉 inline opacity 就是原生状态。 */
  function settle(g: Seg, why: 'out' | 'queue' | 'net') {
    release(g);
    g.s = g.D;
    g.dir = 0;
    g.want = 1;
    g.frozen = true;
    const el = g.el;
    /* 留一条可测的痕迹：`_probe/_tb-probe.mjs` 用它数"有多少块是直接落定的"。
       这个数必须小 —— 大了就说明排队/超时在替观众做决定，观感回到"直接浮现"。 */
    el.setAttribute('data-tb-settled', why);
    /* ⚠ 必须是 `'1'` 而不是 `''`：CSS 那条 `html.build-ok [data-build]{opacity:0}`
       就是"藏起来等搭"的开关，摘掉 inline 值等于把它交还给 CSS —— 于是这块
       **永久不可见**（第一版实测：`.body` 的 opacity 一直是 0，正文整段消失）。 */
    el.style.opacity = '1';
    el.style.transform = '';
    el.style.filter = '';
    el.style.clipPath = '';
    el.style.willChange = '';
    for (const u of g.units ?? []) u.style.opacity = '';
    if (g.units) g.last = g.units.length;
  }

  const measure = () => {
    for (const g of segs) {
      /* 带 carry 变换的块不能实测（测回来是位移后的框）⇒ 沿用缓存。 */
      if (!(g.cur && g.k === 'carry')) read(g);
      /* 已经滚出上方的：没人看得见，直接落定（参考站 `top+h < -20` 那条）。 */
      if (g.by + g.bh < -20) {
        if (g.s < g.D) settle(g, 'out');
        continue;
      }
      /* ★ 冻结（settle 过）只是"别再演了"，**不是"永远钉死"**：
         站主 2026-11-13「往回滚的时候原站是把这些东西撤走」⇒ 它又滑到该撤的位置时解冻。
         已经在视口**下方**的（快速往上甩），撤也没人看得见 —— 直接藏回去，不空转 0.47s。 */
      if (g.frozen) {
        if (g.by > vh * 0.92) {
          g.frozen = false;
          if (g.by > vh + 60) hide(g);
          else {
            g.s = g.D;
            g.want = -1;
          }
        } else g.want = 1;
        continue;
      }
      g.want = g.by < vh * 0.82 ? 1 : g.by > vh * 0.92 ? -1 : 0;
    }

    /* ★ 2026-11-13：展开着的评论盒 = 光标禁入区（见 `avoid` 声明处的注释）。 */
    avoid.length = 0;

    for (const b of cboxes) {
      if (b.hasAttribute('inert')) continue;
      const r = b.getBoundingClientRect();
      if (r.height > 24 && r.bottom > 0 && r.top < vh) {
        avoid.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
      }
    }
  };

  /* ★★ 2026-11-13 站主第二次定方向：「改成搭建中不能点击评论吧，要不然一下搭完太突兀了」。
     —— 上一版是「一按评论就把这一轮全落定」，被这一句否掉了：那不是防乱，是把表演掐断。
     现在改成**搭建期间评论开关点不动**（规则在 talks.astro 的 `html.is-building` 里），
     搭完自然恢复，观众连"被锁了一下"都感觉不到。
     判据只认**视口内、正向、还没搭完、没冻结**的块：
       · 撤回（`want === -1`）不算 —— 否则往上一滚，整页评论全被锁住；
       · 冻结（`settle` 过）不算 —— 它们已经是完成态；
       · 视口外不算 —— 下方的块还在排队，不该为用户看不见的表演锁住手边的按钮。 */
  let building = false;
  function syncBuilding() {
    let on = false;
    for (const g of segs) {
      if (g.frozen || g.want !== 1 || g.s >= g.D) continue;
      if (g.by < vh * 0.92 && g.by + g.bh > 0) {
        on = true;
        break;
      }
    }
    if (on === building) return;
    building = on;
    document.documentElement.classList.toggle('is-building', on);
  }

  /* ---------- 光标池 ---------- */
  const curs: Cur[] = NAMES.map((name, i) => ({
    name,
    col: COLS[i],
    x: vw * (0.1 + i * 0.12),
    y: vh * 0.5,
    tool: 'arrow',
    down: false,
    a: 0.7,
    nm: 0,
    ph: i * 1.7,
    /* 空闲漂移的锚点：分散在视口里（参考站同样是满屏飘）。 */
    hx: 0.06 + 0.88 * ((i * 0.37 + 0.1) % 1),
    hy: 0.18 + 0.64 * ((i * 0.61 + 0.2) % 1),
    job: null,
    tr: null,
  }));

  /* ---------- 文字：逐字拆 ---------- */
  /** 中文逐字、英文逐词（拆成单字会让单词在词中断行）、空白单独一格。 */
  const UNITS = /[A-Za-z0-9][A-Za-z0-9'’.\-]*|[\s\S]/gu;
  function explode(root: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = [];
    const texts: Text[] = [];
    const walk = (n: Node) => {
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType === 3) texts.push(c as Text);
        else if (c.nodeType === 1) walk(c);
      }
    };
    walk(root);
    for (const t of texts) {
      const s = t.nodeValue ?? '';
      if (!s.trim()) continue;
      const frag = document.createDocumentFragment();
      for (const u of s.match(UNITS) ?? []) {
        const el = document.createElement('span');
        el.textContent = u;
        el.style.opacity = '0';
        if (u.trim()) out.push(el);
        frag.appendChild(el);
      }
      t.parentNode?.replaceChild(frag, t);
    }
    return out;
  }

  /* ---------- 光标轨迹 ---------- */
  /** 给定进度，返回光标该在哪、拿什么工具、有没有按下。纯函数 —— 施工和绘制共用一份。 */
  function path(g: Seg, t: number): { x: number; y: number; tool: Tool; down: boolean; grab: number } {
    const x = g.bx;
    const y = g.by;
    const w = g.bw;
    const h = g.bh;

    if (g.k === 'text') {
      /* ① 十字从左上扫到右下（拉出文字框）② 变 I-beam 挪进框里 ③ 停下打字 */
      if (t < 0.45) {
        const e = ease(t / 0.45);
        return { x: x + w * e, y: y + h * e, tool: 'cross', down: true, grab: 0 };
      }
      if (t < 0.59) {
        const e = ease((t - 0.45) / 0.14);
        return { x: lerp(x + w, x + 1, e), y: lerp(y + h, y + 10, e), tool: 'ibeam', down: false, grab: 0 };
      }
      return { x: caretX(g), y: y + Math.min(g.lh || 18, h) * 0.55, tool: 'ibeam', down: false, grab: 0 };
    }

    if (g.k === 'rect') {
      /* ① 拉框把方块擦出来 ② 飞到屏幕另一侧 ③ 拖着缩略图飞回来 ④ 继续飞走 */
      if (t < 0.6) {
        const u = ease(t / 0.6);
        return { x: x + w * u, y: y + h * u, tool: 'cross', down: true, grab: 0 };
      }
      /* 飞到屏幕另一侧 —— 但**夹在视口内**：飞出画外的话缩略图前半程看不见，
         "被拖回来"这件事就只剩后半段，读不出搬运。 */
      const fx = Math.min(vw - 90, Math.max(90, x + w * 0.5 + g.side * Math.min(vw * 0.46, 640)));
      const fy = Math.max(70, y + h * 0.5 - 60);
      if (t < 0.98) {
        const u = ease((t - 0.6) / 0.38);
        return { x: lerp(x + w, fx, u), y: lerp(y + h, fy, u), tool: 'arrow', down: false, grab: 0 };
      }
      if (t < 1.78) {
        const u = ease((t - 0.98) / 0.8);
        return {
          x: lerp(fx, x + w * 0.5, u),
          y: lerp(fy, y + h * 0.5, u) - Math.sin(Math.PI * u) * 26,
          tool: 'grab',
          down: true,
          grab: u,
        };
      }
      return { x: x + w * 0.5 + (t - 1.78) * 40, y: y + h * 0.5 + (t - 1.78) * 40, tool: 'arrow', down: false, grab: 1 };
    }

    /* carry：光标先飞到远处（整块跟着走），再把它拖回原位。 */
    const a = x + Math.min(w * 0.35, 64);
    const hz = y + Math.min(h * 0.5, 16);
    const gg = a + g.side * Math.min(360, vw * 0.3);
    if (t < 0.32) {
      const u = ease(t / 0.32);
      return { x: lerp(a, gg, u), y: hz - 24 * Math.sin(Math.PI * u), tool: 'arrow', down: false, grab: 0 };
    }
    const u = ease((t - 0.32) / 0.72);
    return { x: lerp(gg, a, u), y: hz - Math.sin(Math.PI * u) * 14, tool: 'grab', down: true, grab: 1 };
  }

  /** 打字位置：最后一个已显示的字的右缘。 */
  function caretX(g: Seg): number {
    const u = g.units;
    return u && g.last > 0 ? u[g.last - 1].getBoundingClientRect().right + 1 : g.bx + 2;
  }

  /* ---------- 把进度落到 DOM ---------- */
  function apply(g: Seg): void {
    const t = g.s;
    const el = g.el;

    if (g.k === 'text') {
      if (!g.units) {
        el.style.opacity = '';
        return;
      }
      const n = Math.round(clamp((t - 0.59) / Math.max(0.01, g.D - 0.59)) * g.units.length);
      const on = t > 0.45 ? 1 : 0;
      if (on !== g.on) {
        g.on = on;
        el.style.opacity = on ? '1' : '0';
      }
      if (n !== g.last) {
        for (let i = Math.max(0, Math.min(g.last, n)); i < Math.max(g.last, n); i++) {
          g.units[i].style.opacity = i < n ? '' : '0';
        }
        g.last = n;
      }
      return;
    }

    if (g.k === 'rect') {
      /* ★★ 站主 2026-11-12 报障：「图片已经出来了，但是鼠标还没拖过来 —— 改为图片一开始
         不加载，图片（或视频）拖过来之后再显现」。
         原实现是 `t > 0 ? '1' : ''`：**拉框的第一帧**就把元素整块放了出来，于是后半程
         "拖过来"只剩光标和一枚缩略图在飞，观众看到的图早已在原地 —— 拖拽读不出来。
         ⇒ 元素本体一直藏着（`''` 交还给 CSS 的 `html.build-ok [data-build]{opacity:0}`），
         直到**缩略图落进框里**那一刻（DROP = 1.78，正好是 `path()` 里 grab 走完的时点）
         才用 clip 自下而上扫出来。撤回时 t 反向穿过同一段 ⇒ 图也跟着自下而上收回去。 */
      const u = clamp((t - 1.78) / 0.24);
      el.style.opacity = u > 0 ? '1' : '';
      el.style.clipPath = u > 0 && u < 0.999 ? `inset(${(1 - u) * 100}% 0 0 0 round ${g.radius || '0'})` : '';
      return;
    }

    /* carry：整块跟着光标走 */
    if (t < 0.32) {
      el.style.opacity = '';
      el.style.transform = '';
      el.style.filter = '';
      el.style.willChange = '';
      return;
    }
    const o = path(g, t);
    const done = t >= g.D - 0.001;
    const ax = g.bx + Math.min(g.bw * 0.35, 64);
    const ay = g.by + Math.min(g.bh * 0.5, 16);
    el.style.opacity = '1';
    el.style.transform = done ? '' : `translate3d(${o.x - ax}px, ${o.y - ay}px, 0)`;
    el.style.filter = done ? '' : 'drop-shadow(0 10px 18px rgba(20,20,40,.14))';
    el.style.willChange = done ? '' : 'transform';
  }

  /** 首次施工前的准备（拆字 / 找回缩略图源）。 */
  function prepare(g: Seg): void {
    if (g.k === 'text') {
      if (!g.units) g.units = explode(g.el);
      const cs = getComputedStyle(g.el);
      g.lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6 || 20;
      return;
    }
    if (g.k !== 'rect' || g.src) return;
    g.radius = getComputedStyle(g.el).borderRadius || '0';
    const img = g.el.querySelector('img');
    const vid = g.el.querySelector('video');
    if (img) {
      g.src = img;
      g.label = short((img.currentSrc || img.src).split('/').pop()?.split('?')[0] ?? 'image');
    } else if (vid) {
      const cover = vid.getAttribute('poster');
      g.label = short((vid.currentSrc || vid.src || 'clip').split('/').pop()?.split('?')[0] ?? 'clip.mp4');
      if (cover) {
        const im = new Image();
        im.decoding = 'async';
        im.src = cover;
        g.src = im;
      }
    }
  }

  /* ---------- 装饰绘制 ---------- */
  type Spark = { x: number; y: number; col: string; t: number };
  const sparks: Spark[] = [];
  const spark = (x: number, y: number, col: string) => sparks.push({ x, y, col, t: 0 });

  function pill(text: string, x: number, y: number, col: string, a: number, align: 'c' | 'l' = 'c') {
    ctx.globalAlpha = a;
    ctx.font = FONT;
    const w = ctx.measureText(text).width + 10;
    const left = align === 'c' ? x - w / 2 : x;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(left, y, w, 17, 3);
    else ctx.rect(left, y, w, 17);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(text, left + 5, y + 12.2);
    ctx.globalAlpha = 1;
  }

  /** 选择框（参考站 `uA`：蓝框 + 四角白柄 + 上方类型 + 下方尺寸胶囊）。 */
  function box(x: number, y: number, w: number, h: number, a: number, tag: string | null, size: string | null) {
    if (w < 1 || h < 1 || a < 0.02) return;
    ctx.globalAlpha = a;
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    ctx.fillStyle = '#fff';
    for (const [hx, hy] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ]) {
      ctx.fillRect(Math.round(hx) - 3, Math.round(hy) - 3, 7, 7);
      ctx.strokeRect(Math.round(hx) - 3 + 0.5, Math.round(hy) - 3 + 0.5, 6, 6);
    }
    if (tag) {
      ctx.font = FONT;
      ctx.fillStyle = BLUE;
      ctx.fillText(tag, x, y - 7);
    }
    ctx.globalAlpha = 1;
    if (size && w >= 12 && h >= 8) pill(size, x + w / 2, y + h + 8, BLUE, a);
  }

  /** 光标贴图缓存：每种颜色 × 工具 × 按下态一张，避免每帧重建路径。 */
  const sprites = new Map<string, HTMLCanvasElement>();
  const DPR = () => Math.min(devicePixelRatio || 1, 2);
  function sprite(col: string, tool: Tool, down: boolean): HTMLCanvasElement {
    const key = `${col}|${tool}|${down ? 1 : 0}`;
    const hit = sprites.get(key);
    if (hit) return hit;
    const size = 46;
    const cv = document.createElement('canvas');
    const dpr = DPR();
    cv.width = cv.height = Math.round(size * dpr);
    const c = cv.getContext('2d')!;
    c.scale(dpr, dpr);
    c.translate(10, 8);
    c.shadowColor = 'rgba(0,0,0,.28)';
    c.shadowBlur = down ? 2 : 4;
    c.shadowOffsetY = down ? 0.5 : 1.5;
    c.lineJoin = 'round';
    if (tool === 'arrow' || tool === 'grab') {
      if (down) c.scale(0.92, 0.92);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, 18.2);
      c.lineTo(5.1, 13.4);
      c.lineTo(12.9, 13.4);
      c.closePath();
      c.fillStyle = col;
      c.fill();
      c.shadowColor = 'transparent';
      c.lineWidth = 1.4;
      c.strokeStyle = '#fff';
      c.stroke();
    } else {
      const parts: [number, string][] = [
        [4, '#fff'],
        [1.6, '#111'],
      ];
      for (const [lw, sc] of parts) {
        c.lineWidth = lw;
        c.strokeStyle = sc;
        c.lineCap = 'round';
        c.beginPath();
        if (tool === 'cross') {
          c.moveTo(0, -9);
          c.lineTo(0, 9);
          c.moveTo(-9, 0);
          c.lineTo(9, 0);
        } else {
          c.moveTo(-4, -10);
          c.quadraticCurveTo(0, -10, 0, -7);
          c.quadraticCurveTo(0, -10, 4, -10);
          c.moveTo(0, -7);
          c.lineTo(0, 7);
          c.moveTo(-4, 10);
          c.quadraticCurveTo(0, 10, 0, 7);
          c.quadraticCurveTo(0, 10, 4, 10);
        }
        c.stroke();
        c.shadowColor = 'transparent';
      }
    }
    sprites.set(key, cv);
    return cv;
  }

  function drawCursor(c: Cur) {
    if (c.a < 0.02) return;
    ctx.globalAlpha = c.a;
    ctx.drawImage(sprite(c.col, c.tool, c.down), c.x - 10, c.y - 8, 46, 46);
    if (c.nm > 0.03) {
      ctx.globalAlpha = c.a * c.nm;
      ctx.font = FONT;
      const w = ctx.measureText(c.name).width + 12;
      const arrow = c.tool === 'arrow' || c.tool === 'grab';
      const bx = c.x + (arrow ? 12 : 11);
      const by = c.y + (arrow ? 15 : 11);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, w, 17, 4);
      else ctx.rect(bx, by, w, 17);
      ctx.fillStyle = c.col;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(c.name, bx + 6, by + 12.2);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 主循环 ---------- */
  let raf = 0;
  let prev = 0;
  let now = 0;
  let frames = 0;
  /** 上一帧还有框在淡出（决定这一帧要不要降频）。跨帧保留 ⇒ 空闲/收尾之间不会误降频。 */
  let fading = false;
  const SPEED = 1.4;
  /** 排队截止（毫秒）：等这么久还没轮到就直接落定，免得留一片空白。 */
  /* 参考站没有这条 —— 它的块少、七枚手够用。这一页有六十多块，跳转/快速滚动时会
     一次涌进十几块，必须有兜底；但太短就等于**直接浮现**（站主 2026-11-12 否掉的就是它）。 */
  const QUEUE_DEADLINE = 3200;
  const waited = new WeakMap<Seg, number>();

  function release(g: Seg) {
    const c = g.cur;
    if (c) {
      c.job = null;
      c.tr = null;
      c.down = false;
      c.tool = 'arrow';
    }
    g.cur = null;
    g.tr = null;
  }

  function tick(ts: number): void {
    frames++;
    /* ★ 评论开关的可用性跟着"还有没有块在搭"走（见 `syncBuilding` 的注释）。 */
    syncBuilding();
    const dt = prev ? Math.min(0.05, (ts - prev) / 1000) * SPEED : 0.016;
    prev = ts;
    now = ts;

    /* ① 派活：want=1（搭）或 want=-1（撤）、还没到位、没有光标 ⇒ 最近的那枚空闲光标飞过去。
       排队规则照参考站：前一块至少搭到 20% 才轮到这一块，读起来是"一只只手接力"。
       ★★ 2026-11-13 补上撤回方向（站主：「往回滚的时候原站是把这些东西撤走，
         你做的这版光标不知道在干嘛」）：原实现只给 `want === 1` 派活 ⇒ 撤回方向
         **永远没有手**，块留在原地、七枚光标只能在视口里瞎飘。现在两个方向都派活，
         撤回走同一条 `path()` 的逆放（速度 2.2×，参考站值）。 */
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      if (g.cur || g.frozen) continue;
      if (g.want === 0 || (g.want === 1 ? g.s >= g.D : g.s <= 0)) {
        waited.delete(g);
        continue;
      }
      /* 顺序约束只在**同一条说说内**、且只在**搭**的方向生效：先日期、再正文、再配图，
         读起来像有人在按顺序搭。跨条**并行** —— 否则 16 条说说的块会串成一条几十秒的长链，
         后进视口的只能干等（等到排队超时就落定，反而变成站主最烦的"直接浮现"）。
         ★ 撤回**不加**顺序约束：撤是"整页被收走"，同时撤才读得出这个意思；
           加了反而会串成一条链，链尾的块永远等不到手（越滚越乱）。 */
      const before = segs[i - 1];
      if (
        g.want === 1 &&
        before &&
        before.el.parentElement === g.el.parentElement &&
        !before.frozen &&
        before.want === 1 &&
        before.s < Math.min(before.D, 0.2)
      )
        continue;

      let best: Cur | null = null;
      let bd = 1e9;
      const tx = g.bx + g.bw / 2;
      const ty = g.by + g.bh / 2;
      for (const c of curs) {
        if (c.job) continue;
        const d = Math.hypot(c.x - tx, c.y - ty);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (!best) {
        /* 兜底只给"搭"这一侧：撤不动只是没撤干净（不致命，下一帧还会再派），
           而若在这里 settle，等于把块**钉在**完成态 —— 与"往回滚就撤走"正好相反。 */
        if (g.want === 1) {
          const w = (waited.get(g) ?? 0) + dt * 1000;
          waited.set(g, w);
          if (w > QUEUE_DEADLINE) settle(g, 'queue');
        }
        continue;
      }
      waited.delete(g);
      prepare(g);
      g.cur = best;
      g.att = false;
      g.tr = { x: best.x, y: best.y, t: 0, d: clamp(bd / 1500, 0.22, 0.55) };
      best.job = g;
    }

    /* ② 推进 */
    for (const g of segs) {
      const c = g.cur;
      if (!c) continue;

      if (!g.att) {
        /* 赶路：先飞到该块的起点，到了才动手。 */
        const tr = g.tr;
        if (!tr) continue;
        tr.t += dt;
        const u = ease(clamp(tr.t / tr.d));
        const want = path(g, g.s);
        c.x = lerp(tr.x, want.x, u);
        c.y = lerp(tr.y, want.y, u);
        c.tool = u > 0.85 ? want.tool : 'arrow';
        if (u >= 1) {
          g.att = true;
          spark(want.x, want.y, c.col);
        }
        continue;
      }

      if (g.want === -1) g.dir = -1;
      else if (g.want === 1) g.dir = 1;
      if (g.dir === 0) g.dir = 1;

      const from = g.s;
      g.s = clamp(g.s + g.dir * (g.dir === 1 ? 1 : 2.2) * dt, 0, g.D);

      /* 关键帧涟漪（参考站：光标经过阶段边界时点一下）。 */
      const keys =
        g.k === 'text' ? [0.45, 0.59] : g.k === 'rect' ? [0.6, 0.98, 1.78] : [0.32, g.D - 0.01];
      for (const k of keys) {
        if ((from - k) * (g.s - k) < 0) {
          const o = path(g, k);
          spark(o.x, o.y, c.col);
        }
      }

      apply(g);

      const o = path(g, g.s);
      c.x = o.x;
      c.y = o.y;
      c.tool = o.tool;
      c.down = o.down;

      if ((g.dir === 1 && g.s >= g.D) || (g.dir === -1 && g.s <= 0)) {
        if (g.dir === 1) {
          g.done = now;
          if (g.k === 'carry') {
            g.el.style.transform = '';
            g.el.style.filter = '';
            g.el.style.willChange = '';
            /* 归位后基准就变了 ⇒ 重测一次。 */
            read(g);
          }
        } else {
          /* 撤回走到头：回到"没搭"的样子（inline 样式全摘掉 ⇒ 交还 CSS 的 opacity:0）。 */
          reset(g);
          g.done = -9;
          read(g);
        }
        release(g);
      }
    }

    /* ③ 空闲光标漂移（永远有几枚在纸上晃，是"多光标"的底噪）。 */
    for (const c of curs) {
      if (c.job) {
        c.a += (1 - c.a) * 0.2;
        c.nm += (1 - c.nm) * 0.25;
        continue;
      }
      let tx = vw * c.hx + Math.sin(now / 1900 + c.ph) * 50;
      let ty = vh * c.hy + Math.cos(now / 1500 + c.ph) * 36;
      /* ★ 2026-11-13：落在展开的评论盒里就推到最近的一边外 —— 光标会**顺着展开让开**，
         而不是定在表单上（站主给的第二个选项："搭建跟着评论的展开到下面去"）。 */
      for (const r of avoid) {
        if (tx > r.l - 24 && tx < r.r + 24 && ty > r.t - 24 && ty < r.b + 24) {
          ty = ty - r.t < r.b - ty ? r.t - 44 : r.b + 44;
        }
      }
      const m = 1 - Math.exp(-dt * 1.4);
      c.x += (tx - c.x) * m;
      c.y += (ty - c.y) * m;
      c.a += (0.68 - c.a) * 0.1;
      c.nm += (1 - c.nm) * 0.1;
      c.tool = 'arrow';
      c.down = false;
    }

    /* ④ 出帧
       ★ 空闲降频：只剩漂移时**隔帧**画（30fps）。③ 已经照常推进过漂移了，这里丢的只是
         这一帧的绘制 —— 慢速漂移在 30fps 下看不出差别，重画成本砍半。
         `fading` 是上一帧的值（框的淡出持续 800ms，晚一帧判断无影响）。 */
    if (!fading && !sparks.length && !segs.some((g) => g.cur) && (frames & 1) === 0) {
      raf = requestAnimationFrame(tick);
      return;
    }
    ctx.clearRect(0, 0, vw, vh);
    fading = false;

    for (const g of segs) {
      if (g.s <= 0 || g.by > vh + 60 || g.by + g.bh < -60) continue;
      const t = g.s;
      /* 框的收尾：完成/松手后 0.8 秒内退场（参考站同值）。 */
      const hold = g.cur ? 1 : g.done > 0 ? clamp(1 - (now - g.done) / 800) : 0;
      if (hold > 0 && hold < 1) fading = true;
      const a = hold;
      if (a <= 0.01) continue;

      if (g.k === 'text') {
        const u = t < 0.45 ? ease(t / 0.45) : 1;
        box(
          g.bx,
          g.by,
          g.bw * u,
          g.bh * u,
          a,
          t < 0.45 ? g.tag : null,
          `${Math.round(g.bw * u)} × ${Math.round(g.bh * u)}`,
        );
        /* 打字光标：一根竖线，每 0.5 秒闪一次。 */
        if (g.cur && g.att && t > 0.59 && t < g.D - 0.03 && Math.floor(now / 500) % 2 === 0) {
          ctx.globalAlpha = 0.85 * a;
          ctx.fillStyle = '#111';
          ctx.fillRect(caretX(g), g.by + 2, 1.5, Math.min(g.lh || 18, g.bh - 4));
          ctx.globalAlpha = 1;
        }
        continue;
      }

      if (g.k === 'rect') {
        const u = t < 0.6 ? ease(t / 0.6) : 1;
        box(
          g.bx,
          g.by,
          Math.max(1, g.bw * u),
          Math.max(1, g.bh * u),
          a,
          g.tag,
          `${Math.round(g.bw * u)} × ${Math.round(g.bh * u)}`,
        );
        /* ★ 拖过来的那张图：光标手里抓着一枚从远处飞回来的缩略图（参考站同款）。
           没有它，观众只看到一只光标飞过、图片原地不动 —— 站主上一版就是这么否的。 */
        const o = path(g, t);
        if (g.cur && o.grab > 0 && o.grab < 1) {
          const tw = lerp(150, g.bw * 0.5, o.grab);
          const th = Math.min(g.bh, (tw * g.bh) / Math.max(1, g.bw));
          if (g.src) {
            try {
              ctx.save();
              ctx.globalAlpha = 0.94;
              ctx.shadowColor = 'rgba(0,0,0,.25)';
              ctx.shadowBlur = 24;
              ctx.shadowOffsetY = 10;
              ctx.drawImage(g.src, o.x - tw / 2, o.y - th / 2, tw, th);
              ctx.restore();
            } catch {
              /* 图还没解码完：这帧不画，下一帧再说。 */
            }
          }
          pill(g.label, o.x + 14, o.y + 26, '#111', 1, 'l');
        }
        continue;
      }

      /* carry：框跟着被拖的块一起走。 */
      const o = path(g, t);
      const dx = o.x - (g.bx + Math.min(g.bw * 0.35, 64));
      const dy = o.y - (g.by + Math.min(g.bh * 0.5, 16));
      const settled = clamp(Math.abs(dx) / 40);
      box(
        g.bx + dx,
        g.by + dy,
        g.bw,
        g.bh,
        a,
        g.tag,
        settled > 0.6 ? `${Math.round(g.bw)} × ${Math.round(g.bh)}` : null,
      );
    }

    /* 涟漪 */
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.t += dt;
      if (s.t > 0.45) {
        sparks.splice(i, 1);
        continue;
      }
      const u = s.t / 0.45;
      ctx.globalAlpha = (1 - u) * 0.7;
      ctx.strokeStyle = s.col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3 + u * 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const c of curs) drawCursor(c);

    /* ★ 2026-11-13 改：**不再停机**。站主：「说说现在停在一个界面的时候那几个光标就不动了，
       他原站是有小范围运动的吧，不至于看着像卡住了」。原实现空闲（没有活／没有涟漪／
       没有框在淡出）就把 rAF 关掉 ⇒ 静止页面上七枚光标全定在最后一帧的位置，看着像卡死。
       ⇒ 循环常开：漂移本身就是"这几只手还活着"的底噪。
       ⚠ 代价是把 rAF 的常开成本认下来，所以空闲档在出帧前做了隔帧降频（见 ④ 开头）。 */
    raf = requestAnimationFrame(tick);
  }

  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  /* 滚动：用差量修正缓存（带 transform 的块不能实测），无变换的重读校准。
     ⚠ 差量**不能再挂 `!raf` 这个条件**（2026-11-13 循环常开后踩到）：那是在"空闲停机"
     的年代写的，现在 `raf` 永远非零 ⇒ 正在被 carry 拖着的块拿不到滚动修正，
     基准 `by` 会停在滚动前的位置，拖动路径整条偏掉。差量对 read() 覆盖的块无害
     （紧接着就被实测值覆盖），对 carry 块则是唯一的修正来源。 */
  let left = scrollY;
  const onScroll = () => {
    const y = scrollY;
    const dy = y - left;
    left = y;
    if (dy) for (const g of segs) g.by -= dy;
    measure();
    kick();
  };

  /* resize：overlay 位置全变，重测。 */
  addEventListener('resize', () => {
    resize();
    measure();
    kick();
  });

  measure();
  kick();
  /* ★ 安全网：`html.build-ok` 一加上，这一页的内容就是"藏起来等搭"。
     主线程被首屏图片解码占住时 rAF 可能迟迟不来（实测无头环境能卡到 1 秒多），
     观众看到的就是**一页白纸**。⇒ 700ms 内连一帧都没出的，直接全部落定。 */
  setTimeout(() => {
    if (frames > 0) return;
    for (const g of segs) settle(g, 'net');
  }, 700);

  addEventListener('scroll', onScroll, { passive: true });

  /* ★★ 2026-11-13 站主：「如果在多鼠标搭建的过程中点击评论会乱（鼠标搭建动画在评论上面）」
     → 随后定方向：「改成搭建中不能点击评论吧，要不然一下搭完太突兀了」。
     成因是评论展开会把这一条底下的一切**整体下推**，而搭建用的是缓存矩形 ⇒
     正在飞的框/缩略图按旧基准走，正好压在新展开的表单上（站主截图里那一片）。
     ⇒ 搭建期间不许展开（规则在 talks.astro 的 `html.is-building`，这里是第二道闸）。
     为什么要第二道：`pointer-events:none` 只挡指针，**键盘 Enter / 空格产生的 click 绕过它**。
     拦住之后什么都不做 —— 不 preventDefault 之外的副作用、不落定、不重测：
     观众按了没反应是"按钮现在不能按"，而不是"页面被这一下打断了"。
     ⚠ 捕获阶段：`talks.ts` 里那个 toggle 也在监听 click，必须排在它前面才拦得住。 */
  document.addEventListener(
    'click',
    (e) => {
      if (!building) return;
      const t = e.target instanceof Element ? e.target.closest('[data-toggle]') : null;
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  document.addEventListener(
    'astro:before-swap',
    () => {
      if (raf) cancelAnimationFrame(raf);
      document.documentElement.classList.remove('build-ok');
      /* ★ 这一页的"搭建中"状态也要摘掉：留下来会把下一页的评论开关一起锁住
         （SPA 过渡共用同一个 <html>）。 */
      document.documentElement.classList.remove('is-building');
      canvas.remove();
    },
    { once: true },
  );
  addEventListener('pagehide', () => {
    if (raf) cancelAnimationFrame(raf);
  });
}
