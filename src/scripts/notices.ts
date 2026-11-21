
import { onPage } from './page-lifecycle';
onPage(({document, window}) => {
/**
 * 顶栏消息铃铛：访客收回复，站主收全站新留言与回复。
 * 打开即读仅作用于当前展示的消息；可翻到更早消息，失败不清未读。
 *
 * ⚠ 预算：本文件随 Base 的共享 <script> 进**每一页**，各页剩余预算很紧，
 * 见 tests/build-output.test.ts 与 tests/gallery-spiral.test.ts。所以：
 *   · 通过会话事件同步账户变化，避免引入访客账户界面及其依赖；
 *   · DOM 一律用 createElement/textContent，按文本显示消息内容。
 */
type Notice = {
  id: number;
  href: string;
  label: string;
  actorName: string;
  excerpt: string;
  createdAt: string;
  readAt: number | null;
};
type NoticePage = { unread: number; items: Notice[]; signedIn: boolean; title: string; emptyMessage: string; nextBefore: number | null };

/** 本地的 node 助手（≈80 字节），不 import visitor-client 的那一个 —— 理由见文件头。 */
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') => {
  const el = document.createElement(tag);
  el.className = cls;
  el.textContent = text;
  return el;
};

const stamp = (iso: string) => new Date(iso).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

function noticeHref(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, window.location.href);
    if ((url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === window.location.origin && !url.username && !url.password) return url.href;
  } catch { /* 无法解析的通知保留文字。 */ }
  return '';
}

const bell = document.querySelector<HTMLButtonElement>('[data-notices]');
const panel = document.querySelector<HTMLElement>('#notices-panel');

if (bell && panel) {
  const badge = bell.querySelector<HTMLElement>('[data-notices-count]');
  const defaultTitle = bell.getAttribute('aria-label') ?? '';
  const scroll = panel.querySelector<HTMLElement>('.notices-scroll')!;
  const list = panel.querySelector<HTMLElement>('.notices-list')!;
  const empty = panel.querySelector<HTMLElement>('.notices-empty')!;
  const more = panel.querySelector<HTMLButtonElement>('.notices-more')!;

  let page: NoticePage | undefined;
  // 翻页后已发出的已读提交可以完成，界面只接受当前这一页的响应。
  let version = 0;
  let requests = new AbortController();

  const paint = (count = 0) => {
    if (badge) {
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.hidden = count === 0;
    }
    /* 匿名访客不显示；**登录了就一直留着**——包括全部读完的时候：
       那时它是「打开历史回复列表」的唯一入口，收起来等于把人锁在外面。 */
    bell.hidden = !page;
    const title = page?.title ?? defaultTitle;
    bell.setAttribute('aria-label', count > 0 ? `${title}，${count} 条未读` : title);
  };

  const render = () => {
    const items = page?.items ?? [];
    list.replaceChildren(
      ...items.map((n) => {
        const li = node('li', n.readAt ? 'notice' : 'notice is-new');
        const href = noticeHref(n.href);
        const link = href ? node('a', 'notice-link') : null;
        if (href && link) {
          link.href = href;
          link.addEventListener('click', event => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            close();
            if (link.href === window.location.href) document.dispatchEvent(new Event('notice:follow'));
          });
        }
        const summary = link ?? node('span', 'notice-link');
        summary.append(node('span', 'notice-actor', n.actorName), node('span', 'notice-time', `${n.label} · ${stamp(n.createdAt)}`), node('span', 'notice-body', n.excerpt));
        li.append(summary);
        return li;
      })
    );
    empty.textContent = page?.emptyMessage ?? '';
    empty.hidden = items.length > 0;
    more.hidden = !page?.nextBefore;
  };

  const pull = async (before?: number, markRead = false) => {
    const signal = requests.signal;
    const started = ++version;
    const current = () => !signal.aborted && started === version;
    try {
      const response = await fetch(`/api/notices${before ? `?before=${before}` : ''}`, { cache: 'no-store', signal });
      if (!response.ok) return;
      const data = (await response.json()) as NoticePage;
      if (!current()) return;
      if (!data.signedIn) return reset();
      page = data;
      render();
      scroll.scrollTop = 0;
      paint(data.unread);

      // 只标本次实际展示的未读消息。
      if (!markRead || panel.hidden) return;
      const ids = data.items.filter(n => !n.readAt).map(n => n.id);
      if (!ids.length) return;
      const marked = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1' },
        body: JSON.stringify({ ids }),
        signal,
      });
      if (!current()) return;
      if (marked.status === 401) return reset();
      if (!marked.ok) return;
      const { unread } = await marked.json();
      if (!current()) return;
      for (const row of list.children) row.className = 'notice';
      paint(unread);
    } catch {
      /* 请求失败时保留已展示内容与未读状态。 */
    }
  };

  const close = () => {
    panel.hidden = true;
    bell.setAttribute('aria-expanded', 'false');
  };

  const reset = (refresh = false) => {
    requests.abort();
    page = undefined;
    close();
    render();
    paint();
    if (refresh) {
      requests = new AbortController();
      void pull();
    }
  };

  bell.addEventListener('click', () => {
    if (!page) return;
    if (!panel.hidden) return close();
    panel.hidden = false;
    bell.setAttribute('aria-expanded', 'true');
    void pull(undefined, true);
  });
  more.addEventListener('click', () => {
    const before = page?.nextBefore;
    if (before) void pull(before, true);
  });

  // 铃铛本身与其子节点已排除，无需延迟绑定文档监听。
  document.addEventListener('click', (e) => {
    const target = e.target as Node;
    if (!panel.hidden && !panel.contains(target) && !bell.contains(target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      close();
      bell.focus();
    }
  });

  window.addEventListener('visitor-session-change', (event) => reset((event as CustomEvent<boolean>).detail));
  window.addEventListener('visitor-session-expired', () => reset());
  window.addEventListener('storage', (event) => {
    if (event.key === 'nc-account-change' && event.newValue) reset(true);
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reset(true);
  });
  void pull();
  return () => requests.abort();
}

});
