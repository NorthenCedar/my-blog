import { fmtTime, groupReplies, parentIdsOf, postComment, replyLi, toggleReplyForm, type Reply } from './reply-common';
import { authorNode, identityControls, node, type Authored } from './visitor-client';
import { onPage } from './page-lifecycle';
onPage(({document, addEventListener}) => {
// 说说的点赞与评论。全站第三个客户端脚本（前两个：代码复制、文章/留言页评论）。
//
// 与 src/scripts/comments.ts 的区别（所以没有复用它）：
//   · 那边是「一个页面一个评论区」（`document.querySelector('[data-comments]')`，单例）；
//   · 这里是「一条说说一份」，页面上 N 个，且每个都带一个点赞按钮。
//   两边**共用** src/scripts/reply-common.ts 的回复渲染与表单 ⇒ 三处回复的观感与规则完全一致。
//
// 安全铁律同 comments.ts：**任何地方都不用 innerHTML**，用户输入一律 textContent。
type Comment = Authored & { body: string; createdAt: string };

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
    // 条数要在**点开之前**就显示出来 ⇒ 先把每个「怎么把数字写回去」的函数记下来，进页面后一次性去问（见本块末尾）
    const countPaints = new Map<string, (n: number) => void>();
    /** 已经拉过完整评论的（用户点开过）：这批的条数以列表真实行数为准，批量结果不许覆盖 */
    const pulled = new Set<string>();
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
  // 顺序（2026-09-27 站主："把新评论放上面，其他的评论留言也一样"）：
  // 接口按 created_at DESC 返回（新的在前）⇒ 取回来的那批按顺序 append；**刚发表的那条要 prepend**，
  // 否则它会掉到最下面，跟"新的在上面"自相矛盾。
  // 第 4 个参数 openReply 由每个评论区自己传进来（点「回复」要打开它**自己**那份表单）。
  const render = (
    list: HTMLOListElement,
    c: Comment,
    fresh = false,
    openReply?: (li: HTMLElement, parentId: number, replyTo: string, target?: { kind: 'comment' | 'reply'; id: number }) => void
  ) => {
    if (list.querySelector(`:scope > li[data-id="${c.id}"]`)) return;
    const li = node('li');
    li.id = `comment-${c.id}`; // 提醒面板跳过来的锚点（2026-10-18）
    li.dataset.id = String(c.id);
    const meta = node('p', 'cmeta');
    meta.append(authorNode(c), document.createTextNode(` · ${fmtTime(c.createdAt)}${fresh ? ' · 刚发表' : ''}`));
    const body = node('p', 'cbody', c.body);
    li.append(meta, body);

    if (openReply) {
      const btn = node('button', 'reply-btn', '回复');
      btn.type = 'button';
      btn.addEventListener('click', () => openReply(li, c.id, ''));
      const rl = node('ul', 'reply-list');
      li.append(btn, rl);
    }

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
    identityControls(form);
    const countSpan = document.querySelector<HTMLElement>(`[data-count-for="${CSS.escape(slug)}"]`);
    let loaded = false;
    let loading = false;
    const retry = node('button', 'reply-btn', '重试加载评论');
    retry.type = 'button';
    retry.dataset.commentRetry = '';
    retry.hidden = true;
    errorBox.after(retry);

    /** 按钮上的数字： > 0 才显示（一条都没有时按钮就写"评论"两个字） */
    const paintCount = (n: number) => {
      if (countSpan) countSpan.textContent = n > 0 ? ` ${n}` : '';
    };
    countPaints.set(slug, paintCount);

    /** 条数含回复（跟文章页一个口径：屏幕上真实有几行就是几条） */
    const setCount = () => {
      const n = list.querySelectorAll('li').length;
      paintCount(n);
    };

    /** 打开回复表单的上下文（名字预填、发完重算条数）—— 交互本身在 reply-common 里，三处共用 */
    const openReply = (li: HTMLElement, parentId: number, replyTo: string, target?: { kind: 'comment' | 'reply'; id: number }) =>
      toggleReplyForm(list, li, {
        slug,
        parentId,
        replyTo,
        target: target ?? { kind: 'comment', id: parentId },
        name: () => (form.elements.namedItem('name') as HTMLInputElement).value,
        onAdded: setCount,
      });
    const showError = (msg: string) => {
      errorBox.textContent = msg;
      errorBox.hidden = false;
    };

    const load = () => {
      if (loaded || loading) return;
      loading = true;
      errorBox.hidden = true;
      retry.hidden = true;
      pulled.add(slug); // 自己会给 setCount 数一遍，别让批量回来的旧结果覆盖它
      fetch(`/api/comments?slug=${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('取评论失败'))))
        .then((data: { comments?: Comment[]; replies?: Reply[] }) => {
          loaded = true;
          const items = data.comments ?? [];
          for (const c of items) render(list, c, false, openReply);

          // 回复挂到各自顶层评论下（顺序由接口定：旧的在上）；孤儿回复已被 groupReplies 丢掉
          const grouped = groupReplies(data.replies ?? [], parentIdsOf(items));
          for (const c of items) {
            const li = list.querySelector<HTMLElement>(`li[data-id="${c.id}"]`)!;
            const box2 = li?.querySelector<HTMLElement>(':scope > .reply-list')!;
            for (const r of grouped.get(c.id) ?? []) {
              if (box2.querySelector(`:scope > li[data-reply-id="${r.id}"]`)) continue;
              box2.append(replyLi(r, () => openReply(li, c.id, r.name, { kind: 'reply', id: r.id })));
            }
          }
          empty.hidden = list.childElementCount > 0;
          setCount();
        })
        .catch(() => {
          showError('评论没加载出来，可以重试。已输入的内容会保留。');
          retry.hidden = false;
        })
        .finally(() => { loading = false; });
    };
    retry.addEventListener('click', load);

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
        identity: String(data.get('identity') ?? 'anonymous'),
        body: String(data.get('body') ?? ''),
        website: String(data.get('website') ?? ''),
        parentId: 0, // 主表单永远发顶层评论；回复走 toggleReplyForm
      };
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      postComment(payload)
        .then((c) => {
          render(list, c, true, openReply); // fresh ⇒ prepend（新的在最上面）
          empty.hidden = true;
          setCount();
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

  // ---------- 评论数：进页面就显示，不等点 ----------
  // 事故（2026-09-28 站主报的 bug）：条数原本只在 load() 里算，而 load() 挂在「评论」按钮的 click 上
  // ⇒ 不点开就是空的数字。修法是这里**批量**问一次 `/api/comments?slugs=…`（一个请求取齐整页），
  // 口径与 load() 一致：含回复 —— 后端 UNION ALL 把 comments + replies 一起数。
  // 失败就什么都不显示（跟赞数取不到时留「·」一个道理：数字是锦上添花，不是页面本体）。
  const asked = [...countPaints.keys()].filter(Boolean);
  if (asked.length > 0) {
    fetch(`/api/comments?slugs=${encodeURIComponent(asked.join(','))}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('取评论数失败'))))
      .then((data: { counts?: Record<string, number> }) => {
        for (const [slug, n] of Object.entries(data.counts ?? {})) {
          // 用户在结果回来之前就点开了 ⇒ 那边的行数是真的，别拿这个盖掉
          if (!pulled.has(slug)) countPaints.get(slug)?.(n);
        }
      })
      .catch(() => {
        /* 数字取不到就算了 */
      });
  }
}

});
