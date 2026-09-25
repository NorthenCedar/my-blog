import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { gallerySchema, postSchema } from './lib/schema';

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

// 站点文案（站名 / 首页简介 / meta description / 页脚联系方式）
const site = defineCollection({
  loader: glob({
    pattern: 'site.md',
    base: './content',
    generateId: () => 'site',
  }),
  schema: z.object({
    name: z.string().min(1),
    wordmark: z.string().min(1),
    intro: z.string().min(1),
    metaDescription: z.string().min(1).max(120),
    email: z.string().email(),
    github: z.string().url(),
    // P2 前置件（站主 2026-09-25 定案「坐标行留」）：首页身份区那行坐标要这三个值。
    // 刻意做成**可选** —— 不填就不渲染那一行，而不是让构建失败。
    // 内容层是站主的，不该被主题逼着填字段。
    lat: z.string().min(1).optional(),
    lon: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
  }),
});

// 相册（2026-09-26 提前于 P5 建好）：content/gallery/<相册名>/index.md + 同目录图片。
// 主题不持有任何图片路径 —— 首页 S3 的「一主图 + 两缩略」与将来的 /gallery 页都从这里读。
const gallery = defineCollection({
  loader: glob({
    pattern: '**/index.md',
    base: './content/gallery',
    // 与 posts 同理：id 会被写进将来的 /gallery/<id> URL，不能赌默认行为
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  }),
  schema: gallerySchema,
});

export const collections = { posts, pages, site, gallery };
