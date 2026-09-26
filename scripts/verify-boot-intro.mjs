#!/usr/bin/env node
/**
 * 首页开场动画 · 浏览器级验证器（**正式工具**，与 scripts/verify-home-states.mjs 同一套骨架）
 *
 * 用法：
 *   npm run build
 *   node scripts/verify-boot-intro.mjs
 *   环境变量 CHROME_PATH 可指定 Chrome；否则按常见路径找。
 *
 * 为什么是脚本而不是 vitest：要验的是**浏览器里的真实结果** —— 真按键（Input.dispatchKeyEvent）、
 * 真点击（Input.dispatchMouseEvent）、把 CSS 动画 seek 到指定帧后读计算样式、以及"禁用 JS 之后页面什么样"。
 * 本仓库没有 CI 浏览器，塞进 vitest 只会变成"在 CI 上跳过"。分工：
 *   · 浏览器级 = 本脚本（按需跑，退出码即结论）
 *   · 静态契约 = tests/boot-intro.test.ts（不打开浏览器也能红）
 *
 * 逐帧位置抽样怎么做的（这是本脚本最有价值的一条）：
 *   所有动画的时间原点都是原片第 169 帧（0%），逐字 span 与品牌三行的延迟也都写成"从原点算的绝对值"，
 *   所以把**每一个**动画的 `currentTime` 统一设成 `(frame − 169) × 40ms`，整层就精确停在那一帧上。
 *   随后读计算样式（每条**连读两次要求稳定** —— 台账那条：单次读数不可信）。
 *
 * 输出规矩（台账 21a5c66）：每条断言打印 判据名 + 对象 + 实测值，禁止裸 PASS。
 * 截图落在 _tmp-boot-shots/（人眼复核用，不进产物）。
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SHOTS = join(ROOT, '_tmp-boot-shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 帧 → 毫秒（时间原点 = 原片第 169 帧，25 fps） */
const ms = (frame) => (frame - 169) * 40;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html 不存在 —— 先跑 npm run build');
  process.exit(2);
}
mkdirSync(SHOTS, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error('找不到 Chrome —— 用 CHROME_PATH 指定');
  process.exit(2);
}

/* ---------- 进程内静态服务（根 = dist） ---------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript',
  '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0]);
    let f = join(DIST, normalize(url).replace(/^[/\\]+/, ''));
    const st = await stat(f).catch(() => null);
    if (st?.isDirectory()) f = join(f, 'index.html');
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
console.log(`静态服务：${BASE}（根目录 dist/）`);

/* ---------- CDP ---------- */
const profile = await mkdtemp(join(tmpdir(), 'dsh-boot-intro-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*',
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await Promise.race([
  new Promise((resolve) => chrome.stderr.on('data', (d) => {
    const m = String(d).match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  })),
  sleep(15000).then(() => null),
]);
if (!wsUrl) { console.error('Chrome 没起来（等 DevTools 端点超时）'); chrome.kill(); server.close(); process.exit(2); }
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
let seq = 0; const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
});
const raw = (method, params, sessionId) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params: params ?? {}, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => raw(m, p, sessionId);
await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable'); await send('CSS.enable');
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('页面脚本异常: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
};

let fails = 0;
const check = (name, obj, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        对象: ${obj}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};
/**
 * 数值型断言（容差 0.02）：百分比停点只保留 4 位小数，帧点位置会有 ≤0.01ms 的偏移，
 * 于是计算值会有 ~1e-4 量级的插值误差（实测 320.5 → 320.503）。
 * 容差是**测量误差的量化**，不是"放水"：0.02 远小于任何一帧的真实变化量（每帧至少 0.5px 量级）。
 */
