/** 构建期投影：保留背面经过的距离，但只输出连续可见的光槽。
 * 每段共用整圈相位，光点被接头/前侧管道挡住后不会从下一段重新开始。
 */
export function projectRingLight(points: number[][]) {
  const segments: { d: string; offset: number }[] = [];
  if (points.length === 0) return { length: 0, segments };
  let length = 0;
  let offset = 0;
  let visible: number[][] = [];
  const flush = () => {
    if (visible.length > 1) {
      segments.push({
        d: visible.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' '),
        offset,
      });
    }
    visible = [];
  };
  const loop = [...points, points[0]];
  for (let i = 0; i < loop.length; i++) {
    const point = loop[i];
    if (i > 0) length += Math.hypot(point[0] - loop[i - 1][0], point[1] - loop[i - 1][1]);
    if (!point[3]) {
      flush();
    } else {
      if (visible.length === 0) offset = length;
      visible.push(point);
    }
  }
  flush();
  return { length, segments };
}
