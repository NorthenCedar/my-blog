/** 原生 modal 负责焦点循环、Esc、背景隔离及关闭后的焦点恢复。 */
const toggle = document.querySelector<HTMLInputElement>('.navtog');
const drawer = document.querySelector<HTMLDialogElement>('.navshell');
if (toggle && drawer) {
  const close = () => { drawer.close(); toggle.checked = false; };
  close();
  drawer.querySelector<HTMLButtonElement>('[data-nav-close]')!.hidden = false;
  toggle.onchange = () => toggle.checked ? drawer.showModal() : close();
  drawer.onclose = () => { toggle.checked = drawer.open; };
  drawer.onclick = (event) => {
    const control = (event.target as Element).closest('a,button,label');
    if (control) {
      if (control.tagName === 'LABEL') event.preventDefault();
      close();
    }
  };
  matchMedia('(min-width: 1024px)').onchange = (event) => { if (event.matches) close(); };
}
