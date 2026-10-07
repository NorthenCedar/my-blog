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
 *   · 板上有**手写花体的站名**（DOM 层，不在 canvas 里 ⇒ 擦痕擦不掉）+ **胶片颗粒**
 *     （CSS 层，不进 canvas ⇒ 不给形状掺随机源）。
 *
 * ★★★ 同日第五轮（站主：「打开相册那个直接顶头，把导航栏什么的直接放在上面，
 *   另外学一下 lowkeytp 是怎么处理鼠标上去的效果，做到和它一样」）：
 *
 *   · 板**顶到页面最顶端**：顶栏改 absolute 浮在板上（它本来就是半透明毛玻璃）。
 *   · 鼠标上去时多一个**跟着手的白圈**（照抄它的 `.pointer-dot`）。
 *   · ★★ 扒它的 JS（`_probe/ref/lr-app.js`）才发现**三处上一版照抄错了**：
 *       ① 笔触半径是 `size*1.35/height` = 板高的 **0.15375**，
 *          不是我推的"短边 0.057"（**小了 2.7 倍** —— 旋钮 82 不是像素，还要 ×1.35）；
 *       ② 跟随是**一阶指数平滑** `1−e^(−t·18)`，不是二阶弹簧（后者 ζ<1 会过冲）；
 *       ③ 形状只有两个 sin（5 瓣 + 9 瓣），不是两层 fbm 噪声。
 *   ⇒ 判据因此**整体换了一批**：钉"照抄了参考站原文"，不再钉上一版那些自推的数。
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
/* ★★ 2026-10-07：素材池的**标记**搬去了 `src/components/AlbumRow.astro`（相册入口条）。
   原因：砖墙离开 `/gallery`（一册一页），这一页的 `<figure>` 只剩入口条里的那些。
   脚本那一侧的契约因此从 `.wf figure` 换成更中性的 `[data-bath-src] figure`。
   ★ 这条断言守的是"网格图挂的 width/height 必须是 800 档" ⇒ 它要看的是**产 figure 的那个文件**，
     也就是这一个 —— 不能继续读 index.astro（那里已经一个 figure 都没有了，
     换个读法就会变成"断言恒假"或"恒真"的假红/假绿）。 */
