import { describe, it, expect } from 'vitest';
import {
  validateComment,
  honeypotTripped,
  rateLimited,
  toRecord,
  toReplyRecord,
  NAME_MAX,
  BODY_MAX,
  RATE_MAX,
} from '../functions/api/_lib/comments-core';
// 分组是**前端**的事（后端只返回两个数组），所以这个函数住在前端共享模块里，测试也从那边引。
// 只有纯函数、顶层没有 DOM 调用 ⇒ 在 node 环境 import 它是安全的。
import { groupReplies } from '../src/scripts/reply-common';

const good = { slug: 'my-post', name: '小明', body: '写得真好。' };

describe('validateComment', () => {
  it('正常输入通过，并去掉首尾空白', () => {
    const r = validateComment({ ...good, name: '  小明  ', body: '  你好  ' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('小明');
      expect(r.value.body).toBe('你好');
    }
  });

  it('名字为空或全空格 → 400', () => {
    for (const name of ['', '   ']) {
      const r = validateComment({ ...good, name });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('名字');
    }
  });

  it('留言为空或全空格 → 400', () => {
    for (const body of ['', '   ']) {
      const r = validateComment({ ...good, body });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('留言');
    }
  });

  it(`名字超过 ${NAME_MAX} 字 → 400`, () => {
    expect(validateComment({ ...good, name: 'a'.repeat(NAME_MAX + 1) }).ok).toBe(false);
    expect(validateComment({ ...good, name: 'a'.repeat(NAME_MAX) }).ok).toBe(true);
  });

  it(`留言超过 ${BODY_MAX} 字 → 400`, () => {
    expect(validateComment({ ...good, body: 'a'.repeat(BODY_MAX + 1) }).ok).toBe(false);
    expect(validateComment({ ...good, body: 'a'.repeat(BODY_MAX) }).ok).toBe(true);
  });

  it('slug 只允许小写字母数字与连字符 → 否则 400', () => {
    for (const slug of ['My-Post', '我的文章', 'a/b', '', 'a b']) {
      expect(validateComment({ ...good, slug }).ok, `${slug} 应该被拒`).toBe(false);
    }
    expect(validateComment({ ...good, slug: 'a-1-b' }).ok).toBe(true);
  });

  it('非对象 / 缺字段 → 返回 400 语义而不是抛异常', () => {
    for (const bad of [null, undefined, 'x', 42, {}, { slug: 'a' }]) {
      expect(() => validateComment(bad)).not.toThrow();
      expect(validateComment(bad).ok).toBe(false);
    }
  });

  it('留言里的 HTML 原样保留（转义是渲染层的责任，不是这一层）', () => {
    const r = validateComment({ ...good, body: '<script>alert(1)</script>' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.body).toBe('<script>alert(1)</script>');
  });
});

describe('honeypotTripped', () => {
  it('蜜罐字段为空 → false（真人）', () => {
    expect(honeypotTripped({ ...good, website: '' })).toBe(false);
    expect(honeypotTripped({ ...good })).toBe(false);
  });

  it('蜜罐字段被填 → true（机器人）', () => {
    expect(honeypotTripped({ ...good, website: 'http://spam.example' })).toBe(true);
    expect(honeypotTripped({ ...good, website: ' ' })).toBe(true);
  });
});

describe('rateLimited', () => {
  it(`最近一分钟内已有 ${RATE_MAX} 条 → 限流`, () => {
    expect(rateLimited(0)).toBe(false);
    expect(rateLimited(1)).toBe(false);
    expect(rateLimited(RATE_MAX)).toBe(true);
    expect(rateLimited(RATE_MAX + 3)).toBe(true);
  });
});

describe('toRecord', () => {
  it('把 D1 的 snake_case 行转成 camelCase', () => {
    expect(
      toRecord({ id: 7, name: '小明', body: '你好', created_at: '2026-09-26T10:00:00.000Z' })
    ).toEqual({ id: 7, name: '小明', body: '你好', createdAt: '2026-09-26T10:00:00.000Z' });
  });
});

describe('toReplyRecord', () => {
  it('把 replies 行的 snake_case 转成 camelCase（含 parentId / replyTo）', () => {
    expect(
      toReplyRecord({
        id: 3,
        parent_id: 7,
        reply_to: '小明',
        name: '小红',
        body: '同意',
        created_at: '2026-09-28T10:00:00.000Z',
      })
    ).toEqual({
      id: 3,
      parentId: 7,
      replyTo: '小明',
      name: '小红',
      body: '同意',
      createdAt: '2026-09-28T10:00:00.000Z',
    });
  });
});

// 回复（2026-09-28 站主要求：说说 / 留言 / 文章评论都能回复）
describe('validateComment 的回复字段', () => {
  it('不传 parentId ⇒ 0（顶层评论）—— 老脚本不认识 parentId 也要能正常发言', () => {
    for (const input of [{ ...good }, { ...good, parentId: undefined }, { ...good, parentId: null }, { ...good, parentId: '' }]) {
      const r = validateComment(input);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.parentId).toBe(0);
    }
  });

  it('parentId 只接受安全非负整数（这个数字要进 SQL，宁可严格）', () => {
    for (const bad of ['3', -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, {}, []]) {
      expect(validateComment({ ...good, parentId: bad }).ok, `${String(bad)} 应该被拒`).toBe(false);
    }
    expect(validateComment({ ...good, parentId: 12 }).ok).toBe(true);
  });

  it(`replyTo 超过 ${NAME_MAX} 字 → 400`, () => {
    expect(validateComment({ ...good, parentId: 1, replyTo: 'a'.repeat(NAME_MAX + 1) }).ok).toBe(false);
    expect(validateComment({ ...good, parentId: 1, replyTo: 'a'.repeat(NAME_MAX) }).ok).toBe(true);
  });

  it('parentId=0 时 replyTo 一律归一成空串（避免脏数据落库）', () => {
    const r = validateComment({ ...good, parentId: 0, replyTo: '小明' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.replyTo).toBe('');
  });
});

describe('groupReplies（回复分组）', () => {
  const rs = [
    { parentId: 1, id: 10 },
    { parentId: 1, id: 11 },
    { parentId: 2, id: 20 },
  ];

  it('按所属顶层评论分组，顺序保持接口给的顺序（旧的在上）', () => {
    const g = groupReplies(rs, [1, 2]);
    expect(g.get(1)?.map((r) => r.id)).toEqual([10, 11]);
    expect(g.get(2)?.map((r) => r.id)).toEqual([20]);
  });

  it('没有回复的顶层也会有一个空数组（前端不必再判空）', () => {
    expect(groupReplies(rs, [1, 2, 3]).get(3)).toEqual([]);
  });

  it('孤儿回复（父不在这批里）丢弃 —— 挂上去会变成没有上下文的孤零零一条', () => {
    const g = groupReplies([{ parentId: 999, id: 5 }], [1]);
    expect(g.get(1)).toEqual([]);
    expect(g.has(999)).toBe(false);
  });
});
