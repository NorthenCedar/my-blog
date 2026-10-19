import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sortLogItems } from '../src/lib/log-order';

/* 日志页「走时仪 CHRONO STRIP」+ 墨绿 ∞ 底纹（2026-10-04）的契约。
 *
 * 站主拍板：「走时仪 —— 时间刻线随更新频率变化」+「把这个无限符号替代日志背景的
 * 百褶无限符号，注意把颜色改为墨绿色」。
 * ★ 「走时仪」不是新造的名字 —— 它**本来就在最初的十台装置命名表里**
 *   （`src/scripts/rl-core.ts` 头部），兑现之后名单上那一格改成了注记。
 *
 * 这里守的是「不可退让的性质」，不是「上一版的实现形态」：
 *   ① **零 JS** —— 整台是构建期算好的一支 SVG + CSS。没有 rAF / canvas / 脚本，
 *      ⇒ 降级链是**空集**（无 JS 时日格仍是 `<a href>`，天然可用）。
 *      这条是本台最可贵的性质：它一旦被"顺手加点交互"就没了。
 *   ② **齿长随数据变**（全站唯一）—— 这是它与另外两把尺（卷尺 / 阅读尺）的分野。
 *      硬断言：齿高取值数 ≥ 4 且 max/min ≥ 3。哪天被"优化"成等长齿，它退化成卷尺，当场红。
 *      ★ 2026-10-08 两处阈值一起收（8→4、4→3）：站主要求把 v1.18 以后的日志精简成
 *        「只说做了什么」，每版的 changes 条数整体收窄（1–17 → 1–6）⇒ 这条通道的
 *        **信息量**跟着少了，两条阈值都跟着数据走。装置没坏，是**喂给它的数据变少了**；
 *        判据的意图（齿高必须是数据的函数、不能是常数）一个字没改 ——
 *        把 hOf 改成常数时，两个读数都会掉到 1，照样当场红。
 *   ③ **一格一读数、日格是真锚点** —— 不许出现死锚（指向不存在的 id）或重复 id。
 *   ④ 装饰层必须挂 `.shell` **之外**（plate 槽）—— `.shell` 在页面过渡里会被 transform，
 *      被 transform 的祖先会成为 `position: fixed` 的包含块（关于页实测跳 91px）。
 *   ⑤ 底纹取宽守**性质**不守数字：所有 vw 值必须 < 100（出血档在两张素材上不是一件事）。
 *   ⑥ 零新增运行时依赖（红线）。
 *   ⑦ **动效也零 JS**（2026-10-04 追加）—— 「呼吸」（底纹极慢漂移）与「生长」（齿依次
 *      长出、**只播一次**）都由 CSS 表达；**走时仪本身**到现在也一个 `<script>` 都没有。
 *      ★ 零 JS 这条身份说的是"**这台装置**没有脚本"，不是"这页不许有视觉变化"：
 *        ① 呼吸走合成器（只动 transform），② 生长是一次性入场 —— 两者都不需要 JS。
 *      ⚠★ 2026-10-08 **契约变更**（站主发起）：站主要在日志页加一根可拖的滚动条
 *        （「再加一个拖动的条要不然太长了」），而**拖动必须有脚本** ⇒
 *        「本页一个 `<script>` 都没有」被推翻，换成更强的那一条：
 *        **本页只许有一个脚本（滚动轨），且它一个字节都不许碰走时仪**。
 *        判据在下面「滚动轨」那组。
 *        ⇒ 这正是原注释预留的那条路："往这页塞 JS 是契约变更，得连同这条一起改"。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'log', 'index.html'));

const SRC = readFileSync(join(ROOT, 'src/pages/log.astro'), 'utf8');
/* 剥注释**只用于"源码里不许出现 X"这类负向断言**。
   ⚠ 正向断言一律用未剥注释的原文 —— 本文件的注释里就写着 `display:none` / `128vw`
   这些被断言的字符串（"注释里的字面量"是本项目踩过四次的老坑）。 */
const CODE = SRC.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const LOG_MD = readFileSync(join(ROOT, 'content/pages/log.md'), 'utf8');

const DIST_CSS = existsSync(join(DIST, '_astro'))
  ? readdirSync(join(DIST, '_astro'))
      .filter((n) => n.endsWith('.css'))
      .map((n) => readFileSync(join(DIST, '_astro', n), 'utf8'))
      .join('\n')
  : '';
const PAGE = hasDist ? readFileSync(join(DIST, 'log', 'index.html'), 'utf8') : '';

/* ------------------------------------------------------------ 从内容层推导期望值
 * ★ 一律**不硬编码** 26 / 9 —— 日志每加一条就会过期，过期的那天测试会误报，
 *   而误报比漏报更贵（build-output.test.ts 头部记过这条）。 */
function readLogItems(): { date: string; version?: string; changes: number }[] {
  const items: { date: string; version?: string; changes: number }[] = [];
  let cur: { date: string; version?: string; changes: number } | null = null;
  for (const line of LOG_MD.split(/\r?\n/)) {
    const d = line.match(/^\s{2}-\s+date:\s*(.+?)\s*$/);
    if (d) {
      cur = { date: d[1], changes: 0 };
      items.push(cur);
      continue;
    }
    const v = line.match(/^\s{4}version:\s*(.+?)\s*$/);
    if (v && cur) {
      cur.version = v[1];
      continue;
    }
    if (cur && /^\s{6}-\s+\S/.test(line)) cur.changes++;
  }
  return items;
}
/* 用**页面同一套排序**（`sortLogItems`，日期倒序 + 同日版本号数值倒序），再翻一遍 ——
   这才是走时仪里齿的出现顺序（左 = 最早）。
   ★ 不这么做就会对不上：`.entry` 在文档里是**新→旧**，而齿是**旧→新** ⇒
     "改动 11 项的那几根齿高不一致"这种假失败（本轮实测踩到）。 */
