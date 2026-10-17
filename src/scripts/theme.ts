/**
 * 主题状态（亮 / 暗）—— Jelly Slider 主题切换按钮与将来深色样式的契约。
 *
 * 契约（两边都要遵守，改一处必须同步另一处）：
 *   · 状态只落在两处：`document.documentElement` 的 `dark` 类 + localStorage 的 `theme` 键。
 *   · 首帧防闪：Base.astro <head> 里的内联脚本在绘制前按同一规则补类（见该文件注释）。
 *   · 切换时派发 `themechange`（detail: 'dark' | 'light'），同页多个开关互相跟随。
 */
export type Theme = 'dark' | 'light';

const KEY = 'theme';

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* 隐私模式等取不到存储 —— 落到系统偏好 */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* 存不下也不影响本次切换 */
  }
  document.dispatchEvent(new CustomEvent<Theme>('themechange', { detail: theme }));
}
