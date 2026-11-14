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
    return this.all().find(child => selector === '[data-notices]' ? child.attrs.has('data-notices')
      : selector === '[data-notices-count]' ? child.attrs.has('data-notices-count') : false) ?? null;
  }
  closest(selector: string): Element | null { return selector === '.topbar' && this.className === 'topbar' ? this : this.parentElement?.closest(selector) ?? null; }
  contains(node: Element) { return this.all().includes(node); }
  click() { this.dispatchEvent(new Event('click')); }
  focus() { this.focused = true; }
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
  const badge = new Element('span'); badge.setAttribute('data-notices-count', ''); bell.append(badge); root.append(bell);
  const document = new EventTarget();
  Object.assign(document, { createElement: (tag: string) => new Element(tag), querySelector: (selector: string) => root.querySelector(selector) });
  const calls: { url: string; data: any }[] = [];
  const state = { failRead: false, failPull: false, marked: [] as number[],
    data: { items: options.items ?? [], unread: options.unread ?? options.items?.length ?? 0, signedIn: true, isOwner: options.owner ?? true, nextBefore: options.nextBefore ?? null,
      title: options.owner === false ? '回复提醒' : '全站消息', emptyMessage: options.owner === false ? '还没有人回复你。' : '还没有新的全站消息。' },
    older: { items: [message(1)], unread: 1, signedIn: true, isOwner: true, nextBefore: null as number | null, title: '全站消息', emptyMessage: '还没有新的全站消息。' } };
  vi.stubGlobal('document', document); vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const data = init?.method === 'POST' ? JSON.parse(String(init.body)) : null; calls.push({ url, data });
    if (data) {
      if (state.failRead) return Response.json({ error: '暂时失败' }, { status: 503 });
      state.marked.push(...data.ids ?? []);
      return Response.json({ unread: Math.max(0, state.data.unread - state.marked.length) });
    }
    if (state.failPull) return new Response('', { status: 503 });
    return Response.json(url.includes('?before=') ? state.older : state.data);
  });
  await import('../src/scripts/notices'); await settle();
  const rows = () => root.all().filter(child => child.tagName === 'li');
  const more = () => root.all().find(child => child.tagName === 'button' && child !== bell)!;
  return { root, bell, badge, calls, state, rows, more, document };
}

it('站主面板区分三处来源与评论/回复，链接仍落在原页面，用户文字按文本显示', async () => {
  const s = await open({ items: [message(3), message(2, 'talk-20260926', 'reply'), { ...message(1, 'my-python-memorandum'), excerpt: '<img src=x onerror=alert(1)>' }] });
  expect(s.bell.getAttribute('aria-label')).toContain('全站消息');
  expect(s.rows().map(row => row.children.find(child => child.tagName === 'a')!.href)).toEqual([
    '/guestbook/?comment=103#comment-103', '/talks/?comment=102&reply=202#c-talk-20260926', '/posts/my-python-memorandum/?comment=101#comment-101',
  ]);
  expect(s.rows()[0].textContent).toContain('留言板');
  expect(s.rows()[1].textContent).toContain('说说');
  expect(s.rows()[1].textContent).toContain('回复');
  expect(s.rows()[2].textContent).toContain('文章');
  expect(s.rows()[2].textContent).toContain('<img src=x onerror=alert(1)>');
  expect(s.rows().every(row => row.children.length === 1 && row.children[0].textContent === row.textContent)).toBe(true);
  expect(s.root.all().filter(child => child.tagName === 'img')).toEqual([]);
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
