/**
 * 改编自 LeiBox Collection Layout Morph（a342e484c14f932a82d42f3b948151c8251dd936）。
 * https://github.com/leishifu666/LeiBox/blob/a342e484c14f932a82d42f3b948151c8251dd936/src/lib/motion-core/collection-layout-morph.mjs
 * 设计参考 Previous Leon，https://x.com/shawn_kel/status/2087937950424129978/video/1
 * 许可见 LICENSE.md。保留两种布局的选择与键盘处理。
 */

const views = ['list', 'card'] as const;
type View = typeof views[number];

export function createCollectionLayoutMorph(
  controls: HTMLElement,
  board: HTMLElement,
  run: (update: () => void) => void,
) {
  const tabs = [...controls.querySelectorAll<HTMLButtonElement>('[data-view]')];
  const listeners = new AbortController();
  let view: View = 'list';

  board.setAttribute('role', 'tabpanel');
  board.setAttribute('aria-labelledby', tabs[0].id);
  board.tabIndex = 0;

  function select(next: View) {
    if (next === view) return;

    view = next;
    const index = views.indexOf(view);
    run(() => {
      board.dataset.view = controls.dataset.view = view;
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
      });
      board.setAttribute('aria-labelledby', tabs[index].id);
    });
  }

  const options = { signal: listeners.signal };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(views[index]), options);
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % views.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + views.length - 1) % views.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = views.length - 1;
      else return;
      event.preventDefault();
      select(views[next]);
      tabs[next].focus();
    }, options);
  });

  return () => listeners.abort();
}
