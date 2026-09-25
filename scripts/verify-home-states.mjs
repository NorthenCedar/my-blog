#!/usr/bin/env node
/**
 * 首页三态验证器（B2 动效层）—— 官方脚本，不是临时探针。
 *
 * 用法：
 *   npm run build
 *   node scripts/verify-home-states.mjs
 *   环境变量 CHROME_PATH 可指定 Chrome；否则按常见路径找。
 *
 * 为什么是脚本而不是 vitest 测试：
 *   这里要验的是**浏览器里的真实结果** —— 计算样式、getAnimations() 的 animationName、
 *   以及"禁用 JS 后页面到底长什么样"。这些需要真实 Chrome + CDP，本仓库没有 CI 浏览器，
 *   放进 vitest 只会变成"在 CI 上跳过"。所以：
 *     · 浏览器级 = 本脚本（按需跑，退出码即结论）
 *     · 静态契约 = tests/b2-motion.test.ts（不打开浏览器也能红）
 *
 * 三态：
 *   ① 默认（html.js）—— 仪表可见、门控类挂上
 *   ② prefers-reduced-motion: reduce —— 不位移、不补间、循环动画不跑
 *   ③ 无 JS —— 正文可见、死读数被藏掉、纯 CSS 的背景层照常渲染
 *   ③ 无 JS 态不能用页面脚本断言（JS 已禁用），走 CDP 的 DOM/CSS 域读计算样式。
 *
 * 输出规矩（台账 21a5c66）：每条断言打印 判据名 + 对象 + 实测值，禁止裸 PASS。
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html 不存在 —— 先跑 npm run build');
  process.exit(2);
}

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

/* ---------- 进程内静态服务（以 dist 为根，产物里的绝对路径才对得上） ---------- */
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
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}/`;
console.log(`静态服务：${BASE}（根目录 dist/）`);

/* ---------- CDP ---------- */
const profile = await mkdtemp(join(tmpdir(), 'dsh-home-states-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*',
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let wsUrl = null;
const portFromStderr = new Promise((resolve) => {
  chrome.stderr.on('data', (d) => {
    const m = String(d).match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
});
wsUrl = await Promise.race([portFromStderr, sleep(15000).then(() => null)]);
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
const load = async (w, h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE });
  for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(150); }
  await sleep(900);
};

/* ---------- ① 默认态 ---------- */
console.log('\n=== ① 默认态（html.js）===');
await send('Emulation.setScriptExecutionDisabled', { value: false });
await send('Emulation.setEmulatedMedia', { features: [] });
await load(1440, 900);
check('D-1 <html> 挂上了 js 门控类', 'document.documentElement.className', await evalJs('document.documentElement.className'), 'js');
check('D-2 两个仪表可见', '#hudPct / .band-readout 的 display',
  await evalJs(`[getComputedStyle(document.getElementById('hudPct')).display, getComputedStyle(document.querySelector('.band-readout')).display].join(',')`),
  // 期望值不是 CSS 里写的 inline/inline-flex：浏览器会块化 —— #hudPct 是 flex 项 → block；.band-readout 是 absolute → flex
  'block,flex');
const animNames = await evalJs(`(()=>{
  const need=['sweep-in','sweep-x','type-in','wipe-in','orbit','blink','rise-in'];
  const got=['.band-line','.band-sweep','.hud .site','.bg-mark','.bg-orbit','.hud .rec','.pod-s1 > *']
    .flatMap(s=>{const e=document.querySelector(s); return e?e.getAnimations().filter(x=>x.animationName).map(x=>x.animationName):[];});
  const miss=need.filter(n=>!got.includes(n));
  return miss.length ? '缺 '+miss.join(',')+'（实际在跑：'+[...new Set(got)].join('/')+'）' : '七组全部命中';
})()`);
check('D-3 七组 @keyframes 实际注册并在跑', "element.getAnimations().animationName", animNames, '七组全部命中');

/* ---------- ② prefers-reduced-motion ---------- */
console.log('\n=== ② prefers-reduced-motion: reduce ===');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await load(1440, 900);
check('R-1 不弱化、不位移', '.field-item computed opacity / transform',
  await evalJs(`(()=>{const s=getComputedStyle(document.querySelector('.field-item'));return s.opacity+' / '+s.transform;})()`), '1 / none');
check('R-2 循环动画全停', '.band-sweep/.hud .rec/.bg-orbit 运行中的 CSS 动画数',
  await evalJs(`[...document.querySelectorAll('.band-sweep,.hud .rec,.bg-orbit')].reduce((n,e)=>n+e.getAnimations().filter(x=>x.animationName).length,0)`), 0);

/* ---------- ③ 无 JS ---------- */
console.log('\n=== ③ 无 JS（脚本执行已禁用）===');
await send('Emulation.setEmulatedMedia', { features: [] });
await send('Emulation.setScriptExecutionDisabled', { value: true });
await send('Page.navigate', { url: BASE });
await sleep(1800);
const { root } = await send('DOM.getDocument', { depth: -1 });
const styleOf = async (selector) => {
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) return null;
  const { computedStyle } = await send('CSS.getComputedStyleForNode', { nodeId });
  const map = {}; for (const p of computedStyle) map[p.name] = p.value;
  return map;
};
const fieldItem = await styleOf('.field-item');
check('N-1 正文可见（不弱化、不位移）', '.field-item computed opacity / transform', `${fieldItem.opacity} / ${fieldItem.transform}`, '1 / none');
const hudPct = await styleOf('#hudPct');
const readout = await styleOf('.band-readout');
check('N-2 死读数被藏掉（没人在更新的假仪表）', '#hudPct / .band-readout 的 display', `${hudPct.display} / ${readout.display}`, 'none / none');
const railFill = await styleOf('.rail-fill');
check('N-3 刻度填充不显示半个指针', '.rail-fill height', railFill.height, '0px');
const bgMark = await styleOf('.bg-mark');
check('N-4 纯 CSS 的背景层照常渲染（不依赖 JS）', '.bg-mark display / opacity', `${bgMark.display} / ${bgMark.opacity}`, 'block / 0.055');
const bgRing = await styleOf('.bg-ring');
check('N-5 同心环也照常渲染', '.bg-ring display', bgRing.display, 'block');

/* ---------- 收尾 ---------- */
ws.close();
chrome.kill();
server.close();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：三态全部符合预期' : fails + ' FAIL：上面有不符合预期的地方'} ===`);
process.exit(fails === 0 ? 0 : 1);
