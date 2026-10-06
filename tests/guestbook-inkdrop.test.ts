import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 留言页装置「墨滴 INK DROP」（指针留墨痕几秒渗开 + 新留言落下墨滴扩散）的契约。
 * 站主 2026-10-06 指定，与本页静态底纹同源（蓝色钢笔母题）。
 *
 * 这里守的是「不可退让的性质」，不是「上一版的实现形态」：
 *   ① 画布**不许有 hidden** —— `hidden` 是 display:none，clientWidth 恒为 0，
 *      装置永远画不出第一帧（AGENTS 2026-10-05 星座那轮的原文教训）。
 *      显隐只能用 opacity 门控（`.is-ready`）。
 *   ② 零 Math.random —— 形状/渗开必须是 f(时间) 的确定函数 + 整数哈希，
 *      否则同 t 逐点比对（唯一可信的形状类验收手段）直接失效。
 *   ③ **不读 DOM 几何** —— 装置一旦量 getBoundingClientRect，评论一展开就会
 *      重排重画并与评论列表抢主线程（float.ts 的约定①）。
 *   ③′ **墨痕范围 = 整页，不设区域门槛** —— 除窄屏 /reduced-motion 两种降级外，
 *      不存在"某些位置静默不留墨"。这条是 2026-10-06 二次实测加的：
 *      先后试过「视口比例带」与「量 `.prose` 真实几何」两种**都有区域的**写法，
 *      前者把整屏 95% 丢了、后者把范围收窄到留言框（站主明确说整屏才对）——
 *      **两次都是绿着的假契约**，因为它们守的是"某种实现"而不是"行为"。
 *   ④ 痕迹**必须会自愈**（几秒渗开后收干净）—— 这是墨滴与显影板「涂抹擦痕」
 *      的机制分界：后者越抹越清楚，前者留着会自己淡掉。
 *   ⑤ 时间基准**全文件统一绝对秒** —— t0 与"当前时刻"混用相对/绝对会让年龄恒为负，
 *      痕迹永远淡不掉。
 *   ⑥ 落滴的信号是**事件**（`inkdrop`），且只在**提交成功后**派发 ——
 *      失败不该有墨滴；装置不许靠观察 DOM 变化来猜。
 *   ⑦ 装置只挂在本页、只在 plate 槽内、z-index:-1 / pointer-events:none / aria-hidden。
 *   ⑧ 降级四态：reduced-motion 静态帧（**有终态**，不是随便挑相位）、无 JS、
 *      ≤767px 只留落滴不留痕、切标签停帧**不清屏**（痕迹是累积状态）。
 *   ⑨ 零新增运行时依赖（红线）。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'guestbook', 'index.html'));

const SRC = readFileSync(join(ROOT, 'src/scripts/inkdrop.ts'), 'utf8');
/* 剥注释**只用于负向断言**（如「不含 Math.random / getBoundingClientRect」）。
   ⚠ 正向断言一律用未剥注释的原文：注释与代码同源时，朴素正则会误吞
     （AGENTS 2026-10-01「判据扫到的字符串来自你自己写的注释」那条）。 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');

const ASTRO = readFileSync(join(ROOT, 'src/pages/guestbook.astro'), 'utf8');
const ACSS = ASTRO.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const COMMENTS = readFileSync(join(ROOT, 'src/scripts/comments.ts'), 'utf8');
const TOKENS = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');

const GUEST = hasDist ? readFileSync(join(DIST, 'guestbook', 'index.html'), 'utf8') : '';

describe('留言页 · 墨滴装置 · 降级与显隐', () => {
  it('★ 画布不许有 hidden（有hidden ⇒ 永远画不出第一帧）', () => {
    /* AGENTS 2026-10-05 星座那轮：加了 `hidden`、构建不报错、测试全绿，
       但 clientWidth 恒为 0 ⇒ 画面全空。只能用 opacity 门控。 */
    expect(GUEST, '画布绝不能带 hidden 属性').not.toMatch(/<canvas[^>]*data-inkdrop[^>]*\shidden/);
    /* ⚠ 第二条要卡住**模板里**的 canvas 标签。
       注意：不能写 `/<canvas[^>]*hidden/` —— `aria-hidden="true"` 里含`hidden` 子串，
       会恒真（AGENTS 2026-10-01「判据扫到的字符串来自你自己写的注释」同源教训）。
       正解：只匹配 `hidden` 作为**独立属性**（前面必须是空白、后面不是 `-`）。 */
    expect(ASTRO, '画布绝不能带 hidden 属性（aria-hidden 不算）').not.toMatch(
      /<canvas[^>]*\shidden(\s|=|>)/,
    );
    /* 反向确认：aria-hidden 必须还在（它是需要的） */
    expect(ASTRO).toMatch(/<canvas[^>]*aria-hidden="true"/);
    /* 显隐走 opacity + .is-ready（元素始终占位，fit() 才量得到尺寸） */
    const cv = ACSS.match(/\.inkdrop-bg\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(cv, '没读到 .inkdrop-bg 的样式块').toBeTruthy();
    expect(cv, '显隐门控必须是 opacity（不是 display:none）').toMatch(/opacity:\s*0\s*;/);
    expect(cv, '显隐门控不许用 display:none —— 那会让 fit() 量不到尺寸').not.toMatch(/display:\s*none/);
    expect(ACSS).toMatch(/\.inkdrop-bg\.is-ready\s*\{[^}]*opacity:\s*1/);
    /* ★★ 两条分支（RM 档 / 正常档）**都**必须显形。
       2026-10-06 实测踩到：只在正常档加了 .is-ready，RM 档画完直接 return
       ⇒ 画布永远 opacity:0 ⇒ **画了等于没画**，而构建不报错、契约全绿、截图只有底纹。
       ⚠⚠ 提取 RM 分支**必须锚在 `return;` 上**：
         早先用 `/\n {4}\}/` 当终止条件，它会一路跨过 `return` 匹配到**正常分支**的收尾
         ⇒ 无论 RM 分支有没有 .is-ready，匹配结果里都有 ⇒ 判据恒真、静默空转
         （AGENTS 2026-10-05「锚点不命中 ⇒ 根本没被破坏过」同源）。 */
    const rmBranch = CODE.match(/if\s*\(\s*!animate\s*\)\s*\{[\s\S]*?return;/)?.[0] ?? '';
    expect(rmBranch, '没读到 RM 分支').toBeTruthy();
    expect(rmBranch, 'RM 档画完也必须加 .is-ready（否则 opacity:0 = 画了等于没画）').toMatch(
      /classList\.add\('is-ready'\)/,
    );
    /* 反向：正常档也必须有一次（两处加起来是 2 次） */
    expect(
      [...CODE.matchAll(/classList\.add\('is-ready'\)/g)].length,
      '.is-ready 应在两条分支里各出现一次',
    ).toBe(2);
    /* ★ RM 档必须**先 fit() 再放墨**：cw/ch 是 fit() 产出的，fit() 之前是 0
       ⇒ 三滴坐标会全算成 (0,0)、叠在左上角（AGENTS「读数要等几帧」同源）。 */
    const rmIdxPaint = rmBranch.indexOf('paint(');
    const rmIdxPush = rmBranch.indexOf('blobs.push');
    const rmIdxFit = rmBranch.indexOf('fit()');
    expect(rmIdxFit, 'RM 档缺fit()').toBeGreaterThan(-1);
    expect(rmIdxFit, 'fit() 必须在放墨之前（cw/ch 此前为 0）').toBeLessThan(rmIdxPush);
    expect(rmIdxPush, 'RM 档没有放墨（静态帧会是空白）').toBeGreaterThan(-1);
    expect(rmIdxPaint, 'RM 档没有 paint()').toBeGreaterThan(rmIdxPush);
    expect(SRC, '脚本就绪后必须加 .is-ready，否则画布永远 opacity:0').toMatch(/classList\.add\('is-ready'\)/);
  });

  it('★ 装饰层三件套：z-index:-1 / pointer-events:none / aria-hidden', () => {
    const cv = ACSS.match(/\.inkdrop-bg\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(cv, '必须是 fixed 满屏（滚动不需要重算尺寸）').toMatch(/position:\s*fixed/);
    expect(cv, '必须 fixed 满屏').toMatch(/inset:\s*0/);
    expect(cv, '不能挡指针（否则留言区点不动）').toMatch(/pointer-events:\s*none/);
    expect(cv, '必须在正文之下').toMatch(/z-index:\s*-1\s*;/);
    expect(GUEST).toMatch(/<canvas[^>]*data-inkdrop[^>]*aria-hidden="true"|<canvas[^>]*aria-hidden="true"[^>]*data-inkdrop/);
  });

  it('★ 走 plate 具名槽（不塞普通 slot，否则 fixed 定位会跳）', () => {
    expect(ASTRO).toMatch(/<Fragment slot="plate">/);
    const iPlate = ASTRO.indexOf('<canvas class="inkdrop-bg"');
    const iImg = ASTRO.indexOf('class="float-plate"');
    expect(iPlate, '产物里没有 .inkdrop-bg').toBeGreaterThan(-1);
    expect(iImg, '没读到静态底纹层').toBeGreaterThan(-1);
    /* DOM 顺序 = 层序：画布在底纹之后 ⇒ 墨滴压底纹之上、正文之下（同 talks 雨线压墨点） */
    expect(iPlate, '画布必须排在底纹之后（层序）').toBeGreaterThan(iImg);
    expect(ASTRO).toMatch(/import '\.\.\/scripts\/inkdrop'/);
  });
});

