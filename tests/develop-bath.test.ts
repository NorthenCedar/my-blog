import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';

/* 相册页「显影板」（DEVELOP PLATE）的几条不可退让的性质。
 *
 * ★★ 2026-10-01 站主改口径，这一版的行为与上一版**相反**，读旧注释会理解反：
 *
 *   · **没有指针 = 一块纯色**。板里没有洞、形状不自己漫开、不自己换片。
 *     站主原话：「就不要有洞，鼠标不放上去就只是一块纯色」「删掉自动换片」
 *     「不要他自己漫，只保留鼠标搅动」。
 *   · **每次打开随机一张照片**，且**只抽横幅**（整屏是横的 ⇒ 竖幅只能裁成中间一条）。
 *
 * ★★ 同日第三/四轮（站主给了参考 https://lowkeytp.art/liquid-reveal/ ，再要求整屏）：
 *
 *   · 洞变成**涂抹的擦痕**：走过的路径留在板上、停留约 3 s 再褪回纯色。
 *   · 板从「页头右侧的小板」改成**相册页的整屏首屏**（往下滚才看到相册内容）；
 *     照片按 cover 铺满（会裁）⇒ "不裁不拉伸"那条口径作废。
 *   · 板上有**手写花体「北杉札记」**（DOM 层，不在 canvas 里 ⇒ 擦痕擦不掉）+ **胶片颗粒**
 *     （CSS 层，不进 canvas ⇒ 不给形状掺随机源）。
 *
 * 仍然是同一台装置的底子（照片在下 / 深墨绿在上 / 有机形状的洞里露出照片 /
 * 文字压最上层不参与显影），所以下面这些老规矩**照旧成立**：
 *
 * ① 形状必须是 **t 的确定函数**（无随机源）。
 *    ★★ 这条不是洁癖，是**验收的前提**：形状 = f(t) ⇒ 两次加载在同一 performance.now()
 *    下的轮廓**逐点相同**，于是"改了什么"可以用同 t 逐点差（_probe/cdp-bath.mjs --hold）
 *    精确量出来。一旦形状里掺进随机，"指针搅动的位移"与"形状自己变了"就分不开
 *    （这正是第十版弹簧那条坑的同构版本，见 tests/flow-field.test.ts ④）。
 *    ★ 本版唯一的随机在**选片**（站主要求），且只准出现在那单独一行。
 *
 * ② 时间基准是 performance.now() 的**绝对值**，不是"每帧累加一个相位"。
 *
 * ③ 指针搅动必须是**局部**的：只有指针附近那段边界被推开，不是整块充气。
 *
 * ④ 平滑与弹簧都必须**帧率无关**（指数形式 1−e^(−dt/τ)、半隐式欧拉吃真实 dt）。
 *
 * ⑤ 无 JS 可用 / reduced-motion 降级 / 视口停帧 —— 三条既有契约。
 *    板是**装饰**：内容在网格里已经完整存在，所以宁可整块不出现，也不许
 *    "内容只在动画里可见"（第十版那条血的教训）。
 */
const SRC = readFileSync('src/scripts/develop.ts', 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/[^\n]*/g, ' ');
const ASTRO = readFileSync('src/pages/gallery/index.astro', 'utf8');
/* ★ 读 CSS 判据要用**去掉注释**的那份：注释里常会写"不要写 width:100vw"这种反面例子，
   不剥掉注释的话，判"没有 100vw"的断言会被注释里的字样自己打脸（本轮就撞上了）。 */
