import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import DotGrid from '../vendor/react-bits/DotGrid';

/* 把一个 CSS 颜色值折成 DotGrid 能吃的 #hex。
   ★ 2026-11-13 二次修复（上一轮的「别名解引用」前提就是错的）：
   实测（_probe/_diag-basecolor.mjs）现代 Chrome 的 getComputedStyle **会把
   自定义属性的 var() 链解析到底** —— `--dot-grid-base: var(--about-dot-base)`
   读出来直接是 `#d9e4da`；而拖动预览时，预览模块写进 `--about-dot-base` 的
   color-mix 也顺着链条传下来，读出来是
   `color-mix(in srgb, #d9e4da, #2b201b 50%)`。
   DotGrid 的 toRgb 只吃 3/6 位 hex，吃不了的兜底成**纯白** —— 这就是
   「拖动时点阵不变色（其实变成了白点）」的真根因。
   所以这里三级取值：① 声明的 token 名查预览 mixed 表（最准）；
   ② 纯 hex 直接用；③ color-mix 字符串自己解析插值（跨浏览器序列化都兜住）。 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}
const rgbToHex = (rgb: number[]): string =>
  '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function fromColorMix(raw: string): string | null {
  /* 覆盖 Chrome 两种序列化：`color-mix(in srgb, A, B P%)` 与
     `color-mix(in srgb, A Pa%, B Pb%)`（以及百分比缺省 = 另一半）。 */
  const m = /^color-mix\(in srgb,\s*(#[0-9a-f]{3,6})(?:\s+([\d.]+)%)?,\s*(#[0-9a-f]{3,6})(?:\s+([\d.]+)%)?\s*\)$/i.exec(raw.trim());
  if (!m) return null;
  const pa = m[2] !== undefined ? Number(m[2]) : m[4] !== undefined ? 100 - Number(m[4]) : 50;
  const A = hexToRgb(m[1]), B = hexToRgb(m[3]);
  return rgbToHex(A.map((a, i) => a + (B[i] - a) * (1 - pa / 100)));
}

/* ★ 导出给 tests/page-dots-color.test.ts 做行为级门闩：
   拖动预览时这类字符串若漏解析，DotGrid 的 toRgb 会兜底成纯白 —— 页面看着就是
   「点阵不跟着亮暗渐变」。纯源码断言守不住这层，必须真喂字符串看输出。 */
export function resolveColor(raw: string, token: string | undefined, tint: Record<string, string> | null): string {
  const value = raw.trim();
  if (token && tint?.[token]) return tint[token];
  if (HEX.test(value)) return value;
  return fromColorMix(value) ?? value;
}

export function mountPageDots(field: HTMLElement) {
  const root = createRoot(field);
  /* 拖动主题软条时的中间色：由 `themepreview` 事件带过来（懒加载的主题开关 chunk
     算好的纯 hex）。**不 import 预览模块** —— 那会把整块逻辑拉进首屏包，
     体积预算的门闩第一个红。 */
  let tint: Record<string, string> | null = null;
  const baseToken = field.dataset.dotBase;

  function render() {
    const theme = getComputedStyle(field);
    // React Bits 首页 Hero 的 DotGrid 参数，颜色取本站主题。
    root.render(createElement(DotGrid, {
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      dotSize: 2.6,
      gap: Number.parseFloat(theme.getPropertyValue('--dot-grid-gap')) || 22,
      baseColor: resolveColor(theme.getPropertyValue('--dot-grid-base'), baseToken, tint),
      activeColor: resolveColor(theme.getPropertyValue('--accent'), '--accent', tint),
      proximity: 360,
      strength: 1.15,
      bounce: 0.7,
      tension: 0.35,
      swell: 1.4,
      stretch: 0.5,
      glow: 0.15,
      opacity: 0.55,
      shockRadius: 380,
      shockStrength: 4,
      intro: false,
    }));
  }

  render();
  document.addEventListener('themechange', render);
  /* 拖动预览期间合并颜色更新，点阵的动画帧仍按自身节奏渲染。 */
  let previewTimer = 0;
  const onPreview = (event: Event) => {
    tint = (event as CustomEvent<{ mixed?: Record<string, string> } | null>).detail?.mixed ?? null;
    if (previewTimer) return;
    previewTimer = window.setTimeout(() => { previewTimer = 0; render(); }, 80);
  };
  document.addEventListener('themepreview', onPreview);
  return () => {
    document.removeEventListener('themechange', render);
    document.removeEventListener('themepreview', onPreview);
    if (previewTimer) window.clearTimeout(previewTimer);
    root.unmount();
  };
}
