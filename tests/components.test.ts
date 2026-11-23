import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import PostIndex from '../src/components/PostIndex.astro';
import { toPostMeta, type RawEntry } from '../src/lib/post-meta';

/**
 * 组件级测试：用 Astro 的容器 API 真的把组件渲染成 HTML 再断言。
 * 补的是规格轴点出的缺口 —— 「草稿三态的第二态（dev 可见并标「草稿」）」之前只测了
 * filterVisible 这个纯函数，没有任何断言说那个徽标真的出现在 HTML 里。
 */
const entry = (draft: boolean, pinned = false): RawEntry => ({
  id: 'a-post',
  data: {
    // 注意：标题里不能出现「草稿」二字 —— 否则断言 not.toContain('草稿') 会被标题本身命中
    title: '一篇文章',
    date: '2026-09-08',
    summary: '摘要',
    tags: ['成长'],
    draft,
    ...(pinned ? { pinned: true } : {}),
  },
  body: '正文',
});

describe('PostIndex 渲染', () => {
  it('草稿文章带「草稿」徽标', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PostIndex, {
      props: { posts: [toPostMeta(entry(true))], heading: '最近写的' },
    });
    expect(html).toContain('class="badge"');
    expect(html).toContain('草稿');
  });

  it('已发布文章不带徽标', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PostIndex, {
      props: { posts: [toPostMeta(entry(false))] },
    });
    expect(html).not.toContain('class="badge"');
    expect(html).not.toContain('pin-badge');
  });

  it('置顶文章带「置顶」徽标和 data-pinned 属性', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PostIndex, {
      props: { posts: [toPostMeta(entry(false, true))] },
    });
    expect(html).toContain('pin-badge');
    expect(html).toContain('置顶');
    expect(html).toContain('data-pinned="true"');
  });

  it('列表项是链接，且标题与摘要都渲染出来', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PostIndex, {
      props: { posts: [toPostMeta(entry(false))] },
    });
    expect(html).toContain('href="/posts/a-post/"');
    expect(html).toContain('一篇文章');
    expect(html).toContain('摘要');
  });
});
