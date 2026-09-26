/**
 * 一次性探针：找一个能在 Chrome 里真算出「无单位缩放比」的写法（_tmp 前缀 = 临时证据）
 * 背景：scale(calc(100vw / 1920)) 是**非法**的 —— 长度/数 = 长度，而 scale() 要 <number>。
 * 所以要的是「长度/长度 → 数」这条 CSS Values 4 的类型运算，得实测浏览器支持。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-css-probe-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
await send('Page.navigate', { url: 'data:text/html,<div id=t style="width:100px;height:100px"></div>' });
await sleep(300);

const out = await evalJs(`(() => {
  const cases = [
    'scale(calc(100vw / 1920))',
    'scale(calc(100vw / 1920px))',
    'scale(min(calc(100vw / 1920px), calc(100dvh / 1080px)))',
    'scale(min(calc(100vw / 1920px), calc(100vh / 1080px)))',
    'scale(calc(min(100vw, 177.7778vh) / 1920px))',
    'translate(-50%,-50%) scale(min(calc(100vw / 1920px), calc(100dvh / 1080px)))',
    'scale(calc(100vw * 0.0005208333))',
  ];
  const t = document.getElementById('t');
  return cases.map((v) => {
    const supports = CSS.supports('transform', v);
    t.style.transform = 'none';
    t.style.transform = v;
    const computed = getComputedStyle(t).transform;
    t.style.transform = 'none';
    return { v, supports, computed };
  });
})()`);
for (const r of out) console.log(`${r.supports ? 'OK  ' : 'BAD '} ${r.v}\n       computed=${r.computed}`);

ws.close(); chrome.kill();
