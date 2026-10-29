import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ThemeToggle from '../src/components/ThemeToggle.astro';
import {
  DARK_END,
  LIGHT_END,
  MOUSE_MAX_X,
  MOUSE_MIN_X,
  MOUSE_RANGE_MAX,
  MOUSE_RANGE_MIN,
  PAPER_DARK,
  PAPER_LIGHT,
} from '../src/vendor/jelly-slider/constants.ts';

/**
 * Jelly Slider 主题切换按钮（2026-10-17）。
 * 断言组件渲染出开关语义与画布 —— 逻辑（物理/拖拽/主题契约）在浏览器里，
 * 这里只保证它真的出现在 HTML 里且无障碍属性齐全。
 */
describe('ThemeToggle 渲染', () => {
  it('有 role=switch 与画布', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ThemeToggle, {});
    expect(html).toContain('role="switch"');
    expect(html).toContain('data-theme-toggle');
    expect(html).toContain('<canvas');
  });

  it('开关初始未选中且可聚焦、有中文标签', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ThemeToggle, {});
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('切换深色模式');
  });

  it('画布是纯装饰（aria-hidden），不进无障碍树', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(ThemeToggle, {});
    expect(html).toContain('aria-hidden="true"');
  });
});

/**
 * ★ 2026-10-17 第二轮（站主：「不点的时候那个软条不显示」）。
 * 根因是**几何**：原版「左端固定填充、右端跟手」，亮色端原为 -1.2，落在滑块光线步进的
 * 包围盒（当时左边 -1.019）之外 ⇒ 整根果冻被裁掉，静止时只剩槽壁里 0.02 的残段。
 * 现在两端都收进槽内：亮色 0（软条 = 锚点到端点的左半条，长度 1.0）、深色 0.9（填到链的物理上限）。
 * 这条守的是**关系**（盒内 + 可见段足够长 + 两端到位），不是某个具体数值：
 *   ① 亮色端在包围盒内；② 深色端不超出槽的右缘；
 *   ③ 亮色档那段软条够长（静止时能读成"一条软条"，而不是一坨）；
 *   ④ 深色档盖住槽的大部分。
 * 改取景 / 改端点 / 改 bbox 任一处，这条都会先红 —— 那时候几处一起收口。
 *
 * ★★ 2026-10-17 第四轮：④ 从 `> 0.9` 改成 `≥ 0.88`。上一轮写 `> 0.9` 是照着当时的
 *   `DARK_END = 1.0` 写的，而 **0.9 才是果冻链的物理上限**（起点 -1、总长 1.9 ⇒
 *   `setDragX` 钳到 [-2.9, 0.9]）。链长不能改（改了 SDF 破面，见 scene.ts 注释），
 *   所以 DARK_END 收到 0.9、百分比仍算到 100。判据跟着物理事实走，不是把数字改绿。
 */
describe('主题开关的几何（2026-10-17 第二轮）', () => {
  it('端点与亮色档的可见段', () => {
    // 滑块起点固定在 -1（scene.ts 构造 Slider 时传的）；槽右缘 1.02；
    // bbox：left = -1 − 5%×1.9 = -1.095，right = 0.9 + 10%×1.9 = 1.09（与 slider.ts 同源）
    expect(LIGHT_END, '亮色端跑到包围盒外 ⇒ 静止时软条被裁掉').toBeGreaterThan(-1.0);
    expect(DARK_END, '深色端超出槽的右缘').toBeLessThanOrEqual(1.02);
    expect(LIGHT_END + 1, '亮色档的软条太短 ⇒ 静止时读不出"一条软条"').toBeGreaterThan(0.6);
    expect(DARK_END, '深色档的软条盖不住槽的大部分（链的物理上限是 0.9）')
      .toBeGreaterThanOrEqual(0.88);
  });
});

/**
 * ★★ 2026-10-17 第四轮（站主：「拉到最右边时不要显示 81%，显示 100%，中间部分的百分数跟着变均匀」）。
 * 两个独立的错，各自会造成"数字不对"：
 *   ① **读错了点**：`endCapUniform` 的四个分量是（倒数第二点.xy, 末点.xy），
 *      原代码读 `.x` = 倒数第二个点 ⇒ 永远比真端点落后一个链段（约 0.18）⇒ 最右显示 81%。
 *   ② **钳位上限**：链从 -1 起、总长 1.9 ⇒ 端点最多 0.9；`DARK_END` 写 1.0 时
 *      百分比的分母比分子大，永远到不了 100%。
 * 这两条只能用源码判据守（像素太糊、字又小），不写泛用检查：只钉"百分比取哪个分量"与
 * "两端钳位上限是否就是 DARK_END 的物理上限"。
 */
