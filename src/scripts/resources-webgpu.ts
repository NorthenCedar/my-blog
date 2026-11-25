/// <reference types="@webgpu/types" />
import {
  CURVE_CONFIG,
  clamp,
  isHtmlInCanvasSupported,
  keyLightSlope,
  lerp,
  type ResourceCardLayout,
  type ResourceRenderState,
  type Resources3DRenderer,
} from './resources-curve';
import {
  applyMixedOverridesToPalette,
  buildTitleGlyphRun,
  cardElevAt,
  emitCardTopFace,
  emitEdgeRailsAndTicks,
  emitFullWidthRunway,
  emitRoundedSlabWalls,
  emitStandingTitleChars,
  emitStandingTitleWalls,
  paintBannerCanvas,
  paintCardCanvas,
  readResourcePalette,
  type GlyphRun,
  type RGBA,
  type ResourcePalette,
  type VertexSink,
} from './resources-scene-data';

const SHADOW_SIZE = 1536;
const SAMPLE_COUNT = 4;
const GRID_EXT_X = 9;
const FRAME_FLOATS = 300; // 1200 bytes (std140 aligned)
const MIP_LEVELS = 4;

const COMMON_WGSL = `
const N0: f32 = 16.0;
const F0: f32 = 28000.0;

struct Frame {
  size: vec2f,
  T: f32,
  ds: f32,
  fov: f32,
  pitch: f32,
  lift: f32,
  shade: f32,
  cam: vec2f,
  scrollY: f32,
  focusRow: f32,
  light: vec4f,      // slopeX, slopeY, highestZ, shadowFloor
  lightRect: vec4f,  // x, y, w, h
  voidBg: vec4f,
  gridMinor: vec4f,
  gridMajor: vec4f,
  haloColor: vec4f,
  pageBg: vec4f,     // rgb = flat page bg, a = frame.fade
  profile: array<vec4f, 65>,
};

@group(0) @binding(0) var<uniform> frame: Frame;

struct Bent {
  world: vec3f,
  th: f32,
};

fn bend(pos: vec3f) -> Bent {
  let s = clamp((frame.T - pos.y) / max(1.0, frame.ds), 0.0, 64.0);
  let i = min(i32(s), 63);
  let f = s - f32(i);
  let a = frame.profile[i];
  let b = frame.profile[i + 1];
  let th = mix(a.z, b.z, f);
  let P = mix(a.xy, b.xy, f) + pos.z * frame.lift * vec2f(cos(th), sin(th));
  return Bent(vec3f(pos.x - frame.size.x * 0.5, P.x, P.y), th);
}

fn clipPos(world: vec3f) -> vec4f {
  let rel = world - vec3f(0.0, frame.cam.x, frame.cam.y);
  let c = cos(frame.pitch);
  let sn = sin(frame.pitch);
  let zf = dot(rel, vec3f(0.0, sn, -c));
  let yu = dot(rel, vec3f(0.0, c, sn));
  let k = tan(frame.fov * 0.5);
  return vec4f(rel.x / (k * frame.size.x / max(1.0, frame.size.y)), yu / k, (zf - N0) * F0 / (F0 - N0), max(zf, 1.0));
}

fn nearer(P: vec4f, d: f32) -> vec4f {
  if (d <= 0.0 || P.w <= N0) { return P; }
  let z = max(P.w - d, N0 * 1.01);
  return vec4f(P.xy, (z - N0) * F0 / ((F0 - N0) * z) * P.w, P.w);
}

fn lightClip(pos: vec3f) -> vec4f {
  let h = pos.z * frame.lift;
  let at = (pos.xy - h * frame.light.xy - frame.lightRect.xy) / frame.lightRect.zw;
  return vec4f(2.0 * at.x - 1.0, 1.0 - 2.0 * at.y, 1.0 - h / frame.light.z, 1.0);
}
`;

