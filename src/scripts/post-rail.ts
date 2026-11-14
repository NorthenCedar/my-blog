/** 阅读侧栏的增强：章节跳转留在文章的同一条历史里。 */
export function initPostRail(doc: Document, onActive?: (link: HTMLAnchorElement, changed: boolean) => void): () => void {
  const win = doc.defaultView;
  if (!win) return () => {};
  const pairs = [...doc.querySelectorAll<HTMLAnchorElement>('.post-rail .toc a')]
    .map(link => ({ link, heading: doc.getElementById(link.getAttribute('href')!.slice(1)) }))
    .filter((pair): pair is { link: HTMLAnchorElement; heading: HTMLElement } => !!pair.heading);
  let frame = 0;
  let current = -1;
  let live = true;
  const update = () => {
    frame = 0;
    if (!live || !pairs.length) return;
    const viewportTop = win.visualViewport?.offsetTop ?? 0;
    const threshold = viewportTop + (win.visualViewport?.height ?? win.innerHeight) * 0.2;
    let next = 0;
    pairs.forEach(({ heading }, i) => { if (heading.getBoundingClientRect().top <= threshold) next = i; });

    // 跳到紧邻小标题的章节时，船先停在链接指向的标题。
    const hash = win.location?.hash;
    if (hash && next > 0) {
      const index = pairs.findIndex(({ link }) => link.hash === hash);
      if (index >= 0 && index < next) {
        const heading = pairs[index].heading;
        const top = heading.getBoundingClientRect().top - viewportTop;
        const inset = parseFloat(win.getComputedStyle(heading).scrollMarginTop) || 0;
        if (top >= inset - 2) next = index;
      }
    }
    const changed=next!==current;
    if(changed){
      current = next;
      pairs.forEach(({ link }, i) => {
        if (i === next) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    onActive?.(pairs[next].link,changed);
  };
  const schedule = () => { if (live && !frame && pairs.length) frame = win.requestAnimationFrame(update); };
  const jumpToHeading = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const pair = pairs.find(({ link }) => link === event.currentTarget);
    if (!pair) return;
    const { link, heading } = pair;
    event.preventDefault();
    // 保留路由的历史状态；返回键直接回到进入本文前的页面。
    if (win.location.hash !== link.hash) win.history.replaceState(win.history.state, '', link.href);
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'start' });
    schedule();
  };
  pairs.forEach(({ link }) => link.addEventListener('click', jumpToHeading));
  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', schedule, { passive: true });
  win.addEventListener('hashchange', schedule);
  win.visualViewport?.addEventListener('scroll', schedule, { passive: true });
  win.visualViewport?.addEventListener('resize', schedule, { passive: true });
  const prose = doc.querySelector('.prose');
  const observer = prose && win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  if (observer && prose) observer.observe(prose);
  doc.fonts?.ready.then(schedule);
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
    button.addEventListener('click', copy);
  }
  return () => {
    live = false;
    win.cancelAnimationFrame(frame);
    win.clearTimeout(timer);
    observer?.disconnect();
    pairs.forEach(({ link }) => link.removeEventListener('click', jumpToHeading));
    win.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('hashchange', schedule);
    win.visualViewport?.removeEventListener('scroll', schedule);
    win.visualViewport?.removeEventListener('resize', schedule);
    button?.removeEventListener('click', copy);
  };
}