describe('百分比刻度（2026-10-17 第四轮）', () => {
  const scene = readFileSync(
    fileURLToPath(new URL('../src/vendor/jelly-slider/scene.ts', import.meta.url)),
    'utf8',
  );

  it('百分比读的是**末点**（endCap.z），不是倒数第二个点', () => {
    expect(scene, '百分比又回去读倒数第二个点了 ⇒ 拖到底会显示 ~81%').toMatch(
      /const\s+tipX\s*=\s*layout\.\$\.endCap\.z/,
    );
    expect(scene, '百分比不许再出现 endCap.x（那是倒数第二个点）').not.toMatch(
      /saturate\(\(layout\.\$\.endCap\.x\s*-\s*LIGHT_END\)/,
    );
  });

  it('拖动的有效区间必须和槽的像素范围重合，且两端都能精确取到', () => {
    // 无头实测量：槽横跨画布 x 的 0.149 ~ 0.815（`_tt-G1.png`，dpr=1）。
    // 只要 MIN 与 RANGE_MIN 不一致，端点就会算成 0.1 而不是 0 ⇒ 中间每一档都不线性。
    expect(MOUSE_MIN_X, 'MIN_X 与 RANGE_MIN 不一致 ⇒ 最左端取不到 0').toBe(MOUSE_RANGE_MIN);
    expect(MOUSE_MAX_X, 'MAX_X 与 RANGE_MAX 不一致 ⇒ 最右端取不到 1').toBe(MOUSE_RANGE_MAX);
    expect(MOUSE_RANGE_MIN).toBeGreaterThan(0.05);
    expect(MOUSE_RANGE_MAX).toBeLessThan(0.95);
  });

  it('DARK_END 不超过果冻链的物理上限（否则百分比永远到不了 100）', () => {
    // 起点 -1、总长 1.9 ⇒ setDragX 的钳位上限 = 0.9
    expect(DARK_END, 'DARK_END 超过链的物理上限 ⇒ 显示 90% 而不是 100%')
      .toBeLessThanOrEqual(0.9);
  });
});

/**
 * ★ 2026-10-17 第三轮（站主：「按钮周围的那个颜色改为和背景纸白色相同…像抠图抠出来的」）。
 * 画布是一整块“地面”，原版固定渲染成 190/255 的浅灰 ⇒ 亮色页（纸 250）与深色页（纸 19）
 * 里都是一块贴片。修法是把地面的**基准色**改成当前主题的纸色，值在 constants.ts 里
 * 以 `PAPER_LIGHT` / `PAPER_DARK` 为单一来源。
 *
 * 这条门闩守的**不是**具体色值，而是「画布的地面色与页面的纸色同源」这个关系：
 * tokens.css 里必须真的存在这两个纸色。改主题纸色而忘了改画布（或反过来），它先红。
 */
describe('画布地面色与页面纸色同源（2026-10-17 第三轮）', () => {
  const tokens = readFileSync(
    fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)),
    'utf8',
  );
  const papers = new Set(
    [...tokens.matchAll(/--paper:\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => m[1].toLowerCase()),
  );

  it('亮色纸色在 tokens.css 的 --paper 里', () => {
    expect(papers.has(PAPER_LIGHT), `tokens.css 里没有 --paper: ${PAPER_LIGHT}（画布与页面脱钩了？）`)
      .toBe(true);
  });

  it('深色纸色在 tokens.css 的 --paper 里', () => {
    expect(papers.has(PAPER_DARK), `tokens.css 里没有 --paper: ${PAPER_DARK}（画布与页面脱钩了？）`)
      .toBe(true);
  });

  it('两档不是同一个颜色（否则深色档必然还是一块浅色贴片）', () => {
    expect(PAPER_LIGHT).not.toBe(PAPER_DARK);
  });
});

/**
 * ★★ 2026-10-17 第五轮（站主：「这个按钮的背景把底纹无限符号挡住了…直接把按钮背景改透明，
 * 影子直接出现在关于页的背景上」+「亮色模式时软条左边应该是半透明显示出背景纸白」）。
 *
 * 这一轮把"地面上色"整个换成了"地面只画影"：纸色本身 alpha=0，暗部折成半透明墨影。
 * 那条通路很脆（三处独立的地方任何一处写死，整块就退回不透明），所以门闩守四个接缝，
 * 而不是守某个像素值 —— 像素值要靠 headless 截图实测（见 docs/rhinelab-spec.md §6.87.11）。
 */
