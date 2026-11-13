import { readFileSync, statSync } from 'node:fs';
import { expect } from 'vitest';
import { isSiteMenuEntry, isTechHeadingEntry, jsClosure } from './_writer-output';

export const MOTION_ENGINE_BUDGET = 96 * 1024;
const SITE_MENU_BUDGET = 232 * 1024;
export const TECH_HEADING_BOOT_BUDGET = 768;
const TECH_HEADING_BUDGET = 240 * 1024;

/**
 * ★ 2026-11-12：主题开关从关于页搬进顶栏后，`ThemeToggle.astro` 的引导脚本
 * （动态 import 渲染器的那几行 + 空闲调度）会出现在**每一个**内页上。
 * 实测代价（同一份源码，只摘掉 Topbar 里那一行重跑构建，差出来的就是这笔）：
 *   · `ThemeToggle.astro_*.js` 825 B（顶栏那个小窗的引导）；
 *   · `page-lifecycle.*.js` 2794 B —— 引导脚本 import 了它，于是它从"只有部分页面
 *     静态引用"变成"所有内页都静态引用"（对全站只多付一次，对文章页是本轮才开始付）；
 *   · 页内内联 ~236 B。
 * 合计 3855 B ⇒ 记 4 KiB 一笔，加在真正吃这条开销的页面上。
 */
export const THEME_TOGGLE_BOOT_BUDGET = 4 * 1024;

/**
 * jelly-slider 主题开关的**渲染器本体**（vendored TypeGPU 光追场景，单 chunk ≈458 KB）。
 * 它由顶栏挂在每一页上，但**只走动态 import** ⇒ 不属于任何一页的 JS。
 * 于是各页预算里用 `siteWideLazyBytes()` 把它从"完整闭包"里**剔除**，
 * 而不是给每条预算加 458 KB —— 后者会让所有红线（three 558 KB 必炸等）一起失效。
 * 这条常量只用来锁它**自己**的体积上限（build-output 的 ② 组）。
 */
export const THEME_RENDERER_BUDGET = 480 * 1024;

/** 全站共享的懒加载装置在某个页面闭包里的字节数（目前只有主题开关渲染器）。 */
const SITE_WIDE_LAZY = /[/\\]theme-toggle\.[^/\\]+\.js$/;
export function siteWideLazyBytes(files: string[]): number {
  return files.filter((p) => SITE_WIDE_LAZY.test(p)).reduce((n, p) => n + statSync(p).size, 0);
}

/** 原完整闭包继续受限，另锁首屏静态依赖，不能靠动态 import 漏计。 */
export function expectMotionStartup(page: string, budget: number) {
  const full = jsClosure(page);
  const initial = jsClosure(page, { dynamic: false });
  const withoutMenu = jsClosure(page, { skipMenu: true });
  const other = jsClosure(page, { skipMenu: true, skipTechHeading: true });
  const techFiles = withoutMenu.files.filter(path => !other.files.includes(path));
  const menuFiles = full.files.filter(path => !withoutMenu.files.includes(path));
  expect(full.files.filter(isSiteMenuEntry), '原版导航有单独的按需入口').toHaveLength(1);
  expect(initial.files.filter(isSiteMenuEntry), '首屏不得静态加载原版导航').toEqual([]);
  expect(menuFiles.reduce((bytes, path) => bytes + statSync(path).size, 0), '原版导航及独占依赖超出预算')
    .toBeLessThan(SITE_MENU_BUDGET);
  expect(full.files.filter(isTechHeadingEntry), 'Tech Text 有单独的按需入口').toHaveLength(1);
  expect(initial.files.filter(isTechHeadingEntry), '首屏不得静态加载 Tech Text').toEqual([]);
  expect(techFiles.reduce((bytes, path) => bytes + statSync(path).size, 0), 'Tech Text 及依赖超出预算')
    .toBeLessThan(TECH_HEADING_BUDGET);
  expect(full.files.filter(path => /nav-glide\.[^/\\]+\.js$/.test(path)), '旧横排导航脚本退出共享闭包').toEqual([]);
  const engines = full.files.filter(path => /motion-engine\.[^/\\]+\.js$/.test(path));
  expect(engines, '只有一份共享的 GSAP/Flip 引擎').toHaveLength(1);
  expect(initial.files.filter(path => engines.includes(path)), '首屏不得静态加载动效引擎').toEqual([]);
  expect(Buffer.byteLength(initial.code), '首屏静态闭包超出预算').toBeLessThan(budget + TECH_HEADING_BOOT_BUDGET);
  const gsap = other.files.filter(path => /[/\\]gsap\.[^/\\]+\.js$/.test(path));
  expect([...engines, ...gsap].reduce((bytes, path) => bytes + statSync(path).size, 0), '按需 GSAP/Flip 引擎超出预算')
    .toBeLessThan(MOTION_ENGINE_BUDGET);
  const html = readFileSync(page,'utf8');
  const preloads = [...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*>/g)].map(m => m[0]).join('');
  for (const path of [...engines, ...gsap, ...menuFiles, ...techFiles]) {
    expect(preloads, '交互模块只能在操作意图后预热').not.toContain(path.split(/[/\\]/).at(-1)!);
  }
}
