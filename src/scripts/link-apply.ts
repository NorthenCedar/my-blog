import { onPage } from './page-lifecycle';

type LinkApplication = {
  id: number;
  name: string;
  href: string;
  desc: string;
  avatar: string;
  createdAt: string;
};

const DEFAULT_AVATAR = '/avatars/helix.svg';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
};

const safeWebHref = (raw: string) => {
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password ? u.href : '';
  } catch {
    return '';
  }
};

const fmtDate = (iso: string) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? iso : t.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
};

onPage(({ document, window }) => {
  const form = document.querySelector<HTMLFormElement>('[data-link-apply-form]');
  if (!form) return;

  // 1. 友链头像加载失败回退默认头像（符合 CSP script-src-attr 'none'）。
  const fallbackImg = (img: HTMLImageElement) => {
    const target = img.dataset.avatarFallback || DEFAULT_AVATAR;
    if (img.dataset.fallbackDone === '1') return;
    img.dataset.fallbackDone = '1';
    img.src = target;
  };
  for (const img of document.querySelectorAll<HTMLImageElement>('img[data-avatar-fallback]')) {
    if (img.loading !== 'lazy' && img.complete && img.naturalWidth === 0) fallbackImg(img);
    else img.addEventListener('error', () => fallbackImg(img), { once: true });
  }

  // 2. 复制本站头像链接按钮。
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-copy-avatar]')) {
    const raw = btn.dataset.copyAvatar ?? '';
    const originText = btn.textContent ?? '复制头像链接';
    btn.addEventListener('click', async () => {
      if (!raw) return;
      try {
        await navigator.clipboard.writeText(raw);
        btn.textContent = '已复制链接';
      } catch {
        btn.textContent = raw;
      }
      window.setTimeout(() => {
        btn.textContent = originText;
      }, 2000);
    });
  }

  // 3. 友链申请表单提交。
  const statusBox = document.querySelector<HTMLElement>('[data-link-apply-status]');
  const submit = form.querySelector<HTMLButtonElement>('[data-link-apply-submit]');
  const showStatus = (msg: string, isError = false) => {
    if (!statusBox) return;
    statusBox.textContent = msg;
    statusBox.dataset.error = isError ? '1' : '';
    statusBox.hidden = !msg;
  };

  let submitting = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    showStatus('');
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get('name') ?? '').trim(),
      href: String(fd.get('href') ?? '').trim(),
      desc: String(fd.get('desc') ?? '').trim(),
      avatar: String(fd.get('avatar') ?? '').trim(),
      website: String(fd.get('website') ?? ''),
    };
    if (!payload.name) return showStatus('请填写站点名称', true);
    if (!payload.href || !safeWebHref(payload.href)) {
      return showStatus('网站链接请填写有效的 http:// 或 https:// 网址', true);
    }
    if (!payload.desc) return showStatus('请填写一句话描述', true);
    if (payload.desc.length > 15) return showStatus('一句话描述不能超过 15 字', true);
    if (payload.avatar && !safeWebHref(payload.avatar)) {
      return showStatus('头像链接请填写有效的 http:// 或 https:// 网址，或留空使用默认头像', true);
    }

    submitting = true;
    if (submit) {
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
    }
    try {
      const res = await fetch('/api/link-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || '提交失败，请稍后再试');
      form.reset();
      showStatus('申请已提交，站主会通过站内消息收到你的友链申请！');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : '提交失败，请稍后再试', true);
    } finally {
      submitting = false;
      if (submit) {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
      }
    }
  });

  // 4. 站主申请收件箱与详情弹窗（点击小铃铛通知 /links/?application=<id> 打开）。
  const inbox = document.querySelector<HTMLElement>('[data-link-inbox]');
  if (!inbox) return;

  const openDetail = (item: LinkApplication, onDeleted: (id: number) => void) => {
    document.querySelector('.apply-dialog')?.remove();
    const dialog = el('dialog', 'apply-dialog');
    const closeBtn = el('button', 'apply-dialog-close', '关闭');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => dialog.close());
    const heading = el('h3', '', `友链申请 · ${item.name}`);

    const avatarUrl = safeWebHref(item.avatar) || DEFAULT_AVATAR;
    const head = el('div', 'apply-dialog-head');
    const img = el('img', 'apply-dialog-avatar');
    img.src = avatarUrl;
    img.alt = '';
    img.width = 56;
    img.height = 56;
    img.addEventListener('error', () => {
      if (!img.src.endsWith(DEFAULT_AVATAR)) img.src = DEFAULT_AVATAR;
    }, { once: true });
    const titleBox = el('div');
    titleBox.append(el('strong', '', item.name), el('p', 'apply-dialog-time', `提交时间：${fmtDate(item.createdAt)}`));
    head.append(img, titleBox);

    const dl = el('dl', 'apply-dialog-meta');
    const addRow = (k: string, nodeVal: string | HTMLElement) => {
      dl.append(el('dt', '', k));
      const dd = el('dd');
      if (typeof nodeVal === 'string') dd.textContent = nodeVal;
      else dd.append(nodeVal);
      dl.append(dd);
    };

    const hrefSafe = safeWebHref(item.href);
    if (hrefSafe) {
      const a = el('a', '', item.href);
      a.href = hrefSafe;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      addRow('网站链接', a);
    } else {
      addRow('网站链接', item.href);
    }
    addRow('一句话描述', item.desc);
    addRow('头像链接', item.avatar || '未填写（使用默认头像）');

    const actions = el('div', 'apply-dialog-actions');
    const copyBtn = el('button', 'mine-btn mine-btn-ghost', '复制友链信息');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', async () => {
      const text = `名称：${item.name}\n链接：${item.href}\n描述：${item.desc}${item.avatar ? `\n头像：${item.avatar}` : ''}`;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = '已复制';
      } catch {
        copyBtn.textContent = '复制失败';
      }
      window.setTimeout(() => { copyBtn.textContent = '复制友链信息'; }, 1800);
    });

    const delBtn = el('button', 'mine-btn apply-danger', '删除此申请');
    delBtn.type = 'button';
    const msg = el('p', 'apply-status');
    msg.hidden = true;
    delBtn.addEventListener('click', async () => {
      delBtn.disabled = true;
      try {
        const res = await fetch('/api/link-apply', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1' },
          body: JSON.stringify({ id: item.id }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || '删除失败');
        }
        dialog.close();
        onDeleted(item.id);
      } catch (err) {
        msg.textContent = err instanceof Error ? err.message : '删除失败';
        msg.dataset.error = '1';
        msg.hidden = false;
        delBtn.disabled = false;
      }
    });

    actions.append(copyBtn, delBtn);
    dialog.append(closeBtn, heading, head, dl, msg, actions);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  };

  let items: LinkApplication[] = [];
  const renderInbox = () => {
    inbox.replaceChildren();
    if (!items.length) {
      inbox.hidden = true;
      return;
    }
    inbox.hidden = false;
    const head = el('p', 'apply-inbox-title', `站主收件箱 · 共 ${items.length} 条友链申请（点击可查看详情）`);
    const list = el('ul', 'apply-inbox-list');
    for (const item of items) {
      const li = el('li');
      const btn = el('button', 'apply-inbox-item');
      btn.type = 'button';
      btn.append(
        el('strong', '', item.name),
        el('span', 'apply-inbox-desc', `${item.desc} · ${item.href}`),
        el('span', 'apply-inbox-time', fmtDate(item.createdAt)),
      );
      btn.addEventListener('click', () => {
        openDetail(item, (deletedId) => {
          items = items.filter((x) => x.id !== deletedId);
          renderInbox();
        });
      });
      li.append(btn);
      list.append(li);
    }
    inbox.append(head, list);
  };

  const loadOwnerApplications = async () => {
    const requestedRaw = new URLSearchParams(window.location.search).get('application');
    const requestedId = requestedRaw && /^[1-9]\d{0,15}$/.test(requestedRaw) ? Number(requestedRaw) : 0;
    try {
      const res = await fetch('/api/link-apply', { cache: 'no-store' });
      if (!res.ok) {
        inbox.hidden = true;
        return;
      }
      const data = (await res.json()) as { items?: LinkApplication[] };
      items = data.items ?? [];
      renderInbox();

      if (requestedId > 0) {
        let target = items.find((x) => x.id === requestedId);
        if (!target) {
          const single = await fetch(`/api/link-apply?id=${requestedId}`, { cache: 'no-store' });
          if (single.ok) target = ((await single.json()) as { item?: LinkApplication }).item;
        }
        if (target) {
          openDetail(target, (deletedId) => {
            items = items.filter((x) => x.id !== deletedId);
            renderInbox();
          });
        }
      }
    } catch {
      /* 普通访客或网络波动时静默忽略 */
    }
  };

  const onSessionChange = () => void loadOwnerApplications();
  window.addEventListener('visitor-session-change', onSessionChange);
  document.addEventListener('notice:follow', onSessionChange);
  void loadOwnerApplications();
  return () => {
    window.removeEventListener('visitor-session-change', onSessionChange);
    document.removeEventListener('notice:follow', onSessionChange);
  };
}, '[data-link-apply-form]');
