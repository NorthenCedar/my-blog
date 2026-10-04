import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSpring } from '../src/scripts/rl-core';

/* 归档页「索引卷尺」（INDEX TAPE）的几条不可退让的性质。
 *
 * 机制（与显影板的「连续密度场」对立）：离散刻度 + 刚性位移。
 *   · 竖条按年份**等距**打刻度（大齿=年份、小齿=月份），游标随滚动连续走 + 二阶弹簧过冲。
 *   · 卷过的刻度留墨；读数区显示「当前年份 · N 篇」；点/拖刻度跳转到年份分组。
 *
 * 与显影板同源的既有契约，这里照旧成立：
 *   ① 无 JS 可用 —— 装置默认 hidden + aria-hidden，归档列表服务端渲染完整。
 *   ② 零随机 —— 游标是 t 与滚动量的确定函数，无 Math.random。
 *   ③ 帧率无关 —— 弹簧吃真实 dt（半隐式欧拉），禁「每帧固定系数」。
 *   ④ reduced-motion 降级 —— 落到最终态（直接贴目标，不跑 rAF）。
 *   ⑤ 移动端 ≤767px 完全隐藏（口径 #9，本轮拍板「完全不渲染」）。
 *   ⑥ 刻度从内容推导 —— 年份/篇数不写死，明年发文自动多一根刻度。
 */
