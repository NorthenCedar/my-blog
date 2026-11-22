// 即时两段式换页动画、同源内存预取与长文章代码块分片渲染回归测试
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';

function bindWindowTimersAndDom(win: Window) {
  vi.spyOn(win, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
    globalThis.setTimeout(fn, ms, ...args)) as typeof win.setTimeout);
  vi.spyOn(win, 'clearTimeout').mockImplementation(((id?: number) =>
    globalThis.clearTimeout(id)) as typeof win.clearTimeout);
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', win.document);
  vi.stubGlobal('Element', win.Element);
  vi.stubGlobal('Node', win.Node);
  vi.stubGlobal('MouseEvent', win.MouseEvent);
  vi.stubGlobal('PageTransitionEvent', win.PageTransitionEvent);
}

describe('换页过渡 · 即时覆盖、内存预取与长文分片', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('点击后立刻挂上 pt-cover（不等网络），复用触屏/悬停预取并同步暗色与 pt-reveal 到新文档', async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const win = new Window({ url: 'https://northcedar.top/archive/' });
    const doc = win.document;
    doc.documentElement.className = 'dark';
    doc.head.innerHTML = '<link rel="stylesheet" href="/_astro/shared.css">';
    doc.body.innerHTML = `
      <main><a id="post-link" href="/posts/my-c-note/">C 语言笔记</a>
      <a id="skip-link" href="/talks/" data-astro-prefetch="false">跳过预取</a>
      <a id="ext-link" href="https://example.com/">外链</a>
      <a id="asset-link" href="/rss.xml">RSS</a></main>
    `;

    const fetched: { url: string; headers?: Record<string, string>; priority?: string }[] = [];
    let resolveHtml!: (res: Response) => void;
    const htmlPromise = new Promise<Response>((r) => { resolveHtml = r; });
    const cssPromise = new Promise<Response>(() => {});

    const targetHtml = `<!doctype html><html><head>
      <meta name="astro-view-transitions-enabled" content="true">
      <link rel="stylesheet" href="/_astro/shared.css">
      <link rel="stylesheet" href="/_astro/post-extra.css">
    </head><body><main><p>文章内容</p></main><script type="module" src="/_astro/post-page.js"></script></body></html>`;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit & { priority?: string }) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetched.push({
        url,
        headers: init?.headers as Record<string, string> | undefined,
        priority: init?.priority,
      });
      if (url.endsWith('/posts/my-c-note/')) return htmlPromise;
      if (url.endsWith('/_astro/post-extra.css')) return cssPromise;
      return Promise.resolve(new Response('', { status: 200 }));
    });

    bindWindowTimersAndDom(win);
    vi.stubGlobal('location', win.location);
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('sessionStorage', win.sessionStorage);
    vi.stubGlobal('DOMParser', win.DOMParser);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => win.setTimeout(() => cb(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => win.clearTimeout(id));

    try {
      await import('../src/scripts/transition');

      // 1. 不应预取带有 data-astro-prefetch="false" / 外链 / 静态后缀
      for (const id of ['skip-link', 'ext-link', 'asset-link']) {
        doc.getElementById(id)!.dispatchEvent(new win.Event('pointerdown', { bubbles: true }));
      }
      expect(fetched).toHaveLength(0);

      // 2. hover 65ms 防抖验证（移出即取消，不发请求）
      const postLink = doc.getElementById('post-link')!;
      postLink.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(30);
      postLink.dispatchEvent(new win.MouseEvent('mouseout', { bubbles: true }));
      vi.advanceTimersByTime(80);
      expect(fetched).toHaveLength(0);

      // 3. pointerdown（触屏按下）立即预取一次，带 Purpose: prefetch 与 priority: low
      postLink.dispatchEvent(new win.Event('pointerdown', { bubbles: true }));
      expect(fetched).toHaveLength(1);
      expect(fetched[0].url).toBe('https://northcedar.top/posts/my-c-note/');
      expect(fetched[0].headers?.Purpose).toBe('prefetch');
      expect(fetched[0].priority).toBe('low');

      // 4. 触发 astro:before-preparation：即使 HTML 尚未返回，根元素也立刻切到 pt-on pt-cover
      const ac = new AbortController();
      const origLoader = vi.fn(async () => {});
      const prepEvent = Object.assign(new win.Event('astro:before-preparation', { cancelable: true }), {
        from: new URL('https://northcedar.top/archive/'),
        to: new URL('https://northcedar.top/posts/my-c-note/'),
        direction: 'forward',
        navigationType: 'push',
        sourceElement: postLink,
        info: undefined,
        newDocument: doc,
        signal: ac.signal,
        formData: undefined,
        loader: origLoader,
      });
      doc.dispatchEvent(prepEvent);

      expect(doc.documentElement.classList.contains('pt-on')).toBe(true);
      expect(doc.documentElement.classList.contains('pt-cover')).toBe(true);
      expect(doc.documentElement.classList.contains('pt-reveal')).toBe(false);

      // 开始执行包装后的 loader：复用同一个 in-flight 预取请求，绝不发第二次 HTML 请求
      const loadDone = (prepEvent.loader as () => Promise<void>)();
      const htmlFetches = () => fetched.filter((x) => x.url.endsWith('/posts/my-c-note/'));
      expect(htmlFetches()).toHaveLength(1);
      expect(origLoader).not.toHaveBeenCalled();

      // 慢加载期间也不会渲染顶部「正在打开页面」提示条
      vi.advanceTimersByTime(450);
      expect(doc.querySelector('.pt-status')).toBeNull();
      expect(doc.body.textContent).not.toContain('正在打开页面');

      // 返回 HTML 响应并让异步 DOM 解析、waitStyles 创建 preload 节点就位
      resolveHtml(new Response(targetHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
      for (let i = 0; i < 40 && doc.head.querySelectorAll('link[rel="preload"][as="style"]').length === 0; i++) {
        await Promise.resolve();
      }

      // 预取成功应后台预热目标页额外样式表与独享脚本模块，且未完成时 waitStyles 创建 preload 节点等待 load
      expect(fetched.some((x) => x.url.endsWith('/_astro/post-extra.css'))).toBe(true);
      expect(doc.head.querySelector('link[rel="modulepreload"][href="https://northcedar.top/_astro/post-page.js"]')).not.toBeNull();
      const preloads = doc.head.querySelectorAll('link[rel="preload"][as="style"]');
      expect(preloads.length).toBe(1);
      for (const preload of preloads) {
        preload.dispatchEvent(new win.Event('load'));
      }
      await loadDone;

      expect(prepEvent.newDocument).not.toBe(doc);
      expect(prepEvent.newDocument.querySelector('main p')?.textContent).toBe('文章内容');

      // 5. astro:before-swap 将暗色主题与 pt-hold 同步到新文档根元素，隔开主线程峰值并防止白闪
      const swapEvent = Object.assign(new win.Event('astro:before-swap'), {
        from: prepEvent.from,
        to: prepEvent.to,
        direction: 'forward',
        navigationType: 'push',
        sourceElement: postLink,
        info: undefined,
        newDocument: prepEvent.newDocument,
        signal: ac.signal,
      });
      doc.dispatchEvent(swapEvent);
      expect(prepEvent.newDocument.documentElement.classList.contains('dark')).toBe(true);
      expect(prepEvent.newDocument.documentElement.classList.contains('pt-on')).toBe(true);
      expect(prepEvent.newDocument.documentElement.classList.contains('pt-hold')).toBe(true);
      expect(prepEvent.newDocument.documentElement.classList.contains('pt-reveal')).toBe(false);

      // 6. astro:after-swap 保持 pt-hold，等待 astro:page-load + 双 rAF 让出新页初始化峰值后才进入 pt-reveal
      doc.dispatchEvent(new win.Event('astro:after-swap'));
      expect(doc.documentElement.classList.contains('pt-hold')).toBe(true);
      expect(doc.documentElement.classList.contains('pt-cover')).toBe(false);
      expect(doc.documentElement.classList.contains('pt-reveal')).toBe(false);

      doc.dispatchEvent(new win.Event('astro:page-load'));
      expect(doc.documentElement.classList.contains('pt-hold')).toBe(true);
      expect(doc.documentElement.classList.contains('pt-reveal')).toBe(false);

      vi.advanceTimersByTime(40);
      expect(doc.documentElement.classList.contains('pt-hold')).toBe(false);
      expect(doc.documentElement.classList.contains('pt-reveal')).toBe(true);

      // 仅在揭幕动画实际开播后按 REVEAL_MS 收尾（防慢机主线程卡顿跳过动画）
      vi.advanceTimersByTime(350);
      expect(doc.documentElement.classList.contains('pt-reveal')).toBe(true);

      doc.dispatchEvent(Object.assign(new win.Event('animationstart'), { animationName: 'pt-ink-out' }));
      vi.advanceTimersByTime(500);
      expect(doc.documentElement.classList.contains('pt-on')).toBe(false);
      expect(doc.documentElement.classList.contains('pt-hold')).toBe(false);
      expect(doc.documentElement.classList.contains('pt-reveal')).toBe(false);
      expect(doc.documentElement.classList.contains('pt-play')).toBe(false);
    } finally {
      await win.happyDOM.close();
    }
  });

  it('开启 prefers-reduced-motion: reduce 时换页不添加覆盖或揭幕动画类', async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const win = new Window({ url: 'https://northcedar.top/archive/' });
    const doc = win.document;
    doc.body.innerHTML = '<main><a id="a" href="/talks/">说说</a></main>';

    bindWindowTimersAndDom(win);
    vi.stubGlobal('location', win.location);
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('sessionStorage', win.sessionStorage);
    vi.stubGlobal('DOMParser', win.DOMParser);
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<!doctype html><html><head><meta name="astro-view-transitions-enabled" content="true"></head><body><main>说说</main></body></html>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    )));
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => win.setTimeout(() => cb(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => win.clearTimeout(id));

    try {
      await import('../src/scripts/transition');
      const ac = new AbortController();
      const ev = Object.assign(new win.Event('astro:before-preparation', { cancelable: true }), {
        from: new URL('https://northcedar.top/archive/'),
        to: new URL('https://northcedar.top/talks/'),
        direction: 'forward',
        navigationType: 'push',
        sourceElement: doc.getElementById('a'),
        newDocument: doc,
        signal: ac.signal,
        loader: async () => {},
      });
      doc.dispatchEvent(ev);
      expect(doc.documentElement.classList.contains('pt-cover')).toBe(false);
      expect(doc.documentElement.classList.contains('pt-on')).toBe(false);

      await (ev.loader as () => Promise<void>)();
      const beforeSwap = Object.assign(new win.Event('astro:before-swap'), {
        from: ev.from,
        to: ev.to,
        navigationType: 'push',
        newDocument: ev.newDocument,
        signal: ac.signal,
      });
      doc.dispatchEvent(beforeSwap);
      expect(ev.newDocument.documentElement.classList.contains('pt-hold')).toBe(false);
      expect(ev.newDocument.documentElement.classList.contains('pt-reveal')).toBe(false);
    } finally {
      await win.happyDOM.close();
    }
  });

  it('长文章代码块首屏前 6 块同步包装，后续块分批让出主线程且离页即止', async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const win = new Window();
    const doc = win.document;
    const makeBlock = (i: number) =>
      `<pre class="astro-code" data-language="c"><code>`
      + Array.from({ length: 8 }, (_, line) => `<span class="line"><span>line-${i}-${line}</span></span>`).join('\n')
      + `</code></pre>`;
    doc.body.innerHTML = `<article class="post-body"><div class="prose">${Array.from({ length: 20 }, (_, i) => makeBlock(i)).join('')}</div></article>`;

    bindWindowTimersAndDom(win);
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } });

    try {
      await import('../src/scripts/copy-code');
      // 同步阶段先包装前 6 块，避免瞬间冻结主线程
      expect(doc.querySelectorAll('.code-holder')).toHaveLength(6);

      // 让出一次主线程后只处理第一批 8 块（累计 14 块）
      await vi.runOnlyPendingTimersAsync();
      expect(doc.querySelectorAll('.code-holder')).toHaveLength(14);

      // 再让出一次处理完剩余 6 块（全部 20 块就位）
      await vi.runOnlyPendingTimersAsync();
      expect(doc.querySelectorAll('.code-holder')).toHaveLength(20);

      // 再次挂载一批后若提前离页（astro:before-swap），应停止剩余代码块包装
      doc.body.innerHTML = `<article class="post-body"><div class="prose">${Array.from({ length: 20 }, (_, i) => makeBlock(i + 100)).join('')}</div></article>`;
      doc.dispatchEvent(new win.Event('astro:before-swap'));
      doc.dispatchEvent(new win.Event('astro:page-load'));
      expect(doc.querySelectorAll('.code-holder')).toHaveLength(6);
      doc.dispatchEvent(new win.Event('astro:before-swap'));
      await vi.advanceTimersByTimeAsync(50);
      expect(doc.querySelectorAll('.code-holder')).toHaveLength(6);
    } finally {
      await win.happyDOM.close();
    }
  });

  it('已彻底移除顶部「正在打开页面」提示条模板、样式与脚本逻辑，且 SPA 揭幕只走合成层位移与持久蒙版', () => {
    for (const file of ['src/layouts/Base.astro', 'src/styles/transition.css', 'src/scripts/transition.ts']) {
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} 仍残留 pt-status`).not.toContain('pt-status');
      expect(src, `${file} 仍残留 site-navigation-status`).not.toContain('site-navigation-status');
      expect(src, `${file} 仍残留 正在打开页面`).not.toContain('正在打开页面');
    }
    const base = readFileSync('src/layouts/Base.astro', 'utf8');
    expect(base).toContain('transition:persist="site-pt"');
    const css = readFileSync('src/styles/transition.css', 'utf8');
    const inkIn = css.slice(css.indexOf('@keyframes pt-ink-in'), css.indexOf('@keyframes pt-ink-out'));
    const inkOut = css.slice(css.indexOf('@keyframes pt-ink-out'), css.indexOf('@keyframes pt-word-in'));
    expect(inkIn).not.toContain('clip-path');
    expect(inkOut).not.toContain('clip-path');
  });

  it('菜单触发低并发预取与 modulepreload 预热，命中 readyStyles/预解析免等待，省流禁用且视口驻留取消可控', async () => {
    vi.useFakeTimers();
    vi.resetModules();

    const win = new Window({ url: 'https://northcedar.top/' });
    const doc = win.document;
    doc.head.innerHTML = '<link rel="stylesheet" href="/_astro/shared.css"><script type="module" src="/_astro/base.js"></script>';
    doc.body.innerHTML = `
      <button type="button" data-nav-open>Menu</button>
      <dialog id="site-menu">
        <a href="/about/">关于</a>
        <a href="/archive/">归档</a>
        <a href="/talks/">说说</a>
      </dialog>
      <main>
        <a id="vp-leave" href="/tags/">标签</a>
        <a id="vp-stay" href="/log/">日志</a>
      </main>
    `;

    const htmlOf = (name: string, extraCss: string, mod: string) => `<!doctype html><html><head>
      <meta name="astro-view-transitions-enabled" content="true">
      <link rel="stylesheet" href="/_astro/shared.css">
      <link rel="stylesheet" href="/_astro/${extraCss}">
    </head><body><main><h1>${name}</h1></main><script type="module" src="/_astro/base.js"></script><script type="module" src="/_astro/${mod}"></script></body></html>`;

    let inFlightHtml = 0;
    let maxInFlightHtml = 0;
    const htmlDeferred = new Map<string, (res: Response) => void>();
    const fetchedUrls: string[] = [];

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetchedUrls.push(url);
      if (url.endsWith('.css')) {
        return Promise.resolve(new Response('body{}', { status: 200 }));
      }
      inFlightHtml++;
      maxInFlightHtml = Math.max(maxInFlightHtml, inFlightHtml);
      return new Promise<Response>((resolve) => {
        htmlDeferred.set(url, (res) => {
          inFlightHtml--;
          resolve(res);
        });
      });
    });

    type IoRecord = { cb: IntersectionObserverCallback; observed: Set<Element> };
    const ioInstances: IoRecord[] = [];
    class MockIO {
      rec: IoRecord;
      constructor(cb: IntersectionObserverCallback) {
        this.rec = { cb, observed: new Set() };
        ioInstances.push(this.rec);
      }
      observe(el: Element) { this.rec.observed.add(el); }
      unobserve(el: Element) { this.rec.observed.delete(el); }
      disconnect() { this.rec.observed.clear(); }
    }

    const navState: { onLine: boolean; connection?: { saveData?: boolean; effectiveType?: string } } = { onLine: true };
    bindWindowTimersAndDom(win);
    vi.stubGlobal('location', win.location);
    vi.stubGlobal('navigator', navState);
    vi.stubGlobal('sessionStorage', win.sessionStorage);
    vi.stubGlobal('DOMParser', win.DOMParser);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('IntersectionObserver', MockIO);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => win.setTimeout(() => cb(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => win.clearTimeout(id));

    try {
      await import('../src/scripts/transition');

      // 1. 悬停 Menu 触发菜单链路预取，并发上限严格为 2
      doc.querySelector('[data-nav-open]')!.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
      expect(maxInFlightHtml).toBe(2);
      expect(htmlDeferred.has('https://northcedar.top/about/')).toBe(true);
      expect(htmlDeferred.has('https://northcedar.top/archive/')).toBe(true);
      expect(htmlDeferred.has('https://northcedar.top/talks/')).toBe(false);

      // 完成前两项后自动泵出第 3 项，并预热额外 CSS 与模块 JS（跳过已加载的 base.js）
      htmlDeferred.get('https://northcedar.top/about/')!(new Response(htmlOf('关于', 'about.css', 'about.js'), { status: 200, headers: { 'content-type': 'text/html' } }));
      for (let i = 0; i < 30 && !htmlDeferred.has('https://northcedar.top/talks/'); i++) await Promise.resolve();
      expect(htmlDeferred.has('https://northcedar.top/talks/')).toBe(true);

      htmlDeferred.get('https://northcedar.top/archive/')!(new Response(htmlOf('归档', 'archive.css', 'archive.js'), { status: 200, headers: { 'content-type': 'text/html' } }));
      htmlDeferred.get('https://northcedar.top/talks/')!(new Response(htmlOf('说说', 'talks.css', 'talks.js'), { status: 200, headers: { 'content-type': 'text/html' } }));
      for (let i = 0; i < 30; i++) await Promise.resolve();

      expect(doc.head.querySelector('link[rel="modulepreload"][href="https://northcedar.top/_astro/about.js"]')).not.toBeNull();
      expect(doc.head.querySelector('link[rel="modulepreload"][href="https://northcedar.top/_astro/base.js"]')).toBeNull();

      // 2. 空闲时间触发预解析后，超过 45 秒（但仍在 10 分钟内）跳转 /about/：
      //    0 次新 HTML 请求，0 个阻塞 <link rel="preload" as="style">，直接消费预解析 Document，第二次访问仍命中缓存
      await vi.advanceTimersByTimeAsync(150);
      await vi.advanceTimersByTimeAsync(120_000);
      const countBeforeNav = fetchedUrls.filter((u) => u === 'https://northcedar.top/about/').length;
      expect(countBeforeNav).toBe(1);

      const spyParse = vi.spyOn(win.DOMParser.prototype, 'parseFromString');
      const ac1 = new AbortController();
      const ev1 = Object.assign(new win.Event('astro:before-preparation', { cancelable: true }), {
        from: new URL('https://northcedar.top/'),
        to: new URL('https://northcedar.top/about/'),
        direction: 'forward',
        navigationType: 'push',
        sourceElement: doc.querySelector('[href="/about/"]'),
        newDocument: doc,
        signal: ac1.signal,
        loader: async () => {},
      });
      doc.dispatchEvent(ev1);
      const loader1 = (ev1.loader as () => Promise<void>)();
      await vi.advanceTimersByTimeAsync(300);
      await loader1;

      expect(fetchedUrls.filter((u) => u === 'https://northcedar.top/about/')).toHaveLength(1);
      expect(doc.head.querySelectorAll('link[rel="preload"][as="style"]')).toHaveLength(0);
      expect(ev1.newDocument.querySelector('h1')?.textContent).toBe('关于');
      expect(spyParse).not.toHaveBeenCalled();

      doc.dispatchEvent(Object.assign(new win.Event('astro:before-swap'), {
        from: ev1.from,
        to: ev1.to,
        direction: 'forward',
        navigationType: 'push',
        sourceElement: ev1.sourceElement,
        newDocument: ev1.newDocument,
        signal: ac1.signal,
      }));
      doc.dispatchEvent(new win.Event('astro:after-swap'));
      doc.dispatchEvent(new win.Event('astro:page-load'));
      await vi.advanceTimersByTimeAsync(60);

      // 再次回到 /about/ 仍从会话缓存直出（0 次新请求）并重新解析出干净文档
      const ac2 = new AbortController();
      const ev2 = Object.assign(new win.Event('astro:before-preparation', { cancelable: true }), {
        from: new URL('https://northcedar.top/'),
        to: new URL('https://northcedar.top/about/'),
        direction: 'forward',
        navigationType: 'push',
        sourceElement: doc.querySelector('[href="/about/"]'),
        newDocument: doc,
        signal: ac2.signal,
        loader: async () => {},
      });
      doc.dispatchEvent(ev2);
      const loader2 = (ev2.loader as () => Promise<void>)();
      await vi.advanceTimersByTimeAsync(300);
      await loader2;
      expect(fetchedUrls.filter((u) => u === 'https://northcedar.top/about/')).toHaveLength(1);
      expect(ev2.newDocument).not.toBe(ev1.newDocument);
      expect(ev2.newDocument.querySelector('h1')?.textContent).toBe('关于');
      expect(spyParse).toHaveBeenCalledTimes(1);

      // 取消进行中的跳转标记以恢复后台预取允许状态
      ac2.abort();

      // 3. IntersectionObserver 视口驻留 220ms：滑出即取消，停留满 220ms 才预取
      const vpLeave = doc.getElementById('vp-leave')!;
      const vpStay = doc.getElementById('vp-stay')!;
      const lastIo = ioInstances.at(-1)!;
      lastIo.cb([
        { target: vpLeave, isIntersecting: true } as unknown as IntersectionObserverEntry,
        { target: vpStay, isIntersecting: true } as unknown as IntersectionObserverEntry,
      ], {} as IntersectionObserver);
      await vi.advanceTimersByTimeAsync(100);
      lastIo.cb([
        { target: vpLeave, isIntersecting: false } as unknown as IntersectionObserverEntry,
      ], {} as IntersectionObserver);
      await vi.advanceTimersByTimeAsync(150);
      expect(fetchedUrls).not.toContain('https://northcedar.top/tags/');
      expect(fetchedUrls).toContain('https://northcedar.top/log/');
      htmlDeferred.get('https://northcedar.top/log/')?.(new Response(htmlOf('日志', 'log.css', 'log.js'), { status: 200, headers: { 'content-type': 'text/html' } }));
      for (let i = 0; i < 15; i++) await Promise.resolve();

      // 4. 开启 saveData 省流后不再触发视口或菜单后台预取
      navState.connection = { saveData: true };
      const countSaveDataBefore = fetchedUrls.length;
      lastIo.cb([{ target: vpLeave, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
      doc.querySelector('[data-nav-open]')!.dispatchEvent(new win.Event('click', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchedUrls).toHaveLength(countSaveDataBefore);
    } finally {
      await win.happyDOM.close();
    }
  });
});
