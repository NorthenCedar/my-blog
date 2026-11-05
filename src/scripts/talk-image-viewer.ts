
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

});