const ITEMS = sortLogItems(readLogItems());
const ASC = [...ITEMS].reverse();
const DAY_MS = 86_400_000;
const dayKey = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY_MS;
const DATES = [...new Set(ITEMS.map((i) => i.date))].sort();
const SPAN_DAYS = DATES.length ? dayKey(DATES[DATES.length - 1]) - dayKey(DATES[0]) + 1 : 0;
const EMPTY_DAYS = SPAN_DAYS - DATES.length;
/** 逐日（时间正序）的齿高输入：每根齿 = 该版改动项数 */
const PER_DAY = Array.from({ length: SPAN_DAYS }, (_, k) => {
  const d = new Date((dayKey(DATES[0]) + k) * DAY_MS).toISOString().slice(0, 10);
  return ASC.filter((i) => i.date === d).map((i) => i.changes);
});

/* ── 档位（2026-10-15 站主：「让"一格一天"变成"一格一月"，分档走」）──────────
 * 阈值与 `src/pages/log.astro` 的 `DAY_TIER_MAX` 同源。
 * ⚠ 这里**不去源码里读**那个常量（读了就是"把实现抄进判据"）——
 *   按站上规矩，阈值本身写成判据的一部分：跨过它的那天，下面那几条会**提醒**
 *   月格档是不是真的接住了，而不是默默按日格跑。 */
const DAY_TIER_MAX = 45;
const TIER = SPAN_DAYS <= DAY_TIER_MAX ? 'day' : 'month';
const MONTH_KEYS = [...new Set(DATES.map((d) => d.slice(0, 7)))];
/** 格数：日格档 = 跨度天数；月格档 = 跨了几个自然月 */
const CELLS = TIER === 'day' ? SPAN_DAYS : MONTH_KEYS.length;
/** 齿高取值集合：日格档 = 每版的项数；月格档 = 每"有更新日"里最高的那一版 */
const HEIGHT_INPUT = TIER === 'day' ? ASC.map((i) => i.changes) : (
  DATES.map((d) => ASC.filter((i) => i.date === d).map((i) => i.changes))
    .filter((a) => a.length).map((a) => Math.max(...a))
);

/* ------------------------------------------------------------ 产物里读齿 */
function readTeeth() {
  return [...PAGE.matchAll(/<line class="chrono-tooth"[^>]*y1="([\d.]+)"[^>]*y2="([\d.]+)"/g)].map((m) => ({
    base: Number(m[1]),
    h: +(Number(m[1]) - Number(m[2])).toFixed(2),
  }));
}
function readToothHeights(): number[] {
  return readTeeth().map((t) => t.h);
}

describe.skipIf(!hasDist)('日志页 · 走时仪：齿 = 内容的函数', () => {
  it(`档位与跨度对得上（当前 ${TIER} 格档 · 跨度 ${SPAN_DAYS} 天 · 阈值 ${DAY_TIER_MAX}）`, () => {
    const per = [...PAGE.matchAll(/class="chrono-day" data-period="(\w+)"/g)].map((m) => m[1]);
    expect(new Set(per), `产物里的档位不唯一：${[...new Set(per)].join(',')}`).toEqual(new Set([TIER]));
    expect((PAGE.match(/class="chrono-day"/g) ?? []).length, '格数与档位对不上').toBe(CELLS);
  });

  it('★ 齿数 = 该档的"内容单位"数（日格=每版一根；月格=每个有更新的日子一根）', () => {
    /* ★ 这条**随档位改变含义**（2026-10-15）：月格档里一格要排 31 天，
       同一天的多版只能**共列**（几何逼出来的，不是偷懒）⇒ 齿数不再是条目数。
       判据跟着档位走，别写成"永远是条目数" —— 那在换档那天会集体假红，
       而人只会以为装置坏了（同 AGENTS §5「断言绑死产物形态」）。 */
    expect(HEIGHT_INPUT.length).toBeGreaterThan(0);
    expect(readToothHeights().length, `当前是 ${TIER} 格档`).toBe(HEIGHT_INPUT.length);
  });

  it('空格（当期 0 版/0 日）画成虚线短柱，且**不挂 href**', () => {
    const empties = (PAGE.match(/class="chrono-empty"/g) ?? []).length;
    if (TIER === 'day') {
      expect((PAGE.match(/class="chrono-day"/g) ?? []).length).toBe(SPAN_DAYS);
      expect(empties, '日格档下空格数 = 跨度 − 有条目的天数').toBe(EMPTY_DAYS);
    } else {
      /* 月格档的空格 ="这个月一条都没有"；当前数据里不会有这种月。 */
      expect(empties).toBe(0);
    }
  });

  it('逐格齿数与内容一一对应（顺序：左 = 最早）', () => {
    const cells = [...PAGE.matchAll(/<a class="chrono-day"[^>]*>([\s\S]*?)(?=<a class="chrono-day"|<\/svg>)/g)].map(
      (m) => (m[1].match(/class="chrono-tooth"/g) ?? []).length,
    );
    expect(cells.length).toBe(CELLS);
    const want = TIER === 'day'
      ? PER_DAY.map((d) => d.length)
      : MONTH_KEYS.map((mk) => DATES.filter((d) => d.slice(0, 7) === mk).length);
    expect(cells, `逐格齿数与内容对不上（${TIER} 档）`).toEqual(want);
  });

  it('★ 齿长随数据变 —— 取值数 ≥ 4 且 max/min ≥ 3（这一条就是它和卷尺的分野）', () => {
    const hs = readToothHeights();
    const distinct = new Set(hs).size;
    const max = Math.max(...hs);
    const min = Math.min(...hs);
    /* ⚠ 两个阈值一起收（2026-10-08）：日志精简后每版 changes 条数收窄到 1–6 ⇒
       齿高取值自然只有 6 种、且**比值**也压下来。比值对数据的**极差**敏感，因为
       hOf 是线性映射（MIN_H + (MAX_H-MIN_H)·n/maxChanges），理论下限
       104 /(14 + 90/6) = 3.59。**装置没坏，是喂给它的数据变少了**（见文件头 ②）。
       意图不变：hOf 被改成常数时两个读数都掉到 1，这里照样红。 */
    expect(distinct, `齿高只有 ${distinct} 种取值 —— 等长齿就是卷尺，本台的身份证没了`).toBeGreaterThanOrEqual(4);
    expect(max / min, `最矮齿 ${min} / 最高齿 ${max} 拉不开`).toBeGreaterThanOrEqual(3);
    // 齿高必须真的是"改动项数"的函数：同一项数 ⇒ 同一齿高；不同项数 ⇒ 不同齿高
    /* ⚠ 配对顺序：`hs` 是**产物里齿的出现顺序**（左 = 最早），`ASC` 才是同序的；
       `ITEMS` 是文档顺序（新→旧），拿它配 `hs` 会错位（本轮实测踩到的假失败）。 */
    const byChanges = new Map<number, Set<number>>();
    HEIGHT_INPUT.forEach((changes, i) => {
      const set = byChanges.get(changes) ?? new Set<number>();
      set.add(hs[i]);
      byChanges.set(changes, set);
    });
    for (const [changes, heights] of byChanges) {
      expect(heights.size, `改动 ${changes} 项的那几根齿高不一致 ⇒ 不是数据的函数`).toBe(1);
    }
    expect(byChanges.size, '齿高取值数应等于出现过的项数取值数').toBe(distinct);
  });

  it('齿位 = 真实日期（基线一致，且越晚的格整体越靠右）', () => {
    const teeth = readTeeth();
    expect(new Set(teeth.map((t) => t.base)).size, '所有齿必须共用同一条基线').toBe(1);
  });
});

