import { describe, it, expect } from 'vitest';
import { readAlbumOptions } from '../src/lib/album-options.mjs';
import { scatterLayout, slicePose, clampFocus, zoomAt, clampCamera, focusIntent, coastStep, sliceThrowTarget, sliceWheelImpulse, coastSliceWheel } from '../src/scripts/album-scene-core';
import { gallerySchema } from '../src/lib/schema';
import { galleryFileName } from '../src/lib/album-files.mjs';

describe('单册陈列选项', () => {
  it('旧相册和新相册不填配置都默认散片，英文名可省略', () => {
    expect(readAlbumOptions('title: 人像\ndate: 2026-09-25')).toEqual({ layout: 'scatter', titleEn: '' });
  });
  it('接受两种模式与 CRLF，英文引号不会显示到标题里', () => {
    expect(readAlbumOptions('layout: slices\r\ntitleEn: "Passing Landscapes"\r\n')).toEqual({
      layout: 'slices', titleEn: 'Passing Landscapes',
    });
    expect(readAlbumOptions("layout: scatter\ntitleEn: 'Until the Earth Turns into a Lime'\n").titleEn)
      .toBe('Until the Earth Turns into a Lime');
  });
  it('允许行尾注释，但保留英文名称里的井号', () => {
    expect(readAlbumOptions('layout: slices # 切片\ntitleEn: "Portraits #1" # 名称\n'))
      .toEqual({ layout: 'slices', titleEn: 'Portraits #1' });
    expect(readAlbumOptions("titleEn: 'Portraits #2' # 注释").titleEn).toBe('Portraits #2');
  });
  it('错误或空模式直接报错，不能悄悄变成另一种陈列', () => {
    expect(() => readAlbumOptions('layout: cylinder')).toThrow(/layout/);
    expect(() => readAlbumOptions('layout:\ntitleEn: Portraits')).toThrow(/layout/);
  });
  it('Astro 内容集合保留展示字段，并拒绝非法模式', () => {
    const album = { title: '人像', date: '2026-09-25', images: [{ src: './a.jpg', alt: '照片' }] };
    expect(gallerySchema.parse({ ...album, layout: 'slices', titleEn: 'Portraits' }))
      .toMatchObject({ layout: 'slices', titleEn: 'Portraits' });
    expect(gallerySchema.safeParse({ ...album, layout: 'cylinder' }).success).toBe(false);
    expect(gallerySchema.parse(album).layout).toBe('scatter');
  });
});

describe('散片稳定排布', () => {
  const keys = Array.from({ length: 57 }, (_, i) => `./照片${i}.jpg`);
  it('追加照片保持所有既有照片的位置，且同一册可重复生成', () => {
    const before = scatterLayout('人像', keys.slice(0, 15));
    expect(scatterLayout('人像', keys).slice(0, 15)).toEqual(before);
    expect(scatterLayout('人像', keys.slice(0, 15))).toEqual(before);
    expect(scatterLayout('另一册', keys.slice(0, 15))).not.toEqual(before);
  });
  it('57 张自然散落、大小有明显变化，不遮盖中央标题', () => {
    const frames = scatterLayout('一些风景', keys);
    expect(frames).toHaveLength(keys.length);
    expect(Math.max(...frames.map((p) => p.width)) / Math.min(...frames.map((p) => p.width))).toBeGreaterThan(2);
    expect(Math.max(...frames.map((p) => Math.abs(p.angle)))).toBeGreaterThan(8);
    expect(new Set(frames.map((p) => Math.round(p.y / 50))).size).toBeGreaterThan(keys.length / 2);
    const box = (p: typeof frames[number]) => {
      const a = p.angle * Math.PI / 180;
      return { x: (Math.abs(Math.cos(a)) * (p.width + 24) + Math.abs(Math.sin(a)) * (p.height + 42)) / 2,
        y: (Math.abs(Math.sin(a)) * (p.width + 24) + Math.abs(Math.cos(a)) * (p.height + 42)) / 2 };
    };
    for (const p of frames) {
      expect(Number.isFinite(p.x + p.y + p.angle + p.depth)).toBe(true);
      const b = box(p);
      expect(Math.abs(p.x) >= 340 + b.x || Math.abs(p.y) >= 150 + b.y).toBe(true);
      for (const q of frames) {
        if (p === q) continue;
        const c = box(q);
        const overlap = Math.max(0, b.x + c.x - Math.abs(p.x - q.x)) * Math.max(0, b.y + c.y - Math.abs(p.y - q.y));
        expect(overlap).toBeLessThanOrEqual(Math.min(b.x * b.y, c.x * c.y) * 4 * 0.081);
      }
    }
  });
  it('空册可以返回空布局，重复图源报错避免身份冲突', () => {
    expect(scatterLayout('空册', [])).toEqual([]);
    expect(() => scatterLayout('人像', ['./a.jpg', './a.jpg'])).toThrow(/重复/);
  });
});

