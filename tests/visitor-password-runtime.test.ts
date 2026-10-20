import { afterEach, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../functions/api/_lib/visitor-core';

afterEach(() => vi.restoreAllMocks());

it('密码摘要不依赖生产环境禁止的高迭代 PBKDF2，仍使用有成本的标准密码算法', async () => {
  vi.spyOn(crypto.subtle, 'deriveBits').mockRejectedValue(new DOMException('Pbkdf2 failed: iteration counts above 100000 are not supported', 'NotSupportedError'));
  const encoded = await hashPassword('production-compatible-password');
  expect(encoded).toMatch(/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  expect(await verifyPassword('production-compatible-password', encoded)).toBe(true);
  expect(await verifyPassword('a-different-password', encoded)).toBe(false);
});

it('与 Python hashlib.scrypt 生成的固定向量互通，并拒绝摘要中伪造的运算成本', async () => {
  const encoded = 'scrypt$32768$8$3$0123456789abcdef0123456789abcdef$a0d7db829318ecdd60fb387543f93b2d054e19ab7cdab8223cdafef93c53739f';
  expect(await verifyPassword('production-compatible-password', encoded)).toBe(true);
  expect(await verifyPassword('production-compatible-password', encoded.replace('$32768$', '$1048576$'))).toBe(false);
  expect(await verifyPassword('production-compatible-password', encoded.slice(0, -1) + '0')).toBe(false);
});
