import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as T from '../src/lib/boot-tracks';

/**
 * **抄写校对**：把 `src/lib/boot-tracks.ts` 里的表逐值对回上游源码镜像 `_tmp-rlui/`。
 *
 * 为什么值得写：工单 §3 的价值全在"数值没抄错"。手抄 250 个数，最可能的失败模式就是某一位数字写歪，
 * 而它不会让任何东西报错 —— 只会让某一帧的画面对不上。这条断言把「我说我抄对了」换成「逐值比过」。
 *
 * 边界（写清楚，别误读）：
 *   · 它验的是**我们抄得像不像上游**，**不验**上游本身对不对（那是 #18「以代码为准」的前提）。
 *   · 镜像 `_tmp-rlui/` 是探索产物，按 #26 交付后要清掉 ⇒ 本组断言**自动跳过**，
 *     它是这一轮的校对工具，不是长期回归网（唯一真源始终是 boot-tracks.ts）。
 */
const MIRROR = '_tmp-rlui/src';
const hasMirror = existsSync(`${MIRROR}/boot-tracks.ts`) && existsSync(`${MIRROR}/boot-logo-tracks.ts`);

const nums = (s: string): number[] => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
const flat = (rows: readonly (readonly number[])[]): number[] => rows.flatMap((r) => [...r]);

/** 抠出上游 `const NAME = [ ... ];`（含 `: readonly Key[]` 注解与 `as const` 断言）里的全部数字 */
function constArray(src: string, name: string): number[] {
  const m = src.match(new RegExp(`const\\s+${name}\\s*(?::[^=]*)?=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as const)?;`));
  if (!m) throw new Error(`上游源码里找不到 const ${name}`);
  return nums(m[1]);
}
/** 抠出上游 `NAME: track([ ... ], frame)` 里的数字（上游这张表跨行书写，`track(` 与 `[` 之间可能有换行） */
function trackArray(src: string, name: string): number[] {
  const m = src.match(new RegExp(`${name}:\\s*track\\(\\s*\\[([\\s\\S]*?)\\]\\s*,\\s*frame\\s*,?\\s*\\)`));
  if (!m) throw new Error(`上游源码里找不到 ${name}: track([...], frame)`);
  return nums(m[1]);
}
/** 抠出 boot-tracks.ts 里第 n 个 `value([ ... ])`（顺序 = scanTrack 返回里的声明顺序） */
function scanValueArrays(src: string): number[][] {
  return [...src.matchAll(/value\(\[([\s\S]*?)\]\)/g)].map((m) => nums(m[1]));
}

