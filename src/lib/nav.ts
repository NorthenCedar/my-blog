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
export type NavKey = 'index' | 'tags' | 'archive' | 'about';

export const NAV_LINKS: { href: string; label: string; key: NavKey }[] = [
  { href: '/', label: '文章', key: 'index' },
  { href: '/tags/', label: '标签', key: 'tags' },
  { href: '/archive/', label: '归档', key: 'archive' },
  { href: '/about/', label: '关于', key: 'about' },
];
