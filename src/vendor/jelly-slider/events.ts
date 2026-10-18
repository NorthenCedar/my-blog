import {
  DARK_END,
  LIGHT_END,
  MOUSE_MAX_X,
  MOUSE_MIN_X,
  MOUSE_RANGE_MAX,
  MOUSE_RANGE_MIN,
  MOUSE_SMOOTHING,
} from './constants.ts';

/**
 * 主题开关的两端（targetMouseX 空间）—— 左 = 亮色，右 = 暗色。
 * ★ 2026-10-17 第二轮：定义搬进 constants.ts（理由与取值见那里的注释），
 *   这里只转出，保持既有 `import { LIGHT_END } from './events.ts'` 可用。
 *   拖动映射现在直接落在这两端上，百分比取片也读它们（scene.ts）—— 单一来源。
 */
export { LIGHT_END, DARK_END };

export class EventHandler {
  private canvas: HTMLCanvasElement;
  private mouseX = 1.0;
  private targetMouseX = 1.0;
  private isMouseDown = false;
  /**
   * ★ 本站加：本次按下有没有抓在软条上。`pointerdown` 时定，**松开后保留**
   * 到下一次按下 —— `theme-toggle.ts` 靠它区分"拖拽"与"点了空白处"。
   */
  private grabbed = false;
  /** 正在拖的那根指针（多指触摸时只认第一根按下的，别让第二根抢走手柄） */
  private activePointerId: number | null = null;
  // ★ 本站加：松手吸附
  private snapGoal: number | null = null;
  private snapDone: (() => void) | null = null;
  /** ★ 本站加：静止停帧后，新的交互把渲染循环唤醒（见 scene.ts 的 wake） */
  wake: (() => void) | null = null;

