import { z } from 'astro/zod';
import { requireContentLink } from './content-urls.mjs';

const coverValue = z
  .string()
  .trim()
  .max(400)
  .refine((value) => {
    if (!value || /^writer-asset:[a-f0-9]{64}$/.test(value)) return true;
    try {
      requireContentLink(value, '资源封面地址');
      return true;
    } catch {
      return false;
    }
  }, '资源封面必须使用网页地址、站内路径或已上传图片');

export const resourceItemSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    href: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => {
        try {
          requireContentLink(value, '资源链接');
          return true;
        } catch {
          return false;
        }
      }, '资源链接必须使用网页地址（http/https）、相对路径或邮箱地址'),
    summary: z.string().trim().min(1).max(160),
    detail: z.string().trim().max(1200).optional(),
    badge: z.string().trim().max(40).optional(),
    cta: z.string().trim().max(24).optional(),
    code: z.string().trim().max(64).optional(),
    cover: coverValue.optional(),
    images: z.array(coverValue).max(4).optional(),
    tags: z.array(z.string().trim().min(1).max(20)).max(4).optional(),
  })
  .passthrough();

export const resourceGroupSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    note: z.string().trim().max(200).optional(),
    items: z.array(resourceItemSchema).max(60),
  })
  .passthrough();

export const resourcesPageSchema = z
  .object({
    title: z.string().trim().min(1).max(60).optional(),
    intro: z.string().trim().max(320).optional(),
    groups: z.array(resourceGroupSchema).min(1).max(20),
  })
  .passthrough();

export type ResourceItem = z.infer<typeof resourceItemSchema>;
export type ResourceGroup = z.infer<typeof resourceGroupSchema>;
export type ResourcesPageData = z.infer<typeof resourcesPageSchema>;
