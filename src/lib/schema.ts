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
  // content-model.md §1 规则 6：未登记字段**只警告，不失败**。
  // 用 .strict() 会把它变成构建失败 —— 那是我一开始写错的，测试也跟着错了。
  .passthrough()
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

/** 契约登记的 9 个字段。用来实现规则 6 的"未登记字段 → 警告"。 */
export const KNOWN_FIELDS = [
  'title',
  'date',
  'updated',
  'summary',
  'tags',
  'draft',
  'cover',
  'coverAlt',
  'slug',
] as const;

export function unknownFields(data: Record<string, unknown>): string[] {
  return Object.keys(data).filter((k) => !(KNOWN_FIELDS as readonly string[]).includes(k));
}

/**
 * 相册契约（2026-09-26：B1 的 S3 需要它，提前于 P5 建好）。
 * 与 content/gallery/<相册名>/index.md 的真实结构一致：title + date + images[{src,alt}]。
 * **alt 必填**：相册整页都是图，缺 alt 就是无障碍缺口，不能靠"以后补"。
 * 复用同一个 dateField —— 内容里的 `date: 2026-09-25` 会被 YAML 隐式解析成 Date，
 * 归一化规则必须与文章一致，否则同一份内容两种写法会有两种行为。
 */
export type GalleryFrontmatter = z.infer<typeof gallerySchema>;

/**
 * 相册契约（2026-09-26）。
 * `src` 是**字符串**（相对 markdown 的路径，如 `./011.jpg`），不是 `image()`。
 * 原因：用 `image()` 会让集合里**每一张图都成为构建资产**，源图被原样产出 ——
 * 实测 82 张图里只渲染 3 张，产物仍多出 76 个原图 jpg、体积 +30 MB。
 * 决定「原图不部署」，所以改回字符串 + 由 `scripts/gen-gallery-webp.mjs` 在构建前
 * 生成两档 webp 到 public/gallery/；**引用的图缺失时那个脚本会让构建失败**，
 * 这就是这里放弃 ImageMetadata 类型保证后补上的那一层。
 * alt 仍然必填 —— 那与图片管线无关，是无障碍要求。
 */
export const gallerySchema = z.object({
  title: z.string().min(1),
  titleEn: z.string().trim().optional(),
  layout: z.enum(['scatter', 'slices']).default('scatter'),
  date: dateField('date'),
  images: z
    .array(
      z.object({
        src: z.string().min(1),
        alt: z.string().min(1, '每张图都必须有 alt'),
      })
    )
    .min(1, '相册至少要有一张图'),
});
