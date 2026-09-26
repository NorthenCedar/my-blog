/**
 * 线上验收探针（_tmp 前缀 = 临时证据，不进正式工具）
 * 用法：node _tmp-live-boot-check.mjs
 *
 * 分工：本地已经有 scripts/verify-boot-intro.mjs（30 条）；这一份专门验**线上**——
 *   ① 轮询等 Cloudflare 构建完成，然后在真实域名上做结构检查（HTML + 真实 CSS 文件）
 *   ② 15 条路径的 HTTP 状态
 *   ③ 用 headless Chrome 打开线上页，做交互验收（覆盖层在播 / skip 获焦点 / Esc 收尾 + 焦点交回 / 二次访问不播）
 *      并在第 520 帧截一张**线上**的图，供人眼复核
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'https://northcedar.top';
const SHOTS = '<博客仓库>\\_tmp-boot-shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 本机到 northcedar.top 偶发 ECONNRESET（交接文件也记过 Cloudflare 大陆访问不稳）⇒ 取数一律带重试 */
const fetchRetry = async (url, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, { cache: 'no-store' });
    } catch (e) {
      last = e;
      await sleep(1500);
    }
  }
  throw last;
};
let fails = 0;
const check = (name, obj, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        对象: ${obj}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};

/* ---------- ① 等构建上线 ---------- */
console.log('=== ① 等 Cloudflare 构建（轮询线上 HTML）===');
const t0 = Date.now();
// 等的是**这一次修复**的标记：描边路径改成单段连续后，`M19.04 2.14…c-2-2.67…` 才会连在一起。
// 只等 data-boot-overlay 的话，上一次部署就已经满足，会误判成"已上线"。
const MARKER = 'M19.04 2.14a4 4 0 0 0-1.04-.14c-2 0-4 1.33-6 4c-2-2.67';
let html = '';
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetchRetry(SITE + '/', 2);
    const text = await res.text();
    if (text.includes(MARKER)) { html = text; break; }
  } catch (e) { /* 网络抖动就继续等 */ }
  await sleep(5000);
}
if (!html) {
  console.log(`FAIL  线上首页在 300s 内没出现本次修复的标记（可能构建失败/还在排队）`);
  process.exit(1);
}
console.log(`PASS  本次修复已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s）`);

/* ---------- ② 线上 HTML 与真实 CSS 的结构检查 ---------- */
console.log('\n=== ② 线上结构 ===');
const count = (re) => (html.match(re) ?? []).length;
// 注意：裸串 data-boot-overlay 在线上出现 2 次 —— 一次是元素本身，一次是行为脚本里的 querySelector。
// 断言要数**元素**，不是数字符串（这是本探针第一次跑时写错的地方）。
check('L-1 覆盖层根恰好 1 个', '<div class="boot" data-boot-overlay>', count(/<div class="boot" data-boot-overlay>/g), 1);
check('L-2 逐字 span 95 个', 'class="boot-ch"', count(/class="boot-ch"/g), 95);
check('L-3 skip 按钮 1 个', 'class="boot-skip"', count(/class="boot-skip"/g), 1);
check('L-4 装饰层 aria-hidden', 'class="boot-deco" aria-hidden="true"', count(/class="boot-deco" aria-hidden="true"/g), 1);
check('L-5 门控脚本在（默认不显示的 fail-safe 方向）', "classList.add('boot-on') 附近有 sessionStorage 判定", /sessionStorage\.getItem\('boot-intro'\)/.test(html) ? 'true' : 'false', 'true');
check('L-6 开场 CSS 没有内联进 HTML', '内联 @keyframes boot- 计数', count(/@keyframes boot-/g), 0);

const cssHref = (html.match(/href="(\/_astro\/[^"]+\.css)"/g) ?? [])
  .map((s) => s.replace(/href="|"/g, ''))
  .filter(Boolean);
let bootCssHref = null;
let bootCss = '';
let allCss = '';
for (const href of cssHref) {
  let text = '';
  try {
    text = await (await fetchRetry(SITE + href)).text();
  } catch (e) {
    console.log(`        取 ${href} 失败（已重试）：${e.message}`);
    continue;
  }
  allCss += '\n' + text;
  if (text.includes('@keyframes boot-')) { bootCssHref = href; bootCss = text; }
}
check('L-7 开场 CSS 作为独立文件可取到', '含 @keyframes boot- 的 _astro/*.css', bootCssHref ? 'found' : 'missing', 'found');
if (bootCssHref) {
  // 这个 bundle 是「Base + 首页 + 开场」合在一起的：79 条开场 + 7 条 B2 = 86。
  // 所以断言要分构成数，而不是数总数（本探针第一次跑就栽在这）。
  const kf = [...bootCss.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
  const boot = kf.filter((n) => n.startsWith('boot-')).length;
  const b2 = kf.filter((n) => ['sweep-in', 'type-in', 'wipe-in', 'rise-in', 'sweep-x', 'orbit', 'blink'].includes(n)).length;
  check('L-8 关键帧构成：开场 79 + B2 7', `boot-* / B2 = ${boot} / ${b2}（合计 ${kf.length}）`, `${boot}/${b2}`, '79/7');
  // token 的定义在 Base 那份 CSS 里（tokens.css 由 Base 引入），引用在首页这份里 ⇒ 两份合起来查。
  // 压缩器会把 20160ms 改写成 20.16s，所以按等价时长判、不按字面值判（工单 §6.1-S5 的注）。
  const raw = (allCss.match(/--dur-boot:[^;}]+/) ?? [''])[0];
  const val = raw.split(':')[1] ?? '';
  const ms = val.endsWith('ms') ? parseFloat(val) : parseFloat(val) * 1000;
  check('L-9 总时长 token：定义 + 被引用 + 等价 20160ms', `定义 = ${raw || '(缺)'} · 引用 var(--dur-boot) = ${bootCss.includes('var(--dur-boot)')}`,
    ms === 20160 && bootCss.includes('var(--dur-boot)') ? 'true' : 'false', 'true');
  check('L-10 舞台缩放用的是带单位除数', 'calc(100vw / 1920px)', bootCss.includes('calc(100vw / 1920px)') ? 'true' : 'false', 'true');
  console.log(`        CSS: ${bootCssHref} · ${Buffer.byteLength(bootCss, 'utf8')} 字节`);
}

