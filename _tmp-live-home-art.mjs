/**
 * 主页磁带的线上验收（_tmp 前缀 = 临时证据）
 * 标记用**本次部署新增**的元素 `.bg-cassette`（HTML 层可判）。
 * 用法：node _tmp-live-home-art.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'https://northcedar.top';
const SHOTS = '<博客仓库>\\_tmp-boot-shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};
const fetchRetry = async (url, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) { try { return await fetch(url, { cache: 'no-store' }); } catch (e) { last = e; await sleep(1500); } }
  throw last;
};

console.log('=== ① 等本次部署（标记 .bg-cassette）===');
const t0 = Date.now();
let html = '';
for (let i = 0; i < 60; i++) {
  try {
    const text = await (await fetchRetry(SITE + '/', 2)).text();
    if (text.includes('bg-cassette')) { html = text; break; }
  } catch { /* 抖动继续等 */ }
  await sleep(5000);
}
if (!html) { console.log('FAIL  300s 内线上首页没出现 bg-cassette'); process.exit(1); }
console.log(`PASS  本次部署已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s）`);

console.log('\n=== ② 资源与装饰属性 ===');
const res = await fetchRetry(`${SITE}/art/cassette.webp`);
const buf = Buffer.from(await res.arrayBuffer());
check('线上 /art/cassette.webp', `${res.status} · ${buf.subarray(0, 4).toString('latin1')}/${buf.subarray(8, 12).toString('latin1')} · ${(buf.length / 1024).toFixed(1)} KB`, `200 · RIFF/WEBP · ${(buf.length / 1024).toFixed(1)} KB`);
const cssHrefs = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
let css = '';
for (const h of cssHrefs) {
  const t = await (await fetchRetry(SITE + h)).text();
  if (t.includes('cassette.webp')) css = t;
}
check('首页引用的 CSS 里接上了磁带背景', css ? 'true' : 'false', 'true');
check('装饰层约定（z-index:0 + pointer-events:none）', /bg-cassette[^{}]*\{[^}]*pointer-events:none/.test(css.replace(/\s+/g, '')) ? 'true' : 'false', 'true');
check('窄屏隐藏（压缩后会写成 width<=767px，这里只认 767px）', /@media[^{]*767px[^{]*\{[^}]*bg-cassette[^}]*display:none/.test(css.replace(/\s+/g, '')) ? 'true' : 'false', 'true');
// 非首页不该引到这份 CSS
const otherPage = await (await fetchRetry(SITE + '/about/')).text();
const otherHrefs = [...otherPage.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
let leaked = false;
for (const h of otherHrefs) if ((await (await fetchRetry(SITE + h)).text()).includes('cassette.webp')) leaked = true;
check('内页引用的 CSS 里没有磁带图', leaked ? 'true' : 'false', 'false');

console.log('\n=== ③ 线上渲染（截图人眼看）===');
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-live-art-'));
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
const open = async (w, h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  await send('Page.navigate', { url: SITE + '/' });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await evalJs(`sessionStorage.setItem('boot-intro','1')`); // 跳过 20 秒开场，直接看稳态首页
  await send('Page.navigate', { url: SITE + '/' });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await sleep(1200);
};
await open(1440, 900);
const box = await evalJs(`(() => { const e = document.querySelector('.bg-cassette'); const b = e.getBoundingClientRect(); return JSON.stringify({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), z: getComputedStyle(e).zIndex, bg: getComputedStyle(e).backgroundImage.includes('cassette.webp') }); })()`);
check('线上 .bg-cassette 尺寸与背景都到位', box, JSON.stringify({ x: 1038, y: 583, w: 460, h: 371, z: '0', bg: true }));
writeFileSync(join(SHOTS, 'live-home-cassette-1440.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
await evalJs(`scrollTo(0, document.body.scrollHeight)`);
await sleep(600);
writeFileSync(join(SHOTS, 'live-home-cassette-bottom.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log(`  线上首屏与滚到底截图已存: ${SHOTS}`);
await open(390, 844);
check('线上窄屏不显示', await evalJs(`getComputedStyle(document.querySelector('.bg-cassette')).display`), 'none');

ws.close(); chrome.kill();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：线上磁带背景验收符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
