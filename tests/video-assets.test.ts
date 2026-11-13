import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createServer, request, type Server } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createVideoDevPlugin,
  exportVideoAssets,
  validateTalkVideos,
} from '../src/lib/video-assets.mjs';

const MP4 = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('fixture-webm')]);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
let root: string;
const servers: Server[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'blog-video-'));
  await mkdir(join(root, 'content/videos'), { recursive: true });
  await mkdir(join(root, 'dist/posts/published'), { recursive: true });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
  await rm(root, { recursive: true, force: true });
});

async function asset(bytes = MP4, extension = 'mp4') {
  const name = `${digest(bytes)}.${extension}`;
  await writeFile(join(root, 'content/videos', name), bytes);
  return { name, src: `/videos/${name}` };
}

async function page(html: string, path = 'posts/published/index.html') {
  const destination = join(root, 'dist', path);
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, html);
}

async function outputVideos() {
  return (await readdir(join(root, 'dist/videos'))).filter((name) => /\.(?:mp4|webm)$/.test(name)).sort();
}

describe('生产视频导出', () => {
  it('已发布文章与说说的原生 video/source 引用按字节导出，共用原件只有一份', async () => {
    const mp4 = await asset();
    const webm = await asset(WEBM, 'webm');
    await page(`<video controls src="${mp4.src}"></video><video><source src='${webm.src}'></video>`);
    await page(`<video src=${mp4.src}></video>`, 'talks/index.html');

    await exportVideoAssets({ rootDir: root });

    expect(await outputVideos()).toEqual([mp4.name, webm.name].sort());
    expect(await readFile(join(root, 'dist/videos', mp4.name))).toEqual(MP4);
    expect(await readFile(join(root, 'dist/videos', webm.name))).toEqual(WEBM);
  });

  it('仅草稿引用与未引用的视频不进入产物，注释、脚本、转义代码也不算引用', async () => {
    const video = await asset();
    await writeFile(join(root, 'content/draft.md'), `---\ndraft: true\n---\n<video src="${video.src}"></video>`);
    await page(`<!-- <video src="${video.src}"> --><script>const sample = '<video src="${video.src}">';</script><pre>&lt;video src="${video.src}"&gt;</pre><div title='<video src="${video.src}">'></div>`);

    await exportVideoAssets({ rootDir: root });

    expect(await outputVideos()).toEqual([]);
  });

  it('外部视频不复制；audio 内的 source 不被当作本地视频', async () => {
    await page('<video src="https://example.com/clip.mp4"></video><audio><source src="/audio/clip.mp3"></audio>');
    await exportVideoAssets({ rootDir: root });
    expect(await outputVideos()).toEqual([]);
  });

  it('重跑只清理自己生成的过期视频，保留同目录其他文件', async () => {
    const video = await asset();
    await page(`<video src="${video.src}"></video>`);
    await exportVideoAssets({ rootDir: root });
    const unmanaged = `${'e'.repeat(64)}.mp4`;
    await writeFile(join(root, 'dist/videos', unmanaged), '站外工具的文件');
    await writeFile(join(root, 'dist/videos/notes.txt'), '保留');
    await page('<p>视频已移除</p>');

    await exportVideoAssets({ rootDir: root });

    expect(await outputVideos()).toEqual([unmanaged]);
    expect(await readFile(join(root, 'dist/videos/notes.txt'), 'utf8')).toBe('保留');
  });

  it('任一引用缺失时先失败，旧导出与其他有效原件均不发生半成功变化', async () => {
    const prior = await asset();
    await page(`<video src="${prior.src}"></video>`);
    await exportVideoAssets({ rootDir: root });
    const next = await asset(Buffer.concat([MP4, Buffer.from('next')]));
    await page(`<video src="${next.src}"></video><video src="/videos/${'a'.repeat(64)}.mp4"></video>`);

    await expect(exportVideoAssets({ rootDir: root })).rejects.toThrow(/找不到|缺失/);
    expect(await outputVideos()).toEqual([prior.name]);
    expect(await readFile(join(root, 'dist/videos', prior.name))).toEqual(MP4);
  });

  it.each([
    ['路径越界', '/videos/../secret.mp4'],
    ['编码越界', '/videos/%2e%2e/secret.mp4'],
    ['非摘要命名', '/videos/clip.mp4'],
    ['大写摘要', `/videos/${'A'.repeat(64)}.mp4`],
    ['非支持扩展名', `/videos/${'a'.repeat(64)}.mov`],
    ['其他本地目录', '/uploads/clip.mp4'],
    ['相对本地路径', '../videos/clip.mp4'],
    ['空地址', ''],
  ])('%s 必须让构建失败', async (_label, src) => {
    await page(`<video src="${src}"></video>`);
    await expect(exportVideoAssets({ rootDir: root })).rejects.toThrow(/视频地址/);
  });

  it.each([
    ['MP4 伪格式', Buffer.from('this is not a video'), 'mp4'],
    ['MP4 头部不足 12 字节', Buffer.from([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70]), 'mp4'],
    ['MP4 不能把高位字节截成 ftyp', Buffer.from([0, 0, 0, 16, 0xe6, 0xf4, 0xf9, 0xf0, 0x69, 0x73, 0x6f, 0x6d]), 'mp4'],
    ['WebM 缺少 EBML', Buffer.from('fake-webm'), 'webm'],
    ['WebM 缺少文档类型', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]), 'webm'],
    ['WebM 类型出现在首 4 KiB 之后', Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(4096), Buffer.from('webm')]), 'webm'],
  ])('%s 必须让构建失败', async (_label, bytes, extension) => {
    const video = await asset(bytes, extension);
    await page(`<video src="${video.src}"></video>`);
    await expect(exportVideoAssets({ rootDir: root })).rejects.toThrow(/格式/);
  });

  it('摘要与原件字节不一致时失败', async () => {
    const name = `${'0'.repeat(64)}.mp4`;
    await writeFile(join(root, 'content/videos', name), MP4);
    await page(`<video src="/videos/${name}"></video>`);
    await expect(exportVideoAssets({ rootDir: root })).rejects.toThrow(/摘要|SHA/);
  });

  it('超过 25 MiB 的文件失败，恰好达到上限仍可导出', async () => {
    const bytes = Buffer.alloc(25 * 1024 * 1024);
    MP4.copy(bytes);
    const valid = await asset(bytes);
    await page(`<video src="${valid.src}"></video>`);
    await exportVideoAssets({ rootDir: root });
    expect((await readFile(join(root, 'dist/videos', valid.name))).length).toBe(25 * 1024 * 1024);
    const oversized = await asset(Buffer.concat([bytes, Buffer.from([0])]));
    await page(`<video src="${oversized.src}"></video>`);
    await expect(exportVideoAssets({ rootDir: root })).rejects.toThrow(/25 MiB/);
    expect(await outputVideos()).toEqual([valid.name]);
  });
});

