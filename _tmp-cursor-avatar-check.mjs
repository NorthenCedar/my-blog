/**
 * 两件修复的浏览器验收（_tmp 前缀 = 临时证据）：
 *   ① 光标：自定义位图已删 ⇒ 计算值里不该再出现 url(...)；跟手白点仍在且可见、且 html.cursor-none 生效；
 *   ② 手机端关于页：头像与「北杉」必须在同一条中轴上（用两侧中心 X 相减，别靠肉眼）。
 * 用法：node _tmp-cursor-avatar-check.mjs [base]
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, normalize } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
const SHOTS = join(ROOT, '_tmp-boot-shots');
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
const BASE = (process.argv[2] ?? `http://127.0.0.1:${server.address().port}`).replace(/\/$/, '');

// 打线上时等本次部署：本次是**删除类**改动，门闩用否定条件 ——
// 线上任何 CSS 里都不该再有 /cursors/ 引用（这正是"删干净"本身）。
if (!BASE.includes('127.0.0.1')) {
  const t0 = Date.now();
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    try {
      const html = await (await fetch(BASE + '/talks/', { cache: 'no-store' })).text();
      const hrefs = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
      let refs = 0;
      for (const h of hrefs) refs += ((await (await fetch(BASE + h, { cache: 'no-store' })).text()).match(/\/cursors\//g) ?? []).length;
      ok = hrefs.length > 0 && refs === 0;
    } catch {}
    if (!ok) await sleep(5000);
  }
  console.log(ok ? `  本次部署已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s），线上 CSS 已无 /cursors/ 引用` : '  警告：300s 内线上 CSS 仍有 /cursors/ 引用，验的可能是上一版');
  if (!ok) process.exit(1);
}

let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-cur-'));
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
const open = async (path, w, h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  await send('Page.navigate', { url: BASE + path });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await sleep(900);
};

console.log('=== ① 光标：位图没了、白点还在 ===');
await open('/talks/', 1280, 900);
check('html 上被 JS 加了 cursor-none 类', await evalJs(`document.documentElement.classList.contains('cursor-none')`), 'true');
const cursors = await evalJs(`JSON.stringify({ html: getComputedStyle(document.documentElement).cursor, body: getComputedStyle(document.body).cursor, btn: getComputedStyle(document.querySelector('.act')).cursor, link: getComputedStyle(document.querySelector('.navpanel a')).cursor })`);
console.log(`  计算值: ${cursors}`);
check('全站计算值里没有任何 url(...)（自定义光标已删干净）', /url\(/.test(cursors) ? 'false' : 'true', 'true');
check('挂着 cursor-none 时是 none（白点接管）', JSON.parse(cursors).html, 'none');
check('白点节点在且可见', await evalJs(`(() => { const d = document.querySelector('.cr-dot'); if (!d) return 'MISSING'; const s = getComputedStyle(d); const r = d.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 ? 'true' : JSON.stringify({ d: s.display, v: s.visibility, w: r.width }); })()`), 'true');
// 白点跟手：移动指针后它的位置应当变
const before = await evalJs(`(() => { const r = document.querySelector('.cr-dot').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)].join(','); })()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 300, button: 'none' });
await sleep(400);
const after = await evalJs(`(() => { const r = document.querySelector('.cr-dot').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)].join(','); })()`);
check('白点跟手（移动后位置变化）', before !== after ? 'true' : `false（${before} → ${after}）`, 'true');

console.log('\n=== ② 手机端关于页：头像与「北杉」同轴 ===');
await open('/about/', 390, 844);
const geo = await evalJs(`(() => { const a = document.querySelector('.avatar').getBoundingClientRect(); const n = document.querySelector('.profile-name').getBoundingClientRect(); return JSON.stringify({ 头像中心: Math.round(a.x + a.width / 2), 名字中心: Math.round((n.x + n.width / 2)), 头像宽: Math.round(a.width), 在名字上方: a.bottom <= n.top + 1 }); })()`);
console.log(`  ${geo}`);
const g = JSON.parse(geo);
const dx = Math.abs(g.头像中心 - g.名字中心);
check('头像与名字的中轴偏差 ≤ 2px', dx <= 2 ? 'true' : `false（差 ${dx}px）`, 'true');
check('头像确实在名字上方', g.在名字上方, 'true');
check('手机端头像 96px（不是被放大/压扁）', g.头像宽, '96');
writeFileSync(join(SHOTS, 'about-mobile-avatar.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log(`  截图: ${join(SHOTS, 'about-mobile-avatar.png')}`);

ws.close(); chrome.kill(); server.close();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：两处修复符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
