/**
 * 立体 ∞（FinInfinity）· 装置门闩。
 *
 * 移植自 `tmc5csxr9m-cpu/rhine-lock` 的 ∞ fin sculpture，所以这一组断言守的是
 * **「原版的形状与手感有没有被照抄」** —— 一旦照搬错了地方（几何退化、鳍片数不对、
 * 扭转/前倾丢了），肉眼未必看得出来，但那就是「不是原汁原味」了。
 *
 * ★ 判据设计（守关系 / 守原版常量，不守快照）：
 *   · 原版的参数是**量出来的**（radius 285 / aspect 0.95 / depth 95 / twist 1.5 …），
 *     所以这些数字本身就该钉住 —— 它们不是"当前实现长这样"，是"原版就是这样"。
 *   · 几何那三行（Gerono 双纽线）单独钉：z = uDepth·sin(t) 是**自相交**的成因，
 *     少了它 ∞ 就退化成两条不相交的椭圆弧，整个形状立刻不对。
 *   · 点击脉冲必须真的连到 pointerdown —— ★ 原版**没有**点击交互（整份 Stage.ts
 *     里没有 Raycaster），脉冲原本由键盘触发。这是本轮**新加**的功能，
 *     所以必须有判据守着，否则它会被当成"原版就有"而被误删。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const shaders = readFileSync('src/scripts/fin-shaders.ts', 'utf8');
const scene = readFileSync('src/scripts/fin-scene.ts', 'utf8');
const ctrl = readFileSync('src/scripts/fin-infinity.ts', 'utf8');
const comp = readFileSync('src/components/FinInfinity.astro', 'utf8');
const astroCfg = readFileSync('astro.config.mjs', 'utf8');
const passVendor = readFileSync('src/vendor/three-examples/postprocessing/Pass.js', 'utf8');
const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const aboutSrc = readFileSync('src/pages/about.astro', 'utf8');

/** 从源码里取一个数值（`name: 285` / `value: 285`） */
const num = (src: string, name: string): number => {
  const m = src.match(new RegExp(`${name}[^0-9\\-]{0,4}(-?[0-9]+(?:\\.[0-9]+)?)`));
  return m ? Number(m[1]) : NaN;
};

/* 按「从这行到下一个顶层 `});`」切出一个监听器的函数体，
   并**剥掉注释**再返回。
   ★ 两个坑都在这里踩过（都是变异验证抓出来的，不是想出来的）：
     ① 用 `indexOf('});')` 切边界会跨过嵌套的箭头函数/对象字面量 ——
        实测 `pointerdown` 那样切出来是 4754 字符，跨到了文件后半段，判据假绿。
        ⇒ 改成取到下一个「行首 `});` 或 `addEventListener`」为止。
     ② **剥注释**：把调用注释掉（`/* scene.pulse(0.25); *\/`）之后，
        正则照样能在注释里匹配到 `scene.pulse(` ⇒ 变异漏过。
        同类错误在配色那条也犯过一次（`rlPaper` 只存在于注释里）。
        ⇒ 任何"某行**不该**再出现 X"的判据，都必须先剥注释。 */
