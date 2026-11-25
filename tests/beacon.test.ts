import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Window } from 'happy-dom';
import { visitorDatabase } from './_visitor-db';
import { onRequest as middlewareOnRequest } from '../functions/_middleware';
import {
  BEACON_BUNDLE_KEY,
  BEACON_DOCS,
  parseBeaconKey,
  signUnlockToken,
  verifyUnlockToken,
  type BeaconEnv,
} from '../functions/api/_lib/beacon';
import { onRequestPost as verifyPost } from '../functions/api/beacon/verify';
import { onRequestGet as downloadGet } from '../functions/api/beacon/download';
import { onRequestGet as docGet } from '../functions/api/beacon/doc';
import { onRequestGet as solversGet, onRequestPost as solversPost } from '../functions/api/beacon/solvers';
import { renderMarkdownSafe } from '../src/scripts/beacon-terminal';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'beacon', 'index.html'));

const closers: (() => void)[] = [];
afterEach(() => {
  closers.splice(0).forEach((fn) => fn());
});

// 仅用于单元测试的合成密钥与口令（绝不存放生产真实口令）
const TEST_SIGNING_KEY = 'f'.repeat(64);
const TEST_PARTS = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'] as const;
const TEST_MASTER = `BEACON-${TEST_PARTS.join('-')}`;

function testHmac(msg: string) {
  return createHmac('sha256', TEST_SIGNING_KEY).update(msg).digest('hex');
}

const TEST_HASHES = JSON.stringify({
  s: TEST_PARTS.map((p, i) => testHmac(`stage:${i + 1}:${p}`)),
  m: testHmac(`master:${TEST_MASTER}`),
});

function createFakeR2(objects: Record<string, Uint8Array | string>): R2Bucket {
  return {
    async get(key: string) {
      if (!Object.prototype.hasOwnProperty.call(objects, key)) return null;
      const val = objects[key];
      const bytes = typeof val === 'string' ? new TextEncoder().encode(val) : val;
      return {
        size: bytes.byteLength,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        async text() {
          return new TextDecoder().decode(bytes);
        },
      } as unknown as R2ObjectBody;
    },
  } as unknown as R2Bucket;
}

function setupBeaconEnv(withTable = true) {
  const { sqlite, db } = visitorDatabase();
  closers.push(() => sqlite.close());
  if (withTable) {
    sqlite.exec(readFileSync('migrations/0017_beacon_solvers.sql', 'utf8'));
  }

  const fakeZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
  const vault = createFakeR2({
    [BEACON_BUNDLE_KEY]: fakeZip,
    [BEACON_DOCS.readme.key]: '# Beacon README\n\n- 安全学习\n\n```bash\necho ok\n```',
    [BEACON_DOCS['local-deploy'].key]: '# 单机部署\n\n| 项 | 值 |\n| --- | --- |\n| 端口 | 4444 |',
  });

  const ownerToken = 'e'.repeat(64);
  sqlite.prepare('INSERT INTO visitor_accounts(id,username,nickname,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,?)')
    .run('owner-id', 'owner', '北杉', 'pw', 'rc', '2026-11-25');
  sqlite.prepare('INSERT INTO visitor_sessions(token_hash,user_id,auth_version,expires_at) VALUES(?,?,0,?)')
    .run(createHash('sha256').update(ownerToken).digest('hex'), 'owner-id', Date.now() + 86_400_000);

  const env: BeaconEnv = {
    COMMENTS_DB: db,
    OWNER_USER_ID: 'owner-id',
    BEACON_VAULT: vault,
    BEACON_SIGNING_KEY: TEST_SIGNING_KEY,
    BEACON_HASHES: TEST_HASHES,
  };

  const jsonReq = (path: string, body: unknown, ip = '198.51.100.10', extraHeaders: Record<string, string> = {}) =>
    new Request(`https://northcedar.top${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://northcedar.top',
        'X-NC-Request': '1',
        'CF-Connecting-IP': ip,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });

  const getReq = (path: string) =>
    new Request(`https://northcedar.top${path}`, {
      method: 'GET',
      headers: { Origin: 'https://northcedar.top' },
    });

  return { env, fakeZip, jsonReq, getReq, ownerToken };
}

