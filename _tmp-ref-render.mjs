/**
 * 用 headless Chrome 渲染参考站（SPA），抓导航与四个目标页的**渲染后文本**（_tmp 前缀 = 临时证据）
 * 为什么不用 jina：这台机上 r.jina.ai 连不通（connect timeout）；SPA 的原始 HTML 又是空壳。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'http://blog.ayeez.cn';
const OUT = '<博客仓库>\\_tmp-ref';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-ref-'));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

await send('Page.navigate', { url: SITE + '/' });
for (let i = 0; i < 100; i++) { if (await evalJs(`document.querySelectorAll('a[href]').length`) > 4) break; await sleep(300); }
await sleep(1500);

const nav = await evalJs(`(() => [...document.querySelectorAll('nav a[href], header a[href], .nav a[href], a[href]')].map((a) => [a.getAttribute('href'), a.textContent.trim().slice(0, 12)]).filter(([h, t]) => t && h))()`);
const seen = new Set();
console.log('=== 渲染后的链接 ===');
for (const [h, t] of nav) { const k = h + '|' + t; if (seen.has(k)) continue; seen.add(k); console.log('  ' + t.padEnd(8) + ' → ' + h); }

const targets = [['关于', null], ['归档', null], ['友链', null], ['说说', null], ['留言', null], ['相册', null], ['日志', null]];
const routes = {};
for (const [t] of targets) { const hit = nav.find(([, x]) => x.includes(t)); if (hit) routes[t] = hit[0]; else routes[t] = t; }
console.log('=== 路由判断 ===\n  ' + JSON.stringify(routes));

for (const [name, path] of Object.entries(routes)) {
  await send('Page.navigate', { url: SITE + (path.startsWith('http') ? '' : (path.startsWith('/') ? path : '/' + path)) });
  await sleep(2500);
  const text = await evalJs(`(() => { const m = document.querySelector('main') || document.getElementById('app') || document.body; return m.innerText.replace(/\\n{3,}/g, '\\n'); })()`);
  writeFileSync(`${OUT}/${name}.txt`, String(text ?? ''));
  console.log(`\n=== ${name} (${path}) ===`);
  console.log(String(text ?? '').slice(0, 1200));
}

ws.close(); chrome.kill();
