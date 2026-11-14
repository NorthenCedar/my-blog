export function mountArchiveDateFilters(form: HTMLFormElement): () => void {
  const doc = form.ownerDocument;
  const win = doc.defaultView!;
  const events = new AbortController();
  const listen = { signal: events.signal };
  let closeCurrent: (() => void) | undefined;

  const resets = [...form.querySelectorAll<HTMLElement>('[data-date-filter]')].map(field => {
    const label = field.querySelector('label')!;
    const select = field.querySelector('select')!;
    const trigger = field.querySelector('button')!;
    const control = trigger.parentElement!;
    const value = trigger.querySelector('[data-date-value]')!;
    const drawer = field.querySelector<HTMLElement>('[role="listbox"]')!;
    const options = [...drawer.querySelectorAll<HTMLElement>('[role="option"]')];
    let active = -1;

    const sync = () => {
      value.textContent = select.selectedOptions[0]?.text ?? '全部';
      for (const option of options) {
        option.setAttribute('aria-selected', String(option.dataset.value === select.value));
      }
    };
    const mark = (index: number) => {
      options[active]?.removeAttribute('data-active');
      active = Math.min(Math.max(index, 0), options.length - 1);
      const option = options[active];
      option.setAttribute('data-active', '');
      trigger.setAttribute('aria-activedescendant', option.id);
      const top = option.offsetTop;
      const bottom = top + option.offsetHeight;
      if (top < drawer.scrollTop) drawer.scrollTop = top;
      if (bottom > drawer.scrollTop + drawer.clientHeight) drawer.scrollTop = bottom - drawer.clientHeight;
    };
    const close = () => {
      if (closeCurrent !== close) return;
      closeCurrent = undefined;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
      drawer.inert = true;
      options[active]?.removeAttribute('data-active');
      active = -1;
    };
    const position = () => {
      const bounds = trigger.getBoundingClientRect();
      const below = win.innerHeight - bounds.bottom;
      const above = bounds.top;
      const up = below < Math.min(drawer.scrollHeight + 16, 240) && below < above;
      control.dataset.side = up ? 'above' : 'below';
      control.style.setProperty('--date-room', Math.max(0, (up ? above : below) - 16) + 'px');
    };
    const open = () => {
      closeCurrent?.();
      closeCurrent = close;
      position();
      trigger.setAttribute('aria-expanded', 'true');
      drawer.inert = false;
      mark(select.selectedIndex);
    };
    const choose = (option: HTMLElement) => {
      const next = option.dataset.value!;
      close();
      if (select.value === next) return;
      select.value = next;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    trigger.addEventListener('click', () => closeCurrent === close ? close() : open(), listen);
    trigger.addEventListener('blur', close, listen);
    trigger.addEventListener('keydown', event => {
      const opened = closeCurrent === close;
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          if (opened) mark(active + (event.key === 'ArrowDown' ? 1 : -1));
          else open();
          break;
        case 'Home':
        case 'End':
          if (!opened) return;
          mark(event.key === 'Home' ? 0 : options.length - 1);
          break;
        case 'Enter':
        case ' ':
          if (!opened) return;
          choose(options[active]);
          break;
        case 'Escape':
          if (!opened) return;
          event.stopPropagation();
          close();
          break;
        default:
          return;
      }
      event.preventDefault();
    }, listen);
    // 保持焦点在触发按钮上，同时允许触屏滚动菜单。
    drawer.addEventListener('mousedown', event => {
      if ((event.target as Element).closest('[role="option"]')) event.preventDefault();
    }, listen);
    drawer.addEventListener('click', event => {
      const option = (event.target as Element).closest<HTMLElement>('[role="option"]');
      if (option && closeCurrent === close) choose(option);
    }, listen);
    doc.addEventListener('pointerdown', event => {
      if (!field.contains(event.target as Node)) close();
    }, listen);
    win.addEventListener('resize', () => {
      if (closeCurrent === close) position();
    }, listen);
    select.addEventListener('change', sync, listen);
    form.querySelector('[data-clear]')?.addEventListener('click', () => { close(); sync(); }, listen);

    label.htmlFor = trigger.id;
    select.hidden = true;
    trigger.hidden = false;
    sync();
    return () => {
      close();
      label.htmlFor = select.id;
      trigger.hidden = true;
      select.hidden = false;
    };
  });

  return () => {
    events.abort();
    resets.forEach(reset => reset());
  };
}
