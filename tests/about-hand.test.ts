import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 关于页「亲笔签名切片」（HAND SIGN）的几条不可退让的性质。
 *
 * 机制（与显影板、索引卷尺都不同，见 docs/rhinelab-spec.md §6.26）：
 *   · 签名是站主手迹**原件的照片**（已抠白底转墨绿），位图没有路径
 *     ⇒ 落笔是**横向揭幕**（clip-path inset 100%→0），不是逐笔描红。
 *   · 匀速推进，吃**真实 dt**；★ **不用弹簧**（笔迹要匀速，过冲会像"甩笔"）。
 *   · 首屏已看得见的切片**不揭幕**、直接最终态（否则读者第一眼是空深底板）。
 *
 * 与前两台同源的既有契约：
 *   ① 无 JS 可用 —— 图服务端渲染完整，只是"不揭幕"，不是"看不见"。
 *   ② 零随机 —— 位置是 t 的确定函数，无 Math.random。
 *   ③ 帧率无关 —— 吃真实 dt，禁「每帧固定系数」。
 *   ④ reduced-motion 降级 —— 落最终态，不跑 rAF。
 *   ⑤ 手机 ≤767px 留**极简版**（口径 #9），不是不渲染。
 *   ⑥ 素材与文案都在内容层，不写死在 src/。
 */
const SCRIPT = readFileSync('src/scripts/hand-sign.ts', 'utf8');
const CODE = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
const ASTRO = readFileSync('src/pages/about.astro', 'utf8');
const ACSS = ASTRO.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const MD = readFileSync('content/pages/about.md', 'utf8');

const DIST = 'dist';
const hasDist = existsSync(DIST);
const ABOUT = hasDist ? readFileSync(join(DIST, 'about', 'index.html'), 'utf8') : '';

