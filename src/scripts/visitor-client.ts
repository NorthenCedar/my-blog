/** 登录表单和名片按点击创建 DOM，不自动打扰匿名访客。 */
import { openCard, openLogin } from './visitor-dialog';
export type Visitor = { id: string; nickname: string; bio: string; avatarUrl: string; isOwner: boolean; username?: string };
export type Authored = { id: number; name: string; author?: Visitor | null };
let viewer: Visitor | null = null;
let loading: Promise<Visitor | null> | undefined;
let version = 0;
/** 异步资料响应只能应用到发起时的账户状态，避免退出后旧响应复活界面。 */
export const viewerVersion = () => version;
const listeners = new Set<(user: Visitor | null) => void>();
export function watchViewer(update: (user: Visitor | null) => void) { listeners.add(update); return () => listeners.delete(update); }
export const node = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text) element.textContent = text;
  return element;
};
export async function accountRequest(action: string, data: Record<string, unknown> = {}) {
  const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-NC-Request': '1' }, body: JSON.stringify({ action, ...data }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '账户操作失败，请稍后重试');
  // 跨标签页主动退出/注销/切换账户时，写作台清理原账户私密副本。
  try{if(['login','register','logout','delete','recover'].includes(action))localStorage.setItem('nc-account-change',JSON.stringify([action,result.user?.id,Date.now()]));}catch{}
  return result as { user?: Visitor; recoveryCode?: string; ok?: boolean };
}
export function setViewer(user: Visitor | null) {
  version++;
  viewer = user;
  loading = Promise.resolve(user);
  for (const update of listeners) update(user);
}
export function loadViewer() {
  if (loading) return loading;
  const startedAt = version;
  const request = fetch('/api/account', { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('账户服务暂时不可用');
    const data = await response.json();
    if (version === startedAt) setViewer(data.user ?? null);
    return viewer;
  }).catch(() => {
    // 暂时失败允许下一次读取重试，不能清掉其间登录产生的新缓存。
    if (loading === request) loading = undefined;
    return viewer;
  });
  return loading = request;
}
export function defaultAvatar(kind: string, id: number) {
  // 保留六个槽位的顺序，匿名留言刷新后仍是同一个图案。
  const avatars = ['dorothy-comic.png', 'helix.svg', 'ptilopsis-comic.png', 'muelsyse-comic.png', 'orbit.svg', 'infinity.svg'];
  return `/avatars/${avatars[(Math.abs(id) + (kind === 'reply' ? 3 : 0)) % avatars.length]}`;
}
export function portrait(url: string, name: string, fallback = '/avatars/helix.svg') {
  const image = node('img', 'visitor-avatar');
  image.src = url; image.alt = `${name}的头像`; image.width = 40; image.height = 40; image.loading = 'lazy';
  image.addEventListener('error', () => { if (!image.src.endsWith(fallback)) image.src = fallback; }, { once: true });
  return image;
}
export function authorNode(record: Authored, kind = 'comment') {
  const group = node('span', 'visitor-author');
  const author = record.author;
  group.append(portrait(author?.avatarUrl ?? defaultAvatar(kind, record.id), record.name));
  const name = node(author ? 'button' : 'span', 'visitor-name', record.name);
  if (name instanceof HTMLButtonElement && author) {
    name.type = 'button'; name.setAttribute('aria-label', `查看${record.name}的名片`);
    name.addEventListener('click', () => { void openCard(author); });
  }
  group.append(name);
  if (author) group.append(node('span', 'visitor-badge', author.isOwner ? '站主' : '已登录'));
  return group;
}
export function identityControls(form: HTMLFormElement) {
  const box = node('div', 'visitor-identity');
  const status = node('span', 'visitor-hint', '可直接匿名发表 · 登录后能收到回复提醒');
  const select = node('select'); select.name = 'identity'; select.setAttribute('aria-label', '发表身份');
  select.append(new Option('匿名发表', 'anonymous'), new Option('以账户发表', 'account')); select.hidden = true;
  const login = node('button', 'visitor-link', '登录 / 注册'); login.type = 'button';
  const settings = node('a', 'visitor-link', '资料设置'); settings.href = '/account/'; settings.hidden = true;
  box.append(status, select, login, settings);
  form.prepend(box);
  const input = form.elements.namedItem('name') as HTMLInputElement;
  let anonymousName = input.value, explicit = false, expired = false;
  const apply = (user: Visitor | null) => {
    // 已经选择账户后，失效/恢复后的空身份也不能悄悄改成匿名。
    if (!explicit && user) select.value = 'account';
    select.hidden = !user && select.value !== 'account'; settings.hidden = !user; login.hidden = Boolean(user) && !expired;
    login.textContent = expired || (!user && select.value === 'account') ? '重新登录' : '登录 / 注册';
    status.textContent = expired || (!user && select.value === 'account') ? '登录已过期，请重新登录或选择匿名' : user ? `已登录 · ${user.nickname}` : '可直接匿名发表 · 登录后能收到回复提醒';
    input.readOnly = select.value === 'account';
    if (input.readOnly && user) input.value = user.nickname;
    else if (!input.readOnly) input.value = anonymousName;
  };
  input.addEventListener('input', () => { if (!input.readOnly) anonymousName = input.value; });
  select.addEventListener('change', () => { explicit = true; apply(viewer); });
  login.addEventListener('click', () => {
    login.disabled = true;
    void openLogin().catch(() => { status.textContent = '登录面板没能打开，匿名发表仍可使用'; }).finally(() => { login.disabled = false; });
  });
  const update = (user: Visitor | null) => { expired = false; apply(user); };
  const onExpired = () => { expired = true; apply(viewer); };
  window.addEventListener('visitor-session-expired', onExpired);
  listeners.add(update);
  void loadViewer().then(apply);
  const dispose = () => { listeners.delete(update); window.removeEventListener('visitor-session-expired', onExpired); window.removeEventListener('pagehide',dispose); };
  window.addEventListener('pagehide',dispose,{once:true});
  return dispose;
}
