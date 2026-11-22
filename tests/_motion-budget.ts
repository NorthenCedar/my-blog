import { readFileSync, statSync } from 'node:fs';
import { expect } from 'vitest';
import { isSiteMenuEntry, isTechHeadingEntry, jsClosure } from './_writer-output';

export const MOTION_ENGINE_BUDGET = 96 * 1024;
// 换页状态和局部滑块的公共引导合计净增约 1 KiB，首屏静态上限照旧检查。
export const NAVIGATION_UI_BOOT_BUDGET = 1024;
// 换页过渡改走两段式即时覆盖 + 同源内存预取与样式预热，同时关闭 Astro 内置 link prefetch：
// 实测 ClientRouter.astro_*.js 4084 → 1571 B（-2513 B），Base.astro_*.js 22229 → 26858 B（+4629 B），净增 +2116 B；
// 由原 384 B 按实测净增上调至 2560 B（留约 +60 B~2 KiB 余量，螺旋盘/留言/文章三处红线齐平且仍拦住大型按需依赖）。
export const NAVIGATION_FEEDBACK_BOOT_BUDGET = 2560;
// 访问事件和页脚可见性控制的编译增量使用独立预算。
export const PAGE_STATS_BOOT_BUDGET = 1024;
// 只给评论和文章各自的并发归并、目录缓存计入新增开销。
export const COMMENT_LIFECYCLE_BUDGET = 1024;
export const TOC_LAYOUT_BOOT_BUDGET = 640;
const SITE_MENU_BUDGET = 232 * 1024;
// 同一模块覆盖页面内滚动区、顶层弹窗和横向滚动，实测约 3.8 KB。
const INNER_SCROLLBAR_BUDGET = 4 * 1024;
const INNER_SCROLLBAR = /[/\\]inner-scrollbar\.[^/\\]+\.js$/;
export const TECH_HEADING_BOOT_BUDGET = 768;
const TECH_HEADING_BUDGET = 240 * 1024;

/**
 * ★ 2026-11-12：主题开关从关于页搬进顶栏后，`ThemeToggle.astro` 的引导脚本
 * （原生按钮和按需加载入口）会出现在**每一个**内页上。
 * 实测代价（同一份源码，只摘掉 Topbar 里那一行重跑构建，差出来的就是这笔）：
 *   · `ThemeToggle.astro_*.js` 825 B（原引导）→ 1245 B（加入即时切换）→ 2412 B（新增空闲预热与未就绪前指针交接，+1167 B）；
 *   · `page-lifecycle.*.js` 2794 B —— 引导脚本 import 了它，于是它从"只有部分页面
 *     静态引用"变成"所有内页都静态引用"（对全站只多付一次，对文章页是本轮才开始付）；
 *   · 页内内联 ~236 B。
 * 按实测新增约 1.15 KiB，将原 4608 上调 +1280 B 至 5888；渲染器继续独立计量。
 */
export const THEME_TOGGLE_BOOT_BUDGET = 5888;

/**
 * jelly-slider 主题开关的**渲染器本体**（vendored TypeGPU 光追场景，单 chunk ≈458 KB）。
 * 它由顶栏挂在每一页上，但**只走动态 import** ⇒ 不属于任何一页的 JS。
 * 于是各页预算里用 `siteWideLazyBytes()` 把它从"完整闭包"里**剔除**，
 * 而不是给每条预算加 458 KB —— 后者会让所有红线（three 558 KB 必炸等）一起失效。
 * 这条常量只用来锁它**自己**的体积上限（build-output 的 ② 组）。
 */
export const THEME_RENDERER_BUDGET = 480 * 1024;

/** 全站共享的按需装置各有独立上限，从页面闭包中分开计量。 */
const SITE_WIDE_LAZY = /[/\\](?:theme-toggle|inner-scrollbar)\.[^/\\]+\.js$/;
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
  const innerScrollbars = full.files.filter(path => INNER_SCROLLBAR.test(path));
  expect(innerScrollbars, '站内滚动区共用一个滑块模块').toHaveLength(1);
  expect(initial.files.filter(path => INNER_SCROLLBAR.test(path)), '滑块按需加载').toEqual([]);
  expect(statSync(innerScrollbars[0]).size, '滑块模块超出独立预算').toBeLessThan(INNER_SCROLLBAR_BUDGET);
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
  expect(Buffer.byteLength(initial.code), '首屏静态闭包超出预算')
    .toBeLessThan(budget + TECH_HEADING_BOOT_BUDGET + NAVIGATION_FEEDBACK_BOOT_BUDGET + PAGE_STATS_BOOT_BUDGET);
  const gsap = other.files.filter(path => /[/\\]gsap\.[^/\\]+\.js$/.test(path));
  expect([...engines, ...gsap].reduce((bytes, path) => bytes + statSync(path).size, 0), '按需 GSAP/Flip 引擎超出预算')
    .toBeLessThan(MOTION_ENGINE_BUDGET);
  const html = readFileSync(page,'utf8');
  const preloads = [...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*>/g)].map(m => m[0]).join('');
  for (const path of [...engines, ...gsap, ...menuFiles, ...techFiles, ...innerScrollbars]) {
    expect(preloads, '交互模块只能在操作意图后预热').not.toContain(path.split(/[/\\]/).at(-1)!);
  }
}
