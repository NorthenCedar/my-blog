/**
 * 线上验收（_tmp 前缀 = 临时证据）：页脚统计 / 点赞接口 / 说说页挂点。
 * 刻意**不发测试评论**（那会留在访客看得见的地方）—— 评论写入路径已在本地端到端验过（18/18）。
 * 点赞会给站主自己的那条说说 +1（无害，且本来就是它的第一个赞）。
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(ROOT, '_tmp-boot-shots');
const BASE = (process.env.SITE ?? 'https://northcedar.top').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fails = 0;
const check = (name, actual, want) => {
  const ok = String(actual) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        实测: ${actual}${ok ? '' : `（期望 ${want}）`}`);
};

// 等本次部署：页脚统计的 data-since 出现在页面里
{
  const t0 = Date.now();
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    try {
      const html = await (await fetch(BASE + '/talks/', { cache: 'no-store' })).text();
      ok = html.includes('data-since') && html.includes('data-like');
    } catch {}
    if (!ok) await sleep(5000);
  }
  console.log(ok ? `  本次部署已上线（等了 ${((Date.now() - t0) / 1000).toFixed(0)}s）` : '  警告：300s 内没等到新版本');
  if (!ok) process.exit(1);
}

console.log('\n=== ① 接口 ===');
const st = await (await fetch(BASE + '/api/stats')).json();
check('GET /api/stats 返回数字', `${typeof st.pv}/${typeof st.uv}`, 'number/number');
console.log(`  线上 PV=${st.pv} UV=${st.uv}`);
const slug = 'talk-20260926';
const l0 = await (await fetch(`${BASE}/api/likes?slugs=${slug}`)).json();
check('GET /api/likes 批量查询可用', JSON.stringify(l0), JSON.stringify({ likes: { [slug]: 0 } }));
const bad = await fetch(BASE + '/api/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'not-a-talk' }) });
check('脏 slug 线上同样被拒（400）', bad.status, '400');
const like = await fetch(BASE + '/api/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
const likeBody = await like.json();
check('点赞成功（首赞 counted）', `${like.status}/${likeBody.counted}/${likeBody.count}`, '201/true/1');
const again = await (await fetch(BASE + '/api/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) })).json();
check('同 IP 再点幂等', `${again.counted}/${again.count}`, 'false/1');

console.log('\n=== ② 页面 ===');
const about = await (await fetch(BASE + '/about/', { cache: 'no-store' })).text();
check('/about/ 有页脚统计挂点', about.includes('data-stats') && about.includes('data-uptime'), 'true');
const talks = await (await fetch(BASE + '/talks/', { cache: 'no-store' })).text();
check('/talks/ 有赞与评论入口', /data-like="talk-/.test(talks) && /data-comments-for="talk-/.test(talks), 'true');
check('/talks/ 评论区表单有名字必填', talks.includes('name="name"') && talks.includes('name="website"'), 'true');

// 浏览器：看页脚数字与赞按钮真的渲染出来了
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].find((p) => existsSync(p));
const profile = await mkdtemp(join(tmpdir(), 'dsh-live-'));
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

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/talks/' });
for (let i = 0; i < 80; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
await sleep(2000);
const up = await evalJs(`document.querySelector('[data-uptime]').textContent`);
check('页脚：运行时长格式正确', /^\d+ 天 \d{2} 时 \d{2} 分 \d{2} 秒$/.test(String(up)) ? 'true' : String(up), 'true');
console.log(`  线上显示：本站已经运行 ${up}`);
const lc = await evalJs(`document.querySelector('[data-like-count]').textContent`);
check('页脚与赞数都从接口取回了真值', `${/^\d+$/.test(String(lc))}/${await evalJs(`/^\\d+$/.test(document.querySelector('[data-pv]').textContent)`)}`, 'true/true');
console.log(`  赞数=${lc} · PV=${await evalJs(`document.querySelector('[data-pv]').textContent`)} · UV=${await evalJs(`document.querySelector('[data-uv]').textContent`)}`);
await evalJs(`scrollTo(0, document.body.scrollHeight)`);
await sleep(600);
writeFileSync(join(SHOTS, 'live-talks-footer.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
await send('Page.navigate', { url: BASE + '/talks/' });
for (let i = 0; i < 60; i++) { if (await evalJs('document.readyState') === 'complete') break; await sleep(200); }
await sleep(1500);
writeFileSync(join(SHOTS, 'live-talks-actions.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log('  截图: live-talks-footer.png / live-talks-actions.png');
ws.close(); chrome.kill();

console.log(`\n=== ${fails === 0 ? 'ALL PASS：线上符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
