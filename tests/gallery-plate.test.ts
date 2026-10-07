import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 相册「照片陈列」这一族的契约。
 *
 * 站主原话（2026-10-07 重做那一轮）：
 *   「我现在要做相册页下面真正放照片的地方，你去我上面提到的那几个网站去找别人的 gallery
 *     是怎么做的，要求**高级，不是平铺直叙的**」
 *   「Curated Design / Land-book / awwwards / SiteInspire / 花瓣网，去这几个网站找别人的获奖作品」
 *   「**你来决定什么更适合本站，什么更高级，直接做**」
 * ⇒ 拍板四笔：① 按相册分「板」② 板内错缝砖墙 ③ 一律不裁图 ④ 框内编目号。
 *
 * ★★ 2026-10-07 第二轮（站主）：陈列区**一分为二**
 *   「**下面不放现在全部铺开的，放入口**……点击放大的照片就**进入这个文件夹**，
 *    就像现在本站的照片砖墙一样，**不过是单独的一页**」
 *   ⇒ `/gallery` = **入口页**：一册一条「板头 + 手风琴照片条」（`src/components/AlbumRow.astro`）；
 *     砖墙 + 灯箱整块搬去每册自己的页面 `/gallery/<册名>/`（`src/components/PhotoWall.astro`，
 *     由 `src/pages/gallery/[album].astro` 一册一页地渲染）。
 *   ⇒ **本文件的断言一条没变**（守的还是"分板 / 编目 / 错缝 / 不裁 / 编目号"这些性质），
 *     变的是它们**盯的对象**：板头与编目位次盯入口条，砖墙那几条盯相册页。
 *     ★ 不许把它们改成"扫全站"——那样任何一处改动都会牵动所有断言，
 *       一条红起来也说不清是谁坏的（本轮真正的改动动机就是这个）。
 *
 * 下面守的是「不可退让的性质」，不是「上一版的实现形态」：
 *   ① **分板**：一个相册一块板，板头是一行编目读数（板号 · 相册名 · 帧数 · 日期）。
 *      板数是**相册数**（从 manifest 读，不写死 3）—— 加一个相册不该红。
 *   ② **板号是固定编目位次**（相册在清单里的位次），不是"当前可见第几块"；
 *      编目号 NO.001 是**按册**三位零填充，每册都从 001 起。
 *   ③ ★★ **错缝必须是 `margin-top`，不许是 `transform`** —— transform 不占位，
 *      网格算行高时按"没下沉"算，下沉那一列会咬到下一行上；margin 占位才是真错缝。
 *   ④ ★★ **错缝档位必须是百分比**（按格宽解析）⇒ 4/3/2 列三档自动等比缩放。
 *   ⑤ ★ **档案视图一律不裁图**：砖墙那整块**没有** `object-fit`。
 *      ★ 2026-10-07 起这条**只管档案视图**：入口条的细条**必须**裁
 *        （十几 px 宽的槽要的是"照片的一条竖切面"，见 `AlbumRow` 里那段注释）。
 *   ⑥ ★ 每格是 **1:1 方槽**（`aspect-ratio: 1`）+ 图居中 contain。
 *   ⑦ ★ `.wf` 类名与「figure 是它的后代」**都不能动** —— 有门闩按这段切片核对。
 *   ⑧ 零新增运行时依赖 / 零外部资源（红线）。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'gallery', 'index.html'));

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** 剥两类注释：Astro 模板里的 JSX 块注释、以及 <style> 里的 CSS 块注释。
 *  顺序有讲究：先剥 JSX —— 它内部若含 CSS 块注释，先剥 CSS 的会把 JSX 那个切碎。 */
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
/** 只取 `<script>` 里的那几行 JS。
 *  「运行时不许改板号」这类断言必须剥掉样式块 —— CSS 里本来就有 `.plate-no` 这些选择器。 */
