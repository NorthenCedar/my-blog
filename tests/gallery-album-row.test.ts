import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 相册「入口条」（`src/components/AlbumRow.astro`）—— 2026-10-07 新增这一族的契约。
 *
 * 站主原话：
 *   「下面**不放现在全部铺开的**，放**入口**，类似这样的，**有几个文件夹就放几个**，
 *     就像现在有三个一样，**以后我加文件夹推送后也要同步多一个**，
 *     我给的那个入口**默认第一张是放大的**，点其他张那一张放大，之前放大的缩小，
 *     记得要有**流畅的过渡动画**，点击**放大的照片**就进入这个文件夹，
 *     就像现在本站的照片砖墙一样，**不过是单独的一页**」
 *
 * ⇒ 这一条组件上有五件"错了就静默坏掉"的事，全部钉在这里：
 *   ① **无 JS 也有一条是放大的**：默认态写在 CSS（`:not(.ar-on) :first-child`），不是脚本加的
 *      —— 入口条是**导航**，没有 JS 时也要看得出"这几条是什么、点哪进哪"。
 *   ② **两条放大态规则必须互斥**：切到第 5 张之后，第一张必须**缩回去**
 *      （两条同时生效就会出现"两张都是大的"，而它看起来只是"有点怪"，不会报错）。
 *   ③ **点关着的那张只放大、点放大那张才进相册**：`if (i === cur) return;` 那句是全部机制。
 *   ④ **焦点激活必须区分指针与键盘**：Chrome 点链接的顺序是 pointerdown → focus → click，
 *      focus 若无条件激活，第一次点击就会变成"直接进相册"（站主要的是先放大）。
 *   ⑤ **条宽不写死**：算式里带本**条的张数** ⇒ 不管这条里 10 张还是 15 张都是"正好铺满一行"。
 *
 * 另外几条工程性的（都在这一轮真踩过）：
 *   ⑥ 编号字号跟着**条宽**缩（容器查询单位 `cqw`）—— 否则细条上的三位编号会被裁成"00"。
 *   ⑦ 相册页是动态路由，与 `/gallery/spiral/` **同处一个位置**：Astro 不检测冲突
 *      （会静默覆盖、少一页），所以保留字必须在**构建期**炸出来。
 *   ⑧ ★★★ 字号缩到 6.7px 就不是"小字"而是**污迹**了（57 个连排成一条灰虚线），
 *      所以细条要**藏**编号；而藏法只许 visibility（图注行高度得固定，否则切换时整行跳）。
 *
 * ── 第二轮追加（站主 2026-10-07 第二条指令）──────────────────────────
 *   「**不要这样叠好多张，最大 15 张**，且这些**边缘换成圆角**，**鼠标放上去要有悬浮**」
 *   ⑨ ★★★ **上限 15 张**。原来一条 = 整册每一帧 ⇒ 57 帧那册每条只有 12.2px 宽，
 *      照片被压成一条看不出内容的彩色锯齿（目检实测，不是推测）。
 *      抽样**等距且含首尾**（001 / 005 / … / 057）⇒ 编号仍是册内真实序号。
 *      ★ 只钉 `MAX = 15` 太弱（改成"取前 15"或删掉去重，它照样绿）⇒ 四条一起钉。
 *   ⑩ **圆角落在框上**（overflow:hidden 那层），半径用 min() 跟条宽绑。
 *   ⑪ **悬停要浮起来**：抬升用 --hover-lift + 影子 + 照片推近 1.03，且整块可撤。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'gallery', 'index.html'));

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const scriptsOf = (s: string) =>
  [...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

const SRC = read('src/components/AlbumRow.astro');
const CODE = strip(SRC);
const JS = scriptsOf(SRC);

/** 一条里的张数上限：从**源码**里读（`const MAX = 15`），改了上限这里跟着变。
 *  门闩里"上限就是 15"那条用**字面量**在源码里钉，不引用它 —— 否则改小上限会一起变绿。 */
const MAX = Number((CODE.match(/(?:const|let)\s+MAX\s*=\s*(\d+)\b/) ?? [])[1] ?? 15);

const GAL_SRC = read('src/pages/gallery/index.astro');
const GAL_CODE = strip(GAL_SRC);
const ALBUM_SRC = read('src/pages/gallery/[album].astro');

const MANIFEST = JSON.parse(read('public/gallery/manifest.json')) as {
  albums: { id: string; title: string; total: number; frames: { alt: string }[] }[];
};
const ALBUMS = MANIFEST.albums;
const GAL = hasDist ? readFileSync(join(DIST, 'gallery', 'index.html'), 'utf8') : '';
/** 一条入口的整段标记（条里没有嵌套 <section>） */
const ROWS = [...GAL.matchAll(/<section class="plate"[\s\S]*?<\/section>/g)].map((m) => m[0]);

describe('相册入口条 · 手风琴的行为契约', () => {
  it('★★ 无 JS 也有一条是放大的：默认态写在 CSS 里，不是脚本加的', () => {
    /* 判据：`.ar:not(.ar-on) .ar-item:first-child` 拿到放大宽度。
       ★ `.ar-on` 由脚本挂 —— 没挂上时（无 JS / 脚本没跑到）就是这一条在生效。 */
    expect(CODE, '默认放大态必须写在 CSS 的 :not(.ar-on) 分支里（无 JS 时才成立）').toMatch(
      /\.ar:not\(\.ar-on\)\s+\.ar-item:first-child[\s\S]{0,200}?width:\s*var\(--ar-open\)/,
    );
    expect(CODE, '`ar-on` 这个类名必须由脚本加上（否则上面那条永远生效，切换会失灵）').toMatch(/class/);
    expect(JS, '脚本没有给容器挂 .ar-on').toMatch(/classList\.add\('ar-on'\)/);
    /* 反向正对照：不许用 hidden / display:none 把没 JS 的那条藏起来 —— 那是"没有 JS 就不能用" */
    expect(CODE, '入口条不是装置 ⇒ 不许用 display:none 门控').not.toMatch(/\.ar-item\s*\{[^}]*display:\s*none/);
  });

  it('★★ 两条放大态规则互斥：切到别的张之后，第一张必须缩回去', () => {
    const offGuard = /\.ar:not\(\.ar-on\)\s+\.ar-item:first-child/.test(CODE);
    const onGuard = /\.ar\.ar-on\s+\.ar-item\.on/.test(CODE);
    expect(offGuard, '缺"未初始化时第一张放大"那条').toBe(true);
    expect(onGuard, '缺"初始化后由 .on 决定"那条').toBe(true);
    /* ★★ 关键：未初始化那条必须被 :not(.ar-on) 包住。少了它，切走之后第一张会一直赖着不缩
       （两张都是大的 —— 不报错、只是"看着怪"，最难查的那种）。 */
    expect(CODE, '放大态的两条规则必须互斥，否则第一张不会缩回去').toMatch(
      /\.ar:not\(\.ar-on\)\s+\.ar-item:first-child/,
    );
    /* ★ 初始化那两行必须真的在（且在任何事件绑定之前）——
       它们是"两条规则互斥"能生效的前提：不挂 `.ar-on`，`:not(.ar-on)` 那条会一直生效。 */
    const iOn = JS.indexOf("items[0].classList.add('on')");
    const iArOn = JS.indexOf("row.classList.add('ar-on')");
    const iBind = JS.indexOf("addEventListener('click'");
    expect(iOn, '脚本没有在初始化时给第一张挂 .on').toBeGreaterThan(-1);
    expect(iArOn, '脚本没有在初始化时给容器挂 .ar-on（不挂的话切换会失灵）').toBeGreaterThan(-1);
    expect(iOn < iBind && iArOn < iBind, '初始态必须在绑事件之前定好').toBe(true);
  });

  it('★★ 点关着的那张只放大、点放大那张才进相册页', () => {
    /* 一行只有一个入口 ⇒ 每一张的 href 都指向**同一个**相册页，
       所以"哪一张是放大态"纯粹是视觉状态，不会出现"看着是 A、点下去进 B"。 */
    expect(JS, '缺"点关着的那张只放大"的判据（i === cur 时放行、否则拦下）').toMatch(
      /addEventListener\('click'[\s\S]{0,200}?if \(i === cur\) return;[\s\S]{0,160}?preventDefault\(\)/,
    );
    /* 每一条的 href 都是**相册页**，不是大图 —— 这一条是"点进文件夹"的落点 */
    expect(CODE, '入口条的 href 必须指向相册页（不是 1280 大图）').toMatch(/href=\{href\}/);
    expect(CODE, '相册页地址必须走 encodeURIComponent（册名是中文）').toMatch(
      /const href = `\/gallery\/\$\{encodeURIComponent\(album\.id\)\}\/`/,
    );
    /* 反向正对照：入口条是**真跳转** ⇒ 绝不能带 data-no-transition（那样点了没反应）。
       ⚠ 查 `CODE`（剥过注释）—— 文件头那段解释**故意**提到这个属性名，裸查会被自己的注释打脸。 */
    expect(CODE, '入口条是换页 ⇒ 不许带 data-no-transition').not.toContain('data-no-transition');
  });

  it('★★ 焦点激活要区分指针与键盘（Chrome 点链接会先 focus 再 click）', () => {
    /* 真踩过的坑：focus 无条件激活 ⇒ `i === cur` 在 click 时已经成立 ⇒ 第一次点击直接进相册。
       正解是记一个"最近一次指针按下"的时刻，250ms 内的 focus 不算键盘。 */
    expect(JS, '没有记录指针按下时刻').toMatch(
      /addEventListener\('pointerdown'[\s\S]{0,120}?pointerAt = performance\.now\(\)/,
    );
    expect(JS, 'focus 处理没有把"指针点出来的焦点"排除掉').toMatch(
      /addEventListener\('focus'[\s\S]{0,240}?performance\.now\(\) - pointerAt < 250/,
    );
    /* 键盘那条路仍要通：focus 走到就放大（于是 Enter 落在正确的目的地） */
    expect(JS, '键盘焦点没有激活对应那一张').toMatch(/addEventListener\('focus'[\s\S]{0,300}?focus\(i\)/);
  });

  it('★ 条宽不写死：算式里带本条的张数（15 张不溢出 / 10 张不留空）', () => {
    expect(CODE, '条宽必须按"剩余空间 ÷ (张数-1)"算，不许写死长度').toMatch(
      /\.ar-item\s*\{[\s\S]{0,400}?width:\s*max\(0px,\s*calc\([\s\S]{0,200}?var\(--ar-n\)/,
    );
    expect(CODE, '--ar-n 必须由模板按本条张数写进去').toMatch(/--ar-n:\$\{n\}/);
    /* ★★ 2026-10-07 改：分母的 n 取**抽样后**的长度（不再是整册帧数）。
       57 帧那册也只按 15 算条宽 —— 原来按 57 算，每条只有 12.2px（目检：连成一条彩色锯齿）。 */
    expect(CODE, 'n 必须按抽样后的张数算（57 帧那册也只按 15 算条宽）').toMatch(
      /Math\.max\(2,\s*pick\.length\)/,
    );
    /* 反向对照：n 若退回整册帧数，上面那条改小、这条仍成立，但抽样就没意义了 */
    expect(CODE, 'n 不许退回整册帧数（那会让每条退回十几 px）').not.toMatch(
      /Math\.max\(2,\s*album\.frames\.length\)/,
    );
    expect(CODE, '放大那张的宽度必须是相对量（窄屏自己收，不用逐断点写）').toMatch(/--ar-open:\s*clamp\(/);
    /* 产物里逐册核一遍：--ar-n 就是**抽样后**的张数 */
    expect(hasDist, '先 npm run build').toBe(true);
    ROWS.forEach((seg, i) => {
      const a = ALBUMS[i];
      const k = Math.min(MAX, a.total);
      expect(seg, `第 ${i + 1} 条的 --ar-n 不是本条张数 ${k}`).toContain(`--ar-n:${Math.max(2, k)}`);
    });
  });

  /* ★★★ 「一条里最多 15 张」是站主 2026-10-07 的原话：「不要这样叠好多张，最大 15 张」。
     下面四条把它的**每一个可观察后果**都钉住 —— 只钉 `MAX = 15` 这个常数太弱：
     有人把抽样改成"取前 15"、或把去重逻辑删掉让它重复，MAX 那条照样绿。 */
  it('★★★ 一条里最多 15 张：上限、含首尾、去重、编号仍是册内真实序号', () => {
    expect(CODE, '上限没写死 15（站主原话「最大 15 张」）').toMatch(/(?:const|let)\s+MAX\s*=\s*15\b/);
    /* 抽样步长必须含**首尾**（round(k·(total−1)/(MAX−1))）——
       取前 15 张会让 57 帧的册看起来"只有开头那点"，与板头「57 帧」对不上。 */
    expect(CODE, '抽样步长没含首尾（应是 round(k·(total−1)/(MAX−1))，不是取前 15 张）').toMatch(
      /Math\.round\(\s*\(?\s*k\s*\*\s*\([\s\S]{0,40}?length\s*-\s*1[\s\S]{0,60}?\)\s*\/\s*\(?\s*MAX\s*-\s*1/,
    );
    /* 去重：帧数与 MAX 接近时 round 可能撞出同一个下标 ⇒ 必须挡掉 */
    expect(CODE, '抽样没去重（相邻两个 round 可能给出同一个下标 ⇒ 同一个图出现两次）').toMatch(
      /out\.length === 0 \|\| out\[out\.length - 1\]\.i !== i/,
    );
    expect(hasDist, '先 npm run build').toBe(true);
    ROWS.forEach((seg, i) => {
      const a = ALBUMS[i];
      const nos = [...seg.matchAll(/class="ar-cap-no"[^>]*>(\d{3})</g)].map((m) => Number(m[1]));
      expect(nos.length, `第 ${i + 1} 条超过了 15 张上限（实际 ${nos.length}）`).toBeLessThanOrEqual(MAX);
      expect(nos.length, `第 ${i + 1} 条应取 min(15, ${a.total}) = ${Math.min(MAX, a.total)} 张`).toBe(
        Math.min(MAX, a.total),
      );
      expect(new Set(nos).size, `第 ${i + 1} 条里有重复的编号（抽样没去重）`).toBe(nos.length);
      /* ★ 编号必须是**册内真实序号**（57 帧那册是 001 / 005 / … / 057），
         不是 001…015 的假连续 —— 否则点进相册页看到的是"少了中间那几张"的错觉。 */
      expect(nos[0], `第 ${i + 1} 条必须从本册第 001 张起（含首尾）`).toBe(1);
      expect(nos[nos.length - 1], `第 ${i + 1} 条必须含本册最后一张（共 ${a.total} 张）`).toBe(a.total);
      if (a.total > MAX) {
        /* 步长均匀：任意相邻差都应等于 round 步长 ±1（抽样是等距的，不是随机挑） */
        const step = (a.total - 1) / (MAX - 1);
        for (let k = 1; k < nos.length; k++) {
          const d = nos[k] - nos[k - 1];
          expect(Math.abs(d - step), `第 ${i + 1} 条第 ${k} 个间距 ${d} 偏离等距步长 ${step.toFixed(2)}`).toBeLessThan(1.01);
        }
        expect(seg, `${a.total} 帧那册抽样了 ⇒ 板头必须说明"取样"，否则读者以为只有 ${MAX} 张`).toContain(
          '取样',
        );
      }
    });
  });

  it('★★★ 圆角是**胶囊**（四个角真的有弧度），且落在**框**上', () => {
    /* 圆角必须落在 .ar-frame（overflow:hidden 的框）而不是 img ——
       放 img 上会被 cover 裁出的方形边压住，等于没圆。 */
    expect(CODE, '圆角没落在 .ar-frame（框）上').toMatch(
      /\.ar-frame\s*\{[\s\S]{0,600}?border-radius:/,
    );
    /* ★★★ 站主 2026-10-07 第二轮追认：「变圆角是让那些照片的四个角变成有弧度的，像胶囊一样」。
       第一版给的是 `min(3px, 0.5cqw)` —— 那是**削角**：细条上半径只有 0.289px，
       肉眼根本看不出弧度，等于没做（目检实测，不是推测）。
       ⇒ 细条那档（默认）必须**真的大**：999px（胶囊惯用写法，浏览器按短边各自夹到一半）。 */
    const base = /\.ar-frame\s*\{[\s\S]{0,600}?border-radius:\s*([^;]+);/.exec(CODE)?.[1] ?? '';
    expect(base.trim(), `细条那档圆角太小（现在是 ${base.trim()}）—— 那不是胶囊，是削角`).toMatch(
      /999px|\b100%/,
    );
    /* ★ 反向：`50%` 在**非正方形**框上解析成椭圆（横竖各按 50%）而不是胶囊 ——
       细条会变成一个瘦长的椭圆。要胶囊就写 999px（横向 999、纵向 999 各自夹到短边一半）。 */
    expect(base.trim(), '胶囊请写 999px（50% 在长条上会解析成椭圆）').not.toBe('50%');
  });

  it('★★★ 圆角**分两档**：放大那张给小圆角，其余细条保持胶囊（站主第三轮）', () => {
    /* 站主：「小图可以，大图的圆角小一点」。
       若放大那张也用 999px，半径会被夹到 76px（365×152 ⇒ 长短轴比 1 : 2.4），
       观感上是"胖胶囊"，照片边角被吃掉太多 —— 目检实拍确认那样像按钮不像照片。 */
    const open = /\.ar:not\(\.ar-on\)\s+\.ar-item:first-child\s+\.ar-frame,\s*\.ar\.ar-on\s+\.ar-item\.on\s+\.ar-frame\s*\{[\s\S]{0,200}?border-radius:\s*([^;]+);/.exec(CODE);
    expect(open, '缺"放大那张用小圆角"这条（默认态与初始化后两支都要写，:not(.ar-on) 那个分支不能少）').not.toBeNull();
    const rOpen = (open?.[1] ?? '').trim();
    const px = Number(/^([\d.]+)px$/.exec(rOpen)?.[1] ?? NaN);
    expect(Number.isFinite(px), `放大那档必须给一个 px 值（现在是 ${rOpen}）—— 999px 在 365px 宽的框上会被夹成胖胶囊`).toBe(true);
    /* 小圆角要真的"小"：相对高度 152px，6px ≈ 4%。给到 20px 以上就又是胶囊了。 */
    expect(px, `放大那档圆角 ${px}px 太大了（大图会变回胶囊）`).toBeLessThanOrEqual(20);
    expect(px, `放大那档圆角 ${px}px 太小（又回到削角）`).toBeGreaterThanOrEqual(3);
    /* ★★★ 两条圆角规则必须**互斥**且**同构**于放大态那两条：
       少了 :not(.ar-on) 那个分支，切到第 5 张之后第一张会留着 6px，
       与左右那些胶囊不一致（不报错、只是"看着怪"）。 */
    /* 顺序：分档两条必须**在** .ar-frame 那条之后（同特异性下才覆盖得掉） */
    const iBase = CODE.indexOf('.ar-frame {');
    const iOpen = CODE.search(/\.ar:not\(\.ar-on\)\s+\.ar-item:first-child\s+\.ar-frame/);
    expect(iOpen, '找不到分档规则').toBeGreaterThan(iBase);
  });

  it('★★ 不许有「进入 →」按钮：放大那张本身就是链接（站主第四轮）', () => {
    /* 站主2026-10-07：「别加这个进入按钮，点大图就直接进」。
       ⇒ 行动召唤＝照片本身。多一个按钮＝同一个目的地说了两遍，还会压在照片上抢戏。
       ★ 门闩钉"不许回来"：既钉组件里不许有这个元素，也钉剥过注释的代码里不许有它的样式，
         否则有人从旧版 dist/ 里抄回一段 .ar-go 会静默通过。 */
    expect(SRC, '组件里又出现了「进入 →」按钮（站主明令删掉，点大图直接进）').not.toMatch(/ar-go|>进入\s*→?/);
    expect(CODE, '.ar-go 的样式还在（会盖住照片且和链接重复）').not.toMatch(/\.ar-go\b/);
    /* ★ 反过来钉住"点大图直接进"这件事本身：放大那张必须是一个真 <a href=相册页>，
       而不是 div + JS 跳转（无 JS 时入口条仍然要能当导航用）。 */
    expect(CODE, '照片框必须是真链接 <a class="ar-frame" href=相册页>').toMatch(
      /<a\s+class="ar-frame"\s+href=\{href\}>/,
    );
    /* ★ 反向：不许给.ar-frame 加 aria-label —— 它会顶掉 img 的 alt，
       读屏就听不到照片是什么了（无障碍上是倒退）。"点了会跳走"由容器那条说。 */
    expect(CODE, '.ar-frame 上不许有 aria-label（会顶掉 img 的 alt）').not.toMatch(
      /<a[^>]*class="ar-frame"[^>]*aria-label/,
    );
    /* ★ "点了会跳走"这句话必须仍然有人在说 —— 容器那条 role="group" 的 aria-label。 */
    expect(CODE, '容器的 aria-label 里丢了"点放大那张进入"（删了按钮，提示得有人接手）').toMatch(
      /aria-label=\{`\$\{album\.title\}[\s\S]{0,120}?点放大那张进入/,
    );
  });

  it('★★ 悬停要"浮起来"：抬升 + 影子 + 照片推近，且动效可撤', () => {
    /* 抬升幅度必须用 --hover-lift（全站 hover 基线的既有 token，不另造） */
    expect(CODE, '悬停没抬升，或抬升幅度不是走 --hover-lift').toMatch(
      /\.ar-frame:hover[\s\S]{0,200}?transform:\s*translateY\(calc\(var\(--hover-lift\)\s*\*\s*-1\)\)/,
    );
    /* ★ z-index 必须在悬停时提上来：抬起的那条会被右邻压住（DOM 顺序靠前的在下） */
    expect(CODE, '悬停没提 z-index（抬起的那条会被右邻压住）').toMatch(
      /\.ar-frame:hover[\s\S]{0,240}?z-index:\s*2/,
    );
    expect(CODE, '悬停没给影子').toMatch(/\.ar-frame:hover[\s\S]{0,240}?box-shadow:\s*var\(--glass-shadow\)/);
    /* 照片推近：与砖墙那条 .plate-body hover 同一档 1.03；不做任何改色滤镜 */
    expect(CODE, '悬停没让照片推近').toMatch(
      /\.ar-frame:hover img[\s\S]{0,120}?transform:\s*scale\(1\.03\)/,
    );
    /* 站规：动效可撤 ⇒ 悬停推近/抬升必须整块在 no-preference 之内。
       ★ 注意 transition 本身**不在**那个 @media 里（那是"随时可撤"的兜底），
         门闩只钉"位移不许在 reduce 下发生"。 */
    expect(CODE, '悬停的位移/推近没有整块收进 prefers-reduced-motion: no-preference').toMatch(
      /@media \(hover: hover\) and \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]{0,700}?\.ar-frame:hover[\s\S]{0,300}?scale\(1\.03\)/,
    );
  });

  it('★ 编号字号跟着条宽缩（否则细条上的编号被裁成"00"）', () => {
    expect(CODE, '缺容器查询的容器声明（cqw 要靠它才有意义）').toMatch(
      /\.ar-item\s*\{[\s\S]{0,500}?container-type:\s*inline-size/,
    );
    expect(CODE, '编号字号必须用容器查询单位（跟着这一条的宽度缩，宽条又有上限）').toMatch(
      /\.ar-cap-no\s*\{[\s\S]{0,160}?font-size:\s*min\([^)]*cqw\)/,
    );
    /* 正对照：编号确实在产物里（三位零填充，与砖墙同一套编目号），
       数量按抽样后的张数（上面那条已钉上限 15 / 含首尾 / 不重复） */
    expect(hasDist, '先 npm run build').toBe(true);
    ROWS.forEach((seg, i) => {
      const a = ALBUMS[i];
      const nos = [...seg.matchAll(/class="ar-cap-no"[^>]*>(\d{3})</g)].map((m) => m[1]);
      expect(nos.length, `第 ${i + 1} 条应有 ${Math.min(MAX, a.total)} 个编号`).toBe(
        Math.min(MAX, a.total),
      );
      expect(nos[0], `第 ${i + 1} 条的编号必须从 001 起`).toBe('001');
    });
  });

  it('★★★ 塞得进 ≠ 读得出：细条上的编号要**藏起来**（且只许 visibility）', () => {
    /* ★ 目检实测（2026-10-07）：一册 57 张时每条只有 12.2px 宽，
       `font-size: min(0.6rem, 55cqw)` 把编号压到 6.7px ——
       57 个连排就是**一条灰色虚线污迹**（680 档更窄、更明显），
       看着像渲染没干净，不是信息。第二册每条 57.8px 时同样的编号却很好看。
       ⇒ 判据是"读者能不能读"，所以按**本槽宽度**给一刀。 */
    expect(CODE, '缺"细条不印编号"的容器查询（`.ar-item` 本来就是 inline-size 容器）').toMatch(
      /@container\s*\(max-width:\s*\d+px\)\s*\{\s*\.ar-cap-no\s*\{/,
    );
    /* ★★ 必须 visibility —— display:none 会让这一条的图注行不生成行盒、
       高度塌成 0 ⇒ 切换放大态时整条入口行上下跳约 19px，
       与"图注行高度固定、不参与过渡"那条设计直接相反（2026-10-07 加这条时踩过）。 */
    expect(CODE, '细条隐藏编号必须用 visibility（display:none 会让图注行塌掉、切换时整行跳）').toMatch(
      /\.ar-cap-no\s*\{\s*visibility:\s*hidden/,
    );
    expect(CODE, '不许用 display:none 藏编号（图注行会塌）').not.toMatch(
      /\.ar-cap-no\s*\{\s*display:\s*none/,
    );
  });

  it('★ 动效可撤：宽度过渡只在 no-preference 下开', () => {
    expect(CODE, '宽度过渡必须包在 prefers-reduced-motion: no-preference 里').toMatch(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*\.ar-item\s*\{\s*transition:\s*width/,
    );
    /* ★ 时长用站上的叙事层 token（不许新造一个数） */
    expect(CODE, '过渡时长要用 token').toMatch(/transition:\s*width\s+var\(--dur-enter\)/);
  });
});

describe('相册页 · 动态路由的守卫', () => {
  it('★★ 相册名撞保留字（spiral / index）时在**构建期**报错，不许静默覆盖', () => {
    /* Astro 7.3.5 实测：静态路由 + 动态路由产出同一路径时**没有任何检测**
       ⇒ 两个页面先后写同一个 index.html，谁后写谁生效 ⇒ **静默少一页**。
       所以保留字表必须存在，且 `getStaticPaths` 里必须真的 throw。 */
    expect(ALBUM_SRC, '缺保留字表（spiral 会被相册名顶掉）').toMatch(/['"]spiral['"]/);
    expect(ALBUM_SRC, '没有在 getStaticPaths 里守卫 ⇒ 撞车时会静默覆盖').toMatch(
      /getStaticPaths\(\)[\s\S]{0,600}?throw new Error/,
    );
    /* 反向正对照：现有三个相册**都没有**撞上保留字（否则构建就该红了） */
    expect(ALBUMS.some((a) => a.id === 'spiral')).toBe(false);
    expect(ALBUMS.some((a) => a.id === 'index')).toBe(false);
  });

  it('★ 一册一页：每册都真的生成了自己的页面', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    for (const a of ALBUMS) {
      expect(existsSync(join(DIST, 'gallery', a.id, 'index.html')), `/gallery/${a.id}/ 没生成`).toBe(true);
    }
    /* 正对照：螺旋盘那页还在（动态路由没有把它顶掉） */
    expect(existsSync(join(DIST, 'gallery', 'spiral', 'index.html')), '/gallery/spiral/ 被动态路由顶掉了').toBe(true);
  });
});
