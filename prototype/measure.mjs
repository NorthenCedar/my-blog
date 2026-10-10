/**
 * 量实 prototype/terminal 草案的横向溢出与分层高度。
 * 自建静态服务（根 = 本文件所在的 prototype/ 目录）+ puppeteer-core 驱动本机 Chrome。
 * 用法: node measure.mjs [文件名] [端口]
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// 路径一律从脚本自身位置推导，不硬编码本机绝对路径。
// 原先写死的是本机的仓库目录与 npx 缓存目录；开源脱敏后变成了占位符，
// 而占位符不是合法路径。NPX 那个尤其无从推导（它依赖 npx 的哈希目录名），
// 所以改成「若已存在就直接 require，否则给出可操作的手工安装提示」。
const ROOT = dirname(fileURLToPath(import.meta.url));
const FILE = process.argv[2] ?? 'home.html';
const PORT = Number(process.argv[3] ?? 4331);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let f = join(ROOT, normalize(url).replace(/^[/\\]+/, ''));
    const s = await stat(f).catch(() => null);
    if (s?.isDirectory()) f = join(f, 'index.html');
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('404 ' + (e?.code ?? '')); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// puppeteer-core 不是仓库依赖（它只在做原型量测时才用），所以从本仓库的
// node_modules 里 require；没有就明确告诉人怎么装，而不是指向一个占位路径。
const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch {
  console.error(
    '缺少 puppeteer-core。这个脚本只在量原型时用，所以没进 package.json ——\n' +
    '请先装一次：npm i -D puppeteer-core\n' +
    '（只装 puppeteer-core 即可，浏览器用本机已装的 Chrome，不额外下载 Chromium。）',
  );
  process.exit(1);
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
const page = await browser.newPage();

const measure = () => {
  const W = window.innerWidth, de = document.documentElement;
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const overflowers = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const over = Math.round(r.right - W);
    if (over > 1) {
      const cs = getComputedStyle(el);
      overflowers.push({ el: name(el), right: Math.round(r.right), width: Math.round(r.width), over, pos: cs.position, maxW: cs.maxWidth, disp: cs.display });
    }
  }
  const deep = []; // 内容比自己的框更宽的元素（scrollWidth > clientWidth）
  for (const el of document.querySelectorAll('body *')) {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) deep.push({ el: name(el), scrollW: el.scrollWidth, clientW: el.clientWidth, delta: el.scrollWidth - el.clientWidth });
  }
  const sectors = [...document.querySelectorAll('section')].map((s) => ({ id: s.id || name(s), h: Math.round(s.getBoundingClientRect().height) }));
  return {
    vw: W, docScrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth,
    overflowPx: de.scrollWidth - W,
    overflowingCount: overflowers.length,
    worst: overflowers.sort((a, b) => b.over - a.over).slice(0, 6),
    contentWiderThanBox: deep.slice(0, 6),
    sectors,
    docH: de.scrollHeight, vh: window.innerHeight,
    docVh: +(de.scrollHeight / window.innerHeight).toFixed(1),
  };
};

for (const vp of [{ w: 1440, h: 900 }, { w: 1024, h: 768 }, { w: 768, h: 900 }, { w: 390, h: 844 }]) {
  await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${PORT}/prototype/terminal/${FILE}`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 400));
  const out = await page.evaluate(measure);
  console.log(`\n===== ${vp.w}x${vp.h}  ${FILE} =====`);
  console.log(JSON.stringify(out, null, 1));
}

await browser.close();
server.close();
