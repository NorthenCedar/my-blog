import { fmtTime, groupReplies, parentIdsOf, postComment, replyLi, toggleReplyForm, type Reply } from './reply-common';
import { authorNode, identityControls, node, type Authored } from './visitor-client';
import { onPage } from './page-lifecycle';
// 说说每条有自己的评论区，回复渲染和表单与文章、留言共用。
type Comment = Authored & { body: string; createdAt: string };

onPage(({ document, window }) => {
  const boxes = [...document.querySelectorAll<HTMLElement>('[data-comments-for]')];
  if (!boxes.length) return;

  // 列表打开前显示批量计数，打开后以实际加载的条数为准。
  const countPaints = new Map<string, (n: number) => void>();
  const pulled = new Set<string>();

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
    const results = box.querySelector<HTMLElement>('[data-comment-results]')!;
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

    const matchesNotice = () => location.hash === `#${box.id}`;
    const focusComment = () => {
      if (!matchesNotice() || !box.hasAttribute('data-open')) return;
      const params = new URLSearchParams(location.search);
      const target = [params.get('reply') && `reply-${params.get('reply')}`, `comment-${params.get('comment')}`]
        .map(id => id ? document.getElementById(id) : null).find(el => el && box.contains(el));
      (target ?? box).scrollIntoView({ block: 'center' });
    };

    const load = () => {
      if (loaded || loading) return;
      loading = true;
      errorBox.hidden = true;
      retry.hidden = true;
      pulled.add(slug); // 自己会给 setCount 数一遍，别让批量回来的旧结果覆盖它
      const rawParent = matchesNotice() ? new URLSearchParams(location.search).get('comment') : null;
      const parent = rawParent && /^[1-9]\d{0,15}$/.test(rawParent) ? rawParent : null;
      fetch(`/api/comments?slug=${encodeURIComponent(slug)}${parent ? `&comment=${encodeURIComponent(parent)}` : ''}`)
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
          results.dataset.open = '';
          setCount();
          if (matchesNotice()) window.requestAnimationFrame(focusComment);
        })
        .catch(() => {
          showError('评论没加载出来，可以重试。已输入的内容会保留。');
          retry.hidden = false;
        })
        .finally(() => { loading = false; });
    };
    retry.addEventListener('click', load);

    const setOpen = (open: boolean) => {
      box.toggleAttribute('data-open', open);
      box.inert = !open;
      box.setAttribute('aria-hidden', String(!open));
      toggle?.setAttribute('aria-expanded', String(open));
      if (open) load();
    };
    toggle?.addEventListener('click', () => {
      box.removeAttribute('data-comment-jump');
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    const openFromNotice = () => {
      if (!matchesNotice()) return;
      box.setAttribute('data-comment-jump', '');
      setOpen(true);
      window.requestAnimationFrame(focusComment);
    };
    window.addEventListener('hashchange', openFromNotice);
    document.addEventListener('notice:follow', openFromNotice);
    openFromNotice();

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
          results.dataset.open = '';
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
}, '[data-comments-for]');
