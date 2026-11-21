import { createRelayMotion } from './about-relay.mjs';
/**
 * 立体 ∞（FinInfinity）—— 装置本体。
 *
 * 移植自 `tmc5csxr9m-cpu/rhine-lock` 的 `frontend/src/lib/scene/Stage.ts` +
 * `shaders.ts`。**几何、扭转、前倾、脉冲全部逐字照抄**，只改三处：
 *
 *   ① 配色 —— 原版写死三档（纸白 / 石墨 / 橙），本站改为**从 CSS token 传进来**
 *      （站规 §3 第 2 条：组件里不许写字面色值）。亮色 = 纸白 + 薄荷，
 *      暗色 = 黑 + 橙，与 §3 暗色定案一致。
 *   ② **点击反馈**—— 原版雕塑**完全不可点**（整份Stage.ts 里没有任何
 *      Raycaster / pointerdown / click）。它那道脉冲光原本由**敲键盘**触发
 *      （`lock.svelte.ts:305`，语义是「你刚敲了一下口令」）。站主要「点一下有反馈」，
 *      所以这里把同一个 `pulse()` 挂到点击上。着色器部分一字未改。
 *   ③ 场景范围 —— 原版还有一列「卡片流」（CARD_COUNT=30 的磨砂 ∞ 卡片）、
 *      AO 与暗角；本站只保留雕塑本体 + 后处理，卡片流不搬（它属于那个鉴权应用，
 *      不是这个博客的语境）。
 *
 * ★ 为什么用 MeshStandardMaterial + onBeforeCompile 而不是裸 ShaderMaterial：
 *   原版就是这么做的。走标准材质才能白拿 three 的光照 / 阴影 / 雾 / 深度预通道 ——
 *   n8ao 的 AO 要读深度图，阴影也要，没有标准材质就得自己接一遍。
 *
 * ★ 相机：原版 `PerspectiveCamera(30, 16/9, 20, 6000)`，FOV 只有 30（长焦，
 *   透视畸变小，接近正投影）。本站在页面里是「背景装置」，宽高比要跟容器走。
 */

