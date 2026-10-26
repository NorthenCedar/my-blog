/** 首页版本详情：桌面原位展开，手机及无脚本保留日志链接。 */
export function initHomeLog(root: HTMLElement): () => void {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const desktop = win.matchMedia('(min-width: 768px)');
  const reduce = win.matchMedia('(prefers-reduced-motion: reduce)');
  const triggers = [...root.querySelectorAll<HTMLAnchorElement>('[data-log-trigger]')];
  const entries = [...root.querySelectorAll<HTMLElement>('[data-log-entry]')];
  const panel = root.querySelector<HTMLElement>('[data-log-panel]');
  const close = root.querySelector<HTMLButtonElement>('[data-log-close]');
  if (!panel || !close || triggers.length !== entries.length) return () => {};

  let selected = -1;
  let generation = 0;
  let motions: Animation[] = [];

  const stop = () => {
    generation++;
    motions.forEach(motion => motion.cancel());
    motions = [];
  };
  const mark = () => triggers.forEach((trigger, i) => {
    if (desktop.matches) {
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('aria-controls', panel.id);
      trigger.setAttribute('aria-expanded', String(i === selected));
    } else {
      ['role', 'aria-controls', 'aria-expanded'].forEach(name => trigger.removeAttribute(name));
    }
  });

  const change = (next: number, immediate = false) => {
    // 先读动画中的真实高度，快速连续切换也从当前画面接续。
    const from = panel.hidden ? 0 : panel.getBoundingClientRect().height;
    stop();
    const turn = generation;
    selected = next;
    mark();
    panel.inert = next < 0;
    if (next >= 0) {
      panel.hidden = false;
      entries.forEach((entry, i) => { entry.hidden = i !== next; });
    }
    const settle = () => {
      if (turn !== generation) return;
      if (selected < 0) {
        panel.hidden = true;
        entries.forEach(entry => { entry.hidden = true; });
      }
      motions = [];
    };
    if (immediate || reduce.matches || typeof panel.animate !== 'function') {
      settle();
      return;
    }
    const tokens = win.getComputedStyle(root);
    const duration = Number.parseFloat(tokens.getPropertyValue('--dur-hover')) || 260;
    const easing = tokens.getPropertyValue('--ease-interact').trim() || 'ease-out';
    const to = next < 0 ? 0 : panel.getBoundingClientRect().height;
    const size = panel.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing });
    const content = (next < 0 ? panel : entries[next]).animate(
      next < 0 ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0.25, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration, easing },
    );
    motions = [size, content];
    // cancel 会拒绝 finished；旧动画无权收起后来选中的版本。
    void Promise.all(motions.map(motion => motion.finished)).then(settle, () => {});
  };
  const collapse = (restoreFocus = false, immediate = false) => {
    if (selected < 0) return;
    const trigger = triggers[selected];
    change(-1, immediate);
    if (restoreFocus) trigger.focus({ preventScroll: true });
  };

  const click = (event: MouseEvent) => {
    if (!desktop.matches || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as Node;
    const index = triggers.findIndex(trigger => trigger.contains(target));
    if (index >= 0) {
      event.preventDefault();
      change(selected === index ? -1 : index);
    } else if (close.contains(target)) {
      collapse(true);
    }
  };
  const outside = (event: MouseEvent) => {
    const target = event.target as Node;
    if (!panel.contains(target) && !triggers.some(trigger => trigger.contains(target))) collapse();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && selected >= 0) {
      event.preventDefault();
      collapse(true);
    } else if (desktop.matches && event.key === ' ' && triggers.some(trigger => trigger === event.target)) {
      event.preventDefault();
      (event.target as HTMLAnchorElement).click();
    }
  };
  const resize = () => {
    if (!desktop.matches) {
      const at = doc.activeElement;
      // CSS 可先隐藏焦点元素，把 activeElement 清回 body，早于媒体查询事件。
      const moveFocus = panel.contains(at) || triggers.slice(2).some(trigger => trigger.contains(at))
        || (selected >= 0 && at === doc.body);
      collapse(false, true);
      // 手机只保留前两张，不能把焦点还给已隐藏的第3/4张。
      if (moveFocus) triggers[0]?.focus({ preventScroll: true });
    }
    mark();
  };
  mark();
  root.addEventListener('click', click);
  doc.addEventListener('click', outside);
  doc.addEventListener('keydown', keydown);
  desktop.addEventListener('change', resize);
  return () => {
    change(-1, true);
    root.removeEventListener('click', click);
    doc.removeEventListener('click', outside);
    doc.removeEventListener('keydown', keydown);
    desktop.removeEventListener('change', resize);
    triggers.forEach(trigger => ['role', 'aria-controls', 'aria-expanded'].forEach(name => trigger.removeAttribute(name)));
  };
}
