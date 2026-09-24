import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getVisiblePosts } from '../lib/posts';
import { getSite } from '../lib/site';

export async function GET(context: APIContext) {
  // 草稿不进 RSS —— getVisiblePosts 在生产构建下已经过滤掉了
  const posts = await getVisiblePosts();
  const site = await getSite();

  return rss({
    title: site.name,
    description: site.metaDescription,
    site: context.site!,
    items: posts.map((p) => ({
      title: p.title,
      description: p.summary,
      pubDate: new Date(p.date),
      link: p.url,
    })),
  });
}