import {
  NoToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PCFShadowMap,
  RGBADepthPacking,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';

import {
  FIN_CARVE, FIN_COMMON, FIN_EMISSIVE, FIN_SURFACE, FIN_UNIFORMS, FIN_VERTEX, FIN_VERTEX_ATTRS,
} from './fin-shaders';

/* 后处理（照搬原版 Stage.ts:266-282 的搭法）。
   ★ 动态 import 的原因：这两个包合起来会让关于页那个 chunk 明显变大
     （postprocessing ≈ 200 KB+、n8ao ≈ 228 KB），不该让「没打开装置」的人付。
     场景本身就是动态 import 的，所以放在一起——**同一个 chunk，付一次**。 */
import { DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { createFinGrade } from './fin-grade';
import { createFinPicker } from './fin-picking';

/** 鳍片数（原版 FIN_COUNT = 400）。 */
export const FIN_COUNT = 400;

/** 基于原版参数（Stage.ts:179-183）；扭转改整圈以保证带前倾的鳍片首尾闭合。 */
export const FIN_PARAMS = {
  radius: 285,
  aspect: 0.95,
  depth: 95,
  // 1 整圈保持首尾连续，同时比 2 圈更舒展；半圈会让接缝两侧的前倾方向相反。
  twist: 1,
  lean: 0.62,
  thickness: 4.2,
  corner: 0.14,
  width: 84,
  height: 84,
} as const;

/* ── 机位（原版 Stage.ts:418-425）──────────────────────────────────────
   原版相机 `position.set(parallaxX*40, 60 + parallaxY*24, 1080 + …)`。
   ★ y = 60 是原版显式写的 3.18° 俯角（atan(60/1080) 恰好等于它手写的
     `rotation.x = -3°`）。

   ★★ 2026-10-18 晚把它归零。站主看的是"正不正"：**相机俯角与雕塑俯仰是同一件事**
     的两种写法（相机低头 3° ≡ 雕塑抬头 3°），两者会叠加，而只要存在俯角，
     两瓣（z = ±95）在屏幕上就会一大一小、一高一低 —— 站主把这读成「歪了」。
     代价写在 TILT_DEG 那边：正视会丢一点自相交处的前后分离。 */
const CAM_Y = 0;
const CAM_Z = 1080;
/** 原版 16:9 的基准宽高比。窄于此就要拉远，否则 ∞ 的两端会被切掉。 */
const CAM_ASPECT = 16 / 9;

/* ── 雕塑姿态 ─────────────────────────────────────────────────────────
   历程（三段都留在这儿，别再走回头路）：
   ① 最初只写 rotation.y，X 恒 0 ⇒ 完全正视；
   ② 站主报「环上一道缺口」⇒ 照原版抬 16° 俯仰。原因：Gerono 双纽线两瓣在 z 上
      错开（z = uDepth·sin t），正视时这个纵深差投影不到屏幕上，两瓣叠成一堵
      朝向相同的平墙，中间只剩一条硬边。抬起来之后纵深差变成屏幕位移，带子才连得起来；
   ③ ★ 抬 16° 之后站主又说「歪了」。因为俯仰同时也把两瓣推进不同的纵深：
      近的一瓣更大更靠下，远的一瓣更小更靠上 —— 整台装置看上去是斜的。
      站主明确「别管那个缺口，把他摆正」⇒ 俯仰收到 2°（几乎正视），
      翻滚归零，偏航摆动从 ±9° 收到 ±2°（那 ±9° 是左右瓣大小不对等的另一半成因）。

   ⇒ 现在的取舍：**正 > 自相交的前后分离**。2° 只留一点点纵深暗示。
   ④ 本轮直接量首尾几何后推翻了②对缺口根因的判断：缺口实际来自 1.5 圈扭转
      与前倾在参数归零处不连续，现已在 FIN_PARAMS 中改为整圈闭合。
      姿态只负责构图，不再用它掩盖几何接缝。
   ⑤ 接缝闭合后，站主感觉仍向左歪：沿画面顺时针微转 1°（负 Z 翻滚）。 */
const TILT_DEG = 2;
const TILT_WAVE_DEG = 0.6;
const ROLL_DEG = -1;
/** 偏航摆动的幅度（原版 ±9°）。收到 ±2°：原版的大摆幅会把一瓣拉近、一瓣推远。 */
const YAW_SWAY_DEG = 2;
/** 装配动画期间雕塑多转的角度（原版 `(1 - intro) * 32`） */
const ASSEMBLE_TWIST_DEG = 32;
const SCULPT_OFFSET_X = -10;

const DEG = Math.PI / 180;
/** 装配的缓动（原版 `get intro()`：1 - (1-a)³） */
const easeIntro = (a: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, a)), 3);

export interface FinPalette {
  /** 亮色本体色（本站 --paper 的暗一档，鳍片要比底略深才看得出体积） */
  bodyLight: string;
  /** 暗色本体色（近黑但非纯黑，与 --paper 有明度差才撑出层次） */
  bodyDark: string;
  /** 亮色自发光（薄荷绿系） */
  glowLight: string;
  /** 暗色自发光（橙，与新 accent 同源） */
  glowDark: string;
  /** 场景底色（亮= 纸白暖调 / 暗 = 近黑） */
  sceneLight: string;
  sceneDark: string;
  /** 环境光色 */
  ambientLight: string;
}

