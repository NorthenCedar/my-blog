/* =============================================================================
 * 灯箱换图 —— 先用**已经在手里的那把"小尺"**立刻显形，再把大档换上。
 *
 * ── 为什么要这东西（2026-10-08 站主：「给一个点大图快速加载的方案，现在太慢了」）
 *   线上实测（`curl -w`，同一台机器、同一张图连测两次）：
 *     · 1280 档最大那张 475 KB ⇒ **TTFB 1.1–1.3 s、下载 4.1–6.1 s**；
 *     · 同一张照片的 800 档（均值 63 KB）**早就加载过**了 ——
 *       它在网格 / 螺旋里躺着（`loading="lazy"` 但那些片在视口里）⇒ 就在缓存里。
 *   ⇒ 打开灯箱时**先用它**：这一帧就有图，读者不会盯着黑底等 4 秒；
 *     大档在后台解码，好了再无声换上。800 → 1280 只差 1.6 倍，换上时几乎看不出来。
 *
 * ── 刻意不做的事
 *   · 不预取"用户可能点的下一张"：那会把 9.3 MB 的 1280 档拖进首屏。
 *     这一台的主张是"点开才取"（有门闩守着：打开灯箱之前不许产生大档请求）。
 *   · 不加第二个 `<img>`（双图层淡入淡出）：省掉一次布局，也让 DOM 保持单张。
 *     代价是换图那一刻有极短的重绘 —— `decode()` 已经把"图可绘制"等到位了。
 *
 * ── 与谁共用
 *   两套灯箱都走这里：砖墙 `PhotoWall.astro`（`/gallery/<册>/`）与
 *   螺旋盘 `SpiralPlate.astro`（`/gallery/spiral/`、`/gallery/`）。
 *   抽成一个模块，是为了"以后只改一处"—— 两边各抄一份必然腐化。
 * -------------------------------------------------------------------------- */

/** 取范围内那张缩略图**已经解码完成**时的地址；没就绪则给 `null`。
 *
 *  这就是"它是否在缓存里"的判据 —— `complete && naturalWidth > 0` 说明这张图
 *  已经**可绘制**了（浏览器自己解过一遍、且有解码缓存），拿它当占位是零成本的。
 *  ⚠ 不能用"URL 里有没有 -800"这种字符串猜法：图可能刚被请求、还没回来。 */
export function thumbOf(scope: ParentNode): string | null {
  const t = scope.querySelector('img');
  if (!t) return null;
  return t.complete && t.naturalWidth > 0 ? t.currentSrc || t.src : null;
}

/**
 * 把大档换到 `img` 上；给了 `small`（且它与大档不同）就先用它顶上。
 *
 * @param img   灯箱那一只 `<img>`
 * @param big   大档地址（`a[href]`，服务端就写好）
 * @param small 缩略图地址（`thumbOf` 的结果）；未就绪传 `null` ⇒ 直接上大档
 */
export function showBig(img: HTMLImageElement, big: string, small?: string | null): void {
  /* 同一张不重设：翻页绕回来时不该再闪一下。
     ⚠ 判据要连 `src` 一起看 —— 关灯箱时会把它摘掉（"不留空 src"那条规定），
       只比 dataset 的话，再打开同一张就什么都不显示了。 */
  if (img.dataset.big === big && img.getAttribute('src')) return;
  img.dataset.big = big;
  const el = img as HTMLImageElement & { fetchPriority?: string };
  el.fetchPriority = 'high';   // 灯箱里这一张就是当前页面的主角
  /* 打开这一刻容器才可见 ⇒ 把它从 lazy 放行。
     ★ 为什么不在 HTML 里就去掉 `loading="lazy"`：那样页面加载时
       （容器 display:none 但属性是 eager）会**立刻**去拉 475 KB 大档 ——
       正好是我们要避免的那次请求。时机应该落在"真的打开"这一刻。 */
  img.loading = 'eager';
  const useSmall = typeof small === 'string' && small !== big;
  img.src = useSmall ? (small as string) : big;
  if (!useSmall) return;
  /* 大档在后台解码，好了再换。
     ★ 用 `decode()` 而不是 `onload`：decode 完成时这张图**已经可绘制**，
       再赋给 src 不会出现"白一下又出来"（onload 只保证字节到齐）。 */
  const pre = new Image();
  pre.decoding = 'async';
  (pre as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'high';
  pre.src = big;
  const apply = () => {
    /* ★ 竞态：翻页快的时候，上一张的 decode 会比下一张晚回来。
       对一下"现在要的还是不是它"，不是就不许覆盖。 */
    if (img.dataset.big === big) img.src = big;
  };
  if (typeof pre.decode === 'function') pre.decode().then(apply, () => {});
  else pre.onload = apply;   // 老引擎：退回到 onload（解码缓存通常还在）
}
