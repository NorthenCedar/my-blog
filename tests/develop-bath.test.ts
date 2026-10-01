import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* 相册页「流动显影槽」（DEVELOP BATH）的几条不可退让的性质。
 *
 * 装置来源：站主给了抖音参考（作者 Lowkey），拆开是四层 ——
 *   ① 底层一张真实照片 ② 上层整版纯色 ③ 纯色被"挖"出一个**有机形状的洞**、
 *   洞在缓慢生长变形蔓延（洞内露出照片）④ 文字压在最上层不参与显影。
 *   ★ 关键词：**不是"逐渐变清晰"，是"形状在流动"** —— 照片不动，动的是遮罩。
 *   本站三处换算（站主 2026-10-01 拍板）：照片→相册精选；纯色→深墨绿（照搬首页 .band）；
 *   文字→板内左下角的仪器读数。
 *
 * ① 形状必须是 **t 的确定函数**（无随机源）。
 *    ★★ 这条不是洁癖，是**验收的前提**：形状 = f(t) ⇒ 两次加载在同一 performance.now()
 *    下的轮廓**逐点相同**，于是"改了什么"可以用同 t 逐点差（_probe/cdp-bath.mjs --hold）
 *    精确量出来。一旦引入 Math.random，"指针搅动的位移"与"形状自己变了"就分不开
 *    （这正是第十版弹簧那条坑的同构版本，见 tests/flow-field.test.ts ④）。
 *    顺带：确定函数也意味着观感不随显示器刷新率变。
 *
 * ② 时间基准是 performance.now() 的**绝对值**，不是"每帧累加一个相位"。
 *    "每帧 += 增量" ⇒ 形状相位 = 帧数 ⇒ 30 Hz 屏上慢一倍、掉帧时跳变。
 *
 * ③ 指针搅动必须是**局部**的：只有指针附近那段边界被推开，不是整块充气。
 *    强度用 smoothstep 按距离衰减，并留出"指针在板外则完全不响应"的路。
 *
 * ④ 强度的平滑必须**帧率无关**（指数形式 1−e^(−dt/τ)），不是"每帧乘固定系数"。
 *    ★ 同一条教训在本仓库出现过两次（流场弹簧是第一次，实测同版本两遍差 7.4–12.3 px）。
 *
 * ⑤ 无 JS 可用 / reduced-motion 降级 / 视口停帧 —— 三条既有契约。
 *    板是**装饰**：内容在网格里已经完整存在，所以宁可整块不出现，也不许
 *    "内容只在动画里可见"（第十版那条血的教训）。
 */
