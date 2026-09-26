/**
 * 光标上线的线上验收（_tmp 前缀 = 临时证据）
 * 等的是**本次部署**的标记（CSS 里出现 /cursors/ 引用），而不是上次部署就满足的标记。
 * 用法：node _tmp-live-cursor-check.mjs
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
  for (let i = 0; i < tries; i++) {
    try { return await fetch(url, { cache: 'no-store' }); } catch (e) { last = e; await sleep(1500); }
  }
  throw last;
};

/* ---------- ① 等本次部署上线 ---------- */
console.log('=== ① 等 Cloudflare 构建 ===');
const t0 = Date.now();
let cssHref = '';
let css = '';
let htmlOk = false;
// ⚠️ 标记必须选**本次部署新增**的东西，否则旧部署就已满足 —— 这个坑我踩了三次：
//    第一次用 /cursors/normal.png（文件名没变）、第二次用 normal-32.png（上一版已有）、
//    第三次用 ?v= 指纹（也已有）。这次用本次新增的 DOM 元素 .cr-ring（HTML 层可判，最可靠）。
for (let i = 0; i < 60; i++) {
  try {
    const html = await (await fetchRetry(SITE + '/', 2)).text();
    // 标记必须选**本次部署新增**的东西；本次是**删除型**部署（两枚光标删掉、HTML 里没有新增元素）
    // ⇒ 只能用**否定条件**：CSS 里不再有 --cursor-text / --cursor-link 才算新版本上线。
    // （这是"等构建标记"这条纪律的第四次踩坑，前三次见工单 §14.4；结论补一句：删除型部署要用"某东西消失了"。）
    htmlOk = html.includes('cr-dot');
    const hrefs0 = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => m[1]);
    for (const h of hrefs0) {
      const text = await (await fetchRetry(SITE + h)).text();
      if (text.includes('/cursors/normal.png?v=') && !text.includes('--cursor-text') && !text.includes('--cursor-link')) { cssHref = h; css = text; break; }
    }
    if (htmlOk && css) break;
  } catch (e) { /* 抖动就继续等 */ }
  await sleep(5000);
}
if (!htmlOk || !css) {
  console.log(`FAIL  300s 内没等到本次部署（HTML 有 cr-ring=${htmlOk}，CSS 有指纹=${!!css}）`);
  process.exit(1);
}
console.log(`PASS  本次部署已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s）· ${cssHref}`);

