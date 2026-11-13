/**
 * 主题预览（拖动软条时的中间态）—— 亮暗两端 token 之间的**连续**插值。
 *
 * 契约：
 *   · 两端的取值 = 当前页面上 token 的**生效值**（不含预览自己的覆盖）；
 *   · 中间态只写 inline style，松手/取消即全部还原；
 *   · 保存主题、改 `html.dark`、派发 `themechange` 都不在这里做（那是 theme.ts 的事）。
 *
 * ★★ 2026-11-13 重写（站主：「把其他页的亮暗过渡做一下，特别是底纹，颜色变化要丝滑均匀，
 *   不要突变」）。老实现有三个导致「拖动中不动、松手才跳」的洞，这里是逐条堵法：
 *
 *   ① **只读 documentElement**。`html.dark body.chrome-console { --paper: #100d0b }`
 *      这类**写在 body 上**的暗色覆盖，`getComputedStyle(documentElement)` 根本读不到
 *      ⇒ 首页的纸色/墨色压根不在比对面里，拖动时整页停在亮色，松手才黑掉。
 *      ⇒ 现在 root 与 body 都采样，并且**按变量实际生效的层写回**：body 上声明过的变量
 *        必须写 body 的 inline（写 root 会被 body 那条规则压掉，等于没写）。
 *        判定用「同一档下 root 值与 body 值不同」——它就是"body 层有声明"的可观测证据。
 *
 *   ② **只认颜色**。`--water-strength: 0.17 → 0.20`、`--ring-plate-opacity: .12 → .18`
 *      这类数值参数被整个跳过 ⇒ 水波/机械环的浓度在松手那一下跳。数值可以直接线性插值，
 *      每帧算出具体数字写回去（**不能写成 calc()**：消费方有一半是 parseFloat）。
 *
 *   ③ **只写颜色，不给"非颜色"东西留过渡通道**。滤镜、蒙版浓度这类没法用 color-mix，
 *      但可以让样式自己按权重算。所以每次更新都额外写一个全局权重 `--theme-w`
 *      （0 = 亮、1 = 暗），CSS 里 `calc()` 就能把 opacity / filter 参数跟着拖动连续变。
 *
 *   颜色本身仍走 `color-mix(... var(--theme-preview-weight))`：表达式只在首帧写一次，
 *   之后每帧只改那个百分比变量 —— 132 个色值逐帧 setProperty 的代价没必要付。
 *
 * 给 canvas 装饰层（星链、水波、点阵…）的出口是 `previewColor()` / `previewProgress()`：
 * 它们读不到 color-mix 的计算结果（canvas 的 fillStyle 不吃这个），所以这里用**纯 hex**
 * 算一份中间色给它们。没有预览时返回 undefined，调用方退回自己读 CSS 变量。
 */
export type ThemeColors = Record<string, string>;
export type ThemeColorPair = { light: ThemeColors; dark: ThemeColors };
export type ThemePreviewFrame = {
  progress: number;
  colors: ThemeColorPair;
  /**
   * 当前进度下的**中间色**（纯 hex，只含纯色 token）。
   *
   * 给 canvas 装饰层用的：它们的 fillStyle 不认 color-mix，而预览写在 root inline 上的
   * 恰恰就是 color-mix 字符串。把这些算在**懒加载的主题开关 chunk**里（本文件随
   * theme-toggle 一起懒加载），首屏脚本只需读 `detail.mixed['--accent']`，
   * 不必 import 本模块 —— 页面 JS 预算那两条门闩就是被"顺手 import 一下"顶爆的。
   * ⚠ 同一个对象每帧复用（不新建），监听者要拷值不要留引用。
   */
  mixed: Record<string, string>;
};

/** 纯色 token：3/4/6/8 位 hex（4 位与 8 位带 alpha，混合时 alpha 也要跟着插值） */
const HEX = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;
/** 纯数值 token（透明度、强度、倍率…）。排除 `12px` 这类带单位的，单位不同不能直接插。 */
const NUM = /^-?(?:\d+\.?\d*|\.\d+)$/;

