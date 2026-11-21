import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { expect, it } from 'vitest';

const ASTRO = resolve('node_modules/astro/bin/astro.mjs');
const FINALIZE = resolve('scripts/finalize-build.mjs');

async function write(root: string, file: string, text: string) {
  const path = join(root, file);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, text);
}

function post(draft: boolean, body: string) {
  return `---\ntitle: ${draft ? 'Draft' : 'Published'}\ndraft: ${draft}\n---\n\n${body}\n`;
}

function run(root: string, script: string, ...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', ASTRO_DISABLE_UPDATE_CHECK: 'true' };
  // 子进程按 Astro 命令选择模式；Vitest 的环境值也会影响 Vite 和 Astro 路由。
  for (const key of ['VITEST', 'NODE_ENV', 'DEV', 'PROD', 'MODE', 'SSR', 'BASE_URL']) delete env[key];
  return execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env,
    timeout: 20000,
  });
}

async function original(root: string, folder: 'audio' | 'videos', ext: string, bytes: Buffer) {
  const name = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
  const directory = join(root, 'content', folder);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, name), bytes);
  return { name, src: `/${folder}/${name}`, bytes };
}

it('冷和热构建隔离草稿素材，开发预览以及公开引用的素材可访问', async () => {
  const prefix = join(tmpdir(), 'northcedar-draft-build-');
  const root = await mkdtemp(prefix);
  try {
    await symlink(resolve('node_modules'), join(root, 'node_modules'), 'junction');
    await write(root, 'package.json', '{"type":"module"}');
    const siteConfig = pathToFileURL(resolve('astro.config.mjs')).href;
    await write(root, 'astro.config.mjs', `import base from ${JSON.stringify(siteConfig)};
      export default { ...base, cacheDir: './.cache/astro', vite: { ...base.vite, cacheDir: './.cache/vite' } };`);
    await write(root, 'src/content.config.ts', `import { defineCollection } from 'astro:content';
      import { glob } from 'astro/loaders';
      export const collections = {
        posts: defineCollection({ loader: glob({ base: './content/posts', pattern: '**/index.md', deferRender: true,
          generateId: ({ entry }) => entry.split('/')[0] }) }),
        gallery: defineCollection({ loader: glob({ base: './content/gallery', pattern: '**/index.md' }) }),
      };`);
    const isDevelopment = 'import' + '.meta.env.DEV';
    await write(root, 'src/pages/posts/[id].astro', `---
      import { getCollection, render } from 'astro:content';
      export async function getStaticPaths() {
        const entries = await getCollection('posts', ({ data }) => ${isDevelopment} || !data.draft);
        return entries.map(entry => ({ params: { id: entry.id }, props: { entry } }));
      }
      const { Content } = await render(Astro.props.entry);
      ---
      <Content />
      <section data-comments data-slug={Astro.props.entry.id}></section>`.replace(/^      /gm, ''));

    const publishedAudio = await original(root, 'audio', 'mp3', Buffer.from('ID3 共享音频'));
    const draftAudio = await original(root, 'audio', 'mp3', Buffer.from('ID3 草稿音频'));
    const mp4 = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
    const publishedVideo = await original(root, 'videos', 'mp4', mp4);
    const draftVideo = await original(root, 'videos', 'mp4', Buffer.concat([mp4, Buffer.from('草稿视频')]));

    await write(root, 'content/posts/public-note/index.md', post(false, `![公开同名图](./same.png "公开标题")

![跨目录共用图](../draft-note/shared.png "共用标题")

!audio[公开音频](${publishedAudio.src})

<video controls><source src="${publishedVideo.src}" type="video/mp4"></video>`));
    await write(root, 'content/posts/draft-note/index.md', post(true, `![草稿同名图](./same.png)

![草稿共用图](./shared.png)

![带标题的草稿图](./titled.png "图片标题")

![引用式草稿图][private]

<audio controls src="${publishedAudio.src}"></audio>

<audio controls src="${draftAudio.src}"></audio>

<video controls src="${publishedVideo.src}"></video>

<video controls src="${draftVideo.src}"></video>

[private]: ./referenced.png "引用标题"`).replaceAll('\n', '\r\n'));
    await write(root, 'content/gallery/draft-album/index.md', '---\r\n"draft": true\r\n---\r\n\r\n![草稿相册正文图](./album.png "相册图标题")\r\n');
    await write(root, 'public/explicit-public.txt', '公开目录文件');

    const artwork = [
      ['posts/public-note/same.png', '#e72323'],
      ['posts/draft-note/same.png', '#f9ed3a'],
      ['posts/draft-note/shared.png', '#278bea'],
      ['posts/draft-note/titled.png', '#4a9c10'],
      ['posts/draft-note/referenced.png', '#741bbd'],
      ['gallery/draft-album/album.png', '#de3b96'],
    ];
    for (const [file, background] of artwork) {
      await sharp({ create: { width: 24, height: 16, channels: 3, background } }).png().toFile(join(root, 'content', file));
    }

    const dist = join(root, 'dist');
    async function checkBuild() {
      run(root, ASTRO, 'build');
      run(root, FINALIZE);

      const html = await readFile(join(dist, 'posts/public-note/index.html'), 'utf8');
      expect(await readdir(join(dist, 'posts'))).toEqual(['public-note']);
      expect(html).toContain(publishedAudio.src);
      expect(html).toContain(publishedVideo.src);
      expect(await readFile(join(dist, 'audio', publishedAudio.name))).toEqual(publishedAudio.bytes);
      expect(await readFile(join(dist, 'videos', publishedVideo.name))).toEqual(publishedVideo.bytes);
      await expect(readFile(join(dist, 'audio', draftAudio.name))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(join(dist, 'videos', draftVideo.name))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(join(dist, 'explicit-public.txt'), 'utf8')).toBe('公开目录文件');
      expect(JSON.parse(await readFile(join(root, 'functions/api/_generated/comment-targets.json'), 'utf8'))).toEqual({ comments: ['public-note'], talks: [] });

      const files = await readdir(join(dist, '_astro'));
      const colors = await Promise.all(files.filter(file => /\.(?:png|webp)$/.test(file)).map(async file => {
        const pixel = await sharp(await readFile(join(dist, '_astro', file))).resize(1, 1).raw().toBuffer();
        const distances = artwork.map(([, background]) => {
          const rgb = Buffer.from(background.slice(1), 'hex');
          return rgb.reduce((total, channel, index) => total + (channel - pixel[index]) ** 2, 0);
        });
        return artwork[distances.indexOf(Math.min(...distances))][0];
      }));
      expect([...new Set(colors)].sort()).toEqual(['posts/draft-note/shared.png', 'posts/public-note/same.png']);

      const images = html.match(/<img\b[^>]*>/g) ?? [];
      expect(images).toHaveLength(2);
      expect(images[0]).toContain('alt="公开同名图"');
      expect(images[0]).toContain('title="公开标题"');
      expect(images[1]).toContain('alt="跨目录共用图"');
      expect(images[1]).toContain('title="共用标题"');
      for (const tag of images) {
        const src = tag.match(/\bsrc="([^"]+)"/)![1];
        const srcset = tag.match(/\bsrcset="([^"]+)"/)?.[1];
        for (const url of [src, ...(srcset?.split(',').map(item => item.trim().split(' ')[0]) ?? [])]) {
          expect(files).toContain(decodeURIComponent(url.split('/').at(-1)!));
        }
      }
    }

    await checkBuild();
    run(root, ASTRO, 'sync');
    await write(root, 'check-draft-preview.mjs', `import assert from 'node:assert/strict';
      import { dev } from 'astro';
      const server = await dev({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' });
      try {
        const origin = 'http://127.0.0.1:' + server.address.port;
        const response = await fetch(origin + '/posts/draft-note/');
        const html = await response.text();
        assert.equal(response.status, 200, html.slice(0, 250));
        assert.match(html, /alt="带标题的草稿图"/);
        assert.match(html, /alt="引用式草稿图"/);
        const image = html.match(/<img[^>]*src="([^"]+)"[^>]*alt="带标题的草稿图"/)[1];
        assert.equal((await fetch(origin + image.replaceAll('&amp;', '&'))).status, 200);
        for (const [url, bytes] of ${JSON.stringify([draftAudio, draftVideo].map(item => [item.src, [...item.bytes]]))}) {
          assert.ok(html.includes(url));
          const media = await fetch(origin + url);
          assert.equal(media.status, 200);
          assert.deepEqual([...new Uint8Array(await media.arrayBuffer())], bytes);
        }
      } finally {
        await server.stop();
      }`);
    run(root, join(root, 'check-draft-preview.mjs'));
    await checkBuild();
    expect(run(root, resolve('scripts/export-audio.mjs'))).toContain('已导出 1 个');
    expect(run(root, resolve('scripts/export-videos.mjs'))).toContain('已导出 1 个');
    expect(await readFile(join(dist, 'audio', publishedAudio.name))).toEqual(publishedAudio.bytes);
    expect(await readFile(join(dist, 'videos', publishedVideo.name))).toEqual(publishedVideo.bytes);
  } finally {
    if (!root.startsWith(prefix)) throw new Error('构建夹具清理范围不匹配');
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