const GRID_WGSL = `
${COMMON_WGSL}

struct GridIn {
  @location(0) worldPos: vec4f,
  @location(1) surf: vec2f,
};

struct GridOut {
  @builtin(position) position: vec4f,
  @location(0) surf: vec2f,
  @location(1) depth: f32,
  @location(2) focusDist: f32,
};

@vertex fn vertexMain(v: GridIn) -> GridOut {
  var out: GridOut;
  let P = clipPos(v.worldPos.xyz);
  out.position = P;
  out.surf = vec2f(v.surf.x - frame.size.x * 0.5, v.surf.y + frame.scrollY);
  out.depth = P.w;
  out.focusDist = abs(v.worldPos.w - frame.focusRow);
  return out;
}

// Shopify exact grid-BxcvQmWM.wgsl line coverage (anti-aliased hairline fading when crowded under ~6px)
fn gridLines(c: f32, s: f32, w: f32) -> f32 {
  let fw = max(fwidth(c), 1e-4);
  let ww = max(w, 1.0);
  let d = abs(fract(c / s + 0.5) - 0.5) * s;
  let cover = 1.0 - smoothstep((ww * 0.5 - 0.5) * fw, (ww * 0.5 + 0.5) * fw, d);
  return cover * min(w, 1.0) * smoothstep(3.0, 9.0, s / fw);
}

// Shopify exact PCG hash for deterministic per-column pulse speeds & phases
fn pcgHash(seed: f32) -> f32 {
  let state = u32(seed) * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return f32((word >> 22u) ^ word) * (1.0 / 4294967296.0);
}

// Shopify exact upward vertical pulses on 50% of major columns (speed=495px/s, length=300px)
fn verticalPulse(along: f32, across: f32, big: f32, timeSec: f32) -> f32 {
  let id = floor(across / big + 0.5) + 10000.0;
  let on = step(0.5, pcgHash(id * 3.0 + 1.0));
  let period = big * 12.0;
  let head = timeSec * 495.0 * (pcgHash(id * 5.0 + 3.0) * 0.8 + 0.6) + pcgHash(id) * period;
  let run = head + along;
  let behind = run - period * floor(run / period);
  let core = gridLines(across, big, 0.85 * 1.6);
  let glow = gridLines(across, big, 0.85 * 7.0) * 0.25;
  return on * exp(-behind / 300.0) * (core + glow);
}

@fragment fn fragmentMain(in: GridOut) -> @location(0) vec4f {
  // Shopify exact grid spacing: columns=6, every=10 -> cell = W/60, big = W/6
  let cell = max(12.0, frame.size.x / 60.0);
  let big = cell * 10.0;
  let minor = max(gridLines(in.surf.x, cell, 0.85), gridLines(in.surf.y, cell, 0.85));
  let major = max(gridLines(in.surf.x, big, 0.85), gridLines(in.surf.y, big, 0.85));
  let diag = max(gridLines(in.surf.x + in.surf.y, big * 2.0, 0.85), gridLines(in.surf.x - in.surf.y, big * 2.0, 0.85));
  let timeSec = frame.profile[0].w;
  let vPulse = verticalPulse(in.surf.y, in.surf.x, big, timeSec);

  let horizDist = abs(in.surf.x) / max(1.0, frame.size.x * 4.2);
  let fog = (1.0 - smoothstep(1600.0, 8200.0, in.depth)) * (1.0 - smoothstep(0.5, 1.3, horizDist));
  let gridFade = clamp(fog * frame.pageBg.a, 0.0, 1.0);

  var col = mix(frame.pageBg.rgb, frame.voidBg.rgb, frame.pageBg.a);
  let halo = exp(-in.focusDist / max(240.0, frame.size.y * 0.72)) * (1.0 - smoothstep(0.0, 1.2, abs(in.surf.x) / max(1.0, frame.size.x * 0.9)));
  col = mix(col, frame.haloColor.rgb, halo * frame.haloColor.a * frame.pageBg.a);
  col = mix(col, frame.gridMinor.rgb, minor * frame.gridMinor.a * gridFade);
  col = mix(col, frame.gridMinor.rgb, diag * frame.gridMinor.a * 0.55 * gridFade);
  col = mix(col, frame.gridMajor.rgb, major * frame.gridMajor.a * gridFade);
  col = mix(col, frame.gridMajor.rgb, clamp(vPulse * 0.65 * gridFade, 0.0, 1.0));
  return vec4f(col, 1.0);
}
`;

const SURFACE_WGSL = `
${COMMON_WGSL}

struct SurfIn {
  @location(0) pos: vec3f,
  @location(1) uv: vec2f,
  @location(2) color: vec4f,
  @location(3) mode: f32, // 0=solid, 1=tex card/banner, 2=reserved, 3=3D glyph face, 4=3D glyph solid wall, 5=unlit 3D wire
};

struct SurfOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) mode: f32,
  @location(3) light: f32,
  @location(4) stripPos: vec3f,
};

@group(1) @binding(0) var shadowMap: texture_depth_2d;
@group(1) @binding(1) var shadowSampler: sampler_comparison;
@group(2) @binding(0) var uTex: texture_2d<f32>;
@group(2) @binding(1) var uSampler: sampler;

@vertex fn casterVertex(v: SurfIn) -> @builtin(position) vec4f {
  return lightClip(v.pos);
}

@vertex fn meshVertex(v: SurfIn) -> SurfOut {
  var out: SurfOut;
  let b = bend(v.pos);
  var layerBias = clamp(v.pos.z, 0.0, 120.0) * 0.14 * (1.0 - frame.lift) + select(0.0, 1.2, v.pos.z > 0.6 && v.pos.z < 3.0);
  if (v.mode > 4.5) {
    layerBias = 0.6;
  } else if (v.mode > 3.5) {
    layerBias = 3.0;
  } else if (v.mode > 2.5) {
    layerBias = 4.0 + 3.0 * (1.0 - frame.lift);
  }
  out.position = nearer(clipPos(b.world), layerBias);
  out.uv = v.uv;
  out.color = v.color;
  out.mode = v.mode;
  out.light = select(1.0 - frame.shade * max(sin(b.th), 0.0), 1.0, v.mode > 2.5);
  out.stripPos = v.pos;
  return out;
}

fn keyLight(pos: vec3f) -> f32 {
  let c = lightClip(pos);
  let at = vec2f(0.5 + 0.5 * c.x, 0.5 - 0.5 * c.y);
  let inside = step(0.0, at.x) * step(at.x, 1.0) * step(0.0, at.y) * step(at.y, 1.0);
  let texel = 1.0 / vec2f(textureDimensions(shadowMap));
  let depth = c.z - 3.5 / frame.light.z;
  var lit = 0.0;
  for (var i: i32 = -1; i <= 1; i++) {
    for (var j: i32 = -1; j <= 1; j++) {
      lit += textureSampleCompareLevel(shadowMap, shadowSampler, clamp(at + vec2f(f32(i), f32(j)) * texel, vec2f(0.001), vec2f(0.999)), depth);
    }
  }
  let shadow = mix(frame.light.w, 1.0, lit / 9.0);
  let strength = smoothstep(0.0, 0.35, frame.lift);
  return mix(1.0, shadow, inside * strength);
}

@fragment fn meshFragment(in: SurfOut) -> @location(0) vec4f {
  let tx = textureSample(uTex, uSampler, in.uv);
  let k = keyLight(in.stripPos);
  if (in.mode > 4.5) {
    if (in.color.a < 0.004) { discard; }
    return vec4f(in.color.rgb, in.color.a);
  }
  if (in.mode > 3.5) {
    return vec4f(in.color.rgb * in.light, 1.0);
  }
  if (in.mode > 2.5) {
    if (tx.a < 0.42) { discard; }
    return vec4f(tx.rgb * in.color.rgb * in.light, 1.0);
  }
  if (in.mode > 0.5 && in.mode < 1.5) {
    if (tx.a < 0.04) { discard; }
    return vec4f(tx.rgb * in.color.rgb * in.light * k, tx.a * in.color.a);
  }
  if (in.color.a < 0.004) { discard; }
  return vec4f(in.color.rgb * in.light * k, in.color.a);
}
`;

