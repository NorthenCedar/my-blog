// 评论：取列表 + 提交 + **回复**（2026-09-28 站主要求：像 QQ 动态那样能回复）。
// 全站第二个客户端脚本（第一个是代码复制）。
// 安全铁律：用户输入一律用 textContent 写进 DOM，**任何地方都不用 innerHTML**。

import { fmtTime, groupReplies, parentIdsOf, postComment, replyLi, toggleReplyForm, type Reply } from './reply-common';

const root = document.querySelector<HTMLElement>('[data-comments]');

if (root) {
  const slug = root.dataset.slug ?? '';
  const list = root.querySelector<HTMLOListElement>('[data-list]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const errorBox = root.querySelector<HTMLElement>('[data-error]')!;
  const form = root.querySelector<HTMLFormElement>('[data-form]')!;
  const submit = root.querySelector<HTMLButtonElement>('[data-submit]')!;

  type Comment = { id: number; name: string; body: string; createdAt: string };

  const showError = (msg: string) => {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  };
  const clearError = () => {
    errorBox.hidden = true;
  };

  /** 条数 = 顶层评论 + 所有回复（读者看到的"共几条"应该是屏幕上真实的行数） */
  const setCount = () => {
    const n = list.querySelectorAll('li').length;
    count.textContent = n > 0 ? ` ${n} 条` : '';
  };

  /**
   * 渲染一条评论。
   * 顺序（2026-09-27 站主："把新评论放上面，其他的评论留言也一样"）：
   *   · 从接口取回来的那一批：接口已按 `created_at DESC` 排好（新的在前）⇒ 这里按顺序 append 即可；
   *   · 刚发表的那条：必须 **prepend**，否则它会掉到列表最后（与"新的在上面"自相矛盾）。
   */
  /** 打开回复表单时要带的上下文（名字预填、发完之后重算条数）—— 具体交互在 reply-common 里 */
  const replyCtx = {
    slug,
    name: () => (form.elements.namedItem('name') as HTMLInputElement).value,
    onAdded: setCount,
  };

  const render = (c: Comment, fresh = false) => {
    const li = document.createElement('li');
    li.dataset.id = String(c.id);

    const name = document.createElement('span');
    name.className = 'comment-name';
    name.textContent = c.name;

    const time = document.createElement('time');
    time.className = 'comment-time';
    time.dateTime = c.createdAt;
    time.textContent = fmtTime(c.createdAt) + (fresh ? ' · 刚发表' : '');

    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = c.body; // ← 绝不用 innerHTML

    // 回复按钮 + 回复列表（空的先占位，取到回复后往里挂）
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reply-btn';
    btn.textContent = '回复';
    btn.addEventListener('click', () => toggleReplyForm(list, li, { ...replyCtx, parentId: c.id, replyTo: '' }));

    const replies = document.createElement('ul');
    replies.className = 'reply-list';

    li.append(name, time, body, btn, replies);
    if (fresh) list.prepend(li);
    else list.append(li);
    empty.hidden = true;
    list.hidden = false;
  };

  // 取列表
  fetch(`/api/comments?slug=${encodeURIComponent(slug)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: { comments: Comment[]; replies?: Reply[] }) => {
      const items = data.comments ?? [];
      for (const c of items) render(c);

      // 回复挂到各自顶层评论的下面（顺序由接口定：旧的在上）。
      // 孤儿回复（父评论掉出了 LIMIT 200）在 groupReplies 里被丢掉，这里拿不到 ⇒ 不会显示成孤儿。
      const grouped = groupReplies(data.replies ?? [], parentIdsOf(items));
      for (const c of items) {
        const li = list.querySelector<HTMLElement>(`li[data-id="${c.id}"]`)!;
        const box = li?.querySelector<HTMLElement>(':scope > .reply-list')!;
        for (const r of grouped.get(c.id) ?? []) {
          box.append(replyLi(r, () => toggleReplyForm(list, li, { ...replyCtx, parentId: c.id, replyTo: r.name })));
        }
      }
      setCount();
    })
    .catch(() => showError('留言没能加载出来。刷新页面再试一次。'));

  // 提交
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError();

    const data = new FormData(form);
    const payload = {
      slug,
      name: String(data.get('name') ?? ''),
      body: String(data.get('body') ?? ''),
      website: String(data.get('website') ?? ''), // 蜜罐
      parentId: 0, // 主表单发的永远是顶层评论；回复走 toggleReplyForm 里的分支
    };

    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');

    postComment(payload)
      .then((c) => {
        render(c, true);
        setCount();
        // 只清空留言框，**不清空名字** —— 同一个人可能想连着说几句
        (form.elements.namedItem('body') as HTMLTextAreaElement).value = '';
      })
      .catch((err: Error) => {
        // 失败时**保留用户已输入的内容**，绝不重置表单
        showError(err.message || '留言没提交成功。可能是网络问题，请稍后再试。');
      })
      .finally(() => {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      });
  });
}
