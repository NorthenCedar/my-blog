import { getCollection, type CollectionEntry } from 'astro:content';
import {
  toPostMeta,
  sortByDateDesc,
  filterVisible,
  groupByYear,
  collectTags,
  adjacentOf,
  type PostMeta,
  type RawEntry,
} from './post-meta';
import { TAGS } from '../tag-registry';
import { unknownFields } from './schema';

// 环境值和内容源都是"从外面拿进来"的，核心逻辑（post-meta.ts）不认识它们。
const isDev = import.meta.env.DEV;

function toRaw(entry: CollectionEntry<'posts'>): RawEntry {
  // 内容契约规则 6：未登记字段只警告，不失败（.strict() 是我一开始写错的）。
  const extra = unknownFields(entry.data as Record<string, unknown>);
  if (extra.length > 0) {
    console.warn(
      `[content] ${entry.id} 有未登记字段：${extra.join(', ')} —— 确认是否该走内容模型变更流程（content-model.md §6）`
    );
  }
  // 标题树不在这里取：deferRender 打开后 entry.rendered 在查询期不可用，
  // 标题树由页面在 render(entry) 之后拿到（见 layouts/Post.astro）。
  return {
    id: entry.id,
    data: entry.data as unknown as RawEntry['data'],
    body: entry.body ?? '',
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
