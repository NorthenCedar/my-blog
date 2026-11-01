import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('dist/talks/index.html', 'utf8');
const source = readFileSync('src/pages/talks.astro', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const viewer = readFileSync('src/components/TalkImageViewer.astro', 'utf8');

describe('说说透明时间线与方图', () => {
  it('每组配图按数量选择列数，每个缩略图仍有完整图片链接与查看器', () => {
    const groups = [...html.matchAll(/<div class="shots"([^>]*)>([\s\S]*?)<\/div>/g)];
    expect(groups.length).toBeGreaterThan(0);
    for (const [, attrs, body] of groups) {
      const links = [...body.matchAll(/<a [^>]*href="([^"]+)"[^>]*data-talk-image="([^"]+)"/g)];
      const count = links.length;
      expect(attrs).toContain(`data-columns="${count <= 2 ? count : count === 4 ? 2 : 3}"`);
      for (const [, full, id] of links) {
        expect(full).toMatch(/^\/_astro\/.+\.webp$/);
        expect(html).toContain(`id="${id}"`);
        expect(html).toContain(`src="${full}"`);
      }
    }
  });

  it('只裁切列表缩略图，灯箱保持完整比例', () => {
    expect(source).toMatch(/\.shots a\s*\{[^}]*aspect-ratio:\s*1/);
    expect(source).toMatch(/\.shots :global\(img\)\s*\{[^}]*height:\s*100%[^}]*object-fit:\s*cover/);
    expect(viewer).toMatch(/object-fit:\s*contain/);
  });

  it('条目与内容保持透明、稳定，背景雨滴继续单独运行', () => {
    expect(source).not.toMatch(/animation:\s*talk-float|@keyframes talk-float/);
    expect(source).toMatch(/\.talk\s*\{[^}]*background:\s*transparent/);
    expect(source).toContain('data-float-bg');
    expect(source).toContain("import '../scripts/float'");
  });
});
