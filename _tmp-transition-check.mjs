/**
 * 页面过渡验收（_tmp 前缀 = 临时证据）。
 * 验四件事：① 时刻表与站主要求一致（读 Web Animations 的真实 timing）；
 *          ② 总时长落在 0.8–1.0 秒内（实测动画跑完的墙钟时间）；
 *          ③ 首帧不许闪：新页第一帧就已经被蒙版盖住（用像素对比证明，不靠肉眼）；
 *          ④ 减少动态效果时不出现蒙版、导航照旧。
 * 用法：node _tmp-transition-check.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

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
const LIVE = process.env.SITE;
const BASE = LIVE ? LIVE.replace(/\/$/, '') : `http://127.0.0.1:${server.address().port}`;

// 打线上时等本次部署：门闩取**未加前缀的** backdrop-filter（本次修的正是"压缩器把它删了"）
if (LIVE) {
  const t0 = Date.now();
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    try {
      const html = await (await fetch(BASE + '/about/', { cache: 'no-store' })).text();
      const hrefs = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
      let css = '';
      for (const h of hrefs) css += await (await fetch(BASE + h, { cache: 'no-store' })).text();
      ok = /\.pt-pane\{[^}]*backdrop-filter:blur\(15px\)/.test(css.replace(/\s+/g, '')) && html.includes('pt-pane');
    } catch {}
    if (!ok) await sleep(5000);
  }
  console.log(ok ? `  本次部署已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s）` : '  警告：300s 内没等到过渡样式上线');
  if (!ok) process.exit(1);
}

let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};
const near = (name, actual, want, tol = 0.12) => {
  const ok = Math.abs(actual - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}（期望 ${want} ±${tol}）`);
};

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-pt-'));
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
const shotBuf = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');

/** 画面"有多深"：最暗像素的亮度（0-255）与暗像素占比 —— 用来证明第一帧是盖住的（没有清晰深色文字）。 */
const darkness = async (buf) => {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  let min = 255; let dark = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const v = data[i];
    if (v < min) min = v;
    if (v < 110) dark++;
  }
  return { min, darkRatio: +(dark / (data.length / info.channels)).toFixed(4) };
};
const waitDoc = async () => {
  for (let i = 0; i < 100; i++) {
    try { if (await evalJs('document.readyState') === 'complete') return true; } catch {}
    await sleep(20);
  }
  return false;
};

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

