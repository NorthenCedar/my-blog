/**
 * 手机端"扫描框压字"诊断（_tmp 前缀 = 临时证据）
 * 做两件事：① 390×844 截归档页；② 在标题中心点用 elementsFromPoint 查出叠在上面的元素（含 z-index/位置/背景）
 * 用法：node _tmp-mobile-scan-shot.mjs
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
const BASE = `http://127.0.0.1:${server.address().port}/`;

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-mobile-scan-'));
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
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: BASE + path });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await evalJs(`sessionStorage.setItem('boot-intro','1')`);
  await send('Page.navigate', { url: BASE + path });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await sleep(800);
};

for (const [label, path] of [['archive', '/archive/'], ['home', '/']]) {
  await open(path, 390, 844);
  console.log(`\n=== ${label} ${path} @390×844 ===`);
  // 找一个"可见文字"的元素（标题/条目），在它的中心点查叠了谁
  const probe = await evalJs(`(() => {
    const cand = [...document.querySelectorAll('h1,h2,h3,a,.item,h1 *,article a')].filter((e) => e.textContent && e.textContent.trim().length > 6 && e.getBoundingClientRect().height > 12 && e.getBoundingClientRect().top > 60 && e.getBoundingClientRect().top < innerHeight - 60);
    if (!cand.length) return 'NO_CANDIDATE';
    const t = cand[0];
    const b = t.getBoundingClientRect();
    const x = Math.round(b.x + b.width / 2), y = Math.round(b.y + b.height / 2);
    const stack = document.elementsFromPoint(x, y).slice(0, 5).map((e) => {
      const c = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '') + ' [z=' + c.zIndex + ' pos=' + c.position + ' bg=' + c.backgroundColor + ' blur=' + (c.backdropFilter || '-') + ' rect=' + Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) + ' op=' + c.opacity + ']';
    });
    return JSON.stringify({ at: x + ',' + y, text: t.textContent.trim().slice(0, 24), stack }, null, 1);
  })()`);
  console.log(probe);
  writeFileSync(join(SHOTS, `mobile-scan-${label}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log(`  截图: ${join(SHOTS, `mobile-scan-${label}.png`)}`);
}

ws.close(); chrome.kill(); server.close();
