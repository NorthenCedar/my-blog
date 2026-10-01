import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* 相册页「显影板」（DEVELOP PLATE）的几条不可退让的性质。
 *
 * ★★ 2026-10-01 站主改口径，这一版的行为与上一版**相反**，读旧注释会理解反：
 *
 *   · **没有指针 = 一块纯色**。板里没有洞、形状不自己漫开、不自己换片。
 *     站主原话：「就不要有洞，鼠标不放上去就只是一块纯色」「删掉自动换片」
 *     「不要他自己漫，只保留鼠标搅动」。
 *   · **每次打开随机一张照片**，且**只抽横幅**（板按照片原比例裁形 ⇒ 竖幅会撑成竖条）。
 *   · 板从「满宽条」改成**页头右侧的小板**，尺寸 = 照片原比例（不裁不拉伸）。
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
    // 手感参数：钉区间不钉数值（站主可按手感调），只挡住"大到像被咬一口 / 小到看不见"
    expect(push > 0.05 && push <= 0.28, `PUSH_K=${push} 越界`).toBe(true);
    expect(rinf > 0.15 && rinf <= 0.5, `R_INF_K=${rinf} 越界（影响半径应明显小于形状本身）`).toBe(true);
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

  it('★ 没有指针 = 一块纯色：不画洞、不自己漫、不自己换片', () => {
    const clears = /ctx\.clearRect\(0,\s*0,\s*W,\s*H\)/.test(CODE);
    const gate = /if\s*\(\s*pw\s*<=\s*PW_EPS\s*\)\s*return/.test(CODE);
    const noGrow = !/T_GROW/.test(CODE) && !/T_ROLL/.test(CODE);
    const noAuto = !/advance\s*\(/.test(CODE) && !/lastPeak/.test(CODE) && !/LOCK_MS/.test(CODE);
    const stopClears = /const\s+stop\s*=\s*\(\)[\s\S]{0,400}?ctx\.clearRect/.test(CODE);
    console.log(
      `判据 纯色底 实测: ${clears ? '每帧先清屏 ✓' : '⚠️ 没有清屏'} · `
      + `${gate ? 'pw≤eps 直接返回（不画洞）✓' : '⚠️ 没有"无指针就返回"的闸'} · `
      + `${noGrow ? '无自动生长周期 ✓' : '⚠️ 还有 T_GROW/T_ROLL（洞会自己漫）'} · `
      + `${noAuto ? '无自动换片 ✓' : '⚠️ 还有 advance/LOCK_MS（会自己换片）'} · `
      + `${stopClears ? '停帧也清屏 ✓' : '⚠️ 停帧会留下形状残影'}`,
    );
    expect(clears, '没有每帧清屏 ⇒ 形状会留残影').toBe(true);
    expect(gate, '缺"没有指针就返回"的闸 ⇒ 静止时会有一个洞（站主要的是纯色）').toBe(true);
    expect(noGrow, '还有自动生长周期 ⇒ 洞会自己漫开（站主：「不要他自己漫」）').toBe(true);
    expect(noAuto, '还有自动换片（站主：「删掉自动换片」）').toBe(true);
    expect(stopClears, '停帧没清屏 ⇒ 指针离开后洞的残影会赖在板上').toBe(true);
  });

  it('洞跟着指针走：进板即落点，之后由滞后弹簧跟随', () => {
    const snap = /if\s*\(\s*pw\s*<=\s*PW_EPS\s*\)\s*\{\s*cx\s*=\s*mx;\s*cy\s*=\s*my/.test(CODE);
    const spring = /const\s+ax\s*=\s*LAG_W/.test(CODE);
    console.log(
      `判据 跟随 实测: ${snap ? '刚进板洞心落在指针上 ✓' : '⚠️ 洞会从上一处飞过来'} · `
      + `${spring ? '有滞后弹簧 ✓' : '⚠️ 洞是硬跟指针（没有"被拽着走"的手感）'}`,
    );
    expect(snap, '洞心不落到指针上 ⇒ 指针刚进板时洞从上一处位置飞过来（读成 bug）').toBe(true);
    expect(spring, '洞直接等于指针位置 ⇒ 没有滞后，"搅动"的手感全丢').toBe(true);
  });

  it('板默认不出现 —— 没有 JS 就没有它，不是"藏起来"', () => {
    const hiddenAttr = /class="bath"[^>]*\shidden\b/.test(ASTRO);
    const ariaHidden = /class="bath"[^>]*aria-hidden="true"/.test(ASTRO);
    const reveals = /host\.hidden\s*=\s*false/.test(CODE);
    const hiddenCss = /\.bath\[hidden\]/.test(ASTRO);
    /* ★ 露面**不许等**首图下载完：静止态一个像素都不画（纯色），等图只会让板在慢网络下
       晚好几秒才出现 —— 线上实测 t≈4.1 s 时板还没露面（`host.hidden` 仍是 true）。 */
    const noWait = !/await\s+ready\(|addEventListener\('load'/.test(CODE);
    console.log(
      `判据 无 JS 降级 实测: ${hiddenAttr ? 'SSR 就带 hidden ✓' : '⚠️ 首屏没有 hidden'} · `
      + `${ariaHidden ? 'aria-hidden ✓' : '⚠️ 缺 aria-hidden'} · `
      + `${reveals ? '脚本到位才解除 ✓' : '⚠️ 脚本没解除'} · `
      + `${hiddenCss ? '显式 [hidden] 规则 ✓' : '⚠️ 没有 [hidden] 兜底规则'} · `
      + `${noWait ? '不等首图下载 ✓' : '⚠️ 在等首图下载完才露面'}`,
    );
    expect(hiddenAttr, '板没带 hidden ⇒ 无 JS 时会看到一块空的深色板（板上没有可用信息）').toBe(true);
    expect(ariaHidden, '板是纯装饰，应 aria-hidden —— 否则读屏会念一段无意义的读数').toBe(true);
    expect(reveals, '脚本没有解除 hidden（板永远不出现）').toBe(true);
    expect(hiddenCss, '上游若给 .bath 加了 display，[hidden] 会被覆盖 ⇒ 必须显式写一条').toBe(true);
    expect(noWait, '板在等首图下载完才露面 ⇒ 慢网络下页头会空几秒（线上实测 4.1 s 时还没露面）').toBe(true);
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
    const idle = /const\s+want\s*=\s*onScreen[\s\S]{0,160}?\(\s*pwT\s*>\s*0\s*\|\|\s*pw\s*>\s*PW_EPS\s*\)/.test(CODE);
    console.log(
      `判据 停帧 实测: ${io ? 'IntersectionObserver ✓' : '⚠️ 没有'} · `
      + `${vis ? '切标签停帧 ✓' : '⚠️ 没处理 visibilitychange'} · `
      + `${idle ? '没指针就停 ✓' : '⚠️ 没指针还在空跑 rAF'}`,
    );
    expect(io, '没有 IntersectionObserver ⇒ 滚到网格里还在每帧算噪声（白烧电）').toBe(true);
    expect(vis, '切到别的标签页后仍在跑 rAF').toBe(true);
    expect(idle, '没有指针时仍在跑 rAF ⇒ 板会一直空转（这一版没有"自己在动"这回事）').toBe(true);
  });

  it('与页面互动：划过网格任意一张 ⇒ 板里换成那一张', () => {
    const binds = /querySelectorAll<HTMLElement>\('\.wf figure'\)/.test(CODE);
    const reads = /fig\.querySelector<HTMLAnchorElement>\('a\.frame'\)/.test(CODE);
    const reads2 = /read\(f, idx \+ 1, list\.length, tag\)/.test(CODE);
    console.log(
      `判据 页面互动 实测: ${binds ? '订阅 .wf figure ✓' : '⚠️ 没订阅'} · `
      + `${reads ? '取 a.frame 的 href ✓' : '⚠️ 没取图源'} · `
      + `${reads2 ? '板内读数同步 ✓' : '⚠️ 读数没同步'}`,
    );
    expect(binds, '没有把网格里的图接进来（站主的核心诉求：底下的影要能和那页互动）').toBe(true);
    expect(reads, '没从 figure 取图片地址').toBe(true);
    expect(reads2, '板内读数没跟着换（读数与画面不一致，仪器感就假了）').toBe(true);
  });

  it('板底不由 canvas 画 —— 透明 canvas 才能守住"纯色"、探针才能读轮廓', () => {
    const fills = /ctx\.fillRect\(0,\s*0,\s*W,\s*H\)/.test(CODE);
    const bg = /\.bath\s*\{[^}]*background/.test(ASTRO);
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
    /* ★★ SSR 占位必须按**网格档（800）**判横竖，不能按灯箱档（1280）——
       manifest 的 `w` 是"请求宽"不是实际宽（源图窄于目标宽时 withoutEnlargement 生效），
       照 1280 档判会有 6 张横竖判反（实测：「苏州的美」manifest 1280×1184 像横幅，
       实际文件 896×1184 是竖幅）；照 800 档判一张都不反。脚本端读 `<img>` 上那对
       800 档属性 ⇒ 两处口径必须一致，否则脚本没跑完的一瞬会露出一个对不上的分母。 */
    const seedGrid = /at\(f,\s*GRID_W\)/.test(ASTRO);
    const seed = /x\.g\.w\s*>\s*x\.g\.h/.test(ASTRO);
    console.log(
      `判据 抽片 实测: ${land ? '只收 w>h ✓' : '⚠️ 没收窄到横幅'} · `
      + `${pick ? '打开时随机抽一张 ✓' : '⚠️ 没有随机抽片'} · `
      + `${hoverLand ? '悬停也只接横幅 ✓' : '⚠️ 悬停会把竖幅塞进板里（会被裁）'} · `
      + `${persist ? 'bfcache 回来会重抽 ✓' : '⚠️ 从文章返回相册不会换照片'} · `
      + `${seedGrid && seed ? 'SSR 占位按网格档判横竖 ✓' : '⚠️ SSR 占位口径与脚本不一致'}`,
    );
    expect(land, '没收窄到横幅 ⇒ 抽到竖幅时板会被撑成竖条（站主：「只要横着的」）').toBe(true);
    expect(pick, '没有随机抽片（站主：「每次打开随机出现一张照片」）').toBe(true);
    expect(hoverLand, '悬停换片没挡竖幅 ⇒ 板里会出现一张被裁过的竖幅，破坏"不裁不拉伸"').toBe(true);
    expect(persist, '没处理 bfcache 恢复 ⇒「每次打开随机一张」在"从文章返回相册"时不成立').toBe(true);
    expect(seedGrid && seed, 'SSR 占位没按 800 档判横竖 ⇒ 与脚本端口径不一致（会露出一个对不上的分母）').toBe(true);
  });

  it('板的尺寸 = 照片原比例，且不再是满宽条', () => {
    const setsAr = /setProperty\(\s*'--bath-ar'\s*,/.test(CODE);
    const usesAr = /aspect-ratio:\s*var\(--bath-ar/.test(ASTRO);
    const noBleed = !/margin-inline:\s*calc\(50%\s*-\s*50vw\)/.test(ASTRO);
    const noVw = !/\bwidth:\s*100vw/.test(ASTRO);
    console.log(
      `判据 尺寸 实测: ${setsAr ? '脚本按照片 w/h 设 --bath-ar ✓' : '⚠️ 没设比例'} · `
      + `${usesAr ? '板高走 aspect-ratio ✓' : '⚠️ 板高没走照片比例'} · `
      + `${noBleed ? '已不是满宽条 ✓' : '⚠️ 还有满宽 margin-inline（站主要的是"小一点放在旁边"）'} · `
      + `${noVw ? '没有 width:100vw ✓' : '⚠️ 用了 width:100vw（含滚动条宽度 ⇒ 会溢出）'}`,
    );
    expect(setsAr, '没按照片 w/h 设比例 ⇒ 照片会被裁（站主：「尺寸就用照片的原尺寸」）').toBe(true);
    expect(usesAr, '板高不是由照片比例决定 ⇒ 又回到固定高度的裁切板').toBe(true);
    expect(noBleed, '板还是满宽条 —— 站主要的是页头旁边的小板').toBe(true);
    expect(noVw, 'width:100vw 含滚动条宽度 ⇒ 横向溢出').toBe(true);
  });
});
