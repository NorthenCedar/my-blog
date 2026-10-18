/**
 * 立体 ∞（FinInfinity）· 装置门闩。
 *
 * 移植自 `tmc5csxr9m-cpu/rhine-lock` 的 ∞ fin sculpture，所以这一组断言守的是
 * **「原版的形状与手感有没有被照抄」** —— 一旦照搬错了地方（几何退化、鳍片数不对、
 * 扭转/前倾丢了），肉眼未必看得出来，但那就是「不是原汁原味」了。
 *
 * ★ 判据设计（守关系 / 守原版常量，不守快照）：
 *   · 保留原版的半径、比例、厚度等参数。扭转量由首尾连续性约束：原版 1.5 圈
 *     配合非零前倾会在参数归零处跳变，本站改为整圈，不能再把旧值钉成规格。
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
const grade = readFileSync('src/scripts/fin-grade.ts', 'utf8');
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
   ★ 三个坑都在这里踩过（前两个是变异验证抓出来的，第三个是手工目检发现的真 bug）：
     ① 用 `indexOf('});')` 切边界会跨过嵌套的箭头函数/对象字面量 ——
        实测 `pointerdown` 那样切出来是 4754 字符，跨到了文件后半段，判据假绿。
        ⇒ 改成取到下一个「行首 `});` 或 `addEventListener`」为止。
     ② **剥注释**：把调用注释掉（`/* scene.pulse(0.25); *\/`）之后，
        正则照样能在注释里匹配到 `scene.pulse(` ⇒ 变异漏过。
        同类错误在配色那条也犯过一次（`rlPaper` 只存在于注释里）。
        ⇒ 任何"某行**不该**再出现 X"的判据，都必须先剥注释。
     ③ **剥注释必须在定位 marker 之前**（2026-10-18 加）：原先是
        `indexOf(marker)` 先在带注释的原文上跑、`剥注释` 放在最后 ——
        于是注释里写一句「pointerdown 原来挂在 host 上」就会把 marker 抢走，
        切出的是一行注释而不是函数体 ⇒ 判据假红。
        剥注释用空格替换（不删字符），行结构不变，切边界逻辑照旧可用。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length))
    .replace(/\/\/.*$/gm, m => ' '.repeat(m.length));
}

function handlerBody(src: string, marker: string): string {
  const code = stripComments(src);
  const i = code.indexOf(marker);
  if (i < 0) return '';
  const rest = code.slice(i);
  const m = /\n\s*\}\);|\n\s*addEventListener\(/.exec(rest.slice(1));
  return m ? rest.slice(0, m.index + 1) : rest;
}

/** 切出一个具名函数（或方法）的函数体：按大括号配平，剥掉注释。
 *  比 handlerBody 通用 —— handlerBody 只认 `});` / addEventListener 两种边界。 */
function fnBody(src: string, name: string): string {
  const code = stripComments(src);
  const start = code.search(new RegExp(`(?:function\\s+${name}\\b|\\b${name}\\s*\\([^)]*\\)\\s*\\{)`));
  if (start < 0) return '';
  let i = code.indexOf('{', start);
  if (i < 0) return '';
  let depth = 0;
  for (let j = i; j < code.length; j++) {
    if (code[j] === '{') depth++;
    else if (code[j] === '}' && --depth === 0) return code.slice(i + 1, j);
  }
  return code.slice(i + 1);
}