/* ---------- ③ 15 条路径 HTTP 状态 ---------- */
console.log('\n=== ③ 站点可达性 ===');
const routes = ['/', '/about/', '/archive/', '/gallery/', '/tags/', '/tags/AI/', '/tags/成长/', '/tags/钢琴/', '/tags/建站/', '/tags/摄影/', '/tags/随笔/',
  '/posts/ai-built-this-blog/', '/posts/camera-in-gaosan/', '/posts/piano-eight-level-and-after/', '/rss.xml', '/sitemap-index.xml'];
const bad = [];
for (const r of routes) {
  try {
    const res = await fetchRetry(SITE + r, 3);
    if (res.status !== 200) bad.push(`${r}=${res.status}`);
  } catch (e) { bad.push(`${r}=ERR(${e.cause?.code ?? e.message})`); }
}
check('L-11 全部路径 200', `${routes.length} 条路径里非 200 的`, bad.length === 0 ? '0' : bad.join(' '), '0');

/* ---------- ④ 线上交互验收（headless Chrome） ---------- */
console.log('\n=== ④ 线上交互验收 ===');
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-live-boot-'));
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
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const f = join(SHOTS, name + '.png');
  writeFileSync(f, Buffer.from(data, 'base64'));
  return f;
};
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const loadLive = async () => {
  await send('Page.navigate', { url: SITE + '/' });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await sleep(600);
};
await loadLive();
check('L-12 线上默认态：覆盖层在播 + 锁滚动', 'display / html 是否含 js 与 boot-on（不整串比 className：站上还会挂跟手光标的类）',
  await evalJs(`(() => { const o = document.querySelector('[data-boot-overlay]'); const c = document.documentElement.classList; return (o ? getComputedStyle(o).display : 'MISSING') + ' / js=' + c.contains('js') + ' boot-on=' + c.contains('boot-on'); })()`),
  'block / js=true boot-on=true');
check('L-13 线上：skip 开场即获焦点', 'document.activeElement.className', await evalJs(`document.activeElement.className`), 'boot-skip');
const animCount = await evalJs(`document.querySelector('[data-boot-overlay]').getAnimations({ subtree: true }).length`);
check('L-14 线上：动画已注册（≥100 条为合理量级）', 'getAnimations({subtree:true}).length ≥ 100', animCount >= 100 ? 'true' : `false (${animCount})`, 'true');
// token 到底有没有生效，最硬的判据是浏览器算出来的时长（比查 CSS 字符串更接近真相）
check('L-14b 线上：总时长 token 真生效', '.boot-clock 的计算 animation-duration',
  await evalJs(`getComputedStyle(document.querySelector('.boot-clock')).animationDuration`), '20.16s');

// 逐帧截图：seek 到第 520 帧（双环收拢）与第 601 帧（黑底横扫）
for (const frame of [520, 601]) {
  await evalJs(`document.querySelector('[data-boot-overlay]').getAnimations({ subtree: true }).forEach((a) => { a.pause(); a.currentTime = ${(frame - 169) * 40}; })`);
  await sleep(150);
  console.log(`        线上 f${frame} 截图: ${await shot(`live-f${frame}`)}`);
}
// 线上放大截一张"描边画出来的标志"：这一处曾经画错成"两个瓣在下边相连、交叉处缺失"（用户发现的），
// 所以每次上线都要留一张能直接看出 ∞ 的图。
{
  await evalJs(`document.querySelector('[data-boot-overlay]').getAnimations({ subtree: true }).forEach((a) => { a.pause(); a.currentTime = ${(280 - 169) * 40}; })`);
  await sleep(150);
  const r = await evalJs(`(() => { const b = document.querySelector('.boot-logo svg').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: Math.max(0, r.x - 26), y: Math.max(0, r.y - 26), width: r.w + 52, height: r.h + 52, scale: 2.5 },
  });
  const f = join(SHOTS, 'live-mark-f280.png');
  writeFileSync(f, Buffer.from(data, 'base64'));
  console.log(`        线上描边标志放大截图（f280）: ${f}`);
}
// Esc 收尾
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
await sleep(300);
check('L-15 线上 Esc 跳过：覆盖层移除 + 滚动解锁 + 焦点回主标题', 'overlay / overflow / activeElement',
  await evalJs(`(() => { const o = document.querySelectorAll('[data-boot-overlay]').length; const ov = getComputedStyle(document.documentElement).overflow; const a = document.activeElement.classList.contains('display'); return o + ' / ' + ov + ' / ' + a; })()`),
  '0 / visible / true');

await evalJs(`sessionStorage.setItem('boot-intro','1')`);
await loadLive();
check('L-16 线上二次访问不重播', '[data-boot-overlay] 的 display',
  await evalJs(`getComputedStyle(document.querySelector('[data-boot-overlay]')).display`), 'none');

ws.close(); chrome.kill();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：线上验收全部符合预期' : fails + ' FAIL：线上有不符合预期的地方'} ===`);
process.exit(fails === 0 ? 0 : 1);
