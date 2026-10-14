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
  pickUnit, weightOf, bucketize, normalize, envelope, ticks, toNotes, SHAPE_GAMMA, bucketAt, fmtAt,
  type Note, type Bin,
} from '../src/scripts/voiceprint-core';

const DAY = 86400000;
const note = (id: number, createdAt: string, body = '字', isReply = false): Note =>
  ({ id, createdAt, body, isReply });
const bin = (weight: number, start = 0): Bin => ({ start, end: start + 1, weight, replies: 0, notes: 1 });

describe('留言页声纹带 · 纯函数核心', () => {
  it('分桶粒度按跨度自适应，边界卡死在 90 天与 730 天', () => {
    expect(pickUnit(4000)).toBe('month');
    expect(pickUnit(731), '过了 730 天就该升到按月').toBe('month');
    expect(pickUnit(730)).toBe('week');
    expect(pickUnit(91), '过了 90 天就该升到按周').toBe('week');
    expect(pickUnit(90)).toBe('day');
    expect(pickUnit(2)).toBe('day');
  });

  it('★★ 跨度不足一天时按小时/分钟切 —— 同日多条不许被并成一个桶', () => {
    /* ★★ 2026-10-14 线上实况：留言页当时只有 2 条留言、且是**同一天**（相隔 10.6 小时）。
       粒度下限原本是"天" ⇒ 两条被并进同一个桶 ⇒ 归一化后每点都是 1
       ⇒ 屏幕上是一条**水平线**，"有两条留言"这个信息整个丢掉。
       ⇒ 站的留言稀疏，"同日多条"是常态而不是边角，粒度必须细到分钟/小时。 */
    expect(pickUnit(1.5), '超过一天半才按天').toBe('day');
    expect(pickUnit(1), '★ 正好一天也要按小时：00:00 与 24:00 的两条按天分桶仍会并成一个桶').toBe('hour');
    expect(pickUnit(0.5), '半天 ⇒ 按小时').toBe('hour');
    expect(pickUnit(10.6 / 24), '10.6 小时 ⇒ 按小时').toBe('hour');
    expect(pickUnit(1 / 60 / 24), '一小时以内 ⇒ 按分钟').toBe('minute');
    expect(pickUnit(0), '跨度 0 也得有粒度').toBe('minute');
    expect(pickUnit(-5), '负跨度（脏数据）退回最细的粒度').toBe('minute');

    /* ★ 真实的两天前那两条：必须落进**两个不同的桶**。 */
    const sameDay = [
      note(1, '2026-09-26T17:20:00.000Z', '一'),   // 本地 09-27 01:20
      note(2, '2026-09-27T03:59:00.000Z', 'x'.repeat(40)),  // 本地 09-27 11:59
    ];
    const spanDays = (Date.parse(sameDay[1].createdAt) - Date.parse(sameDay[0].createdAt)) / 86400000;
    const bins = bucketize(sameDay, spanDays);
    expect(bins.length, '同日两条被并成一个桶了 ⇒ 波形会退化成一条水平线').toBeGreaterThan(1);
    expect(bins.filter((b) => b.weight > 0).length, '两条落在了同一个桶里').toBe(2);
    /* 而且归一化后必须有高低差 —— 否则屏幕上还是一条线。 */
    const v = normalize(bins);
    expect(Math.max(...v), '峰值没有顶到 1').toBe(1);
    expect(Math.min(...v), '全是同一个值 ⇒ 还是一条水平线').toBeLessThan(1);
  });

it('★★ 游标定位：指针 x → 桶下标，与波形同一个坐标系', () => {
    /* 悬停游标（2026-10-14 §6.80.2）要靠它。★ 关键性质：**越界要夹住**，
       指针在版心左右两侧时游标不会跑出波形带 —— 那正是「波形与游标对不上」的成因。 */
    const L = 100, W = 400;                 // 波形带：左缘 100、宽 400
    expect(bucketAt(L, L, W, 9), '正左缘 = 第一个桶').toBe(0);
    expect(bucketAt(L + W, L, W, 9), '正右缘 = 最后一个桶').toBe(8);
    expect(bucketAt(L + W / 2, L, W, 9), '正中落在中间那一桶').toBe(4);
    expect(bucketAt(L - 500, L, W, 9), '越到左外侧 ⇒ 夹到第一个，不得返回负数').toBe(0);
    expect(bucketAt(L + W + 500, L, W, 9), '越到右外侧 ⇒ 夹到最后一个').toBe(8);

    /* ★ 退化输入：一个桶（只有一条留言时）必须是 0，而不是除零出 NaN。
       站内栽过同族：跨度 0 时公式除零 ⇒ 一条 NaN 路径 ⇒ 什么都画不出来。 */
    expect(bucketAt(200, L, W, 1), '只有一个桶时恒为 0').toBe(0);
    expect(bucketAt(200, L, W, 0), '零个桶不得出 NaN').toBe(0);
    expect(bucketAt(200, L, 0, 9), '带宽 0 不得除零').toBe(0);
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(bucketAt(bad, L, W, 9), `脏输入 ${bad} 出了非有限值`).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(bucketAt(bad, L, W, 9))).toBe(true);
    }
  });

  it('★ 时刻标签：刻度与游标读数必须说同一句话', () => {
    /* ★ 抽出来的原因：2026-10-14 刻度用 UTC、读数用本地，同一条留言在轴上
       写成「9月26日」、在读数里是「2026.09.27」。两处各写一份格式，早晚会再说岔。 */
    const t = Date.parse('2026-09-26T17:20:00.000Z');
    const d = new Date(t);
    /* 带日期的档：标签里必须能读出本地日期。★ `minute` 档**不带**日期 ——
       它的跨度 < 1 小时，刻度又密（每档要 6 个），挂上「9月27日 01:20」会挤成一团。
       跨天那种边角由读数那行的起止日期兜住（它本来就写全了）。 */
    for (const unit of ['hour', 'day', 'week'] as const) {
      expect(fmtAt(t, unit), `${unit} 档的标签与本地日期对不上`)
        .toContain(`${d.getMonth() + 1}月${d.getDate()}日`);
    }
    /* `month` 档只到年月（`2026.09`），`minute` 档只到时刻（`01:20`）——
       两者的"更粗"是刻度密度决定的，各自单独立断言。 */
    for (const unit of ['minute', 'hour', 'day', 'week', 'month'] as const) {
      expect(fmtAt(t, unit), `${unit} 档出现了 Invalid/NaN`).not.toMatch(/Invalid|NaN/);
    }
    expect(fmtAt(t, 'month')).toMatch(/^\d{4}\.\d{2}$/);
    expect(fmtAt(t, 'minute')).toMatch(/^\d{2}:\d{2}$/);
    expect(fmtAt(t, 'hour')).toMatch(/时$/);
  });

  it('★ 五档桶数上界 < 200 —— 这是「240 个采样点够用」的依据', () => {
    /* ★ 2026-10-14 记一笔反面教材：我一度给 `envelope` 加了"采样数不得少于桶数"的补丁，
       理由写的是"两条相隔 10 小时的留言会造出 600 个桶"——**那个数是错的**。
       逐档实测才发现粒度是自适应下界，桶数有硬上界：
         跨度 ≤1 时⇒分钟桶 ≤ 60 · ≤1 天⇒小时桶 ≤ 25 · ≤90 天⇒天桶 ≤ 91
         ≤730 天⇒周桶 ≤ 105 · 更长⇒月桶 = 跨度/30
       ⇒ 补丁是**死分支**，被它"解释"的那个场景压根不存在（AGENTS 那条：
       以为测试有洞，其实是在补一个不存在的场景）。已撤。
       ★ 这条断言现在就是那道上界的护栏：哪天有人把粒度改细、桶数越过 200，它先红。 */
    const DAY = 86400000;
    for (const days of [0.01, 0.44, 1, 45, 90, 730, 2000, 3650]) {
      const pair = [
        note(1, new Date(Date.now() - days * DAY).toISOString(), '一'),
        note(2, new Date().toISOString(), 'x'.repeat(40)),
      ];
      const bins = bucketize(pair, days);
      expect(bins.length, `跨度 ${days} 天产生了 ${bins.length} 个桶，越过上界`).toBeLessThan(200);
    }
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

  it('空册返回空桶；跨度为 0 不除零、同日每条各占一个非空桶', () => {
    expect(bucketize([], 30)).toEqual([]);
    const sameDay = [
      note(1, '2026-01-01T10:00:00Z', 'a'),
      note(2, '2026-01-01T20:00:00Z', 'bb'),
    ];
    const bins = bucketize(sameDay, 0);
    expect(bins.length, '跨度 0 却一个桶都没有').toBeGreaterThan(0);
    expect(Number.isFinite(bins[0].start + bins[0].end + bins[0].weight)).toBe(true);
    /* ★ 跨度 0 现在走"按分钟"，桶会很多 —— 但**有留言的桶必须正好两条**，
       空的桶只是那段没人的时间（它们在波形上是 0，不是被抹掉）。 */
    const filled = bins.filter((b) => b.weight > 0);
    expect(filled.length, '同一天的每条留言都该占一个非空桶').toBe(2);
    expect(filled.reduce((n, b) => n + b.notes, 0)).toBe(2);
    expect(filled.reduce((n, b) => n + b.weight, 0)).toBe(3);
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

  it('★★ 小值开个方：短包抬得起来，但仍然是归一化的（站主 2026-10-14 定的观感）', () => {
    /* 站主的留言页当时只有 2 条：33 字与 4 字，相隔 10.6 小时。
       线性归一化下 4 字那条只有 0.12 高度（≈3.5px）⇒ 屏幕上几乎看不见 ——
       那个"峰值恒为 1"是对的，但直接拿去画就丢掉了"那里也有一条留言"这个信息。
       ⇒ 显示上开一个 0.6 次方。★ 只动**显示**，不动归一化：normalize 仍是线性的、
       峰值仍恒为 1（上面那条测试钉着），开方发生在包络里。 */
    expect(SHAPE_GAMMA, 'gamma 必须在 (0,1)：≥1 只会把高包抬得更高').toBeGreaterThan(0);
    expect(SHAPE_GAMMA, 'gamma ≥1 方向就反了').toBeLessThan(1);
    expect(Math.abs(SHAPE_GAMMA - 0.6), '站主定的是 0.6；改它要重新目检').toBeLessThan(1e-9);

    const bins: Bin[] = [
      { start: 0, end: 1, weight: 4, replies: 0, notes: 1 },
      { start: 1, end: 2, weight: 33, replies: 0, notes: 1 },
    ];
    const linear = normalize(bins);          // [0.121, 1]
    const shaped = envelope(bins, 2);
    expect(shaped[0], '短包没有比线性更矮（说明没开方）').toBeGreaterThan(linear[0]);
    expect(shaped[0], '短包仍然可见性不足，0.6 开方约应到 0.28').toBeGreaterThan(0.2);
    expect(shaped[1], '峰值仍然是 1').toBeCloseTo(1, 6);
    /* 值域必须仍在 0..1 —— 开方不会越界。 */
    expect(Math.min(...shaped)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...shaped)).toBeLessThanOrEqual(1);
    /* 确定性照旧。 */
    expect(envelope(bins, 2)).toEqual(shaped);
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

  it('★★ 刻度日期用**本地时区**，与读数那一行说的是同一个日期', () => {
    /* ★ 2026-10-14 线上实况：刻度原本用 getUTCDate()、读数用本地时间 ——
       本地 09-27 凌晨的留言（= UTC 09-26 17:20）在轴上被写成「9月26日」，
       在读数里却是「2026.09.27」。同一个日期说成两个，读者无法对账。
       ★ 判据不写死某个日期，而是"刻度标签里的日期 == new Date(同一时刻).getMonth()+1月getDate()日"，
         这样判据与本机时区无关。 */
    const bins = bucketize([note(1, '2026-09-26T17:20:00.000Z', '一')], 0.01);
    const [t0] = ticks(bins, 'hour');
    const d = new Date(bins[0].start);
    expect(t0.label, '刻度用的不是本地日期').toContain(`${d.getMonth() + 1}月${d.getDate()}日`);
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