import {
  CURVE_CONFIG,
  clamp,
  keyLightSlope,
  hingePoint,
  lerp,
  type CurveFrame,
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
  emitStandingTitleShadowQuads,
  emitStandingTitleWalls,
  paintBannerCanvas,
  paintCardCanvas,
  readResourcePalette,
  type GlyphRun,
  type RGBA,
  type ResourcePalette,
  type VertexSink,
} from './resources-scene-data';

interface TextureEntry {
  tex: WebGLTexture;
  version: string;
}

const DEG = Math.PI / 180;
const GRID_EXT_X = 9;

const GRID_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aWorldPos;
layout(location = 1) in vec2 aSurf;

uniform vec2 uSize;
uniform float uFov;
uniform float uPitch;
uniform vec2 uCam;
uniform float uScrollY;
uniform float uFocusRow;

out vec2 vSurf;
out float vDepth;
out float vFocusDist;

const float N0 = 16.0;
const float F0 = 28000.0;

void main() {
  vec3 rel = aWorldPos.xyz - vec3(0.0, uCam.x, uCam.y);
  float c = cos(uPitch);
  float sn = sin(uPitch);
  float zf = dot(rel, vec3(0.0, sn, -c));
  float yu = dot(rel, vec3(0.0, c, sn));
  float k = tan(uFov * 0.5);
  float zc = (zf * (F0 + N0) - 2.0 * F0 * N0) / (F0 - N0);
  gl_Position = vec4(rel.x / (k * uSize.x / max(1.0, uSize.y)), yu / k, zc, max(zf, 1.0));
  vSurf = vec2(aSurf.x - uSize.x * 0.5, aSurf.y + uScrollY);
  vDepth = zf;
  vFocusDist = abs(aWorldPos.w - uFocusRow);
}
`;

const GRID_FS = `#version 300 es
precision highp float;

in vec2 vSurf;
in float vDepth;
in float vFocusDist;

uniform vec2 uSize;
uniform float uFade;
uniform float uTime;
uniform vec4 uVoidBg;
uniform vec4 uPageBg;
uniform vec4 uGridMinor;
uniform vec4 uGridMajor;
uniform vec4 uHaloColor;

out vec4 fragColor;

float gridLines(float c, float s, float w) {
  float fw = max(fwidth(c), 1e-4);
  float ww = max(w, 1.0);
  float d = abs(fract(c / s + 0.5) - 0.5) * s;
  float cover = 1.0 - smoothstep((ww * 0.5 - 0.5) * fw, (ww * 0.5 + 0.5) * fw, d);
  return cover * min(w, 1.0) * smoothstep(3.0, 9.0, s / fw);
}

float pcgHash(float seed) {
  uint st = uint(seed) * 747796405u + 2891336453u;
  uint word = ((st >> ((st >> 28u) + 4u)) ^ st) * 277803737u;
  return float((word >> 22u) ^ word) * (1.0 / 4294967296.0);
}

float verticalPulse(float along, float across, float big, float timeSec) {
  float id = floor(across / big + 0.5) + 10000.0;
  float on = step(0.5, pcgHash(id * 3.0 + 1.0));
  float period = big * 12.0;
  float head = timeSec * 495.0 * (pcgHash(id * 5.0 + 3.0) * 0.8 + 0.6) + pcgHash(id) * period;
  float run = head + along;
  float behind = run - period * floor(run / period);
  float core = gridLines(across, big, 0.85 * 1.6);
  float glow = gridLines(across, big, 0.85 * 7.0) * 0.25;
  return on * exp(-behind / 300.0) * (core + glow);
}