describe('BEACON 解谜后端校验、R2 流式下载、文档预览与通关榜', () => {
  it('parseBeaconKey 支持完整格式与省前缀格式，并拒绝非法字符', () => {
    expect(parseBeaconKey('beacon-alpha-bravo-charlie-delta')).toEqual({
      canonical: TEST_MASTER,
      parts: [...TEST_PARTS],
    });
    expect(parseBeaconKey('alpha-bravo-charlie-delta')).toEqual({
      canonical: TEST_MASTER,
      parts: [...TEST_PARTS],
    });
    expect(parseBeaconKey('BEACON-ONLY-TWO')).toBeNull();
    expect(parseBeaconKey('BEACON-A-<SCRIPT>-C-D')).toBeNull();
  });

  it('校验接口：未勾选声明拒收、分段不匹配返回精准段位反馈、全命中签发限时令牌', async () => {
    const { env, jsonReq } = setupBeaconEnv();

    const noAgree = await verifyPost({
      request: jsonReq('/api/beacon/verify', { key: TEST_MASTER, agreed: false }),
      env,
    } as never);
    expect(noAgree.status).toBe(400);

    const partial = await verifyPost({
      request: jsonReq('/api/beacon/verify', { key: 'BEACON-ALPHA-WRONG-CHARLIE-WRONG', agreed: true }),
      env,
    } as never);
    expect(partial.status).toBe(403);
    const partialData = (await partial.json()) as { ok: boolean; matched: boolean[]; error: string };
    expect(partialData.ok).toBe(false);
    expect(partialData.matched).toEqual([true, false, true, false]);
    expect(partialData.error).toContain('第 2、4 段不匹配');

    const okRes = await verifyPost({
      request: jsonReq('/api/beacon/verify', { key: TEST_MASTER.toLowerCase(), agreed: true }),
      env,
    } as never);
    expect(okRes.status).toBe(200);
    const okData = (await okRes.json()) as {
      ok: boolean;
      token: string;
      expiresAt: number;
      bundleName: string;
      docs: Array<{ id: string }>;
    };
    expect(okData.ok).toBe(true);
    expect(okData.bundleName).toBe('beacon-framework-bundle.zip');
    expect(okData.docs.map((d) => d.id)).toEqual(['readme', 'local-deploy']);
    expect(okData.expiresAt).toBeGreaterThan(Date.now());
  });

  it('下载与在线文档预览接口：校验签名令牌、拒绝篡改或过期令牌、并从私有 R2 流式读取', async () => {
    const { env, fakeZip, getReq } = setupBeaconEnv();
    const { token } = await signUnlockToken(TEST_SIGNING_KEY, Date.now());

    // 有效下载
    const dlRes = await downloadGet({
      request: getReq(`/api/beacon/download?t=${encodeURIComponent(token)}`),
      env,
    } as never);
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get('Content-Type')).toBe('application/zip');
    expect(dlRes.headers.get('Content-Disposition')).toContain('beacon-framework-bundle.zip');
    expect(dlRes.headers.get('Cache-Control')).toBe('no-store');
    expect(new Uint8Array(await dlRes.arrayBuffer())).toEqual(fakeZip);

    // 篡改令牌被拒
    const tampered = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
    const badDl = await downloadGet({
      request: getReq(`/api/beacon/download?t=${encodeURIComponent(tampered)}`),
      env,
    } as never);
    expect(badDl.status).toBe(403);

    // 过期令牌被拒
    const expired = await signUnlockToken(TEST_SIGNING_KEY, Date.now() - 20 * 60 * 1000);
    const expCheck = await verifyUnlockToken(expired.token, TEST_SIGNING_KEY, Date.now());
    expect(expCheck.ok).toBe(false);

    // 合法文档预览
    const readmeRes = await docGet({
      request: getReq(`/api/beacon/doc?name=readme&t=${encodeURIComponent(token)}`),
      env,
    } as never);
    expect(readmeRes.status).toBe(200);
    const readmeData = (await readmeRes.json()) as { ok: boolean; markdown: string };
    expect(readmeData.ok).toBe(true);
    expect(readmeData.markdown).toContain('# Beacon README');

    // 非法文档名被拒
    const badName = await docGet({
      request: getReq(`/api/beacon/doc?name=../../secret&t=${encodeURIComponent(token)}`),
      env,
    } as never);
    expect(badName.status).toBe(400);
  });

  it('通关信号榜（方案 A）：访客解锁自动计入排名、同令牌原位改名与留言不重复计数、站主测试不占排名', async () => {
    const { env, jsonReq, getReq, ownerToken } = setupBeaconEnv(false); // 顺带测试自动建表兜底
    const initBoard = await solversGet({ request: getReq('/api/beacon/solvers'), env } as never);
    expect(initBoard.status).toBe(200);
    expect(await initBoard.json()).toEqual({ total: 0, items: [] });

    // 1. 站主账号解锁：允许下载预览，但 isOwner=true 且不计入排名
    const ownerVerify = await verifyPost({
      request: jsonReq('/api/beacon/verify', { key: TEST_MASTER, agreed: true }, '198.51.100.5', {
        Cookie: `__Host-nc_session=${ownerToken}`,
      }),
      env,
    } as never);
    expect(ownerVerify.status).toBe(200);
    const ownerData = (await ownerVerify.json()) as { ok: boolean; isOwner: boolean; rank: number | null; total: number; token: string };
    expect(ownerData.ok).toBe(true);
    expect(ownerData.isOwner).toBe(true);
    expect(ownerData.rank).toBeNull();
    expect(ownerData.total).toBe(0);

    // 站主调用 register 也被礼貌拒绝，不占用访客排名
    const ownerClaim = await solversPost({
      request: jsonReq('/api/beacon/solvers', { token: ownerData.token, codename: '站主', note: 'test' }, '198.51.100.5', {
        Cookie: `__Host-nc_session=${ownerToken}`,
      }),
      env,
    } as never);
    expect(ownerClaim.status).toBe(403);

    // 2. 普通访客解锁：自动计入 #1（默认“匿名信号”）
    const v1 = await verifyPost({
      request: jsonReq('/api/beacon/verify', { key: TEST_MASTER, agreed: true }, '198.51.100.10'),
      env,
    } as never);
    expect(v1.status).toBe(200);
    const v1Data = (await v1.json()) as { isOwner: boolean; rank: number; codename: string; total: number; token: string };
    expect(v1Data.isOwner).toBe(false);
    expect(v1Data.rank).toBe(1);
    expect(v1Data.codename).toBe('匿名信号');
    expect(v1Data.total).toBe(1);

    // 拒绝非法脚本内容
    const badName = await solversPost({
      request: jsonReq('/api/beacon/solvers', { token: v1Data.token, codename: '<img onerror=1>', note: 'hi' }),
      env,
    } as never);
    expect(badName.status).toBe(400);

    // 同一解锁令牌修改代号并留言：原位更新 #1，总数仍为 1（绝不重复刷榜）
    const claim1 = await solversPost({
      request: jsonReq('/api/beacon/solvers', { token: v1Data.token, codename: 'GhostOwl', note: '频谱图很好玩' }),
      env,
    } as never);
    expect(claim1.status).toBe(200);
    const claim1Data = (await claim1.json()) as { ok: boolean; updated: boolean; entry: { rank: number; codename: string; note: string }; total: number };
    expect(claim1Data.ok).toBe(true);
    expect(claim1Data.updated).toBe(true);
    expect(claim1Data.entry.rank).toBe(1);
    expect(claim1Data.entry.codename).toBe('GhostOwl');
    expect(claim1Data.entry.note).toBe('频谱图很好玩');
    expect(claim1Data.total).toBe(1);

    // keepCodename=true（对应终端 say 命令）：保留 GhostOwl，只更新留言
    const say1 = await solversPost({
      request: jsonReq('/api/beacon/solvers', { token: v1Data.token, codename: '', note: '四关全都解开了！', keepCodename: true }),
      env,
    } as never);
    expect(say1.status).toBe(200);
    const say1Data = (await say1.json()) as { entry: { rank: number; codename: string; note: string }; total: number };
    expect(say1Data.entry.codename).toBe('GhostOwl');
    expect(say1Data.entry.note).toBe('四关全都解开了！');
    expect(say1Data.total).toBe(1);

    // 第二位访客解锁自动计入 #2
    const v2 = await verifyPost({
      request: jsonReq('/api/beacon/verify', { key: TEST_MASTER, agreed: true }, '198.51.100.11'),
      env,
    } as never);
    const v2Data = (await v2.json()) as { rank: number; codename: string; total: number };
    expect(v2Data.rank).toBe(2);
    expect(v2Data.codename).toBe('匿名信号');
    expect(v2Data.total).toBe(2);

    const boardAfter = await solversGet({ request: getReq('/api/beacon/solvers'), env } as never);
    const boardJson = (await boardAfter.json()) as { total: number; items: Array<{ rank: number; codename: string; note: string }> };
    expect(boardJson.total).toBe(2);
    expect(boardJson.items[0].rank).toBe(2);
    expect(boardJson.items[1]).toMatchObject({ rank: 1, codename: 'GhostOwl', note: '四关全都解开了！' });
  });

  it('校验接口内置单 IP 限流，连续爆破被 429 拦截', async () => {
    const { env, jsonReq } = setupBeaconEnv();
    let lastStatus = 0;
    for (let i = 0; i < 13; i++) {
      const res = await verifyPost({
        request: jsonReq('/api/beacon/verify', { key: 'BEACON-NOPE-NOPE-NOPE-NOPE', agreed: true }, '198.51.100.99'),
        env,
      } as never);
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe('BEACON 前端无 innerHTML 渲染与全站埋点结构校验', () => {
  it('renderMarkdownSafe 纯 DOM 渲染标题/表格/代码/安全链接，绝不执行脚本或非法协议', () => {
    const win = new Window();
    const prevDoc = globalThis.document;
    globalThis.document = win.document as unknown as Document;
    try {
      const host = win.document.createElement('div') as unknown as HTMLElement;
      renderMarkdownSafe(
        host,
        '# 标题\n\n普通段落 **加粗** `code` [安全链接](https://example.com) [危险](javascript:alert(1))\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconsole.log(1)\n```',
      );
      expect(host.querySelector('h1')?.textContent).toBe('标题');
      expect(host.querySelector('strong')?.textContent).toBe('加粗');
      expect(host.querySelectorAll('a').length).toBe(1);
      expect(host.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
      expect(host.querySelectorAll('table th').length).toBe(2);
      expect(host.querySelector('pre code')?.textContent).toBe('console.log(1)');
    } finally {
      globalThis.document = prevDoc;
    }
  });

  it('终端脚本零 innerHTML，且源码仓库不含三个私密归档文件', () => {
    const scriptSrc = readFileSync(join(ROOT, 'src/scripts/beacon-terminal.ts'), 'utf8');
    expect(scriptSrc).not.toContain('innerHTML');
    expect(existsSync(join(ROOT, 'public/signals/beacon-framework-261109.zip'))).toBe(false);
    expect(existsSync(join(ROOT, 'public/signals/beacon-framework-bundle.zip'))).toBe(false);
  });

  it('第 2 关 PNG 图种与第 3 关 WAV 声谱素材结构完整', () => {
    const pngBytes = readFileSync(join(ROOT, 'public/signals/beacon-card.png'));
    // PNG magic + tEXt metadata + IEND + appended ZIP local header & EOCD
    expect(pngBytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(pngBytes.includes(Buffer.from('tEXt'))).toBe(true);
    expect(pngBytes.includes(Buffer.from('IEND'))).toBe(true);
    expect(pngBytes.includes(Buffer.from('PK\x03\x04'))).toBe(true);
    expect(pngBytes.includes(Buffer.from('PK\x05\x06'))).toBe(true);

    const wavBytes = readFileSync(join(ROOT, 'public/signals/beacon-tone.wav'));
    expect(wavBytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wavBytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wavBytes.readUInt32LE(24)).toBe(44100);
    expect(wavBytes.readUInt16LE(22)).toBe(1);
    expect(wavBytes.readUInt16LE(34)).toBe(16);
  });

  it('中间件在 /posts/monitor-progress/ 附带 X-Beacon-Signal 响应头，其余页面不附带', async () => {
    const targetRes = await middlewareOnRequest({
      request: new Request('https://northcedar.top/posts/monitor-progress/'),
      next: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    } as never);
    expect(targetRes.headers.get('X-Beacon-Signal')).toContain('caesar-shift=channels*4');

    const otherRes = await middlewareOnRequest({
      request: new Request('https://northcedar.top/about/'),
      next: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    } as never);
    expect(otherRes.headers.get('X-Beacon-Signal')).toBeNull();
  });

  it.skipIf(!hasDist)('构建产物验证：/beacon/ 隐藏不进 sitemap 且带 noindex，各关线索注释完好', () => {
    const beaconHtml = readFileSync(join(DIST, 'beacon', 'index.html'), 'utf8');
    expect(beaconHtml).toContain('name="robots"');
    expect(beaconHtml).toContain('noindex');
    expect(beaconHtml).toContain('data-beacon-root');
    expect(beaconHtml).not.toContain('data-music');
    expect(beaconHtml).not.toContain('class="topbar');

    const sitemap = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8');
    expect(sitemap).not.toContain('/beacon/');

    const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
    expect(robots).toContain('/posts/monitor-progress/');
    expect(robots).not.toContain('/beacon/');

    const postHtml = readFileSync(join(DIST, 'posts', 'monitor-progress', 'index.html'), 'utf8');
    expect(postHtml).toContain('[BEACON // 00]');
    expect(postHtml).toContain('[BEACON // STAGE 1]');

    const html404 = readFileSync(join(DIST, '404.html'), 'utf8');
    expect(html404).toContain('[BEACON // STAGE 4]');
  });
});
