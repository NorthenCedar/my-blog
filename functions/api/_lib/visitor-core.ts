/** 凭据只在服务端运算；浏览器不导入此模块。 */
export const AVATARS = ['leaf', 'helix', 'flask', 'crystal', 'orbit', 'infinity'] as const;
const encoder = new TextEncoder();
export class AccountError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const fail = (status: number, message: string): never => { throw new AccountError(status, message); };
export const text = (value: unknown) => typeof value === 'string' ? value : '';
export const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
export const randomToken = (size = 32) => hex(crypto.getRandomValues(new Uint8Array(size)));
export const digest = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export const usernameOf = (value: unknown) => {
  const name = text(value).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(name)) fail(400, '账号需为 3–32 位英文字母、数字、下划线或连字符');
  return name;
};
export function passwordOf(value: unknown) {
  const password = text(value);
  const length = [...password].length;
  if (length < 15 || length > 128) fail(400, '密码需为 15–128 个字符，可以使用一句长句');
  return password;
}
export function profileOf(value: Record<string, unknown>, isOwner: boolean) {
  const nickname = text(value.nickname).trim();
  const bio = text(value.bio).trim();
  if (!nickname || nickname.length > 40 || /[\u0000-\u001f\u007f]/.test(nickname)) fail(400, '昵称需为 1–40 个字符且不含控制字符');
  const normalized = nickname.normalize('NFKC').toLowerCase().replace(/[\s\p{Cf}\p{P}]/gu, '');
  if (!isOwner && ['北杉', '站主', '管理员', 'admin', 'administrator', 'owner', 'northencedar', 'northcedar'].includes(normalized)) {
    fail(400, '这个昵称为站主保留，请换一个昵称');
  }
  if (bio.length > 160 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(bio)) fail(400, '签名不能超过 160 个字符或包含控制字符');
  const avatar = text(value.avatar);
  if (avatar && !AVATARS.includes(avatar as typeof AVATARS[number])) fail(400, '请选择提供的默认头像，或上传图片');
  return { nickname, bio, avatar };
}
function equalHex(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 600000 }, key, 256));
}
export async function hashPassword(password: string) {
  const salt = randomToken(16);
  return `pbkdf2-sha256$600000$${salt}$${await derive(password, salt)}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const match = /^pbkdf2-sha256\$600000\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(encoded);
  if (!match || [...password].length > 128) return false;
  return equalHex(await derive(password, match[1]), match[2]);
}
export const DUMMY_PASSWORD_HASH = `pbkdf2-sha256$600000$${'0'.repeat(32)}$${'0'.repeat(64)}`;
export async function recoveryMatches(given: unknown, stored: string) {
  const code = text(given).trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(code) && equalHex(await digest(code), stored);
}