describe('留言页 · 墨滴装置 · 机制硬规矩', () => {
  it('★ 零随机（形状必须是时间的确定函数）', () => {
    expect(CODE, '装置里不许出现 Math.random —— 同 t 两次加载必须一致').not.toMatch(/Math\s*\.\s*random/);
    /* "随机"一律走整数哈希（同一个 i 永远同一个值） */
    expect(CODE, '不确定的"随机"必须走整数哈希').toMatch(/function\s+hash01/);
    /* 哈希只吃整数、不吃时间 —— 这是"确定"的根据。
       ⚠ 正则**不写死缩进**（源码在 IIFE 里是 4 空格，写死两空格会静默空转，
         AGENTS 2026-10-01「破坏版只删了第一处出现」同源教训）。 */
    const hash = CODE.match(/function\s+hash01\([^)]*\)\s*:\s*number\s*\{[\s\S]*?\n\s*\}/)?.[0] ?? '';
    expect(hash, '没读到 hash01 的实现').toBeTruthy();
    expect(hash, 'hash01 必须是纯整数位运算（吃时间就不是确定函数了）').not.toMatch(/performance|Date|now/);
    expect(hash, 'hash01 必须用 Math.imul（整数哈希）').toMatch(/Math\.imul/);
  });

  it('★ 不在每次pointermove 里量DOM 几何（评论展开不触发重排重画）', () => {
    /* ★ 这条判据写反过两次，两次都是**绿着的假契约**：
     *① 2026-10-06 第一轮：`not.toMatch(/getBoundingClientRect/)` +「范围必须是视口
     *    常量算的」—— 而"视口常量"恰恰是事故根因。
     * ② 2026-10-06 第二轮：改成「必须量 .prose 真实几何」—— 结果把用户本来
     *    能用的**整屏**收窄成"只有留言框那一小块"，是**回归**（站主实测：
     *    「刚才整个屏幕都能生成墨痕」）。
     * ⇒ 两次的共同教训：**别用"某种实现方式"当约定**。真正的约定是行为层面的
     *   「任何位置都能留墨」，实现只是达成它的手段之一（见下一条）。
     * 本条只守最硬的那部分：onMove 里绝不能读 DOM 几何。
     */
    /* ★ 只切 onMove 的**函数体**（从它到下一个顶层段落为止）——
       切到文件尾会把后面的辅助函数也算进来，那是允许的。 */
    const from = CODE.indexOf('function onMove');
    const to = CODE.indexOf('function onDrop', from);
    const onMoveBody = CODE.slice(from, to > from ? to : undefined);
    expect(onMoveBody, 'onMove 切片必须非空').not.toBe('');
    expect(onMoveBody, 'pointermove 处理器里不许量 DOM 几何').not.toMatch(
      /getBoundingClientRect|offsetWidth|offsetHeight|querySelector/,
    );
  });

  it('★★★墨痕范围 = 整页，不设任何区域门槛（2026-10-06 二次实测）', () => {
    /* 症状（站主二次实测，两条同时出现）：
     *   ①「刚才整个屏幕都能生成墨痕」⇒ 整屏是**期望行为**；
     *   ②「现在只能在留言框里面看到」⇒ 收窄是**回归**；
     *   ③「打开 F12 才能看到断断续续」仍未解决。
     *
     * 探针实测（_probe/_ink-where.mjs，真实产物上派发 pointermove 数着色像素）：
     *     区域        视口比例版   .prose几何版   现在
     *     框内            19440      19440      19440
     *     框左 260px        970(5%)   1010(5%)   8892 / 3325
     *     框右 300px        968(5%)   1091(6%)  10281 / 10125
     *     框上方 180px        0          0    19396 / 19365
     *     视口正中         12983**       0    25940 / 19626
     *   （后两列是 1920 / 1440 视口；**0 = 整条划痕完全不留墨）
     *
     * 关键：`.prose` 版在**框内是好的**（19440），所以上一轮"修好了"是假象——
     *   局部正确 ≠ 整体正确，症状没消失只是换了成因。
     * 而 1440 视口下**视口正中为 0**、1920 下同一位置有 12983 ⇒ 这才是
     *   「开 F12 才能看到」的真正成因：F12 一开视口变窄，`.prose` 几乎横跨视口
     *   ⇒ **蒙对了**，与 F12 无关。
     *
     * ⇒ 不变式：**除窄屏与 reduced-motion 两种降级外，不存在任何"某些位置不留墨"**
     *   的区域门槛。范围就是画布全屏。
     */
    /* ★ 切片必须只到**下一个函数**为止：`onDrop` 里有一处合法的
     * `cw*0.5 / ch*0.42`（落滴位置兜底，不是区域门槛），切到文件尾会误判。 */
    const jFrom = CODE.indexOf('function overMessageArea');
    const jTo = CODE.indexOf('function onMove', jFrom);
    const judge = CODE.slice(jFrom, jTo > jFrom ? jTo : undefined);
    expect(judge, '没读到 overMessageArea').toContain('narrow.matches');
    /* ① 不许量任何内容元素的几何 —— 有了区域就一定会去量它 */
    expect(judge, '范围判定不许量 .prose（一旦有区域就一定会去量它）').not.toMatch(
      /\.prose|getBoundingClientRect|querySelector/,
    );
    /* ② 不许拿视口比例当门槛（第一轮事故的写法，0.12/0.88 那套） */
    expect(judge, '不许用视口比例当区域门槛（第一轮事故写法）').not.toMatch(
      /cw\s*\*\s*0\.\d+|ch\s*\*\s*0\.\d+/,
    );
    /* ③ 判定只能由**画布自身尺寸**钳位（cw/ch 来自 fit()，不触发重排） */
    expect(judge, '范围必须用画布自身尺寸 cw/ch 钳位').toMatch(/\bcw\b/);
    expect(judge, '范围必须用画布自身尺寸 cw/ch 钳位').toMatch(/\bch\b/);
    /* ④ 唯一允许的例外是窄屏降级（手指划屏会挡输入 → 只保留落滴）*/
    expect(judge, '必须保留窄屏降级（≤767px 只留落滴）').toMatch(/narrow\.matches\s*\)\s*return false/);
  });

  it('★★ 不留任何区域缓存 / 重测机制（范围既然是全屏，就没有边界要跟）', () => {
    /* 上一轮为此加了三处：measureArea() + ResizeObserver(.prose) + resize 先重量。
     * 范围变成全屏后**三处全部不再需要**，留着就是死代码 + 无谓的重排来源。
     * 这条守住「不引入区域机制」—— 防止以后有人手滑又加回来。 */
    expect(CODE, '不许再有 measureArea（范围是全屏，没有边界要量）').not.toMatch(/measureArea/);
    expect(CODE, '不许再有 ResizeObserver 观察内容元素（范围与内容尺寸无关）').not.toMatch(
      /new\s+ResizeObserver[\s\S]{0,200}observe\(/,
    );
    expect(CODE, '不许再有 .prose 的范围缓存字段').not.toMatch(/areaL|areaR|areaTop|areaBottom|AREA_PAD/);
    /* resize 只需重画（画布位图跟着视口/DPR 变），不该再有"先重量" */
    const rs = CODE.slice(CODE.search(/addEventListener\(\s*'resize'/));
    const rbody = rs.slice(0, 220);
    expect(rbody, 'resize 只需重画').toMatch(/paint\(/);
    expect(rbody, 'resize 里不该再有量范围的调用').not.toMatch(/measureArea|areaBottom|areaL/);
  });

it('★ 痕迹会自愈（几秒渗开后收干净）—— 与显影板「涂抹擦痕」的分界', () => {
  /* 显影板是"越抹越清楚、永久留痕"；墨滴是"留着会自己淡掉"。
     没有自愈 ⇒ 两台装置机制重复，违反「每页一台机制不同的装置」。 */
  expect(CODE, '必须有衰减（否则痕迹永久留痕 = 显影板）').toMatch(/function\s+blobAlpha/);
  /* ★★ 这里**不复现** blobAlpha 的数学（源码里是 JS、这里是 TS，跑不起来），
     而是断言它**真的用了 age** —— 变异验证 2026-10-06 实测：
       把 `Math.pow(1 - age / LIFE, HEAL)` 改成 `1`，只查"有没有 decay"照样绿
       （关键词还在），是典型的假绿灯。
     ⇒ 判据改成「表达式必须同时含 age 与 LIFE，且不是常数」。 */
  const decay = CODE.match(/const\s+decay\s*=\s*([^;]+);/)?.[1] ?? '';
  expect(decay, '没读到 decay 的定义').toBeTruthy();
  expect(decay, 'decay 必须吃age（不吃的��就是常数 = 不自愈）').toMatch(/\bage\b/);
  expect(decay, 'decay 必须以age/LIFE 归一（这样 age>LIFE 时才会归零）').toMatch(/\/\s*LIFE/);
  expect(decay, 'decay 被改成常数 ⇒ 痕迹永不自愈（变异会转红）').not.toMatch(
    /^\s*(?:1|0(?:\.0+)?|0?\.0+)\s*$/,
  );
  /* 同理：rise 也必须吃 age（否则"刚落下最实"没了，且 age=0 时就是空的） */
  const rise = CODE.match(/const\s+rise\s*=\s*([^;]+);/)?.[1] ?? '';
  expect(rise, 'rise 必须吃 age').toMatch(/\bage\b/);
  /* 渗开感 = 半径随年龄涨（那才是"渗开"，与自愈是两条独立的性质） */
  expect(CODE, '半径必须随年龄涨（"渗开"）').toMatch(/age\s*\*\s*SMEAR/);
  /* 生命周期有上限：超过 LIFE 必须归零，不能留残影 */
  expect(CODE, '超过 LIFE 必须归零（不许留永久残影）').toMatch(
    /if\s*\(\s*age\s*<\s*0\s*\|\|\s*age\s*>\s*LIFE\s*\)\s*return\s*0/,
  );
  /* 痕迹数组有界，且有清理循环（防长时间涂抹无界增长） */
  expect(CODE, '痕迹条数必须有上限').toMatch(/TRAIL_MAX/);
  expect(CODE, '必须清掉淡干净的痕迹（防数组无界增长）').toMatch(/blobs\.splice/);
});

it('★★★回收必须按时间判，不能按浓度判（真机整页无墨的真凶）', () => {
  /* 事故（2026-10-06，线上真实页面）：
   *   站主刷新无数次，留言页整页看不到任何墨痕。
   *   线上插桩（CDP Fetch 拦下真实 chunk 换插桩版，1920×1000）实测：
   *     gate=[true,true] calls=41 pushed=200 gcRemoved=200 blobs=0 ink=0
   *     gcAges=[0.0002,0.0002,0.0002,0.0002,0.0002,0.0001,...] negAges=0
   *   ⇒ 墨点落了 200 个，但每个都在**落纸后 0.1~0.2ms** 被回收。
   *机制：GC 判据写的是 `blobAlpha(age) <= 0.002`（按浓度），
   *   而 blobAlpha 的 rise 段让 age≈0 时浓度≈0.0006 ⇒ 刚落的点被判「已淡完」。
   *   Chrome 每帧「先派发输入事件、再跑 rAF」⇒ 真实鼠标移动时同一帧即被删。
   *
   * ★ 为什么此前十几轮探针全都假绿（这条是本契约存在的唯一理由）：
   *   它们在**同一个 JS task 内**派发 300 个合成 PointerEvent，中间不跑帧
   *   ⇒ GC 执行时 age 已攒到几百毫秒 ⇒ 点全活下来（测到 39944/61185/46656）。
   *   换成「事件与帧交替」（真实鼠标的节奏）立刻归零。
   *
   * 判据：GC 的判据必须含 `> LIFE`（寿命），且**不得**出现按浓度判的写法。 */
  const gc = CODE.match(/if\s*\(\s*ts\s*-\s*blobs\[\s*i\s*\]\.t0\s*>\s*LIFE\s*\)\s*blobs\.splice/)?.[0] ?? '';
  expect(gc, 'GC 必须按「年龄 > LIFE」回收（唯一有物理意义的判据）').toBeTruthy();

  /* 反向断言：按浓度判的写法不许回来（那是本次事故的原始形态） */
  expect(
    CODE,
    'GC 不得再按 blobAlpha(...) 判回收 —— age≈0 的点会被当成已淡完而立即删掉',
  ).not.toMatch(/if\s*\(\s*blobAlpha\([^)]*\)\s*<=\s*0?\.\d+\s*\)\s*blobs\.splice/);

  /* 同一条纪律在 draw() 里也必须成立：跳过按寿命，不按浓度阈值 */
  const drawSkip = CODE.match(/if\s*\(\s*age\s*>\s*LIFE\s*\)\s*continue;/)?.[0] ?? '';
  expect(drawSkip, 'draw() 跳过过期痕迹也要按寿命判').toBeTruthy();

  /* 落滴那条本来就是按时间判的（本次事故里它是对的）⇒ 顺手锁住，
     免得以后有人"统一风格"把它改成按浓度。 */
  expect(CODE, '落滴回收按 DROP_LIFE 判（与墨痕同一条纪律）').toMatch(
    /ts\s*-\s*drops\[\s*i\s*\]\.t0\s*>\s*DROP_LIFE/,
  );
});

it('★★ 落纸即有色：age=0 的浓度必须为正且高于 GC 阈值', () => {
  /* 与上一条配套：GC 改成按时间判之后，墨能不能被**看见**就全靠 rise 段。
   * 若 rise 仍从 0 爬（LIFE*0.08 = 336ms），则墨要 0.34 秒后才显形，
   * 与母题「落下时最实（刚落纸就吃满）」相反，也与真实蓝墨笔不符。
   * ⇒ 必须有起始浓度 RISE_FLOOR。 */
  expect(CODE, '必须有起始浓度 RISE_FLOOR（落纸即有色）').toMatch(/const\s+RISE_FLOOR\s*=/);
  const rise = CODE.match(/const\s+rise\s*=\s*([^;]+);/)?.[1] ?? '';
  expect(rise, 'rise 必须吃 age（保持"逐渐加深"的性质）').toMatch(/\bage\b/);
  expect(rise, 'rise 必须以 RISE_FLOOR 为起点（否则 age=0 时浓度为 0）').toMatch(/RISE_FLOOR/);
});

  it('★★ 笔触必须有实心核（两段渐变会读成"一串珠子"而不是一笔）', () => {
    /* 2026-10-06 站主实测：屏幕上读出来是"几团孤立的点"、不是墨痕。
     * 复算排除了插值太稀（间距 5–7px vs 直径 26px）⇒ 另一半根因在**笔触剖面**：
     * 原来的渐变是 `(0, 0.5k) → (0.55, 0.22k) → (1, 0)`，**从中心就开始衰减**。
     * 相邻两笔重叠处，两笔各自都还在衰减段 ⇒ 交叠处出现**浅谷**
     * ⇒ 一串珠子，而不是一笔连续的痕。
     * ⇒ 加一段近实心核（0.45 处仍有 0.42k），让中段连成实、只让外缘洇开。*/
    const stops = [...CODE.matchAll(/g\.addColorStop\(\s*([\d.]+)\s*,\s*A\(\s*INK\s*,\s*([\d.]+)\s*\*\s*k/g)]
      .map((m) => ({ pos: Number(m[1]), k: Number(m[2]) }));
    expect(stops.length, '没读到墨痕的径向渐变 stops').toBeGreaterThanOrEqual(3);
    /* ★ 至少要有三段：第一段给峰值，中间给"仍很实"的平台，末段收到 0 */
    const core = stops.find((s) => s.pos > 0 && s.pos < 0.7);
    expect(
      core,
      '渐变必须在中心与边缘之间有一段"仍然很实"的部分（否则重叠处出现浅谷 ⇒ 读成珠子）',
    ).toBeTruthy();
    /* 平台段的浓度必须**接近峰值**（≥ 峰值�� 80%）—— 低了就不是实心核，只是多一个 stop */
    const peak = stops[0].k;
    expect(peak, '渐变第一段必须是峰值').toBeGreaterThan(0);
    expect(
      core!.k / peak,
      `实心核浓度 ${core!.k} 只有峰值的 ${((core!.k / peak) * 100).toFixed(0)}%（需 ≥80%，否则等于没加核）`,
    ).toBeGreaterThanOrEqual(0.8);
    /* ★★ 变异验证：把 0.45 那档的 0.42 改小（如 0.05）⇒ 上面「≥80% 峰值」立刻转红。*/

    /* 末段单独查：收尾那档写的是 `A(INK, 0)`（**不带 `* k`**），
       所以不能靠上面那条正则抓它 —— 抓不到就会误判成"没有末段"。
       ⇒ 单独按 `A(INK, 0)` 的字面形状查（不写死缩进）。 */
    expect(
      CODE,
      '渐变末段必须是 A(INK, 0)（r=1 处完全化开，不留硬边）',
    ).toMatch(/addColorStop\(\s*1\s*,\s*A\(\s*INK\s*,\s*0\s*\)/);
  });

  it('★ 时间基准全文件统一绝对秒（混用会让痕迹永远淡不掉）', () => {
    /* 症状：t0 存相对秒、当前时刻取绝对秒 ⇒ age 恒为负 ⇒ blobAlpha 一直返回 0
       ⇒ 指针划过什么都不留，而代码看起来完全正常。 */
    /* 症状：t0 存相对秒、当前时刻取绝对秒 ⇒ age 恒为负 ⇒ blobAlpha 一直返回 0
       ⇒ 指针划过什么都不留，而代码看起来完全正常。
       ⚠★ 变异验证 2026-10-06 实测：只断言「源码里有 nowSec()」是**假绿灯** ——
         把 `t0: ts` 改成 `t0: age`（变量仍然存在、定义仍然在）照样全绿。
         ⇒ 判据必须**双向锁定**：出生时刻用 nowSec()，且年龄由 tSec 减 t0 算出。 */
  expect(SRC, 'nowSec 必须以绝对秒定义（performance.now()/1000）').toMatch(
    /const\s+nowSec\s*=\s*\(\s*\)\s*=>\s*performance\.now\(\)\s*\/\s*1000/,
  );
  /* 墨痕的出生时刻。
     ⚠ 2026-10-06 笔尖驻留那轮起，落点走 `pushBlob(x, y, t0, seed)` 辅助函数
       （移动与驻留共用同一条路径，避免两份代码各写一遍 t0），
       所以这里匹配 `pushBlob` 的**第三个实参**，而不是 `blobs.push({...})` 里的字段。
     ⚠ 允许两种写法：t0 直接取 `nowSec()`，或先 `const ts = nowSec()` 再传 ts
       —— 后者**整批共用同一时刻**是**正确**的（一笔里那12 个采样点同时出生，
       物理上就该同时开始渗开；逐点各调一次 nowSec() 反而会让它们差几微秒）。
       所以判据认「t0 最终来自 nowSec()」这条链，不强求写法。 */
  const trailT0 = CODE.match(/pushBlob\(\s*[^,]+,\s*[^,]+,\s*(\w+)\s*,/)?.[1] ?? '';
  expect(trailT0, '没读到墨痕的 t0 来源（pushBlob 第三个实参）').toBeTruthy();
  /* ⚠ 上面刻意**不匹配** pushBlob 的函数定义（`pushBlob(x: number, y: number, ...)`）：
     那里的第二个实参形态不同，溯源链会指向类型标注而不是真实调用。
     办法是只取**调用点**（定义行以 `number,` 这种类型标注结尾）——
     用 `[^,]+,\s*[^,]+,` 已能同时排除定义（定义的第一个实参是 `x: number`）。*/
  /* 溯源：t0 的来源要么就是 nowSec，要么是个"由 nowSec 赋值"的局部变量。
     ★ 关键在**必须能在源码里找到那个赋值** —— 变异把 t0 改成 age 时，
       age 既不是 nowSec、也没有 `= nowSec()` 的赋值 ⇒ 这里转红。*/
  if (trailT0 !== 'nowSec') {
    expect(
      CODE,
      `t0 用的 ${trailT0} 必须能溯源到 nowSec()（否则年龄是错的，痕迹永远淡不掉）`,
    ).toMatch(new RegExp(`const\\s+${trailT0}\\s*=\\s*nowSec\\(\\)`));
  }
  expect(CODE, '墨痕出生时刻必须来自 nowSec()').toMatch(
    /const\s+ts\s*=\s*nowSec\(\)/,
  );
  /* ★ 所有 pushBlob 调用都必须传绝对秒 ts（传相对时间 ⇒ 年龄恒负 ⇒ 墨点画不出来）。
     ⚠ 必须排除**函数定义行**（`pushBlob(x: number, y: number, t0: number, ...)`）——
       它的第三个实参形态是类型标注 `t0: number`，会被当成"传了变量 t0"。
     办法：只取**调用点** —— 调用点的第一个实参是纯变量名，不带 `: number`。*/
  const pushBlobCalls = [...CODE.matchAll(/pushBlob\(([^)]*)\)/g)]
    .map((m) => m[1])
    .filter((args) => !/:\s*number/.test(args.split(',')[0] ?? ''));
  expect(
    pushBlobCalls,
    `pushBlob 的调用点：${JSON.stringify(pushBlobCalls)}（应为 1 处，t0 传绝对秒 ts）`,
  ).toHaveLength(1);
  expect(pushBlobCalls[0], '唯一那个 pushBlob 调用的 t0 必须是绝对秒 ts').toMatch(
    /^\s*[^,]+,\s*[^,]+,\s*ts\s*,/,
  );
  /* 落滴的出生时刻 */
  expect(CODE, '落滴 t0 必须取 nowSec()（绝对秒）').toMatch(/drops\.push\(\{[^}]*t0:\s*nowSec\(\)/);
  /* 不许出现相对时间基准 T0（那正是混用的来源） */
  expect(CODE, '不许出现相对时间基准 T0（会与绝对秒混用）').not.toMatch(/const\s+T0\s*=/);
  /* 年龄 = 当前绝对秒（draw 的入参 tSec）− 出生绝对秒 */
  expect(CODE, '墨痕年龄 = tSec − b.t0').toMatch(/age\s*=\s*tSec\s*-\s*b\.t0/);
  expect(CODE, '落滴年龄 = tSec − d.t0').toMatch(/age\s*=\s*tSec\s*-\s*d\.t0/);
  /* draw 的时间参数必须叫 tSec（同一时间源贯穿到底） */
  expect(CODE, 'draw 的时间参数应名为 tSec').toMatch(/function\s+draw\(\s*tSec\s*:/);
  /* paint 只接受一个时间参数（曾经有两个、其中一个没用 —— 那种签名会误导读代码的人） */
  const paint = CODE.match(/function\s+paint\(([^)]*)\)/)?.[1] ?? '';
  expect(paint.split(',').length, 'paint 应收一个时间参数').toBe(1);
  });

  it('★ 落滴由事件驱动，且只在提交成功后派发', () => {
    /* 装置不可能自己知道留言成功了 —— 必须有一条显式信号。 */
    expect(SRC, '装置要监听 inkdrop 事件').toMatch(/addEventListener\(\s*'inkdrop'/);
    expect(SRC, '墨滴要用蓝色（与底纹同母题），不许退回绿accent 当唯一来源').toMatch(/--ink-blue/);
    expect(TOKENS, '蓝墨 token 没了（底纹是蓝的、墨滴却是绿的 ⇒ 读成两种东西）').toMatch(
      /--ink-blue:\s*#6981b7/,
    );
    /* comments.ts：成功分支里派发 */
    const ok = COMMENTS.match(/\.then\(\s*\(c\)\s*=>\s*\{([\s\S]*?)\}\)/)?.[1] ?? '';
    expect(ok, '没读到提交成功的 then 分支').toBeTruthy();
    expect(ok, '成功后必须派发 inkdrop 事件').toMatch(/dispatchEvent/);
    expect(ok, '事件名必须是 inkdrop（与装置监听的一致）').toMatch(/'inkdrop'/);
    expect(ok, '派发点必须带 CustomEvent').toMatch(/new\s+CustomEvent\(\s*'inkdrop'/);
    /* ★ 失败分支**不许**派发（给失败做庆祝是错的） */
    const bad = COMMENTS.match(/\.catch\(\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {6}\}\)/)?.[1] ?? '';
    expect(bad, '没读到 catch 分支').toBeTruthy();
    expect(bad, '失败时绝不能派发 inkdrop（失败不该有墨滴）').not.toMatch(/inkdrop/);
    /* ★ 装置不许靠观察 DOM 变化来猜"留言成功了" */
    expect(CODE, '装置不许用 MutationObserver 猜留言成功').not.toMatch(/MutationObserver/);
  });

  it('★ 降级四态', () => {
    /* ① reduced-motion ⇒ 不跑 rAF，画一帧静态的 */
    expect(SRC).toMatch(/shouldAnimate/);
    expect(SRC).toMatch(/prefersReducedMotion/);
    expect(CODE, 'RM 档必须走"画一帧就return"的路').toMatch(/if\s*\(\s*!animate\s*\)\s*\{/);
    /* ★ 本页**有终态**（一滴渗开的墨就是终态）⇒ RM 帧是"正在渗开"，不是随机相位 */
    expect(CODE, 'RM 档要放几滴已出生的墨（负年龄 ⇒ age<0 会被挡成空画面）').toMatch(/blobs\.push/);
    /* ② 无 JS ⇒ canvas opacity:0，只有底纹层；正文服务端渲染完整 */
    expect(GUEST, '留言页正文应服务端渲染完整').toContain('留言');
    expect(GUEST, '评论表单应服务端渲染（无 JS 也要能看）').toContain('data-form');
    /* ③ ≤767px ⇒ 只保留落滴、不留墨痕（手指划屏不是"留墨"，反而挡输入） */
    expect(CODE, '窄屏必须屏蔽墨痕').toMatch(/narrow\.matches\)\s*return\s+false/);
    expect(SRC).toMatch(/max-width:\s*767px/);
    /* ④ 视口外 / 切标签 ⇒ 停帧，且**不清屏**（痕迹是累积状态，清了等于墨迹凭空消失） */
    expect(SRC, '要用rl-core 的 activityGate').toMatch(/createActivityGate/);
    const loop = CODE.match(/startLoop\(\(\)\s*=>\s*\{[\s\S]*?\n\s{2}\}\)/)?.[0] ?? '';
    expect(loop, '没读到主循环').toBeTruthy();
    /* 停帧判据：出屏 **或** 切标签都要停（两个都要在） */
    expect(loop, '切标签/出屏必须停帧').toMatch(/!\s*gate\.onScreen\s*\|\|\s*!\s*gate\.visible/);
    expect(loop, '停帧时不能清屏（痕迹已落在纸上，清了就是凭空消失）').not.toMatch(/clearRect/);
    /* 停帧的实现机制（与 float.ts 同一条代码路径） */
    expect(SRC).toMatch(/visibilityState|IntersectionObserver|createActivityGate/);
  });

  it('★ 墨色只用 token，alpha 以 8 位 hex 承载（不写 rgba()）', () => {
    expect(CODE, '组件里不许写 rgba()（站上约定：8 位 hex 承载 alpha）').not.toMatch(/rgba\(/);
    const A = CODE.match(/const\s+A\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\};/)?.[0] ?? '';
    expect(A, '没读到 A() 的 8 位 hex 拼装').toBeTruthy();
    expect(A, 'A() 必须拼成8 位 hex（# + 6 位 + 2 位 alpha）').toMatch(/padStart\(2,\s*'0'\)/);
    /* 颜色只有一个来源（token），不许在装置里硬编码颜色 */
    expect(CODE.match(/#[0-9a-fA-F]{6}/g), '装置里不许硬编码颜色，只有 fallback 的默认色').toHaveLength(1);
  });

  it('★ 墨滴的自愈曲线数值可复算（不靠"看起来对"）', () => {
    /* 契约查文本只能证明"写了 decay"，证不了"曲线形状对"。
       这里把母题常数从源码里**读出来**、在 Node 里复算 blobAlpha，
       断言三条可验收的性质：
         ① 有一个**快速吃满**的上升段（刚落下最实，不是慢慢显出来）
         ② 峰值后**单调递减**（否则痕迹会二次变浓 = 不是"渗开"）
         ③ age>LIFE 必须**精确为 0**（不留残影）
       ★ 常数必须从源码读，不能在测试里另写一份 —— 那样改一处就两处不一致、
         判据会守着旧值（AGENTS 2026-10-05「锚点不命中 ⇒ 静默空转」同源）。 */
    const num = (name: string) => {
      const v = CODE.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\d.]+)\\s*;`))?.[1];
      return v === undefined ? NaN : Number(v);
    };
    const LIFE = num('LIFE');
    const HEAL = num('HEAL');
    const RISE_FLOOR = num('RISE_FLOOR');
    expect(Number.isFinite(LIFE) && LIFE > 0, `LIFE 读不到或非正：${LIFE}`).toBe(true);
    expect(Number.isFinite(HEAL), `HEAL 读不到：${HEAL}`).toBe(true);
    expect(Number.isFinite(RISE_FLOOR), `RISE_FLOOR 读不到：${RISE_FLOOR}`).toBe(true);
    expect(RISE_FLOOR, `RISE_FLOOR 必须落在 (0,1)：落纸即有色，但留出加深空间`).toBeGreaterThan(0);
    expect(RISE_FLOOR, 'RISE_FLOOR 必须 <1，否则永不吃满').toBeLessThan(1);

    /* 与 blobAlpha 同一份公式（源码那行的结构：RISE_FLOOR + (1-RISE_FLOOR)×上升段） */
    const blobAlpha = (age: number) => {
      if (age < 0 || age > LIFE) return 0;
      const rise = RISE_FLOOR + (1 - RISE_FLOOR) * Math.min(1, age / (LIFE * 0.08));
      const decay = Math.pow(1 - age / LIFE, HEAL);
      return rise * decay;
    };

    /* ★★★ 落纸即有色（2026-10-06 线上插桩真凶的配套断言）。
     *   线上量到 gcAges=[0.0002,...] ⇒ 刚落的点浓度≈0.0006，被 GC 当成
     *   「已淡干净」在**同一帧**回收 ⇒ 真机整页无墨（探针若在同一 task 内
     *   派发事件则测不到，故此前一直假绿）。
     *   ⇒ age 必须是**单调上升且起点就有浓度**，不能从 0 爬上来。 */
    expect(blobAlpha(0), 'age=0 时浓度为 0 ⇒ 刚落的墨看不见（真机症状的另一半）').toBeGreaterThan(0);
    expect(blobAlpha(0), '落纸浓度应已达 RISE_FLOOR 附近').toBeCloseTo(RISE_FLOOR, 5);
    /* 且落纸浓度必须高于 GC 阈值（0.002），否则又被回收 */
    expect(blobAlpha(0), '落纸浓度必须高于 0.002，否则仍会被按浓度回收').toBeGreaterThan(0.002);
    /* 单调上升段（0 → LIFE*0.08）确实在加深 */
    expect(blobAlpha(LIFE * 0.08), '加深段终点应接近满浓度').toBeGreaterThan(blobAlpha(0) + 0.2);

    /* ① 上升段：age 0.3s 内就该接近峰值（"刚落纸就吃满"） */
    expect(blobAlpha(0.3), '上升段太慢 —— 墨痕不该慢慢显出来').toBeGreaterThan(0.5);
    /* 峰值落在LIFE 的前 20% 内 */
    let peak = 0;
    let peakAt = 0;
    for (let t = 0; t < LIFE; t += 0.01) {
      const v = blobAlpha(t);
      if (v > peak) { peak = v; peakAt = t; }
    }
    expect(peak, '峰值应为正（有可见的墨）').toBeGreaterThan(0.7);
    expect(peakAt / LIFE, `峰值应在生命期前20% 内，实际 ${((peakAt / LIFE) * 100).toFixed(0)}%`).toBeLessThan(0.2);
    /* ② 峰值之后严格单调递减（这是"渗开后淡掉"，不是"二次变浓"） */
    for (let t = peakAt + 0.2; t < LIFE - 0.1; t += 0.2) {
      expect(blobAlpha(t + 0.1), `age=${t.toFixed(1)}s 处浓度回升了 —— 那不是渗开`).toBeLessThan(blobAlpha(t));
    }
    /* ③ 超过 LIFE 精确归零（不留永久残影） */
    expect(blobAlpha(LIFE)).toBe(0);
    expect(blobAlpha(LIFE + 0.01)).toBe(0);
    expect(blobAlpha(-0.01), '负年龄必须归零（RM 档不该画出"还没出生"的墨）').toBe(0);
    /* ★ 站主要的是"几秒渗开"⇒ LIFE 落在人眼能感到"几秒"的区间（2–8s） */
    expect(LIFE, `LIFE=${LIFE}s 不像"几秒"`).toBeGreaterThan(2);
    expect(LIFE, `LIFE=${LIFE}s 不像"几秒"`).toBeLessThan(8);
  });

  it('★ 痕迹有界，不会长时间涂抹就无限涨', () => {
    const TRAIL_MAX = Number(CODE.match(/const\s+TRAIL_MAX\s*=\s*(\d+)/)?.[1]);
    const LIFE = Number(CODE.match(/const\s+LIFE\s*=\s*([\d.]+)/)?.[1]);
    expect(Number.isFinite(TRAIL_MAX), 'TRAIL_MAX 读不到').toBe(true);
    /* ★★★ 这条判据原本写错了（2026-10-06 修正）：它写的是「上限 ≤1200」，
     * 守的是"别太大"这个**代理指标**，而真正的不变式是**与 LIFE 自洽**
     * —— 上限必须 ≥ 每秒生成的点数 × LIFE。
     *
     * 事故实录：原上限 420，而 1200px/s 下 4.2 秒需要 1008 个点
     * ⇒ 数组一满就blobs.shift() 丢最旧的，**而那些点还在可见期里**
     * ⇒ 真浏览器里划过一段后只剩几团孤立墨点（站主 2026-10-06 报）。
     * ⚠ 更糟的是旧判据**守着错的方向**：它只查上限大小，
     *   把 420 改成 1600 反而会"违反 ≤1200"—— 契约在阻止正确的修复。
     *   ⇒ 换成从源码读生成速率算出来的自洽判据（见下一条 it）。
     */
    expect(TRAIL_MAX, '上限太小会拖动手感').toBeGreaterThanOrEqual(120);
    /* 内存侧的粗 sanity：上限再大也不该是十万级（那会让每帧画爆） */
    expect(TRAIL_MAX, '上限必须是千级（再大就吃掉帧率了）').toBeLessThanOrEqual(4000);
    /* 配合清理循环：上限只是保险，逻辑上还要真的把淡掉的移除（见上一条 it） */
    expect(LIFE * 60, 'LIFE 太长会让上一轮的墨一直挂在屏上').toBeLessThan(600);
  });

  it('★★ TRAIL_MAX 与 LIFE 自洽（否则墨痕被截断成几团孤立的点）', () => {
    /*2026-10-06 站主实测症状：划过一段，屏幕上只剩两团孤立墨点、没有墨痕。
     * 复算（`_probe/_inkdrop-cap.mjs`）确认根因**不是插值太稀**
     * （实测采样间距 5–7px vs 笔触直径 26px，本就连得起来），
     * 而是**生成速率远超上限**：
     *   点数/秒 = fps × min(STEPS_CAP, (speed/fps) / TRAIL_STEP)
     *   4.2 秒需要的点数 = 点数/秒 × LIFE
     * 上限不够 ⇒ 每帧 shift() 丢掉**还在可见期里**的点 ⇒ 前段墨凭空消失。
     *
     *★ 判据直接从源码常数算，不写死阈值 —— 改任一常数后这条会跟着重算，
     *   不会变成"守着旧值的假绿灯"（AGENTS 2026-10-05 同源教训）。*/
    const num = (name: string) => {
      const v = CODE.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\d.]+)\\s*;`))?.[1];
      return v === undefined ? NaN : Number(v);
    };
    const TRAIL_STEP = num('TRAIL_STEP');
    const TRAIL_MAX = num('TRAIL_MAX');
    const LIFE = num('LIFE');
    const FPS = 60;
    for (const [n, v] of Object.entries({ TRAIL_STEP, TRAIL_MAX, LIFE })) {
      expect(Number.isFinite(v), `${n} 读不到（探针锚点失效？）`).toBe(true);
    }
    /* 插值上限：字面量（Math.min(12, ...)）或具名常数（Math.min(STEPS_CAP, ...)）两种都要认。
     * ⚠ 只认字面量的话，一旦源码改成具名常数就读出 NaN，
     *   而后面 all NaN 仍会"通过"或整片报错 —— 一律显式失败，不许静默算 NaN。 */
    const capTok = CODE.match(
      /Math\.min\(\s*(\w+)\s*,\s*Math\.floor\(\s*dist\s*\/\s*TRAIL_STEP\s*\)\s*\)/,
    )?.[1];
    expect(capTok, '没找到插值上限的调用点Math.min(?, floor(dist/TRAIL_STEP))').toBeTruthy();
    const STEPS_CAP = /^\d+$/.test(capTok!)
      ? Number(capTok)
      : Number(CODE.match(new RegExp(`const\\s+${capTok}\\s*=\\s*(\\d+)\\s*;`))?.[1]);
    expect(Number.isFinite(STEPS_CAP), `插值上限读不出来（${capTok}）`).toBe(true);

    /* 逐档算：常见鼠标速度下 4.2 秒的痕迹必须装得下 */
    const needAt = (speed: number) => {
      const steps = Math.min(STEPS_CAP, Math.floor(speed / FPS / TRAIL_STEP));
      return FPS * steps * LIFE;
    };
    /* 覆盖"慢 → 中 → 偏快"三档。偏快那档允许略短（不要求完整 LIFE），
       但**必须留住 2 秒以上** —— 低于这个数截断就肉眼可见了。 */
    for (const speed of [400, 900, 1800]) {
      expect(
        needAt(speed),
        `${speed}px/s 时 4.2 秒需要 ${Math.round(needAt(speed))} 个点，上限 ${TRAIL_MAX} 装不下⇒ 墨痕被截断`,
      ).toBeLessThanOrEqual(TRAIL_MAX);
    }
    const fastNeed = needAt(2500);
    const fastKeptSec = TRAIL_MAX / (FPS * Math.min(STEPS_CAP, Math.floor(2500 / FPS / TRAIL_STEP)));
    expect(fastKeptSec, `2500px/s 快挥只留${fastKeptSec.toFixed(2)}s（需 ${Math.round(fastNeed)} 点）—— 截断太狠，仍会读成孤立的点`).toBeGreaterThan(2);
    /* ★ 变异验证：把 TRAIL_MAX 改回 420（事故值）⇒ 上面两档立刻转红。 */
    expect(TRAIL_MAX, '事故值 420 会截断成孤立墨点，别改回去').toBeGreaterThan(420);
  });

  it('构建产物里画布真实在位、脚本已并入', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    expect(GUEST, '产物里没有 inkdrop 画布').toContain('data-inkdrop');
    expect(GUEST, '产物里没有 .is-ready 门控类名').toContain('is-ready');
  });


  it('★★★ 停住不出墨（站主 2026-10-06 晚明确要求），且已落的墨继续消退', () => {
    /* 站主要求原文：「鼠标停着不动的时候不要出墨」。
     *
     * ★ 这条是**反转契约**。上一轮我把「墨痕可以一直跟随鼠标」实现成
     *   「停住时每 90ms 在原地继续洇墨」，站主验收后要求去掉 ——
     *   那是过度解读：「跟随」指的是**位置**跟着笔走，不是「笔不动时纸自己出墨」。
     *   ⇒ 现在痕迹数组**只在 pointermove 里增长**；rAF 只负责重画与回收。
     *
     * 实现形态（两处，缺一不可）：
     *   ① 痕迹的唯一增长点是 onMove（没有第二条 pushBlob 路径）；
     *   ② onMove 里`dist < TRAIL_STEP` 直接 return —— 亚像素抖动不落点。
     */
    /* ① 驻留机制必须彻底不存在。
       ⚠ 负向断言要用 **CODE**（已剥注释）而不是 SRC ——
          否则「驻留机制已移除」这段**解释性注释**里出现的 DWELL_MS
          会把自己判成违规（这次就踩了一次：SRC 全文匹配 ⇒ 转红）。
       ⇒ 纪律：**负向断言一律用 CODE，正向断言才用 SRC。** */
    expect(CODE, '驻留节流常数 DWELL_MS 必须删掉（停住不出墨）').not.toMatch(/DWELL_MS/);
    expect(CODE, '驻留抖动常数 DWELL_JITTER 必须删掉').not.toMatch(/DWELL_JITTER/);
    expect(CODE, '驻留状态 hoverX/hoverY 必须删掉').not.toMatch(/hoverX|hoverY/);
    expect(CODE, '驻留计时 lastDwell 必须删掉').not.toMatch(/lastDwell/);
    expect(CODE, '驻留序号 dwellSeq 必须删掉').not.toMatch(/dwellSeq/);
    /* ② pushBlob 只能有一个调用点 —— 在 onMove 里。
          ★ 变异验证：把 onMove 里改成 pushBlob 之外的第二条路径（比如在rAF 里补落点）
            会被这条抓住；只查"DWELL_MS 不存在"则守不住那种改法。 */
    const calls = [...CODE.matchAll(/pushBlob\(/g)].length;
    expect(calls, `pushBlob 出现 ${calls} 次：落点只能有「移动」这一条路径`).toBe(2); // 1 定义 + 1 调用
    const onMoveSrc = CODE.slice(CODE.indexOf('function onMove'), CODE.indexOf('function onDrop'));
    expect(onMoveSrc, '没读到 onMove').toMatch(/pushBlob\(/);
    /* ③ rAF 主循环里不许有任何落点调用（这是「停住不出墨」的决定性判据） */
    const loop = CODE.match(/startLoop\(\(\)\s*=>\s*\{[\s\S]*?\n\s{2}\}\)/)?.[0] ?? '';
    expect(loop, '没读到主循环').toBeTruthy();
    expect(
      loop,
      '主循环里不许落墨（指针静止 ⇒ 纸面静止；主循环只负责重画与回收）',
    ).not.toMatch(/pushBlob|blobs\.push/);
    /* ④ 移动插值仍要保留（不许为了「停住不出墨」把移动也一起干掉） */
    expect(SRC, '移动中必须按 TRAIL_STEP 插值落点，否则痕会变成一串珠子').toMatch(
      /Math\.min\(STEPS_CAP,\s*Math\.floor\(dist\s*\/\s*TRAIL_STEP\)\)/,
    );
    expect(SRC, '位移不足一个笔刷间距时必须不落点（亚像素抖动不算移动）').toMatch(
      /if\s*\(\s*dist\s*<\s*TRAIL_STEP\s*\)\s*return/,
    );
    /* ⑤ ★ 但「停住时旧墨继续消退」必须仍在 ——
          把 ③④⑤ 一起实现成「停住就整块冻结」是常见的过度修正，
          那样墨痕会永远留在屏幕上，反而违背「从末端慢慢消退」。 */
    const alpha = SRC.slice(SRC.indexOf('function blobAlpha'), SRC.indexOf('function draw'));
    expect(alpha, 'blobAlpha 必须保留按年龄的衰减（停住时旧墨靠它继续消退）').toMatch(
      /Math\.pow\([^)]*HEAL/,
    );
    expect(CODE, '回收仍按寿命判（停住时超期的墨要消失）').toMatch(
      /ts\s*-\s*blobs\[i\]\.t0\s*>\s*LIFE/,
    );
    expect(CODE, '每帧仍必须重画（否则停住时墨痕会僵住不消退）').toMatch(/paint\(ts\)/);
    /* ⑥ 零随机红线仍在 */
    expect(SRC, '装置里不许出现 Math.random').not.toMatch(/Math\.random/);
  });

  it('★★★ 落滴必须"够响"：实测峰值像素数与各段尺度都有下限', () => {
    /* 站主反馈原文：「发评论那个效果我没看到」。
     *
     * 线上插桩诊断（1920×1000，真实留言页派发真实 detail）：
     *     事件链路   __gotDrop = 1        ⇒ 派发是通的，不是 comments.ts 的问题
     *     落点几何   left=364 top=554     ⇒ 在视口内，不是被裁掉
     *     画布       ready/opacity=1      ⇒ 显隐正常
     *     **着色像素 t≈150ms n=229  peakAlpha=140**  ← 只有229 个像素！
     * 对照：墨痕划过整屏是 3~4 万像素。⇒ **不是没画，是画得不够响**。
     *   三个量级都太小：① 水滴半径 4~9px（πr²·dpr² ≈ 230，正好对上实测）
     *                    ② 扩散环 ry=rx*0.42 + 线宽 2.2，又扁又细
     *                    ③ DROP_LIFE 2.4s，一次眨眼就过去
     *
     * ⇒ 下面锁的是**量级下限**，不是"某个系数等于某值"：
     *   太小 ⇒ 一定看不见（回归）；太大 ⇒ 也拦得住（防止调过头糊屏）。
     */
    const num = (name: string) => {
      const m = SRC.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\d.]+)`));
      expect(m, `读不到 ${name}`).toBeTruthy();
      return Number(m![1]);
    };
    /* ① 下落高度：要看得见"从上砸下来"（原来 70） */
    expect(num('DROP_FALL_H'), '下落高度太小 ⇒ 读不出"砸下来"').toBeGreaterThanOrEqual(150);
    /* ② 水滴头部半径：原来 4~9（实测 n=229 的直接原因） */
    expect(num('DROP_HEAD_R'), '水滴头部半径太小 ⇒ 就是一个小点').toBeGreaterThanOrEqual(10);
    /* ③ 砸开那团墨的半径：原来 7，且立刻就收 */
    expect(num('DROP_BURST_R'), '砸点墨团太小').toBeGreaterThanOrEqual(30);
    /* ④ 最外圈涟漪半径：原来 46 */
    expect(num('DROP_R'), '涟漪范围太小').toBeGreaterThanOrEqual(110);
    /* ⑤ 压扁比：0.42 太扁 ⇒ 环读不出来；上限防过圆 */
    expect(num('DROP_RING_RY'), '涟漪压扁比太小 ⇒ 环读不出来').toBeGreaterThanOrEqual(0.6);
    expect(num('DROP_RING_RY'), '涟漪压扁比过大 ⇒ 不像落在纸面上').toBeLessThanOrEqual(0.9);
    /* ⑥ 涟漪线宽：原来 2.2 */
    expect(num('DROP_RING_W'), '涟漪线宽太细').toBeGreaterThanOrEqual(3.5);
    /* ⑦ 溅射颗数：原来**一颗都没有** ⇒ 落地只有同心环，读成涟漪不像砸落 */
    expect(num('SPLAT_N'), '必须有溅射小墨珠（不然落地只有同心环）').toBeGreaterThanOrEqual(8);
    /* ⑧ 生命期：原来 2.4s 太快 */
    expect(num('DROP_LIFE'), '生命期太短 ⇒ 一眨眼就过去').toBeGreaterThanOrEqual(3.2);
    /* ⑨ 落点必须钳制到可见带：列表长时新评论 prepend 到顶部、位置在视口之上
          ⇒ 落滴落在屏幕外 ⇒ 提交成功却"什么都没发生"（这是"没看到"的一类成因） */
    /* ⚠ 切片边界：源文件里 `onDrop` 定义在 `paint` **之后**（第451 行 vs 352 行），
       所以结束锚点必须取 onDrop 后面那个真实存在的 `function startLoop`
       之前的段落；用 paint 当结束锚点会切出空串（这次踩到了）。*/
    const onDropEnd = CODE.indexOf('function startLoop') > 0
      ? CODE.indexOf('function startLoop')
      : CODE.indexOf('if (!animate)');
    const onDropSrc = CODE.slice(CODE.indexOf('function onDrop'), onDropEnd);
    expect(onDropSrc, '没读到 onDrop').toBeTruthy();
    expect(
      onDropSrc,
      '落点必须钳制到可见带（几何不在场时落滴会落在视口外）',
    ).toMatch(/Math\.max\(marginY/);
    /* ⑩ 溅射的随机量必须来自 hash01（零随机红线）。
       ⚠ 锚点是 **draw 里那段溅射循环**，不是常数区（常数区当然没有 hash01）。
          锚点用 `for (let j = 0; j < SPLAT_N; j++)` 这句唯一的循环头。*/
    const splatLoop = CODE.indexOf('for (let j = 0; j < SPLAT_N');
    expect(splatLoop, '没读到溅射循环（锚点：for (let j = 0; j < SPLAT_N ...)）').toBeGreaterThan(0);
    const splatBody = CODE.slice(splatLoop, splatLoop + 900);
    expect(splatBody, '溅射角度/初速/大小必须走 hash01（零随机红线）').toMatch(/hash01/);
    expect(
      CODE.slice(splatLoop, splatLoop + 900),
      '溅射段内不许出现 Math.random',
    ).not.toMatch(/Math\.random/);
    /* ⑪ 三段形态都要在：下落（带拖尾）／砸点／涟漪+溅射 */
    expect(CODE, '必须有下落的拖尾（水滴不能是纯圆饼）').toMatch(/createLinearGradient/);
    expect(CODE, '必须有砸点墨团').toMatch(/DROP_BURST_R/);
    expect(CODE, '必须有溅射').toMatch(/SPLAT_N/);
  });

  it('★★ 墨痕从末端逐段消退（不是一刀切）', () => {
    /* 站主要求「从末端随时间慢慢消退」「不是一下消完」。
     * 判据：消退必须是**每个点按各自年龄**独立衰减 —— 所以要有一个
     * 以 t0 为基准的 f(age)，且 age 用的是绝对秒之差。
     * ⚠ 若改成「整条痕统一淡出」（比如整体乘一个系数），末端会一起消失，
     *   读出来是「整块橡皮擦过去」，不是墨干涸。 */
    expect(SRC, '必须有以年龄为参数的浓度函数 blobAlpha').toMatch(
      /function\s+blobAlpha\(\s*age\s*:\s*number\s*\)/,
    );
    const alpha = SRC.slice(SRC.indexOf('function blobAlpha'), SRC.indexOf('function draw'));
    expect(alpha, '浓度必须由 age 与 LIFE 的比值决定（f(t) 确定函数）').toMatch(/age\s*\/\s*LIFE/);
    expect(alpha, 'LIFE 之外必须是 0（痕迹能收干净）').toMatch(/age\s*>\s*LIFE[\s\S]{0,40}return\s+0/);
    /* 生命期与自愈参数都必须是正数、且 LIFE 不为 0（否则"慢慢消退"退化成瞬间消失） */
    const LIFE = Number(SRC.match(/const\s+LIFE\s*=\s*([\d.]+)/)?.[1]);
    const HEAL = Number(SRC.match(/const\s+HEAL\s*=\s*([\d.]+)/)?.[1]);
    expect(Number.isFinite(LIFE) && LIFE > 0, 'LIFE 必须是正数').toBe(true);
    expect(LIFE, 'LIFE 太小 ⇒ 墨"一下消完"，与站主要求相反').toBeGreaterThan(1);
    expect(HEAL, 'HEAL 必须为正（指数自愈的指数，0 或负会异常）').toBeGreaterThan(0);
    /* 半径必须随年龄涨（渗开）—— 消退与渗开同时发生才是"墨在干" */
    const draw = SRC.slice(SRC.indexOf('function draw'));
    expect(draw, '笔触半径必须随年龄增长（SMEAR 渗开）').toMatch(/BLOB_R\s*\+\s*age\s*\*\s*SMEAR/);
  });

  it('零新增运行时依赖（红线）', () => {
    const deps = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies ?? {};
    expect(Object.keys(deps).length, `dependencies 应恰好 3 个，实际 ${Object.keys(deps).join(', ')}`).toBe(3);
    expect(Object.keys(deps)).toEqual(expect.arrayContaining(['astro', '@astrojs/rss', '@astrojs/sitemap']));
  });
});