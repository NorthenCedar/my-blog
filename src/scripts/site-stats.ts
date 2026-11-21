import { onPage } from './page-lifecycle';

onPage(({ document, IntersectionObserver, setInterval, clearInterval, keep }) => {
  const root = document.querySelector<HTMLElement>('[data-stats]')!;
  const start = new Date(root.dataset.since + 'T00:00:00+08:00').getTime();
  const uptime = root.querySelector('[data-uptime]')!;
  let near = !IntersectionObserver;
  let timer: number | undefined;
  let request: AbortController | undefined;

  function updateUptime() {
    const elapsed = Math.max(0, Date.now() - start);
    const [hours, minutes, seconds] = new Date(elapsed).toISOString().slice(11, 19).split(':');
    uptime.textContent = `${Math.floor(elapsed / 86_400_000)} 天 ${hours} 时 ${minutes} 分 ${seconds} 秒`;
  }

  function update() {
    if (!near || document.hidden) {
      clearInterval(timer);
      timer = undefined;
      return;
    }
    if (timer === undefined) {
      updateUptime();
      timer = setInterval(updateUptime, 1000);
    }
    if (request) return;
    request = new AbortController();
    const { signal } = request;
    keep(() => request?.abort());
    fetch('/api/stats', { priority: 'low', signal })
      .then(response => response.ok ? response.json() : null)
      .then(stats => {
        if (signal.aborted) return;
        const [pv, uv] = root.querySelectorAll('[data-pv],[data-uv]');
        if (typeof stats?.pv === 'number') pv.textContent = String(stats.pv);
        if (typeof stats?.uv === 'number') uv.textContent = String(stats.uv);
      })
      .catch(() => {});
  }

  document.addEventListener('visibilitychange', update);
  if (IntersectionObserver) {
    new IntersectionObserver(([entry]) => {
      near = entry.isIntersecting;
      update();
    }, { rootMargin: '160px' }).observe(root);
  }
  update();
}, '[data-stats]');
