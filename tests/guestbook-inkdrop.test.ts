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
     ⚠ 允许两种写法：`t0: nowSec()` 直接取，或先 `const ts = nowSec()` 再 `t0: ts`
       —— 后者**整批共用同一时刻**是**正确**的（一笔里那12 个采样点同时出生，
       物理上就该同时开始渗开；逐点各调一次nowSec() 反而会让它们差几微秒）。
       所以判据认「t0 最终来自 nowSec()」这条链，不强求写法。 */
  const trailT0 = CODE.match(/blobs\.push\(\{[^}]*t0:\s*(\w+)/)?.[1] ?? '';
  expect(trailT0, '没读到墨痕的 t0 来源').toBeTruthy();
  /* 溯源：t0 的来源要么就是 nowSec，要么是个"由 nowSec 赋值"的局部变量。
     ★ 关键在**必须能在源码里找到那个赋值** —— 变异把 `t0: ts` 改成 `t0: age` 时，
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
    expect(Number.isFinite(LIFE) && LIFE > 0, `LIFE 读不到或非正：${LIFE}`).toBe(true);
    expect(Number.isFinite(HEAL), `HEAL 读不到：${HEAL}`).toBe(true);

    /* 与 blobAlpha 同一份公式（源码那行的结构：rise × decay） */
    const blobAlpha = (age: number) => {
      if (age < 0 || age > LIFE) return 0;
      const rise = Math.min(1, age / (LIFE * 0.08));
      const decay = Math.pow(1 - age / LIFE, HEAL);
      return rise * decay;
    };

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

  it('零新增运行时依赖（红线）', () => {
    const deps = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies ?? {};
    expect(Object.keys(deps).length, `dependencies 应恰好 3 个，实际 ${Object.keys(deps).join(', ')}`).toBe(3);
    expect(Object.keys(deps)).toEqual(expect.arrayContaining(['astro', '@astrojs/rss', '@astrojs/sitemap']));
  });
});