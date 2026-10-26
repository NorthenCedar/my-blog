import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const content = readFileSync('content/pages/talks.md', 'utf8');
const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
const data = parse(frontmatter![1]) as { items: { id?: string; text: string }[] };
const html = readFileSync('dist/talks/index.html', 'utf8');
const rows = [...html.matchAll(/<li class="talk"[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);

describe('说说正式页正文格式', () => {
  it('已发布正文的简单加粗标记变为语义强调', () => {
    for (const item of data.items) {
      const bold = /^\*\*([^*<>&"\\]+)\*\*/.exec(item.text);
      if (!bold || !item.id) continue;
      const row = rows.find((value) => value.includes(`data-like="${item.id}"`));
      expect(row, `${item.id} 的点赞标识及对应条目必须保留`).toBeTruthy();
      const body = row!.match(/<p class="body"[^>]*>([\s\S]*?)<\/p>/)?.[1];
      expect(body, '正文应在原有段落中渲染加粗').toContain(`<strong>${bold[1]}</strong>`);
      expect(body).not.toContain(bold[0]);
    }
  });
});