export interface FinScene {
  /** 按当前可见鳍片检查归一化屏幕坐标，孔洞和片间空隙不命中。 */
  hitTest(nx: number, ny: number): boolean;
  /** 点一下：沿曲线跑一道光。origin 0..1 是起始相位（0.25 = 从交叉点起） */
  pulse(origin?: number): void;
  setDenied(v: number): void;
  /** 换主题时**连色板一起换** —— 亮暗两套 token 不同，只改 uDenied 不够 */
  setPalette(p: FinPalette): void;
  /** 指针视差，nx/ny 归一到 -1..1 */
  setPointer(nx: number, ny: number): void;
  /** 装配动画：像笔触一样从交叉点画出来（原版 0.5 秒） */
  playAssemble(): void;
  resize(w: number, h: number, dpr: number): void;
  /** ★ 入参单位是**毫秒**（rl-core 的 startLoop 就是这么给的），不是秒 */
  render(dtMs: number): void;
  setRelay(progress: number): void;
  dispose(): void;
}

/** 原版的 instanced()：把单位盒变成 InstancedBufferGeometry，每片带一个 aIndex。 */
function instanced(base: BufferGeometry, count: number): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('normal', base.getAttribute('normal'));
  g.setAttribute('uv', base.getAttribute('uv'));
  const idx = new Float32Array(count);
  for (let i = 0; i < count; ++i) idx[i] = i;
  g.setAttribute('aIndex', new InstancedBufferAttribute(idx, 1));
  g.instanceCount = count;
  return g;
}

