import { describe, expect, it } from 'vitest';
import { isoDate, sortLogItems, versionKey } from '../src/lib/log-order';

/**
 * 日志页排序（站主 2026-09-27："日志里面不光要按日期来排，同一天版本号也排序排好了"）。
 * 抽成 src/lib/log-order.ts 就是为了能在这一层断言 —— 版本号这种东西必须**数值**比较，
 * 字符串比较会蒙对一两次然后出错（v1.10 vs v1.9 就露馅）。
 */
describe('日志排序 log-order', () => {
  it('版本号按数值解析（v1.10 要大于 v1.9）', () => {
    expect(versionKey('v1.10')).toEqual([1, 10]);
    expect(versionKey('1.2')).toEqual([1, 2]);
    expect(versionKey(undefined)).toEqual([0]);
  });

  it('YAML 未加引号的日期会变成 Date 对象 ⇒ 先标准化成 ISO 再比', () => {
    // 旧实现用 String(Date)，得到 "Sat Sep 26 2026 …"（星期名在最前）⇒ 字典序比较的结果是随机的
    expect(isoDate(new Date('2026-09-26T00:00:00Z'))).toBe('2026-09-26');
    expect(isoDate('2026-09-26')).toBe('2026-09-26');
  });

  it('日期倒序、同一天版本号也倒序（v1.10 → v1.9 → v1.2 → v1.1）', () => {
    const out = sortLogItems([
      { date: '2026-09-25', version: 'v1.0' },
      { date: '2026-09-26', version: 'v1.2' },
      { date: '2026-09-26', version: 'v1.10' },
      { date: '2026-09-26', version: 'v1.9' },
      { date: '2026-09-26', version: 'v1.1' },
    ]).map((x) => x.version);
    expect(out).toEqual(['v1.10', 'v1.9', 'v1.2', 'v1.1', 'v1.0']);
  });

  it('输入顺序打乱也一样（比较器不能依赖原顺序 —— 旧实现同日恒返回 -1，会把同一天整体翻过来）', () => {
    const shuffled = [
      { date: new Date('2026-09-26T00:00:00Z'), version: 'v1.1' },
      { date: new Date('2026-09-25T00:00:00Z'), version: 'v1.0' },
      { date: new Date('2026-09-26T00:00:00Z'), version: 'v1.3' },
      { date: new Date('2026-09-26T00:00:00Z'), version: 'v1.2' },
    ];
    expect(sortLogItems(shuffled).map((x) => x.version)).toEqual(['v1.3', 'v1.2', 'v1.1', 'v1.0']);
  });

  it('不修改传入数组（纯函数）', () => {
    const raw = [{ date: '2026-09-25', version: 'v1.0' }, { date: '2026-09-26', version: 'v1.1' }];
    const copy = [...raw];
    sortLogItems(raw);
    expect(raw).toEqual(copy);
  });
});
