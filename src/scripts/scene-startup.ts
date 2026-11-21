/** 先让静态画面完成绘制，再在空闲时执行场景的启动步骤。 */
export function scheduleSceneStartup(start: () => void): () => void {
  let frame = 0, idle: number | undefined;
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(start, { timeout: 750 });
      else start();
    });
  });
  return () => {
    cancelAnimationFrame(frame);
    if (idle !== undefined) cancelIdleCallback(idle);
  };
}
