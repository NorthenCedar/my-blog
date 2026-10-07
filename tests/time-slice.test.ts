/* =============================================================================
 * TIME SLICE 时间切片 —— 主页收尾装置的契约（tests/time-slice.test.ts）
 *
 * 每条 it() 都能反推「验什么、实测多少」（与卷尺/显影板同一套纪律）：
 *   · 纯函数层直接 import 单测（tslTimeline / tslPath / tslHash 是无 DOM 的
 *     确定函数 —— 滚动驱动装置的「零随机」从类型上就成立）；
 *   · 产物层验 index.html 的装置骨架（静态回退层默认在场、剧场默认缺席）；
 *   · 源码层验红线（零随机 / 零字面量色 / 跳转地址不写死 / 依赖只增 rl-core）；
 *   · 产物 CSS 验降级四态（reduced-motion / 无 JS 门控 / 手机档）。
 * -------------------------------------------------------------------------- */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tslTimeline, tslPath, tslHash, TSL, TSL_FRAMES } from '../src/scripts/time-slice';
/* 翅膀掩膜是**纯函数**（无 DOM、无 three）⇒ 直接从 core 层 import 单测，
   不用绕控制器那一层的再导出（那是给页面用的公共面）。 */
import { splitWings } from '../src/scripts/time-slice-core';

/* ---- 首页产物：HTML + 它引用/同名的 CSS（index.astro 的样式可能内联也可能成块） */
function homepageCss(): string {
  let text = existsSync('dist/index.html') ? readFileSync('dist/index.html', 'utf8') : '';
  const chunks = readdirSync('dist/_astro').filter((f) => f.startsWith('index.') && f.endsWith('.css'));
  for (const f of chunks) text += readFileSync(join('dist/_astro', f), 'utf8');
  return text;
}
function homepageHtml(): string {
  return readFileSync('dist/index.html', 'utf8');
}
/** dist 下**全部** CSS 拼一起（跨页/跨 chunk 找一条规则时用 —— 例如「交接层的
 *  选择器编译后到底长什么样」，它落在 gallery 那份 chunk 里，名字跟前缀无关）。 */
function distCss(): string {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) out.push(readFileSync(p, 'utf8'));
    }
  };
  walk('dist');
  return out.join('\n');
}
const SRC = readFileSync('src/scripts/time-slice.ts', 'utf8');
const CORE = readFileSync('src/scripts/time-slice-core.ts', 'utf8');
const SCENE = existsSync('src/scripts/time-slice-scene.ts')
  ? readFileSync('src/scripts/time-slice-scene.ts', 'utf8')
  : '';
/* ★ 去注释后的源码 —— 「某某写法必须已删净」这类断言**必须打在这里**。
   踩过的坑：注释里为了写清「这一版把 `camZ += (… − camZ)` 删掉了」而逐字引用
   了旧代码，于是那些 `not.toContain` 断言被自己的注释撞挂。断言的对象是代码，
   注释叙述历史不该被算进去。 */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const SCENE_CODE = stripComments(SCENE);

