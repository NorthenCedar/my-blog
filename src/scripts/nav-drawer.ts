import { onPage } from './page-lifecycle';

onPage(({ document, keep, addEventListener }) => {
  const bar = document.querySelector('[data-scroll-topbar]');
  if (bar) {
    // React Bits 首页 Navbar.jsx 的滚动阈值 50px。
    // 为什么不用双阈值迟滞（2026-11-16 实测结论）：
    // 抽搐的根因不在阈值本身，而在「收条 → 整条变矮 → 文档高度变化 → 滚动锚定把
    // scrollY 往回带 → 又跌回阈值下」这条自激回路；它在 Topbar.astro 里用一段等量的
    // margin-block-end 占住高度、让流内高度恒定为 0 代价解决（滚轮实测 23–27 次 → 0 次）。
    // 阈值保持单值：文章页 JS 有硬预算（tests/build-output.test.ts），双阈值要多几十
    // 字节，而现在这个问题不再需要它。
    const scroll = () => bar.toggleAttribute('data-topbar-scrolled', scrollY > 50);
    addEventListener('scroll', scroll, { passive: true });
    scroll();
  }
  const fallback = document.querySelector<HTMLInputElement>('.navtog');
  const trigger = document.querySelector<HTMLButtonElement>('[data-nav-open]');
  const drawer = document.querySelector<HTMLDialogElement>('[data-staggered-menu]');
  if (!fallback || !trigger || typeof drawer?.showModal !== 'function') return;

  let mount: typeof import('./staggered-site-menu').mountSiteMenu | undefined;
  const preload = () => {
    void import('./staggered-site-menu').then(module => { mount = module.mountSiteMenu; }, () => {});
  };
  const open = () => {
    trigger.focus({ preventScroll: true });
    drawer.showModal();
    preload();
  };

  trigger.hidden = false;
  const events = new AbortController();
  const options = { signal: events.signal };
  trigger.addEventListener('pointerenter', preload, options);
  trigger.addEventListener('click', () => {
    if (drawer.open) return;
    // 冷启动由原生面板立即滑入，增强模块就绪后再使用它的分层动画。
    if (mount) {
      keep(mount(trigger, drawer));
      events.abort();
      return;
    }
    open();
  }, options);
  drawer.addEventListener('click', event => {
    if (event.target === drawer || (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
      && (event.target as Element).closest('.sm-panel-item'))) {
      drawer.close();
    }
  }, options);
  // 公共脚本迟到时接管已打开的无脚本菜单。
  if (fallback.checked) {
    fallback.checked = false;
    open();
  }
  keep(() => {
    events.abort();
    if (drawer.open) drawer.close();
  });
}, '[data-staggered-menu]');
