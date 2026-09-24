import { z } from 'astro/zod';
import { TAGS } from '../tag-registry';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * YAML 会把未加引号的 `date: 2026-09-08` 隐式解析成 Date 对象。
 * 内容文件是冻结契约（权威），不该为了迁就 schema 去给日期加引号 ——
 * 所以在这里归一化，两种写法都接受，落库一律 YYYY-MM-DD。
 */
const dateField = (label: string) =>
  z.preprocess(
    (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
    z.string().regex(ISO_DATE, `${label} 必须是 YYYY-MM-DD`)
  );

/**
 * 内容契约的机器可读形式 —— docs/content-model.md §1 的 6 条校验规则。
 * 这里是"字段类型与必填性"的唯一事实来源；标签注册表来自 src/tag-registry.ts。
 */
export const postSchema = z
  .object({
    title: z.string().min(1),
    date: dateField('date'),
    updated: dateField('updated').optional(),
    summary: z.string().min(1).max(80, 'summary 不能超过 80 字'),
    tags: z
      .array(z.string())
      .min(1, 'tags 至少 1 个')
      .max(3, 'tags 最多 3 个')
      .superRefine((ts, ctx) => {
        // 规则 4c：报错必须指出是哪个标签 —— 否则作者只能靠猜
        for (const t of ts) {
          if (!(TAGS as readonly string[]).includes(t)) {
            ctx.addIssue({
              code: 'custom',
              message: `未登记的标签：${t}（请先在 src/tag-registry.ts 登记）`,
            });
          }
        }
      }),
    draft: z.boolean(),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug 只允许小写字母、数字与单个连字符')
      .optional(),
  })
  .strict()
  .refine((d) => !d.updated || d.updated >= d.date, {
    message: 'updated 不能早于 date',
    path: ['updated'],
  })
  .refine((d) => !d.cover || (d.coverAlt ?? '').trim().length > 0, {
    // 空串比缺字段更容易溜过去，所以判的是 trim 后的长度
    message: '有 cover 就必须有非空的 coverAlt',
    path: ['coverAlt'],
  });

export type PostFrontmatter = z.infer<typeof postSchema>;
