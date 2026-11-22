// @vitest-environment happy-dom
/* 说说页 · 多光标打字换行与 O(1) Caret 缓存回归测试 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initTalksBuild } from '../src/scripts/talks-build';

const makeRect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON() {
      return {};
    },
  }) as DOMRect;

const toRectList = (rects: DOMRect[]): DOMRectList =>
  Object.assign([...rects], {
    item: (i: number) => rects[i] ?? null,
  }) as unknown as DOMRectList;

function createCanvasHarness() {
  const ibeamMoves: { x: number; y: number; ts: number }[] = [];
  const caretBars: { x: number; top: number; h: number; ts: number }[] = [];
  const spriteTools = new WeakMap<HTMLCanvasElement, 'arrow-like' | 'ibeam' | 'cross'>();
  let currentTs = 0;

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const canvasEl = this;
    const isMain = canvasEl.classList?.contains('tb-layer');
    let lastDrawKind: 'arrow-like' | 'ibeam' | 'cross' = 'arrow-like';

    return {
      setTransform() {},
      clearRect() {},
      scale() {},
      translate() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {
        if (!isMain) {
          lastDrawKind = 'arrow-like';
          spriteTools.set(canvasEl, lastDrawKind);
        }
      },
      quadraticCurveTo() {
        if (!isMain) {
          lastDrawKind = 'ibeam';
          spriteTools.set(canvasEl, lastDrawKind);
        }
      },
      arc() {},
      rect() {},
      roundRect() {},
      fill() {},
      stroke() {
        if (!isMain && lastDrawKind !== 'ibeam' && !spriteTools.has(canvasEl)) {
          spriteTools.set(canvasEl, 'cross');
        }
      },
      fillRect(x: number, y: number, w: number, h: number) {
        if (isMain && w === 1.5 && h >= 10) {
          caretBars.push({ x, top: y, h, ts: currentTs });
        }
      },
      strokeRect() {},
      fillText() {},
      measureText: () => ({ width: 28 }),
      save() {},
      restore() {},
      drawImage(img: CanvasImageSource, dx: number, dy: number) {
        if (!isMain || !(img instanceof HTMLCanvasElement)) return;
        if (spriteTools.get(img) === 'ibeam') {
          ibeamMoves.push({ x: dx + 10, y: dy + 8, ts: currentTs });
        }
      },
    } as unknown as CanvasRenderingContext2D;
  });

  return {
    ibeamMoves,
    caretBars,
    setTs: (ts: number) => {
      currentTs = ts;
    },
  };
}

describe('talks-build · 多行换行光标与 caret 行为', () => {
  const origW = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const origH = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  const origScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
  const origMatchMedia = window.matchMedia;

  afterEach(() => {
    document.dispatchEvent(new Event('astro:before-swap'));
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (origW) Object.defineProperty(window, 'innerWidth', origW);
    if (origH) Object.defineProperty(window, 'innerHeight', origH);
    if (origScrollY) Object.defineProperty(window, 'scrollY', origScrollY);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: origMatchMedia });
    document.documentElement.className = '';
    document.body.replaceChildren();
  });

  function setupTalkEnv(opts: {
    vw: number;
    vh: number;
    text: string;
    layout: (idx: number, baseTop: number) => DOMRect[];
    boxHeight: number;
    reducedMotion?: boolean;
  }) {
    vi.useFakeTimers();
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: opts.vw },
      innerHeight: { configurable: true, value: opts.vh },
      scrollY: { configurable: true, writable: true, value: 0 },
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({
        matches: Boolean(opts.reducedMotion && q.includes('prefers-reduced-motion')),
        media: q,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      }),
    });

    document.body.innerHTML = `<ol data-talks-build><li><div class="body" data-build="text">${opts.text}</div></li></ol>`;
    const bodyEl = document.querySelector<HTMLElement>('[data-build="text"]')!;

    let baseTop = 100;
    let unitReadCount = 0;
    const spans = () => Array.from(bodyEl.querySelectorAll('span'));

    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'SPAN' && this.parentElement === bodyEl) {
        unitReadCount++;
        const idx = spans().indexOf(this);
        return toRectList(opts.layout(idx, baseTop));
      }
      return toRectList([this.getBoundingClientRect()]);
    });

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === bodyEl) return makeRect(40, baseTop, opts.vw - 80, opts.boxHeight);
      if (this.tagName === 'SPAN' && this.parentElement === bodyEl) {
        unitReadCount++;
        const idx = spans().indexOf(this);
        const rects = opts.layout(idx, baseTop);
        const l = Math.min(...rects.map((r) => r.left));
        const t = Math.min(...rects.map((r) => r.top));
        const r = Math.max(...rects.map((x) => x.right));
        const b = Math.max(...rects.map((x) => x.bottom));
        return makeRect(l, t, r - l, b - t);
      }
      return makeRect(0, 0, 0, 0);
    });

    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const canvas = createCanvasHarness();
    initTalksBuild();

    const stepFrames = (count: number, stepMs = 16, startTs = 1000) => {
      let ts = startTs;
      for (let i = 0; i < count; i++) {
        const batch = frames.splice(0);
        if (!batch.length) break;
        canvas.setTs(ts);
        for (const fn of batch) fn(ts);
        ts += stepMs;
      }
      return ts;
    };

    return {
      bodyEl,
      canvas,
      stepFrames,
      setBaseTop(nextTop: number) {
        baseTop = nextTop;
      },
      getUnitReadCount: () => unitReadCount,
      spanCount: () => spans().length,
    };
  }

  it('窄屏多行打字时，I-beam 光标与闪烁竖线 Y 逐行下移且无同高度回跳', () => {
    // 26 个字符单元，第 0..9 字在首行(top=100)，第 10..17 在第 2 行(top=130，含跨行长词)，第 18..25 在第 3 行(top=160)
    const text = '第一行文字测试数据第ab wrapword第二行测试文字继续第三行收尾啦';
    const env = setupTalkEnv({
      vw: 360,
      vh: 640,
      text,
      boxHeight: 84,
      layout: (idx, baseTop) => {
        if (idx < 10) return [makeRect(40 + idx * 14, baseTop, 14, 20)];
        if (idx === 10) {
          // 跨行单词：前半截在第 1 行末尾，后半截折到第 2 行开头，验证取尾行片段
          return [makeRect(180, baseTop, 28, 20), makeRect(40, baseTop + 30, 36, 20)];
        }
        if (idx < 18) return [makeRect(40 + (idx - 10) * 14, baseTop + 30, 14, 20)];
        return [makeRect(40 + (idx - 18) * 14, baseTop + 60, 14, 20)];
      },
    });

    // 从 440ms 起步：赶路(~160ms) + 拉框(~420ms) 后正好在 1020ms 进入打字阶段，整段跨 3 行打字落在 [1000, 1499] 亮窗内
    env.stepFrames(100, 16, 440);

    const distinctCaretTops = [...new Set(env.canvas.caretBars.map((b) => Math.round(b.top)))];
    expect(distinctCaretTops, '闪烁竖线纵坐标必须跨过多行').toEqual([100, 130, 160]);

    // 验证 I-beam 光标纵坐标同样进入三行中心（top + 10）
    const typedIbeamYs = env.canvas.ibeamMoves
      .filter((m) => m.y >= 109 && m.y <= 171)
      .map((m) => Math.round(m.y));
    expect(new Set(typedIbeamYs).size, 'I-beam 光标不能锁死在首行高度').toBeGreaterThanOrEqual(3);
    expect(typedIbeamYs).toContain(110);
    expect(typedIbeamYs).toContain(140);
    expect(typedIbeamYs).toContain(170);

    // 任意相邻闪烁竖线帧之间，若 X 大幅回跳到左侧（换行），Y 必须同步发生变化
    for (let i = 1; i < env.canvas.caretBars.length; i++) {
      const prev = env.canvas.caretBars[i - 1];
      const cur = env.canvas.caretBars[i];
      if (cur.x < prev.x - 30) {
        expect(cur.top, `换行时 X 从 ${prev.x} 回到 ${cur.x}，但 Y 停留在 ${cur.top}`).toBeGreaterThan(prev.top + 10);
      }
    }

    // 性能：单位矩形读取次数按“显字变化次数”计为 O(1)，绝不每帧遍历全段文字
    expect(env.getUnitReadCount()).toBeLessThan(env.spanCount() * 3);
  });

  it('桌面单行打字时，光标与竖线稳定保持在同一行水平推进', () => {
    const env = setupTalkEnv({
      vw: 1440,
      vh: 900,
      text: '桌面端单行短短的一句说说展示',
      boxHeight: 24,
      layout: (idx, baseTop) => [makeRect(80 + idx * 16, baseTop, 16, 20)],
    });

    env.stepFrames(100, 16, 440);

    const tops = new Set(env.canvas.caretBars.map((b) => Math.round(b.top)));
    expect(tops.size).toBe(1);
    expect([...tops][0]).toBe(100);
    const xs = env.canvas.caretBars.map((b) => b.x);
    expect(xs.length).toBeGreaterThan(3);
    expect(xs[xs.length - 1]).toBeGreaterThan(xs[0]);
  });

  it('上滚撤回时，光标与竖线从末行逐行退回首行', () => {
    const env = setupTalkEnv({
      vw: 360,
      vh: 640,
      text: '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉',
      boxHeight: 60,
      layout: (idx, baseTop) => {
        if (idx < 10) return [makeRect(40 + idx * 14, baseTop, 14, 20)];
        if (idx < 20) return [makeRect(40 + (idx - 10) * 14, baseTop + 30, 14, 20)];
        return [makeRect(40 + (idx - 20) * 14, baseTop + 60, 14, 20)];
      },
    });

    // 先正向搭完 3 行（440ms 起步，整段打字落在 [1000, 1499] 亮窗内）
    const tsAfterBuild = env.stepFrames(100, 16, 440);
    expect(env.canvas.caretBars.some((b) => Math.round(b.top) === 160)).toBe(true);

    // 清空记录并上滚，令该块滚到视口底线之下 (by > 640 * 0.92 = 588.8) 触发撤回
    // 对齐到 *020ms 起步，使赶路 + 退格全部落在同一段 [..000, ..499] 闪烁亮窗内
    env.canvas.caretBars.length = 0;
    env.canvas.ibeamMoves.length = 0;
    env.setBaseTop(600);
    Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value: -500 });
    window.dispatchEvent(new Event('scroll'));

    const withdrawStart = Math.ceil((tsAfterBuild + 200) / 1000) * 1000 + 20;
    env.stepFrames(60, 16, withdrawStart);

    const revTops = env.canvas.caretBars.map((b) => Math.round(b.top));
    expect(revTops.length, '撤回过程也应记录到打字退格轨迹').toBeGreaterThan(0);
    const firstIdxLine3 = revTops.indexOf(660);
    const firstIdxLine1 = revTops.indexOf(600);
    expect(firstIdxLine3).toBeGreaterThanOrEqual(0);
    expect(firstIdxLine1).toBeGreaterThan(firstIdxLine3);

    const revIbeamYs = env.canvas.ibeamMoves.map((m) => Math.round(m.y));
    expect(revIbeamYs.indexOf(610)).toBeGreaterThan(revIbeamYs.indexOf(670));
  });

  it('系统开启 prefers-reduced-motion: reduce 时不注入构建层且正文直接可见', () => {
    const env = setupTalkEnv({
      vw: 360,
      vh: 640,
      text: '减少动态效果直接可读',
      boxHeight: 40,
      layout: (idx, baseTop) => [makeRect(40 + idx * 14, baseTop, 14, 20)],
      reducedMotion: true,
    });

    expect(document.querySelector('.tb-layer')).toBeNull();
    expect(document.documentElement.classList.contains('build-ok')).toBe(false);
    expect(env.bodyEl.style.opacity).not.toBe('0');
    expect(env.bodyEl.querySelectorAll('span').length).toBe(0);
  });
});

describe('talks-build · 源码静态护栏', () => {
  it('不再把打字竖线与 I-beam 光标纵坐标硬编码锁死在首行', () => {
    const src = readFileSync(join(process.cwd(), 'src/scripts/talks-build.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');

    expect(code).not.toContain('g.by + 2');
    expect(code).not.toMatch(/y \+ Math\.min\(g\.lh \|\| 18, h\) \* 0\.55/);
    expect(code).toContain('getClientRects');
    expect(code).toContain('function caret(g: Seg');
  });
});
