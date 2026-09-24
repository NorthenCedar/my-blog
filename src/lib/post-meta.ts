import type { Tag } from '../tag-registry';

export type Heading = { depth: 2 | 3; text: string; id: string };

export type RawEntry = {
  id: string;
  data: {
    title: string;
    date: string;
    summary: string;
    tags: string[];
    draft: boolean;
    slug?: string;
    updated?: string;
    cover?: string;
    coverAlt?: string;
  };
  body: string;
  headings: { depth: number; text: string; id: string }[];
};

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: Tag[];
  draft: boolean;
  url: string;
  charCount: number;
  readingMinutes: number;
};

const CODE_FENCE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`]*`/g;
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;

/**
 * 中文字数按字、拉丁按词。代码块与行内代码不计入 ——
 * 技术文里代码占比很高，算进去会让"阅读时长"离谱。
 */
export function countChars(markdown: string): number {
  const text = markdown
    .replace(CODE_FENCE, ' ')
    .replace(INLINE_CODE, ' ')
    .replace(IMAGE, ' ')
    .replace(LINK, '$1')
    .replace(/[#>*_`~\-|]/g, ' ');
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = (text.match(/[A-Za-z0-9]+/g) ?? []).length;
  return cjk + words;
}

/** 中文阅读速度按 400 字/分钟，最少 1 分钟 */
export function readingMinutes(chars: number): number {
  return Math.max(1, Math.round(chars / 400));
}

export function toPostMeta(entry: RawEntry): PostMeta {
  const { data, body } = entry;
  const slug = data.slug ?? entry.id;
  const charCount = countChars(body);
  return {
    slug,
    title: data.title,
    date: data.date,
    summary: data.summary,
    tags: data.tags as Tag[],
    draft: data.draft,
    url: `/posts/${slug}/`,
    charCount,
    readingMinutes: readingMinutes(charCount),
  };
}

export function sortByDateDesc(posts: PostMeta[]): PostMeta[] {
  return [...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** 草稿可见性：开发环境全部可见，生产只留已发布 */
export function filterVisible(posts: PostMeta[], isDev: boolean): PostMeta[] {
  return isDev ? posts : posts.filter((p) => !p.draft);
}

export function groupByYear(posts: PostMeta[]): { year: string; posts: PostMeta[] }[] {
  const map = new Map<string, PostMeta[]>();
  for (const p of posts) {
    const y = p.date.slice(0, 4);
    const bucket = map.get(y);
    if (bucket) bucket.push(p);
    else map.set(y, [p]);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, ps]) => ({ year, posts: ps }));
}

/** 只统计真正有文章的标签；数量相同时按中文拼音序，保证输出稳定 */
export function collectTags(posts: PostMeta[]): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const p of posts) for (const t of p.tags) map.set(t, (map.get(t) ?? 0) + 1);
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'));
}

/** posts 必须是已排好序、已过滤的可见列表 —— 相邻关系不应该跨过被隐藏的文章 */
export function adjacentOf(posts: PostMeta[], slug: string): { prev?: PostMeta; next?: PostMeta } {
  const i = posts.findIndex((p) => p.slug === slug);
  if (i === -1) return {};
  return { prev: posts[i - 1], next: posts[i + 1] };
}

export function headingTree(headings: { depth: number; text: string; id: string }[]): Heading[] {
  return headings
    .filter((h) => h.depth === 2 || h.depth === 3)
    .map((h) => ({ depth: h.depth as 2 | 3, text: h.text, id: h.id }));
}
