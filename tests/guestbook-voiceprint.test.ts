/* 留言页声纹带 VOICEPRINT · 契约（2026-10-14）
 *
 * 分三块：① 接缝（comments.ts 派发数据） ② 装置（控制器 + 降级 + 玻璃）
 *        ③ 产物（静态形态与样式护栏）。
 *
 * ★ 这份文件**取代** `tests/guestbook-inkdrop.test.ts` —— 墨滴那台已整台退场，
 *   它的 54 KB 契约不再守护任何东西。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { describe, it, expect } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const CODE = read('src/scripts/comments.ts');

describe('留言页声纹带 · 接缝（comments.ts 是唯一取数方）', () => {
  it('旧装置的事件名拆干净了，换成声纹带', () => {
    expect(CODE, "墨滴的 CustomEvent('inkdrop') 还留着").not.toMatch(/inkdrop/i);
    expect(CODE, '装置接缝应该走 CustomEvent，而不是让装置去观察 DOM').toMatch(/CustomEvent\('voiceprint'/);
    expect(CODE, '新留言要有自己的一条事件，供装置追加').toMatch(/CustomEvent\('voiceprint:new'/);
  });

  it('首次取数：成功后才派发全量，失败路径不派发', () => {
    const fetchAt = CODE.indexOf('fetch(`/api/comments');
    const catchAt = CODE.indexOf('.catch(', fetchAt);
    const dispatch = CODE.indexOf("CustomEvent('voiceprint'");
    expect(fetchAt, '取数那一行改名了？门闩要跟着改').toBeGreaterThan(-1);
    expect(dispatch, '取数成功后必须派发全量给装置').toBeGreaterThan(fetchAt);
    expect(dispatch, '派发不能落到 .catch 之后 —— 失败不该有波形').toBeLessThan(catchAt);
  });

  it('提交：成功后才派发那一条，失败不做庆祝', () => {
    const post = CODE.indexOf('postComment(payload)');
    const catchAt = CODE.indexOf('.catch(', post);
    const dispatch = CODE.indexOf("CustomEvent('voiceprint:new'");
    expect(dispatch, '提交成功后必须派发新留言').toBeGreaterThan(post);
    expect(dispatch, '派发不能落到 .catch 之后 —— 失败不该有波形').toBeLessThan(catchAt);
  });

  it('detail 带的是数据不是坐标（float.ts 约定①：不读内容几何）', () => {
    const block = CODE.slice(CODE.indexOf("CustomEvent('voiceprint'"));
    expect(block, '事件 detail 里不许出现 DOM 几何').not.toMatch(/getBoundingClientRect/);
  });

  it('回复走与列表同一套口径：孤儿回复不会让波形和列表对不上', () => {
    /* 接口可能返回"父评论已掉出 LIMIT 200"的孤儿回复，列表用 groupReplies 丢掉它们。
       装置若不过滤，波形上的回复数会和列表里看到的对不上 —— 那是一条会骗人的读数。 */
    expect(CODE, '过滤孤儿回复应复用 parentIdsOf，别自己写一套').toMatch(/parentIdsOf\(items\)/);
  });

  it('★ 取数方**不许** import 装置核心：它文章页也在用（实测超预算 1008 字节）', () => {
    /* `comments.ts` 被 `layouts/Post.astro` 同一个 import 引用着，所以它一旦 import
       `voiceprint-core`，整台装置（6 个函数 + 3 个常数）就会被拖进**每一篇文章**的 JS 包。
       实测：文章页 13808 > 12800 预算。⇒ 事件派发的是接口原样两张表，映射留在留言页的装置里。 */
    expect(CODE, '取数方不许 import 装置核心 —— 文章页的 JS 预算会被拖爆')
      .not.toMatch(/from\s*['"]\.\/voiceprint-core['"]/);
    /* 连 `import type` 也不留：纯类型虽会被擦除，但"多一个 import"就会有人再加一个真 import。 */
    /* ★ 负向断言先剥注释 —— 上面那段理由里**正写着** `voiceprint-core` 这个名字，
       不剥就是拿自己的注释把自己判红（这条老坑本轮已经中过一次）。 */
    const CODE_NC = CODE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    expect(CODE_NC, '连类型 import 也不留').not.toMatch(/voiceprint-core/);
  });
});

/* ── 产物：静态形态 ────────────────────────────────────────────────────────
   ★ 留言是**运行时**从接口取的，静态 HTML 里本来就没有留言条目 ——
     所以这里测的是"降级形态本身在不在、完不完整"，不是"留言在不在"。 */
