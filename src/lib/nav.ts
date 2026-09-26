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
export type NavKey =
  | 'index'
  | 'about'
  | 'archive'
  | 'links'
  | 'talks'
  | 'guestbook'
  | 'gallery'
  | 'log'
  | 'tags';

/**
 * 2026-09-26 追加「相册」（站主定案的入口第二步）—— 那次的教训在这里沿用：
 * 动这个数组就是动**全站共享**（13 个 band 页 + 各内页 Topbar）⇒ **产物全变**
 * ⇒ 单独做、单独冻基线、不与别的改动并做。
 *
 * 2026-09-26 追加导航四项（站主给的参考站 blog.ayeez.cn）：友链 / 说说 / 留言 / 日志。
 * 站上原有的「文章 / 相册 / 标签」保留（站主说"加这几项"，不是换掉），
 * 顺序按站主截图（首页 关于 归档 友链 说说 留言 相册 日志），原有的「标签」放在最后。
 * 两点说明：① 站主截图里的「首页」对应本站的「文章」（都指向 /），所以没有再加一项同地址的；
 * ② 参考站的 GitHub 与 管理端两项按站主要求**不加**。
 */
export const NAV_LINKS: { href: string; label: string; key: NavKey }[] = [
  { href: '/', label: '文章', key: 'index' },
  { href: '/about/', label: '关于', key: 'about' },
  { href: '/archive/', label: '归档', key: 'archive' },
  { href: '/links/', label: '友链', key: 'links' },
  { href: '/talks/', label: '说说', key: 'talks' },
  { href: '/guestbook/', label: '留言', key: 'guestbook' },
  { href: '/gallery/', label: '相册', key: 'gallery' },
  { href: '/log/', label: '日志', key: 'log' },
  { href: '/tags/', label: '标签', key: 'tags' },
];
