import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('文章与日志 · 共享推动条', () => {
  const pages = [
    'dist/log/index.html',
    ...readdirSync('dist/posts', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join('dist/posts', entry.name, 'index.html')),
  ];

  it('每篇已发布文章与日志都只有一根推动条，默认隐藏且位于转场内容容器之外', () => {
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const html = readFileSync(page, 'utf8');
      const rails = [...html.matchAll(/<div\b[^>]*\bdata-rail(?:\s|>)[^>]*>/g)];
      expect(rails, page).toHaveLength(1);
      expect(rails[0]![0], page).toContain('hidden');
      expect(rails[0]![0], page).toContain('aria-hidden="true"');
      expect(rails[0]!.index, page).toBeLessThan(html.indexOf('<main'));
      expect(html, page).toContain('data-rail-thumb');
    }
  });
});
