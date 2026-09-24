// 一次性脚本：把拉丁字体子集拉进 public/fonts/。
// 为什么要自己拉而不是装 @fontsource/* ：那是 3 个额外依赖。字体就是静态文件，放进 public/ 即可。
// 中文不下载 —— 见 docs/design-spec.md §1.2。
import { mkdir, writeFile } from 'node:fs/promises';

const FILES = [
  ['@fontsource-variable/archivo@5', 'files/archivo-latin-wght-normal.woff2', 'archivo-latin.woff2'],
  ['@fontsource/ibm-plex-sans@5', 'files/ibm-plex-sans-latin-400-normal.woff2', 'plex-sans-400.woff2'],
  ['@fontsource/ibm-plex-sans@5', 'files/ibm-plex-sans-latin-600-normal.woff2', 'plex-sans-600.woff2'],
  ['@fontsource/ibm-plex-mono@5', 'files/ibm-plex-mono-latin-400-normal.woff2', 'plex-mono-400.woff2'],
];

await mkdir('public/fonts', { recursive: true });

let total = 0;
for (const [pkg, from, to] of FILES) {
  const url = `https://cdn.jsdelivr.net/npm/${pkg}/${from}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error(`文件只有 ${buf.length} 字节，可能是错误页：${url}`);
  await writeFile(`public/fonts/${to}`, buf);
  total += buf.length;
  console.log(`${to.padEnd(24)} ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log(`合计 ${(total / 1024).toFixed(1)} KB`);
if (total > 200 * 1024) throw new Error('字体总体积超过 200 KB，检查是不是拉到了非拉丁子集');
