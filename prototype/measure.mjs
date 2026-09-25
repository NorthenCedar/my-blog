/**
 * 量实 prototype/terminal 草案的横向溢出与分层高度。
 * 自建静态服务（根 = <博客仓库>）+ puppeteer-core 驱动本机 Chrome。
 * 用法: node _tmp-measure.mjs [文件名] [端口]
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = '<博客仓库>';
const FILE = process.argv[2] ?? 'home.html';
const PORT = Number(process.argv[3] ?? 4331);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const NPX = '<博客仓库>\\.npm-cache\\_npx\\8003d8991b0d346b\\node_modules\\';

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

const require = createRequire(NPX);
const puppeteer = require('puppeteer-core');
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