describe.skipIf(!hasDist)('日志页 · 走时仪：档位与标签带（2026-10-15）', () => {
  it('★★ 月份必须标出来（站主：「日号会重复，得加月份」）', () => {
    /* 为什么这不是补丁：跨度一旦超过 31 天，日号**本身就失去唯一性**
       ——"3" 分不清是几月 3 号。月份是那一档唯一的定位信息。
       判据：每个**月份交界**处恰有一个月份标记，且月份序列与内容里的月份序列相同。 */
    const mons = [...PAGE.matchAll(/<text class="chrono-mon"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    const want = TIER === 'day'
      ? [...new Set(DATES.map((d) => Number(d.slice(5, 7)) + '月'))]
      : /* 月格档：月份写进标签，额外那行只在**年份变化**时出现 */
        [...new Set(DATES.map((d) => Number(d.slice(5, 7)) + '月'))];
    if (TIER === 'day') {
      expect(mons, '月份标记数 = 内容里出现的月份数').toEqual(want);
    } else {
      expect(mons.length, '月格档下只在年份变化处标年份').toBeLessThanOrEqual(1);
    }
    /* ★ 每个月份标记必须**只出现一次**（重复出现 = 跨月判定写错了）。 */
    expect(new Set(mons).size, `月份标记有重复：${mons.join(',')}`).toBe(mons.length);
  });

  it('★★ 月份必须独占一行，不许把日号顶下去', () => {
    /* 本轮第一版把月份排在上面、日号顺延一行 —— 出图一看"9月"压着"25"、
       而且同月里只有那一格下沉，看起来像排版歪了一格。⇒ 月份在下面一行。 */
    const lblY = [...new Set([...PAGE.matchAll(/<text class="chrono-lbl"[^>]*y="([\d.]+)"/g)].map((m) => m[1]))];
    expect(lblY.length, `日号基线出现了 ${lblY.length} 个高度 ⇒ 有的格被顶下去了`).toBe(1);
    const monY = [...PAGE.matchAll(/<text class="chrono-mon"[^>]*y="([\d.]+)"/g)].map((m) => Number(m[1]));
    /* ⚠ viewBox 必须**按 `chrono-svg` 取**：页面上还有别的 SVG（图标），
 * 裸取第一个会拿到 `0 0 18 14` 那种 —— 本轮第一版就栽在这，
 * 报出来是"月份基线超出了标签带"，而真相比那离奇得多。 */
const vbBox = PAGE.match(/<svg class="chrono-svg"[^>]*viewBox="0 0 [\d.]+ ([\d.]+)"/)?.[1];
    expect(vbBox, '没找到走时仪的 viewBox 高度').toBeTruthy();
    const base = Number(PAGE.match(/--chrono-base:(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
    for (const y of monY) {
      const lblY0 = Number(lblY[0]);
      expect(y - lblY0, '月份与日号的基线相距太近 ⇒ 整台缩放后两行会贴在一起（本轮实测压住了）')
        .toBeGreaterThan(12);
      /* 标签带高度必须装得下第二行，否则会被 viewBox 裁掉。 */
      expect(y, `月份基线 ${y} 超出了 viewBox 高度（base=${base}）`).toBeLessThan(Number(vbBox));
    }
  });

  it('★★ 颜色只从 token 读，alpha 由 8 位 hex 承载（AGENTS §3 第 3 条）', () => {
    /* ★ 这条是**补上的缺口**：相册 / 灯箱 / 星座 / 404 各有自己的颜色纪律断言，
       只有走时仪这一页没有 —— 于是本轮新增 `.chrono-mon` 时没人拦着色值。
       同 AGENTS §5「照抄挂法要逐条问」的反面：**没有守卫的地方就是没有规矩**。
       口径与其它组件一致：不许 6/8 位 hex、不许 rgb()/rgba()。 */
    const chronoBlocks = [...CODE.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /chrono/.test(m[1]))
      .map((m) => ({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] }));
    expect(chronoBlocks.length, '没解析到任何 .chrono-* 规则块（判据空转 ⇒ 恒真）').toBeGreaterThan(8);
    for (const b of chronoBlocks) {
      expect(b.body, `.chrono 规则「${b.sel}」里写了字面色值`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(b.body, `.chrono 规则「${b.sel}」里写了 rgb()/rgba()`).not.toMatch(/\brgba?\(/);
      /* ★ 必须连**具名颜色**一起拦。早先只拦 `#hex` 与 `rgb()`，而变异注入的
         `color: red` **完全漏过去** —— `red` 恰恰是最字面的那个写法。
         （用色属性的值里，除了 `var(--…)` / `none` / `transparent` / `currentColor`
           剩下的裸标识符一律可疑。列表取常见 CSS 具名色，够用且不会误伤。） */
      const NAMED = /\b(?:color|fill|stroke|background|background-color|border-color|outline-color)\s*:\s*(?!var\(|none\b|transparent\b|currentColor\b|inherit\b)[a-z]{3,}\b/i;
      expect(b.body, `.chrono 规则「${b.sel}」里写了具名颜色`).not.toMatch(NAMED);
    }
  });

  it('★★ 装置自己的可读性预算：相邻两列渲染后必须还分得开（≥1px）', () => {
    /* ★ 这条是这轮**新写**的判据，也是唯一会在"数据涨到撑不住"时先红的那条。
       装置是 `width:100%` + viewBox **等比缩**进 `min(34vw, 520px)`，所以：
         格数 × 格宽 = viewBox 宽 ⇒ 缩放比 = 520 / viewBox宽
         格内相邻列的渲染间距 = 列距 × 缩放比
       实测（本轮，21 格 × 46px = 966px ⇒ 缩放 53.8%）：列距 4 → **2.15px**，还分得开。
       ★ 这条**只查上界会漏掉真问题**：真正会出事的是"数据涨了 ⇒ 缩放比掉下来"，
         所以必须从**产物里把 viewBox 读出来**再算，而不是拿源码常量估。 */
    const vb = PAGE.match(/<svg class="chrono-svg"[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    expect(vb, '没找到走时仪的 viewBox（⚠ 别去取页面上第一支 SVG —— 那是图标）').toBeTruthy();
    const box = 520;                              // .chrono 的 width 上界
    const scale = box / Number(vb![1]);
    const pitch = (TIER === 'day' ? 4 : 2.7) * scale;
    expect(
      pitch,
      `相邻列渲染间距只有 ${pitch.toFixed(2)}px（格数×格宽=${vb![1]}px，缩放 ${(scale * 100).toFixed(1)}%）`
      + ' ⇒ 齿会连成一片，齿高这条通道就没了',
    ).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(!hasDist)('日志页 · 走时仪：可点、可降级', () => {
  it('无 JS 可用：每个日格是 SSR 的 `<a href="#day-…">`，条目侧真的有那个 id', () => {
    const hrefs = [...PAGE.matchAll(/<a class="chrono-day"[^>]*href="#([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBe(DATES.length); // 只有"有条目"的日格才挂 href
    const ids = [...PAGE.matchAll(/<li class="entry" id="([^"]+)"/g)].map((m) => m[1]);
    // 死锚：href 指向的 id 必须存在
    expect(hrefs.filter((h) => !ids.includes(h)), '有指向不存在的 id 的死锚').toEqual([]);
    // 孤儿：每个 id 都要有日格指着它
    expect(ids.filter((i) => !hrefs.includes(i)), '有条目锚点没被任何日格指着').toEqual([]);
    // 重复：同一天多条只能挂一个 id（09-30 那天有 9 条）
    expect(new Set(ids).size, '条目 id 有重复').toBe(ids.length);
  });

  it('空格的日格**不挂 href**（那天没有任何条目，跳过去是死锚）', () => {
    if (EMPTY_DAYS === 0) return;
    const emptyHref = [...PAGE.matchAll(/<a class="chrono-day"[^>]*>([\s\S]*?)(?=<a class="chrono-day"|<\/svg>)/g)]
      .filter((m) => m[1].includes('chrono-empty'))
      .filter((m) => /href=/.test(m[0]));
    expect(emptyHref, '空格日格挂了 href ⇒ 死锚').toEqual([]);
  });

  it('★ 走时仪零 JS：本页唯一的脚本是滚动轨，且它一个字节都不碰走时仪', () => {
    /* 原契约是「本页一个 `<script>` 都没有」。2026-10-08 站主要求在日志页加一根可拖的
       滚动条（「再加一个拖动的条要不然太长了」）—— 拖动**必须**有脚本，所以那条被
       站主自己推翻了。这里换成它真正要守的那件事：**走时仪本身零 JS**
       （不吃它的数据、不查它的 DOM、不改它的样式）。 */
    const scripts = [...CODE.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length, '脚本入口只该有一个（滚动轨）').toBe(1);
    expect(scripts[0], '那个脚本必须是滚动轨').toMatch(/import '\.\.\/scripts\/scroll-rail'/);
    expect(scripts[0], '滚动轨碰了走时仪 —— 那台的身份就是「零 JS」').not.toMatch(/chrono|CHRONO/);
    expect(CODE, '不许引装置公共层（走时仪连 rl-core 都不需要）').not.toMatch(/\brl-core\b/);
    expect(CODE, '不许出现 canvas / rAF —— 那不是走时仪的机制').not.toMatch(/canvas|requestAnimationFrame/);
    expect(existsSync(join(ROOT, 'src/scripts/log-chrono.ts')), '不该有走时仪脚本文件').toBe(false);
  });

  it('≤1023px 不渲染（装置在 DOM 里、靠 display:none 拿掉）', () => {
    expect(CODE, '窄屏没关掉装置').toMatch(/@media\s*\(max-width:\s*1023px\)[\s\S]*?\.chrono\s*\{[\s\S]*?display:\s*none/);
  });

  it('reduced-motion 只撤动效、不撤信息（hover 读数属可用性，不能整体 transition:none）', () => {
    const rm = CODE.slice(CODE.indexOf('prefers-reduced-motion'));
    expect(rm, '缺少 reduced-motion 档').toBeTruthy();
    expect(rm, 'reduced-motion 档必须把 hover 过渡压掉').toMatch(/transition:\s*none/);
    expect(CODE, 'hover 读数必须存在（它是这一格的信息）').toMatch(/\.chrono-readout/);
  });

  it('整台 fixed 常驻、不拦指针（只有日格接指针）', () => {
    expect(CODE).toMatch(/\.chrono\s*\{[\s\S]*?position:\s*fixed/);
    expect(CODE).toMatch(/\.chrono\s*\{[\s\S]*?pointer-events:\s*none/);
    expect(CODE).toMatch(/\.chrono-day\s*\{[\s\S]*?pointer-events:\s*auto/);
  });
});

/* ── 滚动轨（2026-10-08 新增）────────────────────────────────────────────────
 * 站主：「再加一个拖动的条要不然太长了」。全站原生滚动条 2026-10-02 被站主自己要求删掉
 * （`src/styles/base.css` 那两行），超长页从此**没有任何能拖的东西** —— 这根把它补回来。
 * ★ 它**不是装置**：不读 `items`、不吃任何内容数据，是纯视口的函数
 *   （换到任何长页它照样成立）⇒ 所以上面那组「齿 = 内容的函数」与它无关。
 * 断言守四件事：无 JS 不出现 / 与走时仪同层（plate 槽）/ 窄屏不渲染 / 不抢无障碍树。
 */
describe.skipIf(!hasDist)('日志页 · 滚动轨（右侧可拖的滚动条）', () => {
  const railComponent = readFileSync(join(ROOT, 'src/components/ScrollRail.astro'), 'utf8');
  it('无 JS 时不出现：产出的 DOM 带 hidden（脚本到位才摘）', () => {
    expect(PAGE, 'rail 不带 hidden ⇒ 无 JS 时也会画出一根拉不动的条').toMatch(
      /<div class="rail"[^>]*\bhidden\b/,
    );
  });

  it('与走时仪同一层：放进 plate 槽（`.shell` 的 transform 带不偏它）', () => {
    const plate = CODE.slice(CODE.indexOf('<Fragment slot="plate">'), CODE.indexOf('</Fragment>'));
    expect(plate, '滚动轨没放进 plate 槽').toContain('<ScrollRail');
  });

  it('窄屏不渲染（手机上触屏滚动更自然，条只会挡内容）', () => {
    expect(railComponent).toMatch(/@media\s*\(max-width:\s*767px\)[\s\S]*?\.rail\s*\{[\s\S]*?display:\s*none/);
  });

  it('不抢无障碍树与 Tab 序（键盘 / 读屏走原生滚动）', () => {
    expect(PAGE).toMatch(/class="rail"[^>]*aria-hidden="true"/);
    expect(PAGE).toMatch(/class="rail"[^>]*tabindex="-1"/);
  });

  it('主规则里**不许写 display** —— 写了会盖过 UA 的 [hidden]，无 JS 那档就漏了', () => {
    const rule = railComponent.match(/\.rail\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule.length, '没找到 .rail 主规则').toBeGreaterThan(0);
    expect(rule, '给 .rail 写了 display ⇒ 盖过 [hidden]').not.toMatch(/display:/);
  });
});

describe.skipIf(!hasDist)('日志页 · 装饰层挂在 `.shell` 之外', () => {
  it('底纹与装置都在 `plate` 槽里（`.shell` 被 transform 时 fixed 层不跟着跳）', () => {
    expect(CODE).toMatch(/<Fragment slot="plate">/);
    expect(CODE, 'plate 槽里没看到底纹层').toMatch(/<div class="log-inf"/);
    expect(CODE, 'plate 槽里没看到走时仪').toMatch(/<nav class="chrono"/);
  });

  it('底纹层照抄百褶 ∞ 的角色：fixed 居中 / z-index:-1 / 不拦指针 / 不参与无障碍树', () => {
    expect(CODE).toMatch(/\.log-inf\s*\{[\s\S]*?position:\s*fixed/);
    expect(CODE).toMatch(/\.log-inf\s*\{[\s\S]*?z-index:\s*-1/);
    expect(CODE).toMatch(/\.log-inf\s*\{[\s\S]*?pointer-events:\s*none/);
    expect(CODE).toMatch(/<div class="log-inf" aria-hidden="true">/);
  });

  it('本页的百褶 ∞ 必须关掉（用的是 `:global` —— `.page-inf` 带的是别的作用域属性）', () => {
    expect(CODE, '没关 page-inf ⇒ 两套母题会叠着').toMatch(/:global\(body\.log-plate \.page-inf\)/);
    expect(CODE).toMatch(/:global\(body\.log-plate \.page-inf\)\s*\{[\s\S]*?display:\s*none/);
    expect(PAGE).toContain('log-plate');
    /* ★ 产物里查那**压缩后**的写法 —— 别假定它在哪儿：Astro 按体积决定**内联**还是外链，
       而且**会随体积翻转**。2026-10-04 实测：加了两个 @keyframes、CSS 涨到 4.6 KB 之后，
       本页就从"内联在 HTML 的 `<style>` 里"变成了外链 `_astro/log.*.css`
       （前一轮的注释写着"本页是小页、规则直接躺在 HTML 里"，当场过期）。
       ⇒ 两个地方都找，找不到才红；**别把某一轮观察到的产物形态写进判据**。 */
    const found = /body\.log-plate \.page-inf\{display:none/.test(PAGE) ||
      /body\.log-plate \.page-inf\{display:none/.test(DIST_CSS);
    expect(found, '产物里没有关掉 page-inf 的规则（HTML 内联与 _astro/*.css 都查过了）').toBe(true);
  });

  it('★ 破坏性反例守卫：本页底纹不许用会切到内容的宽档', () => {
    const block = CODE.slice(CODE.indexOf('.log-inf {'), CODE.indexOf('.log-inf img'));
    expect(block, '没找到 .log-inf 样式块').toBeTruthy();
    // 守**性质**不守数字：改数值不误报，退回出血档立刻红
    for (const m of block.matchAll(/([\d.]+)vw/g)) {
      expect(Number(m[1]), `${m[1]}vw 是出血档 —— 本图墨迹铺满画布，切掉的是内容`).toBeLessThan(100);
    }
    expect(block, '128vw 是百褶 ∞ 的档（它的墨迹只占取景框 45.8%），本图禁止照抄').not.toMatch(/128vw/);
    expect(block, '又宽又扁的窗要靠 vh 上界兜住').toMatch(/170vh/);
  });

  it('底纹透明度守站上自己的装饰档，且两个旋钮留着', () => {
    expect(CODE).toMatch(/--plate-op,\s*0?\.08\)/);
    expect(CODE, '取宽要留旋钮').toMatch(/--plate-w,/);
  });
});

/* ★ 花括号配对取块 —— **不能用"往后切 N 个字符"**：切多了会吃进下一个规则
   （本轮实测：取 keyframes 时切到 600 字符，吃到了 `.chrono` 的 `translateY(-50%)`，
   断言于是报"关键帧没带居中"，而源码明明是对的）。
   与站上那条「配对区间不能用 `indexOf('</div>')`」是同一个家族 —— 必须做嵌套计数。 */
function braceBlock(src: string, atBrace: number): string {
  let d = 0;
  for (let i = atBrace; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(atBrace, i + 1); }
  }
  return '';
}
/** 取 `@keyframes <name> { … }` 的整块（含嵌套） */
function keyframesBlock(name: string): string {
  const i = CODE.indexOf(`@keyframes ${name}`);
  if (i < 0) return '';
  return braceBlock(CODE, CODE.indexOf('{', i));
}
/** 取所有 `@media (prefers-reduced-motion: reduce) { … }` 的块 */
function reduceBlocks(): { at: number; blk: string }[] {
  return [...CODE.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g)].map((m) => {
    const b = CODE.indexOf('{', m.index!);
    return { at: m.index!, blk: braceBlock(CODE, b) };
  });
}

describe.skipIf(!hasDist)('日志页 · 动效（站主 2026-10-04：「加一点动态背景」，拍板 ①呼吸+⑤生长 / 只管本页；同日两次改参数：呼吸调到看得见、齿排在过渡后）', () => {
  /* ★ 这一组守的是**三条容易回归的性质**，不是"上一版调好的参数值"：
     ① **仍然零 JS** —— 两次动效全部由 CSS 表达（上面那条断言一字未改）。
     ② **居中不能丢** —— @keyframes 里的 transform 会**整体覆盖**基础声明，
        所以每个关键帧都必须复用 `--log-inf-center`。丢掉的话，底纹会在动画第一帧
        就跑到屏幕右下角去（而 `position:fixed` 定位的那几行看起来完全正常）。
     ③ **reduce 降级必须排在 animation 声明之后** —— 同权重下后写胜。图省事把它挪到
        样式段开头那个 reduce 块里，会被后面的 `animation: …` 覆盖 ⇒ 动画照播，
        而**断言照样全绿**。这是本轮最阴的一种假通过，所以专门给它一条顺序断言。
     ★ 颜色纪律不受影响：本轮只动 transform，没有引入任何字面色值 / rgba()。 */

  it('①「呼吸」：底纹有 animation，且关键帧只动 transform（碰 opacity 会让墨量判据随时辰变）', () => {
    expect(CODE).toMatch(/\.log-inf\s*\{[\s\S]*?animation:\s*[^;]*log-inf-breathe/);
    const kf = keyframesBlock('log-inf-breathe');
    expect(kf, '没有呼吸的关键帧块').toBeTruthy();
    expect(kf, '关键帧只许动 transform —— 动 opacity/filter 会让 §6.30 的墨量差分判据随时辰失效')
      .not.toMatch(/opacity|filter/i);
  });

  it('★★ 居中必须拎成变量：每个关键帧都复用 --log-inf-center（否则底纹第一帧就跳走）', () => {
    expect(CODE, '没把居中拎出来').toMatch(/--log-inf-center:\s*translate\(-50%,\s*-50%\)/);
    const frames = [...keyframesBlock('log-inf-breathe').matchAll(/transform:\s*([^;]+);/g)]
      .map((m) => m[1].trim());
    expect(frames.length, '关键帧里没有 transform（应为 from/to 各一）').toBe(2);
    for (const f of frames) {
      expect(f, `关键帧没带 --log-inf-center ⇒ 动画一开就丢居中：${f}`).toMatch(/^var\(--log-inf-center\)/);
    }
  });

  it('★★ 呼吸的幅度必须**落在可见区间内**（上下界都写 —— 只写上界等于给"越漂越弱"发许可证）', () => {
    /* ★ 这条断言改过一次。原来的版本是「位移守配额 ≤15px」，**只防太大**，
       没有任何东西防"消失" ⇒ 底纹一路漂到 0.14 px/s（人眼分辨阈 ≈1 px/s 的十分之一）
       而断言全绿。站主看页面说「呼吸我看不出来啊」，实测坐实：旧组 96 s /
       平移极差 9.43 px / scale 极差 0.008 ⇒ 轮廓实际只涨 6 px。
       教训：**装饰性动效的契约，可见性要有下界、克制要有上界，两边都得写。** */
    const kf = keyframesBlock('log-inf-breathe');
    const tr = [...kf.matchAll(/translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/g)]
      .map((m) => [Number(m[1]), Number(m[2])]);
    expect(tr.length, '没解析到两档 translate3d').toBe(2);
    const dt = Math.hypot(tr[1][0] - tr[0][0], tr[1][1] - tr[0][1]);
    const sc = [...kf.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]));
    expect(new Set(sc).size, '没解析到两档 scale').toBe(2);
    const ds = Math.abs(sc[1] - sc[0]);

    /* 上界：胀大时最远的角会被 scale 带走 —— 层半对角线按最坏档 895px 宽算 ≈505px。 */
    const R = Math.hypot(895 / 2, (895 * 642) / 1222 / 2);
    const peak = dt + ds * R;
    expect(dt, `平移极差 ${dt.toFixed(2)}px：下界防消失、上界防抢戏（预算 ${peak.toFixed(1)}px）`)
      .toBeGreaterThan(10);
    expect(peak, `合成峰值 ${peak.toFixed(1)}px 太大，底纹会从版心里跳出来`).toBeLessThan(70);

    /* 下界真正卡的是**速度**：位移够了但周期拖到几十秒，照样看不见。
       判据取「合成峰值 / 单程秒数」≥ 1.5 px/s（人眼慢运动分辨阈约 1 px/s 的 1.5 倍）。 */
    const dur = CODE.match(/animation:\s*log-inf-breathe\s+([\d.]+)s/);
    expect(dur, '呼吸的 animation 里没读到秒数（必须用 s，不要用 ms）').toBeTruthy();
    const t = Number(dur![1]);
    expect(t, '呼吸必须是持续动效 ⇒ 要有 alternate 往返，单程太久等于看不见')
      .toBeLessThan(40);
    const speed = peak / t;
    expect(speed, `单程均速 ${speed.toFixed(2)} px/s 低于 1.5 px/s ⇒ 物理上看不见（周期 ${t}s）`)
      .toBeGreaterThan(1.5);
  });

  it('★ 呼吸的 duration 与关键帧里的位移量必须同源（周期和幅度分两处改就会对不上）', () => {
    /* 幅度写在 @keyframes、周期写在 animation —— 改一处忘另一处不会有任何报错，
       只会让"配好的呼吸"变成另一个速度的另一个幅度。这里把两者钉在同一组数字上：
       周期 24 s 配 scale 极差 0.070（吸 0.965 / 呼 1.035），平移 ±10 / ±6。 */
    const dur = Number(CODE.match(/animation:\s*log-inf-breathe\s+([\d.]+)s/)![1]);
    const sc = [...keyframesBlock('log-inf-breathe').matchAll(/scale\(([\d.]+)\)/g)]
      .map((m) => Number(m[1]));
    /* 24 s 那一档的"一次慢深呼吸"；周期翻倍而幅度不变 ⇒ 均速减半，掉到下界之下。 */
    if (dur === 24) {
      expect(Math.abs(sc[1] - sc[0]), '24s 配的这组幅度与样机不符').toBeCloseTo(0.07, 3);
    }
  });

  it('★★ 齿的生长必须**排在页面过渡之后**（提前量由 --tooth-lead 承担，不许散进相位算法）', () => {
    /* 站主 2026-10-04：「把根齿依次长出放在过渡动画后」。实测旧参数与过渡重叠 316ms。 */
    expect(CODE, 'animation-delay 没用 --tooth-lead 叠加，提前量被写死进相位算法了')
      .toMatch(/animation-delay:\s*calc\(var\(--tooth-delay[^)]*\)\s*\+\s*var\(--tooth-lead/);
    const lead = CODE.match(/--tooth-lead,\s*(\d+)ms/);
    expect(lead, '没读到提前量默认值').toBeTruthy();
    const ms = Number(lead![1]);
    /* 必须 ≥ 过渡时长（900ms，见 transition.css 的 --pt-sweep），留一点余量。 */
    expect(ms, `提前量 ${ms}ms 短于页面过渡 900ms ⇒ 齿会在过渡还没走完时就开始冒头`)
      .toBeGreaterThanOrEqual(1000);
    /* 相位算法保持纯「依次」：单增断言在下一条，这里只确认它没被提前量污染成常量。 */
    const delays = [...PAGE.matchAll(/--tooth-delay:(\d+)ms/g)].map((m) => Number(m[1]));
    expect(new Set(delays).size, '所有齿相位相同 ⇒ 提前量把「依次」抹平了').toBeGreaterThan(1);
  });

  it('⑤「生长」：一次性入场，`both` 必须在（否则 delay 期间齿会先完整闪一下）', () => {
    expect(CODE).toMatch(/\.chrono-tooth\s*\{[\s\S]*?animation:\s*[^;]*chrono-tooth-grow[^;]*\bboth\b/);
    const kf = keyframesBlock('chrono-tooth-grow');
    expect(kf, '没有生长的关键帧块').toBeTruthy();
    expect(kf, '必须从 0 长起来').toMatch(/from\s*\{\s*transform:\s*scaleY\(0\)/);
    expect(kf, '必须长满到 1').toMatch(/to\s*\{\s*transform:\s*scaleY\(1\)/);
  });

  it('★★ 缩放轴钉在**基线**上，且三处同源（齿 y1 / transform-origin / --chrono-base）', () => {
    expect(CODE, 'transform-origin 没钉在基线上').toMatch(/transform-origin:\s*0\s*var\(--chrono-base/);
    expect(CODE, 'transform-box 必须显式给 —— 齿是 <line>，fill-box 的宽为 0，靠不住')
      .toMatch(/transform-box:\s*view-box/);
    /* 三处同源：产物里 --chrono-base 的值 == 齿的基线（y1）。
       MAX_H 哪天从数据推出来变高，三处只要有一处忘了跟就当场红。 */
    const base = PAGE.match(/--chrono-base:(\d+(?:\.\d+)?)px/);
    expect(base, '产物里没有 --chrono-base').toBeTruthy();
    const bases = new Set(readTeeth().map((t) => t.base));
    expect(bases.size, '齿不在同一条基线上').toBe(1);
    expect(Number(base![1]), `--chrono-base(${base![1]}) 与齿的基线(${[...bases][0]}) 不一致`).toBe([...bases][0]);
  });

  it('★★ 生长相位严格单增（从左往右），且格内错开必须小于格间距（否则相邻格交错）', () => {
    const delays = [...PAGE.matchAll(/--tooth-delay:(\d+)ms/g)].map((m) => Number(m[1]));
    expect(delays.length, '齿没带生长相位').toBeGreaterThan(0);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i], `第 ${i} 根的相位不比前一根晚 ⇒ 视觉上不是"从左往右长"`).toBeGreaterThan(delays[i - 1]);
    }
    const diffs = [...new Set(delays.slice(1).map((v, i) => v - delays[i]))].sort((a, b) => a - b);
    expect(diffs.length, '所有相位相同 ⇒ 根本没有"依次"').toBeGreaterThan(1);
    expect(diffs[diffs.length - 1], '最大相邻差（格间距）应明显大于最小（格内错开）')
      .toBeGreaterThan(diffs[0] * 2);
  });

  it('★★ reduce 降级必须排在 animation 声明**之后**（写在前面会被覆盖，断言却照样绿）', () => {
    /* ⚠ 定位要按**结构**来：本页有**两个** reduce 块（`.entry:target` 那处在样式段最前面，
       撤销本轮的两次动效那处在后面）。`CODE.indexOf('animation: none')` 命中前面那个，
       会得出"顺序错了"的假失败 —— 本轮实测踩到。 */
    const iBreathe = CODE.indexOf('animation: log-inf-breathe');
    const iGrow = CODE.indexOf('animation: chrono-tooth-grow');
    expect(iBreathe, '找不到呼吸的 animation 声明').toBeGreaterThan(0);
    expect(iGrow, '找不到生长的 animation 声明').toBeGreaterThan(0);

    const hit = reduceBlocks().filter((b) => /\.log-inf/.test(b.blk));
    expect(hit.length, '没有"撤销底纹/齿动画"的 reduce 块').toBe(1);
    const t = hit[0];
    expect(t.blk, '这个 reduce 块没撤底纹的动画').toMatch(/\.log-inf[\s\S]*?animation:\s*none/);
    expect(t.blk, '这个 reduce 块没撤齿的动画').toMatch(/\.chrono-tooth/);

    expect(t.at, 'reduce 块排在呼吸的 animation 之前 ⇒ 会被覆盖，动画照播（而断言照样绿 = 假通过）')
      .toBeGreaterThan(iBreathe);
    expect(t.at, 'reduce 块排在生长的 animation 之前 ⇒ 会被覆盖').toBeGreaterThan(iGrow);
  });
});

describe('日志页 · log.md 的 frontmatter 卫生', () => {
  /* ★ 这条不是洁癖，是连着两次真实构建失败：
       2026-10-16 ① `- **然后按你说的退回了 0.75**：……`
                 ② `- "怎么量动态环"做成了探针：……`
     两次的报错都指向一个完全看不出原因的位置：
       ① `unidentified alias "*然后按你说的退回了"`（`*` 开头被读成 alias）
       ② `bad indentation of a sequence entry`（`"` 开头被读成引用开始，后面又跟了字）
     ⇒ **YAML 标量的开头不能是任何指示符**，而不只是 `*`。
       而 log.md 是**由 AI 代笔**的 ⇒ 这些写法迟早还会出现 ⇒ 门闩直接点名行号。
     ⚠ 只查 frontmatter：正文里同样的写法完全合法（全仓正文有 15 处 `- **`），规则不能写宽。
     ⚠ 指示符清单**不能写全**：`-`/`?`/`:` 开头在本文里是合法序列项，漏掉它们会恒红。 */
  const fm = LOG_MD.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const BAD = ['*', '&', '!', '|', '>', "'", '"', '%', '@', '`', '{', '['];

  it('frontmatter 本身在', () => {
    expect(fm, 'log.md 没有 frontmatter').toBeTruthy();
  });

  it('列表项不以 YAML 指示符开头（会被读成 alias / 引用 / 标签）', () => {
    const offenders = fm![1]
      .split(/\r?\n/)
      .map((l, i) => [i + 2, l] as const)              // +2 = 跳过 `---\n`
      .filter(([, l]) => /^\s*-\s+\S/.test(l))
      .filter(([, l]) => BAD.includes(l.replace(/^\s*-\s+/, '')[0]!));
    expect(
      offenders.map(([n, l]) => `第 ${n} 行「${l.trim().slice(0, 40)}」`),
      '这几行的标量以 YAML 指示符开头 ⇒ 构建会挂在 unidentified alias / bad indentation 上',
    ).toEqual([]);
  });

  it('每个日志条目的键缩进一致（- date / version / changes 对齐）', () => {
    /* ★ 第二类失败：`- date:` 那一行丢了缩进 ⇒ 也是 bad indentation，
       而且报错指到的是**后面**那一行。⇒ 同一段里所有 `- date:` 必须同一缩进，
         且它们的 `version:` 必须是「缩进 + 2」—— 两个数都比"看起来对不对"可靠。
       ⚠ 回查 `version:` 那一行必须用**整段里的行号**，不能用「过滤后数组的下标」——
       我第一版写成 `k+1`，因为过滤掉了所有非日期行，索引整体错位。 */
    const lines = fm![1].split(/\r?\n/);
    const dates = lines
      .map((l, i) => [i, l] as const)
      .filter(([, l]) => /^\s*-\s+date:/.test(l));
    expect(dates.length, '一条都没找到，日志是不是空了').toBeGreaterThan(0);
    const indents = [...new Set(dates.map(([, l]) => l.match(/^\s*/)![0].length))];
    expect(indents, '各条目的缩进不一致').toHaveLength(1);
    const bad = dates
      .filter(([i]) => !new RegExp('^\\s{' + (indents[0]! + 2) + '}version:').test(lines[i + 1] ?? ''))
      .map(([i]) => `frontmatter 第 ${i + 2} 行后面那条 version 缩进不对`);
    expect(bad, 'version 必须比 - date 深 2 格').toEqual([]);
  });
});

describe('日志页 · 墨绿 ∞ 素材', () => {
  const PLATE = join(ROOT, 'src/assets/log/plates/main.webp');

  it('素材在 src/assets/log/plates/ 下（不是 talks 那条非递归 glob 目录）', () => {
    expect(existsSync(PLATE), '缺 src/assets/log/plates/main.webp').toBe(true);
    expect(statSync(PLATE).size, '素材体积异常').toBeGreaterThan(4096);
  });

  it('★ 真的转过色了：没有一个像素偏蓝（这才是"墨绿"能被断言的部分）', async () => {
    /* 动态 import：sharp 是 astro 自带的依赖，不是本仓 package.json 里的依赖。
       ⚠ 这必须在构建**前**跑得动 —— 与 about-ref-plate.test.ts 同一条口径。 */
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(PLATE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let n = 0, blue = 0, rs = 0, gs = 0, bs = 0, maxA = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      const a = data[i * info.channels + 3];
      if (a > maxA) maxA = a;
      if (a <= 200) continue;
      const r = data[i * info.channels], g = data[i * info.channels + 1], b = data[i * info.channels + 2];
      n++; rs += r; gs += g; bs += b;
      if (b > r + 20 && b > g + 20) blue++;
    }
    expect(maxA, 'alpha 丢了 —— 底纹会变成一块不透明矩形').toBeGreaterThanOrEqual(200);
    expect(n, '几乎没有实心像素').toBeGreaterThan(1000);
    expect(blue, `还有 ${blue} 个像素偏蓝 —— 转色没转干净`).toBe(0);
    const g = gs / n;
    expect(g, 'G 通道不是最亮的 ⇒ 不是墨绿').toBeGreaterThan(rs / n);
    expect(g, 'G 通道不是最亮的 ⇒ 不是墨绿').toBeGreaterThan(bs / n);
  });
});
