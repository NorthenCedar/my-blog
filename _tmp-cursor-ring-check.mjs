/**
 * 跟手光标（白点 + 半透明盘 + 涟漪）的行为验证（_tmp 前缀 = 临时证据）
 * 用法：node _tmp-cursor-ring-check.mjs
 *
 * 关键用例是 **④b 涟漪圆心是否漂移**：站主肉眼看到"涟漪往右下角飞"，
 * 根因是 `scale` 当独立属性时与 transform 里的位移合成、把位移也放大了（实测点击 (500,300) 会飞到 (1152,672)）。
 * 修法是把 scale 收进 transform 串，这条断言就是那次修复的回归网（能对这个 bug 变红）。
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain' };

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
const BASE = `http://127.0.0.1:${server.address().port}/`;

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-cursor-ring-'));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};
const open = async (path) => {
  await send('Page.navigate', { url: BASE + path });
  for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(150); }
  await sleep(400);
};
const move = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await sleep(60);
};
/** 读某个元素的圆心（左上角读数 + 半个尺寸，抵消 transform 里的 translate(-50%,-50%)） */
const center = (sel) => evalJs(`(() => {
  const e = document.querySelector('${sel}');
  if (!e) return 'MISSING';
  const b = e.getBoundingClientRect();
  const c = getComputedStyle(e);
  return JSON.stringify({ x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width), opacity: c.opacity, cls: e.className });
})()`);

console.log('=== ① 结构 ===');
await open('/posts/ai-built-this-blog/');
check('三个元素齐全（盘 / 点 / 涟漪）', await evalJs(`document.querySelectorAll('.cr-disc,.cr-dot,.cr-ripple').length`), 3);
check('初始都不可见（等第一次 pointermove）', await evalJs(`['.cr-disc','.cr-dot','.cr-ripple'].map((s) => getComputedStyle(document.querySelector(s)).opacity).join('/')`), '0/0/0');
check('都不拦点击', await evalJs(`['.cr-disc','.cr-dot','.cr-ripple'].map((s) => getComputedStyle(document.querySelector(s)).pointerEvents).join('/')`), 'none/none/none');
check('都标记为装饰', await evalJs(`['.cr-disc','.cr-dot','.cr-ripple'].map((s) => document.querySelector(s).getAttribute('aria-hidden')).join('/')`), 'true/true/true');
check('层级 点 66 / 盘 65 / 涟漪 64（都在开场层 60 之上 ⇒ 指针标记永远可见）', await evalJs(`['.cr-dot','.cr-disc','.cr-ripple'].map((s) => getComputedStyle(document.querySelector(s)).zIndex).join('/')`), '66/65/64');

console.log('\n=== ② 原生光标隐藏（JS 加类）+ 文字上让位 ===');
check('html 上有 JS 加的 cursor-none 类', await evalJs(`document.documentElement.classList.contains('cursor-none')`), 'true');
check('普通元素上是 none（原生光标已隐藏）', await evalJs(`getComputedStyle(document.querySelector('.topbar') || document.body).cursor`), 'none');
// 站主最终形态：文本光标那枚已删 ⇒ 正文上也是 none（原生光标一律由白点接管）
check('正文段落上也是 none（文本光标已删）', await evalJs(`getComputedStyle(document.querySelector('.prose p')).cursor`), 'none');
check('链接上也必须是 none（UA 的 a{cursor:pointer} 会压过继承 —— 这里专治那个坑）', await evalJs(`getComputedStyle(document.querySelector('.prose a[href]') || document.querySelector('a[href]')).cursor`), 'none');

console.log('\n=== ③ 白点跟手（不缓动）+ 盘缓动 ===');
await move(300, 200);
const d1 = JSON.parse(await center('.cr-dot'));
check('白点立即落在指针上（±1px）', `${Math.abs(d1.x - 300) <= 1}/${Math.abs(d1.y - 200) <= 1}/${d1.w}`, 'true/true/8');
check('盘显形', JSON.parse(await center('.cr-disc')).opacity, '1');
await move(1000, 620);
await sleep(400);
const d2 = JSON.parse(await center('.cr-dot'));
const c2 = JSON.parse(await center('.cr-disc'));
check('白点仍精确（±1px）', `${Math.abs(d2.x - 1000) <= 1}/${Math.abs(d2.y - 620) <= 1}`, 'true/true');
check('盘缓动收敛到同一点（±3px）且直径 34', `${Math.abs(c2.x - 1000) <= 3}/${Math.abs(c2.y - 620) <= 3}/${c2.w}`, 'true/true/34');

console.log('\n=== ④ 悬停可点元素 / 文字上也是白点 ===');
const link = await evalJs(`(() => { const a = document.querySelector('.prose a[href]') || document.querySelector('a[href]'); if (!a) return null; a.scrollIntoView({ block: 'center' }); const b = a.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), inView: b.top >= 0 && b.bottom <= innerHeight }; })()`);
if (link && link.inView) {
  await move(link.x, link.y);
  await sleep(400);
  const c3 = JSON.parse(await center('.cr-disc'));
  check('悬停链接：盘缩到 22px + is-hot', `${c3.w}/${c3.cls.includes('is-hot')}`, '22/true');
  check('悬停链接：白点仍在', JSON.parse(await center('.cr-dot')).opacity, '1');
  check('悬停链接：原生光标仍是 none', await evalJs(`getComputedStyle(document.querySelector('.prose a[href]')).cursor`), 'none');
} else { console.log(`  （找不到视口内链接：${JSON.stringify(link)}）`); fails++; }
// 站主最终形态：文字上**也是白点**（文本选择那枚已删，不再让位）
const p = await evalJs(`(() => { const el = document.querySelector('.prose p'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: Math.round(b.x + 40), y: Math.round(b.y + Math.round(b.height / 2)), inView: b.top >= 0 && b.bottom <= innerHeight }; })()`);
if (p && p.inView) {
  await move(p.x, p.y);
  await sleep(300);
  check('正文上：白点与盘都在（不再有"文字让位"）', await evalJs(`['.cr-dot','.cr-disc'].map((s) => getComputedStyle(document.querySelector(s)).opacity).join('/')`), '1/1');
  check('正文上：原生光标也是 none（文本光标已删）', await evalJs(`getComputedStyle(document.querySelector('.prose p')).cursor`), 'none');
  check('正文上：没有 cr-text 这个残留标记', await evalJs(`document.documentElement.classList.contains('cr-text')`), 'false');
  const dOnText = JSON.parse(await center('.cr-dot'));
  check(`正文上：白点仍精确落在指针（${p.x},${p.y}）`, `${Math.abs(dOnText.x - p.x) <= 1}/${Math.abs(dOnText.y - p.y) <= 1}`, 'true/true');
} else { console.log(`  （找不到视口内段落：${JSON.stringify(p)}）`); fails++; }

