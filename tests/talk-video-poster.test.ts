import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/* ★ 2026-11-13 站主：「这个视频的封面呢？之后我上传其他视频也要自带封面（首帧）」。
   封面机制：scripts/gen-video-poster.mjs 用 Chrome 抽首帧，落到
   public/videos/<sha>.poster.jpg；talks.astro 的 posterOf() 只在**文件存在**时
   才写 poster 属性 —— 也就是说，忘了跑生成脚本不会构建失败，页面上是块
   无声的米色底。这道门闩把「忘了」变成红的：说说页引用的每一个视频，
   都必须有对应的首帧 poster 文件。补法：node scripts/gen-video-poster.mjs。 */

const talksRaw = readFileSync('content/pages/talks.md', 'utf8');
const frontmatter = talksRaw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
const data = parse(frontmatter![1]) as { items?: { videos?: { src: string }[] }[] };
const referenced = (data.items ?? []).flatMap(item => item.videos ?? []).map(video => video.src);

describe('说说页视频封面（首帧 poster）', () => {
  it('每个被引用的视频都有 public/videos/<sha>.poster.jpg', () => {
    expect(referenced.length, '说说页应当至少引用一个视频（若已撤下全部视频，请同步更新本判据）').toBeGreaterThan(0);
    for (const src of referenced) {
      const poster = src.replace(/\.(?:mp4|webm)$/, '.poster.jpg');
      expect(
        existsSync(join('public', poster)),
        `${src} 缺首帧封面 → 页面上是米色空块。跑 node scripts/gen-video-poster.mjs 生成 ${poster}`,
      ).toBe(true);
      expect(
        readFileSync(join('public', poster)).byteLength,
        `${poster} 是空文件`,
      ).toBeGreaterThan(1024);
    }
  });
});
