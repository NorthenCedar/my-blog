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
 *      硬断言：齿高取值数 ≥ 8 且 max/min ≥ 4。哪天被"优化"成等长齿，它退化成卷尺，当场红。
 *   ③ **一格一读数、日格是真锚点** —— 不许出现死锚（指向不存在的 id）或重复 id。
 *   ④ 装饰层必须挂 `.shell` **之外**（plate 槽）—— `.shell` 在页面过渡里会被 transform，
 *      被 transform 的祖先会成为 `position: fixed` 的包含块（关于页实测跳 91px）。
 *   ⑤ 底纹取宽守**性质**不守数字：所有 vw 值必须 < 100（出血档在两张素材上不是一件事）。
 *   ⑥ 零新增运行时依赖（红线）。
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
  it('齿数 = 条目数（从 content/pages/log.md 数出来，不写死）', () => {
    expect(ITEMS.length).toBeGreaterThan(0);
    expect(readToothHeights().length).toBe(ITEMS.length);
  });

  it('日格数 = 内容跨度天数；空格（当天 0 版）画成虚线短柱', () => {
    expect((PAGE.match(/class="chrono-day"/g) ?? []).length).toBe(SPAN_DAYS);
    expect((PAGE.match(/class="chrono-empty"/g) ?? []).length).toBe(EMPTY_DAYS);
  });

  it('逐格齿数与内容一一对应（顺序：左 = 最早）', () => {
    const cells = [...PAGE.matchAll(/<a class="chrono-day"[^>]*>([\s\S]*?)(?=<a class="chrono-day"|<\/svg>)/g)].map(
      (m) => (m[1].match(/class="chrono-tooth"/g) ?? []).length,
    );
    expect(cells.length).toBe(SPAN_DAYS);
    expect(cells).toEqual(PER_DAY.map((d) => d.length));
  });

  it('★ 齿长随数据变 —— 取值数 ≥ 8 且 max/min ≥ 4（这一条就是它和卷尺的分野）', () => {
    const hs = readToothHeights();
    const distinct = new Set(hs).size;
    const max = Math.max(...hs);
    const min = Math.min(...hs);
    expect(distinct, `齿高只有 ${distinct} 种取值 —— 等长齿就是卷尺，本台的身份证没了`).toBeGreaterThanOrEqual(8);
    expect(max / min, `最矮齿 ${min} / 最高齿 ${max} 拉不开`).toBeGreaterThanOrEqual(4);
    // 齿高必须真的是"改动项数"的函数：同一项数 ⇒ 同一齿高；不同项数 ⇒ 不同齿高
    /* ⚠ 配对顺序：`hs` 是**产物里齿的出现顺序**（左 = 最早），`ASC` 才是同序的；
       `ITEMS` 是文档顺序（新→旧），拿它配 `hs` 会错位（本轮实测踩到的假失败）。 */
    const byChanges = new Map<number, Set<number>>();
    ASC.forEach((it, i) => {
      const set = byChanges.get(it.changes) ?? new Set<number>();
      set.add(hs[i]);
      byChanges.set(it.changes, set);
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

  it('★ 零 JS：本页没有任何装置脚本（这是它最可贵的性质，别被"顺手加点交互"破掉）', () => {
    expect(CODE, 'log.astro 里出现了 <script> —— 走时仪本就该零 JS').not.toMatch(/<script/);
    expect(CODE, '不许引装置脚本（它连 rl-core 都不需要）').not.toMatch(/from '\.\.\/scripts\//);
    expect(CODE).not.toMatch(/\brl-core\b/);
    expect(CODE, '不许出现 canvas / rAF —— 那不是本台的机制').not.toMatch(/canvas|requestAnimationFrame/);
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
    /* ★ 产物里查那**压缩后**的写法 —— 但别假定它在 `_astro/*.css` 里：
       Astro 会按体积决定**内联**还是外链，本页是小页 ⇒ 规则直接躺在 HTML 的 `<style>` 里
       （本轮实测：`dist/_astro/` 下根本没有 log 的 css，只有 talks/about/index/Base）。
       ⇒ 在两个地方都找，找不到才红。 */
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