const TOL = 0.02;
const checkClose = (name, obj, actual, want) => {
  const a = String(actual).match(/-?\d+(\.\d+)?/g) ?? [];
  const w = String(want).match(/-?\d+(\.\d+)?/g) ?? [];
  const ok = a.length === w.length && a.every((v, i) => Math.abs(Number(v) - Number(w[i])) <= TOL);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        对象: ${obj}\n        实测: ${actual}${ok ? `（期望 ${want}，容差 ${TOL}）` : `（期望 ${want}）`}`);
};
const load = async (w, h, { fresh = false } = {}) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const wait = async () => {
    for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(150); }
    await sleep(400);
  };
  await send('Page.navigate', { url: BASE });
  await wait();
  if (fresh) {
    // 关键：清标记必须发生在**导航之前**（门控是在解析期读 storage 的）——
    // 所以先清、再导航一次，否则第二次以后的用例全会因为上一轮写下的标记而不播。
    await evalJs(`sessionStorage.clear()`);
    await send('Page.navigate', { url: BASE });
    await wait();
  }
};
/** 把整层精确 seek 到原片第 frame 帧；返回被驱动的动画条数 */
const seek = (frame) => evalJs(`(() => {
  const o = document.querySelector('[data-boot-overlay]');
  const anims = o.getAnimations({ subtree: true });
  anims.forEach((a) => { a.pause(); a.currentTime = ${ms(frame)}; });
  return anims.length;
})()`);
/** 读一组计算样式；(selector, prop) 对 */
const styles = (pairs) => evalJs(`(() => {
  const out = {};
  for (const [sel, prop] of ${JSON.stringify(pairs)}) {
    const el = document.querySelector(sel);
    out[sel + '|' + prop] = el ? getComputedStyle(el)[prop] : 'MISSING';
  }
  return out;
})()`);
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(SHOTS, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
};

/* ---------- ① 默认态：该播就播 ---------- */
console.log('\n=== ① 默认态（首访、会话无标记）===');
await send('Emulation.setScriptExecutionDisabled', { value: false });
await send('Emulation.setEmulatedMedia', { features: [] });
await load(1440, 900, { fresh: true });
check('D-1 覆盖层在、且可见', '[data-boot-overlay] 的 display / html.boot-on',
  await evalJs(`(() => { const o = document.querySelector('[data-boot-overlay]'); return (o ? getComputedStyle(o).display : 'MISSING') + ' / ' + document.documentElement.classList.contains('boot-on'); })()`),
  'block / true');
check('D-2 锁滚动', 'html 的 overflow', await evalJs(`getComputedStyle(document.documentElement).overflow`), 'hidden');
check('D-3 skip 按钮开场即获焦点（#16）', 'document.activeElement.className',
  await evalJs(`document.activeElement.className`), 'boot-skip');
check('D-4 元素齐备（含 95 个逐字 span）', 'overlay / boot-ch / boot-skip / boot-clock 计数',
  await evalJs(`[document.querySelectorAll('[data-boot-overlay]').length, document.querySelectorAll('.boot-ch').length, document.querySelectorAll('.boot-skip').length, document.querySelectorAll('.boot-clock').length].join('/')`),
  '1/95/1/1');
check('D-5 首页正文照常在 DOM 里（#21：覆盖层只是盖上去）', '.field-item ≥1 且 h1.display = 1',
  await evalJs(`(() => {
    const items = document.querySelectorAll('.field-item').length;
    const h1 = document.querySelectorAll('h1.display').length;
    return items >= 1 && h1 === 1 ? 'true' : 'false (' + items + '/' + h1 + ')';
  })()`), 'true');

/* ---------- ② 会话标记：不重播 ---------- */
console.log('\n=== ② 同一会话二次进入（sessionStorage 已记）===');
await evalJs(`sessionStorage.setItem('boot-intro','1')`);
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(150); }
await sleep(300);
check('S-1 覆盖层不显示', '[data-boot-overlay] 的 display',
  await evalJs(`getComputedStyle(document.querySelector('[data-boot-overlay]')).display`), 'none');
check('S-2 没有锁滚动', 'html 的 overflow', await evalJs(`getComputedStyle(document.documentElement).overflow`), 'visible');

/* ---------- ③ 逐帧位置抽样（CSS 动画 seek） ---------- */
console.log('\n=== ③ 逐帧位置抽样（把动画 seek 到指定帧，读计算样式，每条连读两次）===');
await load(1440, 900, { fresh: true });
const SAMPLES = [
  // [帧, 选择器, 计算属性, 期望值, 依据]
  [226, '.boot-access', 'opacity', '0.25', 'boot-motion.ts:64 —— 226 帧闪 0.25'],
  [280, '.boot-logo', 'transform', 'matrix(1, 0, 0, 1, 36, 1)', 'boot-logo-tracks.ts:59-94 —— 280 帧左边缘 556，offset = 556−520'],
  // 这两条是"∞ 交叉处画不出来"那个 bug 的浏览器级回归网（本地测试里另有一条纯静态的同义断言）：
  // 上游 boot.ts:138 是 `${length} ${1 - length}`，段长+段隙必须 = 1（图案才等于一个路径长、才会环绕）。
  [280, '.boot-contour', 'strokeDasharray', '0.9725 0.0275', 'boot.ts:138 —— 终态 length 0.9725 + 段隙 0.0275 = 1'],
  [280, '.boot-contour', 'strokeDashoffset', '-0.211', 'boot.ts:139 —— dashoffset = −start'],
  [520, '.boot-arc-outer', 'r', '320.5px', 'boot-tracks.ts:91-110 —— 外环 520 帧 320.5'],
  [560, '.boot-arc-white', 'r', '227.5px', 'boot-tracks.ts:111-136 —— 白环 560 帧 227.5'],
  [520, '.boot-permission', 'letterSpacing', '0.5px', 'boot-motion.ts:88-102 —— 字距收拢到 520 帧 0.5'],
  [595, '.boot-company', 'opacity', '0.65', 'boot-motion.ts:128-129 —— 594/595 遮罩帧 0.65'],
  [595, '.boot-highlight', 'opacity', '0.06', 'boot.ts:184-186 —— 遮罩时反相文字 0.06'],
  [611, '.boot-highlight', 'clipPath', 'inset(0px 0% 0px 0px)', 'boot-tracks.ts:60-85 —— 黑底 611 帧 = 410/410 扫满'],
  [546, '.boot-core', 'r', '42.93px', 'boot-orbit-tracks.ts:99-107 —— 闪变帧 42.93'],
  [568, '.boot-sat-dot', 'r', '4.25px', 'boot-orbit-tracks.ts:76-88 —— 生长到 4.25'],
];
let animCount = 0;
for (const [frame, sel, prop, want, why] of SAMPLES) {
  animCount = await seek(frame);
  const a = await styles([[sel, prop]]);
  await sleep(60);
  const b = await styles([[sel, prop]]); // 稳定复读（台账：单次读数不可信）
  const key = `${sel}|${prop}`;
  const stable = a[key] === b[key];
  checkClose(`F-${frame} ${sel} · ${prop}`, `${why} ｜ 连读两次稳定: ${stable}`, a[key], want);
  if (!stable) fails++;
}
console.log(`        （逐帧抽样共 seek ${SAMPLES.length} 次，每次驱动 ${animCount} 条 CSS 动画）`);

/* ---------- ④ 完整播放 → 交棒 ---------- */
console.log('\n=== ④ 完整播放（把动画推到终点）===');
await load(1440, 900, { fresh: true });
await evalJs(`document.querySelector('[data-boot-overlay]').getAnimations({ subtree: true }).forEach((a) => a.finish())`);
await sleep(1400);
check('P-1 覆盖层被彻底移除（#7）', '[data-boot-overlay] 计数',
  await evalJs(`document.querySelectorAll('[data-boot-overlay]').length`), 0);
check('P-2 锁滚动解除', 'html 的 overflow', await evalJs(`getComputedStyle(document.documentElement).overflow`), 'visible');
check('P-3 焦点交回主标题（#16）', 'activeElement 是 h1.display（含 tabindex=-1）',
  await evalJs(`(() => {
    const el = document.activeElement;
    const ok = el.classList.contains('display') && el.getAttribute('tabindex') === '-1';
    return ok ? 'true' : 'false (' + el.className + ')';
  })()`), 'true');
const shotAfter = await shot('1440-handoff');
console.log(`        截图: ${shotAfter}`);

/* ---------- ⑤ 真按键 / 真点击 ---------- */
console.log('\n=== ⑤ 跳过（真按键 Esc 与真点击）===');
await load(1440, 900, { fresh: true });
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await sleep(200);
check('E-1 Esc 后覆盖层移除', '[data-boot-overlay] 计数',
  await evalJs(`document.querySelectorAll('[data-boot-overlay]').length`), 0);
check('E-2 Esc 后锁滚动解除', 'html 的 overflow', await evalJs(`getComputedStyle(document.documentElement).overflow`), 'visible');
check('E-3 Esc 后焦点在主标题', 'activeElement 是 h1.display（它的 classList 里还有 B2 的 is-yielding，故不能整串比）',
  await evalJs(`document.activeElement.classList.contains('display') ? 'true' : 'false (' + document.activeElement.className + ')'`), 'true');

await load(1440, 900, { fresh: true });
const box = await evalJs(`(() => { const r = document.querySelector('.boot-skip').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
await sleep(200);
check('C-1 点击 skip 后覆盖层移除', '[data-boot-overlay] 计数',
  await evalJs(`document.querySelectorAll('[data-boot-overlay]').length`), 0);
check('C-2 点击 skip 不重播（sessionStorage 已记）', "sessionStorage['boot-intro']",
  await evalJs(`sessionStorage.getItem('boot-intro')`), '1');

/* ---------- ⑥ reduced-motion / 无 JS / 窄屏 ---------- */
console.log('\n=== ⑥ 三种不播的情形（#6 + 站主 Q3）===');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await load(1440, 900, { fresh: true });
check('R-1 reduced-motion 不播', '[data-boot-overlay] 的 display',
  await evalJs(`getComputedStyle(document.querySelector('[data-boot-overlay]')).display`), 'none');
await send('Emulation.setEmulatedMedia', { features: [] });

await load(390, 844, { fresh: true });
check('M-1 ≤767px 不播', '[data-boot-overlay] 的 display',
  await evalJs(`getComputedStyle(document.querySelector('[data-boot-overlay]')).display`), 'none');
check('M-2 窄屏无横向溢出', 'scrollWidth / clientWidth',
  await evalJs(`document.documentElement.scrollWidth + ' / ' + document.documentElement.clientWidth`),
  await evalJs(`document.documentElement.clientWidth + ' / ' + document.documentElement.clientWidth`));
const shot390 = await shot('390-no-boot');
console.log(`        截图: ${shot390}`);

await send('Emulation.setEmulatedMedia', { features: [] });
await send('Emulation.setScriptExecutionDisabled', { value: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(1200);
const { root } = await send('DOM.getDocument', { depth: -1 });
const styleOf = async (selector) => {
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) return null;
  const { computedStyle } = await send('CSS.getComputedStyleForNode', { nodeId });
  const map = {}; for (const p of computedStyle) map[p.name] = p.value;
  return map;
};
const noJsOverlay = await styleOf('[data-boot-overlay]');
const noJsItem = await styleOf('.field-item');
check('N-1 无 JS：覆盖层不显示', '[data-boot-overlay] 的 display', noJsOverlay?.display, 'none');
check('N-2 无 JS：正文完整可见（#6/#21）', '.field-item 的 opacity / transform', `${noJsItem?.opacity} / ${noJsItem?.transform}`, '1 / none');
await send('Emulation.setScriptExecutionDisabled', { value: false });

/* ---------- ⑦ 关帧截图（人眼复核用） ---------- */
console.log('\n=== ⑦ 逐帧截图（1440×900，seek 后截）===');
await load(1440, 900, { fresh: true });
for (const frame of [200, 268, 520, 568, 601]) {
  const n = await seek(frame);
  await sleep(120);
  const f = await shot(`1440-f${frame}`);
  console.log(`        f${frame}: 驱动 ${n} 条动画 → ${f}`);
}

/* ---------- 收尾 ---------- */
ws.close(); chrome.kill(); server.close();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：开场动画的浏览器级断言全部符合预期' : fails + ' FAIL：上面有不符合预期的地方'} ===`);
console.log(`截图目录：${SHOTS}`);
process.exit(fails === 0 ? 0 : 1);
