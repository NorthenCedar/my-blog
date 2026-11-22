import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { visitorDatabase } from './_visitor-db';
import { validateLinkApply } from '../functions/api/_lib/link-apply';
import { onRequestDelete, onRequestGet, onRequestPost } from '../functions/api/link-apply';
import { onRequestGet as noticesGet } from '../functions/api/notices';
import { onRequestGet as avatarGet, onRequestHead as avatarHead } from '../functions/my-avatar';

const closers: (() => void)[] = [];
afterEach(() => {
  vi.useRealTimers();
  closers.splice(0).forEach((fn) => fn());
});

function setup(withTable = true) {
  const { sqlite, db } = visitorDatabase();
  closers.push(() => sqlite.close());
  for (const name of ['0005_reply_targets.sql', '0006_reply_notices.sql', '0010_owner_notices.sql']) {
    sqlite.exec(readFileSync(`migrations/${name}`, 'utf8'));
  }
  if (withTable) sqlite.exec(readFileSync('migrations/0015_link_applications.sql', 'utf8'));

  const tokens = { owner: 'a'.repeat(64), reader: 'b'.repeat(64) };
  for (const [id, token] of Object.entries(tokens)) {
    sqlite.prepare('INSERT INTO visitor_accounts(id,username,nickname,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,?)')
      .run(id, id, id === 'owner' ? '北杉' : '访客', 'pw', 'rc', '2026-11-22');
    sqlite.prepare('INSERT INTO visitor_sessions(token_hash,user_id,auth_version,expires_at) VALUES(?,?,0,?)')
      .run(createHash('sha256').update(token).digest('hex'), id, Date.now() + 86_400_000);
  }
  const env = { COMMENTS_DB: db, OWNER_USER_ID: 'owner' };
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://northcedar.top/api/link-apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://northcedar.top',
        'CF-Connecting-IP': '192.0.2.50',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const authReq = (url: string, user?: keyof typeof tokens, init: RequestInit = {}) =>
    new Request(url, {
      ...init,
      headers: {
        Origin: 'https://northcedar.top',
        'X-NC-Request': '1',
        ...(user ? { Cookie: `__Host-nc_session=${tokens[user]}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  return { sqlite, db, env, post, authReq };
}

describe('validateLinkApply 输入校验', () => {
  const valid = {
    name: 'Saneko',
    href: 'https://saneko.example.com',
    desc: '做自己喜欢的事',
    avatar: 'https://saneko.example.com/avatar.png',
  };

  it('合法输入通过，并允许头像留空', () => {
    expect(validateLinkApply(valid)).toEqual({
      ok: true,
      value: {
        name: 'Saneko',
        href: 'https://saneko.example.com/',
        desc: '做自己喜欢的事',
        avatar: 'https://saneko.example.com/avatar.png',
      },
    });
    expect(validateLinkApply({ ...valid, avatar: '  ' })).toEqual({
      ok: true,
      value: {
        name: 'Saneko',
        href: 'https://saneko.example.com/',
        desc: '做自己喜欢的事',
        avatar: '',
      },
    });
  });

  it('拒绝非法协议、控制字符、脚本片段和空字段（描述最多 15 字）', () => {
    expect(validateLinkApply({ ...valid, desc: '一二三四五六七八九十一二三四五' }).ok).toBe(true);
    for (const bad of [
      { ...valid, name: '' },
      { ...valid, name: '<script>x</script>' },
      { ...valid, name: '名\u202e字' },
      { ...valid, href: 'javascript:alert(1)' },
      { ...valid, href: 'https://user:pass@evil.test' },
      { ...valid, desc: '' },
      { ...valid, desc: 'a'.repeat(16) },
      { ...valid, desc: '描\u0007述' },
      { ...valid, avatar: 'data:text/html,<svg>' },
    ]) {
      expect(validateLinkApply(bad).ok).toBe(false);
    }
  });
});

describe('/api/link-apply 接口与小铃铛通知链路', () => {
  const payload = {
    name: '好友小站',
    href: 'https://friend.example.org',
    desc: '技术与生活笔记',
    avatar: 'https://friend.example.org/head.png',
  };

  it('提交友链申请后落库并向站主账号小铃铛投递可跳转通知；蜜罐假成功不入库', async () => {
    const s = setup(false); // 即使迁移尚未提前执行也应自建表成功
    const hp = await onRequestPost({
      request: s.post({ ...payload, website: 'https://spam.example' }),
      env: s.env,
    } as never);
    expect(hp.status).toBe(201);
    expect((await hp.json() as { id: number }).id).toBe(0);

    const res = await onRequestPost({ request: s.post(payload), env: s.env } as never);
    expect(res.status).toBe(201);
    const created = (await res.json()) as { ok: boolean; id: number };
    expect(created.ok).toBe(true);
    expect(created.id).toBeGreaterThan(0);

    // 同 IP 每分钟上限 2 条，再交 1 条后第 3 条被限流
    expect((await onRequestPost({ request: s.post(payload), env: s.env } as never)).status).toBe(201);
    expect((await onRequestPost({ request: s.post(payload), env: s.env } as never)).status).toBe(429);

    const ownerNotices = await (await noticesGet({
      request: s.authReq('https://northcedar.top/api/notices', 'owner'),
      env: s.env,
    } as never)).json() as { unread: number; items: Array<{ label: string; href: string; kind: string; actorName: string; excerpt: string }> };

    expect(ownerNotices.unread).toBe(2);
    expect(ownerNotices.items[0]).toMatchObject({
      kind: 'link-apply',
      label: '友链申请 · 新申请',
      actorName: '好友小站',
      href: `/links/?application=${created.id + 1}#link-apply`,
    });
    expect(ownerNotices.items[1].href).toBe(`/links/?application=${created.id}#link-apply`);

    // 普通访客小铃铛收不到站主的友链申请
    const readerNotices = await (await noticesGet({
      request: s.authReq('https://northcedar.top/api/notices', 'reader'),
      env: s.env,
    } as never)).json() as { items: unknown[] };
    expect(readerNotices.items).toEqual([]);
  });

  it('仅站主可读取与删除申请，普通访客 403，匿名 401；删除同时清理对应通知', async () => {
    const s = setup(true);
    const created = await (await onRequestPost({ request: s.post(payload), env: s.env } as never)).json() as { id: number };

    expect((await onRequestGet({ request: s.authReq('https://northcedar.top/api/link-apply'), env: s.env } as never)).status).toBe(401);
    expect((await onRequestGet({ request: s.authReq('https://northcedar.top/api/link-apply', 'reader'), env: s.env } as never)).status).toBe(403);
    expect((await onRequestGet({ request: s.authReq('https://northcedar.top/api/link-apply?rnd=1', 'owner'), env: s.env } as never)).status).toBe(400);

    const list = await (await onRequestGet({ request: s.authReq('https://northcedar.top/api/link-apply', 'owner'), env: s.env } as never)).json() as { items: Array<Record<string, unknown>> };
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).not.toHaveProperty('ip_hash');

    const one = await (await onRequestGet({ request: s.authReq(`https://northcedar.top/api/link-apply?id=${created.id}`, 'owner'), env: s.env } as never)).json() as { item: { name: string; avatar: string } };
    expect(one.item.name).toBe('好友小站');
    expect(one.item.avatar).toBe('https://friend.example.org/head.png');

    expect((await onRequestDelete({
      request: s.authReq('https://northcedar.top/api/link-apply', 'reader', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: created.id }),
      }),
      env: s.env,
    } as never)).status).toBe(403);

    const del = await onRequestDelete({
      request: s.authReq('https://northcedar.top/api/link-apply', 'owner', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: created.id }),
      }),
      env: s.env,
    } as never);
    expect(del.status).toBe(200);

    const afterNotices = await (await noticesGet({
      request: s.authReq('https://northcedar.top/api/notices', 'owner'),
      env: s.env,
    } as never)).json() as { items: unknown[] };
    expect(afterNotices.items).toEqual([]);
  });
});

