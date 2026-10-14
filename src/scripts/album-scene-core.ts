export type Camera = { x: number; y: number; scale: number };
export type Placement = { x: number; y: number; angle: number; depth: number; width: number; height: number; sliceWidth: number };
export function coastStep(camera: Camera, velocity: { x: number; y: number }, dt: number) {
  const damping = 2.15;
  const decay = Math.exp(-damping * Math.max(0, dt));
  return { camera: { ...camera, x: camera.x + velocity.x * (1 - decay) / damping, y: camera.y + velocity.y * (1 - decay) / damping },
    velocity: { x: velocity.x * decay, y: velocity.y * decay } };
}
export function sliceThrowTarget(focus: number, speed: number, step: number, count: number) {
  const travel = clamp(-finite(speed) / Math.max(1, finite(step, 390)) * 0.38, -3, 3);
  return Math.round(clampFocus(focus + travel, count));
}
/** 滚轮的正方向看下一张（照片向左），并统一像素、行、页三种浏览器单位。 */
export function sliceWheelImpulse(delta: number, mode: number, viewportHeight: number) {
  const pixels = finite(delta) * (mode === 1 ? 16 : mode === 2 ? Math.max(1, finite(viewportHeight, 800)) : 1);
  return clamp(pixels / 25, -8, 8);
}
/** 散片上滚放大；单次增量封顶，避免页单位或异常设备让倍率突然跳变。 */
export function scatterWheelFactor(delta: number, mode: number, viewportHeight: number) {
  const pixels = finite(delta) * (mode === 1 ? 16 : mode === 2 ? Math.max(1, finite(viewportHeight, 800)) : 1);
  return Math.exp(-clamp(pixels, -200, 200) * 0.0015);
}
export function coastSliceWheel(focus: number, velocity: number, dt: number, count: number) {
  const damping = 4;
  const decay = Math.exp(-damping * Math.max(0, dt));
  const nextFocus = clampFocus(focus + finite(velocity) * (1 - decay) / damping, count);
  const nextVelocity = finite(velocity) * decay;
  const atEnd = nextFocus === 0 && nextVelocity < 0 || nextFocus === Math.max(0, count - 1) && nextVelocity > 0;
  return { focus: nextFocus, velocity: atEnd ? 0 : nextVelocity };
}
export function focusIntent(event: 'pointer' | 'Tab' | 'key' | 'focus', pending = false) {
  return { pending: event === 'Tab', center: event === 'focus' && pending };
}
const finite = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** 身份取自源文件名，不读照片总数；尾部追加不会重新分配旧槽。 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function scatterLayout(albumId: string, keys: readonly string[]): Placement[] {
  const seen = new Set<string>();
  const occupied: { x: number; y: number; halfX: number; halfY: number }[] = [];
  return keys.map((key) => {
    if (seen.has(key)) throw new Error(`相册「${albumId}」重复图源：${key}`);
    seen.add(key);
    const random = (channel: string) => hash(`${albumId}\0${key}\0${channel}`) / 0xffffffff;
    const width = 180 + Math.round(random('size') * 320);
    const height = Math.min(460, Math.round(width * (0.82 + random('height') * 0.4)));
    const angle = random('tilt') * 28 - 14;
    const a = angle * Math.PI / 180;
    const halfX = (Math.abs(Math.cos(a)) * (width + 24) + Math.abs(Math.sin(a)) * (height + 42)) / 2;
    const halfY = (Math.abs(Math.sin(a)) * (width + 24) + Math.abs(Math.cos(a)) * (height + 42)) / 2;
    for (let attempt = 0; ; attempt++) {
      // 极坐标候选与逐片拒绝采样：不按格子排，也不依赖相册总张数。
      const theta = random(`${attempt}/angle`) * Math.PI * 2;
      const radius = 470 + random(`${attempt}/radius`) * 360 + Math.floor(attempt / 12) * 220;
      const x = Math.cos(theta) * radius;
      const y = Math.sin(theta) * radius * (0.7 + random(`${attempt}/aspect`) * 0.15);
      if (Math.abs(x) < 340 + halfX && Math.abs(y) < 150 + halfY) continue;
      const blocked = occupied.some((q) => {
        const overlap = Math.max(0, halfX + q.halfX - Math.abs(x - q.x)) * Math.max(0, halfY + q.halfY - Math.abs(y - q.y));
        return overlap > Math.min(halfX * halfY, q.halfX * q.halfY) * 4 * 0.08;
      });
      if (blocked) continue;
      occupied.push({ x, y, halfX, halfY });
      return { x, y, width, height, angle, depth: random('depth') * 0.18 - 0.09,
        sliceWidth: 260 + Math.round(random('slice') * 220) };
    }
  });
}

export function slicePose(index: number, focus: number) {
  const d = index - finite(focus);
  const opacity = clamp((3.8 - Math.abs(d)) / 1.8, 0, 1);
  return {
    x: d * 390,
    y: d === 0 ? 0 : -d * 38,
    z: d === 0 ? 0 : -Math.abs(d) * 220,
    rotateY: d === 0 ? 0 : clamp(-d * 16, -48, 48),
    opacity,
    visible: opacity > 0,
  };
}

export function clampFocus(value: number, count: number): number {
  return clamp(finite(value), 0, Math.max(0, count - 1));
}

export function zoomAt(camera: Camera, point: { x: number; y: number }, factor: number): Camera {
  const oldScale = clampZoom(camera.scale);
  const scale = clampZoom(oldScale * finite(factor, 1));
  const ratio = scale / oldScale;
  return {
    x: point.x - (point.x - finite(camera.x)) * ratio,
    y: point.y - (point.y - finite(camera.y)) * ratio,
    scale,
  };
}

export function clampZoom(scale: number) {
  return clamp(finite(scale, 1), 0.25, 1.6);
}

/** 散片滚轮缩放逐帧收尾：按真实 dt 指数逼近目标倍率，落定即报完成。 */
export function scatterZoomStep(camera: Camera, target: { scale: number; point: { x: number; y: number } }, dt: number) {
  const desired = clampZoom(target.scale);
  const blend = 1 - Math.exp(-14 * Math.min(0.08, Math.max(0, finite(dt))));
  const scale = Math.abs(desired - finite(camera.scale, 1)) < 0.0005 ? desired : finite(camera.scale, 1) + (desired - finite(camera.scale, 1)) * blend;
  const factor = finite(camera.scale, 1) > 0 ? scale / finite(camera.scale, 1) : 1;
  const point = { x: finite(target.point.x), y: finite(target.point.y) };
  return {
    camera: { x: point.x - (point.x - finite(camera.x)) * factor, y: point.y - (point.y - finite(camera.y)) * factor, scale },
    done: scale === desired,
  };
}

export function clampCamera(camera: Camera, bounds: { x: number; y: number }): Camera {
  const scale = clamp(finite(camera.scale, 1), 0.25, 1.6);
  return {
    x: clamp(finite(camera.x), -bounds.x * scale, bounds.x * scale),
    y: clamp(finite(camera.y), -bounds.y * scale, bounds.y * scale),
    scale,
  };
}
