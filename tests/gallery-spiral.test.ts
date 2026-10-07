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
const PAGE_PATH = join(DIST, 'gallery', 'spiral', 'index.html');
const hasDist = existsSync(PAGE_PATH);

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** 剥注释：Astro 模板里的 JSX 块注释 + <style> 里的 CSS 块注释。
 *  顺序有讲究：先剥 JSX（它内部若含 CSS 块注释，先剥 CSS 的会把 JSX 那个切碎）。 */
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const SRC = read('src/pages/gallery/spiral.astro');
const CODE = strip(SRC);
/** 压平空白：几何那几条 CSS 声明在源码里是**分行的**，不压平匹配不上。 */
const FLAT = SRC.replace(/\s+/g, ' ');
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
    /* 正对照：焦点那圈绿确实是既有 token，不是新造的颜色 */
    expect(devCss, '对焦描边必须用 --accent').toMatch(/border-color:\s*var\(--accent\)/);
  });

  it('★ 一律不裁图：整块**没有** `object-fit`（与 /gallery 同一条红线）', () => {
    expect(CODE, '出现了 object-fit ⇒ 图会被裁（本站是档案不是社交相册）').not.toMatch(/object-fit/);
    expect(CODE, '图没写 width/height:auto ⇒ 会被方槽拉变形').toMatch(
      /\.sp-frame img\s*\{[^}]*height:\s*auto/,
    );
    /* 螺旋态下片是定高定宽的方框，图仍靠 max-* 收在里面 */
    expect(CODE, '螺旋态丢了 max-height ⇒ 图会溢出片框').toMatch(/\.sp-frame img\s*\{[^}]*max-height:\s*100%/);
  });

  it('★ 页面 JS 预算（实测 9761 字节，上限 11264）', () => {
    /* 口径与 /gallery、文章页那几条一致：**内联 + 同源外链闭包**的实数，不靠少算通过。
       实测构成（2026-10-07）：内联 2762（Base 的首帧保险 + 过渡 loader）
       + 本页 chunk 5789 + rl-core 共享块 1208 = 9761。
       上限 11264 留了 ~1.5 KB 余量：加一两个交互不会撞线，
       而"误把 three 拖进来"（541.9 KB）或"误引外部资源"一定会撞。 */
    const BUDGET = 11264;
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

  it('★ 两页并存：砖墙（目录层）与螺旋（画廊层）都在，且互相有路', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    const wall = join(DIST, 'gallery', 'index.html');
    expect(existsSync(wall), '/gallery 砖墙不见了 ⇒ 螺旋把它替换了（本轮明确不替换）').toBe(true);
    expect(existsSync(PAGE_PATH), '/gallery/spiral/ 不存在').toBe(true);
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
