/**
 * 顶栏那枚铃铛：别人回复了我，这里亮起来（2026-10-18 站主要求）。
 *
 * 只做一件事：有未读就显示铃铛 + 角标，点开是「回复我的」列表，点条目跳到原文那条评论。
 * 没登录、没人回复过、接口抖动 —— 三种情况都**什么都不显示**（后端对匿名回的是
 * 200 + 空列表，不是 401）⇒ 提醒是附加物，不该在任何页面上变成一条错误提示。
 *
 * ⚠ 预算：本文件随 Base 的共享 <script> 进**每一页**（文章页只剩 440 字节余量、螺旋盘只剩
 * 34 —— 见 tests/build-output.test.ts 与 tests/gallery-spiral.test.ts 里那几条）。所以：
 *   · 不许 import 任何东西（尤其 visitor-client：7.6 KB，会把相册页一起顶爆）；
 *   · 不许加动画/多余分支，DOM 一律 createElement/textContent，不碰 innerHTML。
 */
type Notice = {
  id: number;
  slug: string;
  parentId: number;
  actorName: string;
  excerpt: string;
  createdAt: string;
  readAt: number | null;
};

/** 本地的 node 助手（≈80 字节），不 import visitor-client 的那一个 —— 理由见文件头。 */
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};

/**
 * 跳到哪一条：文章 / 留言板用 `#comment-N` 锚点（comments.ts 给每条评论挂了 id）；
 * 说说页的评论区默认是折叠的（`section.cbox` 隐藏，点「评论」才展开），
 * 所以那边落到那条说说的 `#c-<slug>` 上更实用 —— 至少人就在对的地方。
 */
const hrefOf = (n: Notice) =>
  n.slug === 'guestbook'
    ? `/guestbook/#comment-${n.parentId}`
    : n.slug.startsWith('talk-')
      ? `/talks/#c-${n.slug}`
      : `/posts/${n.slug}/#comment-${n.parentId}`;

const stamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const bell = document.querySelector<HTMLButtonElement>('[data-notices]');

if (bell) {
  const badge = bell.querySelector<HTMLElement>('[data-notices-count]');
  const host = bell.closest<HTMLElement>('.topbar') ?? bell.parentElement;

  const panel = node('div', 'notices-panel');
  panel.hidden = true;
  const list = node('ul', 'notices-list');
  const empty = node('p', 'notices-empty', '还没有人回复你。');
  panel.append(list, empty);
  host?.append(panel);

  let items: Notice[] = [];
  let signedIn = false;

  const paint = (count: number) => {
    if (badge) {
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.hidden = count === 0;
    }
    /* 匿名访客不显示；**登录了就一直留着**——包括全部读完的时候：
       那时它是「打开历史回复列表」的唯一入口，收起来等于把人锁在外面。 */
    bell.hidden = !signedIn;
    bell.setAttribute('aria-label', count > 0 ? `回复提醒，${count} 条未读` : '回复提醒');
  };

  const render = () => {
    list.replaceChildren(
      ...items.map((n) => {
        const li = node('li', n.readAt ? 'notice' : 'notice is-new');
        const link = node('a', 'notice-actor', n.actorName);
        // 跳到那条评论（回复永远是两层，锚在顶层评论上才看得见上下文）
        link.href = hrefOf(n);
        li.append(link, node('span', 'notice-time', stamp(n.createdAt)), node('p', 'notice-body', n.excerpt));
        return li;
      })
    );
    empty.hidden = items.length > 0;
  };

  const pull = async () => {
    try {
      const response = await fetch('/api/notices', { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { unread?: number; items?: Notice[]; signedIn?: boolean };
      items = data.items ?? [];
      signedIn = data.signedIn === true;
      render();
      paint(data.unread ?? 0);
    } catch {
      /* 网络抖动就算了，下次进来再拉 */
    }
  };

  /** 标已读 = 后端全部已读 + 本地把这些行降级成「已读」，角标归零。
      语义由站主 2026-10-18 定为「打开就算读过」：点开铃铛即清零。
      先 pull 再标 —— 列表还没到手时清除的是空集合，角标会白清一次。 */
  const markAllRead = async () => {
    if (!items.some((n) => !n.readAt)) return;
    items = items.map((n) => (n.readAt ? n : { ...n, readAt: Date.now() }));
    render();
    // 角标归零，但登录着的话铃铛本体要留着当锚点
    paint(0);
    try {
      await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1' },
        body: '{}',
      });
    } catch {
      /* 标不上就下次再标：本地已经当作读过了，不打扰人 */
    }
  };

  const close = () => {
    panel.hidden = true;
    bell.setAttribute('aria-expanded', 'false');
    bell.hidden = !signedIn;
  };

  bell.addEventListener('click', () => {
    const opened = panel.hidden;
    panel.hidden = !opened;
    bell.setAttribute('aria-expanded', String(opened));
    if (!opened) return close();
    // 打开就算读过：先拿到列表，再一并标掉，角标与圆点同时归零
    void pull().then(markAllRead);
  });

  /* ⚠ 「点外面关掉」必须延到下一个 tick 再挂：否则铃铛这次点击会继续冒泡到 document，
     面板刚开就被自己关掉。 */
  setTimeout(
    () =>
      document.addEventListener('click', (e) => {
        const target = e.target as Node;
        if (!panel.hidden && !panel.contains(target) && !bell.contains(target)) close();
      }),
    0
  );
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