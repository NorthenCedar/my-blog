import type { PostMeta } from './post-meta';

/** 仅从真实、已发布且有共同标签的文章中选取最多两篇，不改动输入。 */
export function selectRelatedPosts(current: PostMeta, posts: readonly PostMeta[]): PostMeta[] {
  const tags = new Set(current.tags);
  return posts
    .filter(post => post.slug !== current.slug && !post.draft)
    .map(post => ({
      post,
      shared: [...new Set(post.tags)].filter(tag => tags.has(tag)).length,
    }))
    .filter(item => item.shared > 0)
    .sort((a, b) => {
      if (a.shared !== b.shared) return b.shared - a.shared;
      if (a.post.date !== b.post.date) return a.post.date > b.post.date ? -1 : 1;
      return a.post.slug < b.post.slug ? -1 : a.post.slug > b.post.slug ? 1 : 0;
    })
    .slice(0, 2)
    .map(item => item.post);
}
