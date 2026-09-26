/**
 * 导航验收（_tmp 前缀 = 临时证据）
 * 1) PC 1440：右上角横排 —— 逐个真点，断言都跳到了对的地址；顺便截四个新页面
 * 2) 移动 390：汉堡 + 抽屉 —— 点汉堡打开、点遮罩关闭、点某一项跳转
 * 用法：node _tmp-nav-check.mjs            （本地 dist）
 *       $env:SITE='https://northcedar.top' （线上）
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
const SUFFIX = LIVE ? '-live' : '';

// 打线上时必须**等本次部署**：本次改的是导航首项文案（文章 → 主页）+ 文章页高亮归档。
// 别沿用上一版的标记（hud-nav 早就上线了 ⇒ "等"会立刻通过、拍到的还是旧版）。
if (LIVE) {
  const t0 = Date.now();
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    try {
      const html = await (await fetch(BASE + '/', { cache: 'no-store' })).text();
      ok = html.includes('>主页</a>') && !html.includes('>文章</a>');
    } catch { /* 抖动继续等 */ }
    if (!ok) await sleep(5000);
  }
  console.log(ok ? `  本次部署已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s），首项已改名为「主页」` : '  警告：300s 内首项还没改名，验的可能是上一版');
  if (!ok) process.exit(1);
}

