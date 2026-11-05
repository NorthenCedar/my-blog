
import { onPage } from './page-lifecycle';
onPage(({document, window, addEventListener}) => {
/**
 * 顶栏消息铃铛：访客收回复，站主收全站新留言与回复。
 * 打开即读仅作用于当前展示的消息；可翻到更早消息，失败不清未读。
 *
 * ⚠ 预算：本文件随 Base 的共享 <script> 进**每一页**，各页剩余预算很紧，
 * 见 tests/build-output.test.ts 与 tests/gallery-spiral.test.ts。所以：
 *   · 不许 import 任何东西（尤其 visitor-client：7.6 KB，会把相册页一起顶爆）；
 *   · 不许加动画/多余分支，DOM 一律 createElement/textContent，不碰 innerHTML。
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

/** 本地的 node 助手（≈80 字节），不 import visitor-client 的那一个 —— 理由见文件头。 */
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') => {
  const el = document.createElement(tag);
  el.className = cls;
  el.textContent = text;
  return el;
};

const stamp = (iso: string) => new Date(iso).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

const bell = document.querySelector<HTMLButtonElement>('[data-notices]');

if (bell) {
  const badge = bell.querySelector<HTMLElement>('[data-notices-count]');

  const panel = node('div', 'notices-panel');
  panel.hidden = true;
  const list = node('ul', 'notices-list');
  const empty = node('p', 'notices-empty');
  const more = node('button', 'notices-more', '更早消息');
  more.type = 'button';
  more.hidden = true;
  panel.append(list, empty, more);
  bell.closest('.topbar')?.append(panel);

  let items: Notice[] = [];
  let signedIn = false;
  let title = '';
  let nextBefore: number | null = null;
  let version = 0;

  const paint = (count: number) => {
    if (badge) {
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.hidden = count === 0;
    }
    /* 匿名访客不显示；**登录了就一直留着**——包括全部读完的时候：
       那时它是「打开历史回复列表」的唯一入口，收起来等于把人锁在外面。 */
    bell.hidden = !signedIn;
    bell.setAttribute('aria-label', count > 0 ? `${title}，${count} 条未读` : title);
  };

  const render = () => {
    list.replaceChildren(
      ...items.map((n) => {
        const li = node('li', n.readAt ? 'notice' : 'notice is-new');
        const link = node('a', 'notice-actor', n.actorName);
        // 跳到那条评论（回复永远是两层，锚在顶层评论上才看得见上下文）
        link.href = n.href;
        li.append(link, node('span', 'notice-time', `${n.label} · ${stamp(n.createdAt)}`), node('p', 'notice-body', n.excerpt));
        return li;
      })
    );
    empty.hidden = items.length > 0;
    more.hidden = !nextBefore;
  };

  const pull = async (before?: number) => {
    const started = ++version;
    try {
      const response = await fetch(`/api/notices${before ? `?before=${before}` : ''}`, { cache: 'no-store' });
      if (!response.ok) return false;
      const data = (await response.json()) as { unread: number; items: Notice[]; signedIn: boolean; title: string; emptyMessage: string; nextBefore: number | null };
      if (started !== version) return false;
      items = data.items;
      signedIn = data.signedIn;
      title = data.title;
      empty.textContent = data.emptyMessage;
      nextBefore = data.nextBefore;
      render();
      paint(data.unread);
      if (!signedIn) close();
      return true;
    } catch {
      return false;
    }
  };

  /** 只标刚展示的编号；等待后端确认，不误清分页外或请求期间新到的消息。 */
  const markVisibleRead = async () => {
    if (panel.hidden || !signedIn) return;
    const ids = items.filter((n) => !n.readAt).map((n) => n.id);
    if (!ids.length) return;
    const started = version;
    try {
      const response = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1' },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (started !== version) return;
      items = items.map((n) => ({ ...n, readAt: n.readAt ?? Date.now() }));
      render();
      paint(data.unread);
    } catch {
      /* 失败时保留未读，下次打开再试。 */
    }
  };

  const close = () => {
    panel.hidden = true;
    bell.setAttribute('aria-expanded', 'false');
  };

  const show = async (before?: number) => { if (await pull(before)) await markVisibleRead(); };
  bell.addEventListener('click', () => {
    if (!panel.hidden) return close();
    panel.hidden = false;
    bell.setAttribute('aria-expanded', 'true');
    void show();
  });
  more.addEventListener('click', () => {
    if (nextBefore) void show(nextBefore);
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

  /* 登录态在别处维护（评论表单里登录 / 登出、会话过期）。
     ⚠ 不 import visitor-client 去订阅：它 7.6 KB，会连累相册页与螺旋盘页的预算。
     够用的便宜办法 —— 回到这一页（含 bfcache 恢复）再拉一次。 */
  window.addEventListener('pageshow', () => void pull());
  void pull();
}

});
