import type { Tag } from '../tag-registry';
import type { PostFrontmatter } from './schema';

export type Heading = { depth: 2 | 3; text: string; id: string };

export type RawEntry = {
  id: string;
  /** 字段形状来自 schema —— 唯一事实来源，不在这里手抄一遍（那会漂移）。 */
  data: PostFrontmatter;
  body: string;
  /** 标题树由页面在 render(entry) 之后取得，查询期不保证可用（deferRender）。
      字段名照 Astro 的 MarkdownHeading：是 slug 不是 id（曾因写成 id 导致目录全是死链）。 */
  headings?: { depth: number; text: string; slug?: string; id?: string }[];
};

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  /** 有则详情页显示「更新于」（content-model.md §1） */
  updated?: string;
  summary: string;
  tags: Tag[];
  draft: boolean;
  pinned: boolean;
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
    updated: data.updated,
    summary: data.summary,
    tags: data.tags as Tag[],
    draft: data.draft,
    pinned: Boolean(data.pinned),
    url: `/posts/${slug}/`,
    charCount,
    readingMinutes: readingMinutes(charCount),
  };
}

export function sortByDateDesc(posts: PostMeta[]): PostMeta[] {
  return [...posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });
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

/**
 * 从 Astro `render()` 的 headings 里挑出 h2/h3 做成目录条。
 *
 * **注意字段名**：Astro 的 `MarkdownHeading` 是 `{ depth, slug, text }` —— 没有 `id`。
 * 这里曾经写 `h.id`，于是每一条都取到 undefined，渲染成 `href="#undefined"`：
 * 目录照样显示、照样有 5 条链接，**但一条都跳不动**，而且构建、测试、截图全绿。
 * 「看起来存在」不等于「测过它在工作」—— 这条事故记在 docs/site-decisions.md。
 *
 * 取不到 slug 的标题直接丢掉，而不是留一条死链（宁可目录少一条，不要一条跳不动的）。
 */
export function headingTree(headings: { depth: number; text: string; slug?: string; id?: string }[]): Heading[] {
  return headings
    .filter((h) => (h.depth === 2 || h.depth === 3) && (h.slug ?? h.id))
    .map((h) => ({ depth: h.depth as 2 | 3, text: h.text, id: (h.slug ?? h.id)! }));
}

/** 契约 §3：URL 片段只允许小写字母、数字、单个连字符，长度 1–60。 */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX = 60;

/**
 * 校验 URL 片段。`id` 是文件夹名（由 loader 的 generateId 从路径得来），`slug` 是 frontmatter 里的覆盖值。
 *
 * 为什么要单独做这件事：zod schema 只看得到 frontmatter，看不到文件夹名。
 * 于是「文件夹名必须是合法 slug」这条契约规则此前完全没有执行 ——
 * 建一个中文名的文件夹会静默生成一个中文 URL。
 *
 * 不合法 → 错误（构建失败）：URL 一旦发出去就改不得，宁可在构建期挡住。
 * 与文件夹名不一致 → 警告（契约 §3 明说"不一致则告警"，不是失败）。
 */
export function slugIssues(entries: { id: string; slug?: string }[]): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const owners = new Map<string, string>();

  for (const e of entries) {
    const effective = e.slug ?? e.id;
    const owner = owners.get(effective);
    if (owner !== undefined) {
      errors.push(e.id + ' 与 ' + owner + ' 使用了同一个文章 URL 片段「' + effective + '」');
    } else {
      owners.set(effective, e.id);
    }

    if (effective.length > SLUG_MAX) {
      errors.push(`${e.id}：URL 片段「${effective}」超过 ${SLUG_MAX} 字符`);
    } else if (!SLUG_PATTERN.test(effective)) {
      errors.push(
        `${e.id}：URL 片段「${effective}」不合法 —— 只允许小写字母、数字与单个连字符。` +
          `中文标题请把文件夹名写成英文短名，或在 frontmatter 里加 slug: english-name`
      );
    }

    if (e.slug && e.slug !== e.id) {
      warnings.push(
        `${e.id}：文件夹名与 frontmatter 的 slug 不一致（${e.id} ≠ ${e.slug}）——` +
          `页面 URL 会用 slug 的值 /posts/${e.slug}/，确认这是你要的`
      );
    }
  }

  return { errors, warnings };
}
