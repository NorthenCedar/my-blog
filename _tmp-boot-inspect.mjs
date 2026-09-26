/**
 * 一次性探针：量覆盖层各元素的盒模型与定位（_tmp 前缀 = 临时证据）
 * 用法：node _tmp-boot-inspect.mjs [frame]
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const FRAME = Number(process.argv[2] ?? 268);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let f = join(DIST, normalize(url).replace(/^[/\\]+/, ''));
    const st = await stat(f).catch(() => null);
    if (st?.isDirectory()) f = join(f, 'index.html');
    const body = await readFile(f);
    const T = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.woff2': 'font/woff2', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
    res.writeHead(200, { 'content-type': T[extname(f).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-boot-inspect-'));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(150); }
await sleep(500);
await evalJs(`(() => { const o = document.querySelector('[data-boot-overlay]'); o.getAnimations({subtree:true}).forEach(a => { a.pause(); a.currentTime = ${(FRAME - 169) * 40}; }); })()`);
await sleep(200);

const out = await evalJs(`(() => {
  const sels = ['.boot', '.boot-deco', '.boot-bg', '.boot-brand', '.boot-brand-1', '.boot-brand-2', '.boot-brand-3', '.boot-powered', '.boot-logo', '.boot-access', '.boot-auth', '.boot-scan', '.boot-welcome', '.boot-panel', '.boot-company', '.boot-white', '.boot-skip'];
  const rows = [];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el) { rows.push([s, 'MISSING']); continue; }
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    rows.push([s, JSON.stringify({ rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], pos: c.position, left: c.left, top: c.top, transform: c.transform, display: c.display, opacity: c.opacity, zIndex: c.zIndex, overflow: c.overflow })]);
  }
  const de = document.querySelector('.boot-deco');
  const dc = getComputedStyle(de);
  return {
    viewport: [innerWidth, innerHeight],
    htmlClass: document.documentElement.className,
    decoScaleVar: getComputedStyle(document.querySelector('.boot')).getPropertyValue('--boot-scale') || '(none)',
    decoTransform: dc.transform, decoTransformOrigin: dc.transformOrigin, decoWidth: dc.width, decoHeight: dc.height,
    rows,
    animCount: document.querySelector('[data-boot-overlay]').getAnimations({ subtree: true }).length,
  };
})()`);

console.log(`viewport=${out.viewport} html.class="${out.htmlClass}" 动画=${out.animCount} 帧=${FRAME}`);
console.log(`.boot-deco: width=${out.decoWidth} height=${out.decoHeight} origin=${out.decoTransformOrigin}`);
console.log(`.boot-deco transform=${out.decoTransform}`);
for (const [s, v] of out.rows) console.log(`  ${s.padEnd(16)} ${v}`);

ws.close(); chrome.kill(); server.close();
