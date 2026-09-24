import { getCollection, type CollectionEntry } from 'astro:content';
import {
  toPostMeta,
  sortByDateDesc,
  filterVisible,
  groupByYear,
  collectTags,
  adjacentOf,
  headingTree,
  type PostMeta,
  type RawEntry,
} from './post-meta';
import { TAGS } from '../tag-registry';

// 环境值和内容源都是"从外面拿进来"的，核心逻辑（post-meta.ts）不认识它们。
const isDev = import.meta.env.DEV;

function toRaw(entry: CollectionEntry<'posts'>): RawEntry {
  const headings = (entry.rendered?.metadata?.headings ?? []) as RawEntry['headings'];
  const body = entry.body ?? '';
  if (headings.length === 0 && /^##\s/m.test(body)) {
    // 自检：如果 Astro 的 rendered.metadata.headings 在某版本里不可用，
    // 这里会喊出来，而不是静默生成一个没有目录的文章页。
    console.warn(`[posts] ${entry.id} 的标题树为空但正文有二级标题 —— TOC 不会渲染`);
  }
  return {
    id: entry.id,
    data: entry.data as unknown as RawEntry['data'],
    body,
    headings,
  };
}

async function allMeta(): Promise<PostMeta[]> {
  const entries = await getCollection('posts');
  return sortByDateDesc(entries.map((e) => toPostMeta(toRaw(e))));
}

export async function getVisiblePosts(): Promise<PostMeta[]> {
  return filterVisible(await allMeta(), isDev);
}

/**
 * 草稿三态中的第三态：生产环境直链也不产出页面。
 * 调用方（getStaticPaths）必须用 getVisiblePosts，本函数的 draft 判断是第二道闸。
 */
export async function getPost(slug: string) {
  const entries = await getCollection('posts');
  const entry = entries.find((e) => (e.data.slug ?? e.id) === slug);
  if (!entry) return undefined;
  if (entry.data.draft && !isDev) return undefined;

  const raw = toRaw(entry);
  const visible = await getVisiblePosts();
  return {
    entry,
    meta: toPostMeta(raw),
    headings: headingTree(raw.headings),
    adjacent: adjacentOf(visible, slug),
  };
}

export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  const posts = await getVisiblePosts();
  return collectTags(posts).filter((t) => (TAGS as readonly string[]).includes(t.tag));
}

export async function getPostsByTag(tag: string): Promise<PostMeta[]> {
  const posts = await getVisiblePosts();
  return posts.filter((p) => (p.tags as string[]).includes(tag));
}

export async function getArchive(): Promise<{ year: string; posts: PostMeta[] }[]> {
  return groupByYear(await getVisiblePosts());
}
