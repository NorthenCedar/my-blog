import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAGS } from '../src/tag-registry';

/**
 * 内容层的不变量 —— 只读 content/，不依赖 dist，所以不挂 skipIf。
 * 这些断言守的是 content-model.md 里写死的规则。
 */
function readPostTags(): { slug: string; tags: string[] }[] {
  const dir = 'content/posts';
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const file = join(dir, d.name, 'index.md');
      if (!existsSync(file)) return [];
      const fm = readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
      if (!fm) return [];
      const raw = fm[1].match(/^tags:\s*\[(.*)\]$/m);
      const tags = raw ? raw[1].split(',').map((t) => t.trim()).filter(Boolean) : [];
      return [{ slug: d.name, tags }];
    });
}

const POSTS = readPostTags();

describe('内容层不变量：标签注册表', () => {
  it('每个已登记的标签至少被一篇文章使用（否则标签页是空的）', () => {
    // tag-registry.ts 的注释声称这条由测试守住 —— 之前那个测试并不存在，注释在撒谎。
    expect(POSTS.length, '一篇内容都没有，本组断言等于没跑').toBeGreaterThan(0);
    const used = new Set(POSTS.flatMap((p) => p.tags));
    const orphan = TAGS.filter((t) => !used.has(t));
    expect(orphan, `这些标签已登记但没有文章用它：${orphan.join(', ')}`).toEqual([]);
  });

  it('每篇文章用的标签都在注册表里，且数量 1–3', () => {
    for (const p of POSTS) {
      for (const t of p.tags) {
        expect(TAGS as readonly string[], `${p.slug} 用了未登记的标签 ${t}`).toContain(t);
      }
      expect(p.tags.length, `${p.slug} 的标签数量`).toBeGreaterThanOrEqual(1);
      expect(p.tags.length, `${p.slug} 的标签数量`).toBeLessThanOrEqual(3);
    }
  });
});