console.log('\n=== ④b 点击涟漪：圆心必须钉在点击处（本站曾"往右下飞"）===');
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 300, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 300, button: 'left', clickCount: 1 });
const samples = [];
for (let i = 0; i < 5; i++) {
  await sleep(100);
  samples.push(JSON.parse(await center('.cr-ripple')));
}
console.log(`  圆心采样（点击处 500,300）: ${samples.map((s) => `${s.x},${s.y}`).join(' | ')}`);
const drifted = samples.filter((s) => Math.abs(s.x - 500) > 2 || Math.abs(s.y - 300) > 2);
check('涟漪圆心 5 帧都钉在点击处（±2px）', drifted.length === 0 ? '0 帧漂移' : `${drifted.length} 帧漂移：${drifted.map((s) => `${s.x},${s.y}`).join(' ')}`, '0 帧漂移');
check('涟漪确实在扩散（结束时直径 > 起始 68）', samples[samples.length - 1].w > 68 ? `true（${samples[0].w} → ${samples[samples.length - 1].w}px）` : `false（${samples[samples.length - 1].w}px）`, `true（${samples[0].w} → ${samples[samples.length - 1].w}px）`);

console.log('\n=== ⑤ 减少动态效果 / 触摸设备 ===');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await open('/posts/ai-built-this-blog/');
check('reduced-motion 下三个元素 display:none', await evalJs(`['.cr-disc','.cr-dot','.cr-ripple'].map((s) => getComputedStyle(document.querySelector(s)).display).join('/')`), 'none/none/none');
check('reduced-motion 下**不**加 cursor-none（不能把光标藏了却没替代品）', await evalJs(`document.documentElement.classList.contains('cursor-none')`), 'false');
await send('Emulation.setEmulatedMedia', { features: [] });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await open('/posts/ai-built-this-blog/');
check('触摸设备下 (hover:none) 成立', await evalJs(`matchMedia('(hover: none)').matches`), 'true');
check('触摸设备下三个元素 display:none 且无 cursor-none', await evalJs(`['.cr-disc','.cr-dot','.cr-ripple'].map((s) => getComputedStyle(document.querySelector(s)).display).join('/') + '/' + document.documentElement.classList.contains('cursor-none')`), 'none/none/none/false');
await send('Emulation.setTouchEmulationEnabled', { enabled: false });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

console.log('\n=== ⑥ 截图（白点在纸面与深色区是否都看得见）===');
await open('/posts/ai-built-this-blog/');
/** 找一个"既不是文字也不是可点元素"的空白点（白点应当可见） */
const blankSpot = () => evalJs(`(() => {
  const bad = (e) => !e || e.closest('a,button,input,textarea,select,summary,[role="button"],[role="tab"]') || e.closest('p,li,blockquote,h1,h2,h3,h4,h5,h6,td,th,pre,code,kbd,samp,article,.prose');
  for (let y = 120; y < innerHeight - 80; y += 40) for (let x = 1000; x < innerWidth - 60; x += 60) { const e = document.elementFromPoint(x, y); if (!bad(e)) return { x, y }; }
  return null;
})()`);
const spot = await blankSpot();
if (spot) {
  await move(spot.x, spot.y);
  await sleep(420);
  writeFileSync(join(SHOTS, 'cursor-dot-paper.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { x: spot.x - 60, y: spot.y - 60, width: 120, height: 120, scale: 4 } })).data, 'base64'));
  console.log(`  纸面截图（空白点 ${spot.x},${spot.y}）: ${join(SHOTS, 'cursor-dot-paper.png')}`);
  // 深色底：本站大面积深色只有代码块，而代码块属于文字（会进入让位态）⇒ 这里**人为**把页面底色改成深色，
  // 单纯验证"白点在深底上读不读得出来"（合成场景，如实标注）。
  await evalJs(`document.documentElement.style.background = '#0e0e0e'; document.body.style.background = '#0e0e0e';`);
  await sleep(120);
  await move(spot.x + 1, spot.y + 1);
  await sleep(420);
  writeFileSync(join(SHOTS, 'cursor-dot-dark.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { x: spot.x - 60, y: spot.y - 60, width: 120, height: 120, scale: 4 } })).data, 'base64'));
  console.log(`  深底截图（合成：页面底色改 #0e0e0e）: ${join(SHOTS, 'cursor-dot-dark.png')}`);
  await evalJs(`document.documentElement.style.background = ''; document.body.style.background = '';`);
} else {
  console.log('  （找不到空白点，跳过截图）');
  fails++;
}

ws.close(); chrome.kill(); server.close();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：跟手光标行为全部符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
