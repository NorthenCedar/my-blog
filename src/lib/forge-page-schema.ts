import { z } from 'astro/zod';
import { FORGE_TEXT_FIELDS } from './forge-fields.ts';

/** 发布校验留在服务端；普通编辑标签不让浏览器加载校验器。 */
export const forgePageSchema = z.object({
  ...Object.fromEntries(FORGE_TEXT_FIELDS.map(field=>[field.key,z.string().trim().min(1).max(field.maxLength)])),
  stages:z.array(z.string().trim().min(1).max(240)).length(3),
  notes:z.array(z.object({title:z.string().trim().min(1).max(120),text:z.string().trim().min(1).max(4000)})).max(12),
}).passthrough();