const clamp = (p: number) => Math.max(0, Math.min(1, p));

/** 归一化到 rgba 四通道（r/g/b/a 统一按 **0–255** 刻度，alpha 不是 0–1）。 */
function rgba(hex: string): [number, number, number, number] {
  const raw = hex.slice(1);
  const full = raw.length === 3 || raw.length === 4
    ? [...raw].map((c) => c + c).join('')
    : raw;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), full.length === 8 ? n(6) : 255];
}

/** 给着色器用的 0–1 三通道（theme-toggle 的 groundTint / jellyColor 吃这个）。 */
export function colorChannels(hex: string): [number, number, number] {
  const [r, g, b] = rgba(hex);
  return [r / 255, g / 255, b / 255];
}

/**
 * 两端纯色按进度混合，返回 hex。**是否带 alpha 跟着输入走**：
 * 两端都不透明 ⇒ 6 位（与旧实现逐字节一致），任一端带 alpha ⇒ 8 位。
 * ⚠ 混的是 sRGB 通道，与 CSS `color-mix(in srgb, …)` 同一条公式 —— 两套要能对上，
 *   否则（比如 canvas 层用这里的 hex、DOM 层用 color-mix）同一个变量会显出两种颜色。
 * ⚠ alpha 必须和 r/g/b 一样按 0–255 插：按 0–1 插会把它 round 成 `00`/`01`，
 *   中间态几乎全透明（2026-11-13 被 theme-preview 的单测咬住）。
 */
export function mixThemeColor(a: string, b: string, progress: number): string {
  const p = clamp(progress);
  const A = rgba(a), B = rgba(b);
  const out = A.map((v, i) => Math.round(v + (B[i] - v) * p));
  const alpha = A[3] !== 255 || B[3] !== 255;
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return '#' + hex(out[0]) + hex(out[1]) + hex(out[2]) + (alpha ? hex(out[3]) : '');
}

/* ---------------------------------------------------------------- 当前预览态 */

let current: { light: ThemeColors; dark: ThemeColors; progress: number } | null = null;
/** 中间色（hex）。没有预览、或该变量不是纯色 ⇒ undefined。 */
export function previewColor(name: string): string | undefined {
  if (!current) return undefined;
  const l = current.light[name], d = current.dark[name];
  if (!l || !d || !HEX.test(l) || !HEX.test(d)) return undefined;
  return mixThemeColor(l, d, current.progress);
}

/** 当前拖动进度（0–1）。没有预览 ⇒ null —— 调用方据此回落到 `html.dark` 的终态。 */
export function previewProgress(): number | null {
  return current ? current.progress : null;
}

/* ---------------------------------------------------------------- 预览控制器 */

