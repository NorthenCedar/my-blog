import {
  MOUSE_MAX_X,
  MOUSE_MIN_X,
  MOUSE_RANGE_MAX,
  MOUSE_RANGE_MIN,
  MOUSE_SMOOTHING,
  TARGET_MAX,
  TARGET_MIN,
  TARGET_OFFSET,
} from './constants.ts';

/**
 * 主题开关的两端（targetMouseX 空间）—— 左 = 亮色，右 = 暗色。
 * 由 updateTargetMouseX 的映射算出：MOUSE_MIN_X→TARGET_MIN+TARGET_OFFSET，
 * MOUSE_MAX_X→TARGET_MAX+TARGET_OFFSET。
 */
export const LIGHT_END = TARGET_MIN + TARGET_OFFSET; // -1.2
export const DARK_END = TARGET_MAX + TARGET_OFFSET; // 0.5

export class EventHandler {
  private canvas: HTMLCanvasElement;
  private mouseX = 1.0;
  private targetMouseX = 1.0;
  private isMouseDown = false;
  // ★ 本站加：松手吸附
  private snapGoal: number | null = null;
  private snapDone: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isMouseDown = false;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.handlePointerDown(e.clientX);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isMouseDown) return;
      this.handlePointerMove(e.clientX);
    });

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handlePointerDown(touch.clientX);
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.isMouseDown) return;
      const touch = e.touches[0];
      this.handlePointerMove(touch.clientX);
    });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.isMouseDown = false;
    });
  }

  private handlePointerDown(clientX: number) {
    this.isMouseDown = true;
    this.updateTargetMouseX(clientX);
  }

  private handlePointerMove(clientX: number) {
    this.updateTargetMouseX(clientX);
  }

  private updateTargetMouseX(clientX: number) {
    const rect = this.canvas.getBoundingClientRect();
    const normalizedX = (clientX - rect.left) / rect.width;
    const clampedX = Math.max(MOUSE_MIN_X, Math.min(MOUSE_MAX_X, normalizedX));
    this.targetMouseX =
      ((clampedX - MOUSE_RANGE_MIN) / (MOUSE_RANGE_MAX - MOUSE_RANGE_MIN)) *
        (TARGET_MAX - TARGET_MIN) +
      TARGET_OFFSET;
  }

  /** ★ 本站加：按当前主题把手柄直接放到对应端（首帧即正确，无滑动穿帮） */
  setInitial(x: number) {
    this.mouseX = x;
    this.targetMouseX = x;
    this.snapGoal = null;
  }

  /** ★ 本站加：松手后吸附到 x，落定调 onDone（主题提交） */
  snapTo(x: number, onDone?: () => void) {
    this.snapGoal = x;
    this.snapDone = onDone ?? null;
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

  get isPointerDown() {
    return this.isMouseDown;
  }
}