describe('画布透明通路（2026-10-17 第五轮）', () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  /**
   * 反向断言（"不许出现某某写法"）必须只看**代码**：脚本里的注释大量写着
   * "别再写 `vec4f(c.rgb, 1.0)`" 这类禁令，不剥注释就会自己咬自己。
   */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const scene = stripComments(read('../src/vendor/jelly-slider/scene.ts'));
  const taa = stripComments(read('../src/vendor/jelly-slider/taa.ts'));

  it('alpha 由"比纸暗多少"直接算出来，不再有分区/上限', () => {
    expect(
      scene.includes('const dark = std.saturate(1.0 - std.dot(litGround, lumaK) / paperLum);'),
      'alpha 必须从地面最终色的亮度算（纸白 = 0、越暗越大）',
    ).toBe(true);
    expect(
      scene.includes('const a = std.max(dark, std.saturate(percentageSample.x));'),
      '刻度墨必须单独顶到满浓度，否则会和纸混在一起',
    ).toBe(true);
    expect(
      /GROOVE_ALPHA|SHADOW_ALPHA_MAX|inGroove/.test(scene),
      '分区判据（inGroove / 固定膜 / 上限）已删 —— 它把整块画布刷成了一层纸色膜',
    ).toBe(false);
    /* 第五轮第一版还给 alpha 封了顶（`min(..., 0.55)`）。上限在**乘影**模型里是个假旋钮：
       叠在纸面上时合成结果逐像素还原成 `graded`，alpha 只管底纹透出多少 ⇒
       封顶既不改深浅，又让"底纹从哪开始透"在没有影子的地方突然跳一下。 */
    expect(
      /std\.min\(\s*(dark|a)\s*,/.test(scene),
      'alpha 不许封顶 —— 上限在乘影模型里只是个假旋钮',
    ).toBe(false);
  });

  it('renderBackground 真的把 alpha 送出来（不是恒 1）', () => {
    expect(
      scene.includes('return d.vec4f(litGround, a);'),
      'renderBackground 必须返回算好的 alpha —— 返回 1 就等于又铺回一块不透明纸色板',
    ).toBe(true);
  });

  it('blit 原样透传 alpha，不再写死 1.0', () => {
    expect(
      scene.includes(
        'return std.textureSample(sampleLayout.$.currentTexture, filteringSampler.$, uv);',
      ),
      'blit 必须**整条语句**直接返回采样值（rgb 已预乘）—— 包一层 vec4f(..., 1.0) 就等于又铺回不透明纸色',
    ).toBe(true);
  });

  it('TAA 不把 alpha 做时域混合（历史纹理会把 alpha 拖在 0.5 附近）', () => {
    expect(taa.includes('currentColor.a'), 'alpha 必须直接取当前帧').toBe(true);
    expect(
      taa.includes('mix(currentColor.a'),
      'alpha 一旦参与时域混合，静止停帧时会停在未收敛值上（实测 0.556 的灰斑）',
    ).toBe(false);
  });

  it('果冻折射的是"页面看得见的样子"，不是槽底的固有色', () => {
    expect(
      scene.includes('std.mix(layout.$.sceneParams.groundTint.rgb, behind.rgb, behind.w)'),
      '折射 env 必须按 alpha 与纸色合成，否则软条端头会勾出一圈硬黑边',
    ).toBe(true);
  });

  /**
   * ★ 2026-10-17 第五轮返工（站主：「为什么这个边缘有锯齿那么糊，原来不糊啊，
   *   上一轮不是说只改他的颜色吗」）。
   * 他怀疑被顺手动了别的 —— 不是。是**画布尺寸与着色器分辨率脱钩**：
   * 画布从 168×104 换到 220×136，`qualityScale` 仍是 1.0，Retina 上着色器分辨率
   * 没跟着涨，而果冻轮廓是硬 SDF 边界 ⇒ 4 个像素里 1 个是真的 = 锯齿。
   * 下面两条守的都是**关系**，不是某个具体数字：换画布尺寸时必须两处一起动。
   */
  it('按 2× 超采样渲染（1:1 在高 dpr 屏幕上就是锯齿）', () => {
    expect(
      scene.includes('let qualityScale = 2.0;'),
      'qualityScale 退回 1.0 就等于用物理像素的一半去画硬边界',
    ).toBe(true);
  });

  it('画布变高时 fov 等比跟着变（fov 不动 = 果冻在像素上被拉大 = 糊）', () => {
    const toggle = read('../src/scripts/theme-toggle.ts');
    const h = Number(/^const H = (\d+);/m.exec(toggle)![1]);
    const fovDeg = Number(
      /TOGGLE_FOV = \(([\d.]+) \* Math\.PI\) \/ 180;/.exec(scene)![1],
    );
    /* 基准取原版取景：H = 104 对应 fov = 31.11°。画布变高时 fov 按 tan 等比放大，
       果冻占的**像素**才不变 —— 这条量的是这个比例关系。 */
    const want = 2 * Math.atan(Math.tan((31.11 * Math.PI) / 360) * (h / 104)) * (180 / Math.PI);
    expect(
      Math.abs(fovDeg - want),
      `H = ${h} 对应 fov ≈ ${want.toFixed(2)}°，实测 ${fovDeg}° —— 两处要一起改`,
    ).toBeLessThan(0.5);
  });

  it('阴影留白增加时，按钮与命中投影在页面上保持原大小和位置', async () => {
    const { CameraController } = await import('../src/vendor/jelly-slider/camera');
    const { d } = await import('typegpu');
    const toggle = read('../src/scripts/theme-toggle.ts');
    const component = read('../src/components/ThemeToggle.astro');
    const h = Number(/^const H = (\d+);/m.exec(toggle)![1]);
    const fov = Number(/TOGGLE_FOV = \(([\d.]+) \* Math.PI\) \/ 180;/.exec(scene)![1]);
    const targetY = Number(/TOGGLE_TARGET_Y = (-?[\d.]+);/.exec(scene)![1]);
    const top = Number(/margin-top:\s*(-?\d+)px/.exec(component)?.[1] ?? 0);
    expect(-top, '画布上下应多留至少 24px，投影尾部才不会贴着边界').toBeGreaterThanOrEqual(24);
    expect(component).toContain(`height="${h}"`);
    expect(component).toContain(`height: ${h}px`);
    expect(read('../src/pages/about.astro')).toContain(`height:${h + top}px`);
    const root = { createUniform: () => ({ patch() {} }) };
    const camera = (height: number, degrees: number, target: number) => new CameraController(root as any,
      d.vec3f(0.024, 2.7, 1.9), d.vec3f(0, target, 0), d.vec3f(0, 1, 0), degrees * Math.PI / 180, 220, height);
    const before = camera(136, 39.9, -.22), after = camera(h, fov, targetY);
    for (const [x, y, z] of [[-1, 0, 0], [.9, .3, 0], [0, -.06, 1]]) {
      const a = before.project(x, y, z), b = after.project(x, y, z);
      expect(Math.abs(a.x * 220 - b.x * 220)).toBeLessThan(.05);
      expect(Math.abs(a.y * 136 - (b.y * h + top))).toBeLessThan(.05);
    }
  });
});

