import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  clamp,
  clampV,
  blendV,
  throwTarget,
  stepSpring,
  stepPxOf,
  radiusOf,
  projX,
  edgeOf,
  EDGE_MAX,
  V_MAX,
  V_BLEND,
  LOOKAHEAD,
  K,
  ZETA,
  C,
  DT_MAX,
  EPS_X,
  EPS_V,
} from '../src/scripts/helix-core';

/* 螺旋盘 HELIX（`/gallery/spiral/`，内页第十一台装置）2026-10-07 的契约。
 *
 * 站主原话：
 *   「能不能给我点高级的感觉，这个只能往下划，给我点可互动的感觉，比如身处画廊的感觉
 *     或者……照片组成一个3D的螺旋结构，左右拖动可以螺旋旋转换照片」
 * ⇒ 拍板：**独立成页**（不替换砖墙）；**纯 CSS 3D**（不引 three）；
 *   基础标记 = 平铺网格，脚本挂 `.sp-on` 才变螺旋。取舍与三条理由写在页面文件头与
 *   docs/site-decisions.md。
 *
 * 这个文件守四类东西，每类都**不是**"上一版的实现形态"：
 *   一、几何：变换顺序、R 由弦长反解、以及**"看得出是螺旋"的机器判据**（卷回率）；
 *   二、惯性：★ 速度必须先夹住再进积分器（这里出过一个真 bug，见 helix-core 文件头）；
 *   三、降级链：无 JS 与 reduce 走**同一个**平铺网格，`.sp-on` 只由脚本加；
 *   四、红线：零依赖 / 零外部资源 / 颜色只用 token / 无 object-fit / JS 预算。
 *
 * ★ 凡是能从源码读出来的旋钮（片宽上界、每片转角、淡出窗口、纵向系数、透视比）
 *   一律**解析**出来用，不写死 —— 写死的话，下次调参数会同时让门闩失去意义或假红。
 */

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
/** 独立页那份产物（mode="page"） */
const PAGE_PATH = join(DIST, 'gallery', 'spiral', 'index.html');
/** 相册页那份产物（mode="embed"）—— 2026-10-07 起装置也住在这里 */
const GAL_PATH = join(DIST, 'gallery', 'index.html');
const hasDist = existsSync(PAGE_PATH) && existsSync(GAL_PATH);

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** 剥注释：Astro 模板里的 JSX 块注释 + <style> 里的 CSS 块注释。
 *  顺序有讲究：先剥 JSX（它内部若含 CSS 块注释，先剥 CSS 的会把 JSX 那个切碎）。 */
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ★★ 装置本体是**组件**（2026-10-07 站主：「可以把螺旋盘弄成一个小组件」）。
   两个消费方 —— `/gallery/spiral/`（mode="page"）与 `/gallery/`（mode="embed"）——
   共用它 ⇒ 契约盯的是**组件**；两个页面只剩页头读数与调用点。
   ⚠ 别把断言改回读页面：那样"页面里又内联了一份实现"就查不出来了。 */
const SRC = read('src/components/SpiralPlate.astro');
const CODE = strip(SRC);
/** 压平空白：几何那几条 CSS 声明在源码里是**分行的**，不压平匹配不上。 */
const FLAT = SRC.replace(/\s+/g, ' ');
/** 组件里那一段 `<script>` 的正文（剥过注释）——
 *  「点击放大」那几条订的是**行为**，必须读脚本，CSS 里找不到那些判断。
 *  ⚠ 剥注释：文件头那段设计说明**故意**写着"点一下放大、再点开灯箱"这些字，
 *    裸查会被自己的注释满足 ⇒ 假绿。 */
