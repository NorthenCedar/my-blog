/** 点参考站导航进入四个目标页，抓渲染文本与真实路由（_tmp 前缀 = 临时证据） */
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
const profile = await mkdtemp(join(tmpdir(), 'dsh-ref3-'));
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
await sleep(4000);

for (const name of ['友链', '说说', '留言', '日志']) {
  // 每次从首页重新点（避免叠在上一次的状态上）
  await send('Page.navigate', { url: SITE + '/' });
  await sleep(3000);
  const hit = await evalJs(`(() => { const a = [...document.querySelectorAll('a')].find((x) => x.textContent.trim() === '${name}'); if (!a) return null; a.scrollIntoView({ block: 'center' }); const b = a.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
  if (!hit) { console.log(`--- ${name}: 找不到导航项`); continue; }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
  await sleep(3500);
  const url = await evalJs(`location.href`);
  const text = await evalJs(`(() => { const m = document.querySelector('main') || document.getElementById('app') || document.body; return (m.innerText || '').replace(/\\n{2,}/g, '\\n').slice(0, 2000); })()`);
  writeFileSync(`${OUT}/click-${name}.txt`, String(text ?? '') + '\n\nURL: ' + url);
  console.log(`\n=== ${name} → ${url} ===`);
  console.log(String(text ?? '').slice(0, 1100));
}
ws.close(); chrome.kill();
