import { describe, expect, it } from 'vitest';
import { cropRectangle, moveCrop } from '../src/lib/avatar-crop';

const centered = { centerX: .5, centerY: .5, zoom: 1 };

describe('头像裁切取景', () => {
  it('横图默认取中央正方形，拖到右边能保留边缘人像', () => {
    expect(cropRectangle(400, 200, centered)).toEqual({ left: 100, top: 0, size: 200 });
    const moved = moveCrop(400, 200, centered, -256, 0, 256);
    expect(cropRectangle(400, 200, moved)).toEqual({ left: 200, top: 0, size: 200 });
  });
  it('竖图可移到顶部，连续拖动不会取到画面之外', () => {
    const moved = moveCrop(200, 400, centered, 1000, 1000, 256);
    expect(cropRectangle(200, 400, moved)).toEqual({ left: 0, top: 0, size: 200 });
    const back = moveCrop(200, 400, moved, 0, -128, 256);
    expect(cropRectangle(200, 400, back)).toEqual({ left: 0, top: 100, size: 200 });
  });
  it('放大保留取景中心，极端输入仍在原图之内', () => {
    expect(cropRectangle(400, 200, { ...centered, zoom: 2 })).toEqual({ left: 150, top: 50, size: 100 });
    expect(cropRectangle(400, 200, { centerX: 2, centerY: -1, zoom: 100 })).toEqual({ left: 350, top: 0, size: 50 });
  });
  it('低于最小缩放仍填满取景，非有效图片尺寸拒绝运算', () => {
    expect(cropRectangle(200, 200, { ...centered, zoom: 0 })).toEqual({ left: 0, top: 0, size: 200 });
    expect(() => cropRectangle(0, 200, centered)).toThrow();
    expect(() => cropRectangle(Infinity, 200, centered)).toThrow();
  });
});
