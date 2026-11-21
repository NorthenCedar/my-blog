import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setImmediate } from 'node:timers/promises';

/** 仅替代浏览器 DOM 边界；通知脚本及其事件处理运行真实实现。 */
class Element extends EventTarget {
  children: Element[] = []; parentElement: Element | null = null;
  className = ''; ownText = ''; hidden = false; href = ''; type = ''; disabled = false;
  attrs = new Map<string, string>(); focused = false;
  constructor(public tagName: string) { super(); }
  set textContent(value: string) { this.ownText = value; this.children = []; }
  get textContent(): string { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...children: Element[]) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children: Element[]) { this.children = []; this.append(...children); }
  all(): Element[] { return [this, ...this.children.flatMap(child => child.all())]; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  querySelector(selector: string) {
    const prefix = selector[0];
    const name = selector.slice(1);
    return this.all().find(child => prefix === '.' ? child.className.split(' ').includes(name)
      : prefix === '#' ? child.getAttribute('id') === name : child.attrs.has(name.slice(0, -1))) ?? null;
  }
  closest(selector: string): Element | null { return selector === '.topbar' && this.className === 'topbar' ? this : this.parentElement?.closest(selector) ?? null; }
  contains(node: Element) { return this.all().includes(node); }
  click() { this.dispatchEvent(new Event('click')); }
  focus() { this.focused = true; }
}

class PageTransitionEvent extends Event {
  constructor(type: string, public readonly persisted = false) { super(type); }
}

const settle = async () => { for (let i = 0; i < 3; i++) await setImmediate(); };
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); vi.restoreAllMocks(); });
const message = (id: number, slug = 'guestbook', kind = 'comment') => ({
  id, slug, kind, parentId: id + 100, replyId: kind === 'reply' ? id + 200 : null,
  href: slug === 'guestbook' ? `/guestbook/?comment=${id + 100}#comment-${id + 100}` : slug.startsWith('talk-') ? `/talks/?comment=${id + 100}&reply=${id + 200}#c-${slug}` : `/posts/${slug}/?comment=${id + 100}#comment-${id + 100}`,
  label: (slug === 'guestbook' ? '留言板' : slug.startsWith('talk-') ? '说说评论' : '文章评论') + ' · ' + (kind === 'reply' ? '新回复' : slug === 'guestbook' ? '新留言' : '新评论'),
  actorName: '访客', excerpt: `消息 ${id}`, createdAt: '2026-11-01T10:00:00.000Z', readAt: null,
});

async function open(options: { owner?: boolean; items?: ReturnType<typeof message>[]; nextBefore?: number | null; unread?: number } = {}) {
  const root = new Element('div'); root.className = 'topbar';
  const bell = new Element('button'); bell.setAttribute('data-notices', ''); bell.hidden = true;
  bell.setAttribute('aria-label', '回复提醒'); bell.setAttribute('aria-expanded', 'false');
  const badge = new Element('span'); badge.setAttribute('data-notices-count', ''); bell.append(badge); root.append(bell);
  const panel = new Element('div'); panel.setAttribute('id', 'notices-panel'); panel.hidden = true;
  const scroll = new Element('div'); scroll.className = 'notices-scroll';
  const list = new Element('ul'); list.className = 'notices-list';
  const empty = new Element('p'); empty.className = 'notices-empty';
  const moreButton = new Element('button'); moreButton.className = 'notices-more'; moreButton.hidden = true;
  scroll.append(list, empty, moreButton); panel.append(scroll); root.append(panel);
  const document = new EventTarget();
  Object.assign(document, { createElement: (tag: string) => new Element(tag), querySelector: (selector: string) => root.querySelector(selector) });
  const calls: { url: string; data: { ids: number[] } | null; signal?: AbortSignal | null }[] = [];
  const user = { id: 'reader', nickname: '读者', bio: '', avatarUrl: '/avatars/leaf.svg', isOwner: options.owner ?? true };
  const state = { failRead: false, failPull: false, marked: [] as number[], user: user as typeof user | null,
    pendingRead: undefined as Promise<Response> | undefined, pendingPull: undefined as Promise<Response> | undefined,
    data: { items: options.items ?? [], unread: options.unread ?? options.items?.length ?? 0, signedIn: true, isOwner: options.owner ?? true, nextBefore: options.nextBefore ?? null,
      title: options.owner === false ? '回复提醒' : '全站消息', emptyMessage: options.owner === false ? '还没有人回复你。' : '还没有新的全站消息。' },
    older: { items: [message(1)], unread: 1, signedIn: true, isOwner: true, nextBefore: null as number | null, title: '全站消息', emptyMessage: '还没有新的全站消息。' } };
  const window = new EventTarget();
  Object.assign(window, { location: new URL('https://content.test/') });
  vi.stubGlobal('document', document); vi.stubGlobal('window', window);
  vi.stubGlobal('PageTransitionEvent', PageTransitionEvent);
  vi.stubGlobal('localStorage', { setItem: vi.fn() });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/account') return Response.json({ user: state.user });
    const data = init?.method === 'POST' ? JSON.parse(String(init.body)) : null;
    calls.push({ url, data, signal: init?.signal });
    if (data) {
      if (state.pendingRead) return state.pendingRead;
      if (state.failRead) return Response.json({ error: '暂时失败' }, { status: 503 });
      state.marked.push(...data.ids ?? []);
      return Response.json({ unread: Math.max(0, state.data.unread - state.marked.length) });
    }
    if (state.pendingPull) return state.pendingPull;
    if (state.failPull) return new Response('', { status: 503 });
    return Response.json(url.includes('?before=') ? state.older : state.data);
  });
  await import('../src/scripts/notices'); await settle();
  const rows = () => root.all().filter(child => child.tagName === 'li');
  const more = () => root.all().find(child => child.tagName === 'button' && child !== bell)!;
  return { root, bell, badge, calls, state, rows, more, document, window };
}

