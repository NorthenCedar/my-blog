/**
 * 立体 ∞（FinInfinity）· 控制器。
 *
 * 职责（与站内其它装置同构，见 time-slice.ts）：
 *   · 读tokens.css 取色 → 整包传给场景（**本文件不出现色值字面量**）
 *   · **动态 import 场景**（three.js 544 KB + n8ao WASM 803 KB，不能上每一页）
 *   · 视口外 / 切标签 ⇒ 停帧；prefers-reduced-motion ⇒ 根本不启动
 *   · 启动失败（WebGL 拿不到 / WASM 404）⇒ 退回静态层，**绝不留空画布**
 *   · 主题切换 ⇒ 把 uDenied 设成 0/1（**硬切，照搬原版**，见 fin-scene.ts 注释）
 *   · 点击 ⇒ 触发脉冲（原版无此交互，是新加的）
 */

import { createActivityGate, startLoop } from './rl-core';
import type { FinPalette, FinScene } from './fin-scene';

/** 脚本可跑的最严条件：过不了就只留静态层。 */
const ok = () =>
  !matchMedia('(prefers-reduced-motion: reduce)').matches &&
  typeof WebGLRenderingContext !== 'undefined';

export function initFinInfinity(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('[data-fin-infinity]');
  const view = root.querySelector<HTMLElement>('[data-fin-view]');
  const canvas = root.querySelector<HTMLCanvasElement>('[data-fin-cv]');
  const staticLayer = root.querySelector<HTMLElement>('[data-fin-static]');
  if (!host || !view || !canvas) return;

  /* ── 取色：与站内其它装置同一套写法（6 位 hex + 独立 alpha）── */
  const cs = getComputedStyle(host);
  const hex = (name: string): string => {
    let h = cs.getPropertyValue(name).trim();
    if (h.startsWith('#')) h = h.slice(1);
    if (h.length === 8) h = h.slice(0, 6); // three 不认8 位 alpha
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return `#${h}`;
  };

  const buildPalette = (): FinPalette => {
    const dark = document.documentElement.classList.contains('dark');
    /* ★ 亮暗各一套。亮色档的鳍片要比纸白**深一档**才看得出体积（原版是暖白
       0.935/0.895/0.830 配更暖的场景底，靠明度差撑出层次；本站同理）。
       暗色档用 --paper 的近黑 + 稍亮一点的鳍片色，否则糊成一片。 */
    return dark
      ? {
          bodyLight: hex('--accent'), bodyDark: hex('--fin-body-dark'),
          glowLight: hex('--accent-ink'), glowDark: hex('--accent'),
          sceneLight: hex('--fin-body-dark'), sceneDark: hex('--paper'),
          ambientLight: hex('--fin-ambient-dark'),
        }
      : {
          bodyLight: hex('--fin-body-light'), bodyDark: hex('--accent'),
          glowLight: hex('--accent-ink'), glowDark: hex('--accent'),
          sceneLight: hex('--paper'), sceneDark: hex('--fin-body-light'),
          ambientLight: hex('--fin-ambient-light'),
        };
  };

  const isDark = () => document.documentElement.classList.contains('dark');

  /* ── 启用 / 停用 ── */
  let scene: FinScene | null = null;
  let stopLoop: (() => void) | null = null;
  let gate: ReturnType<typeof createActivityGate> | null = null;
  let disposed = false;

  const resize = () => {
    const r = host.getBoundingClientRect();
    scene?.resize(r.width, r.height, devicePixelRatio || 1);
  };

  const boot = async () => {
    const mod = await import('./fin-scene');
    const s = await mod.createFinScene(canvas, buildPalette());
    if (disposed || !stopLoop) {
      s.dispose();
      return;
    }
    scene = s;
    s.setDenied(isDark() ? 1 : 0);
    resize();
    s.resize(host.getBoundingClientRect().width, host.getBoundingClientRect().height, devicePixelRatio || 1);
    s.playAssemble();
  };

  const enable = () => {
    if (stopLoop) return;
    if (!ok()) return; // reduced-motion / 无 WebGL ⇒ 只留静态层
    host.classList.add('fin-on');
    view.hidden = false;
    staticLayer?.setAttribute('hidden', '');
    boot().catch((err) => {
      console.warn('[fin] 场景启动失败，退回静态层', err);
      disable();
      staticLayer?.removeAttribute('hidden');
    });
    gate = createActivityGate(view, {});
    stopLoop = startLoop((dt) => {
      if (gate && !(gate.onScreen && gate.visible)) return; // 视口外 / 切标签 ⇒ 停帧
      scene?.render(dt);
    });
  };

  const disable = () => {
    stopLoop?.();
    stopLoop = null;
    gate?.dispose();
    gate = null;
    view.hidden = true;
    host.classList.remove('fin-on');
    scene?.dispose();
    scene = null;
  };

  enable();

  /* ── 尺寸：容器变了要跟着变（窄屏 / 旋转 / 侧栏开合）── */
  const ro = new ResizeObserver(() => resize());
  ro.observe(host);

  /* ── 主题切换 ⇒ uDenied 硬切（原版 Stage.ts:407 直接赋值）── */
  const mo = new MutationObserver(() => {
    if (!scene) return;
    // ★ 换主题要**连色板一起换** —— 亮暗两套 token 不同，只改 uDenied 会让
    //   鳍片本体色还停在上一档的色值上（这是"暗色模式鳍片还是浅色"那类 bug 的来处）。
    scene.setPalette(buildPalette());
    scene.setDenied(isDark() ? 1 : 0);
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  /* ── 点击反馈：★ 原版没有，是新加的 ──
     原版的脉冲由键盘触发（rhine-lock 的 lock.svelte.ts:305，语义是「你刚敲了口令」）。
     这里挂到点击上：点雕塑任意位置，从交叉点（0.25 相位）起跑一道光。 */
  host.addEventListener('pointerdown', (e) => {
    if (!scene) return;
    // 点在文字/链接上不触发（避免抢正常交互）
    const t = e.target as Element | null;
    if (t?.closest('a,button,input,textarea,select,label,[role="button"]')) return;
    scene.pulse(0.25);
  });

  /* ── 指针视差（原版 Stage.ts:418-419）── */
  host.addEventListener('pointermove', (e) => {
    if (!scene) return;
    const r = host.getBoundingClientRect();
    scene.setPointer(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      ((e.clientY - r.top) / r.height) * 2 - 1,
    );
  });

  /* ── 断点切换：窄屏不再跑（对齐站内约定）── */
  const mq = matchMedia('(max-width: 767px)');
  const onMq = () => (mq.matches ? disable() : enable());
  mq.addEventListener('change', onMq);
  onMq();

/* ── WebGL 上下文丢失（切GPU / 驱动重置 / 长时间隐藏）──
     与 pleated-infinity.ts 同一套处理：丢 ⇒ 停帧 + 退回静态层（不留黑画布）；
     恢复 ⇒ 重建场景。⚠ 必须 preventDefault，否则浏览器**不会**再派发 restored。── */
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    disable();
    staticLayer?.removeAttribute('hidden');
  }, { passive: false });
  canvas.addEventListener('webglcontextrestored', () => {
    staticLayer?.setAttribute('hidden', '');
    enable();
  });

  /* ── 页面级清理：bfcache 回来时别留孤儿 rAF ── */
addEventListener('pagehide', () => {
    disposed = true;
    ro.disconnect();
    mo.disconnect();
    mq.removeEventListener('change', onMq);
    stopLoop?.();
    scene?.dispose();
  });
}

/* ── 自启动（与 pleated-infinity.ts 同模式：脚本被import 就跑）── */
(() => {
  const host = document.querySelector<HTMLElement>('[data-fin-infinity]');
  if (!host) return;
  initFinInfinity(host.parentElement ?? document.body);
})();