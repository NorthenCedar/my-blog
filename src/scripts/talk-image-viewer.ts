
import { onPage } from './page-lifecycle';
onPage(({document, addEventListener}) => {
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
  if (!dialog) continue;
  const video = dialog.querySelector('video');
  link.addEventListener('click', (event) => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    link.focus();
    dialog.showModal();
    void video?.play().catch(() => {});
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { video?.pause(); });
}

});