/* ---------- ② 线上 CSS 与素材 ---------- */
console.log('\n=== ② 线上 CSS 与素材 ===');
const flat = css.replace(/\s+/g, ' ');
// 只剩一条兜底 token（带内容指纹），删掉的两条不许有残迹
check('CSS · --cursor-default（主图 64 + 32 兜底 + 指纹 + 关键字）', /--cursor-default:url\(\/cursors\/normal\.png\?v=[0-9a-f]{8}\) 3 0, url\(\/cursors\/normal-32\.png\?v=[0-9a-f]{8}\) 2 0, default/.test(flat) ? 'true' : 'false', 'true');
check('CSS · 删掉的两条 token 无残迹（--cursor-text / --cursor-link）', /\-\-cursor\-(text|link)/.test(flat) ? 'false' : 'true', 'true');
check('CSS · cursor:none 是全局的（html.cursor-none *）', /html\.cursor-none[^{}]*\{[^}]*cursor:none/.test(flat) ? 'true' : 'false', 'true');
for (const [name, want] of [['normal.png', 64], ['normal-32.png', 32]]) {
  const res = await fetchRetry(`${SITE}/cursors/${name}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const colorType = buf.readUInt8(25);
  check(`素材 /cursors/${name}`, `${res.status} · ${w}×${h} · alpha=${colorType === 6} · ${buf.length} 字节`, `200 · ${want}×${want} · alpha=true · ${buf.length} 字节`);
}

/* ---------- ③ 线上计算值 ---------- */
console.log('\n=== ③ 线上计算光标值 ===');
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-live-cursor-'));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const open = async (path) => {
  await send('Page.navigate', { url: SITE + path });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await sleep(600);
};
const cursors = (pairs) => evalJs(`(() => { const out = {}; for (const [l, s] of ${JSON.stringify(pairs)}) { const e = document.querySelector(s); out[l] = e ? getComputedStyle(e).cursor : '(缺)'; } return out; })()`);
// 期望值从线上页面自身读（:root 的三个 token），规范化后比对 —— 指纹每改一次就变，不能硬编码
const norm = (v) => v.replace(/url\(["']?/g, 'url(').replace(/["']?\)/g, ')').replace(/https?:\/\/[^/)]+/g, '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();

await open('/');
const TOK = await evalJs(`(() => getComputedStyle(document.documentElement).getPropertyValue('--cursor-default').trim())()`);
const NORMAL = norm(TOK);
console.log(`        token --cursor-default = ${NORMAL}`);
const home = await cursors([['页面底', 'html'], ['正文段落', '.pod p'], ['控制台标签', '.pod-tag'], ['导航链接', 'nav[aria-label="页面区段"] a'], ['正文里的链接', '.pod a[href]']]);
// 站主最终形态：**全站只有一个白点** ⇒ 有 JS 时任何元素都是 none（链接也不能例外：
// UA 的 a{cursor:pointer} 会压过继承，所以 cursor:none 必须是全局 `html.cursor-none *`）
check('线上首页 · 页面底 = none', norm(home['页面底']), 'none');
check('线上首页 · 正文 = none', norm(home['正文段落']), 'none');
check('线上首页 · 控制台标签 = none', norm(home['控制台标签']), 'none');
check('线上首页 · 链接 = none（UA 的 a{cursor:pointer} 没漏出来）', norm(home['导航链接']), 'none');
check('线上首页 · 正文里的链接 = none', norm(home['正文里的链接']), 'none');

// **无 JS 时的回落**（`--cursor-default` 存在的意义）：关掉脚本，所有元素都回到那一枚兜底
await send('Emulation.setScriptExecutionDisabled', { value: true });
await open('/');
const noJs = await cursors([['页面底', 'html'], ['控制台标签', '.pod-tag'], ['正文段落', '.pod p'], ['导航链接', 'nav[aria-label="页面区段"] a']]);
check('无 JS · 页面底回落到兜底光标', norm(noJs['页面底']), NORMAL);
check('无 JS · 控制台标签回落到兜底光标', norm(noJs['控制台标签']), NORMAL);
check('无 JS · 正文回落到兜底光标', norm(noJs['正文段落']), NORMAL);
// 无 JS 时**链接**不会回到兜底光标：UA 的 `a{cursor:pointer}` 是元素自身声明，压过从 html 继承来的兜底值。
// 这反而是合适的行为（关掉脚本时链接用系统手型）——如实记下，别把它当 bug。
check('无 JS · 链接为系统手型（UA 规则压过继承，符合预期）', norm(noJs['导航链接']), 'pointer');
await send('Emulation.setScriptExecutionDisabled', { value: false });
// 顺手留一张现场图（注意：系统光标拍不进去，图里不会有指针，这里只为留个线上页面状态）
const { data } = await send('Page.captureScreenshot', { format: 'png' });
const f = join(SHOTS, 'live-index-cursor.png');
writeFileSync(f, Buffer.from(data, 'base64'));
console.log(`        线上首页截图（不含指针本身）: ${f}`);

await open('/posts/ai-built-this-blog/');
const post = await cursors([['正文', '.prose p'], ['正文内链', '.prose a'], ['复制按钮', '.copy-btn'], ['textarea', '.comment-form textarea']]);
check('线上文章页 · 正文 = none', norm(post['正文']), 'none');
check('线上文章页 · 正文里的链接 = none', norm(post['正文内链']), 'none');
check('线上文章页 · 代码块按钮 = none', norm(post['复制按钮']), 'none');
check('线上文章页 · textarea = none', norm(post['textarea']), 'none');

/* ---------- ④ 跟手光标（白点 + 盘 + 涟漪；DOM 元素，能进截图 ⇒ 线上也能留视觉证据） ---------- */
console.log('\n=== ④ 线上：跟手光标 ===');
check('线上页面三个元素齐全', await evalJs(`document.querySelectorAll('.cr-disc,.cr-dot,.cr-ripple').length`), 3);
check('线上原生光标已隐藏（JS 加的类 + 计算值）', await evalJs(`document.documentElement.classList.contains('cursor-none') + '/' + getComputedStyle(document.body).cursor`), 'true/none');
// 白点：先找一个"既不是文字也不是可点元素"的空白点（那里白点必须显形）
const spot = await evalJs(`(() => {
  const bad = (e) => !e || e.closest('a,button,input,textarea,select,summary,[role="button"],[role="tab"]') || e.closest('p,li,blockquote,h1,h2,h3,h4,h5,h6,td,th,pre,code,kbd,samp,article,.prose');
  for (let y = 120; y < innerHeight - 80; y += 40) for (let x = 1000; x < innerWidth - 60; x += 60) { const e = document.elementFromPoint(x, y); if (!bad(e)) return { x, y }; }
  return null;
})()`);
if (spot) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: spot.x, y: spot.y, button: 'none' });
  await sleep(300);
  const dotAt = await evalJs(`(() => { const e = document.querySelector('.cr-dot'); const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width), opacity: getComputedStyle(e).opacity, cls: document.documentElement.className }; })()`);
  check(`线上：空白处白点显形且精确落在指针（${spot.x},${spot.y}）`, `${Math.abs(dotAt.x - spot.x) <= 2}/${Math.abs(dotAt.y - spot.y) <= 2}/${dotAt.w}/${dotAt.opacity}/${dotAt.cls.includes('cr-text')}`, 'true/true/8/1/false');
} else {
  console.log('  （找不到空白点）');
  fails++;
}
const discAt = await evalJs(`(() => { const e = document.querySelector('.cr-disc'); const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width) }; })()`);
const ref = spot || { x: 420, y: 300 };
check('线上：盘缓动收敛到同一点（±4px）且 34px', `${Math.abs(discAt.x - ref.x) <= 4}/${Math.abs(discAt.y - ref.y) <= 4}/${discAt.w}`, 'true/true/34');
// 涟漪圆心必须钉在点击处（本站修过"往右下飞"）
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 460, y: 340, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 460, y: 340, button: 'left', clickCount: 1 });
const rippleCenters = [];
for (let i = 0; i < 4; i++) {
  await sleep(110);
  rippleCenters.push(await evalJs(`(() => { const b = document.querySelector('.cr-ripple').getBoundingClientRect(); return Math.round(b.x + b.width / 2) + ',' + Math.round(b.y + b.height / 2); })()`));
}
const off = rippleCenters.filter((s) => { const [x, y] = s.split(',').map(Number); return Math.abs(x - 460) > 2 || Math.abs(y - 340) > 2; });
check('线上：涟漪圆心 4 帧都钉在点击处（±2px）', off.length === 0 ? `0 帧漂移（${rippleCenters.join(' | ')}）` : `漂移：${off.join(' ')}`, `0 帧漂移（${rippleCenters.join(' | ')}）`);
// 放大图：白点 8px，整页缩略图看不见 ⇒ 裁 120×120 放大 4 倍（**必须用指针当前所在的那个点**，
// 这里已经因为"截图坐标与指针坐标不一致"白拍了一次）
await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, ref.x - 60), y: Math.max(0, ref.y - 60), width: 120, height: 120, scale: 4 } }).then(({ data }) => {
  const f = join(SHOTS, 'live-cursor-dot-zoom.png');
  writeFileSync(f, Buffer.from(data, 'base64'));
  console.log(`        线上白点放大图（4×，围绕指针 ${ref.x},${ref.y}）: ${f}`);
});

ws.close(); chrome.kill();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：线上光标验收全部符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
