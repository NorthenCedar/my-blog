import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { cleanAvatarPng } from '../functions/api/_lib/visitor-avatars';
import { onRequestGet as avatarGet } from '../functions/api/avatars';

function crc(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, body: Uint8Array) {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0); out.write(type, 4, 'ascii'); out.set(body, 8);
  out.writeUInt32BE(crc(out.subarray(4, -4)), out.length - 4);
  return out;
}
function png({ width = 128, metadata = false, bomb = false } = {}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(128, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
    ...(metadata ? [chunk('tEXt', Buffer.from('private-location\0secret'))] : []),
    chunk('IDAT', deflateSync(Buffer.alloc(bomb ? 1024 * 1024 : 128 * (128 * 4 + 1)))), chunk('IEND', Buffer.alloc(0)),
  ]);
}
describe('服务端头像校验与元数据清理', () => {
  it('D1 返回数字数组的 BLOB 时仍输出真实 PNG 字节', async () => {
    const bytes = png();
    const response = await avatarGet({ request: new Request(`https://example.test/api/avatars?id=${'a'.repeat(32)}&v=${'b'.repeat(32)}`), env: { COMMENTS_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ avatar_blob: Array.from(bytes) }) }) }) } } } as never);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });
  it('保留可解码的静态 PNG，移除位置等元数据', async () => {
    const clean = await cleanAvatarPng(png({ metadata: true }));
    expect(Buffer.from(clean).includes(Buffer.from('private-location'))).toBe(false);
    expect(Buffer.from(clean)).toEqual(png());
  });
  it('拒绝 SVG、伪造尺寸、损坏 CRC、尾随内容和解压炸弹', async () => {
    const badCrc = png(); badCrc[20] ^= 1;
    for (const bytes of [Buffer.from('<svg onload="alert(1)"/>'), png({ width: 9999 }), badCrc, Buffer.concat([png(), Buffer.from('trailing')]), png({ bomb: true })]) {
      await expect(cleanAvatarPng(bytes)).rejects.toThrow();
    }
  });
});
