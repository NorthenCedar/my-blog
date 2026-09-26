/**
 * 光标素材对照页截图（_tmp 前缀 = 临时证据）
 * 为什么要专门做这个：**系统光标拍不进截图**（CDP 截图不含鼠标指针），
 * 所以"这个光标长什么样"只能把素材本身放大摆出来看。真实页面上只能验计算样式。
 * 用法：node _tmp-cursor-review.mjs
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
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.css': 'text/css; charset=utf-8' };

const ITEMS = [
  ['normal', '正常选择 → default'],
  ['text', '文本选择 → text'],
  ['link', '链接选择 → pointer'],
];
const row = (zoom) =>
  ITEMS.map(
    ([f, label]) =>
      `<div style="text-align:center"><img src="/cursors/${f}.png" width="${32 * zoom}" height="${32 * zoom}" style="image-rendering:${zoom > 1 ? 'pixelated' : 'auto'};outline:1px dashed #b9b6ae"><div>${label}${zoom > 1 ? ` · ${zoom}×` : ''}</div></div>`,
  ).join('');

const PAGE = `<!doctype html><meta charset="utf-8"><title>cursor review</title>
<body style="margin:0;background:#fafaf7;font:13px/1.7 ui-monospace,Consolas,monospace;color:#1a1a1a">
<div style="padding:20px">
  <div style="font-weight:700;margin-bottom:12px">纸面 #fafaf7（博客正文底）—— 1× 实际大小</div>
  <div style="display:flex;gap:28px;align-items:flex-start;margin-bottom:24px">${row(1)}</div>
  <div style="font-weight:700;margin-bottom:12px">纸面 —— 8× 放大（看折面与描边）</div>
  <div style="display:flex;gap:28px;align-items:flex-start;margin-bottom:28px">${row(8)}</div>
  <div style="background:#0e0e0e;color:#ededed;padding:20px;margin:0 -20px -20px">
    <div style="font-weight:700;margin-bottom:12px">深底 #0e0e0e（控制台 / 代码块）—— 1× 与 4×</div>
    <div style="display:flex;gap:28px;align-items:flex-start;margin-bottom:16px">${row(1)}</div>
    <div style="display:flex;gap:28px;align-items:flex-start">${row(4)}</div>
  </div>
</div>`;

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (url === '/') {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      return res.end(PAGE);
    }
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
const profile = await mkdtemp(join(tmpdir(), 'dsh-cursor-review-'));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 620, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(150); }
await sleep(400);
// 素材有没有真的取到（404 的 img 会是 0 宽）
const loaded = await evalJs(`[...document.images].map((i) => i.currentSrc.split('/').pop() + '=' + i.naturalWidth + 'x' + i.naturalHeight).join(' ')`);
console.log('素材加载:', loaded);
const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
const f = join(SHOTS, 'cursor-review.png');
writeFileSync(f, Buffer.from(data, 'base64'));
console.log('对照页截图:', f);
ws.close(); chrome.kill(); server.close();
