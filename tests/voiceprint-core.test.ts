/* 留言页声纹带 VOICEPRINT · 纯函数核心的契约（2026-10-14）
 *
 * 这是整台装置**唯一真源**：分桶 / 权重 / 归一化 / 包络 / 时间刻度全在这里，
 * 零 DOM、零随机 ⇒ 同输入两次逐点相同（站内形状类验收的唯一可信手段，见
 * AGENTS §5「给要反复调参的视觉形状引入 Math.random」）。
 *
 * ★ 尺寸口径是 spec §6.78.3 定死的初值，改之前门闩会红：
 *   分桶 ≤90 天按天 / ≤730 天按周 / 其后按月 · 一条回复 = 200 字 · 峰值恒为 1。
 */
import { describe, it, expect } from 'vitest';
import {
  pickUnit, weightOf, bucketize, normalize, envelope, ticks, toNotes,
  type Note, type Bin,
} from '../src/scripts/voiceprint-core';

const DAY = 86400000;
const note = (id: number, createdAt: string, body = '字', isReply = false): Note =>
  ({ id, createdAt, body, isReply });
const bin = (weight: number, start = 0): Bin => ({ start, end: start + 1, weight, replies: 0, notes: 1 });

describe('留言页声纹带 · 纯函数核心', () => {
  it('分桶粒度按跨度自适应，边界卡死在 90 天与 730 天', () => {
    expect(pickUnit(0), '跨度 0 也走按天，不许除零').toBe('day');
    expect(pickUnit(90)).toBe('day');
    expect(pickUnit(91), '过了 90 天就该升到按周').toBe('week');
    expect(pickUnit(730)).toBe('week');
    expect(pickUnit(731), '过了 730 天就该升到按月').toBe('month');
    expect(pickUnit(4000)).toBe('month');
    expect(pickUnit(-5), '负跨度（脏数据）退回最细的粒度').toBe('day');
  });

  it('权重 = 顶层留言字数 + 回复 × 200；空输入是 0', () => {
    expect(weightOf([])).toBe(0);
    expect(weightOf([note(1, '2026-01-01T00:00:00Z', 'ab')])).toBe(2);
    expect(weightOf([note(1, '2026-01-01T00:00:00Z', ''), note(2, '2026-01-01T00:00:00Z', '', true)]))
      .toBe(200);
    /* ★ 一条回复要和一段长留言量级相当 —— 这正是 200 这个数的来处：
       留言框上限 1000 字，回复框通常只有一句话。 */
    expect(weightOf([note(1, '2026-01-01T00:00:00Z', '', true)]))
      .toBe(weightOf([note(2, '2026-01-01T00:00:00Z', 'x'.repeat(200))]));
  });

  it('空册返回空桶；所有留言同一天时落到单桶而不是除零', () => {
    expect(bucketize([], 30)).toEqual([]);
    const sameDay = [
      note(1, '2026-01-01T10:00:00Z', 'a'),
      note(2, '2026-01-01T20:00:00Z', 'bb'),
    ];
    const bins = bucketize(sameDay, 0);
    expect(bins, '同一天不该切出一堆空桶').toHaveLength(1);
    expect(bins[0].notes).toBe(2);
    expect(bins[0].weight).toBe(3);
    expect(Number.isFinite(bins[0].start + bins[0].end)).toBe(true);
  });

  it('孤儿回复（没有对应的顶层留言）不炸：照样进桶，replies 单独计数', () => {
    const orphan = [note(9, '2026-02-02T10:00:00Z', '回', true)];
    const bins = bucketize(orphan, 30);
    expect(bins).toHaveLength(1);
    expect(bins[0].replies, '回复数要单独留痕，不能混进 notes').toBe(1);
    expect(bins[0].notes).toBe(0);
  });

  it('时间乱序、脏时间串都不许让桶结构崩掉', () => {
    const messy = [
      note(1, '2026-03-05T00:00:00Z', '晚'),
      note(2, '2026-01-05T00:00:00Z', '早'),
      note(3, '不是时间', '脏'),
    ];
    const bins = bucketize(messy, 120);
    expect(bins.length).toBeGreaterThan(0);
    for (const b of bins) {
      expect(Number.isFinite(b.start + b.end + b.weight + b.replies + b.notes)).toBe(true);
    }
    /* 桶必须按时间递增，且不重叠 —— 波形的横轴才有意义 */
    for (let i = 1; i < bins.length; i++) {
      expect(bins[i].start).toBeGreaterThanOrEqual(bins[i - 1].end);
    }
  });

  it('归一化后峰值恒为 1（2 条与 2000 条同尺度）；全零与空输入不崩', () => {
    expect(normalize([bin(2), bin(8), bin(6)])).toEqual([0.25, 1, 0.75]);
    expect(normalize([bin(0), bin(0)])).toEqual([0, 0]);
    expect(normalize([])).toEqual([]);
    const many = Array.from({ length: 2000 }, (_, i) => bin(i === 1234 ? 9999 : 1));
    expect(Math.max(...normalize(many)), '峰值必须恒为 1，不随总量漂移').toBe(1);
  });

  it('包络是留言数据的确定函数：同输入两次逐点相同、值域落在 0..1', () => {
    const notes = Array.from({ length: 57 }, (_, i) =>
      note(i + 1, new Date(Date.UTC(2026, 0, 1) + i * DAY).toISOString(), 'x'.repeat(i % 7 + 1)));
    const bins = bucketize(notes, 57);
    const a = envelope(bins, 120);
    expect(envelope(bins, 120), '★ 零随机：同输入必须逐点相同').toEqual(a);
    expect(a).toHaveLength(120);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    expect(envelope([], 10), '空册不许返回 NaN').toEqual(new Array(10).fill(0));
  });

  it('时间刻度随粒度换措辞，且落在桶的时间范围内', () => {
    const notes = [note(1, '2026-01-01T00:00:00Z', 'a'), note(2, '2026-03-01T00:00:00Z', 'b')];
    const dayTicks = ticks(bucketize(notes, 60), 'day');
    const monthTicks = ticks(bucketize(notes, 60), 'month');
    expect(dayTicks.length).toBeGreaterThan(0);
    expect(monthTicks.length).toBeGreaterThan(0);
    for (const t of [...dayTicks, ...monthTicks]) {
      expect(typeof t.label).toBe('string');
      expect(t.label).not.toBe('');
      expect(Number.isFinite(t.at)).toBe(true);
    }
    /* 标签不许是 "Invalid Date" 这类脏东西 */
    expect(dayTicks.map((t) => t.label).join('')).not.toMatch(/Invalid|NaN|undefined/);
    expect(ticks([], 'day')).toEqual([]);
  });

  it('toNotes 把接口的两张表摊平成一维：回复带 isReply，顶层不带', () => {
    const notes = toNotes(
      [{ id: 1, createdAt: '2026-01-01T00:00:00Z', body: '甲' },
       { id: 2, createdAt: '2026-01-02T00:00:00Z', body: '乙' }],
      [{ id: 3, parentId: 1, createdAt: '2026-01-03T00:00:00Z', body: '回' }],
    );
    expect(notes).toHaveLength(3);
    expect(notes.filter((n) => n.isReply).map((n) => n.id)).toEqual([3]);
    expect(notes.filter((n) => !n.isReply).map((n) => n.id)).toEqual([1, 2]);
    expect(weightOf(notes), '总权重 = 两个顶层留言 + 一条回复 200 字').toBe(1 + 1 + 200);
    expect(toNotes([], []), '空册摊平后是空数组').toEqual([]);
  });

  it('toNotes 保留字段原样：不裁 body、不改时间串（读数要靠它说话）', () => {
    const long = 'x'.repeat(1000);
    const [n] = toNotes([{ id: 9, createdAt: '2026-05-05T05:05:05.000Z', body: long }], []);
    expect(n.body).toHaveLength(1000);
    expect(n.createdAt).toBe('2026-05-05T05:05:05.000Z');
  });
});