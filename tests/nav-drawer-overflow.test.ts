/* 移动端导航抽屉的横向溢出与开合契约
 *
 * ★ 这条判据的由来（AGENTS 事故表里记着一条「NavDrawer 的 .navpanel 在 768px 档
 *   能真横向拖出 320px 空白」的缺陷，此前只记了现象、没定位、也没护栏）。
 *   2026-10-03 定位到根因并修好：关闭态的 .navpanel 是
 *   `position:fixed; right:0; transform:translateX(100%)`，整块被推到视口右缘之外
 *   min(78vw,320px)px。而 **Chrome 会把 fixed 元素超出视口的量计入文档滚动宽度**
 *   （与规范有出入），`visibility:hidden` 不挡、`html{overflow-x:clip}` 也不挡
 *   （实测 clip 的计算值就是 clip，而 scrollX 仍是 304）。
 *   正解是给它一个 `position:fixed; inset:0; overflow:hidden` 的祖先壳来裁。
 *
 * 为什么不能只靠 `overflow-x: clip` 就收工：那个 clip 是**为full-bleed hero 的
 * 15px 误差**加的，与 fixed 溢出是两回事；同时它还会掩盖别处的真实溢出。
 * 所以这里守的是「抽屉壳存在且开着 overflow:hidden」这条**根因判据**。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'index.html'));

const SRC = readFileSync(join(ROOT, 'src/components/NavDrawer.astro'), 'utf8');

describe('移动端抽屉 · 横向溢出（AGENTS 那条未修缺陷）', () => {
  it('抽屉有 overflow:hidden 的固定层外壳（这是修复的根因判据）', () => {
    expect(SRC, '缺 .navshell 包裹层 —— 溢出根因没被处理').toMatch(/class="navshell"/);
    // 壳必须是 fixed + inset:0 + overflow:hidden，三者缺一不可
    const m = SRC.match(/\.navshell\s*\{([^}]*)\}/);
    expect(m, '找不到 .navshell 的样式').toBeTruthy();
    const body = m![1];
    expect(body, '壳必须是 fixed（否则不是铺满视口的裁剪层）').toMatch(/position:\s*fixed/);
    expect(body, '壳必须 inset:0（铺满视口才能裁掉滑出部分）').toMatch(/inset:\s*0/);
    expect(body, '壳必须 overflow:hidden —— 这才是真正起作用的那条').toMatch(/overflow:\s*hidden/);
    // 壳本身不吃点击，否则整页点不动
    expect(body, '壳必须 pointer-events:none').toMatch(/pointer-events:\s*none/);
  });

  it('★ 面板与遮罩是 absolute而不是 fixed —— 否则壳的 overflow 管不到它们', () => {
    /* ★ 这是本条判据里最容易被「顺手改回去」的一环，也是真正起作用的那一步：
       **fixed 元素只被「建立了固定定位包含块」的祖先裁剪**（祖先带 transform /
       filter / will-change / contain），光有 overflow:hidden 裁不住它。
       改成 absolute 之后，包含块就是那个 fixed 的壳，壳的 overflow:hidden 才生效。
       几何不变：壳 inset:0 铺满视口 ⇒ absolute 的 top/right/bottom 仍贴视口边。 */
    expect(SRC).toMatch(/\.navmask\s*\{[^}]*position:\s*absolute/);
    expect(SRC).toMatch(/\.navpanel\s*\{[^}]*position:\s*absolute/);
    // 反向：不能还有把它们钉成 fixed 的写法
    const fixedPanel = SRC.match(/\.navpanel\s*\{[^}]*position:\s*fixed/);
    expect(fixedPanel, '.navpanel 又是 fixed 了 ⇒ 溢出会回来').toBeFalsy();
  });

  it('关闭态仍是 translateX(100%) 滑出（滑入动画没被修掉）', () => {
    expect(SRC).toMatch(/transform:\s*translateX\(100%\)/);
    expect(SRC).toMatch(/transform:\s*translateX\(0\)/);
  });

  it('打开态选择器跨了壳 —— 用后代而非同级兄弟', () => {
    /* ★ 加了壳之后 mask/panel 变成壳的**子**元素，原来的 `.navtog:checked ~ .navmask`
       （同级兄弟）不再匹配 ⇒ 抽屉会打不开。这是同一次改动里连带的第二个坑。

       ★ 判据必须**剥掉注释**再断言 —— 否则文件头那条「原选择器是
       `.navtog:checked ~ .navmask`（同级兄弟）」的说明会让本条恒红。
       本轮首次跑就踩了：负向断言被注释里的历史记录命中。
       这与 AGENTS 记的「断言绑死产物形态」同类，但方向相反：
       这次是**注释污染判据**，判据必须对注释免疫。 */
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    expect(code, '打开态选择器仍用同级兄弟 ~ —— 抽屉会打不开')
      .not.toMatch(/\.navtog:checked\s*~\s*\.navmask/);
    expect(code, '打开态选择器仍用同级兄弟 ~ —— 抽屉会打不开')
      .not.toMatch(/\.navtog:checked\s*~\s*\.navpanel/);
    expect(code).toMatch(/\.navtog:checked\s*~\s*\.navshell\s+\.navmask/);
    expect(code).toMatch(/\.navtog:checked\s*~\s*\.navshell\s+\.navpanel/);
  });

  it('打开态恢复了 pointer-events（壳不吃点击，子元素要吃）', () => {
    const opens = [...SRC.matchAll(/\.navtog:checked\s*~\s*\.navshell\s+\.nav(?:mask|panel)\s*\{([^}]*)\}/g)];
    expect(opens.length, '找不到两条打开态规则').toBe(2);
    for (const m of opens) {
      expect(m[1], '打开态没恢复 pointer-events ⇒ 面板点不动').toMatch(/pointer-events:\s*auto/);
    }
  });

  it('桌面隐藏规则把壳也一起藏（漏了它，桌面会出现一个空的 fixed 层）', () => {
    const m = SRC.match(/\.navtog,\s*\.navbtn,\s*\.navshell,\s*\.navmask,\s*\.navpanel\s*\{[^}]*display:\s*none/);
    expect(m, '桌面隐藏列表里没有 .navshell').toBeTruthy();
  });
});

describe.skipIf(!hasDist)('产物里的抽屉', () => {
  const pages = ['index', 'about', 'archive', 'links', 'talks', 'log', 'guestbook', 'gallery']
    .map((p) => join(DIST, p, 'index.html'))
    .filter((f) => existsSync(f));

  it('每页都渲染出 navshell', () => {
    const missing: string[] = [];
    for (const f of pages) {
      if (!readFileSync(f, 'utf8').includes('class="navshell"')) missing.push(f);
    }
    expect(missing, `这些页没渲染抽屉壳：${missing.join(', ')}`).toEqual([]);
  });

  it('壳在遮罩与面板之外（三者的嵌套关系正确）', () => {
    const html = readFileSync(join(DIST, 'about', 'index.html'), 'utf8');
    const iShell = html.indexOf('class="navshell"');
    const iMask = html.indexOf('class="navmask"');
    const iPanel = html.indexOf('class="navpanel"');
    expect(iShell).toBeGreaterThan(-1);
    expect(iMask, '遮罩不在壳内').toBeGreaterThan(iShell);
    expect(iPanel, '面板不在壳内').toBeGreaterThan(iShell);
  });
});
