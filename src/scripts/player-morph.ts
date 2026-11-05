import { getMotion, primeMotion, type MotionEngine } from './motion-loader';

/** 空玻璃壳承担拉伸，真实面板中的文字和控件不参与缩放。 */
export function createPlayerMorph(root: HTMLElement, engine: () => MotionEngine | null = getMotion) {
  const panel = root.querySelector<HTMLElement>('#music-panel')!;
  const content = panel.querySelector<HTMLElement>('[data-music-content]')!;
  const bar = root.querySelector<HTMLElement>('.music-bar')!;
  const sheet = root.querySelector<HTMLElement>('[data-music-morph]')!;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const unprime = primeMotion(root);
  let desired = !panel.hidden, version = 0, disposed = false;
  let animation: ReturnType<MotionEngine['gsap']['timeline']> | null = null;
  let baseWidth = 0, baseHeight = 0;
  const finish = () => {
    ++version; animation?.kill(); animation = null;
    panel.hidden = !desired;
    panel.style.removeProperty('opacity'); panel.style.removeProperty('visibility');
    content.style.removeProperty('opacity');
    sheet.hidden = true; sheet.removeAttribute('style');
  };
  function setOpen(open: boolean) {
    if (disposed) return;
    desired = open;
    const motion = media.matches ? null : engine();
    if (!motion) { finish(); return; }
    const token = ++version;
    animation?.kill(); animation = null;
    const wasHidden = panel.hidden;
    panel.hidden = false;
    const full = panel.getBoundingClientRect(), anchor = bar.getBoundingClientRect(), origin = root.getBoundingClientRect();
    panel.hidden = wasHidden;
    if (!full.width || !full.height || !anchor.width || !anchor.height) { finish(); return; }
    const { gsap } = motion;
    const sx = anchor.width / full.width, sy = anchor.height / full.height;
    const folded = {
      x: anchor.left - full.left, y: anchor.top - full.top, scaleX: sx, scaleY: sy,
      '--morph-rx': (anchor.height / sx / 2) + 'px', '--morph-ry': (anchor.height / sy / 2) + 'px',
    };
    const expanded = { x: 0, y: 0, scaleX: 1, scaleY: 1, '--morph-rx': '28px', '--morph-ry': '28px' };
    if (sheet.hidden) {
      baseWidth = full.width; baseHeight = full.height;
      gsap.set(sheet, {
        left: full.left - origin.left, top: full.top - origin.top, width: full.width, height: full.height, transformOrigin: '0 0',
        ...(open ? folded : expanded), opacity: 1, visibility: 'visible',
      });
      sheet.hidden = false;
    } else gsap.set(sheet, { opacity: 1, visibility: 'visible' });
    panel.hidden = !open;
    gsap.set(panel, { visibility: 'hidden' });
    gsap.set(content, { opacity: 0 });
    animation = gsap.timeline({ onComplete: () => { if (token === version) finish(); } });
    animation.to(sheet, { ...(open ? expanded : folded), duration: open ? .34 : .24, ease: 'power3.inOut' });
    // 玻璃层本身不做 opacity 过渡，避免其子层的 backdrop-filter 丢失背景采样。
    if (open) animation.set(panel, { visibility: 'visible' }, .34)
      .set(sheet, { visibility: 'hidden' }, .34)
      .to(content, { opacity: 1, duration: .13, ease: 'power1.out' }, .34);
  }
  window.addEventListener('resize', finish, { passive: true });
  media.addEventListener('change', finish);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (!animation || !desired) return;
    const r = panel.getBoundingClientRect();
    if (Math.abs(r.width - baseWidth) > 1 || Math.abs(r.height - baseHeight) > 1) finish();
  }) : null;
  observer?.observe(panel);
  return {
    setOpen, finish,
    dispose() {
      disposed = true; finish(); unprime(); observer?.disconnect();
      window.removeEventListener('resize', finish); media.removeEventListener('change', finish);
    },
  };
}
