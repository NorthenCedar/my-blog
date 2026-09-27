/**
 * 日志页的排序（2026-09-27 站主："日志里面不光要按日期来排，同一天版本号也排序排好了"）。
 *
 * 抽成独立模块而不是写在 log.astro 里，是为了**能被断言**：
 * 版本号这种东西很容易被"字符串比较"蒙对一两次（v1.9 vs v1.10 就露馅），必须用数值比较。
 *
 * 两条规则：
 *   ① 日期倒序（新的在上，与页面 intro 里写的"新的在上面"一致）；
 *   ② 同一天按**版本号倒序**（v1.3 → v1.2 → v1.1），方向与日期一致。
 *
 * ⚠️ 之前踩的两个坑（都在这里修掉）：
 *   · YAML 里未加引号的 `date: 2026-09-26` 会被解析成 **Date 对象**，而 `String(date)` 得到的是
 *     "Sat Sep 26 2026 …" —— **星期名在最前面** ⇒ 拿它做字典序比较，排出来的日期是随机的 ✗。
 *     所以先统一成 ISO（`YYYY-MM-DD`）再比。
 *   · 同日没有兜底比较时，比较器对"相等"返回 -1 ⇒ 排序会把同一天的顺序**整体翻过来** ✗
 *     （站主截图里 v1.1 跑到 v1.3 上面，就是这个原因）。
 */
export interface LogItem {
  date: string | Date;
  version?: string;
  changes?: string[];
}

/** YAML 会把未加引号的日期解析成 Date 对象（站上同一条约定见 src/lib/schema.ts） */
export const isoDate = (v: string | Date): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v);

/** 把 `v1.10` 解析成 [1, 10]（数值比较；`v` 前缀可有可无，缺位补 0） */
export const versionKey = (v?: string): number[] =>
  String(v ?? '')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);

/** 日期倒序、同日版本号倒序；两项都缺失版本号时保持原相对顺序（返回 0） */
export function sortLogItems<T extends LogItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const da = isoDate(a.date);
    const db = isoDate(b.date);
    if (da !== db) return da < db ? 1 : -1;
    const va = versionKey(a.version);
    const vb = versionKey(b.version);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const x = va[i] ?? 0;
      const y = vb[i] ?? 0;
      if (x !== y) return y - x;
    }
    return 0;
  });
}