function handlerBody(src: string, marker: string): string {
  const i = src.indexOf(marker);
  if (i < 0) return '';
  const rest = src.slice(i);
  const m = /\n\s*\}\);|\n\s*addEventListener\(/.exec(rest.slice(1));
  const body = m ? rest.slice(0, m.index + 1) : rest;
  return body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

describe('立体 ∞ · 几何照抄原版（rhine-lock ∞ fin sculpture）', () => {
  it('Gerono 双纽线那三行在（z 让两瓣在纵深上错开 ⇒ 带子能自相交）', () => {
    // 逐项分开判，不写成一个正则 —— 否则改动一下空格就整条失效
    expect(shaders, 'x = uRadius * cos(t) 不见了').toMatch(/uRadius\s*\*\s*c\b/);
    expect(shaders, 'y = uRadius * uAspect * s * c 不见了').toMatch(/uRadius\s*\*\s*uAspect\s*\*\s*s\s*\*\s*c/);
    expect(shaders, '★ z = uDepth * s 不见了 —— 这行是自相交的成因，掉了形状就错')
      .toMatch(/uDepth\s*\*\s*s\b/);
  });

  it('鳍片数是 400（原版 FIN_COUNT）', () => {
    expect(scene, 'FIN_COUNT 必须是 400').toMatch(/FIN_COUNT\s*=\s*400/);
    // InstancedBufferGeometry 且 instanceCount = count（原版 instanced() 的做法）
    expect(scene, '没有走 InstancedBufferGeometry').toMatch(/InstancedBufferGeometry/);
    expect(scene, '没有 aIndex 实例属性').toMatch(/aIndex/);
  });

  it('原版那组几何参数逐字保留（这些是量出来的，不是随手调的）', () => {
    /* ★ 参数集中在 FIN_PARAMS 常量里，uniform 从那里读（`uRadius: { value: FIN_PARAMS.radius }`）。
       所以判据读那个常量块，而不是去grep 每个 uniform —— 否则改个写法就假红。*/
    const block = scene.slice(scene.indexOf('FIN_PARAMS'), scene.indexOf('} as const'));
    const P: [string, number][] = [
      ['radius', 285], ['aspect', 0.95], ['depth', 95],
      ['twist', 1.5], ['lean', 0.62], ['thickness', 4.2],
      ['width', 84], ['height', 84],
    ];
    for (const [k, v] of P) {
      const got = num(block, `${k}`);
      expect(Number.isFinite(got), `FIN_PARAMS 里读不到 ${k}`).toBe(true);
      expect(got, `FIN_PARAMS.${k} 变成了 ${got}，原版是 ${v}（照搬被改动了）`).toBe(v);
    }
    /* uniform 必须真的接到这些常量上（常量对了但没接上 = 装置仍是默认值） */
    for (const k of ['uRadius', 'uAspect', 'uDepth', 'uTwist', 'uLean', 'uThickness', 'uWidth', 'uHeight']) {
      expect(scene, `${k} 没有接到 FIN_PARAMS`).toMatch(new RegExp(`${k}:\\s*\\{\\s*value:\\s*FIN_PARAMS\\.`));
    }
  });

  it('扭转 / 前倾 / 流动三套运动都在（去掉任一个 ∞ 就变成静态标本）', () => {
    // 绕切线扭转 phi = uTwist * t + wave + ...
    expect(shaders).toMatch(/uTwist\s*\*\s*t/);
    // 两段不同频率的波（单一正弦会看起来很机械）
    // 判据不用 `sin(2.0…t[\s\S]{0,80}sin(5.0…t` 那种带字符数上限的写法 ——
    // 上限会因排版变动而假绿。改成：分别在曲线函数体内各找一次。
    const curveBody = shaders.slice(shaders.indexOf('void rl_finTransform'));
    expect(curveBody.slice(0, curveBody.indexOf('rl_easeOutBack(') + 400),
      '只剩一段正弦波，原版是双频叠加')
      .toMatch(/sin\(\s*2\.0\s*\*\s*t[\s\S]*?sin\(\s*5\.0\s*\*\s*t/);
    // 前倾 lean（带呼吸）
    expect(shaders).toMatch(/float\s+lean\s*=\s*uLean/);
    // 整条带子沿曲线流动 uFlow
    expect(scene).toMatch(/uFlow/);
  });

  it('装配动画是余弦缓入（原版 0.5 - 0.5cos(πx)），不是线性', () => {
    /* 装配的缓动在 **场景侧**（每帧推进 uAssemble），着色器只负责按 uAssemble
       摆位（它那边是 rl_easeOutBack，负责单片鳍的"弹出"）。两处别搞混。*/
    expect(scene, '装配缓动不在场景文件里').toMatch(/0\.5\s*-\s*0\.5\s*\*\s*Math\.cos/);
    /* 单片鳍的弹出缓动在着色器里（原版 rl_easeOutBack）*/
    expect(shaders, '单片鳍的 rl_easeOutBack 不见了').toMatch(/rl_easeOutBack/);
  });

  it('用 MeshStandardMaterial + onBeforeCompile，而不是裸 ShaderMaterial', () => {
    /* 走标准材质才能白拿 three 的光照/阴影/深度预通道 —— n8ao 要读深度图，
       裸 ShaderMaterial 就得自己接一遍。原版也是这么做的。 */
    expect(scene).toMatch(/MeshStandardMaterial/);
    expect(scene).toMatch(/onBeforeCompile/);
    expect(scene, '不许换成裸 ShaderMaterial（会丢掉阴影与AO 所需的深度输出）')
      .not.toMatch(/new\s+ShaderMaterial/);
  });
});

describe('立体 ∞ · 点击脉冲（★ 本轮新加，原版没有）', () => {
  it('脉冲挂在 pointerdown 上（原版是由键盘触发的，rhine-lock 的 lock.svelte.ts:305）', () => {
    expect(ctrl, '没找到 pointerdown 监听').toMatch(/pointerdown/);
    /* ★ 判据不能写成 `pointerdown[\s\S]{0,400}scene\.pulse\(` ——
       那种写法有两个洞，变异验证已经把它们都试出来了：
         ① 字符数上限：脉冲调用离监听超过 N 行就查不到（改个顺序就假绿）；
         ② 顺序假设：默认 pulse 在监听「之前」，倒过来写就漏。
       正确做法：切出 pointerdown 那个监听函数的**函数体**，在里面找 pulse ——
       与距离、顺序都无关。*/
    expect(ctrl, '没找到 pointerdown 监听').toMatch(/pointerdown/);
    const body = handlerBody(ctrl, 'pointerdown');
    expect(body.length, '切不出 pointerdown 监听器的函数体（判据本身坏了）').toBeGreaterThan(0);
    expect(body, 'pointerdown 监听里没有调用 pulse() —— 点击反馈被摘掉了')
      .toMatch(/scene\.pulse\s*\(/);
  });

  it('脉冲沿曲线跑：16 槽环形缓冲（与原版同构）', () => {
    expect(shaders, '着色器里的脉冲槽数不是 16').toMatch(/for\s*\(int\s+i\s*=\s*0;\s*i\s*<\s*16;/);
    expect(scene, 'JS 侧的环形缓冲不是 16槽').toMatch(/new\s+Float32Array\(16\)/);
    expect(scene, '环形缓冲没有轮转（每次都覆盖同一槽 ⇒ 只剩一道光）').toMatch(/pulseSlot\s*=\s*\(i\s*\+\s*1\)\s*%\s*16/);
    /* 初值 -99 ⇒ age 恒为负 ⇒ 首帧没有幽灵脉冲（原版就这么写的） */
    expect(scene, '脉冲初值必须是 -99（否则首帧就有残留光）').toMatch(/Float32Array\(16\)\.fill\(-99\)/);
  });

  it('点击不抢正文交互（点在链接/按钮上不触发）', () => {
    expect(ctrl, '没有排除交互元素').toMatch(/closest\(['"`]a,button,input/);
  });
});

describe('立体 ∞ · 后处理（postprocessing + n8ao）', () => {
  it('AO 用的是 N8AOPostPass，且参数照搬原版', () => {
    expect(scene).toMatch(/N8AOPostPass/);
    expect(scene).toMatch(/EffectComposer/);
    expect(scene).toMatch(/RenderPass/);
    // 原版 Stage.ts:271-277 的那组数
    expect(num(scene, 'aoRadius'), 'aoRadius 应为 26').toBe(26);
    expect(num(scene, 'distanceFalloff'), 'distanceFalloff 应为 1.2').toBe(1.2);
    expect(num(scene, 'intensity'), 'AO intensity 应为 2.2').toBe(2.2);
  });

  it('composer 必须单独 setSize（只设 renderer 不够，AO 会按 1920×1080 采样）', () => {
    expect(scene, 'resize 里没调 composer.setSize').toMatch(/composer\.setSize\(/);
  });

  it('★ 只调 composer.render，不再单独 renderer.render（否则场景画两遍）', () => {
    const code = scene.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
    expect(code, 'composer.render 那一行不见了').toMatch(/composer\.render\(/);
    /* 行首锚点：注释里那行前面是 `*` / `//`，不会被`^\s*renderer\.render\(` 匹配上 */
    const rawRenders = code.match(/^\s*renderer\.render\(/gm) ?? [];
    expect(rawRenders.length, 'renderer.render 与 composer.render 同时存在 ⇒ 场景被画了两遍').toBe(0);
  });

  it('three/examples/jsm 的 Pass.js 已 vendor 化，且 alias 排在 three 之前', () => {
    /* n8ao 引的是 `three/examples/jsm/postprocessing/Pass.js`；本仓的 three 是
       vendored 单文件 bundle，没有 examples 目录 ⇒ 必须单独 vendor + 单独 alias。
       ⚠ Vite 的 alias 对 find 字符串做**前缀匹配**，所以这条 alias 必须排在
         `three: …` 前面，否则会被吸成 three.module.min.js/examples/...（实测踩过）。 */
    expect(passVendor, 'vendor 的 Pass.js 没有来源说明').toMatch(/three\.js r\d+\.\d+/);
    const idxPass = astroCfg.indexOf("'three/examples/jsm/postprocessing/Pass.js'");
    const idxThree = astroCfg.indexOf("find: 'three',");
    expect(idxPass, 'astro.config 里没有 three/examples/jsm 的 alias').toBeGreaterThan(-1);
    expect(idxThree, 'astro.config 里没有裸 three 的 alias').toBeGreaterThan(-1);
    expect(idxPass, '★ three/examples 的 alias 必须排在裸 three 之前（Vite 取最长匹配，顺序错就构建失败）')
      .toBeLessThan(idxThree);
  });

  it('两个包都在运行时白名单里', () => {
    const deps = readFileSync('tests/_deps.ts', 'utf8');
    expect(deps).toMatch(/'n8ao'/);
    expect(deps).toMatch(/'postprocessing'/);
  });
});

describe('立体 ∞ · 配色走 token（站规 §3 第 2 条：组件里不许写字面色值）', () => {
  it('着色器里没有硬编码的 RGB 三元组（本体色那几处）', () => {
    /* 原版把配色写死在着色器里（rlPaper / rlGraphite / orange / lime 四档）。
       本站改成从 CSS token 传进来 —— 这一条守的就是「别又写回去」。
       ⚠ 两条排除，否则会误伤照搬过来的东西：
         ① 剥掉注释（注释里记录原版色值是有意的，不是代码）；
         ② 排除 `vec3(1.0, 0.92, 0.8)` —— 那是**笔尖高光**（vTip），
            原版 `finEmissiveGlsl` 里就有，是装配扫过时前沿那道白光，
            与「本体色写死」是两回事，把它算进来就等于不许照搬。*/
    const code = shaders
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ')
      .replace(/vec3\(\s*1\.0\s*,\s*0\.92\s*,\s*0\.8\s*\)/g, '/* vTip 白光·原版既有 */');
    const hits = code.match(/vec3\s*\(\s*0\.\d+\s*,\s*0\.\d+\s*,\s*0\.\d+\s*\)/g) ?? [];
    expect(hits, `着色器里又出现了写死的颜色三元组：${hits.join(' ')}`).toHaveLength(0);
  });

  it('鳍片本体色由 uniform 传入，且两端分别取自 token', () => {
    expect(shaders).toMatch(/uBodyLight/);
    expect(shaders).toMatch(/uBodyDark/);
    /* ★ 判据必须**剥掉注释**再查：`rlPaper` / `rlGraphite` 这两个名字在注释里
       是有意保留的（记录原版那两个色值，好让下一个人知道"原来是什么"）。
       不剥注释就会把"有注释说明"误判成"代码又写死了"。
       （这正是 tags-crosshair.test.ts:272 早就用过的手法 —— 别重复踩。）*/
    const code = shaders.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
    expect(code, '本体色仍在着色器里插值写死，而不是走 uBodyLight/uBodyDark')
      .not.toMatch(/rlPaper|rlGraphite/);
    expect(tokens, 'tokens.css 缺 --fin-body-light').toMatch(/--fin-body-light/);
    expect(tokens, 'tokens.css 缺 --fin-body-dark').toMatch(/--fin-body-dark/);
    const darkIdx = tokens.indexOf('html.dark {');
    const dark = tokens.slice(darkIdx);
    expect(dark, 'tokens.css 的 html.dark 段里没有覆写 --fin-body-dark')
      .toMatch(/--fin-body-dark/);
  });

  it('★ 暗色档的鳍片色不能等于 --paper（那会整台装置消失）', () => {
    const dark = tokens.slice(tokens.indexOf('html.dark {'));
    const m = dark.match(/--fin-body-dark:\s*(#[0-9a-fA-F]{6})/);
    const p = dark.match(/--paper:\s*(#[0-9a-fA-F]{6})/);
    expect(m?.[1], '读不到 --fin-body-dark').toBeTruthy();
    expect(p?.[1], '读不到暗色段的 --paper').toBeTruthy();
    expect(m![1], `暗色鳍片色 ${m![1]} 与底色 ${p![1]} 相同 ⇒ 装置在暗色模式下看不见`).not.toBe(p![1]);
  });

  it('主题切换时色板与 uDenied 要一起换（只换后者会停在上一档色值上）', () => {
    expect(ctrl, '主题切换没有调 setPalette').toMatch(/setPalette\(/);
    expect(ctrl, '主题切换没有调 setDenied').toMatch(/setDenied\(/);
    expect(scene, '场景没有提供 setPalette').toMatch(/function setPalette\(/);
  });

  it('uDenied 是硬切不是淡入淡出（原版 App.svelte:195「a cut, hidden by the tear」）', () => {
    /* 照搬原版：直接赋值。若有人改成缓动，主题切换就会变成"渐变"。 */
    expect(scene, 'uDenied 不该被缓动 —— 原版是刻意的硬切')
      .not.toMatch(/denied\s*\+=\s*\([^)]*deniedTarget/);
    expect(scene).toMatch(/denied\s*=\s*deniedTarget/);
  });
});

describe('立体 ∞ · 只住在关于页、且降级完整', () => {
  it('只挂在关于页，且旧百褶已从关于页消失', () => {
    expect(aboutSrc).toContain('<Fragment slot="plate"><FinInfinity /></Fragment>');
    expect(aboutSrc, 'about.astro 还 import 着百褶（它已搬到标签页）')
      .not.toMatch(/import PleatedInfinity/);
    expect(aboutSrc, '硬编码的旧槽位写法还在').not.toMatch(/<PleatedInfinity/);
  });

  it('静态回退层 + hidden 门控都在（无 JS / reduced-motion 时装置有内容可看）', () => {
    expect(comp).toMatch(/data-fin-static/);
    expect(comp).toMatch(/data-fin-cv/);
    expect(comp, 'WebGL 层初始必须 hidden（脚本判定可跑才放开）').toMatch(/data-fin-view[^>]*hidden/);
  });

  it('★ 显隐用 opacity，不用 display:none（AGENTS 事故表 ★★★★：画布尺寸是量出来的）', () => {
    /* display:none 时 getBoundingClientRect 全是 0 ⇒ renderer 按 0 尺寸初始化
       ⇒ 永远画不出来。这条是踩过的坑，不是洁癖。 */
    const canvasBlock = comp.slice(comp.indexOf('.fin-view canvas'), comp.indexOf('@media'));
    expect(canvasBlock, 'canvas 用了 display:none —— 尺寸会量成 0').not.toMatch(/display:\s*none/);
  });

  it('停帧门控齐了：视口外 / 切标签 / reduced-motion / 窄屏', () => {
    expect(ctrl, '没有用 createActivityGate（视口外/切标签停帧）').toMatch(/createActivityGate/);
    expect(ctrl).toMatch(/prefers-reduced-motion/);
    expect(ctrl).toMatch(/max-width:\s*767px/);
    /* ★★ 这一条要让「注释掉整个监听」也被咬住，所以判据本身必须查**剥掉注释后**的代码。
     踩过的坑：`addEventListener('webglcontextlost'` 被 `//` 注掉后，
     `indexOf('webglcontextlost')` **照样找得到**（它在注释里），
     而往下切出来的"函数体"跨到了 `webglcontextrestored` 那个监听 ——
       那里恰好也有 enable/disable ⇒ 判据假绿。
     ⇒ 先剥注释，再找监听、再切片、再查 preventDefault。 */
    const code = ctrl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
    expect(code, '没有处理 WebGL 上下文丢失（监听被注释掉了？）').toMatch(/webglcontextlost/);
    const body = handlerBody(code, 'webglcontextlost');
    expect(body.length, '切不出 webglcontextlost 的函数体（判据本身坏了）').toBeGreaterThan(0);
    expect(body, 'webglcontextlost 里必须 preventDefault，否则浏览器不会再派发 restored')
      .toMatch(/preventDefault/);
  });

  it('启动失败要退回静态层，不留空画布', () => {
    /* 同样先剥注释 —— 这条判的是「失败路径存在」，
       把它整段注释掉是最自然的破坏方式，判据必须咬得住。 */
    const code = ctrl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
    expect(code, '没有 catch 启动失败').toMatch(/\.catch\(/);
    expect(code, '失败时没有把静态层放回来').toMatch(/staticLayer\?\.removeAttribute\('hidden'\)/);
  });

  it('颜色由控制器从 token 取，场景文件里不出现色值字面量', () => {
    expect(ctrl, '控制器没有从 getComputedStyle 取色').toMatch(/getComputedStyle/);
    const hexInScene = scene.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    // three 的 0xffffff 灯色是允许的（那是光不是表面色），这里只查 # 形式
    expect(hexInScene, `场景文件里出现了字面色值：${hexInScene.join(' ')}`).toHaveLength(0);
  });
});