describe('立体 ∞ · 时间单位与速率（★ 2026-10-18 真机实测揪出的真 bug）', () => {
  /* 背景：rl-core 的 startLoop 给的 dt 是**毫秒**（`now - last`，钳 100）。
     render() 原先写 `Math.min(dt, 0.05)` —— 把毫秒当秒 ⇒ step 恒等于 0.05
     ⇒ 时间流速 = 「0.05 × 帧率」秒/秒，与真实时间脱钩：
       无头软渲染 15.6fps 下 uTime 只有 0.78/秒（看着像变慢，其实是巧合），
       真机 60Hz 就是 3.0/秒（3 倍速）、144Hz 是 7.2/秒。
     uFlow / uSpin / 脉冲 age 全走 uTime，所以「动得太快、脉冲也太快」。
     同函数下面 `composer.render(dt / 1000)` 早就承认 dt 是毫秒，只有上面那行漏了。 */

  it('render 把毫秒换成了秒（下游一律拿秒）', () => {
    const body = fnBody(scene, 'render');
    expect(body.length, '切不出 render 的函数体（判据本身坏了）').toBeGreaterThan(0);
    /* step 必须从入参派生**并且**做毫秒→秒转换。
       只判「有没有 / 1000」不够（可能在别处做），所以同时要求：
         · step 的定义里出现 / 1000
         · 秒基准变量在同一条语句里被累加（seconds += step） */
    const stepDef = /const\s+step\s*=\s*([^;]+);/.exec(body);
    expect(stepDef, 'render 里没有 const step = ...（判据本身坏了）').toBeTruthy();
    expect(stepDef![1], 'step 没做毫秒→秒的转换 —— dt 是毫秒，这行漏了就是 3~7 倍速')
      .toMatch(/\/\s*1000\b/);
    expect(stepDef![1], 'step 必须由入参 dt 派生，不能写死').toMatch(/\bdt/i);
    expect(body, 'seconds 没有用 step 推进（时间基准断了）').toMatch(/seconds\s*\+=\s*step\b/);
  });

  it('后处理与几何共用同一个时间基准（同一个 step）', () => {
    const body = fnBody(scene, 'render');
    /* ★ 同一个 dt 在同一个函数里被当成两种单位，就是这个 bug 的成因。
       守卫关系而不是记参数：composer 必须收到那个已经换算过的 step，
       不能再单独读一次入参。 */
    expect(body, 'composer.render 没有收到换算后的 step').toMatch(/composer\.render\(\s*step\s*\)/);
    expect(body, 'composer.render 又直接读了入参 ⇒ 同一函数里两种单位')
      .not.toMatch(/composer\.render\(\s*dt/i);
  });

  it('速率与原版的比例一致：flow : spin : time = 1.6 : 0.05 : 1', () => {
    /* ★ 守的是**比例**，不是绝对值 —— 以后整体调快/调慢不必动这条判据，
       但三者之间的相对关系必须与原版一致（Stage.ts:382-383）。
       原版：flow += dt*1.6；spin += dt*0.05；time += dt。 */
    const body = fnBody(scene, 'render');
    const flow = /uFlow\.value\s*=\s*\(\s*U\.uFlow\.value\s*\+\s*step\s*\*\s*([\d.]+)\s*\)/.exec(body);
    const spin = /uSpin\.value\s*\+=\s*step\s*\*\s*([\d.]+)/.exec(body);
    expect(flow, 'uFlow 没有按 step * k 推进（判据本身坏了）').toBeTruthy();
    expect(spin, 'uSpin 没有按 step * k 推进（判据本身坏了）').toBeTruthy();
    /* 带余量，不写零容差快照 */
    expect(Number(flow![1]), 'flow 相对 time 的速率应≈1.6（原版 Stage.ts:382）')
      .toBeCloseTo(1.6, 1);
    expect(Number(spin![1]), 'spin 相对 time 的速率应≈0.05（原版 Stage.ts:383）')
      .toBeCloseTo(0.05, 2);
  });

  it('装配动画是秒级的（原版 playAssemble 默认 2300ms）', () => {
    /* 原来写 0.5 秒不是原版值（2.3 秒），叠加 dt 单位 bug 后实际只跑 0.167 秒，
       笔触画出来的过程肉眼根本看不到。判据给区间：必须是以秒计的量级。 */
    const dur = /ASSEMBLE_DUR\s*=\s*([\d.]+)/.exec(stripComments(scene));
    expect(dur, '找不到 ASSEMBLE_DUR').toBeTruthy();
    expect(Number(dur![1]), '装配时长被压到亚秒级（原版是 2.3 秒的笔触动画）')
      .toBeGreaterThan(1.5);
    expect(Number(dur![1]), '装配时长不该拖到十秒级').toBeLessThan(4);
  });

  it('两盏灯都有色温（原版 key 暖白 / fill 冷蓝），不是纯白', () => {
    /* ★ 亮色档「发棕」的直接成因：原版 key=0xfff6ea（暖白）、fill=0xdfe8ff（冷蓝），
       两者的色温差互相抵消，出来的是中性亮白。本站原先两盏都写 0xffffff，
       等于把色温对比抹平，暖调全靠 body 色撑着 ⇒ 整台雕塑偏棕。 */
    const code = stripComments(scene);
    const lamps = [...code.matchAll(/new\s+DirectionalLight\(\s*(0x[0-9a-fA-F]{6})\s*,\s*([\d.]+)/g)]
      .map(m => ({ color: m[1].toLowerCase(), intensity: Number(m[2]) }));
    expect(lamps.length, '没找到两盏方向光（判据本身坏了）').toBe(2);
    for (const l of lamps) {
      expect(l.color, `灯 ${l.color} 是纯白 —— 原版两盏都有色温（0xfff6ea / 0xdfe8ff）`)
        .not.toBe('0xffffff');
    }
    /* 暖白 + 冷蓝：R 通道一个高一个低，方向相反 */
    const warm = lamps.find(l => l.color === '0xfff6ea');
    const cool = lamps.find(l => l.color === '0xdfe8ff');
    expect(warm, '找不到原版的暖白 key（0xfff6ea）').toBeTruthy();
    expect(cool, '找不到原版的冷蓝 fill（0xdfe8ff）').toBeTruthy();
    /* 原版强度：key 3.4 / fill 0.55，key 明显更亮 */
    expect(warm!.intensity, 'key 强度应≈3.4（原版 LOOK.key）').toBeCloseTo(3.4, 1);
    expect(cool!.intensity, 'fill 强度应≈0.55（原版 LOOK.fill）').toBeCloseTo(0.55, 2);
  });

  it('亮色档本体色够亮（原版 rlPaper = 0.935/0.895/0.830 ⇒ 绿通道 228）', () => {
    /* 原来是 #ddd6c6（绿 214），暗一大截 ⇒ 雕塑看着像土黄/棕色而不是纸白。
       判据守"亮度下限"，不锁死具体色值（色温微调不必改判据）。 */
    const m = /--fin-body-light:\s*(#[0-9a-fA-F]{6})/.exec(tokens);
    expect(m, 'tokens.css 缺 --fin-body-light').toBeTruthy();
    const g = parseInt(m![1].slice(3, 5), 16);
    expect(g, `亮色档本体色太暗（原版绿通道 228，当前 ${g}）⇒ 在纸白页面上看着发棕`)
      .toBeGreaterThanOrEqual(220);
  });

  it('亮色档本体色不比页面纸白更暖（否则读成奶油黄）', () => {
    /* ★ 第二次栽在同一个坑上：上一版把本体色照抄成原版的暖纸 #efe4d3，
       亮度够了、看着还是黄。原因是**包围色变了** ——
       原版页面底是暖灰纸 #e7e5e1（R−B = 6）且比雕塑暗，暖白鳍片压上去读作"白"；
       本站纸白是 #fafaf7（R−B = 3）且比雕塑亮，同一个暖白就成了奶油黄。
       同一个绝对色值，换了底就换了观感。
       所以判据守**关系**（本体相对纸白的暖度差），不守固定色值 ——
       0 是纯中性，超过 8 肉眼就是黄。 */
    /* 取**首次出现**：亮色档的 :root 定义排在 html.dark 的覆写之前
       （--paper 的深色覆写在 522 行之后，这里读到的仍是纸白那一档）。 */
    const rgb = (name: string): [number, number, number] => {
      const m = new RegExp(`${name}:\\s*#([0-9a-fA-F]{6})`).exec(tokens);
      expect(m, `tokens.css 里缺 ${name}`).toBeTruthy();
      const v = m![1];
      return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
    };
    const body = rgb('--fin-body-light');
    const paper = rgb('--paper');
    const bodyWarm = body[0] - body[2];
    const paperWarm = paper[0] - paper[2];
    expect(bodyWarm - paperWarm,
      `本体比纸白暖 ${bodyWarm - paperWarm} 阶（本体 R−B ${bodyWarm} / 纸白 R−B ${paperWarm}）`
      + ' ⇒ 纸白页面上会读成奶油黄')
      .toBeLessThanOrEqual(8);
  });

  it('装置的橙与 UI 的橙是两档（可各自调）', () => {
    /* 原版的橙过了 grade 管线里的 sat 0.7（Khronos PBR Neutral 再降饱和），
       本站没有那层，同一个 #ff7b00 直出就偏艳。所以装置单独走--fin-glow-dark。 */
    const g = /--fin-glow-dark:\s*(#[0-9a-fA-F]{6})/.exec(tokens);
    expect(g, 'tokens.css 缺 --fin-glow-dark（装置的自发光不该跟 UI 强调色绑死）').toBeTruthy();
    const accent = /--accent:\s*(#[0-9a-fA-F]{6})/.exec(tokens);
    expect(accent).toBeTruthy();
    expect(g![1].toLowerCase(), '装置的橙又绑回 --accent 了 ⇒ 两个档没法分开调')
      .not.toBe(accent![1].toLowerCase());
    expect(ctrl, '控制器没读 --fin-glow-dark').toMatch(/--fin-glow-dark/);
  });
});

describe('立体∞ · grade（★ 修「发棕」的根因）', () => {
  /* 实测（2026-10-18，装置区域最亮 5% 像素）：
     没有 grade 时 #F7EAC7，**R−B 差 48.3**、中位饱和度 0.271、亮度中位 106；
     有了 grade 之后 #F3EBDE，R−B 差 21.0、饱和度 0.102、亮度中位 186。
     「棕」在这里不是主观形容，是这一个可比的数字 —— 中性白该是 5~10，
     连原版纸色 (239,228,212) 本身也只有 27。 */

  it('renderer 不用 ACES（原版是 NoToneMapping，自己做 grade）', () => {
    /* ★ ACES 对暖色有系统性偏黄，且不提供原版那种「高光去饱和」。
       本站 body 是暖白、key 灯是暖白，两者相乘本来就偏暖 ——
       缺了 grade 的 sat 0.7 就没有任何东西把它拉回中性。 */
    const code = stripComments(scene);
    expect(code, '又用回 ACESFilmicToneMapping 了').not.toMatch(/ACESFilmicToneMapping/);
    expect(code, 'toneMapping 应为 NoToneMapping（原版 Stage.ts:162）')
      .toMatch(/toneMapping\s*=\s*NoToneMapping/);
  });

  it('grade 排在 AO **之后**（顺序错了 = grade 白做）', () => {
    /* AO 之后才轮到 grade。反过来的话：grade 把暗部提亮了，紧接着 AO 又压回去，
       等于白做一遍 —— 这类「顺序错了还全绿」的 bug 静态断言完全看不出来，
       所以判据直接卡addPass 的先后。 */
    const code = stripComments(scene);
    const iAo = code.indexOf('addPass(ao');
    const iGrade = code.indexOf('addPass(new EffectPass(camera, createFinGrade())');
    expect(iAo, '找不到 AO 的 addPass').toBeGreaterThan(-1);
    expect(iGrade, '找不到 grade 的 addPass').toBeGreaterThan(-1);
    expect(iGrade, 'grade 必须排在 AO 之后').toBeGreaterThan(iAo);
  });

  it('grade 带曝光 + 降饱和（sat 必须 < 1，这是去棕的那一步）', () => {
    const code = stripComments(grade);
    const exp = /exposure:\s*([\d.]+)/.exec(code);
    const sat = /sat:\s*([\d.]+)/.exec(code);
    expect(exp, '找不到曝光系数').toBeTruthy();
    expect(sat, '找不到饱和度系数').toBeTruthy();
    expect(Number(exp![1]), '曝光应 > 1（原版 LOOK.exposure = 1.5；不足 1 会更暗更脏）')
      .toBeGreaterThan(1);
    expect(Number(sat![1]), '★ sat 必须 < 1 —— 暖白本体 × 暖白 key 全靠这一步拉回中性，'
      + '写成 1 等于没有 grade，装置照样发棕')
      .toBeLessThan(1);
    /* Khronos PBR Neutral 的两处核心：高光肩 + 高光区去饱和 */
    expect(code, 'neutral 的高光肩 startCompression 不见了').toMatch(/startCompression/);
    expect(code, 'neutral 的去饱和系数不见了').toMatch(/desaturation/);
  });

  it('grade 只动颜色，不动 alpha（装置叠在正文下面）', () => {
    /* alpha 是它能看见正文的原因；在这里动等于自己把画布裁了。 */
    const out = /outputColor\s*=\s*vec4\(([^;]+)\);/.exec(stripComments(grade));
    expect(out, '找不到 grade 的输出语句').toBeTruthy();
    expect(out![1], 'alpha 必须原样带出').toMatch(/inputColor\.a/);
  });
});

describe('立体 ∞ · 几何照抄原版（rhine-lock ∞ fin sculpture）', () => {
  it('绕完一圈后的前倾轴连续，不能在参数归零处突然翻到另一侧', () => {
    /* 实际执行生产 GLSL 的角度表达式。闭合曲线的切线/参考法向在 0 与 2π 相同，
       所以把前倾轴写进这个公共参考系，就能比较接缝两端的真实方向。
       原版 twist=1.5 让宽/高轴翻半圈；非零前倾随之反向，形成截图里的豁口。
       GPU transform feedback 已确认：旧版顶点跳变 41～57，整圈扭转后约 0.001。 */
    const code = stripComments(shaders);
    const expression = (name: string): string => {
      const match = new RegExp(`float\\s+${name}\\s*=\\s*([^;]+);`).exec(code);
      if (!match) throw new Error(`生产着色器缺少 ${name} 表达式`);
      return match[1];
    };
    const angles = new Function('t', 'uTime', 'uSpin', 'uTwist', 'uLean', `
      const sin = Math.sin, pulse = 0;
      const wave = ${expression('wave')};
      const phi = ${expression('phi')};
      const lean = ${expression('lean')};
      return [Math.sin(lean) * Math.cos(phi), Math.sin(lean) * Math.sin(phi), Math.cos(lean)];
    `) as (t: number, time: number, spin: number, twist: number, lean: number) => number[];
    const params = scene.slice(scene.indexOf('export const FIN_PARAMS'), scene.indexOf('} as const'));
    for (const time of [0, 5, 20, 60]) {
      for (const spin of [0, 0.3, 2]) {
        const before = angles(0, time, spin, num(params, 'twist'), num(params, 'lean'));
        const after = angles(2 * Math.PI, time, spin, num(params, 'twist'), num(params, 'lean'));
        const jump = Math.hypot(...before.map((v, i) => v - after[i]));
        expect(jump, `时间 ${time} / 自转 ${spin}：前倾轴在接缝两端跳变 ${jump}`)
          .toBeLessThan(0.000001);
      }
    }
  });

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

  it('保留其余原版几何参数，扭转量由首尾连续性约束', () => {
    /* ★ 参数集中在 FIN_PARAMS 常量里，uniform 从那里读（`uRadius: { value: FIN_PARAMS.radius }`）。
       所以判据读那个常量块，而不是去grep 每个 uniform —— 否则改个写法就假红。*/
    const block = scene.slice(scene.indexOf('FIN_PARAMS'), scene.indexOf('} as const'));
    const P: [string, number][] = [
      ['radius', 285], ['aspect', 0.95], ['depth', 95],
      ['lean', 0.62], ['thickness', 4.2],
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

/* ★★★ 这一组是「那道缺口」的门闩（2026-10-18 站主放大截图报的，测试全绿却存在）。
   现象：∞ 左半瓣中部裂开一道缺口，缺口下面是一片**朝向完全相同的平墙**。

   根因不是着色器公式（`wave` / `phi` / `lean` 逐字比对过，与原版一字不差），
   而是**姿态少写了一整个轴**：
     原版 sculpture.rotation.set(16°±3°, Y, -2°)，order "YXZ"；
     本站只写了 rotation.y，X 恒为 0 ⇒ 完全正视。
   Gerono 双纽线的两瓣在 z 上错开（z = uDepth·sin t），正视时纵深差不投影到屏幕
   ⇒ 两瓣叠成一堵同向的平墙 ⇒ 看上去就是缺口。抬 16° 之后两瓣分开，带子才连起来。

   ★ 为什么之前 42 条断言全绿：它们守的全是**参数值**（radius/twist/lean…）和
     **着色器公式**，没有一条守「雕塑在空间里是怎么摆的」。
     参数全对、公式全对、姿态错一个轴，照样不是原版 —— 这正是这一组的价值。 */
describe('立体 ∞ · 姿态与机位（★ 正 vs 缺口：站主两轮反馈的取舍）', () => {
  const code = stripComments(scene);
  const constNum = (name: string): number => {
    const m = new RegExp(`const\\s+${name}\\s*=\\s*(-?[\\d.]+)`).exec(code);
    return m ? Number(m[1]) : NaN;
  };

  it('雕塑保持近乎正视，只做轻微顺时针校正，偏航摆动收小', () => {
    /* ★★ 这段判据的方向**翻转过两次**，别照着旧版本改回去：
       ① 最初 X 恒 0（完全正视）⇒ 站主报「环上一道缺口」：两瓣在 z 上错开，
          正视时这个纵深差投影不到屏幕，自相交处叠成一堵同向平墙。
       ② 于是照原版抬 16° ⇒ 缺口没了，但站主又说「歪了」。因为俯仰把两瓣推进
          不同纵深：近的更大更靠下、远的更小更靠上，整台装置是斜的。
       ③ 站主定调「别管那个缺口，把他摆正」⇒ 俯仰 2°、翻滚 0、摆动 ±2°。
       ④ 接缝修好后，站主要求整体顺时针转一点；仅允许小幅负翻滚，不再钉死为零。
       所以这里守的是**"正"这一侧**：大角度倾斜会把 ② 的歪带回来。
       注意它守的是关系（小到什么程度），不是"等于原版 16°"。 */
    const tilt = constNum('TILT_DEG');
    expect(Number.isFinite(tilt), '找不到 TILT_DEG（俯仰角常量）').toBe(true);
    expect(tilt, `俯仰角 ${tilt}° 太大 —— 两瓣会被推进不同纵深，一大一小一高一低（= 「歪」）`)
      .toBeLessThanOrEqual(4);
    expect(tilt, '俯仰角不该是负的（会把装置仰起来）').toBeGreaterThanOrEqual(0);

    const roll = constNum('ROLL_DEG');
    expect(roll, '负翻滚才是屏幕上的顺时针方向').toBeLessThan(0);
    expect(roll, '只允许小幅校正，不能转成明显斜摆').toBeGreaterThanOrEqual(-3);

    const sway = constNum('YAW_SWAY_DEG');
    expect(Number.isFinite(sway), '找不到 YAW_SWAY_DEG（偏航摆动幅度）').toBe(true);
    expect(sway, `偏航摆动 ±${sway}° 太大 —— 摆到一侧时会让一瓣近一瓣远，左右大小不对等`)
      .toBeLessThanOrEqual(3);

    /* 必须是**每帧在 render 里**写，且用 rotation.set 一次写三个轴。 */
    const body = fnBody(scene, 'render');
    expect(body, '雕塑姿态不在 render 里更新（装配/波动都要每帧写）')
      .toMatch(/sculpture\.rotation\.set\(/);
    const setCall = /sculpture\.rotation\.set\(([\s\S]*?)\);/.exec(body);
    expect(setCall, '切不出 sculpture.rotation.set 的实参（判据本身坏了）').toBeTruthy();
    expect(setCall![1], 'X 轴没有用 TILT_DEG（姿态常数被绕过）').toMatch(/TILT_DEG/);
    expect(setCall![1], '偏航没走 YAW_SWAY_DEG（幅度就管不住了）').toMatch(/YAW_SWAY_DEG/);
    expect(setCall![1].split(',').length, 'rotation.set 少传了轴（原版是 x/y/z 三个）')
      .toBeGreaterThanOrEqual(3);
    expect(scene, 'rotation.order 必须是 YXZ（原版 Stage.ts:421，顺序影响俯仰与自转的叠加）')
      .toMatch(/rotation\.order\s*=\s*'YXZ'/);
  });

  it('相机不许带俯角（CAM_Y = 0）—— 相机低头和雕塑抬头是同一件事', () => {
    /* 原版 `position.set(…, 60 + …, 1080 + …)`，atan(60/1080)=3.18°，正是它手写的
       `rotation.x = -3°`：**相机低头 3° ≡ 雕塑抬头 3°**，两者会叠加。
       站主要「正」，所以基准高度归零；lookAt 每帧覆盖 rotation.x，别想着单独设它。 */
    expect(constNum('CAM_Y'), '相机基准高度 CAM_Y 应≈0（一抬就是俯角，等于又歪了）').toBeCloseTo(0, 5);
    expect(constNum('CAM_Z'), '相机基准距离 CAM_Z 应≈1080（原版机位）').toBeCloseTo(1080, 0);
    const body = fnBody(scene, 'render');
    const camSet = /camera\.position\.set\(([\s\S]*?)\);/.exec(body);
    expect(camSet, 'render 里没有 camera.position.set（判据本身坏了）').toBeTruthy();
    expect(camSet![1], '相机 y 没走 CAM_Y（基准就没人管了）').toMatch(/CAM_Y/);
    expect(body, '不许再单独给 camera.position.y 赋值（会覆盖 CAM_Y 基准）')
      .not.toMatch(/camera\.position\.y\s*=/);
  });

  it('★ 深度材质必须接管：否则阴影与 AO 都按「未变形的单位盒」算', () => {
    /* three 做阴影/深度预通道时**不读** material 的 onBeforeCompile，
       它另用一份 MeshDepthMaterial。不接管的话深度图里写进去的是 400 个
       全叠在原点、从未经过 rl_finTransform 的 1×1×1 盒子：
         · 阴影：雕塑本体不在深度图里 ⇒ 自相交处的接触阴影全丢
         · AO（n8ao 读深度）：按原点的假几何算 ⇒ 大片区域被误判为遮挡 ⇒
           看上去像"某块区域整体发暗、边界硬"，是缺口观感的帮凶。
       原版 Stage.ts:201-213 就接了（finDepth），本站此前整段漏了。 */
    expect(code, 'fins 没有 customDepthMaterial ⇒ 阴影/AO 用的是未变形的单位盒')
      .toMatch(/customDepthMaterial\s*=\s*finDepth/);
    /* 深度材质必须走**同一套**顶点变换 + 同一套 carve（关系，不是有就行） */
    const depthBlock = code.slice(code.indexOf('new MeshDepthMaterial'));
    expect(depthBlock.length, '找不到 MeshDepthMaterial 那段（判据本身坏了）').toBeGreaterThan(0);
    const end = depthBlock.indexOf('const fins =');
    const depthSrc = end > 0 ? depthBlock.slice(0, end) : depthBlock;
    expect(depthSrc, '深度材质调用的不是同一个 rl_finTransform ⇒ 深度图与画面会错位')
      .toMatch(/rl_finTransform/);
    expect(depthSrc, '深度材质没拼 FIN_CARVE ⇒ AO 会沿着不存在的直角边压出暗边')
      .toMatch(/FIN_CARVE/);
    expect(depthSrc, '深度材质没拼顶点块 FIN_VERTEX').toMatch(/FIN_VERTEX\b/);
  });

  it('鳍片是圆角矩形（原版 finCarveGlsl + uCorner 0.14），不是硬直角', () => {
    expect(shaders, '圆角切角块 FIN_CARVE 不见了（原版 finCarveGlsl）').toMatch(/export const FIN_CARVE/);
    expect(shaders, 'carve 没有 discard 掉圆角外的像素').toMatch(/length\(rc\)\s*>\s*uCorner\)\s*discard/);
    const block = scene.slice(scene.indexOf('FIN_PARAMS'), scene.indexOf('} as const'));
    expect(num(block, 'corner'), 'uCorner 应≈0.14（原版 Stage.ts:181）').toBeCloseTo(0.14, 2);
    expect(scene, 'uCorner 没有接到 FIN_PARAMS').toMatch(/uCorner:\s*\{\s*value:\s*FIN_PARAMS\.corner/);
    /* 颜色侧也要拼（否则本体色那套 bevel/rim 与 carve 对不上） */
    expect(code.replace(/\s+/g, ' '), '颜色着色器没拼 FIN_CARVE').toMatch(/\$\{FIN_CARVE\}/);
  });

  it('阴影：PCFShadowMap + radius（PCFSoft 下 radius 是静默无效的）+ 阴影相机够到雕塑', () => {
    /* 原版是 PCFShadowMap + shadow.radius = 5。写成 PCFSoftShadowMap 时
       shadow.radius **不生效也不报错** —— 结果是一排高频硬阴影，
       看起来像脏斑，而不是原版那种被 radius 化开的柔影。 */
    expect(code, 'shadowMap.type 应为 PCFShadowMap（原版 Stage.ts:168；'
      + 'PCFSoft 下 shadow.radius 静默失效）').toMatch(/shadowMap\.type\s*=\s*PCFShadowMap/);
    const radius = /key\.shadow\.radius\s*=\s*(-?[\d.]+)/.exec(code);
    expect(radius, 'shadow.radius 不见了').toBeTruthy();
    expect(Number(radius![1]), 'radius 应≈5（原版）').toBeCloseTo(5, 0);

    /* ★ 守关系：阴影相机的 far 必须够到灯距，否则深度图里空无一物 ——
       阴影**静默失效**（不报错，只是没有），看上去就是"少了一块"。
       灯的摆放是 position.set(...).multiplyScalar(1200)。 */
    const lampDist = /key\.position\.set\([^)]*\)\.multiplyScalar\(\s*([\d.]+)\s*\)/.exec(code);
    expect(lampDist, '读不到 key 灯的摆放距离（判据本身坏了）').toBeTruthy();
    const far = /sc\.far\s*=\s*([\d.]+)/.exec(code) ?? /shadow\.camera[\s\S]{0,80}?far\s*=\s*([\d.]+)/.exec(code);
    expect(far, '阴影相机的 far 没设（默认 500 ⇒ 够不到 1200 米外的灯）').toBeTruthy();
    expect(Number(far![1]), `阴影相机 far=${far![1]} 够不到灯距 ${lampDist![1]} ⇒ 阴影静默失效`)
      .toBeGreaterThan(Number(lampDist![1]));
    const near = /sc\.near\s*=\s*([\d.]+)/.exec(code);
    expect(near, '阴影相机的 near 没设').toBeTruthy();
    expect(Number(near![1]), '阴影相机 near 必须小于灯距（否则雕塑落在 near 之前）')
      .toBeLessThan(Number(lampDist![1]));
  });

  it('DoF 在 AO 之后、grade 之前（原版 Stage.ts:279-284 的顺序）', () => {
    /* 这一层原先"故意没搬"，理由是机位不同会跑偏；机位对齐之后就没有理由了。
       它在观感上不是可选项：把焦点外的鳍片刃口化开，压掉高频硬边。 */
    expect(code, 'DepthOfFieldEffect 不见了（原版有这层）').toMatch(/DepthOfFieldEffect/);
    /* ★ 用 indexOf（**第一次**出现）而不是 lastIndexOf：
       判的是「谁先被加进 composer」，重复出现时 lastIndexOf 会指向末尾那一份，
       把「在前面插一行同样的调用」这种变异放过去（实测踩过）。 */
    const iAo = code.indexOf('addPass(ao');
    const iDof = code.indexOf('addPass(new EffectPass(camera, dof)');
    const iGrade = code.indexOf('addPass(new EffectPass(camera, createFinGrade())');
    expect(iAo, '找不到 AO 的 addPass').toBeGreaterThan(-1);
    expect(iDof, '找不到 DoF 的 addPass').toBeGreaterThan(-1);
    expect(iGrade, '找不到 grade 的 addPass').toBeGreaterThan(-1);
    expect(iDof, 'DoF 必须排在 AO 之后（AO 要读原始深度，先虚化就废了）').toBeGreaterThan(iAo);
    expect(iDof, 'DoF 必须排在 grade 之前（grade 是最终的显示空间编码）').toBeLessThan(iGrade);
    /* 焦点是世界单位的视距 ⇒ 窄屏拉远后必须跟着 camZ 走，写死会跑焦 */
    expect(code, 'focusDistance 没有随 camZ 更新（窄屏会焦点错位）')
      .toMatch(/focusDistance\s*=\s*camZ/);
  });
});

describe('立体 ∞ · 点击脉冲（★ 本轮新加，原版没有）', () => {
  it('脉冲挂在 pointerdown 上（原版是由键盘触发的，rhine-lock 的 lock.svelte.ts:305）', () => {
    /* ★ 判据不能写成 `pointerdown[\s\S]{0,400}scene\.pulse\(` ——
       那种写法有两个洞，变异验证已经把它们都试出来了：
         ① 字符数上限：脉冲调用离监听超过 N 行就查不到（改个顺序就假绿）；
         ② 顺序假设：默认 pulse 在监听「之前」，倒过来写就漏。
       正确做法：从注册语句里**解析出 handler 标识符**，再切那个 handler 的
       函数体，在里面找 pulse —— 与距离、顺序、以及是否内联全都无关。
       （2026-10-18：原来写死 marker='pointerdown'，监听改成具名 onDown 后失效，
        顺着它修才暴露 handlerBody 的第三个坑 —— 见stripComments 的注释。）*/
    const code = stripComments(ctrl);
    const reg = code.match(/addEventListener\(\s*'pointerdown'\s*,\s*([A-Za-z_$][\w$]*)/);
    expect(reg, '没找到 pointerdown 的注册语句（判据本身坏了）').toBeTruthy();
    const handler = reg![1];
    const body =
      handlerBody(ctrl, `${handler} = (`) ||
      handlerBody(ctrl, `${handler} = function`) ||
      handlerBody(ctrl, `function ${handler}`);
    expect(body.length, `切不出 ${handler} 的函数体（判据本身坏了）`).toBeGreaterThan(0);
    expect(body, `${handler} 里没有调用 scene.pulse() —— 点击反馈被摘掉了`)
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

/* ★★ 这一组是补一条真 bug 的门闩（2026-10-18，线上目检时手工发现的，测试没抓到）。
   bug：`pointerdown` / `pointermove` 原来挂在 host 上，而 host 是
   `pointer-events:none` 的装饰层 ⇒ 它**永远收不到指针事件** ⇒ 点击脉冲和视差
   都是死代码，25 条断言却全绿。
   根因是判据只问「代码里有没有 pointerdown」，没问「**它挂在谁身上**」——
   一个挂在死元素上的监听，和一个没写的监听，在文本上长得一样。
   ⇒ 这三条守的全是「关系」：装饰层必须仍是 none（别为了让点击活就把遮挡去掉），
     同时指针事件必须走 window（能活），且两边要摘干净（不漏）。 */
describe('立体 ∞ · 指针事件挂在谁身上（★ 这组为「装饰层 pointer-events:none 吃掉监听」而设）', () => {
  /** 从组件 CSS 里切出 `.fin-infinity { ... }` 这一条规则 */
  const hostRule = comp.match(/\.fin-infinity\s*\{([^}]*)\}/)?.[1] ?? '';

  it('底纹仍是装饰层：pointer-events 必须保持 none（挡了它正文就没法选中）', () => {
    expect(hostRule, '切不出 .fin-infinity 规则（判据本身坏了）').not.toBe('');
    expect(hostRule, '★ 底纹不许吃指针 —— 它盖在正文之上').toMatch(/pointer-events:\s*none/);
    expect(hostRule, 'z-index 必须是 -1（它是底纹，不是浮层）').toMatch(/z-index:\s*-1/);
  });

  it('★ 脉冲与视差监听必须挂 window（挂 host 等于挂死：none 的元素收不到事件）', () => {
    const code = ctrl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
    /* ⚠ 判据守的是**行首裸调用**（`addEventListener(...)`，前面不能有 `host.` / `view.` 等
       接收者）。写成 `expect(code).not.toMatch(/host\.addEventListener\('pointerdown'/`
       只挡了host 一种写法，`view.addEventListener` 照样能溜过去 ⇒ 变异验证能咬住。 */
    expect(code, 'pointerdown 没挂到 window 上 ⇒ 装饰层收不到事件，点击反馈是死的')
      .toMatch(/^\s*addEventListener\(\s*'pointerdown'/m);
    expect(code, 'pointermove 没挂到 window 上 ⇒ 视差是死的')
      .toMatch(/^\s*addEventListener\(\s*'pointermove'/m);
    /* 反向：任何挂在具体元素上的指针监听都不允许 */
    expect(code, '指针监听不许挂在具体元素上（装饰层是 pointer-events:none）')
      .not.toMatch(/\b\w+\.addEventListener\(\s*'pointer(?:down|move)'/);
  });

  it('window 监听必须在 pagehide 时摘掉（bfcache 往返会逐次累积）', () => {
    const code = ctrl.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
    const hide = code.slice(code.indexOf("'pagehide'"));
    expect(hide, '找不到 pagehide 清理段').toContain("removeEventListener('pointerdown'");
    expect(hide, '找不到 pagehide 清理段').toContain("removeEventListener('pointermove'");
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

/* ★★★ 这一组是 2026-10-18 线上目检抓出来的**最严重的一个**：装置在真机上一帧都没画。
   报出来是这样的：
     THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
     ERROR: 0:231: 'attribute' : Illegal use of reserved word
        231: attribute float aIndex;
   原因：`FIN_UNIFORMS` 是**顶点与片元两个着色器都拼进去**的共享块，而
   `attribute` 在 GLSL3（three r150+ 的默认 WebGL2）里是**保留字**，只顶点侧合法。
   ⇒ 片元着色器编译失败 ⇒ 整个 program 无效 ⇒ 画布全空白。

   ★ 为什么这类 bug 值得单列一组判据：**它对静态断言完全隐形**。
     前面 28 条全绿、构建通过、测试通过，只有"真机跑一次并读控制台"才现形。
     而无头截图里它长得像"装置没生效 / 环境没适配"，极易被当成环境问题放过
     （我这次就差点这么判）。⇒ 判据必须落在这个**语法层**上：
     片元着色器里不许出现顶点侧专有的声明。 */
describe('立体 ∞ · 着色器能在 GLSL3 下编过（★ 线上画布全空白就是这条）', () => {
  /** 从 fin-shaders.ts 里切出一个导出常量的字符串内容 */
  const block = (name: string): string => {
    const i = shaders.indexOf(`export const ${name}`);
    expect(i, `着色器里找不到 ${name}`).toBeGreaterThan(-1);
    const body = shaders.slice(shaders.indexOf('`', i) + 1);
    return body.slice(0, body.indexOf('`'));
  };

  it('共享 uniform 块里不许有 attribute / varying 之外的顶点侧声明', () => {
    /* ★ 守的是「共享块只放两边都合法的东西」：
       uniform 与 varying 两边都能声明，**attribute 只有顶点侧能声明**。 */
    const shared = block('FIN_UNIFORMS');
    expect(shared, '切不出 FIN_UNIFORMS（判据本身坏了）').not.toBe('');
    expect(shared.replace(/\/\/.*$/gm, ' '),
      "★ FIN_UNIFORMS 被顶点与片元共用，里面不许出现 attribute（GLSL3 里是保留字，片元侧直接编译失败）")
      .not.toMatch(/\battribute\b/);
  });

  it('aIndex 单独成块，且只有顶点着色器拼它', () => {
    expect(shaders, 'aIndex 的独立块 FIN_VERTEX_ATTRS 不见了').toMatch(/export const FIN_VERTEX_ATTRS/);
    expect(block('FIN_VERTEX_ATTRS'), 'aIndex 的独立块里没有 attribute float aIndex')
      .toMatch(/attribute\s+float\s+aIndex\s*;/);

    /* ★ 按**行边界**切出片元着色器那一整段。
       踩过的坑：`sh.fragmentShader = sh.fragmentShader` 这一行里有**两个**
       `fragmentShader` ⇒ `split('fragmentShader')[1]` 只切到同一行的 `= sh.`（6 个字符）
       ⇒ 判据覆盖不到真正那段拼接，变异 ⑫ 就漏过去了（实测漏过一次）。
       所以按「从 sh.fragmentShader 行到下一个 `sh.xxx` 赋值行之前」来切。 */
    const lines = scene.split(/\r?\n/);
    const start = lines.findIndex(l => /^\s*sh\.fragmentShader\s*=/.test(l));
    expect(start, '找不到片元着色器那段拼接（判据本身坏了）').toBeGreaterThan(-1);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\s*sh\.\w+\s*=/.test(lines[i])) { end = i; break; }
    }
    const fragChunk = lines.slice(start, end).join('\n');
    expect(fragChunk, '找不到片元着色器那段拼接（判据本身坏了）').toContain('FIN_UNIFORMS');
    expect(fragChunk, '★ 片元着色器不许拼 FIN_VERTEX_ATTRS（attribute 是 GLSL3 保留字，片元侧编译失败）')
      .not.toMatch(/FIN_VERTEX_ATTRS/);

    /* 反向：顶点着色器那一段必须拼它，否则 aIndex 没声明 */
    const vstart = lines.findIndex(l => /^\s*sh\.vertexShader\s*=/.test(l));
    expect(vstart, '找不到顶点着色器那段拼接（判据本身坏了）').toBeGreaterThan(-1);
    let vend = lines.length;
    for (let i = vstart + 1; i < lines.length; i++) {
      if (/^\s*sh\.\w+\s*=/.test(lines[i])) { vend = i; break; }
    }
    expect(lines.slice(vstart, vend).join('\n'),
      '顶点着色器必须拼 FIN_VERTEX_ATTRS（否则 aIndex 没声明）').toMatch(/FIN_VERTEX_ATTRS/);
  });

  it('片元着色器整体里不许出现 attribute（GLSL3 保留字）', () => {
    const fragShared = block('FIN_UNIFORMS') + block('FIN_SURFACE') + block('FIN_EMISSIVE');
    expect(fragShared.replace(/\/\/.*$/gm, ' '),
      '★ 片元侧拼进去的任何一块都不许含 attribute')
      .not.toMatch(/\battribute\b/);
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
