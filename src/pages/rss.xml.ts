import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getVisiblePosts } from '../lib/posts';

export async function GET(context: APIContext) {
  // 草稿不进 RSS —— getVisiblePosts 在生产构建下已经过滤掉了
  const posts = await getVisiblePosts();
  return rss({
    title: '北杉札记',
    description: '一个大一学生的随笔、照片和代码。',
    site: context.site!,
    items: posts.map((p) => ({
      title: p.title,
      description: p.summary,
      pubDate: new Date(p.date),
      link: p.url,
    })),
  });
}
