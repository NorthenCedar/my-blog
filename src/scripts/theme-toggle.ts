/**
 * Jelly Slider 主题切换 —— 原版 WebGPU 实现（Software Mansion / TypeGPU，MIT）。
 *
 * 原版代码原样放在 src/vendor/jelly-slider/（仅三处本站改动，各文件内有 ★ 标注）：
 *   · numbers.ts：百分比字体换自托管的 IBM Plex Mono（本站零第三方资源）；
 *   · events.ts：加 setInitial / snapTo（松手吸附）；
 *   · scene.ts：setupScene 返回 eventHandler。
 * 本文件只做三件事：初始化 WebGPU 场景、把"连续滑块"收成"两端吸附的开关"、
 * 无 WebGPU 时降级为普通开关（主题照样能切）。
 *
 * 行为：左端 = 亮色（0%），右端 = 暗色（100%），百分比显示原样保留。
 * 拖拽松手吸附到最近端落定后提交主题；点按切到另一端；键盘 ←/→/空格/回车可用。
 */
import { tgpu } from 'typegpu';
import { setupScene } from '../vendor/jelly-slider/scene.ts';
import { DARK_END, LIGHT_END } from '../vendor/jelly-slider/events.ts';
import { getTheme, setTheme, type Theme } from './theme.ts';

const MID = (LIGHT_END + DARK_END) / 2;
/** 画布 CSS 尺寸：原版取景框不改，只选让槽占满宽度的画幅（本地 SwiftShader 实测） */
const W = 176;
const H = 84;

const themeOfEnd = (end: number): Theme => (end === DARK_END ? 'dark' : 'light');

function syncAria(root: HTMLElement): void {
  root.setAttribute('aria-checked', String(getTheme() === 'dark'));
}

/** 无 WebGPU 时的降级：普通开关，主题照样切（样式极简，不伪装成果冻） */
function mountFallback(root: HTMLElement): void {
  root.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tt-fallback';
  btn.setAttribute('role', 'switch');
  const paint = (): void => {
    const dark = getTheme() === 'dark';
    btn.setAttribute('aria-checked', String(dark));
    btn.textContent = dark ? '暗' : '亮';
    btn.setAttribute('aria-label', '切换深色模式（当前' + (dark ? '深色' : '浅色') + '）');
  };
  btn.addEventListener('click', () => {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    paint();
  });
  document.addEventListener('themechange', paint);
  root.appendChild(btn);
  paint();
}

export async function initJellyThemeToggle(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector('canvas');
  if (!canvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!('gpu' in navigator)) {
    mountFallback(root);
    return;
  }
  let tgRoot;
  try {
    tgRoot = await tgpu.init();
  } catch {
    mountFallback(root);
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  const context = tgRoot.configureContext({ canvas });
  const scene = await setupScene(tgRoot, context);
  const events = scene.eventHandler;

  // 首帧即停在当前主题对应的端
  const startTheme = getTheme();
  events.setInitial(startTheme === 'dark' ? DARK_END : LIGHT_END);
  syncAria(root);

  const commit = (end: number): void => {
    const t = themeOfEnd(end);
    if (getTheme() !== t) setTheme(t);
    syncAria(root);
  };

  const snapToEnd = (end: number): void => {
    if (reduceMotion) {
      events.setInitial(end);
      commit(end);
      return;
    }
    events.snapTo(end, () => commit(end));
  };

  // 点按 vs 拖拽：原版 EventHandler 只认 mouse/touch，这里用 pointer 事件配对
  let downX = 0;
  let downT = 0;
  let downOnCanvas = false;
  canvas.addEventListener('pointerdown', (e) => {
    downOnCanvas = true;
    downX = e.clientX;
    downT = performance.now();
  });
  window.addEventListener('pointerup', (e) => {
    if (!downOnCanvas) return;
    downOnCanvas = false;
    const moved = Math.abs(e.clientX - downX);
    const dt = performance.now() - downT;
    if (moved < 6 && dt < 400) {
      snapToEnd(getTheme() === 'dark' ? LIGHT_END : DARK_END); // 点按：切到另一端
    } else {
      const cur = events.currentMouseX;
      snapToEnd(cur >= MID ? DARK_END : LIGHT_END); // 拖拽：吸附最近端
    }
  });
  window.addEventListener('pointercancel', () => {
    downOnCanvas = false;
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'End') {
      snapToEnd(DARK_END);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'Home') {
      snapToEnd(LIGHT_END);
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      snapToEnd(getTheme() === 'dark' ? LIGHT_END : DARK_END);
      e.preventDefault();
    }
  });

  // 同页别的开关切了主题 → 手柄跟过去
  document.addEventListener('themechange', (e) => {
    const t = (e as CustomEvent<Theme>).detail;
    syncAria(root);
    snapToEnd(t === 'dark' ? DARK_END : LIGHT_END);
  });
}
