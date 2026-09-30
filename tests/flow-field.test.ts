import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* 首屏流场线（src/scripts/rhgrid.ts）的两条不可退让的性质。
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
 */
const SRC = readFileSync('src/scripts/rhgrid.ts', 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
const num = (name: string) => Number((SRC.match(new RegExp(`${name}\\s*=\\s*([\\d.]+)`)) ?? [])[1]);

describe('首屏流场线：时间基准与流速', () => {
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
});