it('首屏只拉一次，只有浏览器缓存恢复时才因 pageshow 刷新', async () => {
  const s = await open({ items: [message(1)] });
  s.window.dispatchEvent(new PageTransitionEvent('pageshow'));
  await settle();
  expect(s.calls).toHaveLength(1);

  s.state.data.items = [message(2), message(1)];
  s.state.data.unread = 2;
  s.window.dispatchEvent(new PageTransitionEvent('pageshow', true));
  await settle();
  expect(s.calls).toHaveLength(2);
  expect(s.badge.textContent).toBe('2');
  expect(s.rows()[0].textContent).toContain('消息 2');
});

it('退出立即清空已打开的提醒，迟到的已读响应无法恢复角标', async () => {
  const s = await open({ items: [message(2)], nextBefore: 2 });
  const client = await import('../src/scripts/visitor-client');
  await client.loadViewer();
  s.state.user = { ...s.state.user!, nickname: '另一昵称' };
  const profile = await client.accountRequest('profile');
  client.setViewer(profile.user!);
  expect(s.calls).toHaveLength(1);

  const lateRead = Promise.withResolvers<Response>();
  s.state.pendingRead = lateRead.promise;
  s.bell.click();
  await settle();
  const read = s.calls.find(call => call.data?.ids);
  expect(read?.data).toEqual({ ids: [2] });

  s.state.user = null;
  await client.accountRequest('logout');
  client.setViewer(null);
  expect(s.bell.hidden).toBe(true);
  expect(s.bell.getAttribute('aria-expanded')).toBe('false');
  expect(s.badge.hidden).toBe(true);
  expect(s.rows()).toHaveLength(0);
  expect(s.more().hidden).toBe(true);
  expect(read?.signal?.aborted).toBe(true);

  lateRead.resolve(Response.json({ unread: 2 }));
  await settle();
  expect(s.badge.hidden).toBe(true);
  expect(s.rows()).toHaveLength(0);
});

it('切换账户时中止旧分页请求，迟到的旧列表无法覆盖新账户', async () => {
  const s = await open({ items: [message(3)], nextBefore: 3 });
  const client = await import('../src/scripts/visitor-client');
  s.bell.click();
  await settle();
  const latePull = Promise.withResolvers<Response>();
  s.state.pendingPull = latePull.promise;
  s.more().click();
  const older = s.calls.find(call => call.url === '/api/notices?before=3');
  expect(older).toBeDefined();

  const freshPull = Promise.withResolvers<Response>();
  s.state.pendingPull = freshPull.promise;
  s.state.user = { ...s.state.user!, id: 'another-reader' };
  s.state.data.items = [message(8)];
  s.state.data.nextBefore = null;
  const login = await client.accountRequest('login');
  client.setViewer(login.user!);
  expect(s.bell.hidden).toBe(true);
  expect(s.rows()).toHaveLength(0);
  expect(older?.signal?.aborted).toBe(true);

  latePull.resolve(Response.json(s.state.older));
  await settle();
  expect(s.rows()).toHaveLength(0);

  freshPull.resolve(Response.json(s.state.data));
  await settle();
  expect(s.bell.hidden).toBe(false);
  expect(s.bell.getAttribute('aria-expanded')).toBe('false');
  expect(s.rows()[0].textContent).toContain('消息 8');
  expect(s.calls.filter(call => call.data)).toHaveLength(1);
});