// 首帧几何、纹理上传和停帧由 jelly-initialization.test.ts 跑真实场景验证。

/**
 * ★★ 2026-10-17 第七轮（站主）：
 *   「1. 修一下点原来那个框内部都能拖动软条的 bug，要求是只有点软条时才能拖动。
 *    2. 修一下拖动软条时鼠标一离开原来那个框的区域软条就不动的 bug」
 *
 * 两条都是**事件层**的，几何与着色器完全没动。分开记：
 *
 * bug 1 —— `pointerdown` 一进来就 `isMouseDown = true`：画布 220×136 里只有中间
 *   一条软条、其余全是空地面 ⇒ 点画布任意处都能把手柄拽走。
 *   ⇒ 现在必须先过 `hitTest`（scene.ts 注入：把当前链条投到画布 CSS 像素，
 *     量指针到折线的距离），没点在软条上就不进拖拽。
 *
 * bug 2 —— `mouseleave` 把 `isMouseDown` 清掉，且 `mousemove` 只挂在 canvas 上，
 *   指针一出界就没有 move 可派发 ⇒ 手柄当场停住。
 *   ⇒ `pointermove` / `pointerup` 改挂 window（按 pointerId 过滤）+ `setPointerCapture`。
 *   ⚠ 这条门闩是**负向**的：`events.ts` 里**不许再出现 `mouseleave`** ——
 *     它看起来像"顺手多兜一层"，实际就是 bug 2 本身。
 */
describe('指针命中与拖拽（2026-10-17 第七轮）', () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const events = stripComments(read('../src/vendor/jelly-slider/events.ts'));
  const scene = stripComments(read('../src/vendor/jelly-slider/scene.ts'));
  const camera = stripComments(read('../src/vendor/jelly-slider/camera.ts'));
  const toggle = stripComments(read('../src/scripts/theme-toggle.ts'));

  it('按下先问命中测试，且命中失败的分支在置 isMouseDown 之前就 return', () => {
    const iHit = events.indexOf('const hit = this.hitTest ? this.hitTest(e.clientX, e.clientY) : true;');
    const iMiss = events.indexOf('if (!hit) {');
    const iDown = events.indexOf('this.isMouseDown = true;');
    expect(iHit, '命中测试必须在 pointerdown 里调用（这是"只有点软条才能拖"的唯一入口）')
      .toBeGreaterThan(-1);
    expect(iMiss, '没命中要有单独分支').toBeGreaterThan(-1);
    expect(iDown, '命中通过后仍然要置 isMouseDown').toBeGreaterThan(-1);
    expect(iHit < iMiss && iMiss < iDown, '顺序必须是：问命中 → 没命中就退 → 命中才开拖')
      .toBe(true);
    expect(
      /if \(!hit\) \{\s*this\.grabbed = false;\s*return;/.test(events),
      '没命中的分支里必须当场 return —— 少这一句就是"点空白处也能把软条拽走"',
    ).toBe(true);
  });

  it('拖拽不再被"指针离开画布"打断（bug 2 的根因不是几何）', () => {
    expect(
      /mouseleave/.test(events),
      'mouseleave 一旦把 isMouseDown 清掉，指针出界手柄就停 —— 这行是 bug 2 本身，别再兜回来',
    ).toBe(false);
    expect(
      events.includes("window.addEventListener('pointermove'"),
      'pointermove 必须挂在 window 上：挂在 canvas 上时指针一出界就没有 move 可派发了',
    ).toBe(true);
    expect(
      events.includes("window.addEventListener('pointerup'"),
      'pointerup 同样要挂 window（出界后松手也要收尾）',
    ).toBe(true);
    expect(
      events.includes('this.canvas.setPointerCapture(e.pointerId);'),
      'setPointerCapture 是双保险（触屏 / 指针被别的元素抢走时靠它把事件要回来）',
    ).toBe(true);
  });

  it('命中区跟着链条的实时形状走，不是固定矩形', () => {
    expect(
      scene.includes('eventHandler.hitTest = (clientX, clientY) => {'),
      'scene.ts 必须注入 hitTest —— 只有它知道相机与滑块的实时形状',
    ).toBe(true);
    expect(
      scene.includes('const pts = slider.points;'),
      '命中判据必须读物理后的真实点（slider.points），不能读构造时那条直线',
    ).toBe(true);
    expect(
      scene.includes('camera.project('),
      '投影必须走 camera.project（CPU 侧世界→画布）',
    ).toBe(true);
    expect(
      camera.includes('project(x: number, y: number, z: number)'),
      'camera.ts 要提供 CPU 投影；没有它就只能退回"整块画布"',
    ).toBe(true);
  });

  it('没抓住软条时只有"真点按"才算点按（空白处按住拖一段再松手不算）', () => {
    /* ★ 这条断言在第九轮**语义变了**，不是被删掉：
       第七轮写的是 `!events.didGrab || (…)` —— 短路真，"没抓住"直接当点按。
       第九轮（站主：「松开鼠标左键软条就会瞬移」）证明那正是瞬移的来源，
       所以这里守的是**分流 + 位移阈值**两件事，见下面第九轮的 describe。 */
    expect(
      !toggle.includes('if (!events.didGrab ||'),
      '短路写法又回来了 —— 空白处按住挪动再松手会直接 snapToEnd 瞬移到另一端',
    ).toBe(true);
  });
});

