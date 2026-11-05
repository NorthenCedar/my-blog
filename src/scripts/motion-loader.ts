export type MotionEngine = typeof import('./motion-engine');
let ready: MotionEngine | null = null;
let loading: Promise<MotionEngine | null> | null = null;
export function getMotion(): MotionEngine | null {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? null : ready;
}
export function warmMotion(): Promise<MotionEngine | null> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve(null);
  return loading ??= import('./motion-engine').then(engine => (ready = engine)).catch(() => null);
}
/** 操作意图出现才下载；没有引擎也不阻断内容。 */
export function primeMotion(target: HTMLElement): () => void {
  const warm = () => { void warmMotion(); };
  const events = ['pointerenter', 'pointerdown', 'focusin'] as const;
  events.forEach(name => target.addEventListener(name, warm, { passive: true }));
  return () => events.forEach(name => target.removeEventListener(name, warm));
}
