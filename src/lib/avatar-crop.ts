export type CropState = { centerX: number; centerY: number; zoom: number };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export function cropRectangle(width: number, height: number, state: CropState): { left: number; top: number; size: number } {
  if (!(width > 0 && height > 0 && Number.isFinite(width + height))) throw new Error('图片尺寸无效');
  const zoom = clamp(Number.isFinite(state.zoom) ? state.zoom : 1, 1, 4);
  const size = Math.min(width, height) / zoom;
  const centerX = Number.isFinite(state.centerX) ? state.centerX : .5;
  const centerY = Number.isFinite(state.centerY) ? state.centerY : .5;
  return { left: clamp(centerX * width - size / 2, 0, width - size), top: clamp(centerY * height - size / 2, 0, height - size), size };
}
export function moveCrop(width: number, height: number, state: CropState, dx: number, dy: number, viewport: number): CropState {
  if (!(viewport > 0 && Number.isFinite(viewport))) throw new Error('预览尺寸无效');
  const current = cropRectangle(width, height, state);
  const next = cropRectangle(width, height, {
    centerX: (current.left + current.size / 2 - dx * current.size / viewport) / width,
    centerY: (current.top + current.size / 2 - dy * current.size / viewport) / height,
    zoom: state.zoom,
  });
  return { centerX: (next.left + next.size / 2) / width, centerY: (next.top + next.size / 2) / height, zoom: Math.min(width, height) / next.size };
}
