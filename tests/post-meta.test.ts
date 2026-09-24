import { describe, it, expect } from 'vitest';
import {
  countChars,
  readingMinutes,
  toPostMeta,
  sortByDateDesc,
  filterVisible,
  groupByYear,
  collectTags,
  adjacentOf,
  headingTree,
  slugIssues,
  type RawEntry,
} from '../src/lib/post-meta';

const baseData = {
  title: '标题',
  date: '2026-09-08',
  summary: '摘要',
  tags: ['成长'],
  draft: true,
};

const raw = (over: Partial<RawEntry> = {}): RawEntry => ({
  id: 'a-post',
  data: { ...baseData },
  body: '正文一二三四五',
  headings: [{ depth: 2, text: '小标题', id: 'x' }],
  ...over,
});

describe('countChars', () => {
  it('中文按字计，拉丁按词计', () => {
    expect(countChars('你好世界')).toBe(4);
    expect(countChars('hello world')).toBe(2);
    expect(countChars('你好 Astro 世界')).toBe(5);
  });

  it('代码块不计入字数', () => {
    expect(countChars('前言\n```js\nconst a = 1;\n```\n后记')).toBe(4);
  });

  it('行内代码与图片地址不计入字数', () => {
    expect(countChars('这是 `code` 与 ![图](./a.png) 的测试')).toBe(6);
  });
});

describe('readingMinutes', () => {
  it('按每分钟 400 字，最少 1 分钟', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(401)).toBe(1);
    expect(readingMinutes(801)).toBe(2);
  });
});

describe('toPostMeta', () => {
  it('拼出 url 与派生字段，slug 取自 id', () => {
    const m = toPostMeta(raw());
    expect(m.slug).toBe('a-post');
    expect(m.url).toBe('/posts/a-post/');
    expect(m.charCount).toBe(7);
    expect(m.readingMinutes).toBe(1);
  });

  it('frontmatter 里的 slug 覆盖 id', () => {
    const m = toPostMeta(raw({ data: { ...baseData, slug: 'custom' } }));
    expect(m.slug).toBe('custom');
    expect(m.url).toBe('/posts/custom/');
  });

  it('updated 透传到 PostMeta（详情页要显示「更新于」）', () => {
    expect(toPostMeta(raw()).updated).toBeUndefined();
    const m = toPostMeta(raw({ data: { ...baseData, updated: '2026-09-20' } }));
    expect(m.updated).toBe('2026-09-20');
  });
});

describe('filterVisible —— 草稿三态里的两态', () => {
  const posts = [
    toPostMeta(raw({ id: 'p', data: { ...baseData, draft: false } })),
    toPostMeta(raw({ id: 'd', data: { ...baseData, draft: true } })),
  ];

  it('dev 下草稿与已发布都可见', () => {
    expect(filterVisible(posts, true).map((p) => p.slug)).toEqual(['p', 'd']);
  });

  it('生产下只剩已发布', () => {
    expect(filterVisible(posts, false).map((p) => p.slug)).toEqual(['p']);
  });
});

describe('排序 / 分组 / 标签 / 相邻 / 标题树', () => {
  const dated = (id: string, date: string, tags: string[] = ['成长']) =>
    toPostMeta(raw({ id, data: { ...baseData, date, tags } }));

  it('按日期倒序', () => {
    const ps = [dated('a', '2026-01-01'), dated('b', '2026-09-01'), dated('c', '2025-12-31')];
    expect(sortByDateDesc(ps).map((p) => p.date)).toEqual(['2026-09-01', '2026-01-01', '2025-12-31']);
  });

  it('按年分组，年内保持倒序', () => {
    const ps = sortByDateDesc([dated('a', '2026-09-08'), dated('b', '2025-03-01'), dated('c', '2026-01-02')]);
    expect(groupByYear(ps).map((g) => [g.year, g.posts.map((p) => p.slug)])).toEqual([
      ['2026', ['a', 'c']],
      ['2025', ['b']],
    ]);
  });

  it('标签只统计有文章的，按数量倒序', () => {
    const ps = [dated('a', '2026-09-08', ['成长', '随笔']), dated('b', '2026-09-07', ['成长'])];
    expect(collectTags(ps)).toEqual([
      { tag: '成长', count: 2 },
      { tag: '随笔', count: 1 },
    ]);
  });

  it('相邻文章按时间序，不跨越草稿过滤结果', () => {
    const ps = sortByDateDesc([dated('new', '2026-09-24'), dated('mid', '2026-09-16'), dated('old', '2026-09-08')]);
    expect(adjacentOf(ps, 'mid')).toEqual({ prev: ps[0], next: ps[2] });
    expect(adjacentOf(ps, 'new')).toEqual({ prev: undefined, next: ps[1] });
    expect(adjacentOf(ps, 'old')).toEqual({ prev: ps[1], next: undefined });
    expect(adjacentOf(ps, '不存在')).toEqual({});
  });

  it('标题树只保留 h2/h3', () => {
    expect(
      headingTree([
        { depth: 1, text: '一', id: 'a' },
        { depth: 2, text: '二', id: 'b' },
        { depth: 3, text: '三', id: 'c' },
        { depth: 4, text: '四', id: 'd' },
      ])
    ).toEqual([
      { depth: 2, text: '二', id: 'b' },
      { depth: 3, text: '三', id: 'c' },
    ]);
  });
});

describe('slugIssues —— 契约 §3 的 URL 片段规则', () => {
  it('合法文件夹名不报错', () => {
    const r = slugIssues([{ id: 'my-new-post' }, { id: 'post2' }, { id: 'a1-b2-c3' }]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('中文文件夹名报错（这是以前完全没人管的情况）', () => {
    const r = slugIssues([{ id: '我的新文章' }]);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain('我的新文章');
    expect(r.errors[0]).toContain('slug');
  });

  it('大写、下划线、空格、首尾连字符、连续连字符都报错', () => {
    for (const bad of ['My-Post', 'my_post', 'my post', '-my-post', 'my-post-', 'my--post', 'my/post']) {
      expect(slugIssues([{ id: bad }]).errors.length, `${bad} 应该报错`).toBe(1);
    }
  });

  it('超长（> 60）报错', () => {
    expect(slugIssues([{ id: 'a'.repeat(61) }]).errors.length).toBe(1);
    expect(slugIssues([{ id: 'a'.repeat(60) }]).errors.length).toBe(0);
  });

  it('frontmatter 的 slug 可以救回一个中文文件夹名', () => {
    const r = slugIssues([{ id: '我的新文章', slug: 'my-new-post' }]);
    expect(r.errors).toEqual([]);
    // 但契约 §3 说"不一致则告警"，所以这里必须有一条 warning
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain('不一致');
  });

  it('文件夹名与 slug 一致时不告警', () => {
    expect(slugIssues([{ id: 'same-name', slug: 'same-name' }]).warnings).toEqual([]);
  });
});
