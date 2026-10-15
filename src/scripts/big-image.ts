/* =============================================================================
 * 灯箱换图 —— **打开就是那张大档本身**，且**文字与图同帧换**。
 *
 * ── 为什么要"直接上大档"（2026-10-15 站主：「把他换成和大图尺寸一样」）
 *   2026-10-08 那一版是"先拿已在缓存里的 800 档顶一下、再在后台换 1280"，
 *   理由是站主说过「点大图太慢了」。**这次是同一个诉求的另一半**：那段
 *   "放大发虚的时间"本身就是「太慢」的一种 ⇒ 整套占位撤回。
 *
 * ── 但撤掉占位立刻暴露了三个新问题（2026-10-15 站主目检报「卡一下」）
 *   量法：localhost 起 `dist/`，真点开连点 4 次「下一张」，同一 tick 里读
 *   `lbPos/lbCap` 与 `img.complete`。
 *     ① **文字与图必然错帧** —— 文字（`pos`/`cap`）是**同步**写的，
 *        `img.src` 要等网络+解码 ⇒ 读到 `pos=7` 时 `complete=false / naturalWidth=0`。
 *        这是**每一次**都发生，不是偶发。
 *     ② **没有预取** —— 每次翻页都要重新过一次网络（localhost 单张就 269 ms）。
 *     ③ **翻页不排队** —— 连点 5 次只发出 **2 个**大档请求（浏览器 abort 掉
 *        被跳过的那些）⇒ "翻过去顺手就缓存上了"这个好处**并不存在**，
 *        连点是纯亏（前面几次的请求全白发）。
 *   ⇒ 对策三条，各自对应一条：
 *     A. `showBig(..., onReady)`：**文字等图可绘制了再换** ⇒ 不再错帧。
 *     B. `prefetch()`：落在某一张之后，后台把**紧邻的下一张**取回来
 *        ⇒ 下一次翻页是即时的（预取用 `low` 优先级，不与当前这张抢带宽）。
 *     C. `intentPrefetch()`：**指向停 250 ms** 才取 ⇒ 解决"点开第一张卡一下"。
 *
 * ── 关于"点开才取"这条主张：它变了，但要守住的是**量级**，不是字面
 *   旧版守的是"打开灯箱之前不许产生任何大档请求"。
 *   现在是：**页面加载时不取**（HTML 里仍 `loading="lazy"`）、
 *          **指向一张并停 250 ms** 才取那一张、
 *          **打开之后**只多取紧邻的那一张。
 *   全册 82 帧一次性拖进来（9.3 MB）仍然不做 —— 那才是这条主张要防的事。
 *
 * ── 代价（量的是本站 82 帧真实产物）
 *   800 档  中位 53.2 KB / 均值 63.4 KB；1280 档 中位 92.1 KB / 均值 115.7 KB / 最大 475.1 KB。
 *   最重的 4 张（>300 KB）在慢网上打开时仍会等一下 —— 预取救不了**第一次**。
 *
 * ── 刻意不做的事
 *   · 不预取"翻两页之后"的图：只取紧邻的，多一张就散了。
 *   · 不做双图层淡入淡出：换图时旧图**留在屏上**直到新的可绘制（浏览器的原生行为），
 *     所以舞台不会开天窗；为此加第二个 `<img>` 反而多一次布局。
 *   · 不引 WebGL、不引依赖。
 *
 * ── 与谁共用
 *   两套灯箱都走这里：砖墙 `PhotoWall.astro`（`/gallery/<册>/`）与
 *   螺旋盘 `SpiralPlate.astro`（`/gallery/spiral/`、`/gallery/`）。
 *   抽成一个模块，是为了"以后只改一处"—— 两边各抄一份必然腐化。
 * -------------------------------------------------------------------------- */

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
): void {
  let timer: number | undefined;
  const stop = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
  el.addEventListener('pointerenter', () => {
    stop();
    timer = window.setTimeout(() => prefetch(url()), dwell);
  });
  el.addEventListener('pointerleave', stop);
  /* 指针已经落下去了 ⇒ 悬停计时器没有意义，取消掉别抢带宽。 */
  el.addEventListener('pointerdown', stop);
  el.addEventListener('focus', () => prefetch(url()));
}

/**
 * 把大档换到 `img` 上；**图真的可绘制了**再调 `onReady`。
 *
 * @param img     灯箱那一只 `<img>`
 * @param big     大档地址（`a[href]`，服务端就写好；1280 档）
 * @param onReady 图可绘制后的回调 —— **说明文字必须放这里**：
 *                同步写在调用之后会与图错帧（量出来的：文字到第 7 张时图还没来）
 */
export function showBig(
  img: HTMLImageElement,
  big: string,
  onReady?: (() => void) | null,
): void {
  /* 同一张不重设：翻页绕回来时不该再闪一下。
     ⚠ 判据要连 `src` 一起看 —— 关灯箱时会把它摘掉（"不留空 src"那条规定），
       只比 dataset 的话，再打开同一张就什么都不显示了。 */
  const changed = !(img.dataset.big === big && img.getAttribute('src'));
  if (changed) {
    img.dataset.big = big;
    const el = img as HTMLImageElement & { fetchPriority?: string };
    el.fetchPriority = 'high';   // 灯箱里这一张就是当前页面的主角
    /* 打开这一刻容器才可见 ⇒ 把它从 lazy 放行。
       ★ 为什么不在 HTML 里就去掉 `loading="lazy"`：那样页面加载时
         （容器 display:none 但属性是 eager）会**立刻**去拉大档 ——
         正是要避免的那次请求。时机应该落在"真的打开"这一刻。 */
    img.loading = 'eager';
    img.src = big;
  }
  if (!onReady) return;
  if (!changed) { onReady(); return; }
  /* 竞态：翻页快的时候，上一张的解码会比下一张晚回来。
     对一下"现在要的还是不是它"，不是就不许覆盖。 */
  const fire = () => { if (img.dataset.big === big) onReady(); };
  /* 用 `decode()` 而不是 `load`：decode 完成时这张图**已经可绘制**，
     文字跟着换才是"同帧"；`load` 只保证字节到齐，中间还差一次解码。 */
  if (typeof img.decode === 'function') img.decode().then(fire, fire);
  else img.addEventListener('load', fire, { once: true });
}