/** 输入已经变换到摄像机空间的中段；端头始终伸出视口，不能继承雕塑的缩放。 */
export function extendChainToEdges(points: number[][], halfWidth: number, margin = .65): number[][] {
  if (points.length < 2 || !Number.isFinite(halfWidth) || halfWidth <= 0) throw new Error('铁链需要有效的锚点和视口宽度');
  const extend = (anchor: number[], next: number[], side: number) => {
    const edgeX = side * Math.max(halfWidth + margin, Math.abs(anchor[0]) + margin);
    const span = Math.max(.25, Math.abs(anchor[0] - next[0]));
    const distance = Math.abs(edgeX - anchor[0]);
    // 接近竖直的切线需要限幅，避免极窄屏或旋转后的异常尖刺。
    const slope = Math.max(-1.2, Math.min(1.2, (anchor[1] - next[1]) / span));
    return [edgeX, anchor[1] + slope * distance, anchor[2]];
  };
  return [extend(points[0], points[1], -1), ...points.map(point => [...point]), extend(points.at(-1)!, points.at(-2)!, 1)];
}
