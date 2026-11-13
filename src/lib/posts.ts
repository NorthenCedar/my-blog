import { getCollection, type CollectionEntry } from 'astro:content';
import {
  toPostMeta,
  sortByDateDesc,
  filterVisible,
  groupByYear,
  collectTags,
  slugIssues,
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

/** 同一构建复用内容索引；开发服务每次读当前集合，保留热更新。 */
async function loadPosts() {
  const entries = await getCollection('posts');
  const { errors, warnings } = slugIssues(entries.map(entry => ({ id: entry.id, slug: entry.data.slug })));
  for (const warning of warnings) console.warn('[slug] ' + warning);
  if (errors.length > 0) throw new Error('文章 URL 片段不合法（content-model.md §3）：\n  - ' + errors.join('\n  - '));

  const entriesBySlug = new Map(entries.map(entry => [entry.data.slug ?? entry.id, entry]));
  const visible = filterVisible(sortByDateDesc(entries.map(entry => toPostMeta(toRaw(entry)))), isDev);
  const positions = new Map(visible.map((post, index) => [post.slug, index]));
  return { entriesBySlug, positions, visible };
}

let buildPosts: ReturnType<typeof loadPosts> | undefined;
function getPosts() {
  if (isDev) return loadPosts();
  return buildPosts ??= loadPosts();
}

export async function getVisiblePosts(): Promise<PostMeta[]> {
  return (await getPosts()).visible.slice();
}

/** 构建时只有已发布文章有详情；开发环境也可预览草稿。 */
export async function getPost(slug: string) {
  const { entriesBySlug, positions, visible } = await getPosts();
  const entry = entriesBySlug.get(slug);
  const index = positions.get(slug);
  if (!entry || index === undefined) return undefined;
  return {
    entry,
    meta: visible[index],
    adjacent: { prev: visible[index - 1], next: visible[index + 1] },
  };
}

export async function getAllTags(posts?: PostMeta[]): Promise<{ tag: string; count: number }[]> {
  return collectTags(posts ?? await getVisiblePosts()).filter((t) => (TAGS as readonly string[]).includes(t.tag));
}

export async function getPostsByTag(tag: string): Promise<PostMeta[]> {
  const posts = await getVisiblePosts();
  return posts.filter((p) => (p.tags as string[]).includes(tag));
}

export async function getArchive(): Promise<{ year: string; posts: PostMeta[] }[]> {
  return groupByYear(await getVisiblePosts());
}