/**
 * ★★ 2026-10-17 第八轮（站主：「这样吧，变成只有点软条右边的端头才能拖动」）。
 *
 * 第七轮的命中区是**整条软条**（遍历 17 个点量折线距离）。站主再收一档：只有端头。
 *
 * 实现上的关键判断：**端头 = `points[last]`（tip 端），不是"画面右边"**。
 *   亮色档 `targetX = LIGHT_END`，把手停在槽的**左**端；深色档在右端。
 *   把"右边"写死成 x 阈值，亮色档就再也拖不动了 —— 而"把手"在物理上永远是 tip。
 * ⚠ 也别退回固定矩形：链条压缩时会拱起、跟手时会弯，矩形要么太松要么点不到。
 */
describe('命中区只剩端头（2026-10-17 第八轮）', () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const scene = stripComments(read('../src/vendor/jelly-slider/scene.ts'));

  it('只量最后一节（端头那一小段），不再遍历整条折线', () => {
    expect(
      scene.includes('const last = pts.length - 1;'),
      '必须取末段索引 —— 端头是 points[last]，不是 points[0]（那是钉住的 anchor 端）',
    ).toBe(true);
    expect(
      scene.includes('camera.project(pts[last - 1][0], pts[last - 1][1], 0)'),
      '末段要从 points[last-1] 量到 points[last]',
    ).toBe(true);
    expect(
      scene.includes('camera.project(pts[last][0], pts[last][1], 0)'),
      '端头点必须参与投影',
    ).toBe(true);
    expect(
      /for \(let i = 0; i < pts\.length; i\+\+\)/.test(scene),
      '不许再遍历整条折线 —— 那就是第七轮的"整条软条都能拖"，站主已明确否掉',
    ).toBe(false);
  });

  it('命中半径是端头尺寸（约 12 CSS + 余量），不是整块画布', () => {
    expect(
      scene.includes('const TIP_GRAB_RADIUS_CSS = 18;'),
      '端头半径 0.17 世界 ≈ 12 CSS，取 18 留一圈余量',
    ).toBe(true);
    expect(
      scene.includes('return d < TIP_GRAB_RADIUS_CSS;'),
      '必须真量距离再比半径 —— 返回 true 就等于"整块画布都能拖"',
    ).toBe(true);
    expect(
      /HIT_RADIUS_CSS/.test(scene),
      '旧的"整条软条"半径常量必须彻底删掉，别留一条能把它加回来的路',
    ).toBe(false);
  });
});

