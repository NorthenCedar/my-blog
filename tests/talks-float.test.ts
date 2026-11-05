import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RUNTIME_DEPS_ALLOWED } from './_deps';

/* 说说页「浮游 FLOAT」（斜飘雨线 + 下半屏椭圆涟漪）+ 墨点螺旋底纹
 * （2026-10-04，2026-11-01 保留背景、正文改为稳定时间线）的契约。
 *
 * 站主拍板（先出实验台 `_probe/_float-lab.src.html` 的 ⑤ 号母题，看过真渲染才定的）：
 *   ① 装置 = Canvas 2D 手写；② 背景即装置；③ ≤767 极简版；④ 低频常动（≥8s）；
 *   ⑤ 涟漪用**椭圆**；⑥ 涟漪只在**下半屏**；⑦ 漂浮卡片**原位**小幅浮、不打乱顺序、不乱飘；
 *   ⑧ 振幅 **4px**；⑨ 雨线**密度更密**；⑩ 条目底色**透明**（先加过后撤）；
 *   ⑪ 站主给的墨点螺旋图**替代本页的百褶 ∞**。
 *
 * 这里守的是「不可退让的性质」，不是「上一版的实现形态」：
 *   ① 无 JS 可用 —— 装置只是画布（空着），正文服务端渲染完整。
 *   ② 两层装饰都必须挂 `.shell` **之外** —— `.shell` 在页面过渡里会被 transform，
 *      而被 transform 的祖先会成为 `position: fixed` 的包含块（关于页实测跳 91px）。
 *   ③ 零随机 —— 形状是 t 的确定函数（整数哈希，不是随机源），否则截图不可复现、没法验收。
 *   ④ 背景**不读内容几何** —— 只吃时间。评论展开插 DOM 时不该触发重排重画。
 *   ⑤ 与其余四台**机制镜像** —— 只有它不读任何输入（滚动/指针一概不吃）。
 *   ⑥ 四态降级 —— reduced-motion / 无 JS / ≤767 极简版 / 视口外·切标签停帧。
 *   ⑦ 2026-11-01：整页改为稳定的透明时间线，背景雨滴与底纹仍按原契约运行。
 *   ⑧ 零新增运行时依赖（红线）。
 */
const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const hasDist = existsSync(join(DIST, 'talks', 'index.html'));

const SRC = readFileSync(join(ROOT, 'src/scripts/float.ts'), 'utf8');
/* 剥注释**只用于负向断言**（如「不含 Math.random / rgba(」）。
   ⚠ 正向断言一律用未剥注释的原文：本文件里那些"注释与代码同源"的说明
   （比如注释里写了 `@keyframes` 的名字）会被朴素正则误吞（同 about-ref-plate 的教训）。 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');

const ASTRO = readFileSync(join(ROOT, 'src/pages/talks.astro'), 'utf8');
/* 剥两类注释：Astro 模板里的 JSX 块注释、以及 <style> 里的 CSS 块注释。
   顺序有讲究：先剥 JSX 那种 —— 它内部若含 CSS 块注释，先剥 CSS 的会把 JSX 那个切碎。 */
const ACSS = ASTRO.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

const TOKENS = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const PLATE_DIR = join(ROOT, 'src/assets/talks/plates');
const PLATE = join(PLATE_DIR, 'drift-main.webp');

const TALKS = hasDist ? readFileSync(join(DIST, 'talks', 'index.html'), 'utf8') : '';
const DIST_CSS = existsSync(DIST)
  ? readdirSync(join(DIST, '_astro'))
      .filter((n) => n.endsWith('.css'))
      .map((n) => readFileSync(join(DIST, '_astro', n), 'utf8'))
      .join('\n')
  : '';