describe.skipIf(!hasMirror)('开场数值：与上游源码镜像逐值校对', () => {
  it('ACCESS 字数表 + 品牌三行 + 黑底横扫 + 14 张扫描表', () => {
    const motion = readFileSync(`${MIRROR}/boot-motion.ts`, 'utf8');
    const tracks = readFileSync(`${MIRROR}/boot-tracks.ts`, 'utf8');

    const scan = scanValueArrays(tracks);
    const scanMine = [
      T.SCAN_OUTER_RADIUS,
      T.SCAN_WHITE_RADIUS,
      T.SCAN_OUTER_START,
      T.SCAN_OUTER_SWEEP,
      T.SCAN_WHITE_START,
      T.SCAN_WHITE_SWEEP,
      T.SCAN_INNER_RADIUS,
      T.SCAN_INNER_START,
      T.SCAN_INNER_SWEEP,
      T.SCAN_ORBIT_ANGLE,
      T.SCAN_ORBIT_RADIUS,
      T.SCAN_ORBIT_DOT_RADIUS,
      T.SCAN_BLACK_CAP,
      T.SCAN_WHITE_CAP,
    ];

    const cases: [string, number[], number[]][] = [
      ['accessCounts', [...T.ACCESS_COUNTS], constArray(motion, 'accessCounts')],
      ['brandX', [...T.BRAND_X], constArray(tracks, 'brandX')],
      ['highlightKeys', flat(T.COMPANY_HIGHLIGHT), constArray(tracks, 'highlightKeys')],
      ...scanMine.map(
        (mine, i) => [`scanTrack#${i + 1}`, flat(mine), scan[i] ?? []] as [string, number[], number[]],
      ),
    ];

    for (const [name, mine, up] of cases) {
      expect(up.length, `${name}: 上游没抠到数（正则失配）`).toBeGreaterThan(0);
      expect(mine, `${name} 与上游逐值不一致`).toEqual(up);
      console.log(`判据 抄写校对 ${name}: ${mine.length} 个数 → 与上游逐个相同`);
    }
    expect(scan.length, '上游 value([...]) 张数').toBe(scanMine.length);
  });

  it('Logo：绘制首尾 / 缺口 / 左边缘 / 描边宽 / 加减号五张表', () => {
    const src = readFileSync(`${MIRROR}/boot-logo-tracks.ts`, 'utf8');
    const cases: [string, number[], number[]][] = [
      ['draw', flat(T.LOGO_DRAW), constArray(src, 'draw')],
      ['movingCut', flat(T.LOGO_CUT), constArray(src, 'movingCut')],
      ['leftEdge', flat(T.LOGO_LEFT_EDGE), constArray(src, 'leftEdge')],
      ['strokeWidth', flat(T.LOGO_STROKE_WIDTH), trackArray(src, 'strokeWidth')],
      ['symbolScale', flat(T.LOGO_SYMBOL_SCALE), trackArray(src, 'symbolScale')],
      ['plusX', flat(T.LOGO_PLUS_X), trackArray(src, 'plusX')],
      ['minusX', flat(T.LOGO_MINUS_X), trackArray(src, 'minusX')],
      ['minusWidth', flat(T.LOGO_MINUS_WIDTH), trackArray(src, 'minusWidth')],
      ['plusAngle', flat(T.LOGO_PLUS_ANGLE), trackArray(src, 'plusAngle')],
    ];
    for (const [name, mine, up] of cases) {
      expect(up.length, `${name}: 上游没抠到数`).toBeGreaterThan(0);
      expect(mine, `${name} 与上游逐值不一致`).toEqual(up);
      console.log(`判据 抄写校对 Logo.${name}: ${mine.length} 个数 → 与上游逐个相同`);
    }
  });

  it('扫描细节：两侧小圆 26 行 / 卫星轨道 / 生长曲线 / 中央大点两张表 / 闪变帧', () => {
    const src = readFileSync(`${MIRROR}/boot-orbit-tracks.ts`, 'utf8');
    // 上游这两张表也是跨行写：`track(\n  [\n    [546, 42.93],\n ...`
    const coreTrackBlocks = [
      ...src.matchAll(/track\(\s*\[\s*\[([\s\S]*?)\]\s*,?\s*\]\s*,\s*frame\s*,?\s*\)/g),
    ].map((m) => nums(m[1]));
    // 上游写法是 `const flash = [546, 547, 549, 550].includes(sourceFrame);` ⇒ 不能用 constArray
    const flashFrames = nums(src.match(/const flash = \[([^\]]*)\]/)?.[1] ?? '');

    const cases: [string, number[], number[]][] = [
      ['sides', flat(T.SCAN_SIDES), constArray(src, 'sides')],
      ['orbit', flat(T.SATELLITE_ORBIT), constArray(src, 'orbit')],
      ['dotGrowth', flat(T.SATELLITE_GROWTH), constArray(src, 'dotGrowth')],
      ['coreFlash', flat(T.CORE_FLASH), coreTrackBlocks[0] ?? []],
      ['coreGrowth', flat(T.CORE_GROWTH), coreTrackBlocks[1] ?? []],
      ['flashFrames', [...T.CORE_FLASH_FRAMES], flashFrames],
    ];
    for (const [name, mine, up] of cases) {
      expect(up.length, `${name}: 上游没抠到数`).toBeGreaterThan(0);
      expect(mine, `${name} 与上游逐值不一致`).toEqual(up);
      console.log(`判据 抄写校对 orbit.${name}: ${mine.length} 个数 → 与上游逐个相同`);
    }
    expect(T.SCAN_SIDES.length, '两侧小圆 26 行').toBe(26);
    expect(coreTrackBlocks.length, '核心两张表').toBe(2);
  });

  it('派生量：卫星相位与轨道半径确实由 orbit 表算出（不是另抄一份）', () => {
    // 上游 `boot-orbit-tracks.ts:70-75`：相位 = atan2(y − 539.5, x − 959.5)、半径 = hypot(...)
    const [cx, cy] = T.SATELLITE_CENTER;
    for (const [f, x, y] of T.SATELLITE_ORBIT) {
      const phase = T.track(T.SATELLITE_PHASE, f);
      const dist = T.track(T.SATELLITE_DISTANCE, f);
      expect(phase, `帧 ${f} 的相位`).toBeCloseTo(Math.atan2(y - cy, x - cx), 10);
      expect(dist, `帧 ${f} 的轨道半径`).toBeCloseTo(Math.hypot(x - cx, y - cy), 10);
    }
    console.log(
      `判据 派生量 对象 卫星相位/半径（${T.SATELLITE_ORBIT.length} 点） 实测: 与 atan2/hypot 逐点一致（半径 ≈ ${T.track(T.SATELLITE_DISTANCE, 548).toFixed(2)} → ${T.track(T.SATELLITE_DISTANCE, 568).toFixed(2)} px）`,
    );
  });
});

describe.skipIf(hasMirror)('开场数值：校对前提缺失', () => {
  it('上游镜像已清掉，本组自动跳过（这不是失败）', () => {
    console.warn('_tmp-rlui/ 镜像不在：抄写校对无法进行（#26 允许交付后清掉）。唯一真源是 src/lib/boot-tracks.ts。');
    expect(hasMirror).toBe(false);
  });
});
