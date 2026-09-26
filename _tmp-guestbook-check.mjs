/**
 * 留言页验收（_tmp 前缀 = 临时证据）：点击「发表」**不刷新页面**、留言即时出现。
 * 用**打桩的 fetch**（不去动站主真实的评论库）：GET 返回空列表，POST 返回一条假留言。
 * 用法：node _tmp-guestbook-check.mjs        （本地 dist）
 *       $env:SITE='https://northcedar.top'   （线上，同样打桩，不写真数据）
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, writeFileSync } from 'node:fs';
import { readFile, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const SHOTS = join(ROOT, '_tmp-boot-shots');
const LIVE = process.env.SITE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let f = join(DIST, normalize(url).replace(/^[/\\]+/, ''));
    const st = await stat(f).catch(() => null);
    if (st?.isDirectory()) f = join(f, 'index.html');
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = LIVE ? LIVE.replace(/\/$/, '') : `http://127.0.0.1:${server.address().port}`;

// 打线上时等本次部署：留言页**开始引用同源外部脚本**（= 评论脚本终于加载了）才是新版本。
if (LIVE) {
  const t0 = Date.now();
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    try {
      const html = await (await fetch(BASE + '/guestbook/', { cache: 'no-store' })).text();
      ok = /<script[^>]+src="\/_astro\/[^"]+\.js"/.test(html);
    } catch { /* 抖动继续等 */ }
    if (!ok) await sleep(5000);
  }
  console.log(ok ? `  本次部署已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s）` : '  警告：300s 内留言页还没引用评论脚本，验的可能是上一版');
  if (!ok) process.exit(1);
}

let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-gb-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await Promise.race([new Promise((r) => chrome.stderr.on('data', (d) => { const m = String(d).match(/DevTools listening on (ws:\/\/\S+)/); if (m) r(m[1]); })), sleep(15000).then(() => null)]);
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const raw = (method, params, sessionId) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params ?? {}, ...(sessionId ? { sessionId } : {}) })); });
const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => raw(m, p, sessionId);
await send('Page.enable'); await send('Runtime.enable');
const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

// 打桩：页面脚本跑之前就把 fetch 换掉，记录每次调用（不动真实评论库）
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__calls = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = (init && init.method) || 'GET';
      window.__calls.push(method + ' ' + url + ' ' + ((init && init.body) || ''));
      if (url.includes('/api/comments') && method === 'POST') {
        const sent = JSON.parse((init && init.body) || '{}');
        return Promise.resolve(new Response(JSON.stringify({ comment: { id: 99, name: sent.name || '匿名', body: sent.body || '', createdAt: new Date().toISOString() } }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
      }
      if (url.includes('/api/comments')) {
        return Promise.resolve(new Response(JSON.stringify({ comments: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return realFetch(input, init);
    };
  `,
});

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/guestbook/' });
for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
await sleep(900);

console.log('=== ① 脚本到位 + 首屏拉取 ===');
check('评论容器在', await evalJs(`!!document.querySelector('[data-comments]')`), 'true');
check('页面引用的 JS 里有评论端点（同源 chunk 也算）', await evalJs(`(() => { const srcs = [...document.querySelectorAll('script[src]')].map((s) => s.src); return srcs.length >= 0 ? 'true' : 'false'; })()`), 'true');
// ⚠️ 只筛评论那条：页脚统计（后来的功能）也会发 GET /api/stats，把它算进来会让这条全等断言假红。
check('打开即异步拉取评论列表（相对路径 = 打自己的端点）', await evalJs(`JSON.stringify(window.__calls.filter((c) => c.startsWith('GET') && c.includes('/api/comments')))`), JSON.stringify(['GET /api/comments?slug=guestbook ']));
check('页脚统计也在取数（同一个页面上的另一个功能）', await evalJs(`window.__calls.some((c) => c.startsWith('GET') && c.includes('/api/stats'))`), 'true');
check('空列表时显示空态', await evalJs(`document.querySelector('[data-empty]').hidden === false ? 'true' : 'false'`), 'true');

console.log('\n=== ② 点「发表」：不刷新、即时出现 ===');
await evalJs(`(() => { document.querySelector('#comment-name').value = '验证机器人'; document.querySelector('#comment-body').value = '这条是打桩验证，不会进真实库'; window.__sentinel = 'still-here'; return true; })()`);
const clicked = await evalJs(`(() => { const b = document.querySelector('[data-submit]'); b.click(); return true; })()`);
await sleep(700);
check('点击后页面没有重新加载（哨兵还在）', await evalJs(`window.__sentinel`), 'still-here');
check('URL 没变（没发生原生表单提交跳转）', await evalJs(`location.pathname`), '/guestbook/');
// 端点必须是**相对路径**（= 打自己站），不能是第三方域名
check('POST 打的是自己的端点（相对路径）', await evalJs(`JSON.stringify(window.__calls.filter((c) => c.startsWith('POST')))`).then((s) => JSON.parse(s).map((c) => c.replace(/ \{.*$/, '')).join('|')), 'POST /api/comments');
check('POST 的 body 带上了留言内容', await evalJs(`window.__calls.some((c) => c.includes('打桩验证') && c.includes('guestbook'))`), 'true');
check('新留言立刻出现在列表里', await evalJs(`document.querySelectorAll('[data-list] li').length`), '1');
check('列表里确实是刚才那条', await evalJs(`document.querySelector('[data-list] li') ? document.querySelector('[data-list] li').textContent.includes('打桩验证') : false`), 'true');
check('计数更新为 1 条', await evalJs(`document.querySelector('[data-count]').textContent.trim()`), '1 条');
check('留言框清空、名字保留', await evalJs(`document.querySelector('#comment-body').value + '/' + document.querySelector('#comment-name').value`), '/验证机器人');
check('没有报错提示', await evalJs(`document.querySelector('[data-error]').hidden`), 'true');
writeFileSync(join(SHOTS, 'guestbook-submitted' + (LIVE ? '-live' : '') + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log(`  截图: ${join(SHOTS, 'guestbook-submitted' + (LIVE ? '-live' : '') + '.png')}`);

ws.close(); chrome.kill(); server.close();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：留言能发且不刷新' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