void main() {
  vec3 bg = mix(uPageBg.rgb, uVoidBg.rgb, uPageBg.a);
  float cell = max(12.0, uSize.x / 60.0);
  float big = cell * 10.0;
  float minor = max(gridLines(vSurf.x, cell, 0.85), gridLines(vSurf.y, cell, 0.85));
  float major = max(gridLines(vSurf.x, big, 0.85), gridLines(vSurf.y, big, 0.85));
  float diag = max(gridLines(vSurf.x + vSurf.y, big * 2.0, 0.85), gridLines(vSurf.x - vSurf.y, big * 2.0, 0.85));
  float vPulse = verticalPulse(vSurf.y, vSurf.x, big, uTime);

  float horizDist = abs(vSurf.x) / max(1.0, uSize.x * 4.2);
  float fog = (1.0 - smoothstep(1600.0, 8200.0, vDepth)) * (1.0 - smoothstep(0.5, 1.3, horizDist));
  float gridFade = clamp(fog * uPageBg.a, 0.0, 1.0);

  vec3 col = bg;
  float halo = exp(-vFocusDist / max(240.0, uSize.y * 0.72)) * (1.0 - smoothstep(0.0, 1.2, abs(vSurf.x) / max(1.0, uSize.x * 0.9)));
  col = mix(col, uHaloColor.rgb, halo * uHaloColor.a * uPageBg.a);
  col = mix(col, uGridMinor.rgb, minor * uGridMinor.a * gridFade);
  col = mix(col, uGridMinor.rgb, diag * uGridMinor.a * 0.55 * gridFade);
  col = mix(col, uGridMajor.rgb, major * uGridMajor.a * gridFade);
  col = mix(col, uGridMajor.rgb, clamp(vPulse * 0.65 * gridFade, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}
`;

const SURFACE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec4 aColor;
layout(location = 3) in float aMode;

uniform vec2 uSize;
uniform float uT;
uniform float uDs;
uniform float uFov;
uniform float uPitch;
uniform float uLift;
uniform float uShade;
uniform vec2 uCam;
uniform vec4 uProfile[65];

out vec2 vUv;
out vec4 vColor;
out float vMode;
out float vLight;

const float N0 = 16.0;
const float F0 = 28000.0;

vec4 nearer(vec4 P, float d) {
  if (d <= 0.0 || P.w <= N0) return P;
  float z = max(P.w - d, N0 * 1.01);
  float zc = ((z * (F0 + N0) - 2.0 * F0 * N0) / ((F0 - N0) * z)) * P.w;
  return vec4(P.xy, zc, P.w);
}

void main() {
  float s = clamp((uT - aPos.y) / max(1.0, uDs), 0.0, 64.0);
  int i = min(int(s), 63);
  float f = s - float(i);
  vec4 a = uProfile[i];
  vec4 b = uProfile[i + 1];
  float th = mix(a.z, b.z, f);
  vec2 P = mix(a.xy, b.xy, f) + aPos.z * uLift * vec2(cos(th), sin(th));
  vec3 world = vec3(aPos.x - uSize.x * 0.5, P.x, P.y);

  vec3 rel = world - vec3(0.0, uCam.x, uCam.y);
  float c = cos(uPitch);
  float sn = sin(uPitch);
  float zf = dot(rel, vec3(0.0, sn, -c));
  float yu = dot(rel, vec3(0.0, c, sn));
  float k = tan(uFov * 0.5);
  float zc = (zf * (F0 + N0) - 2.0 * F0 * N0) / (F0 - N0);
  float midBias = (aPos.z > 0.6 && aPos.z < 3.0) ? 1.2 : 0.0;
  float layerBias = clamp(aPos.z, 0.0, 120.0) * 0.14 * (1.0 - uLift) + midBias;
  if (aMode > 4.5) {
    layerBias = 0.6;
  } else if (aMode > 3.5) {
    layerBias = 3.0;
  } else if (aMode > 2.5) {
    layerBias = 4.0 + 3.0 * (1.0 - uLift);
  }
  gl_Position = nearer(vec4(rel.x / (k * uSize.x / max(1.0, uSize.y)), yu / k, zc, max(zf, 1.0)), layerBias);

  vUv = aUv;
  vColor = aColor;
  vMode = aMode;
  vLight = aMode > 2.5 ? 1.0 : (1.0 - uShade * max(sin(th), 0.0));
}
`;

const SURFACE_FS = `#version 300 es
precision highp float;

in vec2 vUv;
in vec4 vColor;
in float vMode;
in float vLight;

uniform sampler2D uTex;

out vec4 fragColor;

void main() {
  if (vMode > 4.5) {
    if (vColor.a < 0.004) discard;
    fragColor = vec4(vColor.rgb, vColor.a);
    return;
  }
  if (vMode > 3.5) {
    fragColor = vec4(vColor.rgb * vLight, 1.0);
    return;
  }
  if (vMode > 2.5) {
    vec4 texel = texture(uTex, vUv);
    if (texel.a < 0.42) discard;
    fragColor = vec4(texel.rgb * vColor.rgb * vLight, 1.0);
    return;
  }
  if (vMode > 1.5 && vMode < 2.5) {
    vec2 q = abs(vUv * 2.0 - 1.0) - vec2(0.74, 0.74);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    float falloff = 1.0 - smoothstep(-0.08, 0.28, d);
    float a = vColor.a * falloff * falloff;
    if (a < 0.004) discard;
    fragColor = vec4(vColor.rgb, a);
    return;
  }
  if (vMode > 0.5 && vMode < 1.5) {
    vec4 texel = texture(uTex, vUv);
    if (texel.a < 0.04) discard;
    fragColor = vec4(texel.rgb * vColor.rgb * vLight, texel.a * vColor.a);
    return;
  }
  if (vColor.a < 0.004) discard;
  fragColor = vec4(vColor.rgb * vLight, vColor.a);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(sh) || 'shader compile error';
    gl.deleteShader(sh);
    throw new Error(msg);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const msg = gl.getProgramInfoLog(prog) || 'program link error';
    gl.deleteProgram(prog);
    throw new Error(msg);
  }
  return prog;
}

export class ResourcesGLRenderer implements Resources3DRenderer {
  readonly backend = 'webgl2' as const;
  private gl: WebGL2RenderingContext;
  private gridProg: WebGLProgram;
  private surfaceProg: WebGLProgram;
  private gridVbo: WebGLBuffer;
  private gridIbo: WebGLBuffer;
  private surfaceVbo: WebGLBuffer;
  private profileBuf = new Float32Array(65 * 4);
  private gridVerts = new Float32Array((CURVE_CONFIG.nodes + 5) * 2 * 6);
  private gridIndexCount = 0;
  private surfaceVerts = new Float32Array(32768 * 10);
  private surfaceCount = 0;
  private anisoExt: EXT_texture_filter_anisotropic | null = null;
  private maxAniso = 1;
  private textures = new Map<string, TextureEntry>();
  private images = new Map<string, HTMLImageElement>();
  private glyphRuns = new Map<string, { version: string; chars: GlyphRun['chars']; tex: WebGLTexture }>();
  private scratchCanvas: HTMLCanvasElement;
  private palette: ResourcePalette;
  private themeFastPreview = false;
  private lastCardThemeRepaintMs = 0;
  private disposed = false;

  static create(canvas: HTMLCanvasElement, styleHost: HTMLElement, onAssetLoad: () => void): ResourcesGLRenderer | null {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    try {
      return new ResourcesGLRenderer(gl, styleHost, onAssetLoad);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext, private styleHost: HTMLElement, private onAssetLoad: () => void) {
    this.gl = gl;
    this.gridProg = createProgram(gl, GRID_VS, GRID_FS);
    this.surfaceProg = createProgram(gl, SURFACE_VS, SURFACE_FS);
    this.gridVbo = gl.createBuffer()!;
    this.gridIbo = gl.createBuffer()!;
    this.surfaceVbo = gl.createBuffer()!;

    const segs = CURVE_CONFIG.nodes + 4;
    const indices = new Uint16Array(segs * 6);
    for (let i = 0; i < segs; i++) indices.set([i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2], i * 6);
    this.gridIndexCount = segs * 6;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    this.anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
    if (this.anisoExt) {
      this.maxAniso = Math.min(8, gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 4);
    }
    this.scratchCanvas = document.createElement('canvas');
    this.palette = readResourcePalette(this.styleHost);
  }

  refreshTheme(fastPreview = false, mixedOverrides?: Record<string, string>) {
    this.palette = mixedOverrides
      ? applyMixedOverridesToPalette(this.palette, mixedOverrides)
      : readResourcePalette(this.styleHost);
    this.themeFastPreview = fastPreview;
    if (!fastPreview) this.lastCardThemeRepaintMs = 0;
  }

  resize() {
    // WebGL2 uses gl.canvas.width/height directly.
  }

  private uploadTexture(canvas: HTMLCanvasElement, key: string, version: string, fastNoMip = false): WebGLTexture {
    const gl = this.gl;
    let entry = this.textures.get(key);
    if (!entry) {
      entry = { tex: gl.createTexture()!, version: '' };
      this.textures.set(key, entry);
    }
    gl.bindTexture(gl.TEXTURE_2D, entry.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    if (fastNoMip) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    } else {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (!fastNoMip && this.anisoExt) gl.texParameterf(gl.TEXTURE_2D, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAniso);
    entry.version = version;
    return entry.tex;
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

  private flushSurface(texture: WebGLTexture | null = null) {
    if (!this.surfaceCount) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.surfaceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.surfaceVerts.subarray(0, this.surfaceCount * 10), gl.DYNAMIC_DRAW);
    if (texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    gl.drawArrays(gl.TRIANGLES, 0, this.surfaceCount);
    this.surfaceCount = 0;
  }

  render(state: ResourceRenderState, dpr: number) {
    if (this.disposed) return;
    const gl = this.gl;
    const { frame, scrollY, cards, banners, titles, bands, hoveredCardId, raisedCardId, tiltByCard, titleAngles } = state;
    const pal = this.palette;

    const clearR = lerp(pal.pageBgRgb[0], pal.voidBg[0], frame.fade);
    const clearG = lerp(pal.pageBgRgb[1], pal.voidBg[1], frame.fade);
    const clearB = lerp(pal.pageBgRgb[2], pal.voidBg[2], frame.fade);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(clearR, clearG, clearB, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    for (let i = 0; i <= CURVE_CONFIG.nodes; i++) {
      this.profileBuf[i * 4] = frame.pts[i * 2];
      this.profileBuf[i * 4 + 1] = frame.pts[i * 2 + 1];
      this.profileBuf[i * 4 + 2] = frame.ang[i];
      this.profileBuf[i * 4 + 3] = 0;
    }

    // 1. Void Grid (never writes depth so transition Z-fighting is impossible)
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
    for (let h = 0; h <= CURVE_CONFIG.nodes; h++) pushGridRow(frame.T - h * frame.ds, frame.pts[h * 2], frame.pts[h * 2 + 1]);
    const lastIdx = CURVE_CONFIG.nodes * 2;
    const dy = (frame.pts[lastIdx] - frame.pts[lastIdx - 2]) / frame.ds;
    const dz = (frame.pts[lastIdx + 1] - frame.pts[lastIdx - 1]) / frame.ds;
    for (const sRow of [-farTail * 0.5, -farTail]) pushGridRow(sRow, frame.pts[lastIdx] - dy * sRow, frame.pts[lastIdx + 1] - dz * sRow);

    gl.useProgram(this.gridProg);
    gl.uniform2f(gl.getUniformLocation(this.gridProg, 'uSize'), frame.W, frame.H);
    gl.uniform1f(gl.getUniformLocation(this.gridProg, 'uFov'), frame.fov);
    gl.uniform1f(gl.getUniformLocation(this.gridProg, 'uPitch'), frame.pitch);
    gl.uniform2f(gl.getUniformLocation(this.gridProg, 'uCam'), frame.camY, frame.camZ);
    gl.uniform1f(gl.getUniformLocation(this.gridProg, 'uScrollY'), scrollY - frame.lead);
    gl.uniform1f(gl.getUniformLocation(this.gridProg, 'uFocusRow'), frame.focusRow);
    gl.uniform1f(gl.getUniformLocation(this.gridProg, 'uFade'), frame.rise);
    gl.uniform1f(gl.getUniformLocation(this.gridProg, 'uTime'), state.timeSec);
    gl.uniform4fv(gl.getUniformLocation(this.gridProg, 'uVoidBg'), pal.voidBg);
    gl.uniform4f(gl.getUniformLocation(this.gridProg, 'uPageBg'), pal.pageBgRgb[0], pal.pageBgRgb[1], pal.pageBgRgb[2], frame.fade);
    gl.uniform4fv(gl.getUniformLocation(this.gridProg, 'uGridMinor'), pal.voidGrid);
    gl.uniform4fv(gl.getUniformLocation(this.gridProg, 'uGridMajor'), pal.voidMajor);
    gl.uniform4fv(gl.getUniformLocation(this.gridProg, 'uHaloColor'), pal.horizonHalo);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.gridVerts.subarray(0, gOff), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 6 * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 6 * 4, 4 * 4);
    gl.disableVertexAttribArray(2);
    gl.disableVertexAttribArray(3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridIbo);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, this.gridIndexCount, gl.UNSIGNED_SHORT, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);

    // 2. Surface passes
    gl.useProgram(this.surfaceProg);
    gl.uniform2f(gl.getUniformLocation(this.surfaceProg, 'uSize'), frame.W, frame.H);
    gl.uniform1f(gl.getUniformLocation(this.surfaceProg, 'uT'), frame.T);
    gl.uniform1f(gl.getUniformLocation(this.surfaceProg, 'uDs'), frame.ds);
    gl.uniform1f(gl.getUniformLocation(this.surfaceProg, 'uFov'), frame.fov);
    gl.uniform1f(gl.getUniformLocation(this.surfaceProg, 'uPitch'), frame.pitch);
    gl.uniform1f(gl.getUniformLocation(this.surfaceProg, 'uLift'), frame.rise);
    gl.uniform1f(gl.getUniformLocation(this.surfaceProg, 'uShade'), CURVE_CONFIG.shade * frame.e);
    gl.uniform2f(gl.getUniformLocation(this.surfaceProg, 'uCam'), frame.camY, frame.camZ);
    gl.uniform4fv(gl.getUniformLocation(this.surfaceProg, 'uProfile[0]'), this.profileBuf);
    gl.uniform1i(gl.getUniformLocation(this.surfaceProg, 'uTex'), 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.surfaceVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 10 * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 10 * 4, 3 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 10 * 4, 5 * 4);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 10 * 4, 9 * 4);

    this.surfaceCount = 0;
    const sink: VertexSink = {
      pushQuad: (a, b, c, dVert, col, mode) => {
        for (const v of [a, b, c, a, c, dVert]) {
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

    const docToRow = (y: number) => y - scrollY + frame.lead;
    const bgDim = 1;

    // Full-width curved paper ribbon ending cleanly at `state.paperEndDocY`
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    emitFullWidthRunway(sink, frame, scrollY, bands, pal, bgDim, state.paperEndDocY);
    this.flushSurface();

    // Rails, ticks & cast shadows stopping cleanly at `state.paperEndDocY`
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    emitEdgeRailsAndTicks(sink, frame, scrollY, pal, bgDim, state.paperEndDocY);

    const [lx, ly] = keyLightSlope();
    const visibleCards: { card: ResourceRenderState['cards'][number]; r0: number; r1: number; elev: number; tiltRad: number; isRaised: boolean }[] = [];
    for (const card of cards) {
      const r0 = docToRow(card.docTop);
      const r1 = docToRow(card.docBottom);
      if (r1 < 0 || r0 > frame.T) continue;
      const cr0 = clamp(r0, 0, frame.T);
      const cr1 = clamp(r1, 0, frame.T);
      if (cr1 <= cr0 + 2) continue;
      const tilt = tiltByCard.get(card.id) ?? 0;
      const tiltRad = tilt * CURVE_CONFIG.tiltDeg * DEG * frame.rise;
      const isHovered = card.id === hoveredCardId;
      const isRaised = card.id === raisedCardId || tilt > 0.05;
      const elev = cardElevAt(frame, cr0, cr1, isHovered, card.depthScale ?? 1);
      visibleCards.push({ card, r0: cr0, r1: cr1, elev, tiltRad, isRaised });

      if (frame.rise > 0.02) {
        const shAlpha = 0.55 * frame.rise;
        const shColor: RGBA = [0, 0, 0, shAlpha];
        const pad = 16;
        const topElev = tiltRad > 0.002 ? hingePoint(0, cr1 - cr0, elev, cr1, 0, tiltRad) : [0, cr0, elev];
        sink.pushQuad(
          [card.x0 - topElev[2] * lx - pad, clamp(topElev[1] - topElev[2] * ly - pad, 0, frame.T), 0.9, 0, 0],
          [card.x1 - topElev[2] * lx + pad, clamp(topElev[1] - topElev[2] * ly - pad, 0, frame.T), 0.9, 1, 0],
          [card.x1 - elev * lx + pad, clamp(cr1 - elev * ly + pad, 0, frame.T), 0.9, 1, 1],
          [card.x0 - elev * lx - pad, clamp(cr1 - elev * ly + pad, 0, frame.T), 0.9, 0, 1],
          shColor,
          2,
        );
      }
    }
    this.flushSurface();

    // Prepare standing titles
    const standRad = CURVE_CONFIG.headingStandDeg * DEG * frame.rise;
    const floatPx = CURVE_CONFIG.headingFloat * frame.rise;
    const preparedTitles: { title: typeof titles[number]; baseRow: number; run: { version: string; chars: GlyphRun['chars']; tex: WebGLTexture } }[] = [];
    for (const t of titles) {
      const baseRow = docToRow(t.docBottom);
      if (baseRow < -160 || baseRow > frame.T + 160) continue;
      const centersSig = t.charCenters ? t.charCenters.map((v) => Math.round(v)).join(',') : '';
      const tVer = `${t.text}|${Math.round(t.x0)}|${Math.round(t.docBottom - t.docTop)}|${t.fontSize.toFixed(1)}|${t.fontWeight}|${centersSig}|${dpr.toFixed(2)}`;
      let run = this.glyphRuns.get(t.key);
      if (!run || run.version !== tVer) {
        const chars = buildTitleGlyphRun(this.scratchCanvas, t, dpr);
        const tex = this.uploadTexture(this.scratchCanvas, `title:${t.key}`, tVer);
        run = { version: tVer, chars, tex };
        this.glyphRuns.set(t.key, run);
      }
      preparedTitles.push({ title: t, baseRow, run });
    }

    // Extruded slab walls + watertight solid 3D title walls (opaque, write depth)
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    if (frame.rise >= 0.005) {
      for (const vc of visibleCards) {
        const edgeCol = vc.card.groupIdx % 2 === 1 ? pal.cardAltEdge : pal.cardEdge;
        emitRoundedSlabWalls(sink, vc.card.x0, vc.card.x1, vc.r0, vc.r1, vc.elev, vc.tiltRad, edgeCol, 1, 0);
      }
    }
    if (frame.rise > 0.02) {
      for (const pt of preparedTitles) {
        emitStandingTitleWalls(sink, pt.run.chars, pt.title.x0, pt.baseRow, standRad, floatPx, titleAngles.get(pt.title.id), frame.rise);
      }
    }
    this.flushSurface();

    // Card top faces & standing 3D glyph faces (write depth so front/raised cards occlude wires behind them)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    const fast = this.themeFastPreview;
    const cardDpr = fast ? 0.6 : dpr;
    const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
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
      const existing = this.textures.get(cKey);
      if (!existing || (existing.version !== cVer && allowFastRepaint)) {
        paintCardCanvas(this.scratchCanvas, c, pal, vc.isRaised, cardDpr, coverImg, isCopied, contentImgs);
        this.uploadTexture(this.scratchCanvas, cKey, cVer, fast);
        if (fast) didFastRepaint = true;
      }
      emitCardTopFace(sink, frame, c.x0, c.x1, vc.r0, vc.r1, vc.elev, vc.tiltRad, [1, 1, 1, 1], 1);
      this.flushSurface(this.textures.get(cKey)!.tex);
    }
    if (didFastRepaint) this.lastCardThemeRepaintMs = nowPerf;

    const titleFace: [number, number, number] = [
      lerp(pal.inkRgb[0], 1, frame.fade),
      lerp(pal.inkRgb[1], 1, frame.fade),
      lerp(pal.inkRgb[2], 1, frame.fade),
    ];
    for (const pt of preparedTitles) {
      if (frame.rise > 0.02) {
        gl.depthMask(false);
        emitStandingTitleShadowQuads(sink, pt.run.chars, pt.title.x0, pt.baseRow, standRad, floatPx, titleAngles.get(pt.title.id), 1, frame.rise);
        this.flushSurface(pt.run.tex);
        gl.depthMask(true);
      }
      emitStandingTitleChars(sink, pt.run.chars, pt.title.x0, pt.baseRow, standRad, floatPx, titleAngles.get(pt.title.id), 1, titleFace, frame.rise);
      this.flushSurface(pt.run.tex);
    }

    // Depth-tested (read-only depth) floor banners
    gl.depthMask(false);
    const isLightAltBright = (pal.runwayAlt[0] * 0.299 + pal.runwayAlt[1] * 0.587 + pal.runwayAlt[2] * 0.114) > 0.62;
    const bannerTintLight: RGBA = [
      lerp(pal.mutedRgb[0], 1, frame.fade),
      lerp(pal.mutedRgb[1], 1, frame.fade),
      lerp(pal.mutedRgb[2], 1, frame.fade),
      1,
    ];
    const bannerTintOnBright: RGBA = [
      lerp(pal.mutedRgb[0], pal.railInk[0], frame.fade),
      lerp(pal.mutedRgb[1], pal.railInk[1], frame.fade),
      lerp(pal.mutedRgb[2], pal.railInk[2], frame.fade),
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
      if (this.textures.get(bKey)?.version !== bVer) {
        paintBannerCanvas(this.scratchCanvas, b, pal, dpr);
        this.uploadTexture(this.scratchCanvas, bKey, bVer);
      }
      const bTint = b.onAltBand && isLightAltBright ? bannerTintOnBright : bannerTintLight;
      emitCardTopFace(sink, frame, b.x0, b.x1, cr0, cr1, 1.6, 0, bTint, 1);
      this.flushSurface(this.textures.get(bKey)!.tex);
    }
    gl.depthMask(true);
  }

  dispose() {
    this.disposed = true;
    const gl = this.gl;
    for (const entry of this.textures.values()) gl.deleteTexture(entry.tex);
    this.textures.clear();
    this.images.clear();
    this.glyphRuns.clear();
    gl.deleteBuffer(this.gridVbo);
    gl.deleteBuffer(this.gridIbo);
    gl.deleteBuffer(this.surfaceVbo);
    gl.deleteProgram(this.gridProg);
    gl.deleteProgram(this.surfaceProg);
  }
}
