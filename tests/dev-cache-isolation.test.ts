/**
 * 开发期运行时护栏（站主 2026-11-13 报「修 bug 修坏了别的功能」）。
 *
 * 事故链：`astro dev --force` 长驻时，我跑 `npm install` / `astro build` / `vitest`
 * 共用默认 `node_modules/.vite/deps`，把 dev 内存里那份 deps 的 browserHash 与文件
 * 整个改掉 ⇒ 页面懒加载 @hugeicons/* / vgpu 一律 504 Outdated Optimize Dep，
 * 标签页 FlowingMenu 与友链 ShapeWaves 动效静默消失。
 *
 * 这里守**关系**：dev 必须独占一份缓存、一次性 CLI 与 vitest 各自另占一份、
 * 三者都不许落回 Vite 默认目录。不写死某一个字面路径（AGENTS §4）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const astroCfg = readFileSync('astro.config.mjs', 'utf8');
const vitestCfg = readFileSync('vitest.config.ts', 'utf8');
const dotGrid = readFileSync('src/vendor/react-bits/DotGrid.tsx', 'utf8');

/** 取出某文件里所有 cacheDir 的字面量（含三元分支里的）。 */
const cacheDirs = (src: string): string[] =>
  [...src.matchAll(/'((?:node_modules\/\.vite)[^']*)'/g)].map((m) => m[1]);

describe('Vite 依赖预打包缓存 · 长驻 dev 独占一份', () => {
  it('astro.config 给 vite 配了 cacheDir', () => {
    expect(astroCfg).toMatch(/vite\s*:\s*\{[\s\S]{0,200}cacheDir\s*:/);
  });

  it('dev 分支与一次性 CLI 分支指向不同目录', () => {
    const dirs = cacheDirs(astroCfg);
    expect(dirs.length, '至少要有 dev 与 cli 两条分支').toBeGreaterThanOrEqual(2);
    expect(new Set(dirs).size, 'dev 与 cli 落到同一目录 ⇒ 跑 build 又会踩坏 dev').toBeGreaterThanOrEqual(2);
    expect(astroCfg).toMatch(/process\.argv\.includes\('dev'\)/);
  });

  it('vitest 另占一份，且不与 astro 的任何一份重合', () => {
    expect(vitestCfg).toMatch(/cacheDir\s*:/);
    const v = cacheDirs(vitestCfg);
    expect(v.length).toBeGreaterThanOrEqual(1);
    const a = new Set(cacheDirs(astroCfg));
    for (const dir of v) expect(a.has(dir), `vitest 与 astro 共用 ${dir} ⇒ 测试会踩坏 dev`).toBe(false);
  });

  it('谁都不许落回 Vite 默认目录（共用它正是 504 的成因）', () => {
    const all = [...cacheDirs(astroCfg), ...cacheDirs(vitestCfg)];
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const dir of all) expect(dir, `${dir} 是默认共用目录`).not.toMatch(/^node_modules\/\.vite\/?$/);
  });
});

describe('关于页和归档的绘制与换页', () => {
  it('DotGrid 使用 2D 上下文，卸载时停止动画和观察器', () => {
    expect(dotGrid).toMatch(/getContext\('2d'\)/);
    expect(dotGrid).not.toMatch(/getContext\('webgl/);
    const cleanup = dotGrid.slice(dotGrid.lastIndexOf('return () => {'));
    expect(cleanup).toContain('cancelAnimationFrame(raf)');
    expect(cleanup).toContain('visibilityObserver.disconnect()');
  });

  it('关于页退出时先停帧，再清理场景；相册仍按原方式释放', () => {
    const controller = readFileSync('src/scripts/fin-infinity.ts', 'utf8');
    const scene = readFileSync('src/scripts/fin-scene.ts', 'utf8');
    expect(controller).toMatch(/stopLoop\?\.\(\);\s*gate\?\.dispose\(\);\s*if \(previous\)[\s\S]+?setTimeout\(\(\) => previous\.dispose\(\), 0\)/);
    expect(scene).toContain('composer.dispose()');
    expect(scene).not.toContain('forceContextLoss');
    expect(readFileSync('src/vendor/react-bits/CircularGallery.tsx', 'utf8')).toMatch(/loseContext\(\)/);
  });
});