describe('时间切片 · 纯函数层（滚动↔时间的确定映射）', () => {
  it('tslTimeline 边界：p=0 一切归零，p=1 全部到位（zoom/t/settle/exit=1，CTA 与跳转点亮）', () => {
    const a = tslTimeline(0);
    expect(a.zoom).toBe(0);
    expect(a.t).toBe(0);
    expect(a.settle).toBe(0);
    expect(a.exit).toBe(0);
    expect(a.cta).toBe(false);
    expect(a.nav).toBe(false);
    const b = tslTimeline(1);
    expect(b.zoom).toBe(1);
    expect(b.t).toBe(1);
    expect(b.settle).toBe(1);
    expect(b.exit).toBe(1);
    expect(b.cta).toBe(true);
    expect(b.nav).toBe(true);
  });

  it('tslTimeline 中段：p=0.5 时菱窗已全开（zoom=1）、飞行走完 (0.5-0.30)/0.56、出场未开始', () => {
    const m = tslTimeline(0.5);
    expect(m.zoom).toBe(1);
    expect(m.t).toBeCloseTo((0.5 - TSL.tStart) / (TSL.tEnd - TSL.tStart), 12);
    expect(m.exit).toBe(0);
  });

  it('出场穿窗段：exit 随 p 单调不减，关键帧次序 settle → exit → nav（先落定再穿窗）', () => {
    expect(TSL.exitStart).toBeGreaterThan(TSL.settleStart);
    expect(TSL.navAt).toBeGreaterThan(TSL.exitStart);
    expect(TSL.navCancelAt).toBeLessThan(TSL.navAt);
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const e = tslTimeline(i / 100).exit;
      expect(e).toBeGreaterThanOrEqual(prev);
      expect(e).toBeLessThanOrEqual(1);
      prev = e;
    }
  });

  it('tslTimeline 的 t 随 p 单调不减（向上滚可逆的前提：映射是纯函数）', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const t = tslTimeline(i / 100).t;
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeLessThanOrEqual(1);
      prev = t;
    }
  });

  it('tslPath = 切片链的位置轴：起点 z=-3（镜前第一片），终点 z=-168（标本/尽头那扇窗），x 两端归零', () => {
    const s = tslPath(0);
    expect(s.x).toBeCloseTo(0, 12);
    expect(s.z).toBeCloseTo(-3, 12);
    const e = tslPath(1);
    expect(Math.abs(e.x)).toBeLessThan(1e-9);
    expect(e.z).toBeCloseTo(-168, 12);
  });

  it('tslPath 的 z 随 t 单调递减（镜头沿轴向前推进的轨迹前提：一个切片接一个切片）', () => {
    let prev = 0;
    for (let i = 0; i <= 200; i++) {
      const z = tslPath(i / 200).z;
      expect(z).toBeLessThanOrEqual(prev + 1e-12);
      prev = z;
    }
  });

  it('tslPath 全程有界：|x|≤0.18（链近轴，侧移交给镜头）、z∈[-168,-3]、|flap|≤1、spread∈[0.18,1]', () => {
    for (let i = 0; i <= 200; i++) {
      const p = tslPath(i / 200);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(0.18 + 1e-9);
      expect(p.z).toBeGreaterThanOrEqual(-168 - 1e-9);
      expect(p.z).toBeLessThanOrEqual(-3 + 1e-9);
      expect(Math.abs(p.flap)).toBeLessThanOrEqual(1 + 1e-9);
      expect(p.spread).toBeGreaterThanOrEqual(0.18 - 1e-9);
      expect(p.spread).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('tslHash 是确定函数（同输入同输出），值域 [0,1) —— 标本斑点的「随机感」全靠它', () => {
    for (let i = 0; i < 50; i++) {
      const v = tslHash(i);
      expect(tslHash(i)).toBe(v);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(tslHash(1)).not.toBe(tslHash(2));
  });

  it('切片数与读数口径 = 76（对齐参考视频 FRAME NN / 76）', () => {
    expect(TSL_FRAMES).toBe(76);
  });
});

describe('时间切片 · 源码红线', () => {
  it('零随机源（装置的一切都是 f(t)/f(i)，滚动可逆的前提）—— 三个文件一起查', () => {
    expect(SRC).not.toContain('Math.random');
    expect(CORE).not.toContain('Math.random');
    expect(SCENE).not.toContain('Math.random');
  });

  it('零 innerHTML（本站硬约束，有测试守着）', () => {
    expect(SRC).not.toContain('innerHTML');
    expect(SCENE).not.toContain('innerHTML');
  });

  it('零字面量色值：控制器与场景的颜色全部来自 tokens.css（getComputedStyle 取出后传入）', () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SCENE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SRC).toContain("tok('--dusk-1')");
    expect(SRC).toContain("tok('--accent-bright')");
    expect(SRC).toContain('getComputedStyle');
    expect(SRC).toContain('createTslScene(cvs, palette)');
  });

  it('跳转地址不写死在 JS：从静态回退层链接的 href 读（内容改路径不用改脚本）', () => {
    expect(SRC).toContain("goLink.getAttribute('href')");
    expect(SRC).not.toContain("'/gallery/'");
  });

  it('依赖契约：控制器静态依赖仅 rl-core + time-slice-core，场景走动态 import 且自 three 引入', () => {
    // 控制器的静态导入只有共享层与纯函数层（零新增运行时依赖）
    const imports = [...SRC.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const im of imports) expect(['./rl-core', './time-slice-core']).toContain(im);
    // three 场景是独立 chunk：动态 import（不进首屏关键路径），three 走既有 vendor alias
    expect(SRC).toContain("import('./time-slice-scene')");
    expect(SCENE).toContain("from 'three'");
  });

  it('切片链沿轴一列：每片由 tslPath(i/(N-1)) 定位（静止影像的序列，不是运行时动画）', () => {
    expect(SCENE).toContain('tslPath(ti)');
    expect(SCENE).toContain('TSL_FRAMES');
    expect(CORE).toContain('flap');
  });

  it('★ 蝴蝶的「飞」是**烘焙进切片**的：翼相序列做进几何，运行时零逐帧拍翼', () => {
    // 站主第五轮：「记得加蝴蝶飞舞时的动作一次放在切片里」—— 每片切片停在
    // 不同的翼相上，镜头逐片经过连起来才是拍翅；运行时没有任何逐帧动画。
    expect(SCENE).toContain('makeFlapGeos');
    expect(SCENE).toMatch(/const FLAP_N = 16/);
    expect(SCENE).toContain('flapGeos[i % FLAP_N]'); // 切片 i 取第 i%FLAP_N 份翼相
    expect(SCENE).not.toContain('flapPhase'); // 没有实时翼拍相位
    expect(SCENE).not.toContain('wingR'); // 也没有「活蝶右翼」这种运行时旋转
    expect(SCENE).toContain('butGeo'); // 基准翼相几何
    // ★ 第六轮「动作再灵动一点」：波形叠谐波（上拍快、下拍带回弹）+ 逐档振幅
    //   调制（不再等幅机械摆）+ 整只蝶沿 Y 的轻微「浮」，全部烘进几何
    expect(SCENE).toMatch(/FLAP_H2 = 0\.22/);
    expect(SCENE).toMatch(/FLAP_H3 = 0\.12/);
    // ★ 第七轮「翅膀扇动幅度大一点」：0.62 → 0.85（≈49° 上抬，下压一半）
    expect(SCENE).toMatch(/FLAP_AMP = 0\.85/);
    expect(SCENE).toContain('FLAP_AMP_BASE + FLAP_AMP_SPAN');
    expect(SCENE).toContain('const bob = FLAP_BOB * Math.sin(th + 1.2)');
    expect(SCENE).toContain('y1 + bob');
  });

  it('★★ 翅膀掩膜（站主第十轮：触角和肢体不要乱动，不要交叉）', () => {
    /* 站主原话：「触角和肢体不要乱动，不要交叉」。
       原先 makeFlapGeos 只按 |x| 给权重（|x| ≥ 0.16 吃满）—— 触角尖 |x|≈0.19、
       腿尖 |x|≈0.22，都吃到了近乎全量的旋转，且**按 x 的符号反号** ⇒ 左右触角、
       左右腿朝相反方向甩 ⇒ 乱动 + 交叉。
       修法：加载时把**翅膀膜**认出来（连通块 max|x| ≥ 0.25），形变只作用在它上面。 */
    expect(CORE).toContain('export function splitWings');
    expect(CORE).toContain('export const WING_MIN_X = 0.25;');
    expect(CORE).toContain('export const WELD_EPS = 1e-4;');
    // 场景侧：掩膜算出来 → 传进烘焙；w 只在掩膜内取权重
    expect(SCENE).toContain('const wingSplit = splitWings(');
    expect(SCENE).toContain('makeFlapGeos(butGeo, FLAP_N, FLAP_AMP, wingSplit.mask)');
    expect(SCENE_CODE).toContain('const w = wing[i] ? ease((Math.abs(x) - 0.03) / 0.13) : 0;');
    // 旧的「只看 |x|」写法必须已删净（否则触角/肢体又会被带着转）
    expect(SCENE_CODE).not.toContain('const w = ease(');
    expect(SCENE).toMatch(/function makeFlapGeos\(\s*base: BufferGeometry,\s*count: number,\s*amp: number,\s*wing: Uint8Array,/);
    // 自检数字（「静止」必须是可量的，不是「看着像」）
    expect(SCENE).toContain('restSpread');
    expect(SCENE).toContain('wingMove');
    expect(SCENE).toContain('wing: wingProbe');
  });

  it('★★ 翅膀掩膜纯函数：只挑「大展幅」的连通块；触角/肢体那一档不许入选', () => {
    /* 合成几何（纯函数层，不碰真实模型）：
         · 翅：一块从 x=0.02 伸到 0.50 的四边面（2 个三角形）
         · 腿：一块 max|x| 只有 0.10 的小面（与翅不共顶点）
         · 触角：一块 max|x| = 0.22 的细长条 —— 真实模型里触角尖/腿尖就在这一档，
           它**必须**判为非翅膀（阈值 0.25 的意义就在这儿） */
    const quad = (x0: number, x1: number, y: number) => ({
      pos: [x0, y, 0, x1, y, 0, x1, y + 0.06, 0, x0, y + 0.06, 0],
      idx: [0, 1, 2, 0, 2, 3],
    });
    const wing = quad(0.02, 0.5, 0);
    const leg = quad(0.02, 0.1, -0.3);
    const antenna = quad(0.02, 0.22, 0.3);
    const parts = [wing, leg, antenna];
    const pos: number[] = [];
    const idx: number[] = [];
    for (const p of parts) {
      const base = pos.length / 3;
      pos.push(...p.pos);
      for (const i of p.idx) idx.push(base + i);
    }
    const r = splitWings(new Float32Array(pos), new Uint32Array(idx));
    expect(r.comps).toBe(1); // 只有「翅」那一块入选
    expect(r.wingVerts).toBe(4);
    expect(r.minWingX).toBeCloseTo(0.5, 6);
    expect(r.maxOtherX).toBeCloseTo(0.22, 6); // 触角那一档如实报出来
    // 掩膜：翅的 4 个顶点为 1，其余 8 个为 0
    expect([...r.mask.slice(0, 4)]).toEqual([1, 1, 1, 1]);
    expect([...r.mask.slice(4)].every((v) => v === 0)).toBe(true);
  });

  it('★ 翅膀掩膜：逐面独立顶点（未焊接）也必须认成同一块', () => {
    /* 真实模型是逐面独立顶点的（同一位置有多个顶点）⇒ 不焊接的话每个面都是孤岛。
       这里把「翅」拆成两个**不共顶点但共位置**的三角形：焊接后应当是一块。 */
    const pos = new Float32Array([
      0.02, 0, 0, 0.5, 0, 0, 0.5, 0.06, 0, // 三角形 A
      0.5, 0, 0, 0.5, 0.06, 0, 0.02, 0, 0, // 三角形 B（位置与 A 重合、顶点独立）
    ]);
    const idx = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const r = splitWings(pos, idx);
    expect(r.comps).toBe(1);
    expect(r.wingVerts).toBe(6);
    expect([...r.mask]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('★ 链的轨迹有变化：每片自己的摆动 + 微倾角，且镜头只跟基准轴（摆动才看得见）', () => {
    // 站主第六轮：「蝴蝶的动作再灵动一点，轨迹也可以有点变化，看视频里的」
    expect(SCENE).toContain('const swayOf = (i: number)');
    expect(SCENE).toContain('const tiltOf = (i: number)');
    /* ★ 第七轮字面化：「蝴蝶是固定在切片上的，不要变位置」「整个场景中蝴蝶，
       切片等等位置都不要变幻，只有摄像机的位置在变」。
       ⇒ 蝶挂在**锚在链轴上**的 holder 里，holder 的位置与蝶的局部偏移都在
         建场景时写一次；update() 里一个 position 都不写（只写 holder 的 scale，
         那是投影补偿）。 */
    expect(SCENE).toContain('const holder = new Group()');
    expect(SCENE).toContain('holder.position.set(p.x, p.y, p.z)');
    expect(SCENE).toContain('wing.position.set(sway.x, sway.y, 0)');
    expect(SCENE).toContain('holder.add(wing)');
    expect(SCENE).toContain('wing.rotation.set(tilt.pitch, tilt.yaw, tilt.roll)');
    // ★ 两端必须归零：入窗那一片与出窗那一片要老实居中
    expect(SCENE).toMatch(/Math\.sin\(\(Math\.PI \* i\) \/ \(N - 1\)\)/);
    // ★ 镜头**不跟**摆动：机位仍取自基准轴 tslPath —— 跟了的话相对位移为零，
    //   摆动等于白做（这正是原来「链上有弧却看不出来」的原因）
    expect(SCENE).toContain('const live = tslPath(t)');
    // 摆动的「随机感」只许来自 tslHash（零随机源，滚动可逆）
    expect(SCENE).toContain('tslHash(i)');
    // ★ 原先那条「整链航迹摆动」是**逐帧位移**（等于让场景动起来），第七轮删净
    expect(SCENE).not.toContain('pathWob');
  });

  it('一个切片一只蝴蝶：每片各建一个蝶 mesh + 一个玻璃片（循环里只组装一次）', () => {
    expect(SCENE.match(/const wing = new Mesh\(flapGeos/g) ?? []).toHaveLength(1);
    expect(SCENE.match(/const pane = new Mesh\(/g) ?? []).toHaveLength(1);
    expect(SCENE).toContain('slices.push(');
  });

  it('只有摄像机在动：镜头位姿由链轴位置驱动，做绕当前切片的 orbital 机位', () => {
    expect(SCENE).toContain('camera.position.set');
    expect(SCENE).toContain('camera.lookAt');
    expect(SCENE).toContain('tslPath(t)'); // 镜像位置取自链轴，不另设飞行曲线
    /* ★ 第八轮 ④：机位那层的**二次平滑 camZ 必须不存在**（注释里叙述它被删掉
       是可以的，但代码里不许再有这个变量/赋值）。它滞后于链锚，滞后量 L 会让
       注视点（用即时 live.z）相对相机前后滑动 ⇒ 视线俯仰角随滚动方向摆，
       向上滚时画面朝后翻（实测漂 116°，`_probe/_bv-look.mjs`）。 */
    expect(SCENE_CODE).not.toMatch(/let camZ/);
    expect(SCENE_CODE).not.toMatch(/camZ \+=/);
    expect(SCENE_CODE).not.toMatch(/\+ camZ/);
  });

  it('★ 第八轮 ④：朝向是**结构性**保证 —— 机位与注视点同锚、只差一个半径', () => {
    /* 站主第三到第八轮反复骂同一条（原话：「说了多少次了，滚轮往上滚的时候
       视角不要变！！！！就跟倒车一样，你眼睛看着前面只不过你人往后走一样」）。
       前两轮只改了「参数」（wheel 监听器清空、azBase 变常数），但**观测量**
       camera.rotation 仍随滚动漂 —— 因为注视点用即时 live.z、机位用滞后的 camZ。
       这一版把两者锁在同一个锚（链参数点 live）上：视线方向 = −(sin az cos el,
       sin el, cos az cos el)，只由 az / el 决定，与滚动位置无关。 */
    expect(SCENE).toMatch(/const LOOK_DIST = 1\.7/);
    expect(SCENE).toContain('const R2 = R + LOOK_DIST;');
    // ★ 符号别写反：机位在链锚**后方**、注视点必须在**前方** ⇒ 三项都取负号
    expect(SCENE).toContain('const tx0 = live.x - R2 * Math.sin(az) * Math.cos(el);');
    expect(SCENE).toContain('const ty0 = live.y - R2 * Math.sin(el) + 0.03;');
    expect(SCENE).toContain('const tz0 = live.z - R2 * Math.cos(az) * Math.cos(el) - 2.9 * exit;');
    expect(SCENE).not.toContain('const tz0 = live.z + R2 * Math.cos(az)');
    expect(SCENE).toContain('const ax = tx0 * (1 - se) + spec.x * se;');
    // 旧写法：注视点挂在即时的 live.z、机位挂在滞后的 camZ ⇒ 必须已删净
    expect(SCENE).not.toContain('const az2 = (live.z - 1.7)');
  });

  it('环绕柱阵只在转动视角时亮出：整组透明度由 amb 驱动（不转视角 ⇒ 全透明、连 draw 都省）', () => {
    expect(SCENE).toContain('gridMat.opacity');
    expect(SCENE).toContain('* clamp01(amb');
    expect(SCENE).toContain('grid.visible = gridMat.opacity >');
  });

  it('★ 恰好一片是「实」的（硬切）；其余与玻璃片共用同一条可见度曲线', () => {
    // 站主第六轮：「我不要求离摄像机最近的是实的，在画面靠中间一点的是实的，
    //   其他都是透明度很高的只能看见一点的」——
    //   ⇒ 焦点 = 镜头前方**固定距离** FOCUS_DIST（镜头骑在链轴上 ⇒ 必在画面中央）
    // 第七轮三句：「实的蝴蝶离摄像机远一点，不要贴着摄像机」/「透明的蝴蝶把
    //   透明度变得和切片的玻璃片一样」/「转动视角时看到的其他切片上加一个透明蝴蝶」
    expect(SCENE).toMatch(/const FOCUS_DIST = 6\.6/);
    expect(SCENE).toMatch(/const SLICE_SCALE = 2\.15/); // 尺度 ∝ FOCUS_DIST（观感不变）
    expect(SCENE).toMatch(/const SLICE_GAP = 2\.2/); // 片距（tslPath 的 z 斜率）
    // ★ 「唯一实」= au 最小那一片 + **硬切** ⇒ 恰好一片（不会有双影，也不会全灭）
    expect(SCENE).toContain('const au = Math.abs(dist - FOCUS_DIST)');
    expect(SCENE).toContain('const op = i === focusI ? 1 : SIDE_OP * wingFade;');
    /* ★ 虚实只跟**滚动位置**有关 ⇒ 轴向距离取自**链锚**（链参数点后方
       CAM_BACK），不取环视之后的真实机位 camera.position.z。第八轮把那层二次
       平滑 camZ 删掉后，链锚直接由链参数点算出（语义更白）。 */
    expect(SCENE).toContain('const eyeZ = live.z + CAM_BACK;');
    expect(SCENE).toContain('const dist = eyeZ - s.z');
    expect(SCENE).not.toContain('const eyeZ = camera.position.z');
    expect(SCENE).not.toContain('const eyeZ = camZ;');
    // ★ 其余蝶的**亮度**与玻璃片同一档（站主：「透明度变得和玻璃片一样」）：
    //   单只 = PANE_OP × 玻璃贴图峰值 alpha ÷ 叠影抑制系数（剪影沿视线互叠）
    expect(SCENE).toContain('const SIDE_OP = (PANE_OP * GLS_PEAK) / STACK_DAMP;');
    expect(SCENE).toMatch(/GLS_PEAK = 0\.2\b/);
    expect(SCENE).toMatch(/STACK_DAMP = 4\b/);
    //   ★ 可见度曲线则与玻璃**完全同一条**（站主补充：「转动视角时看到的其他
    //     切片上加一个透明蝴蝶」⇒ 有玻璃的片就必须有蝶）。上一版把 K_WING 单独
    //     改陡到 0.35 去压亮度，代价是环视时 vis=10 / panesLoud=26（16 片漏蝶），
    //     已回退：亮度改由「单只更淡」控。
    expect(SCENE).toMatch(/K_PANE = 0\.1\b/);
    expect(SCENE).toMatch(/K_WING = K_PANE\b/);
    expect(SCENE).not.toMatch(/K_WING = 0\.35\b/);
    expect(SCENE).toContain('const paneFade = Math.exp(-au * K_PANE) * paneNear;');
    expect(SCENE).toContain('const wingFade = Math.exp(-au * K_WING) * paneNear;');
    expect(SCENE).toContain('const paneOp = PANE_OP * paneFade;');
    // ★ 蝶与玻璃**同进同出**：wing.visible 的判据必须挂在同一档位（0.004），
    //   否则环视时会漏片（前面的 panesLoud 对照就是靠这一条守住的）
    expect(SCENE).toContain('s.wing.visible = op > 0.004;');
    expect(SCENE).toContain('s.pane.visible = paneOp > 0.004;');
    //   dump 出口要同时暴露玻璃侧的计数，探针才能拿 vis 与 panesLoud 对照
    expect(SCENE).toContain('if (s.pane.visible) {');
    expect(SCENE).toContain('panesLoud,');
    expect(SCENE).toContain('panes,');
    // ★ 投影补偿：**全链一律**按 dist/FOCUS_DIST 缩 ⇒ 每一片在屏上的视张角都
    //   等于实蝶那一档（残影与实蝶同尺寸 = 频闪多重曝光）；
    //   否则镜头正穿过的那几片会糊出一整屏灰（实测证据帧 _bvts-7-p050.png）
    //   第八轮 ① 再乘一个由 t 驱动的**开场整体缩放** grow（0.6 → 1）
    expect(SCENE).toContain('grow * Math.max(0.05, dist / FOCUS_DIST)');
    expect(SCENE).toContain('s.pane.scale.setScalar(grow);');
    expect(SCENE).toMatch(/const GROW_MIN = 0\.6/);
    // 驱动量是**窗口张开进度 zoom**（「随着慢慢进窗口的同时恢复原来大小」）
    expect(SCENE).toContain('const grow = GROW_MIN + (1 - GROW_MIN) * ss(0, 1, zoom);');
    expect(SCENE).not.toContain('GROW_T');
    expect(SRC).toContain('zoom: tl.zoom');
    expect(SCENE).not.toContain('const w = ss(3.0, 1.2, au)');
    // ★★ 位置零写入（第七轮的核心）：update() 里一处 position.set 都不许有
    expect(SCENE).not.toContain('s.wing.position.set(');
    expect(SCENE).not.toContain('s.pane.position.set(');
    expect(SCENE).not.toContain('s.label.position.set(');
    // 旧的软窗口 + (1−hero) 位移补偿那一套必须彻底消失（它正是双影的来源）
    expect(SCENE).not.toContain('const k = 1 - hero;');
    expect(SCENE).not.toContain('ss(COMP_HI, COMP_LO, score)');
    expect(SCENE).not.toContain('COMP_LO');
    expect(SCENE).not.toContain('COMP_HI');
    expect(SCENE).not.toContain('VIS_SIDE');
    expect(SCENE).not.toContain('K_SIDE');
    // 旧的「离最近」那一套也不许回来
    expect(SCENE).not.toContain('CAP_DIST');
    expect(SCENE).not.toContain('d > 0 && d < bestDist');
    expect(SCENE).not.toContain('Math.exp(-k * K_AHEAD)');
  });

  it('★ 被镜头甩到身后的切片留着不动：只降不透明度，不出画、不改尺度', () => {
    // 站主第六轮：「往前的时候摄像机后面的蝴蝶别动，别往下，只不过是变的半透明了」
    expect(SCENE).not.toContain('if (i < cur || dist <= 0)');
    expect(SCENE).not.toContain('s.wing.visible = false');
    expect(SCENE).toContain('s.wing.visible = op > 0.004');
    // 尺度绝不翻负号：身后的片 dist<0 ⇒ comp 取下限（负数会把蝶翻面）
    expect(SCENE).toContain('Math.max(0.05, dist / FOCUS_DIST)');
    // 玻璃片在镜头正穿过的那一片上让位（否则糊满近裁剪面），其余一路铺到尽头
    expect(SCENE).toContain('const paneNear = dist < 0 ? 1 : ss(0, PANE_NEAR, dist)');
    // 探针要能证明「身后的片仍在场景里」（behind > 0）
    expect(SCENE).toContain('behind');
  });

  it('★ 切片玻璃是「毛玻璃」：只有软边雾带，没有任何灰色硬线边框（站主第五轮）', () => {
    // 站主点名的「灰色线的边框」= 上一版的隧道方框几何，已整个删掉
    expect(SCENE).not.toContain('frameMat');
    expect(SCENE).not.toContain('frameGeo');
    expect(SCENE).not.toContain('fillParts');
    expect(SCENE).not.toContain('fillBase');
    // 软边 = 同一圈轮廓上叠「由细到粗、由亮到淡」的一串描边（不是 1px 硬线）
    expect(SCENE).toContain('const STEPS = 14');
    expect(SCENE).toContain('lineWidth = 2.5 + t * 44');
    expect(SCENE).not.toContain('strokeRect');
    // 任何**铺满整片**的元素都会逐层累加：0.05 的掠光叠 76 层 = 98% 白 ⇒
    // 整条隧道洗成白雾、蝶面糊掉（实测踩过）。所以面上只用 radial 的贴边淡雾。
    expect(SCENE).not.toContain('createLinearGradient');
    expect(SCENE).toMatch(/createRadialGradient/);
  });

  it('★ 转动视角后 = 一圈圈整齐等距的玻璃柱阵（不是蝴蝶群、也不是贴脸那一格）', () => {
    /* ★ 第八轮 ⑤ 起，蝶列玻璃放大到 3.6，但**柱阵仍吃 2.6 那份几何** ——
       柱距 GSTEP=3.8 是按「片边 < 柱距才有缝」定的，柱里的片一跟着放大，
       整片柱阵就连成一堵墙、柱间通光缝全没了。 */
    expect(SCENE).toContain('new InstancedMesh(gridGeo');
    expect(SCENE).toMatch(/const GRID_W = 2\.6/);
    expect(SCENE).toContain('grid.setMatrixAt(');
    expect(SCENE).toContain('frustumCulled = false'); // 柱阵随镜头穿过，整体包围盒会误剔
    expect(SCENE).not.toContain('makeWallTexture'); // 旧版墙面网格已删
    // 柱距 > 玻璃片边长 ⇒ 柱间留缝；中心 3×3 留空 ⇒ 不贴镜头这一列
    expect(SCENE).toMatch(/GSTEP = 3\.8/);
    expect(SCENE).toContain('if (Math.abs(gx) <= GINNER && Math.abs(gy) <= GINNER) continue');
    // 柱里不放蝶（站主：「可以里面没有蝴蝶」）—— 柱阵只吃玻璃片几何
    expect(SCENE.match(/new InstancedMesh\(butGeo/g) ?? []).toHaveLength(0);
  });

  it('★ 第八轮 ⑤：有蝴蝶的那一列玻璃放大，且蝶的运动轨迹是一条**曲线**（不是直线）', () => {
    // 「有蝴蝶的这一列切片玻璃可以大一点」—— 只有蝶列放大（2.6 → 3.6）
    expect(SCENE).toMatch(/const PANE_W = 3\.6/);
    expect(SCENE).toContain('const paneGeo = new PlaneGeometry(PANE_W, PANE_W);');
    /* 「蝴蝶的运动轨迹不要是一条直线，运动轨迹大一点，可以是一条曲线」
       ⇒ x 与 y 相位差 π/2 的椭圆 + 次级谐波；峰值 0.34 → ≈1.35 世界单位。
       蝶与它那扇玻璃共用同一个 sway ⇒ 摆幅再大也永远停在框心。 */
    expect(SCENE).toContain('const th = i * TRAIL_TURN;');
    expect(SCENE).toContain('TRAIL_A * Math.cos(th)');
    expect(SCENE).toContain('TRAIL_B * Math.sin(th)');
    expect(SCENE).toMatch(/const TRAIL_A = 1\.05/);
    expect(SCENE).toMatch(/const TRAIL_B = 0\.6/);
    // 玻璃与蝶用的是同一个 sway（否则蝶会跑出框）
    expect(SCENE).toContain('const sx = p.x + sway.x;');
    expect(SCENE).toContain('wing.position.set(sway.x, sway.y, 0)');
  });

  it('★ 蝴蝶模型是本地资产：public/butterfly.glb（零新增第三方请求）+ 复用既有 vendor 的 GLTFLoader', () => {
    expect(existsSync('public/butterfly.glb'), 'public/butterfly.glb 不见了').toBe(true);
    const kb = statSync('public/butterfly.glb').size / 1024;
    expect(kb, `butterfly.glb 体积 ${kb.toFixed(0)} KB 超出预算（与 dna-slim.glb 同量级才合理）`).toBeLessThan(400);
    expect(SCENE).toContain("'/butterfly.glb'");
    expect(SCENE).toContain('../vendor/GLTFLoader.js');
    expect(SCENE).not.toMatch(/https?:\/\//); // 模型不许走外链
  });

  it('★ 尽头背光是「跟着镜头走的点光」：屏幕尺寸恒定，走到链尾也不会糊满整屏', () => {
    expect(SCENE).toContain('const gz = pz - GLOW_AHEAD'); // 逐帧跟在真实机位前方
    expect(SCENE).toContain('lightBig.position.set(');
    expect(SCENE).toMatch(/screenSize = \(f: number\) => f \* 2 \* Math\.tan/);
    // 不许再出现「钉在链尾」的写法：镜头一靠近它就放大到整屏白（实测踩过）
    expect(SCENE).not.toContain('SPEC_Z - 1.7');
  });

  it('菱形轮廓环只剩入口那一扇：出口那道绿框已删净（站主第九轮 ③）', () => {
    // 「到尽头……也别显示那个绿色的框」—— 出口那个随 exit 放大越过镜头的菱形环
    // （旧写法 `0.12 + 1.15 * exit^1.7`）整个删掉；入口那一扇照旧。
    expect(CORE).toContain('exitStart'); // 出场穿窗这段仍在（它是绿幕的驱动量）
    expect(SRC).toContain("ringPath.setAttribute('d', ringD)"); // 环仍由脚本逐帧写
    expect(SRC).toContain("polygon(50% "); // 入口：画布按菱形裁切
    expect(SRC).toContain("ringPath.parentElement!.style.opacity = tl.zoom > 0.985 ? '0' : '1'");
    expect(SRC).not.toContain('ringX');
    expect(SRC).not.toContain('Math.pow(exit, 1.7)');
    // ★ 第八轮 ①：「这个窗口大一点」—— 入口菱形窗的基准半宽 14% → 19%
    expect(SRC).toContain('const baseHalf = Math.min(W, H) * 0.19;');
  });

  it('到底锁滚：链尾之后向下滚被吞掉（收尾由时间轴自动播完），且不困住读者', () => {
    expect(SRC).toContain('e.preventDefault()');
    expect(SRC).toContain('atTail && e.deltaY > 0'); // 只吞向下滚 ⇒ 上行滚永远放行
    expect(SRC).toContain('atTail = atEnd');
    // 锁滚线 = 链尾线（不会错开成死锁）；navOk 为假时**不启动**收尾
    expect(SRC).toContain('pRaw >= TSL.tEnd && (navOk || tailT0 > 0)');
    expect(SRC).toContain('{ passive: false }'); // 要 preventDefault 就不能是 passive
    expect(SRC).toContain('if (!atEnd && tailT0)'); // 滚回链尾以上 ⇒ 收尾可逆
    expect(SRC).toContain('navOk = true'); // 读者主动往回滚 ⇒ 重新武装自动跳转
  });

  it('到绿屏直接进相册（站主第九轮 ③）：判据是**绿幕自己**，不再等收尾时间轴走完', () => {
    // 「到绿屏时直接进相册，别卡」—— 旧写法要等 tf=1（收尾时间轴走完）再加 260 ms，
    // 满屏绿之后白等 ≈0.7 s，读起来就是「卡了一下」。
    expect(SRC).toContain('TAIL_MS');
    expect(SRC).toContain('const tf = tailT0 ? Math.min(1, (now - tailT0) / TAIL_MS) : 0');
    expect(SRC).toContain('Math.max(tl.settle, sstep(0, 0.34, tf))');
    expect(SRC).toContain('Math.max(tl.exit, sstep(0.3, 1, tf))');
    expect(SRC).toContain('const greenOp = gx * gx * (3 - 2 * gx);');
    expect(SRC).toContain('if (navOk && greenOp >= 1) beginNav();');
    expect(SRC).not.toContain('tf >= 1');
    // 绿幕满屏后再停一下（确保它真的上了屏）就切页
    expect(SRC).toMatch(/const NAV_HOLD_MS = \d+;/);
  });

  it('玻璃切片画廊：每片 = 玻璃片 + 单只蝴蝶印面 + 右下角 FRAME 芯片（图1/图2 口径）', () => {
    expect(SCENE).toContain('makeGlassTexture');
    expect(SCENE).toContain('makeLabelTexture');
    expect(SCENE).toContain('FRAME ${'); // 芯片读数模板
    expect(SCENE).toContain('new Sprite('); // 芯片挂精灵，环视时始终可读
  });

  it('定格挪视角：左键拖动环视（pointer capture）；滚轮任何方向都不动视角', () => {
    expect(SRC).toContain("addEventListener('pointerdown'");
    expect(SRC).toContain('setPointerCapture');
    expect(SRC).toContain("'wheel'");
    expect(SRC).toContain('ambT = 1'); // 拖动 ⇒ 环绕柱阵亮出
    // ★★ 滚轮的两条契约（第七轮 + 第九轮，**分工不冲突**）：
    //   · 第七轮（原话带六个感叹号）：「滚轮往上滚的时候不要变视角！！！视角和
    //     滚轮往下时一模一样！！」⇒ **基础朝向**不许被滚动改：外面那三条
    //     （AZ_BASE 是常数、镜头骑在链轴上）由下面几条守着；
    //   · 第九轮 ②：「改变视角后在滚动滚轮要回到原始视角且周围切片消失」⇒
    //     **拖动环视**（obxT/obyT）与环绕柱阵开关（ambT）在滚轮里归零。
    //   归零目标是**常数 0**、不读 deltaY ⇒ 方向无关，第七轮那条继续成立。
    const wheelAt = SRC.indexOf("'wheel'");
    expect(wheelAt).toBeGreaterThan(-1);
    const wheelBody = SRC.slice(SRC.indexOf('(e) => {', wheelAt), SRC.indexOf('{ passive: false }', wheelAt));
    expect(wheelBody).toContain('if (atTail && e.deltaY > 0)');
    expect(wheelBody).toContain('e.preventDefault()');
    expect(wheelBody).toContain('obxT = 0');
    expect(wheelBody).toContain('obyT = 0');
    expect(wheelBody).toContain('ambT = 0');
    // 函数体里**只有一处**读滚动方向（链尾那条守卫）⇒ 归零与方向无关
    expect((wheelBody.match(/deltaY/g) ?? []).length).toBe(1);
    // 而且不是「按方向给不同目标」那种写法
    expect(wheelBody).not.toMatch(/deltaY[^\n]*\?/);
    expect(wheelBody).not.toMatch(/obxT\s*(\+=|-=)/);
    expect(wheelBody).not.toContain('azBase');
    // 朝向的另一个来源（拖动环视 / 指针视差）同理不受滚动影响
    expect(SRC).toContain("hud.addEventListener('pointerdown'"); // 署名外链不吃拖拽
    // 朝向只有两个来源（拖动环视 orbX/orbY、指针视差 pmx/pmy），都不随滚动变：
    // 基础方位角必须是**纯常数**，连 settle 的 smoothstep 都不许乘
    // （乘了就等于「滚一下，视角跟着转最多 5.7°」——第七轮被骂的正是这个）
    expect(SCENE).toMatch(/const AZ_BASE = 0\.03/);
    expect(SCENE).toContain('const azBase = AZ_BASE;');
    expect(SCENE).not.toContain('AZ_BASE + 0.1 * se');
    expect(SCENE).not.toContain('AZ_BASE * ss(0.05');
    // 镜头必须**骑在链轴上**（方位角与抬高都接近 0）：只要离轴，那些「实/虚」的
    // 投影关系就会随环视而变（离轴偏移在屏上的位移 ∝ 1/dist）⇒ 转视角看出重影
    expect(SCENE).not.toContain('Math.sin(az) * Math.cos(el) + 0.12');
    expect(SCENE).toContain('R * Math.sin(el) + 0.03');
  });

  it('★ 剧场右下角那一格 = CC-BY 署名（站主第九轮 ①），穿过菱窗后收起', () => {
    // 「这里改为署名，但进入窗口后不展示」—— FRAME 读数换成了蝴蝶模型的署名，
    // 这正是 §6.19/§6.21 一直挂着的「发布前必须：CC-BY 可见署名」。
    const html = homepageHtml();
    expect(html).toContain('Monarch Butterfly');
    expect(html).toContain('Paul Spooner');
    expect(html).toContain('CC BY 4.0');
    expect(html).toMatch(/creativecommons\.org\/licenses\/by\/4\.0/);
    // 外链按站规（新窗口 + rel）
    expect(html).toMatch(
      /href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
    );
    // 署名要给读屏读 ⇒ 不再是 aria-hidden
    expect(html).not.toMatch(/class="tsl-hud"[^>]*aria-hidden/);
    // 读数不再写进 DOM（场景里那些 sprite 读数照旧，见上面那条）
    expect(SRC).not.toContain('hud.textContent');
    expect(SRC).not.toContain('FRAME ${'); // 控制器里不再拼这条读数（转出口的 TS_FRAMES 仍在）
    // 进窗口后不展示：按窗口张开进度收掉，并挂 hidden（连外链也不再可点）
    expect(SRC).toContain('const hudOp = 1 - sstep(0.86, 1, tl.zoom);');
    expect(SRC).toContain('hud.style.opacity = String(hudOp);');
    expect(SRC).toContain('hud.hidden = hudOp < 0.02;');
  });

  it('蝴蝶身上无光点粒子：footGlow 已按站主要求移除（尽头只留一团收束背光）', () => {
    expect(SCENE).not.toContain('footGlow');
    expect(SCENE).toContain('AdditiveBlending'); // 背光仍是加色发光
  });

  it('自动跳转：可取消；防回跳死循环改看**读者的动作**（back_forward / bfcache）', () => {
    expect(SRC).toContain('cancelNav');
    expect(SRC).toContain('beginNav');
    expect(SRC).toContain('sessionStorage'); // 跳转前给目标页留交接标记（绿色交接层）
    expect(SRC).toContain("navType !== 'back_forward'");
    expect(SRC).toContain('(e as PageTransitionEvent).persisted');
    /* ★ 站主遇到的「有时进不去」的真因：旧的 15 s sessionStorage 冷却窗会让
       「刚看完相册、按返回键回来、再滚到底」这十几秒内怎么都不跳。已换成
       「按返回键回来的这一次不跳，读者往回滚过链尾即重新武装」。 */
    expect(SRC).not.toContain('tsl-nav-at');
    expect(SRC).not.toContain('15000');
  });

  it('★★ 从绿幕跳过去之后按返回键 ⇒ 滚回主页顶部（站主第十轮报的那屏纯绿）', () => {
    /* 症状：绿幕满屏那一刻 assign 走人，浏览器把主页的滚动位置**记在链尾**
       ⇒ 回来看到「蝴蝶飞到尽头」那一帧：一屏纯绿，滚轮还被 atTail 吞着。 */
    expect(SRC, '跳转前必须写下"是从绿幕走的"标记，否则回来的那次认不出来').toMatch(
      /sessionStorage\.setItem\(EXIT_KEY,\s*'1'\)/,
    );
    expect(SRC, 'EXIT_KEY 常量不见了').toContain("const EXIT_KEY = 'tsl-exit'");
    /* ★ 反向：不许把这个标记与给目标页的那个合并 —— 一个给目标页读、
       一个给来源页读，合起来会让"绿幕交接动画"与"回主页复位"互相触发。 */
    expect(SRC, '两个标记不许用同一个 key').not.toContain("const EXIT_KEY = 'tsl-nav'");
    /* 复位本体：滚动位置是装置唯一的输入，归零即整台归零。
       ★★ 必须**分别**钉两处（rewindToTop 与 pageshow 各一处），不能只钉"文件里有这句"：
       只钉存在性时，把其中一处删掉，另一处仍然匹配 ⇒ 静默通过。
       ★★ 切片必须**切到下一个函数边界**：`slice(indexOf('const rewindToTop'))` 会一路
       切到文件尾、把 pageshow 里那处也包进来 ⇒ 删掉 rewindToTop 的照样绿（实测漏过）。
       这里用「取到 pageshow 之前」来划界。 */
    const rewindBlock = SRC.slice(
      SRC.indexOf('const rewindToTop'),
      SRC.indexOf("window.addEventListener('pageshow'"),
    );
    expect(rewindBlock.length, '没切到 rewindToTop（上下界都没找着？）').toBeGreaterThan(100);
    expect(rewindBlock, 'rewindToTop 里必须真的滚回顶部').toMatch(/window\.scrollTo\(0, 0\);/);
    const showBlock = SRC.slice(SRC.indexOf("window.addEventListener('pageshow'"));
    expect(showBlock, 'pageshow 里必须真的滚回顶部').toMatch(/window\.scrollTo\(0, 0\);/);
    /* ★ 判据是 scrollY 而不是 pRaw：从相册点导航栏回首页也可能是 back_forward，
       但那次不该被弹回顶部 —— 他是从导航来的，不是在链尾。 */
    expect(SRC, '复位条件必须同时要求 scrollY > 0（已在顶部就别动）').toMatch(
      /window\.scrollY <= 0\) return;/,
    );
    expect(SRC, '不许拿装置进度 pRaw 当复位判据').not.toMatch(/rewind[\s\S]{0,300}?pRaw/);
  });

  it('★★ 复位要在**两处**做：首帧（back_forward 整页重载）+ pageshow（bfcache 与竞态兜底）', () => {
    /* bfcache 恢复时脚本**不重跑** ⇒ 初始化那次 consumeExitMark 从没执行过，
       只在初始化里判 ⇒ 恢复路径永远认不出标记 ⇒ bug 原样留着。
       这是"只钉一条取物路径"那个老坑的又一个实例。 */
    const initCall = SRC.indexOf("if (navType === 'back_forward') rewindToTop();");
    const showBlock = SRC.slice(SRC.indexOf("window.addEventListener('pageshow'"));
    expect(initCall, '首帧那次复位不见了（会先闪一屏绿再被弹上去）').toBeGreaterThan(-1);
    expect(showBlock, 'pageshow 里没有复位（bfcache 恢复路径就漏了）').toContain('scrollTo(0, 0)');
    /* pageshow 里必须复用「已经认出来」这个事实，不许重读 sessionStorage：
       标记是"读掉即删"，第二次读必然是 null ⇒ 会静默退化成不复位。 */
    expect(showBlock, 'pageshot 里必须复用 backFromGate 事实，不许重读标记').toMatch(
      /if \(backFromGate \|\| consumeExitMark\(\)\)/,
    );
    expect(showBlock, 'pageshow 复位后也要重新武装（否则回主页后装置失灵）').toMatch(
      /scrollTo\(0, 0\)[\s\S]{0,80}?navOk = true;/,
    );
  });

  it('★★ 复位不改变"防回跳死循环"那道闸（两件事各管各的）', () => {
    /* bfcache 恢复那一刻仍必须 navOk = false —— 那是防"恢复瞬间被弹回相册"；
       复位解决的是"停在链尾那屏绿"，不是"别再弹"。两件事不许互相顶替。 */
    const showBlock = SRC.slice(SRC.indexOf("window.addEventListener('pageshow'"));
    expect(showBlock, 'bfcache 恢复仍必须先关自动跳转的闸').toMatch(
      /if \(persisted\) navOk = false;/,
    );
    /* 标记读掉即删：只影响"接下来的那一次主页加载"，不会反复弹 */
    expect(SRC, 'EXIT_KEY 必须读掉即删').toMatch(
      /sessionStorage\.getItem\(EXIT_KEY\) === null\) return false;[\s\S]{0,80}?removeItem\(EXIT_KEY\)/,
    );
  });

  it('降级四态在脚本侧：reduced-motion / 宽度断点 / 视口停帧都先判再启用', () => {
    expect(SRC).toContain('prefersReducedMotion()');
    expect(SRC).toContain('(min-width: 768px)');
    expect(SRC).toContain('createActivityGate');
    expect(SRC).toContain('gate.onScreen && gate.visible');
  });
});

/* Astro 会给页面样式加 [data-astro-cid-*] 作用域属性 —— 选择器匹配要兼容有无作用域两种形态 */
const at = '\\.[a-zA-Z][a-zA-Z0-9-]*(?:\\[data-astro-cid[^\\]]*\\])?';

describe('时间切片 · 产物骨架（无 JS 可用是底线）', () => {
  it('装置在首页产物里：静态回退层默认在场（菱形 + 相册链接），剧场默认缺席', () => {
    const html = homepageHtml();
    expect(html).toContain('data-tsl');
    expect(html).toContain('data-tsl-static');
    expect(html).toContain('data-tsl-view hidden');
    // 相册入口是无 JS 也点得动的真链接
    expect(html).toMatch(/href="\/gallery\/"[^>]*>(?:<b>)?进入相册/);
    /* ★ 第九轮 ③：「到尽头不要显示进入相册那个按钮」⇒ 「进入相册」胶囊那一块
       （.tsl-cta / .tsl-go）整块删净。剩下的这一条相册链接就是静态回退层那条，
       它同时是脚本读取跳转地址的唯一来源（`goLink` 现在选的是它）。 */
    expect(html).not.toContain('tsl-cta');
    expect(html).not.toContain('tsl-go');
  });

  it('产物 CSS：剧场由 .tsl-on 门控（脚本没挂类 ⇒ 520vh 高度不存在）', () => {
    const css = homepageCss();
    expect(css).toMatch(
      new RegExp(String.raw`\.tsl-on(?:\[data-astro-cid[^\]]*\])? \.tsl-stage(?:\[data-astro-cid[^\]]*\])?\{[^}]*height:520vh`),
    );
    expect(css).toMatch(
      new RegExp(String.raw`\.tsl-on(?:\[data-astro-cid[^\]]*\])? \.tsl-static(?:\[data-astro-cid[^\]]*\])?\{display:none`),
    );
  });

  it('产物 CSS：reduced-motion 与手机档都强制静态回退（双保险，两条形态可区分）', () => {
    const css = homepageCss();
    // reduce 块里带 !important；手机档是不带 !important 的普通规则 —— 两种都要在
    expect(css).toMatch(new RegExp(String.raw`\.tsl-view(?:\[data-astro-cid[^\]]*\])?\{display:none!important\}`));
    expect(css).toMatch(new RegExp(String.raw`\.tsl-view(?:\[data-astro-cid[^\]]*\])?\{display:none\}`));
    expect(css).toContain('prefers-reduced-motion:reduce');
  });

  it('产物 CSS：剧场逃出 .shell（与 .band/.dusk/.paper-wrap 同款 full-bleed 写法）', () => {
    const css = homepageCss();
    expect(css).toMatch(
      new RegExp(String.raw`\.tsl-stage(?:\[data-astro-cid[^\]]*\])?\{[^}]*margin-inline:calc\(50% - 50vw\)`),
    );
  });

  it('产物 CSS：穿窗后全屏转绿的绿幕 = 相册页开场同款深绿（--dusk-1..4 四档 + --accent 光晕）', () => {
    const css = homepageCss();
    const i = css.indexOf('.tsl-green');
    expect(i).toBeGreaterThan(-1);
    const block = css.slice(i, i + 600);
    expect(block).toContain('var(--dusk-1)');
    expect(block).toContain('var(--dusk-4)');
    expect(block).toContain('178deg');
    expect(block).toContain('var(--accent)');
  });
});

describe('时间切片 · 相册页的交接（站主第九轮 ③：缓缓浮上来）', () => {
  it('交接层与内容上浮只在 .tsl-in 那一次播；默认版面逐字节不变', () => {
    const gal = readFileSync('src/pages/gallery/index.astro', 'utf8');
    // ① 交接层：一屏与剧场绿幕同款的深绿（同一组 token、同一条 178deg 梯度）
    expect(gal).toContain('class="tsl-veil"');
    expect(gal).toMatch(/\.tsl-veil\s*\{\s*display:\s*none/); // 没有标记时它不存在
    /* ★ 前导那段**必须** :global()：Astro 的作用域会给选择器里每一段元素级
       选择器都补 data-astro-cid-*，而 `.tsl-in` 挂在 <html>（Base 组件渲染，
       另一个 cid）⇒ 不加 :global 编译出来是 `.tsl-in[data-astro-cid-x] …`，
       **永远匹配不上**，交接层与上浮动效双双静默失效（本轮实测踩到）。 */
    expect(gal).toContain(':global(.tsl-in) .tsl-veil');
    expect(gal).toContain('@keyframes tsl-veil-out');
    expect(gal).toContain('var(--dusk-4)');
    // ② 内容上浮：板里的花体字 + 板下的标题/筛选
    expect(gal).toContain('@keyframes tsl-rise-in');
    expect(gal).toContain(':global(.tsl-in) .bath-mark');
    expect(gal).toContain(':global(.tsl-in) .pagehead-main');
    /* ★ 2026-10-07：上浮的第二组元素从「筛选条」换成了「相册入口条」——
       筛选随"一册一页"一起取消了（页内再筛一个只有一个选项的集合没有意义），
       现在页头之下最先浮上来的是那几条入口。 */
    expect(gal).toContain(':global(.tsl-in) .rows');
    // 站规：位移只用 transform、显隐只用 opacity；减少动效的读者整套不播
    expect(gal).toContain('prefers-reduced-motion: no-preference');
    expect(gal).toMatch(/transform:\s*translateY\(1\.1rem\)/);
    // ③ 交接标记必须在**首次绘制之前**挂上（<head> 里的同步脚本）
    const base = readFileSync('src/layouts/Base.astro', 'utf8');
    expect(base).toContain("sessionStorage.getItem('tsl-nav')");
    expect(base).toContain("classList.add('tsl-in')");
    // 主页装置在跳转前写下同一个键
    expect(SRC).toContain("const NAV_HANDOFF_KEY = 'tsl-nav';");
    expect(SRC).toContain('sessionStorage.setItem(NAV_HANDOFF_KEY');
  });

  /* ★★ 上面那条全是**源码**断言，而本轮出问题的恰恰是「源码对、编译后错」：
     `.tsl-in .tsl-veil` 在源码里一字不差，编译出来却多了个挂不到 <html> 上的
     `data-astro-cid-*` ⇒ 页面上规则全失效（探针读到 display:none）。
     ⇒ 补一条**产物级**断言：编译后的选择器只许给最后那段加作用域属性。 */
  it('产物 CSS：交接层选择器真的匹配得上（作用域只加在最后那段）', () => {
    const css = distCss();
    expect(css).toContain(':root'); // 有东西可查（防空跑成恒真）
    expect(css).toMatch(/\.tsl-in\s+\.tsl-veil\[data-astro-cid-[a-z0-9]+\]/);
    expect(css).not.toMatch(/\.tsl-in\[data-astro-cid-[a-z0-9]+\]\s+\.tsl-veil/);
    expect(css).toMatch(/\.tsl-in\s+\.pagehead-main\[data-astro-cid-[a-z0-9]+\]/);
    // 主页那一格署名同理：它是「深底上的链接」，必须用深底链色，不能落到
    // 全站 `a{color:var(--accent-ink)}` 那条纸上链色（深底上几乎看不见）
    const home = homepageCss();
    expect(home).toMatch(/\.tsl-hud\[data-astro-cid-[a-z0-9]+\]\s+a\[data-astro-cid-[a-z0-9]+\]/);
    expect(home).toMatch(/color:var\(--accent-bright\)/);
  });
});
