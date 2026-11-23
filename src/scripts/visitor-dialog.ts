import { accountRequest, node, portrait, setViewer, type Visitor } from './visitor-client';

function modal(title: string) {
  const dialog = node('dialog', 'visitor-dialog music-glass');
  const heading = node('h2', '', title); heading.id = `visitor-${crypto.randomUUID()}`; dialog.setAttribute('aria-labelledby', heading.id);
  const close = node('button', 'visitor-close', '关闭'); close.type = 'button'; close.addEventListener('click', () => dialog.close());
  dialog.append(close, heading); document.body.append(dialog);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal(); return dialog;
}
export function recoveryPanel(code: string, username: string) {
  const box = node('section', 'visitor-recovery');
  box.append(node('h3', '', '保存这份恢复码'), node('p', '', '忘记密码时，使用账号和恢复码重设密码。密码和恢复码都丢失，就无法可靠找回。恢复码仅在这里显示，请妥善保管。'));
  const output = node('code', 'visitor-recovery-code', code); output.tabIndex = 0;
  const download = node('button', 'visitor-secondary', '下载恢复码'); download.type = 'button';
  download.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([`本站账户恢复码\n账号：${username}\n恢复码：${code}\n请勿向他人提供。使用后旧恢复码失效。\n`], { type: 'text/plain;charset=utf-8' }));
    const link = node('a'); link.href = url; link.download = '账户恢复码.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  box.append(output, download); return box;
}
export async function openLogin() {
  if (document.querySelector('.visitor-dialog[open]')) return;
  const dialog = modal('留下一个熟悉的身份');
  dialog.append(node('p', 'visitor-hint', '登录是可选的。关闭窗口，仍可继续匿名留言。'));
  const tabs = node('div', 'visitor-tabs');
  const body = node('div'); dialog.append(tabs, body);
  const renderBindEmail = (user: Visitor) => {
    tabs.hidden = true;
    const heading = dialog.querySelector('h2');
    if (heading) heading.textContent = '补充通知邮箱';
    body.replaceChildren();
    body.append(node('p', 'visitor-hint', '老账户首次登录请补充邮箱，有人回复你时将通过邮件及时通知。'));
    const form = node('form', 'visitor-form');
    const wrap = node('label', '', '邮箱（请仔细检查是否填写正确）');
    const input = node('input');
    input.name = 'email'; input.type = 'email'; input.autocomplete = 'email';
    input.required = true; input.maxLength = 254;
    input.placeholder = '请检查是否填写正确，否则不能及时收到回复';
    wrap.append(input);
    const error = node('p', 'visitor-error'); error.setAttribute('role', 'alert'); error.hidden = true;
    const save = node('button', 'visitor-primary', '保存并继续'); save.type = 'submit';
    form.append(wrap, error, save);
    body.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault(); error.hidden = true; save.disabled = true; save.setAttribute('aria-busy', 'true');
      try {
        const updated = await accountRequest('email', { email: input.value });
        setViewer(updated.user ?? user);
        dialog.close();
      } catch (reason) {
        error.textContent = reason instanceof Error ? reason.message : '保存邮箱失败，请稍后重试';
        error.hidden = false;
      } finally {
        save.disabled = false; save.removeAttribute('aria-busy');
      }
    });
  };
  const render = (mode: 'login' | 'register' | 'recover') => {
    tabs.hidden = false;
    body.replaceChildren();
    tabs.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
    const form = node('form', 'visitor-form');
    const fields: Record<string, HTMLInputElement> = {};
    const field = (key: string, label: string, type: string, auto: string) => {
      const wrap = node('label', '', label); const input = node('input'); input.name = key; input.type = type; input.autocomplete = auto as AutoFill; input.required = true;
      input.maxLength = key === 'username' ? 32 : key === 'recoveryCode' ? 64 : key === 'email' ? 254 : 128;
      if (key === 'username') { input.minLength = 3; input.pattern = '[A-Za-z0-9][A-Za-z0-9_-]{2,31}'; input.autocapitalize = 'none'; input.spellcheck = false; }
      if (key === 'email') input.placeholder = '请检查是否填写正确，否则不能及时收到回复';
      if (key === 'password' && mode !== 'login') input.minLength = 15;
      wrap.append(input); form.append(wrap); fields[key] = input;
    };
    field('username', '账号', 'text', 'username');
    if (mode === 'register') field('email', '邮箱（用于接收回复通知）', 'email', 'email');
    if (mode === 'recover') field('recoveryCode', '恢复码', 'text', 'off');
    field('password', mode === 'recover' ? '新密码' : '密码', 'password', mode === 'login' ? 'current-password' : 'new-password');
    if (mode !== 'login') {
      field('confirm', '再输入一次密码', 'password', 'new-password');
      form.append(node('p', 'visitor-hint', mode === 'register'
        ? '密码至少 15 个字符，可用一句好记的长句。请仔细检查邮箱是否正确，否则无法及时收到回复通知。'
        : '密码至少 15 个字符，可以用一句好记的长句。'));
    }
    const error = node('p', 'visitor-error'); error.setAttribute('role', 'alert'); error.hidden = true;
    const send = node('button', 'visitor-primary', mode === 'login' ? '登录' : mode === 'register' ? '创建账户' : '重设密码'); send.type = 'submit';
    form.append(error, send); body.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault(); error.hidden = true;
      if (fields.confirm && fields.confirm.value !== fields.password.value) { error.textContent = '两次密码不一致'; error.hidden = false; return; }
      send.disabled = true; send.setAttribute('aria-busy', 'true');
      try {
        const username = fields.username.value;
        const result = await accountRequest(mode, {
          username,
          password: fields.password.value,
          ...(fields.email ? { email: fields.email.value } : {}),
          ...(fields.recoveryCode ? { recoveryCode: fields.recoveryCode.value } : {}),
        });
        fields.password.value = ''; if (fields.confirm) fields.confirm.value = '';
        setViewer(result.user ?? null);
        if (result.recoveryCode) {
          body.replaceChildren(node('p', '', mode === 'recover' ? '密码已重设，旧登录和恢复码已失效。请保存新恢复码，再登录。' : '账户已创建，你现在可以使用这个身份发表。'), recoveryPanel(result.recoveryCode, username));
          const done = node('button', 'visitor-primary', mode === 'recover' ? '返回登录' : '继续留言'); done.type = 'button';
          done.addEventListener('click', () => mode === 'recover' ? render('login') : dialog.close()); body.append(done);
        } else if (mode === 'login' && result.user && !result.user.email) {
          renderBindEmail(result.user);
        } else dialog.close();
      } catch (reason) { error.textContent = reason instanceof Error ? reason.message : '账户操作失败，请稍后重试'; error.hidden = false; }
      finally { send.disabled = false; send.removeAttribute('aria-busy'); }
    });
  };
  for (const [mode, label] of [['login', '登录'], ['register', '注册'], ['recover', '忘记密码']] as const) {
    const button = node('button', 'visitor-link', label); button.type = 'button'; button.dataset.mode = mode; button.addEventListener('click', () => render(mode)); tabs.append(button);
  }
  render('login');
}
export async function openCard(author: Visitor) {
  if (document.querySelector('.visitor-dialog[open]')) return;
  const dialog = modal('访客名片');
  const body = node('div', 'visitor-card'); body.append(node('p', '', '正在读取名片…')); dialog.append(body);
  try {
    const response = await fetch(`/api/people?id=${encodeURIComponent(author.id)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('名片暂时无法读取');
    const { user } = await response.json() as { user: Visitor };
    body.replaceChildren(portrait(user.avatarUrl, user.nickname), node('h3', '', user.nickname), node('p', 'visitor-badge', user.isOwner ? '站主' : '本站访客'), node('p', 'visitor-signature', user.bio || '还没有留下个性签名。'), node('small', 'visitor-hint', `身份标识 · ${user.id.slice(0, 8)}`));
  } catch { body.replaceChildren(node('p', 'visitor-error', '名片暂时无法读取，稍后再试。')); }
}
