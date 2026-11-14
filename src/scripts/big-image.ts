/** 已经预取过（大档）的地址 —— 免得同一张被重复发起。 */
const warmed = new Set<string>();

/**
 * 后台把一张大档取回来，让"下一次翻到它"是即时的。
 *
 * ⚠ 默认 **`low`**：预取是背景活，不许跟**当前要看的那张**抢带宽。
 *   （给成 `high` 会出现"下一张先到、当前这张还在等"的倒挂。）
 */
export function prefetch(url: string | null | undefined): void {
  if (!url || warmed.has(url)) return;
  warmed.add(url);
  const im = new Image();
  im.decoding = 'async';
  (im as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
  im.src = url;
}

/**
 * ★ 悬停**停够久**才预取（解决"点开第一张卡一下"那一下）。
 *
 * 为什么要有 `dwell` 而不是一 `pointerenter` 就取：指针**扫过**砖墙会一路
 * 触发 `pointerenter`（一次横扫能划过七八张）⇒ 没有延迟就是"扫一遍全册预取"，
 * 那正是这一页一直守着不做的事。250 ms 是"手停下了"与"手在移动"的实际分界。
 * 键盘 `focus` 直接取 —— Tab 过去本身就是明确意图。
 *
 * @param el    缩略图上的链接
 * @param url   那张大档的地址（取的时候才问，省得建一堆元素）
 * @param dwell 悬停多少毫秒才取
 */
export function intentPrefetch(
  el: HTMLElement,
  url: () => string | null | undefined,
  dwell = 250,
  signal?: AbortSignal,
): void {
  let timer: number | undefined;
  const stop = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
  el.addEventListener('pointerenter', () => {
    stop();
    timer = window.setTimeout(() => prefetch(url()), dwell);
  }, {signal});
  el.addEventListener('pointerleave', stop, {signal});
  /* 指针已经落下去了 ⇒ 悬停计时器没有意义，取消掉别抢带宽。 */
  el.addEventListener('pointerdown', stop, {signal});
  el.addEventListener('focus', () => prefetch(url()), {signal});
  signal?.addEventListener('abort', stop, {once:true});
}


const activeLoads = new WeakMap<HTMLImageElement, AbortController>();

export function cancelBig(img: HTMLImageElement): void {
  activeLoads.get(img)?.abort();
  activeLoads.delete(img);
}

function loadDrawable(url: string, signal: AbortSignal, priority: 'high' | 'auto'): Promise<boolean> {
  const source = new Image();
  source.fetchPriority = priority;
  source.decoding = 'async';
  return new Promise(resolve => {
    const finish = (loaded: boolean) => {
      signal.removeEventListener('abort', cancel);
      source.onload = source.onerror = null;
      resolve(loaded);
    };
    const cancel = () => {
      finish(false);
      source.removeAttribute('src');
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (typeof source.decode === 'function') {
      source.src = url;
      source.decode().then(() => finish(true), () => finish(false));
    } else {
      source.onload = () => finish(true);
      source.onerror = () => finish(false);
      source.src = url;
    }
  });
}

/** 先显示可绘制的那一档，高清解码完成后在原位置替换。图注只随首张可绘制的图更新。 */
export function showBig(
  img: HTMLImageElement,
  big: string,
  onReady?: (() => void) | null,
  thumb?: HTMLImageElement | null,
  onError?: () => void,
): void {
  cancelBig(img);
  const current = img.getAttribute('src');
  if (img.dataset.big === big && current === big) {
    onReady?.();
    return;
  }

  const request = new AbortController();
  activeLoads.set(img, request);
  const { signal } = request;
  const preview = thumb?.currentSrc || thumb?.getAttribute('src');
  let shown = img.dataset.big === big && Boolean(current);
  if (shown) onReady?.();
  img.loading = 'eager';

  const present = (url: string) => {
    if (signal.aborted) return;
    if (!shown && thumb?.dataset.fullWidth && thumb.dataset.fullHeight) {
      img.style.setProperty('--lb-image-width', `${thumb.dataset.fullWidth}px`);
      img.style.setProperty('--lb-image-ratio', `${Number(thumb.dataset.fullWidth) / Number(thumb.dataset.fullHeight)}`);
    }
    img.src = url;
    img.dataset.big = big;
    if (!shown) {
      shown = true;
      onReady?.();
    }
  };

  const detailReady = loadDrawable(big, signal, 'high').then(loaded => {
    if (!signal.aborted && loaded) {
      present(big);
      request.abort(); // 取消尚未完成的预览，以免高清图被覆盖。
    }
  });
  let previewReady: Promise<void> | undefined;
  if (!shown && preview && preview !== big) {
    if (thumb?.complete && thumb.naturalWidth && thumb.currentSrc === preview) present(preview);
    else previewReady = loadDrawable(preview, signal, 'auto').then(loaded => {
      if (loaded) present(preview);
    });
  }
  void Promise.all([detailReady, previewReady]).then(() => {
    if (activeLoads.get(img) !== request) return;
    activeLoads.delete(img);
    if (!shown) onError?.();
  });
}
