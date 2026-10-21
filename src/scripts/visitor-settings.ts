import { accountRequest, loadViewer, node, portrait, setViewer, watchViewer, type Visitor } from './visitor-client';
import { openLogin, recoveryPanel } from './visitor-dialog';
import { DEFAULT_AVATARS } from '../lib/visitor-avatars';

const root = document.querySelector<HTMLElement>('[data-account-state]')!;
const notices = document.querySelector<HTMLElement>('[data-account-notices]')!;
let displayed: string | null | undefined;

function field(form: HTMLFormElement, name: string, title: string, type = 'text') {
  const label = node('label', '', title), input = node('input'); input.name = name; input.type = type; input.required = true;
  if (type === 'password') { input.autocomplete = 'current-password'; input.maxLength = 128; }
  label.append(input); form.append(label); return input;
}
function actionButton(text: string, cls = 'visitor-primary') { const button = node('button', cls, text); button.type = 'submit'; return button; }
function show(initial: Visitor | null) {
  displayed = initial?.id ?? null; root.replaceChildren();
  if (!initial) {
    const login = actionButton('登录 / 创建账户'); login.type = 'button'; login.addEventListener('click', () => void openLogin());
    root.append(node('p', '', '登录后可以修改昵称、头像和个性签名。'), login); return;
  }
  let user = initial;
  const head = node('div', 'visitor-account-header'), avatarImage = portrait(user.avatarUrl, user.nickname), nicknameText = node('strong', '', user.nickname);
  const identity = node('div'); identity.append(nicknameText, node('p', 'visitor-hint', `身份标识 · ${user.id.slice(0, 8)}${user.isOwner ? ' · 站主' : ''}`));
  head.append(avatarImage, identity); root.append(head);
  const section = node('section', 'visitor-account-section'); section.append(node('h2', '', '你的公开名片'));
  const form = node('form', 'visitor-form');
  const username = field(form, 'username', '登录账号（仅自己可见）'); username.value = user.username ?? ''; username.readOnly = true; username.autocomplete = 'username';
  const nickname = field(form, 'nickname', '昵称'); nickname.maxLength = 40; nickname.value = user.nickname; nickname.autocomplete = 'nickname';
  const bioLabel = node('label', '', '个性签名'), bio = node('textarea'); bio.name = 'bio'; bio.maxLength = 160; bio.rows = 3; bio.value = user.bio; bioLabel.append(bio); form.append(bioLabel);
  const choices = node('div', 'visitor-avatar-groups'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', '默认头像');
  let selectedAvatar = '';
  for (const group of new Set(DEFAULT_AVATARS.map(avatar => avatar.group))) {
    const heading = node('h3', 'visitor-avatar-heading', group);
    const row = node('div', 'visitor-avatar-choices'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', group);
    for (const { id, title, url } of DEFAULT_AVATARS.filter(avatar => avatar.group === group)) {
      const button = node('button', 'visitor-avatar-choice'); button.type = 'button'; button.setAttribute('aria-label', `${title} · ${group}`); button.setAttribute('aria-pressed', String(user.avatarUrl === url));
      button.append(portrait(url, title), node('span', '', title));
      button.addEventListener('click', () => { selectedAvatar = id; choices.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); }); row.append(button);
    }
    choices.append(heading, row);
  }
  form.append(node('span', 'visitor-hint', '选择默认头像后，点击保存名片。'), choices);
  const sources = node('a', 'visitor-link', '头像素材来源'); sources.href = '/avatar-sources/'; form.append(sources);
  const save = actionButton('保存名片'), message = node('p', 'visitor-hint'); message.setAttribute('role', 'status'); form.append(save, message);
  form.addEventListener('submit', async event => {
    event.preventDefault(); save.disabled = true; message.textContent = '';
    try {
      const result = await accountRequest('profile', { nickname: nickname.value, bio: bio.value, avatar: selectedAvatar }); user = result.user!;
      nickname.value = user.nickname; bio.value = user.bio; nicknameText.textContent = user.nickname; avatarImage.src = user.avatarUrl; selectedAvatar = ''; setViewer(user);
      message.textContent = '名片已保存，关联的历史留言也会显示新资料。';
    } catch (error) { message.textContent = error instanceof Error ? error.message : '保存失败，请重试'; }
    finally { save.disabled = false; }
  });
  section.append(form);
  const uploadForm = node('form', 'visitor-form');
  const upload = field(uploadForm, 'avatar', '或者上传自己的头像', 'file'); upload.accept = 'image/*'; upload.required = false;
  uploadForm.append(node('p', 'visitor-hint', '图片上限 8 MiB。保存为静态正方形头像；动图只保留一帧，位置信息会移除。'));
  upload.addEventListener('change', async () => {
    const file = upload.files?.[0]; if (!file) return;
    if (file.size > 8 * 1024 * 1024) { message.textContent = '图片超过 8 MiB，请换一张小一点的图片。'; upload.value = ''; return; }
    upload.disabled = true; save.disabled = true;
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40000000) { bitmap.close(); throw new Error('图片像素过大，请先缩小再上传。'); }
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d')!; const side = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 128, 128); bitmap.close();
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('图片没能转换，请换一张试试。');
      const bytes = new Uint8Array(await blob.arrayBuffer()); const png = btoa(Array.from(bytes, n => String.fromCharCode(n)).join(''));
      const result = await accountRequest('avatar', { png }); user = result.user!; avatarImage.src = user.avatarUrl;
      choices.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false')); selectedAvatar = ''; setViewer(user);
      message.textContent = '自定义头像已保存。昵称和签名如有改动，请点击保存名片。';
    } catch (error) { message.textContent = error instanceof Error ? error.message : '头像上传失败'; }
    finally { upload.disabled = false; save.disabled = false; upload.value = ''; }
  });
  section.append(uploadForm); root.append(section);

  const safety = node('section', 'visitor-account-section'); safety.append(node('h2', '', '账户与恢复'));
  for (const [action, title] of [['password', '修改密码'], ['recovery', '重新生成恢复码'], ['delete', '注销账户']] as const) {
    const details = node('details'), summary = node('summary', '', title), sensitive = node('form', 'visitor-form'); details.append(summary, sensitive);
    const current = field(sensitive, 'password', '当前密码', 'password');
    let next: HTMLInputElement | undefined, confirm: HTMLInputElement | undefined;
    if (action === 'password') {
      next = field(sensitive, 'newPassword', '新密码（至少 15 个字符）', 'password'); next.minLength = 15; next.autocomplete = 'new-password';
      confirm = field(sensitive, 'confirm', '再输入一次新密码', 'password'); confirm.autocomplete = 'new-password';
    }
    if (action === 'delete') {
      sensitive.append(node('p', 'visitor-hint', '注销后清除登录凭据、头像和签名。已发表的留言保留原发表昵称与正文，去除账户关联，其他人的回复保留。'));
      const label = node('label'), check = node('input'); check.type = 'checkbox'; check.name = 'confirmed'; check.required = true; label.append(check, node('span', '', '我已了解注销后的处理方式')); sensitive.append(label);
    } else sensitive.append(node('p', 'visitor-hint', '完成后，所有设备上的旧登录都会失效，并生成一份新恢复码。'));
    const submit = actionButton(title, 'visitor-secondary'), error = node('p', 'visitor-error'); error.setAttribute('role', 'alert'); sensitive.append(submit, error);
    sensitive.addEventListener('submit', async event => {
      event.preventDefault(); error.textContent = '';
      if (next && next.value !== confirm?.value) { error.textContent = '两次新密码不一致'; return; }
      submit.disabled = true;
      try {
        const result = await accountRequest(action, { password: current.value, ...(next ? { newPassword: next.value } : {}) }); current.value = '';
        notices.replaceChildren(node('p', '', action === 'delete' ? '账户已注销，已发表留言按说明保留。' : '账户凭据已更新，请保存新恢复码，然后重新登录。'));
        if (result.recoveryCode) notices.append(recoveryPanel(result.recoveryCode, user.username ?? ''));
        setViewer(null);
      } catch (reason) { error.textContent = reason instanceof Error ? reason.message : '操作失败，请重试'; }
      finally { submit.disabled = false; }
    }); safety.append(details);
  }
  const logout = actionButton('退出当前登录', 'visitor-secondary'); logout.type = 'button';
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    try { await accountRequest('logout'); setViewer(null); notices.replaceChildren(node('p', '', '已退出当前登录。')); }
    catch (reason) { notices.replaceChildren(node('p', 'visitor-error', reason instanceof Error ? reason.message : '退出失败')); logout.disabled = false; }
  });
  safety.append(logout); root.append(safety);
}
watchViewer(user => { if ((user?.id ?? null) !== displayed) show(user); });
void loadViewer().then(show);