const TITLE_CASTER_WGSL = `
${COMMON_WGSL}

struct SurfIn {
  @location(0) pos: vec3f,
  @location(1) uv: vec2f,
  @location(2) color: vec4f,
  @location(3) mode: f32,
};

struct CasterOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@group(1) @binding(0) var uTex: texture_2d<f32>;
@group(1) @binding(1) var uSampler: sampler;

@vertex fn titleCasterVertex(v: SurfIn) -> CasterOut {
  return CasterOut(lightClip(v.pos), v.uv);
}

@fragment fn titleCasterFragment(in: CasterOut) {
  let tx = textureSampleLevel(uTex, uSampler, in.uv, 0.0);
  if (tx.a < 0.28) { discard; }
}
`;

interface TextureRecord {
  tex: GPUTexture;
  view: GPUTextureView;
  bindGroup: GPUBindGroup;
  version: string;
  w: number;
  h: number;
  levels: number;
}

function nextPow2(cur: number, need: number): number {
  let s = Math.max(1024, cur);
  while (s < need) s *= 2;
  return s;
}

export class ResourcesWebGPURenderer implements Resources3DRenderer {
  readonly backend: 'webgpu-hic' | 'webgpu';
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;
  private sampleCount: number;

  private frameBuf: GPUBuffer;
  private frameData = new Float32Array(FRAME_FLOATS);
  private frameBindGroup: GPUBindGroup;

  private gridPipeline: GPURenderPipeline;
  private gridVbo: GPUBuffer;
  private gridIbo: GPUBuffer;
  private gridVerts = new Float32Array((CURVE_CONFIG.nodes + 5) * 2 * 6);
  private gridIndexCount = 0;

  private casterPipeline: GPURenderPipeline;
  private titleCasterPipeline: GPURenderPipeline;
  private opaquePipeline: GPURenderPipeline;
  private alphaPipeline: GPURenderPipeline;
  private wirePipeline: GPURenderPipeline;
  private surfaceVbo: GPUBuffer | null = null;
  private surfaceVboCap = 0;
  private surfaceVerts = new Float32Array(32768 * 10);
  private surfaceCount = 0;

  private shadowTex: GPUTexture;
  private shadowView: GPUTextureView;
  private shadowSampler: GPUSampler;
  private shadowBindGroup: GPUBindGroup;
  private shadowBindLayout: GPUBindGroupLayout;

  private texLayout: GPUBindGroupLayout;
  private texSampler: GPUSampler;
  private whiteTex: TextureRecord;
  private textures = new Map<string, TextureRecord>();
  private images = new Map<string, HTMLImageElement>();
  private glyphRuns = new Map<string, { version: string; chars: GlyphRun['chars']; texKey: string }>();

  private msaaColorTex: GPUTexture | null = null;
  private msaaColorView: GPUTextureView | null = null;
  private depthTex: GPUTexture | null = null;
  private depthView: GPUTextureView | null = null;
  private targetW = 0;
  private targetH = 0;

  private palette: ResourcePalette;
  private themeFastPreview = false;
  private lastCardThemeRepaintMs = 0;
  private scratchCanvas: HTMLCanvasElement;
  private mipCanvas: HTMLCanvasElement;
  private mipCanvasB: HTMLCanvasElement;
  private disposed = false;