const JS = strip([...SRC.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n'));
/** 组件里那个 <style> 块（**源码**版，未压缩）—— 旋钮/规则的断言钉这里，
 *  产物那份（PAGE_CSS）留给他验"真的进了 CSS 文件"。 */
const CSS = strip(SRC.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '');
const CORE = read('src/scripts/helix-core.ts');

const MANIFEST = JSON.parse(read('public/gallery/manifest.json')) as {
  widths: number[];
  albums: { id: string; title: string; total: number; frames: { alt: string }[] }[];
};
const TOTAL = MANIFEST.albums.reduce((n, a) => n + a.total, 0);

/** Astro 给被作用域样式命中的选择器补 `[data-astro-cid-xxxx]` —— 读值前先剥掉。 */
const DEO = (s: string) => s.replace(/\[data-astro-cid-[a-z0-9]+\]/g, '');
const cssFiles = hasDist ? readdirSync(join(DIST, '_astro')).filter((f) => f.endsWith('.css')) : [];
const PAGE_CSS = DEO(
  cssFiles
    .map((f) => readFileSync(join(DIST, '_astro', f), 'utf8'))
    .filter((c) => c.includes('.sp-viewport'))
    .join('\n'),
);
const HTML = hasDist ? readFileSync(PAGE_PATH, 'utf8') : '';
/** 相册页那份装置的产物（embed 模式）—— 页序与"滚轮归页面"都在这份里验 */
const GAL_HTML = hasDist ? readFileSync(GAL_PATH, 'utf8') : '';

/* ── 旋钮：全部从源码解析 ───────────────────────────────────────────── */
const num = (re: RegExp, s: string = CODE, what = '') => {
  const m = s.match(re);
  expect(m, `没从源码解析出${what || String(re)}（改名了？门闩要跟着改）`).not.toBeNull();
  return Number(m![1]);
};
/** 每片转角（deg，纯数 —— 度数是靠 `* 1deg` 乘上去的，所以这里不许带单位） */
const A_DEG = num(/--sp-ang-deg:\s*([\d.]+)\s*;/, CODE, '每片转角 --sp-ang-deg');
/** 片宽上界（clamp 的第三段 = 最宽断点的片宽） */
const TILE_MAX = num(/--sp-tile:\s*clamp\(\s*[\d.]+px\s*,\s*[\d.]+vw\s*,\s*([\d.]+)px\s*\)/, CODE, '片宽上界');
const Y_K = num(/const Y_K = ([\d.]+)/, CODE, '纵向系数 Y_K');
const P_K = num(/const P_K = ([\d.]+)/, CODE, '透视比 P_K');
const SEAM = num(/const SEAM = ([\d.]+)/, CODE, '弦长系数 SEAM');
const FADE_IN = num(/const FADE_IN = ([\d.]+)/, CODE, 'FADE_IN');
const FADE_OUT = num(/const FADE_IN = [\d.]+, FADE_OUT = ([\d.]+)/, CODE, 'FADE_OUT');
/** 装置的盒高（`height: min(70svh, 620px)` 的第二段）—— 纵向适配要拿它比 */
const BOX_H = num(/height:\s*min\(\s*[\d.]+svh\s*,\s*([\d.]+)px\s*\)/, CODE, '装置盒高');
/** ★ 盒高的**下界**（`min-height`）—— 算"放大后会不会被裁"要用这一档，不是 620 那一档：
 *  窄屏 /矮窗口上 70svh 会小于 620，真约束是这个数。 */
const BOX_MIN = num(/min-height:\s*([\d.]+)px/, CODE, '装置盒高下界 min-height');

const pad3 = (n: number) => String(n).padStart(3, '0');

/* ══════════════════════════════════════════════════════════════════
 * 一、几何
 * ══════════════════════════════════════════════════════════════════ */
describe('螺旋盘 · 几何契约', () => {
  it('★★ 变换顺序必须是 `rotateY → translateZ → translateY`（换成别的顺序得到的不是螺旋）', () => {
    /* 为什么顺序不能动：
       · rotateY 先定朝向 ⇒ translateZ 沿**转过的** z 轴推出去（这才成为半径）；
       · translateY 沿**世界** Y 轴升高（rotateY 不改 Y 轴，所以它必须是全局的）。
       换成 "translateZ 在前" 会得到**柱面**（所有片等高、只是绕圈）；
       把 translateY 放到最前会得到"先升高再绕原点转"的另一个曲面。 */
    /* ⚠ 不许用 `[^)]*` —— `rotateY(calc(var(--k, 0) * …))` 里有**嵌套括号**，
       那样的正则会在第一个 `)` 就停住、永远匹配不上（本轮真踩）。用非贪婪 + 关键字定界。 */
    const want = /transform:\s*rotateY\([\s\S]*?\)\s+translateZ\([\s\S]*?\)\s+translateY\([\s\S]*?\)\s*;/;
    expect(FLAT, '源码里 .sp-item 的变换顺序不是 rotateY → translateZ → translateY').toMatch(want);
    /* 反面：柱面写法（translateZ 在 rotateY 之前）不许出现 */
    expect(FLAT, '出现了"translateZ 在前"的柱面写法').not.toMatch(
      /transform:\s*translate[ZY][^;]*rotateY/,
    );
    /* 产物层（防"源码对、编译后被改写/合并"）：页面自己那份 CSS 里逐字复核 */
    expect(hasDist, '先 npm run build').toBe(true);
    expect(PAGE_CSS, '产物里的 .sp-item 变换顺序变了').toMatch(
      /\.sp-item[^{]*\{[^}]*transform:rotateY\([\s\S]*?\)\s*translateZ\([\s\S]*?\)\s*translateY\([\s\S]*?\)/,
    );
  });

  it('★ rig 的每帧变换：`translate3d(...)` 在 `rotateY(...)` **之前**（位移发生在世界坐标里）', () => {
    /* 反过来写就成了"沿对焦那一张自己的朝向再挪一段"，对焦项不会落在原点。
       顺序对了，k = f 那一项才恰好落在原点、正对镜头（净旋转 0、z = R − R = 0）
       —— 所以整台**不需要任何矩阵求逆**。 */
    expect(CODE, 'rig 的 transform 不是 translate3d 在 rotateY 之前').toMatch(
      /rig\.style\.transform\s*=\s*\n?\s*`translate3d\([^`]*\)\s*rotateY\([^`]*\)`/,
    );
    /* 位移的三个分量：Y = −f·STEP、Z = −R（横向必须恒为 0 —— 对焦项要落在**正中**） */
    expect(CODE, 'rig 的横向位移必须恒为 0（对焦项要落在视口正中）').toMatch(
      /translate3d\(0,\$\{\(-f \* STEP\)/,
    );
    expect(CODE, 'rig 的旋转量必须是 −f × 每片转角').toMatch(/rotateY\(\$\{\(-f \* A_DEG\)/);
  });

  it('★★ R / 视距 / 每片升高**必须是算出来的**，不许写死在 CSS 里', () => {
    /* 写死会在别的断点上悄悄失效（站上为此吃过「按短边比例定的参数换尺寸后沿用」那一课）。
       CSS 里只留兜底值（`var(--sp-r, …)`），真值由脚本 measure() 从**渲染后的元素**算。 */
    expect(CODE, 'R 必须走 helix-core 的 radiusOf（弦长反解）').toMatch(/radiusOf\(TILE, A_DEG, SEAM\)/);
    expect(CODE, '横向节距必须走 helix-core 的 stepPxOf').toMatch(/stepPx = stepPxOf\(R, A_DEG\)/);
    expect(CODE, '脚本必须把 --sp-r / --sp-persp / --sp-step-y 写回元素').toMatch(
      /setProperty\('--sp-r'[\s\S]*?setProperty\('--sp-persp'[\s\S]*?setProperty\('--sp-step-y'/,
    );
    /* ★★ 片宽必须从**渲染后的元素**上量：自定义属性不参与计算，
       `getComputedStyle(vp).getPropertyValue('--sp-tile')` 返回的是**字面 token 流**
       `clamp(120px, 13.6vw, 196px)`，parseFloat 得到 NaN ⇒ 悄悄落到兜底、每个断点同一个数。
       （第一版真踩：三档实测片宽都是 196。） */
    expect(CODE, '片宽必须从渲染结果量（offsetWidth）').toMatch(/items\[0\]\.offsetWidth/);
    expect(CODE, '不许读 --sp-tile 的计算样式（那是字面 token 流，parseFloat 恒 NaN）').not.toMatch(
      /getPropertyValue\('--sp-tile'\)/,
    );
    /* 起飞顺序：先挂 .sp-on（绝对定位/定宽才生效）⇒ 再量 ⇒ 再画首帧 */
    const boot = CODE.slice(CODE.indexOf('createActivityGate(vp)'));
    expect(boot.indexOf("classList.add('sp-on')"), '必须先挂 .sp-on').toBeGreaterThan(-1);
    expect(
      boot.indexOf("classList.add('sp-on')"),
      '顺序反了：量到的是上一态（平铺网格）的尺寸',
    ).toBeLessThan(boot.indexOf('measure()'));
  });

  it('★ 弦长反解：相邻两片的 3D 距离 ≥ 片宽 × SEAM（任何断点都不穿插）', () => {
    for (const tile of [120, 136, 193, TILE_MAX]) {
      const R = radiusOf(tile, A_DEG, SEAM);
      const chord = 2 * R * Math.sin((A_DEG * Math.PI) / 360);
      expect(chord, `片宽 ${tile} 时弦长 ${chord.toFixed(1)} < ${(tile * SEAM).toFixed(1)}`).toBeGreaterThanOrEqual(
        tile * SEAM - 1e-6,
      );
      /* 正对照：不能靠"把 R 拉到无穷大"来满足弦长 —— 半径要随片宽线性走 */
      expect(R / tile, 'R / 片宽 必须是常数（它只由 SEAM 与转角决定）').toBeCloseTo(
        radiusOf(1, A_DEG, SEAM),
        9,
      );
    }
    /* 横向节距 = R·sinα（1:1 跟手的换算基准） */
    expect(stepPxOf(500, 30)).toBeCloseTo(500 * Math.sin(Math.PI / 6), 9);
  });

  it('★★★ 可见窗口必须**越过投影极值点** —— 否则投影单调，螺旋读成"斜排的照片带"', () => {
    /* 这是本页唯一一条"守观感"的判据，而它是**算得出来的**（不是审美主张）：
       片心投影 x/R = sinθ × P_K / (P_K + 1 − cosθ)（见 helix-core.projX）。
       透视把**近侧**放大 ⇒ 极值点被拉到 90° 之前（P_K = 2.4 时约 78°）。
       窗口扫过的总角度 = FADE_OUT × 每片转角。若只扫到 65°，远端 / 峰值 ≈ 1.00
       ⇒ 可视范围内投影**单调**，视觉上就是一条直的斜带子（第一版实测就是这个：
       near 读数从 −4 到 +3 的 dx 一路单调 555 → 554，卷回率 1.000）。
       ⇒ 要求：至少扫过 110°，且远端必须收回到峰值的 75% 以内。 */
    const sweep = FADE_OUT * A_DEG;
    expect(sweep, `可见窗口只扫 ${sweep}° ⇒ 到不了回折点，看不出"绕"`).toBeGreaterThanOrEqual(110);
    let peak = 0;
    for (let d = 0; d <= sweep; d += 0.25) peak = Math.max(peak, Math.abs(projX(d, P_K)));
    const edge = Math.abs(projX(sweep, P_K));
    const curl = edge / peak;
    expect(
      curl,
      `远端只收回到峰值的 ${(curl * 100).toFixed(0)}%（18°×3.6 是 100%，那正是"像直带子"的原因）`,
    ).toBeLessThanOrEqual(0.75);
    /* 反面正对照：确实走过了极值点 —— 峰值出现在窗口**内部**，不在端点 */
    expect(A_DEG * FADE_OUT, '窗口还没走到 78° 附近的极值点').toBeGreaterThan(90);
  });

  it('★★ 纵向跨度必须落在装置盒**里面**（否则远端被 overflow 切在盒外）', () => {
    /* 可见窗口的纵向跨度 = 2 × FADE_OUT × (片宽 × Y_K)。
       第一版实测：2 × 3.6 × (193 × 0.5) = ±347px，而盒子半高只有 310px
       ⇒ 螺旋的尾巴被切在盒外（探针 near 读数里 k = ±4 那两张就在盒外）。 */
    const step = TILE_MAX * Y_K;
    const half = FADE_OUT * step;
    expect(
      half,
      `纵向 ±${half.toFixed(0)}px > 盒子半高 ${(BOX_H / 2).toFixed(0)}px ⇒ 远端被切在盒外`,
    ).toBeLessThanOrEqual(BOX_H / 2);
    /* 正对照：窗口要**用得上**盒子（不能缩成一小团） */
    expect(half, '纵向只用了盒子的 60% ⇒ 装置显得瘪').toBeGreaterThanOrEqual(BOX_H * 0.3);
  });

  it('★ 每一片都带自己的 `--k`（下标就是它在序列里的位次），且首项落在 translateZ(R) 上', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    const ks = [...HTML.matchAll(/--k:(\d+)/g)].map((m) => Number(m[1]));
    expect(ks.length, `应有 ${TOTAL} 片各带一个 --k`).toBe(TOTAL);
    expect(ks, '--k 必须是 0..N−1 且不重不漏（有重复 ⇒ 两片会叠在一起）').toEqual(
      Array.from({ length: TOTAL }, (_, i) => i),
    );
    /* transform 里引用的就是 --k（不是另抄一份常量） */
    expect(PAGE_CSS, 'transform 没用 var(--k)').toMatch(/transform:rotateY\(calc\(var\(--k,0\)/);
    /* 首项：--k = 0 ⇒ rotateY(0) translateZ(R) translateY(0) ⇒ 只有 z = R（正对镜头、落在正中） */
    expect(MANIFEST.widths.length, '档位表空了？').toBeGreaterThan(0);
  });

  it('★ 淡出窗口是按「隔了几张」给的，且 FADE_IN < FADE_OUT', () => {
    /* 按"片"而不是按"角度"给 —— 它对应的就是"我离当前这张隔了几张"。
       FADE_IN 只让焦点那一张独占全实（本页的主张：一次只把注意力交给一张）。 */
    expect(FADE_IN, 'FADE_IN 不能为 0（紧邻的两张也会闪）').toBeGreaterThanOrEqual(0.3);
    expect(FADE_IN, 'FADE_IN 太大 ⇒ 一次有好几张"全实"，注意力不集中').toBeLessThanOrEqual(1.2);
    expect(FADE_OUT, 'FADE_OUT 必须大于 FADE_IN').toBeGreaterThan(FADE_IN + 1);
    expect(FADE_OUT, 'FADE_OUT 太大 ⇒ 远端全堆在两侧').toBeLessThanOrEqual(8);
    const paint = CODE.slice(CODE.indexOf('const paint = () => {'));
    expect(paint, '淡出没走 smoothstep').toMatch(/sm\(clamp\(\(d - FADE_IN\) \/ \(FADE_OUT - FADE_IN\)/);
    /* ★★ 2026-10-08：淡出必须带**死区** —— 低于阈值一次归零，不留半透明残影。
       站主两次报"照片缩小时的边缘异常"，其中一块实测就是**淡出中的邻片**
       （逐片量 rect 定位到 #4「向日葵味的蓝天」：op 0.137、投影 74×96px、
       区域均色 rgb(209,211,204)，比纸白暗 15~41 级）—— 它半透明地叠在纸上，
       读起来不是"一张远处的照片"而是"照片旁边一块脏的残影"。
       ★ 上下界都要有：太低咬不住（第一版取 0.12，实测**没盖住** op 0.137 那一张），
         太高会切掉"还看得出形状"的螺旋侧壁（#3 是 op 0.448 的窄条，那个是该留的）。 */
    const fadeOff = num(/const FADE_OFF = ([\d.]+)/, CODE, 'FADE_OFF');
    expect(fadeOff, '淡出没有死区（或太低）⇒ 极淡的残影会留在装置里').toBeGreaterThan(0.12);
    expect(fadeOff, '死区太高 ⇒ 会切掉"还看得出形状"的那些片（螺旋侧壁）').toBeLessThan(0.35);
    expect(paint, '死区没有真的作用到 opacity 上').toMatch(/raw > FADE_OFF \? raw : 0/);
  });

  /* ★★★ 2026-10-09（§6.65，站主第三次报"照片边缘残留色块"）：远侧柔边。
     病根实测：透视把 56° / 84° 的片压成 52.7 / 28.0px 宽的窄条，照片里本来就有的硬边彩色竖条
     被压扁后读成"照片边上的色块"。修法 M1（站主看过三版预览后选定）：
     远侧那条硬边渐隐进纸白 —— **不改 opacity、不改几何、不加底色、不硬切**。
     下面四条分别守：强度曲线 / 与淡出互不相干 / 只挂在该挂的片上且方向对 / 不许拿 clip-path 代替。 */
  it('★★ 远侧柔边 ①：强度曲线 —— ≤1 片精确为 0，之后单调爬升，最大值 < 1', () => {
    for (const r of [0, A_DEG * 0.5, A_DEG, -A_DEG]) {
      expect(edgeOf(r, A_DEG), `柔边在 ${r}° 不为 0 ⇒ 焦点与 ±1 片会被遮罩改掉像素`).toBe(0);
    }
    expect(edgeOf(2 * A_DEG, A_DEG), '柔边在 2 片处没有起作用（56° 那片窄条的硬边会原样留着）').toBeGreaterThan(0.1);
    expect(EDGE_MAX, '柔边最大值必须 < 1（到 1 就是整片抹掉 = 退回已否掉的"藏掉"方案）').toBeLessThan(1);
    expect(EDGE_MAX, '柔边太弱 ⇒ 84° 那片窄条的硬边还在（预览实测 0.6 才压得下去）').toBeGreaterThanOrEqual(0.4);
    let prev = 0;
    for (let r = 0; r <= FADE_OUT * A_DEG; r += 0.5) {
      const e = edgeOf(r, A_DEG);
      expect(e, `柔边在 ${r}° 处回落 ⇒ 曲线不单调（远处的片反而更硬）`).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(e, `柔边在 ${r}° 处超过 EDGE_MAX`).toBeLessThanOrEqual(EDGE_MAX + 1e-12);
      expect(edgeOf(-r, A_DEG), '柔边对左右两侧不对称').toBe(e);
      prev = e;
    }
    expect(edgeOf(3 * A_DEG, A_DEG), '柔边到 3 片处应已饱和').toBeCloseTo(EDGE_MAX, 9);
  });

  it('★★ 远侧柔边 ②：与淡出互不相干 —— opacity 公式不读它，它按「角度」喂', () => {
    const paint = CODE.slice(CODE.indexOf('const paint = () => {'), CODE.indexOf('if (near !== curOn)'));
    const oLine = paint.match(/const o = ([^;]*);/)?.[1] ?? '';
    expect(oLine, '没找到 opacity 那一行').not.toBe('');
    expect(oLine, 'opacity 公式不许读柔边（柔边只减远侧像素，不许借道把整片调淡）').not.toMatch(/\be\b|edge|ed\[/);
    expect(paint, 'opacity 写入不许掺柔边').toMatch(/items\[i\]\.style\.opacity = o\.toFixed\(3\)/);
    expect(paint, '柔边没按角度喂（edgeOf 吃的是度数，不是片数）').toMatch(/edgeOf\(\(i - f\) \* A_DEG, A_DEG\)/);
  });

  it('★★ 远侧柔边 ③：遮罩只挂在 .sp-fade 上、引用 --sp-edge，方向由 i − f 的符号决定', () => {
    const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => /mask-image\s*:/.test(m[2]));
    expect(rules.length, '螺旋态照片上没有 mask-image（柔边没落地）').toBeGreaterThan(0);
    for (const [, sel, body] of rules) {
      expect(sel, '遮罩只许挂在 .sp-fade 的片上（焦点与 ±1 片不许有遮罩）').toMatch(/\.sp-fade\b/);
      expect(sel, '遮罩必须只在螺旋态生效').toContain(':global(.sp-on)');
      expect(body, '遮罩没引用 --sp-edge（强度不随角度走）').toMatch(/(?:^|[;\s])mask-image:[^;]*var\(--sp-edge/);
      expect(body, '遮罩没引用 --sp-dir（方向写死 ⇒ 一侧会渐隐到近侧）').toMatch(/(?:^|[;\s])mask-image:[^;]*var\(--sp-dir/);
      expect(body, '缺 -webkit-mask-image（Safari 仍要前缀）').toMatch(/-webkit-mask-image\s*:/);
    }
    const paint = CODE.slice(CODE.indexOf('const paint = () => {'), CODE.indexOf('if (near !== curOn)'));
    expect(paint, '类必须随 e > 0 挂/摘').toMatch(/classList\.toggle\('sp-fade', e > 0\)/);
    expect(paint, '方向必须由 i > f 决定（远侧 = 背离焦点的那一边）').toMatch(/\w+ = i > f \? 1 : -1/);
    expect(paint, '方向映射反了：i > f 的片远侧是局部右边').toMatch(/> 0 \? 'to right' : 'to left'/);
  });

  it('★ 远侧柔边 ④：不许拿 clip-path 代替（硬切出来的还是一道硬边）', () => {
    expect(CODE, '出现了 clip-path ⇒ 硬边只是换了个位置').not.toMatch(/clip-?path/i);
  });
});

/* ══════════════════════════════════════════════════════════════════
 * 二、惯性（纯函数层）
 * ══════════════════════════════════════════════════════════════════ */
describe('螺旋盘 · 惯性数学（helix-core 纯函数）', () => {
  it('★★★ 速度必须先夹住再进积分器 —— 这里出过一个真 bug', () => {
    /* 真身：`tgt = clamp(Math.round(f + clamp(v,−8,8) * LOOKAHEAD), …)` 只夹住了
       「用来算目标的那份副本」，**喂给弹簧的 v 本身没夹** ⇒ 输入噪声直接当速度进积分器：
       探针的合成事件 dt ≈ 1ms ⇒ 平滑出 v ≈ 1250 张/秒 ⇒ 松手后第一帧 f += v·dt = +20.8 张。
       真机 1000Hz 鼠标一次 100px 位移（1ms）就能算出 424 张/秒 —— 不是实验室假象。 */
    const noisy = [1250, -1250, 424, 1e9, -1e9, NaN, Infinity, -Infinity];
    for (const raw of noisy) {
      const v = blendV(0, raw);
      expect(Number.isFinite(v), `blendV(0, ${raw}) 返回了非有限值`).toBe(true);
      expect(Math.abs(v), `blendV 没夹住 ${raw} ⇒ 它会原样进积分器`).toBeLessThanOrEqual(V_MAX);
    }
    /* 甩出的目标：把它算成"最多再走 V_MAX × LOOKAHEAD 张"，且**与传进来多少无关** */
    const far = throwTarget(0, 1250, 0, TOTAL - 1);
    expect(far, '甩出目标必须与已夹的速度等价（不然就是没夹）').toBe(throwTarget(0, V_MAX, 0, TOTAL - 1));
    expect(far, '一甩不许越过速度上界投影出来的距离').toBeLessThanOrEqual(Math.ceil(V_MAX * LOOKAHEAD) + 1);
    /* 正对照：真的会甩出去（不是"夹成 0 了事"） */
    expect(throwTarget(20, V_MAX, 0, TOTAL - 1), '全速甩不许原地不动').toBeGreaterThan(20);
    expect(throwTarget(20, -V_MAX, 0, TOTAL - 1), '反向全速甩不许原地不动').toBeLessThan(20);
    expect(throwTarget(20, 0, 0, TOTAL - 1), '零速不甩（原地吸附到格）').toBe(20);
    /* 边界：不许甩出序列两端 */
    expect(throwTarget(TOTAL - 1, V_MAX, 0, TOTAL - 1)).toBe(TOTAL - 1);
    expect(throwTarget(0, -V_MAX, 0, TOTAL - 1)).toBe(0);
    /* 噪声不是被"顺手丢掉"的：平滑确实在用新观测 */
    expect(blendV(0, V_MAX), 'blendV 没吸收新观测').toBeGreaterThan(0);
    expect(blendV(0, V_MAX)).toBeCloseTo(V_MAX * V_BLEND, 9);
  });

  it('★★ 页面里不许出现"先存后夹"的老写法，也不许把弹簧系数抄回来', () => {
    expect(CODE, '松手必须走 throwTarget（它内部 clampV 夹的是**真正喂进弹簧的那一份**）').toMatch(
      /tgt = throwTarget\(f, v, 0, N - 1\)/,
    );
    expect(CODE, '又出现了 `clamp(v, …)` 这种"只夹副本"的写法').not.toMatch(/clamp\(\s*v\s*,/);
    expect(CODE, '速度平滑必须走 blendV（它在**同一步**里夹住）').toMatch(/v = blendV\(v, /);
    expect(CODE, '页面里又内联了弹簧系数（它们住在 helix-core，改一处就够）').not.toMatch(
      /const K = 90|const C = 2 \* Math\.sqrt/,
    );
    /* 只有一处积分器调用，且在 tick 里 */
    const calls = [...CODE.matchAll(/stepSpring\(/g)].length;
    expect(calls, 'stepSpring 必须只被调用一次（两处调用 = 两套积分器）').toBe(1);
    expect(CODE, '积分器必须吃**真实 dt**').toMatch(/stepSpring\(f, v, tgt, dt\)/);
    /* 停帧：滚出视口 / 切走标签页时不许继续积分（否则回来会突然窜一截） */
    expect(CODE, 'tick 没接停帧开关').toMatch(
      /if \(!gate\.onScreen \|\| !gate\.visible\) return;/,
    );
  });

  it('★★ 积分器吃真实 dt：同样**时长**、不同帧率 ⇒ 落到同一个位置', () => {
    const run = (steps: number, dtMs: number, tgt = 10) => {
      let f = 0;
      let v = 0;
      for (let i = 0; i < steps; i++) {
        const s = stepSpring(f, v, tgt, dtMs);
        f = s.f;
        v = s.v;
      }
      return f;
    };
    /* 0.333 秒：120Hz 走 40 帧、60Hz 走 20 帧 —— 必须几乎一样。
       "每帧固定系数"的写法（把 dt 当成 1/60 秒）在这里会差出可观的一截。 */
    const a = run(40, 1000 / 120);
    const b = run(20, 1000 / 60);
    expect(Math.abs(a - b), `120Hz 走 ${a.toFixed(3)}、60Hz 走 ${b.toFixed(3)} ⇒ 观感随设备变`).toBeLessThan(
      0.05,
    );
    /* 反面对照：**同样的帧数**、把 dt 当成 1/60 ⇒ 走到的是另一个时间点（证明 dt 真的在起作用） */
    expect(Math.abs(run(40, 1000 / 60) - a), 'dt 没参与积分（每帧系数固定）').toBeGreaterThan(1);
    /* 一帧到不了位（否则就不是弹簧、是瞬移） */
    const one = stepSpring(0, 0, 10, 1000 / 60);
    expect(one.settled, '一帧就收敛 ⇒ 弹簧退化成瞬移').toBe(false);
    expect(one.f, '首帧位移过大').toBeLessThan(1);
    /* 超长 dt 会被夹住：切回标签页的首帧不许让整台窜出去 */
    expect(stepSpring(0, 0, 10, 5000), '大 dt 没被夹到 DT_MAX').toEqual(stepSpring(0, 0, 10, DT_MAX));
  });

  it('★ 积分器收敛：最终**精确落在**格上、速度归零；且不是"抖着不动"', () => {
    let f = 0;
    let v = 120; // 初速度很大（甩出去的极端）
    let settled = false;
    let frames = 0;
    while (!settled && frames < 2000) {
      const s = stepSpring(f, v, 12, 1000 / 60);
      f = s.f;
      v = s.v;
      settled = s.settled;
      frames++;
    }
    expect(settled, '2000 帧还没停稳').toBe(true);
    expect(f, '停稳时必须**精确**落在目标格上（留在 11.998 会永远抖）').toBe(12);
    expect(v, '停稳时速度必须归零').toBe(0);
    /* 正对照：确实经过了一段"带过冲的"行程，不是一步到位 */
    expect(frames, '帧数太少 ⇒ 不像弹簧').toBeGreaterThan(10);
    /* 过冲：ζ = 0.86 < 1 ⇒ 会略微越过目标再回来（这就是"重量"而不是"瞬移"） */
    let g = 0;
    let gv = 0;
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      const s = stepSpring(g, gv, 10, 1000 / 60);
      g = s.f;
      gv = s.v;
      peak = Math.max(peak, g);
    }
    expect(peak, '完全没有过冲 ⇒ 阻尼太大，读起来"黏"').toBeGreaterThan(10);
    expect(peak, `过冲 ${(peak - 10).toFixed(2)} 张太多 ⇒ 读起来"晃"`).toBeLessThan(11.2);
    expect(ZETA, '阻尼比必须 < 1（欠阻尼才有"重量"）').toBeLessThan(1);
    expect(C, 'C 必须由 ω 与 ζ 推导（不许写死）').toBeCloseTo(2 * Math.sqrt(K) * ZETA, 9);
  });

  it('★ 夹持兜住 NaN / Infinity（积分器一旦拿到就再也回不来）', () => {
    /* 本页踩过一次同类：首帧 dt 是负数会让整台跳到极端态。 */
    expect(clamp(NaN, 3, 9), 'NaN 必须落到下界').toBe(3);
    /* ★★ ±Infinity 必须**按方向**夹。若把"非有限值"一律当下界，
       `clampV(+∞)` 会变成 −V_MAX ⇒ 一台往前冲的装置突然**反号**往后猛退。 */
    expect(clamp(Infinity, 3, 9), '+∞ 必须夹到上界（不是下界）').toBe(9);
    expect(clamp(-Infinity, 3, 9)).toBe(3);
    expect(clampV(Infinity), 'clampV(+∞) 不能反号').toBe(V_MAX);
    expect(clampV(-Infinity)).toBe(-V_MAX);
    expect(clamp(5, 3, 9)).toBe(5);
    expect(clampV(1e9)).toBe(V_MAX);
    expect(stepSpring(NaN, NaN, 7, 16.7), '状态里混进 NaN 时必须能自愈到目标').toEqual({
      f: 7,
      v: 0,
      settled: true,
    });
    /* 阈值常量必须是"停得住"的量级：太松会永远抖，太紧会留下可见偏差 */
    expect(EPS_X, 'EPS_X 太大 ⇒ 停在肉眼可见的格前').toBeLessThan(0.02);
    expect(EPS_V, 'EPS_V 太大 ⇒ 速度还没归零就判停').toBeLessThan(0.2);
    expect(DT_MAX, 'DT_MAX 太小 ⇒ 掉帧时慢半拍').toBeGreaterThanOrEqual(30);
    expect(DT_MAX, 'DT_MAX 太大 ⇒ 切回标签页会窜').toBeLessThanOrEqual(120);
  });
});

/* ══════════════════════════════════════════════════════════════════
 * 三、降级链
 * ══════════════════════════════════════════════════════════════════ */
describe('螺旋盘 · 降级链（无 JS 与 reduce 走同一个平铺网格）', () => {
  it('★★ 基础标记是平铺网格：`.sp-rig` 默认 `display:grid`，螺旋态才改成绝对定位', () => {
    const base = CODE.match(/(^|\n)\s*\.sp-rig\s*\{([^}]*)\}/)?.[2] ?? '';
    expect(base, '没读到 .sp-rig 的基准样式').toBeTruthy();
    expect(base, '基准态必须是网格（它就是无 JS / reduce 看到的样子）').toMatch(/display:\s*grid/);
    expect(base, '基准态不许有 position:absolute（那会让无 JS 时 82 张全叠在一点）').not.toMatch(
      /position:\s*absolute/,
    );
    const body = CODE.match(/\.sp-item\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(body, '基准态的 .sp-item 不许是绝对定位').not.toMatch(/position:\s*absolute/);
    expect(body, '基准态的 .sp-item 不许写死宽高（那是网格的事）').not.toMatch(/(^|\n)\s*width:/);
    /* 螺旋态：每一条都挂在 .sp-on 下 */
    const on = CODE.match(/:global\(\.sp-on\) \.sp-rig\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(on, '没读到螺旋态的 .sp-rig 样式').toBeTruthy();
    expect(on, '螺旋态的 .sp-rig 必须是绝对定位的 0×0 盒子（82 片全居中在原点）').toMatch(
      /position:\s*absolute/,
    );
    expect(on, '★ 必须 preserve-3d（丢了它整台退化成"一堆各自旋转的平面"）').toMatch(
      /transform-style:\s*preserve-3d/,
    );
  });

  it('★★ `.sp-on` 只由脚本加：产物 HTML 里不许出现（无 JS 时它必须不存在）', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    expect(HTML, '产物 HTML 里带了 sp-on ⇒ 无 JS 时也会走螺旋态的样式（82 张全叠在一点）').not.toMatch(
      /sp-on/,
    );
    expect(CODE, '必须由脚本给 <html> 挂 .sp-on').toMatch(/root\.classList\.add\('sp-on'\)/);
    /* ★ 选择器前导段必须是 :global()：.sp-on 挂在 <html> 上，而 <html> 是 Base 渲染的
       ⇒ 带作用域属性的 `.sp-on` 永远匹配不到。 */
    expect(CODE, '挂在 <html> 上的类，选择器前导段必须 :global()').toMatch(/:global\(\.sp-on\)/);
    expect(CODE, '没加 :global() 的 .sp-on 选择器匹配不到（<html> 不带作用域属性）').not.toMatch(
      /(^|\n)\s*\.sp-on[ .:]/,
    );
    if (hasDist) {
      expect(PAGE_CSS, '产物里 .sp-on 没被 :global 放出来').toMatch(/:where\(\.sp-on\)|\.sp-on/);
    }
  });

  it('★★ reduce 下**根本不建**装置（不是"调慢"、不是 hidden 门控）', () => {
    /* 站上踩过一次：给 canvas 加 `hidden` ⇒ clientWidth 恒 0 ⇒ 什么也算不出来。
       所以这里用的是"脚本第一行就 return"，页面留在平铺网格上。 */
    const boot = CODE.slice(CODE.indexOf('const reduce = prefersReducedMotion()'));
    const guard = boot.indexOf('if (!shouldAnimate(reduce))');
    expect(guard, '没找到 shouldAnimate 降级判据').toBeGreaterThan(-1);
    expect(
      guard,
      '降级判据必须在 `classList.add(\'sp-on\')` **之前**（否则先变成螺旋再退回来）',
    ).toBeLessThan(boot.indexOf("classList.add('sp-on')"));
    const guardBody = boot.slice(guard, guard + 400);
    expect(guardBody, '降级分支必须 return（不建装置）').toMatch(/return;/);
    expect(guardBody, '降级时要把说明文案换掉（告诉读者发生了什么，不是静默消失）').toMatch(
      /data-sp-note|note\.textContent/,
    );
    /* CSS 侧不许写"reduce 时把螺旋关掉"的死规则：reduce 下根本不会有 .sp-on */
    expect(CODE, '写了 reduce 的 CSS 兜底 ⇒ 会让人误以为降级是靠 CSS 实现的').not.toMatch(
      /prefers-reduced-motion[^{]*\{[^}]*\.sp-on/,
    );
  });

  it('★ 无 JS 时页面完整可用：82 条真链接 + 真 alt + 真宽高', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    const frames = [...HTML.matchAll(/<a class="sp-frame"[^>]*>/g)].map((m) => m[0]);
    expect(frames.length, `应有 ${TOTAL} 条缩略图链接`).toBe(TOTAL);
    for (const a of frames) {
      expect(a, '缩略图链接缺 href（无 JS 时点不开大图）').toMatch(/href="\/gallery\//);
      expect(a, '缩略图链接缺 data-no-transition ⇒ 墨色蒙版会盖在灯箱上').toContain('data-no-transition');
    }
    const imgs = [...HTML.matchAll(/<img[^>]*src="\/gallery\/[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(imgs.length, `应有 ${TOTAL} 张图（+1 张灯箱的）`).toBeGreaterThanOrEqual(TOTAL);
    for (const im of imgs) {
      expect(im, '图缺 alt（读屏读不出）').toMatch(/\salt="[^"]+"/);
    }
    const gridImgs = imgs.filter((i) => !/id="splbImg"/.test(i));
    expect(gridImgs.length, `网格里的图应有 ${TOTAL} 张`).toBe(TOTAL);
    for (const im of gridImgs) {
      expect(im, '图缺 width/height ⇒ 解码前会跳版').toMatch(/\swidth="\d+"/);
      expect(im, '图缺 height').toMatch(/\sheight="\d+"/);
    }
  });

  it('★ 螺旋态与平铺态是**同一份标记**（不是两套 DOM 互相切）', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    expect((HTML.match(/data-sp-rig/g) ?? []).length, '只能有一个装置坐标系').toBe(1);
    expect((HTML.match(/data-spiral/g) ?? []).length, '只能有一个挂载点').toBe(1);
    expect(CODE, '不许用 innerHTML 重建（那会丢 alt / 链接 / 焦点）').not.toMatch(/innerHTML/);
    /* 灯箱翻页不环绕：螺旋本身首尾不闭环，环形翻页会让下标与螺旋不同步 */
    expect(CODE, '灯箱翻页必须 clamp（不环绕）').toMatch(/const j = clamp\(lbAt \+ d, 0, N - 1\)/);
  });
});

/* ══════════════════════════════════════════════════════════════════
 * 四、红线与预算
 * ══════════════════════════════════════════════════════════════════ */
describe('螺旋盘 · 点击放大（站主 2026-10-07：「点击照片那张照片要放大」）', () => {
  it('★★★ 两段式：点一下放大，再点放大那张才开灯箱', () => {
    /* 为什么不是"点一下直接弹灯箱"：那样点错一张就弹错一张，没法先看清楚。
       `if (zoomAt === i) openLB(i); else setZoom(i);` 这两句是全部机制。 */
    expect(JS, '指针点击没有走"两段式"（已放大才开灯箱、否则只放大）').toMatch(
      /zoomAt === i\s*\)\s*openLB\(i\);\s*else\s*\{\s*v = 0;\s*setZoom\(i\);/,
    );
    /* 键盘那条路必须同一语义 —— 只改指针不改键盘，键盘访客拿不到"先放大" */
    expect(JS, '键盘 Enter 没走同一套两段式').toMatch(
      /if \(zoomAt === i\) openLB\(i\);\s*else setZoom\(i\);/,
    );
    /* 键盘那条不能被指针事件重复触发（click 的 detail 恒 0 才算键盘） */
    expect(JS, '键盘 Enter 那条没有用 detail 区分指针（同一帧会被处理两次）').toMatch(
      /if \(\(e as MouseEvent\)\.detail\) return;/,
    );
  });

  it('★★ 放大态是"同一时刻只有一个"，且搬家/撤掉都要真的动 class', () => {
    /* setZoom 是唯一的写入口：先摘旧的、再挂新的 ⇒ 不会同时有两张放大。 */
    expect(JS, 'setZoom 没有先摘掉旧的那张（会同时有两张是大的）').toMatch(
      /const setZoom = \(i: number\) => \{[\s\S]{0,260}?classList\.remove\('zoom'\)[\s\S]{0,200}?classList\.add\('zoom'\)/,
    );
    expect(JS, 'setZoom 没有防自激（同一个下标重复赋值会白摘一次）').toMatch(
      /const setZoom = \(i: number\) => \{\s*if \(zoomAt === i\) return;/,
    );
    /* 初始态必须是"没有放大的"—— 页面刚进来一律等大，不预设哪张重要 */
    expect(JS, '放大态初始值必须是 −1（默认不放大）').toMatch(/let zoomAt = -1;/);
  });

  it('★★★ 点空白 = 慢慢回到原处（站主第四轮：「点击其他地方就会慢慢回到原处」）', () => {
    /* 判据写在 release() 里那条`if (!it)` 分支。★ 它必须靠 `downOn`/closest 判"没落在片上"
       —— 指针捕获会把 pointerup 改派给容器，用 e.target 判就永远分不出"片"与"空白"。 */
    expect(JS, '没有"点空白 ⇒ 撤放大"这条（点照片放大后回不去原处）').toMatch(
      /const it = downOn \?\?[\s\S]{0,200}?if \(!it\) \{[\s\S]{0,260}?if \(zoomAt >= 0\) setZoom\(-1\);/,
    );
    /* ★ 只在"确实有放大"时才动手：否则点空白会白跑一次 class 操作，
       而且把"什么都没发生"也走成一条语义。 */
    expect(JS, '点空白那条没有先判`zoomAt >= 0`（没放大时也会动class）').not.toMatch(
      /if \(!it\) \{\s*setZoom\(-1\);/,
    );
    /* ★★ 反过来钉住"点**另一张**照片 ≠ 复原"：那是搬家，不是撤放大。 */
    expect(JS, '点旁边那张应该搬家（goto + setZoom），不该一律复原').toMatch(
      /goto\(i\);\s*setZoom\(i\);/,
    );
  });

  it('★★★ 放大要"缓缓到眼前"：倍数与时长都够（站主第三、四轮）', () => {
    /* 第一版 1.34 + --dur-enter(640ms) 实测读作"弹出来"，不够"缓缓放大到眼前"。
       判据钉两件事：倍数走 --sp-zoom 且默认值 ≥ 1.7；时长是 --dur-enter 的 1.6 倍。 */
    const zoom = /:global\(\.sp-on\)\s+\.sp-item\.zoom\s+\.sp-frame\s*\{[\s\S]{0,400}?transform:\s*scale\(([^;]+);/.exec(CSS);
    expect(zoom, '找不到"放大那张"的 scale 规则').not.toBeNull();
    const z = zoom![1] ?? '';
    expect(z, `放大倍数要读 --sp-zoom 这个旋钮（现在是 ${z}），窄屏才收得下来`).toContain('--sp-zoom');
    const def = Number(/--sp-zoom:\s*([\d.]+)/.exec(CSS)?.[1] ?? NaN);
    expect(Number.isFinite(def), 'CSS 里没有 --sp-zoom 的默认值').toBe(true);
    expect(def, `默认放大 ${def} 太小（<1.7 读起来是"弹出来"而不是"到眼前"）`).toBeGreaterThanOrEqual(1.7);
    /* 时长必须是 --dur-enter 的倍数而不是照抄640ms */
    expect(CSS, '放大/复原的过渡不是"缓缓"那档（应取 calc(--dur-enter × 1.6)）').toMatch(
      /transition:\s*transform\s+calc\(var\(--dur-enter\)\s*\*\s*1\.6\)\s+var\(--ease\)/,
    );
    /* ★ 窄屏必须收一档：min-height 只有 320px，1.9 × 196 = 372px 会被 overflow 切掉上下缘 */
    expect(CSS, '窄屏没有收 --sp-zoom（最矮那档 320px 装不下 372px 的片）').toMatch(
      /@media \(max-width: 680px\)[\s\S]{0,400}?--sp-zoom:\s*1\.5/,
    );
  });

  it('★★ 放大态跟随焦点（点过一次之后，拖动换片时放大跟着走）', () => {
    /* 判据写在 hud() 里 —— 那是对焦标记换人的唯一入口。 */
    expect(JS, '换焦点时放大态没有跟随（拖动之后放大那张会停在原地不跟）').toMatch(
      /const hud = \(i: number\) => \{[\s\S]{0,700}?if \(zoomAt >= 0 && zoomAt !== i\) setZoom\(i\);/,
    );
    /* 反向：还没点过（zoomAt < 0）时拖动**不许**触发放大 */
    expect(JS, '未点过时也会放大（默认态就不该预设哪张重要）').not.toMatch(/const hud = \(i: number\) => \{[\s\S]{0,700}?if \(zoomAt >= -1/);
  });

  it('★★ Esc 先撤放大、灯箱优先（退一步，不是直接关掉全屏）', () => {
    expect(JS, '没有"Esc 撤放大"这条（点开之后退不出去）').toMatch(
      /document\.addEventListener\('keydown'[\s\S]{0,320}?e\.key !== 'Escape'[\s\S]{0,160}?setZoom\(-1\)/,
    );
    /* 灯箱开着时这条必须让路 —— 否则 Esc 会先撤放大、灯箱留在屏幕上 */
    expect(JS, 'Esc 撤放大没有给灯箱让路（灯箱开着时会被抢走）').toMatch(
      /if \(e\.key !== 'Escape'[\s\S]{0,120}?lb\.classList\.contains\('on'\)\) return;/,
    );
  });

  it('★★★ 抬手判定必须用"按下时记的落点"，不能用 pointerup 的 target', () => {
    /* 这条是本轮实测抓到的**真实缺陷**（不是风格问题）：
       `pointerdown` 里调了 `vp.setPointerCapture(pid)`，而指针捕获会把**后续所有指针事件
       全部改派给捕获元素**（vp）⇒ `pointerup` 的 `e.target` 恒是 `sp-viewport`，
       `closest('[data-sp-item]')` 恒为 null ⇒ 点击整段不执行（表现为"点了没反应"）。
       修法是按下时把落点存进 `downOn`，抬手时用它。 */
    expect(JS, '按下时没有记下落点所在的片（`downOn`）—— 指针捕获之后 pointerup 拿不到它').toMatch(
      /let downOn: HTMLElement \| null = null;/,
    );
    expect(JS, 'downOn 没有在 pointerdown 里被赋值').toMatch(
      /pointerdown[\s\S]{0,900}?downOn = \(e\.target as HTMLElement \| null\)\?\.closest<HTMLElement>\('\[data-sp-item\]'\) \?\? null;/,
    );
    expect(JS, '抬手判定没有优先用 downOn（⇒ 指针捕获后恒为 null ⇒ 点击全失灵）').toMatch(
      /const it = downOn \?\? \(\(e\.target as HTMLElement \| null\)\?\.closest<HTMLElement>\('\[data-sp-item\]'\) \?\? null\);/,
    );
    /* 用完即弃：否则"上一次按在片上、这次按在空处"会拿旧落点当这次的 */
    expect(JS, 'downOn 用完没清（下次按在空处会误判成上一次那片）').toMatch(
      /downOn = null;\s*\/\/ 用完即弃/,
    );
  });

  it('★★★ 放大只用 scale()，不许动 3D 位姿（translateZ 会改半径、撞邻片）', () => {
    expect(CODE, '放大那条没落在 .sp-item.zoom .sp-frame 上').toMatch(
      /\.sp-item\.zoom \.sp-frame\s*\{[\s\S]{0,200}?transform:\s*scale\(/,
    );
    /* 反向：3D 位姿的载体是 .sp-item（rotateY + translateZ(R) + translateY），
       若把 scale 改用 translateZ 加在 .sp-item 上，半径就变了 ——
       上面那几条几何契约（R 由弦长反解 / 纵向跨度落在盒内）会一起失效。 */
    expect(CODE, '放大改用了 translateZ（会改半径、与邻片穿插）').not.toMatch(
      /\.sp-item\.zoom\s*\{[\s\S]{0,240}?translateZ\(/,
    );
    /* 常态那条必须有 `transform: scale(1)`，否则"没放大"与"放大"之间没有可插值的起点，
       第一次点开会瞬变（transition 从 none 起算）。 */
    expect(CODE, "常态缺 transform: scale(1)（第一次点开会是瞬变，没有过渡）").toMatch(
      /\.sp-on\) \.sp-frame\s*\{[\s\S]{0,400}?transform:\s*scale\(1\);/,
    );
  });

  it('★★ 放大有过渡，且能算出来"放大后仍装得进装置盒"', () => {
    /* ★ 过渡那条已挪到「缓缓到眼前」那条里按新时长口径钉（640ms 那版作废）。 */
    expect(CSS, '常态缺 transform: scale(1)（第一次点开会是瞬变，没有过渡）').toMatch(
      /\.sp-on\) \.sp-frame\s*\{[\s\S]{0,600}?transform:\s*scale\(1\);/,
    );
    /* ★ 放大后的边长必须 ≤ 盒高（超了会被 overflow 裁掉半张）。
       倍数现在读 `--sp-zoom` 的**默认值**（窄屏那一档由「缓缓」那条单独钉）。 */
    const ZOOM = Number(/--sp-zoom:\s*([\d.]+)/.exec(CSS)?.[1] ?? NaN);
    expect(Number.isFinite(ZOOM), '读不到放大量（应从 --sp-zoom 的默认值读）').toBe(true);
    expect(ZOOM, '放大量 ≤ 1 就不是放大').toBeGreaterThan(1);
    /* ★★ 判据用**最宽片宽 × 默认倍数**，但盒高那一档要取**最小**的那个：
       盒高是 min(70svh, 620px) 且有 min-height 320px ⇒ 最矮那档才是真约束。 */
    expect(
      TILE_MAX * ZOOM,
      `放大后 ${TILE_MAX} × ${ZOOM} = ${(TILE_MAX * ZOOM).toFixed(0)}px 超过最矮那档盒高 ${BOX_MIN}px ⇒ 会被裁`,
    ).toBeLessThanOrEqual(BOX_MIN + 60);
    /* 窄屏那一档必须真的装得下（这是上面那条超了就必须收窄的**理由**） */
    const narrow = Number(/@media \(max-width: 680px\)[\s\S]{0,400}?--sp-zoom:\s*([\d.]+)/.exec(CSS)?.[1] ?? NaN);
    expect(Number.isFinite(narrow), '窄屏没有单独一档 --sp-zoom').toBe(true);
    expect(TILE_MAX * narrow, `窄屏 ${TILE_MAX} × ${narrow} 超过 ${BOX_MIN}px`).toBeLessThanOrEqual(BOX_MIN);
  });

  it('★★ 指针停在别的片上时，放大那张要退回常态（"点谁放大谁"在动手前就显形）', () => {
    expect(CODE, '缺"指针离开放大那张就退回"的规则').toMatch(
      /\.sp-viewport:hover \.sp-item\.zoom:not\(:hover\) \.sp-frame\s*\{[\s\S]{0,200}?transform:\s*scale\(/,
    );
    /* 退回也必须用 scale（同一属性才有过渡；改成 opacity 就没有"退回"的动画） */
    expect(CODE, '退回用的属性不是 transform（那样退回没有过渡）').not.toMatch(
      /\.sp-viewport:hover \.sp-item\.zoom:not\(:hover\) \.sp-frame\s*\{[\s\S]{0,200}?opacity:/,
    );
  });

  /* ★★★ 2026-10-09（§6.66，站主第四次报这一处："缩小时照片边缘残留条纹"）：保护层。
     病根是 Chrome 合成器在放大片缩回时**偶发**漏擦原来 1.9 倍那一圈（截图接口拍不到，只在屏幕上）
     ⇒ 这里守的不是"拖影没了"（测不到），而是**修法的几个必要条件**：
     ① 保护层够大、挂对层、颜色走 token；② 缩回期间仍在；③ 颜色本身看不见。 */
  it('★★★ 保护层 ①：放大片后面垫一块不随 scale 收缩的底 —— 够大、挂在 .sp-item 上、走 token', () => {
    const rule = /([^{}]*\.sp-item\.zoom::after[^{}]*)\{([^{}]*)\}/.exec(CSS);
    expect(rule, '缺 .sp-item.zoom::after 保护层（放大片缩回时会偶发漏擦，留下条纹）').not.toBeNull();
    const [, sel, body] = rule!;
    expect(sel, '保护层必须只在螺旋态生效').toContain(':global(.sp-on) .sp-item.zoom::after');
    expect(sel, '缩回期间没有保护层（缺 .sp-unzoom::after ⇒ "点另一张"那条路径上一缩回保护就没了）').toContain(
      ':global(.sp-on) .sp-item.sp-unzoom::after',
    );
    expect(body, '保护层不是绝对定位').toMatch(/position:\s*absolute/);
    expect(body, '保护层没有 content ⇒ 伪元素根本不生成').toMatch(/content:\s*''/);
    expect(body, '保护层会挡点击').toMatch(/pointer-events:\s*none/);
    expect(body, '保护层颜色必须是 --paper-ghost').toMatch(/background:\s*var\(--paper-ghost\)/);
    const inset = Number(/inset:\s*-(\d+(?:\.\d+)?)%/.exec(body)?.[1] ?? NaN);
    const ZOOM = Number(/--sp-zoom:\s*([\d.]+)/.exec(CSS)?.[1] ?? NaN);
    const need = ((ZOOM - 1) / 2) * 100;
    expect(inset, `保护层外扩 ${inset}% 盖不住 ${ZOOM} 倍放大（需 ${need}% + 影子余量 10%）`).toBeGreaterThanOrEqual(need + 10);
    expect(inset, '保护层外扩过大（> 100% ⇒ 白白扩大重绘区）').toBeLessThanOrEqual(100);
    expect(CSS, '保护层不许挂到 .sp-frame 上（它 overflow: hidden，会把保护层自己切掉）').not.toMatch(
      /\.sp-frame(?:\s+img)?::?(?:after|before)/,
    );
  });

  it('★★★ 保护层 ②：摘掉 .zoom 时先挂 .sp-unzoom，挂够缩回过渡那么久再摘', () => {
    const ms = Number(/const UNZOOM_MS = (\d+);/.exec(JS)?.[1] ?? NaN);
    const TOK = read('src/styles/tokens.css');
    const enter = Number(/--dur-enter:\s*(\d+)ms/.exec(TOK)?.[1] ?? NaN);
    const k = Number(/\.sp-frame\s*\{[^}]*?transition:\s*transform calc\(var\(--dur-enter\) \* ([\d.]+)\)/.exec(CSS)?.[1] ?? NaN);
    expect(Number.isFinite(enter * k), '读不到缩回过渡的时长（--dur-enter × 倍数）').toBe(true);
    expect(ms, `UNZOOM_MS ${ms} 盖不住缩回过渡 ${enter * k}ms（+100ms 余量）`).toBeGreaterThanOrEqual(enter * k + 100);
    expect(ms, 'UNZOOM_MS 过长（保护层留太久，白白多一层重绘）').toBeLessThanOrEqual(3000);
    expect(JS, '摘 .zoom 之前没有先挂保护（顺序反了 ⇒ 缩回第一帧没有保护层）').toMatch(
      /if \(zoomAt >= 0\) guard\(items\[zoomAt\]\);\s*if \(zoomAt >= 0\) items\[zoomAt\]\?\.classList\.remove\('zoom'\);/,
    );
    const g = /const guard = [\s\S]{0,400}?\n    \};/.exec(JS)?.[0] ?? '';
    expect(g, '没找到 guard()').not.toBe('');
    expect(g, 'guard 没挂 .sp-unzoom').toMatch(/classList\.add\('sp-unzoom'\)/);
    expect(g, 'guard 没按 UNZOOM_MS 摘掉 .sp-unzoom（一挂就不下来）').toMatch(
      /setTimeout\(\(\) => el\.classList\.remove\('sp-unzoom'\), UNZOOM_MS\)/,
    );
    expect(g, 'guard 没清旧定时器（快速来回点时会提前摘掉）').toMatch(/clearTimeout\(/);
  });

  it('★★ 保护层 ③：--paper-ghost = 纸色 + 极小的非零 alpha（看不见，但不能全透明）', () => {
    const TOK = read('src/styles/tokens.css');
    const paper = /--paper:\s*#([0-9a-f]{6});/i.exec(TOK)?.[1];
    const ghost = /--paper-ghost:\s*#([0-9a-f]{8});/i.exec(TOK)?.[1];
    expect(ghost, '--paper-ghost 必须是 8 位 hex').toBeDefined();
    expect(ghost!.slice(0, 6).toLowerCase(), '--paper-ghost 的颜色必须就是 --paper（叠纸差 0）').toBe(paper!.toLowerCase());
    const a = parseInt(ghost!.slice(6), 16);
    expect(a, '--paper-ghost 全透明 ⇒ 合成器会当它不存在，保护失效').toBeGreaterThan(0);
    expect(a, `--paper-ghost alpha ${a}/255 太大 ⇒ 会在身后邻片上看出一层纱`).toBeLessThanOrEqual(4);
  });

  it.skipIf(!hasDist)('★★ 保护层 ④：产物里真的有那条规则（作用域化之后没丢）', () => {
    expect(PAGE_CSS, '产物 CSS 里没有 .sp-unzoom 的伪元素规则').toMatch(/\.sp-unzoom:{1,2}after/);
    expect(PAGE_CSS, '产物 CSS 里保护层没有引用 --paper-ghost').toMatch(/var\(--paper-ghost\)/);
  });
});

describe('螺旋盘 · 红线与预算', () => {
  it('零新增运行时依赖 / 零外部资源', () => {
    const pkg = JSON.parse(read('package.json'));
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.length, `dependencies 应恰好 3 个，实际 ${deps.length}`).toBe(3);
    expect(deps).toEqual(expect.arrayContaining(['astro', '@astrojs/rss', '@astrojs/sitemap']));
    expect(CODE, '页面里出现了外部资源引用（src/href）').not.toMatch(/(?:src|href)=["']https?:/i);
    expect(CODE, '样式里出现了外部 url()').not.toMatch(/url\(\s*["']?https?:/i);
  });

  it('★ 颜色只用 token（本页新增部分不许出现字面色值）', () => {
    /* ★ 切片必须到**灯箱那一段为止**：`.splb` 里本来就有 `#1a1a1aeb` 这类取色
       （8 位 hex 承 alpha 是站规），切到文件尾会把灯箱的写法算到装置头上。 */
    const devCss = CODE.slice(CODE.indexOf('.sp-viewport {'), CODE.indexOf('.splb {'));
    expect(devCss.length, '没切到装置那一段样式（上下界都没找着？）').toBeGreaterThan(800);
    expect(devCss, '切片越界：把灯箱的样式也切进来了 ⇒ 这条断言失去意义').not.toContain('.splb');
    expect(devCss, '装置样式里出现了字面色值').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(devCss, '装置样式里出现了 rgba()（alpha 由 8 位 hex 承载）').not.toMatch(/\brgba?\(/);
    /* ★★ 2026-10-07 站主：「点击螺旋盘里的照片会有绿色框，直接删了」⇒ 现在是**反向**断言。
       原来这里钉的是"对焦描边必须用 --accent"（正对照）—— 那是站主要删的那一处。
       ★ 判据钉的是"照片片上不许有边框"这个性质本身，不是"不许写某个色值"：
         换成 `border-color: red`、换成 `--accent-bright`、或者改回 transparent 占位，
         都会被下面两条抓住。 */
    expect(devCss, '照片片上又出现描边（站主明令删掉点击后的绿框）').not.toMatch(
      /\.sp-frame\s*\{[^}]*?\b(?:border|outline)(?:-[a-z]+)?\s*:/,
    );
    expect(devCss, '又出现 .sp-item.on .sp-frame 那条描边规则').not.toMatch(/\.sp-item\.on\s+\.sp-frame\s*\{/);
    /* ★ 围边还有第三条路：`box-shadow: inset 0 0 0 2px …`（第一次变异验证漏的就是这条）。
       放大态那圈**外扩**影子 `--glass-shadow` 是合法的，所以判据不是"不许 box-shadow"，
       而是"片框上的 box-shadow 不许带 inset" —— inset 就是画在内容盒内侧的描边。 */
    expect(devCss, '用 box-shadow: inset 在片框内侧描边（换个写法绕过上面两条）').not.toMatch(
      /\.sp-frame\s*\{[^}]*?box-shadow:[^}]*?\binset\b/,
    );
    /* 正对照：--accent 仍有一处正当用途 —— 容器级键盘焦点 outline（删的是"对焦那张照片"，不是它） */
    expect(devCss, '键盘焦点 outline 也不许删（那是可达性，不是那个绿框）').toMatch(
      /\.sp-viewport:focus-visible\s*\{[^}]*?outline:\s*2px solid var\(--accent\)/,
    );
  });

  it('★★ 槽不许有底色（那圈"露边"就是它）—— 托底必须落在**照片盒**上', () => {
    /* ★ 症状（2026-10-07 站主截图）：照片外面套着一圈灰绿方框。
       实测（`_probe/_sp-edge.mjs`，CDP）：方槽 aspect-ratio 1、照片 max-*:100% **不裁**
       ⇒ 1.5:1 的片只占 66.6%，**露边 24.3%–33.4%（均值 28.7%）**；
       露出来的 `rgba(45,125,70,0.06)` 叠纸白 = rgb(238,243,236)，对纸白差 12/7/11 ⇒ 看得见。
       ★ 那块底色原本的用途是"图还没到之前的占位提示"，不是"托纸"。
         一旦图到齐、槽比图大，它就从提示变成"套在照片外面的边"。 */
    expect(CODE, '方槽又出现底色 ⇒ 照片没铺满时露出来的就是那圈边').toMatch(
      /\.sp-frame\s*\{[^}]*?background:\s*none/,
    );
    /* ★ 反向断言按**块**做，不能用 `/\.sp-frame\s*\{[^}]*?background:\s*(?!none)/` ——
       惰性量在 `background:` 之前能跨过任意多个非 `}` 字符，负向预查又是**匹配之后**才求值，
       于是它落到了别处的 `background:` 上（实测第一次写就被这条自己打脸）。
       正解：先把方槽那一块切出来，再在块内比。 */
    /* ★ 取**最后一条** background 声明 —— CSS 是后者胜。
       用 `match()` 只取第一条会漏掉"悄悄在后面加一条"这种绕过（本轮变异验证抓到的）。 */
    const lastBg = (block: string) => {
      const all = [...block.matchAll(/background(?:-[a-z]+)?\s*:\s*([^;}]*)/g)];
      return all.length ? all[all.length - 1][1].trim() : undefined;
    };
    const slotBlock = CODE.match(/\.sp-frame\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(slotBlock, '切不出方槽那一块（选择器写法变了？）').not.toBe('');
    const slotBg = lastBg(slotBlock);
    expect(slotBg, '方槽那块没有 background 声明 ⇒ 判据失效').toBeDefined();
    expect(slotBg, `方槽的底色必须是 none，实际是 ${slotBg}`).toBe('none');
    /* ★★ 2026-10-08（站主第二次报同一处）定稿：占位底**整个去掉** ——
       槽上没有，**照片盒上也没有**。两层的 background 都必须是 `none`。
       ★ 为什么不是"换个色"：可见色块本身就是异常，换个色还是块；而"图还没到"的
         提示在这一台里本来就不成立（装置态下片是 3D 旋转 + 淡出的，访客分不清
         "没加载"与"还没转到"）。理由与实测写在 `SpiralPlate.astro` 的那两段注里。
       ★ 这条必须**双向**：上一版只钉了"槽上没有"，于是底色在 img 上活了下来，
         站主隔了一轮又报了一次。钉位置不钉存在性 ⇒ 换个层就复活。 */
    const imgBlock = CODE.match(/\.sp-frame img\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(imgBlock, '切不出照片盒那一块（选择器写法变了？）').not.toBe('');
    const imgBg = lastBg(imgBlock);
    expect(imgBg, '照片盒那块没有 background 声明 ⇒ 判据失效').toBeDefined();
    expect(imgBg, `照片盒上不许有占位底色，实际是 ${imgBg}`).toBe('none');
    /* 再钉一条"整个文件里都不许有"：免得它换个第三层复活。
       ★ 负向断言必须先剥注释（本仓老坑）—— `--deco-plate-fine` 这个名字在
         `.sp-frame` 的理由注释里是要出现的，不剥就会恒红。 */
    const CODE_NC = CODE.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(CODE_NC, '占位底又从别处回来了（只该有 `none`）').not.toMatch(
      /background[^;}]*(--deco-plate-fine|--deco-plate-coarse|--accent-wash)/,
    );
  });

  it('★★ 装置态视口不刷底色：∞ 底纹要能从螺旋盘底下连着穿过去（2026-10-14）', () => {
    /* ★ 站主原话：「相册页那个白色的背景挡住了后面背景的无限符号」。
       装置态视口（`:global(.sp-on) .sp-viewport`）曾经刷一层不透明纸白，把 Base 的 plate 槽
       那张 GalleryInf（∞）拦腰截断 ⇒ 底纹读成"两张图叠在一起"，装置像贴在纸上的补丁。
       ★ 这条上一轮被反过来定过（当时的理由是"底纹与照片抢注意力"，只有一张对照图、没量化）。
         ⇒ 门闩钉的是**性质**——"这块不许有不透明底"，不是钉某个色值；
           将来若想再刷一层任何底色，它都会红。 */
    const block = CODE.match(/:global\(\.sp-on\)\s*\.sp-viewport\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(block, '切不出装置态视口那一块（选择器写法变了？）').not.toBe('');
    /* ★ 取**最后一条** background 声明（CSS 后者胜）——与上面方槽那条同一手法，
       只看第一条会被"悄悄在后面补一条"绕过。 */
    const all = [...block.matchAll(/background(?:-[a-z]+)?\s*:\s*([^;}]*)/g)];
    expect(all.length, '装置态视口那条没有 background 声明 ⇒ 判据失效').toBeGreaterThan(0);
    const bg = all[all.length - 1][1].trim();
    /* ★ 必须是**显式**写出来的透明，而不是"删掉这条声明"：
       删掉是"默认继承"，写出来是"此处刻意不着色"，后者才不会被下一个人当漏写填回去。 */
    expect(bg, `装置态视口必须显式写透明，实际是 ${bg}`).toBe('transparent');
  });

  it('★★ 产物侧：装置态视口那段 CSS 里不许再出现纸色（2026-10-14）', () => {
    /* ★ 产物上的这条**只认语义、不认写法**：CSS 过了 lightningcss 会把透明压成 `0 0`
       （那是位置，颜色默认透明）—— 拿 `transparent` 去 grep 产物会得到假阴性。
       ⇒ 判据改成"这块不许引用纸色"，两种压缩形态都拦得住。 */
    const pageBlock = PAGE_CSS.match(/\.sp-on\s+\.sp-viewport\{([^}]*)\}/)?.[1] ?? '';
    expect(pageBlock, '切不出产物里的装置态视口规则（选择器写法变了？）').not.toBe('');
    expect(pageBlock, '产物里装置态视口又刷上纸白了 ⇒ ∞ 底纹会被它截断').not.toContain('--paper');
  });

  it('★ 一律不裁图：整块**没有** `object-fit`（与 /gallery 同一条红线）', () => {
    expect(CODE, '出现了 object-fit ⇒ 图会被裁（本站是档案不是社交相册）').not.toMatch(/object-fit/);
    expect(CODE, '图没写 width/height:auto ⇒ 会被方槽拉变形').toMatch(
      /\.sp-frame img\s*\{[^}]*height:\s*auto/,
    );
    /* 螺旋态下片是定高定宽的方框，图仍靠 max-* 收在里面 */
    expect(CODE, '螺旋态丢了 max-height ⇒ 图会溢出片框').toMatch(/\.sp-frame img\s*\{[^}]*max-height:\s*100%/);
  });

  it('★ 页面 JS 预算（实测 11429 字节，上限 12288）', () => {
    /* 口径与 /gallery、文章页那几条一致：**内联 + 同源外链闭包**的实数，不靠少算通过。
       实测构成（2026-10-09）：内联 2765（Base 的首帧保险 + 过渡 loader）
       + 本页 chunk 6969 + big-image 共享块 487 + rl-core 共享块 1208 = 11429。
       ★ 2026-10-09 +162（11267 → 11429）：§6.66 放大片保护层（guard + UNZOOM_MS 定时摘类）。上限不动，余量 ~0.85 KB。
       ★ 2026-10-09 +432（10835 → 11267）：§6.65 远侧柔边（helix-core 的 edgeOf
         + paint 里每片写 --sp-edge / --sp-dir 的那几行）。上限不动，余量 ~1.0 KB。
       ★ 上限 11264 → 12288（2026-10-08）：本轮给灯箱加了「先小后大」换图
         （`big-image.showBig`，487 字节的共享模块 + 调用点），实测 9761 → 10835，
         把原来那句"留了 ~1.5 KB 余量"吃掉大半 ⇒ 按站上规矩（预算随实事调整、
         但必须写清为什么）抬到 12288，重新留出 ~1.4 KB。
         ⚠ 同一轮试过的「螺旋侧壁改画纸侧」已按站主要求整体撤回 ⇒ 那一笔不在这个数里，
           上限也不为它留量。
       ★ 判据的意图一个字没改：真撞线的仍然是"误把 three 拖进来"（541.9 KB）
         或"误引外部资源"这种量级的事，不是这类几百字节的交互。 */
    const BUDGET = 12288;
    expect(hasDist, '先 npm run build').toBe(true);
    const { code, files } = jsClosure(PAGE_PATH);
    const full = Buffer.byteLength(code, 'utf8');
    console.log(
      `螺旋盘页面 JS: 闭包 ${full} 字节（预算 ${BUDGET}）· ${files.length} 个同源 chunk · ` +
        files.map((f) => `${f.split(/[\\/]/).pop()} ${statSync(f).size}`).join(' + '),
    );
    expect(full, `螺旋盘 JS 合计 ${full} 字节，超过 ${BUDGET} 预算`).toBeLessThan(BUDGET);
    /* 反面正对照：整台不许碰 three（vendored 的 541.9 KB chunk 一旦进来必炸） */
    expect(files.map((f) => f.replace(/\\/g, '/')).join(' '), '引进了 three 的 chunk').not.toMatch(
      /three\.module\.min/,
    );
  });

  it('★★ 两个消费方共用同一个组件：独立页=page、相册页=embed（不许并存第二份实现）', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    expect(GAL_HTML, '/gallery 里没有装置（站主 2026-10-07：显影板之下、砖墙之上）').toMatch(/data-spiral/);
    expect(GAL_HTML, '/gallery 那份的 mode 必须是 embed').toMatch(/data-sp-mode="embed"/);
    expect((GAL_HTML.match(/data-sp-rig/g) ?? []).length, '相册页只能有一个装置坐标系').toBe(1);
    /* 页序：显影板 → 螺旋盘 → 相册入口条 → 页末那个全屏入口。
       站主原话：「把螺旋盘放到显影板的下面」+（同日下一轮）「下面**不放现在全部铺开的**，
       放**入口**」⇒ 用产物里的**字节偏移**判，比看类名可靠。 */
    const iBath = GAL_HTML.indexOf('data-bath');
    const iSp = GAL_HTML.indexOf('data-spiral');
    const iRow = GAL_HTML.indexOf('data-album-row');
    const iEntry = GAL_HTML.indexOf('class="entry"');
    expect([iBath, iSp, iRow, iEntry].every((i) => i >= 0), '页序四段没找齐').toBe(true);
    expect(iBath, '显影板必须排在螺旋盘之前').toBeLessThan(iSp);
    expect(iSp, '螺旋盘必须排在相册入口条之前').toBeLessThan(iRow);
    expect(iRow, '相册入口条必须排在页末那个全屏入口之前').toBeLessThan(iEntry);
    /* 独立页那份是 page，且**没有**入口条/砖墙 —— 它仍是"全屏专注视图" */
    expect(HTML, '独立页的 mode 必须是 page').toMatch(/data-sp-mode="page"/);
    expect(HTML, '独立页不该出现砖墙').not.toMatch(/class="wf"/);
    expect(HTML, '独立页不该出现相册入口条').not.toMatch(/data-album-row/);
    /* 两份产物里的装置标记必须同源（同一组件 ⇒ 同一批 --k） */
    const ks = (s: string) => [...s.matchAll(/--k:(\d+)/g)].map((m) => Number(m[1]));
    expect(ks(GAL_HTML), '相册页那份的 --k 序列与独立页不一致（实现分叉了）').toEqual(ks(HTML));
    /* 组件是**唯一**实现：两个页面文件里不许再内联一份装置样式/脚本 */
    for (const p of ['src/pages/gallery/spiral.astro', 'src/pages/gallery/index.astro']) {
      const page = read(p);
      expect(page, `${p} 里又内联了一份 .sp-viewport 样式`).not.toMatch(/\.sp-viewport\s*\{/);
      expect(page, `${p} 里又内联了一份装置脚本`).not.toMatch(/radiusOf\(/);
    }
  });

  it('★★★ 滚轮：两档都接管 + 两端让路（站主第四轮改了口径）', () => {
    /* 站主原话：「把螺旋的那个划动方式还是改为滚轮」。
       ★ 之前 embed 档**故意不监听**wheel（长页里滚轮是页面滚动）——
         那条口径现在**作废**了，改成两档都接管、靠"两端让路"守住"装置不劫持页面"。
       ⇒ 门闩从"必须有 `if (!EMBED)` 这道闸"改成"**不许**再有这道闸"
         （否则就是回到访客滚不到下面入口条的那个版本）。 */
    expect(CODE, 'EMBED 必须仍从 DOM（data-sp-mode）读，模式值不许另抄一份').toMatch(
      /const EMBED = vp\.dataset\.spMode === 'embed'/,
    );
    expect(CODE, 'wheel 注册又被打回 `if (!EMBED)` 里了（相册页会被装置扣住）').not.toMatch(
      /if \(!EMBED\)\s*\{[^}]*vp\.addEventListener\(\s*'wheel'/,
    );
    expect(CODE, '找不到 wheel 注册').toMatch(/vp\.addEventListener\(\s*'wheel'/);
    /* 两端让路：到头了就把事件放回去（**不** preventDefault），页面照常滚。 */
    expect(CODE, '两端让路没了（到头必须把滚轮交还给页面）').toMatch(
      /if \(\(f <= 0\.001 && d < 0\) \|\| \(f >= N - 1 - 0\.001 && d > 0\)\) return;/,
    );
    /* ★★ 让路判据必须用 `f`（当前对焦）而不是 `tgt`（弹簧目标）：
       一次快速滚动会把 tgt 推出去好几格，拿 tgt 判的话"到尽头那一滚"会被
       自己上一次积累的 tgt 判成"还没到头" ⇒ 吞掉最后一次滚轮 ⇒ 页面永远接不上。
       这条钉"用的是 f"，钉不住"为什么"—— 注记在源码那段。 */
    const wheelBlock = /'wheel'[\s\S]{0,900}?\n\s*\}/.exec(CODE)?.[0] ?? '';
    expect(wheelBlock, 'wheel 处理段没找到').not.toBe('');
    expect(wheelBlock, '两端让路的判据必须用当前对焦 f，不是弹簧目标 tgt').toMatch(
      /f <= 0\.001[\s\S]{0,120}?f >= N - 1 - 0\.001/,
    );
    expect(wheelBlock, '让路那一步必须 return（不 preventDefault）才能把滚动交还页面').toMatch(
      /return;\s*\n\s*e\.preventDefault\(\);/,
    );
    /*★★ 让路的判据要落在**"没拦住"**这件事本身上。
       反面提醒（实测踩过）：CDP 派发的 `type=mouseWheel` 是**合成**事件，
       不带浏览器默认滚动行为 ⇒ 即便这里正确地 return 了，`scrollY` 也**纹丝不动**。
       第一版探针据此报了假阴性"仍被装置吞着"。
       ⇒ 探针侧读 `defaultPrevented` + 装置外对照组；门闩侧钉住"return 在 preventDefault 之前"
         这条顺序（顺序反了就是拦住了）。 */
    /* 提示语两档同一句 —— 之前 embed 档刻意写「拖动 · ← →」（那时滚轮真不归它）。
       ★★★ 判据写成"**不许出现按模式分岔的写法**"而不只是"要有滚轮二字"：
         只钉后者的话，把整行删掉、或换回 `embed ? … : …` 的分岔，都会静默通过
         （实测：删掉整行时下面那条 toMatch 照样绿 —— 它匹配的是文件头注记里的字样）。 */
    expect(SRC, '提示语不许按模式分岔（embed 档写「拖动 · ← →」就是在隐瞒滚轮）').not.toMatch(
      /\{embed\s*\?\s*'拖动/,
    );
    /* ★ 反向钉住"提示语必须真的是这一句"：读渲染出来的那一段，而不是全文搜字样。 */
    const hint = /<p class="sp-hint"[^>]*>([^<]*)<\/p>/.exec(SRC)?.[1] ?? '';
    expect(hint, '找不到 .sp-hint 的文案').not.toBe('');
    expect(hint.trim(), `提示语是「${hint.trim()}」—— 没有告诉访客可以用滚轮`).toContain('滚轮');
    /* 两个消费方的产物里都该是同一句（分岔过一次就说明 mode 又被抄进模板了） */
    if (hasDist) {
      expect(HTML, '独立页的提示语里没有滚轮').toMatch(/sp-hint[^>]*>拖动 · 滚轮 · ← →/);
      expect(GAL_HTML, '相册页的提示语里没有滚轮（embed 档也接管滚轮了）').toMatch(
        /sp-hint[^>]*>拖动 · 滚轮 · ← →/,
      );
    }
  });

  it('★★ 拖动**保留**（滚轮之外并存，不是替换）', () => {
    /* 站主在选项里明确「保留，两者并存」。触屏上靠 `touch-action: pan-y` 分工：
       横向手势归装置、纵向归页面滚动 —— 少这一行，触屏拖动会把页面一起拖走。 */
    expect(JS, '拖动那套（pointerdown/pointermove）不见了').toMatch(
      /vp\.addEventListener\('pointerdown'/,
    );
    expect(JS, '横向 1:1 跟手的换算不见了').toMatch(/const df = -dx \/ stepPx;/);
    expect(CSS, '缺 touch-action: pan-y（触屏上拖动会把页面一起拖走）').toMatch(
      /touch-action:\s*pan-y/,
    );
  });

  it('★ 多层并存：入口页（目录层）与螺旋（画廊层）都在，且互相有路', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    const dir = join(DIST, 'gallery', 'index.html');
    expect(existsSync(dir), '/gallery 不见了 ⇒ 螺旋把它替换了（本轮明确不替换）').toBe(true);
    expect(existsSync(PAGE_PATH), '/gallery/spiral/ 不存在').toBe(true);
    /* ★ 2026-10-07：目录层的落点变了 —— 以前是 /gallery 那一整面砖墙，
       现在是「入口页 + 每册一页」：入口条点进去才是那一册的砖墙。
       ⇒ "有几个文件夹就放几个"这句话在产物上必须成立，所以逐册核一遍。 */
    for (const a of MANIFEST.albums) {
      expect(
        existsSync(join(DIST, 'gallery', a.id, 'index.html')),
        `相册页 /gallery/${a.id}/ 没生成（"有几个文件夹就放几个"）`,
      ).toBe(true);
    }
    expect(HTML, '螺旋页缺"回到相册"的回头路').toMatch(/href="\/gallery\/"/);
    /* 图与目标档位与砖墙同一条口径：网格走最窄档、灯箱走最宽档 */
    const gridW = Math.min(...MANIFEST.widths);
    const lightW = Math.max(...MANIFEST.widths);
    const hrefs = [...HTML.matchAll(/<a class="sp-frame" href="([^"]+)"/g)].map((m) => m[1]);
    for (const h of hrefs) expect(h, '灯箱链接必须指向最宽档').toContain(`-${lightW}.`);
    const srcs = [...HTML.matchAll(/<a class="sp-frame"[\s\S]{0,200}?<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    for (const s of srcs) expect(s, '网格图必须走最窄档').toContain(`-${gridW}.`);
  });
});

/** 页面实际加载的 JS 代码文本（内联 + 同源外链 import 闭包）—— 与 build-output.test.ts 同一口径。
 *  ⚠ 必须跟着 import 走：Astro 会把多页共用的脚本抽成 `/_astro/*.js`，
 *    只读页面 HTML（或只跟一层）会**少算**预算。 */
function jsClosure(pagePath: string): { code: string; files: string[] } {
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
    for (const m of code.matchAll(/(?:import|from)\s*\(?\s*(["'`])([^"'`]+?\.js)\1/g)) load(m[2]);
  };
  for (const m of html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+\.js)"/g)) load(m[1]);
  const code = inline + '\n' + files.map((f) => readFileSync(f, 'utf8')).join('\n');
  return { code, files };
}
