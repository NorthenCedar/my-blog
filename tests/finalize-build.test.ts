import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('统一导出沿用音频、视频、留言的先后顺序，校验失败时保留已生成清单', async () => {
  const prefix = join(tmpdir(), 'northcedar-build-output-');
  const root = await mkdtemp(prefix);
  try {
    const run = (script: string) => spawnSync(process.execPath, [resolve('scripts', script)], { cwd: root, encoding: 'utf8' });
    const write = async (file: string, body: string | Buffer) => {
      const path = join(root, file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    };
    const targets = join(root, 'functions/api/_generated/comment-targets.json');
    const previousTargets = '{"comments":["old-target"],"talks":[]}\n';
    await write('functions/api/_generated/comment-targets.json', previousTargets);
    const audio = Buffer.from('ID3 新的公开音频');
    const audioName = `${createHash('sha256').update(audio).digest('hex')}.mp3`;
    await write(`content/audio/${audioName}`, audio);
    await write('dist/index.html', `<audio src="/audio/${audioName}"></audio>
      <video src="/videos/invalid.mp4"></video><section data-comments data-slug="错误标识"></section>`);

    const brokenVideo = run('finalize-build.mjs');
    expect(brokenVideo.status).toBe(1);
    expect(brokenVideo.stderr).toContain('视频地址');
    expect(await readFile(join(root, 'dist/audio', audioName))).toEqual(audio);
    expect(await readFile(targets, 'utf8')).toBe(previousTargets);
    expect(run('export-audio.mjs').status).toBe(0);

    await write('dist/index.html', '<section data-comments data-slug="错误标识"></section>');
    const brokenTarget = run('finalize-build.mjs');
    expect(brokenTarget.status).toBe(1);
    expect(brokenTarget.stderr).toContain('公开页面留言标识不合法');
    expect(await readFile(targets, 'utf8')).toBe(previousTargets);
    expect(run('export-videos.mjs').status).toBe(0);
  } finally {
    if (!root.startsWith(prefix)) throw new Error('构建夹具清理范围不匹配');
    await rm(root, { recursive: true, force: true });
  }
});