const ACSS = ASTRO.replace(/\/\*[\s\S]*?\*\//g, ' ');
const num = (name: string) =>
  Number((SRC.match(new RegExp(`${name}\\s*=\\s*([\\d.]+(?:e[-+]?\\d+)?)`, 'i')) ?? [])[1]);

describe('相册页显影板：纯色底、搅动显影与降级', () => {
  it('形状仍是 t 的确定函数 —— 随机只准出现在「选片」那一行', () => {
    const randLines = CODE.split('\n').filter((l) => l.includes('Math.random'));
    const only = randLines.length === 1 && /pickRandom/.test(randLines[0] ?? '');
    const rest = CODE.replace(/.*Math\.random.*/g, ' ');
    console.log(
      `判据 确定函数 对象 src/scripts/develop.ts 实测: Math.random 出现 ${randLines.length} 次 · `
      + `${only ? '全在 pickRandom（选片）那一行 ✓' : '⚠️ 随机不在选片行 / 不止一处'} · `
      + `${/Math\.random/.test(rest) ? '⚠️ 别处还有随机' : '其余无随机源 ✓'}`,
    );
    expect(randLines.length, '「每次打开随机一张」需要一处随机；多处 ⇒ 无法确认哪处是选片').toBe(1);
    expect(only, '随机不在 pickRandom 那一行 ⇒ 形状掺进了随机源，同 t 逐点比对（验收手段）直接失效').toBe(true);
    expect(/Math\.random/.test(rest), '选片之外还有随机源 ⇒ 形状不再是 t 的确定函数').toBe(false);
  });

  it('时间基准是 performance.now() 的绝对值，不是"每帧累加"', () => {
    const absPh = /const\s+ph\s*=\s*t\s*\*\s*PH_SPD/.test(CODE);
    const accum = /\bph\s*\+=/.test(CODE);
    console.log(
      `判据 时间基准 实测: ${absPh ? '相位 = t × PH_SPD ✓' : '⚠️ 相位不是由 t 直接算'} · `
      + `${accum ? '⚠️ 相位在累加' : '无累加 ✓'}`,
    );
    expect(absPh, '形状相位不是 t 的绝对函数（改成累加 ⇒ 观感随帧率变、跨加载不可比）').toBe(true);
    expect(accum, '形状相位在"每帧累加" —— 30 Hz 屏上会慢一倍').toBe(false);
  });

  it('指针搅动是局部的：按距离衰减，不是整块充气', () => {
    const near = /d2\s*<\s*RINF\s*\*\s*RINF/.test(CODE);
    const smooth = /w\s*\*\s*w\s*\*\s*\(\s*3\s*-\s*2\s*\*\s*w\s*\)/.test(CODE);
    const offBoard = /addEventListener\('pointerleave'[\s\S]{0,120}?pwT\s*=\s*0/.test(CODE);
    const push = num('PUSH_K');
    const rinf = num('R_INF_K');
    console.log(
      `判据 局部搅动 实测: ${near ? '有影响半径判断 ✓' : '⚠️ 没有距离判断'} · `
      + `${smooth ? 'smoothstep 衰减 ✓' : '⚠️ 没有平滑衰减'} · `
      + `${offBoard ? '指针离开即收回 ✓' : '⚠️ 缺"指针无效"的路'} · `
      + `PUSH_K=${push} R_INF_K=${rinf}`,
    );
    expect(near, '指针影响只按"是否在板内"生效 ⇒ 整块一起动，读作充气而不是被搅动').toBe(true);
    expect(smooth, '指针附近的推开没有平滑衰减（边缘会出现一个尖角）').toBe(true);
    expect(offBoard, '指针离开后没把强度归零 ⇒ 洞会赖在板上不收（违反"纯色"口径）').toBe(true);
    /* ★★ 手感参数钉的是**相对笔触半径的比例**，不是绝对数值：
       笔触大小是照参考站的比例定的（82/720），板从"小板"变"整屏"时尺度基准（短边）
       从 185 px 变成 800 px ⇒ 写死绝对区间会在换尺寸那天误报，而比例是尺度无关的。
       · R_INF / R_HOLE ≈ 0.9：影响半径略小于笔触 ⇒ 鼓的是"局部一个包"，不是整块被推走
       · PUSH / R_HOLE ≈ 1/3：大到像被咬一口 / 小到看不见，两头都挡住 */
    const rHole = num('R_HOLE');
    const rInfRatio = rinf / rHole;
    const pushRatio = push / rHole;
    console.log(
      `判据 局部搅动 实测（尺度无关）: R_HOLE=${rHole} · R_INF/R=${rInfRatio.toFixed(2)} · `
      + `PUSH/R=${pushRatio.toFixed(2)}`,
    );
    expect(rHole > 0.02 && rHole < 0.12, `R_HOLE=${rHole} 越界（参考站 82/720 ⇒ 半径 ≈ 短边 0.057）`).toBe(true);
    expect(rInfRatio > 0.5 && rInfRatio <= 1.2, `R_INF/R=${rInfRatio.toFixed(2)} 越界（影响半径应≈笔触大小）`).toBe(true);
    expect(pushRatio > 0.12 && pushRatio <= 0.6, `PUSH/R=${pushRatio.toFixed(2)} 越界（≈1/3 笔触半径）`).toBe(true);
  });

  it('平滑与跟随弹簧都帧率无关：1−e^(−dt/τ) + 半隐式欧拉吃真实 dt', () => {
    const expo = /Math\.exp\(\s*-dt\s*\/\s*tau\s*\)/.test(CODE);
    const springA = /LAG_W\s*\*\s*LAG_W\s*\*\s*\(\s*mx\s*-\s*cx\s*\)\s*-\s*2\s*\*\s*LAG_Z\s*\*\s*LAG_W\s*\*\s*cvx/.test(CODE);
    const springV = /cvx\s*\+=\s*ax\s*\*\s*ds/.test(CODE) && /cx\s*\+=\s*cvx\s*\*\s*ds/.test(CODE);
    const perFrame = /pw\s*\*=\s*[\d.]+/.test(CODE);
    const dtCap = /Math\.min\(DT_MAX,\s*Math\.max\(0,\s*now\s*-\s*last\)\)/.test(CODE);
    console.log(
      `判据 帧率无关 实测: ${expo ? '1 − e^(−dt/τ) ✓' : '⚠️ 不是指数平滑'} · `
      + `${springA && springV ? '跟随弹簧吃真实 dt ✓' : '⚠️ 弹簧没吃真实 dt'} · `
      + `${perFrame ? '⚠️ 还有每帧固定系数' : '无每帧固定系数 ✓'} · `
      + `${dtCap ? 'dt 取自 rAF 真实间隔并设上限 ✓' : '⚠️ 没接真实 dt / 没上限'}`,
    );
    expect(expo, '指针强度用"每帧乘固定系数"平滑 ⇒ 时间常数随刷新率变').toBe(true);
    expect(springA && springV, '跟随弹簧没吃真实 dt ⇒ 洞跟随的快慢取决于显示器刷新率').toBe(true);
    expect(perFrame, '还有每帧固定系数（*= 常数）：这一条在流场弹簧上已经栽过一次').toBe(false);
    expect(dtCap, 'dt 没从 rAF 真实间隔算 / 没有上限（切标签回来会跳变）').toBe(true);
  });

  it('★ 没有指针（且擦痕褪尽）= 一块纯色：不画洞、不自己漫、不自己换片', () => {
    const clears = /ctx\.clearRect\(0,\s*0,\s*W,\s*H\)/.test(CODE);
    const gate = /if\s*\(\s*trail\s*<=\s*TRAIL_EPS\s*\)/.test(CODE);
    const noGrow = !/T_GROW/.test(CODE) && !/T_ROLL/.test(CODE);
    const noAuto = !/advance\s*\(/.test(CODE) && !/lastPeak/.test(CODE) && !/LOCK_MS/.test(CODE);
    const stopClears = /const\s+stop\s*=\s*\(\)[\s\S]{0,400}?ctx\.clearRect/.test(CODE);
    console.log(
      `判据 纯色底 实测: ${clears ? '每帧先清屏 ✓' : '⚠️ 没有清屏'} · `
      + `${gate ? '擦痕褪尽就直接返回（不画）✓' : '⚠️ 没有"擦痕褪尽才停"的闸'} · `
      + `${noGrow ? '无自动生长周期 ✓' : '⚠️ 还有 T_GROW/T_ROLL（洞会自己漫）'} · `
      + `${noAuto ? '无自动换片 ✓' : '⚠️ 还有 advance/LOCK_MS（会自己换片）'} · `
      + `${stopClears ? '停帧也清屏 ✓' : '⚠️ 停帧会留下形状残影'}`,
    );
    expect(clears, '没有每帧清屏 ⇒ 形状会留残影').toBe(true);
    expect(gate, '缺"擦痕褪尽才不画"的闸 ⇒ 静止时会留着一块擦痕（站主要的是纯色）').toBe(true);
    expect(noGrow, '还有自动生长周期 ⇒ 洞会自己漫开（站主：「不要他自己漫」）').toBe(true);
    expect(noAuto, '还有自动换片（站主：「删掉自动换片」）').toBe(true);
    expect(stopClears, '停帧没清屏 ⇒ 指针离开后洞的残影会赖在板上').toBe(true);
  });

  it('笔触跟着指针走：进板即落点，之后由滞后弹簧跟随', () => {
    const snap = /if\s*\(\s*pw\s*<=\s*PW_EPS\s*\)\s*\{\s*cx\s*=\s*mx;\s*cy\s*=\s*my/.test(CODE);
    const spring = /const\s+ax\s*=\s*LAG_W/.test(CODE);
    console.log(
      `判据 跟随 实测: ${snap ? '刚进板笔触落在指针上 ✓' : '⚠️ 笔触会从上一处飞过来'} · `
      + `${spring ? '有滞后弹簧 ✓' : '⚠️ 笔触硬跟指针（没有"被拽着走"的手感）'}`,
    );
    expect(snap, '笔触不落到指针上 ⇒ 指针刚进板时痕迹出现在上一处位置（读成 bug）').toBe(true);
    expect(spring, '笔触直接等于指针位置 ⇒ 没有滞后，"搅动"的手感全丢').toBe(true);
  });

  it('★ 擦痕会停留一段时间再褪回纯色（参考站的「显影停留时间」）', () => {
    const tau = num('TRAIL_TAU');
    const eps = num('TRAIL_EPS');
    /* 蒙版衰减必须是 `1 − e^(−dt/τ)`（帧率无关）写成 destination-out 的一层 */
    const decay = /1\s*-\s*Math\.exp\(-dt\s*\/\s*TRAIL_TAU\)/.test(CODE);
    const dstOut = /globalCompositeOperation\s*=\s*'destination-out'/.test(CODE);
    const masked = /globalCompositeOperation\s*=\s*'destination-in'/.test(CODE);
    /* ★ 停帧必须**连蒙版一起清**：擦痕是累积的，只清主画布 ⇒ 下次进来带着上次的痕 */
    const stopMk = /const\s+stop\s*=\s*\(\)[\s\S]{0,700}?mkx\.clearRect/.test(CODE);
    /* ★ 指针离开后不能立刻停帧，否则擦痕冻在最后一帧、永远不会褪（正是这条要求的反面） */
    const keepWhileTrail = /trail\s*>\s*TRAIL_EPS/.test(CODE);
    console.log(
      `判据 擦痕停留 实测: TRAIL_TAU = ${tau} ms（≈ ${(tau * Math.log(1 / (eps || 0.06)) / 1000).toFixed(1)} s 褪尽）· `
      + `${decay ? '指数衰减（帧率无关）✓' : '⚠️ 衰减不是 1−e^(−dt/τ)'} · `
      + `${dstOut ? '蒙版 destination-out ✓' : '⚠️ 蒙版没在衰减'} · `
      + `${masked ? '照片按蒙版抠出 ✓' : '⚠️ 没按蒙版抠图（擦痕不会显影）'} · `
      + `${stopMk ? '停帧连蒙版一起清 ✓' : '⚠️ 停帧只清主画布，擦痕会残留到下次'} · `
      + `${keepWhileTrail ? '指针走了还继续画到褪尽 ✓' : '⚠️ 指针一走就停帧，擦痕会冻住'}`,
    );
    expect(tau, '没有擦痕停留时间常数 ⇒ 抹过就没了（站主：「鼠标移动过的路径要有擦除效果」）').toBeGreaterThanOrEqual(800);
    expect(decay, '擦痕衰减不是 1−e^(−dt/τ) ⇒ 停留时长随刷新率变（60Hz 与 120Hz 差一倍）').toBe(true);
    expect(dstOut && masked, '没有"蒙版衰减 + 按蒙版抠图" ⇒ 擦痕要么不累积、要么不显影').toBe(true);
    expect(stopMk, '停帧没清蒙版 ⇒ 擦痕累积，下次进板会带着上一次没褪完的痕').toBe(true);
    expect(keepWhileTrail, '指针一离开就停帧 ⇒ 擦痕冻在最后一帧，永远褪不回纯色').toBe(true);
  });

  it('★ 手写花体（英文站名）不在 canvas 里 ⇒ 擦痕擦不掉它', () => {
    /* ★ 站名不许写死在 src/ 里（架构契约：主题不持有正文/站名）⇒ 必须是从 content 读来的 */
    const mark = /class="bath-mark"\s*>\{siteWordmark\}</.test(ASTRO);
    const fromContent = /getSite\(\)/.test(ASTRO);
    /* ★★ Homemade Apple = 参考站同款（站主原话）；它是拉丁字体 ⇒ 后面必须有中文手写体兜底 */
    const script = /font-family:[^;]*Homemade Apple/.test(ACSS);
    const cnName = /font-family:[^;]*楷体/.test(ACSS);
    /* ★★ 字体必须**自托管**（站内不许引 CDN）⇒ @font-face 指向 /fonts/，且文件真的在 public/fonts */
    const FONTS = readFileSync('src/styles/fonts.css', 'utf8');
    const face = /font-family:\s*"Homemade Apple"[\s\S]{0,160}?url\("\/fonts\/homemade-apple\.woff2"\)/.test(FONTS);
    const shipped = existsSync('public/fonts/homemade-apple.woff2');
    const noCdn = !/fonts\.googleapis|fonts\.gstatic|cdn/.test(FONTS);
    /* ★★ 判据是"文字**不在** canvas 里"：脚本端不许 fillText（画进 canvas 就会被蒙版抠掉） */
    const noFillText = !/fillText/.test(CODE);
    const above = /\.bath-mark\s*\{[^}]*z-index:\s*2/.test(ACSS);
    console.log(
      `判据 花体字 实测: ${mark ? '板上有英文站名 ✓' : '⚠️ 字没了'} · `
      + `${script ? 'Homemade Apple（参考站同款）✓' : '⚠️ 不是那款手写体'} · `
      + `${cnName ? '有中文手写体兜底 ✓' : '⚠️ 拉丁字体之外没有中文兜底'} · `
      + `${fromContent ? '站名来自 content ✓' : '⚠️ 站名写死在 src/ 里（违反内容契约）'} · `
      + `${face && shipped ? '自托管 woff2 ✓' : '⚠️ 字体没落地'} · `
      + `${noCdn ? '没有 CDN 引用 ✓' : '⚠️ 引了外部字体'} · `
      + `${noFillText ? '不用 canvas fillText（擦不掉）✓' : '⚠️ 字画进了 canvas ⇒ 会被蒙版抠掉'} · `
      + `${above ? '压在颗粒层之上 ✓' : '⚠️ 会被颗粒层盖住'}`,
    );
    expect(mark, '板上没有那行手写花体（站主要保留它）').toBe(true);
    expect(script, '字体栈里没有 Homemade Apple ⇒ 不是站主要的那款花体（参考站同款）').toBe(true);
    expect(cnName, '拉丁手写体之外没有中文兜底 ⇒ 万一渲染中文会掉成默认黑体').toBe(true);
    expect(fromContent, '站名写死在 src/ 里 ⇒ 违反「主题不持有正文/站名」（content-invariants 会红）').toBe(true);
    expect(face && shipped, '字体没自托管到 public/fonts（或 @font-face 不存在）⇒ 花体字不生效').toBe(true);
    expect(noCdn, '引了外部字体服务 ⇒ 违反"站内不依赖外部资源"').toBe(true);
    expect(noFillText, '字画进了 canvas ⇒ 会被擦痕蒙版一起抠掉（站主要它擦不掉）').toBe(true);
    expect(above, '花体字没压在颗粒层之上 ⇒ 会被噪点糊住').toBe(true);
  });

  it('★ 胶片颗粒走 CSS 层，不进 canvas（免得给形状掺随机源）', () => {
    const grain = /data:image\/svg\+xml[^"]*feTurbulence/.test(ACSS);
    const blend = /mix-blend-mode:\s*overlay/.test(ACSS);
    const stitch = /stitchTiles='stitch'/.test(ACSS);
    console.log(
      `判据 颗粒 实测: ${grain ? '内联 SVG 噪点（不引外部资源）✓' : '⚠️ 没有颗粒层'} · `
      + `${blend ? 'overlay 混合（只改明暗不改色相）✓' : '⚠️ 不是 overlay'} · `
      + `${stitch ? '平铺无缝 ✓' : '⚠️ 噪点没 stitchTiles，平铺会有缝'}`,
    );
    expect(grain, '没有颗粒层（站主要「照片加一点噪点颗粒感」）').toBe(true);
    expect(blend, '颗粒不是 overlay ⇒ 会是彩色噪点，不是胶片颗粒').toBe(true);
    expect(stitch, '噪点没开 stitchTiles ⇒ 160px 平铺会有可见接缝').toBe(true);
  });

  it('板默认不出现 —— 没有 JS 就没有它，不是"藏起来"', () => {
    const hiddenAttr = /class="bath"[^>]*\shidden\b/.test(ASTRO);
    const ariaHidden = /class="bath"[^>]*aria-hidden="true"/.test(ASTRO);
    const reveals = /host\.hidden\s*=\s*false/.test(CODE);
    const hiddenCss = /\.bath\[hidden\]/.test(ACSS);
    /* ★ 露面**不许等**首图下载完：静止态一个像素都不画（纯色），等图只会让板在慢网络下
       晚好几秒才出现 —— 线上实测 t≈4.1 s 时板还没露面（`host.hidden` 仍是 true）。
       判据两条：没有 `await ready(`；且 `host.hidden = false` 紧跟在抽片之后（中间不许夹等待）。 */
    const noWait = !/await\s+ready\(/.test(CODE);
    const revealDirect = /if\s*\(openRandom\(\)\)\s*\{\s*host\.hidden\s*=\s*false/.test(CODE);
    console.log(
      `判据 无 JS 降级 实测: ${hiddenAttr ? 'SSR 就带 hidden ✓' : '⚠️ 首屏没有 hidden'} · `
      + `${ariaHidden ? 'aria-hidden ✓' : '⚠️ 缺 aria-hidden'} · `
      + `${reveals ? '脚本到位才解除 ✓' : '⚠️ 脚本没解除'} · `
      + `${hiddenCss ? '显式 [hidden] 规则 ✓' : '⚠️ 没有 [hidden] 兜底规则'} · `
      + `${noWait && revealDirect ? '不等首图下载 ✓' : '⚠️ 在等首图下载完才露面'}`,
    );
    expect(hiddenAttr, '板没带 hidden ⇒ 无 JS 时会看到一块空的深色板（板上没有可用信息）').toBe(true);
    expect(ariaHidden, '板是纯装饰，应 aria-hidden —— 否则读屏会念一段无意义的读数').toBe(true);
    expect(reveals, '脚本没有解除 hidden（板永远不出现）').toBe(true);
    expect(hiddenCss, '上游若给 .bath 加了 display，[hidden] 会被覆盖 ⇒ 必须显式写一条').toBe(true);
    expect(noWait && revealDirect, '板在等首图下载完才露面 ⇒ 慢网络下页头会空几秒（线上实测 4.1 s 时还没露面）').toBe(true);
  });

  it('reduced-motion：静止整张照片，不跑 rAF', () => {
    const mq = /matchMedia\(\s*'\(prefers-reduced-motion:\s*reduce\)'\s*\)/.test(CODE);
    const still = /if\s*\(\s*reduce\.matches\s*\)\s*\{\s*drawCover\(im,\s*1\)\s*;\s*return;\s*\}/.test(CODE);
    const noRaf = /cancelAnimationFrame/.test(CODE);
    console.log(
      `判据 降级 实测: ${mq ? '查询 reduced-motion ✓' : '⚠️ 没查'} · `
      + `${still ? '静止整张（不裁形）✓' : '⚠️ 降级态不是"显影完成"那一帧'} · `
      + `${noRaf ? '可停帧 ✓' : '⚠️ 不能停帧'}`,
    );
    expect(mq, '没有 reduced-motion 降级').toBe(true);
    expect(still, 'reduced-motion 下没走静态整张 ⇒ 静止用户只会看到一块空深色板（没有洞可得）').toBe(true);
    expect(noRaf, '没有停帧能力 ⇒ reduced-motion 下仍在空跑 rAF').toBe(true);
  });

  it('停帧三态：视口外 / 切标签 / 没指针', () => {
    const io = /IntersectionObserver/.test(CODE);
    const vis = /visibilitychange/.test(CODE);
    /* ★ 判据里**必须带上 trail**：擦痕还在褪的时候要继续跑（否则冻在最后一帧） */
    const idle = /const\s+want\s*=\s*onScreen[\s\S]{0,220}?\(\s*pwT\s*>\s*0\s*\|\|\s*pw\s*>\s*PW_EPS\s*\|\|\s*trail\s*>\s*TRAIL_EPS\s*\)/.test(CODE);
    console.log(
      `判据 停帧 实测: ${io ? 'IntersectionObserver ✓' : '⚠️ 没有'} · `
      + `${vis ? '切标签停帧 ✓' : '⚠️ 没处理 visibilitychange'} · `
      + `${idle ? '没指针且擦痕褪尽才停 ✓' : '⚠️ 要么没指针还在空跑、要么擦痕会被冻住'}`,
    );
    expect(io, '没有 IntersectionObserver ⇒ 滚到网格里还在每帧算噪声（整屏下这是白烧电）').toBe(true);
    expect(vis, '切到别的标签页后仍在跑 rAF').toBe(true);
    expect(idle, '停帧判据没带上擦痕 ⇒ 要么没指针还在空转，要么擦痕被冻在最后一帧褪不掉').toBe(true);
  });

  it('与页面互动：划过网格任意一张 ⇒ 板里换成那一张', () => {
    const binds = /querySelectorAll<HTMLElement>\('\.wf figure'\)/.test(CODE);
    /* ★ 图源必须走**网格档（800）**：`im.getAttribute('src')`。
       走灯箱档（`a.frame` 的 href，1280）时单张能到 486 KB，线上实测 842 ms 才到、
       更重的要好几秒 ⇒ 那几秒里指针搅不出任何东西（板是纯色，画不出来）。 */
    const reads = /\.getAttribute\('src'\)/.test(CODE);
    const noBigTier = !/getAttribute\('href'\)/.test(CODE);
    /* ★ 换片的落点：show() 真的把新图挂上（nxt + mix 归零 ⇒ 交叉淡入） */
    const swaps = /const\s+show\s*=\s*\([\s\S]{0,220}?mix\s*=\s*0/.test(CODE);
    console.log(
      `判据 页面互动 实测: ${binds ? '订阅 .wf figure ✓' : '⚠️ 没订阅'} · `
      + `${reads ? '取网格档 img 的 src ✓' : '⚠️ 没取图源'} · `
      + `${noBigTier ? '没走灯箱档（1280）✓' : '⚠️ 在拿 a.frame 的 href'} · `
      + `${swaps ? '划过就交叉淡入换片 ✓' : '⚠️ 划过不换片'}`,
    );
    expect(binds, '没有把网格里的图接进来（站主的核心诉求：底下的影要能和那页互动）').toBe(true);
    expect(reads, '没从 figure 取图片地址').toBe(true);
    expect(noBigTier, '板在拿灯箱档（1280，数百 KB）当图源 ⇒ 图到位前指针擦不出东西').toBe(true);
    expect(swaps, '划过网格照片没有真的换片（互动就只剩"擦"一半）').toBe(true);
  });

  it('板底不由 canvas 画 —— 透明 canvas 才能守住"纯色"、探针才能读轮廓', () => {
    const fills = /ctx\.fillRect\(0,\s*0,\s*W,\s*H\)/.test(CODE);
    const bg = /\.bath\s*\{[^}]*background/.test(ACSS);
    console.log(
      `判据 透明画布 实测: ${fills ? '⚠️ canvas 在铺板底' : '不铺板底 ✓'} · `
      + `${bg ? '板底由 CSS 背景承担 ✓' : '⚠️ CSS 里没有板底色'}`,
    );
    expect(fills, 'canvas 在铺板底色 ⇒ 每帧多一次全屏填充，且"没指针 = 纯色"要靠 canvas 自己画一遍').toBe(false);
    expect(bg, '板底没有落到 CSS ⇒ 纯色态没有颜色来源').toBe(true);
  });

  it('只抽横幅照片，每次打开随机一张', () => {
    const land = /f\.w\s*>\s*0\s*&&\s*f\.h\s*>\s*0\s*&&\s*f\.w\s*>\s*f\.h/.test(CODE);
    const pick = /const\s+f\s*=\s*pickRandom\(list\)/.test(CODE);
    // 悬停换片那条路也必须挡住竖幅：板的形状是开场那张照片定的，竖幅进来只能裁
    const hoverLand = /pointerenter'[\s\S]{0,800}?fw\s*>\s*0\s*&&\s*fh\s*>\s*0\s*&&\s*fw\s*>\s*fh/.test(CODE);
    // bfcache 回来的页面不重跑脚本 ⇒ 必须靠 pageshow(persisted) 补一次重抽
    const persist = /pageshow[\s\S]{0,200}?persisted/.test(CODE);
    /* ★★ 网格里每张图挂的 width/height 必须是**网格档（800）**（就是脚本读的那对）——
       manifest 的 `w` 是"请求宽"不是实际宽（源图窄于目标宽时 withoutEnlargement 生效），
       照 1280 档判会有 6 张横竖判反（实测：「苏州的美」manifest 1280×1184 像横幅，
       实际文件 896×1184 是竖幅）；照 800 档判一张都不反。 */
    const gridTier = /const\s+g\s*=\s*at\(f,\s*GRID_W\)/.test(ASTRO);
    const whAttrs = /width=\{g\.w\}\s+height=\{g\.h\}/.test(ASTRO);
    console.log(
      `判据 抽片 实测: ${land ? '只收 w>h ✓' : '⚠️ 没收窄到横幅'} · `
      + `${pick ? '打开时随机抽一张 ✓' : '⚠️ 没有随机抽片'} · `
      + `${hoverLand ? '悬停也只接横幅 ✓' : '⚠️ 悬停会把竖幅塞进板里（会被裁）'} · `
      + `${persist ? 'bfcache 回来会重抽 ✓' : '⚠️ 从文章返回相册不会换照片'} · `
      + `${gridTier && whAttrs ? '网格图挂的是 800 档尺寸 ✓' : '⚠️ 网格图尺寸档位与脚本不一致'}`,
    );
    expect(land, '没收窄到横幅 ⇒ 抽到竖幅时板会被撑成竖条（站主：「只要横着的」）').toBe(true);
    expect(pick, '没有随机抽片（站主：「每次打开随机出现一张照片」）').toBe(true);
    expect(hoverLand, '悬停换片没挡竖幅 ⇒ 板里会出现一张被裁过的竖幅，破坏"不裁不拉伸"').toBe(true);
    expect(persist, '没处理 bfcache 恢复 ⇒「每次打开随机一张」在"从文章返回相册"时不成立').toBe(true);
    expect(gridTier && whAttrs, '网格图挂的不是 800 档尺寸 ⇒ 脚本端判横竖/定图源的口径对不上').toBe(true);
  });

  it('★ 整屏首屏：铺满视口、一屏高，且不靠 100vw', () => {
    /* ★★ 2026-10-01 第四轮：站主「不如直接把这个放在相册页整屏」⇒ 这条判据**翻过来**了：
       上一版钉的是"不是满宽条"，现在钉的是"**是**满宽 + 一屏高"。 */
    const bleed = /margin-inline:\s*calc\(50%\s*-\s*50vw\)/.test(ACSS);
    const svh = /height:\s*calc\(100svh\s*-\s*var\(--topbar-h\)\)/.test(ACSS);
    const noVw = !/\bwidth:\s*100vw/.test(ACSS);
    /* ★ 桌面：板是页头的**第一个**子元素（整屏），标题被它顶到首屏之下。
       手机（≤767px）：同一份 DOM 用 order 把板排到标题**右边**，变回小板。 */
    const firstChild = ASTRO.indexOf('class="bath"') > 0
      && ASTRO.indexOf('class="bath"') < ASTRO.indexOf('class="pagehead-main"');
    const noPadTop = /\.pagehead\.pagehead\s*\{[^}]*padding-top:\s*0/.test(ACSS);
    const mq = /@media\s*\(max-width:\s*767px\)/.test(ACSS);
    const mOrder = /\.pagehead-main\s*\{[^}]*order:\s*1/.test(ACSS) && /\.bath\s*\{[^}]*order:\s*2/.test(ACSS);
    const mAr = /aspect-ratio:\s*var\(--bath-ar/.test(ACSS);
    const mW = /width:\s*min\(56%,\s*240px\)/.test(ACSS);
    /* ★ flex: 0 0 auto 必须有：flex 子项默认可收缩，缺了它标题一挤就把板压扁
       （实测 390 视口：CSS 写 179 px，实测被压到 133 px）。 */
    const mNoShrink = /\.bath\s*\{[^}]*flex:\s*0\s+0\s+auto/.test(ACSS);
    /* ★ 笔触在**小板**上要另算一档：整屏那档（短边的 0.057）搬到 300px 小板上只有 17 px */
    const small = /R_HOLE_SMALL\s*=\s*0\.22/.test(CODE) && /RB\s*=\s*Math\.min\(W,\s*H\)\s*<\s*SMALL_PLATE/.test(CODE);
    console.log(
      `判据 整屏 实测: ${bleed ? '逃出 .shell 铺满宽 ✓' : '⚠️ 没有满宽手法（会被 .shell 框窄）'} · `
      + `${svh ? '高 = 100svh − 顶栏 ✓' : '⚠️ 高度不是一屏'} · `
      + `${noVw ? '没有 width:100vw ✓' : '⚠️ 用了 width:100vw（含滚动条宽度 ⇒ 会溢出）'} · `
      + `${firstChild ? '是页头第一个子元素 ✓' : '⚠️ 不在页头最前（首屏不是它）'} · `
      + `${noPadTop ? '页头上内边距清零 ✓' : '⚠️ 首屏顶上留了一条空'} · `
      + `${mq && mOrder && mAr && mW && mNoShrink ? '手机档回到页头旁的小板 ✓' : '⚠️ 手机档没回到小板'} · `
      + `${small ? '小板另算一档笔触 ✓' : '⚠️ 小板沿用了整屏的笔触（17px，手指擦不动）'}`,
    );
    expect(bleed, '没有满宽手法 ⇒ 整屏会被 .shell 框成"中间一块"（首页 .band 踩过同一处）').toBe(true);
    expect(svh, '高度不是 100svh − 顶栏 ⇒ 不是"进来就是一整屏"').toBe(true);
    expect(noVw, 'width:100vw 含滚动条宽度 ⇒ 横向溢出').toBe(true);
    expect(firstChild, '板不是页头第一个子元素 ⇒ 打开相册页先看到标题，不是整屏装置').toBe(true);
    expect(noPadTop, '页头还有上内边距 ⇒ 首屏顶上多一条空白，不是从顶部铺到底').toBe(true);
    expect(mq && mOrder && mAr && mW && mNoShrink, '手机档没回到"页头旁边的小板"（站主：触屏涂抹不习惯）').toBe(true);
    expect(small, '小板沿用整屏的笔触比例 ⇒ 一笔只有 17 px，手指擦不动').toBe(true);
  });
});
