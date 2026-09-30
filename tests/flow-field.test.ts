import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* 首屏流场线（src/scripts/rhgrid.ts）的几条不可退让的性质。
 *
 * ① 时间基准必须是**毫秒**。
 *    参考站 wodniack.dev 的 <a-waves> 给噪声项喂的是毫秒 —— 它的 ticker 是
 *    `$.emit("tick", t*1e3)`（GSAP 的 t 是秒，参考站在 emit 时自己乘了 1000）。
 *    本站在第七版移植时写成 `now / 1000`（秒）⇒ 噪声项慢 **1000 倍**。
 *    实测（_probe/cdp-flow-drift.mjs，按弧长采样同一批点的位移）：
 *      改前 0.006 px/s（视觉上完全静止）· 改后 2.7–4.6 px/s · 参考站 4.1 px/s。
 *    站主原话：「像 wodniack.dev 一样视觉感官上那些线在缓慢移动」。
 *    ★ 这条断言存在的意义：`T = now` 看上去**特别像**一个漏了 /1000 的单位 bug，
 *      后来人很容易"顺手修正"成秒 —— 那正好把站主要的效果修没了。
 *
 * ② 流速要落在一个带里。
 *    流速完全由噪声参数决定：WAVE_TX 是 px/ms ⇒ 场的横向流速 = WAVE_TX × 1000。
 *    钉住"性质"而不是"数值"：允许站主按手感调（"更有弹性一点"就可能动这几个数），
 *    但挡住量级错误（差 1000 倍）与"调到躁动"。
 *
 * ③ 流场要带**弹性**，而且必须**两种手段都在**（只做跟随弹簧是看不见的）。
 *    站主原话：「把本站的线改的更有弹性一点，不要太多」。
 *    ★★ 反直觉但实测确凿：单独的"跟随弹簧"在这批线上**完全不可见**。
 *      固定噪声种子扫了三档（_probe/cdp-flow-drift.mjs --seed，摆幅 / 相邻转角）：
 *        ω₀ = ∞（无弹簧） 38.22 / 3.68°   ω₀ = 1.04  38.95 / 3.75°   ω₀ = 0.70  38.90 / 3.76°
 *      —— 差别全落在 ± 之内。两个原因叠加：
 *        (a) 弹簧是**全场统一**的 ⇒ 只产生"整片一起晚一拍 + 整体缩一点"，
 *            没有参照物、人眼看不出（人眼只能看出**差异**，看不出"一起晚了"）；
 *        (b) 这批噪声场的能量几乎**全在 λ > 170 px**（实测每条线弧长 881 px、
 *            走向反向 5.2 次 ⇒ 平均褶长约 170 px）。截止波长要压到它之下才有东西
 *            可滤，而那时滤掉的是**主起伏本身**（观感 = 线变平），不是"弹性"。
 *      ⇒ 可见的弹性必须**空间上不均匀** ⇒ 所以还需要 ⅱ：呼吸（沿 x 带波长的调制）：
 *        ω₀ = 1.04 rad/s ⇒ 截止波长 = 流速 × 2π/ω₀ ≈ 76 px
 *        ω₀ = 0.70 rad/s ⇒ 截止波长 ≈ 112 px
 *    ⇒ 断言钉三条：ζ 欠阻尼但不过分（0.45–0.75）、ω₀ 有滤但没把线滤塌（0.4–3.0）、
 *      以及呼吸的两件套（sin 调制 + 与列位相关）必须在。
 *
 * ④ 弹簧必须**帧率无关**（2026-10-01 补）。
 *    ★★ 第一版用的是"每帧固定系数"（`v += (T-x)*S; v *= D`）—— 看着最自然，实则等效
 *      ω₀ = √S × **实际帧率** ⇒ 120 Hz 屏上弹性快一倍、掉帧时又变慢，**观感随设备变**。
 *      抓出它的不是观感而是**验收失效**：同一版本在线上跑两遍，逐点差 **7.4–12.3 px**，
 *      正好等于要测的"弹性效果本身"（无弹性版噪声底只有 0.04–0.40 px，
 *      形状本该是 seed + t 的确定函数）。参见 _probe/cdp-flow-sync.mjs。
 *    ⇒ 改用物理量 + 真实 dt 的半隐式欧拉：`a = ω₀²(T−x) − 2ζω₀·v; v += a·dt; x += v·dt`，
 *      两个常量由原系数**推导**（60 fps 行为不变）：ω₀² = S × 60²、2ζω₀ = (1−D) × 60。
 */