const ROW = readFileSync('src/components/AlbumRow.astro', 'utf8');
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
    const absT = /\bT\s*=\s*t\s*\/\s*1000/.test(CODE);
    const accum = /\bT\s*\+=/.test(CODE);
    console.log(
      `判据 时间基准 实测: ${absT ? 'T = t / 1000（绝对值，秒）✓' : '⚠️ 相位不是由 t 直接算'} · `
      + `${accum ? '⚠️ 相位在累加' : '无累加 ✓'}`,
    );
    expect(absT, '噪声相位不是 t 的绝对函数（改成累加 ⇒ 观感随帧率变、跨加载不可比）').toBe(true);
    expect(accum, '噪声相位在"每帧累加" —— 30 Hz 屏上会慢一倍').toBe(false);
  });

  it('★ 指针的影响是局部的：笔触只算包围盒，速度按高斯核拖曳场', () => {
    /* ★★ 参考站**没有**"把边界推开"这回事（上一版本站自己加的 R_INF_K / PUSH_K，
       第六轮照抄它时一并删了）：它让指针参与的方式是
       `flow += velocity * vec2(aspect,1.) * influence * .18` —— 指针**速度**把场沿运动
       方向拖走，影响范围是一个**高斯核**（`influence = exp(-r²/(radius²*4))`）。 */
    const bbox = /let\s+i0\s*=\s*Math\.floor\(\(pu\s*-\s*rx\)\s*\*\s*FW\)/.test(CODE);
    const gauss = /infl\s*=\s*Math\.exp\(-\(ox\s*\*\s*ox\s*\+\s*oy\s*\*\s*oy\)\s*\/\s*Math\.max\(radius\s*\*\s*radius\s*\*\s*INF_K/.test(CODE);
    const drag = /FLX\[k\]\s*=\s*a\s*\*\s*FLOW_A\s*\+\s*vx\s*\*\s*aspect\s*\*\s*infl\s*\*\s*VEL_K/.test(CODE);
    const clamp = /Math\.max\(-VEL_MAX,\s*Math\.min\(VEL_MAX/.test(CODE);
    /* ★ 速度取自**平滑后**笔触中心的实际位移（参考站原文 `(point − 旧point)/dt`），
       不是指针本身 ⇒ 拖曳与"被拽着走"的滞后是同一个来源。 */
    const fromPoint = /vx\s*=\s*Math\.max\(-VEL_MAX[\s\S]{0,120}?\(cx\s*-\s*pcx\)\s*\/\s*W\s*\/\s*ds/.test(CODE);
    const offBoard = /addEventListener\('pointerleave'[\s\S]{0,120}?pwT\s*=\s*0/.test(CODE);
    const velK = num('VEL_K');
    const infK = num('INF_K');
    console.log(
      `判据 局部影响 实测: ${bbox ? '笔触只算指针周围的包围盒 ✓' : '⚠️ 整版都算（且不是局部）'} · `
      + `${gauss ? '影响是高斯核 ✓' : '⚠️ 没有距离衰减'} · `
      + `${drag ? '速度把场拖走 ✓' : '⚠️ 指针没参与流场'} · `
      + `${clamp && fromPoint ? '速度取自平滑后的笔触中心、clamp ±2 ✓' : '⚠️ 速度口径不对'} · `
      + `${offBoard ? '指针离开即收回 ✓' : '⚠️ 缺"指针无效"的路'} · `
      + `VEL_K=${velK} INF_K=${infK}`,
    );
    expect(bbox, '笔触整版都算 ⇒ 既慢（atan2+2×sin 每像素）又不再是"指针周围"这一口径').toBe(true);
    expect(gauss, '指针影响没有按距离衰减 ⇒ 整块一起动，读作充气而不是被搅动').toBe(true);
    expect(drag, '指针速度没有进流场 ⇒ 快速划过时没有"被拽出去"的拖尾').toBe(true);
    expect(clamp && fromPoint, '速度不是"平滑后笔触中心的实际位移/真实 dt，clamp ±2" ⇒ 甩一下会拖爆').toBe(true);
    expect(offBoard, '指针离开后没把强度归零 ⇒ 笔触会赖在板上不收（违反"纯色"口径）').toBe(true);
    expect(velK > 0.05 && velK < 0.5, `VEL_K=${velK} 越界（参考站 velocity*influence*.18）`).toBe(true);
    expect(infK >= 2 && infK <= 8, `INF_K=${infK} 越界（参考站 radius*radius*4 ⇒ 高斯核 ≈ 笔触大小）`).toBe(true);
    /* ★ RADIUS_K 的区间是**照抄参考站反推的硬区间**：82 × 1.35 / 720 = 0.15375。
       上一版误把旋钮 82 当成直径、推成短边的 0.057 ⇒ 比参考站小 2.7 倍（扒它的 JS 才发现）。
       区间取 0.12~0.20：既不会退回上一版那个 0.057，也不会大过半屏。 */
    const rHole = num('RADIUS_K');
    console.log(`判据 局部影响 实测: RADIUS_K=${rHole}`);
    expect(rHole > 0.12 && rHole < 0.2, `RADIUS_K=${rHole} 越界（参考站 82×1.35/720 ⇒ 板高的 0.15375）`).toBe(true);
  });

  it('平滑与跟随都帧率无关：1−e^(−dt/τ) + 跟随吃真实 dt', () => {
    /* ★★ 跟随这一项在第五轮**换了实现**：原来是二阶弹簧（LAG_W/LAG_Z + cvx/cvy），
       现在照抄参考站改成一阶指数平滑 `1 − e^(−ds·FOLLOW_K)`。
       ⇒ 判据要钉的是"吃真实 dt 的指数平滑"，**不再**钉半隐式欧拉那两个式子。 */
    const expo = /Math\.exp\(\s*-dt\s*\/\s*tau\s*\)/.test(CODE);
    const follow = /1\s*-\s*Math\.exp\(\s*-ds\s*\*\s*FOLLOW_K\s*\)/.test(CODE);
    const followEats = /cx\s*\+=\s*\(\s*mx\s*-\s*cx\s*\)\s*\*\s*kf/.test(CODE)
      && /cy\s*\+=\s*\(\s*my\s*-\s*cy\s*\)\s*\*\s*kf/.test(CODE);
    const perFrame = /pw\s*\*=\s*[\d.]+/.test(CODE);
    const dtCap = /Math\.min\(DT_MAX,\s*Math\.max\(0,\s*now\s*-\s*last\)\)/.test(CODE);
    console.log(
      `判据 帧率无关 实测: ${expo ? '1 − e^(−dt/τ) ✓' : '⚠️ 不是指数平滑'} · `
      + `${follow && followEats ? '跟随吃真实 dt ✓' : '⚠️ 跟随没吃真实 dt'} · `
      + `${perFrame ? '⚠️ 还有每帧固定系数' : '无每帧固定系数 ✓'} · `
      + `${dtCap ? 'dt 取自 rAF 真实间隔并设上限 ✓' : '⚠️ 没接真实 dt / 没上限'}`,
    );
    expect(expo, '指针强度用"每帧乘固定系数"平滑 ⇒ 时间常数随刷新率变').toBe(true);
    expect(follow && followEats, '跟随没吃真实 dt ⇒ 笔触跟随的快慢取决于显示器刷新率').toBe(true);
    expect(perFrame, '还有每帧固定系数（*= 常数）：这一条在流场弹簧上已经栽过一次').toBe(false);
    expect(dtCap, 'dt 没从 rAF 真实间隔算 / 没有上限（切标签回来会跳变）').toBe(true);
  });

  it('★ 没有指针（且擦痕褪尽）= 一块纯色：不画洞、不自己漫、不自己换片', () => {
    const clears = /ctx\.clearRect\(0,\s*0,\s*W,\s*H\)/.test(CODE);
    /* ★ DEAD = REV0 − EDGE_A/2：场峰值低于它 ⇒ 无论 edge 噪声怎么抖都不可能再显 */
    const gate = /if\s*\(\s*peak\s*<=\s*DEAD\s*\)/.test(CODE);
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

  it('笔触跟着指针走：进板即落点，之后一阶指数平滑跟随（照抄参考站）', () => {
    const snap = /if\s*\(\s*pw\s*<=\s*PW_EPS\s*\)\s*\{\s*cx\s*=\s*mx;\s*cy\s*=\s*my/.test(CODE);
    /* ★ 参考站引擎原文：`const n = 1 - Math.exp(-t * 18); point += (target - point) * n`
       ⇒ 本站是 FOLLOW_K = 18（1/秒）。★ 单位是**秒** ⇒ 必须乘 ds 不是 dt（毫秒）。 */
    const follow = num('FOLLOW_K');
    const expForm = /1\s*-\s*Math\.exp\(\s*-ds\s*\*\s*FOLLOW_K\s*\)/.test(CODE);
    const noSpring = !/LAG_W/.test(CODE) && !/cvx/.test(CODE);
    console.log(
      `判据 跟随 实测: ${snap ? '刚进板笔触落在指针上 ✓' : '⚠️ 笔触会从上一处飞过来'} · `
      + `${expForm ? `一阶指数平滑 FOLLOW_K=${follow} ✓` : '⚠️ 跟随不是 1−e^(−ds·FOLLOW_K)'} · `
      + `${noSpring ? '无二阶弹簧残留 ✓' : '⚠️ 还留着 LAG_W/cvx（过冲会读成"笔尖抖一下"）'}`,
    );
    expect(snap, '笔触不落到指针上 ⇒ 指针刚进板时痕迹出现在上一处位置（读成 bug）').toBe(true);
    expect(expForm && follow > 8 && follow < 40, '跟随不是照抄参考站的一阶指数平滑（18/s）').toBe(true);
    expect(noSpring, '还留着二阶弹簧 ⇒ ζ<1 的过冲在涂抹时会读成"笔尖抖一下"').toBe(true);
  });

  it('★ 擦痕被流场输运 —— 边缘一直在动（站主「像水一样」的第一因）', () => {
    /* ★★ 参考站 sim shader 的原文（第六轮扒出来的）：
             vec2 flow = vec2(a, -b) * .5;            // curl noise：无散度 ⇒ 像水流
             vec2 sampleUv = uv - flow * motion / vec2(aspect,1.) * dt;
             density = texture2D(field, clamp(sampleUv,0.,1.)).r;   // ★ 半拉格朗日回溯
       ⇒ **擦痕不是盖上去就冻住，而是每帧被水流推着走**。上一版就是漏了这一行，
         所以站主读到的是"抹出来一块、然后整块淡掉"，不是"水"。 */
    const curl = /const\s+a\s*=\s*vn2\(nx,\s*ny\s*\+\s*FLOW_EP\)\s*-\s*vn2\(nx,\s*ny\s*-\s*FLOW_EP\)/.test(CODE);
    const curlY = /const\s+b\s*=\s*vn2\(nx\s*\+\s*FLOW_EP,\s*ny\)\s*-\s*vn2\(nx\s*-\s*FLOW_EP,\s*ny\)/.test(CODE);
    const back = /let\s+su\s*=\s*u\s*-\s*samp\(FLX,\s*FW2,\s*FH2,\s*u,\s*v\)\s*\*\s*invA\s*\*\s*ds/.test(CODE);
    const advect = /samp\(FD,\s*FW,\s*FH,\s*su,\s*sv\)/.test(CODE);
    /* ★ 输运要读上一帧的场 ⇒ 必须 ping-pong 两张，原地改会把流场写成" smear " */
    const pingpong = /FD\s*=\s*FD2;[\s\S]{0,40}?FD2\s*=\s*tmpD/.test(CODE);
    console.log(
      `判据 输运 实测: ${curl && curlY ? 'curl noise（中心差分 ⇒ 无散度）✓' : '⚠️ 流场不是 curl noise'} · `
      + `${back && advect ? '半拉格朗日回溯 ✓' : '⚠️ 没有输运（擦痕会冻住）'} · `
      + `${pingpong ? '双缓冲 ping-pong ✓' : '⚠️ 原地改场（输运会变成 smear）'}`,
    );
    expect(curl && curlY, '流场不是 curl noise ⇒ 到处是"源"和"汇"，画面会被推散而不是流动').toBe(true);
    expect(back && advect, '场没有被输运 ⇒ 擦痕盖上去就冻住，边缘不会动（"像水一样"全靠这一行）').toBe(true);
    expect(pingpong, '输运没有双缓冲 ⇒ 原地读写同一个场，拖影会被自己抹开').toBe(true);
  });

  it('★ 擦痕会停留一段时间、沿路径退回、再回到纯色（站主：「过一到两秒就跟着路径回来了」）', () => {
    const life = num('LIFE');
    /* ★★ 参考站是**线性**衰减（`density = max(0, density - dt/life)`），不是本站上一版
       那个乘性 `× e^(−dt/τ)`。
       线性 + 极窄阈值 ⇒ 退去时是**等值线向内收缩**（边缘先消失），不是整块一起淡
       ⇒ 这才是"跟着路径回来"的观感。上一版用乘性衰减 + 软边渐变，正好把它抹平了。
       ★ 顺带解决了上一版那个 8 位 alpha 的衰减下限（α 卡在 42 的鬼影）：
         Float32 线性减到 0 就是 0，蒙版不必再平方。 */
    const linear = /const\s+decay\s*=\s*ds\s*\/\s*LIFE/.test(CODE);
    const sub = /samp\(FD,\s*FW,\s*FH,\s*su,\s*sv\)\s*-\s*decay/.test(CODE);
    const clamp0 = /if\s*\(\s*d\s*<\s*0\s*\)\s*d\s*=\s*0/.test(CODE);
    /* ★ 阈值带只有 0.025 ⇒ 边界是**硬**的；"破碎的水渍边"由 display 那层 fbm 给 */
    const rev0 = num('REV0'), rev1 = num('REV1');
    /* ★ 第七轮起阈值不再逐像素算 alpha，而是**等值线的硬阈值** `TH = (REV0+REV1)/2`；
       那 0.025 的软过渡由 canvas 抗锯齿给出（实测过渡带 0.83 px，见 cdp-bath-edge.mjs）。 */
    const thresh = /const\s+TH\s*=\s*\(REV0\s*\+\s*REV1\)\s*\*\s*0\.5/.test(CODE) && /v0\s*>\s*TH/.test(CODE);
    const narrow = rev1 - rev0;
    const masked = /globalCompositeOperation\s*=\s*'destination-in'/.test(CODE);
    /* ★ 停帧必须**连场一起清**：擦痕是累积的，只清主画布 ⇒ 下次进来带着上次的痕 */
    const stopField = /const\s+stop\s*=\s*\(\)[\s\S]{0,700}?FD\.fill\(0\)/.test(CODE);
    /* ★ 指针离开后不能立刻停帧，否则擦痕冻在最后一帧、永远不会褪（正是这条要求的反面） */
    const keepWhile = /peak\s*>\s*DEAD/.test(CODE);
    const visibleS = (1 - rev0) * life;   // density 从 1 降到阈值下沿所需的时间
    console.log(
      `判据 擦痕停留 实测: LIFE=${life}s ⇒ 从满到看不见约 ${visibleS.toFixed(2)} s · `
      + `${linear && sub ? '线性衰减（−dt/life）✓' : '⚠️ 衰减不是线性'} · `
      + `${clamp0 ? '夹到 0 ✓' : '⚠️ 会变负'} · `
      + `${thresh ? `硬阈值 ${rev0}~${rev1}（带宽 ${narrow.toFixed(3)}）✓` : '⚠️ 阈值不是参考站那一条'} · `
      + `${masked ? '照片按蒙版抠出 ✓' : '⚠️ 没按蒙版抠图（擦痕不会显影）'} · `
      + `${stopField ? '停帧连场一起清 ✓' : '⚠️ 停帧只清主画布，擦痕会残留到下次'} · `
      + `${keepWhile ? '指针走了还继续画到褪尽 ✓' : '⚠️ 指针一走就停帧，擦痕会冻住'}`,
    );
    expect(linear && sub && clamp0, '衰减不是"线性 −dt/life 且夹到 0" ⇒ 要么褪不尽，要么会变负').toBe(true);
    expect(life >= 1 && life <= 4, `LIFE=${life}s 越界（参考站旋钮「显影停留时间」默认 2.8）`).toBe(true);
    expect(visibleS >= 0.9 && visibleS <= 3.2, `可见时长 ${visibleS.toFixed(2)}s 越界（站主：「一到两秒」）`).toBe(true);
    expect(thresh && narrow > 0 && narrow <= 0.05,
      `阈值带宽 ${narrow.toFixed(3)} ⇒ 边是软的，读成"整块一起淡"而不是"水退回去"`).toBe(true);
    expect(masked, '没有按蒙版抠图 ⇒ 擦痕不会显影').toBe(true);
    expect(stopField, '停帧没清场 ⇒ 擦痕累积，下次进板会带着上一次没褪完的痕').toBe(true);
    expect(keepWhile, '指针一离开就停帧 ⇒ 擦痕冻在最后一帧，永远褪不回纯色').toBe(true);
  });

  it('★ display 照抄参考站：域扭曲采样 + edge 扰动 + 只算可能显影的块', () => {
    /* 它的原文：
         vec2 q  = vec2(fbm(p*7 + vec2(time*.28,0)), fbm(p*7 + vec2(8,-time*.22))) - .5;
         vec2 at = clamp(uv + q*.055*motion/vec2(aspect,1.), 0., 1.);
         float edge = fbm(p*22. + q*3. + time*.12);
       ⇒ 采样点被一个**低频**噪声推歪（整个边界跟着扭），边缘再叠一层**高频**噪声（破碎）。 */
    const q = /QX\[k\]\s*=\s*fbm3\(x7\s*\+\s*T\s*\*\s*Q_SPD,\s*y7\)\s*-\s*0\.5/.test(CODE);
    const warp = /let\s+au\s*=\s*u\s*\+\s*qx\s*\*\s*Q_A\s*\*\s*invA/.test(CODE);
    const edge = /fbm3\(u\s*\*\s*aspect\s*\*\s*EDGE_F\s*\+\s*qx\s*\*\s*3\s*\+\s*T\s*\*\s*EDGE_SPD/.test(CODE);
    const fbmW = /vn2\(x,\s*y\)\s*\*\s*0\.57\s*\+\s*vn2\(x\s*\*\s*2\.03,\s*y\s*\*\s*2\.03\)\s*\*\s*0\.28\s*\+\s*vn2\(x\s*\*\s*4\.01,\s*y\s*\*\s*4\.01\)\s*\*\s*0\.15/.test(CODE);
    /* ★ 边缘那层 fbm（p*22，三个八度）是全场最贵的一步 ⇒ 块峰值 < DEAD 就整块跳过。
       不跳的话 320×225 的场要 20+ ms/帧（实测 bench-field.mjs），跳完 9.1 ms。 */
    const skip = /if\s*\(\s*PEAK\[[^\]]+\]\s*<\s*DEAD\s*\)\s*\{\s*DD\[k\]\s*=\s*0;\s*continue;\s*\}/.test(CODE);
    /* ★★ 第七轮：edge 那层 fbm 从\"每格一次\"搬到\"每个**顶点**一次\" ——
       格有 7 万个、顶点只有几百到几千个 ⇒ 这是能不能把边界做成矢量的前提。
       判据：脚本里不再出现 createImageData / putImageData（= 不再有逐格位图蒙版）。 */
    const noBmp = !/createImageData|putImageData/.test(CODE);
    console.log(
      `判据 display 实测: ${q && warp ? '域扭曲采样 ✓' : '⚠️ 没有域扭曲'} · `
      + `${edge ? 'edge 高频扰动 ✓' : '⚠️ 没有 edge 扰动（边界会是规整的）'} · `
      + `${fbmW ? 'fbm 权重 .57/.28/.15 ✓' : '⚠️ fbm 权重不是参考站那三个'} · `
      + `${skip ? '空块跳过 edge ✓' : '⚠️ 整版都算 edge（跑不满 60fps）'}`,
      + `${noBmp ? 'edge 只在顶点上算（不再逐格写位图）✓' : '⚠️ 还在逐格写位图蒙版'}`,
    );
    expect(q && warp, '没有域扭曲 ⇒ 边界不会跟着扭，"水"的观感少一半').toBe(true);
    expect(edge, '没有 edge 扰动 ⇒ 边界是规整的圆，不像水渍').toBe(true);
    expect(fbmW, 'fbm 权重不是 .57/.28/.15 ⇒ 与参考站的噪声形态不一致').toBe(true);
    expect(skip, '空块不跳过 ⇒ 整版都算三层 fbm，实测跑不满 60fps').toBe(true);
    expect(noBmp, '还在逐格写位图蒙版 ⇒ 边界又被钉在场分辨率上（站主：「分辨率好低」）').toBe(true);
  });
  it('★★ 边缘是**矢量等值线**，不是放大的位图（站主：「边缘好粗糙，分辨率好低」）', () => {
    /* ★★ 根因（扒参考站 shader 才看清）：它的 display 是**逐屏幕像素**跑的
         （`vec2 p = uv*vec2(aspect,1.)`，阈值带 `smoothstep(.19,.215,…)` 也在屏幕像素上）
         ⇒ 只有 `d` 是从 512 的低分辨率场双线性采样的，高频细节是屏幕分辨率的。
       上一版本站把整段 display（**含**决定"破碎水渍边"的 edge fbm）都跑在 320 的场上、
       再 `drawImage` 放大 4× ⇒ 又糊又有块（实测过渡带 **2.97 px**、最大转角 68.5°）。
       ⇒ 现在：场照旧低分辨率，边界改成矢量 —— 实测过渡带 **0.83 px**、转角 10.3°。
       ★★ 注意**不是**靠提高场分辨率解决的：实测 512×360 要 37 ms/帧（27 fps），
          而把场从 1/4 提到 1/3（320→426）本地就已经掉到 29 fps。 */
    /* ① marching squares（含两个鞍点 case —— 漏了会在对角处撕开一个口子） */
    const ms = /let\s+st\s*=\s*0;/.test(CODE) && /st\s*\|=\s*8/.test(CODE)
      && /case\s+5:/.test(CODE) && /case\s+10:/.test(CODE);
    /* ② 亚像素插值 —— "不再是 4 px 台阶"的来源 */
    const sub = /EX\[eid\]\s*=\s*i\s*\+\s*\(TH\s*-\s*a\)\s*\/\s*\(b\s*-\s*a\)/.test(CODE);
    /* ③ 段串成环（每条边属于恰好两段 ⇒ 2-正则 ⇒ 一定是环） */
    const ring = /E2A\[exit\]\s*===\s*s\s*\?\s*E2B\[exit\]\s*:\s*E2A\[exit\]/.test(CODE);
    /* ④ 外圈强制 0 ⇒ 等值线一定闭合（开放路径没法 fill） */
    const closed = /if\s*\(\s*rim\s*\|\|\s*i\s*===\s*0\s*\|\|\s*i\s*===\s*FM\s*\)\s*\{\s*DD\[k\]\s*=\s*0/.test(CODE);
    /* ⑤ 顶点位移**照抄参考站的阈值扰动**：δ = −Δ·∇d/|∇d|²（不是"直接乘一个常数"） */
    const norm = /const\s+f\s*=\s*-dlt\s*\/\s*g2/.test(CODE);
    const clamp = /if\s*\(\s*len\s*>\s*EDGE_MAX_PX\s*\)/.test(CODE);
    /* ⑥ 填充：二次曲线过中点（C1）+ evenodd（绕向无关地挖洞） */
    const curve = /ctx\.quadraticCurveTo\(RX\[p\],\s*RY\[p\],\s*\(RX\[p\]\s*\+\s*RX\[q\]\)\s*\/\s*2/.test(CODE);
    const evenodd = /ctx\.fill\('evenodd'\)/.test(CODE);
    console.log(
      `判据 矢量轮廓 实测: ${ms ? 'marching squares（含鞍点）✓' : '⚠️ 没有等值线提取'} · `
      + `${sub ? '亚像素插值 ✓' : '⚠️ 顶点落在整格上（会有 4 px 台阶）'} · `
      + `${ring ? '段串成环 ✓' : '⚠️ 没把段连起来（fill 不了）'} · `
      + `${closed ? '外圈置 0 保证闭合 ✓' : '⚠️ 环可能开放（fill 会横穿画面）'} · `
      + `${norm ? '位移 = −Δ·∇d/|∇d|² ✓' : '⚠️ 位移不是照抄参考站的阈值扰动'} · `
      + `${clamp ? '位移有上限 ✓' : '⚠️ 场一平位移就爆炸'} · `
      + `${curve ? '二次曲线平滑 ✓' : '⚠️ 直连（有折角）'} · `
      + `${evenodd ? 'evenodd 填充 ✓' : '⚠️ 没用 evenodd（洞可能挖不出来）'}`,
    );
    expect(ms, '没有等值线提取 ⇒ 边界只能是位图放大（又糊又有块）').toBe(true);
    expect(sub, '顶点没有亚像素插值 ⇒ 边缘是 4 px 的台阶（站主：「分辨率好低」）').toBe(true);
    expect(ring, '段没串成环 ⇒ 填充会退化成一堆独立线段').toBe(true);
    expect(closed, '不保证环闭合 ⇒ 开放路径 fill 时会横穿画面').toBe(true);
    expect(norm && clamp, '顶点位移不是"−Δ·∇d/|∇d|² 且带上限" ⇒ 与参考站的破碎边不一致/会爆炸').toBe(true);
    expect(curve, '轮廓直连 ⇒ 4 px 间距上有折角（站主：「边缘好粗糙」）').toBe(true);
    expect(evenodd, '不用 evenodd ⇒ 内环挖不成洞（marching squares 的绕向不保证一致）').toBe(true);
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
    /* ★ 判据里**必须带上场峰值 peak**：擦痕还在褪的时候要继续跑（否则冻在最后一帧） */
    const idle = /const\s+want\s*=\s*onScreen[\s\S]{0,220}?\(\s*pwT\s*>\s*0\s*\|\|\s*pw\s*>\s*PW_EPS\s*\|\|\s*peak\s*>\s*DEAD\s*\)/.test(CODE);
    console.log(
      `判据 停帧 实测: ${io ? 'IntersectionObserver ✓' : '⚠️ 没有'} · `
      + `${vis ? '切标签停帧 ✓' : '⚠️ 没处理 visibilitychange'} · `
      + `${idle ? '没指针且擦痕褪尽才停 ✓' : '⚠️ 要么没指针还在空跑、要么擦痕会被冻住'}`,
    );
    expect(io, '没有 IntersectionObserver ⇒ 滚到网格里还在每帧算噪声（整屏下这是白烧电）').toBe(true);
    expect(vis, '切到别的标签页后仍在跑 rAF').toBe(true);
    expect(idle, '停帧判据没带上擦痕 ⇒ 要么没指针还在空转，要么擦痕被冻在最后一帧褪不掉').toBe(true);
  });

  it('与页面互动：划过素材池里任意一张 ⇒ 板里换成那一张', () => {
    /* ★★ 2026-10-07：选择器从 `.wf figure`（砖墙）换成 `[data-bath-src] figure`（相册入口条）——
       砖墙搬去相册页了，本页没有它。判据的**语义没变**：脚本必须订阅页面上的照片，
       划过就换片。 */
    const binds = /querySelectorAll<HTMLElement>\('\[data-bath-src\] figure'\)/.test(CODE);
    /* ★★ 素材池有**两条**取片路：`collect()`（打开时随机抽 / bfcache 重抽）与**悬停换片**。
       两条都走同一个钩子才算数。2026-10-07 的变异验证抓到过这个漏：
       只钉悬停那条时，把 `collect()` 改回 `.wf figure` 是**静默通过**的
       （表现是"打开相册没有底图、划过才出来" —— 一眼看去像"随机没生效"）。 */
    const collects = /querySelectorAll<HTMLElement>\('\[data-bath-src\] figure:not\(\[hidden\]\)'\)/.test(CODE);
    /* ★ 图源必须走**网格档（800）**：`im.getAttribute('src')`。
       走灯箱档（`a.frame` 的 href，1280）时单张能到 486 KB，线上实测 842 ms 才到、
       更重的要好几秒 ⇒ 那几秒里指针搅不出任何东西（板是纯色，画不出来）。 */
    const reads = /\.getAttribute\('src'\)/.test(CODE);
    const noBigTier = !/getAttribute\('href'\)/.test(CODE);
    /* ★ 换片的落点：show() 真的把新图挂上（nxt + mix 归零 ⇒ 交叉淡入） */
    const swaps = /const\s+show\s*=\s*\([\s\S]{0,220}?mix\s*=\s*0/.test(CODE);
    console.log(
      `判据 页面互动 实测: ${binds ? '订阅 [data-bath-src] figure ✓' : '⚠️ 没订阅'} · `
      + `${collects ? 'collect() 也走同一钩子 ✓' : '⚠️ 只有悬停那条换了，collect() 还在旧钩子上'} · `
      + `${reads ? '取网格档 img 的 src ✓' : '⚠️ 没取图源'} · `
      + `${noBigTier ? '没走灯箱档（1280）✓' : '⚠️ 在拿 a.frame 的 href'} · `
      + `${swaps ? '划过就交叉淡入换片 ✓' : '⚠️ 划过不换片'}`,
    );
    expect(binds, '没有把页面上的照片接进来（站主的核心诉求：底下的影要能和那页互动）').toBe(true);
    expect(collects, 'collect() 没走同一个素材池钩子 ⇒「每次打开随机一张」会静默失灵').toBe(true);
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
    const gridTier = /const\s+g\s*=\s*at\(f,\s*GRID_W\)/.test(ROW);
    const whAttrs = /width=\{g\.w\}\s+height=\{g\.h\}/.test(ROW);
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
    /* ★★ 第五轮：站主「打开相册那个直接顶头」⇒ 顶栏改成 absolute 浮在板上，
       板自己就是纯 `100svh`（**不再**减顶栏高度）。 */
    const svh = /height:\s*100svh/.test(ACSS);
    const noVw = !/\bwidth:\s*100vw/.test(ACSS);
    /* ★★ 还有第二个 48px：板在 `.shell` 里，`.shell` 有 `padding: var(--sp-7) …`（3rem）
       ⇒ 光把顶栏浮起来，板仍被推到 y=48（实测过，别再只改一半）。
          正解是给板一个**负 margin-top 抵消**（不去改共用的 `.shell`）；
          ★ 手机档必须撤掉它 —— 那边板是页头里的小板，负 margin 会让它骑到页头上边。 */
    const negTop = /\.bath\s*\{[^}]*margin-top:\s*calc\(-1\s*\*\s*var\(--sp-7\)\)/.test(ACSS);
    const mNegZero = /@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.bath\s*\{[^}]*margin-top:\s*0/.test(ACSS);
    /* ★ 顶栏浮层：必须是 absolute（不是 fixed —— fixed 会一直跟着滚，本站内页顶栏是滚走的），
       且**包在 min-width:768px 里**（手机档是页头旁边的小板，顶栏要回到普通文档流）。 */
    /* ★ 本页是 scoped style ⇒ 选择器写成 `:global(body.chrome-page .topbar.topbar)`
       ⇒ 正则里 `.topbar.topbar` 后面是 `)` 而不是 `{`，别漏了这一个字符。 */
    const tbAbs = /@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?\.topbar\.topbar\s*\)\s*\{[^}]*position:\s*absolute/.test(ACSS);
    const tbZ = /\.topbar\.topbar\s*\)\s*\{[^}]*z-index:\s*30/.test(ACSS);
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
    /* ★ 笔触在**小板**上要另算一档：整屏那档（板高的 0.15375）搬到 160px 小板上只有 25 px */
    const small = /RADIUS_SMALL_K\s*=\s*0\.19/.test(CODE) && /RB\s*=\s*Math\.min\(W,\s*H\)\s*<\s*SMALL_PLATE/.test(CODE);
    /* ★★ 半径必须按**板高 H**算（参考站是 `size*1.35/height`），不是短边、不是 min(W,H)。
       本站两种版面都是横的（H 就是短边）⇒ 现在两者相等，但**写法**必须钉住：
       哪天板变成竖的，按短边算就会跟参考站差一个宽高比。 */
    /* ★★ 半径的单位必须是**板高**（参考站 `size*1.35/height`）：场是 uv 空间的，
       `off = (uv − pointer) * vec2(aspect, 1)` ⇒ |off| 的单位就是"板高的比例"
       ⇒ 半径直接取 RB（= RADIUS_K = 0.15375），**不要再乘一次 H**（乘了就是平方量纲）。 */
    const byHeight = /const\s+radius\s*=\s*RB;/.test(CODE)
      && /const\s+ox\s*=\s*\(u\s*-\s*pu\)\s*\*\s*aspect/.test(CODE);
    console.log(
      `判据 整屏 实测: ${bleed ? '逃出 .shell 铺满宽 ✓' : '⚠️ 没有满宽手法（会被 .shell 框窄）'} · `
      + `${svh ? '高 = 100svh（顶到页面最顶端）✓' : '⚠️ 高度不是一屏'} · `
      + `${tbAbs && tbZ ? '顶栏 absolute 浮在板上 ✓' : '⚠️ 顶栏没浮起来（板顶不到头）'} · `
      + `${negTop ? '负 margin 抵消 .shell 内边距 ✓' : '⚠️ 没抵消 .shell 的 48px（板仍被推到 y=48）'} · `
      + `${mNegZero ? '手机档撤掉负 margin ✓' : '⚠️ 手机档还留着负 margin（板会骑到页头上）'} · `
      + `${noVw ? '没有 width:100vw ✓' : '⚠️ 用了 width:100vw（含滚动条宽度 ⇒ 会溢出）'} · `
      + `${firstChild ? '是页头第一个子元素 ✓' : '⚠️ 不在页头最前（首屏不是它）'} · `
      + `${noPadTop ? '页头上内边距清零 ✓' : '⚠️ 首屏顶上留了一条空'} · `
      + `${mq && mOrder && mAr && mW && mNoShrink ? '手机档回到页头旁的小板 ✓' : '⚠️ 手机档没回到小板'} · `
      + `${small ? '小板另算一档笔触 ✓' : '⚠️ 小板沿用了整屏的笔触（25px，手指擦不动）'} · `
      + `${byHeight ? '半径按板高算 ✓' : '⚠️ 半径不是按板高（参考站是 size*1.35/height）'}`,
    );
    expect(bleed, '没有满宽手法 ⇒ 整屏会被 .shell 框成"中间一块"（首页 .band 踩过同一处）').toBe(true);
    expect(svh, '高度不是 100svh ⇒ 板没顶到页面最顶端（站主：「直接顶头」）').toBe(true);
    expect(tbAbs && tbZ, '顶栏没有 absolute 浮起来 ⇒ 板被顶栏挤下去，不是"顶头"').toBe(true);
    expect(negTop, '没抵消 .shell 的 padding-top（3rem）⇒ 板仍被推到 y=48，顶不到头').toBe(true);
    expect(mNegZero, '手机档还留着负 margin ⇒ 小板会骑到页头上边').toBe(true);
    expect(noVw, 'width:100vw 含滚动条宽度 ⇒ 横向溢出').toBe(true);
    expect(firstChild, '板不是页头第一个子元素 ⇒ 打开相册页先看到标题，不是整屏装置').toBe(true);
    expect(noPadTop, '页头还有上内边距 ⇒ 首屏顶上多一条空白，不是从顶部铺到底').toBe(true);
    expect(mq && mOrder && mAr && mW && mNoShrink, '手机档没回到"页头旁边的小板"（站主：触屏涂抹不习惯）').toBe(true);
    expect(small, '小板沿用整屏的笔触比例 ⇒ 一笔只有 25 px，手指擦不动').toBe(true);
    expect(byHeight, '笔触半径不是按板高算 ⇒ 与参考站 size*1.35/height 的口径不一致').toBe(true);
  });

  it('★ 鼠标上去显示那个跟着手的白圈（照抄参考站 .pointer-dot）', () => {
    /* ★★ 站主 2026-10-01 第五轮：「学一下 lowkeytp 是怎么处理鼠标上去的效果，做到和它一样」。
       参考站的原文（_probe/ref/lr.css + lr-app.js）：
         .pointer-dot{…width:16px;height:16px;border:1px solid #fff;border-radius:50%;
                      pointer-events:none;transform:translate(-50%,-50%);
                      box-shadow:0 0 0 2px #0002;opacity:0}
         .pointer-dot.visible{opacity:1}
         if(!n){ …; l.dot.classList.remove("visible"); return; }
         l.dot.style.left=`${t*100}%`; l.dot.style.top=`${r*100}%`;
         l.dot.classList.add("visible"); */
    const hasEl = /data-bath-dot/.test(ASTRO);
    const dotCss = /\.bath-dot\s*\{[^}]*width:\s*16px[^}]*opacity:\s*0/.test(ACSS);
    const onCss = /\.bath-dot\.on\s*\{[^}]*opacity:\s*1/.test(ACSS);
    /* ★ 圈必须**硬跟手**：加了 transition 就变成"圈也在追"，
       跟滞后的笔触混在一起 ⇒ 反而看不出"被拽着走"。 */
    const noTrans = !/\.bath-dot\s*\{[^}]*transition/.test(ACSS);
    /* ★ 用**百分比**定位（参考站原文就是百分比）⇒ resize 后不用重算。 */
    const pct = /dot\.style\.left\s*=\s*`\$\{\(mx\s*\/\s*W\)\s*\*\s*100\}%`/.test(CODE)
      && /dot\.style\.top\s*=\s*`\$\{\(my\s*\/\s*H\)\s*\*\s*100\}%`/.test(CODE);
    /* ★ 出界必须摘掉：只在 pointerenter/move 加、从不 remove ⇒ 圈会赖在板上不消失。 */
    const add = /dot\.classList\.add\('on'\)/.test(CODE);
    const rmInMark = /dot\.classList\.remove\('on'\)/.test(CODE);
    const rmOnLeave = /pointerleave[\s\S]{0,200}?dot\?\.classList\.remove\('on'\)/.test(CODE);
    console.log(
      `判据 白圈 实测: ${hasEl ? '有 .bath-dot 元素 ✓' : '⚠️ 没有白圈元素'} · `
      + `${dotCss && onCss ? '默认透明 + .on 才显示 ✓' : '⚠️ 显隐不是 opacity 0/1 两态'} · `
      + `${noTrans ? '硬跟手（无 transition）✓' : '⚠️ 圈有 transition（会跟笔触混在一起）'} · `
      + `${pct ? '百分比定位 ✓' : '⚠️ 不是百分比定位'} · `
      + `${add && rmInMark && rmOnLeave ? '出界/离开会摘掉 ✓' : '⚠️ 圈不会消失'}`,
    );
    expect(hasEl, '没有白圈元素 ⇒ 鼠标上去没有任何提示（参考站最显眼的那个特征）').toBe(true);
    expect(dotCss && onCss, '白圈的显隐不是"默认透明 + 加类才显示"⇒ 没指针时也会有一个圈').toBe(true);
    expect(noTrans, '白圈加了 transition ⇒ 它也在追，跟滞后的笔触混在一起就看不出"被拽着走"').toBe(true);
    expect(pct, '白圈不是百分比定位 ⇒ resize 后位置会错（参考站原文就是百分比）').toBe(true);
    expect(add && rmInMark && rmOnLeave, '白圈不会消失 ⇒ 指针移出板后圈赖在最后位置').toBe(true);
  });

  it('★ 笔触形状照抄参考站：irregular（5瓣+9瓣）+ smoothstep(0.45,1.2) 软边', () => {
    /* ★★ 参考站 sim shader 原文（_probe/ref/lr-app.js）：
         float irregular = 1.0 + 0.14*sin(angle*5.0 + time*1.6) + 0.08*sin(angle*9.0 - time*1.1);
         float brush = 1.0 - smoothstep(0.45, 1.2, d);
       ★ time 在它那里是**秒**（引擎 `this.time += dt`）⇒ 本站 t 是毫秒，必须 /1000。 */
    const a5 = num('IRR_A5') === 0.14 && num('IRR_A9') === 0.08;
    const s5 = num('IRR_S5') === 1.6 && num('IRR_S9') === 1.1;
    /* ★ 现在笔触是**逐像素**写进密度场（不再是多边形轮廓），所以瓣数写在 `ang * 5 / ang * 9` 上 */
    const lobes = /IRR_A5\s*\*\s*Math\.sin\(ang\s*\*\s*5\s*\+\s*ir5\)/.test(CODE)
      && /IRR_A9\s*\*\s*Math\.sin\(ang\s*\*\s*9\s*-\s*ir9\)/.test(CODE);
    /* ★ time 必须换算成**秒**：本站 T = t / 1000（参考站引擎里 `this.time += dt`，dt 是秒） */
    const secs = /\bT\s*=\s*t\s*\/\s*1000/.test(CODE) && /const\s+ir5\s*=\s*T\s*\*\s*IRR_S5/.test(CODE);
    /* 软边：实心核心 0.45R、渐隐到 1.2R（smoothstep 的两个沿）
       ★★ 上一版蒙版要平方（绕开 8 位 alpha 的乘性衰减下限）⇒ 存的是 sqrt(brush) 的五点采样；
          这一版场是 Float32 + **线性**衰减，减到 0 就是 0 ⇒ **直接存 brush**，不再平方。 */
    const core = num('CORE_K') === 0.45 && num('FADE_K') === 1.2;
    const brush = /1\s*-\s*sstep\(CORE_K,\s*FADE_K,\s*Math\.sqrt\(ox\s*\*\s*ox\s*\+\s*oy\s*\*\s*oy\)\s*\/\s*\(radius\s*\*\s*irr\)\)/.test(CODE);
    const noSquare = !/addColorStop/.test(CODE);
    console.log(
      `判据 形状照抄 实测: ${a5 ? '幅度 0.14/0.08 ✓' : '⚠️ 幅度不是 0.14/0.08'} · `
      + `${s5 ? '时间系数 1.6/1.1 ✓' : '⚠️ 时间系数不是 1.6/1.1'} · `
      + `${lobes ? '5 瓣 + 9 瓣 ✓' : '⚠️ 不是 5 瓣 + 9 瓣'} · `
      + `${secs ? 'time 换算成秒 ✓' : '⚠️ 没换算成秒（会快 1000 倍，形状抖成一团）'} · `
      + `${core && brush ? '软边 0.45R→1.2R ✓' : '⚠️ 软边不是 smoothstep(0.45,1.2)'} · `
      + `${noSquare ? '直接存 brush（不再平方）✓' : '⚠️ 还留着平方用的渐变 stop'}`,
    );
    expect(a5 && s5 && lobes, '形状不是参考站的 irregular（5 瓣 0.14 + 9 瓣 0.08）').toBe(true);
    expect(secs, 'irregular 的时间没换算成秒 ⇒ 形状变化快 1000 倍，抖成一团').toBe(true);
    expect(core && brush, '软边不是 smoothstep(0.45, 1.2) ⇒ 与参考站的笔触边缘不一致').toBe(true);
    expect(noSquare, '还留着平方用的渐变 stop ⇒ 与"线性衰减的 Float32 场"这套口径冲突').toBe(true);
  });
});