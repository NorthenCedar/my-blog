/**
 * ★ 2026-11-13：首帧沉降长任务的护栏（站主「归档页还是有概率卡死」）。
 *
 * 病灶不是"物理太复杂"，是**热路径里的存法**：原实现每个约束投影都分配
 * `d.vec2f`（x/y 还是 getter），再叠 Math.hypot、Math.pow、typegpu std.*，
 * `setInitial` 最多 240 步 ⇒ 一条 ~640ms 长任务，主线程冻住 = 概率卡死。
 *
 * 门闩守的是「同样的数学，但每步零分配、零 getter、常量每步算一次」这层关系，
 * 不是守某段代码的字面形状。行为等价比由 `tests/jelly-initialization.test.ts`
 * （首帧形状 ↔ 往返后静止形状 < 0.005）守住。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../src/vendor/jelly-slider/slider.ts', import.meta.url)),
  'utf8',
);
/* 判据一律跑在剥掉注释的源码上：本文件与其它文档里的解释性文字写过旧写法，
   注释里出现 `d.vec2f` / `Math.hypot` 不代表产物回退了。 */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const method = (name: string): string => {
  /* ⚠ 锚点必须带行首缩进 + 声明形态：只写 `#projectConstraints()` 会先命中
     #step 里的「调用」（`this.#projectConstraints();`），切出一截空壳 —— 门闩假绿。 */
  const start = code.indexOf('\n  ' + name);
  expect(start, `找不到方法声明 ${name}`).toBeGreaterThan(-1);
  const next = code.indexOf('\n  #', start + 1);
  expect(next, `${name} 之后找不到下一个私有方法`).toBeGreaterThan(start);
  return code.slice(start, next);
};
const physics = method('#step(dt: number)') + method('#integrate(h: number') +
  method('#projectConstraints()') + method('#projectDistance(i: number');

describe('果冻首帧沉降：长任务护栏（2026-11-13）', () => {
  it('积分 / 约束投影里不许再分配 vec2f（每步 ~3000 次）', () => {
    const integrate = method('#integrate(h: number');
    const constraints = method('#projectConstraints()');
    const distance = method('#projectDistance(i: number');
    for (const [name, body] of [
      ['#integrate', integrate],
      ['#projectConstraints', constraints],
      ['#projectDistance', distance],
    ] as const) {
      expect(body.includes('d.vec2f'), `${name} 里出现 vec2f 分配 —— 首帧会退回百万级对象分配`).toBe(false);
    }
  });

  it('约束投影用 sqrt 而不是 Math.hypot', () => {
    const distance = method('#projectDistance(i: number');
    expect(distance).toMatch(/Math\.sqrt\(dx \* dx \+ dy \* dy\)/);
    expect(distance.includes('Math.hypot'), 'hypot 的防溢出缩放在本站坐标量级用不上，却慢两个数量级').toBe(false);
  });

  it('点位常量（拱形权重 / 弯折强度）每步算一次，不留在迭代内层', () => {
    /* 15 点 × 16 轮 × 6 子步 × 240 步 ≈ 35 万次 Math.pow —— 这是第二轮 profile 的大头。 */
    const step = method('#step(dt: number)');
    const constraints = method('#projectConstraints()');
    expect(step).toMatch(/const arch = this\.#archProfile/);
    expect(step).toMatch(/const bend = this\.#bendK/);
    expect(step).toMatch(/arch\[i\] =/);
    expect(step).toMatch(/bend\[i\] =/);
    expect(constraints).toMatch(/bend\[i\]/);
    expect(/\*\*|Math\.pow/.test(constraints), '迭代内层不许有幂运算 —— 强度只与点位有关').toBe(false);
  });

  it('收敛判定不分配临时数组（原来每步 map + spread）', () => {
    const initial = method('setInitial(x: number)');
    expect(initial.includes('.map('), '沉降循环里每步一次 map 会重新制造 240 次数组分配').toBe(false);
    expect(initial).toMatch(/#qx\.set\(this\.#px\)/);
  });

  it('整体：热路径不许退回 typegpu 的 CPU 侧 std.*（慢 20 倍以上）', () => {
    expect(/std\.(smoothstep|clamp|saturate)/.test(physics),
      'std.* 带 GPU 代码生成分发，CPU 物理循环里用等价纯 JS（clamp01 / smoothstepJS）').toBe(false);
  });
});