  /**
   * ★ 本站加（2026-10-17 第七轮）：命中测试 —— 返回 true 才算"抓在软条上"。
   *
   * 由 `scene.ts` 注入（只有它知道相机与滑块的实时形状，见那里的 `hitTest`）。
   * 没注入时**退回原版行为**（整块画布都能抓）—— 这个类被单独拿去用时不会坏，
   * 但我们这枚开关一定会注入：画布 220×136 里只有中间一条软条，
   * 其余全是空地面，"点哪都能拖"就是站主报的第一个 bug。
   */
  hitTest: ((clientX: number, clientY: number) => boolean) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    /* ★★ 2026-10-17 第七轮（站主）：
       「1. 修一下点原来那个框内部都能拖动软条的 bug，要求是只有点软条时才能拖动。
        2. 修一下拖动软条时鼠标一离开原来那个框的区域软条就不动的 bug」

      两条 bug 都出在这一个方法里，一起改：

      bug 1 —— 原来 `mousedown` 一进来就 `isMouseDown = true`，画布 220×136 里
        只有中间一条软条、其余全是空地面 ⇒ 点画布任意处都能把手柄拽走。
        ⇒ 现在先问 `hitTest`：没点在软条上就**不进入拖拽**（点按切主题仍然保留）。

      bug 2 —— 两个原因叠在一起：`mouseleave` 直接把 `isMouseDown` 清掉，
        而 `mousemove` 只挂在 canvas 上，指针一出界就没有 mousemove 可派发了。
        ⇒ `pointermove` / `pointerup` 改挂 **window**（只在按下期间处理，按
          pointerId 过滤），再加 `setPointerCapture` 双保险。
        ⚠ **别把 `mouseleave → isMouseDown = false` 那条"顺手再清一次"加回来** ——
          它就是 bug 2 本身。

      ⚠ 为什么整块换成 Pointer Events：原来 mouse 与 touch 两套并存，行为不一致
        （touch 有 preventDefault、mouse 没有 exit 之外的兜底）。指针事件一套覆盖
        鼠标/触摸/触控笔，且有 pointerId 与 capture。`canvas` 上已有
        `touch-action: none`（ThemeToggle.astro），所以不必再靠 preventDefault 防滚动。 */
    this.canvas.addEventListener('pointerdown', (e) => {
      // 只认主键（右键/中键不拖）。触摸事件这里也是 0。
      if (e.button > 0) return;
      // 已经在拖了就忽略第二根手指
      if (this.activePointerId !== null) return;

      const hit = this.hitTest ? this.hitTest(e.clientX, e.clientY) : true;
      if (!hit) {
        this.grabbed = false;
        return; // ← 没点在软条上：不进拖拽，交给 theme-toggle.ts 当点按处理
      }

      this.grabbed = true;
      this.activePointerId = e.pointerId;
      this.isMouseDown = true;
      this.updateTargetMouseX(e.clientX);
      this.wake?.();
      e.preventDefault();

      /* 捕获：指针移出画布后事件仍然回得来（bug 2）。
         ⚠ 必须 try/catch —— 对一个已经抬起的 pointerId 调它会抛 NotFoundError，
           合成出来的 PointerEvent 也会（没有活跃指针）。有 window 监听兜底，抛了也不怕。 */
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* 无所谓：window 上的 pointermove 才是主通路 */
      }
    });

    // 挂在 window 而不是 canvas：拖出画布（甚至拖出视口再回来）都要继续跟手
    window.addEventListener('pointermove', (e) => {
      if (!this.isMouseDown || e.pointerId !== this.activePointerId) return;
      this.handlePointerMove(e.clientX);
    });

    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointerId) return;
      this.isMouseDown = false;
      this.activePointerId = null;
      // grabbed 保留：theme-toggle.ts 在同一个 pointerup 里读它（监听注册得比这里晚）
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* 已经释放 / 从未捕获 */
      }
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  private handlePointerMove(clientX: number) {
    this.updateTargetMouseX(clientX);
  }

  private updateTargetMouseX(clientX: number) {
    const rect = this.canvas.getBoundingClientRect();
    const normalizedX = (clientX - rect.left) / rect.width;
    /* ⚠ 这里**不做**"出界就松开"：拖到画布外时手柄仍跟手（bug 2），
       只是把目标值钳在有效区间上 —— 钳位本身就是"拖到头"的语义。 */
    const clampedX = Math.max(MOUSE_MIN_X, Math.min(MOUSE_MAX_X, normalizedX));
    this.targetMouseX =
      ((clampedX - MOUSE_RANGE_MIN) / (MOUSE_RANGE_MAX - MOUSE_RANGE_MIN)) *
        (DARK_END - LIGHT_END) +
      LIGHT_END;
  }

  /** ★ 本站加：按当前主题把手柄直接放到对应端（首帧即正确，无滑动穿帮） */
  setInitial(x: number) {
    this.mouseX = x;
    this.targetMouseX = x;
    this.snapGoal = null;
    this.wake?.();
  }

  /** ★ 本站加：松手后吸附到 x，落定调 onDone（主题提交） */
  snapTo(x: number, onDone?: () => void) {
    this.snapGoal = x;
    this.snapDone = onDone ?? null;
    this.wake?.();
  }

  update() {
    if (this.isMouseDown) {
      this.mouseX += (this.targetMouseX - this.mouseX) * MOUSE_SMOOTHING;
      this.snapGoal = null; // 抓起就取消未完成的吸附
      this.snapDone = null;
    } else if (this.snapGoal !== null) {
      this.mouseX += (this.snapGoal - this.mouseX) * 0.2;
      if (Math.abs(this.snapGoal - this.mouseX) < 0.002) {
        this.mouseX = this.snapGoal;
        this.snapGoal = null;
        const done = this.snapDone;
        this.snapDone = null;
        done?.();
      }
    }
  }

  get currentMouseX() {
    return this.mouseX;
  }

  /**
   * ★ 本站加（2026-10-18 第十轮）：**指针的即时位置**（未平滑）。
   *
   * 松手判定必须读这个，**不能**读 `currentMouseX`：
   *   `mouseX` 每帧只朝 `targetMouseX` 推进 8%（MOUSE_SMOOTHING），松手那一刻两者
   *   通常还差得很远 ⇒ 拿平滑值判"过没过中点"，量到的是**软条还没追上时的位置**。
   *   实测同一手势、同一落点（moved 都是 72.6 px）：
   *     快拖（40ms/步）松手时 mouseX = 0.3152 < MID 0.45 ⇒ 弹回左边；
   *     慢拖（300ms/步）松手时 mouseX = 0.6536 > MID     ⇒ 吸到右边。
   *   拖得越快越容易判反 —— 站主看到的正是"拖过一半却弹回左边，只有点按才生效"。
   *
   * ⚠ 只在**松手那一帧**读它。渲染循环里必须继续用 `currentMouseX`：
   *   软条该有的迟滞手感正是靠那个平滑值来的。
   */
  get pointerTargetX() {
    return this.targetMouseX;
  }

  get isPointerDown() {
    return this.isMouseDown;
  }

  /** ★ 本站加：本次按下是否抓在软条上（松开后仍保留，见字段注释） */
  get didGrab() {
    return this.grabbed;
  }

  /** ★ 本站加：吸附动画是否还在跑（scene.ts 据此决定是否继续出帧） */
  get isSnapping() {
    return this.snapGoal !== null;
  }
}
