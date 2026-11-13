import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* ★ 2026-11-13 站主报障四连：菜单没动画、点阵失灵、音频裸控件、归档概率卡死。
   真根因：Base.astro 的 JSX 注释里写了字面的 <script>（「而不是各写一个 <script>」）。
   Astro dev 的依赖扫描器按 HTML 语义扫 script 标签，认不得 JSX 注释 —— 它把注释
   文本当成脚本开头抽出一个「虚拟脚本」，第一行是全角冒号开头 ⇒ PARSE_ERROR ⇒
   **跳过整个依赖预打包** ⇒ react / gsap 等裸导入在 dev 里解析失败 ⇒ 所有懒挂载的
   React 组件（菜单动画、点阵）和动态导入（audio-player）时好时坏。
   生产线不受影响（rolldown 构建认得 JSX 注释），但 dev 全废。
   本门闩：所有 .astro 文件的 JSX 注释块（花括号+星号包裹的注释）里不许出现字面的
   「<script」。真脚本块内部的 JS 注释不受限（扫描器已在脚本区内，嵌套无妨）。 */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.astro')) out.push(p);
  }
  return out;
}

describe('JSX 注释里不许出现字面 script 标签（dev 依赖扫描会炸）', () => {
  const files = walk('src');
  it('全站 .astro 的 JSX 注释块内无 <script 字面', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\{\/\*[\s\S]*?\*\//g)) {
        if (/<script/i.test(m[0])) offenders.push(`${file}（第 ${src.slice(0, m.index).split('\n').length} 行附近的 JSX 注释）`);
      }
    }
    expect(
      offenders,
      `JSX 注释里写了字面 <script ⇒ Astro dev 依赖扫描 PARSE_ERROR ⇒ 跳过依赖预打包 ⇒ ` +
      `dev 里 react/gsap 裸导入全挂（菜单没动画、点阵失灵）。把注释里的标签名改写成` +
      `「script 块 / script 标签」等文字即可。肇事者：\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