console.log('=== ① 从关于页点「友链」：时刻表 + 首帧 + 总时长 ===');
await send('Page.navigate', { url: BASE + '/about/' });
await waitDoc();
await sleep(400);
// 真点导航项（真鼠标事件，走站上真实的点击路径）
const hit = await evalJs(`(() => { const a = [...document.querySelectorAll('nav[aria-label="主导航"] a')].find((x) => x.textContent.trim() === '友链'); const b = a.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });

// 抓新页第一帧（尽早）与整条时间线的运行参数
let armedAt = null;
for (let i = 0; i < 200; i++) {
  try {
    const st = await evalJs(`document.documentElement.classList.contains('pt-play') ? (document.querySelector('.pt') ? 'ok' : 'no-el') : 'wait'`);
    if (st === 'ok') { armedAt = Date.now(); break; }
  } catch {}
  await sleep(10);
}
check('新页加载时蒙版已就位并带 pt-play（首帧前挂上）', armedAt ? 'true' : 'false', 'true');
const frame0 = await shotBuf();
writeFileSync(join(SHOTS, 'pt-000.png'), frame0);
const d0 = await darkness(frame0);
console.log(`  第一帧最暗像素 ${d0.min} · 暗像素占比 ${d0.darkRatio}`);

// 读真实动画参数（Web Animations API）。
// ⚠️ 缓动要从**关键帧**上读：CSS 动画的 effect easing 恒为 "linear"，
// 真正的 animation-timing-function 落在每一帧的 easing 上（第一版读错地方 ⇒ 三条假红）。
const params = JSON.parse(await evalJs(`JSON.stringify(document.getAnimations().map((a) => { const k = a.effect.getKeyframes(); return { target: (a.effect.target.className || a.effect.target.tagName).toString().split(' ')[0], dur: a.effect.getTiming().duration, delay: a.effect.getTiming().delay, ease: k.map((f) => f.easing).filter((x) => x && x !== 'linear').join(',') || k[0].easing }; }))`));
const byTarget = (n) => params.filter((p) => p.target.includes(n));
console.log('  运行中的动画:', JSON.stringify(params, null, 0));
const pane = byTarget('pt-pane');
const line = byTarget('pt-line');
const shell = byTarget('shell');
check('① 蒙版对焦：300ms、0 起、ease-out', pane.some((p) => p.dur === 300 && p.delay === 0 && p.ease.includes('ease-out')) ? 'true' : JSON.stringify(pane), 'true');
check('③ 蒙版撕裂：400ms、400ms 起、前快后慢曲线', pane.some((p) => p.dur === 400 && p.delay === 400 && /0\.1,\s*0\.9,\s*0\.2,\s*1/.test(p.ease)) ? 'true' : JSON.stringify(pane), 'true');
check('② 轴线：200ms、150ms 起、cubic-bezier(0.16,1,0.3,1)', line.some((p) => p.dur === 200 && p.delay === 150 && /0\.16,\s*1,\s*0\.3,\s*1/.test(p.ease)) ? 'true' : JSON.stringify(line), 'true');
check('④ 内容浮现：200ms、400ms 起（与③并行、无错落）', shell.some((p) => p.dur === 200 && p.delay === 400) ? 'true' : JSON.stringify(shell), 'true');

// 总时长：**以声明的 timing 为准**（max(delay+duration)）—— 墙钟会因为我"探测到蒙版"的时刻
// 受网络/加载影响而偏短（线上实测 687ms，其实动画一点没少）。墙钟只做"确实在 1 秒多内结束"的旁证。
const visible = params.filter((p) => p.target.includes('pt-pane') || p.target.includes('pt-line') || p.target.includes('shell') || p.target.includes('topbar') || p.target.includes('rail') || p.target.includes('hud') || p.target.includes('brandline'));
const declaredTotal = Math.max(...visible.map((p) => p.delay + p.dur));
const t0 = Date.now();
await evalJs(`Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))).then(() => 1)`);
const elapsed = Date.now() - t0;
console.log(`  声明总时长（max(delay+duration)）= ${declaredTotal}ms · 探测后剩余墙钟 ${elapsed}ms`);
check('② 声明总时长正好 800ms（站主要求 0.8–1.0 秒）', declaredTotal === 800 ? 'true' : `${declaredTotal}ms`, 'true');
check('② 墙钟旁证：探测后 1.2 秒内全部结束', elapsed <= 1200 ? 'true' : `${elapsed}ms`, 'true');

// 结束态：蒙版已推出屏幕、内容恢复
const endState = JSON.parse(await evalJs(`(() => { const p = document.querySelector('.pt'); const t = document.querySelector('.pt-top').getBoundingClientRect(); const s = getComputedStyle(document.querySelector('.shell')); return JSON.stringify({ ptVisibility: getComputedStyle(p).visibility, topPaneY: Math.round(t.y), shellOpacity: s.opacity, shellTransform: s.transform, scrollBlocked: getComputedStyle(document.body).pointerEvents }); })()`));
console.log(`  结束态: ${JSON.stringify(endState)}`);
check('结束：蒙版已隐藏', endState.ptVisibility, 'hidden');
check('结束：上蒙版已推到屏幕上方', endState.topPaneY <= 0 ? 'true' : String(endState.topPaneY), 'true');
check('结束：内容 opacity=1 且 transform 归位', `${endState.shellOpacity}/${endState.shellTransform === 'none' || endState.shellTransform === 'matrix(1, 0, 0, 1, 0, 0)'}`, '1/true');

// 时间线中途的几张：**暂停并精确定位**到某一时刻再拍（截图本身有几百毫秒延迟，
// 靠 sleep 抓帧会抓到"下一阶段"，第一版就是这么被污染的 ⇒ 改用 Web Animations 的 pause + currentTime）。
console.log('\n=== ② 逐阶段定格（暂停 + 定位到 t，再读真实几何）===');
await send('Page.navigate', { url: BASE + '/about/' });
await waitDoc();
await sleep(400);
const hit2 = await evalJs(`(() => { const a = [...document.querySelectorAll('nav[aria-label="主导航"] a')].find((x) => x.textContent.trim() === '友链'); const b = a.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit2.x, y: hit2.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit2.x, y: hit2.y, button: 'left', clickCount: 1 });
for (let i = 0; i < 250; i++) { try { if (await evalJs(`document.documentElement.classList.contains('pt-play')`)) break; } catch {} await sleep(8); }
await evalJs(`document.getAnimations().forEach((a) => a.pause())`);

