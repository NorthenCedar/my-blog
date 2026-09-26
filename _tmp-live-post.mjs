/**
 * 文章页迁移 + 目录锚点修复的**线上**验收（临时证据，勿删）
 * 清单按站主要求补全到三条：首页 / 文章页 / 相册页。文章页是重点（补上轮那个覆盖缺口）。
 * 部署判据：文章页 body 带 chrome-page（这次改动才有）。
 */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'https://northcedar.top';
const POST = '/posts/ai-built-this-blog/';
const OUT = '<本机工作区>\\_tmp-shots-live2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await mkdir(OUT, { recursive: true });

console.log('=== 等部署（判据：文章页出现 chrome-page 外壳）===');
const t0 = Date.now();
let live = false;
for (let i = 1; Date.now() - t0 < 600000; i++) {
  try {
    const html = await (await fetch(`${BASE}${POST}?cb=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } })).text();
    const ok = html.includes('chrome-page') && html.includes('class="pagehead"');
    console.log(`  #${String(i).padStart(2, '0')} ${((Date.now() - t0) / 1000).toFixed(0)}s  chrome-page + pagehead = ${ok}`);
    if (ok) { live = true; break; }
  } catch (e) { console.log(`  抓取失败: ${e.cause?.code ?? e.message}`); }
  await sleep(15000);
}
if (!live) { console.error('=== 部署等待超时 ==='); process.exit(1); }
console.log(`部署已生效，用时 ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

const profile = await mkdtemp(join(tmpdir(), 'dsh-live2-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', '--window-size=1440,900', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await Promise.race([
  new Promise((r) => chrome.stderr.on('data', (d) => { const m = String(d).match(/DevTools listening on (ws:\/\/\S+)/); if (m) r(m[1]); })),
  sleep(15000).then(() => null),
]);
if (!wsUrl) { console.error('Chrome 没起来'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const cErr = [], exc = [], bad = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) cErr.push(m.params.args.map((a) => a.value ?? a.type).join(' '));
  if (m.method === 'Runtime.exceptionThrown') exc.push(m.params.exceptionDetails.text);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) bad.push(`HTTP ${m.params.response.status} ${m.params.response.url}`);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
});
const raw = (me, pa, s) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: me, params: pa ?? {}, ...(s ? { sessionId: s } : {}) })); });
const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
const send = (m, pa) => raw(m, pa, sessionId);
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
let fails = 0;
const ck = (n, o, a, w) => { const ok = String(a) === String(w); if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}\n        对象: ${o}\n        实测: ${a}${ok ? '' : `（期望 ${w}）`}`); };
const go = async (p, w, h, wait = 1800) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${BASE}${p}?cb=${Date.now()}` });
  for (let i = 0; i < 100; i++) { if (await ev('document.readyState') === 'complete') break; await sleep(150); }
  await sleep(wait);
};
const shot = async (n) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(OUT, n), Buffer.from(data, 'base64')); console.log(`  INFO 截图 ${n}`); };

/* ---------- 文章页（重点） ---------- */
console.log('=== ① 文章页（重点：补上轮那个覆盖缺口）===');
await go(POST, 1440, 900, 3000);
ck('A1 已换内页外壳', 'body.className', await ev('document.body.className'), 'chrome-page');
ck('A2 深色带不再渲染', '.band / .brandline 计数', await ev(`document.querySelectorAll('.band,.brandline').length`), 0);
ck('A3 标题在正文流里', '.pagehead h1 文本', await ev(`document.querySelector('.pagehead h1').textContent.trim()`), '我用手机 AI 指挥电脑 AI，从零搭了这个博客');
ck('A4 Meta 在正文流且已主题化', '.pagehead .meta 的 color / 是否含日期', await ev(`(()=>{const m=document.querySelector('.pagehead .meta');
  return getComputedStyle(m).color + ' / ' + m.textContent.includes('2026-09-16');})()`), 'rgb(90, 90, 86) / true');
const toc = await ev(`(()=>{const a=[...document.querySelectorAll('.toc a[href^="#"]')];
  const d=a.filter(x=>!document.getElementById(decodeURIComponent(x.getAttribute('href').slice(1))));
  return a.length + ' 条 / 悬空 ' + d.length + ' 条 / 含undefined ' + a.some(x=>x.getAttribute('href').includes('undefined'));})()`);
ck('A5 目录锚点真的能跳（**本轮修复的重点**）', '.toc 链接数 / 悬空 / 含 undefined', toc, '5 条 / 悬空 0 条 / 含undefined false');
const cm = await ev(`(()=>{const err=document.querySelector('.comment-error');
  const vis=err && !err.hasAttribute('hidden') && getComputedStyle(err).display!=='none';
  return '错误提示可见=' + !!vis + ' / 文案=' + JSON.stringify(err?err.textContent.trim():'') + ' / 空态=' + JSON.stringify((document.querySelector('.comment-empty')||{}).textContent||'') + ' / 表单=' + !!document.querySelector('.comment-form');})()`);
ck('A6 评论能加载（没有走错误分支）', '.comment-error 可见性 / 空态 / 表单', cm.split(' / 文案=')[0] + ' / ' + cm.split(' / 空态=')[1], '错误提示可见=false / 空态="还没有人留言。你可以是第一个。" / 表单=true');
ck('A7 相邻导航与评论区仍在', '.adj / .comments 计数', await ev(`document.querySelectorAll('.adj').length + ' / ' + document.querySelectorAll('.comments').length`), '1 / 1');
ck('A8 无横向溢出 1440', 'scrollWidth/innerWidth', await ev(`document.documentElement.scrollWidth + '/' + window.innerWidth`), '1440/1440');
await shot('live2-post-1440.png');
await go(POST, 390, 844, 1200);
ck('A9 无横向溢出 390', 'scrollWidth/innerWidth', await ev(`document.documentElement.scrollWidth + '/' + window.innerWidth`), '390/390');
await shot('live2-post-390.png');

/* ---------- 首页 ---------- */
console.log('\n=== ② 首页 ===');
await go('/', 1440, 900, 1200);
ck('B1 外壳 + 入口', 'body.className / S3 锚点数', await ev(`document.body.className + ' / ' + document.querySelectorAll('.frames a.frame').length`), 'chrome-console / 3');
ck('B2 无横向溢出 1440', 'scrollWidth/innerWidth', await ev(`document.documentElement.scrollWidth + '/' + window.innerWidth`), '1440/1440');

/* ---------- 相册页 ---------- */
console.log('\n=== ③ 相册页 ===');
await go('/gallery/', 1440, 900, 1500);
ck('C1 82 帧 + 顶栏当前页', 'figure 计数 / aria-current 文本',
  await ev(`document.querySelectorAll('.wf figure').length + ' / ' + document.querySelector('.topbar a[aria-current]').textContent.trim()`), '82 / 相册');
await go('/gallery/', 390, 844, 1200);
ck('C2 无横向溢出 390', 'scrollWidth/innerWidth', await ev(`document.documentElement.scrollWidth + '/' + window.innerWidth`), '390/390');

console.log('\n=== console / 网络（三条页面整轮累计）===');
console.log(`  console error/warning ${cErr.length} 条 ${cErr.slice(0, 2).join(' | ')}`);
console.log(`  未捕获异常 ${exc.length} 条`);
console.log(`  HTTP >=400 ${bad.length} 条 ${bad.slice(0, 3).join(' | ')}`);
ck('D1 无未捕获异常', 'Runtime.exceptionThrown', exc.length, 0);
ck('D2 无 >=400 响应（含评论 API）', 'Network.responseReceived', bad.length, 0);
console.log(`\n=== ${fails === 0 ? 'ALL PASS：线上验收全过' : fails + ' FAIL：按预案回滚'} ===`);
ws.close(); chrome.kill(); process.exit(fails === 0 ? 0 : 1);
