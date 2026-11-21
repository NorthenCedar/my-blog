
import { onPage } from './page-lifecycle';
onPage(({document}) => {
/** 图片与说明由构建期生成，关闭、Esc、焦点恢复交给原生弹窗。 */
for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-talk-image]')) {
  const dialog = document.getElementById(link.dataset.talkImage!) as HTMLDialogElement;
  link.addEventListener('click', (event) => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    link.focus();
    dialog.showModal();
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}

/** 视频同理：列表里只是封面方块，点开才在弹窗里载入并播放，关闭即暂停。 */
for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-talk-video]')) {
  const dialog = document.getElementById(link.dataset.talkVideo!) as HTMLDialogElement | null;
  const video = dialog?.querySelector('video');
  if (!dialog || !video) continue;
  link.addEventListener('click', (event) => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    link.focus();
    dialog.showModal();
    if (!video.hasAttribute('src')) video.src = link.href;
    void video.play().catch(() => {});
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { if (!dialog.open) video.pause(); });
}

});
