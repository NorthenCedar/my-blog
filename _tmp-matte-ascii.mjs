/** 打印 alpha 图（_tmp 前缀 = 临时证据）：'#'=不透明 '.'=透明 ' '=半透明；大写=偏暗像素 */
import sharp from 'sharp';
import { join } from 'node:path';

for (const f of ['normal-64.png', 'link-64.png', 'normal-32.png']) {
  const { data, info } = await sharp(join('<博客仓库>\\_tmp-boot-shots/matte', f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  console.log(`\n=== ${f} ${W}×${H} ===`);
  for (let y = 0; y < H; y += 2) {
    let line = '';
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      const a = data[i + 3];
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (a < 40) line += '.';
      else if (lum < 120) line += 'D';
      else if (a < 200) line += ' ';
      else line += '#';
    }
    console.log(line);
  }
}
