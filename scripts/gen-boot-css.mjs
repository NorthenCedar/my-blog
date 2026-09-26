#!/usr/bin/env node
/**
 * 首页开场动画 · CSS 生成器（**正式工具**，与 `scripts/gen-gallery-webp.mjs` 同一种模式）
 *
 * 用法：
 *   node scripts/gen-boot-css.mjs          # 生成 src/styles/boot.css（构建前自动跑）
 *   node scripts/gen-boot-css.mjs --check  # 只比对不写；生成物过期就红（两侧冒烟用）
 *
 * 为什么要有这一步（工单 §8-9 的实测结论）：
 *   直接用 `<style set:html={bootCss()}>` 会把这 51 KB 内联进 index.html
 *   （实测 raw +61,200 / gzip +13,418），而 `is:global` 同样**不会**被 Astro 抽进 CSS 包。
 *   ⇒ 落成真实 `.css` 文件由 Vite 处理：HTML 保持小体积、CSS 变成可缓存 + 会被压缩的独立文件。
 *
 * 为什么用 esbuild 包一层：`boot-css.ts` 是 TS 且用的是无扩展名 import，node 直接跑不了；
 *   esbuild 已经是本仓库的传递依赖（vite 自带），不为它引新包。
 *
 * 输出规矩（台账 21a5c66）：打印判据名 + 对象 + 实测值，禁止裸 PASS。
 */
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/styles/boot.css');
const CHECK = process.argv.includes('--check');

/** 把 TS 生成器 bundle 成临时 ESM、import 进来、取 bootCss() */
async function buildCss() {
  const built = await build({
    entryPoints: [join(ROOT, 'src/lib/boot-css.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  });
  const dir = await mkdtemp(join(tmpdir(), 'dsh-boot-css-'));
  const entry = join(dir, 'boot-css.mjs');
  try {
    await writeFile(entry, built.outputFiles[0].text, 'utf8');
    const mod = await import(pathToFileURL(entry).href);
    if (typeof mod.bootCss !== 'function') throw new Error('boot-css.ts 没有导出 bootCss()');
    return mod.bootCss();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const css = await buildCss();
const bytes = Buffer.byteLength(css, 'utf8');
const frames = (css.match(/@keyframes /g) ?? []).length;
const current = existsSync(OUT) ? await readFile(OUT, 'utf8') : null;

if (CHECK) {
  const same = current === css;
  console.log(
    `判据 生成物一致性 对象 src/styles/boot.css 实测: ${
      current === null ? '文件不存在（先跑不带 --check 的生成）' : same ? '与 bootCss() 逐字节相同' : '与 bootCss()不一致（生成物过期）'
    } · 生成侧 ${bytes} 字节 / ${frames} 条 @keyframes`,
  );
  process.exit(same ? 0 : 1);
}

if (current === css) {
  console.log(`判据 生成物 对象 src/styles/boot.css 实测: 无变化 · ${bytes} 字节 / ${frames} 条 @keyframes`);
} else {
  await writeFile(OUT, css, 'utf8');
  console.log(
    `判据 生成物 对象 src/styles/boot.css 实测: ${current === null ? '新建' : '更新'} · ${bytes} 字节 / ${frames} 条 @keyframes`,
  );
}
