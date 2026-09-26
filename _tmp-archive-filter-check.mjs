/**
 * 归档筛选验收（_tmp 前缀 = 临时证据）：搜索 / 年份 / 月份 / 排序 / 清空，全都用真实交互点出来。
 * 另验一条设计承诺：**关掉 JS 时筛选条不出现、但列表完整可读**。
 * 用法：node _tmp-archive-filter-check.mjs
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
const BASE = process.env.SITE ? process.env.SITE.replace(/\/$/, '') : `http://127.0.0.1:${server.address().port}`;

// 打线上时等本次部署：归档页**出现筛选条**（data-filters）才是新版本
if (process.env.SITE) {
  const t0 = Date.now();
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    try {
      const html = await (await fetch(BASE + '/archive/', { cache: 'no-store' })).text();
      ok = html.includes('data-filters') && html.includes('data-year');
    } catch { /* 抖动继续等 */ }
    if (!ok) await sleep(5000);
  }
  console.log(ok ? `  本次部署已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s）` : '  警告：300s 内归档页还没出现筛选条，验的可能是上一版');
  if (!ok) process.exit(1);
}

let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-arch-'));
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
const open = async (w = 1440, h = 900) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  await send('Page.navigate', { url: BASE + '/archive/' });
  for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
  await sleep(500);
};
const visible = () => evalJs(`JSON.stringify({ rows: [...document.querySelectorAll('.yeargroup .index li')].filter((li) => !li.hidden).map((li) => li.dataset.date + '|' + li.dataset.year + '|' + li.dataset.month), groups: [...document.querySelectorAll('.yeargroup')].filter((g) => !g.hidden).map((g) => g.dataset.year), count: (document.querySelector('[data-count]') || {}).textContent, empty: !document.querySelector('[data-empty]').hidden })`);
const set = (sel, v) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; })()`);
const click = (sel) => evalJs(`(() => { document.querySelector(${JSON.stringify(sel)}).click(); return true; })()`);

console.log('=== ① 筛选条与选项（选项应从内容推导）===');
await open();
const yearsInDom = await evalJs(`JSON.stringify([...document.querySelectorAll('[data-year] option')].map((o) => o.value))`);
const monthsInDom = await evalJs(`JSON.stringify([...document.querySelectorAll('[data-month] option')].map((o) => o.value))`);
const contentYears = await evalJs(`JSON.stringify([...new Set([...document.querySelectorAll('.yeargroup')].map((g) => g.dataset.year))])`);
console.log(`  年份选项 ${yearsInDom} · 月份选项 ${monthsInDom} · 页面里的年份分组 ${contentYears}`);
check('筛选条可见（说明脚本跑了）', await evalJs(`document.querySelector('[data-filters]').hidden`), 'false');
check('年份选项 = 内容里的年份（推导，不是写死）', yearsInDom.replace('"all",', ''), contentYears);
check('月份选项按升序且去重', monthsInDom, JSON.stringify(['all', '09']));

console.log('\n=== ② 搜索 ===');
const before = JSON.parse(await visible());
console.log(`  初始: ${before.rows.length} 篇 · ${before.count}`);
await set('[data-q]', '相机');
const afterQ = JSON.parse(await visible());
console.log(`  搜「相机」: ${afterQ.rows.length} 篇 · ${afterQ.count}`);
check('只留下命中的行', afterQ.rows.length < before.rows.length && afterQ.rows.length > 0 ? 'true' : `false(${afterQ.rows.length}/${before.rows.length})`, 'true');
check('命中的确实含"相机"', await evalJs(`[...document.querySelectorAll('.yeargroup .index li')].filter((li) => !li.hidden).every((li) => li.dataset.q.includes('相机'))`), 'true');
check('计数变成"筛出 x / y 篇"', /筛出 \d+ \/ \d+ 篇/.test(afterQ.count) ? 'true' : afterQ.count, 'true');

console.log('\n=== ③ 搜不到时 ===');
await set('[data-q]', '这个词肯定没有');
const none = JSON.parse(await visible());
check('全隐藏 + 空态出现', `${none.rows.length}/${none.empty}`, '0/true');
check('分组也被隐藏', none.groups.length, '0');
await click('[data-clear]');

console.log('\n=== ④ 年份 / 月份 ===');
await set('[data-year]', '2026');
const byYear = JSON.parse(await visible());
check('选 2026：留下的全是 2026 的行', byYear.rows.every((r) => r.startsWith('2026-')) ? 'true' : 'false', 'true');
await set('[data-month]', '09');
const byMonth = JSON.parse(await visible());
check('再选 9 月：留下的全是 -09- 的行', byMonth.rows.every((r) => r.includes('-09-')) ? 'true' : 'false', 'true');
await click('[data-clear]');

console.log('\n=== ⑤ 排序（倒序 / 正序）===');
const descFirst = await evalJs(`document.querySelector('.yeargroup .index li').dataset.date`);
await click('[data-sort="asc"]');
const ascFirst = await evalJs(`document.querySelector('.yeargroup .index li').dataset.date`);
const ascGroups = await evalJs(`JSON.stringify([...document.querySelectorAll('.yeargroup')].map((g) => g.dataset.year))`);
// ⚠️ 这一行必须在点回「倒序」之前取（第一版写反了顺序 ⇒ 量到的是"倒序"时的状态，假红）
const ascPressed = await evalJs(`document.querySelector('[data-sort="asc"]').getAttribute('aria-pressed')`);
await click('[data-sort="desc"]');
const descGroups = await evalJs(`JSON.stringify([...document.querySelectorAll('.yeargroup')].map((g) => g.dataset.year))`);
console.log(`  倒序首行 ${descFirst} · 正序首行 ${ascFirst} · 正序年份顺序 ${ascGroups} · 倒序 ${descGroups}`);
check('正序时最老的排在前面', ascFirst < descFirst ? 'true' : `false(${ascFirst} vs ${descFirst})`, 'true');
check('正序按钮被标为当前（点正序后立刻取）', ascPressed, 'true');
check('清空后回到倒序', await evalJs(`document.querySelector('[data-sort="desc"]').getAttribute('aria-pressed')`), 'true');

await open();
writeFileSync(join(SHOTS, 'archive-filters' + (process.env.SITE ? '-live' : '') + '.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log(`\n  截图: ${join(SHOTS, 'archive-filters' + (process.env.SITE ? '-live' : '') + '.png')}`);

console.log('\n=== ⑥ 关掉 JS：筛选条不出现，但列表完整（设计承诺）===');
await send('Emulation.setScriptExecutionDisabled', { value: true });
await open();
const noJs = await evalJs(`JSON.stringify({ bar: document.querySelector('[data-filters]').hidden, rows: document.querySelectorAll('.yeargroup .index li').length, groups: document.querySelectorAll('.yeargroup').length })`);
console.log(`  ${noJs}`);
const nj = JSON.parse(noJs);
check('无 JS：筛选条隐藏（点不动就别显示）', nj.bar, 'true');
check('无 JS：列表仍然完整', nj.rows === before.rows.length && nj.groups === before.groups.length ? 'true' : `false(${nj.rows}/${before.rows.length})`, 'true');
await send('Emulation.setScriptExecutionDisabled', { value: false });

ws.close(); chrome.kill(); server.close();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：归档筛选符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
