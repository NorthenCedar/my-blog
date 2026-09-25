/**
 * 主导航的唯一事实来源。
 *
 * 为什么抽出来：本站有**两套外壳**，配色不同但链接必须一致 ——
 *   · `chrome='band'`   → Brandline（深色带上，用 --on-band* 配色）
 *   · `chrome='page'`   → Topbar（内页浅色顶栏，用 --ink / --muted 配色）
 * 两处各写一份清单迟早漂移（加了新页面只改一处），所以清单只此一份。
 *
 * 注意：`key` 同时是 `Base` 的 `current` 取值来源，加页面时两处一起生效。
 */
export type NavKey = 'index' | 'gallery' | 'tags' | 'archive' | 'about';

/**
 * 2026-09-26 追加「相册」（站主定案的入口第二步）。
 * 这一步动的是**全站共享**：13 个深色带页面的 Brandline 与 /gallery 自己的 Topbar
 * 都会多一项 ⇒ **14 页产物全变**（首页是 console 外壳、没有导航，故不受影响）。
 * 所以它单独做、单独冻基线、单独双侧 L2，不与别的改动并做。
 * 位置放在「文章」之后 —— 与首页 S2 文章 / S3 相册的区段顺序一致。
 */
export const NAV_LINKS: { href: string; label: string; key: NavKey }[] = [
  { href: '/', label: '文章', key: 'index' },
  { href: '/gallery/', label: '相册', key: 'gallery' },
  { href: '/tags/', label: '标签', key: 'tags' },
  { href: '/archive/', label: '归档', key: 'archive' },
  { href: '/about/', label: '关于', key: 'about' },
];
