import { describe, it, expect } from 'vitest';
import { validateLikeSlug, parseSlugList, isVisitorId, TALK_PREFIX } from '../functions/api/_lib/reactions-core';

/**
 * 点赞接口的**业务规则**单测（2026-09-26 站主要求说说加点赞）。
 *
 * 为什么值得单测：这套规则是唯一挡住"接口被拿来凭空造键 / 灌水"的地方，
 * 而它跑在 Cloudflare 上、平时看不见 —— 用纯函数测最便宜（不需要起 worker）。
 * 规则本身照 0001 的分工放在 `functions/api/_lib/`，所以测试直接 import 它，不复制一份逻辑。
 */
describe('说说点赞：slug 校验', () => {
  it('接受我们自己生成的 talk-… 形态', () => {
    for (const s of ['talk-20260926', 'talk-20260926b', 'talk-abc123']) {
      const r = validateLikeSlug(s);
      expect(r.ok, `${s} 应当合法`).toBe(true);
    }
  });

  it('拒绝非说说前缀（不许拿接口给别的东西计数）', () => {
    const r = validateLikeSlug('ai-built-this-blog');
    expect(r.ok).toBe(false);
  });

  it('拒绝路径穿越 / 非法字符 / 空值 / 超长', () => {
    for (const s of ['talk-../etc', 'talk-a/b', 'talk-A', 'talk-a b', 'talk-', '', 'talk-' + 'a'.repeat(80)]) {
      expect(validateLikeSlug(s).ok, `${JSON.stringify(s)} 应当被拒`).toBe(false);
    }
    expect(validateLikeSlug(undefined).ok).toBe(false);
    expect(validateLikeSlug(123).ok).toBe(false);
  });

  it('前缀常量与生成规则一致（改了前缀这里会红）', () => {
    expect(TALK_PREFIX).toBe('talk-');
    expect(validateLikeSlug(TALK_PREFIX + 'x').ok).toBe(true);
  });
});

describe('说说点赞：批量参数解析', () => {
  it('合法项保留、顺序不变、去重', () => {
    expect(parseSlugList('talk-a,talk-b,talk-a')).toEqual(['talk-a', 'talk-b']);
  });

  it('脏值静默丢弃（一个坏值不该让整批失败）', () => {
    expect(parseSlugList('talk-ok,../../etc,ai-x,, talk-ok2')).toEqual(['talk-ok', 'talk-ok2']);
  });

  it('空参数返回空数组', () => {
    expect(parseSlugList(null)).toEqual([]);
    expect(parseSlugList('')).toEqual([]);
  });

  it('有上限（防止一次请求拖垮库）', () => {
    const many = Array.from({ length: 300 }, (_, i) => `talk-${i}`).join(',');
    expect(parseSlugList(many).length).toBe(100);
  });
});

describe('访问统计：访客号校验', () => {
  it('只认 16 位小写字母数字（cookie 里带回来的值）', () => {
    expect(isVisitorId('a1b2c3d4e5f6a7b8')).toBe(true);
    expect(isVisitorId('A1B2C3D4E5F6A7B8')).toBe(false);
    expect(isVisitorId('short')).toBe(false);
    expect(isVisitorId('a1b2c3d4e5f6a7b8extra')).toBe(false);
    expect(isVisitorId('a1b2c3d4e5f6a7b-')).toBe(false);
  });
});
