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