describe('说说视频字段', () => {
  it('可选字段保持兼容，合法视频保留地址与说明', () => {
    expect(validateTalkVideos(undefined, 'talk-1')).toEqual([]);
    const videos = [{ src: `/videos/${'a'.repeat(64)}.mp4`, alt: '晚风里的树' }];
    expect(validateTalkVideos(videos, 'talk-1')).toEqual(videos);
  });

  it.each([null, 'bad', {}, [{ src: '/videos/clip.mp4', alt: '说明' }], [{ src: `/videos/${'a'.repeat(64)}.mp4`, alt: '' }], [{ src: `/videos/${'a'.repeat(64)}.mp4`, alt: '  ' }], [{ src: `/videos/${'a'.repeat(64)}.mp4` }]])('非法字段给出条目位置并明确失败：%j', (videos) => {
    expect(() => validateTalkVideos(videos, '说说 talk-1')).toThrow(/说说 talk-1/);
  });
});

async function serve() {
  let handler: any;
  const plugin = createVideoDevPlugin({ rootDir: root });
  plugin.configureServer({ config: { root }, middlewares: { use: (middleware: any) => { handler = middleware; } } });
  const server = createServer((req, res) => handler(req, res, () => { res.statusCode = 404; res.end('后续路由'); }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务器没有 TCP 地址');
  return (path: string, options: { method?: string; range?: string } = {}) => new Promise<{ status: number; headers: any; body: Buffer }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: address.port, path, method: options.method ?? 'GET', headers: options.range ? { Range: options.range } : {} }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('开发期视频只读服务', () => {
  it('将视频封面交给后续静态资源路由', async () => {
    const video = await asset();
    const get = await serve();
    const response = await get(video.src.replace('.mp4', '.poster.jpg') + '?v=1');
    expect(response.body.toString()).toBe('后续路由');
  });

  it('GET 返回原件，HEAD 只有同等元数据，没有正文', async () => {
    const video = await asset();
    const get = await serve();
    const response = await get(video.src);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(MP4);
    expect(response.headers['content-type']).toBe('video/mp4');
    expect(response.headers['accept-ranges']).toBe('bytes');
    const head = await get(video.src, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers['content-length']).toBe('16');
    expect(head.body.length).toBe(0);
  });

  it.each([
    ['bytes=4-7', 4, 7],
    ['bytes=12-', 12, 15],
    ['bytes=-4', 12, 15],
    ['bytes=12-999', 12, 15],
  ])('Range %s 返回 206 与准确区间', async (range, start, end) => {
    const video = await asset();
    const get = await serve();
    const response = await get(video.src, { range });
    expect(response.status).toBe(206);
    expect(response.headers['content-range']).toBe(`bytes ${start}-${end}/16`);
    expect(response.body).toEqual(MP4.subarray(start, end + 1));
  });

  it.each(['bytes=16-', 'bytes=8-4', 'bytes=-0', 'bytes=0-1,4-5'])('无效 Range %s 返回 416', async (range) => {
    const video = await asset();
    const get = await serve();
    const response = await get(video.src, { range });
    expect(response.status).toBe(416);
    expect(response.headers['content-range']).toBe('bytes */16');
  });

  it('拒绝写入与越界路径；缺失原件返回 404，其他路由继续传递', async () => {
    const video = await asset();
    const get = await serve();
    expect((await get(video.src, { method: 'POST' })).status).toBe(405);
    expect((await get('/videos/../secret.mp4')).status).toBe(400);
    expect((await get(`/videos/${'a'.repeat(64)}.mp4`)).status).toBe(404);
    expect((await get('/other')).body.toString()).toBe('后续路由');
  });
});
