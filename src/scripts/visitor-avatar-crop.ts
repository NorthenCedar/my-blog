import { cropRectangle, moveCrop, type CropState } from '../lib/avatar-crop';
import { node } from './visitor-client';

/** 只在账户页选图后加载；确认前不上传，预览与最终 PNG 使用同一个取景矩形。 */
export async function cropAvatar(file: File): Promise<Blob | null> {
  if (file.size > 8 * 1024 * 1024) throw new Error('图片超过 8 MiB，请换一张小一点的图片。');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('图片没能读取，请换一张静态图片试试。'); }
  if (bitmap.width * bitmap.height > 40000000) { bitmap.close(); throw new Error('图片像素过大，请先缩小再上传。'); }
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const dialog = node('dialog', 'visitor-dialog visitor-crop');
      const title = node('h2', '', '调整头像'); title.id = `avatar-crop-${crypto.randomUUID()}`;
      const help = node('p', 'visitor-hint', '拖动图片或使用方向键调整位置，再缩放到合适大小。圆形区域就是头像显示的范围。'); help.id = `${title.id}-help`;
      dialog.setAttribute('aria-labelledby', title.id);
      const canvas = node('canvas', 'visitor-crop-preview'); canvas.width = canvas.height = 256; canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '头像裁切预览，可拖动或按方向键移动'); canvas.setAttribute('aria-describedby', help.id);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('浏览器无法显示图片预览，请换一个浏览器试试。')); return; }
      let state: CropState = { centerX: .5, centerY: .5, zoom: 1 };
      const zoomLabel = node('label', 'visitor-crop-zoom', '缩放');
      const zoom = node('input'); zoom.type = 'range'; zoom.min = '1'; zoom.max = '4'; zoom.step = '.01'; zoom.value = '1';
      const zoomValue = node('output', '', '100%'); zoomLabel.append(zoom, zoomValue);
      const draw = () => {
        const r = cropRectangle(bitmap.width, bitmap.height, state);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, r.left, r.top, r.size, r.size, 0, 0, canvas.width, canvas.height);
        zoomValue.value = `${Math.round(state.zoom * 100)}%`;
      };
      const move = (dx: number, dy: number) => { state = moveCrop(bitmap.width, bitmap.height, state, dx, dy, canvas.getBoundingClientRect().width || 256); draw(); };
      let drag: { id: number; x: number; y: number } | undefined;
      canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); canvas.focus();
      });
      canvas.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        move(event.clientX - drag.x, event.clientY - drag.y); drag.x = event.clientX; drag.y = event.clientY;
      });
      const endDrag = () => { drag = undefined; };
      canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('lostpointercapture', endDrag);
      canvas.addEventListener('keydown', event => {
        const delta: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
        const direction = delta[event.key]; if (!direction) return;
        event.preventDefault(); move(direction[0], direction[1]);
      });
      zoom.addEventListener('input', () => { state.zoom = Number(zoom.value); move(0, 0); });
      const position = node('div', 'visitor-crop-position'); position.setAttribute('role', 'group'); position.setAttribute('aria-label', '移动图片');
      for (const [text, dx, dy] of [['向左', -16, 0], ['向上', 0, -16], ['向下', 0, 16], ['向右', 16, 0]] as const) {
        const button = node('button', 'visitor-secondary', text); button.type = 'button'; button.addEventListener('click', () => move(dx, dy)); position.append(button);
      }
      const reset = node('button', 'visitor-link', '重新居中'); reset.type = 'button';
      reset.addEventListener('click', () => { state = { centerX: .5, centerY: .5, zoom: 1 }; zoom.value = '1'; draw(); });
      const actions = node('div', 'visitor-crop-actions');
      const cancel = node('button', 'visitor-secondary', '取消'), save = node('button', 'visitor-primary', '确认并上传'); cancel.type = save.type = 'button';
      const error = node('p', 'visitor-error'); error.setAttribute('role', 'alert');
      let settled = false;
      const finish = (value: Blob | null) => { if (settled) return; settled = true; resolve(value); dialog.close(); };
      cancel.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => { if (!settled) { settled = true; resolve(null); } dialog.remove(); }, { once: true });
      save.addEventListener('click', async () => {
        save.disabled = true; error.textContent = '';
        try {
          const output = document.createElement('canvas'); output.width = output.height = 128;
          const out = output.getContext('2d'); if (!out) throw new Error('图片没能转换，请换一张试试。');
          const r = cropRectangle(bitmap.width, bitmap.height, state);
          out.drawImage(bitmap, r.left, r.top, r.size, r.size, 0, 0, 128, 128);
          const png = await new Promise<Blob | null>(done => output.toBlob(done, 'image/png'));
          if (!png) throw new Error('图片没能转换，请换一张试试。');
          finish(png);
        } catch (reason) { if (!settled) error.textContent = reason instanceof Error ? reason.message : '图片没能转换，请重试。'; }
        finally { save.disabled = false; }
      });
      actions.append(cancel, save); dialog.append(title, help, canvas, zoomLabel, position, reset, error, actions);
      document.body.append(dialog); dialog.showModal(); draw(); canvas.focus();
    });
  } finally { bitmap.close(); }
}
