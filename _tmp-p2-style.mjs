/** P2(搬迁) 计算样式基线/复核脚本：跑 dist/ 全部 HTML，记录三处容器的 10 个计算样式值。
 *  用法: node _tmp-p2-style.mjs <输出json>
 *  三处: main > div（主容器，搬迁对象）/ footer .wrap（对照组）/ .band .wrap（对照组）。
 *  判据是同一个脚本前后各跑一次、逐值相等 —— 截图不算判据。 */
import http from 'node:http';
import { readFile, stat, readdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, relative } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = '<博客仓库>\\dist';
const PORT = 4471;
const OUT = process.argv[2] ?? '<本机工作区>\\_tmp-style.json';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const NPX = '<博客仓库>\\.npm-cache\\_npx\\8003d8991b0d346b\\node_modules\\';
const T = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };

const server = http.createServer(async (req, res) => {
  try {
    const u = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let f = join(ROOT, normalize(u).replace(/^[/\\]+/, ''));
    const s = await stat(f).catch(() => null);
    if (s?.isDirectory()) f = join(f, 'index.html');
    const body = await readFile(f);            // 先读：读到了再发头，否则 404 分支会二次 writeHead
    res.writeHead(200, { 'content-type': T[extname(f).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch { if (!res.headersSent) res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const pages = [];
const walk = async (d) => {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith('.html')) pages.push(p);
  }
};
await walk(ROOT);

const require = createRequire(NPX);
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const out = {};
for (const f of pages) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  await page.goto(`http://127.0.0.1:${PORT}/${rel.replace(/index\.html$/, '')}`, { waitUntil: 'load' });
  out[rel] = await page.evaluate(() => {
    const props = ['maxWidth', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'display'];
    const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); const o = {}; for (const p of props) o[p] = cs[p]; return o; };
    return { main: pick('main > div'), footer: pick('footer .wrap'), band: pick('.band .wrap') };
  });
}
await browser.close();
server.close();
await writeFile(OUT, JSON.stringify(out, null, 1));
console.log('页面数:', Object.keys(out).length);
for (const [k, v] of Object.entries(out)) {
  console.log('  ' + k.padEnd(34),
    '| main:', v.main ? v.main.maxWidth + ' padL ' + v.main.paddingLeft : '(无)',
    '| footer.wrap:', v.footer ? v.footer.maxWidth : '(无)',
    '| band.wrap:', v.band ? v.band.maxWidth : '(无)');
}
console.log('写出 →', OUT);