/** 定位到 t 毫秒并读出该时刻的真实几何/样式 */
const at = async (t) => {
  const out = await evalJs(`(() => {
    document.getAnimations().forEach((a) => { a.currentTime = ${t}; });
    const top = document.querySelector('.pt-top');
    const bot = document.querySelector('.pt-bottom');
    const ln = document.querySelector('.pt-line');
    const shell = document.querySelector('.shell');
    const cs = getComputedStyle(top);
    const ls = getComputedStyle(ln);
    const ss = getComputedStyle(shell);
    const r = (el) => el.getBoundingClientRect();
    return JSON.stringify({
      t: ${t},
      上蒙版top: Math.round(r(top).top),
      上蒙版底边: Math.round(r(top).bottom),
      下蒙版top: Math.round(r(bot).top),
      线宽: Math.round(r(ln).width * 100) / 100,
      线不透明度: ls.opacity,
      蒙版模糊: cs.backdropFilter || cs.webkitBackdropFilter,
      内容不透明度: ss.opacity,
      内容缩放: ss.transform,
    });
  })()`);
  return JSON.parse(out);
};

const frames = [0, 150, 300, 400, 500, 600, 800, 900];
for (const t of frames) {
  const s = await at(t);
  console.log(`  t=${String(t).padStart(3)}ms  ${JSON.stringify(s)}`);
  writeFileSync(join(SHOTS, `pt-${String(t).padStart(3, '0')}.png`), await shotBuf());
}
// 阶段语义断言（用定格的几何，不靠肉眼）
const f0 = await at(0);
const f150 = await at(150);
const f300 = await at(300);
const f420 = await at(420);
const f800 = await at(800);
check('t=0：两块蒙版正好盖满视口（上 0→中，下中→底）', f0.上蒙版top === 0 && f0.上蒙版底边 >= 450 && f0.下蒙版top <= 450 ? 'true' : JSON.stringify(f0), 'true');
check('t=0：模糊是 15px（极速对焦的起点）', /blur\(15px\)/.test(f0.蒙版模糊) ? 'true' : f0.蒙版模糊, 'true');
check('t=150：第二阶段刚要起步，线还没出（宽 0）', f150.线宽 === 0 ? 'true' : `false（${f150.线宽}）`, 'true');
check('t=300：线已几乎抽满（第二阶段 150–350 的收尾）', f300.线宽 > 1000 ? 'true' : `false（${f300.线宽}）`, 'true');
check('t=300：模糊已消散到 0（第一阶段收尾）', /blur\(0px\)/.test(f300.蒙版模糊) ? 'true' : f300.蒙版模糊, 'true');
check('t=420：两块已经开始分离（第三阶段刚起）', f420.上蒙版底边 < f0.上蒙版底边 ? 'true' : JSON.stringify(f420), 'true');
check('t=800：蒙版全部离场、线已淡出、内容归位', f800.上蒙版底边 <= 0 && f800.内容不透明度 === '1' ? 'true' : JSON.stringify(f800), 'true');
check('④ 内容浮现与③并行（t=420 已开始、t=600 应已到位）', (await at(600)).内容不透明度 === '1' ? 'true' : JSON.stringify(await at(600)), 'true');
const dEarly = await darkness(readFileSync(join(SHOTS, 'pt-000.png')));
const dEnd = await darkness(readFileSync(join(SHOTS, 'pt-800.png')));
console.log(`  首帧最暗像素 ${dEarly.min}（暗像素占比 ${dEarly.darkRatio}） vs 结束帧 ${dEnd.min}（${dEnd.darkRatio}）`);
check('③ 首帧比结束帧"糊"得多（证明第一帧是被蒙版盖住的，不是先闪内容）', dEarly.min > dEnd.min + 30 ? 'true' : `false（${dEarly.min} vs ${dEnd.min}）`, 'true');

console.log('\n=== ③ 减少动态效果：不该出现蒙版 ===');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.navigate', { url: BASE + '/about/' });
await waitDoc();
await sleep(400);
const rmHit = await evalJs(`(() => { const a = [...document.querySelectorAll('nav[aria-label="主导航"] a')].find((x) => x.textContent.trim() === '友链'); const b = a.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rmHit.x, y: rmHit.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rmHit.x, y: rmHit.y, button: 'left', clickCount: 1 });
await waitDoc();
await sleep(300);
const rmState = await evalJs(`JSON.stringify({ on: document.documentElement.classList.contains('pt-on'), play: document.documentElement.classList.contains('pt-play'), display: getComputedStyle(document.querySelector('.pt')).display, url: location.pathname })`);
console.log(`  ${rmState}`);
const rm = JSON.parse(rmState);
check('减少动态效果：蒙版不出现', rm.display === 'none' || rm.play === false ? 'true' : rmState, 'true');
check('减少动态效果：导航照旧（跳转成功）', rm.url, '/links/');
await send('Emulation.setEmulatedMedia', { features: [] });

ws.close(); chrome.kill(); server.close();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：过渡时间线与首帧符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