describe('关于页 · 亲笔签名切片：无 JS 可用与素材契约', () => {
  it('无 JS 可用：签名图与切片在产物里服务端渲染完整（不是 hidden）', () => {
    expect(ABOUT, '先 npm run build').toContain('data-sign-card');
    expect(ABOUT).toContain('data-sign-img');
    // ★ 关键是**不能**带 hidden：降级目标只有一个「看得见图」
    const card = ABOUT.match(/<figure[^>]*data-sign-card[^>]*>/)?.[0] ?? '';
    expect(card, '签名切片被 hidden 了 —— 无 JS 时就看不见了').not.toMatch(/\bhidden\b/);
    // 图有alt（全局硬约束：图片 alt 非空）
    const img = ABOUT.match(/<img[^>]*data-sign-img[^>]*>/)?.[0]
      ?? ABOUT.match(/<img[^>]*srcset[^>]*>/)?.[0] ?? '';
    expect(img, '找不到签名 img').toMatch(/alt="[^"]+"/);
  });

  it('签名素材在 src/assets/about/（参与构建期优化），且由内容层 frontmatter 引用', () => {
    expect(existsSync('src/assets/about/sign.png'), '签名图没进仓').toBe(true);
    // 内容层字段：文字与资源引用都不该写死在 src/
    expect(MD, 'frontmatter 缺 signature 字段').toMatch(/^signature:\s*\S+/m);
    expect(MD, 'frontmatter 缺 signatureNote 字段').toMatch(/^signatureNote:\s*\S+/m);
    // 页面从 frontmatter 取，不写死文件名
    expect(ASTRO).toMatch(/signature\s*\?\s*assets\[/);
    expect(CODE, '签名图名不该硬编码在脚本里').not.toMatch(/sign\.png/);
  });

  it('切片编号存在且按顺序（FIG.01 HAND / 02 / 03 / 04）', () => {
    expect(ABOUT).toContain('FIG.01');
    expect(ABOUT).toContain('HAND');
    // 三个内容区块各有一个编号
    expect(ABOUT.match(/FIG\.0[234]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('正文排版未被动（口径 #3：正文排版不动）', () => {
    // .prose 仍在、内容仍在它里面 —— 版式升级只加在页头/列表项/卡片
    expect(ASTRO).toContain('.prose');
    expect(ABOUT).toMatch(/class="prose"/);
    // 本站没有给 .prose 加任何自定义排版规则（那才是"动了正文排版"）
    const proseRule = ACSS.match(/\.prose[^{]*\{[^}]*\}/g) ?? [];
    for (const r of proseRule) {
      expect(r, `给 .prose 加了排版规则：${r}`).not.toMatch(/font-size|line-height|letter-spacing|max-width/);
    }
  });
});

describe('关于页 · 亲笔签名切片：落笔机制', () => {
  it('横向揭幕：用 clip-path 的 inset，不用逐笔描红', () => {
    expect(CODE).toMatch(/clipPath\s*=\s*`inset\(/);
    // ★ 位图没有路径 —— 若出现 stroke-dashoffset 就说明改成矢量了，那是另一条路
    expect(CODE, '位图不该用 stroke-dashoffset（那是矢量路径的手法）').not.toContain('stroke-dashoffset');
  });

  it('匀速吃真实 dt，★ 不用弹簧（笔迹要匀速，过冲像甩笔）', () => {
    // ★ 注意别断言 `step(dt: number)` —— 那是把函数**签名**写死了，
    //   改写成箭头函数或加类型标注就假红。断言实现里的 dt 用法。
    expect(CODE).toMatch(/const step = \(dt/);
    // 速度按 dt / 1000 换算成秒 —— 若是「每帧 -= 固定量」则帧率一变速度就变
    expect(CODE).toMatch(/SIGN_SPEED\s*\*\s*dt\s*\)\s*\/\s*1000/);
    // 刻意不引 createSpring
    expect(CODE, '落笔不该用弹簧').not.toMatch(/createSpring/);
  });

  it('首屏已可见的切片不揭幕，直接最终态（否则第一眼是空深底板）', () => {
    // 判据：切片此刻与视口有实际重叠 ⇒ 直接给最终态
    expect(CODE).toMatch(/getBoundingClientRect/);
    expect(CODE).toMatch(/rect\.top\s*<\s*window\.innerHeight/);
    expect(CODE).toMatch(/inFirstScreen/);
  });

  it('零随机：揭幕进度是 dt 的确定函数，无 Math.random', () => {
    expect(CODE).not.toContain('Math.random');
  });

  it('复用rl-core：帧循环 / 视口停帧 / 降级开关', () => {
    expect(CODE).toMatch(/startLoop/);
    expect(CODE).toMatch(/createActivityGate/);
    expect(CODE).toMatch(/shouldAnimate/);
    expect(CODE).toMatch(/prefersReducedMotion/);
  });

  it('视口外/切标签停帧：onTick 不重置进度（滚回去不该重写一遍）', () => {
    // gate 的 onTick 必须是空实现 —— 重置会让签名反复重播
    expect(CODE).toMatch(/onTick:\s*\(\)\s*=>\s*\{\s*\}/);
    expect(CODE).toMatch(/gate\.onScreen\s*&&\s*gate\.visible/);
  });
});

describe('关于页 · 亲笔签名切片：降级与配色', () => {
  it('reduced-motion 降级：直接落最终态，不跑 rAF', () => {
    expect(CODE).toMatch(/if\s*\(!animate\)/);
    // 降级分支里把 cover 归零并落一次 paint
    const branch = CODE.match(/if\s*\(!animate\)\s*\{[\s\S]{0,160}?\}/)?.[0] ?? '';
    expect(branch, '降级分支里没有把进度归零').toMatch(/cover\s*=\s*0/);
    expect(branch, '降级分支里没有 paint()').toMatch(/paint\(\)/);
  });

  it('手机 ≤767px 留极简版（口径 #9），不是不渲染', () => {
    /* ★ 2026-10-03 站主改口径：「直接放到背景里，不要单独做一个卡片」⇒ 深底板与
       .sign-plate 那个「切片台」都删了。判据随之改守 .sign-head 里的说明文字——
       极简 = 窄屏隐藏那行小字，**签名本身留着**，且**不是** display:none。 */
    const m = ACSS.match(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.sign-head\s+span\s*\{[\s\S]*?\}/);
    expect(m, '缺 ≤767px 的签名极简规则（应隐藏 .sign-head span）').toBeTruthy();
    expect(m?.[0], '窄屏极简应是 display:none（只藏说明文字）').toMatch(/display:\s*none/);
    // 签名本身不隐藏
    expect(ACSS.match(/@media\s*\(max-width:\s*767px\)[\s\S]*?\.sign-(?:card|img)\s*\{[^}]*display:\s*none/))
      .toBeFalsy();
  });

  /* ★ 2026-10-03 站主改口径：底纹走**白底**、签名**不做卡片** ⇒ 本页已无深底区块，
     「深底上不许用 accent-ink」那条随口径一起作废（它守的是已删掉的深底板）。
     换成守新口径：① 纸白底没被改 ② 签名是走构建期优化的墨绿位图 ③ 深底仍不许回来。 */
  it('白底口径：底色是 --paper，签名是墨绿位图（无深底卡片）', () => {
    // ① 底纹层用纸白，页面没有深底板了
    //    ★ 2026-10-03 修正断言范围：原来是**全文件**禁 `background: var(--dusk-2)`，
    //    那条太宽 —— 它把「背景层垫深绿」也一起禁掉了，而背景层垫深绿恰恰是
    //    站主要求的（纯黑改偏黑深绿）。泛用检查 = 假阳性，门闩必须绑死本次契约。
    //    ⇒ 收窄成：承载文字的**块**不许深底（.sign-card / .prose / .fig-block / .pagehead），
    //      背景层 .ref-plate 用深绿是站主指定的，不在禁列。
    const textBlocks = ACSS.match(
      /\.(?:sign-card|prose|fig-block|pagehead)\b[^{}]*\{[^{}]*\}/g
    ) ?? [];
    expect(textBlocks.length, '没读到文字块的样式规则').toBeGreaterThan(0);
    for (const rule of textBlocks) {
      expect(rule, `文字块不许深底板（站主口径是白底）：${rule.slice(0, 80)}`)
        .not.toMatch(/background:\s*var\(--dusk-2\)/);
    }
    // ①-b 背景层**确实**垫了深绿（否则图下方会露白底，实测 docSW 那段全是白）
    expect(ACSS, '背景层 .ref-plate 应垫 --dusk-2（纯黑改深绿，站主 2026-10-03 指定）')
      .toMatch(/\.ref-plate\b[^{}]*\{[^{}]*background:\s*var\(--dusk-2\)/);
    // ①-c body 背景必须让位（否则不透明的纸白底会盖住整张背景图）
    // ★ 产物里 body 的 class 是**合并**的（`chrome-page about-plate`），
    //   不是恰好等于 "about-plate" ⇒ 用词边界判「含有这个类」。
    expect(ABOUT, '产物 body 上没有 about-plate 类 ⇒ 全局纸白底会盖住背景图')
      .toMatch(/<body[^>]*class="[^"]*\babout-plate\b/);
    // ② 签名是图片且走构建期优化（srcset 多档）—— 不是用色值画出来的
    //    ★ 正则要注意属性顺序：产物里 `srcset` 排在 `data-sign-img` **之前**
    //    （Astro 的 Image 组件先输出 src/srcset，属性再往后排）⇒ 用两个前瞻而不是固定顺序。
    expect(ABOUT).toMatch(/<img(?=[^>]*data-sign-img)(?=[^>]*srcset="[^"]+")[^>]*>/);
    // ③ 编号与说明用纸上的绿（这是它们的正当场合）
    expect(ACSS).toMatch(/color:\s*var\(--accent-ink\)/);
  });

  it('切片宽度用 min() 收窄（380px 写死会在 390 视口下溢出）', () => {
    const w = ACSS.match(/\.sign-card[^{]*\{[^}]*width:\s*([^;]+);/)?.[1] ?? '';
    expect(w, '没读到 .sign-card 的 width').toBeTruthy();
    expect(w, `切片宽度必须用 min() 收窄，实际是：${w}`).toContain('min(');
    expect(w).toContain('100%');
  });

  it('颜色全部来自 token，组件里不写 rgba()', () => {
    const styles = ACSS.match(/\.sign[\w-]*[^{}]*\{[^{}]*\}/g) ?? [];
    for (const s of styles) {
      expect(s, `签名切片里出现了 rgba()：${s.slice(0, 60)}`).not.toContain('rgba(');
    }
  });
});

describe('关于页 · 亲笔签名切片：零第三方与零新依赖', () => {
  it('本页不引任何外部资源（零第三方请求）', () => {
    /* ★ 判据是「不引外部**资源**」，不是「不许出现站外**链接**」——
       社交账号本来就是站外链接（站主的 GitHub / 邮箱 / 抖音），
       `tests/build-output.test.ts` 的全局零第三方断言查的是资源加载（script/link/img 的 src/href 指向别人家）。
       这里做同一件事的**页面级**复查：新加的签名切片别偷偷引了 CDN 字体或图床。 */
    // ① 不许有指向第三方域名的资源引用
    for (const m of ABOUT.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*>/gi)) {
      const tag = m[0];
      const url = tag.match(/(?:src|href)="([^"]+)"/i)?.[1] ?? '';
      if (!url || url.startsWith('/') || url.startsWith('#')) continue; // 站内资源
      expect(url, `引用了外部资源：${tag.slice(0, 80)}`).toMatch(/^(https?:)?\/\/(www\.)?northcedar\.top/);
    }
    // ② 常见的第三方 CDN / 图床 / 字体关键字一律不许出现
    for (const kw of ['cdn.jsdelivr', 'unpkg.com', 'googleapis', 'gstatic', 'imgur', 'sm.ms', 'raw.githubusercontent', 'fonts.googleapis']) {
      expect(ABOUT, `出现了第三方关键字 ${kw}`).not.toContain(kw);
    }
  });

  it('没有新增运行时依赖', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@astrojs/rss', '@astrojs/sitemap', 'astro']);
  });

  it('签名图的 alt 是人话，不是「图片」', () => {
    const alt = ABOUT.match(/data-sign-img[^>]*alt="([^"]*)"/)?.[1]
      ?? ABOUT.match(/alt="([^"]*)"[^>]*data-sign-img/)?.[1] ?? '';
    expect(alt, '找不到签名图的 alt').toBeTruthy();
    expect(alt).not.toBe('图片');
  });
});

/* =============================================================================
 * 页头可读性契约（2026-10-03）
 *
 * 这一组每条都对应一次**实测到的真实故障**，不是预防性检查。
 * 三个坑有同一个外衣——「标题看不见 / 左右错位 / 纸不存在」，根因却各不相同，
 * 且**都是静默失效**（CSS 规则编译后不匹配，不报错、不警告）：
 *
 *   ① 标题被纸盖住：Astro scoped CSS 把 `.pagehead > h1` 编译成
 *      `.pagehead[本页cid] > h1[本页cid]`，而 h1 是**PageTitle 组件**渲染的
 *      （带组件自己的 cid）⇒ 属性选择器不匹配 ⇒ 规则整条失效
 *      ⇒ 标题 static + 无 z-index，被 z-index:0 的纸整个盖住。
 *   ② 标题与头像左右调换：grid 自动放置按源码顺序 flow，
 *      `.fig-no` 先占 (1,1) ⇒ h1 被挤到右列、头像到左列。
 *   ③ 纸高度塌成 0：`grid-area: 1/1/-1/-1` 在只有 2 行的 grid 上，
 *      `-1` 解析到不存在的第 3 行 ⇒ 纸落进隐式行、高度 0。
 *
 * 三条都不是「写错」，而是「写了但不生效」⇒ 只能靠**产物 CSS 断言**守住，
 * 源码断言会全部通过而页面依然错。
 * ============================================================================= */
describe('关于页 · 页头可读性：跨组件选择器 / grid 落位 / 纸托底', () => {
  const astroCssFile = hasDist
    ? join(DIST, '_astro', readdirSync(join(DIST, '_astro')).find((f) => /^about\..*\.css$/.test(f)) ?? '')
    : '';
  const PCSS = astroCssFile && existsSync(astroCssFile) ? readFileSync(astroCssFile, 'utf8') : '';

  it('产物 CSS 存在（下面几条都依赖产物，缺产物时跳过而不是假通过）', () => {
    expect(PCSS, `没找到关于页的产物 CSS（${astroCssFile}）`).toBeTruthy();
  });

  /* ① 标题必须用 :global() 提层，否则被纸盖住 */
  it('标题用 :global() 提层（scoped 的属性选择器匹配不到组件渲染的 h1）', () => {
    // 落位与提层是**两条** :global 规则（源码里分别在网格段与提层段），分别断言。
    expect(ACSS, '标题的落位规则必须用 :global()，否则 scoped cid 匹配不到组件的 h1')
      .toMatch(/:global\(\.pagehead\s*>\s*h1\)\s*\{\s*grid-column:\s*1/);
    expect(ACSS, '标题的提层规则必须用 :global()，否则被纸盖住')
      .toMatch(/:global\(\.pagehead\s*>\s*h1\)\s*,[\s\S]*?\{\s*position:\s*relative;\s*z-index:\s*1/);
    // 反向门闩：不允许出现裸的 `.pagehead > h1 {`（它会被编译成带 cid 的选择器）
    expect(ACSS.replace(/:global\(\.pagehead\s*>\s*h1\)/g, ''),
      '出现了裸的 .pagehead > h1 —— 它匹配不到 PageTitle 渲染的 h1')
      .not.toMatch(/\.pagehead\s*>\s*h1\s*\{/);
  });

  it('产物 CSS 里标题确实拿到了 position:relative + z-index:1（不是只写在源码里）', () => {
    if (!PCSS) return; // 上一个 it 已断言产物存在
    // ★ 落位与提层在产物里也是**两条独立规则**，必须分别找 ——
    //   合并成一条正则去匹配会永远失败（CSS 不会把两条规则合并）。
    const rules = PCSS.match(/\.pagehead\s*>\s*h1[^{}]*\{[^{}]*\}/g) ?? [];
    expect(rules.length, '产物 CSS 里找不到 .pagehead > h1 规则').toBeGreaterThan(0);
    const all = rules.join(' ');
    expect(all, '产物里标题必须有 z-index:1（否则被纸盖住）').toMatch(/z-index:\s*1/);
    expect(all, '产物里标题必须有 position:relative').toMatch(/position:\s*relative/);
    // 关键：`.pagehead>h1` 这一段**不能**带 data-astro-cid（带了就匹配不到）。
    //   ★ 注意提层规则是**多选择器合并**的（`.pagehead>h1,.sign-card[cid],…`），
    //     所以不能整条判「有没有 cid」—— 同一规则里只有本页元素该带、
    //     组件渲染的 h1 那段必须不带 ⇒ 按逗号切开，只查 h1 那段。
    for (const r of rules) {
      const h1Part = r.split(',').find((seg) => /\.pagehead\s*>\s*h1/.test(seg)) ?? '';
      expect(h1Part, `没在规则里找到 .pagehead>h1 那一段：${r}`).toBeTruthy();
      expect(h1Part, `产物里 .pagehead>h1 带了 cid 属性选择器 ⇒ 运行时匹配不到组件的 h1：${h1Part}`)
        .not.toMatch(/data-astro-cid/);
    }
  });

  /* ② grid 落位必须显式写，否则标题与头像左右调换 */
  it('页头三项显式落位：编号通栏 / 标题左列 / 头像右列', () => {
    expect(ACSS, '编号必须通栏').toMatch(/\.pagehead\s*>\s*\.fig-no\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
    expect(ACSS, '标题必须落在第 1 列').toMatch(/:global\(\.pagehead\s*>\s*h1\)\s*\{\s*grid-column:\s*1\b/);
    expect(ACSS, '头像必须落在第 2 列').toMatch(/\.pagehead\s*>\s*\.profile\s*\{[^}]*grid-column:\s*2\b/);
  });

  /* ③ 纸用 absolute + inset，且特异性必须压过 .pagehead > * */
  it('页头纸用 absolute + 负 inset（grid-area 在 2 行 grid 上会塌成 0）', () => {
    const rule = ACSS.match(/\.pagehead\s*>\s*\.page-paper\s*\{[^{}]*\}/)?.[0] ?? '';
    expect(rule, '没读到 .page-head > .page-paper 规则').toBeTruthy();
    expect(rule, '纸必须 position:absolute（grid-area 方案实测高度塌 0）')
      .toMatch(/position:\s*absolute/);
    expect(rule, '纸必须用负 inset 向外撑').toMatch(/inset:\s*calc\([\s\S]*?\*\s*-1\s*\)/);
    // 特异性必须 ≥ 0,2,0，才能压过后面的 `.pagehead > *`（同 0,1,0 时后写者胜）
    expect(rule, '纸的选择器必须比 .pagehead > * 更具体（写成 .pagehead > .page-paper）')
      .toMatch(/\.pagehead\s*>\s*\.page-paper/);
    expect(ACSS, '不许再写 grid-area 方案（实测高度塌 0）')
      .not.toMatch(/\.page-paper\s*\{[^}]*grid-area/);
  });

  it('页头有 overflow:hidden 兜底（纸的负 inset 不得撑出横向滚动）', () => {
    const rules = ACSS.match(/\.pagehead\s*\{[^{}]*\}/g) ?? [];
    const has = rules.some((r) => /overflow:\s*hidden/.test(r));
    expect(has, '页头缺 overflow:hidden —— 纸的负 inset 可能撑出横向滚动').toBe(true);
  });

  it('grid 只在宽屏生效（窄屏 grid 的 1fr auto 会算出超视口的列宽）', () => {
    // display:grid 必须在 @media (min-width:1024px) 之内
    const m = ACSS.match(/@media\s*\(min-width:\s*1024px\)\s*\{[\s\S]*?\.pagehead\s*\{[^{}]*display:\s*grid/);
    expect(m, 'display:grid 必须写在 @media (min-width:1024px) 里').toBeTruthy();
    // 不许在外层（无媒体查询）再写一次 display:grid —— 同元素两处各写一次时后写的赢
    const outside = ACSS.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ' ');
    expect(outside, '外层不许重复声明 .pagehead 的 display（会与媒体查询打架）')
      .not.toMatch(/\.pagehead\s*\{[^{}]*display:\s*grid/);
  });

  it('模板里页头真的有纸托底元素（.page-paper 存在）', () => {
    const html = readFileSync('src/pages/about.astro', 'utf8');
    expect(html, '模板里缺 .page-paper 元素（纸不存在 ⇒ 文字直接压在深色图上）')
      .toMatch(/class="page-paper"/);
  });

  it('body 让位背景层（body 有不透明纸白底会盖住整张背景图）', () => {
    // 两处都要查：① 模板把 bodyClass 传给 Base ② 样式里把 body 背景改成透明
    const html = readFileSync('src/pages/about.astro', 'utf8');
    expect(html, '模板必须给 Base 传 bodyClass="about-plate"，否则全局 body 纸白底会盖住背景图')
      .toMatch(/<Base[^>]*bodyClass="about-plate"/);
    expect(ACSS, 'body.about-plate 必须把背景改成 transparent')
      .toMatch(/:global\(body\.about-plate\)\s*\{\s*background:\s*transparent/);
  });
});
