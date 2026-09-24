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
    // 默认行为是同步阶段就渲染所有条目 —— 那会把草稿的图片也优化并产出到 dist/。
    // 注意：deferRender: true **实测不足以**阻止草稿素材产出（Astro 7.3.5），
    // 真正兜住这件事的是 scripts/prune-draft-assets.mjs（挂 build 步骤）。
    // 这里保留 deferRender 是为了不把渲染结果常驻在数据存储里（省内存），不是为了素材隔离。
    deferRender: true,
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
