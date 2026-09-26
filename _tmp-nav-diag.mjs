/** 移动端导航诊断（_tmp 前缀 = 临时证据）：390 下逐个 nav/抽屉元素的计算样式 + 点击命中 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
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
const BASE = `http://127.0.0.1:${server.address().port}`;
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-navdiag-'));
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

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: BASE + '/about/' });
for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
await sleep(700);

console.log('body class:', await evalJs(`document.body.className`));
console.log('\n所有 nav / 抽屉元素的计算样式:');
console.log(await evalJs(`(() => ['nav','.navtog','.navbtn','.navmask','.navpanel'].map((sel) => [...document.querySelectorAll(sel)].map((e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return sel + ' [' + (e.getAttribute('aria-label') || e.className) + '] display=' + c.display + ' vis=' + c.visibility + ' pos=' + c.position + ' z=' + c.zIndex + ' rect=' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }).join('\\n')).join('\\n')`));

// 打开抽屉，看点「友链」时命中谁
await evalJs(`document.querySelector('.navtog').click()`);
await sleep(600);
console.log('\n打开后:');
console.log(await evalJs(`(() => { const p = document.querySelector('.navpanel'); const c = getComputedStyle(p); const r = p.getBoundingClientRect(); return 'panel display=' + c.display + ' vis=' + c.visibility + ' rect=' + Math.round(r.x) + ',' + Math.round(r.y) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); })()`));
console.log(await evalJs(`(() => { const a = [...document.querySelectorAll('.navpanel a')].find((x) => x.textContent.trim() === '友链'); const b = a.getBoundingClientRect(); const x = Math.round(b.x + b.width / 2), y = Math.round(b.y + b.height / 2); const top = document.elementsFromPoint(x, y).slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + (e.className || '-')); return '友链 rect=' + Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' ⇒ 命中: ' + top.join(' > '); })()`));

ws.close(); chrome.kill(); server.close();
