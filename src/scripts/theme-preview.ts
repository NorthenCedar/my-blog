export type ThemeColors = Record<string, string>;
export type ThemeColorPair = { light: ThemeColors; dark: ThemeColors };
export type ThemePreviewFrame = { progress: number; colors: ThemeColorPair };

const clamp = (p: number) => Math.max(0, Math.min(1, p));
export function colorChannels(hex: string): [number, number, number] {
  const raw = hex.slice(1);
  const h = raw.length === 3 ? [...raw].map(c => c + c).join('') : raw;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
export function mixThemeColor(a: string, b: string, progress: number): string {
  const p = clamp(progress), start = colorChannels(a), end = colorChannels(b);
  return '#' + start.map((v, i) => Math.round((v + (end[i] - v) * p) * 255).toString(16).padStart(2, '0')).join('');
}

/** 两端都从现有 CSS token 读取；同步取样后恢复原主题，不提交或保存中间态。 */
export function createThemePreview() {
  const root = document.documentElement;
  const savedDark = root.classList.contains('dark');
  const read = (): ThemeColors => {
    const styles = getComputedStyle(root), colors: ThemeColors = {};
    for (const name of Array.from(styles)) {
      const value = styles.getPropertyValue(name).trim();
      if (name.startsWith('--') && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) colors[name] = value;
    }
    return colors;
  };
  let colors: ThemeColorPair;
  try {
    root.classList.remove('dark'); const light = read();
    root.classList.add('dark'); const dark = read();
    colors = { light, dark };
  } finally { root.classList.toggle('dark', savedDark); }
  const names = Object.keys(colors.light).filter(n => colors.dark[n] && colors.light[n] !== colors.dark[n]);
  const previous = new Map<string, [string, string]>();
  let active = false;
  const write = (name: string, value: string) => {
    if (!previous.has(name)) previous.set(name, [root.style.getPropertyValue(name), root.style.getPropertyPriority(name)]);
    root.style.setProperty(name, value);
  };
  return {
    colors,
    update(progress: number) {
      const p = clamp(progress);
      if (!active) {
        active = true;
        for (const name of names) write(name,
          `color-mix(in srgb, ${colors.light[name]}, ${colors.dark[name]} var(--theme-preview-weight))`);
      }
      write('--theme-preview-weight', `${Math.round(p * 10000) / 100}%`);
      document.dispatchEvent(new CustomEvent<ThemePreviewFrame>('themepreview', { detail: { progress: p, colors } }));
    },
    clear() {
      if (!active) return;
      for (const [name, [value, priority]] of previous) {
        if (value) root.style.setProperty(name, value, priority);
        else root.style.removeProperty(name);
      }
      previous.clear(); active = false;
      document.dispatchEvent(new CustomEvent('themepreview', { detail: null }));
    },
  };
}
