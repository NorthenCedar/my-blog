import { describe, expect, it } from 'vitest';
import { PleatWaves, createPleats, updatePleats, projectPleatPoint, hitPleats } from '../src/scripts/pleated-core';

describe('百褶无限环 · 单向纵波', () => {
  it('只向弧长增加的方向传播，不向起点两侧同时扩散', () => {
    const waves = new PleatWaves();
    waves.trigger(0.3, 0);
    expect(waves.sample(0.34, 0.4).green).toBeGreaterThan(0.2);
    expect(waves.sample(0.26, 0.4).green).toBe(0);
    expect(waves.sample(0.5, 0.4).green).toBe(0);
    expect(waves.sample(0.34, 1.5).green).toBe(0);
    expect(waves.sample(0.56, 1.5).green).toBeGreaterThan(0.2);
  });

  it('经过闭合接缝仍同向，绕行一次后消散', () => {
    const waves = new PleatWaves();
    waves.trigger(0.97, 0);
    expect(waves.sample(0.01, 0.4).green).toBeGreaterThan(0.2);
    expect(waves.sample(0.93, 0.4).green).toBe(0);
    waves.prune(7);
    expect(waves.activeCount).toBe(0);
    expect(waves.sample(0.01, 7)).toEqual({ offset: 0, green: 0 });
  });

  it('同一波包内同时有压缩与伸展，绿色局限于正在振动的区域', () => {
    const waves = new PleatWaves();
    waves.trigger(0, 0);
    const samples = Array.from({ length: 80 }, (_, i) => waves.sample(i / 400, 0.8));
    expect(Math.max(...samples.map(s => s.offset))).toBeGreaterThan(0.001);
    expect(Math.min(...samples.map(s => s.offset))).toBeLessThan(-0.001);
    expect(waves.sample(0.5, 0.8)).toEqual({ offset: 0, green: 0 });
  });

  it('连续点击数量有上限，合成位移和色彩不会无限累积', () => {
    const waves = new PleatWaves();
    for (let i = 0; i < 100; i++) waves.trigger(i / 100, i * 0.2);
    expect(waves.activeCount).toBeLessThanOrEqual(4);
    for (let i = 0; i < 100; i++) {
      const sample = waves.sample(i / 100, 20);
      expect(Math.abs(sample.offset)).toBeLessThanOrEqual(0.0033);
      expect(sample.green).toBeGreaterThanOrEqual(0);
      expect(sample.green).toBeLessThanOrEqual(1);
    }
    waves.clear();
    expect(waves.activeCount).toBe(0);
  });

  it('位移平行于局部切线；同一时间的几何不依赖帧率', () => {
    const pleats = createPleats(108), waves = new PleatWaves();
    waves.trigger(0, 0);
    const rest = updatePleats(pleats, 0.8, new PleatWaves()).slice();
    const active = updatePleats(pleats, 0.8, waves).slice();
    for (let i = 0; i < pleats.bases.length; i++) {
      const at = i * 36 * 7, t = pleats.bases[i].tangent;
      const d = [0, 1, 2].map(k => active[at + k] - rest[at + k]);
      const cross = [d[1] * t[2] - d[2] * t[1], d[2] * t[0] - d[0] * t[2], d[0] * t[1] - d[1] * t[0]];
      expect(Math.hypot(...cross)).toBeLessThan(0.000001);
    }
    for (let frame = 0; frame <= 48; frame++) updatePleats(pleats, frame / 60, waves);
    expect(Array.from(pleats.vertices)).toEqual(Array.from(active));
  });

  it('点击实际薄片能命中，环外空白不能误触', () => {
    const pleats = createPleats(108);
    updatePleats(pleats, 0, new PleatWaves());
    const p = projectPleatPoint(pleats.bases[27].center, 1000, 600);
    expect(hitPleats(pleats, p[0], p[1], 1000, 600)).not.toBeNull();
    expect(hitPleats(pleats, 5, 5, 1000, 600)).toBeNull();
  });
});
