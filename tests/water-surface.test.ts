import { describe, it, expect } from 'vitest';
import { WaterSurface } from '../src/scripts/water-core';

const peak = (values: Float32Array) => values.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('留言页浅水 · 连续波面', () => {
  it('静止水面没有波纹；轨迹中间也受扰动，快速划过不会断成散点', () => {
    const water = new WaterSurface(96, 64);
    expect(water.advance(16)).toBe(false);
    water.disturb(20, 32, 70, 32, 0.5);
    expect(Math.abs(water.values[32 * 96 + 45])).toBeGreaterThan(0.1);
    expect(water.advance(16)).toBe(true);
  });

  it('波会传播到笔触以外，并出现波峰和波谷', () => {
    const water = new WaterSurface(96, 64);
    water.disturb(46, 32, 49, 32, 0.8);
    expect(water.values[32 * 96 + 59]).toBe(0);
    for (let i = 0; i < 25; i++) water.advance(1000 / 60);
    expect(Math.abs(water.values[32 * 96 + 59])).toBeGreaterThan(0.001);
    expect(Math.min(...water.values)).toBeLessThan(-0.001);
    expect(Math.max(...water.values)).toBeGreaterThan(0.001);
  });

  it('两道波相遇会叠加，不能只是两段互不相关的圆圈', () => {
    const a = new WaterSurface(96, 64);
    const b = new WaterSurface(96, 64);
    const both = new WaterSurface(96, 64);
    a.disturb(37, 32, 40, 32, 0.2);
    b.disturb(54, 32, 57, 32, 0.2);
    both.disturb(37, 32, 40, 32, 0.2);
    both.disturb(54, 32, 57, 32, 0.2);
    for (let i = 0; i < 20; i++) { a.advance(1000 / 60); b.advance(1000 / 60); both.advance(1000 / 60); }
    const middle = 32 * 96 + 48;
    expect(Math.abs(a.values[middle])).toBeGreaterThan(0.001);
    expect(Math.abs(b.values[middle])).toBeGreaterThan(0.001);
    expect(both.values[middle]).toBeCloseTo(a.values[middle] + b.values[middle], 5);
  });

  it('相同经过时间在不同帧率下得到相同波面', () => {
    const a = new WaterSurface(96, 64);
    const b = new WaterSurface(96, 64);
    for (const water of [a, b]) water.disturb(24, 32, 68, 32, 0.5);
    for (let i = 0; i < 60; i++) a.advance(1000 / 60);
    for (let i = 0; i < 30; i++) b.advance(1000 / 30);
    expect(peak(a.values)).toBeGreaterThan(0.001);
    expect(a.values).toEqual(b.values);
  });

  it('停下后渐隐并彻底归零，再次经过能唤醒', () => {
    const water = new WaterSurface(96, 64);
    water.disturb(20, 32, 70, 32, 0.5);
    for (let i = 0; i < 210; i++) water.advance(1000 / 60);
    expect(water.opacity).toBeGreaterThan(0);
    expect(water.opacity).toBeLessThan(0.5);
    for (let i = 0; i < 40; i++) water.advance(1000 / 60);
    expect(water.advance(16)).toBe(false);
    expect(peak(water.values)).toBe(0);
    water.disturb(20, 32, 22, 32, 0.5);
    expect(water.advance(16)).toBe(true);
    water.clear();
    expect(peak(water.values)).toBe(0);
  });

  it('反复扰动仍有界，边缘吸收，非法坐标不污染水面', () => {
    const water = new WaterSurface(96, 64);
    for (let i = 0; i < 240; i++) {
      water.disturb(4, 32, 90, 32, 3);
      water.advance(1000 / 60);
    }
    expect(water.values.every(Number.isFinite)).toBe(true);
    expect(peak(water.values)).toBeLessThanOrEqual(3);
    expect(water.values[0]).toBe(0);
    water.clear();
    water.disturb(NaN, 32, 30, 32, 0.5);
    water.disturb(10, 32, Infinity, 32, 0.5);
    expect(peak(water.values)).toBe(0);
  });
});
