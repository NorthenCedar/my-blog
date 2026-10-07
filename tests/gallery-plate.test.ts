import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 相册页「照片陈列区」2026-10-07 这一轮重做的契约。
 *
 * 站主原话：
 *   「我现在要做相册页下面真正放照片的地方，你去我上面提到的那几个网站去找别人的 gallery
 *     是怎么做的，要求**高级，不是平铺直叙的**」
 *   「Curated Design / Land-book / awwwards / SiteInspire / 花瓣网，去这几个网站找别人的获奖作品」
 *   「**你来决定什么更适合本站，什么更高级，直接做**」
 * ⇒ 拍板四笔：① 按相册分「板」② 板内错缝砖墙 ③ 一律不裁图 ④ 框内编目号。
 *   参考实现与取舍（含明确放弃的那四项）写在 docs/site-decisions.md。
 *
 * 这里守的是「不可退让的性质」，不是「上一版的实现形态」：
 *   ① **分板**：一个相册一块板，板头是一行编目读数（板号 · 相册名 · 帧数 · 日期）。
 *      板数是**相册数**（从 manifest 读，不写死 3）—— 加一个相册不该红。
 *   ② **板号是固定编目位次**（相册在清单里的位次），筛选时**不重编号**；
 *      编目号 NO.001 是**按册**三位零填充，每册都从 001 起。
 *   ③ ★★ **错缝必须是 `margin-top`，不许是 `transform`** —— transform 不占位，
 *      网格算行高时按"没下沉"算，下沉那一列会咬到下一行上；margin 占位才是真错缝。
 *   ④ ★★ **错缝档位必须是百分比**（按格宽解析）⇒ 4/3/2 列三档自动等比缩放；
 *      写死长度就得为每个断点重算一遍（第一版写死 3rem，只有格宽的 16%，读成"没对齐"）。
 *   ⑤ ★ **一律不裁图**：整块**没有** `object-fit`（有断言守着它别回来）。
 *   ⑥ ★ 每格是 **1:1 方槽**（`aspect-ratio: 1`）+ 图居中 contain —— 没有它行高会被最高竖图撑开，
 *      横图下面留出横向白带（第一版的硬伤，实测 1440 下 >150px）。
 *   ⑦ ★ `.wf` 类名与「figure 是它的后代」**都不能动** ——
 *      整屏显影板（src/scripts/develop.ts）订阅的正是 `.wf figure`（tests/develop-bath.test.ts 盯那侧，
 *      这里盯**这一侧**：产物里所有 figure 必须仍落在 `.wf` 这一段内）。
 *   ⑧ 零新增运行时依赖 / 零外部资源（红线）。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'gallery', 'index.html'));

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** 剥两类注释：Astro 模板里的 JSX 块注释、以及 <style> 里的 CSS 块注释。
 *  顺序有讲究：先剥 JSX —— 它内部若含 CSS 块注释，先剥 CSS 的会把 JSX 那个切碎。 */
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const SRC = read('src/pages/gallery/index.astro');
const CODE = strip(SRC);
const MANIFEST = JSON.parse(read('public/gallery/manifest.json')) as {
  widths: number[];
  albums: { id: string; title: string; date: string; total: number; frames: { alt: string }[] }[];
};
const ALBUMS = MANIFEST.albums;
const TOTAL = ALBUMS.reduce((n, a) => n + a.total, 0);

/* ★ Astro 会给**每段被作用域样式命中的选择器**补 `[data-astro-cid-xxxx]`
   （编译出来是 `.plate[hidden][data-astro-cid-…]{…}`）。断言"某个声明在不在"时
   把这层作用域剥掉再匹配 —— 否则写对的规则也会因为多了一段属性而匹配不上
   （本轮真踩：`.plate[hidden]` 与 `.plate-body .no` 两条都因此假红）。
   ⚠ 只在**读值**时剥；"产物里确实带着作用域"这件事由 astro 自己保证，不必在这里守。 */
const DEO = (s: string) => s.replace(/\[data-astro-cid-[a-z0-9]+\]/g, '');

/* ⚠ 产物 CSS 的分片名带内容哈希（每构建一次就变）⇒ 不写死文件名，
   按"哪份 CSS 里有 .plate-body"去找。 */
const cssFiles = hasDist ? readdirSync(join(DIST, '_astro')).filter((f) => f.endsWith('.css')) : [];
const PAGE_CSS = DEO(
  cssFiles
    .map((f) => readFileSync(join(DIST, '_astro', f), 'utf8'))
    .filter((c) => c.includes('.plate-body'))
    .join('\n'),
);
const HTML = hasDist ? readFileSync(join(DIST, 'gallery', 'index.html'), 'utf8') : '';
/** 一块板的整段标记（板里没有嵌套 <section>，所以取到第一个 </section> 即止） */
const PLATES = [...HTML.matchAll(/<section class="plate"[\s\S]*?<\/section>/g)].map((m) => m[0]);

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');

