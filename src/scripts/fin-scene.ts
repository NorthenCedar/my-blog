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
  ACESFilmicToneMapping,
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
  MeshStandardMaterial,
  PerspectiveCamera,
  PCFSoftShadowMap,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';

import { FIN_COMMON, FIN_EMISSIVE, FIN_SURFACE, FIN_UNIFORMS, FIN_VERTEX, FIN_VERTEX_ATTRS } from './fin-shaders';

/* 后处理（照搬原版 Stage.ts:266-282 的搭法）。
   ★ 动态 import 的原因：这两个包合起来会让关于页那个 chunk 明显变大
     （postprocessing ≈ 200 KB+、n8ao ≈ 228 KB），不该让「没打开装置」的人付。
     场景本身就是动态 import 的，所以放在一起——**同一个 chunk，付一次**。 */
import { EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

/** 鳍片数（原版 FIN_COUNT = 400）。 */
export const FIN_COUNT = 400;

/** 原版参数（Stage.ts:179-183），逐字照抄 —— 这些是量出来的，不是随手调的。 */
export const FIN_PARAMS = {
  radius: 285,
  aspect: 0.95,
  depth: 95,
  twist: 1.5,
  lean: 0.62,
  thickness: 4.2,
  width: 84,
  height: 84,
} as const;

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
  render(dt: number): void;
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
): Promise<FinScene> {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

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

  /* ── 灯（原版 lights()：一盏 key 投阴影 + 一盏 fill + 环境光）── */
  const key = new DirectionalLight(0xffffff, 2.4);
  key.position.set(320, 420, 520);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const fill = new DirectionalLight(0xffffff, 0.7);
  fill.position.set(-360, -180, 260);
  const amb = new AmbientLight(new Color(palette.ambientLight), 0.9);
  scene.add(key, fill, amb);

  /* ── 雕塑（鳍片）── */
  const finGeo = instanced(new BoxGeometry(1, 1, 1), FIN_COUNT);

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
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FIN_SURFACE}`)
      .replace('#include <color_fragment>', 'diffuseColor.rgb = rlBody;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.55, 0.36, bevel);')
      .replace('#include <emissivemap_fragment>', FIN_EMISSIVE);
  };

  const fins = new Mesh(finGeo, finMat);
  fins.frustumCulled = false;
  fins.castShadow = true;
  fins.receiveShadow = true;

  const sculpture = new Group();
  sculpture.add(fins);
  scene.add(sculpture);

  /* ── 后处理（原版 Stage.ts:266-282 的搭法与参数，逐字照搬）──
     原版还有一层 DepthOfField 与自己的 grade（色调映射 + 暗角 + 色差），
     本站**只搬 AO**：DoF 那组参数是按原版相机构图量的（focusDistance 1060
     对应它的机位），本站容器尺寸与机位都不同，照搬必然跑偏；grade 里那套
     暗角/色调映射的观感依赖原版的具体曝光，站内已有 ACESFilmic 在renderer 上。 */
  const composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    multisampling: 0,
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

  /* ── 装配动画（uAssemble：0.5-0.5cos(πx)，原版 0.5 秒笔触式画出来）── */
  const ASSEMBLE_DUR = 0.5;
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
  const ptr = new Vector2();

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
    dpr = Math.min(ndpr, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    // ★ composer 必须**单独**设尺寸：它有两张内部缓冲，只设 renderer 不够
    //   （这是 postprocessing 的常见坑 —— 不设的话 AO 会按默认 1920×1080 采样，
    //   在别的容器尺寸下 AO 范围会明显不对）。
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    /* 相机距离按容器宽高比调：窄屏时容器更瘦，FOV 30 的横向视野会不够，
       ∞ 的两端会被切掉。按宽高比反比缩放距离。 */
    const target = 1150;
    const ar = w / h;
    camera.position.set(0, 0, target * Math.max(1, 1.62 / Math.max(ar, 0.35)));
    camera.lookAt(0, 0, 0);
  }

  function render(dt: number) {
    const step = Math.min(dt, 0.05);
    seconds += step;
    U.uTime.value = seconds;
    // 整条带子沿曲线匀速流动（原版 uFlow 每秒 +0.6）
    U.uFlow.value = (U.uFlow.value + step * 0.6) % FIN_COUNT;

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
    amb.intensity = 0.9 * (1 - denied * 0.72);      // 环境光降到 28%
    key.intensity = 2.4 * (1 - denied * 0.5);

    // 视差缓动
    cxp += (px - cxp) * Math.min(1, step * 3.2);
    cyp += (py - cyp) * Math.min(1, step * 3.2);
    ptr.set(cxp * 40, cyp * 40);
    camera.position.x = ptr.x;
    camera.position.y = ptr.y;
    camera.rotation.y = cxp * 0.0279; // 原版 1.6° = 0.0279rad
    camera.lookAt(0, 0, 0);

    // 雕塑自转：原版 uSpin 由外部缓慢驱动
    U.uSpin.value += step * 0.06;
    sculpture.rotation.y = Math.sin(seconds * 0.12) * 0.16;

    // ★ 只调 composer.render：它内部第一道pass 就是 RenderPass(scene, camera)，
    //   自己再 renderer.render 一次等于把场景画两遍（多一倍光栅化开销，
    //   而且 clearColor 的设置时机也会打架）。
    composer.render(dt / 1000);
  }

  function setPointer(nx: number, ny: number) {
    px = Math.max(-1, Math.min(1, nx));
    py = Math.max(-1, Math.min(1, ny));
  }

  function dispose() {
    finGeo.dispose();
    finMat.dispose();
    key.shadow.map?.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }

  assembleT0 = 0;

  return {
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