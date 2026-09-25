// 评论：取列表 + 提交。全站第二个客户端脚本（第一个是代码复制）。
// 安全铁律：用户输入一律用 textContent 写进 DOM，**任何地方都不用 innerHTML**。

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

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const setCount = () => {
    const n = list.children.length;
    count.textContent = n > 0 ? ` ${n} 条` : '';
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
    time.textContent = formatTime(c.createdAt) + (fresh ? ' · 刚发表' : '');

    const body = document.createElement('p');
    body.className = 'comment-body';
    body.textContent = c.body; // ← 绝不用 innerHTML

    li.append(name, time, body);
    list.append(li);
    empty.hidden = true;
    list.hidden = false;
  };

  // 取列表
  fetch(`/api/comments?slug=${encodeURIComponent(slug)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: { comments: Comment[] }) => {
      data.comments.forEach((c) => render(c));
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
    };

    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');

    fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) return Promise.reject(new Error(body.error || '提交失败'));
        return body;
      })
      .then((body: { comment: Comment }) => {
        render(body.comment, true);
        setCount();
        // 只清空留言框，**不清空名字** —— 同一个人可能想连着说几句
        (form.elements.namedItem('body') as HTMLTextAreaElement).value = '';
      })
      .catch((err: Error) => {
        // 失败时**保留用户已输入的内容**，绝不重置表单
        showError(
          err.message && err.message !== '提交失败'
            ? err.message
            : '留言没提交成功。可能是网络问题，请稍后再试。'
        );
      })
      .finally(() => {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      });
  });
}
