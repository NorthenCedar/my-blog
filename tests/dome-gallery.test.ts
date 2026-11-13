import { describe, expect, it, vi } from 'vitest';
import { buildDomeItems } from '../src/vendor/react-bits/DomeGallery';

describe('照片穹顶', () => {
  it.each([1, 20, 57, 100])('只横转就能在中段浏览全部 %i 张照片', count => {
    const photos = Array.from({ length: count }, (_, index) => ({
      src: `${index}.webp`,
      full: `${index}-full.webp`,
      alt: `照片 ${index}`,
    }));
    const items = buildDomeItems(photos, 34);
    const middle = items.filter(item => Math.abs(item.y - .5) <= 1.5);
    expect(new Set(middle.map(item => item.index)).size).toBe(count);
    expect(items.every(item => item.src === photos[item.index].src && item.full === photos[item.index].full)).toBe(true);
  });

  it('重进展览时改变中段的照片顺序', () => {
    const photos = Array.from({ length: 57 }, (_, index) => `${index}.webp`);
    const random = vi.spyOn(Math, 'random');
    const order = () => buildDomeItems(photos, 34)
      .filter(item => Math.abs(item.y - .5) <= 1.5)
      .map(item => item.index);
    try {
      random.mockReturnValue(.2);
      const first = order();
      random.mockReturnValue(.8);
      expect(order()).not.toEqual(first);
    } finally {
      random.mockRestore();
    }
  });
});
