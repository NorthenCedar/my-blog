/**
 * 原型预览服务（只为看效果，不进产物、不参与构建）
 *
 * 为什么需要它：四个原型的跨页过渡用的是跨文档 View Transitions，
 * **浏览器在 file:// 下不启用**。想看到淡入淡出、以及 http 下的完整行为，就得走 http。
 * （直接双击 home.html 也能看，只是换页是硬切。）
 *
 * 用法：node prototype/serve.mjs [端口]
 * 然后开 http://127.0.0.1:4321/prototype/terminal/home.html
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); // = blog/
const PORT = Number(process.argv[2] ?? 4321);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json',
};

http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
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
}).listen(PORT, '127.0.0.1', () => {
  console.log(`根目录: ${ROOT}`);
  console.log(`主页:   http://127.0.0.1:${PORT}/prototype/terminal/home.html`);
  console.log(`文章:   http://127.0.0.1:${PORT}/prototype/terminal/post.html`);
  console.log(`相册:   http://127.0.0.1:${PORT}/prototype/terminal/gallery.html`);
  console.log(`项目:   http://127.0.0.1:${PORT}/prototype/terminal/projects.html`);
});