export async function createFinScene(
  canvas: HTMLCanvasElement,
  palette: FinPalette,
  context: WebGL2RenderingContext,
): Promise<FinScene | null> {
  const renderer = new WebGLRenderer({ canvas, context, antialias: true, alpha: true });
  renderer.outputColorSpace = SRGBColorSpace;
  /* ★★ 原版是 `NoToneMapping`（Stage.ts:162）—— 它自己做 grade：exposure 1.5
     → Khronos PBR Neutral → sat 0.7（LOOK）。而 ACES 对暖色有**系统性偏黄**：
     本站 body 是暖白 rlPaper(0.935/0.895/0.830)、key 灯是暖白 0xfff6ea，
     两者相乘再过 ACES ⇒ 整台雕塑在纸白页面上发棕/发金（2026-10-18 站主报的原问题）。
     先关掉 ACES 看基础形态，grade 管线另议。 */
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  /* ★ 原版是 `PCFShadowMap` + `shadow.radius = 5`（Stage.ts:168 / 300），**不是** PCFSoft。
     这个区别不是口味问题：`shadow.radius` 只对 PCFShadowMap / VSM 生效，
     对 PCFSoftShadowMap 是**静默无效**的 —— 写在同一行也读不到。
     用错类型的结果就是：鳍片之间会跳出一排高频锯齿硬阴影（每片鳍都在投硬影），
     看上去像"脏斑"，而不是原版那种被 radius 化开的柔影。 */
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 16 / 9, 20, 6000);
  camera.rotation.order = 'YXZ';

  /* 配色一次性算好：原版是把 color 硬写进着色器，本站从 token 来。
     ★ 用 linear 空间存 —— three 的 ColorManagement 默认开，
       `new Color('#rrggbb')` 内部已经做sRGB→linear，这里不用再转。 */
  const bodyLight = new Color(palette.bodyLight);
  const bodyDark = new Color(palette.bodyDark);
  const glowLight = new Color(palette.glowLight);
  const glowDark = new Color(palette.glowDark);
  const sceneLight = new Color(palette.sceneLight);
  const sceneDark = new Color(palette.sceneDark);
  const bg = new Color(palette.sceneDark);

  /* ── 灯（原版 Stage.ts:290-304 的 lights()，逐字照抄）──
     ★ **两盏灯都有色温**，这是亮色档「发棕」的直接成因：原版 key 是暖白
       0xfff6ea、fill 是冷蓝 0xdfe8ff，加起来是**中性偏亮**的白；
       本站原先两盏都写成纯白 0xffffff（key 2.4 / fill 0.7），
       等于把原版的色温对比抹平了，暖调全靠 body 色撑着 ⇒ 整台雕塑发棕。
     ★ 原版**没有 AmbientLight** —— 环境光来自 studio.hdr 走 PMREM，
       用 scene.environmentIntensity = LOOK.env 控制。本站不引外部 HDR
       （站规：禁外部资源），用 AmbientLight 顶替，强度对齐 LOOK.env = 0.8。 */
  const key = new DirectionalLight(0xfff6ea, 3.4);            // LOOK.key
  key.position.set(-0.379, 0.788, 0.485).multiplyScalar(1200);
  key.castShadow = true;
  /* mapSize 原版是 4096，本站取 2048：阴影相机覆盖 1040 世界单位，
     2048 ⇒ 0.5 单位/texel，而容器最宽也就 ~960 CSS px、装置约占 700 px
     ⇒ 已是 2 texel/px，比屏幕更密，再往上加只涨显存不涨质量。 */
  key.shadow.mapSize.set(2048, 2048);
  /* ★ 阴影相机必须显式设范围（原版 Stage.ts:296-300）。
     DirectionalLight 的阴影相机默认是 OrthographicCamera(-5,5,5,-5, 0.5, 500) ——
     那两对方位的单位是**世界单位**，而这座雕塑半径 285、鳍片 84，
     灯又摆在 1200 米外 ⇒ 默认的 500 远平面根本够不到雕塑，
     深度图里空无一物 ⇒ 阴影静默失效（不报错，只是没有）。
     看上去就像「模型少了一块」：自相交处本该有的接触阴影没了，
     只剩 AO 在硬撑，平面感一下子就出来了。原版这组数是配着 1200 的灯距量的。 */
  const sc = key.shadow.camera;
  sc.left = -520; sc.right = 520; sc.top = 420; sc.bottom = -420;
  sc.near = 400; sc.far = 2000;
  sc.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.6;
  key.shadow.radius = 5;
  const fill = new DirectionalLight(0xdfe8ff, 0.55);          // LOOK.fill
  fill.position.set(0.853, 0.174, -0.4925).multiplyScalar(1200);
  const amb = new AmbientLight(new Color(palette.ambientLight), 0.8); // LOOK.env
  scene.add(key, fill, amb);

  /* ── 雕塑（鳍片）── */
  const finGeo = instanced(new BoxGeometry(1, 1, 1), FIN_COUNT);
  const relayMotion=createRelayMotion(FIN_COUNT);
  const relayAttribute=new InstancedBufferAttribute(relayMotion.poses,4);
  const liftAttribute=new InstancedBufferAttribute(relayMotion.lift,1);
  finGeo.setAttribute('aRelay',relayAttribute);
  finGeo.setAttribute('aRelayLift',liftAttribute);
  let relayTarget=0;

  /* 脉冲：16 槽环形缓冲（原点填 -99 ⇒ age 恒为负 ⇒ 初始无脉冲） */
  const pulseT = new Float32Array(16).fill(-99);
  const pulseO = new Float32Array(16).fill(0.25);
  let pulseSlot = 0;

  const U = {
    uTime: { value: 0 },
    uFlow: { value: 0 },
    uCount: { value: FIN_COUNT },
    uRadius: { value: FIN_PARAMS.radius },
    uAspect: { value: FIN_PARAMS.aspect },
    uDepth: { value: FIN_PARAMS.depth },
    uTwist: { value: FIN_PARAMS.twist },
    uSpin: { value: 0 },
    uLean: { value: FIN_PARAMS.lean },
    uThickness: { value: FIN_PARAMS.thickness },
    uCorner: { value: FIN_PARAMS.corner },
    uWidth: { value: FIN_PARAMS.width },
    uHeight: { value: FIN_PARAMS.height },
    uAssemble: { value: 1 },
    uDenied: { value: 0 },
    uAlign: { value: 0 },
    uDisorder: { value: 0 },
    uDissolve: { value: 0 },
    uVerify: { value: 0 },
    uBodyLight: { value: bodyLight },
    uBodyDark: { value: bodyDark },
    uGlowLight: { value: glowLight },
    uGlowDark: { value: glowDark },
    uPulseT: { value: pulseT },
    uPulseO: { value: pulseO },
  };

  const finMat = new MeshStandardMaterial({
    metalness: 0,
    roughness: 0.5,
    side: DoubleSide,
  });
  finMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${FIN_COMMON}\n${FIN_UNIFORMS}\n${FIN_VERTEX_ATTRS}\n${FIN_VERTEX}`)
      .replace(
        '#include <beginnormal_vertex>',
        'vec3 rlPos; vec3 rlNrm; rl_finTransform(position, normal, rlPos, rlNrm);\nvec3 objectNormal = rlNrm;',
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = rlPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FIN_COMMON}\n${FIN_UNIFORMS}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FIN_CARVE}\n${FIN_SURFACE}`)
      .replace('#include <color_fragment>', 'diffuseColor.rgb = rlBody;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.55, 0.36, bevel);')
      .replace('#include <emissivemap_fragment>', FIN_EMISSIVE);
  };

  /* ── 深度材质（原版 Stage.ts:201-213 的 finDepth）★ 本站原先漏了，是真 bug ──
     three 做阴影/深度预通道时，**不读 material 的 onBeforeCompile** —— 它另用一份
     MeshDepthMaterial。不接管的话，深度图里写进去的是**未经 rl_finTransform 的单位盒**：
     400 个 1×1×1 的盒子全叠在原点，而屏幕上的鳍片在别处 ⇒
       · 阴影：雕塑本体不在深度图里 ⇒ 自相交处的接触阴影全丢
       · AO（n8ao 读深度）：按原点的假几何算 ⇒ 大面积误判为"遮挡"
     后者的典型观感就是**某一片区域整体发暗、边界硬**，非常像"缺了一块"。
     ⇒ 必须把同一套顶点变换 + 同一套 carve 接到深度材质上（原版两处都拼）。 */
  const finDepth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  finDepth.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${FIN_COMMON}\n${FIN_UNIFORMS}\n${FIN_VERTEX_ATTRS}\n${FIN_VERTEX}`)
      .replace('#include <begin_vertex>', 'vec3 rlPos; vec3 rlNrm; rl_finTransform(position, normal, rlPos, rlNrm);\nvec3 transformed = rlPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FIN_UNIFORMS}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FIN_CARVE}`);
  };

  const fins = new Mesh(finGeo, finMat);
  fins.customDepthMaterial = finDepth;
  fins.frustumCulled = false;
  fins.castShadow = true;
  fins.receiveShadow = true;

  const sculpture = new Group();
  sculpture.rotation.order = 'YXZ';   // 原版 Stage.ts:421 —— 顺序影响俯仰与自转的叠加
  sculpture.position.x = SCULPT_OFFSET_X;
  sculpture.add(fins);
  scene.add(sculpture);
  const picker = createFinPicker(renderer, camera, fins, U);

  /* ── 后处理（原版 Stage.ts:266-282 的搭法与参数，逐字照搬）──
     原版还有一层 DepthOfField 与自己的 grade（色调映射 + 暗角 + 色差），
     本站**只搬 AO**：DoF 那组参数是按原版相机构图量的（focusDistance 1060
     对应它的机位），本站容器尺寸与机位都不同，照搬必然跑偏；grade 里那套
     暗角/色调映射的观感依赖原版的具体曝光，站内已有 ACESFilmic 在renderer 上。 */
  const composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    /* ★ 抗锯齿靠这里，不靠 `new WebGLRenderer({ antialias: true })` ——
       composer 渲染到自己的 render target，renderer 的 canvas 级 MSAA 对它无效。
       原版 high 档就是 `multisampling: 4`（Stage.ts:267），照抄。 */
    multisampling: 4,
  });
  composer.addPass(new RenderPass(scene, camera));
  const ao = new N8AOPostPass(scene, camera, 1920, 1080);
  ao.configuration.aoRadius = 26;
  ao.configuration.distanceFalloff = 1.2;
  ao.configuration.intensity = 2.2;
  ao.configuration.gammaCorrection = false;
  ao.configuration.screenSpaceRadius = false;
  ao.setQualityMode('Medium');
  composer.addPass(ao);
  /* ── DoF（原版 Stage.ts:279-282，逐字照抄）──
     这一层原先**故意没搬**，理由写的是「参数是按原版机位量的，本站容器与机位都不同，
     照搬必然跑偏」。现在机位已经对齐（CAM_Z = 1080），
     那条理由不成立了。作用：把焦点（雕塑中心）以外的鳍片刃口轻微化开。
     ★ 原版的取值很克制（bokehScale 1.2 / focusRange 520，而带子的纵深只有 ±95），
       所以**产物上的效果是轻微的一层**，不是那种一眼可见的虚化 —— 别以为它没生效。
       判别方法：把 bokehScale 放大一个量级重建一次，画面若剧变即证明在跑。
       ⚠ dev 下这层会明显更糊（同参数同容器实测亮度中位 dev 170 / 产物 152），
         那是 dev 与产物的**深度取样差异**，不是效果差 —— 观感数据一律以产物为准。
     ★ focusDistance 必须随 camZ 走（见 resize）：它是**世界单位**的视距，
       窄屏下 camZ 被拉远，写死 1060 焦点就跑到雕塑前面去了。
     原版 1060 与相机 1080 的差 20 正好是雕塑中心到相机的距离。 */
  const dof = new DepthOfFieldEffect(camera, {
    focusDistance: CAM_Z - 20, focusRange: 520, bokehScale: 1.2, resolutionScale: 0.5,
  });
  composer.addPass(new EffectPass(camera, dof));
  /* ── grade（照搬原版 GradeEffect 的色彩三步，见 fin-grade.ts 的注释）──
     必须排在 AO **之后**：grade 要作用在已经含 AO 的最终画面上，
     反过来的话 AO 会把 grade 提亮的暗部重新压回去。 */
  composer.addPass(new EffectPass(camera, createFinGrade()));

  /* ── 装配动画（uAssemble：0.5-0.5cos(πx)）──
     ★ 原版 Stage.ts:339 的默认值是 `playAssemble(duration = 2300)`，即 **2.3 秒**。
       这里原先写的是 0.5 秒，那不是原版值（而且叠加 dt 单位 bug 后实际只跑
       0.167 秒，肉眼几乎看不到笔触画出来的过程）。 */
  const ASSEMBLE_DUR = 2.3;
  let assembleFrom = 0;
  let assembleT0 = -1;
  U.uAssemble.value = 0;

  /* ── 指针视差（原版 Stage.ts:418-419）：指针带动镜头平移与微转 ── */
  let px = 0, py = 0;   // 目标（-1..1）
  let cxp = 0, cyp = 0; // 当前（向目标缓动，避免生硬）

  /* ── 主题：uDenied 一个 0→1 驱动全部联动（原版同构）── */
  let denied = 0, deniedTarget = 0;

  let seconds = 0;
  let w = 0, h = 0, dpr = 1;
  /** 当前容器宽高比下的相机距离（resize 时按 CAM_Z 缩放出来） */
  let camZ = CAM_Z;

  function setDenied(v: number) {
    deniedTarget = v;
  }

  /** 换色板（主题切换时调）。uniform 里的 Color 对象直接改内容，不重建材质 ——
   *  重建会让 three 重新编译着色器（这里有 onBeforeCompile，成本很高）。 */
  function setPalette(p: FinPalette) {
    bodyLight.set(p.bodyLight);
    bodyDark.set(p.bodyDark);
    glowLight.set(p.glowLight);
    glowDark.set(p.glowDark);
    sceneLight.set(p.sceneLight);
    sceneDark.set(p.sceneDark);
    amb.color.set(p.ambientLight);
  }

  function pulse(origin = 0.25) {
    const i = pulseSlot;
    pulseT[i] = seconds;
    pulseO[i] = origin;
    pulseSlot = (i + 1) % 16;
  }

  function resize(nw: number, nh: number, ndpr: number) {
    w = Math.max(1, Math.floor(nw));
    h = Math.max(1, Math.floor(nh));
    // 限制全屏后处理的总像素数，高 DPI 下仍以 CSS 尺寸铺满画布。
    dpr = Math.min(ndpr, 2, Math.sqrt(1_650_000 / (w * h)));
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    // ★ composer 必须**单独**设尺寸：它有两张内部缓冲，只设 renderer 不够
    //   （这是 postprocessing 的常见坑 —— 不设的话 AO 会按默认 1920×1080 采样，
    //   在别的容器尺寸下 AO 范围会明显不对）。
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    /* 相机距离按容器宽高比调：窄屏时容器更瘦，FOV 30 的横向视野会不够，
       ∞ 的两端会被切掉。按宽高比反比缩放距离（基准 1080 = 原版机位）。 */
    const ar = w / h;
    camZ = CAM_Z * Math.max(1, CAM_ASPECT / Math.max(ar, 0.35));
    /* 焦点跟着机位走：焦点始终落在雕塑中心（相机到原点距离再退 20 单位，
       与原版 1080/1060 的关系一致）。 */
    dof.circleOfConfusionMaterial.focusDistance = camZ - 20;
    camera.position.set(0, CAM_Y, camZ);
    camera.lookAt(0, 0, 0);
  }

  function render(dtMs: number) {
    /* ★★ dt 的单位是**毫秒**（rl-core 的 startLoop 给的是 `now - last`）。
       2026-10-18 真机实测踩过这个坑：这里原来写的是 `Math.min(dt, 0.05)` ——
       把毫秒当秒用，于是 step **恒等于 0.05**（不管帧间隔是 16ms 还是 100ms，
       都比 0.05 大，一律被钳到 0.05）。后果是时间流速变成
       「0.05 × 帧率」秒/秒，**与真实时间彻底脱钩**：
         · 无头软渲染 15.6 fps 下 uTime 只有 0.78/秒（看着像变慢了，其实是巧合）
         · 真机 60Hz ⇒ uTime 3.0/秒 = **3 倍速**；144Hz ⇒ 7.2/秒
       uFlow / uSpin / 脉冲的 age 全部走 uTime，所以「动得太快、脉冲也太快」。
       同一个函数下面的 composer.render(dt / 1000) 早就承认 dt 是毫秒，
       只有上面那行漏了 —— 同一个值在同一个函数里被当两种单位用。
       ⇒ 转换集中在这里做一次，下游一律拿秒。钳位 50ms 对齐原版的 0.05 秒。 */
    const step = Math.min(dtMs, 50) / 1000;
    relayMotion.advance(relayTarget,step,U.uFlow.value);
    relayAttribute.needsUpdate=true;
    liftAttribute.needsUpdate=true;
    if(location.search.includes('qa=1')){
      canvas.dataset.relay=relayMotion.progress.toFixed(4);
      if(relayMotion.info){
        canvas.dataset.relayDirection=relayMotion.info.horizontal;
        canvas.dataset.relayStartPhase=(((relayMotion.info.first+relayMotion.info.flow)/FIN_COUNT)%1).toFixed(4);
      }
    }
    seconds += step;
    U.uTime.value = seconds;
    // 整条带子沿曲线匀速流动（原版 Stage.ts:382：flow + dt * 1.6）
    U.uFlow.value = (U.uFlow.value + step * 1.6) % FIN_COUNT;

    // 装配：跑完就停在 1，不回弹
    if (assembleT0 >= 0) {
      const x = Math.min(1, (seconds - assembleT0) / ASSEMBLE_DUR);
      U.uAssemble.value = assembleFrom + (1 - assembleFrom) * (0.5 - 0.5 * Math.cos(Math.PI * x));
      if (x >= 1) { U.uAssemble.value = 1; assembleT0 = -1; }
    }

    /* uDenied 跟随主题。★ 原版是**硬切**（Stage.ts:407 直接赋值，
       App.svelte:195 注释原话「a cut, hidden by the tear」——刻意不做淡入淡出，
       靠撕裂遮住跳变）。本站保留硬切，所以这里直接赋值而不是缓动。 */
    denied = deniedTarget;
    U.uDenied.value = denied;

    // 6 处联动（原版 uDenied 的全部作用面）
    fins.material.color.setRGB(1, 1, 1); // 本体色在着色器里算，这里只给光用
    bg.copy(sceneDark).lerp(sceneLight, 1 - denied);
    renderer.setClearColor(bg, 0);
    /* ★ 环境光 = 原版的 environmentIntensity（Stage.ts:427）。
       原版用 studio.hdr 走 PMREM，本站不引外部 HDR（站规：禁外部资源），
       用 AmbientLight 顶替，基准强度 LOOK.env = 0.8，联动系数 0.72。
       亮色额外加 0.4 柔和补光，把暗面提白；暗色不加，保留原有层次。 */
    amb.intensity = 0.8 * (1 - denied * 0.72) + 0.4 * (1 - denied);
    key.intensity = 3.4 * (1 - denied * 0.5);

    // 视差缓动
    cxp += (px - cxp) * Math.min(1, step * 3.2);
    cyp += (py - cyp) * Math.min(1, step * 3.2);
    /* 机位（原版 Stage.ts:418-419）：指针带 40/24 的平移 + 装配时从远处 dolly 进。
       ★ y 的基准是 CAM_Y —— 2026-10-18 晚归零（原版是 60，等于 3.18° 俯角；
         俯角会让两瓣一大一小，站主读成「歪」，见常量处的三段历程）。 */
    const intro = easeIntro(U.uAssemble.value);
    camera.position.set(
      cxp * 40,
      CAM_Y + cyp * 24,
      camZ + (1 - intro) * 300,
    );
    camera.lookAt(0, 0, 0);

    // 雕塑自转：原版 uSpin 由外部缓慢驱动（Stage.ts:383：spin += dt * 0.05）
    U.uSpin.value += step * 0.05;
    /* ★★ 姿态：**近乎正视**。俯仰 2°（原版 16°）、顺时针微转 1°、
       偏航摆动 ±2°（原版 ±9°）。三项一起决定"正不正"，见常量处的三段历程。 */
    sculpture.rotation.set(
      (TILT_DEG + Math.sin(seconds * 0.11) * TILT_WAVE_DEG) * DEG,
      (Math.sin(seconds * 0.07) * YAW_SWAY_DEG - (1 - intro) * ASSEMBLE_TWIST_DEG) * DEG,
      ROLL_DEG * DEG,
    );

    // ★ 只调 composer.render：它内部第一道pass 就是 RenderPass(scene, camera)，
    //   自己再 renderer.render 一次等于把场景画两遍（多一倍光栅化开销，
    //   而且 clearColor 的设置时机也会打架）。传**秒**（后处理的时间单位）。
    composer.render(step);
  }

  function setPointer(nx: number, ny: number) {
    px = Math.max(-1, Math.min(1, nx));
    py = Math.max(-1, Math.min(1, ny));
  }

  function dispose() {
    picker.dispose();
    finGeo.dispose();
    finMat.dispose();
    finDepth.dispose();
    key.shadow.map?.dispose();
    composer.dispose();
    renderer.dispose();
    // 浏览器在画布脱离后回收上下文。主动丢失上下文会同步等待 GPU 完成已提交的帧。
  }

  assembleT0 = 0;

  return {
    setRelay(progress: number) { relayTarget=Math.max(0,Math.min(2,progress)); },
    hitTest: picker.hitTest,
    pulse,
    setDenied,
    setPalette,
    setPointer,
    resize,
    render,
    dispose,
    playAssemble() { assembleFrom = U.uAssemble.value; assembleT0 = seconds; },
  };
}