const SRC = readFileSync('src/scripts/rhgrid.ts', 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
// ★ 要能读科学计数法（参数写成 7.5e-5 时只抓到 7.5 会让整条断言变成假的）
const num = (name: string) => Number((SRC.match(new RegExp(`${name}\\s*=\\s*([\\d.]+(?:e[-+]?\\d+)?)`, 'i')) ?? [])[1]);

describe('首屏流场线：时间基准、流速、弹性与帧率无关', () => {
  it('时间基准是毫秒：T = now（不是 now / 1000）', () => {
    console.log(
      `判据 流场时间基准 对象 src/scripts/rhgrid.ts 实测: `
      + `${/T\s*=\s*now\b/.test(CODE) ? 'T = now（毫秒 ✓）' : '没找到 T = now'} · `
      + `${/T\s*=\s*now\s*\//.test(CODE) ? '⚠️ 出现了 T = now / …（喂成秒）' : '无除法 ✓'}`,
    );
    expect(CODE, 'tick() 里没有 T = now').toMatch(/T\s*=\s*now\b/);
    expect(
      CODE,
      'T 被喂成了秒（now / 1000）—— 参考站是毫秒，写成秒会慢 1000 倍、线肉眼静止',
    ).not.toMatch(/T\s*=\s*now\s*\//);
  });

  it('源文件里留着参考站的依据（t*1e3），否则后人会把它当单位 bug 改回去', () => {
    expect(
      SRC,
      '注释里丢了「参考站 ticker 发的是毫秒」这条依据 —— T = now 会被误读成漏了 /1000',
    ).toMatch(/t\s*\*\s*1e3/);
    expect(
      /wodniack|<a-waves>/i.test(SRC),
      '文件里没提 wodniack / <a-waves> —— 后人就不知道这几个参数与时间单位是"参考站实测"的',
    ).toBe(true);
  });

  it('场的流速落在 5–25 px/s（WAVE_TX 是 px/ms ⇒ ×1000）', () => {
    const tx = num('WAVE_TX');
    const ty = num('WAVE_TY');
    const vx = tx * 1000;
    const vy = ty * 1000;
    console.log(
      `判据 流场流速 对象 rhgrid.ts 实测: WAVE_TX=${tx} ⇒ 横向 ${vx} px/s · `
      + `WAVE_TY=${ty} ⇒ 纵向 ${vy} px/s（参考站同参数）`,
    );
    expect(tx, 'WAVE_TX 没解析出来').toBeGreaterThan(0);
    expect(vx, `横向流速 ${vx} px/s 太慢（≈静止）或太快（躁动）`).toBeGreaterThanOrEqual(5);
    expect(vx, `横向流速 ${vx} px/s 太慢（≈静止）或太快（躁动）`).toBeLessThanOrEqual(25);
    expect(vy, `纵向流速 ${vy} px/s 超出 2–12 的带`).toBeGreaterThanOrEqual(2);
    expect(vy, `纵向流速 ${vy} px/s 超出 2–12 的带`).toBeLessThanOrEqual(12);
  });

  it('降级路径还在：reduced-motion 只画一帧静态、且不建 raf', () => {
    expect(CODE, 'reduced-motion 分支被删了').toMatch(/if\s*\(\s*reduce\s*\)\s*\{[^}]*draw\(\)[^}]*return/);
    expect(CODE, '出视口停帧的 IntersectionObserver 被删了').toContain('IntersectionObserver');
  });

  it('流场带弹性：wave 用二阶弹簧跟随，不是直接赋值', () => {
    const spring = /pt\.wv\.[xy]\s*\+=\s*\(\s*WAVE_W2\s*\*\s*\(\s*t[xy]\s*-\s*pt\.wave\.[xy]\s*\)\s*-\s*WAVE_Z2\s*\*\s*pt\.wv\.[xy]\s*\)\s*\*\s*dt/.test(CODE);
    console.log(
      `判据 流场弹性 对象 src/scripts/rhgrid.ts 实测: `
      + `${spring ? 'v += (ω₀²(target - x) - 2ζω₀·v) * dt ✓' : '没找到弹簧积分'} · `
      + `${/pt\.wave\.x\s*=\s*Math\.cos/.test(CODE) ? '⚠️ wave 仍被直接赋值' : '无直接赋值 ✓'}`,
    );
    expect(CODE, '弹簧的积分式没了（wave 退化成直接赋值 ⇒ 弹性消失）').toMatch(
      /pt\.wv\.[xy]\s*\+=\s*\(\s*WAVE_W2\s*\*\s*\(\s*t[xy]\s*-\s*pt\.wave\.[xy]\s*\)\s*-\s*WAVE_Z2\s*\*\s*pt\.wv\.[xy]\s*\)\s*\*\s*dt/,
    );
    expect(
      CODE,
      'pt.wave 被直接赋值（= 目标）—— 弹性被删了；见文件里「可见的弹性来自谐波差别对待」那段',
    ).not.toMatch(/pt\.wave\.x\s*=\s*Math\.cos/);
    expect(
      CODE,
      '少了「首帧直接落位」的分支 —— 开场/改窗宽时会看到线从平到皱的过渡',
    ).toMatch(/pt\.ini/);
  });

  it('弹簧帧率无关：用真实 dt 积分（"每帧固定系数"会让观感随显示器刷新率变）', () => {
    const S = num('WAVE_S');
    const D = num('WAVE_D');
    // 两个常量必须是**从上面对系数推导**出来的（不是魔法数字）：
    //   ω₀²  = S × 60²   ·   2ζω₀ = (1 − D) × 60
    const w2expr = /WAVE_W2\s*=\s*WAVE_S\s*\*\s*3600/.test(CODE);
    const z2expr = /WAVE_Z2\s*=\s*\(\s*1\s*-\s*WAVE_D\s*\)\s*\*\s*60/.test(CODE);
    // 每帧固定系数的老写法必须**不**在了
    const fixedStep = /pt\.wv\.[xy]\s*\*=\s*WAVE_D/.test(CODE);
    const usesDt = /const\s+dt\s*=\s*Math\.min\(\s*DT_MAX/.test(CODE);
    const passesDt = /move\(\s*T\s*,\s*dt\s*\)/.test(CODE);
    console.log(
      `判据 帧率无关 对象 src/scripts/rhgrid.ts 实测: `
      + `ω₀²=WAVE_S×3600=${(S * 3600).toFixed(4)}（推导式 ${w2expr ? '✓' : '✗'}）· `
      + `2ζω₀=(1−WAVE_D)×60=${((1 - D) * 60).toFixed(4)}（推导式 ${z2expr ? '✓' : '✗'}）· `
      + `${fixedStep ? '⚠️ 还有每帧固定系数' : '无每帧固定系数 ✓'} · `
      + `${usesDt && passesDt ? 'dt 由 rAF 真实间隔算出并传进 move ✓' : '⚠️ 没接上 dt'}`,
    );
    expect(w2expr, 'WAVE_W2 不是从 WAVE_S 推导的（WAVE_W2 = WAVE_S * 3600）—— 别写魔法数字').toBe(true);
    expect(z2expr, 'WAVE_Z2 不是从 WAVE_D 推导的（WAVE_Z2 = (1 - WAVE_D) * 60）').toBe(true);
    expect(
      fixedStep,
      '还在用"每帧固定系数"（v *= WAVE_D）—— 等效 ω₀ 随帧率变：120 Hz 屏上弹性快一倍。'
      + '必须改成 a = ω₀²(T−x) − 2ζω₀·v; v += a·dt; x += v·dt',
    ).toBe(false);
    expect(usesDt, '没有从 rAF 真实间隔算 dt（并有 DT_MAX 上限兜底）').toBe(true);
    expect(passesDt, 'dt 没传给 move()（弹簧还在按帧积分）').toBe(true);
  });

  it('弹性参数停在"看得见"的那一段（ζ 欠阻尼但不过分、ω₀ 有滤但没把线滤塌）', () => {
    const S = num('WAVE_S');
    const D = num('WAVE_D');
    const w0 = Math.sqrt(S) * 60;              // rad/s —— 现在就是弹簧真正用的 ω₀（WAVE_W2 = S×60²）
    const zeta = (1 - D) / (2 * Math.sqrt(S)); // 阻尼比
    // 截止**空间**波长 λ = 流速 × 截止周期 = v × 2π/ω₀（流速取实测的 WAVE_TX×1000）
    const lam = ((num('WAVE_TX') * 1000) * 2 * Math.PI) / w0;
    console.log(
      `判据 弹性参数 对象 rhgrid.ts 实测: WAVE_S=${S} WAVE_D=${D} ⇒ `
      + `ω₀=${w0.toFixed(3)} rad/s（周期 ${((2 * Math.PI) / w0).toFixed(1)}s）· ζ=${zeta.toFixed(3)} · `
      + `截止波长 ≈ ${lam.toFixed(0)}px（主起伏 ≈170px；压到它之下滤掉的就是主起伏本身）`,
    );
    expect(S, 'WAVE_S 没解析出来（写成科学计数法也要能读）').toBeGreaterThan(0);
    expect(D, 'WAVE_D 没解析出来').toBeGreaterThan(0);
    expect(D, 'WAVE_D > 1 会让弹簧发散').toBeLessThan(1);
    expect(
      zeta,
      `ζ=${zeta.toFixed(3)}：≥0.75 就没有过冲（站主要"轻微回弹"），≤0.45 会共振放大、观感躁动`,
    ).toBeGreaterThan(0.45);
    expect(zeta, `ζ=${zeta.toFixed(3)} 超出 0.45–0.75`).toBeLessThan(0.75);
    expect(
      w0,
      `ω₀=${w0.toFixed(3)} rad/s 太低（截止波长 ${lam.toFixed(0)}px）：连主起伏（≈170px）都会被滤掉，`
      + `观感是"线变平"而不是"弹性"（站主："不要太多"）`,
    ).toBeGreaterThan(0.4);
    expect(
      w0,
      `ω₀=${w0.toFixed(3)} rad/s 太高（截止波长 ${lam.toFixed(0)}px）：什么都滤不掉，弹性等于没做`,
    ).toBeLessThan(3.0);
  });

  it('流场带呼吸：弯曲强度沿 x 按波长起伏 —— 这才是"可见"的那一半', () => {
    console.log(
      `判据 流场呼吸 对象 src/scripts/rhgrid.ts 实测: `
      + `${/WAVE_BR\s*\*\s*Math\.sin/.test(CODE) ? '有 sin 调制 ✓' : '没有调制'} · `
      + `${/col\[0\]\.x\s*\/\s*WAVE_BR_WL/.test(CODE) ? '与列位相关（有横向波长）✓' : '⚠️ 全场同步'}`,
    );
    expect(
      CODE,
      '呼吸项没了 —— 单独的跟随弹簧在这批线上实测不可见（三档 ω₀ 都无效果），见文件里那段',
    ).toMatch(/WAVE_BR\s*\*\s*Math\.sin/);
    expect(
      CODE,
      '呼吸必须与列位相关（带横向波长）：全场同步地变弯没有参照物，人眼看不出来',
    ).toMatch(/col\[0\]\.x\s*\/\s*WAVE_BR_WL/);
    const br = num('WAVE_BR');
    const wl = num('WAVE_BR_WL');
    console.log(
      `        ⇒ 呼吸深度 ±${(br * 100).toFixed(0)}% · 周期 ${num('WAVE_BR_MS')}ms · 横向波长 ${wl}px`,
    );
    expect(br, '呼吸深度必须 > 0（= 没做）').toBeGreaterThan(0);
    expect(br, `呼吸深度 ±${br} 太大（站主："不要太多"）`).toBeLessThanOrEqual(0.35);
    expect(wl, '横向波长太小 ⇒ 相邻列的弯曲程度差太多，线会像被撕开').toBeGreaterThan(400);
  });

  it('呼吸必须绕过滤波（乘在弹簧**输入**上实测等于没做）', () => {
    const viaInput = /Math\.cos\(o\)\s*\*\s*WAVE_AMP_X\s*\*\s*breath/.test(CODE);
    const viaOutput = /pt\.wb\.[xy]\s*=\s*pt\.wave\.[xy]\s*\*\s*breath/.test(CODE);
    const drawn = /f0\.x\s*\+\s*f0\.wb\.x/.test(CODE);
    console.log(
      `判据 呼吸接线 对象 src/scripts/rhgrid.ts 实测: `
      + `${viaInput ? '⚠️ 乘在弹簧输入上' : '不在弹簧输入上 ✓'} · `
      + `${viaOutput ? '作用在弹簧输出 ✓' : '没作用在输出'} · `
      + `${drawn ? 'draw 消费 wb ✓' : '⚠️ draw 还在读 wave'}`,
    );
    expect(
      viaInput,
      '呼吸被乘在弹簧的输入上 —— 弹簧在 r≈1 处 |H|≈0.83、滞后 90°，会把呼吸衰减掉一大半，'
      + '剩下的还与场的自然波动相位抵消（实测：有呼吸的摆幅起伏 8.5% < 无呼吸的 12.3%）',
    ).toBe(false);
    expect(viaOutput, '呼吸没有作用在弹簧输出上（pt.wb = pt.wave × breath）').toBe(true);
    expect(drawn, 'draw() 必须消费 wb —— 否则白算').toBe(true);
  });
});
