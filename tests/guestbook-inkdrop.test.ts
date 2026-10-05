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

  it('★ 不读 DOM 几何（评论展开不触发重排重画）', () => {
    expect(CODE, '装置不许量 DOM 几何').not.toMatch(/getBoundingClientRect|offsetWidth|offsetHeight|clientTop|clientLeft/);
    /* 唯一允许的 DOM 读是 clientWidth/clientHeight（画布自己的尺寸）。 */
    const reads = [...CODE.matchAll(/client(?:Width|Height)/g)];
    expect(reads.length, '只该在 fit() 里读画布自身尺寸').toBeGreaterThan(0);
    expect(CODE, '留言区范围必须是视口常量算的，不是量DOM 得来的').toMatch(/function\s+overMessageArea/);
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
    expect(TRAIL_MAX, '上限太小会拖动手感').toBeGreaterThanOrEqual(120);
    expect(TRAIL_MAX, '上限太大 ⇒长时间涂抹会吃掉内存/帧率').toBeLessThanOrEqual(1200);
    /* 配合清理循环：上限只是保险，逻辑上还要真的把淡掉的移除（见上一条 it） */
    expect(LIFE * 60, 'LIFE 太长会让上一轮的墨一直挂在屏上').toBeLessThan(600);
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