/**
 * ★★ 2026-10-17 第九轮（站主：「修一下按其他地方挪动时软条确实不动，
 *   但松开鼠标左键软条就会瞬移的 bug（我感觉可能是跟点击软条的判断冲突了，
 *   改成点击后如果按着不松移到其他地方不生效）」）。
 *
 * 站主的观察本身就是定位的关键：**按住挪动时软条不动（对的），松手那一下瞬移（错的）**。
 * ⇒ 病灶不在 `events.ts`（那半确实没让软条跟手），而在 `theme-toggle.ts` 的**松手判定**：
 *
 *   if (!events.didGrab || (moved < 6 && dt < 400)) { snapToEnd(另一端) }
 *                    ^^^^^^^^^^^^^^^^^^^^^^ 短路
 *
 *   在空白处按住时 `didGrab === false` ⇒ 整个条件**恒为真**，右半截的 `moved` / `dt`
 *   压根没被求值 ⇒ 松手一律走「切到另一端」⇒ 整条软条被 `snapToEnd` 送到对端。
 *   第七轮为了"空白处一拖别被当成拖拽吸附"写下的短路，在这里变成了瞬移。
 *
 * ⚠ 另一个同源的漏：**`moved` 只量了 `clientX`**（`Math.abs(e.clientX - downX)`）。
 *   站在画布里上下挪一下 dx = 0 ⇒ 被算成"没动"，照样切主题。
 *   与本轮同一个病（挪了却当成点按），所以判据要求它量**二维**距离。
 *
 * 修法（分流，不是加条件）：
 *   · 抓住了：点按切另一端 / 拖过吸附最近端（第七轮语义不动）；
 *   · 没抓住：**只有真的点按**才切；按住挪动过再松手 ⇒ **什么都不做**。
 *
 * 下面四条守的是**分流结构**与**阈值关系**，不是某一行字面量：
 * 门闩与本次变更严格挂钩，但凡只钉一个具体写法，换个等价的实现就假红。
 */
describe('松手判定的分流（2026-10-17 第九轮）', () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const toggle = stripComments(read('../src/scripts/theme-toggle.ts'));

  it('不许再用 `!didGrab ||` 短路（它就是"松手瞬移"本身）', () => {
    /* 负向断言：这条短路一旦回来，空白处按住挪动再松手就又被送去另一端。
       只禁这一种**写法**，不锁死整体结构 —— 换成分流的任何实现都该过。 */
    expect(
      /!\s*events\.didGrab\s*\|\|/.test(toggle),
      '`!events.didGrab || …` 是第七轮留下的短路：没抓住时右半截的 moved/dt 压根没被读，' +
        '松手一律切到另一端 ⇒ 就是站主报的"松开鼠标软条瞬移"',
    ).toBe(false);
    /* 反过来也要在：分流的第一道闸必须真的存在，不能只是把 `||` 换成别的绕法。 */
    expect(
      /if\s*\(\s*events\.didGrab\s*\)/.test(toggle),
      '松手判定必须以 didGrab 分流（抓住了 / 没抓住两路各自处理）',
    ).toBe(true);
  });

  it('没抓住那一路必须先过位移阈值，不能无条件切主题', () => {
    /* 定位"没抓住"分支：它必须是 `else if (…)` 或 `if (…)` 的第二路，
       里面必须同时出现"位移小于阈值"和"切到另一端"，且被阈值包着。 */
    const iBranch = toggle.indexOf('if (events.didGrab) {');
    const iElse = toggle.indexOf('} else if (', iBranch);
    expect(iBranch, '没找到 didGrab 分流').toBeGreaterThan(-1);
    expect(iElse, 'didGrab 那一路必须有 else 分支（没抓住时的处理）').toBeGreaterThan(-1);

    const missBranch = toggle.slice(iElse, toggle.indexOf('\n    }', iElse));
    expect(
      /else\s+if\s*\(\s*moved\s*</.test(missBranch),
      '没抓住那一路必须先判位移 —— 无条件切主题就是"按住挪动、松手瞬移"',
    ).toBe(true);
    expect(
      /snapToEnd\(other\)/.test(missBranch),
      '没抓住且没挪动 = 点按，仍然要切到另一端（第七轮场景 d 的回归不许被本轮弄没）',
    ).toBe(true);
    /* 阈值必须是有限的小数（量的是像素），不能放大到整块画布宽。 */
    const m = /moved\s*<\s*(\d+(?:\.\d+)?)/.exec(missBranch);
    expect(m, '没抓住那一路没有位移阈值').not.toBeNull();
    expect(Number(m![1]), '位移阈值必须是"手抖级别"的像素数（< 20），不是画布宽度量级')
      .toBeLessThan(20);
  });

  it('位移量的是二维距离（只比 clientX 时上下挪一下会被当成没动）', () => {
    expect(
      /const moved = Math\.hypot\(e\.clientX - downX, e\.clientY - downY\);/.test(toggle),
      'moved 必须量二维 —— 只比 clientX 时，在画布里上下挪一下 dx=0 会被当成"没动"照样切主题',
    ).toBe(true);
    expect(
      /Math\.abs\(e\.clientX - downX\)(?!\s*,\s*e\.clientY)/.test(toggle),
      '一维位移的写法又回来了（上下挪动不生效 ⇒ 与本轮同一个病）',
    ).toBe(false);
    /* downY 必须真的被记下来，否则 hypot 的第二项恒为 downY（自己减自己 = 0）。 */
    expect(
      /downY = e\.clientY;/.test(toggle),
      'pointerdown 必须记下 clientY —— 没有它 hypot 的第二项恒为 0',
    ).toBe(true);
  });

  it('抓住那一路保留第七轮语义：点按切另一端 / 拖过吸附最近端', () => {
    const iBranch = toggle.indexOf('if (events.didGrab) {');
    const iElse = toggle.indexOf('} else if (', iBranch);
    const grabBranch = toggle.slice(iBranch, iElse);
    expect(
      /if\s*\(\s*tapped\s*\)/.test(grabBranch),
      '抓住了还必须再分"点按 / 拖过" —— 否则点一下端头会被吸回原位而不是切主题',
    ).toBe(true);
    expect(
      /snapToEnd\(cur >= MID \? DARK_END : LIGHT_END\)/.test(grabBranch),
      '拖过之后要吸附最近端（按松手时的位置，不是按端点）',
    ).toBe(true);
    expect(
      /tapped = moved < 6 && dt < 400/.test(toggle),
      '"点按"= 几乎没动且没按久 —— 这两个阈值一起构成 tapped',
    ).toBe(true);
  });
});

