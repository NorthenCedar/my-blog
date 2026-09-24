import { describe, it, expect } from 'vitest';
import { postSchema, unknownFields, KNOWN_FIELDS } from '../src/lib/schema';

const valid = {
  title: '标题',
  date: '2026-09-08',
  summary: '摘要',
  tags: ['成长'],
  draft: true,
};

describe('postSchema 的 6 条规则', () => {
  it('1. 缺必填字段就报错', () => {
    const { draft, ...missingDraft } = valid;
    expect(postSchema.safeParse(missingDraft).success).toBe(false);
  });

  it('2. date 必须是 YYYY-MM-DD', () => {
    expect(postSchema.safeParse({ ...valid, date: '2026/09/08' }).success).toBe(false);
  });

  it('3. updated 不能早于 date，且报错要指向 updated', () => {
    const r = postSchema.safeParse({ ...valid, updated: '2026-09-01' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error)).toContain('updated');
  });

  it('4a. tags 不能为空', () => {
    expect(postSchema.safeParse({ ...valid, tags: [] }).success).toBe(false);
  });

  it('4b. tags 不能超过 3 个', () => {
    expect(postSchema.safeParse({ ...valid, tags: ['成长', '随笔', '钢琴', '摄影'] }).success).toBe(false);
  });

  it('4c. tags 必须在注册表里，且报错文本要指出是哪个标签', () => {
    const r = postSchema.safeParse({ ...valid, tags: ['随记'] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error)).toContain('随记');
  });

  it('5. 有 cover 就必须有非空的 coverAlt', () => {
    expect(postSchema.safeParse({ ...valid, cover: './a.jpg' }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, cover: './a.jpg', coverAlt: '' }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, cover: './a.jpg', coverAlt: '  ' }).success).toBe(false);
    expect(postSchema.safeParse({ ...valid, cover: './a.jpg', coverAlt: '一张图' }).success).toBe(true);
  });

  it('6. 未登记字段不失败，但能被检测出来（契约要求"只警告"）', () => {
    // content-model.md §1 规则 6：出现未登记字段 → 构建**警告（不失败）**。
    // 一开始我写成 .strict() 让它失败了，那是错的。
    const r = postSchema.safeParse({ ...valid, excerpt: '多余的字段' });
    expect(r.success).toBe(true);
    expect(unknownFields(r.data as Record<string, unknown>)).toEqual(['excerpt']);
  });

  it('7. YAML 把未加引号的日期解析成 Date 对象时，归一化成 YYYY-MM-DD', () => {
    // 这是第一次构建时真实撞到的坑：content/ 里写 date: 2026-09-16，
    // YAML 隐式类型把它变成 Date，字符串 schema 直接拒绝。
    const r = postSchema.safeParse({ ...valid, date: new Date('2026-09-08T00:00:00Z') });
    expect(r.success).toBe(true);
    expect(r.data?.date).toBe('2026-09-08');

    const u = postSchema.safeParse({
      ...valid,
      date: new Date('2026-09-08T00:00:00Z'),
      updated: new Date('2026-09-20T00:00:00Z'),
    });
    expect(u.success).toBe(true);
    expect(u.data?.updated).toBe('2026-09-20');
  });

  it('8. 归一化之后，updated < date 这条跨字段规则仍然生效', () => {
    const r = postSchema.safeParse({
      ...valid,
      date: new Date('2026-09-08T00:00:00Z'),
      updated: new Date('2026-09-01T00:00:00Z'),
    });
    expect(r.success).toBe(false);
  });

  it('合法输入通过（三篇真草稿的实际 frontmatter 形状）', () => {
    expect(postSchema.safeParse(valid).success).toBe(true);
    expect(
      postSchema.safeParse({
        title: '钢琴八级之后：我学了那么多东西，为什么只有几样留在了我身上',
        date: '2026-09-08',
        summary: '从合肥金湖小学的琴房到安徽大学的机房，一个学东西很快、放弃得也很快的普通学生，回头清点自己十八年的业余爱好。',
        tags: ['成长', '随笔', '钢琴'],
        draft: true,
      }).success
    ).toBe(true);
  });
});
