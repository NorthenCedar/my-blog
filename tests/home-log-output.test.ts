import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { sortLogItems, type LogItem } from '../src/lib/log-order';

const page = readFileSync('dist/index.html', 'utf8');
const raw = readFileSync('content/pages/log.md', 'utf8').split(/^---\s*$/m)[1];
const items = sortLogItems((parse(raw) as { items: LogItem[] }).items)
  .filter(item => (item.changes?.length ?? 0) > 0).slice(0, 4);
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g,
  (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name] ?? _).trim();

describe('首页版本详情真实内容', () => {
  it('四个详情与日志数据一致，每一项完整输出且默认隐藏', () => {
    const sections = [...page.matchAll(/<section\b([^>]*\bdata-log-entry\b[^>]*)>([\s\S]*?)<\/section>/g)];
    expect(sections).toHaveLength(items.length);
    sections.forEach((section, i) => {
      expect(section[1]).toMatch(/\bhidden(?:\s|=|$)/);
      expect(text(section[2].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? '')).toBe(items[i].version);
      expect([...section[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(match => text(match[1]))).toEqual(items[i].changes);
    });
  });

  it('首页明确标为源码语言占比，卡片保留日志跳转后备链接', () => {
    expect(page).toMatch(/<h2\b[^>]*>源码语言占比<\/h2>/);
    const links = [...page.matchAll(/<a\b([^>]*\bdata-log-trigger\b[^>]*)>/g)];
    expect(links).toHaveLength(items.length);
    for (const link of links) expect(link[1]).toMatch(/href="\/log\/#day-\d{4}-\d{2}-\d{2}"/);
  });
});
