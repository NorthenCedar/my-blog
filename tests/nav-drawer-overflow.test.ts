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

/* ★★ 2026-10-08：手机端「**除了主页，其他页**点不出导航菜单」的**根因**契约。
 *   根因不在抽屉的 CSS，而在**顶栏**：`.topbar` 上的 `backdrop-filter` 会同时做两件事 ——
 *     ① 建立 `position:fixed` 后代的**包含块** ⇒ 抽屉的 `.navshell`（`fixed; inset:0`）
 *        被收成顶栏那条细带（实测 62px，面板只剩"导航菜单"四个字）；
 *     ② 建立**层叠上下文** ⇒ `.navshell` 的 `z-index:40` 被锁在顶栏内部，
 *        而 `body.chrome-page main` 是 `z-index:1` ⇒ 即使几何修好了，抽屉仍被正文压住。
 *   实测工具 `_probe/_nav-probe.mjs`（量 shell 盒高 + `elementFromPoint` 判层叠）：
 *     修前 首页 shell 780（正常）· 七个内页 shell 全部 62（被压扁），
 *     "建立包含块的祖先"直接报 `div.topbar[backdrop-filter]`。
 *   ⇒ 玻璃整体搬到 `.topbar::before`，`.topbar` 退回普通元素。
 *   ★ 两条**踩过才知道**的细节，各配一条断言：
 *     · 玻璃层的 `z-index` 必须是 **0 不能是 -1** —— 写 -1 时它落进根层叠上下文的负层，
 *       同层的 ∞ 底纹（`.page-inf`，也是 z-index:-1）**不进它的 backdrop** ⇒ 玻璃变成纯纸白片
 *       （实测顶栏 `rgb(246,246,243)` → `rgb(251,251,248)`；`_probe/_nav-var.mjs` 的
 *       base/z0/ctrl 三档对照证明 `z-index:0` 与"玻璃挂在 .topbar 自己身上"**逐值相同**）。
 *     · 顶栏文字/图标必须抬到玻璃层之上（定位元素画在内流内容之后），
 *       但**必须排除** `.navshell`（fixed）与 `.navtog`（小屏下 absolute），否则当场改坏抽屉。
 */
describe('内页顶栏 · 不得建立 fixed 的包含块（手机端抽屉点不开的根因）', () => {
  const TOPBAR = readFileSync(join(ROOT, 'src/components/Topbar.astro'), 'utf8');
  /* ⚠ 负向断言一律先剥注释：顶栏那段说明里**正好**写着 backdrop-filter / transform 这些
     属性名（AGENTS §5：「别在注释里抄你要禁止的字面量」，本轮是第 N 次同族坑）。 */
  const TCODE = TOPBAR.replace(/\/\*[\s\S]*?\*\//g, ' ');

  it('★ .topbar 自身不许出现会建立包含块 / 层叠上下文的属性', () => {
    const block = TCODE.match(/body\.chrome-page \.topbar\s*\{([^}]*)\}/);
    expect(block, '找不到 body.chrome-page .topbar 的规则块').toBeTruthy();
    const body = block![1];
    for (const prop of ['backdrop-filter', 'filter', 'transform', 'perspective', 'will-change', 'contain']) {
      expect(body, `.topbar 上出现了 ${prop} ⇒ 抽屉会被压扁/盖住（手机端点不出菜单）`).not.toContain(prop);
    }
    expect(body, '顶栏要留 position:relative 给玻璃层当定位祖先').toMatch(/position:\s*relative/);
    expect(body, '顶栏的底线上色归玻璃层，这里只占位').toMatch(/border-bottom:\s*1px solid transparent/);
  });

  it('★ 玻璃层挂在 ::before 上，且 z-index 必须是 0（写 -1 会丢掉 ∞ 底纹）', () => {
    const m = TCODE.match(/body\.chrome-page \.topbar::before\s*\{([^}]*)\}/);
    expect(m, '没找到顶栏玻璃层 ::before').toBeTruthy();
    const g = m![1];
    expect(g, '玻璃层必须是定位元素').toMatch(/position:\s*absolute/);
    expect(g, '玻璃层的 z-index 必须是 0 —— 写 -1 时底纹不进它的 backdrop，玻璃变纯白片').toMatch(/z-index:\s*0\s*;/);
    expect(g, '玻璃层要自己带模糊').toMatch(/backdrop-filter:\s*blur/);
    expect(g, '底线要画在玻璃层上（留在 .topbar 会被模糊吃掉）').toMatch(/border-bottom:\s*1px solid var\(--glass-line\)/);
    expect(g, '玻璃层要放行指针，否则顶栏链接点不动').toMatch(/pointer-events:\s*none/);
    // 反向：顶栏**自己**不许再带模糊（那正是根因）
    const top = TCODE.match(/body\.chrome-page \.topbar\s*\{([^}]*)\}/)![1];
    expect(top, '顶栏自己又带上 backdrop-filter 了 —— 根因回来了').not.toContain('backdrop-filter');
  });

  it('★ 顶栏文字抬到玻璃层之上，且排除抽屉那两件（.navshell / .navtog）', () => {
    const m = TCODE.match(/body\.chrome-page \.topbar > \*:not\(\.navshell\):not\(\.navtog\)\s*\{([^}]*)\}/);
    expect(m, '没找到"抬起顶栏内容"的规则 —— 站名/导航会被玻璃一起模糊掉').toBeTruthy();
    expect(m![1], '抬升要真的加 z-index').toMatch(/z-index:\s*1/);
    expect(m![1], '抬升要真的改定位').toMatch(/position:\s*relative/);
    /* 这两条是"别把抽屉一起抬坏"的护栏：.navshell 是 fixed、.navtog 小屏下是 absolute，
       一旦被 position:relative 覆盖，抽屉立刻坏掉（一个不再铺满视口、一个挤进 flex 流）。 */
    expect(TCODE, '抬升规则必须排除 .navshell').toContain(':not(.navshell)');
    expect(TCODE, '抬升规则必须排除 .navtog').toContain(':not(.navtog)');
  });
});
