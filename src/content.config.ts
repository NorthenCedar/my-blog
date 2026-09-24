import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postSchema } from './lib/schema';

const posts = defineCollection({
  loader: glob({
    pattern: '**/index.md',
    base: './content/posts',
    // 显式生成 id：默认行为由 github-slugger 决定，对 foo/index.md 的结果没有明文保证，
    // 而 slug 会被永久写进 URL，不能赌。
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  }),
  schema: postSchema,
});

// 关于页正文也放在内容层 —— 主题不持有任何正文（content-model.md §7）
const pages = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './content/pages',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
});

export const collections = { posts, pages };