export function createThemePreview() {
  const root = document.documentElement;
  /* 有的页面把暗色 token 写在 body 上（`html.dark body.chrome-console`）。
     ⚠ body 可能取不到（测试环境的最小 document mock）⇒ 退回 root，行为退化成旧版。 */
  const body = (document.body ?? root) as HTMLElement;
  const savedDark = root.classList.contains('dark');

  const read = (el: HTMLElement): ThemeColors => {
    const styles = getComputedStyle(el), colors: ThemeColors = {};
    for (const name of Array.from(styles)) {
      const value = styles.getPropertyValue(name).trim();
      /* 枚举本身就只给自定义属性，但保留前缀判断：某些浏览器会把标准属性也塞进来。 */
      if (name.startsWith('--')) colors[name] = value;
    }
    return colors;
  };

  let colors: ThemeColorPair;
  /** 只在 body 上有声明的变量（写 root 的 inline 会被 body 那条规则压掉）。 */
  const onBody = new Set<string>();
  try {
    root.classList.remove('dark');
    const lightRoot = read(root), lightBody = read(body);
    root.classList.add('dark');
    const darkRoot = read(root), darkBody = read(body);
    /* 以 body 的生效值作为"这一档的颜色"：它已经包含 root 的继承值。 */
    colors = { light: lightBody, dark: darkBody };
    for (const name of Object.keys(lightBody)) {
      if (darkBody[name] === undefined) continue;
      if (lightBody[name] !== lightRoot[name] || darkBody[name] !== darkRoot[name]) onBody.add(name);
    }
  } finally {
    root.classList.toggle('dark', savedDark);
  }

  /** 两档都有、值不同、且可插值的变量（颜色 / 数值两类）。 */
  const colorNames: string[] = [];
  const numberNames: string[] = [];
  for (const name of Object.keys(colors.light)) {
    const l = colors.light[name], d = colors.dark[name];
    if (d === undefined || l === d) continue;
    if (HEX.test(l) && HEX.test(d)) colorNames.push(name);
    else if (NUM.test(l) && NUM.test(d)) numberNames.push(name);
    /* 其余（渐变 / 阴影 / filter / color-mix 表达式）不在这里处理：
       它们要么在 tokens 里被拆成色标，要么由 `--theme-w` 在样式里自己算。 */
  }

  const previous = new Map<string, { el: HTMLElement; name: string; value: string; priority: string }>();
  const write = (el: HTMLElement, name: string, value: string): void => {
    const id = (el === root ? 'r:' : 'b:') + name;
    if (!previous.has(id)) {
      previous.set(id, { el, name, value: el.style.getPropertyValue(name), priority: el.style.getPropertyPriority(name) });
    }
    el.style.setProperty(name, value);
  };
  let active = false;
  const mixedCache: Record<string, string> = {};

  return {
    colors,
    update(progress: number) {
      const p = clamp(progress);
      current = { light: colors.light, dark: colors.dark, progress: p };
      if (!active) {
        active = true;
        /* 拖动期间给整页一个标记：带 transition 的属性（首页百褶 ∞ 的 900ms 淡入淡出）
           会在中间态被它压成瞬时，否则浓度会比软条慢一大截、看着"不跟手"。
           松手 clear 时摘掉，落定那一下仍由原来的过渡收尾。 */
        root.classList.add('theme-previewing');
        for (const name of colorNames) {
          write(
            onBody.has(name) ? body : root,
            name,
            `color-mix(in srgb, ${colors.light[name]}, ${colors.dark[name]} var(--theme-preview-weight))`,
          );
        }
      }
      write(root, '--theme-preview-weight', `${Math.round(p * 10000) / 100}%`);
      /* 非颜色通道：透明度、滤镜强度这类由样式拿这个权重自己算（见 tokens.css）。 */
      write(root, '--theme-w', String(Math.round(p * 1000) / 1000));
      for (const name of numberNames) {
        const l = Number(colors.light[name]), d = Number(colors.dark[name]);
        write(onBody.has(name) ? body : root, name, String(Math.round((l + (d - l) * p) * 10000) / 10000));
      }
      /* 中间色：同一个对象逐帧改写（不新建），给 canvas 层消费 —— 见 ThemePreviewFrame 的注释。 */
      for (const name of colorNames) mixedCache[name] = mixThemeColor(colors.light[name], colors.dark[name], p);
      document.dispatchEvent(
        new CustomEvent<ThemePreviewFrame>('themepreview', { detail: { progress: p, colors, mixed: mixedCache } }),
      );
    },
    clear() {
      current = null;
      if (!active) return;
      root.classList.remove('theme-previewing');
      for (const { el, name, value, priority } of previous.values()) {
        if (value) el.style.setProperty(name, value, priority);
        else el.style.removeProperty(name);
      }
      previous.clear();
      active = false;
      document.dispatchEvent(new CustomEvent('themepreview', { detail: null }));
    },
  };
}
