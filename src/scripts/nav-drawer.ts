import { onPage } from './page-lifecycle';

onPage(({ document, keep, addEventListener }) => {
  const bar = document.querySelector('[data-scroll-topbar]');
  if (bar) {
    // React Bits 首页 Navbar.jsx 的滚动阈值 50px。
    // 为什么不做迟滞（试过 50/36 的双阈值又撤了，2026-11-16）：
    // ① 实测没有来回抽——滚到 45/52 是 0 次切换，滚到 60/120 各 1 次；
    // ② 收条时 padding 从 --topbar-pad-block 收到 --sp-1、整条矮约 14px，
    //    滚动锚定会把 scrollY 往回带几 px，但那是一次性补偿，不会反复触碰阈值；
    // ③ 文章页 JS 有硬预算（tests/build-output.test.ts），双阈值要多 40 字节左右，
    //    换来的是量不到的保护，不值。
    const scroll = () => bar.toggleAttribute('data-topbar-scrolled', scrollY > 50);
    addEventListener('scroll', scroll, { passive: true });
    scroll();
  }
  const fallback = document.querySelector<HTMLInputElement>('.navtog');
  const label = document.querySelector<HTMLLabelElement>('.navbtn');
  const trigger = document.querySelector<HTMLButtonElement>('[data-nav-open]');
  const drawer = document.querySelector<HTMLElement>('[data-staggered-menu]');
  if (!fallback || !label || !trigger || !drawer || !('showModal' in HTMLDialogElement.prototype)) return;

  let active = true;
  let opening = false;
  let loading: ReturnType<typeof load> | undefined;
  const load = () => import('./staggered-site-menu');
  const preload = () => {
    loading ??= load();
    void loading.catch(() => { loading = undefined; });
  };

  label.hidden = fallback.hidden = true;
  trigger.hidden = false;
  const events = new AbortController();
  const options = { signal: events.signal };
  for (const event of ['pointerenter', 'pointerdown', 'focus']) trigger.addEventListener(event, preload, options);
  trigger.addEventListener('click', async () => {
    if (opening) return;
    opening = true;
    try {
      const { mountSiteMenu } = await (loading ?? load());
      if (active) keep(mountSiteMenu(trigger, drawer));
    } catch (error) {
      if (!active) return;
      trigger.hidden = true;
      label.hidden = fallback.hidden = false;
      fallback.checked = true;
      fallback.focus({ preventScroll: true });
      console.error('菜单加载失败', error);
    }
  }, options);
  keep(() => { active = false; events.abort(); });
}, '[data-staggered-menu]');