describe('/my-avatar 公开头像直链与页面产物校验', () => {
  it('functions/my-avatar.ts 支持 GET 与 HEAD 并输出跨域 JPEG 响应头', async () => {
    const sample = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const assets = {
      fetch: async () => new Response(sample, { status: 200 }),
    };
    const getRes = await avatarGet({ request: new Request('https://northcedar.top/my-avatar'), env: { ASSETS: assets } } as never);
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get('Content-Type')).toBe('image/jpeg');
    expect(getRes.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    expect(getRes.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const headRes = await avatarHead({ request: new Request('https://northcedar.top/my-avatar', { method: 'HEAD' }), env: { ASSETS: assets } } as never);
    expect(headRes.status).toBe(200);
    expect(headRes.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('构建产物满足全部页面交互与文案要求', () => {
    if (!existsSync('dist/links/index.html') || !existsSync('dist/guestbook/index.html')) return;
    const linksHtml = readFileSync('dist/links/index.html', 'utf8');
    expect(linksHtml).toContain('/avatars/friends/willowxi.jpg');
    expect(linksHtml).toContain('莱茵生命风格的技术、摄影博客');
    expect(linksHtml).toContain('下载头像');
    expect(linksHtml).toContain('data-copy-avatar="https://northcedar.top/my-avatar.jpg"');
    expect(linksHtml).toContain('data-link-apply-form');
    expect(linksHtml).not.toContain('怎么换');
    expect(linksHtml).toMatch(/name="desc"[^>]*maxlength="15"/);

    // 友链与本站卡片走播放器同款玻璃圆角方框 + 头像，外链在新标签页打开
    const willowCard = /<a[^>]*class="card[^"]*"[^>]*href="http:\/\/willowxi\.site"[^>]*>[\s\S]*?<\/a>/.exec(linksHtml)?.[0] ?? '';
    expect(willowCard).toContain('card-friend');
    expect(willowCard).toContain('card-glass music-glass');
    expect(willowCard).toContain('avatar-ring');
    expect(willowCard).toContain('target="_blank"');
    expect(willowCard).toContain('rel="noopener noreferrer"');

    const mineCard = /<a[^>]*class="card[^"]*card-mine[^"]*"[^>]*>[\s\S]*?<\/a>/.exec(linksHtml)?.[0] ?? '';
    expect(mineCard).toContain('card-friend');
    expect(mineCard).toContain('card-glass music-glass');
    expect(mineCard).toContain('avatar-ring');
    expect(mineCard).toContain('target="_blank"');

    // 本站入口三个卡片无头像、无玻璃材质；GitHub 外链新标签页打开，站内入口保持当前页
    const githubCard = /<a[^>]*class="card[^"]*"[^>]*href="https:\/\/github\.com\/NorthenCedar"[^>]*>[\s\S]*?<\/a>/.exec(linksHtml)?.[0] ?? '';
    expect(githubCard).not.toBe('');
    expect(githubCard).not.toContain('avatar-ring');
    expect(githubCard).not.toContain('music-glass');
    expect(githubCard).toContain('target="_blank"');
    expect(githubCard).toContain('rel="noopener noreferrer"');

    const rssCard = /<a[^>]*class="card[^"]*"[^>]*href="\/rss\.xml"[^>]*>[\s\S]*?<\/a>/.exec(linksHtml)?.[0] ?? '';
    expect(rssCard).not.toBe('');
    expect(rssCard).not.toContain('avatar-ring');
    expect(rssCard).not.toContain('music-glass');
    expect(rssCard).not.toContain('target="_blank"');

    const gbCard = /<a[^>]*class="card[^"]*"[^>]*href="\/guestbook\/"[^>]*>[\s\S]*?<\/a>/.exec(linksHtml)?.[0] ?? '';
    expect(gbCard).not.toBe('');
    expect(gbCard).not.toContain('avatar-ring');
    expect(gbCard).not.toContain('music-glass');
    expect(gbCard).not.toContain('target="_blank"');

    const bell = /<button[^>]*data-notices[^>]*>/.exec(linksHtml)?.[0] ?? '';
    expect(bell).not.toBe('');
    expect(bell).not.toMatch(/\shidden(?:=|>|\s)/);

    const gbHtml = readFileSync('dist/guestbook/index.html', 'utf8');
    const formPos = gbHtml.indexOf('id="comment-form-title"');
    const listPos = gbHtml.indexOf('data-list');
    expect(formPos).toBeGreaterThan(-1);
    expect(listPos).toBeGreaterThan(formPos);

    expect(existsSync('dist/my-avatar')).toBe(true);
    expect(existsSync('dist/my-avatar.jpg')).toBe(true);
  });
});
