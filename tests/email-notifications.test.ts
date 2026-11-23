import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { visitorDatabase } from './_visitor-db';
import { onRequestGet as accountGet, onRequestPost as accountPost } from '../functions/api/account';
import { onRequestGet as personGet } from '../functions/api/people';
import { onRequestGet as commentsGet, onRequestPost as commentsPost } from '../functions/api/comments';
import { onRequestPost as linkApplyPost } from '../functions/api/link-apply';

const closers: (() => void)[] = [];
afterEach(() => {
  closers.splice(0).forEach((close) => close());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PASSWORD = '一段足够长而且可以记住的账户密码123';

function setup() {
  const { sqlite, db } = visitorDatabase();
  closers.push(() => sqlite.close());
  for (const file of ['0005_reply_targets.sql', '0006_reply_notices.sql', '0010_owner_notices.sql', '0015_link_applications.sql']) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }

  const sent: Array<{ from: string; reply_to?: string; to: string[]; subject: string; html: string; text: string }> = [];
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body ?? '{}')));
    return new Response(JSON.stringify({ id: `mail-${sent.length}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const pending: Promise<unknown>[] = [];
  const waitUntil = (promise: Promise<unknown>) => {
    pending.push(promise);
  };
  const drain = async () => {
    while (pending.length) {
      const batch = pending.splice(0);
      await Promise.all(batch);
    }
  };

  const env = {
    COMMENTS_DB: db,
    OWNER_USER_ID: '',
    RESEND_API_KEY: 're_test_key',
  };

  let ipCounter = 1;
  const req = (path: string, body?: unknown, cookie = '', ip?: string) =>
    new Request(`https://example.test/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-NC-Request': '1',
        Origin: 'https://example.test',
        Cookie: cookie,
        'CF-Connecting-IP': ip ?? `198.51.100.${ipCounter++}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  return { sqlite, db, env, sent, fetchMock, waitUntil, drain, req };
}

describe('回复与站主邮件通知（Resend + 旁表 + 保留邮箱校验）', () => {
  it('注册必填邮箱，老账户首次登录后可补绑并可在资料页更新，且邮箱永不出现在公开接口中', async () => {
    const s = setup();

    const missingEmail = await accountPost({
      request: s.req('account', { action: 'register', username: 'usera', password: PASSWORD }),
      env: s.env,
    } as never);
    expect(missingEmail.status).toBe(400);

    const badEmail = await accountPost({
      request: s.req('account', { action: 'register', username: 'usera', email: 'invalid-mail', password: PASSWORD }),
      env: s.env,
    } as never);
    expect(badEmail.status).toBe(400);

    const registered = await accountPost({
      request: s.req('account', { action: 'register', username: 'usera', email: '  Alice@Example.COM  ', password: PASSWORD }),
      env: s.env,
    } as never);
    expect(registered.status).toBe(201);
    const cookie = registered.headers.get('Set-Cookie')!.split(';')[0];
    const regData = (await registered.json()) as { user: { id: string; email: string } };
    expect(regData.user.email).toBe('alice@example.com');

    // 公开名片与评论读取不能出现邮箱
    const cardRes = await personGet({ request: s.req(`people?id=${regData.user.id}`), env: s.env } as never);
    expect(await cardRes.text()).not.toContain('alice@example.com');

    // 模拟历史未绑邮箱的老账户，做法 B 登录后提示一次性补绑
    s.sqlite.prepare('DELETE FROM visitor_emails WHERE user_id = ?').run(regData.user.id);
    const loginRes = await accountPost({
      request: s.req('account', { action: 'login', username: 'usera', password: PASSWORD }),
      env: s.env,
    } as never);
    expect(loginRes.status).toBe(200);
    const loginCookie = loginRes.headers.get('Set-Cookie')!.split(';')[0];
    expect(((await loginRes.json()) as { user: { email: string } }).user.email).toBe('');

    const bindRes = await accountPost({
      request: s.req('account', { action: 'email', email: 'Bound@Example.org' }, loginCookie),
      env: s.env,
    } as never);
    expect(bindRes.status).toBe(200);
    expect(((await bindRes.json()) as { user: { email: string } }).user.email).toBe('bound@example.org');

    const meRes = await accountGet({ request: s.req('account', undefined, loginCookie), env: s.env } as never);
    expect(((await meRes.json()) as { user: { email: string } }).user.email).toBe('bound@example.org');

    // 通过 profile 也可修改邮箱
    const profileRes = await accountPost({
      request: s.req('account', { action: 'profile', nickname: '阿丽丝', bio: '', email: 'Updated@Example.org' }, loginCookie),
      env: s.env,
    } as never);
    expect(profileRes.status).toBe(200);
    expect(((await profileRes.json()) as { user: { email: string } }).user.email).toBe('updated@example.org');
    expect(cookie).toBeTruthy();
  });

  it('拦截 bluehour@northcedar.top 与其他用户冒用 a13655515876@163.com', async () => {
    const s = setup();

    for (const reserved of ['bluehour@northcedar.top', 'BlueHour@NorthCedar.Top', 'a13655515876@163.com', 'A13655515876@163.COM']) {
      const regRes = await accountPost({
        request: s.req('account', { action: 'register', username: 'attacker', email: reserved, password: PASSWORD }),
        env: s.env,
      } as never);
      expect(regRes.status, `register should reject ${reserved}`).toBe(400);

      const anonRes = await commentsPost({
        request: s.req('comments', { slug: 'guestbook', name: '路人', email: reserved, body: '测试' }),
        env: s.env,
        waitUntil: s.waitUntil,
      } as never);
      expect(anonRes.status, `anonymous comment should reject ${reserved}`).toBe(400);
    }

    // 普通用户绑定后也禁止改绑为保留邮箱
    const userRes = await accountPost({
      request: s.req('account', { action: 'register', username: 'normaluser', email: 'normal@example.com', password: PASSWORD }),
      env: s.env,
    } as never);
    const cookie = userRes.headers.get('Set-Cookie')!.split(';')[0];
    const normalId = ((await userRes.json()) as { user: { id: string } }).user.id;

    expect((await accountPost({
      request: s.req('account', { action: 'email', email: 'a13655515876@163.com' }, cookie),
      env: s.env,
    } as never)).status).toBe(400);

    expect((await accountPost({
      request: s.req('account', { action: 'profile', nickname: '普通访客', bio: '', email: 'bluehour@northcedar.top' }, cookie),
      env: s.env,
    } as never)).status).toBe(400);

    // 站主自己允许绑定站主收信邮箱，但仍不允许填发信邮箱
    s.env.OWNER_USER_ID = normalId;
    expect((await accountPost({
      request: s.req('account', { action: 'email', email: 'bluehour@northcedar.top' }, cookie),
      env: s.env,
    } as never)).status).toBe(400);

    const ownerBind = await accountPost({
      request: s.req('account', { action: 'email', email: 'a13655515876@163.com' }, cookie),
      env: s.env,
    } as never);
    expect(ownerBind.status).toBe(200);
  });

  it('匿名留言选填邮箱与账户回复各自精准发信给被回复者与站主，不自发自收且删帖同步清理', async () => {
    const s = setup();

    // 1. 匿名访客留了邮箱在说说下评论
    const anonTop = await commentsPost({
      request: s.req('comments', {
        slug: 'talk-20260926',
        name: '山海',
        email: 'Visitor1@Example.com',
        body: '来看看说说！<script>xss</script>',
      }),
      env: s.env,
      waitUntil: s.waitUntil,
    } as never);
    expect(anonTop.status).toBe(201);
    await s.drain();

    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toMatchObject({
      from: '北杉札记 <bluehour@northcedar.top>',
      reply_to: 'bluehour@northcedar.top',
      to: ['a13655515876@163.com'],
    });
    expect(s.sent[0].text).toContain('山海');
    expect(s.sent[0].text).toContain('https://northcedar.top/talks/?comment=1#c-talk-20260926');
    expect(s.sent[0].html).not.toContain('<script>');

    // GET /api/comments 绝不返回邮箱
    const listRes = await commentsGet({ request: s.req('comments?slug=talk-20260926'), env: s.env } as never);
    expect(await listRes.text()).not.toContain('visitor1@example.com');

    // 2. 另一访客注册并回复山海
    const regB = await accountPost({
      request: s.req('account', { action: 'register', username: 'visitorb', email: 'visitorb@example.com', password: PASSWORD }),
      env: s.env,
    } as never);
    const cookieB = regB.headers.get('Set-Cookie')!.split(';')[0];
    const idB = ((await regB.json()) as { user: { id: string } }).user.id;
    await accountPost({
      request: s.req('account', { action: 'profile', nickname: '青苔', bio: '', email: 'visitorb@example.com' }, cookieB),
      env: s.env,
    } as never);

    const replyToAnon = await commentsPost({
      request: s.req('comments', {
        slug: 'talk-20260926',
        identity: 'account',
        parentId: 1,
        replyTo: '山海',
        replyTarget: { kind: 'comment', id: 1 },
        body: '欢迎来玩呀',
      }, cookieB),
      env: s.env,
      waitUntil: s.waitUntil,
    } as never);
    expect(replyToAnon.status).toBe(201);
    await s.drain();

    // 分别发给山海（visitor1@example.com）与站主（a13655515876@163.com）
    expect(s.sent).toHaveLength(3);
    const toVisitor = s.sent[1];
    const toOwner = s.sent[2];
    expect(toVisitor.to).toEqual(['visitor1@example.com']);
    expect(toVisitor.text).toContain('青苔');
    expect(toVisitor.text).toContain('欢迎来玩呀');
    expect(toVisitor.text).toContain('https://northcedar.top/talks/?comment=1&reply=1#c-talk-20260926');
    expect(toOwner.to).toEqual(['a13655515876@163.com']);

    // 3. 第三人以匿名（并填写和青苔不同邮箱）回复青苔的楼中楼 -> 发给账户绑定邮箱 visitorb@example.com
    const replyToAccount = await commentsPost({
      request: s.req('comments', {
        slug: 'talk-20260926',
        name: '飞鸟',
        email: 'visitorc@example.com',
        parentId: 1,
        replyTo: '青苔',
        replyTarget: { kind: 'reply', id: 1 },
        body: '楼中楼回复测试',
      }),
      env: s.env,
      waitUntil: s.waitUntil,
    } as never);
    expect(replyToAccount.status).toBe(201);
    await s.drain();

    expect(s.sent).toHaveLength(5);
    expect(s.sent[3].to).toEqual(['visitorb@example.com']);
    expect(s.sent[4].to).toEqual(['a13655515876@163.com']);

    // 4. 青苔自己回复自己（同一账户）只通知站主，不自发自收
    const selfReply = await commentsPost({
      request: s.req('comments', {
        slug: 'talk-20260926',
        identity: 'account',
        parentId: 1,
        replyTo: '青苔',
        replyTarget: { kind: 'reply', id: 1 },
        body: '自言自语',
      }, cookieB),
      env: s.env,
      waitUntil: s.waitUntil,
    } as never);
    expect(selfReply.status).toBe(201);
    await s.drain();

    expect(s.sent).toHaveLength(6);
    expect(s.sent[5].to).toEqual(['a13655515876@163.com']);

    // 5. 删帖触发器清理 comment_emails，账户注销清理 visitor_emails
    s.sqlite.exec('DELETE FROM comments WHERE id = 1');
    expect(s.sqlite.prepare('SELECT COUNT(*) AS n FROM comment_emails').get()?.n).toBe(0);
    expect(idB).toBeTruthy();
  });

  it('友链申请通知站主邮箱，蜜罐拦截不发信', async () => {
    const s = setup();

    const hp = await linkApplyPost({
      request: s.req('link-apply', {
        name: '机器人站',
        href: 'https://bot.example.com',
        desc: '广告',
        avatar: 'https://bot.example.com/a.png',
        website: 'filled-honeypot',
      }),
      env: s.env,
      waitUntil: s.waitUntil,
    } as never);
    expect(hp.status).toBe(201);
    await s.drain();
    expect(s.sent).toHaveLength(0);

    const ok = await linkApplyPost({
      request: s.req('link-apply', {
        name: '好友小站',
        href: 'https://friend.example.com',
        desc: '写点生活与代码',
        avatar: 'https://friend.example.com/avatar.png',
        website: '',
      }),
      env: s.env,
      waitUntil: s.waitUntil,
    } as never);
    expect(ok.status).toBe(201);
    await s.drain();

    expect(s.sent).toHaveLength(1);
    expect(s.sent[0].to).toEqual(['a13655515876@163.com']);
    expect(s.sent[0].text).toContain('好友小站');
    expect(s.sent[0].text).toContain('https://friend.example.com');
    expect(s.sent[0].text).toContain('https://northcedar.top/links/?application=1#link-apply');
  });
});