const DIST = join(process.cwd(), 'dist');
const hasPage = existsSync(join(DIST, 'guestbook', 'index.html'));
const HTML = hasPage ? read('dist/guestbook/index.html') : '';
/** 该页那一段 CSS。作用域化的 data-astro-cid 必须先剥，否则选择器对不上。 */
const deo = (s: string) => s.replace(/\[data-astro-cid-[a-z0-9]+\]/g, '');
/* ★ 必须**两个地方都查**：小页的样式是内联在 HTML 的 <style> 里的，
   `_astro/*.css` 下根本没有这一份（AGENTS 踩过：只查一处会得出"CSS 没进产物"的错误结论，
   而真相只是形态在体积阈值两侧会翻转）。 */
const PAGE_CSS = hasPage
  ? deo([
      ...[...HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]),
      ...readdirSync(join(DIST, '_astro')).filter((f) => f.endsWith('.css'))
        .map((f) => read(`dist/_astro/${f}`)),
    ].filter((c) => c.includes('vp-') || c.includes('voiceprint')).join('\n'))
  : '';

describe('留言页声纹带 · 静态形态（无 JS 也要完整）', () => {
  it.skipIf(!hasPage)('页面里挂着声纹带，且不带墨滴那块画布', () => {
    expect(HTML, '产物里没有声纹带').toContain('data-voiceprint');
    expect(HTML, '墨滴的整屏画布还在（它该整台退场了）').not.toContain('inkdrop-bg');
  });

  it.skipIf(!hasPage)('降级形态自带文案：留言是运行时取的，没数据也要说清楚', () => {
    expect(HTML, '没有装置的降级说明').toContain('还没有人留言');
    expect(HTML, '留言表单必须在（那是这页真正的主功能）').toContain('data-form');
    expect(HTML, '表单必须有正文字段').toContain('name="body"');
  });

  it.skipIf(!hasPage)('这一页的样式里：没有字面色值、没有 rgba()、没有外部资源', () => {
    /* 负向断言必须先剥注释 —— 理由注释里会出现 var(--…) 与色名字面量，不剥会恒红。 */
    const NC = PAGE_CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(NC, '样式里出现了字面色值（颜色只许住 tokens.css）').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(NC, '样式里出现了 rgba()（alpha 由 8 位 hex 承载）').not.toMatch(/\brgba?\(/);
    expect(NC, '出现了外部资源请求（零第三方）').not.toMatch(/url\(\s*["']?https?:/i);
    expect(PAGE_CSS.length, '没切到这一页的样式段（改类名了？）').toBeGreaterThan(200);
  });
});

/* ── 控制器：真实代码 + 替身 DOM（照 album-scene-controller.test.ts 的路子）──
   ★ 只验事件与状态，**不冒充浏览器布局与原生手势验收**。 */

const rlcore = read('src/scripts/rl-core.ts').replace(/^export /gm, '');
const coreSrc = read('src/scripts/voiceprint-core.ts').replace(/^export /gm, '');
const vpSrc = read('src/scripts/voiceprint.ts').replace(/^import .*\r?\n/gm, '');
const VP_CODE = transformSync(`${rlcore}\n${coreSrc}\n${vpSrc}`, { loader: 'ts' }).code;

type Ev = { type: string; fn: (e: any) => void };
class El {
  tag: string; attrs: Record<string, string> = {}; classes = new Set<string>();
  children: El[] = []; textContent = ''; dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  constructor(tag = 'div') { this.tag = tag; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  /* ★ appendChild 一个**已在树里**的节点，真实 DOM 是「移动到末尾」，不是「复制一份」。
     替身一开始 push，结果排序后 children 从 3 变 6 —— 这条错恰好证明了
     「排序只重排、不重建」是对的：li 对象必须还是那三个。 */
  appendChild(n: El) {
    const i = this.children.indexOf(n);
    if (i >= 0) this.children.splice(i, 1);
    this.children.push(n);
    n.parents.push(this);
    return n;
  }
  parents: El[] = [];
  replaceChildren(...n: El[]) { this.children = n; }
  handlers = new Map<string, ((e: any) => void)[]>();
  addEventListener(t: string, fn: (e: any) => void) {
    if (!this.handlers.has(t)) this.handlers.set(t, []);
    this.handlers.get(t)!.push(fn);
  }
  fire(t: string, e: any = {}) { for (const fn of this.handlers.get(t) ?? []) fn(e); }
  /* remove()：环播完要把自己摘掉（真实 DOM 语义：把自己从父节点的孩子里去掉） */
  remove() { for (const p of this.parents) p.children = p.children.filter((c) => c !== this); }
  /* 按 `[data-xx-yy]` 找子节点。选择器是 kebab（vp-wave），dataset 的键是驼峰（vpWave）——
   ★ 两边不转换就是"找不到节点" ⇒ 装置静默提前 return ⇒ 表现成"什么都没画"。 */
  querySelector(sel: string): El | null {
    const m = /^\[data-([\w-]+)\]$/.exec(sel);
    if (!m) return null;
    const key = m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    return this.children.find((c) => key in c.dataset) ?? null;
  }
  classList = {
    add: (...k: string[]) => k.forEach((x) => this.classes.add(x)),
    remove: (...k: string[]) => k.forEach((x) => this.classes.delete(x)),
    contains: (k: string) => this.classes.has(k),
  };
}

/** 跑一遍装置。`reduced` 模拟减少动效；`noRoot` 模拟页面里没有装置标记；
 *  `withList` 模拟留言列表已渲染（排序控件才有对象可排）。 */
function run(opts: { reduced?: boolean; noRoot?: boolean; withList?: boolean } = {}) {
  const root = new El('section'); root.dataset.voiceprint = '';
  const svg = new El('svg'); svg.dataset.vpSvg = '';
  const wave = new El('path'); wave.dataset.vpWave = '';
  const flat = new El('line'); flat.dataset.vpFlat = '';
  const replies = new El('g'); replies.dataset.vpReplies = '';
  const axis = new El('div'); axis.dataset.vpAxis = '';
  const cursor = new El('line'); cursor.dataset.vpCursor = ''; cursor.attrs = { opacity: '0' };
  const read = new El('figcaption'); read.dataset.vpRead = '';
  for (const n of [svg, wave, flat, replies, axis, cursor, read]) root.children.push(n);

  /* 波形带几何：游标把 clientX 换算成桶下标要用 */
  svg.left = 0; svg.width = 1000;
  svg.getBoundingClientRect = () => ({ left: svg.left, top: 0, width: svg.width, height: 30 }) as any;

  const list = new El('ol'); list.dataset.list = '';
  for (const id of [30, 10, 20]) {
    const li = new El('li'); li.dataset.id = String(id); list.children.push(li);
  }

  const bDesc = new El('button'); bDesc.dataset.vpSort = 'desc';
  const bAsc = new El('button'); bAsc.dataset.vpSort = 'asc';
  const bAll = new El('button'); bAll.dataset.vpWindow = 'all';
  const bWin = new El('button'); bWin.dataset.vpWindow = '30';

  const byAttr: Record<string, El> = {
    '[data-voiceprint]': opts.noRoot ? undefined as any : root,
    '[data-vp-svg]': svg, '[data-vp-wave]': wave, '[data-vp-flat]': flat,
    '[data-vp-replies]': replies, '[data-vp-axis]': axis, '[data-vp-read]': read,
  };
  const bySel: Record<string, El[]> = {
    '[data-vp-sort]': [bDesc, bAsc],
    '[data-vp-window]': [bAll, bWin],
  };
  const document = {
    querySelector: (sel: string) => (opts.withList && sel === '[data-list]' ? list : (byAttr[sel] ?? null)),
    /* ★ 控件**总是**注册（与 withList 无关）—— 控件在页面里就在，只是没有列表时排序无事可做。
       早先把它绑在 withList 上，导致「时间窗点不动」这种症状看着像源码坏了。 */
    querySelectorAll: (sel: string) => bySel[sel] ?? [],
    createElementNS: (_ns: string, tag: string) => new El(tag),
    createElement: (tag: string) => new El(tag),
  };
  const mql = { matches: !!opts.reduced, addEventListener() {}, removeEventListener() {} };
  const listeners: Ev[] = [];
  const win = {
    matchMedia: () => mql,
    addEventListener: (t: string, fn: (e: any) => void) => listeners.push({ type: t, fn }),
  };
  class CustomEventShim { constructor(public type: string, public init: any = {}) {} }

  /* rl-core 的 prefersReducedMotion() 调的是**全局** matchMedia，不是 window.matchMedia
     —— 替身两边都给，否则会得到一句莫名其妙的 "matchMedia is not defined"。 */
  runInNewContext(VP_CODE, {
    window: win, document, CustomEvent: CustomEventShim, matchMedia: () => mql,
  });
  const emit = (type: string, detail: any) => {
    for (const l of listeners) if (l.type === type) l.fn({ type, detail });
  };
  return { root, wave, read, replies, list, svg, cursor, emit, sortBtns: [bDesc, bAsc], winBtns: [bAll, bWin],
    ready: () => root.classList.contains('is-ready') };
}

const note = (id: number, iso: string, body = '字', isReply = false) =>
  ({ id, createdAt: iso, body, isReply });
const D = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86400000).toISOString();
/** 相对**今天**往前推 d 天 —— 时间窗说的就是"相对多久之内"，固定历史日期测不到它。 */
const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

describe('留言页声纹带 · 控制器', () => {
  it('装置不自己请求数据 —— 唯一取数方是 comments.ts', () => {
    expect(vpSrc, '装置里出现 fetch ⇒ 重复请求一次留言').not.toMatch(/fetch\s*\(/);
  });

  it('降级靠"根本不注册"而不是 hidden：减少动效档直接不进 is-ready', () => {
    /* ★ 负向断言必须先剥注释 —— 本文件的注释里**正写着**"绝不用 hidden"这句话，
       不剥就是拿自己的注释把自己判红（AGENTS 记过五次的那一条）。
       行注释也要剥：这个文件里有一行 `// 数据来源：…` 之类。 */
    const NC = vpSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    expect(NC, '别用 hidden 门控（站内踩过：display:none ⇒ 尺寸恒 0）').not.toMatch(/hidden/i);
    const r = run({ reduced: true });
    r.emit('voiceprint', { comments: [note(1, D(0)), note(2, D(5))] });
    expect(r.ready(), '减少动效下不该建装置').toBe(false);
  });

  it('页面里没有装置标记时安静退出，不抛', () => {
    expect(() => run({ noRoot: true })).not.toThrow();
  });

  it('空留言不画：页面留在静态形态（那条平线还在）', () => {
    const r = run();
    r.emit('voiceprint', { comments: [], replies: [] });
    expect(r.ready(), '没有数据却挂上了就绪态 ⇒ 静态平线被换成空白').toBe(false);
    expect(r.read.textContent).toMatch(/还没有/);
  });

  it('有数据才画：路径非空、读数说清条数与时间跨度，并挂上 is-ready', () => {
    const r = run();
    r.emit('voiceprint', { comments: [note(1, D(0), '甲'), note(2, D(3), '乙')], replies: [note(3, D(6), '', true)] });
    expect(r.ready(), '有数据却没进就绪态 ⇒ 查节点选择器或提前 return').toBe(true);
    expect(r.wave.getAttribute('d'), '波形路径没画出来').toBeTruthy();
    expect(r.wave.getAttribute('d')).toMatch(/^M/);
    expect(r.read.textContent).toMatch(/3|条/);
    expect(r.replies.children.length, '回复小刻度一个都没画').toBeGreaterThan(0);
  });

  it('新留言进来时波形跟着重画（读数条数 +1）', () => {
    const r = run();
    r.emit('voiceprint', { comments: [note(1, D(0), '甲')] });
    const before = r.read.textContent;
    r.emit('voiceprint:new', { note: note(2, D(2), '乙') });
    expect(r.read.textContent, '新留言没反映到读数上').not.toBe(before);
    expect(r.ready()).toBe(true);
  });

  it('接口失败那一档：没有事件就什么都不画（不画半条线）', () => {
    const r = run();
    // 不发任何事件 —— 这就是 fetch 失败时的样子。
    expect(r.ready(), '没有数据却进就绪态').toBe(false);
    expect(r.wave.getAttribute('d'), '没数据却画了路径').toBeFalsy();
  });

  it('★ 排序真的会把列表换个顺序，而且换回来还能还原', () => {
    const r = run({ withList: true });
    const ids = () => r.list.children.map((c) => c.dataset.id).join(',');
    expect(ids(), '初始应是接口顺序（最新在前）').toBe('30,10,20');
    r.sortBtns[1].fire('click');            // 最早在前
    expect(ids(), '点了「最早在前」顺序没变').toBe('10,20,30');
    r.sortBtns[0].fire('click');            // 切回最新在前
    expect(ids(), '切不回来').toBe('30,20,10');
  });

  it('★ 排序只重排现有节点：li 对象不变（展开的回复表单才不丢）', () => {
    const r = run({ withList: true });
    const before = r.list.children.slice();
    r.sortBtns[1].fire('click');
    expect(r.list.children.length, '条数变了 ⇒ 它在重建 DOM').toBe(3);
    for (const n of before) expect(r.list.children).toContain(n);
  });

  it('时间窗切换重画波形：窗口覆盖到留言时，读数跟着变', () => {
    const r = run();
    /* 用**相对今天**的日期：时间窗就是"相对多久之内"，拿固定历史日期去测
       会永远落在窗口外（那测到的是日期常量，不是时间窗逻辑）。 */
    r.emit('voiceprint', { comments: [note(1, ago(5)), note(2, ago(10)), note(3, ago(20))] });
    expect(r.read.textContent).toMatch(/全部/);
    r.winBtns[1].fire('click');              // 近 30 天 —— 三条（5/10/20 天前）都在窗口内
    expect(r.read.textContent, '读数没跟着时间窗变').toMatch(/近 30 天/);
    expect(r.ready(), '窗口内还有留言却退回静态态了').toBe(true);
  });

  it('★ 窗口内一条留言都没有时：不画假波形，读数说清楚（"最近没人来"是信息）', () => {
    const r = run();
    r.emit('voiceprint', { comments: [note(1, ago(400)), note(2, ago(420))] });
    expect(r.ready(), '全部窗口下应该画得出来').toBe(true);
    r.winBtns[1].fire('click');              // 近 30 天，而两条都在一年多前
    expect(r.ready(), '空窗口却进了就绪态 ⇒ 会画一条假的波形').toBe(false);
    expect(r.read.textContent, '空窗口没改口').toMatch(/近 30 天/);
    expect(r.read.textContent, '空窗口没说清是哪一段空的').toMatch(/这段时间/);
  });

  it('切回「全部」能把空窗口救回来', () => {
    const r = run();
    r.emit('voiceprint', { comments: [note(1, ago(400))] });
    r.winBtns[1].fire('click');
    expect(r.ready()).toBe(false);
    r.winBtns[0].fire('click');              // 回到全部
    expect(r.ready(), '切回全部却还停在静态形态').toBe(true);
    expect(r.read.textContent).toMatch(/全部/);
  });
});

/* ── 背景层：指针声波 POINTER RIPPLE（2026-10-14 §6.80.1）───────────────── */
const rlcore2 = read('src/scripts/rl-core.ts').replace(/^export /gm, '');
const rippleSrc = read('src/scripts/ripple.ts').replace(/^import .*\r?\n/gm, '');
const RIPPLE_CODE = transformSync(`${rlcore2}\n${rippleSrc}`, { loader: 'ts' }).code;

/** 跑一遍背景层。返回生成的环、指针事件的派发器、以及版心范围。
 *  ⚠ `box` 可调版心宽度：第一版把它写死 100~1100，而「同屏上界」那条按每次 300px
 *  步长发了 40 次 ⇒ 第 4 次之后全落在版心外被挡掉，**实际只生成 4 个环**，
 *  `≤ 12` 恒过 —— 一条空跑的门闩比没有门闩更坏（它让人以为上界被守住了）。 */
function runRipple(opts: { reduced?: boolean; box?: { left: number; right: number } } = {}) {
  const box = opts.box ?? { left: 100, right: 1100 };
  const layer = new El('div'); layer.dataset.ripple = '';
  const shell = new El('div');
  shell.getBoundingClientRect = () => ({ left: box.left, top: 0, right: box.right, bottom: 900, width: box.right - box.left, height: 900 }) as any;
  const rings: El[] = [];
  const document = {
    querySelector: (s: string) => (s === '[data-ripple]' ? layer : s === '.shell' ? shell : null),
    createElement: (tag: string) => {
      const e = new El(tag);
      e.className = ''; e.style.left = ''; e.style.top = '';
      rings.push(e); return e;
    },
    firstElementChild: null as any,
  };
  /* firstElementChild 是 `while (满了) 撤掉最老那个` 那句要用的。 */
  Object.defineProperty(layer, 'firstElementChild', {
    get: () => layer.children[0] ?? null,
  });
  const mql = { matches: !!opts.reduced, addEventListener() {}, removeEventListener() {} };
  let fire: ((e: any) => void) | null = null;
  const win = {
    matchMedia: () => mql,
    addEventListener: (t: string, fn: (e: any) => void) => { if (t === 'pointermove') fire = fn; },
  };
  runInNewContext(RIPPLE_CODE, { window: win, document, matchMedia: () => mql });
  return {
    rings, layer, shell,
    at: (x: number, y = 400, pointerType = 'mouse') =>
      fire?.({ clientX: x, clientY: y, pointerType }),
  };
}

describe('留言页背景层 · 指针声波', () => {
  it('少动效档一个环都不生成（降级靠"根本不注册"）', () => {
    const r = runRipple({ reduced: true });
    r.at(300); r.at(500); r.at(700);
    expect(r.rings.length, '减少动效下还在生成波纹').toBe(0);
  });

  it('划过才生成；距离太近不重复生成（否则一次划屏会拉出上百个环）', () => {
    const r = runRipple();
    r.at(500);
    expect(r.rings.length, '指针进来一次都没生成').toBe(1);
    r.at(502); r.at(504);            // 太近 ⇒ 跳过
    expect(r.rings.length, '近距离移动又生成了 ⇒ 间隔阈值没生效').toBe(1);
    r.at(700);                        // 够远
    expect(r.rings.length).toBe(2);
  });

  it('★★ 环要落在指针底下，不许被版心偏移带跑（站主目检报「出现在光标的左上角」）', () => {
    /* ★ 这条守的是 2026-10-14 站主截图报的那个现象。根因：环的坐标写成了
       `指针 − 版心左缘/上缘`，**但波纹层是 `position:fixed; inset:0`** ——
       它的坐标系原点就是视口 (0,0)，不是版心左上角。于是整层环被平移了
       (shell.left, shell.top)：宽屏上版心左缘 ≈300px、上缘 ≈100px ⇒
       环整整偏到指针的左上角外，看着像"没跟着鼠标"。
       ⇒ 版心 rect **只**用来判"在不在版心内"，**不许**拿去平移坐标。 */
    const r = runRipple();                       // 替身里版心是 left 100 / right 1100
    r.at(500, 400);
    const ring = r.rings[0];
    expect(ring, '没生成环').toBeTruthy();
    expect(ring.style.left, `环偏了 ${Number(ring.style.left) - 500}px —— 被版心左缘带跑了`).toBe('500px');
    expect(ring.style.top, `环偏了 ${Number(ring.style.top) - 400}px —— 被版心上缘带跑了`).toBe('400px');
    /* 版心外的指针仍然不许生成（这条门控还在，只是不再兼职坐标） */
    r.at(80, 400);
    expect(r.rings.length, '版心外也生成了').toBe(1);
  });

  it('★ 触屏划动不生成：手指拖动会划出满屏的环', () => {
    const r = runRipple();
    /* ★ 这条必须真的发 touch 事件才作数 —— 早先写成 `at(300, 400)`（第二个参数是 y），
       于是全程都是 mouse 事件、断言恒过 —— 一条**空跑**的门闩比没有门闩更坏。 */
    r.at(300, 400, 'touch');
    r.at(600, 400, 'touch');
    r.at(900, 400, 'touch');
    expect(r.rings.length, '触屏拖动也生成了波纹').toBe(0);
    r.at(600);                          // 鼠标进来才该有
    expect(r.rings.length, '鼠标也不生成 ⇒ 上一条把门控焊死了').toBe(1);
  });

  it('★ 版心之外不生成（装饰不铺到版心外的空白）', () => {
    const r = runRipple();
    r.at(50);                          // 版心左缘 100 之外
    expect(r.rings.length, '版心外也生成了').toBe(0);
    r.at(600);
    expect(r.rings.length).toBe(1);
  });

  it('同屏环数有上界；播完（animationend）自己回收', () => {
    /* ★ 版心放宽到 0~5000，且步长 100px（> STEP_PX=90）—— 必须保证 40 次**都**落在版心内。
       第一版用 100~1100 的版心配 300px 步长 ⇒ 只生成 4 个环，`≤12` 恒过（空跑）。 */
    const r = runRipple({ box: { left: 0, right: 5000 } });
    for (let i = 0; i < 40; i++) r.at(200 + i * 100);
    expect(r.at(200), '版心放宽后这次也没生成 ⇒ 夹具还是没量到东西').toBeUndefined();
    /* ★ 上界管的是**同屏存活**（`layer.children`），不是**累计生成**（`rings`）——
       生成的那些里超额的已经被撤掉了，拿累计数去比上界，第一版就会一直绿。
       两条一起写：一条卡上界、一条证明这个上界**确实被触发过**（否则又是空跑）。 */
    expect(r.layer.children.length, '同屏存活的环没有上界 ⇒ 一直划会积出一堆')
      .toBeLessThanOrEqual(12);
    expect(r.rings.length, '一共才生成这么少 ⇒ 压根没碰到上界，这条断言是空跑的')
      .toBeGreaterThan(12);
    /* 播完的元素要自己摘掉，否则层里会一直堆着死元素。 */
    const before = r.layer.children.length;
    expect(before).toBeGreaterThan(0);
    for (const ring of r.rings) ring.fire('animationend');
    expect(r.layer.children.length, 'animationend 之后环还留在层里').toBe(0);
  });

  it('★★ 环的样式必须走全局：它是脚本造出来的，拿不到 Astro 的作用域属性', () => {
    /* ★★★ 这条守的是 2026-10-14 真踩的那一脚：环由 `ripple.ts` 运行时
       `document.createElement('i')` 造出来，**没有** Astro scoped style 加的
       `data-astro-cid` 属性 ⇒ 规则写在作用域块里就一条都匹配不上。
       症状极具欺骗性：环确实生成了（层里有 6 个 `<i>`），但
       `getComputedStyle` 出来是 `animation: none` / `border-width: 0px` /
       `width: auto` —— 元素在、逻辑对、画面上什么都没有。
       ★ 而且连 `:global()` 也不够：这一块还带 `@keyframes`，`:global()` 罩不住
       at-rule，所以整块得 `is:global`。 */
    const raw = read('src/pages/guestbook.astro');
    /* ★ 判据必须先剥注释（Astro 模板注释 + CSS 注释）：这一页的注释里**反复**提到
       "全局样式块"和 `.vr-ring`，不剥的话注释本身就能把"存在性"断言喂绿 ——
       2026-10-14 实测：注释里字面写了 `is:global` 那行标签，正则从注释里就开始匹配，
       把真正的规则块整个漏掉，报的却是"环不在全局块里"。 */
    const NCsrc = raw.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

    const blocks = [...NCsrc.matchAll(/<style is:global>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
    expect(blocks.length, '本页没有全局样式块 ⇒ 环的样式无处安放').toBeGreaterThan(0);
    const NC = blocks.join('\n');
    expect(NC, '环的规则不在全局块里 ⇒ 会被作用域前缀挡掉、屏幕上什么都不出现')
      .toMatch(/\.vr-ring\s*\{/);
    expect(NC, '关键帧也必须同在全局块（`:global()` 罩不住 at-rule）')
      .toMatch(/@keyframes\s+vr-ring-out/);
    expect(NC, '环自己写了字面色值').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(NC, '环自己写了 rgba()').not.toMatch(/\brgba?\(/);
    expect(NC, '环的描边应走站上装饰层的标准档 22%').toMatch(/var\(--deco-orbit-strong\)/);
    /* ★ 浓度不许退回 9% 那档：第一版用 `--deco-orbit-soft`(9%) + `scale(0.2)`，
       按像素量出来峰值只有 Δ2~3 级 —— 比站上最淡的底纹还轻，等于没画。
       判据落在 token 名上：它是"这一层落在装饰哪一档"的唯一凭据。 */
    expect(NC, '环的描边退回了 9% 那档（实测峰值只有 8 级以下，等于看不见）')
      .not.toMatch(/var\(--deco-orbit-soft\)/);
    expect(NC, '环必须是圆的').toMatch(/border-radius:\s*50%/);
    /* 少动效档那条双保险也得在同一块里（作用域外的写法同样匹配不到）。 */
    expect(NC, '少动效兜底不在全局块里').toMatch(/prefers-reduced-motion/);

    /* ★ 反面：环的规则**不许**留在作用域块里（留了就等于没写，这是本条要守的真事故）。
       单独提出来写成一条，是因为上面那些是「要有什么」，这条是「不许在哪」——
       只写前者的话，把规则搬回作用域块仍可能因为别处还有一份而绿。 */
    const scoped = [...NCsrc.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    expect(scoped, '环的规则还留在作用域块里 ⇒ 匹配不到，等于没写')
      .not.toMatch(/\.vr-ring\s*\{/);
    /* 层本身是模板元素（有 cid），留在作用域块里是对的 —— 别把这条一起改掉。 */
    expect(scoped, '波纹层是模板元素，样式应当留在作用域块里').toMatch(/\.vr-ripple\s*\{/);
  });
});

/* ── 玻璃控件（一套两用）─────────────────────────────────────────────────── */
describe('留言页声纹带 · 玻璃控件', () => {
  const SRC = read('src/components/Voiceprint.astro');

  it.skipIf(!hasPage)('两组控件都在：声纹带的时间窗 + 列表的排序', () => {
    expect(HTML, '没有时间窗控件').toContain('data-vp-window');
    expect(HTML, '没有排序控件').toContain('data-vp-sort');
    /* 一套玻璃样式服务两处 —— 两组必须共用同一个玻璃类，不能各写一份。 */
    const glass = [...HTML.matchAll(/class="([^"]*vp-glass[^"]*)"/g)].map((m) => m[1]);
    expect(glass.length, '玻璃容器一个都没找到').toBeGreaterThan(0);
    for (const g of glass) {
      const roles = [/\bvp-w\b/, /\bvp-s\b/];
      expect(roles.some((r) => r.test(g)), `这个玻璃容器既不是时间窗也不是排序：${g}`).toBe(true);
    }
  });

  it('★★ 玻璃不得挂在会成为 position:fixed 包含块的祖先上（§6.56 那条真事故）', () => {
    /* `backdrop-filter` 同时建立 fixed 的包含块**与**层叠上下文 ——
       顶栏就因为它把导航抽屉压成 62px 一条（全站十一个页面，八页坏）。 */
    const NC = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    const blurAt = NC.indexOf('backdrop-filter');
    expect(blurAt, '组件里没有 backdrop-filter ⇒ 玻璃没了？').toBeGreaterThan(-1);
    const rule = NC.slice(NC.lastIndexOf('{', blurAt), blurAt);
    expect(rule, 'backdrop-filter 所在的规则里出现了 fixed').not.toMatch(/position:\s*fixed/);
    /* 玻璃所在的那一层自己也不许是 fixed（fixed 元素身上的 backdrop-filter
       会让它变成自己的包含块，抽取/裁剪行为也随之变化）。 */
    const glassLayer = NC.slice(NC.indexOf('.vp-ctl'), NC.indexOf('.vp-ctl') + 400);
    expect(glassLayer, '控件那一层不许是 fixed').not.toMatch(/position:\s*fixed/);
  });

  it('★★ 玻璃层的 z-index 必须是 0、不是 -1（底纹不进 backdrop 就是一块白片）', () => {
    const NC = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const layer = NC.slice(NC.indexOf('.vp-ctl'), NC.indexOf('.vp-ctl') + 400);
    expect(layer, '控件那一层没有 z-index').toMatch(/z-index:\s*0\s*;/);
    expect(layer, 'z-index 必须是 0：写 -1 时底纹（也是 -1）不进 backdrop，玻璃当场变纯白片')
      .not.toMatch(/z-index:\s*-1\s*;/);
  });

  it.skipIf(!hasPage)('玻璃只用站上既有的 --glass-* token，不新造色值', () => {
    const glassBlock = SRC.slice(SRC.indexOf('.vp-glass'), SRC.indexOf('.vp-glass') + 900);
    const NC = glassBlock.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(NC, '玻璃层出现了字面色值').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(NC, '玻璃层出现了 rgba()').not.toMatch(/\brgba?\(/);
    expect(NC, '玻璃底色应走 --glass-bg').toMatch(/var\(--glass-bg\)/);
    expect(NC, '玻璃边框应走 --glass-line').toMatch(/var\(--glass-line\)/);
  });

  it.skipIf(!hasPage)('★ 带高 ≤ 一行正文 —— 「不压正文」这条要求的量化护栏', () => {
    /* 站上正文行高 = --lh-body × --fs-body。波形带最多占这么高 ⇒ 结构上就压不到任何一行。
       （对照被否掉的墨滴：整屏 canvas。） */
    expect(PAGE_CSS, '波形带没有按 token 算高度').toMatch(/height:\s*calc\(var\(--lh-body\)\s*\*\s*var\(--fs-body\)\)/);
    expect(SRC, '不许写死像素/rem 高度').not.toMatch(/\.vp-svg\s*\{[^}]*height:\s*[\d.]+(?:px|rem)/);
  });

  it('★★ 悬停游标：跟着指针走，读数换成「那一刻附近 N 条」', () => {
    const r = run();
    r.emit('voiceprint', { comments: [note(1, ago(1)), note(2, ago(10)), note(3, ago(20))] });
    const before = r.read.textContent;
    r.svg.fire('pointermove', { clientX: r.svg.left + r.svg.width * 0.5, clientY: 10 });
    expect(r.cursor.getAttribute('opacity'), '游标没露出来').toBe('1');
    expect(r.read.textContent, '读数没跟着游标换').not.toBe(before);
    expect(r.read.textContent).toMatch(/附近/);
    r.svg.fire('pointermove', { clientX: r.svg.left + r.svg.width * 0.5, clientY: 9999 });
    expect(r.cursor.getAttribute('opacity'), '指针离开波形带后游标没收').toBe('0');
  });

  it('★★ 悬停期间波形路径一个字都不许变（游标只读不改形）', () => {
    const r = run();
    r.emit('voiceprint', { comments: [note(1, ago(1)), note(2, ago(20))] });
    const d = r.wave.getAttribute('d');
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      r.svg.fire('pointermove', { clientX: r.svg.left + r.svg.width * f, clientY: 10 });
    }
    expect(r.wave.getAttribute('d'), '悬停把波形改了').toBe(d);
  });

  it('★ 点一下钉住：钉住之后指针移开游标不动，再点一下取消', () => {
    const r = run();
    r.emit('voiceprint', { comments: [note(1, ago(1)), note(2, ago(20))] });
    const svg = r.svg;
    const at = (f: number) => ({ clientX: svg.left + svg.width * f, clientY: 10 });
    svg.fire('pointermove', at(0.2));
    svg.fire('click', at(0.2));
    const pinned = svg.getAttribute('data-pinned') ?? r.cursor.getAttribute('data-pinned');
    expect(pinned, '点了一下没有钉住').toBeTruthy();
    const read = r.read.textContent;
    svg.fire('pointermove', at(0.9));   // 钉住之后指针移开
    expect(r.read.textContent, '钉住后指针移开读数就跟着跑了').toBe(read);
    svg.fire('click', at(0.2));        // 再点一次 ⇒ 取消
    expect(svg.getAttribute('data-pinned') ?? r.cursor.getAttribute('data-pinned'),
      '再点一次没取消钉住').toBeFalsy();
  });

  it('少动效档不提供游标与钉住（它们是动效装置的一部分）', () => {
    const r = run({ reduced: true });
    r.emit('voiceprint', { comments: [note(1, ago(1))] });
    r.svg.fire('pointermove', { clientX: r.svg.left + 10, clientY: 10 });
    expect(r.cursor.getAttribute('opacity'), '少动效下还出了游标').toBe('0');
  });

  it('排序只重排现有节点，不重建列表（否则会丢已展开的回复表单）', () => {
    /* 这是"排序"能在这一轮安全落地的前提：重排 = 同一个 li 对象换个位置，
       它上面的展开状态、正在填的回复框全都还在。 */
    const sortAt = vpSrc.indexOf('data-vp-sort');
    expect(sortAt, '装置里没有排序逻辑').toBeGreaterThan(-1);
    const block = vpSrc.slice(sortAt - 400, sortAt + 600);
    expect(block, '排序里出现了 createElement ⇒ 它在重建 DOM').not.toMatch(/createElement/);
    expect(block, '排序应该走 appendChild 重排').toMatch(/appendChild/);
  });
});