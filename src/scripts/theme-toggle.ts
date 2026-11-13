import { createPageScope } from './page-lifecycle';
/**
 * Jelly Slider 主题切换 —— 原版 WebGPU 实现（Software Mansion / TypeGPU，MIT）。
 *
 * 原版代码原样放在 src/vendor/jelly-slider/（仅几处本站改动，各文件内有 ★ 标注）：
 *   · numbers.ts：百分比字体换自托管的 IBM Plex Mono（本站零第三方资源）；
 *   · events.ts：加 setInitial / snapTo（松手吸附）、命中测试（只有点在软条上才能拖）、
 *     指针事件改挂 window（拖出画布继续跟手）；
 *   · camera.ts：加 project()（CPU 侧世界→画布投影，给命中测试用）；
 *   · scene.ts：setupScene 返回 eventHandler、注入 hitTest。
 * 本文件只做三件事：初始化 WebGPU 场景、把"连续滑块"收成"两端吸附的开关"、
 * 无 WebGPU 时降级为普通开关（主题照样能切）。
 *
 * 行为：左端 = 亮色（0%），右端 = 暗色（100%），百分比显示原样保留。
 * 拖动时页面与头部颜色随位置渐变，松手吸附落定后保存主题；点按仍直接切换。
 * 键盘 ←/→/空格/回车可用。
 * 空白处按住挪动再松手 = 什么都不发生（见下面松手判定的注释）。
 */
import { tgpu, d } from 'typegpu';
import { setupScene } from '../vendor/jelly-slider/scene.ts';
import { DARK_END, LIGHT_END } from '../vendor/jelly-slider/events.ts';
import { GROUND_TINT_DARK, GROUND_TINT_LIGHT } from '../vendor/jelly-slider/constants.ts';
import { getTheme, setTheme, type Theme } from './theme.ts';
import { colorChannels, createThemePreview, mixThemeColor } from './theme-preview';

const MID = (LIGHT_END + DARK_END) / 2;
/* 画布内部渲染尺寸（`canvas.width/height` 由这里写死，不看 HTML 属性）。
   ★★ 2026-10-17 第四轮：84 → 104，与 CSS 的 `height: 104px` **必须一致** ——
   这两处不同步的后果不是"画质差一点"，而是**整个画面被拉伸**（宽高比变了却仍按原
   fov 取景），槽会变扁、百分比字会被拉长。三处一起改：
     `src/components/ThemeToggle.astro`（canvas 属性 + CSS）、这里、`scene.ts` 的 TOGGLE_FOV。 */
const W = 220;
const H = 200;

const themeOfEnd = (end: number): Theme => (end === DARK_END ? 'dark' : 'light');

/**
 * 把画布那块“地面”的基准色换成当前主题的纸色。
 *
 * ★ 2026-10-17 第三轮（站主：「按钮周围的那个颜色改为和背景纸白色相同，按钮内部的颜色也做
 * 适配，现在这样很突兀，像是从哪个地方抠图抠出来的」）：原版地面固定落在 190/255 的浅灰，
 * 亮色页纸白 250、深色页纸 #131b17 ⇒ 两档都像贴片。值来自 constants.ts 的 GROUND_TINT_*，
 * 与 tokens.css 的 `--paper` 同源（门闩：tests/theme-toggle.test.ts「地面基准色与 --paper 同源」）。
 */
function applyGround(
  scene: Awaited<ReturnType<typeof setupScene>>,
  theme: Theme,
): void {
  scene.groundTint = theme === 'dark' ? GROUND_TINT_DARK : GROUND_TINT_LIGHT;
}

function syncAria(root: HTMLElement): void {
  root.setAttribute('aria-checked', String(getTheme() === 'dark'));
}

/** 无 WebGPU 时的降级：普通开关，主题照样切（样式极简，不伪装成果冻） */
function mountFallback(root: HTMLElement): void {
  root.innerHTML = '';
  // 降级按钮独自承担交互语义，避免 Tab 先落到一个没有事件的外层开关。
  root.removeAttribute('role');
  root.removeAttribute('aria-checked');
  root.removeAttribute('aria-label');
  root.removeAttribute('tabindex');
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
  window.addEventListener('pagehide',()=>document.removeEventListener('themechange',paint),{once:true});
  root.appendChild(btn);
  paint();
}

