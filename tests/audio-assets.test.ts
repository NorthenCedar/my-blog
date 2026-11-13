import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportAudioAssets, validateTalkAudio } from '../src/lib/audio-assets.mjs';
import { expandAudioMarkup } from '../src/lib/markdown-audio.mjs';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function hash(name: string): string {
  // 构造仅用于链接及格式校验的合法名称。
  return name.padEnd(64, '0').slice(0, 64).toLowerCase();
}

function wav(): Buffer {
  const bytes = Buffer.alloc(64);
  bytes.write('RIFF', 0, 'latin1');
  bytes.write('WAVE', 8, 'latin1');
  return bytes;
}

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function workspace() {
  const root = join(tmpdir(), `audio-${Math.random().toString(16).slice(2)}`);
  dirs.push(root);
  mkdirSync(join(root, 'content/audio'), { recursive: true });
  mkdirSync(join(root, 'dist/posts/demo'), { recursive: true });
  return root;
}

describe('作者音频：构建期只导出被引用的原件', () => {
  it('引用到的拷进 dist/audio，没引用的不导，清单记下来', async () => {
    const root = workspace();
    const bytes = wav();
    const other = Buffer.from(bytes);
    other[63] = 1;
    const used = digest(bytes) + '.wav';
    const unused = digest(other) + '.wav';
    writeFileSync(join(root, 'content/audio', used), bytes);
    writeFileSync(join(root, 'content/audio', unused), other);
    writeFileSync(join(root, 'dist/posts/demo/index.html'), [
      '<audio><source src="/audio/' + used + '"></audio>',
      '<pre>/audio/' + unused + '</pre>',
      '<!-- <audio src="/audio/' + unused + '"></audio> -->',
    ].join(''));

    const result = await exportAudioAssets({ rootDir: root, distDir: join(root, 'dist') });

    expect(result.exported, '只导出了被引用的那一个').toBe(1);
    expect(readFileSync(join(root, 'dist/audio', used)).equals(bytes)).toBe(true);
    expect(() => readFileSync(join(root, 'dist/audio', unused))).toThrow();
    const manifest = JSON.parse(readFileSync(join(root, 'dist/audio/.exported-audio.json'), 'utf8'));
    expect(manifest.files).toContain(used);
  });

  it('页面删掉引用后再跑一次，旧产物会被清掉', async () => {
    const root = workspace();
    const bytes = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    const gone = digest(bytes) + '.mp3';
    writeFileSync(join(root, 'content/audio', gone), bytes);
    writeFileSync(join(root, 'dist/posts/demo/index.html'), '<audio src="/audio/' + gone + '"></audio>');
    await exportAudioAssets({ rootDir: root, distDir: join(root, 'dist') });
    expect(readFileSync(join(root, 'dist/audio', gone)).byteLength).toBeGreaterThan(0);

    writeFileSync(join(root, 'dist/posts/demo/index.html'), '<p>没有语音了</p>');
    await exportAudioAssets({ rootDir: root, distDir: join(root, 'dist') });
    expect(() => readFileSync(join(root, 'dist/audio', gone))).toThrow();
  });

  it('音频摘要错时失败，已公开的导出清单仍保留', async () => {
    const root = workspace();
    const bytes = wav();
    const valid = digest(bytes) + '.wav';
    const bad = hash('ffff') + '.wav';
    const html = join(root, 'dist/posts/demo/index.html');
    writeFileSync(join(root, 'content/audio', valid), bytes);
    writeFileSync(join(root, 'content/audio', bad), bytes);
    writeFileSync(html, '<audio src="/audio/' + valid + '"></audio>');
    await exportAudioAssets({ rootDir: root });
    writeFileSync(html, '<audio src="/audio/' + bad + '"></audio>');
    await expect(exportAudioAssets({ rootDir: root })).rejects.toThrow(/SHA-256/);
    expect(JSON.parse(readFileSync(join(root, 'dist/audio/.exported-audio.json'), 'utf8')).files).toEqual([valid]);
  });

  it('引用了一个仓库里不存在的音频：构建当场失败，不留哑链接', async () => {
    const root = workspace();
    writeFileSync(join(root, 'dist/posts/demo/index.html'), `<audio src="/audio/${hash('d4')}.mp3"></audio>`);
    await expect(exportAudioAssets({ rootDir: root, distDir: join(root, 'dist') })).rejects.toThrow(/audio/i);
  });
});

describe('文章里的 !audio 行', () => {
  it('整行换成播放条，说明进属性且转义', () => {
    const html = expandAudioMarkup(`前文\n\n!audio[开场 "白"](/audio/${hash('e5')}.mp3)\n\n后文`);
    expect(html).toContain('class="ap"');
    expect(html).toContain('data-audio');
    expect(html).toContain(`data-src="/audio/${hash('e5')}.mp3"`);
    expect(html).toContain('&quot;白&quot;');
    expect(html).toContain('<audio controls');
  });

  it('代码块里的 !audio 是代码，不是播放条', () => {
    const html = expandAudioMarkup('```\n!audio[x](/audio/' + hash('f6') + '.mp3)\n```');
    expect(html).not.toContain('data-audio');
  });

  it('写成别处的路径不接管（/videos/… 之类留给原来的管线）', () => {
    const md = `!audio[x](/videos/${hash('a7')}.mp4)`;
    expect(expandAudioMarkup(md)).toBe(md);
  });
});

describe('说说里的 audio 字段', () => {
  it('允许空数组、允许缺省，拒收坏形状', () => {
    expect(validateTalkAudio(undefined, '说说 1')).toEqual([]);
    expect(validateTalkAudio([], '说说 1')).toEqual([]);
    expect(validateTalkAudio([{ src: `/audio/${hash('b8')}.wav` }], '说说 1')).toEqual([{ src: `/audio/${hash('b8')}.wav`, label: '' }]);
    expect(() => validateTalkAudio([{ src: '/audio/x.mp3' }], '说说 1')).toThrow(/说说 1/);
    // 说明太长不报错，截到 120 字符（前端标签本来也只有一行）
    expect(validateTalkAudio([{ src: `/audio/${hash('c9')}.mp3`, label: 'x'.repeat(200) }], '说说 1')[0].label).toHaveLength(120);
    expect(() => validateTalkAudio([{ label: '缺 src' }], '说说 1')).toThrow(/说说 1/);
  });
});