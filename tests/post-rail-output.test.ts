import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { toPostMeta } from '../src/lib/post-meta';
import { selectRelatedPosts } from '../src/lib/related-posts';

const posts = readdirSync('content/posts', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
  const source = readFileSync(`content/posts/${entry.name}/index.md`, 'utf8');
  const parts = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)!;
  return toPostMeta({ id: entry.name, data: parse(parts[1]), body: parts[2] });
});
const published = posts.filter(post => !post.draft);

describe('文章阅读侧栏真实产物', () => {
  it('每篇文章均保留页头、原生顶部入口及可降级的复制按钮', () => {
    expect(published.length).toBeGreaterThan(0);
    for (const post of published) {
      const html = readFileSync(`dist${post.url}index.html`, 'utf8');
      expect(html).toContain('class="post-layout"');
      const header = html.match(/<header\b[^>]*class="pagehead"[^>]*id="([^"]+)"/);
      expect(header, post.slug).not.toBeNull();
      expect(html).toContain(`href="#${header![1]}"`);
      expect(html).toMatch(/<button\b[^>]*data-copy-link\b[^>]*hidden/);
      expect(html).toContain('data-copy-status');
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
      expect(new Set(ids).size, `${post.slug} 的页面id不能重复`).toBe(ids.length);
    }
  });

  it('相关札记只输出实际选择的已发布链接，没有匹配就不渲染', () => {
    for (const post of published) {
      const html = readFileSync(`dist${post.url}index.html`, 'utf8');
      const section = html.match(/<section\b[^>]*class="post-related"[^>]*>([\s\S]*?)<\/section>/)?.[1];
      const expected = selectRelatedPosts(post, posts);
      if (!expected.length) expect(section, post.slug).toBeUndefined();
      else {
        expect(section, post.slug).toBeDefined();
        const urls = [...section!.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
        expect(urls, post.slug).toEqual(expected.map(related => related.url));
        expect(urls.length).toBeLessThanOrEqual(2);
      }
    }
  });
});
