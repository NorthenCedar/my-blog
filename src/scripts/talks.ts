// 说说的点赞与评论。全站第三个客户端脚本（前两个：代码复制、文章/留言页评论）。
//
// 与 src/scripts/comments.ts 的区别（所以没有复用它）：
//   · 那边是「一个页面一个评论区」（`document.querySelector('[data-comments]')`，单例）；
//   · 这里是「一条说说一份」，页面上 N 个，且每个都带一个点赞按钮。
//
// 安全铁律同 comments.ts：**任何地方都不用 innerHTML**，用户输入一律 textContent。

type Comment = { id: number; name: string; body: string; createdAt: string };

const LIKE_STORE = 'nc-liked-talks';

/** 本地记住"我赞过哪些"（只是按钮观感；服务端另有同 IP 幂等，见 functions/api/likes.ts）。 */
const readLiked = (): string[] => {
  try {
    const raw = localStorage.getItem(LIKE_STORE);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const writeLiked = (list: string[]) => {
  try {
    localStorage.setItem(LIKE_STORE, JSON.stringify(list.slice(-200)));
  } catch {
    /* 隐私模式下写不进去就算了，不影响点赞本身 */
  }
};

const boxes = [...document.querySelectorAll<HTMLElement>('[data-comments-for]')];
const likeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-like]')];
if (boxes.length > 0 || likeButtons.length > 0) {
  const liked = new Set(readLiked());

  // ---------- 点赞 ----------
  // 先把已赞状态标上（不依赖网络），再批量取真实计数。
  for (const b of likeButtons) {
    if (liked.has(b.dataset.like ?? '')) b.setAttribute('aria-pressed', 'true');
  }

  const paint = (slug: string, n: number) => {
    const btn = likeButtons.find((b) => b.dataset.like === slug);
    const span = btn?.querySelector<HTMLElement>('[data-like-count]');
    if (span) span.textContent = String(n);
  };

  if (likeButtons.length > 0) {
    const slugs = likeButtons.map((b) => b.dataset.like ?? '').filter(Boolean);
    fetch(`/api/likes?slugs=${encodeURIComponent(slugs.join(','))}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('取赞数失败'))))
      .then((data: { likes?: Record<string, number> }) => {
        for (const [slug, n] of Object.entries(data.likes ?? {})) paint(slug, n);
      })
      .catch(() => {
        /* 计数取不到就留个「·」，不影响点 */
      });
  }

  for (const btn of likeButtons) {
    btn.addEventListener('click', () => {
      const slug = btn.dataset.like ?? '';
      if (!slug || btn.disabled) return;
      // 已经赞过：不再重复请求（服务端也幂等，这里只是省一次往返）
      if (liked.has(slug)) return;
      btn.disabled = true;
      fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
        .then(async (r) => {
          const body = (await r.json().catch(() => ({}))) as { count?: number; counted?: boolean };
          if (!r.ok) return Promise.reject(new Error('点赞没成功'));
          return body;
        })
        .then((body) => {
          paint(slug, body.count ?? 0);
          if (body.counted) {
            liked.add(slug);
            writeLiked([...liked]);
          }
          // counted=false 表示这个 IP 之前赞过（比如换了浏览器）—— 一样标成已赞，别让人反复点
          btn.setAttribute('aria-pressed', 'true');
        })
        .catch(() => {
          /* 失败就不标记，用户可以再点一次 */
        })
        .finally(() => {
          btn.disabled = false;
        });
    });
  }

  // ---------- 评论 ----------
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // 顺序（2026-09-27 站主："把新评论放上面，其他的评论留言也一样"）：
  // 接口按 created_at DESC 返回（新的在前）⇒ 取回来的那批按顺序 append；**刚发表的那条要 prepend**，
  // 否则它会掉到最下面，跟"新的在上面"自相矛盾。
  const render = (list: HTMLOListElement, c: Comment, fresh = false) => {
    const li = document.createElement('li');
    const meta = document.createElement('p');
    meta.className = 'cmeta';
    meta.textContent = `${c.name} · ${fmtTime(c.createdAt)}${fresh ? ' · 刚发表' : ''}`;
    const body = document.createElement('p');
    body.className = 'cbody';
    body.textContent = c.body;
    li.append(meta, body);
    if (fresh) list.prepend(li);
    else list.append(li);
  };

  const keyOf = (el: HTMLElement) => el.dataset.commentsFor ?? '';

  for (const box of boxes) {
    const slug = keyOf(box);
    const toggle = document.querySelector<HTMLButtonElement>(`[data-toggle="${CSS.escape(slug)}"]`);
    const list = box.querySelector<HTMLOListElement>('[data-list]')!;
    const empty = box.querySelector<HTMLElement>('[data-empty]')!;
    const errorBox = box.querySelector<HTMLElement>('[data-error]')!;
    const form = box.querySelector<HTMLFormElement>('[data-form]')!;
    const submit = box.querySelector<HTMLButtonElement>('[data-submit]')!;
    const countSpan = document.querySelector<HTMLElement>(`[data-count-for="${CSS.escape(slug)}"]`);
    let loaded = false;

    const setCount = () => {
      if (countSpan) countSpan.textContent = list.children.length > 0 ? ` ${list.children.length}` : '';
    };
    const showError = (msg: string) => {
      errorBox.textContent = msg;
      errorBox.hidden = false;
    };

    const load = () => {
      if (loaded) return;
      loaded = true;
      fetch(`/api/comments?slug=${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('取评论失败'))))
        .then((data: { comments?: Comment[] }) => {
          const items = data.comments ?? [];
          for (const c of items) render(list, c);
          empty.hidden = items.length > 0;
          setCount();
        })
        .catch(() => {
          showError('评论没加载出来，刷新试试。');
        });
    };

    toggle?.addEventListener('click', () => {
      const open = box.hidden;
      box.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) load();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      errorBox.hidden = true;
      const data = new FormData(form);
      const payload = {
        slug,
        name: String(data.get('name') ?? ''),
        body: String(data.get('body') ?? ''),
        website: String(data.get('website') ?? ''),
      };
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(async (r) => {
          const body = (await r.json().catch(() => ({}))) as { comment?: Comment; error?: string };
          if (!r.ok) return Promise.reject(new Error(body.error || '发表失败'));
          return body;
        })
        .then((body) => {
          if (body.comment) {
            render(list, body.comment, true); // fresh ⇒ prepend（新的在最上面）
            empty.hidden = true;
            setCount();
          }
          (form.elements.namedItem('body') as HTMLTextAreaElement).value = '';
        })
        .catch((err: Error) => {
          showError(err.message || '评论没发出去，稍后再试。');
        })
        .finally(() => {
          submit.disabled = false;
          submit.removeAttribute('aria-busy');
        });
    });
  }
}
