document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (history.state?.albumReturn !== true || history.length < 2) return;
  if (!(event.target instanceof Element) || !event.target.closest('[data-album-return]')) return;
  event.preventDefault();
  history.back();
}, true);
