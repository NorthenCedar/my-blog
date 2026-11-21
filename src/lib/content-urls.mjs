const CONTENT_BASE = 'https://content.invalid/';

/** @param {unknown} value @param {string} base */
function parseUrl(value, base) {
  if (typeof value !== 'string' || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, base);
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

/** @param {string} protocol */
const isWeb = protocol => protocol === 'https:' || protocol === 'http:';

/** @param {unknown} value */
export function webContentUrl(value, base = CONTENT_BASE) {
  const url = parseUrl(value, base);
  return url && isWeb(url.protocol) ? url : null;
}

/** @param {unknown} value */
export function contentLinkUrl(value, base = CONTENT_BASE) {
  const url = parseUrl(value, base);
  return url && (isWeb(url.protocol) || url.protocol === 'mailto:') ? url : null;
}

/** @param {unknown} value @param {string} field */
export function requireContentLink(value, field) {
  if (typeof value !== 'string' || !value.trim() || !contentLinkUrl(value)) {
    throw new Error(`${field} 必须使用网页地址、相对路径或邮箱地址`);
  }
  return value;
}
