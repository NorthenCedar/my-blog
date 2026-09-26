/** A4 复核：线上文章页的 Meta 颜色到底是多少（排除"读得太早"）。 */
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_ = 'https://northcedar.top/posts/ai-built-this-blog/?cb=' + Date.now();
const profile = await mkdtemp(join(tmpdir(), 'dsh-a4-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await Promise.race([
  new Promise((r) => chrome.stderr.on('data', (d) => { const m = String(d).match(/DevTools listening on (ws:\/\/\S+)/); if (m) r(m[1]); })),
  sleep(15000).then(() => null),
]);
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } });
const raw = (me, pa, s) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: me, params: pa ?? {}, ...(s ? { sessionId: s } : {}) })); });
const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
const send = (m, pa) => raw(m, pa, sessionId);
await send('Page.enable'); await send('Runtime.enable');
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL_ });
for (let i = 0; i < 100; i++) { if (await ev('document.readyState') === 'complete') break; await sleep(150); }

const probe = `(()=>{
  const m=document.querySelector('.pagehead .meta');
  if(!m) return 'Meta 元素不存在';
  const cs=getComputedStyle(m);
  return JSON.stringify({
    color: cs.color,
    metaColorToken: getComputedStyle(document.body).getPropertyValue('--meta-color').trim(),
    mutedToken: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(),
    onBandMeta: getComputedStyle(document.documentElement).getPropertyValue('--on-band-meta').trim(),
    bodyClass: document.body.className,
    样式表数: document.styleSheets.length,
    内联样式k: [...document.styleSheets].filter(s=>!s.href).length,
  });
})()`;
console.log('  立即读 : ' + await ev(probe));
await sleep(2500);
console.log('  2.5s 后: ' + await ev(probe));
// 用一个全新元素做对照：同样带 .meta 类，插到同位置，看它算出来什么
console.log('  对照元素: ' + await ev(`(()=>{
  const n=document.createElement('p'); n.className='meta'; n.textContent='对照';
  document.querySelector('.pagehead').appendChild(n);
  const c=getComputedStyle(n).color; const cid=n.getAttribute('data-astro-cid-lt3s3dwh');
  return c + ' （无 cid，作用域规则不该命中）';
})()`));
ws.close(); chrome.kill(); process.exit(0);