describe('切片和场景边界', () => {
  it('松手后有明显滑行距离，30/60/120Hz 同时长落点一致', () => {
    const run = (hz: number) => {
      let state = { camera: { x: 0, y: 0, scale: 1 }, velocity: { x: 1000, y: -400 } };
      for (let i = 0; i < hz; i++) state = coastStep(state.camera, state.velocity, 1 / hz);
      return state;
    };
    const at60 = run(60);
    expect(at60.camera.x).toBeGreaterThan(350);
    expect(at60.velocity.x).toBeLessThan(200);
    expect(run(30).camera.x).toBeCloseTo(at60.camera.x, 5);
    expect(run(120).camera.y).toBeCloseTo(at60.camera.y, 5);
  });
  it('切片惯性可多滑几张，同时守住首尾', () => {
    expect(sliceThrowTarget(5.2, -1800, 390, 57)).toBeGreaterThan(6);
    expect(sliceThrowTarget(0, 2400, 390, 57)).toBe(0);
    expect(sliceThrowTarget(56, -2400, 390, 57)).toBe(56);
    expect(sliceThrowTarget(5.2, 0, 390, 57)).toBe(5);
  });
  it('纵向滚轮向下推动照片向左，向上推动照片向右；像素、行、页三种单位一致', () => {
    expect(sliceWheelImpulse(100, 0, 800)).toBeGreaterThan(0);
    expect(sliceWheelImpulse(-100, 0, 800)).toBeLessThan(0);
    expect(sliceWheelImpulse(6.25, 1, 800)).toBeCloseTo(sliceWheelImpulse(100, 0, 800));
    expect(sliceWheelImpulse(0.125, 2, 800)).toBeCloseTo(sliceWheelImpulse(100, 0, 800));
    expect(sliceWheelImpulse(100000, 0, 800)).toBeLessThanOrEqual(8);
  });
  it('一次滚轮输入后仍逐帧滑行，30/60/120Hz 的落点一致并停在边界', () => {
    const run = (hz: number) => {
      let state = { focus: 6, velocity: sliceWheelImpulse(100, 0, 800) };
      for (let i = 0; i < hz; i++) state = coastSliceWheel(state.focus, state.velocity, 1 / hz, 57);
      return state;
    };
    const at60 = run(60);
    expect(at60.focus).toBeGreaterThan(6.6);
    expect(at60.velocity).toBeLessThan(0.2);
    expect(run(30).focus).toBeCloseTo(at60.focus, 5);
    expect(run(120).focus).toBeCloseTo(at60.focus, 5);
    expect(coastSliceWheel(56, 6, 0.1, 57)).toEqual({ focus: 56, velocity: 0 });
  });
  it('键盘导航意图只消费一次，灯箱归还焦点不会再次居中', () => {
    let intent = focusIntent('Tab');
    intent = focusIntent('focus', intent.pending);
    expect(intent.center).toBe(true);
    expect(intent.pending).toBe(false);
    intent = focusIntent('key', intent.pending); // 方向键平移、Enter 打开、Esc 关闭。
    intent = focusIntent('focus', intent.pending); // 灯箱程序化归还焦点。
    expect(intent.center).toBe(false);
    expect(focusIntent('focus', focusIntent('pointer', true).pending).center).toBe(false);
  });
  it('当前片正对镜头，前后片沿原顺序分开并退入纵深', () => {
    expect(slicePose(5, 5)).toMatchObject({ x: 0, y: 0, z: 0, rotateY: 0, visible: true });
    expect(slicePose(4, 5).x).toBeLessThan(0);
    expect(slicePose(6, 5).x).toBeGreaterThan(0);
    expect(slicePose(4, 5).z).toBeLessThan(0);
    expect(slicePose(6, 5).z).toBeLessThan(0);
    expect(slicePose(10, 5).visible).toBe(false);
  });
  it('远端切片在离开视野前透明度降至零，重新进入时从零渐显', () => {
    expect(slicePose(5, 5).opacity).toBe(1);
    expect(slicePose(7, 5).opacity).toBeCloseTo(1);
    expect(slicePose(8, 5).opacity).toBeGreaterThan(0);
    expect(slicePose(8, 5).opacity).toBeLessThan(1);
    expect(slicePose(8.8, 5).opacity).toBe(0);
    expect(slicePose(8.8, 5).visible).toBe(false);
  });
  it('空册、单张、两端和异常输入不会越界', () => {
    expect(clampFocus(100, 0)).toBe(0);
    expect(clampFocus(100, 1)).toBe(0);
    expect(clampFocus(-2, 57)).toBe(0);
    expect(clampFocus(90, 57)).toBe(56);
    expect(clampFocus(NaN, 57)).toBe(0);
    expect(clampFocus(3.5, 57)).toBe(3.5);
    const camera = clampCamera({ x: Infinity, y: NaN, scale: -1 }, { x: 1000, y: 800 });
    expect(Number.isFinite(camera.x + camera.y + camera.scale)).toBe(true);
    expect(camera.scale).toBeGreaterThan(0);
  });
  it('以指针为中心缩放保持该处世界坐标不动，缩放有上下限', () => {
    const camera = { x: 20, y: -30, scale: 0.7 };
    const point = { x: 120, y: 70 };
    const zoomed = zoomAt(camera, point, 1.3);
    expect(zoomed.scale).toBeCloseTo(0.91);
    expect((point.x - zoomed.x) / zoomed.scale).toBeCloseTo((point.x - camera.x) / camera.scale);
    expect((point.y - zoomed.y) / zoomed.scale).toBeCloseTo((point.y - camera.y) / camera.scale);
    expect(zoomAt(camera, point, 100).scale).toBe(1.6);
    expect(zoomAt(camera, point, 0).scale).toBe(0.25);
  });
});

describe('生成地址不复用旧照片的长缓存', () => {
  it('相同字节地址稳定，换内容或编码设置产生新地址', () => {
    const a = Buffer.from([255, 0, 1, 2, 3]);
    const b = Buffer.from([255, 0, 1, 2, 4]);
    const name = galleryFileName(1, 800, a);
    expect(galleryFileName(1, 800, a)).toBe(name);
    expect(galleryFileName(1, 800, b)).not.toBe(name);
    expect(galleryFileName(1, 800, a, 2)).not.toBe(name);
    expect(galleryFileName(1, 800, a, 1, 80)).not.toBe(name);
    expect(name).toMatch(/^01-[a-f0-9]{12}-800\.webp$/);
  });
  it('中间插图后，即使序号相同，也不能命中之前另一张照片的 URL', () => {
    const before = [Buffer.from('图一'), Buffer.from('图二')].map((bytes, i) => galleryFileName(i + 1, 800, bytes));
    const after = [Buffer.from('图一'), Buffer.from('插图'), Buffer.from('图二')].map((bytes, i) => galleryFileName(i + 1, 800, bytes));
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).not.toBe(before[1]);
  });
});
