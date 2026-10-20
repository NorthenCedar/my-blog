import { fail } from './visitor-core';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
/** 不信任 canvas：独立解析、校验 CRC、限量解压，只保留静态像素所需块。 */
export async function cleanAvatarPng(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 57 || bytes.length > 96 * 1024 || !SIGNATURE.every((n, i) => bytes[i] === n)) return fail(400, '头像必须是处理后的静态 PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, channels = 0, ended = false;
  const clean: Uint8Array[] = [bytes.slice(0, 8)], data: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset);
    const end = offset + size + 12;
    if (end > bytes.length) return fail(400, '头像数据不完整');
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)) return fail(400, '头像数据损坏');
    if (kind === 'IHDR') {
      if (offset !== 8 || channels || size !== 13 || view.getUint32(offset + 8) !== 128 || view.getUint32(offset + 12) !== 128 || bytes[offset + 16] !== 8 || ![2, 6].includes(bytes[offset + 17]) || bytes[offset + 18] || bytes[offset + 19] || bytes[offset + 20]) return fail(400, '头像尺寸必须为 128×128 静态图片');
      channels = bytes[offset + 17] === 6 ? 4 : 3;
      clean.push(bytes.slice(offset, end));
    } else if (kind === 'IDAT') {
      if (!channels || ended) return fail(400, '头像结构不对');
      data.push(bytes.slice(offset + 8, end - 4)); clean.push(bytes.slice(offset, end));
    } else if (kind === 'IEND') {
      if (size || !data.length || end !== bytes.length) return fail(400, '头像结构不对');
      clean.push(bytes.slice(offset, end)); ended = true; break;
    } else if (!/^[a-z][A-Za-z]{3}$/.test(kind)) return fail(400, '不支持这种头像格式');
    offset = end;
  }
  if (!ended) return fail(400, '头像数据不完整');
  const packed = new Uint8Array(data.reduce((n, part) => n + part.length, 0));
  let n = 0;
  for (const part of data) { packed.set(part, n); n += part.length; }
  const expected = 128 * (128 * channels + 1);
  const unpacked = new Uint8Array(expected);
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  n = 0;
  try {
    while (true) {
      const next = await stream.read();
      if (next.done) break;
      if (n + next.value.length > expected) { await stream.cancel(); return fail(400, '头像解压后过大'); }
      unpacked.set(next.value, n); n += next.value.length;
    }
  } catch { return fail(400, '头像压缩数据损坏'); }
  if (n !== expected) return fail(400, '头像像素数据不完整');
  for (let y = 0; y < 128; y++) if (unpacked[y * (128 * channels + 1)] > 4) return fail(400, '头像像素数据不对');
  const result = new Uint8Array(clean.reduce((sum, part) => sum + part.length, 0));
  n = 0;
  for (const part of clean) { result.set(part, n); n += part.length; }
  return result;
}