describe('相册页 · 陈列区分板契约', () => {
  it('★ 板数 = 相册数（不写死），且按清单位次一块对一册', () => {
    expect(ALBUMS.length, '相册表空了？').toBeGreaterThan(0);
    for (const a of ALBUMS) {
      expect(a.total, `相册「${a.title}」的 total(${a.total}) 与 frames 长度(${a.frames.length}) 不一致 ⇒ 板头会印错数`).toBe(
        a.frames.length,
      );
    }
    expect(hasDist, '先 npm run build').toBe(true);
    expect(PLATES.length, `板数应等于相册数 ${ALBUMS.length}`).toBe(ALBUMS.length);
    PLATES.forEach((seg, i) => {
      const a = ALBUMS[i];
      expect(seg, `第 ${i + 1} 块板的 data-plate 不是「${a.id}」`).toContain(`data-plate="${a.id}"`);
      expect(seg, `第 ${i + 1} 块板的 aria-labelledby 没指向 plate-${i + 1}`).toContain(`aria-labelledby="plate-${i + 1}"`);
      expect(seg, `板头 h2 缺 id="plate-${i + 1}"`).toContain(`id="plate-${i + 1}"`);
      /* 板顺序 = 清单顺序 ⇒ 「板 01」确实是最新加进清单那一册的相对位次 */
      expect(seg.indexOf(a.title), `第 ${i + 1} 块板里找不到相册名「${a.title}」`).toBeGreaterThan(-1);
    });
  });

  it('★ 板头是一行完整编目读数（板号 · 相册名 · 帧数 · 日期）', () => {
    expect(PAGE_CSS, '缺 .plate-no 的样式').toContain('.plate-no');
    expect(PAGE_CSS, '缺 .plate-title 的样式').toContain('.plate-title');
    expect(PAGE_CSS, '缺 .plate-meta 的样式').toContain('.plate-meta');
    PLATES.forEach((seg, i) => {
      const a = ALBUMS[i];
      expect(seg, `第 ${i + 1} 块板缺「板 ${pad2(i + 1)}」`).toContain(`板 ${pad2(i + 1)}`);
      expect(seg, `第 ${i + 1} 块板缺帧数${a.total} 帧`).toContain(`${a.total} 帧`);
      expect(seg, `第 ${i + 1} 块板缺日期 ${a.date}`).toContain(a.date);
      /* 板号两位零填充（<10 册时要读成 板 01，不是 板 1） */
      expect(seg, `板号没零填充：板 ${pad2(i + 1)}`).toMatch(new RegExp(`板 ${pad2(i + 1)}(?![\\d])`));
    });
  });

  it('★★ 板号是**固定编目位次**，筛选时不许重编号（筛选只动 hidden）', () => {
    /* 板号写的是 `ai + 1`（相册在清单里的位次），不是"当前可见第几块"。
       有测试守着，免得有人"顺手"改成按可见序重排 —— 那样筛到单册时读数是「板 01」，
       而它其实是第 3 块，读起来从编目号变成序号，语义就丢了。 */
    expect(CODE, '板号必须取相册在清单里的固定位次 ai + 1').toMatch(/板 \{String\(ai \+ 1\)\.padStart\(2, '0'\)\}/);
    /* 筛选那段不许出现 .plate-no（重写板号就是重编号） */
    const filterLoop = CODE.slice(CODE.indexOf('// 筛选：只动 hidden'));
    expect(filterLoop, '筛选里不许重写板号（板号是编目位次、不随筛选变）').not.toContain('.plate-no');
    expect(filterLoop, '筛选里不许重建 DOM（只动 hidden）').not.toContain('innerHTML');
  });

  it('★ 空板会被一起收起（不留"只有板号、没有照片"的空板）', () => {
    expect(CODE, '筛选没有收集 .plate').toMatch(/querySelectorAll<HTMLElement>\('\.plate'\)/);
    expect(CODE, '筛完没收起无图的板').toMatch(/p\.hidden\s*=\s*!p\.querySelector\('figure:not\(\[hidden\]\)'\)/);
    /* ★ 判据必须是 `figure:not([hidden])`：板号是固定位次、不随筛选变，只看板号收不起来 */
    expect(CODE, '判据不能用板号（板号不随筛选变）').not.toMatch(/p\.hidden\s*=\s*!\s*p\.querySelector\('\.plate-no'/);
    /* [hidden] 必须显式写 —— 上游若给 .plate / figure 加了 display，UA 的 [hidden] 就被盖掉了 */
    expect(PAGE_CSS, '.plate[hidden] 必须显式 display:none').toMatch(/\.plate\[hidden\]\s*\{[^}]*display:\s*none/);
    expect(PAGE_CSS, 'figure[hidden] 必须显式 display:none').toMatch(/\.plate-body figure\[hidden\]\s*\{[^}]*display:\s*none/);
  });
});

describe('相册页 · 错缝砖墙契约', () => {
  it('★★ 错缝是 `margin-top`，**不是** `transform`（transform 不占位 ⇒ 会咬到下一行）', () => {
    /* 源码层 */
    const stagger = [...CODE.matchAll(/:nth-child\((4n \+ 2|4n \+ 4|3n \+ 2|2n \+ 2)\)[^{]*\{([^}]*)\}/g)];
    expect(stagger.length, '没读到错缝那几条 nth-child 规则').toBeGreaterThanOrEqual(4);
    for (const m of stagger) {
      const [, nth, body] = m;
      expect(body, `:nth-child(${nth}) 的错缝块里没有 margin-top`).toMatch(/margin-top:/);
      expect(body, `:nth-child(${nth}) 用了 transform ⇒ 不占位，会压到下一行上`).not.toMatch(/transform|translate/);
    }
    /* 产物层（防"源码对、编译后被改写"）：把页 CSS 里所有 figure 的 nth-child 规则块捞出来逐条查 */
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
    expect(CODE, '--stagger 必须是百分比（写死长度就得为每个断点重算一遍）').toMatch(/--stagger:\s*[\d.]+%/);
    const pcts = [...CODE.matchAll(/--stagger:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(pcts.length, '三档断点各要有一档 --stagger').toBeGreaterThanOrEqual(3);
    for (const v of pcts) {
      expect(v, `--stagger ${v}% 太小读不出砖（第一版 16% 就被读成"没对齐"）`).toBeGreaterThanOrEqual(15);
      expect(v, `--stagger ${v}% 太大 ⇒ 一列能滑出去半格以上`).toBeLessThanOrEqual(60);
    }
    /* ★ 幅度必须真的动过：不能三档都是同一个数（2 列时 45% 是半屏的跳动） */
    expect(Math.min(...pcts), '窄档必须比宽档小（格宽变了，同一百分比的手感差很多）').toBeLessThan(Math.max(...pcts));
  });

  it('★ 三档列数：4 / 3 / 2，且每档都要**先归零旧周期再写新周期**', () => {
    expect(CODE, '缺 4 列基准').toMatch(/grid-template-columns:\s*repeat\(4,\s*1fr\)/);
    const q1180 = CODE.slice(CODE.indexOf('@media (max-width: 1180px)'), CODE.indexOf('@media (max-width: 680px)'));
    const q680 = CODE.slice(CODE.indexOf('@media (max-width: 680px)'));
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
    const frame = CODE.match(/\.plate-body \.frame\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(frame, '没读到 .plate-body .frame 的样式块').toBeTruthy();
    expect(frame, '缺 1:1 方槽（第一版的硬伤就是没写它）').toMatch(/aspect-ratio:\s*1/);
    expect(frame, '图要居中（contain 靠 flex 居中 + max-*:100% 实现）').toContain('align-items: center');
    expect(frame, '图要居中').toContain('justify-content: center');
    const img = CODE.match(/\.plate-body img\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(img, '没读到 .plate-body img 的样式块').toBeTruthy();
    expect(img, '图宽必须吃满格').toMatch(/max-width:\s*100%/);
    expect(img, '图高必须吃满格').toMatch(/max-height:\s*100%/);
    /* ★★ align-items:start 必须写：默认的 stretch 把矮 figure 拉高，图就跟格子脱开 */
    const body = CODE.match(/\.plate-body\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(body, '缺 align-items:start ⇒ 默认 stretch 会把矮 figure 拉高、图与格脱开').toMatch(/align-items:\s*start/);
  });

  it('★★ 一律不裁图：整块**没有** `object-fit`', () => {
    /* 剥过注释再查 —— 注释里**故意**写着「`object-fit:cover` …明确没采用」，那是解释自己没做的事。 */
    expect(CODE, '出现了 object-fit ⇒ 图会被裁（本站是档案不是社交相册）').not.toMatch(/object-fit/);
    /* 正对照：图确实是 contain（靠 max-width/max-height + 居中，不是靠 object-fit） */
    expect(CODE, '图没写 width/height:auto ⇒ 会被方槽拉变形').toMatch(/\.plate-body img\s*\{[^}]*height:\s*auto/);
  });

  it('★ `.wf` 退化成纯容器（版面全在 .plate-body，不在这里打架）', () => {
    const wf = CODE.match(/(^|\n)\s*\.wf\s*\{([^}]*)\}/)?.[2] ?? '';
    expect(wf, '没读到 .wf 的样式块').toBeTruthy();
    expect(wf, '`.wf` 只该有一句 display:block（版面归 .plate-body）').not.toMatch(/grid|column-count|flex/);
  });
});

describe('相册页 · 编目号与图下说明', () => {
  it('★ 编目号 NO.xxx：按册三位零填充、每册从 001 起、钉在框内左下角', () => {
    expect(CODE, '编目号必须三位零填充（String(fi + 1).padStart(3, "0")）').toMatch(
      /NO\.\{String\(fi \+ 1\)\.padStart\(3, '0'\)\}/,
    );
    expect(PAGE_CSS, '缺 .no 的样式').toContain('.plate-body .no');
    const no = CODE.match(/\.plate-body \.no\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(no, '编目号要钉在框内**左下角**').toMatch(/left:\s*[\d.]+rem[\s\S]*?bottom:\s*[\d.]+rem/);
    expect(no, '编目号底必须是纸白（不能压在照片上把图压暗）').toMatch(/background:\s*var\(--paper\)/);
    expect(SRC, '编目号要与图下的 alt 去重 ⇒ 必须 aria-hidden').toMatch(/<span class="no" aria-hidden="true">/);

    expect(hasDist, '先 npm run build').toBe(true);
    PLATES.forEach((seg, i) => {
      const a = ALBUMS[i];
      const nos = [...seg.matchAll(/NO\.(\d{3})/g)].map((m) => m[1]);
      expect(nos.length, `第 ${i + 1} 块板里有 ${nos.length} 个编目号，应为 ${a.total}`).toBe(a.total);
      expect(nos[0], `第 ${i + 1} 块板必须**从 001 起**（按册编号，不接上一册接着数）`).toBe('001');
      expect(nos[nos.length - 1], `第 ${i + 1} 块板最后一个编目号应是 ${pad3(a.total)}`).toBe(pad3(a.total));
      /* 编号连续且不重复 —— 用集合去重后应恰好等于 total */
      expect(new Set(nos).size, `第 ${i + 1} 块板的编目号有重复/跳号`).toBe(a.total);
    });
  });

  it('★ 图下只留 alt（相册名已提到板头，不再重复 82 遍）', () => {
    const figs = [...HTML.matchAll(/<figure data-album=[\s\S]*?<\/figure>/g)].map((m) => m[0]);
    expect(figs.length, `应有 ${TOTAL} 个 figure`).toBe(TOTAL);
    for (const f of figs) {
      /* ⚠ `[^>]*`：Astro 会给 figcaption 也挂上 `data-astro-cid-…` */
      const cap = f.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/)?.[1] ?? '';
      expect(cap, '图下说明不该再有 <span>（板头已给相册名）').not.toContain('<span');
      expect(cap.trim(), '图下说明不能为空（alt 是站主写的短句）').not.toBe('');
    }
    expect(HTML, 'figcaption 里混进了相册名 ⇒ 又变回每张图重复一遍').not.toMatch(/<figcaption[^>]*>[^<]*<span/);
  });

  it('★★ 灯箱的相册名改从 data-album-title 读（老路子抓 figcaption span 会得到空串）', () => {
    expect((HTML.match(/data-album-title="/g) ?? []).length, '每个 figure 都要带 data-album-title').toBe(TOTAL);
    expect(CODE, '灯箱必须从 dataset.albumTitle 读相册名').toMatch(/lbAlbum\.textContent\s*=\s*fig\.dataset\.albumTitle/);
    expect(CODE, '不许再抓 figcaption span（那个 <span> 已经不存在了 ⇒ 会静默变空串）').not.toMatch(
      /querySelector\('figcaption span'\)/,
    );
    /* 值必须真的是相册名：逐册比一遍，别把 title 写成 id 或空串 */
    PLATES.forEach((seg, i) => {
      const a = ALBUMS[i];
      expect(seg, `第 ${i + 1} 块板的 data-album-title 不是相册名`).toContain(`data-album-title="${a.title}"`);
    });
  });
});

describe('相册页 · 与整屏显影板的互锁（这一侧）', () => {
  it('★★ 产物里所有 figure 仍落在 `.wf` 这一段内（显影板订阅 `.wf figure`）', () => {
    /* tests/develop-bath.test.ts 盯的是脚本那侧的选择器字符串；这里盯**这一侧**：
       重排板结构时若把 .wf 挪到 figure 之外，那边的断言照样绿，只有这条会红。 */
    expect(hasDist, '先 npm run build').toBe(true);
    const wfAt = HTML.indexOf('class="wf"');
    const lbAt = HTML.indexOf('class="lb"');
    expect(wfAt, '.wf 容器不见了').toBeGreaterThan(-1);
    expect(lbAt, '.lb 灯箱不见了').toBeGreaterThan(-1);
    expect(lbAt, '.lb 应排在 .wf 之后').toBeGreaterThan(wfAt);
    const chunk = HTML.slice(wfAt, lbAt);
    expect((chunk.match(/<figure data-album=/g) ?? []).length, `82 张图必须都在 .wf 里`).toBe(TOTAL);
    expect((chunk.match(/class="plate-body"/g) ?? []).length, '板身必须都在 .wf 里').toBe(ALBUMS.length);
    /* 反向正对照：显影板要的两个钩子还在 */
    expect(chunk, '缺 a.frame 的 href（显影板按它取大图）').toMatch(/<a class="frame" href="[^"]+" data-no-transition/);
    expect(chunk, '缺 data-cap（显影板的擦痕读数）').toContain('data-cap="');
  });

  it('★ 缩略图链接仍是 data-no-transition（灯箱接管这次点击，页面蒙版必须放行）', () => {
    const frames = [...HTML.matchAll(/<a class="frame"[^>]*>/g)].map((m) => m[0]);
    expect(frames.length, `应有 ${TOTAL} 条缩略图链接`).toBe(TOTAL);
    for (const a of frames) {
      expect(a, '缩略图链接缺 data-no-transition ⇒ 蒙版会盖在灯箱上').toContain('data-no-transition');
    }
  });
});

describe('相册页 · 红线与预算', () => {
  it('零新增运行时依赖 / 零外部资源', () => {
    const pkg = JSON.parse(read('package.json'));
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.length, `dependencies 应恰好 3 个，实际 ${deps.length}`).toBe(3);
    expect(deps).toEqual(expect.arrayContaining(['astro', '@astrojs/rss', '@astrojs/sitemap']));
    /* 剥过注释再查（注释里会引用参考站域名 lowkeytp.art 之类）。
       ⚠ 判据必须是"真会去取的那种 URL"（src=/href=/url(http…)），不能裸查 `https?://`
         —— 胶片颗粒那张内联 SVG 的 **XML 命名空间** 就写着 `http://www.w3.org/2000/svg`
         （在 `data:` URI 里，一个请求都不发）。裸查会把自包含的写法判成外部依赖。 */
    expect(CODE, '页面里出现了外部资源引用（src/href）').not.toMatch(/(?:src|href)=["']https?:/i);
    expect(CODE, '样式里出现了外部 url()').not.toMatch(/url\(\s*["']?https?:/i);
  });

  it('★ 颜色只用 token（本页新增部分不许出现字面色值）', () => {
    /* ★ 切片必须到**灯箱那一段为止**：`.lb` 里本来就有 `rgb(26 26 26 / 92%)` 这类取色，
       切到文件尾会把灯箱的写法算到陈列区头上（本轮真踩）。 */
    const plateCss = CODE.slice(CODE.indexOf('.plate {'), CODE.indexOf('.lb {'));
    expect(plateCss.length, '没切到陈列区那一段样式（上下界都没找着？）').toBeGreaterThan(400);
    expect(plateCss, '切片越界：把灯箱的样式也切进来了 ⇒ 这条断言失去意义').not.toContain('.lb-');
    expect(plateCss, '陈列区样式里出现了字面色值').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(plateCss, '陈列区样式里出现了 rgba()（alpha 由 8 位 hex 承载）').not.toMatch(/\brgba?\(/);
    /* 占位的极淡绿洗用的是既有 token，不是新造的 */
    const tokens = read('src/styles/tokens.css');
    expect(tokens, 'tokens.css 里没有 --deco-plate-fine').toContain('--deco-plate-fine');
    expect(tokens, '--deco-plate-fine 必须是 --accent(#2d7d46) 压 alpha 的 6% 档').toMatch(
      /--deco-plate-fine:\s*#2d7d46[0-9a-f]{2}/,
    );
    expect(CODE, '占位底必须用 token').toMatch(/background:\s*var\(--deco-plate-fine\)/);
  });
});
