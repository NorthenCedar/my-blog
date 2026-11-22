// 即时两段式换页动画、同源内存预取与长文章代码块分片渲染回归测试
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
      <div class="pt-status" role="status"></div>
      <main><a id="post-link" href="/posts/my-c-note/">C 语言笔记</a>
      <a id="skip-link" href="/talks/" data-astro-prefetch="false">跳过预取</a>
      <a id="ext-link" href="https://example.com/">外链</a>
      <a id="asset-link" href="/rss.xml">RSS</a></main>
    `;

    const fetched: { url: string; headers?: Record<string, string>; priority?: string }[] = [];
    let resolveHtml!: (res: Response) => void;
    const htmlPromise = new Promise<Response>((r) => { resolveHtml = r; });

    const targetHtml = `<!doctype html><html><head>
      <meta name="astro-view-transitions-enabled" content="true">
      <link rel="stylesheet" href="/_astro/shared.css">
      <link rel="stylesheet" href="/_astro/post-extra.css">
    </head><body><main><p>文章内容</p></main></body></html>`;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit & { priority?: string }) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetched.push({
        url,
        headers: init?.headers as Record<string, string> | undefined,
        priority: init?.priority,
      });
      if (url.endsWith('/posts/my-c-note/')) return htmlPromise;
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

      // 超过 420ms 未完成时，等待状态文案出现
      vi.advanceTimersByTime(450);
      expect(doc.querySelector('.pt-status')?.textContent).toContain('正在打开页面');

      // 返回 HTML 响应并让异步 DOM 解析、waitStyles 创建 preload 节点就位
      resolveHtml(new Response(targetHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
      for (let i = 0; i < 40 && doc.head.querySelectorAll('link[rel="preload"][as="style"]').length === 0; i++) {
        await Promise.resolve();
      }

      // 预取成功应后台预热目标页额外样式表，且 waitStyles 创建的 preload 节点触发 load 后结束加载
      expect(fetched.some((x) => x.url.endsWith('/_astro/post-extra.css'))).toBe(true);
      const preloads = doc.head.querySelectorAll('link[rel="preload"][as="style"]');
      expect(preloads.length).toBe(1);
      for (const preload of preloads) {
        preload.dispatchEvent(new win.Event('load'));
      }
      await loadDone;

      expect(prepEvent.newDocument).not.toBe(doc);
      expect(prepEvent.newDocument.querySelector('main p')?.textContent).toBe('文章内容');

      // 5. astro:before-swap 将暗色主题与 pt-reveal 同步到新文档根元素，防止白闪
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
      expect(prepEvent.newDocument.documentElement.classList.contains('pt-reveal')).toBe(true);

      // 6. astro:after-swap 清空提示并挂 pt-reveal；仅在揭幕动画实际开播后按 REVEAL_MS 收尾（防慢机主线程卡顿跳过动画）
      doc.dispatchEvent(new win.Event('astro:after-swap'));
      expect(doc.querySelector('.pt-status')?.textContent).toBe('');
      expect(doc.documentElement.classList.contains('pt-reveal')).toBe(true);
      expect(doc.documentElement.classList.contains('pt-cover')).toBe(false);

      vi.advanceTimersByTime(400);
      expect(doc.documentElement.classList.contains('pt-reveal')).toBe(true);

      doc.dispatchEvent(Object.assign(new win.Event('animationstart'), { animationName: 'pt-ink-out' }));
      vi.advanceTimersByTime(550);
      expect(doc.documentElement.classList.contains('pt-on')).toBe(false);
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
    doc.body.innerHTML = '<div class="pt-status"></div><main><a id="a" href="/talks/">说说</a></main>';

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
});