  static async create(
    canvas: HTMLCanvasElement,
    styleHost: HTMLElement,
    onAssetLoad: () => void,
  ): Promise<ResourcesWebGPURenderer | null> {
    if (typeof navigator === 'undefined' || !navigator.gpu) return null;
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
      if (!context) {
        device.destroy();
        return null;
      }
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({ device, format, alphaMode: 'opaque' });
      return await ResourcesWebGPURenderer.buildPipelines(canvas, styleHost, device, context, format, onAssetLoad);
    } catch {
      return null;
    }
  }

  private static async buildPipelines(
    canvas: HTMLCanvasElement,
    styleHost: HTMLElement,
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    onAssetLoad: () => void,
  ): Promise<ResourcesWebGPURenderer> {
    const sampleCount = SAMPLE_COUNT;
    const frameLayout = device.createBindGroupLayout({
      label: 'res-frame',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    const shadowLayout = device.createBindGroupLayout({
      label: 'res-shadow',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
      ],
    });
    const texLayout = device.createBindGroupLayout({
      label: 'res-tex',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const gridMod = device.createShaderModule({ label: 'res-grid', code: GRID_WGSL });
    const surfMod = device.createShaderModule({ label: 'res-surface', code: SURFACE_WGSL });
    const titleCasterMod = device.createShaderModule({ label: 'res-title-caster', code: TITLE_CASTER_WGSL });

    const gridLayout = device.createPipelineLayout({ bindGroupLayouts: [frameLayout] });
    const casterLayout = device.createPipelineLayout({ bindGroupLayouts: [frameLayout] });
    const titleCasterLayout = device.createPipelineLayout({ bindGroupLayouts: [frameLayout, texLayout] });
    const surfLayout = device.createPipelineLayout({ bindGroupLayouts: [frameLayout, shadowLayout, texLayout] });

    const surfBufferDesc: GPUVertexBufferLayout = {
      arrayStride: 40,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x2' },
        { shaderLocation: 2, offset: 20, format: 'float32x4' },
        { shaderLocation: 3, offset: 36, format: 'float32' },
      ],
    };

    const [gridPipeline, casterPipeline, titleCasterPipeline, opaquePipeline, alphaPipeline, wirePipeline] = await Promise.all([
      device.createRenderPipelineAsync({
        label: 'res-grid',
        layout: gridLayout,
        vertex: {
          module: gridMod,
          entryPoint: 'vertexMain',
          buffers: [{
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'float32x2' },
            ],
          }],
        },
        fragment: { module: gridMod, entryPoint: 'fragmentMain', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
        multisample: { count: sampleCount },
      }),
      device.createRenderPipelineAsync({
        label: 'res-caster',
        layout: casterLayout,
        vertex: { module: surfMod, entryPoint: 'casterVertex', buffers: [surfBufferDesc] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth16unorm', depthWriteEnabled: true, depthCompare: 'less', depthBias: 1, depthBiasSlopeScale: 1 },
      }),
      device.createRenderPipelineAsync({
        label: 'res-title-caster',
        layout: titleCasterLayout,
        vertex: { module: titleCasterMod, entryPoint: 'titleCasterVertex', buffers: [surfBufferDesc] },
        fragment: { module: titleCasterMod, entryPoint: 'titleCasterFragment', targets: [] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth16unorm', depthWriteEnabled: true, depthCompare: 'less', depthBias: 1, depthBiasSlopeScale: 1 },
      }),
      device.createRenderPipelineAsync({
        label: 'res-opaque',
        layout: surfLayout,
        vertex: { module: surfMod, entryPoint: 'meshVertex', buffers: [surfBufferDesc] },
        fragment: { module: surfMod, entryPoint: 'meshFragment', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
        multisample: { count: sampleCount },
      }),
      device.createRenderPipelineAsync({
        label: 'res-alpha',
        layout: surfLayout,
        vertex: { module: surfMod, entryPoint: 'meshVertex', buffers: [surfBufferDesc] },
        fragment: {
          module: surfMod,
          entryPoint: 'meshFragment',
          targets: [{
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
        multisample: { count: sampleCount },
      }),
      device.createRenderPipelineAsync({
        label: 'res-wire',
        layout: surfLayout,
        vertex: { module: surfMod, entryPoint: 'meshVertex', buffers: [surfBufferDesc] },
        fragment: {
          module: surfMod,
          entryPoint: 'meshFragment',
          targets: [{
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' },
        multisample: { count: sampleCount },
      }),
    ]);

    return new ResourcesWebGPURenderer(
      canvas,
      styleHost,
      device,
      context,
      format,
      sampleCount,
      frameLayout,
      shadowLayout,
      texLayout,
      gridPipeline,
      casterPipeline,
      titleCasterPipeline,
      opaquePipeline,
      alphaPipeline,
      wirePipeline,
      onAssetLoad,
    );
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    private styleHost: HTMLElement,
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    sampleCount: number,
    frameLayout: GPUBindGroupLayout,
    shadowLayout: GPUBindGroupLayout,
    texLayout: GPUBindGroupLayout,
    gridPipeline: GPURenderPipeline,
    casterPipeline: GPURenderPipeline,
    titleCasterPipeline: GPURenderPipeline,
    opaquePipeline: GPURenderPipeline,
    alphaPipeline: GPURenderPipeline,
    wirePipeline: GPURenderPipeline,
    private onAssetLoad: () => void,
  ) {
    this.backend = isHtmlInCanvasSupported() ? 'webgpu-hic' : 'webgpu';
    if (this.backend === 'webgpu-hic') {
      canvas.setAttribute('layoutsubtree', '');
      canvas.setAttribute('content', 'drawable');
    }
    this.device = device;
    this.context = context;
    this.format = format;
    this.sampleCount = sampleCount;
    this.shadowBindLayout = shadowLayout;
    this.texLayout = texLayout;
    this.gridPipeline = gridPipeline;
    this.casterPipeline = casterPipeline;
    this.titleCasterPipeline = titleCasterPipeline;
    this.opaquePipeline = opaquePipeline;
    this.alphaPipeline = alphaPipeline;
    this.wirePipeline = wirePipeline;

    this.frameBuf = device.createBuffer({
      label: 'res-frame',
      size: FRAME_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.frameBindGroup = device.createBindGroup({
      label: 'res-frame',
      layout: frameLayout,
      entries: [{ binding: 0, resource: { buffer: this.frameBuf } }],
    });

    const segs = CURVE_CONFIG.nodes + 4;
    const indices = new Uint16Array(segs * 6);
    for (let i = 0; i < segs; i++) indices.set([i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2], i * 6);
    this.gridIndexCount = segs * 6;
    this.gridIbo = device.createBuffer({ label: 'res-grid-ibo', size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.gridIbo, 0, indices);
    this.gridVbo = device.createBuffer({ label: 'res-grid-vbo', size: this.gridVerts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

    this.shadowTex = device.createTexture({
      label: 'res-shadow',
      size: { width: SHADOW_SIZE, height: SHADOW_SIZE },
      format: 'depth16unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadowView = this.shadowTex.createView();
    this.shadowSampler = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
    this.shadowBindGroup = device.createBindGroup({
      label: 'res-shadow',
      layout: this.shadowBindLayout,
      entries: [
        { binding: 0, resource: this.shadowView },
        { binding: 1, resource: this.shadowSampler },
      ],
    });

    this.texSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      maxAnisotropy: 8,
    });

    this.scratchCanvas = document.createElement('canvas');
    this.mipCanvas = document.createElement('canvas');
    this.mipCanvasB = document.createElement('canvas');
    this.whiteTex = this.createSolidWhiteTexture();
    this.palette = readResourcePalette(this.styleHost);
  }

  private createSolidWhiteTexture(): TextureRecord {
    const tex = this.device.createTexture({
      label: 'res-white',
      size: { width: 1, height: 1 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture({ texture: tex }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, { width: 1, height: 1 });
    const view = tex.createView();
    const bindGroup = this.device.createBindGroup({
      layout: this.texLayout,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: this.texSampler },
      ],
    });
    return { tex, view, bindGroup, version: '1', w: 1, h: 1, levels: 1 };
  }

  private uploadMipmappedCanvas(
    canvas: HTMLCanvasElement,
    key: string,
    version: string,
    sourceEl?: HTMLElement,
    fastSingleMip = false,
  ): TextureRecord {
    const prev = this.textures.get(key);
    if (prev && prev.version === version) return prev;

    const w = Math.max(1, canvas.width);
    const h = Math.max(1, canvas.height);
    const levels = fastSingleMip ? 1 : Math.min(MIP_LEVELS, Math.floor(Math.log2(Math.max(1, Math.min(w, h)))) + 1);

    // Zero-churn fast path during theme slider drag: reuse existing 1-level GPU texture in place!
    if (prev && prev.w === w && prev.h === h && prev.levels === levels && levels === 1) {
      this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture: prev.tex, mipLevel: 0 }, { width: w, height: h });
      prev.version = version;
      return prev;
    }

    if (prev) prev.tex.destroy();

    const tex = this.device.createTexture({
      label: key,
      size: { width: w, height: h },
      mipLevelCount: levels,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const queue = this.device.queue as unknown as {
      copyElementImageToTexture?: (src: unknown, dst: unknown) => void;
    };
    let uploadedLive = false;
    if (!fastSingleMip && sourceEl && this.backend === 'webgpu-hic' && queue.copyElementImageToTexture && sourceEl.isConnected) {
      try {
        queue.copyElementImageToTexture(
          { source: sourceEl, sx: 0, sy: 0, swidth: sourceEl.offsetWidth, sheight: sourceEl.offsetHeight },
          { texture: tex, mipLevel: 0 },
        );
        uploadedLive = true;
      } catch {
        uploadedLive = false;
      }
    }

    if (!uploadedLive) {
      this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture: tex, mipLevel: 0 }, { width: w, height: h });
    }

    // Generate crisp CPU-downsampled mip levels for oblique horizon perspective stability
    let srcCanvas: HTMLCanvasElement = canvas;
    let mw = w;
    let mh = h;
    for (let lvl = 1; lvl < levels; lvl++) {
      mw = Math.max(1, mw >> 1);
      mh = Math.max(1, mh >> 1);
      const dst = lvl % 2 === 1 ? this.mipCanvas : this.mipCanvasB;
      if (dst !== srcCanvas) {
        dst.width = mw;
        dst.height = mh;
        const mctx = dst.getContext('2d')!;
        mctx.clearRect(0, 0, mw, mh);
        mctx.drawImage(srcCanvas, 0, 0, mw, mh);
        this.device.queue.copyExternalImageToTexture({ source: dst }, { texture: tex, mipLevel: lvl }, { width: mw, height: mh });
        srcCanvas = dst;
      }
    }

    const view = tex.createView();
    const bindGroup = this.device.createBindGroup({
      layout: this.texLayout,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: this.texSampler },
      ],
    });
    const rec: TextureRecord = { tex, view, bindGroup, version, w, h, levels };
    this.textures.set(key, rec);
    return rec;
  }

  private getCoverImage(url: string): HTMLImageElement | null {
    if (!url) return null;
    let img = this.images.get(url);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.addEventListener('load', () => {
        if (!this.disposed) this.onAssetLoad();
      });
      img.src = url;
      this.images.set(url, img);
    }
    return img;
  }

  refreshTheme(fastPreview = false, mixedOverrides?: Record<string, string>) {
    this.palette = mixedOverrides
      ? applyMixedOverridesToPalette(this.palette, mixedOverrides)
      : readResourcePalette(this.styleHost);
    this.themeFastPreview = fastPreview;
    if (!fastPreview) this.lastCardThemeRepaintMs = 0;
  }

  resize(pxW: number, pxH: number) {
    if (this.disposed || (this.targetW === pxW && this.targetH === pxH)) return;
    this.targetW = pxW;
    this.targetH = pxH;
    this.msaaColorTex?.destroy();
    this.depthTex?.destroy();
    this.msaaColorTex = this.device.createTexture({
      label: 'res-msaa-color',
      size: { width: pxW, height: pxH },
      sampleCount: this.sampleCount,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.msaaColorView = this.msaaColorTex.createView();
    this.depthTex = this.device.createTexture({
      label: 'res-depth',
      size: { width: pxW, height: pxH },
      sampleCount: this.sampleCount,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthView = this.depthTex.createView();
  }

  render(state: ResourceRenderState, dpr: number) {
    if (this.disposed) return;
    if (this.canvas.width !== this.targetW || this.canvas.height !== this.targetH) {
      this.resize(this.canvas.width, this.canvas.height);
    }
    if (!this.msaaColorView || !this.depthView) return;

    const { frame, scrollY, cards, banners, titles, bands, hoveredCardId, raisedCardId, tiltByCard, titleAngles } = state;
    const pal = this.palette;
    const docToRow = (y: number) => y - scrollY + frame.lead;
    const bgDim = 1;
    const [lx, ly] = keyLightSlope();

    let highestZ = 90;
    const visibleCards: { card: ResourceCardLayout; r0: number; r1: number; elev: number; tiltRad: number; isRaised: boolean }[] = [];
    for (const card of cards) {
      const r0 = docToRow(card.docTop);
      const r1 = docToRow(card.docBottom);
      if (r1 < 0 || r0 > frame.T) continue;
      const cr0 = clamp(r0, 0, frame.T);
      const cr1 = clamp(r1, 0, frame.T);
      if (cr1 <= cr0 + 2) continue;
      const tilt = tiltByCard.get(card.id) ?? 0;
      const tiltRad = tilt * CURVE_CONFIG.tiltDeg * (Math.PI / 180) * frame.rise;
      const isHovered = card.id === hoveredCardId;
      const isRaised = card.id === raisedCardId || tilt > 0.05;
      const elev = cardElevAt(frame, cr0, cr1, isHovered, card.depthScale ?? 1);
      highestZ = Math.max(highestZ, elev + (tiltRad > 0.01 ? (cr1 - cr0) * Math.sin(tiltRad) : 0));
      visibleCards.push({ card, r0: cr0, r1: cr1, elev, tiltRad, isRaised });
    }
    highestZ = Math.max(highestZ, CURVE_CONFIG.headingFloat + 180) + 20;

    const rx = -highestZ * lx;
    const ry = -highestZ * ly;
    const lightRectX = Math.min(0, rx) - 40;
    const lightRectY = Math.min(0, ry) - 40;
    const lightRectW = frame.W + Math.abs(rx) + 80;
    const lightRectH = frame.T + Math.abs(ry) + 80;

    // Upload frame uniform buffer
    const d = this.frameData;
    d[0] = frame.W; d[1] = frame.H; d[2] = frame.T; d[3] = frame.ds;
    d[4] = frame.fov; d[5] = frame.pitch; d[6] = frame.rise; d[7] = CURVE_CONFIG.shade * frame.e;
    d[8] = frame.camY; d[9] = frame.camZ; d[10] = scrollY - frame.lead; d[11] = frame.focusRow;
    d[12] = lx; d[13] = ly; d[14] = highestZ; d[15] = CURVE_CONFIG.slabShadow;
    d[16] = lightRectX; d[17] = lightRectY; d[18] = lightRectW; d[19] = lightRectH;
    d.set(pal.voidBg, 20);
    d.set(pal.voidGrid, 24);
    d.set(pal.voidMajor, 28);
    d.set(pal.horizonHalo, 32);
    d[36] = pal.pageBgRgb[0]; d[37] = pal.pageBgRgb[1]; d[38] = pal.pageBgRgb[2]; d[39] = frame.fade;
    for (let i = 0; i <= CURVE_CONFIG.nodes; i++) {
      const o = 40 + i * 4;
      d[o] = frame.pts[i * 2];
      d[o + 1] = frame.pts[i * 2 + 1];
      d[o + 2] = frame.ang[i];
      d[o + 3] = i === 0 ? state.timeSec : 0;
    }
    this.device.queue.writeBuffer(this.frameBuf, 0, d);

    // Populate Grid Vertices
    const N = CURVE_CONFIG.nodes;
    const side = GRID_EXT_X * frame.W;
    const farTail = 2.6 * frame.H;
    let gOff = 0;
    const pushGridRow = (sRow: number, py: number, pz: number) => {
      for (const col of [-side, frame.W + side]) {
        this.gridVerts[gOff++] = col - frame.W * 0.5;
        this.gridVerts[gOff++] = py;
        this.gridVerts[gOff++] = pz;
        this.gridVerts[gOff++] = sRow;
        this.gridVerts[gOff++] = col;
        this.gridVerts[gOff++] = sRow;
      }
    };
    for (const sRow of [frame.T + farTail, frame.T + farTail * 0.5]) pushGridRow(sRow, 0, sRow - frame.T);
    for (let h = 0; h <= N; h++) pushGridRow(frame.T - h * frame.ds, frame.pts[h * 2], frame.pts[h * 2 + 1]);
    const lastIdx = N * 2;
    const dy = (frame.pts[lastIdx] - frame.pts[lastIdx - 2]) / frame.ds;
    const dz = (frame.pts[lastIdx + 1] - frame.pts[lastIdx - 1]) / frame.ds;
    for (const sRow of [-farTail * 0.5, -farTail]) pushGridRow(sRow, frame.pts[lastIdx] - dy * sRow, frame.pts[lastIdx + 1] - dz * sRow);
    this.device.queue.writeBuffer(this.gridVbo, 0, this.gridVerts.subarray(0, gOff));

    // Build surface batches
    this.surfaceCount = 0;
    const sink: VertexSink = {
      pushQuad: (a, b, c, dVert, col, mode) => {
        const verts = [a, b, c, a, c, dVert];
        for (const v of verts) {
          if (this.surfaceCount * 10 + 10 > this.surfaceVerts.length) {
            const next = new Float32Array(this.surfaceVerts.length * 2);
            next.set(this.surfaceVerts);
            this.surfaceVerts = next;
          }
          const idx = this.surfaceCount * 10;
          this.surfaceVerts[idx] = v[0];
          this.surfaceVerts[idx + 1] = v[1];
          this.surfaceVerts[idx + 2] = v[2];
          this.surfaceVerts[idx + 3] = v[3];
          this.surfaceVerts[idx + 4] = v[4];
          this.surfaceVerts[idx + 5] = col[0];
          this.surfaceVerts[idx + 6] = col[1];
          this.surfaceVerts[idx + 7] = col[2];
          this.surfaceVerts[idx + 8] = col[3];
          this.surfaceVerts[idx + 9] = mode;
          this.surfaceCount++;
        }
      },
    };

    // A) Full-width curved paper ribbon ending cleanly at `state.paperEndDocY` (does NOT cast shadows onto itself)
    const ribbonStart = this.surfaceCount;
    emitFullWidthRunway(sink, frame, scrollY, bands, pal, bgDim, state.paperEndDocY);
    const ribbonCount = this.surfaceCount - ribbonStart;

    // B) Rails & ticks stopping cleanly at `state.paperEndDocY`
    const railStart = this.surfaceCount;
    emitEdgeRailsAndTicks(sink, frame, scrollY, pal, bgDim, state.paperEndDocY);
    const railCount = this.surfaceCount - railStart;

    // C) Floor banners (pixel-aligned with 2D DOM; dark ink on bright lime alt-band in light mode, crisp white elsewhere)
    const bannerDraws: { start: number; count: number; tex: TextureRecord }[] = [];
    const isLightAltBright = (pal.runwayAlt[0] * 0.299 + pal.runwayAlt[1] * 0.587 + pal.runwayAlt[2] * 0.114) > 0.62;
    const bannerTintLight: RGBA = [
      lerp(pal.mutedRgb[0], 1, frame.fade) * bgDim,
      lerp(pal.mutedRgb[1], 1, frame.fade) * bgDim,
      lerp(pal.mutedRgb[2], 1, frame.fade) * bgDim,
      1,
    ];
    const bannerTintOnBright: RGBA = [
      lerp(pal.mutedRgb[0], pal.railInk[0], frame.fade) * bgDim,
      lerp(pal.mutedRgb[1], pal.railInk[1], frame.fade) * bgDim,
      lerp(pal.mutedRgb[2], pal.railInk[2], frame.fade) * bgDim,
      1,
    ];
    for (const b of banners) {
      const r0 = docToRow(b.docTop);
      const r1 = docToRow(b.docBottom);
      if (r1 < 0 || r0 > frame.T) continue;
      const cr0 = clamp(r0, 0, frame.T);
      const cr1 = clamp(r1, 0, frame.T);
      if (cr1 <= cr0 + 2) continue;
      const bKey = `banner:${b.key}`;
      const bItemsSig = b.items.map((it) => `${Math.round(it.x)},${Math.round(it.y)}:${it.text}`).join(';');
      const bVer = `${Math.round(b.width)}x${Math.round(b.height)}|${dpr.toFixed(2)}|${bItemsSig}`;
      let rec = this.textures.get(bKey);
      if (!rec || rec.version !== bVer) {
        paintBannerCanvas(this.scratchCanvas, b, pal, dpr);
        rec = this.uploadMipmappedCanvas(this.scratchCanvas, bKey, bVer);
      }
      const start = this.surfaceCount;
      const bTint = b.onAltBand && isLightAltBright ? bannerTintOnBright : bannerTintLight;
      emitCardTopFace(sink, frame, b.x0, b.x1, cr0, cr1, 1.6, 0, bTint, 1);
      bannerDraws.push({ start, count: this.surfaceCount - start, tex: rec });
    }

    // D) Solid shadow casters start here: Slab walls + Solid 3D title walls + Slab top faces
    const solidCasterStart = this.surfaceCount;

    const wallStart = this.surfaceCount;
    if (frame.rise >= 0.005) {
      for (const vc of visibleCards) {
        const edgeCol = vc.card.groupIdx % 2 === 1 ? pal.cardAltEdge : pal.cardEdge;
        emitRoundedSlabWalls(sink, vc.card.x0, vc.card.x1, vc.r0, vc.r1, vc.elev, vc.tiltRad, edgeCol, 1, 0);
      }
    }

    const standRad = CURVE_CONFIG.headingStandDeg * (Math.PI / 180) * frame.rise;
    const floatPx = CURVE_CONFIG.headingFloat * frame.rise;
    const preparedTitles: { title: typeof titles[number]; baseRow: number; chars: GlyphRun['chars']; tex: TextureRecord }[] = [];
    for (const t of titles) {
      const baseRow = docToRow(t.docBottom);
      if (baseRow < -160 || baseRow > frame.T + 160) continue;
      const centersSig = t.charCenters ? t.charCenters.map((v) => Math.round(v)).join(',') : '';
      const tVer = `${t.text}|${Math.round(t.x0)}|${Math.round(t.docBottom - t.docTop)}|${t.fontSize.toFixed(1)}|${t.fontWeight}|${centersSig}|${dpr.toFixed(2)}`;
      let cachedRun = this.glyphRuns.get(t.key);
      let rec = this.textures.get(`title:${t.key}`);
      if (!cachedRun || cachedRun.version !== tVer || !rec) {
        const chars = buildTitleGlyphRun(this.scratchCanvas, t, dpr);
        rec = this.uploadMipmappedCanvas(this.scratchCanvas, `title:${t.key}`, tVer);
        cachedRun = { version: tVer, chars, texKey: `title:${t.key}` };
        this.glyphRuns.set(t.key, cachedRun);
      }
      preparedTitles.push({ title: t, baseRow, chars: cachedRun.chars, tex: rec });
      if (frame.rise > 0.02) {
        emitStandingTitleWalls(sink, cachedRun.chars, t.x0, baseRow, standRad, floatPx, titleAngles.get(t.id), frame.rise);
      }
    }
    const wallCount = this.surfaceCount - wallStart;

    const cardDraws: { start: number; count: number; tex: TextureRecord }[] = [];
    const fast = this.themeFastPreview;
    const cardDpr = fast ? 0.6 : dpr;
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // During theme slider drag (`fast === true`), paint lightweight 0.6x single-mip textures at ~35fps so colors track the slider crisply without choking the jelly toggle!
    const allowFastRepaint = !fast || (nowPerf - this.lastCardThemeRepaintMs >= 28);
    let didFastRepaint = false;
    for (const vc of visibleCards) {
      const c = vc.card;
      const isCopied = c.id === state.copiedCardId;
      const coverImg = this.getCoverImage(c.coverUrl);
      const coverReady = !!(coverImg && coverImg.complete && coverImg.naturalWidth > 0);
      const contentImgs = (c.images ?? []).map((u) => this.getCoverImage(u));
      const contentReadyKey = contentImgs.map((im) => (im && im.complete && im.naturalWidth > 0 ? '1' : '0')).join('');
      const cKey = `card:${c.id}`;
      const cVer = `${pal.themeKey}|${Math.round(c.width)}x${Math.round(c.height)}|${cardDpr.toFixed(2)}|${fast ? 'F' : 'H'}|${vc.isRaised ? 'R' : 'N'}|${isCopied ? 'C' : ''}|${coverReady ? '1' : '0'}|${contentReadyKey}`;
      let rec = this.textures.get(cKey);
      if (!rec || (rec.version !== cVer && allowFastRepaint)) {
        paintCardCanvas(this.scratchCanvas, c, pal, vc.isRaised, cardDpr, coverImg, isCopied, contentImgs);
        rec = this.uploadMipmappedCanvas(this.scratchCanvas, cKey, cVer, c.el, fast);
        if (fast) didFastRepaint = true;
      }
      const start = this.surfaceCount;
      emitCardTopFace(sink, frame, c.x0, c.x1, vc.r0, vc.r1, vc.elev, vc.tiltRad, [1, 1, 1, 1], 1);
      cardDraws.push({ start, count: this.surfaceCount - start, tex: rec });
    }
    if (didFastRepaint) this.lastCardThemeRepaintMs = nowPerf;
    const solidCasterCount = this.surfaceCount - solidCasterStart;

    // E) Standing 3D glyph front & back faces (smoothly scale 1x in 2D -> titleScale3D in 3D)
    const titleDraws: { start: number; count: number; tex: TextureRecord }[] = [];
    const titleFace: [number, number, number] = [
      lerp(pal.inkRgb[0], 1, frame.fade),
      lerp(pal.inkRgb[1], 1, frame.fade),
      lerp(pal.inkRgb[2], 1, frame.fade),
    ];
    for (const pt of preparedTitles) {
      const start = this.surfaceCount;
      emitStandingTitleChars(sink, pt.chars, pt.title.x0, pt.baseRow, standRad, floatPx, titleAngles.get(pt.title.id), 1, titleFace, frame.rise);
      titleDraws.push({ start, count: this.surfaceCount - start, tex: pt.tex });
    }

    // Upload dynamic surface VBO
    const byteSize = this.surfaceCount * 10 * 4;
    if (byteSize > 0) {
      if (!this.surfaceVbo || byteSize > this.surfaceVboCap) {
        this.surfaceVbo?.destroy();
        this.surfaceVboCap = nextPow2(this.surfaceVboCap, byteSize);
        this.surfaceVbo = this.device.createBuffer({
          label: 'res-surface-vbo',
          size: this.surfaceVboCap,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      this.device.queue.writeBuffer(this.surfaceVbo, 0, this.surfaceVerts.subarray(0, this.surfaceCount * 10));
    }

    const enc = this.device.createCommandEncoder({ label: 'res-frame-cmd' });

    // Pass 1: Shadow Map depth pass (solid slabs + alpha-tested 3D standing glyphs)
    const shadowPass = enc.beginRenderPass({
      label: 'res-shadow-pass',
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    if (this.surfaceVbo) {
      shadowPass.setVertexBuffer(0, this.surfaceVbo);
      if (solidCasterCount > 0) {
        shadowPass.setPipeline(this.casterPipeline);
        shadowPass.setBindGroup(0, this.frameBindGroup);
        shadowPass.draw(solidCasterCount, 1, solidCasterStart);
      }
      if (titleDraws.length > 0 && frame.rise > 0.02) {
        shadowPass.setPipeline(this.titleCasterPipeline);
        shadowPass.setBindGroup(0, this.frameBindGroup);
        for (const t of titleDraws) {
          shadowPass.setBindGroup(1, t.tex.bindGroup);
          shadowPass.draw(t.count, 1, t.start);
        }
      }
    }
    shadowPass.end();

    const clearR = lerp(pal.pageBgRgb[0], pal.voidBg[0], frame.fade);
    const clearG = lerp(pal.pageBgRgb[1], pal.voidBg[1], frame.fade);
    const clearB = lerp(pal.pageBgRgb[2], pal.voidBg[2], frame.fade);

    // Pass 2: Main MSAA forward render pass
    const mainPass = enc.beginRenderPass({
      label: 'res-main-pass',
      colorAttachments: [{
        view: this.msaaColorView,
        resolveTarget: this.context.getCurrentTexture().createView(),
        clearValue: { r: clearR, g: clearG, b: clearB, a: 1 },
        loadOp: 'clear',
        storeOp: 'discard',
      }],
      depthStencilAttachment: {
        view: this.depthView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });

    // Grid background
    mainPass.setPipeline(this.gridPipeline);
    mainPass.setBindGroup(0, this.frameBindGroup);
    mainPass.setVertexBuffer(0, this.gridVbo);
    mainPass.setIndexBuffer(this.gridIbo, 'uint16');
    mainPass.drawIndexed(this.gridIndexCount);

    if (this.surfaceVbo) {
      mainPass.setVertexBuffer(0, this.surfaceVbo);

      // Opaque runway + slab walls + solid 3D title walls (write depth)
      mainPass.setPipeline(this.opaquePipeline);
      mainPass.setBindGroup(0, this.frameBindGroup);
      mainPass.setBindGroup(1, this.shadowBindGroup);
      mainPass.setBindGroup(2, this.whiteTex.bindGroup);
      if (ribbonCount > 0) mainPass.draw(ribbonCount, 1, ribbonStart);
      if (wallCount > 0) mainPass.draw(wallCount, 1, wallStart);

      // Depth-writing card tops & 3D standing glyph faces (raised cards write depth so wires behind them are occluded!)
      mainPass.setPipeline(this.alphaPipeline);
      mainPass.setBindGroup(0, this.frameBindGroup);
      mainPass.setBindGroup(1, this.shadowBindGroup);
      for (const c of cardDraws) {
        mainPass.setBindGroup(2, c.tex.bindGroup);
        mainPass.draw(c.count, 1, c.start);
      }
      for (const t of titleDraws) {
        mainPass.setBindGroup(2, t.tex.bindGroup);
        mainPass.draw(t.count, 1, t.start);
      }

      // Depth-tested (read-only depth) rails & floor banners
      mainPass.setPipeline(this.wirePipeline);
      mainPass.setBindGroup(0, this.frameBindGroup);
      mainPass.setBindGroup(1, this.shadowBindGroup);
      if (railCount > 0) {
        mainPass.setBindGroup(2, this.whiteTex.bindGroup);
        mainPass.draw(railCount, 1, railStart);
      }
      for (const b of bannerDraws) {
        mainPass.setBindGroup(2, b.tex.bindGroup);
        mainPass.draw(b.count, 1, b.start);
      }
    }

    mainPass.end();
    this.device.queue.submit([enc.finish()]);
  }

  dispose() {
    this.disposed = true;
    for (const r of this.textures.values()) r.tex.destroy();
    this.textures.clear();
    this.images.clear();
    this.glyphRuns.clear();
    this.whiteTex.tex.destroy();
    this.frameBuf.destroy();
    this.gridVbo.destroy();
    this.gridIbo.destroy();
    this.surfaceVbo?.destroy();
    this.shadowTex.destroy();
    this.msaaColorTex?.destroy();
    this.depthTex?.destroy();
    this.device.destroy();
  }
}
