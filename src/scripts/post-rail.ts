import { createAnchorMotion, isPlainAnchorClick, verticalOffset } from './anchor-motion';

/** 阅读侧栏的增强：章节跳转留在文章的同一条历史里。 */
export function initPostRail(doc: Document, onActive?: (link: HTMLAnchorElement, changed: boolean, snap?: boolean) => void): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};
  const pairs = [...doc.querySelectorAll<HTMLAnchorElement>('.post-rail .toc a')]
    .map(link => ({ link, heading: doc.getElementById(link.getAttribute('href')!.slice(1)) }))
    .filter((pair): pair is { link: HTMLAnchorElement; heading: HTMLElement } => !!pair.heading);
  type Section = typeof pairs[number];
  const prose = doc.querySelector<HTMLElement>('.prose');
  const reading = [doc.querySelector<HTMLElement>('.post-body > .pagehead'), prose]
    .filter((area): area is HTMLElement => !!area);
  const rail = doc.querySelector<HTMLElement>('.post-rail');
  const ship = doc.querySelector<HTMLElement>('.st-ship');
  const vessel = ship?.querySelector('.st-vessel');
  const portal = ship?.querySelector('.st-portal');
  const wake = ship?.querySelector('.st-wake');
  const motion = createAnchorMotion(doc, prose);
  const { reduce, cancel } = motion;
  const events = new AbortController();
  const options = { signal: events.signal };
  const passive = { ...options, passive: true };
  let frame = 0;
  let current = -1;
  let live = true;
  let geometry: { box: DOMRect; tops: (number | null)[] } | null | undefined;
  const mark = (next: number, snap = false) => {
    const changed = next !== current;
    if (changed) {
      pairs[current]?.link.removeAttribute('aria-current');
      pairs[next].link.setAttribute('aria-current', 'location');
      current = next;
    }
    onActive?.(pairs[next].link, changed, snap);
  };
  const update = () => {
    frame = 0;
    if (!live || !pairs.length || motion.active) return;
    const viewportTop = win.visualViewport?.offsetTop ?? 0;
    const threshold = viewportTop + (win.visualViewport?.height ?? win.innerHeight) * 0.2;
    if (geometry === undefined && (!prose || !rail || win.getComputedStyle(rail).position !== 'sticky')) geometry = null;
    const box = geometry === null ? null : prose!.getBoundingClientRect();
    // 标题记相对正文的位置；页头重排或滚动时，正文的当前顶边直接带动整组位置。
    if (box && (!geometry || box.width !== geometry.box.width || box.height !== geometry.box.height)) {
      const tops = pairs.map(({ heading }) => {
        const rect = heading.getBoundingClientRect();
        return rect.width || rect.height ? rect.top - box.top : null;
      });
      geometry = { box, tops };
    }
    const topOf = (index: number) => {
      const offset = geometry?.tops[index];
      return box && offset != null ? box.top + offset : pairs[index].heading.getBoundingClientRect().top;
    };
    let next = 0;
    for (let i = 0; i < pairs.length; i++) {
      if (topOf(i) <= threshold) next = i;
      else if (geometry === null && i > Math.max(current, 0)) break;
    }

    // 跳到紧邻小标题的章节时，船先停在链接指向的标题。
    const hash = win.location?.hash;
    if (hash && next > 0) {
      const index = pairs.findIndex(({ link }) => link.hash === hash);
      if (index >= 0 && index < next) {
        const heading = pairs[index].heading;
        const top = topOf(index) - viewportTop;
        const inset = parseFloat(win.getComputedStyle(heading).scrollMarginTop) || 0;
        if (top >= inset - 2) next = index;
      }
    }
    mark(next);
  };
  const schedule = () => { if (live && !frame && pairs.length) frame = win.requestAnimationFrame(update); };
  const invalidate = () => { geometry = undefined; schedule(); };
  const interrupt = () => {
    if (!motion.active) return;
    cancel();
    schedule();
  };
  const jump = ({ link, heading }: Section, behavior: ScrollBehavior) => {
    // 保留路由的历史状态；返回键直接回到进入本文前的页面。
    if (win.location.hash !== link.hash) win.history.replaceState(win.history.state, '', link.href);
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'start', behavior });
    if (behavior === 'instant') mark(pairs.findIndex(pair => pair.link === link), true);
    schedule();
  };
  const prepareShip = (direction: number) => {
    const snapshot = (element: Element) => {
      const { opacity, translate, scale } = win.getComputedStyle(element);
      return { opacity, translate, scale };
    };
    const vesselFrom = vessel && snapshot(vessel);
    const portalFrom = portal && snapshot(portal);
    const wakeOpacity = wake && win.getComputedStyle(wake).opacity;
    const atDock = { opacity: 0, scale: .24 };
    const open = { opacity: .78, scale: 1 };
    return (entering: boolean, timing: KeyframeAnimationOptions) => {
      const animations: Animation[] = [];
      if (!ship || ship.hidden) return animations;
      const dock = verticalOffset(11 * direction * (entering ? 1 : -1));
      const doorway = { ...open, translate: dock };
      const smallShip = { ...atDock, translate: dock };

      if (portal && portalFrom) animations.push(portal.animate(entering
        ? [doorway, { ...doorway, offset: .32 }, { opacity: 0, scale: .58, translate: dock }]
        : [portalFrom, { ...doorway, offset: .32 }, doorway], timing));
      if (vessel && vesselFrom) animations.push(vessel.animate(entering
        ? [smallShip, { opacity: 1, scale: 1, translate: verticalOffset(0) }]
        : [vesselFrom, { ...vesselFrom, offset: .18 }, smallShip], timing));
      if (wake) animations.push(wake.animate(entering
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: wakeOpacity }, { opacity: 0 }], timing));
      return animations;
    };
  };
  const jumpToHeading = (event: MouseEvent) => {
    if (!isPlainAnchorClick(event)) return;
    const pair = pairs.find(({ link }) => link === event.currentTarget);
    if (!pair) return;
    event.preventDefault();
    // 手机目录在正文流内，离开时一起淡出。桌面的粘性目录留在原位。
    const areas = rail && win.getComputedStyle(rail).position !== 'sticky' ? [...reading, rail] : reading;
    motion.jump(pair.heading, areas, behavior => jump(pair, behavior), prepareShip);
  };
  pairs.forEach(({ link }) => link.addEventListener('click', jumpToHeading, options));
  win.addEventListener('scroll', schedule, passive);
  win.addEventListener('resize', invalidate, passive);
  win.addEventListener('hashchange', () => { interrupt(); schedule(); }, options);
  win.visualViewport?.addEventListener('scroll', schedule, passive);
  win.visualViewport?.addEventListener('resize', invalidate, passive);
  win.addEventListener('wheel', interrupt, passive);
  win.addEventListener('touchmove', interrupt, passive);
  win.addEventListener('popstate', interrupt, options);
  reduce.addEventListener('change', () => { if (reduce.matches) interrupt(); }, options);
  win.addEventListener('pointerdown', event => {
    if (motion.active && (event.target as Element | null)?.closest?.('[data-rail], .inner-scroll-rail')) interrupt();
  }, passive);
  win.addEventListener('keydown', event => {
    if (motion.active && !event.defaultPrevented && /^(?:Escape|ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(event.key)) interrupt();
  }, options);
  const observer = prose && win.ResizeObserver ? new win.ResizeObserver(invalidate) : null;
  const edits = prose && win.MutationObserver ? new win.MutationObserver(invalidate) : null;
  if (prose) {
    observer?.observe(prose);
    edits?.observe(prose, { subtree: true, childList: true, characterData: true, attributeFilter: ['hidden', 'open'] });
  }
  doc.fonts?.ready.then(invalidate);
  doc.fonts?.addEventListener('loadingdone', invalidate, options);
  schedule();

  const button = doc.querySelector<HTMLButtonElement>('[data-copy-link]');
  const status = doc.querySelector<HTMLElement>('[data-copy-status]');
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  let timer = 0;
  const copy = async () => {
    if (!button || button.disabled || !canonical) return;
    button.disabled = true;
    win.clearTimeout(timer);
    try {
      await win.navigator.clipboard.writeText(canonical);
      if (!live) return;
      button.textContent = '已复制';
      if (status) status.textContent = '文章链接已复制';
      timer = win.setTimeout(() => { button.textContent = '复制链接'; if (status) status.textContent = ''; }, 1600);
    } catch {
      if (live && status) status.textContent = '未能复制，请复制浏览器地址栏中的地址。';
    } finally {
      if (live) button.disabled = false;
    }
  };
  if (button && canonical && win.navigator.clipboard?.writeText) {
    button.hidden = false;
    button.addEventListener('click', copy, options);
  }
  return () => {
    live = false;
    events.abort();
    cancel();
    win.cancelAnimationFrame(frame);
    win.clearTimeout(timer);
    observer?.disconnect();
    edits?.disconnect();
  };
}
