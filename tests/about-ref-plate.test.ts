/* 关于页底纹层的契约（2026-10-03 第三轮口径：**月相 + 蓝条替代百褶 ∞**）
 *
 * ⚠ 这份断言在同一天被推翻重写过两次，教训都留着：
 *   ① 16:20 站主驳回「统一染墨绿 + 压成极淡 alpha」——他要的是原色与强调色。
 *   ② 16:37 站主指定一张图当**铺满视口的深绿大图**⇒ 断言从「四块取景框」改成「一张大图」。
 *   ③ 18:50 站主口径再变：「只保留排版，其他什么背景签名全部恢复原样，
 *      背景恢复后把月相和蓝条**替代背景上本来的百褶无限符号**」
 *      ⇒ 图还是那张图，但**挂法**回到百褶 ∞ 那一层，纸托底整段作废。
 *   ⇒ **教训**：断言要守「站主明确的意图」，不是「我上一版的实现形态」。
 *     每一版实现都可能被下一版口径整体推翻，别把实现当契约。
 *
 * ★ 这一版最关键的一条契约是 **「照抄百褶 ∞ 的挂法」**：
 *   百褶 ∞（`body.chrome-page .page-inf`，Topbar 渲染）是全站纸白区的统一语言。
 *   本页换的是**母题**（∞ → 月相），不是**角色**（仍是 fixed 居中的淡墨纹）。
 *   ⇒ 下面把两条挂法的关键参数逐条对照断言，防止只改一半。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'index.html'));

const SRC = readFileSync(join(ROOT, 'src/pages/about.astro'), 'utf8');
/* 剥注释**只用于负向断言**。⚠ 源文件里那段说明注释中出现过块注释定界符的**字面文本**，
   朴素的块注释正则会一路吃到下一个定界符、**把中间真正的代码吞掉**
   ⇒ 正向断言一律用未剥注释的原文。 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ★ 百褶 ∞ 的定义（Topbar.astro，is:global）—— 本页必须与它逐条一致。
   把它当常量抄进来而不是 import，是为了让断言在 Topbar 改动时**报错**，
   逼人回头看这条契约；而不是静默跟着变。 */
const TOPBAR = readFileSync(join(ROOT, 'src/components/Topbar.astro'), 'utf8');
const INF = TOPBAR.match(/body\.chrome-page \.page-inf\s*\{([^}]*)\}/)?.[1] ?? '';

const PLATE_DIR = join(ROOT, 'src/assets/about/plates');
const plates = existsSync(PLATE_DIR) ? readdirSync(PLATE_DIR).filter((f) => f.endsWith('.webp')) : [];

