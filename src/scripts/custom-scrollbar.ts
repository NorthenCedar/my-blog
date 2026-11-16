import { onPage } from './page-lifecycle';

/**
 * 站上可滚动的小面板（文章目录、抽屉导航、回复提醒、音乐列表、日志变更）原来露的是
 * **原生滚动条**：Chrome 固定画系统箭头，拖它时页面收不到 pointermove，跟手圆盘就僵在原地。
 * 站主 2026-11-16：「让系统光标不要出现，用本站的圆形光标拖动」。
 *
 * 做法：容器加 `data-scrollbar`，原生条由 base.css 藏掉，这里补一颗自家的细滑块（样式同见 base.css）。
 */
onPage(({ document, addEventListener }) => {
  const wired = new WeakSet<HTMLElement>();
  const all: { box: HTMLElement; thumb: HTMLElement }[] = [];

  const place = (box: HTMLElement, thumb: HTMLElement) => {
    const max = box.scrollHeight - box.clientHeight;
    const height = box.clientHeight;
    const rect = box.getBoundingClientRect();
    const style = getComputedStyle(box);
    if (max < 2 || height < 32 || !rect.width || style.visibility === 'hidden' || rect.bottom < 0) {
      thumb.hidden = true;
      return 0;
    }
    const size = Math.max(26, (height * height) / box.scrollHeight);
    thumb.hidden = false;
    thumb.style.top = `${rect.top + (box.scrollTop / max) * (height - size)}px`;
    thumb.style.height = `${size}px`;
    thumb.style.right = `${Math.max(2, document.documentElement.clientWidth - rect.right + 3)}px`;
    return max;
  };

  const wire = (box: HTMLElement) => {
    wired.add(box);
    const thumb = document.createElement('span');
    thumb.className = 'scrollthumb';
    thumb.hidden = true;
    // 弹窗里的面板要挂在弹窗上，否则滑块进不了顶层、会被弹窗背景盖住。
    (box.closest('dialog') ?? document.body).append(thumb);
    box.addEventListener('scroll', () => place(box, thumb), { passive: true });
    thumb.addEventListener('pointerdown', event => {
      const max = place(box, thumb);
      if (!max) return;
      const from = event.clientY;
      const start = box.scrollTop;
      const travel = box.clientHeight - thumb.offsetHeight;
      thumb.setPointerCapture(event.pointerId);
      thumb.addEventListener('pointermove', move);
      function move(pointer: PointerEvent) {
        if (travel > 0) box.scrollTop = start + ((pointer.clientY - from) / travel) * max;
      }
    });
    all.push({ box, thumb });
  };

  const sync = () => {
    for (const box of document.querySelectorAll<HTMLElement>('[data-scrollbar]')) if (!wired.has(box)) wire(box);
    for (const { box, thumb } of all) place(box, thumb);
  };

  sync();
  addEventListener('scroll', sync, { passive: true });
  addEventListener('resize', sync, { passive: true });
  // 抽屉菜单由 React 渲染进弹窗、通知与音乐面板也是点开才出现 ⇒ 新来的容器也要接上。
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
  // 开关面板只改 class/visibility，不插节点 ⇒ 点上一下就重新摆一次。
  addEventListener('click', () => setTimeout(sync, 90), true);
});