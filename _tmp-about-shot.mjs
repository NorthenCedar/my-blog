/** 关于页截图（_tmp 前缀 = 临时证据）：PC 1440 / 手机 390，看头像落位与社交卡片 */
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
const SUF = LIVE ? '-live' : '';

// 打线上时等本次部署：关于页**出现头像**（profile-name）才是新版本
if (LIVE) {
  const t0 = Date.now();
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    try {
      const html = await (await fetch(BASE + '/about/', { cache: 'no-store' })).text();
      ok = html.includes('profile-name') && html.includes('哔哩哔哩');
    } catch { /* 抖动继续等 */ }
    if (!ok) await sleep(5000);
  }
  console.log(ok ? `  本次部署已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s）` : '  警告：300s 内关于页还没出现头像，验的可能是上一版');
  if (!ok) process.exit(1);
}
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-about-'));
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

const shot = async (name, w, h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  await send('Page.navigate', { url: BASE + '/about/' });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await sleep(800);
  console.log(`  ${w}×${h}: ` + (await evalJs(`(() => { const a = document.querySelector('.avatar'); const p = document.querySelector('.profile'); const s = document.querySelectorAll('.social a').length; const r = a ? a.getBoundingClientRect() : null; const ps = p ? getComputedStyle(p) : null; return JSON.stringify({ 头像: r ? Math.round(r.width) + '×' + Math.round(r.height) + ' @' + Math.round(r.x) + ',' + Math.round(r.y) : '无', 定位: ps ? ps.position : '-', 圆角: a ? getComputedStyle(a).borderRadius : '-', 社交卡片: s, 名字: (document.querySelector('.profile-name') || {}).textContent }); })()`)));
  writeFileSync(join(SHOTS, name + SUF + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log(`  截图: ${join(SHOTS, name + SUF + '.png')}`);
};

await shot('about-pc', 1440, 900);
// 手机端：滚到社交卡片那一段再拍一张，确认两列布局
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: BASE + '/about/' });
for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
await sleep(700);
writeFileSync(join(SHOTS, 'about-mobile-top' + SUF + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
await evalJs(`scrollTo(0, document.querySelector('.social-block').offsetTop - 40)`);
await sleep(500);
writeFileSync(join(SHOTS, 'about-mobile-social' + SUF + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log(`  手机端两张: about-mobile-top${SUF}.png / about-mobile-social${SUF}.png`);
ws.close(); chrome.kill(); server.close();