/**
 * 第十轮（2026-10-18）：松手判据读**平滑值** ⇒ 拖得越快越容易判反。
 *
 * 站主：「为什么现在拖到大于50%不会自动吸到右边了，只有点击会到右边」。
 * 实测（CDP，同一手势同一落点，moved 都是 72.6 px）：
 *   快拖 40ms/步 ⇒ 松手时 `currentMouseX` = 0.3152 < MID 0.45 ⇒ 弹回左边；
 *   慢拖 300ms/步 ⇒ 松手时 = 0.6536 > MID ⇒ 吸到右边。
 */
describe('吸附判据读指针即时位置，不读平滑值（2026-10-18 第十轮）', () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const toggle = stripComments(read('../src/scripts/theme-toggle.ts'));
  const events = stripComments(read('../src/vendor/jelly-slider/events.ts'));

  it('负向：松手判定不许读 currentMouseX（那是每帧只推进 8% 的平滑值）', () => {
    /* 先把 didGrab 分支切出来，只在"拖过 ⇒ 吸附"这一路里查。 */
    const iBranch = toggle.indexOf('if (events.didGrab) {');
    const iElse = toggle.indexOf('} else if (', iBranch);
    const grabBranch = toggle.slice(iBranch, iElse);
    /* ⚠ 这里查的是**这一路里完全不许出现 `currentMouseX`**，不是查 `currentMouseX >= MID`
       这种比较字面量。第一版只写了后者，结果变异把读取改成
       `const cur = events.currentMouseX;` 之后比较仍然写 `cur >= MID`
       —— 字面量对不上，门闩没咬住（变异 ㊴ 实测漏网）。
       正确做法是禁掉**读取**：只要这一路从平滑值取过位置，判据就不可信。 */
    expect(
      /currentMouseX/.test(grabBranch),
      '吸附这一路不许从 currentMouseX 取位置 —— 它是每帧只推进 8% 的平滑值，' +
        '松手那帧离指针还很远（实测快拖读到 0.3152 < MID 0.45，判成不到一半）',
    ).toBe(false);
  });

  it('正向：必须读 pointerTargetX，且 events 真的提供它', () => {
    const iBranch = toggle.indexOf('if (events.didGrab) {');
    const iElse = toggle.indexOf('} else if (', iBranch);
    const grabBranch = toggle.slice(iBranch, iElse);
    expect(
      /const cur = events\.pointerTargetX;/.test(grabBranch),
      '吸附判据必须读指针的即时位置（pointerTargetX），不是软条平滑后的位置',
    ).toBe(true);
    expect(
      /snapToEnd\(cur >= MID \? DARK_END : LIGHT_END\)/.test(grabBranch),
      '仍然按最近端吸附 —— 本轮只换读哪个数，不改吸附语义',
    ).toBe(true);
    /* 正向要求 getter 真的存在：只在调用方写个名字、却没实现，运行时会静默变 NaN，
       `NaN >= MID` 恒为 false ⇒ 永远吸左 —— 一个"看起来对、实际全判反"的坑。 */
    expect(
      /get pointerTargetX\(\)\s*\{\s*return this\.targetMouseX;/.test(events),
      'EventHandler 必须提供 pointerTargetX（读 targetMouseX），' +
        '少这个 getter 的话 cur 会是 undefined、NaN >= MID 恒假 ⇒ 永远弹回左边',
    ).toBe(true);
  });

  it('负向：渲染循环仍用平滑值（迟滞手感不许被一起改掉）', () => {
    /* 反向约束：修的只是"松手那一帧读哪个数"，软条的跟手迟滞必须保留。
       判据取 scene.ts 的 render 循环 —— 它两处都该读 currentMouseX。 */
    const scene = read('../src/vendor/jelly-slider/scene.ts');
    expect(
      /slider\.setDragX\(eventHandler\.currentMouseX\);/.test(scene),
      '渲染循环必须继续用平滑值驱动软条 —— 软条跟手的那点迟滞就是它给的',
    ).toBe(true);
    expect(
      /setDragX\(eventHandler\.pointerTargetX\)/.test(scene),
      '不许把渲染循环也换成即时位置：那会把软条的迟滞手感一并去掉（拖起来像硬跟手）',
    ).toBe(false);
  });
});

