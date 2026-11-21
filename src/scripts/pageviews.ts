/** 整页直接访问由服务端计数，成功的软导航和页面恢复在这里计数。 */
function recordVisit() {
  if (window.top !== window || !document.head.querySelector('link[rel="canonical"]')) return;
  void fetch('/api/pageview', { method: 'POST', keepalive: true, priority: 'low' })
    .catch(() => {});
}

document.addEventListener('astro:after-swap', recordVisit);
window.addEventListener('pageshow', event => { if (event.persisted) recordVisit(); });
if ('prerendering' in document && document.prerendering) {
  document.addEventListener('prerenderingchange', recordVisit, { once: true });
} else {
  // 原生导航可以直接消费预取的文档，跳过中间件。也处理模块在预渲染激活之后才就绪的情况。
  const navigation = performance.getEntriesByType('navigation')[0] as
    (PerformanceNavigationTiming & { activationStart?: number }) | undefined;
  if (navigation?.deliveryType === 'navigational-prefetch' || (navigation?.activationStart ?? 0) > 0) recordVisit();
}
