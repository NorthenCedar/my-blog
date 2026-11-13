import { getMotion, type MotionEngine } from './motion-loader';

/** 同一条目在列表与网格间变形，所有读布局集中在切换前后两次。 */
export function createArchiveViewMotion(host: HTMLElement, rows: HTMLElement[]) {
  const win = host.ownerDocument.defaultView!;
  const media = win.matchMedia('(prefers-reduced-motion: reduce)');
  const items = rows.map(row => ({
    row, title: row.querySelector<HTMLElement>('.title'), cover: row.querySelector<HTMLElement>('.archive-art'),
  }));
  const animations = new Set<Animation>();
  const timing: KeyframeAnimationOptions = { duration: 480, easing: 'cubic-bezier(.2,.72,.25,1)' };
  const cancel = () => {
    for (const animation of animations) animation.cancel();
    animations.clear();
  };
  const animate = (el: HTMLElement, frames: Keyframe[]) => {
    const animation = el.animate(frames, timing);
    animations.add(animation);
    animation.onfinish = () => animations.delete(animation);
  };
  const onScreen = (rect?: DOMRect) => rect && rect.height > 0 && rect.bottom > -100 && rect.top < win.innerHeight + 100;
  const read = () => items.filter(({ row }) => !row.hidden).map(item => ({ ...item, box: item.row.getBoundingClientRect() }));
  media.addEventListener('change', cancel);
  win.addEventListener('resize', cancel, { passive: true });
  return {
    run(update: () => void) {
      if (media.matches || !host.animate) { cancel(); update(); return; }
      const before = read();
      const startTitles = new Map(before.filter(item => item.title && onScreen(item.box))
        .map(({ row, box, title }) => {
          const style = win.getComputedStyle(title!);
          const scale = style.transform === 'none' ? 1 : new DOMMatrixReadOnly(style.transform).a;
          return [row, { box: title!.getBoundingClientRect(), size: parseFloat(style.fontSize) * scale * box.width / Math.max(1, row.offsetWidth) }];
        }));
      const previous = new Map(before.map(({ row, box }) => [row, box]));
      cancel();
      update();
      const after = read().filter(item => onScreen(item.box) || onScreen(previous.get(item.row)));
      const entries = after.map(item => ({
        ...item, titleBox: item.title?.getBoundingClientRect(),
        fontSize: item.title && parseFloat(win.getComputedStyle(item.title).fontSize),
        artVisible: item.cover && host.dataset.view === 'card',
      }));
      for (const { row, box, title, titleBox, fontSize, cover, artVisible } of entries) {
        const old = previous.get(row);
        if (!old || !old.width || !box.width || !box.height || !old.height) continue;
        const limit = win.innerHeight * .8;
        const x = old.left - box.left;
        const y = Math.max(-limit, Math.min(limit, old.top - box.top));
        const sx = old.width / box.width, sy = old.height / box.height;
        animate(row, [{
          transform: `translate(${x}px,${y}px) scale(${sx},${sy})`, transformOrigin: '0 0',
        }, { transform: 'translate(0,0) scale(1,1)', transformOrigin: '0 0' }]);
        const firstTitle = startTitles.get(row);
        if (title && titleBox && firstTitle && fontSize && titleBox.height > 0) {
          // 标题位置与字号各自插值，每个关键帧抵消文章外框的宽高缩放。
          const relX = titleBox.left - box.left, relY = titleBox.top - box.top;
          const size = firstTitle.size / fontSize;
          animate(title, [1, .8, .6, .4, .2, 0].map(rest => {
            const scaleX = 1 + (sx - 1) * rest, scaleY = 1 + (sy - 1) * rest;
            const tx = (relX + (firstTitle.box.left - titleBox.left - x) * rest) / scaleX - relX;
            const ty = (relY + (firstTitle.box.top - titleBox.top - y) * rest) / scaleY - relY;
            const scale = 1 + (size - 1) * rest;
            return { transform: `translate(${tx}px,${ty}px) scale(${scale / scaleX},${scale / scaleY})`, transformOrigin: '0 0' };
          }));
        }
        if (cover && artVisible) animate(cover, [{ opacity: 0 }, { opacity: 1 }]);
      }
    },
    cancel,
    dispose() {
      cancel();
      media.removeEventListener('change', cancel);
      win.removeEventListener('resize', cancel);
    },
  };
}

export function createArchiveMotion(host: HTMLElement, engine: () => MotionEngine | null = getMotion) {
  const rows = [...host.querySelectorAll<HTMLElement>('.yeargroup, .index li')];
  const original = new Map(rows.map(el => [el, el.getAttribute('style')]));
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current: ReturnType<MotionEngine['Flip']['from']> | null = null;
  let lastEngine: MotionEngine | null = null;
  let version = 0;
  const restore = () => rows.forEach(el => {
    const style = original.get(el);
    if (style === null) el.removeAttribute('style'); else el.setAttribute('style', style!);
  });
  const clearHidden = () => rows.forEach(el => el.removeAttribute('aria-hidden'));
  const finish = () => {
    ++version; current?.kill(); current = null;
    const motion = lastEngine;
    motion?.Flip.killFlipsOf(rows, false); motion?.gsap.killTweensOf(rows);
    restore();
    clearHidden();
  };
  window.addEventListener('resize', finish, {passive:true});
  media.addEventListener('change', finish);
  return {
    run(update: () => void) {
      const motion = media.matches ? null : engine();
      if (!motion) { finish(); update(); return; }
      lastEngine = motion;
      const token = ++version;
      current?.kill();
      motion.Flip.killFlipsOf(rows, false); motion.gsap.killTweensOf(rows);
      const state = motion.Flip.getState(rows, { props: 'opacity' });
      restore();
      clearHidden();
      update();
      rows.forEach(el => { if (el.hidden) el.setAttribute('aria-hidden', 'true'); });
      current = motion.Flip.from(state, {
        duration: .28, ease: 'power2.inOut',
        nested: true,
        absoluteOnLeave: true,
        onEnter: elements => motion.gsap.fromTo(elements, {opacity:0}, {opacity:1,duration:.18,stagger:.015}),
        onLeave: elements => motion.gsap.to(elements, {opacity:0,duration:.12}),
        onComplete: () => {
          if (token !== version) return;
          current = null;
          restore();
          clearHidden();
        },
      });
    },
    finish,
    dispose() { finish(); window.removeEventListener('resize',finish); media.removeEventListener('change',finish); },
  };
}
