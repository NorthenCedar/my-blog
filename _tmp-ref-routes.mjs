/** 试参考站的候选路由（_tmp 前缀 = 临时证据）：打印每条的渲染文本前 260 字，用来判断哪条是"友链/说说/留言/日志" */
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
const profile = await mkdtemp(join(tmpdir(), 'dsh-ref2-'));
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

const cands = ['#/link', '#/links', '#/friend', '#/shuoshuo', '#/message', '#/guestbook', '#/log', '#/about', '#/archives', '#/gallery', '/link', '/shuoshuo', '/message', '/log', '/friends', '/guestbook', '/moments', '/archives', '/about', '/gallery'];
const results = {};
for (const c of cands) {
  await send('Page.navigate', { url: SITE + '/' + c });
  await sleep(2600);
  const text = await evalJs(`(() => { const m = document.querySelector('main') || document.getElementById('app') || document.body; return (m.innerText || '').replace(/\\n{2,}/g, ' | ').slice(0, 260); })()`);
  results[c] = text;
  console.log(`--- ${c}\n    ${text}\n`);
}
writeFileSync(OUT + '/routes.json', JSON.stringify(results, null, 2));
ws.close(); chrome.kill();
