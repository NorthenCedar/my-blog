import { createHash } from 'node:crypto';

/** 生成地址的身份由图像字节与编码设置决定，不会让 immutable 地址指向另一张图。 */
export function galleryFileName(index, width, bytes, version = 1, quality = 70) {
  const digest = createHash('sha256').update(bytes).update(`:${version}:${quality}`).digest('hex').slice(0, 12);
  return `${String(index).padStart(2, '0')}-${digest}-${width}.webp`;
}
