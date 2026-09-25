import { describe, it, expect } from 'vitest';
import {
  validateComment,
  honeypotTripped,
  rateLimited,
  toRecord,
  NAME_MAX,
  BODY_MAX,
  RATE_MAX,
} from '../functions/api/_lib/comments-core';

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
