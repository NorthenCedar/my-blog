/**
 * 说说点赞/评论 + 页脚统计的浏览器验收（_tmp 前缀 = 临时证据）。
 * 打在**本地 wrangler pages dev**（真接口 + 本地 D1，不碰线上数据）：node _tmp-talks-check.mjs [base]
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(ROOT, '_tmp-boot-shots');
const BASE = (process.argv[2] ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-talks-'));
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
const open = async (path) => {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + path });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await sleep(1200);
};

console.log('=== ① 页脚统计 ===');
await open('/talks/');
const up1 = await evalJs(`(document.querySelector('[data-uptime]') || {}).textContent`);
check('运行时长格式正确', /^\d+ 天 \d{2} 时 \d{2} 分 \d{2} 秒$/.test(String(up1)) ? 'true' : String(up1), 'true');
await sleep(1400);
const up2 = await evalJs(`document.querySelector('[data-uptime]').textContent`);
check('秒数在走（1.4 秒后不同）', up2 !== up1 ? 'true' : `false（${up1} → ${up2}）`, 'true');
const pv = await evalJs(`document.querySelector('[data-pv]').textContent`);
const uv = await evalJs(`document.querySelector('[data-uv]').textContent`);
check('PV 是数字（不是占位符 —）', /^\d+$/.test(String(pv)) ? 'true' : String(pv), 'true');
check('UV 是数字', /^\d+$/.test(String(uv)) ? 'true' : String(uv), 'true');
console.log(`  PV=${pv} UV=${uv}`);

console.log('\n=== ② 说说点赞 ===');
const before = await evalJs(`document.querySelector('[data-like-count]').textContent`);
const slug = await evalJs(`document.querySelector('[data-like]').dataset.like`);
console.log(`  条目 slug=${slug} · 初始赞数=${before}`);
await evalJs(`document.querySelector('[data-like]').click()`);
await sleep(1200);
const after = await evalJs(`document.querySelector('[data-like-count]').textContent`);
const pressed = await evalJs(`document.querySelector('[data-like]').getAttribute('aria-pressed')`);
check('赞数 +1', Number(after) - Number(before), '1');
check('按钮置为已赞（aria-pressed）', pressed, 'true');
// 幂等：再点不会再加
await evalJs(`document.querySelector('[data-like]').click()`);
await sleep(800);
check('同一浏览器再点不会重复计数', await evalJs(`document.querySelector('[data-like-count]').textContent`), after);
// 刷新后仍然是已赞（localStorage）+ 服务端计数不变
await open('/talks/');
check('刷新后仍是已赞状态', await evalJs(`document.querySelector('[data-like]').getAttribute('aria-pressed')`), 'true');
check('刷新后赞数保持', await evalJs(`document.querySelector('[data-like-count]').textContent`), after);

console.log('\n=== ③ 说说评论（要名字）===');
check('评论区初始收起', await evalJs(`document.querySelector('[data-comments-for]').hidden`), 'true');
await evalJs(`document.querySelector('[data-toggle]').click()`);
await sleep(1000);
check('点「评论」后展开', await evalJs(`document.querySelector('[data-comments-for]').hidden`), 'false');
check('空列表显示空态', await evalJs(`document.querySelector('[data-comments-for] [data-empty]').hidden`), 'false');
// 不写名字直接发 —— 服务端必须拦住
await evalJs(`(() => { const f = document.querySelector('[data-form]'); f.querySelector('[name=body]').value = '没写名字试试'; f.querySelector('[data-submit]').click(); return true; })()`);
await sleep(1200);
const err1 = await evalJs(`document.querySelector('[data-comments-for] [data-error]').hidden ? '' : document.querySelector('[data-comments-for] [data-error]').textContent`);
check('不写名字：报错且不入列表', `${err1}/${await evalJs(`document.querySelectorAll('[data-comments-for] [data-list] li').length`)}`, '名字没写/0');
// 写名字再发
await evalJs(`(() => { const f = document.querySelector('[data-form]'); f.querySelector('[name=name]').value = '验证机器人'; f.querySelector('[name=body]').value = '说说的评论测试'; f.querySelector('[data-submit]').click(); return true; })()`);
await sleep(1500);
check('写了名字：立刻出现在列表里（不刷新）', await evalJs(`document.querySelectorAll('[data-comments-for] [data-list] li').length`), '1');
check('内容正确且名字在', await evalJs(`document.querySelector('[data-comments-for] [data-list] li').textContent.includes('验证机器人') && document.querySelector('[data-comments-for] [data-list] li').textContent.includes('说说的评论测试')`), 'true');
check('按钮上的评论数更新', await evalJs(`document.querySelector('[data-count-for]').textContent.trim()`), '1');
// 刷新后评论还在（真落库了）
await open('/talks/');
await evalJs(`document.querySelector('[data-toggle]').click()`);
await sleep(1200);
check('刷新后评论从服务端读回来', await evalJs(`document.querySelectorAll('[data-comments-for] [data-list] li').length`), '1');

await open('/talks/');
writeFileSync(join(SHOTS, 'talks-actions.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
await evalJs(`document.querySelector('[data-toggle]').click()`);
await sleep(1000);
await evalJs(`scrollTo(0, document.querySelector('[data-comments-for]').offsetTop - 200)`);
await sleep(400);
writeFileSync(join(SHOTS, 'talks-comments.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log(`\n  截图: talks-actions.png / talks-comments.png`);

ws.close(); chrome.kill();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：点赞/评论/页脚统计都通' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
