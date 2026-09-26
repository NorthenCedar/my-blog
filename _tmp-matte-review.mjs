/**
 * 抠图结果对照页（_tmp 前缀 = 临时证据）：纸面/深底 × 1×/3×，把 32/48/64 三档并排
 * 用法：node _tmp-matte-review.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { readdir, readFile, mkdtemp, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const MATTE = join(ROOT, '_tmp-boot-shots/matte');
const SRC = join(ROOT, 'assets/cursors-source');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.png': 'image/png', '.html': 'text/html; charset=utf-8' };

const page = (files) => `<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#fafaf7;font:13px/1.6 ui-monospace,Consolas,monospace;color:#1a1a1a">
<div style="padding:18px">
  <div style="font-weight:700;margin-bottom:10px">原图（参考）与抠图结果 —— 纸面 #fafaf7</div>
  <div style="display:flex;gap:22px;align-items:flex-end;margin-bottom:22px">
    <div style="text-align:center"><img src="/src/normal.png" width="199" height="244" style="outline:1px dashed #b9b6ae"><div>原图 normal</div></div>
    <div style="text-align:center"><img src="/src/link.png" width="244" height="310" style="outline:1px dashed #b9b6ae"><div>原图 link</div></div>
    ${files.map((f) => `<div style="text-align:center"><img src="/matte/${f}" width="${Number(f.match(/-(\d+)\./)[1])}" height="${Number(f.match(/-(\d+)\./)[1])}" style="outline:1px dashed #b9b6ae"><div>${f} 1×</div></div>`).join('')}
  </div>
  <div style="font-weight:700;margin-bottom:10px">3× 放大（看折面/描边/洞）</div>
  <div style="display:flex;gap:22px;align-items:flex-end;margin-bottom:24px">
    ${files.map((f) => { const s = Number(f.match(/-(\d+)\./)[1]); return `<div style="text-align:center"><img src="/matte/${f}" width="${s * 3}" height="${s * 3}" style="image-rendering:pixelated;outline:1px dashed #b9b6ae"><div>${f} 3×</div></div>`; }).join('')}
  </div>
  <div style="background:#0e0e0e;color:#ededed;padding:18px;margin:0 -18px -18px">
    <div style="font-weight:700;margin-bottom:10px">深底 #0e0e0e —— 洞必须是透的（是白的就说明被填了）</div>
    <div style="display:flex;gap:22px;align-items:flex-end">
      ${files.map((f) => { const s = Number(f.match(/-(\d+)\./)[1]); return `<div style="text-align:center"><img src="/matte/${f}" width="${s * 3}" height="${s * 3}" style="image-rendering:pixelated"><div>${f} 3×</div></div>`; }).join('')}
    </div>
  </div>
</div>`;

const files = (await readdir(MATTE)).filter((f) => f.endsWith('.png')).sort();
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (url === '/') { res.writeHead(200, { 'content-type': TYPES['.html'] }); return res.end(page(files)); }
    const map = url.startsWith('/matte/') ? MATTE : url.startsWith('/src/') ? SRC : null;
    const f = map ? join(map, normalize(url.replace(/^\/(matte|src)\//, ''))) : null;
    const st = f ? await stat(f).catch(() => null) : null;
    if (!f || !st) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': TYPES[extname(f).toLowerCase()] ?? 'application/octet-stream' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-matte-'));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(150); }
await sleep(400);
const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
const f = join(ROOT, '_tmp-boot-shots/matte-review.png');
writeFileSync(f, Buffer.from(data, 'base64'));
console.log('对照页截图:', f);
ws.close(); chrome.kill(); server.close();
