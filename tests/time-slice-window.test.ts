import { describe, expect, it } from 'vitest';
import { tslWindow } from '../src/scripts/time-slice-core';

function bounds(path: string) {
  const values = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const xs = values.filter((_, i) => i % 2 === 0);
  const ys = values.filter((_, i) => i % 2 === 1);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

describe('时间切片 · 双层玻璃入口', () => {
  it('入口接近正方形、四角圆滑，前后玻璃错开且有厚度连线', () => {
    const pane = tslWindow(1280, 720, 0);
    const box = bounds(pane.front);
    expect((box.right - box.left) / (box.bottom - box.top)).toBeGreaterThan(0.8);
    expect((box.right - box.left) / (box.bottom - box.top)).toBeLessThan(1.1);
    expect(pane.front.match(/Q/g)).toHaveLength(4);
    expect(pane.back).not.toBe(pane.front);
    expect(bounds(pane.back).left).toBeGreaterThan(box.left);
    expect(pane.edges.match(/M/g)).toHaveLength(4);
    expect(pane.opacity).toBe(1);
  });

  it.each([[1280, 720], [2560, 1080], [768, 1024]])('穿窗后覆盖 %i×%i 的整个视口，玻璃边框完全收起', (w, h) => {
    const pane = tslWindow(w, h, 1);
    const box = bounds(pane.front);
    expect(box.left).toBeLessThan(0);
    expect(box.right).toBeGreaterThan(w);
    expect(box.top).toBeLessThan(0);
    expect(box.bottom).toBeGreaterThan(h);
    expect(pane.opacity).toBe(0);
  });

  it('前进放大、反向逐点还原，缩放过程不跳形且没有非法坐标', () => {
    let width = 0;
    let opacity = 1;
    for (let i = 0; i <= 100; i++) {
      const pane = tslWindow(1440, 900, i / 100);
      const box = bounds(pane.front);
      expect(box.right - box.left).toBeGreaterThanOrEqual(width);
      expect(pane.opacity).toBeLessThanOrEqual(opacity);
      expect(pane.front + pane.back + pane.edges).not.toMatch(/NaN|Infinity/);
      expect(tslWindow(1440, 900, i / 100)).toEqual(pane);
      width = box.right - box.left;
      opacity = pane.opacity;
    }
    expect(tslWindow(1440, 900, -1)).toEqual(tslWindow(1440, 900, 0));
    expect(tslWindow(1440, 900, 2)).toEqual(tslWindow(1440, 900, 1));
  });
});
