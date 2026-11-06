/** 装饰环的角度与临界阻尼，不依赖浏览器或帧率。 */
export type Spring = { value: number; target: number; velocity: number };
export const spring = (): Spring => ({ value: 0, target: 0, velocity: 0 });
export const angleDelta = (next: number, previous: number) => Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
export function advanceSpring(s: Spring, dt: number) {
  const offset = s.value - s.target;
  const c = s.velocity + 8 * offset;
  const decay = Math.exp(-8 * dt);
  s.value = s.target + (offset + c * dt) * decay;
  s.velocity = (s.velocity - 8 * c * dt) * decay;
  if (Math.abs(s.value - s.target) < 0.002 && Math.abs(s.velocity) < 0.01) {
    s.value = s.target; s.velocity = 0; return false;
  }
  return true;
}
