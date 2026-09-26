/**
 * 光标在真页面上的**计算值**取证（_tmp 前缀 = 临时证据）
 * 为什么必须看浏览器：这套写法靠"元素自身声明 > 继承"和 :where() 的 0 特异性，
 * 静态 CSS 断言看不出谁赢。逐个元素读 getComputedStyle().cursor 才是真相。
 * 用法：node _tmp-cursor-computed.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, 'dist');
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
const profile = await mkdtemp(join(tmpdir(), 'dsh-cursor-'));
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
/** 读一组选择器的计算 cursor（取第一个匹配元素） */
const cursors = (pairs) => evalJs(`(() => {
  const out = {};
  for (const [label, sel] of ${JSON.stringify(pairs)}) {
    const el = document.querySelector(sel);
    out[label] = el ? getComputedStyle(el).cursor : '(没有这个元素)';
  }
  return out;
})()`);

/**
 * 期望值**从页面自身读**（`:root` 上的三个 token），再与元素的计算值规范化后比对。
 * 为什么不再硬编码：URL 里带内容指纹 ?v=<sha1>，每改一次素材指纹就变 —— 硬编码等于每轮都要改探针。
 * 规范化：去掉域名/引号/多余空格 ⇒ 只比「路径+查询+热点+关键字」这一串语义。
 */
const norm = (v) => v.replace(/url\(["']?/g, 'url(').replace(/["']?\)/g, ')').replace(/https?:\/\/[^/)]+/g, '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
const readTokens = () => evalJs(`(() => {
  const s = getComputedStyle(document.documentElement);
  return {
    normal: s.getPropertyValue('--cursor-default').trim(),
    text: s.getPropertyValue('--cursor-text').trim(),
    link: s.getPropertyValue('--cursor-link').trim(),
  };
})()`);

console.log('=== 首页（控制台外壳）===');
await open('/');
const TOK = await readTokens();
const NORMAL = norm(TOK.normal);
const TEXT = norm(TOK.text);
const LINK = norm(TOK.link);
console.log(`  token: normal=${NORMAL}`);
console.log(`         text=${TEXT}`);
console.log(`         link=${LINK}`);
const home = await cursors([
  ['页面底（html 继承）', 'html'],
  ['正文段落 p', '.pod p'],
  ['标题 h1', 'h1.display'],
  ['控制台标签 span', '.pod-tag'],
  ['导航链接 a', 'nav[aria-label="页面区段"] a'],
  ['HUD 区域', '.hud'],
]);
for (const [k, v] of Object.entries(home)) console.log(`  ${k.padEnd(18)} ${v}`);
check('首页 · 页面底 = 正常选择', norm(home['页面底（html 继承）']), NORMAL);
check('首页 · 正文段落 = 主题 I 型', norm(home['正文段落 p']), TEXT);
check('首页 · 标题 = 主题 I 型', norm(home['标题 h1']), TEXT);
check('首页 · 控制台标签 = 正常选择', norm(home['控制台标签 span']), NORMAL);
check('首页 · 链接 = 链接选择', norm(home['导航链接 a']), LINK);
check('首页 · HUD 区域 = 正常选择', norm(home['HUD 区域']), NORMAL);

console.log('\n=== 文章页（评论区表单）===');
await open('/posts/ai-built-this-blog/');
const post = await cursors([
  ['正文段落', '.prose p'],
  ['行内 code', '.prose code'],
  ['代码块按钮', '.copy-btn'],
  ['评论输入框 textarea', '.comment-form textarea'],
  ['评论按钮 button', '.comment-form button'],
  ['外链 a', 'a[href^="http"]'],
]);
for (const [k, v] of Object.entries(post)) console.log(`  ${k.padEnd(18)} ${v}`);
check('文章页 · 正文 = 主题 I 型', norm(post['正文段落']), TEXT);
check('文章页 · 行内代码 = 主题 I 型', norm(post['行内 code']), TEXT);
check('文章页 · 代码块复制按钮 = 链接选择', norm(post['代码块按钮']), LINK);
check('文章页 · textarea = 主题 I 型', norm(post['评论输入框 textarea']), TEXT);
check('文章页 · 提交按钮 = 链接选择', norm(post['评论按钮 button']), LINK);
check('文章页 · 正文里的外链 = 链接选择（不被 .prose 压成 I 型）', norm(post['外链 a']), LINK);

console.log('\n=== 相册页 + 素材自检 ===');
await open('/gallery/');
const gal = await cursors([['筛选按钮', '.filters button'], ['图注段落', 'figure figcaption']]);
for (const [k, v] of Object.entries(gal)) console.log(`  ${k.padEnd(18)} ${v}`);
check('相册页 · 筛选按钮 = 链接选择', norm(gal['筛选按钮']), LINK);
check('相册页 · 图注 = 主题 I 型', norm(gal['图注段落']), TEXT);
const assets = await evalJs(`Promise.all(['cursors/normal.png','cursors/text.png','cursors/link.png','cursors/normal-32.png','cursors/text-32.png','cursors/link-32.png'].map((u) => new Promise((r) => {
  const i = new Image(); i.onload = () => r(u + '=' + i.naturalWidth); i.onerror = () => r(u + '=加载失败'); i.src = '/' + u;
}))).then((a) => a.join(' '))`);
console.log(`  素材: ${assets}`);
check('六张位图都能被浏览器当光标图加载', assets, 'cursors/normal.png=64 cursors/text.png=64 cursors/link.png=64 cursors/normal-32.png=32 cursors/text-32.png=32 cursors/link-32.png=32');

ws.close(); chrome.kill(); server.close();
console.log(`\n=== ${fails === 0 ? 'ALL PASS：光标计算值全部符合预期' : fails + ' FAIL'} ===`);
process.exit(fails === 0 ? 0 : 1);