const SRC = readFileSync('src/scripts/index-tape.ts', 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
const ASTRO = readFileSync('src/pages/archive.astro', 'utf8');
const ACSS = ASTRO.replace(/\/\*[\s\S]*?\*\//g, ' ');

const DIST = 'dist';
const hasDist = existsSync(DIST);
const ARCHIVE_HTML = hasDist ? readFileSync(join(DIST, 'archive', 'index.html'), 'utf8') : '';

/* 从内容层推导「年份 → 已发布文章数」，不硬编码（同 build-output.test.ts 的手法）。
   ★ 关键：只解析**第一个 frontmatter 块**（fm[1]）—— 正文里可能故意出现 `draft: true`
     这样的字样（ai-built-this-blog 的代码块里就有，测排版用的），全文搜会误判。 */
const POSTS_DIR = 'content/posts';
function yearCounts(): Map<string, number> {
  const map = new Map<string, number>();
  if (!existsSync(POSTS_DIR)) return map;
  for (const d of readdirSync(POSTS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const f = join(POSTS_DIR, d.name, 'index.md');
    if (!existsSync(f)) continue;
    const text = readFileSync(f, 'utf8');
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!fm) continue;
    const date = (fm[1].match(/^date:\s*(\d{4})-\d{2}-\d{2}\s*$/m) ?? [, ''])[1];
    const draft = /^draft:\s*true\s*$/m.test(fm[1]);
    if (date && !draft) map.set(date, (map.get(date) ?? 0) + 1);
  }
  return map;
}

describe('归档页索引卷尺：刻度、降级与弹簧', () => {
  it('无 JS 可用：装置默认 hidden + aria-hidden，归档列表服务端渲染完整', () => {
    expect(ARCHIVE_HTML, '先 npm run build').toContain('<aside class="tape"');
    expect(ARCHIVE_HTML).toMatch(/<aside class="tape"[^>]*\bhidden\b/);
    expect(ARCHIVE_HTML).toMatch(/<aside class="tape"[^>]*\baria-hidden="true"/);
    // 列表本体不受装置影响：年份分组 + 文章条目都在
    expect(ARCHIVE_HTML).toMatch(/class="yeargroup"/);
    expect(ARCHIVE_HTML).toMatch(/class="index"/);
  });

  it('刻度从内容推导：年份刻度 == 归档年份分组，无写死年份', () => {
    const tickYears = [...ARCHIVE_HTML.matchAll(/tape-tick is-year"[^>]*data-year="(\d{4})"/g)].map((m) => m[1]);
    const groupYears = [...ARCHIVE_HTML.matchAll(/class="yeargroup"[^>]*data-year="(\d{4})"/g)].map((m) => m[1]);
    expect(tickYears.length, '卷尺没有年份刻度').toBeGreaterThan(0);
    // 卷尺刻度与归档分组是同一份年份（同一数据源，没写死）
    expect([...tickYears].sort()).toEqual([...groupYears].sort());
  });

  it('读数正确：每根年份刻度的 data-count == 该年已发布文章数', () => {
    const counts = yearCounts();
    expect(counts.size, '没有已发布文章，断言会空转').toBeGreaterThan(0);
    const ticks = [...ARCHIVE_HTML.matchAll(/tape-tick is-year"[^>]*data-year="(\d{4})" data-count="(\d+)"/g)];
    expect(ticks.length).toBeGreaterThan(0);
    for (const [, year, count] of ticks) {
      expect(Number(count), `年份 ${year} 的刻度读数不对`).toBe(counts.get(year));
    }
  });

  it('刻度位置是 0~100 的百分比（data-pos 合法，等距分布）', () => {
    const poss = [...ARCHIVE_HTML.matchAll(/data-pos="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
    expect(poss.length).toBeGreaterThan(0);
    for (const p of poss) {
      expect(p, 'data-pos 越界').toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
    // 年份主刻度等距：相邻差相等（单年时只有一根，跳过）
    const yearPoss = [...ARCHIVE_HTML.matchAll(/tape-tick is-year"[^>]*data-pos="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
    if (yearPoss.length >= 3) {
      const step = yearPoss[1] - yearPoss[0];
      for (let i = 1; i < yearPoss.length; i++) {
        expect(Math.abs((yearPoss[i] - yearPoss[i - 1]) - step), '年份刻度不是等距').toBeLessThan(0.01);
      }
    }
  });

  it('移动端 ≤767px 完全隐藏（口径 #9：展示型本轮拍板「不渲染」）', () => {
    // 装置在窄屏断点里 display:none（不是"留极简版"）
    const m = ACSS.match(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.tape\s*\{[\s\S]*?display:\s*none[\s\S]*?\}/);
    expect(m, '缺少 ≤767px 隐藏 .tape 的规则').toBeTruthy();
  });

  it('零随机：游标是确定函数，脚本里没有 Math.random', () => {
    expect(CODE).not.toContain('Math.random');
  });

  it('帧率无关：弹簧吃真实 dt，且用定步长子步积分（无「每帧固定系数」）', () => {
    // 弹簧积分在共享层 rl-core（index-tape 只调用 spring.step(dt)）
    expect(CODE).toContain('spring.step(dt');
    const core = readFileSync('src/scripts/rl-core.ts', 'utf8');
    // 半隐式欧拉 + **定步长**子步：一帧一大步会在 dt ≥ 2/c 时发散（实测踩过，
    // 慢机器上弹簧炸成 NaN），所以按 SPRING_H 切碎再积分。
    expect(core).toMatch(/\/\s*1000/);
    expect(core).toMatch(/SPRING_H/);
    expect(core).toMatch(/v\s*\+=\s*a\s*\*\s*s/);
    expect(core).toMatch(/x\s*\+=\s*v\s*\*\s*s/);
  });

  it('reduced-motion 降级：落到最终态（直接贴目标，不跑 rAF）', () => {
    expect(CODE).toMatch(/prefersReducedMotion|prefers-reduced-motion/);
    expect(CODE).toMatch(/shouldAnimate/);
    // 降级分支：不跑 startLoop，直接 setCursor(targetFor())
    expect(CODE).toMatch(/setCursor\(targetFor\(\)\)/);
  });

  it('装置是叠加层：脚本只读 DOM 增强，不重建列表', () => {
    // 脚本读 .tape-tick / .yeargroup，不创建文章条目
    expect(CODE).toContain('querySelector');
    expect(CODE).not.toContain('innerHTML');
  });
});

/* ★ 2026-10-04：装置被搬进 Base 的 `plate` 槽（`.shell` 之外）。这一组守的是**位置**，
 * 因为位置错了症状极其隐蔽 —— 静态截图完全正常，只有站内导航那 900ms 里跳。
 * 实测：病根不是 transform 而是 `filter: blur()`（pt-shell 18%–58% 那段），
 * `.tape` 的 fixed 包含块因此从视口变成 `.shell` ⇒ 中心 401.0 → 997.0（偏 596px），
 * 读数器正好压到年份刻度上（站主截图里两个「2026」叠在一起）。 */
describe('归档页索引卷尺：必须挂在 .shell 之外（plate 槽）', () => {
  it('markup：.tape 在 plate 槽里，不在默认 slot（否则会落进 .shell）', () => {
    const frag = ACSS.match(/<Fragment\s+slot="plate">[\s\S]*?<\/Fragment>/);
    expect(frag, 'archive.astro 里找不到 plate 槽的 Fragment —— .tape 又落回 .shell 了').toBeTruthy();
    expect(frag![0], 'plate 槽里没有 .tape').toContain('class="tape"');
  });

  it('★ 产物：.tape 在 HTML 里出现在 <main> 之前（=#main/.shell 之外）', () => {
    expect(ARCHIVE_HTML, '先 npm run build').toBeTruthy();
    const at = ARCHIVE_HTML.indexOf('<aside class="tape"');
    const mainAt = ARCHIVE_HTML.indexOf('<main id="main"');
    const shellAt = ARCHIVE_HTML.indexOf('class="shell"');
    expect(at, '产物里找不到 .tape').toBeGreaterThan(-1);
    expect(mainAt, '产物里找不到 <main>').toBeGreaterThan(-1);
    expect(shellAt, '产物里找不到 .shell').toBeGreaterThan(-1);
    // plate 槽在 Base.astro 里渲染于 <main> 之前 ⇒ .tape 的下标必须更小。
    // 这条比读源码更硬：它验的是**浏览器实际看到的 DOM 顺序**，
    // 以后谁改 Base 的槽顺序、或者 Astro 的槽分发改了，这里都会红。
    expect(at, '.tape 排在 <main>/.shell 之后 ⇒ 它在 .shell 里，fixed 包含块会被过渡污染')
      .toBeLessThan(mainAt);
    expect(at).toBeLessThan(shellAt);
  });

  it('仍在正文之上：z-index 高于 body.chrome-page main 的层叠上下文（1）', () => {
    // 槽的注记要求「退到内容之下」只对纯装饰层成立；.tape 要在正文之上，
    // 所以搬出 #main 之后必须靠 z-index 补回层级（Topbar.astro:81-85 给 main/footer z-index:1）。
    const m = ACSS.match(/\.tape\s*\{[\s\S]*?\}/);
    expect(m, '找不到 .tape 的规则块').toBeTruthy();
    // ★ 必须匹配**带分号**的完整声明，不能只抓数字。
    //   本轮真踩到：注释里写「z-index 保持 2」时把声明的分号吞了，变成
    //   `z-index: 20   /* … */ width: 44px` ⇒ 浏览器把 `z-index` 连同 `width` 一起丢弃，
    //   .tape 的 z-index 实际是 auto —— 而「只抓数字」的断言读文本里的 20，照样绿。
    //   ⇒ 判据要**复现浏览器的解析行为**（缺分号 = 这条声明不成立），不是读文本。
    const z = m![0].match(/z-index:\s*(-?\d+)\s*;/);
    expect(z, '.tape 的 z-index 声明不完整（缺分号？）—— 浏览器会把这整条丢掉，z-index 退回 auto').toBeTruthy();
    expect(Number(z![1]), 'z-index 必须高于 main 的 1，否则刻度尺被正文盖住').toBeGreaterThan(1);
  });

  it('fixed 定位与 top:50% 居中写法不变（位置问题的判据就在这两行）', () => {
    const m = ACSS.match(/\.tape\s*\{[\s\S]*?\}/)![0];
    expect(m, '.tape 必须继续用 position:fixed').toContain('position: fixed');
    expect(m, '.tape 必须继续用 top:50% + translateY(-50%) 垂直居中').toMatch(/top:\s*50%/);
    expect(m).toMatch(/transform:\s*translateY\(-50%\)/);
  });

  it('★ 槽的注记与实际用法一致：Base.astro 必须写明 filter 也会建包含块', () => {
    // 这条是给下一个用 plate 槽的人留的：只查 transform 判包含块会漏掉 filter
    // （本轮就漏判过一次，代价是 596px）。
    // ⚠ 锚点用 `<slot name="plate" />` 本身，注记在它**之前**；
    //   早先用 `/plate[\s\S]{0,2000}?<\/slot>/` 量，注记比 2000 字长 ⇒ 匹配到 null，
    //   一度像"注记被删了"。窗口大小是自由度，不是判据。
    const base = readFileSync('src/layouts/Base.astro', 'utf8');
    const at = base.indexOf('<slot name="plate"');
    expect(at, 'Base.astro 里找不到 plate 槽').toBeGreaterThan(-1);
    const note = base.slice(Math.max(0, at - 2000), at);
    expect(note, 'plate 槽的注记不在槽之前（读不到上下文）').toMatch(/filter/);
    expect(note, '注记里没写「要在正文之上也能用」这个例外 —— 下一个人会误以为一律要退后')
      .toMatch(/之上/);
  });
});

describe('共享工具层 rl-core：二阶欠阻尼弹簧', () => {
  it('有阻尼：从偏离位置出发，逐步收敛到目标', () => {
    const s = createSpring(100, { stiffness: 170, damping: 18 });
    s.snap(0); // 位置在 0，目标在 100
    s.retarget(100);
    // 推进足够多步后应逼近目标
    for (let i = 0; i < 500; i++) s.step(16);
    expect(Math.abs(s.value - 100)).toBeLessThan(1);
    expect(s.settled).toBe(true);
  });

  it('欠阻尼：中途会过冲（机械「咔哒」感，与显影板的一阶平滑刻意不同）', () => {
    const s = createSpring(0, { stiffness: 170, damping: 18 });
    s.snap(0);
    s.retarget(100);
    let max = 0;
    for (let i = 0; i < 500; i++) {
      const v = s.step(16);
      if (v > max) max = v;
    }
    // ζ≈0.69 ⇒ 约 6% 过冲，峰值应略超过目标
    expect(max, '弹簧没有过冲（阻尼太大？）').toBeGreaterThan(100.5);
  });

  it('snap 直接落位、retarget 保留速度（松手后从当前速度继续，才有过冲）', () => {
    const s = createSpring(0);
    s.retarget(200);
    s.step(16); // 产生向 200 的速度
    const vBefore = s.value;
    s.retarget(400); // 换目标，速度保留
    expect(s.value).toBe(vBefore); // retarget 不瞬移
    s.snap(0);
    expect(s.value).toBe(0); // snap 瞬移 + 速度归零
  });

  it('帧率无关：dt 不同但推进的总时长相同，结果一致（半隐式欧拉的一致性）', () => {
    const run = (dt: number, steps: number) => {
      const s = createSpring(0, { stiffness: 170, damping: 18 });
      s.snap(0);
      s.retarget(100);
      for (let i = 0; i < steps; i++) s.step(dt);
      return s.value;
    };
    // 8ms×1000 与 16ms×500 都是 8 秒，终点应接近（半隐式欧拉对步长不敏感）
    const a = run(8, 1000);
    const b = run(16, 500);
    expect(Math.abs(a - b)).toBeLessThan(0.5);
  });

  it('大 dt 不发散：慢机器 / 长卡顿（dt=100ms）下仍收敛，不出 NaN / Infinity', () => {
    // 实测踩到的坑：一帧一大步的半隐式欧拉在 dt ≥ 2/c（k=110, c=23 ⇒ ≈87ms）
    // 就发散，而 startLoop 把 dt 钳在 100ms ⇒ 慢机器（软件渲染 / 长卡顿）上
    // 弹簧炸成 Infinity→NaN，滚动进度跟着 NaN，装置直接跳到 0/1 的极端态。
    // 定步长子步（1/120s）修掉了它：ω·h ≈ 0.087、c·h ≈ 0.19，恒在稳定域内。
    const s = createSpring(0, { stiffness: 110, damping: 23 });
    s.snap(0);
    s.retarget(1);
    for (let i = 0; i < 60; i++) s.step(100); // 6 秒，全是 100ms 的大步
    expect(Number.isFinite(s.value), '弹簧发散了（出 NaN/Infinity）').toBe(true);
    expect(Math.abs(s.value - 1)).toBeLessThan(1e-3);
  });
});
