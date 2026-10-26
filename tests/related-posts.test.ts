import { describe, expect, it } from 'vitest';
import type { PostMeta } from '../src/lib/post-meta';
import { selectRelatedPosts } from '../src/lib/related-posts';

const post = (slug: string, overrides: Partial<PostMeta> = {}): PostMeta => ({
  slug, title: `札记 ${slug}`, date: '2026-10-01', summary: '测试摘要',
  tags: ['AI'], draft: false, url: `/posts/${slug}/`, charCount: 400, readingMinutes: 1,
  ...overrides,
});

describe('相关札记选择', () => {
  it('按 slug 排除自身，并排除草稿和没有共享标签的文章', () => {
    const current = post('current');
    const eligible = post('eligible');
    const candidates = [
      { ...current },
      post('draft', { draft: true }),
      post('unrelated', { tags: ['摄影'] }),
      eligible,
    ];
    expect(selectRelatedPosts(current, candidates)).toEqual([eligible]);
  });

  it('共享标签较多的旧文章排在仅共享一个标签的新文章之前', () => {
    const current = post('current', { tags: ['AI', '教程', '工具'] });
    const moreShared = post('more-shared', { tags: ['AI', '教程'], date: '2025-01-01' });
    const newer = post('newer', { tags: ['AI'], date: '2026-10-26' });
    expect(selectRelatedPosts(current, [newer, moreShared]).map(item => item.slug))
      .toEqual(['more-shared', 'newer']);
  });

  it('共享标签数相同时按日期倒序，最多返回两篇', () => {
    const current = post('current');
    const candidates = [
      post('oldest', { date: '2025-12-31' }),
      post('newest', { date: '2026-10-26' }),
      post('middle', { date: '2026-01-01' }),
    ];
    expect(selectRelatedPosts(current, candidates).map(item => item.slug))
      .toEqual(['newest', 'middle']);
  });

  it('共享数和日期都相同时按 slug 升序稳定选择，不依赖输入次序', () => {
    const current = post('current');
    const candidates = [post('z-note'), post('a-note'), post('middle-note')];
    expect(selectRelatedPosts(current, candidates).map(item => item.slug))
      .toEqual(['a-note', 'middle-note']);
    expect(selectRelatedPosts(current, [...candidates].reverse()).map(item => item.slug))
      .toEqual(['a-note', 'middle-note']);
  });

  it('重复标签只计一次，不能把一类交集放大成多类', () => {
    const current = post('current', { tags: ['AI', 'AI', '教程'] });
    const oneShared = post('one-shared', { tags: ['AI', 'AI', 'AI'], date: '2026-10-26' });
    const twoShared = post('two-shared', { tags: ['AI', '教程'], date: '2025-01-01' });
    expect(selectRelatedPosts(current, [oneShared, twoShared]).map(item => item.slug))
      .toEqual(['two-shared', 'one-shared']);
  });

  it('没有候选、没有交集或当前文章没有标签时，返回空列表', () => {
    const current = post('current');
    expect(selectRelatedPosts(current, [])).toEqual([]);
    expect(selectRelatedPosts(current, [current, post('draft', { draft: true })])).toEqual([]);
    expect(selectRelatedPosts(current, [post('unrelated', { tags: ['摄影'] }), post('untagged', { tags: [] })]))
      .toEqual([]);
    expect(selectRelatedPosts(post('untagged', { tags: [] }), [post('candidate')])).toEqual([]);
  });

  it('只有一篇匹配时不补入无关文章或虚构第二篇', () => {
    const current = post('current');
    const matching = post('matching');
    expect(selectRelatedPosts(current, [post('unrelated', { tags: ['钢琴'] }), matching]))
      .toEqual([matching]);
  });

  it('冻结的文章及标签数组仍可使用，筛选排序不会修改输入', () => {
    const current = post('current', { tags: ['AI', '教程'] });
    const candidates = [
      post('old', { date: '2025-01-01' }),
      post('new', { date: '2026-10-26' }),
      post('closest', { tags: ['教程', 'AI'], date: '2024-01-01' }),
    ];
    const before = structuredClone({ current, candidates });
    for (const item of [current, ...candidates]) {
      Object.freeze(item.tags);
      Object.freeze(item);
    }
    Object.freeze(candidates);
    expect(selectRelatedPosts(current, candidates).map(item => item.slug))
      .toEqual(['closest', 'new']);
    expect({ current, candidates }).toEqual(before);
  });
});