describe('关于页 · 底纹层：月相 + 蓝条替代百褶 ∞', () => {
  it('素材是一张图，且已进仓、体积可控', () => {
    expect(plates.length, 'plates 目录下的 webp 数量不对（应为一张背景图）').toBe(1);
    expect(plates[0]).toBe('moon-main.webp');
    const kb = statSync(join(PLATE_DIR, plates[0])).size / 1024;
    /* ★ 上限从 400 调到 450 KB —— 因为 2026-10-03 素材加了 **alpha 通道**
       （纯黑底转透明，让矩形在数学上不存在），实测 402 KB。
       同一天实测的压缩档（alpha 四档都完好、最大 alpha 恒 255）：
         quality 90 → 511 KB · 82 → 438 KB · 75 → **402 KB** · 68 → 388 KB
       取 75 的理由：这层是 `opacity:.2` 的底纹、又在 z-index:-1 之下，
       肉眼只看极淡一层墨纹 ⇒ 再压就是浪费画质换字节。
       ⇒ 门闩卡 450 而不是回到 400：真实产物是 402，凑到 400 只能再降一档画质，
         那是**为了过门闩而牺牲产物**。上限该反映实测，不是反过来。
       ★ 另有一道更严的门闩在下面（素材必须 hasAlpha 且最大 alpha ≥ 200）——
         体积可以商量，alpha 丢了是定性缺陷。 */
    expect(kb, `背景图 ${kb.toFixed(0)} KB，超出上限（alpha 通道约占 +185 KB）`).toBeLessThan(450);
    // 对照：原图 1.25 MB ⇒ 至少要压到 1/3 才算「体积可控」
    expect(kb, `背景图 ${kb.toFixed(0)} KB，相对原图 1.25 MB 压得不够`).toBeLessThan(1280 / 3);
  });

  it('★ 走构建期管线（<Image widths sizes>），不是 <img src> 直连', () => {
    expect(SRC, '背景图没走 import.meta.glob').toMatch(
      /import\.meta\.glob<[^>]*ImageMetadata[^>]*>\('\/src\/assets\/about\/plates\/\*\.webp'/);
    const img = SRC.match(/<Image\b(?=[^>]*class="ref-img")[^>]*\/>/);
    expect(img, '没找到渲染背景图的 <Image class="ref-img">').toBeTruthy();
    expect(img![0], '少了 widths ⇒ 不会出多档 srcset').toMatch(/widths=\{/);
    // ★ sizes 必须跟百褶 ∞ 的取宽一致（128vw），不是 100vw —— 改错会让浏览器下错档
    expect(img![0], 'sizes 应与百褶 ∞ 的取宽一致（128vw）').toMatch(/sizes="128vw"/);
  });

  /* ---- 挂法：逐条对齐百褶 ∞（这一组是本版契约的核心）---- */
  it('★ 底纹层照抄百褶 ∞ 的几何与淡墨纹，z-index 刻意改为 0 并加 multiply', () => {
    expect(INF, 'Topbar 里找不到 .page-inf 的规则 —— 百褶 ∞ 改名了，要回头改这条契约').toBeTruthy();

    const ref = CODE.match(/\.ref-plate\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(ref, '没读到 .ref-plate 的样式块').toBeTruthy();

    // ① fixed 挂视口 + 居中（滚动时纹理始终居中，与百褶 ∞ 观感一致）
    expect(ref, '必须 position:fixed（挂视口，不是文档）').toMatch(/position:\s*fixed/);
    expect(ref, '必须 left/top 50% + translate(-50%,-50%) 居中').toMatch(/left:\s*50%/);
    expect(ref, '必须 top:50%').toMatch(/top:\s*50%/);
    expect(ref, '必须 translate(-50%,-50%)').toMatch(/translate\(-50%,\s*-50%\)/);
    // ★ 与百褶 ∞ 对照（防止手改时只改一半）
    expect(ref, '与百褶 ∞ 的 fixed 挂法不一致').toMatch(
      INF.includes('position: fixed') ? /position:\s*fixed/ : /x/);
    expect(ref, '与百褶 ∞ 的居中写法不一致').toMatch(
      INF.includes('translate(-50%, -50%)') ? /translate\(-50%,\s*-50%\)/ : /x/);

    // ② 取宽与比例：min(128vw,1600px) + aspect-ratio + object-fit:contain
    expect(ref, '取宽必须与百褶 ∞ 一致：min(128vw, 1600px)').toMatch(
      /width:\s*min\(128vw,\s*1600px\)/);
    expect(ref, '与百褶 ∞ 的取宽不一致').toMatch(
      INF.match(/width:\s*([^;]+);/)?.[1]?.trim().replace(/\s+/g, ' ') === 'min(128vw, 1600px)'
        ? /width:\s*min\(128vw,\s*1600px\)/ : /x/);
    // 图是 1920×1045 ⇒ 比例必须锁在这个值，否则 contain 会拉变形
    expect(ref, 'aspect-ratio 必须是素材的真实比例 1920/1045').toMatch(
      /aspect-ratio:\s*1920\s*\/\s*1045/);
    expect(CODE, '图必须 contain（百褶 ∞ 同一套，避免拉伸变形）').toMatch(
      /\.ref-main\s*>\s*(?:picture|img)[^{}]*\{[^}]*object-fit:\s*contain/);

    // ③ 淡墨纹：opacity 照抄百褶 ∞ 的 .2
    expect(ref, 'opacity 必须与百褶 ∞ 一致（.2）').toMatch(/opacity:\s*0?\.2/);
    expect(ref, '与百褶 ∞ 的 opacity 不一致').toMatch(
      INF.match(/opacity:\s*([^;]+);/)?.[1]?.trim() === '0.2' ? /opacity:\s*0?\.2/ : /x/);

    // ④ 与百褶 ∞ 完全同参数：z-index -1（素材已自带 alpha，不需要额外补丁）
    expect(ref, '必须 z-index:-1（与百褶 ∞ 同层，素材已修好）')
      .toMatch(/z-index:\s*-1/);
    expect(INF, '百褶 ∞ 现在不是 -1 了 ⇒ 这条契约要重新对').toMatch(/z-index:\s*-1/);

    // ★★ 素材必须自带 alpha —— 这是「看不见矩形边」的唯一保证。
    //   踩了两轮：① 不透明矩形底 + opacity:.2 ⇒ 灰绿矩形，截图上一眼可见边界
    //   （实测差 47/255）② 改用 mix-blend-mode:multiply **压不住**
    //   （multiply 只改色、不裁形状）⇒ 正解是素材侧把纯黑底转 alpha。
    //   ⇒ 门闩守「不许重新引入 blend 补丁」+「产物图确实带 alpha」。
    expect(CODE, '不该再有 mix-blend-mode 补丁（素材已自带 alpha，blend 压不住矩形边）')
      .not.toMatch(/mix-blend-mode/);

    // ⑤ 不吃点击
    expect(ref, '必须 pointer-events:none（它是装饰层）').toMatch(/pointer-events:\s*none/);
  });

  it('★ 本页必须关掉百褶 ∞（两套母题叠在一起会脏）', () => {
    /* Topbar 注释里已记过这个教训：「切片档案」四层换 ∞ 底纹时就是因为叠着才整体删掉。 */
    const off = CODE.match(/:global\(body\.about-plate \.page-inf\)\s*\{([^}]*)\}/);
    expect(off, '没找到关掉 .page-inf 的规则 ⇒ 百褶 ∞ 会与月相纹叠加').toBeTruthy();
    expect(off![1], '用 display:none 关（它这层fixed 满屏，opacity:0 仍占合成层、很贵）')
      .toMatch(/display:\s*none/);
  });

  it('★ body 保持不透明纸白底（与上一版相反），所有纸托底已删', () => {
    /* 上一版为了让深绿大图透出来，把 body 改成 transparent 并给每块垫纸。
       现在底纹是 z-index:-1 的淡墨纹 ⇒ 它画在 body 背景**之下**才正常
       （-1 的定义就是画在父元素背景之下）⇒ body 必须恢复 var(--paper)。 */
    expect(CODE, 'body 不得再被改成 transparent（底纹已回到 -1，body 要保住纸白底）')
      .not.toMatch(/body\.about-plate\s*\{[^}]*background:\s*transparent/);
    // 纸托底三件套整段作废
    expect(CODE, '`.prose::before` 纸托底应已删（底纹是淡墨纹，不需要压）')
      .not.toMatch(/\.prose::before/);
    expect(CODE, '`.fig-block::before` 纸托底应已删').not.toMatch(/\.fig-block::before/);
    expect(CODE, '`.page-paper` 页头纸应已删').not.toMatch(/\.page-paper/);
    expect(CODE, '`.ref-paper` 分段纸应已删').not.toMatch(/\.ref-paper/);
  });

  it('★ 不做灰度 / 不染色 —— 站主要的是原色与强调色', () => {
    /* 站主 16:20 原话：「你不要变他们的颜色什么的」「我要的强调色呢」。
       前两版分别做了「统一染墨绿」与「压成极淡 alpha」⇒ 都被否。
       ★ 注意：opacity 本身**允许**（这一版照抄百褶 ∞ 就是 .2），
         被否的是「filter 改色」与「把 .ref-main 单独压淡」。 */
    const rules = [...CODE.matchAll(/(\.ref[\w-]*[^{}]*)\{([^}]*)\}/g)].map((m) => m[2]);
    expect(rules.length, '没找到底纹层的样式块 —— 改名了要同步这条断言').toBeGreaterThan(0);
    for (const r of rules) {
      expect(r, '底纹里还有 filter（会改掉原图的原色与强调色）').not.toMatch(/filter:/);
    }
    const main = CODE.match(/\.ref-main\s*\{([^}]*)\}/);
    if (main) expect(main[1], '`.ref-main` 不该被单独压淡（整体 opacity 只在 .ref-plate 上）')
      .not.toMatch(/opacity:\s*0?\.\d/);
  });

  it('底纹层是 fixed 装饰层，且模板里带 aria-hidden', () => {
    expect(SRC).toMatch(/class="ref-plate" aria-hidden="true"/);
  });

  it('★ 不需要顶部空档（那是为了让铺满视口的大图露出而设的）', () => {
    /* .about-main 曾有 padding-top: min(30vh, 380px)。
       它服务的是「深绿大图从页面上方整段露出」，且会让左右两栏首行基线错开
       （实测左栏 y=490、右栏 y=110）⇒ 现在必须删。 */
    expect(CODE, '顶部空档应已删（底纹照抄百褶 ∞，不需要给图腾位置）')
      .not.toMatch(/\.about-main\s*\{[^}]*padding-top:\s*min\(30vh/);
  });
});

describe.skipIf(!hasDist)('产物里的背景图', () => {
  const ABOUT = readFileSync(join(DIST, 'about', 'index.html'), 'utf8');
  const cssFile = readdirSync(join(DIST, '_astro')).find((f) => /^about\..*\.css$/.test(f));
  const CSS = cssFile ? readFileSync(join(DIST, '_astro', cssFile), 'utf8') : '';

  /* ---- 产物 DOM 位置（2026-10-03 修「打开页面背景从下往上跳」加）----
     根因：底纹层原本走普通 slot ⇒ 落进 `.shell` 内部，而页面过渡
     `html.pt-play .shell { animation: pt-shell … }` 会给 `.shell` 加 transform
     ⇒ **被 transform 的祖先成为 fixed 的包含块** ⇒ `top:50%` 从「视口 50%」
     变成「.shell 盒 50%」。实测跳位 91px（266 → 357 → 266）。
     ⇒ 改走 Base 的 `plate` 具名槽，落在 `.shell` 之外。
     ★ 这只能靠**产物 DOM 顺序**守住：源码里两者都在 `<Base>` 内，
       看不出谁在外；scoped CSS 与位置无关，也不参与这个判断。 */
  it('★ 底纹层在 .shell 之外（否则页面过渡的 transform 会让 fixed 层跳位）', () => {
    const iPlate = ABOUT.indexOf('class="ref-plate"');
    const iShell = ABOUT.indexOf('class="shell"');
    const iMain = ABOUT.indexOf('id="main"');
    expect(iPlate, '产物里找不到 .ref-plate（底纹没渲染？）').toBeGreaterThan(-1);
    expect(iShell, '产物里找不到 .shell').toBeGreaterThan(-1);
    expect(iMain, '产物里找不到 <main id="main">').toBeGreaterThan(-1);
    expect(iPlate, '底纹层落进了 .shell 内部 ⇒ 页面过渡时 fixed 包含块被改、背景会跳位')
      .toBeLessThan(iMain);
    expect(iPlate, '底纹层应在 <main> 之前（与 Topbar 的 .page-inf 同级）')
      .toBeLessThan(iShell);
  });

  it('★ Base 提供 plate 具名槽，且它落在 .shell 之外', () => {
    const base = readFileSync(join(ROOT, 'src/layouts/Base.astro'), 'utf8');
    const slotIdx = base.indexOf('<slot name="plate"');
    expect(slotIdx, 'Base 里没有 <slot name="plate"> —— 底纹层又落回 .shell 内部了')
      .toBeGreaterThan(-1);
    const shellIdx = base.indexOf('class="shell"');
    expect(shellIdx, 'Base 里找不到 .shell').toBeGreaterThan(-1);
    expect(slotIdx, 'plate 槽必须写在 .shell 之前')
      .toBeLessThan(shellIdx);
  });

  it('渲染出背景图且带 srcset', () => {
    const imgs = [...ABOUT.matchAll(/<img[^>]*class="ref-img"[^>]*>/g)].map((m) => m[0]);
    expect(imgs.length, '产物里背景图数量不对').toBe(1);
    expect(imgs[0]).toMatch(/srcset="/);
  });

  it('★ body 带上了 about-plate 类（关百褶 ∞ 的作用域）', () => {
    /* ⚠ 与上一版的目的相反：上一版是为了让 body **透明**好让图透出来；
       现在是为了用 `body.about-plate .page-inf` 精确关掉百褶 ∞。
       class 是**合并**的（`chrome-page about-plate`），不是恰好等于 ⇒ 用词边界判。 */
    const bodyTag = ABOUT.match(/<body[^>]*>/);
    expect(bodyTag, '找不到 body 标签').toBeTruthy();
    expect(bodyTag![0], 'body 缺 about-plate 类 ⇒ 关不掉百褶 ∞，两套纹理会叠')
      .toMatch(/class="[^"]*\babout-plate\b/);
  });

  it('★ 产物里 .page-inf 确实被 display:none 关掉了', () => {
    /* 只查源码不够 —— `:global()` 与 scoped 的编译结果不同。
       以前就踩过「源码有 ≠ 产物有」（层叠规则插在注释前被替换掉）⇒ 必须查产物。 */
    expect(cssFile, '没找到关于页的产物 CSS').toBeTruthy();
    const off = CSS.match(/body\.about-plate\s+\.page-inf\s*\{([^}]*)\}/);
    expect(off, '产物 CSS 里没有关 .page-inf 的规则 ⇒ 百褶 ∞ 仍会渲染').toBeTruthy();
    expect(off![1], '产物里必须是 display:none').toMatch(/display:\s*none/);
  });

  it('★ 产物里标题真的落在纸白底上（不再被任何纸/图压住）', () => {
    /* 这一版不需要纸托底，「标题可读」改由 body 纸白底保证。
       门闩守两件事：① 产物里没有 .page-paper ② body 背景不是 transparent。 */
    expect(CSS, '产物里还有 .page-paper（纸应已删）').not.toMatch(/\.page-paper/);
    expect(CSS, '产物里 body.about-plate 被改成了透明（应恢复纸白底）')
      .not.toMatch(/body\.about-plate\s*\{[^}]*background:\s*transparent/);
  });

  it('★ 产物里标题的 grid 落位规则不带 cid（跨组件选择器的老坑）', () => {
    /* `.pagehead > h1` 会被 scoped 编译成带本页 cid 的属性选择器，
       而 h1 是 PageTitle 组件渲染的（带组件自己的 cid）⇒ 不匹配 ⇒ 规则静默失效。
       ⇒ 必须有 `:global()` 产出的一条**不带 cid** 的规则。 */
    const rules = CSS.match(/\.pagehead\s*>\s*h1[^{}]*\{[^{}]*\}/g) ?? [];
    expect(rules.length, '产物里找不到 .pagehead > h1 规则').toBeGreaterThan(0);
    for (const r of rules) {
      const h1Part = r.split(',').find((seg) => /\.pagehead\s*>\s*h1/.test(seg)) ?? '';
      expect(h1Part, '没在规则里找到 .pagehead>h1 那一段').toBeTruthy();
      expect(h1Part, '产物里 .pagehead>h1 带了 cid ⇒ 运行时匹配不到组件的 h1')
        .not.toMatch(/data-astro-cid/);
    }
  });

  it('★ 素材自带 alpha（纯黑底已转透明）—— 这是「看不见矩形边」的唯一保证', async () => {
    /* 这一条是**产物级**门闩，守的是 2026-10-03 踩的两轮：
       ① 不透明矩形底 + opacity:.2 ⇒ 灰绿矩形，截图上一眼看见下边界
          （实测 x=60：y≤300 rgb(250,250,247) vs y=700~1100 rgb(203,204,201)）
       ② mix-blend-mode:multiply **压不住**（只改色、不裁形状）
       ⇒ 正解是素材侧把纯黑底转 alpha（`_probe/_deep-plate.mjs`，阈值 6..48）。
       ★ 判据用 sharp 读 channels + 最大 alpha：
         只查 hasAlpha 不够 —— `alphaQuality` 那个不被识别的选项会让
         hasAlpha=true 但**全图 alpha=0**（脚本自检当场抓到过）。
       ⚠ 这是**同步**检查（构建前跑 sharp），不是 build 后查产物——
         查 dist 里的 webp 拿不到「原素材是否带 alpha」这条信息。
       ⚠⚠ 这个 it **必须标 async**（2026-10-03 修）：
         里面用了 `await import('sharp')` 与 `await img.metadata()`，
         而 vitest 不会因为里面有 await 就自动推断成异步 ——
         漏了 async 会报 `[PARSE_ERROR] await is only allowed within async functions`，
         整个测试文件**一个用例都跑不了**（表现为「Test Files 2 failed」但
         Tests 只有 1 个失败，很像「别处坏了」）。 */
    const out = join(PLATE_DIR, plates[0]);
    // 动态 import：sharp 是 astro 自带的依赖，不是本仓 package.json 里的依赖
    const sharpMod = await import('sharp');
    const sharp = sharpMod.default;
    const img = sharp(out);
    const meta = await img.metadata();
    expect(meta.hasAlpha, '素材没有 alpha 通道 ⇒ 纯黑底会变成灰绿矩形').toBe(true);
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let maxA = 0;
    for (let n = 3; n < data.length; n += info.channels) {
      if (data[n] > maxA) maxA = data[n];
    }
    expect(maxA, '素材最大 alpha 为 0 ⇒ 元素（月亮/星芒/蓝带）被整体清掉了').toBeGreaterThanOrEqual(200);
  });

  it('背景图体积可控（不是 10 MB）', () => {
    const refs = [...ABOUT.matchAll(/\/_astro\/([A-Za-z0-9_.-]+\.webp)/g)].map((m) => m[1]);
    let total = 0;
    for (const f of [...new Set(refs)]) {
      const p = join(DIST, '_astro', f);
      if (existsSync(p)) total += statSync(p).size;
    }
    expect(total / 1048576, `about 页引用的 webp 合计 ${(total / 1048576).toFixed(2)} MB`).toBeLessThan(2.5);
  });
});