export async function initJellyThemeToggle(root: HTMLElement): Promise<void> {
  const scope=createPageScope(globalThis.window,globalThis.document);
  const {window,document}=scope;
  window.addEventListener('pagehide',()=>scope.dispose(),{once:true});
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

  if (!root.isConnected) { tgRoot.destroy(); scope.dispose(); return; }
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  /* ★ premultiplied：地面层完全靠 alpha 表达（纸色 = 透明，暗部 = 半透明墨影），
     于是关于页的 ∞ 底纹从按钮底下透出来、影子也落在页面上，见 scene.ts 的 blit 注释。 */
  const context = tgRoot.configureContext({ canvas, alphaMode: 'premultiplied' });
  const scene = await setupScene(tgRoot, context);
  if (!root.isConnected) { scene.onCleanup(); tgRoot.destroy(); scope.dispose(); return; }
  scope.keep(()=>{scene.onCleanup();tgRoot.destroy();});
  const events = scene.eventHandler;
  const preview = createThemePreview();
  scope.keep(()=>preview.clear());
  let dragPreview = false;
  const paintTip = (progress: number) => {
    const color = mixThemeColor(preview.colors.light['--jelly-tip-light'], preview.colors.dark['--jelly-tip-dark'], progress);
    scene.jellyColor = d.vec4f(...colorChannels(color), 1);
    /* ★★ 2026-11-13（站主选「甲」：「端头保持现在这样，只调取色 —— 让它在暗底上偏一点橙、
       亮底上偏一点绿，不动 alpha」）。
       取 `--accent`：亮档 #2d7d46 墨绿、暗档 #ff7b00 橙，正好是软条本体
       （`--jelly-tip` 亮橙 / 暗墨绿）的**反色相** ⇒ 端头与带身不糊成一片。
       强度不在这里乘 —— 旋钮在 scene.ts 的 `END_GLASS_BLEED`（拖拽中间态也走这条混色）。 */
    const envLight = preview.colors.light['--accent'];
    const envDark = preview.colors.dark['--accent'];
    if (envLight && envDark) {
      scene.endTint = d.vec4f(...colorChannels(mixThemeColor(envLight, envDark, progress)), 1);
    }
  };
  const paintProgress = (progress: number) => {
    preview.update(progress);
    const paper = mixThemeColor(preview.colors.light['--paper'], preview.colors.dark['--paper'], progress);
    scene.groundTint = d.vec4f(...colorChannels(paper), progress);
    paintTip(progress);
  };
  scene.onProgress = progress => { if (dragPreview) paintProgress(progress); };

  // 首帧即停在当前主题对应的端
  const startTheme = getTheme();
  applyGround(scene, startTheme);
  paintTip(startTheme === 'dark' ? 1 : 0);
  events.setInitial(startTheme === 'dark' ? DARK_END : LIGHT_END);
  syncAria(root);

  const endPreview = (): void => {
    dragPreview = false;
    preview.clear();
    const theme = getTheme();
    applyGround(scene, theme);
    paintTip(theme === 'dark' ? 1 : 0);
  };

  const commit = (end: number): void => {
    dragPreview = false;
    preview.clear();
    const t = themeOfEnd(end);
    if (getTheme() !== t) setTheme(t);
    applyGround(scene, t);
    paintTip(end === DARK_END ? 1 : 0);
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
  let downY = 0;
  let downT = 0;
  let downOnCanvas = false;
  let gestureMoved = false;
  let pointerId: number | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.isPrimary === false || pointerId !== null) return;
    pointerId = e.pointerId;
    downOnCanvas = true;
    downX = e.clientX;
    downY = e.clientY;
    downT = performance.now();
    gestureMoved = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!downOnCanvas || e.pointerId !== pointerId) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) >= 6) gestureMoved = true;
    if (!events.isPointerDown || reduceMotion) return;
    if (!events.didGrab) return;
    if (gestureMoved) dragPreview = true;
  });
  window.addEventListener('pointerup', (e) => {
    if (!downOnCanvas || e.pointerId !== pointerId) return;
    downOnCanvas = false;
    pointerId = null;
    /* ★★ 2026-10-17 第九轮（站主：「按其他地方挪动时软条确实不动，但松开鼠标左键
       软条就会瞬移」）—— 瞬移发生在**松手这一下**，不在按下/移动那几帧。

       根因是第七轮那个判据里的**短路**：
           if (!events.didGrab || (moved < 6 && dt < 400)) { 切到另一端 }
       `!events.didGrab` 在空白处按住时恒为真 ⇒ 右半截的 `moved` / `dt` **压根没被读**，
       松手一律走「切到另一端」⇒ `snapToEnd(DARK_END)` 把整条软条送到对端。
       拖动期间看着"不动"是 `events.ts` 那半的功劳（没命中就不进拖拽），它是对的；
       错的只有松手这一帧把"没抓住"当成了"点按"。

       ⇒ 判据改成**先按有没有抓住分流，两路各自再判是不是点按**：
         · 抓住了：点按（几乎没动）切到另一端，拖过则吸附最近端 —— 与第七轮同；
         · 没抓住：**只有真的点按才切主题**；按住挪动过再松手 ⇒ 什么都不做。
       ⚠ 没抓住那一路**不判 `dt`**：那条分支上根本没有拖拽发生，"按得久"不是"拖过"，
         而原版对空白处是"松手就切"（见场景 d 的回归）。只卡位移这一项，
         才是站主说的"挪到别处不生效"，不至于顺手把长按也废掉。
       ⚠ `moved` 必须量**二维**：原来只比 `clientX`，站在画布里上下挪一下 dx=0
         会被算成"没动"照样切主题 —— 与本轮同一个病（挪了却当成点按）。
       ⚠ 监听注册顺序有依赖：`scene.eventHandler` 的 window pointerup 比这里早注册，
         所以这里读到的是这次松开保留下来的 `didGrab`（它只在 pointerdown 更新）。 */
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    const dt = performance.now() - downT;
    // 中途拖出再拉回，也属于拖动；不能只看松手时首尾的距离。
    const tapped = moved < 6 && dt < 400 && !gestureMoved;
    const other = getTheme() === 'dark' ? LIGHT_END : DARK_END;
    if (events.didGrab) {
      if (tapped) {
        endPreview(); // 吸附未结束就重新点按，也要回到直接切换路径。
        snapToEnd(other); // 点按端头：切到另一端
      } else {
        if (moved >= 6 && !reduceMotion) dragPreview = true;
        /* ★★ 2026-10-18 第十轮（站主：「为什么现在拖到大于50%不会自动吸到右边了，
           只有点击会到右边」）：读**指针的即时位置**，不读平滑值。

           原来读 `currentMouseX` —— 那是每帧只推进 8% 的平滑值，松手那一刻软条
           通常还没追上指针，量到的是"软条当前在哪"而不是"我拖到了哪"。
           实测同一手势同一落点（moved 都是 72.6 px）：
             快拖 ⇒ 读到 0.3152 < MID 0.45 ⇒ 判成不到一半 ⇒ 弹回左边；
             慢拖 ⇒ 读到 0.6536 > MID     ⇒ 吸到右边。
           拖得越快越容易判反 ⇒ 站主看到的就是"拖过 50% 反而弹回去"。

           ⚠ 别改成"两个位置取大"或"加余量"糊过去：那会让"轻轻一拖就跳到另一头"。
             要判的是**用户意图落在哪**，指针位置就是那个意图。 */
        const cur = events.pointerTargetX;
        snapToEnd(cur >= MID ? DARK_END : LIGHT_END); // 拖拽：吸附最近端
      }
    } else if (moved < 6 && !gestureMoved) {
      endPreview();
      snapToEnd(other); // 空白处点按：切到另一端（与第七轮的场景 d 回归一致）
    }
    /* 空白处按住挪动过再松手 ⇒ 上面三个分支都不进 ⇒ 什么都不发生（就是站主要的行为） */
  });
  const cancelPreview = () => {
    downOnCanvas = false; pointerId = null; dragPreview = false;
    preview.clear(); events.cancelDrag();
    const theme = getTheme();
    events.setInitial(theme === 'dark' ? DARK_END : LIGHT_END);
    applyGround(scene, theme); paintTip(theme === 'dark' ? 1 : 0);
  };
  window.addEventListener('pointercancel', (e) => { if (e.pointerId === pointerId) cancelPreview(); });
  window.addEventListener('blur', cancelPreview);
  window.addEventListener('pagehide', cancelPreview);

  root.addEventListener('keydown', (e) => {
    if (['ArrowRight', 'End', 'ArrowLeft', 'Home', ' ', 'Enter'].includes(e.key)) endPreview();
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

  // 同页别的开关切了主题 → 手柄跟过去（画布地面色也跟着换，否则按钮又变成一块贴片）
  document.addEventListener('themechange', (e) => {
    const t = (e as CustomEvent<Theme>).detail;
    applyGround(scene, t);
    syncAria(root);
    snapToEnd(t === 'dark' ? DARK_END : LIGHT_END);
  });
}
