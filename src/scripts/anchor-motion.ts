/** 文章目录与日志刻线共用的页内跳转节奏。 */
export function isPlainAnchorClick(event: MouseEvent) {
  return !event.defaultPrevented && event.button === 0 &&
    !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export const verticalOffset = (y: number) => `0px ${y}px`;

type Decorations = (entering: boolean, timing: KeyframeAnimationOptions) => Animation[];

export function createAnchorMotion(doc: Document, movingContent: HTMLElement | null) {
  const win = doc.defaultView!;
  const reduce = win.matchMedia('(prefers-reduced-motion: reduce)');
  let flight: Animation[] | undefined;

  const cancel = () => {
    const animations = flight;
    flight = undefined;
    animations?.forEach(animation => animation.cancel());
  };

  const travel = async (areas: HTMLElement[], direction: number, land: (behavior: ScrollBehavior) => void, decorate?: Decorations) => {
    // 连点时从当前画面接续，避免淡到一半又恢复原位。
    const from = areas.map(area => {
      const { opacity, translate } = win.getComputedStyle(area);
      return { opacity, translate };
    });
    cancel();
    win.scrollTo({ top: win.scrollY, behavior: 'instant' });
    const exit = { duration: 110, easing: 'ease-out', fill: 'both' } as const;
    const enter = { duration: 180, easing: 'ease-out', fill: 'both' } as const;
    let animations = areas.map((area, index) =>
      area.animate([from[index], { opacity: 0, translate: verticalOffset(-16 * direction) }], exit));
    if (decorate) animations.push(...decorate(false, exit));
    flight = animations;
    try {
      await Promise.all(animations.map(animation => animation.finished));
      if (flight !== animations) return;
      // 同一帧归零位移，用标题原本的几何定位，再接下一段。
      animations.forEach(animation => animation.cancel());
      land('instant');
      const arrival = areas.map(area => area.animate([
        { opacity: 0, translate: verticalOffset(16 * direction) }, { opacity: 1, translate: verticalOffset(0) },
      ], enter));
      if (decorate) arrival.push(...decorate(true, enter));
      const now = doc.timeline?.currentTime;
      if (now != null) arrival.forEach(animation => { animation.startTime = now; });
      flight = animations = arrival;
      await Promise.all(animations.map(animation => animation.finished));
    } catch {
      // 新跳转或主动滚动会取消失效的动画。
    } finally {
      if (flight === animations) cancel();
    }
  };

  return {
    reduce,
    cancel,
    get active() { return !!flight; },
    jump(target: HTMLElement, areas: HTMLElement[], land: (behavior: ScrollBehavior) => void, prepare?: (direction: number) => Decorations) {
      const scroller = doc.scrollingElement;
      const max = scroller ? scroller.scrollHeight - scroller.clientHeight : Infinity;
      const inset = parseFloat(win.getComputedStyle(target).scrollMarginTop) || 0;
      const padding = scroller ? parseFloat(win.getComputedStyle(scroller).scrollPaddingTop) || 0 : 0;
      const translate = flight && movingContent ? win.getComputedStyle(movingContent).translate : '';
      const shift = parseFloat((translate ?? '').split(' ')[1]) || 0;
      const end = Math.max(0, Math.min(max, win.scrollY + target.getBoundingClientRect().top - inset - padding - shift));
      const distance = end - win.scrollY;
      const viewport = win.visualViewport?.height ?? win.innerHeight;
      if (!reduce.matches && Math.abs(distance) > viewport * 7 &&
          areas.length && areas.every(area => typeof area.animate === 'function')) {
        const direction = Math.sign(distance);
        void travel(areas, direction, land, prepare?.(direction));
      } else {
        cancel();
        land(reduce.matches ? 'instant' : 'smooth');
      }
    },
  };
}
