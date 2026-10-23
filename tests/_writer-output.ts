import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const DIST='dist';
export function jsClosure(pagePath: string): { code: string; files: string[] } {
  const html = readFileSync(pagePath, 'utf8');
  const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const files: string[] = [];
  const seen = new Set<string>();
  const load = (href: string) => {
    const rel = href.replace(/^\//, '').replace(/^\.\//, '');
    const f = join(DIST, rel.startsWith('_astro/') ? rel : join('_astro', rel));
    if (seen.has(f) || !existsSync(f)) return;
    seen.add(f);
    files.push(f);
    const code = readFileSync(f, 'utf8');
    // 2026-09-30 扩展：原来只认 `import"...js"` / `from"...js"` 这一种写法。
    // 首页 DNA 用了**动态 import**（three 只在真要画的时候才下载），
    // 而 Vite 对动态 import 的输出是 import(`./three.xxx.js`) —— **反引号**，
    // 老正则一个都匹配不到 ⇒ three 与 GLTFLoader 两个 chunk 会被误判成「没页面引用的孤儿」。
    // 现在三种引号（" ' `）与静态/动态两种写法都覆盖。
    for (const m of code.matchAll(/(?:import|from)\s*\(?\s*(["'`])([^"'`]+?\.js)\1/g)) load(m[2]);
  };
  for (const m of html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+\.js)"/g)) load(m[1]);
  const code = inline + '\n' + files.map((f) => readFileSync(f, 'utf8')).join('\n');
  return { code, files };
}


