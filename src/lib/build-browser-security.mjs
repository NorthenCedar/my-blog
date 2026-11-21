import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browserHeaders } from './browser-security.mjs';
import { MUSIC_API } from './music-provider.mjs';

const scriptTypes = new Set(['', 'module', 'importmap', 'speculationrules']);
const trustedTemplates = [
  '../layouts/Base.astro',
  '../layouts/WriterShell.astro',
  '../pages/index.astro',
  '../components/BootIntro.astro',
];

function normalizeScript(text) {
  return text.replace(/\r\n?/g, '\n');
}

export async function trustedInlineScripts() {
  const templates = await Promise.all(trustedTemplates.map(file => readFile(new URL(file, import.meta.url), 'utf8')));
  return new Set(templates.flatMap(template =>
    Array.from(template.matchAll(/<script\s+is:inline\b[^>]*>([\s\S]*?)<\/script\s*>/gi), match => normalizeScript(match[1])),
  ));
}

export function documentCsp(scripts, trustedInline) {
  const hashes = new Set();
  for (const { file, src, type, text } of scripts) {
    const kind = type.trim().toLowerCase();
    if (!scriptTypes.has(kind) && !/^(?:application|text)\/(?:x-)?(?:java|ecma)script\b/.test(kind)) continue;
    if (src !== undefined) {
      if (!src.startsWith('/_astro/')) throw new Error(`页面脚本应通过 Astro 本地打包：${file}`);
      continue;
    }
    if (kind === 'module') throw new Error(`页面模块应由 Astro 单独输出：${file}`);
    const canonicalText = normalizeScript(text);
    if (!canonicalText.trim()) continue;
    if (!trustedInline.has(canonicalText)) throw new Error(`发现未在可信模板中声明的内联脚本：${file}`);
    hashes.add(`'sha256-${createHash('sha256').update(canonicalText).digest('base64')}'`);
  }
  // 同一份策略用于每张静态页面，覆盖 Astro 在同一个文档内换页时执行的脚本。
  return [
    `script-src 'self' 'wasm-unsafe-eval'${hashes.size ? ' ' + [...hashes].sort().join(' ') : ''}`,
    "script-src-attr 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    // GLTFLoader 将模型内嵌贴图交给 ImageBitmapLoader，通过 fetch 读取本地 Blob。
    `connect-src 'self' blob: ${new URL(MUSIC_API).origin}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-src 'self'",
  ].join('; ');
}

export async function writeBrowserSecurity({ rootDir = process.cwd(), distDir = join(rootDir, 'dist'), scripts }) {
  const policy = documentCsp(scripts, await trustedInlineScripts());
  const rules = ['/*', ...Object.entries({ ...browserHeaders, 'Content-Security-Policy': policy })
    .map(([name, value]) => `  ${name}: ${value}`)];
  if (rules.some(line => line.length > 2000)) throw new Error('浏览器防护配置超出 Pages 单行长度限制');
  const source = await readFile(join(rootDir, 'public', '_headers'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const generated = join(rootDir, 'functions', 'api', '_generated');
  await mkdir(generated, { recursive: true });
  await writeFile(join(distDir, '_headers'), [source.trimEnd(), rules.join('\n')].filter(Boolean).join('\n\n') + '\n');
  await writeFile(join(generated, 'document-csp.json'), JSON.stringify(policy) + '\n');
}
