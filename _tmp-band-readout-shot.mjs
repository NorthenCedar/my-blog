/**
 * 扫描读数压字：改前/改后对照（_tmp 前缀 = 临时证据）
 * 做法：390×844 打开首页 → 置好 sessionStorage 跳过开场 → 滚动到"钢琴八级之后"标题正好落在扫描带（50vh）上 → 截图
 * 用法：node _tmp-band-readout-shot.mjs <before|after>
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
const TAG = process.argv[2] === 'after' ? 'after' : 'before';
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
const BASE = process.env.SITE ? process.env.SITE.replace(/\/$/, '') + '/' : `http://127.0.0.1:${server.address().port}/`;
const SUFFIX = process.env.SITE ? '-live' : '';
console.log('  目标:', BASE);

// 打线上时必须**等本次部署**：标记取本次新增的底色值（18.4 的真·透明玻璃 = #fafaf738）。
// 注意别沿用上一版的标记（fafaf78c）—— 那已经存在于线上，"等"会立刻通过、拍到的还是旧版。
if (process.env.SITE) {
  const MARKER = 'fafaf738';
  const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now();
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    try {
      const html = await (await fetch(BASE, { cache: 'no-store' })).text();
      const hrefs = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
      for (const h of hrefs) {
        const css = await (await fetch(BASE.replace(/\/$/, '') + h, { cache: 'no-store' })).text();
        if (css.includes(MARKER)) { ok = true; break; }
      }
    } catch { /* 抖动继续等 */ }
    if (!ok) await sleep2(5000);
  }
  console.log(ok ? `  本次部署已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s，标记 ${MARKER}）` : `  警告：300s 内没等到标记 ${MARKER}，拍到的可能是上一版`);
}

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-band-'));
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

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
await evalJs(`sessionStorage.setItem('boot-intro','1')`);
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
await sleep(900);

// 把含"钢琴八级"的标题滚到扫描带（50vh）上：这是站主截图里那一幕
const info = await evalJs(`(() => {
  const t = [...document.querySelectorAll('.index .title, .index a')].find((e) => e.textContent.includes('钢琴八级'));
  if (!t) return 'NOT_FOUND';
  const y = t.getBoundingClientRect().top + scrollY - innerHeight / 2 + t.getBoundingClientRect().height / 2;
  scrollTo(0, Math.max(0, y));
  const b = t.getBoundingClientRect();
  const r = document.querySelector('.band-readout').getBoundingClientRect();
  const cs = getComputedStyle(document.querySelector('.band-readout'));
  return JSON.stringify({ title: t.textContent.trim().slice(0, 20), titleRect: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], readoutRect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], readoutBg: cs.backgroundColor, readoutBlur: cs.backdropFilter || '-', readoutText: document.querySelector('.band-readout').textContent.trim().slice(0, 40) });
})()`);
console.log(info);
await sleep(700);
writeFileSync(join(SHOTS, `band-readout-${TAG}${SUFFIX}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log(`  截图: ${join(SHOTS, `band-readout-${TAG}${SUFFIX}.png`)}`);
ws.close(); chrome.kill(); server.close();
