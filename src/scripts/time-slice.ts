import { createActivityGate, createSpring, prefersReducedMotion, shouldAnimate, startLoop } from './rl-core';
import { TSL, tslTimeline, tslWindow } from './time-slice-core';
import { navigate, type TransitionBeforePreparationEvent } from 'astro:transitions/client';
import { onPage } from './page-lifecycle';
export { TSL, TSL_FRAMES, TSL_SECONDS, tslHash, tslPath, tslTimeline } from './time-slice-core';
onPage(({document, window, addEventListener, matchMedia, setTimeout, clearTimeout, keep}) => {
/* =============================================================================
 * TIME SLICE 时间切片 —— 主页收尾装置（S6，footer 之前）· 控制器
 *
 * 站主的需求（2026-10-01）：主页底部放一个菱形窗口（参考 wodniack.dev 的
 * 「滚到底 → 滚进窗口」门户机制，形状换成站主给的菱形），滚进窗口后是一段
 * 「时间切片」飞行（参考抖音 @afterimage 的 three.js 作品：蝴蝶穿过嵌套方框
 * 隧道，每个时刻留一片残影，尽头落成标本），滚动驱动、可逆、停在任意切片可
 * 细看；蝴蝶到尽头后自然转入相册页（/gallery/）。
 *
 * ★ 机制（站主 2026-10-03 第六轮 + 2026-10-02 第七轮反复收紧后的口径）：
 *   ① **蝴蝶本身不动** —— 它是「切片」：每片 = 一块**毛玻璃** + 一只停在某个
 *     翼相上的蝶，76 片沿隧道轴排成一列；**扑翼序列一次性烘焙进几何**（切片 i
 *     用第 i%FLAP_N 份翼相，翼相本身带谐波与逐档振幅调制 ⇒ 不是机械摆），
 *     滚动 = **镜头沿轴推进**，一个切片接一个切片地经过，连起来才是「飞舞」。
 *     ★ 第七轮字面化：「蝴蝶是固定在切片上的，不要变位置」「整个场景中蝴蝶，
 *     切片等等位置都不要变幻，只有摄像机的位置在变」⇒ 场景里所有位置只在
 *     建场景时写一次，update() 一个 position 都不写；
 *   ② **画面靠中间那一片是「实」的**，且**恰好只有一片**（站主：「你看他只有
 *     一个蝴蝶是实的」）—— 落到几何上 = 镜头前方**固定距离** FOCUS_DIST 处
 *     （au 最小）的那一片，**硬切**；其余一律**透明度很高、只能看见一点**，
 *     而且用的是**和玻璃片同一条可见度曲线**（站主第七轮「透明的蝴蝶把透明度
 *     变得和切片的玻璃片一样」）⇒ 转动视角时，看到的每一片玻璃上都停着一只
 *     很淡的蝶；
 *   ③ **被镜头甩到身后的切片留着**：位置与尺度都不动，只是变半透明
 *     （站主：「摄像机后面的蝴蝶别动，别往下，只不过是变的半透明了」）；
 *   ④ 鼠标**不**转视角时只看得到中央那条切片链；**转动视角**才亮出环绕四周的
 *     **玻璃柱阵**（一列列整齐等距，中心 3×3 留空 ⇒ 不贴镜头这一列；柱里没蝶）；
 *   ⑤ 定格挪视角：停在某片时按住左键拖动，镜头绕轴**公转**（切片留在画面里，
 *     整链的透视线向尽头光点放射汇聚）。★ 第七轮 + **第八轮**把「滚轮不动
 *     视角」钉成了**结构性**保证：控制器里滚轮只推页、场景里机位与注视点用
 *     同一个链锚、只差一个半径 ⇒ 视线方向只由 az / el 决定。
 *     （第七轮之前是靠参数恰好抵消，抵不掉相机那层的弹簧滞后 —— 向上滚时
 *      画面会朝后翻 116°，第八轮实测复现并修掉，见 time-slice-scene.ts 头注）
 *     ★ **第九轮把两件事分了工**（站主 ②）：「基础朝向」任何滚动都不动（第七轮
 *     那六个感叹号继续有效）；「拖动环视」是读者的临时状态，一滚滚轮就归零 ⇒
 *     回到原始视角、周围切片收起。归零目标是个常数 0、不读 deltaY ⇒ 上行滚与
 *     下行滚在同一位置仍然给出同一个朝向。
 *   ⑥ 尽头：走到链尾后**向下滚划不动**（收尾自动播放）—— 镜头落定 → 全屏转绿
 *     （相册页开场同一套深绿）→ **绿幕一满屏就直接进相册**（站主第九轮 ③：
 *     不要「进入相册」按钮、不要出口那道绿菱形框、别卡、更别「进不去」）。
 *     从相册按返回键回来的那一档不自动跳（防回跳死循环），读者往回滚即解封；
 *     ★★ 第十轮追加（站主报 bug）：按返回键回来时**还要把页面滚回顶部** ——
 *       跳转那一刻滚动位置在链尾，浏览器就把它记成主页的历史位置，于是回来看到的是
 *       「蝴蝶飞到尽头」那一帧：一屏纯绿、滚轮也被 atTail 吞着，什么也点不动。
 *       改法：跳转前写下 `tsl-exit`，回来的那次读到它就 `scrollTo(0,0)`
 *       （首帧 + pageshow 各一次，理由见实现处注释）。
 *   ⑦ 落位 = footer 之前（纸白区底部，SECTOR 06）；
 *   ⑧ 滚动手感 = 轻惯性：滚动目标值过 rl-core 弹簧（临界阻尼，滑而不弹）。
 *
 * ★ 「虚实」只跟滚动位置有关（站主第七轮：「蝴蝶的虚实只和摄像机停在什么位置
 *   （鼠标滚轮）有关，转动视角蝴蝶的虚实不变」）⇒ 焦点判据里的轴向距离取自
 *   **链锚**（链参数点后方 CAM_BACK，纯滚动量），不取环视之后的真实机位 z。
 *
 * ★ 蝴蝶模型：`public/butterfly.glb`（站主第四轮：「上网找现成的，颜色要浅要
 *   真实」；**第六轮重新调色**）。来源 Poly Pizza 的 CC-BY「Monarch Butterfly」
 *   (Paul Spooner)，本地两步处理：贴图**双色重映射**（花纹/翅脉 → 纯白，
 *   身体/翼膜 → 淡黄）+ gltf-transform 抽稀到 3552 面 / 189 KB。处理与朝向
 *   标定的完整口径见 time-slice-scene.ts 头注与 §6.21。
 *   ★ **署名落地（第九轮 ①）**：剧场右下角那一格原来是 FRAME 读数，现在整条
 *     换成这只蝶的署名（`index.astro` 的 `.tsl-hud`，含 CC BY 4.0 许可页外链），
 *     且**只在穿过菱窗之前**露面（脚本按 zoom 逐帧收掉）—— 这正是 CC-BY 4.0
 *     要求的「可见署名」，也了结了 §6.19 / §6.21 挂着的待办。
 *
 * ★ 渲染层为什么是 three（2026-10-01）：站主要求「尽量保持和参考视频一模一
 *   样」，参考是真 3D（透视相机 + 环绕），Canvas2D 手写投影到不了那个纵深感。
 *   three 是站主 2026-09-30 为首屏 DNA 拍板的既有破例（本地 vendor + alias，
 *   见 astro.config），本装置**动态 import 场景**（time-slice-scene.ts），
 *   three chunk 本来就在首屏被 dna3d 拉取 ⇒ 本装置零新增下载量。
 *
 * ★ 硬红线自查：
 *   · 场景模块走动态 import（滚动剧场不把 three 拖进首屏关键路径）；
 *   · 零随机源 —— 一切都是 f(t)/f(i) 的确定函数（数学在 time-slice-core.ts）；
 *   · 颜色不写死 —— 画布里的每个颜色都从 tokens.css 的 CSS 变量取
 *     （getComputedStyle），整包传给场景（场景文件同样零色值字面量）；
 *   · 跳转地址不写死在 JS —— 从静态回退层那个 <a href> 的 href 读出来；
 *   · DOM 写入只走 textContent（本站硬约束，有测试守着）。
 *
 * ★ 降级四态（与卷尺同一套口径）：
 *   ① reduced-motion：不启用（静态回退层：菱形 + 一句话 + 相册链接）；
 *   ② 无 JS：装置默认就是静态回退层，正文完整；
 *   ③ 移动端 ≤767px：不启用（同静态回退层）；
 *   ④ 视口外 / 切标签：createActivityGate 停帧。
 *
 * ★ 滚动剧场结构（脚本判定可跑才挂 .tsl-on）：
 *   .tsl-stage 默认矮（静态回退）；脚本挂 .tsl-on 后变 520vh，
 *   .tsl-view（sticky 100vh）里的画布用 CSS clip-path 裁出菱形窗：
 *   滚动进度 p 先把双层圆角玻璃窗放大到全屏（「穿过窗口」），再映射成飞行时间 t。
 *   t 与 p 都是 [0,1]，一一对应、可逆 —— 向上滚蝴蝶就倒退。
 * -------------------------------------------------------------------------- */

/* 纯函数层住在 time-slice-core.ts（无 DOM、零随机源，测试直接 import）；
   这里转出口保持既有 import 路径兼容。 */


/* ------------------------------------------------------------------ 装置本体 */

function init() {
  const host = document.querySelector<HTMLElement>('[data-tsl]');
  if (!host) return;
  const stage = host.querySelector<HTMLElement>('[data-tsl-stage]');
  const view = host.querySelector<HTMLElement>('[data-tsl-view]');
  const cvs = host.querySelector<HTMLCanvasElement>('[data-tsl-cv]');
  const hud = host.querySelector<HTMLElement>('[data-tsl-hud]');
  const green = host.querySelector<HTMLElement>('[data-tsl-green]');
  const wait = host.querySelector<HTMLElement>('[data-tsl-wait]');
  const waitText = wait?.querySelector<HTMLElement>('[data-tsl-wait-text]');
  const retry = wait?.querySelector<HTMLAnchorElement>('[data-tsl-retry]');
  const ring = host.querySelector<SVGSVGElement>('[data-tsl-ring]');
  const ringPath = host.querySelector<SVGPathElement>('[data-tsl-front]');
  const backPath = host.querySelector<SVGPathElement>('[data-tsl-back]');
  const edgePath = host.querySelector<SVGPathElement>('[data-tsl-edges]');
  /* ★ 第九轮 ③：跳转地址仍然**只从静态回退层的真链接读**（不在 JS 里写死路径）。
     原来还读了一个 `.tsl-go`（「进入相册」胶囊），那一块已按站主原话删掉 ⇒
     这里换成 `.tsl-static a`：它是无 JS / 手机 / reduced-motion 那一档的入口，
     永远在场，语义比 CTA 更硬。 */
  const goLink = host.querySelector<HTMLAnchorElement>('.tsl-static a');
  if (!stage || !view || !cvs || !hud || !green || !ring || !ringPath || !backPath || !edgePath || !goLink || !wait || !waitText || !retry) return;
  const dest = goLink.href;
  retry.href = dest;
  let prefetched = false;
  wait.addEventListener('pointerdown', (event) => event.stopPropagation());

  /* ---- 启用判定：桌面 + 动效允许，二者缺一 ⇒ 整个装置保持静态回退 ---- */
  const reduce = prefersReducedMotion();
  const wide = matchMedia('(min-width: 768px)');
  const canRun = () => shouldAnimate(reduce) && wide.matches;

  /* ---- 颜色：全部从 tokens.css 取（组件里零字面量色值），整包传给场景 ----
     ★ three 的 Color 不认 8 位 hex：带 alpha 的 token 拆成「6 位色 + 独立 alpha」。
     ★ 产物 CSS 会被压缩器缩写（6 位白缩成 3 位）：hex6/hexA 必须兼容 3/4/6/8 位。 */
  const rootStyle = getComputedStyle(document.documentElement);
  const tok = (name: string) => rootStyle.getPropertyValue(name).trim();
  const hex6 = (hex: string) => {
    const h = hex.replace('#', '');
    if (h.length === 8) return '#' + h.slice(0, 6);
    if (h.length === 4) return '#' + h.slice(0, 3).replace(/./g, '$&$&'); // 4 位缩写：RGB 各位翻倍
    if (h.length === 3) return '#' + h.replace(/./g, '$&$&'); // 3 位缩写：各位翻倍
    return '#' + h;
  };
  const hexA = (hex: string) => {
    const h = hex.replace('#', '');
    if (h.length === 8) return parseInt(h.slice(6, 8), 16) / 255;
    if (h.length === 4) return parseInt(h[3]!.repeat(2), 16) / 255; // 4 位缩写：末位是 alpha
    return 1;
  };
  const windowStyle = getComputedStyle(host);
  const entryAlpha = Number.parseFloat(windowStyle.getPropertyValue('--tsl-entry-opacity'));
  const palette = {
    entryColor: hex6(windowStyle.getPropertyValue('--tsl-entry-color').trim()),
    entryAlpha: Number.isFinite(entryAlpha) ? Math.min(1, Math.max(0, entryAlpha)) : 0.32,
    entryGlow: Number.parseFloat(windowStyle.getPropertyValue('--tsl-entry-glow')),
    entryFrame: hex6(windowStyle.getPropertyValue('--tsl-entry-frame').trim()),
    deep: hex6(tok('--dusk-1')), // 隧道最深的底
    mid: hex6(tok('--dusk-2')), // 隧道主体的底
    lift: hex6(tok('--dusk-3')), // 标本框内衬 / 翼面淡端（略抬升）
    glow: hex6(tok('--accent-bright')), // 亮绿光晕（深底专用 token）
    white: hex6(tok('--on-band')), // 蝴蝶/光点的暖白
    paper: hex6(tok('--paper')), // 蝶面翼缘的暖白（通体亮，不沉底色）
    line: hex6(tok('--dglass-line')), // 玻璃框线 / 翅脉
    lineA: hexA(tok('--dglass-line')),
  };

  /* ---- 画布尺寸 ---- */
  let W = 0;
  let H = 0;
  let DPR = 1;
  const resize = () => {
    DPR = Math.min(1.5, window.devicePixelRatio || 1);
    W = view.clientWidth;
    H = view.clientHeight;
    ring.setAttribute('viewBox', `0 0 ${W} ${H}`);
  };

  /* ---- 指针视差（场景内自管平滑，不借首页那对 --mx/--my） ---- */
  let pmx = 0;
  let pmy = 0; // 平滑值
  let ptx = 0;
  let pty = 0; // 目标值
  view.addEventListener(
    'pointermove',
    (e) => {
      ptx = (e.clientX / Math.max(1, W) - 0.5) * 2;
      pty = (e.clientY / Math.max(1, H) - 0.5) * 2;
    },
    { passive: true },
  );
  view.addEventListener('pointerleave', () => {
    ptx = 0;
    pty = 0;
  });

  /* ---- 定格挪视角（第二轮）：停在某一切片时按住左键拖动自由环视，环绕排列
     的切片亮出 ----
     ★ 第七轮把**滚轮与基础朝向彻底脱钩**（原话带六个感叹号），第九轮又补上
     「改变视角后滚滚轮要回到原始视角」这一条 —— 两者不矛盾，分工是：
       · **基础朝向**（AZ_BASE）是常数，任何滚动都不改它 ⇒ 同一个滚动位置上，
         向上滚与向下滚给出逐像素相同的画面（第七轮那条一直有效）；
       · **拖动环视**（obx/oby 与环绕柱阵开关 amb）是**读者的临时状态**，
         一滚滚轮就归零 ⇒ 画面平滑回到原始视角、周围切片收起（第九轮 ②，
         目标恒为 0，与滚动方向无关 ⇒ 不会出现「往上滚和往下滚不一样」）。
     ★ 同一支监听兼「到底锁滚」（对照原片拍板）：走到链尾后向下滚不再推页，
     收尾自动播放：穿窗 → 全屏转绿 → 直接进相册。锁的条件与自动跳转同源，
     所以：上行滚永远放行 —— 绝不把读者困在剧场里。 */
  let atTail = false; // render 每帧写：已进收尾段且本次会话允许自动跳
  let dragging = false;
  let obxT = 0;
  let obyT = 0; // 环视目标（弧度）
  let obx = 0;
  let oby = 0; // 环视平滑值
  let ambT = 0;
  let amb = 0; // 环绕切片显隐（1 = 整圈亮出）
  let dlx = 0;
  let dly = 0; // 拖动上一次指针位置
  view.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dlx = e.clientX;
    dly = e.clientY;
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      /* 合成事件的 pointerId 未必是活动指针 ⇒ 捕获会抛；环视本身不依赖捕获 */
    }
    view.classList.add('tsl-drag');
  });
  view.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    obxT += (e.clientX - dlx) * 0.0038;
    obyT += (e.clientY - dly) * 0.0030;
    dlx = e.clientX;
    dly = e.clientY;
    obxT = Math.min(0.95, Math.max(-0.95, obxT)); // 夹角：转过去必有环绕切片在视野内
    obyT = Math.min(1.05, Math.max(-1.05, obyT));
    ambT = 1; // 拖动即亮出环绕切片（参考图2 的放射汇聚）
  });
  const endDrag = () => {
    dragging = false;
    view.classList.remove('tsl-drag');
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  /* ★ 署名那一格里有一个外链（CC BY 4.0 许可页，站主第九轮 ①）。view 上挂着
     pointerdown → setPointerCapture 的拖拽逻辑，指针一旦被捕获，鼠标事件会
     重定向到 view ⇒ 链接可能收不到那次 click。所以**从署名上按下的这一下不
     参与拖拽**（只有那一小块不吃拖动，其余地方照旧）。 */
  hud.addEventListener('pointerdown', (e) => e.stopPropagation());
  /* ★★ 滚轮：只推轴 + **把读者的临时环视收回原位**（站主第九轮 ②：
     「改变视角后在滚动滚轮要回到原始视角且周围切片消失」）。
     写法上刻意保持「两条守卫、零方向依赖」：
       · 链尾之后再往下滚 ⇒ 吞掉（收尾由时间轴自己播完）；
       · 其余情况把环视目标与环绕柱阵开关**归零** —— 目标是个常数 0，
         不读 e.deltaY、不读滚动方向 ⇒ 向上滚与向下滚在同一位置仍然给出
         同一个朝向（第七轮「视角和滚轮往下时一模一样」继续成立）。
     平滑回位由 render 里那两条一阶指数（obx/oby、amb）负责，所以是「缓缓
     转回原位」而不是硬切。 */
  window.addEventListener(
    'wheel',
    (e) => {
      if (atTail && e.deltaY > 0) {
        e.preventDefault(); // 链尾之后：滚动到此为止
        return;
      }
      obxT = 0; // 环视：回到原始视角（目标恒为 0，不随滚动方向变）
      obyT = 0;
      ambT = 0; // 周围切片：收起
    },
    { passive: false },
  );

  /* ---- 滚动进度：stage 在视口里的行程比例（0 进段顶 = 1 出段底） ---- */
  const progress = () => {
    const r = stage.getBoundingClientRect();
    const span = Math.max(1, r.height - window.innerHeight);
    return Math.min(1, Math.max(0, -r.top / span));
  };

  /* ---- 弹簧（站主拍板的「轻惯性」）：临界阻尼，滑而不弹 ---- */
  const spring = createSpring(0, { stiffness: 110, damping: 23 });

  /* ---- 收尾自动播放（第六轮对照原片拍板；第九轮 ③ 改成「绿屏即入相册」）----
     原片的行为：蝴蝶（切片链）飞到底，滚轮就**划不动了**；随后画面自己把
     最后那扇窗穿过去、全屏转绿。站主第九轮的原话：「到绿屏时直接进相册，
     别卡，现在有时进不去」⇒ 跳转线从「收尾时间轴走完（tf=1）再加 260 ms」
     改成**绿幕自身满屏的那一刻**，只留一点点驻留保证绿幕真的上了屏
     （旧写法在满屏绿之后还要干等 ≈0.7 s，读起来就是「卡了一下」）。
     ★ 可逆：滚回链尾以上，收尾重置（tailT0 归零），一切照旧。
     ★★ 防「回跳死循环」—— 这轮换成**看读者的动作**，不再看时钟：
        从相册按返回键回来时，页面要么整页重载（navigation type =
        back_forward）、要么从 bfcache 原样恢复（pageshow.persisted）——
        两种都**先不许自动跳**，否则读者会被立刻弹回相册、后退键形同虚设。
        读者只要自己往回滚过链尾线（见 render 里那句「重新武装」），就说明
        是主动来的 ⇒ 重新允许自动跳。
        ★ 旧做法是一个 15 s 的 sessionStorage 冷却窗，代价是「刚看完相册回来、
          再滚到底 ⇒ 十几秒内怎么都不进相册」—— 站主遇到的「有时进不去」
          正是它，已删净。 ---- */
  const TAIL_MS = 1900;
  const NAV_HOLD_MS = 90; // 绿幕满屏后再停这么一下（确保它已上屏）就切页
  const NAV_HANDOFF_KEY = 'tsl-nav'; // 给目标页留的交接标记：这次是从剧场绿幕切过来的
  /* ★★ 「上一次离开主页是穿过绿幕跳过去的」—— 站主 2026-10-07 第十轮报的那个 bug：
     按返回键回来看到的是"蝴蝶飞到尽头"那一帧（一屏纯绿、什么也点不动）。
     真因：跳转那一刻滚动位置在**链尾**，浏览器把主页的历史位置就恢复在那里。
     ⇒ 这个标记让"回来的那次"能认出自己该复位，而不是被当成一次普通的浏览中断。
     ★ 与 NAV_HANDOFF_KEY 的分工：那个**给目标页**用（Base.astro 读掉即删）；
       这个**给来源页自己**用（主页的装置读），两者不是一回事，不能合用一个。 */
  const EXIT_KEY = 'tsl-exit';
  /* 本次载入是不是「按了返回键回来的」——是的话先不许自动跳 */
  const navType = (() => {
    try {
      const e = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      return e?.type ?? 'navigate';
    } catch {
      return 'navigate';
    }
  })();
  let navOk = navType !== 'back_forward';
  /* ★★ 「回来 ⇒ 直接回主页起点」的复位（站主 2026-10-07 第十轮）。
     症状：绿幕满屏那一刻 assign 去了相册，浏览器把主页的滚动位置记在**链尾**；
     按返回键回来看到的就是"蝴蝶飞到尽头"那一帧 —— 一屏纯绿、什么也点不动
     （滚轮也被 atTail 吞掉：读者既回不去上面，也进不去别的页）。
     改法：认出 EXIT_KEY（= 上一次是从绿幕跳过去的）就把窗口滚回顶部。

     ★★ 为什么两条路径都要处理：
       · 整页重载（navigation type = back_forward）⇒ 复位必须在**首帧之前**，
         否则读者会先看到一屏绿再被弹上去（闪一下）；
       · bfcache 恢复（pageshow.persisted）⇒ **脚本不重跑**，初始化那次已经过去了，
         只能在这个事件里补。
     ★ 判据**不**用 `pRaw`（装置进度）：读者从相册点导航栏回首页时也可能是
       back_forward，但那次**不该**被弹回顶部 —— 他是从导航来的，不是在链尾。
       用 `scrollY > 0` 才表示"浏览器确实把滚动恢复到了非顶部"。
     ★ 复位用 `scrollTo(0,0)` 而不是改装置内部状态：滚动位置是唯一的输入，
       把输入归零，p / exit / 绿幕 / atTail 全部随之归零（下一帧 render 自己算）。
     ★ 标记读掉即删 —— 只影响"接下来的那一次主页加载"，不会反复弹。 */
  let backFromGate = false;
  const consumeExitMark = () => {
    if (backFromGate) return true; // 本页已经消费过（下面的 pageshow 还要再用这个事实）
    try {
      if (sessionStorage.getItem(EXIT_KEY) === null) return false;
      sessionStorage.removeItem(EXIT_KEY);
      backFromGate = true;
      return true;
    } catch {
      return false; // 隐私模式存不进：退化成原行为（停在链尾），不出错
    }
  };
  const rewindToTop = () => {
    if (!consumeExitMark() && !history.state?.timeSliceExit) return;
    clearExitHistory();
    if (window.scrollY <= 0) return; // 已经是顶部（读者自己又滚回来了 / 窄屏没滚过）⇒ 不动
    window.scrollTo(0, 0);
    /* 复位后自动跳转**重新武装**：读者是主动回主页的，不是被弹回来的 ⇒
       他再滚到底时应当还能进相册（否则就成了"回主页后装置失灵"的新 bug）。 */
    navOk = true;
  };
  let navTimer = 0;
  let waitTimer = 0;
  let retryTimer = 0;
  let navigation: 'idle' | 'pending' | 'failed' = 'idle';
  const navigationInfo = {};
  const showWait = (stalled: boolean, message: string) => {
    wait.hidden = false;
    waitText.textContent = message;
    retry.hidden = !stalled;
  };
  const clearWait = () => {
    clearTimeout(waitTimer);
    clearTimeout(retryTimer);
    wait.hidden = true;
    waitText.textContent = '';
    retry.hidden = true;
  };
  function clearExitHistory() {
    try {
      if (!history.state?.timeSliceExit) return;
      const state = { ...history.state };
      delete state.timeSliceExit;
      history.replaceState(state, '');
    } catch { /* 禁用历史状态时沿用浏览器的回退。 */ }
  }
  const failed = () => {
    if (navigation !== 'pending') return;
    clearWait();
    navigation = 'failed';
    clearExitHistory();
    try {
      sessionStorage.removeItem(NAV_HANDOFF_KEY);
      sessionStorage.removeItem(EXIT_KEY);
    } catch { /* 存储不可用不影响重试入口。 */ }
    showWait(true, '相册暂未打开');
  };
  document.addEventListener('astro:before-preparation', (event: TransitionBeforePreparationEvent) => {
    if (event.info !== navigationInfo) return;
    event.signal.addEventListener('abort', failed, { once: true });
    keep(() => event.signal.removeEventListener('abort', failed));
  });
  /* 首帧就复位（back_forward 的整页重载）：能抢在浏览器恢复滚动之前就抢，
     读者看不到"一屏绿再被弹上去"那一下闪。抢不到也没关系 —— pageshow 会再兜一次。 */
  if (navType === 'back_forward') rewindToTop();
  else if (history.state?.timeSliceExit) rewindToTop(); // Astro 回退仍在原文档，navigation type 不会改变。
  window.addEventListener('pageshow', (e) => {
    const persisted = (e as PageTransitionEvent).persisted;
    /* ★ bfcache 恢复的页面**不会重新执行脚本**（初始化时那次 navType 已经过去了）
       ⇒ 必须在这里把闸门关掉，否则恢复的一瞬间就会被弹回相册。 */
    if (persisted) {
      navOk = false;
      navigation = 'idle';
      clearWait();
    }
    /* ★★ 复位在 pageshow 再做一次，两个原因，缺一不可：
       ① bfcache 恢复时脚本不重跑 ⇒ 初始化那次 `consumeExitMark` 从没跑过，
          标记还在，只能在这里认（`backFromGate` 那时还是 false）；
       ② 整页重载时**浏览器恢复滚动的时机不受我们控制**，可能落在初始化之后
          （本站开场遮罩还会把滚动重置，属同一类竞态）⇒ 兜底再写一次。
       ★ 这里**不**重新读 sessionStorage：`backFromGate` 已经记住了事实，
         重复读会把"读掉即删"的语义搞乱（第二次读必然是 null）。 */
    if (backFromGate || consumeExitMark()) {
      clearExitHistory();
      if (window.scrollY > 0) {
        window.scrollTo(0, 0);
        navOk = true; // 与 rewindToTop 同一口径：读者主动回来的 ⇒ 重新武装
      }
    }
  });
  const beginNav = () => {
    if (navTimer || navigation !== 'idle') return;
    navTimer = window.setTimeout(() => {
      navTimer = 0;
      if (!navOk) return; // 期间滚回链尾以上 / 被判定成「回来的」⇒ 不跳
      navigation = 'pending';
      try {
        sessionStorage.setItem(NAV_HANDOFF_KEY, '1'); // 相册页据此播「内容浮上来」
        /* ★★ 同一刻写下**反向**标记：告诉"回来的那次主页"——上一次是从绿幕
           满屏跳过去的，别把滚动位置恢复在链尾（那正是站主报的那个 bug）。 */
        sessionStorage.setItem(EXIT_KEY, '1');
      } catch {
        /* 隐私模式存不进就算了 —— 跳转本身不受影响，只是目标页不播那道入场动画 */
      }
      try { history.replaceState({ ...history.state, timeSliceExit: true }, ''); }
      catch { /* 整页回退仍可使用会话标记。 */ }
      /* 这一帧绿幕已满屏（exit ≥ 0.95 ⇒ 绿幕 opacity = 1），相册页开场是
         同一套深绿（逐档实测误差 ≤2/255）⇒ 直接切过去就是无缝的。 */
      waitTimer = setTimeout(() => showWait(false, '正在打开相册…'), 450);
      retryTimer = setTimeout(() => showWait(true, '相册还在加载'), 4500);
      void navigate(dest, { info: navigationInfo }).catch(failed);
    }, NAV_HOLD_MS);
  };
  const cancelNav = () => {
    if (!navTimer) return;
    clearTimeout(navTimer);
    navTimer = 0;
  };
  let tailT0 = 0; // 收尾起点时刻（0 = 未在收尾）
  let lastP = 0; // 上一帧的滚动进度 —— 用来判「读者是不是在往回滚」（见 render）

  /* ---- 主循环：弹簧推 p → 时间轴 → 玻璃窗/署名 → 场景取数渲染 ---- */
  const sstep = (a: number, b: number, v: number) => {
    const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };
  const render = (dtMs: number, now: number) => {
    /* 指针平滑（帧率无关的一阶指数） */
    const kp = 1 - Math.exp(-dtMs / 180);
    pmx += (ptx - pmx) * kp;
    pmy += (pty - pmy) * kp;
    /* 环视与环绕切片的平滑（拖动瞬升目标，弹簧追） */
    const ko = 1 - Math.exp(-dtMs / 140);
    obx += (obxT - obx) * ko;
    oby += (obyT - oby) * ko;
    amb += (ambT - amb) * (1 - Math.exp(-dtMs / 260));

    const pRaw = progress();
    spring.retarget(pRaw);
    const pS = spring.step(dtMs);
    // 兜底：弹簧若被异常 dt 喂成非有限数，宁可停在段首，也不让 NaN 传下去
    // （NaN 会让整个装置「不可见 / 跳到极端态」——比停在段首难查得多）
    const p = Number.isFinite(pS) ? Math.min(1, Math.max(0, pS)) : 0;
    const tl = tslTimeline(p);
    if (!prefetched && pRaw >= TSL.zoomEnd) {
      prefetched = true;
      if (navigator.onLine && !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = dest;
        document.head.append(link);
        keep(() => link.remove());
      }
    }

    /* 收尾：到链尾（t=1 那一线）就交给时间轴 —— 这条线同时就是「划不动」的线。
       ★ navOk 为假（刚按返回键回来的那一档）时**不启动**收尾：不锁滚、不放绿幕，
         画面停在链尾那一帧；读者只要往回滚过这条线就解封，那也是重新武装的
         时刻（见下面那句 navOk = true）。 */
    /* ★ 重新武装自动跳转的唯一判据：**滚动进度在往回走**（读者自己往上滚）。
       不能用「pRaw 已在链尾线以下」当判据 —— 从相册按返回键回来时滚动位置是
       浏览器恢复的，而恢复可能落在我们第一帧**之后**（本站首屏遮罩还会把滚动
       重置回顶部，这事第七轮排查时实测过）⇒ 位置判据会在恢复那一瞬间把闸门
       重新打开，然后立刻把读者弹回相册（死循环、后退键形同虚设）。
       「往回走」是恢复装不出来的：恢复只有「停在上次离开的地方」一种。
       ★ lastP 初值 0 与 pRaw 首帧 ≥ 0 的关系：首帧不会误判成「往回走」。 */
    if (pRaw < lastP - 1e-3) navOk = true;
    lastP = pRaw;

    const atEnd = pRaw >= TSL.tEnd && (navOk || tailT0 > 0);
    if (atEnd && !tailT0) tailT0 = now;
    if (!atEnd && tailT0) tailT0 = 0; // 滚回链尾以上 ⇒ 收尾重置（可逆）
    atTail = atEnd && navigation !== 'failed' && retry.hidden;
    const tf = tailT0 ? Math.min(1, (now - tailT0) / TAIL_MS) : 0;
    const settle = Math.max(tl.settle, sstep(0, 0.34, tf));
    const exit = Math.max(tl.exit, sstep(0.3, 1, tf));

    /* 尺寸（首次 / 变化时） */
    if (W !== view.clientWidth || H !== view.clientHeight) resize();

    /* 双层圆角玻璃：前沿与画布用同一条路径，侧转随穿窗进度归正。
       只装饰入口；进入隧道前玻璃反光与后层共同淡出，收尾不新增出口边框。 */
    const windowShape = tslWindow(W, H, tl.zoom);
    cvs.style.clipPath = `path('${windowShape.front}')`;
    ringPath.setAttribute('d', windowShape.front);
    backPath.setAttribute('d', windowShape.back);
    edgePath.setAttribute('d', windowShape.edges);
    ring.style.opacity = String(windowShape.opacity);

    /* ---- 场景（exit = 出场穿窗进度；orbX/orbY = 拖动环视角；amb = 环绕切片；
       zoom = 入口菱窗张开进度 —— 场景用它做开场整体缩放，见第八轮 ①） ---- */
    scene?.update({ t: tl.t, settle, exit, now, pmx, pmy, orbX: obx, orbY: oby, amb, zoom: tl.zoom });
    scene?.render();

    /* ---- 穿透最后一片玻璃 ⇒ 全屏转绿（相册开场的深绿），随即切页 ---- */
    const gx = Math.min(1, Math.max(0, (exit - 0.45) / 0.5));
    const greenOp = gx * gx * (3 - 2 * gx);
    green.style.opacity = String(greenOp);

    /* ---- 署名（站主第九轮 ①）：只在「穿过菱窗之前」露面 ----
       窗口还小的时候，它是画面右下角的一枚小牌；等窗口张开到全屏、也就是
       读者真正进到隧道里那一刻，它已经淡完 ⇒ 「进入窗口后不展示」。
       hidden 与 opacity 一起写：淡完之后连那个 CC 许可外链也不再可点/可聚焦。 */
    const hudOp = 1 - sstep(0.86, 1, tl.zoom);
    hud.style.opacity = String(hudOp);
    hud.hidden = hudOp < 0.02;

    /* ---- 绿幕满屏 ⇒ 直接进相册（站主第九轮 ③：「别卡」）----
       判据是**绿幕自己**（greenOp = 1，即 exit ≥ 0.95），不再等收尾时间轴走完 ——
       旧写法满屏绿之后还要干等 ≈0.7 s 才切页，读起来就是「卡了一下」。
       navOk 为假（按返回键回来的那一档）⇒ 停在绿幕上不跳，读者往回滚即解封。 */
    if (atEnd && navOk && greenOp >= 1) beginNav();
    else {
      cancelNav();
      if (!atEnd && navigation === 'failed') {
        navigation = 'idle';
        clearWait();
      }
    }
  };

  /* ---- three 场景（懒加载：判定可跑后才 import，three chunk 与 DNA 共享）；
     场景要等 /butterfly.glb 到货，所以是 async —— 期间被 disable 掉就丢弃。 ---- */
  let scene: import('./time-slice-scene').TslScene | null = null;
  const bootScene = async () => {
    const mod = await import('./time-slice-scene');
    const s = await mod.createTslScene(cvs, palette);
    if (!stopLoop) {
      s.dispose(); // 竞态：模型还没到货装置就被停掉了
      return;
    }
    scene = s;
    resize();
    s.resize(W, H, DPR);
  };

  /* ---- 启用 / 停用（含断点切换与 reduced-motion 切换） ---- */
  let stopLoop: (() => void) | null = null;
  let gate: ReturnType<typeof createActivityGate> | null = null;
  const enable = () => {
    if (stopLoop) return;
    host.classList.add('tsl-on');
    view.hidden = false;
    resize();
    /* 场景启动失败（模型 404 / WebGL 上下文拿不到）⇒ 退回静态回退层，
       绝不留一块空画布 —— 视觉装置不该把内容挡掉。 */
    void bootScene().catch((err) => {
      console.warn('[tsl] 场景启动失败，退回静态层', err);
      disable();
    });
    gate = createActivityGate(view, {});
    stopLoop = startLoop((dt, now) => {
      if (gate && !(gate.onScreen && gate.visible)) return; // 视口外 / 切标签 ⇒ 停帧
      render(dt, now);
    });
  };
  const disable = () => {
    if (!stopLoop) return;
    stopLoop();
    stopLoop = null;
    gate?.dispose();
    gate = null;
    cancelNav();
    clearWait();
    atTail = false;
    tailT0 = 0;
    lastP = 0;
    dragging = false;
    obxT = obx = obyT = oby = 0;
    ambT = amb = 0;
    view.classList.remove('tsl-drag');
    host.classList.remove('tsl-on');
    view.hidden = true;
    hud.hidden = false; // 署名归位（停用后这一格跟着整个剧场一起消失）
    hud.style.opacity = '';
    green.style.opacity = '0';
    scene?.dispose();
    scene = null;
  };
  const sync = () => (canRun() ? enable() : disable());

  /* 页面回退（bfcache）回来时弹簧无状态、按当前滚动重定位 —— 无需处理；
     ★ 唯一要在 pageshow 里做的是**关掉自动跳转的闸门**（见上面的 navOk），
       否则从相册按返回键回来的那一瞬会被立刻弹回去。
     断点 / reduced-motion 的活切换才需要 sync。 */
  reduce.addEventListener?.('change', sync);
  wide.addEventListener?.('change', sync);
  window.addEventListener('resize', () => {
    if (stopLoop) {
      resize();
      scene?.resize(W, H, DPR);
    }
  });
  sync();
  keep(disable);
}

/* 浏览器里跑；vitest 只 import 上面的纯函数层（core 文件无 DOM），不碰 init()。 */
if (typeof document !== 'undefined') {
  init();
}

},'[data-tsl]');
