/** 卡片共享形态：卡面独立缩放，文字保持字号；所有中断都从当前绘制状态续接。 */
export function initHomeLog(root: HTMLElement): () => void {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const desktop = win.matchMedia('(min-width: 768px)');
  const reduce = win.matchMedia('(prefers-reduced-motion: reduce)');
  const triggers = [...root.querySelectorAll<HTMLAnchorElement>('[data-log-trigger]')];
  const cards = triggers.map(trigger => trigger.closest<HTMLElement>('.card'));
  const versions = [...root.querySelectorAll<HTMLButtonElement>('[data-log-version]')];
  const entries = [...root.querySelectorAll<HTMLElement>('[data-log-entry]')];
  const panel = root.querySelector<HTMLDialogElement>('[data-log-panel]');
  const sheet = root.querySelector<HTMLElement>('[data-log-sheet]');
  const surface = root.querySelector<HTMLElement>('[data-log-surface]');
  const content = root.querySelector<HTMLElement>('[data-log-content]');
  const shade = root.querySelector<HTMLElement>('[data-log-shade]');
  const close = root.querySelector<HTMLButtonElement>('[data-log-close]');
  if (!panel || !sheet || !surface || !content || !shade || !close || cards.some(card => !card)
    || triggers.length !== entries.length || versions.length !== entries.length
    || typeof panel.showModal !== 'function' || typeof panel.close !== 'function') return () => {};

  let active = -1;
  let desired = -1;
  let last = 0;
  let turn = 0;
  let disposed = false;
  let previousOverflow: string | null = null;
  let pageScroll: { left: number; top: number } | null = null;
  let outsideDown = true;
  let motions: Animation[] = [];
  const tokens = win.getComputedStyle(root);
  const ms = (name: string, fallback: number) => {
    const value = tokens.getPropertyValue(name).trim();
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number * (value.endsWith('ms') ? 1 : 1000) : fallback;
  };
  const easing = tokens.getPropertyValue('--ease-glass').trim() || 'ease-out';
  const mark = () => {
    triggers.forEach((trigger, i) => {
      if (desktop.matches) {
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', panel.id);
        trigger.setAttribute('aria-expanded', String(desired === i));
      } else {
        ['role', 'aria-haspopup', 'aria-controls', 'aria-expanded'].forEach(name => trigger.removeAttribute(name));
      }
    });
    versions.forEach((version, i) => version.setAttribute('aria-pressed', String(active === i)));
  };
  const cancel = (freeze = true) => {
    if (freeze && motions.length && panel.open) {
      const face = win.getComputedStyle(surface);
      const text = win.getComputedStyle(content);
      const dim = win.getComputedStyle(shade);
      const snapshot = { transform: face.transform, borderRadius: face.borderRadius, text: text.opacity, shade: dim.opacity };
      motions.forEach(motion => motion.cancel());
      Object.assign(surface.style, { transform: snapshot.transform, borderRadius: snapshot.borderRadius });
      content.style.opacity = snapshot.text;
      shade.style.opacity = snapshot.shade;
    } else motions.forEach(motion => motion.cancel());
    motions = [];
  };
  const restore = () => cards.forEach(card => card!.removeAttribute('data-log-origin-hidden'));
  const finishClose = (focus = true) => {
    const restoreScroll = pageScroll;
    pageScroll = null;
    cancel(false);
    restore();
    active = desired = -1;
    entries.forEach(entry => { entry.hidden = true; });
    panel.removeAttribute('data-animating');
    panel.hidden = true;
    if (previousOverflow !== null) {
      doc.documentElement.style.overflowY = previousOverflow;
      previousOverflow = null;
    }
    if (panel.open) panel.close();
    sheet.style.marginTop = sheet.style.alignSelf = sheet.style.maxHeight = '';
    mark();
    if (focus && !disposed) (desktop.matches ? triggers[last] : triggers[0])?.focus({ preventScroll: true });
    if (restoreScroll) win.scrollTo({ ...restoreScroll, behavior: 'instant' });
  };
  const origin = (index: number) => {
    const from = cards[index]!.getBoundingClientRect();
    const to = sheet.getBoundingClientRect();
    const sx = Math.max(0.01, from.width / Math.max(1, to.width));
    const sy = Math.max(0.01, from.height / Math.max(1, to.height));
    return { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`, borderRadius: `${16 / sx}px / ${16 / sy}px` };
  };
  const prepare = (index: number) => {
    const changed = active !== index;
    restore();
    active = last = index;
    cards[index]!.setAttribute('data-log-origin-hidden', '');
    entries.forEach((entry, i) => { entry.hidden = i !== index; });
    if (changed) entries[index].querySelector('ul')?.scrollTo?.(0, 0);
    // 首次按内容居中，此后只改变底边，版本入口保持原位置，防止连续点击落到遮罩。
    if (!sheet.style.marginTop) {
      const top = sheet.getBoundingClientRect().top;
      sheet.style.alignSelf = 'start';
      sheet.style.marginTop = `${top}px`;
      sheet.style.maxHeight = `min(74dvh, calc(100dvh - ${top}px - 2rem))`;
    }
    Object.assign(surface.style, origin(index));
    content.style.opacity = '0';
    mark();
  };
  const animate = (element: HTMLElement, frames: Keyframe[], duration: number, delay = 0) => {
    Object.assign(element.style, frames[frames.length - 1]);
    const motion = element.animate(frames, { duration, delay, easing, fill: 'both' });
    motions.push(motion);
    return motion.finished.catch(() => {});
  };
  const settled = (version: number) => {
    if (version !== turn || disposed) return false;
    cancel(false);
    panel.removeAttribute('data-animating');
    return true;
  };
  const drive = async (version: number) => {
    panel.setAttribute('data-animating', '');
    if (active >= 0 && active !== desired) {
      const duration = ms(desired < 0 ? '--dur-card-collapse' : '--dur-card-switch', desired < 0 ? 280 : 180);
      await Promise.all([
        animate(surface, [{ transform: surface.style.transform, borderRadius: surface.style.borderRadius }, origin(active)], duration),
        animate(content, [{ opacity: content.style.opacity }, { opacity: '0' }], Math.min(110, duration)),
        animate(shade, [{ opacity: shade.style.opacity }, { opacity: desired < 0 ? '0' : '1' }], duration),
      ]);
      if (!settled(version)) return;
      cards[active]!.removeAttribute('data-log-origin-hidden');
      active = -1;
    }
    if (desired < 0) { finishClose(); return; }
    if (active < 0) prepare(desired);
    const duration = ms('--dur-card-expand', 420);
    panel.setAttribute('data-animating', '');
    await Promise.all([
      animate(surface, [{ transform: surface.style.transform, borderRadius: surface.style.borderRadius }, { transform: 'none', borderRadius: '16px' }], duration),
      animate(content, [{ opacity: content.style.opacity }, { opacity: '1' }], duration * 0.45, duration * 0.55),
      animate(shade, [{ opacity: shade.style.opacity }, { opacity: '1' }], duration * 0.65),
    ]);
    settled(version);
  };
  const request = (next: number, immediate = false, focus = true) => {
    if (disposed || next >= entries.length) return false;
    if (!immediate && panel.open && next === active && next === desired && motions.length === 0) return true;
    if (!panel.open && next < 0) return true;
    if (!panel.open) {
      const beforeScroll = { left: win.scrollX, top: win.scrollY };
      panel.hidden = false;
      shade.style.opacity = '0';
      content.style.opacity = '0';
      try { panel.showModal(); } catch { panel.hidden = true; return false; }
      if (previousOverflow === null) { previousOverflow = doc.documentElement.style.overflowY; pageScroll = beforeScroll; }
      doc.documentElement.style.overflowY = 'hidden';
    }
    ++turn;
    cancel();
    desired = next;
    mark();
    if (immediate || reduce.matches || typeof surface.animate !== 'function') {
      if (next < 0) finishClose(focus);
      else {
        prepare(next);
        Object.assign(surface.style, { transform: 'none', borderRadius: '16px' });
        content.style.opacity = shade.style.opacity = '1';
        panel.removeAttribute('data-animating');
      }
      return true;
    }
    if (active < 0 && next >= 0) prepare(next);
    void drive(turn);
    return true;
  };
  const click = (event: MouseEvent) => {
    if (!desktop.matches || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as Node;
    const index = triggers.findIndex(trigger => trigger.contains(target));
    const version = versions.findIndex(button => button.contains(target));
    if (index >= 0) { if (request(desired === index ? -1 : index)) event.preventDefault(); }
    else if (version >= 0) request(version);
    else if (close.contains(target)) request(-1);
  };
  const outside = (event: MouseEvent) => {
    const target = event.target as Node;
    if (panel.open && outsideDown && !sheet.contains(target) && !triggers.some(trigger => trigger.contains(target))) request(-1);
  };
  const pointerdown = (event: PointerEvent) => { outsideDown = !sheet.contains(event.target as Node); };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && panel.open) { event.preventDefault(); request(-1); }
    else if (desktop.matches && event.key === ' ' && triggers.includes(event.target as HTMLAnchorElement)) {
      event.preventDefault(); (event.target as HTMLAnchorElement).click();
    }
  };
  const nativeCancel = (event: Event) => { event.preventDefault(); request(-1); };
  const nativeClose = () => { if (!panel.open && previousOverflow !== null) { ++turn; finishClose(); } };
  const resize = () => {
    sheet.style.marginTop = sheet.style.alignSelf = sheet.style.maxHeight = '';
    if (panel.open) request(desktop.matches ? desired : -1, true);
    mark();
  };
  const reduced = () => { if (reduce.matches && panel.open) request(desired, true); };
  mark();
  root.addEventListener('click', click);
  doc.addEventListener('click', outside);
  doc.addEventListener('pointerdown', pointerdown);
  doc.addEventListener('keydown', keydown);
  panel.addEventListener('cancel', nativeCancel);
  panel.addEventListener('close', nativeClose);
  desktop.addEventListener('change', resize);
  reduce.addEventListener('change', reduced);
  win.addEventListener('resize', resize);
  return () => {
    disposed = true;
    ++turn;
    finishClose(false);
    root.removeEventListener('click', click);
    doc.removeEventListener('click', outside);
    doc.removeEventListener('pointerdown', pointerdown);
    doc.removeEventListener('keydown', keydown);
    panel.removeEventListener('cancel', nativeCancel);
    panel.removeEventListener('close', nativeClose);
    desktop.removeEventListener('change', resize);
    reduce.removeEventListener('change', reduced);
    win.removeEventListener('resize', resize);
    triggers.forEach(trigger => ['role', 'aria-haspopup', 'aria-controls', 'aria-expanded'].forEach(name => trigger.removeAttribute(name)));
  };
}
