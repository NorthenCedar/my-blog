/**
 * 临时静态服务（临时证据，勿删）：**以 dist/ 为根**伺服构建产物。
 * 为什么不能复用 prototype/serve.mjs：它以 blog/ 为根，而产物里的引用是绝对路径
 * （/gallery/...、/_astro/...），会在 blog/ 下 404 —— 截出来是无样式 + 破图。
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.argv[2] ?? 4322);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json',
};

http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0]);
    let f = join(ROOT, normalize(url).replace(/^[/\\]+/, ''));
    const s = await stat(f).catch(() => null);
    if (s?.isDirectory()) f = join(f, 'index.html');
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`root: ${ROOT}  http://127.0.0.1:${PORT}/`));