const scriptsOf = (s: string) =>
  [...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

/* ★★ 两个消费方 / 两个居住地（2026-10-07 起）：
   · 入口页 `/gallery`          → 板头 + 手风琴条（AlbumRow）
   · 相册页 `/gallery/<册名>/`  → 砖墙 + 灯箱（PhotoWall） */
const GAL_SRC = read('src/pages/gallery/index.astro');
const ROW_SRC = read('src/components/AlbumRow.astro');
const WALL_SRC = read('src/components/PhotoWall.astro');
const ALBUM_SRC = read('src/pages/gallery/[album].astro');
const GAL_CODE = strip(GAL_SRC);
const ROW_CODE = strip(ROW_SRC);
/** 砖墙那一整份（错缝 / 方槽 / 不裁图 / 编目号 那几条都盯着它）。
 *  ★ 2026-10-07 之前它指的是 `src/pages/gallery/index.astro` —— 搬运之后不能再指那里，
 *    否则所有"源码里有没有某条规则"的断言都会恒假（那是最没价值的红）。 */
const WALL_CODE = strip(WALL_SRC);

const MANIFEST = JSON.parse(read('public/gallery/manifest.json')) as {
  widths: number[];
  albums: { id: string; title: string; date: string; total: number; frames: { alt: string }[] }[];
};
const ALBUMS = MANIFEST.albums;
const TOTAL = ALBUMS.reduce((n, a) => n + a.total, 0);

/* ★ Astro 会给**每段被作用域样式命中的选择器**补 `[data-astro-cid-xxxx]`
   （编译出来是 `.plate[hidden][data-astro-cid-…]{…}`）。断言"某个声明在不在"时
   把这层作用域剥掉再匹配 —— 否则写对的规则也会因为多了一段属性而匹配不上。
   ⚠ 只在**读值**时剥；"产物里确实带着作用域"这件事由 astro 自己保证。 */
const DEO = (s: string) => s.replace(/\[data-astro-cid-[a-z0-9]+\]/g, '');

/* ⚠ 产物 CSS 的分片名带内容哈希（每构建一次就变）⇒ 不写死文件名。
   ★★ 2026-10-07：不能再按"哪份 CSS 里有 .plate-body"去找文件了 ——
      板头（入口条）与砖墙（相册页）是**不同页面**的样式，
      Astro 会把它们打进**不同的** CSS 分片 ⇒ 一个字分片里找不全。
      改成把产物里**全部** CSS 拼起来查（查的是"这条规则在不在产物里"，与分片无关）。 */
const ALL_CSS = DEO(
  hasDist
    ? readdirSync(join(DIST, '_astro'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => readFileSync(join(DIST, '_astro', f), 'utf8'))
        .join('\n')
    : '',
);
const PAGE_CSS = ALL_CSS;

/** 入口页产物 */
const GAL = hasDist ? readFileSync(join(DIST, 'gallery', 'index.html'), 'utf8') : '';
/** 相册页产物（一册一份）—— 逐册按 id 取，取不到就空串（下面有 hasDist 的显式断言）。 */
const wallHtml = (id: string) => {
  const p = join(DIST, 'gallery', id, 'index.html');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
};

/** 一块板的整段标记（板里没有嵌套 <section>，所以取到第一个 </section> 即止） */
const plateSegs = (h: string) =>
  [...h.matchAll(/<section class="plate"[\s\S]*?<\/section>/g)].map((m) => m[0]);
const GAL_PLATES = plateSegs(GAL);

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');

describe('相册 · 入口条（分板契约）', () => {
  it('★ 板数 = 相册数（不写死），且按清单位次一块对一册', () => {
    expect(ALBUMS.length, '相册表空了？').toBeGreaterThan(0);
    for (const a of ALBUMS) {
      expect(a.total, `相册「${a.title}」的 total(${a.total}) 与 frames 长度(${a.frames.length}) 不一致 ⇒ 板头会印错数`).toBe(
        a.frames.length,
      );
    }
    expect(hasDist, '先 npm run build').toBe(true);
    expect(GAL_PLATES.length, `入口条数应等于相册数 ${ALBUMS.length}`).toBe(ALBUMS.length);
    GAL_PLATES.forEach((seg, i) => {
      const a = ALBUMS[i];
      expect(seg, `第 ${i + 1} 条入口的 data-plate 不是「${a.id}」`).toContain(`data-plate="${a.id}"`);
      expect(seg, `第 ${i + 1} 条入口的 aria-labelledby 没指向 plate-${i + 1}`).toContain(`aria-labelledby="plate-${i + 1}"`);
      expect(seg, `板头 h2 缺 id="plate-${i + 1}"`).toContain(`id="plate-${i + 1}"`);
      /* 顺序 = 清单顺序 ⇒ 「板 01」确实是最新加进清单那一册的相对位次 */
      expect(seg.indexOf(a.title), `第 ${i + 1} 条入口里找不到相册名「${a.title}」`).toBeGreaterThan(-1);
    });
  });

  it('★ 板头是一行完整编目读数（板号 · 相册名 · 帧数 · 日期）', () => {
    expect(PAGE_CSS, '缺 .plate-no 的样式').toContain('.plate-no');
    expect(PAGE_CSS, '缺 .plate-title 的样式').toContain('.plate-title');
    expect(PAGE_CSS, '缺 .plate-meta 的样式').toContain('.plate-meta');
    GAL_PLATES.forEach((seg, i) => {
      const a = ALBUMS[i];
      expect(seg, `第 ${i + 1} 条入口缺「板 ${pad2(i + 1)}」`).toContain(`板 ${pad2(i + 1)}`);
      expect(seg, `第 ${i + 1} 条入口缺帧数${a.total} 帧`).toContain(`${a.total} 帧`);
      expect(seg, `第 ${i + 1} 条入口缺日期 ${a.date}`).toContain(a.date);
      /* 板号两位零填充（<10 册时要读成 板 01，不是 板 1） */
      expect(seg, `板号没零填充：板 ${pad2(i + 1)}`).toMatch(new RegExp(`板 ${pad2(i + 1)}(?![\\d])`));
    });
  });

  it('★★ 板号是**固定编目位次**（清单里的 i + 1），不是"当前可见第几块"', () => {
    /* ★ 2026-10-07：板号由**入口页**按清单下标传进去（`no={i + 1}`），入口条只负责印它 ——
       所以两处都要钉住：传的是下标 +1，印的是两位零填充。
       旧版那条"筛选里不许重写板号"的断言随筛选一起作废（入口页已经没有筛选了），
       换成等价的一条：**运行时脚本不许碰板号**。 */
    expect(GAL_CODE, '板号必须取相册在清单里的固定位次（i + 1）').toMatch(/<AlbumRow album=\{a\} no=\{i \+ 1\} \/>/);
    expect(ROW_CODE, '入口条必须印传进来那个位次').toMatch(/板 \{pad2\(no\)\}/);
    expect(ROW_CODE, '板号要两位零填充（板 01，不是板 1）').toMatch(/padStart\(2, '0'\)/);
    expect(
      scriptsOf(ROW_SRC) + scriptsOf(GAL_SRC),
      '运行时脚本不许碰板号（板号是编目位次，一旦被"当前第几块"改写，语义就丢了）',
    ).not.toContain('plate-no');
    expect(scriptsOf(GAL_SRC), '入口页的脚本不该重建 DOM（只有手风琴状态类那点事）').not.toContain('innerHTML');
  });

  it('★★ 一册一条：每条挂的是**本册**的照片，且素材池钩子齐全', () => {
    /* 这条替掉的是上一版的「空板会被一起收起」—— 那个风险随筛选一起消失了
       （现在"筛到单册"就是"进那一册的页面"，页内没有可筛的东西）。
       换来的是新结构真正会坏的地方：**三条并列，串册/漏册是最容易犯的错**。 */
    expect(hasDist, '先 npm run build').toBe(true);
    /* ★★★ 素材池钩子（显影板的取片源）要在**两个层次**各钉一次，且必须带**属性边界**。
       ★ 为什么必须带边界：`toContain('data-bath-src')` 连 `data-bath-src-x` 都放行，
         而 develop.ts 那边订的是精确选择器 `[data-bath-src] figure` —— 差一个字符
         就整块失灵，且是**静默**的（板里不出底图，要划过才出来，看着像"随机没生效"）。
       ★ 为什么要盯**源文件**：上面 `GAL_PLATES` 取的是 dist ⇒ 只判产物的话，
         改坏源文件而没重新构建是**永远绿**的（2026-10-07 的变异验证正是栽在这里）。
         用**剥过注释**的 `ROW_CODE`：注释里也写着这个词，否则"注释满足断言"就是假绿。 */
    expect(
      (ROW_CODE.match(/data-bath-src(?![-\w])/g) ?? []).length,
      'AlbumRow 源文件里 data-bath-src 应恰好出现 1 次（容器那一个；注释里的不算）',
    ).toBe(1);
    GAL_PLATES.forEach((seg, i) => {
      const a = ALBUMS[i];
      /* ★ 2026-10-07 第二轮：一条里**最多 15 张**（等距抽样，含首尾）——
         原来是一条 = 整册每一帧，57 帧那册每条只有 12.2px（目检：连成彩色锯齿）。
         抽样本身的性质（上限 / 含首尾 / 去重 / 编号是真实序号）在
         tests/gallery-album-row.test.ts 里逐条钉；这里只钉**结构自洽**。 */
      const k = Math.min(15, a.total);
      expect(seg, `第 ${i + 1} 条入口的图没有挂本册 id（串册了）`).toContain(`data-album="${a.id}"`);
      expect((seg.match(/class="ar-item"/g) ?? []).length, `第 ${i + 1} 条应有 ${k} 张（上限 15）`).toBe(k);
      expect(
        (seg.match(new RegExp(`data-album-title="${a.title}"`, 'g')) ?? []).length,
        `第 ${i + 1} 条里带本册名的 figure 数不对（灯箱与显影板的读数都读它）`,
      ).toBe(k);
      expect(seg, `第 ${i + 1} 条缺 data-bath-src（显影板的素材池钩子）`).toMatch(/data-bath-src(?![-\w])/);
    });
    /* 产物侧复核：源码有、构建期被摇掉也是一种坏法（比如挪进被 tree-shake 的分支）。 */
    expect(
      (GAL.match(/data-bath-src(?![-\w])/g) ?? []).length,
      '产物里素材池钩子应每册一个',
    ).toBe(ALBUMS.length);
    /* 反向正对照：入口页**不再**有砖墙与筛选（砖墙整块搬去了相册页） */
    expect(GAL, '入口页不该再出现砖墙（.wf）').not.toContain('class="wf"');
    expect(GAL, '入口页不该再出现筛选条').not.toContain('class="filters"');
  });
});

describe('相册屏 · 错缝砖墙契约', () => {
  it('★★ 错缝是 `margin-top`，**不是** `transform`（transform 不占位 ⇒ 会咬到下一行）', () => {
    /* 源码层 */
    const stagger = [...WALL_CODE.matchAll(/:nth-child\((4n \+ 2|4n \+ 4|3n \+ 2|2n \+ 2)\)[^{]*\{([^}]*)\}/g)];
    expect(stagger.length, '没读到错缝那几条 nth-child 规则').toBeGreaterThanOrEqual(4);
    for (const m of stagger) {
      const [, nth, body] = m;
      expect(body, `:nth-child(${nth}) 的错缝块里没有 margin-top`).toMatch(/margin-top:/);
      expect(body, `:nth-child(${nth}) 用了 transform ⇒ 不占位，会压到下一行上`).not.toMatch(/transform|translate/);
    }
    /* 产物层（防"源码对、编译后被改写"）：把产物 CSS 里所有 figure 的 nth-child 规则块捞出来逐条查 */
    expect(PAGE_CSS, '产物里没有 .plate-body 的规则 —— 构建掉链子了').toContain('.plate-body');
    const distRules = [...PAGE_CSS.matchAll(/\.plate-body[^{]*?figure[^{]*?:nth-child\([^)]*\)[^{]*\{([^}]*)\}/g)].map(
      (m) => m[1],
    );
    expect(distRules.length, '产物里没读到错缝规则').toBeGreaterThanOrEqual(4);
    for (const b of distRules) {
      expect(b, '产物里的错缝块没有 margin-top').toMatch(/margin-top:/);
      expect(b, '产物里的错缝用了 transform ⇒ 会咬行').not.toMatch(/transform|translate/);
    }
  });

  it('★★ 错缝档位是**百分比**（按格宽解析 ⇒ 三档自动等比缩放）', () => {
    expect(WALL_CODE, '--stagger 必须是百分比（写死长度就得为每个断点重算一遍）').toMatch(/--stagger:\s*[\d.]+%/);
    const pcts = [...WALL_CODE.matchAll(/--stagger:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(pcts.length, '三档断点各要有一档 --stagger').toBeGreaterThanOrEqual(3);
    for (const v of pcts) {
      expect(v, `--stagger ${v}% 太小读不出砖（第一版 16% 就被读成"没对齐"）`).toBeGreaterThanOrEqual(15);
      expect(v, `--stagger ${v}% 太大 ⇒ 一列能滑出去半格以上`).toBeLessThanOrEqual(60);
    }
    /* ★ 幅度必须真的动过：不能三档都是同一个数（2 列时 45% 是半屏的跳动） */
    expect(Math.min(...pcts), '窄档必须比宽档小（格宽变了，同一百分比的手感差很多）').toBeLessThan(Math.max(...pcts));
  });

  it('★ 三档列数：4 / 3 / 2，且每档都要**先归零旧周期再写新周期**', () => {
    expect(WALL_CODE, '缺 4 列基准').toMatch(/grid-template-columns:\s*repeat\(4,\s*1fr\)/);
    const q1180 = WALL_CODE.slice(WALL_CODE.indexOf('@media (max-width: 1180px)'), WALL_CODE.indexOf('@media (max-width: 680px)'));
    const q680 = WALL_CODE.slice(WALL_CODE.indexOf('@media (max-width: 680px)'));
    expect(q1180, '1180 档没换成 3 列').toMatch(/grid-template-columns:\s*repeat\(3,\s*1fr\)/);
    expect(q680, '680 档没换成 2 列').toMatch(/grid-template-columns:\s*repeat\(2,\s*1fr\)/);
    /* ★ 不归零就会出现"有的列下沉、有的不下沉"（4 列的 4n+2 落在 3 列布局里是一组乱序） */
    for (const [where, block, oldPeriod] of [
      ['1180 档', q1180, '4n \\+ 2'],
      ['680 档', q680, '3n \\+ 2'],
    ] as const) {
      const zero = new RegExp(`:nth-child\\(${oldPeriod}\\)[^{]*\\{[^}]*margin-top:\\s*0`, 's');
      expect(block, `${where}没把旧周期的错缝归零 ⇒ 会出现半列下沉`).toMatch(zero);
    }
  });

  it('★★ 方槽 + 格内 contain：没有它行高会被最高竖图撑开、横图下留一片横向白带', () => {
    const frame = WALL_CODE.match(/\.plate-body \.frame\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(frame, '没读到 .plate-body .frame 的样式块').toBeTruthy();
    expect(frame, '缺 1:1 方槽（第一版的硬伤就是没写它）').toMatch(/aspect-ratio:\s*1/);
    expect(frame, '图要居中（contain 靠 flex 居中 + max-*:100% 实现）').toContain('align-items: center');
    expect(frame, '图要居中').toContain('justify-content: center');
    const img = WALL_CODE.match(/\.plate-body img\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(img, '没读到 .plate-body img 的样式块').toBeTruthy();
    expect(img, '图宽必须吃满格').toMatch(/max-width:\s*100%/);
    expect(img, '图高必须吃满格').toMatch(/max-height:\s*100%/);
    /* ★★ align-items:start 必须写：默认的 stretch 把矮 figure 拉高，图就跟格子脱开 */
    const body = WALL_CODE.match(/\.plate-body\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(body, '缺 align-items:start ⇒ 默认 stretch 会把矮 figure 拉高、图与格脱开').toMatch(/align-items:\s*start/);
  });

  it('★★ 档案视图一律不裁图：砖墙那整块**没有** `object-fit`', () => {
    /* 剥过注释再查 —— 注释里**故意**写着「`object-fit:cover` …明确没采用」，那是解释自己没做的事。 */
    expect(WALL_CODE, '砖墙出现了 object-fit ⇒ 图会被裁（本站是档案不是社交相册）').not.toMatch(/object-fit/);
    /* 正对照：图确实是 contain（靠 max-width/max-height + 居中，不是靠 object-fit） */
    expect(WALL_CODE, '图没写 width/height:auto ⇒ 会被方槽拉变形').toMatch(/\.plate-body img\s*\{[^}]*height:\s*auto/);
    /* ★★ 边界必须写清楚（2026-10-07）：**入口条的细条反而是必须裁的** ——
       十几 px 宽的槽里要的是"照片的一条竖切面"，contain 会把整张照片压成一根发丝。
       ⇒ 这条断言只管档案视图；入口条那侧的 `object-fit: cover` 由下面这行**显式认领**。 */
    expect(ROW_CODE, '入口条那侧应当**明确**用 cover 裁（细条的切面就是这么来的）').toMatch(
      /\.ar-frame img\s*\{[^}]*object-fit:\s*cover/,
    );
  });

  it('★ `.wf` 退化成纯容器（版面全在 .plate-body，不在这里打架）', () => {
    const wf = WALL_CODE.match(/(^|\n)\s*\.wf\s*\{([^}]*)\}/)?.[2] ?? '';
    expect(wf, '没读到 .wf 的样式块').toBeTruthy();
    expect(wf, '`.wf` 只该有 display:block（+ 与上面的呼吸），不该自己做版面').not.toMatch(/grid|column-count|flex/);
  });
});

describe('相册 · 编目号与图下说明', () => {
  it('★ 编目号 NO.xxx：按册三位零填充、每册从 001 起、钉在框内左下角', () => {
    expect(WALL_CODE, '编目号必须三位零填充（String(fi + 1).padStart(3, "0")）').toMatch(
      /NO\.\{String\(fi \+ 1\)\.padStart\(3, '0'\)\}/,
    );
    expect(PAGE_CSS, '缺 .no 的样式').toContain('.plate-body .no');
    const no = WALL_CODE.match(/\.plate-body \.no\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(no, '编目号要钉在框内**左下角**').toMatch(/left:\s*[\d.]+rem[\s\S]*?bottom:\s*[\d.]+rem/);
    expect(no, '编目号底必须是纸白（不能压在照片上把图压暗）').toMatch(/background:\s*var\(--paper\)/);
    expect(WALL_SRC, '编目号要与图下的 alt 去重 ⇒ 必须 aria-hidden').toMatch(/<span class="no" aria-hidden="true">/);

    expect(hasDist, '先 npm run build').toBe(true);
    for (const a of ALBUMS) {
      const segs = plateSegs(wallHtml(a.id));
      expect(segs.length, `相册页 /gallery/${a.id}/ 应恰好一块板`).toBe(1);
      const nos = [...segs[0].matchAll(/NO\.(\d{3})/g)].map((m) => m[1]);
      expect(nos.length, `「${a.title}」板里有 ${nos.length} 个编目号，应为 ${a.total}`).toBe(a.total);
      expect(nos[0], `「${a.title}」必须**从 001 起**（按册编号，不接上一册接着数）`).toBe('001');
      expect(nos[nos.length - 1], `「${a.title}」最后一个编目号应是 ${pad3(a.total)}`).toBe(pad3(a.total));
      /* 编号连续且不重复 —— 用集合去重后应恰好等于 total */
      expect(new Set(nos).size, `「${a.title}」的编目号有重复/跳号`).toBe(a.total);
    }
  });

  it('★ 图下只留 alt（相册名已提到页头/板头，不再重复几十遍）', () => {
    for (const a of ALBUMS) {
      const h = wallHtml(a.id);
      const figs = [...h.matchAll(/<figure data-album=[\s\S]*?<\/figure>/g)].map((m) => m[0]);
      expect(figs.length, `/gallery/${a.id}/ 应有 ${a.total} 个 figure`).toBe(a.total);
      for (const f of figs) {
        /* ⚠ `[^>]*`：Astro 会给 figcaption 也挂上 `data-astro-cid-…` */
        const cap = f.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/)?.[1] ?? '';
        expect(cap, '图下说明不该再有 <span>（相册名在页头）').not.toContain('<span');
        expect(cap.trim(), '图下说明不能为空（alt 是站主写的短句）').not.toBe('');
      }
      expect(h, 'figcaption 里混进了相册名 ⇒ 又变回每张图重复一遍').not.toMatch(/<figcaption[^>]*>[^<]*<span/);
    }
  });

  it('★★ 灯箱的相册名从 data-album-title 读（抓 figcaption span 会得到空串）', () => {
    /* ★ 切片必须到**砖墙那一段**再数：相册页上另有 82 个 `.sp-*`（不，这一页没有装置）——
       真正要防的是"把别的 figure 也算进来"，所以按 `.wf` → `.lb` 切。 */
    for (const a of ALBUMS) {
      const h = wallHtml(a.id);
      const wfAt = h.indexOf('class="wf"');
      const lbAt = h.indexOf('class="lb"');
      expect(wfAt, `.wf 不见了（/gallery/${a.id}/）`).toBeGreaterThan(-1);
      expect(lbAt, `.lb 不见了（/gallery/${a.id}/）`).toBeGreaterThan(wfAt);
      const WF = h.slice(wfAt, lbAt);
      expect((WF.match(/data-album-title="/g) ?? []).length, `「${a.title}」每个 figure 都要带 data-album-title`).toBe(
        a.total,
      );
      expect(WF, `「${a.title}」的 data-album-title 不是相册名`).toContain(`data-album-title="${a.title}"`);
    }
    expect(WALL_CODE, '灯箱必须从 dataset.albumTitle 读相册名').toMatch(/lbAlbum\.textContent\s*=\s*fig\.dataset\.albumTitle/);
    expect(WALL_CODE, '不许再抓 figcaption span（那个 <span> 已经不存在了 ⇒ 会静默变空串）').not.toMatch(
      /querySelector\('figcaption span'\)/,
    );
  });
});

describe('相册 · 与页面其他部分的互锁', () => {
  it('★★ 砖墙的 figure 全落在 `.wf` 这一段内，且显影板要的钩子都在', () => {
    /* 显影板那一侧盯的是它自己脚本里的选择器（tests/develop-bath.test.ts）；这里盯**标记这一侧**：
       重排结构时若把 .wf 挪到 figure 之外，那边的断言照样绿，只有这条会红。 */
    expect(hasDist, '先 npm run build').toBe(true);
    for (const a of ALBUMS) {
      const h = wallHtml(a.id);
      const wfAt = h.indexOf('class="wf"');
      const lbAt = h.indexOf('class="lb"');
      expect(wfAt, `.wf 容器不见了（/gallery/${a.id}/）`).toBeGreaterThan(-1);
      expect(lbAt, `.lb 应排在 .wf 之后`).toBeGreaterThan(wfAt);
      const chunk = h.slice(wfAt, lbAt);
      expect((chunk.match(/<figure data-album=/g) ?? []).length, `「${a.title}」的 ${a.total} 张图必须都在 .wf 里`).toBe(
        a.total,
      );
      expect((chunk.match(/class="plate-body"/g) ?? []).length, '板身必须都在 .wf 里').toBe(1);
      /* 反向正对照：几个钩子还在 */
      expect(chunk, '缺 a.frame 的 href（大图档）').toMatch(/<a class="frame" href="[^"]+" data-no-transition/);
      expect(chunk, '缺 data-cap').toContain('data-cap="');
    }
    /* ★★ 入口页那一侧的素材池：显影板订的是 `[data-bath-src] figure`（见 develop.ts）。
       ★ 2026-10-07 第二轮：入口条改**等距抽样、上限 15** ⇒ 这里不再是全站帧数之和，
         而是 `Σ min(15, total)`。素材池小了一半（40 / 82）——
         这是"少图"的直接后果，但显影板要的是"随便挑一张横幅"，40 张足够。 */
    const POOL = ALBUMS.reduce((n, a) => n + Math.min(15, a.total), 0);
    expect((GAL.match(/<figure class="ar-item"/g) ?? []).length, `入口页应有 ${POOL} 个素材 figure`).toBe(POOL);
  });

  it('★ 缩略图链接仍是 data-no-transition（灯箱接管这次点击，页面蒙版必须放行）', () => {
    for (const a of ALBUMS) {
      const frames = [...wallHtml(a.id).matchAll(/<a class="frame"[^>]*>/g)].map((m) => m[0]);
      expect(frames.length, `/gallery/${a.id}/ 应有 ${a.total} 条缩略图链接`).toBe(a.total);
      for (const el of frames) {
        expect(el, '缩略图链接缺 data-no-transition ⇒ 蒙版会盖在灯箱上').toContain('data-no-transition');
      }
    }
    /* ★ 反向正对照：入口条那张**不能**加 data-no-transition —— 它是真跳转，
       页面过渡必须照常走（加了就会"点了没反应"）。 */
    expect(ROW_CODE, '入口条是真换页 ⇒ 不该带 data-no-transition').not.toContain('data-no-transition');
  });
});

describe('相册 · 红线与预算', () => {
  it('零新增运行时依赖 / 零外部资源', () => {
    const pkg = JSON.parse(read('package.json'));
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.length, `dependencies 应恰好 3 个，实际 ${deps.length}`).toBe(3);
    expect(deps).toEqual(expect.arrayContaining(['astro', '@astrojs/rss', '@astrojs/sitemap']));
    /* ★ 这一族现在有 4 个文件 ⇒ 一起查。剥过注释再查（注释里会引用参考站域名）。
       ⚠ 判据必须是"真会去取的那种 URL"（src=/href=/url(http…)），不能裸查 `https?://`
         —— 显影板那层胶片颗粒是**内联 SVG 的 data URI**，它的 XML 命名空间就写着
         `http://www.w3.org/2000/svg`（一个请求都不发）。裸查会把自包含的写法判成外部依赖。 */
    const all = [GAL_CODE, ROW_CODE, WALL_CODE, strip(ALBUM_SRC)].join('\n');
    expect(all, '出现了外部资源引用（src/href）').not.toMatch(/(?:src|href)=["']https?:/i);
    expect(all, '样式里出现了外部 url()').not.toMatch(/url\(\s*["']?https?:/i);
  });

  it('★ 颜色只用 token（新增部分不许出现字面色值）', () => {
    /* 砖墙那一段：切到**灯箱那一段为止** —— `.lb` 里本来就有 `rgb(26 26 26 / 92%)`
       这类取色，切到文件尾会把灯箱的写法算到陈列区头上。 */
    const wallCss = WALL_CODE.slice(WALL_CODE.indexOf('.plate {'), WALL_CODE.indexOf('.lb {'));
    expect(wallCss.length, '没切到砖墙那一段样式（上下界都没找着？）').toBeGreaterThan(400);
    expect(wallCss, '切片越界：把灯箱的样式也切进来了 ⇒ 这条断言失去意义').not.toContain('.lb-');
    expect(wallCss, '砖墙样式里出现了字面色值').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(wallCss, '砖墙样式里出现了 rgba()（alpha 由 8 位 hex 承载）').not.toMatch(/\brgba?\(/);

    /* 入口条那一段：从板头到文件尾（它的样式块里没有深底，所以没有合法的字面色值）。
       ⚠ 结尾是 `<script>` —— 剥过注释的 JS 里也不该有 `#rgb` / `rgb()`。 */
    const rowCss = ROW_CODE.slice(ROW_CODE.indexOf('.plate {'));
    expect(rowCss.length, '没切到入口条那一段样式').toBeGreaterThan(400);
    expect(rowCss, '入口条样式里出现了字面色值').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(rowCss, '入口条样式里出现了 rgba()（alpha 由 8 位 hex 承载）').not.toMatch(/\brgba?\(/);

    /* 占位的极淡绿洗用的是既有 token，不是新造的 */
    const tokens = read('src/styles/tokens.css');
    expect(tokens, 'tokens.css 里没有 --deco-plate-fine').toContain('--deco-plate-fine');
    expect(tokens, '--deco-plate-fine 必须是 --accent(#2d7d46) 压 alpha 的 6% 档').toMatch(
      /--deco-plate-fine:\s*#2d7d46[0-9a-f]{2}/,
    );
    expect(ROW_CODE, '入口条的占位底必须用 token').toMatch(/background:\s*var\(--deco-plate-fine\)/);
    expect(WALL_CODE, '砖墙的占位底必须用 token').toMatch(/background:\s*var\(--deco-plate-fine\)/);
  });
});
