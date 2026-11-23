import { node } from './visitor-client';

export type IdentityDropdown = {
  sync(): void;
  close(): void;
  dispose(): void;
};

let modeSeq = 0;

/** 为发表身份选择器挂载与归档筛选项一致的自定义抽屉下拉控件。 */
export function mountIdentityDropdown(control: HTMLElement, select: HTMLSelectElement): IdentityDropdown {
  const uid = `vm-${++modeSeq}`;
  select.hidden = true;
  const trigger = node('button', 'visitor-mode-trigger');
  trigger.type = 'button';
  trigger.id = `${uid}-btn`;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-label', '发表身份');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${uid}-list`);
  const triggerText = node('span', '', '匿名发表');
  trigger.append(triggerText);

  const drawer = node('div', 'visitor-mode-drawer');
  drawer.style.setProperty('--mode-last-delay', '82ms');
  const listbox = node('div', 'visitor-mode-options');
  listbox.id = `${uid}-list`;
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', '发表身份');
  listbox.inert = true;

  const options = ([['anonymous', '匿名发表', '82ms'], ['account', '以账户发表', '0ms']] as const).map(([val, label, delay]) => {
    const opt = node('div', 'visitor-mode-option', label);
    opt.id = `${uid}-${val}`;
    opt.setAttribute('role', 'option');
    opt.dataset.value = val;
    opt.setAttribute('aria-selected', String(val === 'anonymous'));
    opt.style.setProperty('--mode-delay', delay);
    listbox.append(opt);
    return opt;
  });

  drawer.append(listbox);
  control.append(trigger, drawer);

  let opened = false;
  let activeIndex = -1;

  const sync = () => {
    triggerText.textContent = select.selectedOptions[0]?.text ?? '匿名发表';
    for (const opt of options) opt.setAttribute('aria-selected', String(opt.dataset.value === select.value));
  };

  const markMode = (index: number) => {
    options[activeIndex]?.removeAttribute('data-active');
    activeIndex = Math.min(Math.max(index, 0), options.length - 1);
    const opt = options[activeIndex];
    opt.setAttribute('data-active', '');
    trigger.setAttribute('aria-activedescendant', opt.id);
  };

  const positionMode = () => {
    const bounds = trigger.getBoundingClientRect();
    const below = window.innerHeight - bounds.bottom;
    const above = bounds.top;
    control.dataset.side = below < Math.min(listbox.scrollHeight + 16, 160) && below < above ? 'above' : 'below';
  };

  const close = () => {
    if (!opened) return;
    opened = false;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    listbox.inert = true;
    options[activeIndex]?.removeAttribute('data-active');
    activeIndex = -1;
  };

  const openMode = () => {
    if (opened) return;
    opened = true;
    positionMode();
    trigger.setAttribute('aria-expanded', 'true');
    listbox.inert = false;
    markMode(Math.max(0, select.selectedIndex));
  };

  const chooseMode = (opt: HTMLElement) => {
    const next = opt.dataset.value!;
    close();
    if (select.value === next) return;
    select.value = next;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const events = new AbortController();
  const listen = { signal: events.signal };

  trigger.addEventListener('click', () => (opened ? close() : openMode()), listen);
  trigger.addEventListener('blur', close, listen);
  trigger.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (opened) markMode(activeIndex + (e.key === 'ArrowDown' ? 1 : -1));
        else openMode();
        break;
      case 'Home':
      case 'End':
        if (!opened) return;
        markMode(e.key === 'Home' ? 0 : options.length - 1);
        break;
      case 'Enter':
      case ' ':
        if (!opened) return;
        chooseMode(options[activeIndex]);
        break;
      case 'Escape':
        if (!opened) return;
        e.stopPropagation();
        close();
        break;
      default:
        return;
    }
    e.preventDefault();
  }, listen);

  listbox.addEventListener('mousedown', (e) => {
    if ((e.target as Element).closest('[role="option"]')) e.preventDefault();
  }, listen);
  listbox.addEventListener('click', (e) => {
    const opt = (e.target as Element).closest<HTMLElement>('[role="option"]');
    if (opt && opened) chooseMode(opt);
  }, listen);
  document.addEventListener('pointerdown', (e) => {
    if (!control.contains(e.target as Node)) close();
  }, listen);
  window.addEventListener('resize', () => {
    if (opened) positionMode();
  }, listen);

  sync();

  return {
    sync,
    close,
    dispose() {
      close();
      events.abort();
      trigger.remove();
      drawer.remove();
      select.hidden = false;
    },
  };
}