let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-nav-'));
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
const open = async (path, w, h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  await send('Page.navigate', { url: BASE + path });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await evalJs(`sessionStorage.setItem('boot-intro','1')`);
  await send('Page.navigate', { url: BASE + path });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await sleep(600);
};
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(900);
};
const shot = async (name) => {
  writeFileSync(join(SHOTS, name + SUFFIX + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log(`  截图: ${join(SHOTS, name + SUFFIX + '.png')}`);
};

console.log('=== ① PC 1440：右上角横排逐项真点 ===');
await open('/about/', 1440, 900);
const row = await evalJs(`(() => { const n = document.querySelector('nav[aria-label="主导航"]'); const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return JSON.stringify({ display: cs.display, right: Math.round(innerWidth - r.right), items: [...n.querySelectorAll('a')].map((a) => a.textContent.trim()) }); })()`);
const info = JSON.parse(row);
console.log(`  导航项: ${info.items.join(' ')}（右边距 ${info.right}px）`);
check('PC：横排可见且有 10 个链接（9 项 + RSS）', `${info.display}/${info.items.length}`, 'flex/10');
check('PC：抽屉不显示', await evalJs(`getComputedStyle(document.querySelector('.navbtn')).display`), 'none');
check('PC：右上角（右边距 < 60px）', info.right < 60 ? 'true' : `false（${info.right}）`, 'true');

// 逐项真点：断言落到对应地址（用户要求"每一个都要能点进去"）
const targets = [['关于', '/about/'], ['归档', '/archive/'], ['友链', '/links/'], ['说说', '/talks/'], ['留言', '/guestbook/'], ['相册', '/gallery/'], ['日志', '/log/'], ['标签', '/tags/']];
for (const [label, path] of targets) {
  await open('/about/', 1440, 900);
  const hit = await evalJs(`(() => { const a = [...document.querySelectorAll('nav[aria-label="主导航"] a')].find((x) => x.textContent.trim() === '${label}'); if (!a) return null; const b = a.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
  if (!hit) { check(`PC 点「${label}」`, '找不到该项', path); continue; }
  await clickAt(hit.x, hit.y);
  const url = await evalJs(`location.pathname`);
  check(`PC 点「${label}」→ ${path}`, url, path);
}
await open('/about/', 1440, 900);
await shot('nav-pc-about');

console.log('\n=== ② 四个新页面（PC 截图人眼看）===');
for (const p of ['/links/', '/talks/', '/guestbook/', '/log/']) {
  await open(p, 1440, 900);
  const bad = await evalJs(`document.body.innerText.includes('undefined') || document.body.innerText.includes('NaN')`);
  check(`${p} 渲染正常（无 undefined/NaN）`, bad ? 'true' : 'false', 'false');
  await shot(`nav-page${p.replace(/\//g, '-').replace(/-$/, '')}`);
}

console.log('\n=== ③ 移动 390：汉堡 + 抽屉 ===');
await open('/about/', 390, 844);
check('移动：横排导航已隐藏', await evalJs(`getComputedStyle(document.querySelector('nav[aria-label="主导航"]')).display`), 'none');
check('移动：汉堡可见', await evalJs(`getComputedStyle(document.querySelector('.navbtn')).display`), 'flex');
check('移动：抽屉初始不可见（visibility）', await evalJs(`getComputedStyle(document.querySelector('.navpanel')).visibility`), 'hidden');
await shot('nav-mobile-closed');
const burger = await evalJs(`(() => { const b = document.querySelector('.navbtn').getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
await clickAt(burger.x, burger.y);
check('点汉堡后：面板可见', await evalJs(`getComputedStyle(document.querySelector('.navpanel')).visibility`), 'visible');
check('点汉堡后：遮罩可见', await evalJs(`getComputedStyle(document.querySelector('.navmask')).visibility`), 'visible');
check('点汉堡后：滚动静止（html overflow）', await evalJs(`getComputedStyle(document.documentElement).overflow`), 'hidden');
check('抽屉里有 10 个链接（9 项 + RSS）', await evalJs(`document.querySelectorAll('.navpanel a').length`), '10');
await shot('nav-mobile-open');
// 点遮罩关闭
await clickAt(40, 700);
check('点遮罩后：面板收起', await evalJs(`getComputedStyle(document.querySelector('.navpanel')).visibility`), 'hidden');
// 再开一次，点「友链」跳转
await clickAt(burger.x, burger.y);
await sleep(500);
const item = await evalJs(`(() => { const a = [...document.querySelectorAll('.navpanel a')].find((x) => x.textContent.trim() === '友链'); const b = a.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
await clickAt(item.x, item.y);
await sleep(800);
check('移动：点抽屉里的「友链」→ /links/', await evalJs(`location.pathname`), '/links/');

console.log('\n=== ④ 首页（console 外壳）也要有导航 ===');
await open('/', 1440, 900);
const homeNav = await evalJs(`(() => { const n = document.querySelector('nav[aria-label="主导航"]'); if (!n) return 'MISSING'; const r = n.getBoundingClientRect(); return JSON.stringify({ display: getComputedStyle(n).display, right: Math.round(innerWidth - r.right), top: Math.round(r.top), items: [...n.querySelectorAll('a')].map((a) => a.textContent.trim()) }); })()`);
const hn = JSON.parse(homeNav);
console.log(`  首页导航: ${hn.items.join(' ')}（右边距 ${hn.right}px · 距顶 ${hn.top}px）`);
check('首页：横排导航在（10 项）', `${hn.display}/${hn.items.length}`, 'flex/10');
// 首页右上是「导航 + HUD 读数」并排：读数占最右一格，导航紧挨它左边 ⇒ 右边距约 130px 属设计内。
// （所以判据是"在右上角区域"，不是"贴到视口右边" —— 写成 <60px 是我一开始把设计想错了。）
check('首页：在右上角区域（右边距 < 260px 且距顶 < 60px）', hn.right < 260 && hn.top < 60 ? 'true' : `false（右 ${hn.right} 顶 ${hn.top}）`, 'true');
check('首页：读数仍在最右（导航不该把它挤走）', await evalJs(`(() => { const r = document.querySelector('.readout').getBoundingClientRect(); return Math.round(innerWidth - r.right) < 40 ? 'true' : 'false(' + Math.round(innerWidth - r.right) + ')'; })()`), 'true');
// 首页点「友链」也应能进去
const hHit = await evalJs(`(() => { const a = [...document.querySelectorAll('nav[aria-label="主导航"] a')].find((x) => x.textContent.trim() === '友链'); const b = a.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
await clickAt(hHit.x, hHit.y);
check('首页点「友链」→ /links/', await evalJs(`location.pathname`), '/links/');
await open('/', 1440, 900);
await shot('nav-home-pc');
// 首页移动端：HUD 里的横排收起、抽屉可用
await open('/', 390, 844);
check('首页移动：横排收起', await evalJs(`getComputedStyle(document.querySelector('nav[aria-label="主导航"]')).display`), 'none');
check('首页移动：汉堡可见', await evalJs(`getComputedStyle(document.querySelector('.navbtn')).display`), 'flex');
const hb = await evalJs(`(() => { const b = document.querySelector('.navbtn').getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
await clickAt(hb.x, hb.y);
check('首页移动：抽屉打开', await evalJs(`getComputedStyle(document.querySelector('.navpanel')).visibility`), 'visible');
await shot('nav-home-mobile-open');
const hItem = await evalJs(`(() => { const a = [...document.querySelectorAll('.navpanel a')].find((x) => x.textContent.trim() === '日志'); const b = a.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
await clickAt(hItem.x, hItem.y);
check('首页移动：点抽屉里的「日志」→ /log/', await evalJs(`location.pathname`), '/log/');

ws.close(); chrome.kill(); server.close();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：导航验收符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
