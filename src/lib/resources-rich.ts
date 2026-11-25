export type ResourceDetailSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; label: string; href: string };

export interface ResourceDetailImage {
  alt: string;
  src: string;
}

export interface ParsedResourceDetail {
  segments: ResourceDetailSegment[];
  inlineImages: ResourceDetailImage[];
}

const TRAILING_PUNCT_RE = /[.,;:!?）)】》」』、。，；："'`]+$/;

/** Validates clickable links inside resource module detail (http/https without credentials, or site-relative `/...`). */
export function isSafeDetailHref(raw: string): boolean {
  const s = (raw || '').trim();
  if (!s || /[\s\\\u0000-\u001f\u007f]/.test(s)) return false;
  if (/^\/(?!\/)/.test(s)) return true;
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Validates content images (uploaded `writer-asset:<sha>`, site-relative `/...`, or credential-free http/https). */
export function isSafeDetailImageSrc(raw: string): boolean {
  const s = (raw || '').trim();
  if (!s || /[\s\\\u0000-\u001f\u007f]/.test(s)) return false;
  if (/^writer-asset:[a-f0-9]{64}$/.test(s)) return true;
  return isSafeDetailHref(s);
}

function trimBareUrl(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = '';
  while (url.length > 0) {
    const punct = TRAILING_PUNCT_RE.exec(url);
    if (punct) {
      trailing = punct[0] + trailing;
      url = url.slice(0, -punct[0].length);
      continue;
    }
    const last = url[url.length - 1];
    if (last === ')' || last === ']') {
      const open = last === ')' ? '(' : '[';
      const openCount = [...url].filter((c) => c === open).length;
      const closeCount = [...url].filter((c) => c === last).length;
      if (closeCount > openCount) {
        trailing = last + trailing;
        url = url.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return { url, trailing };
}

/**
 * Parses resource module detail text into clickable link runs and optional inline Markdown images.
 * Supports:
 * - Markdown links: `[显示文案](https://example.com)` or `[站内链接](/posts/demo/)`
 * - Bare URLs: `https://example.com/path` (with smart Chinese/English trailing punctuation trimming)
 * - Inline Markdown images: `![说明](https://.../pic.webp)` (extracted cleanly into `inlineImages`)
 */
export function parseResourceDetail(raw: string): ParsedResourceDetail {
  const src = String(raw || '');
  const segments: ResourceDetailSegment[] = [];
  const inlineImages: ResourceDetailImage[] = [];

  const pushText = (text: string) => {
    if (!text) return;
    const prev = segments[segments.length - 1];
    if (prev && prev.kind === 'text') prev.text += text;
    else segments.push({ kind: 'text', text });
  };

  // Match Markdown image, Markdown link, or bare http(s) URL (stop bare URLs before CJK text or fullwidth Chinese punctuation)
  const tokenRe = /!\[([^\]\n]*)\]\(([^)\s]+)\)|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>"'`\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+)/gi;
  let cursor = 0;

  for (const m of src.matchAll(tokenRe)) {
    const idx = m.index ?? 0;
    if (idx > cursor) pushText(src.slice(cursor, idx));

    if (m[2] !== undefined) {
      // Inline Markdown image: ![alt](url)
      const alt = (m[1] || '').trim();
      const imgUrl = m[2].trim();
      if (isSafeDetailImageSrc(imgUrl)) {
        inlineImages.push({ alt, src: imgUrl });
      } else {
        pushText(m[0]);
      }
    } else if (m[3] !== undefined && m[4] !== undefined) {
      // Markdown link: [label](href)
      const label = m[3].trim();
      const href = m[4].trim();
      if (label && isSafeDetailHref(href)) {
        segments.push({ kind: 'link', label, href });
      } else {
        pushText(m[0]);
      }
    } else if (m[5] !== undefined) {
      // Bare URL
      const { url, trailing } = trimBareUrl(m[5]);
      if (url && isSafeDetailHref(url)) {
        segments.push({ kind: 'link', label: url, href: url });
        if (trailing) pushText(trailing);
      } else {
        pushText(m[0]);
      }
    }

    cursor = idx + m[0].length;
  }

  if (cursor < src.length) pushText(src.slice(cursor));
  return { segments, inlineImages };
}
