import { z } from 'astro/zod';
import { PROJECT_EFFECTS } from './project-effects.ts';

export const safeLink = z.string().refine(value => {
  if (/[\\\u0000-\u0020]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return true;
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}, '项目链接必须是站内路径或不含凭据的 HTTPS 地址');
// 项目目录只保存公开作品；尚未决定发布的草稿不放入此集合。
export const projectSchema = (image: () => z.ZodType) => z.object({
  title: z.string().min(1).max(60),
  summary: z.string().min(1).max(160),
  tagline: z.string().min(1).max(60),
  category: z.string().min(1),
  status: z.string().min(1),
  order: z.number().int().nonnegative(),
  visual: z.enum(['site', 'desk', 'image']).default('image'),
  effect: z.enum(['auto', ...PROJECT_EFFECTS]).default('auto'),
  tags: z.array(z.string().min(1)).max(4),
  images: z.array(z.object({src:image(), darkSrc:image().optional(), alt:z.string().trim().min(1)})).max(6).default([]),
  links: z.array(z.object({label:z.string().min(1), href:safeLink})).max(4).default([]),
  preview: z.record(z.string(), z.string()).default({}),
}).superRefine((project, context) => {
  if (project.visual === 'image' && !project.images.length) context.addIssue({code:'custom',path:['images'],message:'图片模板至少需要一张带说明的封面'});
});