it('Astro 离页时中止进行中的通知请求并卸载页面监听', async () => {
  const s = await open({ items: [message(1)] });
  const latePull = Promise.withResolvers<Response>();
  s.state.pendingPull = latePull.promise;
  s.bell.click();
  const pull = s.calls.at(-1);

  s.document.dispatchEvent(new Event('astro:before-swap'));
  expect(pull?.signal?.aborted).toBe(true);
  latePull.resolve(Response.json({ ...s.state.data, items: [message(2)] }));
  await settle();
  expect(s.rows().some(row => row.textContent.includes('消息 2'))).toBe(false);
  s.window.dispatchEvent(new PageTransitionEvent('pageshow', true));
  expect(s.calls).toHaveLength(2);
});

it('站主面板区分三处来源与评论/回复，链接仍落在原页面，用户文字按文本显示', async () => {
  const s = await open({ items: [message(3), message(2, 'talk-20260926', 'reply'), { ...message(1, 'my-python-memorandum'), excerpt: '<img src=x onerror=alert(1)>' }] });
  expect(s.bell.getAttribute('aria-label')).toContain('全站消息');
  expect(s.rows().map(row => row.children.find(child => child.tagName === 'a')!.href)).toEqual([
    'https://content.test/guestbook/?comment=103#comment-103', 'https://content.test/talks/?comment=102&reply=202#c-talk-20260926', 'https://content.test/posts/my-python-memorandum/?comment=101#comment-101',
  ]);
  expect(s.rows()[0].textContent).toContain('留言板');
  expect(s.rows()[1].textContent).toContain('说说');
  expect(s.rows()[1].textContent).toContain('回复');
  expect(s.rows()[2].textContent).toContain('文章');
  expect(s.rows()[2].textContent).toContain('<img src=x onerror=alert(1)>');
  expect(s.rows().every(row => row.children.length === 1 && row.children[0].textContent === row.textContent)).toBe(true);
  expect(s.root.all().filter(child => child.tagName === 'img')).toEqual([]);
});

it('通知中缺少或跨源的地址只显示原消息文字', async () => {
  const s = await open({ items: [message(3), { ...message(2), href: 'https://other.test/guestbook/' }, { ...message(1), href: '' }] });
  expect(s.rows()).toHaveLength(3);
  expect(s.rows()[0].children[0].tagName).toBe('a');
  for (const row of s.rows().slice(1)) {
    expect(row.children[0].tagName).toBe('span');
    expect(row.textContent).toContain('消息');
  }
});

it('打开仅标记已展示的消息，保留其他未读数，更早消息仍可查看', async () => {
  const s = await open({ items: [message(3), message(2)], unread: 3, nextBefore: 2 });
  expect(s.calls.filter(call => call.data)).toEqual([]);
  s.bell.click(); await settle();
  expect(s.state.marked).toEqual([3, 2]);
  expect(s.badge.hidden).toBe(false); expect(s.badge.textContent).toBe('1');
  expect(s.rows().every(row => row.className === 'notice')).toBe(true);
  expect(s.more().hidden).toBe(false);
  s.more().click(); await settle();
  expect(s.calls.some(call => call.url === '/api/notices?before=2')).toBe(true);
  expect(s.rows()[0].textContent).toContain('消息 1');
  expect(s.state.marked).toEqual([3, 2, 1]);
  expect(s.more().hidden).toBe(true);
});

it('标记失败不伪装已读、拉取失败不拿旧列表清空提醒', async () => {
  const s = await open({ items: [message(1)] });
  s.state.failRead = true; s.bell.click(); await settle();
  expect(s.badge.textContent).toBe('1'); expect(s.badge.hidden).toBe(false);
  expect(s.rows()[0].className).toContain('is-new');
  s.bell.click(); s.state.failPull = true; s.bell.click(); await settle();
  expect(s.calls.filter(call => call.data)).toHaveLength(1);
});

it('普通访客保留回复提醒，未登录隐藏铃铛，Escape 关闭后还焦', async () => {
  const s = await open({ owner: false });
  expect(s.bell.hidden).toBe(false); expect(s.bell.getAttribute('aria-label')).toBe('回复提醒');
  expect(s.root.textContent).toContain('还没有人回复你');
  s.bell.click(); await settle();
  const escape = new Event('keydown'); Object.assign(escape, { key: 'Escape' }); s.document.dispatchEvent(escape);
  expect(s.bell.getAttribute('aria-expanded')).toBe('false'); expect(s.bell.focused).toBe(true);
  s.state.data.signedIn = false;
  s.bell.click(); await settle();
  expect(s.bell.hidden).toBe(true);
});
