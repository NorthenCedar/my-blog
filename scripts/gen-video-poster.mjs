/* =============================================================================
 * 视频封面（poster）生成器 —— 2026-11-12 新增
 *
 * 站主：「视频不点开是黑色的，给他一张封面」。浏览器在 `preload="none"` 时
 * 不解码任何帧，`<video>` 就是一块底色 ⇒ 必须给 `poster`。
 *
 * ★ 本机没有 ffmpeg，所以用 Chrome 自己解码：加载原件 → seek 到一处有画面的
 *   时间点 → drawImage 到 canvas → 导出 JPEG。只依赖本机已有的 Chrome。
 *
 * ★ 为什么要自起一个静态服务，而不是 file:// 或直接打 preview 端口：
 *   页面与视频必须**同源** —— 跨源视频画进 canvas 会把 canvas 标记为 tainted，
 *   随后 `toDataURL` 直接抛 SecurityError。所以本脚本自己起一个只读的
 *   `content/videos` 静态服务，页面也从它取，两者同源。
 *
 * ★ 输出约定：`public/videos/<64 位 sha>.poster.jpg`（与原件同名换后缀）。
 *   `src/pages/talks.astro` 的 `posterOf()` 按这个约定推导；文件不在就不写
 *   poster 属性。放 public/ 而不是 content/videos/ —— 后者由 exportVideoAssets
 *   按 HTML 引用清单复制，那条链路只认 mp4/webm，派生图片不该混进去。
 *
 * 用法：
 *   node scripts/gen-video-poster.mjs             # 处理说说页引用的全部视频
 *   node scripts/gen-video-poster.mjs --at 6      # 指定取帧秒数（默认 duration×15%，夹在 1~3 s）
 *   node scripts/gen-video-poster.mjs --port 9222 # 复用已开的调试端口；没有就自己起
 * ============================================================================= */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT_DIR = path.join(ROOT, 'public/videos');
const VIDEO_DIR = path.join(ROOT, 'content/videos');
const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const CDP_PORT = Number(argOf('--port', 9222));
const AT = argOf('--at', null) === null ? null : Number(argOf('--at', null));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAME_RE = /^[a-f0-9]{64}\.(?:mp4|webm)$/;

/** 内容层引用了哪些视频：只给这些做封面，草稿素材不产出多余文件。 */
function referencedVideos() {
  const text = readFileSync(path.join(ROOT, 'content/pages/talks.md'), 'utf8');
  return [...new Set([...text.matchAll(/\/videos\/([a-f0-9]{64}\.(?:mp4|webm))/g)].map((m) => m[1]))].sort();
}

/** 只读静态服务：空页面 + /videos/*，两者同源，canvas 才不会被 taint。 */
async function startHost() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>poster</title>');
      return;
    }
    const name = url.replace(/^\/videos\//, '');
    if (!NAME_RE.test(name)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const bytes = readFileSync(path.join(VIDEO_DIR, name));
      res.writeHead(200, {
        'content-type': name.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
        'content-length': bytes.length,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      });
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

async function ensureChrome() {
  try {
    const v = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    return { version: v.Browser, owned: null };
  } catch {
    const profile = mkdtempSync(path.join(os.tmpdir(), 'nc-poster-'));
    const child = spawn(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
      '--remote-allow-origins=*', '--mute-audio',
      'about:blank',
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    for (let i = 0; i < 120; i++) {
      try {
        const v = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
        return { version: v.Browser, owned: child };
      } catch {
        await sleep(200);
      }
    }
    throw new Error(`Chrome 没能在端口 ${CDP_PORT} 上就绪`);
  }
}

async function main() {
  const names = referencedVideos();
  if (!names.length) {
    console.log('[poster] 内容里没有引用视频，无事可做');
    return;
  }
  console.log('[poster] 待处理：', names);

  const host = await startHost();
  const chrome = await ensureChrome();
  console.log(`[poster] ${chrome.version}（CDP ${CDP_PORT}${chrome.owned ? '，本轮新起' : '，复用已开'}）· 宿主 ${host.port}`);

  const tabs = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('没有可用的空白标签页');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`CDP 超时：${method}`));
        }
      }, 60000);
    });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    return res.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${host.port}/` });
  await sleep(600);
  mkdirSync(OUT_DIR, { recursive: true });

  for (const name of names) {
    const abs = path.join(VIDEO_DIR, name);
    if (!existsSync(abs)) {
      console.warn(`[poster] 跳过（原件不存在）：${name}`);
      continue;
    }
    const sha = createHash('sha256').update(await readFile(abs)).digest('hex');
    if (sha !== name.slice(0, 64)) throw new Error(`原件摘要与文件名不符：${name}`);

    const dataUrl = await evaluate(`(async () => {
      const v = document.createElement('video');
      v.src = ${JSON.stringify('/videos/' + name)};
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      await new Promise((res, rej) => {
        v.onloadeddata = res;
        v.onerror = () => rej(new Error('浏览器无法解码这个视频'));
        setTimeout(res, 20000);
      });
      const at = ${AT === null ? 'Math.min(Math.max(v.duration * 0.15, 1), 3)' : AT};
      v.currentTime = Math.min(at, Math.max(v.duration - 0.1, 0));
      await new Promise((res) => { v.onseeked = res; setTimeout(res, 12000); });
      const scale = Math.min(1, 1280 / v.videoWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.82);
    })()`);

    const out = path.join(OUT_DIR, name.replace(/\.(mp4|webm)$/, '.poster.jpg'));
    writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`[poster] ${path.basename(out)}  ${Math.round(readFileSync(out).length / 1024)} KB`);
  }

  ws.close();
  host.server.close();
  if (chrome.owned) chrome.owned.kill();
}

await main();
