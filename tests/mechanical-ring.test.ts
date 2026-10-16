import { describe, expect, it } from 'vitest';
import { projectRingLight } from '../src/lib/mechanical-ring';

describe('机械环光带的遮挡与相位', () => {
  it('背面点断开路径，正面各段保留整圈的累计距离', () => {
    const result = projectRingLight([
      [0, 0, 0, 1], [3, 0, 0, 1], [3, 4, 0, 0],
      [0, 4, 0, 1], [0, 2, 0, 1],
    ]);
    expect(result.length).toBe(14);
    expect(result.segments).toEqual([
      { d: 'M0,0 L3,0', offset: 0 },
      { d: 'M0,4 L0,2 L0,0', offset: 10 },
    ]);
  });

  it('全部被挡住时不产生光带，也不把独立可见点接成斜线', () => {
    expect(projectRingLight([[0, 0, 0, 0], [3, 0, 0, 0]]).segments).toEqual([]);
    expect(projectRingLight([
      [0, 0, 0, 0], [3, 0, 0, 1], [3, 4, 0, 0],
    ]).segments).toEqual([]);
  });

  it('空轨迹安全退化成静态渲染图', () => {
    expect(projectRingLight([])).toEqual({ length: 0, segments: [] });
  });
});