describe('说说页 FLOAT · 装置契约', () => {
  it('无 JS 可用：装置只是画布（服务端渲染、aria-hidden），正文完整', () => {
    expect(hasDist, '先 npm run build').toBe(true);
    expect(TALKS, '没有 data-float-bg 抓手').toContain('data-float-bg');
    expect(TALKS, '画布必须 aria-hidden（纯装饰）').toMatch(/<canvas[^>]*aria-hidden="true"/);
    // 正文不在装置里：条目与日期都是服务端渲染的
    expect((TALKS.match(/<time datetime="\d{4}-\d{2}-\d{2}"/g) ?? []).length).toBeGreaterThan(0);
  });

  it('★ 装置与底纹都在 .shell 之外（页面过渡的 transform 会成为 fixed 包含块）', () => {
    const iPlate = TALKS.indexOf('class="float-plate"');
    const iCanvas = TALKS.indexOf('class="float-bg"');
    const iMain = TALKS.indexOf('id="main"');
    const iShell = TALKS.indexOf('class="shell"');
    expect(iPlate, '产物里没有 .float-plate').toBeGreaterThan(-1);
    expect(iCanvas, '产物里没有 .float-bg').toBeGreaterThan(-1);
    expect(iShell).toBeGreaterThan(-1);
    expect(iPlate, '底纹落进了 .shell 里 ⇒ 过渡时背景会跳位').toBeLessThan(iShell);
    expect(iCanvas, '装置落进了 .shell 里 ⇒ 过渡时画布会跳位').toBeLessThan(iShell);
    expect(iCanvas).toBeLessThan(iMain);
    // 源码侧：确实走 plate 具名槽（底纹在前、画布在后 ⇒ 雨画在墨点之上）
    expect(ASTRO).toMatch(/<Fragment slot="plate">/);
    const sPlate = ASTRO.indexOf('class="float-plate"');
    const sCanvas = ASTRO.indexOf('class="float-bg"');
    expect(sPlate, '底纹必须排在画布之前（DOM 顺序决定同层谁在上）').toBeLessThan(sCanvas);
  });

  it('零随机：形状是 t 的确定函数（整数哈希，不是随机源）', () => {
    expect(CODE).not.toMatch(/Math\.random/);
    expect(CODE).toMatch(/function hash01\(/);
    // 涟漪不存状态：出生时刻 = i × 周期、位置 = hash01(i) ⇒ 任意 t 单独求值都一致
    expect(CODE).toMatch(/const i1 = Math\.floor\(t \/ RIPPLE_PERIOD\)/);
    expect(CODE).toMatch(/const i0 = Math\.max\(0, Math\.ceil\(\(t - LAST\) \/ RIPPLE_PERIOD\)\)/);
  });

  it('★ 背景不读内容几何：只吃时间，一行 DOM 测量都没有', () => {
    /* 这条是设计约束（不是洁癖）：评论一展开会插一大堆 DOM，
       依赖元素位置的背景每次展开都要重排重画，还会跟评论列表抢主线程。
       ⚠ `clientWidth/clientHeight` 是**例外且必需**的：画布要对齐自己的 CSS 盒
       （它自己就是 `fixed inset:0`，与内容无关），不算"读内容几何"。 */
    expect(CODE).not.toMatch(/getBoundingClientRect/);
    expect(CODE).not.toMatch(/offsetTop|offsetHeight|scrollTop|scrollHeight/);
    expect(CODE).not.toMatch(/querySelector(?:All)?\(['"]\./);
    // 尺寸只从画布自己身上拿
    expect(CODE).toMatch(/const w = cv\.clientWidth/);
  });

  it('★ 机制镜像：只引 rl-core（帧循环 / 停帧 / 降级开关），不引弹簧', () => {
    const imports = [...CODE.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports.length, '只引入动画底盘和页面生命周期').toBe(2);
    expect(imports[0], `只许引 rl-core，实际：${imports.join(', ')}`).toBe('./rl-core');
    for (const fn of ['startLoop', 'createActivityGate', 'prefersReducedMotion', 'shouldAnimate']) {
      expect(CODE, `缺 ${fn}`).toMatch(new RegExp(`\\b${fn}\\b`));
    }
    expect(CODE).not.toMatch(/createSpring/);
    // 写文件路径的"只许引 rl-core"这条也守一遍（防有人绕过上面的正则换写法）
    expect(SRC).toMatch(/from '\.\/rl-core'/);
  });

  it('★ 母题常数与站主拍板值逐条对齐', () => {
    const num = (re: RegExp, name: string) => {
      const m = CODE.match(re);
      expect(m, `没读到 ${name}`).toBeTruthy();
      return Number(m![1]);
    };
    // 雨：斜率 ≈ 15.6°「斜飘」；密度 12500 px²/根 = 实验台基准 20000 × 1.6（站主「密度更密」）
    expect(num(/const SLANT = ([\d.]+)/, 'SLANT'), '斜飘斜率').toBe(0.28);
    expect(num(/const DROP_AREA = (\d+)/, 'DROP_AREA'), '雨线密度基准').toBe(12500);
    /* ⚠ 这条查**未剥注释的原文**：1.6 这个倍数写在注释里（CODE 已把注释剥掉） */
    expect(SRC, '密度倍率必须写清是 1.6 倍（别让下一个人以为是拍的）').toMatch(/1\.6/);
    // 涟漪：间隔没动（站主只说了密度更密，没点涟漪）
    expect(num(/const RIPPLE_PERIOD = ([\d.]+)/, 'RIPPLE_PERIOD'), '涟漪间隔').toBe(1.45);
    expect(num(/const RING_LIFE = ([\d.]+)/, 'RING_LIFE'), '单环寿命').toBe(2.6);
    expect(num(/const STAGGER = ([\d.]+)/, 'STAGGER'), '相邻环时差').toBe(0.45);
    // 椭圆扁率 = 平面的属性（≈21° 俯角），常数、不逐环变
    expect(num(/const FLAT = ([\d.]+)/, 'FLAT'), '椭圆扁率').toBe(0.36);
    // 涟漪中心纵向起点：> 0.5 ⇒ 只在下半屏
    const y0 = num(/const Y0 = ([\d.]+)/, 'Y0');
    expect(y0, '涟漪中心必须从下半屏起算（站主：「涟漪放在屏幕的下半部分」）').toBeGreaterThan(0.5);
    expect(y0).toBe(0.56);
    // RM 冻结时刻（确定性，不为好看调参）
    expect(num(/const RM_T = ([\d.]+)/, 'RM_T')).toBe(12.5);
  });

  it('★ 涟漪是**椭圆**、且只在下半屏（站主两条追加逐条落地）', () => {
    // 椭圆：rx 与 ry = rx × FLAT 两个半轴，旋转角 0（地面上的圈永远是水平长轴）
    expect(CODE, '没用 ellipse ⇒ 涟漪还是正圆').toMatch(
      /ctx\.ellipse\(cx, cy, r0, r0 \* FLAT, 0, 0, 6\.283\)/,
    );
    expect(CODE, '外环必须也是压扁的椭圆').toMatch(
      /ctx\.ellipse\(cx, cy, rx, rx \* FLAT, 0, 0, 6\.283\)/,
    );
    // 扁率**不随环变**（逐环变会读成"每个涟漪在不同的平面上"，那是错的）
    expect(CODE, '扁率不许逐环变化').not.toMatch(/rx \* \(FLAT [+\-*]/);
    // 圆心：从 H×Y0 起算、跨度到 H —— 数学上不可能落到上半屏
    expect(CODE, '涟漪圆心必须由 Y0 起算').toMatch(
      /const cy = H \* Y0 \+ hash01\(i \* 2 \+ 12\) \* \(H - H \* Y0\)/,
    );
  });

  it('★ 颜色只从 token 读，alpha 用 8 位 hex 承载（组件里不写 rgba()）', () => {
    expect(CODE).toMatch(/getPropertyValue\('--accent'\)/);
    expect(CODE, '看到了 rgba() —— 站上约定是 8 位 hex 承载 alpha').not.toMatch(/rgba\(/);
    expect(CODE).toMatch(/h \+ v\.toString\(16\)\.padStart\(2, '0'\)/);
    expect(TOKENS, '--accent 改名了？契约要跟着看').toMatch(/--accent:\s*#2d7d46/i);
  });

  it('降级①reduced-motion：不跑 rAF，冻结画一帧（FLOAT 没有"终态"可落）', () => {
    expect(CODE).toMatch(/prefersReducedMotion\(\)/);
    expect(CODE).toMatch(/shouldAnimate\(/);
    expect(SRC, 'RM 分支要写清为什么不落终态').toMatch(/没有终态/);
    // 分支结构：!animate ⇒ paint(RM_T) 并 return —— 之后才建 gate / 起循环
    /* ⚠ 抓的必须是**调用**（`createActivityGate(cv` / `startLoop(`），不是模块名 ——
       两者都出现在顶部的 import 里，用裸名字会命中前面那行（本轮踩到）。 */
    const rmAt = CODE.indexOf('if (!animate)');
    const gateAt = CODE.indexOf('createActivityGate(cv');
    expect(rmAt, '没找到 RM 分支').toBeGreaterThan(-1);
    expect(gateAt, '没找到 gate 的调用点').toBeGreaterThan(-1);
    expect(rmAt, 'RM 分支必须排在建 gate / 起循环之前').toBeLessThan(gateAt);
    expect(CODE.slice(rmAt, gateAt), 'RM 分支要画静态帧并 return').toMatch(/paint\(RM_T\)/);
    expect(CODE.slice(rmAt, gateAt), 'RM 分支不许走到 startLoop').not.toMatch(/startLoop\(/);
    // RM 下也要跟尺寸（旋屏 / 拖窗口）
    expect(CODE.slice(rmAt, gateAt)).toMatch(/addEventListener\('resize'/);
  });

  it('降级②首帧同步绘制：不等 rAF（否则 JS 到位前是一块空画布）', () => {
    /* ⚠ 同样抓**调用** `startLoop(`，不是模块名（import 那行在前面）。 */
    const i = CODE.indexOf('paint(0)');
    const j = CODE.indexOf('startLoop(');
    expect(i, '没有同步首帧').toBeGreaterThan(-1);
    expect(j, '没找到 startLoop 的调用点').toBeGreaterThan(-1);
    expect(i, '同步首帧必须在 startLoop 之前').toBeLessThan(j);
    /* ★ 这条还兼着验收：本机无头下 rAF 在 --virtual-time-budget 里不推进，
       没有同步首帧就只能间接证"装置画没画"（实测踩到过：canvas 还是默认 300×150）。 */
    expect(SRC, '要写清这条为什么存在').toMatch(/首帧\*\*同步\*\*画一次/);
  });

  it('降级③移动端 ≤767px：极简版（密度减半 / 环数减一 / DPR 降到 1.5）', () => {
    expect(CODE).toMatch(/matchMedia\('\(max-width: 767px\)'\)/);
    expect(CODE, '窄屏雨线密度要减半').toMatch(/narrow\.matches \? 0\.5 : 1/);
    expect(CODE, '窄屏环数 3 → 2').toMatch(/narrow\.matches \? 2 : 3/);
    expect(CODE, '窄屏 DPR 上限降到 1.5').toMatch(/narrow\.matches \? 1\.5 : 2/);
    // 与文章页阅读尺不同：背景**不是**"完全不渲染"（那是交互装置的做法）
    expect(ACSS, '窄屏不许把底纹或画布 display:none —— 背景是氛围，要的是更轻不是没有')
      .not.toMatch(/@media \(max-width: 767px\)[\s\S]*?\.(?:float-bg|float-plate)[^{]*\{\s*display:\s*none/);
  });

  it('降级④停帧：gate 观察画布 + 切标签同时暂停 CSS 原位漂浮（两半同一处触发）', () => {
    expect(CODE).toMatch(/createActivityGate\(cv/);
    expect(CODE).toMatch(/if \(!gate\.onScreen \|\| !gate\.visible\) return;/);
    // 背景的活动门闩保留；正文已在透明时间线改版中取消漂浮。
    expect(CODE).toMatch(/add\('float-idle'\)/);
    expect(CODE).toMatch(/remove\('float-idle'\)/);
    // bfcache 回来不重跑脚本 ⇒ 卸载时清 rAF 与 observer
    expect(CODE).toMatch(/beforeunload/);
    expect(CODE).toMatch(/gate\.dispose\(\)/);
  });
});

describe('说说页 · 透明时间线（2026-11-01）', () => {
  it('条目无面板，时间轴与图片占位随站点主题变化', () => {
    const talkBlock = ACSS.match(/\.talk\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(talkBlock).toMatch(/background:\s*transparent/);
    expect(talkBlock).not.toMatch(/var\(--panel\)|animation/);
    expect(ACSS).toMatch(/\.talk::before\s*\{[\s\S]*?background:\s*var\(--accent\)/);
    expect(ACSS).toMatch(/\.shots :global\(img\)\s*\{[\s\S]*?background:\s*var\(--panel\)/);
  });
});

describe('说说页 · 墨点螺旋底纹（替代百褶 ∞）', () => {
  it('素材已进仓、体积可控、比例与 CSS 对得上', () => {
    expect(existsSync(PLATE), '缺 src/assets/talks/plates/drift-main.webp').toBe(true);
    const plates = readdirSync(PLATE_DIR).filter((f) => f.endsWith('.webp'));
    expect(plates.length, 'plates 目录下只该有一张底纹').toBe(1);
    const kb = statSync(PLATE).size / 1024;
    expect(kb, `底纹 ${kb.toFixed(0)} KB 太大了（这层是 8% 不透明度的淡墨纹）`).toBeLessThan(200);
    // CSS 的比例必须与素材一致，否则 contain 会把图缩进框里
    expect(ACSS).toMatch(/aspect-ratio:\s*1317 \/ 563/);
  });

  it('★ 素材自带 alpha 且**不裁不染**（四边的月牙本来就触到画布边缘）', async () => {
    /* 与关于页那条同源：不透明矩形底 + opacity 会在纸白上留下一片灰、看得见矩形边。
       本图**天生带 alpha**（透明底 + 墨点），所以连那一步都不用做。
       ⚠ 这个 it 必须标 async（用了 await import + await metadata），
         漏了会报 "await is only allowed within async functions"、整个文件一条都跑不了。 */
    const sharpMod = await import('sharp');
    const sharp = sharpMod.default;
    const meta = await sharp(PLATE).metadata();
    expect(meta.hasAlpha, '素材没有 alpha 通道 ⇒ 会露出矩形底').toBe(true);
    // 不裁：内容框与画布同尺寸（裁了就会切掉最外圈的月牙尖）
    const { data, info } = await sharp(PLATE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = meta.width!, y0 = meta.height!, x1 = -1, y1 = -1, maxA = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const a = data[(y * info.width + x) * info.channels + 3];
        if (a > maxA) maxA = a;
        if (a <= 64) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    expect(maxA, '最大 alpha 为 0 ⇒ 图案被整体清掉了').toBeGreaterThanOrEqual(200);
    expect(x0, `内容贴不到左边缘（x0=${x0}）⇒ 被裁过，外圈月牙尖没了`).toBeLessThanOrEqual(2);
    expect(x1, `内容贴不到右边缘（x1=${x1}）`).toBeGreaterThanOrEqual(meta.width! - 46);
    expect(y0).toBeLessThanOrEqual(2);
    expect(y1).toBeGreaterThanOrEqual(meta.height! - 3);
    // 不染：不透明区仍是近黑的墨（≈ --ink），不是被染成别的色
    let n = 0, r = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] > 200) { r += data[i]; n++; }
    }
    expect(r / n, '不透明区 RGB 应仍是墨色（≈34/255），被染色了').toBeLessThan(60);
  });

  it('★ 底纹挂法照抄百褶 ∞，透明度与比例按素材差异调整（可复算）', () => {
    const topbar = readFileSync(join(ROOT, 'src/components/Topbar.astro'), 'utf8');
    const inf = topbar.match(/body\.chrome-page \.page-inf\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(inf, 'Topbar 里找不到 .page-inf 的规则 —— 百褶 ∞ 改名了，契约要回头改').toBeTruthy();

    const plate = ACSS.match(/\.float-plate\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(plate, '没读到 .float-plate 的样式块').toBeTruthy();
    for (const decl of ['position: fixed', 'left: 50%', 'top: 50%', 'pointer-events: none', 'z-index: -1']) {
      expect(plate, `挂法缺 ${decl}`).toContain(decl);
    }
    expect(plate, '与百褶 ∞ 的居中写法不一致').toMatch(/translate\(-50%,\s*-50%\)/);
    expect(inf, '百褶 ∞ 现在不是 z-index:-1 了 ⇒ 这条契约要重新对').toMatch(/z-index:\s*-1/);
    /* 取宽**刻意不照抄** ∞：∞ 的 `min(128vw,1600px)` 是**故意出血**
       （它墨迹只占取景框 45.8%，切掉的是空白）；本图墨迹铺满画布，
       出血会切掉最外圈月牙。站主 2026-10-04 目检：「小一点，不要出去了」。 */
    expect(plate, '取宽必须收回画内：min(86vw, 1180px, 200vh)').toMatch(
      /--plate-w,\s*min\(86vw,\s*1180px,\s*200vh\)\)/,
    );
    // 反例守卫：∞ 那个"故意出血"的档不许回到本页（ACSS 已剥注释，这里查的就是真声明）
    expect(plate, '128vw 是 ∞ 的出血档 —— 本页禁止再用（会切掉最外圈月牙）').not.toMatch(/128vw/);
    /* ★ 站上通用的守卫，比单看某个数字耐老化：把 plate 块里所有 vw 值都拿出来，
       任何一个 ≥100vw 都意味着「图案会出画」。 */
    const vwValues = [...plate.matchAll(/([\d.]+)vw/g)].map((m) => Number(m[1]));
    expect(vwValues.length, '取宽里一个 vw 都没有？').toBeGreaterThan(0);
    for (const v of vwValues) {
      expect(v, '取宽不许 ≥100vw —— 站主 2026-10-04：不要出去了').toBeLessThan(100);
    }
    // 宽与高都要有上界 —— 只锁宽的话，"又宽又扁"的窗里会从上下出去
    expect(plate, '挡"又宽又扁"的窗，必须有 vh 上界').toMatch(/200vh/);
    // 透明度**刻意不照抄** .2：站上自己的装饰底纹定稿档是 8%
    expect(plate, '透明度默认值应为 8%（站上装饰底纹定稿档）').toMatch(/--plate-op,\s*0\.08\)/);
    expect(inf, '百褶 ∞ 的 opacity 不是 .2 了？契约要重新对').toMatch(/opacity:\s*0?\.2/);
    /* ⚠ 这条查**未剥注释的原文**（要的就是注释里的理由） */
    expect(ASTRO, '这一段要写清为什么不是 .2（换素材 ⇒ 换等价分量）').toMatch(/等视觉分量/);
    expect(SRC + ACSS, '两档旋钮要留着，便于只改一行就调分量').toMatch(/--plate-op/);
    // 图片：contain + 解除 base.css 的 max-width（否则缩到父盒宽度、底纹跟着版心走）
    expect(ACSS).toMatch(/\.float-plate img\s*\{[\s\S]*?object-fit:\s*contain/);
    expect(ACSS).toMatch(/\.float-plate img\s*\{[\s\S]*?max-width:\s*none/);
    // 走构建期管线（<Image widths sizes>）
    expect(ASTRO).toMatch(/import\.meta\.glob<[^>]*ImageMetadata[^>]*>\('\/src\/assets\/talks\/plates\/\*\.webp'/);
    expect(TALKS).toMatch(/<img[^>]*drift-main[^>]*srcset="/);
  });

  it('★ 关掉本页的百褶 ∞（两套母题叠着必脏）', () => {
    expect(ASTRO).toMatch(/:global\(body\.talks-plate \.page-inf\)\s*\{\s*display:\s*none/);
    expect(ASTRO).toMatch(/bodyClass="talks-plate"/);
    expect(TALKS, 'body 缺 talks-plate 类 ⇒ 关不掉百褶 ∞').toMatch(/<body[^>]*class="[^"]*\btalks-plate\b/);
    expect(DIST_CSS, '产物 CSS 里没有关 .page-inf 的规则').toMatch(/body\.talks-plate \.page-inf\{display:none\}/);
  });

  it('装置画布与底纹同层、且不拦指针（装饰层三件套）', () => {
    const bg = ACSS.match(/\.float-bg\s*\{([^}]*)\}/)?.[1] ?? '';
    for (const decl of ['position: fixed', 'inset: 0', 'pointer-events: none', 'z-index: -1']) {
      expect(bg, `画布挂法缺 ${decl}`).toContain(decl);
    }
    expect(TALKS).toMatch(/<canvas class="float-bg"[^>]*aria-hidden="true"/);
  });
});

describe('说说页 · 红线与依赖', () => {
  it('运行时依赖只许住在白名单里（tests/_deps.ts）', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(RUNTIME_DEPS_ALLOWED);
  });

  it('零外部资源：本轮新增的样式里没有外链 / @import / rgba', () => {
    expect(ACSS).not.toMatch(/https?:\/\//);
    expect(ACSS).not.toMatch(/@import/);
    expect(ACSS).not.toMatch(/rgba\(/);
  });

  it('装置脚本与评论脚本并进同一个 <script> 块（不新增标签）', () => {
    const n = (TALKS.match(/<script\b/g) ?? []).length;
    expect(n, `说说页有 ${n} 处 <script>，比预期多 —— 装置应并在既有那个模块里`).toBeLessThanOrEqual(6);
    expect(TALKS).toMatch(/<script\s+type="module"\s+src="\/_astro\/talks\./);
  });

  it('★ 说说页 JS 在预算内（实测闭包 9724：入口 6300 + reply-common 2235 + rl-core 1189）', () => {
    const entry = (TALKS.match(/<script[^>]*src="(\/_astro\/[^"]+\.js)"/) ?? [])[1];
    expect(entry, '没找到说说页的模块脚本').toBeTruthy();
    const seen = new Set<string>();
    const walk = (rel: string): number => {
      if (seen.has(rel)) return 0;
      seen.add(rel);
      const p = join(DIST, decodeURIComponent(rel));
      if (!existsSync(p)) return 0;
      const s = readFileSync(p, 'utf8');
      let total = Buffer.byteLength(s);
      for (const m of s.matchAll(/from\s*["']\.\/([A-Za-z0-9_.-]+\.js)["']/g)) {
        total += walk('/_astro/' + m[1]);
      }
      return total;
    };
    const total = walk(entry);
    /* 预算口径沿用文章页那条（12800）：一台装置 + 评论闭包的量级。
       与文章页不同的是**本页不额外加标签**（同一个 <script> 里 import），
       所以这里守的是字节而不是标签数。 */
    // 2026-10-20：增加账密、恢复码、名片与评论身份，闭包实测 17268 B，无新增入口。
    // 2026-10-18（回复提醒）：共享块里多了顶栏铃铛的客户端，实测 18625 B ⇒ 站主拍板 18 KiB → 19 KiB。
    const BUDGET = 19 * 1024;
    console.log(`判据 说说页 JS 对象 dist/talks/index.html 实测: 闭包 ${total} 字节（预算 ${BUDGET}）· ${seen.size} 个 chunk`);
    expect(total, `说说页 JS 闭包 ${total} 字节，超过 ${BUDGET} 预算`).toBeLessThan(BUDGET);
  });
});
