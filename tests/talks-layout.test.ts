import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('dist/talks/index.html', 'utf8');
const source = readFileSync('src/pages/talks.astro', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const viewer = readFileSync('src/components/TalkImageViewer.astro', 'utf8');

describe('说说透明时间线与方图', () => {
  /* ★ 2026-11-12 第二轮：图片与视频并进**同一张网格**（站主：「图片和视频的排版太乱了」）。
     ⇒ 栏数要看**媒体总数**（图 + 视频），不能只数图片链接 —— 只数图片会在
        「3 图 + 1 视频」那种条目上算出 3 栏、实际渲染 2 栏（第一版就是这么红的）。 */
  it('每组媒体（图片 + 视频）按总数选列数，缩略图仍各有完整链接与查看器', () => {
    const groups = [...html.matchAll(/<div class="shots"([^>]*)>([\s\S]*?)<\/div>/g)];
    expect(groups.length).toBeGreaterThan(0);
    let total = 0;
    for (const [, attrs, body] of groups) {
      const items = [...body.matchAll(/<a [^>]*href="([^"]+)"[^>]*data-talk-(image|video)="([^"]+)"/g)];
      const count = items.length;
      expect(count, '一格媒体都没有 ⇒ 本组判据空转').toBeGreaterThan(0);
      expect(attrs).toContain(`data-columns="${count <= 2 ? count : count === 4 ? 2 : 3}"`);
      for (const [, href, kind, id] of items) {
        if (kind === 'image') {
          expect(href).toMatch(/^\/_astro\/.+\.webp$/);
          // 图片另有一份大档给灯箱，链接与 id 都要在页面上
          expect(html).toContain(`src="${href}"`);
        } else {
          expect(href).toMatch(/^\/videos\/.+\.(?:mp4|webm)$/);
        }
        expect(html).toContain(`id="${id}"`);
      }
      total += count;
    }
    expect(total, '整页没有媒体 ⇒ 判据空转').toBeGreaterThan(3);
  });

  /* ★ 2026-11-12：方块从 `a` 换成语义类 `.shot`（图片与视频共用），
     圆角/裁切都挂在承载链接上，img 与 video 一起铺满。 */
  it('只裁切列表缩略图，灯箱保持完整比例', () => {
    expect(source).toMatch(/\.shots \.shot\s*\{[^}]*aspect-ratio:\s*1/);
    expect(source).toMatch(/\.shots \.shot\s*\{[^}]*border-radius:\s*var\(--sp-2\)/);
    expect(source).toMatch(/\.shots :global\(img\),\s*\.shots :global\(video\)\s*\{[^}]*height:\s*100%[^}]*object-fit:\s*cover/);
    expect(viewer).toMatch(/object-fit:\s*contain/);
  });

  it('条目与内容保持透明、稳定，背景雨滴继续单独运行', () => {
    expect(source).not.toMatch(/animation:\s*talk-float|@keyframes talk-float/);
    expect(source).toMatch(/\.talk\s*\{[^}]*background:\s*transparent/);
    expect(source).toContain('data-float-bg');
    expect(source).toContain("import '../scripts/float'");
  });
});