const SRC = readFileSync('src/scripts/develop.ts', 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
const ASTRO = readFileSync('src/pages/gallery/index.astro', 'utf8');
const num = (name: string) =>
  Number((SRC.match(new RegExp(`${name}\\s*=\\s*([\\d.]+(?:e[-+]?\\d+)?)`, 'i')) ?? [])[1]);

describe('相册页显影槽：形状、搅动与降级', () => {
  it('形状是 t 的确定函数（无随机源）—— 跨加载逐点比对的前提', () => {
    const rand = /Math\.random/.test(CODE);
    console.log(
      `判据 确定函数 对象 src/scripts/develop.ts 实测: ${rand ? '⚠️ 有 Math.random' : '无随机源 ✓'}`,
    );
    expect(
      rand,
      '形状里引入了随机源 ⇒ 同一个 t 两次加载形状不同：同 t 逐点比对（验收手段）直接失效，'
      + '观感也不再可复现。若确实要随机，必须用可注入的种子并把种子记进存档',
    ).toBe(false);
  });

  it('时间基准是 performance.now() 的绝对值，不是"每帧累加"', () => {
    const absPh = /const\s+ph\s*=\s*t\s*\*\s*PH_SPD/.test(CODE);
    const absGrow = /Math\.cos\(\s*\(\s*t\s*\*\s*TAU2\s*\)\s*\/\s*T_GROW\s*\)/.test(CODE);
    const accum = /\bph\s*\+=/.test(CODE);
    console.log(
      `判据 时间基准 实测: ${absPh ? '相位 = t × PH_SPD ✓' : '⚠️ 相位不是由 t 直接算'} · `
      + `${absGrow ? '生长曲线由 t 直接算 ✓' : '⚠️ 生长曲线不是由 t 算'} · `
      + `${accum ? '⚠️ 相位在累加' : '无累加 ✓'}`,
    );
    expect(absPh, '形状相位不是 t 的绝对函数（改成累加 ⇒ 观感随帧率变、跨加载不可比）').toBe(true);
    expect(absGrow, '生长曲线不是 t 的绝对函数').toBe(true);
    expect(accum, '形状相位在"每帧累加" —— 30 Hz 屏上会慢一倍').toBe(false);
  });

  it('指针搅动是局部的：按距离衰减，不是整块充气', () => {
    const near = /d2\s*<\s*RINF\s*\*\s*RINF/.test(CODE);
    const smooth = /w\s*\*\s*w\s*\*\s*\(\s*3\s*-\s*2\s*\*\s*w\s*\)/.test(CODE);
    const offBoard = /pw\s*>\s*0\.002/.test(CODE);
    const push = num('PUSH_K');
    const rinf = num('R_INF_K');
    console.log(
      `判据 局部搅动 实测: ${near ? '有影响半径判断 ✓' : '⚠️ 没有距离判断'} · `
      + `${smooth ? 'smoothstep 衰减 ✓' : '⚠️ 没有平滑衰减'} · `
      + `${offBoard ? '指针离开即不响应 ✓' : '⚠️ 缺"指针无效"的路'} · `
      + `PUSH_K=${push} R_INF_K=${rinf}`,
    );
    expect(near, '指针影响只按"是否在板内"生效 ⇒ 整块一起动，读作充气而不是被搅动').toBe(true);
    expect(smooth, '指针附近的推开没有平滑衰减（边缘会出现一个尖角）').toBe(true);
    expect(offBoard, '缺"指针未进入/已离开"的短路 ⇒ 板外也会被影响').toBe(true);
    // 手感参数：钉区间不钉数值（站主可按手感调），只挡住"大到像被咬一口 / 小到看不见"
    expect(push > 0.05 && push <= 0.28, `PUSH_K=${push} 越界（0.30 时形状小一点就像被咬了一口）`).toBe(true);
    expect(rinf > 0.15 && rinf <= 0.45, `R_INF_K=${rinf} 越界（影响半径应明显小于形状本身）`).toBe(true);
  });

  it('强度平滑帧率无关：指数形式，不是每帧乘固定系数', () => {
    const expo = /1\s*-\s*Math\.exp\(\s*-dt\s*\/\s*TAU\s*\)/.test(CODE);
    const perFrame = /pw\s*\*=\s*[\d.]+/.test(CODE);
    const dtCap = /Math\.min\(DT_MAX,?\s*Math\.max\(0,\s*now\s*-\s*last\)\)/.test(CODE);
    console.log(
      `判据 帧率无关 实测: ${expo ? '1 − e^(−dt/τ) ✓' : '⚠️ 不是指数平滑'} · `
      + `${perFrame ? '⚠️ 还有每帧固定系数' : '无每帧固定系数 ✓'} · `
      + `${dtCap ? 'dt 取自 rAF 真实间隔并设上限 ✓' : '⚠️ 没接真实 dt / 没上限'}`,
    );
    expect(expo, '指针强度用"每帧乘固定系数"平滑 ⇒ 强度随时间常数随帧率变').toBe(true);
    expect(perFrame, '还有每帧固定系数（*= 常数）：这一条在流场弹簧上已经栽过一次').toBe(false);
    expect(dtCap, 'dt 没从 rAF 真实间隔算 / 没有上限（切标签回来会跳变）').toBe(true);
  });

  it('板默认不出现 —— 没有 JS 就没有它，不是"藏起来"', () => {
    const hiddenAttr = /class="bath"[^>]*\shidden\b/.test(ASTRO);
    const ariaHidden = /class="bath"[^>]*aria-hidden="true"/.test(ASTRO);
    const reveals = /host\.hidden\s*=\s*false/.test(CODE);
    const hiddenCss = /\.bath\[hidden\]/.test(ASTRO);
    console.log(
      `判据 无 JS 降级 实测: ${hiddenAttr ? 'SSR 就带 hidden ✓' : '⚠️ 首屏没有 hidden'} · `
      + `${ariaHidden ? 'aria-hidden ✓' : '⚠️ 缺 aria-hidden'} · `
      + `${reveals ? '脚本到位才解除 ✓' : '⚠️ 脚本没解除'} · `
      + `${hiddenCss ? '显式 [hidden] 规则 ✓' : '⚠️ 没有 [hidden] 兜底规则'}`,
    );
    expect(hiddenAttr, '板没带 hidden ⇒ 无 JS 时会看到一块空的深色板（板上没有可用信息）').toBe(true);
    expect(ariaHidden, '板是纯装饰，应 aria-hidden —— 否则读屏会念一段无意义的读数').toBe(true);
    expect(reveals, '脚本没有解除 hidden（板永远不出现）').toBe(true);
    expect(hiddenCss, '上游若给 .bath 加了 display，[hidden] 会被覆盖 ⇒ 必须显式写一条').toBe(true);
  });

  it('reduced-motion：停在固定相位、只画一帧、不跑 rAF', () => {
    const mq = /matchMedia\(\s*'\(prefers-reduced-motion:\s*reduce\)'\s*\)/.test(CODE);
    const still = /T_STILL/.test(CODE);
    const noRaf = /cancelAnimationFrame/.test(CODE);
    const stillPhase = /render\(\s*reduce\.matches\s*\?\s*T_STILL\s*:/.test(CODE);
    console.log(
      `判据 降级 实测: ${mq ? '查询 reduced-motion ✓' : '⚠️ 没查'} · `
      + `${still && stillPhase ? '固定相位 T_STILL ✓' : '⚠️ 没走固定相位'} · `
      + `${noRaf ? '可停帧 ✓' : '⚠️ 不能停帧'}`,
    );
    expect(mq, '没有 reduced-motion 降级').toBe(true);
    expect(still && stillPhase, 'reduced-motion 下没走固定相位（形状会被冻在某个随机不好看的时刻）').toBe(true);
    expect(noRaf, '没有停帧能力 ⇒ reduced-motion 下仍在空跑 rAF').toBe(true);
  });

  it('视口外停帧（板在页头，滚过去就不该再算）', () => {
    const io = /IntersectionObserver/.test(CODE);
    const vis = /visibilitychange/.test(CODE);
    console.log(
      `判据 停帧 实测: ${io ? 'IntersectionObserver ✓' : '⚠️ 没有'} · `
      + `${vis ? '切标签停帧 ✓' : '⚠️ 没处理 visibilitychange'}`,
    );
    expect(io, '没有 IntersectionObserver ⇒ 滚到网格里还在每帧算噪声（白烧电）').toBe(true);
    expect(vis, '切到别的标签页后仍在跑 rAF').toBe(true);
  });

  it('与页面互动：划过网格任意一张 ⇒ 板里换成那一张', () => {
    const binds = /querySelectorAll<HTMLElement>\('\.wf figure'\)/.test(CODE);
    const reads = /fig\.querySelector<HTMLAnchorElement>\('a\.frame'\)/.test(CODE);
    const locks = /lockT\s*=\s*LOCK_MS/.test(CODE);
    const reads2 = /swap|read\(f, idx \+ 1, list\.length, tag\)/.test(CODE);
    console.log(
      `判据 页面互动 实测: ${binds ? '订阅 .wf figure ✓' : '⚠️ 没订阅'} · `
      + `${reads ? '取 a.frame 的 href ✓' : '⚠️ 没取图源'} · `
      + `${locks ? '悬停后暂停自动轮换 ✓' : '⚠️ 没暂停自动轮换'} · `
      + `${reads2 ? '板内读数同步 ✓' : '⚠️ 读数没同步'}`,
    );
    expect(binds, '没有把网格里的图接进来（站主的核心诉求：底下的影要能和那页互动）').toBe(true);
    expect(reads, '没从 figure 取图片地址').toBe(true);
    expect(locks, '悬停后没暂停自动轮换 ⇒ 手指还停在图上就被自动换走了').toBe(true);
    expect(reads2, '板内读数没跟着换（读数与画面不一致，仪器感就假了）').toBe(true);
  });

  it('板底不由 canvas 画 —— 透明 canvas 才能在降级时留住板底、探针才能读轮廓', () => {
    const clears = /ctx\.clearRect\(0,\s*0,\s*W,\s*H\)/.test(CODE);
    const fills = /ctx\.fillRect\(0,\s*0,\s*W,\s*H\)/.test(CODE);
    const bg = /\.bath\s*\{[^}]*background/.test(ASTRO);
    console.log(
      `判据 透明画布 实测: ${clears ? '每帧 clearRect ✓' : '⚠️ 没有清屏'} · `
      + `${fills ? '⚠️ canvas 在铺板底' : '不铺板底 ✓'} · `
      + `${bg ? '板底由 CSS 背景承担 ✓' : '⚠️ CSS 里没有板底色'}`,
    );
    expect(clears, '没有每帧清屏 ⇒ 形状会留残影').toBe(true);
    expect(fills, 'canvas 在铺板底色 ⇒ 每帧多一次全屏填充，且降级/无 JS 时板底丢失').toBe(false);
    expect(bg, '板底没有落到 CSS ⇒ 无 JS 时看不到这块板').toBe(true);
  });

  it('满宽手法：板要铺满视口（不是被 .shell 的 1312px 框住）', () => {
    const bleed = /margin-inline:\s*calc\(50%\s*-\s*50vw\)/.test(ASTRO);
    const noVw = !/\bwidth:\s*100vw/.test(ASTRO);
    console.log(
      `判据 满宽 实测: ${bleed ? 'margin-inline: calc(50% - 50vw) ✓' : '⚠️ 没有满宽'} · `
      + `${noVw ? '没有 width:100vw ✓' : '⚠️ 用了 width:100vw（含滚动条宽度 ⇒ 会溢出）'}`,
    );
    expect(bleed, '板没铺满视口 ⇒ 会变成"中间 1312px 一块"，上下两段却是满宽（两条竖向硬边）').toBe(true);
    expect(noVw, 'width:100vw 含滚动条宽度 ⇒ 横向溢出').toBe(true);
  });
});
