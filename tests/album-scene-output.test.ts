import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const manifest = JSON.parse(read('public/gallery/manifest.json'));

describe('单册空间陈列产物', () => {
  it('每册按自己的清单模式渲染，英文名进入画布且没有改网址', () => {
    for (const album of manifest.albums) {
      const html = read(`dist/gallery/${album.id}/index.html`);
      expect(html).toContain('data-album-scene');
      expect(html).toContain(`data-layout="${album.layout}"`);
      expect(html).toContain(album.titleEn || album.title);
      expect(html.match(/<h1\b/g)).toHaveLength(1);
    }
  });
  it('静态 HTML 就有完整索引，每张照片只渲染一次并保留真实大图链接', () => {
    for (const album of manifest.albums) {
      const html = read(`dist/gallery/${album.id}/index.html`);
      const figures = [...html.matchAll(/<figure data-album=[\s\S]*?<\/figure>/g)];
      expect(figures).toHaveLength(album.total);
      for (let i = 0; i < figures.length; i++) {
        expect(figures[i][0]).toContain(album.frames[i].alt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        expect(figures[i][0]).toContain('data-no-transition');
        expect(figures[i][0]).toContain('loading="lazy"');
      }
      // 页面不在 HTML 里预挂启动态；脚本没跑时没有隐藏照片。
      expect(html).not.toMatch(/<section[^>]*class="[^"]*scene-on/);
      expect(html).toContain('data-scene-toggle');
      expect(html).toContain('data-scene-home');
      expect(html).toContain('查看全部');
    }
  });
  it('生成清单保留展示选项与真实像素宽，新字段不污染首页照片池', () => {
    for (const album of manifest.albums) {
      expect(['scatter', 'slices']).toContain(album.layout);
      expect(typeof album.titleEn).toBe('string'); // 新相册可以省略英文名，清单写空串。
      for (const frame of album.frames) {
        for (const file of frame.files) expect(file.actualW).toBeGreaterThan(0);
      }
    }
    expect(manifest.home.shots).toHaveLength(3);
  });
});