/**
 * ★ 2026-10-18 第十一轮（站主截图：软条中段拱成一团、端头竖成一片）。
 *
 * 修法本身只有几行，但**为什么是这几行**才是要守的东西 ——
 * 判据守的是"约束在正确的层次上"，不是"这段代码长这样"。
 *
 * 背景（`_probe/_slider_sim.py` 是 slider.ts 物理的逐行移植，实测都在那）：
 *   链长 1.9、亮色端 targetX=0 ⇒ 水平跨度只有 1.0 ⇒ 富余 0.9 消不掉，
 *   只能变成「拱起」或「折返」。实测线上真浏览器 `tipDeg = 145.8°`、`folds = 4`：
 *   末段朝左 ⇒ scene.ts 的 `cap3D` 里 `atan2(last − secondLast)` 翻到 ±180°
 *   ⇒ 那个饼形端面被摆成竖片，就是截图里立起来的那一块。
 */
describe('链条关在槽内（2026-10-18 第十一轮）', () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const slider = read('../src/vendor/jelly-slider/slider.ts');

  it('把每个内点夹在 [anchor.x, targetX] 之间', () => {
    /* 这就是修法本体：取消"折返"的空间。链跑出 targetX 右边，既出了槽，
       又让末段朝左。夹回槽内 ⇒ 富余长度只能向上拱（archStrength 那一项），
       末段自然朝右。实测：tipDeg 172° → 37°，segMax 1.42 → 1.05。 */
    expect(
      /for \(let i = 1; i < this\.n - 1; i\+\+\) \{/.test(slider) &&
        /#pos\[i\]\.x = lo;/.test(slider) &&
        /#pos\[i\]\.x = hi;/.test(slider),
      '内点必须被夹进 [lo, hi] —— 这是"末段不许朝左"唯一的可行实现',
    ).toBe(true);
  });

  it('两端取 min/max，不让 lo > hi 时两个分支互抢', () => {
    /* `setDragX` 的钳位区间是 [anchor.x − totalLength, anchor.x + totalLength]，
       允许 targetX < anchor.x。那种情况下 lo > hi，逐点两个分支会来回抖。 */
    expect(
      /const lo = Math\.min\(this\.anchor\[0\], this\.#targetX\);/.test(slider) &&
        /const hi = Math\.max\(this\.anchor\[0\], this.#targetX\);/.test(slider),
      'lo/hi 必须取 min/max —— 否则 targetX 越过 anchor 时每帧在两个值间抖',
    ).toBe(true);
  });

  it('夹紧只碰内点，不动两个被 pin 死的端点', () => {
    /* 端点由 `#integrate` 与 "Re-pin endpoints" 负责。
       夹紧循环若把端点也写进去，`targetX` 本身就被改了 ⇒ 整条链的落点跟着漂。 */
    const clampLoop = slider.slice(slider.indexOf('const lo = Math.min'));
    expect(
      /for \(let i = 1; i < this\.n - 1; i\+\+\)/.test(clampLoop),
      '夹紧循环必须从 1 到 n−2（不含端点）',
    ).toBe(true);
  });

  it('负向：不得改成硬性"禁止折返"（与段长约束打架）', () => {
    /* 实测（`_probe/_slider_sweep.py`）：`x[i] >= x[i−1]` 会把富余的 0.9
       强行摊进 1.0 的跨度，最长段被拉到 **2.02 倍** restLen ——
       画面上就是"某一段被拽长的橡皮筋"，比原来更糟。 */
    expect(
      /x_monotonic|projectMonotonic/.test(slider),
      '不许用"x 必须单调"来实现 —— 它把最长段拉到 2 倍 restLen，比折返更难看',
    ).toBe(false);
  });

  it('负向：不得用高度上限压拱起', () => {
    /* 实测：yCap 一开就把段长拉到 1.35~1.55 倍（压高度 = 逼链缩短）。 */
    expect(
      /yCap|y_cap|projectCeiling/.test(slider.replace(/\/\*[\s\S]*?\*\//g, '')),
      '不许用高度上限压拱起 —— 实测会把段长拉到 1.35~1.55 倍，堆高交给 archStrength',
    ).toBe(false);
  });

  it('负向：临时调试出口不许留在产物里', () => {
    /* ⚠ 判据要跑在**剥掉注释之后**的源码上：这一轮的修法注释里就写着
       `__ttscene`（记录当时是从哪个探针量到的），直接匹配会把注释当成残留。
       门闩守的是"产物里没有调试出口"，不是"源码里没出现这几个字符"。 */
    for (const [name, path] of [
      ['slider.ts', '../src/vendor/jelly-slider/slider.ts'],
      ['scene.ts', '../src/vendor/jelly-slider/scene.ts'],
    ] as const) {
      const code = read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(
        /__ttscene|TEMP-DEBUG|debugTargetX/.test(code),
        `${name} 还留着临时调试出口 —— 交付前必须清掉`,
      ).toBe(false);
    }
  });
});
