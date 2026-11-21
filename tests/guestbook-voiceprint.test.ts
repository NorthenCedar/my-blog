import { unwrapPage } from './page-controller-source';
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
import { Window } from 'happy-dom';
import { afterEach, describe, it, expect, vi } from 'vitest';

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
    const post = CODE.indexOf('postComment(payload,');
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

describe('评论请求交错与切页', () => {
  afterEach(() => vi.unstubAllGlobals());

  const markup = (slug: string) => `
    <section data-comments data-slug="${slug}">
      <span data-count></span><p data-empty>还没有留言</p><ol data-list hidden></ol>
      <p data-error hidden></p>
      <form data-form><input name="name" value="访客"><textarea name="body">新留言</textarea><button data-submit>发表</button></form>
    </section>`;
  const comment = (id: number, body = '一条留言') => ({ id, name: '访客', body, createdAt: '2026-11-21T00:00:00Z' });

  async function mount(slug: string) {
    vi.resetModules();
    const win = new Window();
    const requests: { url: string; init?: RequestInit; resolve(data: unknown): void; fail(status: number): void }[] = [];
    const snapshots: { comments: ReturnType<typeof comment>[]; replies?: { id: number }[] }[] = [];
    const additions: { note: { id: number } }[] = [];
    const expirations: Event[] = [];
    for (const name of ['document', 'location', 'FormData', 'HTMLButtonElement', 'PageTransitionEvent', 'CustomEvent', 'Event'] as const) {
      vi.stubGlobal(name, win[name]);
    }
    vi.stubGlobal('Option', function (text: string, value: string) {
      const option = win.document.createElement('option');
      option.textContent = text;
      option.value = value;
      return option;
    });
    vi.stubGlobal('window', win);
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      if (url === '/api/account') return Promise.resolve({ ok: true, json: async () => ({ user: null }) });
      return new Promise(resolve => requests.push({
        url, init, resolve: data => resolve({ ok: true, json: async () => data }),
        fail: status => resolve({ ok: false, status, json: async () => ({ error: '请求失败' }) }),
      }));
    });
    win.document.body.innerHTML = markup(slug);
    win.addEventListener('voiceprint', event => snapshots.push((event as CustomEvent).detail));
    win.addEventListener('voiceprint:new', event => additions.push((event as CustomEvent).detail));
    win.addEventListener('visitor-session-expired', event => expirations.push(event));
    await import('../src/scripts/comments');
    return { win, requests, snapshots, additions, expirations };
  }

  const finishResponse = () => new Promise<void>(resolve => setImmediate(resolve));

  it('往返缓存恢复后仍可切换发表身份，正常离页时清理身份控件', async () => {
    const { win } = await mount('guestbook');
    const { setViewer } = await import('../src/scripts/visitor-client');
    setViewer({ id: 'visitor-id', nickname: '账户昵称', bio: '', avatarUrl: '', isOwner: false });
    const form = win.document.querySelector('form')!;
    const name = form.querySelector<HTMLInputElement>('input[name="name"]')!;
    const identity = form.querySelector('select')!;
    const login = form.querySelector<HTMLButtonElement>('button.visitor-link')!;
    const pageTransition = (type: 'pagehide' | 'pageshow', persisted: boolean) => {
      // Happy DOM 的 PageTransitionEvent 兼容类尚不保留 persisted 初始化值。
      const event = new win.PageTransitionEvent(type);
      Object.defineProperty(event, 'persisted', { value: persisted });
      win.dispatchEvent(event);
    };
    const choose = (value: string) => {
      identity.value = value;
      identity.dispatchEvent(new win.Event('change'));
    };
    expect(identity.value).toBe('account');
    expect(name.readOnly).toBe(true);

    pageTransition('pagehide', true);
    pageTransition('pageshow', true);
    choose('anonymous');
    expect(name.readOnly).toBe(false);
    expect(name.value).toBe('访客');
    choose('account');
    expect(name.readOnly).toBe(true);
    expect(name.value).toBe('账户昵称');

    pageTransition('pagehide', false);
    win.dispatchEvent(new win.Event('visitor-session-expired'));
    expect(login.hidden).toBe(true);
  });

  it.each(['读取先返回', '发表先返回', '旧快照未包含新留言'])('%s时，新留言只出现一次且列表与声纹一致', async order => {
    const { win, requests, snapshots, additions } = await mount('guestbook');
    const doc = win.document;
    const older = comment(1);
    const posted = comment(2, '新留言');
    doc.querySelector('form')!.requestSubmit();
    const [read, write] = requests;
    expect(write.init?.method).toBe('POST');
    const resolveRead = () => read.resolve({
      comments: order === '旧快照未包含新留言' ? [older] : [posted, older],
      replies: [{ ...comment(4), parentId: 2, replyTo: '' }],
    });
    if (order === '读取先返回') {
      resolveRead();
      await finishResponse();
      write.resolve({ comment: posted });
    } else {
      write.resolve({ comment: posted });
      await finishResponse();
      resolveRead();
    }
    await finishResponse();

    expect([...doc.querySelectorAll('[data-list] > li')].map(node => node.id)).toEqual(['comment-2', 'comment-1']);
    expect(doc.querySelectorAll('#reply-4')).toHaveLength(1);
    expect(doc.querySelector('[data-count]')!.textContent).toBe(' 3 条');
    expect(doc.querySelector('#comment-2 time')!.textContent).toContain('刚发表');
    expect(doc.querySelector('textarea')!.value).toBe('');
    const snapshot = snapshots.at(-1)!;
    expect(snapshot.comments.map(row => row.id)).toEqual([2, 1]);
    expect(additions).toHaveLength(order === '读取先返回' ? 0 : 1);
  });

  it.each([201, 401, 500])('从文章切到留言板后，文章的迟到请求不改变表单、声纹或登录状态（发表响应 %s）', async status => {
    const { win, requests, snapshots, additions, expirations } = await mount('old-article');
    const doc = win.document;
    const article = doc.querySelector('[data-comments]')!;
    article.querySelector('select')!.value = 'account';
    article.querySelector('form')!.requestSubmit();
    const [articleRead, articleWrite] = requests;
    expect(JSON.parse(String(articleWrite.init?.body)).identity).toBe('account');
    const beforeLeave = article.innerHTML;

    doc.dispatchEvent(new win.Event('astro:before-swap'));
    expect(articleRead.init?.signal?.aborted).toBe(true);
    expect(articleWrite.init?.signal).toBeUndefined();
    doc.body.innerHTML = markup('guestbook');
    doc.dispatchEvent(new win.Event('astro:page-load'));
    expect(requests[2].url).toBe('/api/comments?slug=guestbook');
    requests[2].resolve({ comments: [comment(10, '留言板')] });
    await finishResponse();
    articleRead.resolve({ comments: [comment(20, '文章评论')] });
    if (status === 201) articleWrite.resolve({ comment: comment(21, '文章新评论') });
    else articleWrite.fail(status);
    await finishResponse();

    expect(snapshots.map(snapshot => snapshot.comments.map(row => row.id))).toEqual([[10]]);
    expect(additions).toEqual([]);
    expect(expirations).toEqual([]);
    expect(doc.querySelector('[data-list] > li')?.id).toBe('comment-10');
    expect(article.innerHTML).toBe(beforeLeave);
    expect(article.querySelector('textarea')!.value).toBe('新留言');
  });

  it.each(['先读取', '先发表回复'])('%s时，回复按从旧到新排列，条数和声纹只算一次', async order => {
    const { win, requests, snapshots } = await mount('guestbook');
    const doc = win.document;
    const parent = comment(2);
    doc.querySelector('form')!.requestSubmit();
    requests[1].resolve({ comment: parent });
    await finishResponse();
    doc.querySelector<HTMLButtonElement>('#comment-2 > .reply-btn')!.click();
    doc.querySelector<HTMLTextAreaElement>('.reply-form textarea')!.value = '我的回复';
    doc.querySelector<HTMLFormElement>('.reply-form')!.requestSubmit();
    const olderReply = { ...comment(3, '更早的回复'), parentId: 2, replyTo: '' };
    const sentReply = { ...comment(4, '我的回复'), parentId: 2, replyTo: '' };
    const resolveRead = () => requests[0].resolve({ comments: [parent], replies: [olderReply, sentReply] });
    const resolveWrite = () => requests[2].resolve({ comment: sentReply });
    if (order === '先读取') {
      resolveRead();
      await finishResponse();
      resolveWrite();
    } else {
      resolveWrite();
      await finishResponse();
      resolveRead();
    }
    await finishResponse();

    expect([...doc.querySelectorAll('.reply-list > li')].map(node => node.id)).toEqual(['reply-3', 'reply-4']);
    expect(doc.querySelector('[data-count]')!.textContent).toBe(' 3 条');
    expect(snapshots.at(-1)?.replies?.map(row => row.id)).toEqual([3, 4]);
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
const vpSrc = unwrapPage(read('src/scripts/voiceprint.ts')).replace(/^import .*\r?\n/gm, '');
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
