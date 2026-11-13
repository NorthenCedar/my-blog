/**
 * ★ 2026-11-13：点阵基色解析的行为门闩（站主「慢慢拖动不跟着渐变」）。
 *
 * 上一轮把 `--dot-grid-base` 当成「getComputedStyle 不展开 var()」修过一次 ——
 * 那个前提是错的（Chrome 会把 var() 链解析到底）。真凶是预览期间 token 变成
 * `color-mix(in srgb, A, B P%)`，而 DotGrid 的 toRgb 只吃 3/6 位 hex ⇒ 兜底纯白。
 * 这里直接喂现场读到的字符串，守住「连续中间色 → 连续 hex」这条关系。
 */
import { describe, expect, it } from 'vitest';
import { resolveColor } from '../src/scripts/page-dots-view';

const LIGHT = '#d9e4da';
const DARK = '#2b201b';

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

describe('点阵基色解析 · 拖动预览中间色', () => {
  it('纯 hex 原样透传，别名链已由浏览器展开', () => {
    expect(resolveColor(LIGHT, '--about-dot-base', null)).toBe(LIGHT);
    expect(resolveColor(DARK, '--about-dot-base', null)).toBe(DARK);
  });

  it('color-mix(A, B P%) 自己插值，绝不留字符串给 toRgb 兜白', () => {
    const mixed = resolveColor(`color-mix(in srgb, ${LIGHT}, ${DARK} 50%)`, '--dot-grid-base', null);
    expect(mixed).toMatch(/^#[0-9a-f]{6}$/);
    for (let i = 0; i < 3; i++) {
      const want = (channel(LIGHT, i) + channel(DARK, i)) / 2;
      expect(Math.abs(channel(mixed, i) - want), `通道 ${i} 应是两档中点`).toBeLessThanOrEqual(1);
    }
    expect(resolveColor(`color-mix(in srgb, ${LIGHT}, ${DARK} 100%)`, undefined, null)).toBe(DARK);
    expect(resolveColor(`color-mix(in srgb, ${LIGHT} 100%, ${DARK})`, undefined, null)).toBe(LIGHT);
  });

  it('连续进度给出连续且不相等的颜色（慢拖不台阶化）', () => {
    const seen = new Set<string>();
    for (let i = 0; i <= 20; i++) {
      const p = i / 20;
      seen.add(resolveColor(
        `color-mix(in srgb, ${LIGHT}, ${DARK} ${Math.round(p * 10000) / 100}%)`,
        undefined, null,
      ));
    }
    expect(seen.size, '21 档至少应有 15 个不同色值，否则点阵会一格一格跳').toBeGreaterThanOrEqual(15);
  });

  it('预览 mixed 表优先于 CSS 读回值（逐帧纯 hex，最准）', () => {
    /* ⚠ 这里的值要故意取**不等于** 50% 插值的结果：变异验证第一版用了中点色，
       把 mixed 优先级整行删掉也能通过（两条路殊途同归）—— 判据必须能区分两者。 */
    const tint = { '--about-dot-base': '#a1b2c3' };
    expect(resolveColor(`color-mix(in srgb, ${LIGHT}, ${DARK} 50%)`, '--about-dot-base', tint))
      .toBe('#a1b2c3');
  });
});
