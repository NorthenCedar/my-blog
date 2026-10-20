import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('访客身份请求的时序', () => {
  it('迟到的初次匿名响应不能覆盖刚完成的登录，也不能向控件广播匿名', async () => {
    let complete!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { complete = resolve; });
    vi.stubGlobal('fetch', () => pending);
    const client = await import('../src/scripts/visitor-client');
    const seen: unknown[] = []; client.watchViewer(user => seen.push(user?.id ?? null));
    const first = client.loadViewer();
    const user = { id: 'new-login', nickname: '读者', bio: '', avatarUrl: '/avatars/leaf.svg', isOwner: false };
    client.setViewer(user);
    complete(Response.json({ user: null }));
    expect(await first).toEqual(user);
    expect(await client.loadViewer()).toEqual(user);
    expect(seen).toEqual(['new-login']);
  });
});
